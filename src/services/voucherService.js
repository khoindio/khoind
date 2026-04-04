const db = require('../database');
const userService = require('./userService');

const voucherService = {
    /**
     * Create a new voucher
     * @param {string} code 
     * @param {number} amount 
     * @param {number} maxUses 
     */
    createVoucher(code, amount, maxUses = 1) {
        try {
            db.prepare('INSERT INTO vouchers (code, amount, max_uses) VALUES (?, ?, ?)')
              .run(code, amount, maxUses);
            return { success: true };
        } catch (error) {
            if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                return { success: false, error: 'Mã voucher đã tồn tại.' };
            }
            return { success: false, error: error.message };
        }
    },

    /**
     * Get all vouchers
     */
    getVouchers() {
        return db.prepare('SELECT * FROM vouchers ORDER BY created_at DESC').all();
    },

    /**
     * Delete a voucher by code
     * @param {string} code 
     */
    deleteVoucher(code) {
        const result = db.prepare('DELETE FROM vouchers WHERE code = ?').run(code);
        return result.changes > 0;
    },

    /**
     * Redeem a voucher for a user
     * @param {number} userId - Telegram User ID
     * @param {string} code - Voucher code
     */
    redeemVoucher(userId, code) {
        // Ensure user exists
        userService.findOrCreate({ id: userId });

        const voucher = db.prepare('SELECT * FROM vouchers WHERE code = ?').get(code);

        if (!voucher) {
            return { success: false, error: 'Mã voucher không hợp lệ hoặc không tồn tại.' };
        }

        if (voucher.used_count >= voucher.max_uses) {
            return { success: false, error: 'Mã voucher này đã hết lượt sử dụng.' };
        }

        const used = db.prepare('SELECT * FROM voucher_uses WHERE voucher_id = ? AND user_id = ?')
                       .get(voucher.id, userId);
        
        if (used) {
            return { success: false, error: 'Bạn đã sử dụng mã voucher này rồi.' };
        }

        try {
            // Transaction to ensure atomicity
            const transaction = db.transaction(() => {
                // Update used count
                db.prepare('UPDATE vouchers SET used_count = used_count + 1 WHERE id = ?').run(voucher.id);
                // Record usage
                db.prepare('INSERT INTO voucher_uses (voucher_id, user_id) VALUES (?, ?)').run(voucher.id, userId);
                // Add balance
                db.prepare('UPDATE users SET balance = balance + ? WHERE telegram_id = ?').run(voucher.amount, userId);
            });

            transaction();
            return { success: true, amount: voucher.amount };
        } catch (error) {
            return { success: false, error: 'Đã xảy ra lỗi khi sử dụng voucher.' };
        }
    }
};

module.exports = voucherService;
