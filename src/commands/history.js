const orderService = require('../services/orderService');
const { formatPrice } = require('../utils/keyboard');
const { Markup } = require('telegraf');

module.exports = (bot) => {
    bot.command(['history', 'checkpay'], (ctx) => {
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
};