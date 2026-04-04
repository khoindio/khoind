const db = require('../database');

const promoService = {
    /**
     * Apply a promo code to a user
     * Returns { success, amount, msg }
     */
    apply(userId, code) {
        if (!code) return { success: false, msg: '⚠️ Vui lòng nhập mã giảm giá.' };
        code = code.toUpperCase();

        const promo = db.prepare('SELECT * FROM promocodes WHERE code = ?').get(code);

        if (!promo) {
            return { success: false, msg: '❌ Mã giảm giá không tồn tại.' };
        }

        if (!promo.is_active) {
            return { success: false, msg: '❌ Mã giảm giá hiện không hoạt động.' };
        }

        // Check max uses (0 = unlimited)
        if (promo.max_uses > 0 && promo.current_uses >= promo.max_uses) {
            return { success: false, msg: '❌ Mã giảm giá đã hết lượt sử dụng.' };
        }

        // Check expiration date
        if (promo.expires_at) {
            const now = new Date();
            const expiry = new Date(promo.expires_at);
            expiry.setHours(23, 59, 59, 999);
            
            if (now > expiry) {
                return { success: false, msg: `❌ Mã giảm giá này đã hết hạn vào ngày ${promo.expires_at}.` };
            }
        }

        const used = db.prepare('SELECT * FROM user_promocodes WHERE user_id = ? AND promo_id = ?').get(userId, promo.id);
        if (used) {
            return { success: false, msg: '❌ Bạn đã sử dụng mã này rồi.' };
        }

        try {
            const applyTx = db.transaction(() => {
                // Update user balance
                db.prepare('UPDATE users SET balance = balance + ? WHERE telegram_id = ?').run(promo.discount_amount, userId);

                // Update promo usage
                db.prepare('UPDATE promocodes SET current_uses = current_uses + 1 WHERE id = ?').run(promo.id);

                // Log usage
                db.prepare('INSERT INTO user_promocodes (user_id, promo_id) VALUES (?, ?)').run(userId, promo.id);
            });

            applyTx();
            return { success: true, amount: promo.discount_amount };
        } catch (err) {
            console.error('Error in promoService.apply:', err);
            return { success: false, msg: '❌ Đã xảy ra lỗi hệ thống khi áp dụng mã.' };
        }
    }
};

module.exports = promoService;
