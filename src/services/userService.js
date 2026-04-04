const db = require('../database');

const userService = {
    /**
     * Find or create user
     */
    findOrCreate(telegramUser) {
        const existing = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramUser.id);
        if (existing) return existing;

        const fullName = [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(' ');
        db.prepare(
            'INSERT INTO users (telegram_id, username, full_name) VALUES (?, ?, ?)'
        ).run(telegramUser.id, telegramUser.username || null, fullName);

        return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramUser.id);
    },

    /**
     * Get user by telegram ID
     */
    get(telegramId) {
        return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);
    },

    /**
     * Get all users
     */
    getAll() {
        return db.prepare('SELECT telegram_id FROM users').all();
    },

    /**
     * Get user by username
     */
    getByUsername(username) {
        const cleanUsername = username.replace('@', '');
        return db.prepare('SELECT * FROM users WHERE username = ?').get(cleanUsername);
    },

    /**
     * Toggle block status
     */
    toggleBlock(telegramId) {
        const user = this.get(telegramId);
        if (!user) return null;
        const newState = user.is_blocked ? 0 : 1;
        db.prepare('UPDATE users SET is_blocked = ? WHERE telegram_id = ?').run(newState, telegramId);
        return newState;
    },

    /**
     * Get full user stats (total orders, total spent)
     */
    getFullStats(telegramId) {
        const stats = db.prepare(`
            SELECT 
                COUNT(*) as total_orders,
                COALESCE(SUM(total_price), 0) as total_spent
            FROM orders 
            WHERE user_id = ? AND status = 'delivered'
        `).get(telegramId);
        return stats;
    },

    /**
     * Update balance
     */
    addBalance(telegramId, amount) {
        db.prepare('UPDATE users SET balance = balance + ? WHERE telegram_id = ?').run(amount, telegramId);
    },

    /**
     * Deduct balance
     */
    deductBalance(telegramId, amount) {
        const user = this.get(telegramId);
        if (!user || user.balance < amount) return false;
        db.prepare('UPDATE users SET balance = balance - ? WHERE telegram_id = ?').run(amount, telegramId);
        return true;
    },
};

module.exports = userService;
