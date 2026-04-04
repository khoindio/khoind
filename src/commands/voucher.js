const voucherService = require('../services/voucherService');
const userService = require('../services/userService');
const { formatPrice } = require('../utils/keyboard');

module.exports = (bot) => {
    bot.command(['giftcode', 'voucher'], (ctx) => {
        const text = ctx.message.text.split(' ');
        const code = text[1]?.toUpperCase();

        if (!code) {
            return ctx.replyWithHTML(
                `🎁 <b>NẠP GIFTCODE</b>\n\n` +
                `Cách dùng: <code>/giftcode [Mã_của_bạn]</code>\n` +
                `Ví dụ: <code>/giftcode VIP100K</code>`
            );
        }

        const telegramId = ctx.from.id;
        
        // Ensure user exists
        userService.findOrCreate(ctx.from);

        const check = voucherService.checkVoucher(code, telegramId);

        if (!check.valid) {
            return ctx.reply(check.error);
        }

        const voucher = check.voucher;
        
        // Add balance and mark as used
        const success = voucherService.useVoucher(code, telegramId);
        
        if (success) {
            userService.addBalance(telegramId, voucher.value);
            const user = userService.get(telegramId);
            
            ctx.replyWithHTML(
                `🎉 <b>CHÚC MỪNG BẠN!</b>\n\n` +
                `Đã nạp thành công: <b>${formatPrice(voucher.value)}</b>\n` +
                `💰 Số dư hiện tại: <b>${formatPrice(user.balance)}</b>`
            );
        } else {
            ctx.reply('❌ Đã xảy ra lỗi khi sử dụng Giftcode. Vui lòng thử lại sau.');
        }
    });
};
