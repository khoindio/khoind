const productService = require('../services/productService');
const { productListKeyboard, formatPrice } = require('../utils/keyboard');
const messages = require('../utils/messages');
const userService = require('../services/userService');
const orderService = require('../services/orderService');
const { Markup } = require('telegraf');

module.exports = (bot) => {
    bot.hears('📦 Mua Sản Phẩm', (ctx) => {
        const products = productService.getAll();
        ctx.reply(messages.productHeader, productListKeyboard(products));
    });

    bot.hears('👤 Tài Khoản', (ctx) => {
        const user = userService.findOrCreate(ctx.from);
        ctx.replyWithHTML(messages.accountInfo(user));
    });

    bot.hears('💰 Nạp Số Dư', (ctx) => {
        ctx.replyWithHTML(
            '💰 <b>NẠP SỐ DƯ</b>\n\n' +
            'Cách dùng: /nap [số tiền]\n' +
            'Ví dụ: /nap 50000\n\n' +
            '💡 Số tiền tối thiểu: 10.000đ'
        );
    });

    bot.hears('📜 Lịch Sử Đơn', (ctx) => {
        const userId = ctx.from.id;
        const orders = orderService.getRecentByUser(userId, 5);

        if (!orders || orders.length === 0) {
            return ctx.reply('📭 Bạn chưa có đơn hàng nào.');
        }

        let msg = '📜 <b>LỊCH SỬ ĐƠN HÀNG GẦN ĐÂY</b>\n\n';
        const buttons = [];
        
        const statusMap = {
            pending: '⏳ Chờ thanh toán',
            paid: '💵 Đã thanh toán',
            delivered: '✅ Đã giao',
            cancelled: '❌ Đã hủy',
        };

        orders.forEach((o, i) => {
            const index = i + 1;
            msg += `${index}. <b>${o.product_name}</b> (x${o.quantity})\n`;
            msg += `   💵 Tổng: ${formatPrice(o.total_price)}\n`;
            msg += `   📋 Trạng thái: ${statusMap[o.status] || o.status}\n`;
            msg += `   📅 Ngày: ${o.created_at}\n`;
            msg += `   🆔 Mã: <code>${o.payment_code || o.id}</code>\n`;
            msg += `━━━━━━━━━━━━━━\n`;

            if (o.status === 'delivered') {
                buttons.push([Markup.button.callback(`⬇️ Lấy KEY/File đơn #${index}`, `get_order_${o.id}`)]);
            }
        });

        if (buttons.length > 0) {
            msg += `\n💡 <i>Nhấn vào nút bên dưới để lấy lại nội dung đã mua.</i>`;
            ctx.replyWithHTML(msg, Markup.inlineKeyboard(buttons));
        } else {
            ctx.replyWithHTML(msg);
        }
    });

    bot.hears('🆘 Hỗ Trợ', (ctx) => {
        ctx.replyWithHTML(
            messages.supportInfo +
            `\n\n💡 <b>Hoặc chat trực tiếp với Admin qua bot:</b>\n` +
            `Gõ <code>/support [Nội dung bạn muốn hỏi]</code>\n` +
            `<i>Ví dụ: /support Admin ơi cho mình hỏi về...</i>`
        );
    });

    bot.hears('🎫 Nhập Mã Giảm Giá', (ctx) => {
        ctx.reply('⚠️ Cú pháp: `/nhapma <Mã_của_bạn>`\nVí dụ: `/nhapma helyios`', { parse_mode: 'Markdown' });
    });
};
