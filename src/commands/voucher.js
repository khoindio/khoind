const voucherService = require('../services/voucherService');
const { formatPrice } = require('../utils/keyboard');

module.exports = (bot) => {
    bot.command(['voucher', 'giftcode'], (ctx) => {
        const args = ctx.message.text.split(' ');
        if (args.length < 2) {
            return ctx.replyWithHTML(
                `🎁 <b>NHẬP MÃ QUÀ TẶNG (VOUCHER)</b>\n\n` +
                `Cách dùng: <code>/voucher [MÃ_SỐ]</code>\n` +
                `Ví dụ: <code>/voucher FREE10K</code>`
            );
        }

        const code = args[1].toUpperCase();
        const userId = ctx.from.id;

        const result = voucherService.redeemVoucher(userId, code);

        if (result.success) {
            ctx.replyWithHTML(
                `✅ <b>SỬ DỤNG VOUCHER THÀNH CÔNG!</b>\n\n` +
                `🎁 Mã: <code>${code}</code>\n` +
                `💰 Số dư cộng thêm: <b>+${formatPrice(result.amount)}</b>\n\n` +
                `Bấm /menu để xem số dư hiện tại.`
            );
        } else {
            ctx.reply(`❌ Lỗi: ${result.error}`);
        }
    });
};
