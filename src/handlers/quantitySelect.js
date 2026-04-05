const productService = require('../services/productService');
const orderService = require('../services/orderService');
const paymentService = require('../services/paymentService');
const userService = require('../services/userService');
const messages = require('../utils/messages');
const config = require('../config');
const { Markup } = require('telegraf');
const { formatPrice } = require('../utils/keyboard');

module.exports = (bot) => {
    // Handle quantity selection: qty_{productId}_{quantity}
    bot.action(/^qty_(\d+)_(\d+)$/, async (ctx) => {
        const productId = parseInt(ctx.match[1]);
        const quantity = parseInt(ctx.match[2]);
        const product = productService.getById(productId);

        if (!product) {
            return ctx.answerCbQuery('❌ Sản phẩm không tồn tại');
        }

        // Check stock availability (display_stock includes sheet_stock fallback)
        const availableStock = product.display_stock || product.stock_count;
        if (availableStock < quantity) {
            return ctx.answerCbQuery(`❌ Chỉ còn ${availableStock} sản phẩm`);
        }

        const banks = paymentService.getBanks();

        if (banks.length > 1) {
            // Multiple banks → show bank selection
            ctx.answerCbQuery();
            const totalPrice = product.price * quantity;
            const bankButtons = banks.map((b, i) =>
                [Markup.button.callback(`🏦 ${b.NAME}`, `bank_${productId}_${quantity}_${i}`)]
            );
            bankButtons.push([Markup.button.callback('❌ Hủy', 'cancel_order')]);

            ctx.replyWithHTML(
                `📦 <b>${product.name}</b>\n` +
                `📊 Số lượng: ${quantity}\n` +
                `💵 Tổng tiền: <b>${formatPrice(totalPrice)}</b>\n\n` +
                `🏦 Chọn ngân hàng thanh toán:`,
                Markup.inlineKeyboard(bankButtons)
            );
        } else {
            // Single bank → create order directly
            ctx.answerCbQuery('⏳ Đang tạo đơn hàng...');
            await createOrderAndPay(ctx, bot, product, quantity, 0);
        }
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

        ctx.answerCbQuery('⏳ Đang tạo đơn hàng...');
        await createOrderAndPay(ctx, bot, product, quantity, bankIndex);
    });

    // ════════════════════════════════════
    // Shared: Create order + send QR + notify admin
    // ════════════════════════════════════
    async function createOrderAndPay(ctx, bot, product, quantity, bankIndex) {
        const user = userService.findOrCreate(ctx.from);
        const totalPrice = product.price * quantity;

        const discountBalance = Math.min(user.balance, totalPrice);
        const needAmount = totalPrice - discountBalance;

        const explicitCode = `DH${Date.now()}`;
        const payment = paymentService.generatePayment(needAmount, bankIndex, user.telegram_id, explicitCode);

        const order = orderService.create(
            ctx.from.id,
            product.id,
            quantity,
            totalPrice,
            needAmount > 0 ? payment.paymentCode : `BAL_${Date.now()}`,
            discountBalance
        );

        if (needAmount === 0) {
            // Paid fully by balance
            ctx.reply('⏳ Đang xử lý thanh toán bằng số dư...');
            const { deliverOrder } = require('./paymentConfirm');
            const result = await deliverOrder(bot, order.id);

            if (!result.success) {
                ctx.reply(`⚠️ Đã ghi nhận thanh toán bằng số dư nhưng có lỗi: ${result.error}. Đơn hàng đã được chuyển cho admin xử lý thủ công.`);
                
                const userName = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ');
                const adminMsg = `🔔 <b>ĐƠN HÀNG ĐÃ THANH TOÁN (Lỗi giao tự động) #${order.id}</b>\nKhách: ${userName} (<code>${ctx.from.id}</code>)\nSản phẩm: ${product.name}\nSL: ${quantity}\nLỗi: ${result.error}`;
                
                for (const adminId of config.ADMIN_IDS) {
                    await bot.telegram.sendMessage(adminId, adminMsg, {
                        parse_mode: 'HTML',
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback(`✅ Xác nhận & giao hàng thủ công #${order.id}`, `admin_confirm_${order.id}`)],
                            [Markup.button.callback(`❌ Hủy #${order.id}`, `admin_cancel_${order.id}`)],
                        ])
                    }).catch(e => console.error(`Failed to notify admin ${adminId}:`, e.message));
                }
            }
        } else {
            // Need to pay remaining amount via bank transfer
            // 1. Send QR code to customer
            const caption =
                `⏳ <b>Đang chờ thanh toán phần còn thiếu...</b>\n\n` +
                `💰 <b>THANH TOÁN ĐƠN HÀNG #${order.id}</b>\n\n` +
                `📦 Sản phẩm: ${product.name}\n` +
                `📊 Số lượng: ${quantity}\n` +
                `💵 Tổng tiền: <b>${formatPrice(totalPrice)}</b>\n` +
                (discountBalance > 0 ? `💳 Sử dụng số dư: <b>-${formatPrice(discountBalance)}</b>\n` : '') +
                `━━━━━━━━━━━━━━━━━\n\n` +
                `⚠️ Bạn cần chuyển khoản thêm: <b>${formatPrice(needAmount)}</b>\n\n` +
                `🏦 Quét mã QR phía trên để chuyển khoản\n` +
                `├ Số tiền: <b>${formatPrice(needAmount)}</b>\n` +
                `└ Nội dung CK: <code>${payment.paymentCode}</code>\n\n` +
                `⏰ QR hiệu lực trong <b>15 phút</b>\n` +
                `🚫 <b>KHÔNG</b> thay đổi nội dung chuyển khoản\n` +
                `✅ Sau khi CK thành công, hàng sẽ được\ngiao tự động trong vòng dưới 60 giây`;

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
                (discountBalance > 0 ? `💳 Đã trừ vào số dư nháp: ${formatPrice(discountBalance)}\n` : '') +
                `🏦 Khách cần CK thêm: <b>${formatPrice(needAmount)}</b> (${payment.bankName})\n` +
                `🔑 Mã CK: <code>${payment.paymentCode}</code>\n\n` +
                `━━━━━━━━━━━━━━━━━\n` +
                `✅ Khi nhận được tiền, xác nhận & giao hàng:\n` +
                `<code>/confirm ${order.id}</code>`;

            for (const adminId of config.ADMIN_IDS) {
                await bot.telegram.sendMessage(adminId, adminMsg, {
                    parse_mode: 'HTML',
                    ...Markup.inlineKeyboard([
                        [
                            Markup.button.callback(`✅ Xác nhận #${order.id}`, `admin_confirm_${order.id}`),
                            Markup.button.callback(`❌ Hủy #${order.id}`, `admin_cancel_${order.id}`),
                        ],
                    ]),
                }).catch(err => console.error(`Failed to notify admin ${adminId}:`, err.message));
            }
        }
    }

    // ════════════════════════════════════
    // Admin quick-action buttons on order notification
    // ════════════════════════════════════
    bot.action(/^admin_confirm_(\d+)$/, async (ctx) => {
        if (!config.ADMIN_IDS.includes(ctx.from.id)) return ctx.answerCbQuery('⛔');

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
            ctx.answerCbQuery('📝 Cần cung cấp KEY...');
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
                `👇 Gửi thông tin KEY ngay bây giờ:\n\n` +
                `<i>Ví dụ:</i>\n` +
                `<code>KEY</code>\n\n` +
                `Bot sẽ tự động chuyển cho khách.\n` +
                `Gõ /cancel để hủy.`
            );
        }
    });

    bot.action(/^admin_cancel_(\d+)$/, (ctx) => {
        if (!config.ADMIN_IDS.includes(ctx.from.id)) return ctx.answerCbQuery('⛔');

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
