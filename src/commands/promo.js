const db = require('../database');
const config = require('../config');
const userService = require('../services/userService');
const { formatPrice } = require('../utils/keyboard');

module.exports = (bot) => {
    // Admin command: /addpromo <code> <amount> <max_uses> [days_valid]
    bot.command('addpromo', (ctx) => {
        if (!config.ADMIN_IDS.includes(ctx.from.id)) {
            return ctx.reply('⛔ Bạn không có quyền sử dụng lệnh này.');
        }

        const args = ctx.message.text.split(' ').slice(1);
        if (args.length < 3) {
            return ctx.replyWithHTML(
                '⚠️ <b>Cú pháp:</b> <code>/addpromo &lt;Mã&gt; &lt;Số_tiền&gt; &lt;Lượt_dùng&gt; [Số_ngày_hạn]</code>\n\n' +
                '• <code>Lượt_dùng</code>: Nhập <code>0</code> để không giới hạn lượt dùng.\n' +
                '• <code>Số_ngày_hạn</code>: Số ngày mã có hiệu lực kể từ lúc tạo (Tùy chọn).\n\n' +
                '💡 Ví dụ:\n' +
                '- Vô hạn lượt: <code>/addpromo khoind 10000 0</code>\n' +
                '- Hạn 1 ngày: <code>/addpromo khoind 10000 10 1</code>'
            );
        }

        const code = args[0].toUpperCase();
        const amount = parseInt(args[1]);
        const maxUses = parseInt(args[2]);
        const daysValid = args[3] ? parseInt(args[3]) : null;

        if (isNaN(amount) || isNaN(maxUses)) {
            return ctx.reply('❌ Số tiền và số lượt sử dụng phải là số.');
        }

        let expiresAt = null;
        if (daysValid && !isNaN(daysValid)) {
            const date = new Date();
            date.setDate(date.getDate() + daysValid);
            // Format to YYYY-MM-DD
            expiresAt = date.toISOString().split('T')[0];
        }

        try {
            db.prepare(
                'INSERT INTO promocodes (code, discount_amount, max_uses, expires_at) VALUES (?, ?, ?, ?)'
            ).run(code, amount, maxUses, expiresAt);

            let msg = `✅ <b>Tạo Mã Giảm Giá Thành Công!</b>\n\n🎟 Mã: <code>${code}</code>\n💰 Tặng: ${formatPrice(amount)}\n📊 Lượt dùng: ${maxUses === 0 ? '♾ Vô hạn' : maxUses}`;
            if (expiresAt) msg += `\n📅 Hạn dùng: <b>${daysValid} ngày</b> (Đến hết: <code>${expiresAt}</code>)`;
            
            ctx.replyWithHTML(msg);
        } catch (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                ctx.reply('❌ Mã này đã tồn tại trong hệ thống.');
            } else {
                console.error(err);
                ctx.reply('❌ Đã xảy ra lỗi khi tạo mã.');
            }
        }
    });

    // User command: /nhapma <code>
    bot.command('nhapma', (ctx) => {
        const args = ctx.message.text.split(' ').slice(1);
        if (args.length < 1) {
            return ctx.reply('⚠️ Cú pháp: `/nhapma <Mã_của_bạn>`\nVí dụ: `/nhapma TET2024`', { parse_mode: 'Markdown' });
        }

        const code = args[0];
        const userId = ctx.from.id;
        const promoService = require('../services/promoService');

        // Find user
        userService.findOrCreate(ctx.from);

        const result = promoService.apply(userId, code);
        if (result.success) {
            ctx.reply(`✅ <b>NHẬP MÃ THÀNH CÔNG!</b>\n\nBạn được cộng thêm <b>${formatPrice(result.amount)}</b> vào tài khoản từ mã <code>${code.toUpperCase()}</code>.\n\nGõ /menu để kiểm tra số dư.`, { parse_mode: 'HTML' });
        } else {
            ctx.reply(result.msg);
        }
    });
};
