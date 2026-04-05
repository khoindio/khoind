const config = require('../config');

module.exports = (bot) => {
    // Listen for text, photo, document, video to handle support chat flows
    bot.on(['text', 'photo', 'document', 'video'], async (ctx, next) => {
        if (!ctx.message) return next();

        const userId = ctx.from.id;
        const isAdmin = config.ADMIN_IDS.includes(userId);
        const isCommand = ctx.message.text && ctx.message.text.startsWith('/');

        // 1. Handle Admin Replying to User (Always active for admins)
        if (isAdmin && ctx.message.reply_to_message) {
            const replyTo = ctx.message.reply_to_message;
            const replyToText = replyTo.text || replyTo.caption || '';
            
            // Check if the original message has the [#ID:...] format
            const idMatch = replyToText.match(/\[#ID:(\d+)\]/);
            
            if (idMatch) {
                const targetUserId = idMatch[1];
                try {
                    // Forward admin's message back to the specific user
                    if (ctx.message.text) {
                        await bot.telegram.sendMessage(targetUserId, `💬 <b>Phản hồi từ Admin:</b>\n\n${ctx.message.text}`, { parse_mode: 'HTML' });
                    } else if (ctx.message.photo) {
                        await bot.telegram.sendPhoto(targetUserId, ctx.message.photo[ctx.message.photo.length - 1].file_id, { caption: '💬 <b>Phản hồi từ Admin (Ảnh)</b>', parse_mode: 'HTML' });
                    } else if (ctx.message.document) {
                        await bot.telegram.sendDocument(targetUserId, ctx.message.document.file_id, { caption: '💬 <b>Phản hồi từ Admin (File)</b>', parse_mode: 'HTML' });
                    } else if (ctx.message.video) {
                        await bot.telegram.sendVideo(targetUserId, ctx.message.video.file_id, { caption: '💬 <b>Phản hồi từ Admin (Video)</b>', parse_mode: 'HTML' });
                    }
                    
                    await ctx.reply('✅ Đã gửi phản hồi cho khách hàng!');
                } catch (err) {
                    console.error('Error sending reply back to user:', err);
                    await ctx.reply('❌ Không thể gửi tin nhắn cho user này (có thể họ đã chặn bot).');
                }
                return; // Handled admin reply
            }
        }

        // 2. Handle User sending messages during an ACTIVE support session
        if (ctx.session && ctx.session.in_support && !isCommand) {
            try {
                const header = `🆘 <b>TIN NHẮN HỖ TRỢ</b>\n👤 Từ: ${ctx.from.first_name || 'Khách'} <code>[#ID:${userId}]</code>\n\n`;
                
                // Forward to all admins
                for (const adminId of config.ADMIN_IDS) {
                    if (ctx.message.text) {
                        await bot.telegram.sendMessage(adminId, header + `💬 Nội dung: ${ctx.message.text}`, { parse_mode: 'HTML' }).catch(() => {});
                    } else if (ctx.message.photo) {
                        await bot.telegram.sendPhoto(adminId, ctx.message.photo[ctx.message.photo.length - 1].file_id, { caption: header + `🖼 Gửi kèm ảnh`, parse_mode: 'HTML' }).catch(() => {});
                    } else if (ctx.message.document) {
                        await bot.telegram.sendDocument(adminId, ctx.message.document.file_id, { caption: header + `📄 Gửi kèm tài liệu`, parse_mode: 'HTML' }).catch(() => {});
                    } else if (ctx.message.video) {
                        await bot.telegram.sendVideo(adminId, ctx.message.video.file_id, { caption: header + `🎥 Gửi kèm video`, parse_mode: 'HTML' }).catch(() => {});
                    }
                }
                
                await ctx.reply('📨 đã gửi tới Admin...');
            } catch (err) {
                console.error('Error forwarding message to admin:', err);
            }
            return; // Handled support session message
        }

        // Pass control to the next handler
        return next();
    });
};
