const messages = require('../utils/messages');
const config = require('../config');

module.exports = (bot) => {
    bot.command('support', async (ctx) => {
        const messageText = ctx.message.text.replace('/support', '').trim();

        if (!messageText) {
            return ctx.replyWithHTML(
                messages.supportInfo +
                `\n\n💡 <b>Hoặc chat trực tiếp với Admin qua bot:</b>\n` +
                `Gõ <code>/support [Nội dung bạn muốn hỏi]</code>\n` +
                `<i>Ví dụ: /support Admin ơi cho mình hỏi về...</i>`
            );
        }

        try {
            // Enable live chat mode only when content is provided
            if (!ctx.session) ctx.session = {};
            ctx.session.in_support = true;

            const userInfo = `👤 Từ: ${ctx.from.first_name || 'Khách'} <code>[#ID:${ctx.from.id}]</code>\n`;
            const forwardMsg = `🆘 <b>YÊU CẦU HỖ TRỢ MỚI</b>\n${userInfo}💬 Nội dung: ${messageText}`;
            
            // Send to all admins
            for (const adminId of config.ADMIN_IDS) {
                await bot.telegram.sendMessage(adminId, forwardMsg, { parse_mode: 'HTML' }).catch(err => {
                    console.error(`Failed to send support notify to admin ${adminId}:`, err.message);
                });
            }
            
            ctx.replyWithHTML('✅ Tin nhắn của bạn đã được gửi. Bạn đã được chuyển vào <b>Chế độ Chat trực tiếp</b>, hãy gửi thêm tin nhắn nếu cần.\n\n(Gõ <code>/exit</code> để thoát)');
        } catch (err) {
            console.error('Error sending support message:', err);
            ctx.reply('❌ Không thể gửi tin nhắn lúc này. Vui lòng liên hệ trực tiếp qua link hỗ trợ ở trên.');
        }
    });

    // Command to exit support mode
    bot.command(['exit', 'end'], (ctx) => {
        if (ctx.session && ctx.session.in_support) {
            ctx.session.in_support = false;
            ctx.reply('✅ Đã kết thúc chế độ hỗ trợ. Cảm ơn bạn!');
        } else {
            ctx.reply('Bạn đang không trong chế độ hỗ trợ.');
        }
    });
};
