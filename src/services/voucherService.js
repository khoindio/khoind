const db = require('../database');

class VoucherService {
    // Add new voucher
    addVoucher(code, value, maxUsages = 1, expiresInDays = null) {
        try {
            let expiresAt = null;
            if (expiresInDays) {
                const date = new Date();
                date.setDate(date.getDate() + expiresInDays);
                expiresAt = date.toISOString().slice(0, 19).replace('T', ' '); // format: YYYY-MM-DD HH:MM:SS
            }

            const stmt = db.prepare(`
                INSERT INTO vouchers (code, type, value, max_usages, expires_at)
                VALUES (?, ?, ?, ?, ?)
            `);
            const info = stmt.run(code, 'general', value, maxUsages, expiresAt);
            return { success: true, id: info.lastInsertRowid };
        } catch (err) {
            if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                return { success: false, error: 'Mã voucher đã tồn tại.' };
            }
            return { success: false, error: err.message };
        }
    }

    // Get voucher by code
    getVoucher(code) {
        return db.prepare('SELECT * FROM vouchers WHERE code = ? AND is_active = 1').get(code);
    }

    // Get all vouchers
    getAllVouchers() {
        return db.prepare('SELECT * FROM vouchers ORDER BY created_at DESC').all();
    }

    // Delete voucher
    deleteVoucher(code) {
        const info = db.prepare('DELETE FROM vouchers WHERE code = ?').run(code);
        return info.changes > 0;
    }

    // Check if voucher is valid for a specific user
    checkVoucher(code, telegramId) {
        const voucher = this.getVoucher(code);

        if (!voucher) {
            return { valid: false, error: '❌ Mã voucher không hợp lệ hoặc đã bị vô hiệu hóa.' };
        }

        if (voucher.expires_at) {
            const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
            if (now > voucher.expires_at) {
                return { valid: false, error: '❌ Mã voucher đã hết hạn sử dụng.' };
            }
        }

        if (voucher.max_usages > 0 && voucher.used_count >= voucher.max_usages) {
            return { valid: false, error: '❌ Mã voucher đã hết lượt sử dụng.' };
        }

        const usageCheck = db.prepare(`
            SELECT COUNT(*) as count FROM voucher_usages
            WHERE voucher_id = ? AND telegram_id = ?
        `).get(voucher.id, telegramId);

        if (usageCheck.count > 0) {
            return { valid: false, error: '❌ Bạn đã sử dụng mã voucher này rồi.' };
        }

        return { valid: true, voucher };
    }

    // Mark voucher as used by a user
    useVoucher(code, telegramId) {
        const voucher = this.getVoucher(code);
        if (!voucher) return false;

        const check = this.checkVoucher(code, telegramId);
        if (!check.valid) return false;

        const transaction = db.transaction(() => {
            db.prepare(`
                INSERT INTO voucher_usages (voucher_id, telegram_id)
                VALUES (?, ?)
            `).run(voucher.id, telegramId);

            db.prepare(`
                UPDATE vouchers SET used_count = used_count + 1
                WHERE id = ?
            `).run(voucher.id);
        });

        try {
            transaction();
            return true;
        } catch (err) {
            console.error('Failed to use voucher:', err.message);
            return false;
        }
    }
}

module.exports = new VoucherService();
