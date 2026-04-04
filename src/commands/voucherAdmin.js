const config = require('../config');
const voucherService = require('../services/voucherService');
const { formatPrice } = require('../utils/keyboard');

function isAdmin(ctx) {
    return ctx.from.id === config.ADMIN_ID;
}

function adminOnly(ctx, next) {
    if (!isAdmin(ctx)) {
        return ctx.replyWithHTML('⛔ Bạn không có quyền sử dụng lệnh này.');
    }
    return next();
}

module.exports = (bot) => {
    bot.command('addvoucher', adminOnly, (ctx) => {
        const text = ctx.message.text.replace('/addvoucher', '').trim();
        const args = text.split(' ').filter(Boolean);

        if (args.length < 3) {
            return ctx.replyWithHTML(
                `🎟️ <b>THÊM VOUCHER</b>\n\n` +
                `Cách dùng:\n` +
                `<code>/addvoucher [Mã] [Giá_trị] [Số_lượng] [Hạn_sử_dụng_ngày_tùy_chọn]</code>\n\n` +
                `<b>Ví dụ:</b>\n` +
                `- Không giới hạn: <code>/addvoucher VIP50K 50000 20</code>\n` +
                `- Hạn 7 ngày: <code>/addvoucher VIP50K 50000 20 7</code>\n\n` +
                `💡 Mã này có thể dùng để nạp số dư hoặc giảm giá khi mua hàng.`
            );
        }

        const [code, valueStr, maxUsagesStr, daysStr] = args;
        const codeUpper = code.toUpperCase();
        
        const value = parseInt(valueStr);
        const maxUsages = parseInt(maxUsagesStr);
        const expiresInDays = daysStr ? parseInt(daysStr) : null;

        if (isNaN(value) || value <= 0) return ctx.reply('❌ Giá trị phải là số dương.');
        if (isNaN(maxUsages) || maxUsages < 0) return ctx.reply('❌ Số lượng phải là số không âm (0 = Không giới hạn).');
        if (expiresInDays !== null && (isNaN(expiresInDays) || expiresInDays <= 0)) {
            return ctx.reply('❌ Số ngày hạn sử dụng phải là số dương.');
        }

        const result = voucherService.addVoucher(codeUpper, value, maxUsages, expiresInDays);
        
        if (result.success) {
            let msg = `✅ <b>Đã thêm Voucher thành công!</b>\n\n` +
                `├ Mã: <code>${codeUpper}</code>\n` +
                `├ Giá trị: <b>${formatPrice(value)}</b>\n` +
                `└ Số lượt dùng: <b>${maxUsages === 0 ? 'Không giới hạn' : maxUsages}</b>`;
            if (expiresInDays) {
                msg += `\n└ Hạn dùng: <b>${expiresInDays} ngày</b>`;
            }
            ctx.replyWithHTML(msg);
        } else {
            ctx.reply(`❌ Lỗi: ${result.error}`);
        }
    });

    bot.command('delvoucher', adminOnly, (ctx) => {
        const text = ctx.message.text.replace('/delvoucher', '').trim();
        const code = text.split(' ')[0]?.toUpperCase();

        if (!code) {
            return ctx.replyWithHTML('Cách dùng: <code>/delvoucher [Mã]</code>');
        }

        const success = voucherService.deleteVoucher(code);
        if (success) {
            ctx.replyWithHTML(`🗑️ Đã xóa Voucher: <b>${code}</b>`);
        } else {
            ctx.reply('❌ Voucher không tồn tại hoặc đã bị xóa.');
        }
    });

    bot.command('vouchers', adminOnly, (ctx) => {
        const vouchers = voucherService.getAllVouchers();
        
        if (vouchers.length === 0) {
            return ctx.reply('📋 Không có voucher nào.');
        }

        let text = `🎟️ <b>DANH SÁCH VOUCHER (${vouchers.length})</b>\n\n`;
        vouchers.forEach((v) => {
            text += `<b>${v.code}</b>\n`;
            text += `├ Giá trị: ${formatPrice(v.value)}\n`;
            text += `├ Đã dùng: ${v.used_count}/${v.max_usages === 0 ? 'Không giới hạn' : v.max_usages}\n`;
            if (v.expires_at) {
                text += `└ HSD: ${v.expires_at}\n\n`;
            } else {
                text += `└ HSD: Không giới hạn\n\n`;
            }
        });

        ctx.replyWithHTML(text);
    });
};
