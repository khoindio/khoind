const productService = require('../services/productService');
const orderService = require('../services/orderService');
const paymentService = require('../services/paymentService');
const userService = require('../services/userService');
const voucherService = require('../services/voucherService');
const messages = require('../utils/messages');
const config = require('../config');
const { Markup } = require('telegraf');
const { formatPrice } = require('../utils/keyboard');

module.exports = (bot) => {
    // Helper to render checkout options
    const renderCheckout = async (ctx, product, quantity, discount = 0, voucherCode = null) => {
        const banks = paymentService.getBanks();
        const totalPrice = Math.max(0, (product.price * quantity) - discount);

        if (banks.length > 1) {
            ctx.answerCbQuery().catch(()=>{});
            const bankButtons = banks.map((b, i) =>
                [Markup.button.callback(`🏦 ${b.NAME}`, `bank_${product.id}_${quantity}_${i}`)]
            );
            
            if (!voucherCode) {
                bankButtons.unshift([Markup.button.callback('🎟️ Nhập Mã Giảm Giá', `apply_voucher_${product.id}_${quantity}`)]);
            }
            bankButtons.push([Markup.button.callback('❌ Hủy', 'cancel_order')]);

            let text = `📦 <b>${product.name}</b>\n` +
                       `📊 Số lượng: ${quantity}\n`;
            if (voucherCode) {
                text += `🎟️ Voucher: <b>${voucherCode}</b> (-${formatPrice(discount)})\n`;
            }
            text += `💵 Tổng tiền: <b>${formatPrice(totalPrice)}</b>\n\n` +
                    `🏦 Chọn ngân hàng thanh toán:`;

            return ctx.replyWithHTML(text, Markup.inlineKeyboard(bankButtons));
        } else {
            ctx.answerCbQuery('⏳ Đang tạo đơn hàng...').catch(()=>{});
            await createOrderAndPay(ctx, bot, product, quantity, 0, discount, voucherCode);
        }
    };

    // Handle quantity selection: qty_{productId}_{quantity}
    bot.action(/^qty_(\d+)_(\d+)$/, async (ctx) => {
        const productId = parseInt(ctx.match[1]);
        const quantity = parseInt(ctx.match[2]);
        const product = productService.getById(productId);

        if (!product) {
            return ctx.answerCbQuery('❌ Sản phẩm không tồn tại');
        }

        const availableStock = product.display_stock || product.stock_count;
        if (availableStock < quantity) {
            return ctx.answerCbQuery(`❌ Chỉ còn ${availableStock} sản phẩm`);
        }

        // Reset any previous discount session
        if (ctx.session) {
            ctx.session.discountVoucher = null;
            ctx.session.awaitingDiscountVoucher = null;
        }

        await renderCheckout(ctx, product, quantity);
    });

    // Handle apply voucher button
    bot.action(/^apply_voucher_(\d+)_(\d+)$/, (ctx) => {
        const productId = parseInt(ctx.match[1]);
        const quantity = parseInt(ctx.match[2]);
        
        if (!ctx.session) ctx.session = {};
        ctx.session.awaitingDiscountVoucher = { productId, quantity };
        
        ctx.answerCbQuery('Nhập mã giảm giá...');
        ctx.replyWithHTML(
            `🎟️ <b>NHẬP MÁ GIẢM GIÁ</b>\n\n` +
            `Vui lòng gõ mã giảm giá của bạn vào khung chat và gửi lên.\n` +
            `Gõ /cancel để hủy bỏ.`
        );
    });

    // Handle bank selection: bank_{productId}_{quantity}_{bankIndex}
    bot.action(/^bank_(\d+)_(\d+)_(\d+)$/, async (ctx) => {
        const productId = parseInt(ctx.match[1]);
        const quantity = parseInt(ctx.match[2]);
        const bankIndex = parseInt(ctx.match[3]);
        const product = productService.getById(productId);

        if (!product) {
            return ctx.answerCbQuery('❌ Sản phẩm không tồn tại');
        }

        const availableStock = product.display_stock || product.stock_count;
        if (availableStock < quantity) {
            return ctx.answerCbQuery(`❌ Chỉ còn ${availableStock} sản phẩm`);
        }

        let discount = 0;
        let voucherCode = null;
        
        if (ctx.session && ctx.session.discountVoucher && ctx.session.discountVoucher.productId === productId) {
            discount = ctx.session.discountVoucher.value;
            voucherCode = ctx.session.discountVoucher.code;
        }

        ctx.answerCbQuery('⏳ Đang tạo đơn hàng...');
        await createOrderAndPay(ctx, bot, product, quantity, bankIndex, discount, voucherCode);
    });

    // Handle text input for voucher
    bot.on('text', async (ctx, next) => {
        if (ctx.session && ctx.session.awaitingDiscountVoucher) {
            const state = ctx.session.awaitingDiscountVoucher;
            ctx.session.awaitingDiscountVoucher = null; // clear state

            const code = ctx.message.text.trim().toUpperCase();
            if (code.startsWith('/')) return next(); // let commands handle it if it's a command

            const check = voucherService.checkVoucher(code, ctx.from.id);
            
            const product = productService.getById(state.productId);
            if (!product) return ctx.reply('❌ Sản phẩm không tồn tại.');

            if (!check.valid) {
                ctx.reply(check.error);
                return renderCheckout(ctx, product, state.quantity);
            }

            const voucher = check.voucher;
            // Cap discount to total price
            const maxDiscount = product.price * state.quantity;
            const appliedDiscount = Math.min(voucher.value, maxDiscount);

            // Save to session
            ctx.session.discountVoucher = {
                code: voucher.code,
                value: appliedDiscount,
                productId: state.productId
            };

            ctx.replyWithHTML(`✅ Đã áp dụng mã giảm giá: <b>${formatPrice(appliedDiscount)}</b>`);
            await renderCheckout(ctx, product, state.quantity, appliedDiscount, voucher.code);
            return;
        }
        return next();
    });

    // ════════════════════════════════════
    // Shared: Create order + send QR + notify admin
    // ════════════════════════════════════
    async function createOrderAndPay(ctx, bot, product, quantity, bankIndex, discount = 0, voucherCode = null) {
        userService.findOrCreate(ctx.from);

        const basePrice = product.price * quantity;
        const totalPrice = Math.max(0, basePrice - discount);
        
        const payment = paymentService.generatePayment(totalPrice, bankIndex);

        const order = orderService.create(
            ctx.from.id,
            product.id,
            quantity,
            totalPrice,
            payment.paymentCode
        );

        // Mark voucher as used if applicable
        if (voucherCode && discount > 0) {
            voucherService.useVoucher(voucherCode, ctx.from.id);
            // Clear session
            if (ctx.session) ctx.session.discountVoucher = null;
        }

        // Handle 100% discount (Free Order)
        if (totalPrice === 0) {
            ctx.replyWithHTML(
                `🎉 <b>ĐƠN HÀNG MIỄN PHÍ!</b>\n\n` +
                `📦 Sản phẩm: ${product.name}\n` +
                `📊 Số lượng: ${quantity}\n` +
                `🎟️ Voucher đã áp dụng: <b>${voucherCode}</b>\n\n` +
                `⏳ Đang tiến hành giao hàng tự động...`
            );

            const { deliverOrder } = require('./paymentConfirm');
            const result = await deliverOrder(bot, order.id);

            if (result.success) {
                // Done.
                return;
            } else {
                // No real stock available -> notify admin
                orderService.markPaid(order.id);
                
                // Store state for admin
                const { setAdminState } = require('./adminActions');
                setAdminState(config.ADMIN_ID, {
                    action: 'deliver_order',
                    orderId: order.id,
                    userId: order.user_id,
                    productName: product.name,
                    quantity: order.quantity,
                });
                
                // Notify admin
                const adminMsg = 
                    `🔔 <b>ĐƠN HÀNG MIỄN PHÍ (CẦN GIAO THỦ CÔNG) #${order.id}</b>\n` +
                    `📦 Tên: <b>${product.name}</b>\n` +
                    `📊 Số lượng: ${quantity}\n` +
                    `📝 User ID: ${order.user_id}\n\n` +
                    `Hãy vào chat để gửi KEY!`;
                
                bot.telegram.sendMessage(config.ADMIN_ID, adminMsg, { parse_mode: 'HTML' }).catch(()=>{});
                
                ctx.reply('⚠️ Đơn hàng miễn phí đang chờ Admin xử lý. Bot sẽ gửi hàng cho bạn sớm nhất!');
                return;
            }
        }

        // 1. Send QR code to customer
        let caption =
            `⏳ <b>Đang chờ thanh toán ${formatPrice(totalPrice)}...</b>\n\n` +
            `Quét mã QR phía trên để chuyển khoản.\n\n` +
            `💰 <b>THANH TOÁN ĐƠN HÀNG</b>\n\n` +
            `📦 Sản phẩm: ${product.name}\n` +
            `📊 Số lượng: ${quantity}\n`;
            
        if (voucherCode) {
            caption += `🎟️ Voucher: <b>${voucherCode}</b> (-${formatPrice(discount)})\n`;
        }
            
        caption += 
            `💵 Tổng tiền: <b>${formatPrice(totalPrice)}</b>\n\n` +
            `━━━━━━━━━━━━━━━━━\n\n` +
            `🏦 Quét mã QR để chuyển khoản\n` +
            `├ Số tiền: <b>${formatPrice(totalPrice)}</b>\n` +
            `└ Nội dung CK: <code>${payment.paymentCode}</code>\n\n` +
            `⏰ QR hiệu lực trong <b>15 phút</b>\n` +
            `🚫 <b>KHÔNG</b> thay đổi nội dung chuyển khoản\n` +
            `✅ Sau khi CK thành công, hàng sẽ được\ngiao <b>tự động</b> trong vòng dưới 60 giây`;

        await ctx.replyWithPhoto(payment.qrUrl, {
            caption,
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('❌ Hủy thanh toán', `cancel_order_${order.id}`)],
            ]),
        });

        // 2. Notify Admin
        const userName = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ');
        const adminMsg =
            `🔔 <b>ĐƠN HÀNG MỚI #${order.id}</b>\n\n` +
            `👤 Khách: <b>${userName}</b> (<code>${ctx.from.id}</code>)\n` +
            (ctx.from.username ? `📱 @${ctx.from.username}\n` : '') +
            `\n` +
            `📦 Sản phẩm: <b>${product.name}</b>\n` +
            `📊 Số lượng: ${quantity}\n` +
            `💰 Tổng tiền: <b>${formatPrice(totalPrice)}</b>\n` +
            `🏦 Bank: <b>${payment.bankName}</b>\n` +
            `🔑 Mã CK: <code>${payment.paymentCode}</code>\n\n` +
            `━━━━━━━━━━━━━━━━━\n` +
            `✅ Xác nhận & giao hàng:\n` +
            `<code>/confirm ${order.id}</code>`;

        try {
            await bot.telegram.sendMessage(config.ADMIN_ID, adminMsg, {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [
                        Markup.button.callback(`✅ Xác nhận #${order.id}`, `admin_confirm_${order.id}`),
                        Markup.button.callback(`❌ Hủy #${order.id}`, `admin_cancel_${order.id}`),
                    ],
                ]),
            });
        } catch (err) {
            console.error('Failed to notify admin:', err.message);
        }
    }

    // ════════════════════════════════════
    // Admin quick-action buttons on order notification
    // ════════════════════════════════════
    bot.action(/^admin_confirm_(\d+)$/, async (ctx) => {
        if (ctx.from.id !== config.ADMIN_ID) return ctx.answerCbQuery('⛔');

        const orderId = parseInt(ctx.match[1]);
        const order = orderService.getById(orderId);
        if (!order) return ctx.answerCbQuery('❌ Đơn hàng không tồn tại');
        if (order.status !== 'pending') return ctx.answerCbQuery('⚠️ Đơn đã xử lý');

        // Check if product has real stock entries in stock table
        const product = productService.getById(order.product_id);
        const realStock = productService.getAvailableStock(order.product_id, order.quantity);

        if (realStock.length >= order.quantity) {
            // ── AUTO DELIVERY: Has stock entries → deliver automatically ──
            ctx.answerCbQuery('⏳ Đang xử lý...');
            const { deliverOrder } = require('./paymentConfirm');
            const result = await deliverOrder(bot, orderId);

            if (result.success) {
                ctx.editMessageText(
                    ctx.callbackQuery.message.text + '\n\n✅ ĐÃ XÁC NHẬN & GIAO HÀNG TỰ ĐỘNG!',
                    { parse_mode: 'HTML' }
                );
            } else {
                ctx.reply(`❌ Lỗi đơn #${orderId}: ${result.error}`);
            }
        } else {
            // ── MANUAL DELIVERY: No stock entries → ask admin to provide account info ──
            ctx.answerCbQuery('📝 Cần cung cấp <b>KEY</b>...');
            orderService.markPaid(orderId);

            // Store state for admin to reply with account info
            const { setAdminState } = require('./adminActions');
            setAdminState(ctx.from.id, {
                action: 'deliver_order',
                orderId: orderId,
                userId: order.user_id,
                productName: product.name,
                quantity: order.quantity,
            });

            ctx.editMessageText(
                ctx.callbackQuery.message.text + '\n\n💳 ĐÃ XÁC NHẬN THANH TOÁN',
                { parse_mode: 'HTML' }
            );

            ctx.replyWithHTML(
                `📝 <b>GIAO HÀNG THỦ CÔNG — Đơn #${orderId}</b>\n\n` +
                `📦 SP: <b>${product.name}</b>\n` +
                `📊 SL: ${order.quantity}\n\n` +
                `👇 Gửi thông tin <b>KEY</b> ngay bây giờ:\n\n` +
                `<i>Ví dụ:</i>\n` +
                `<code>KEY</code>\n\n` +
                `Bot sẽ tự động chuyển cho khách.\n` +
                `Gõ /cancel để hủy.`
            );
        }
    });

    bot.action(/^admin_cancel_(\d+)$/, (ctx) => {
        if (ctx.from.id !== config.ADMIN_ID) return ctx.answerCbQuery('⛔');

        const orderId = parseInt(ctx.match[1]);
        orderService.cancel(orderId);
        ctx.answerCbQuery('❌ Đã hủy');
        ctx.editMessageText(
            ctx.callbackQuery.message.text + '\n\n❌ ĐÃ HỦY ĐƠN HÀNG',
            { parse_mode: 'HTML' }
        );

        // Notify customer
        const order = orderService.getById(orderId);
        if (order) {
            bot.telegram.sendMessage(order.user_id, '❌ Đơn hàng của bạn đã bị hủy. Liên hệ hỗ trợ nếu cần.').catch(() => { });
        }
    });

    // Handle cancel order (customer side)
    bot.action('cancel_order', (ctx) => {
        ctx.answerCbQuery('❌ Đã hủy');
        ctx.editMessageText('❌ Đơn hàng đã bị hủy.');
    });

    bot.action(/^cancel_order_(\d+)$/, (ctx) => {
        const orderId = parseInt(ctx.match[1]);
        orderService.cancel(orderId);
        ctx.answerCbQuery('❌ Đã hủy đơn hàng');
        ctx.reply('❌ Đơn hàng đã bị hủy.');
    });
};
