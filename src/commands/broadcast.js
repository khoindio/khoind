const userService = require('../services/userService');
const config = require('../config');

// Helper sleep function to avoid Telegram rate limits
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = (bot) => {
    bot.command('broadcast', async (ctx) => {
        if (!config.ADMIN_IDS.includes(ctx.from.id)) {
            return ctx.reply('⛔ Bạn không có quyền sử dụng lệnh này.');
        }

        const message = ctx.message.text.replace('/broadcast', '').trim();
        
        if (!message) {
            return ctx.reply('⚠️ Vui lòng nhập nội dung thông báo.\nVí dụ: `/broadcast Chào mọi người, hôm nay có giảm giá!`', { parse_mode: 'Markdown' });
        }

        const users = userService.getAll();
        const totalUsers = users.length;
        
        await ctx.reply(`⏳ Bắt đầu gửi thông báo đến ${totalUsers} người dùng...`);

        let successCount = 0;
        let failCount = 0;

        for (const user of users) {
            try {
                await bot.telegram.sendMessage(user.telegram_id, `📢 <b>THÔNG BÁO TỪ ADMIN</b>\n\n${message}`, { parse_mode: 'HTML' });
                successCount++;
            } catch (err) {
                // If user blocked the bot or account deleted
                failCount++;
            }
            // Sleep 50ms to prevent hitting Telegram's 30 messages/second limit
            await sleep(50);
        }

        await ctx.reply(`✅ <b>Broadcast Hoàn tất!</b>\n\nTổng cộng: ${totalUsers}\nThành công: ${successCount}\nThất bại: ${failCount}`, { parse_mode: 'HTML' });
    });
};
