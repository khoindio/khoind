const db = require('../database');
const productService = require('./productService');

const orderService = {
  /**
   * Create a new order
   */
  create(userId, productId, quantity, totalPrice, paymentCode, discountBalance = 0) {
    const result = db.prepare(`
      INSERT INTO orders (user_id, product_id, quantity, total_price, payment_code, status, discount_balance)
      VALUES (?, ?, ?, ?, ?, 'pending', ?)
    `).run(userId, productId, quantity, totalPrice, paymentCode, discountBalance);

    return this.getById(result.lastInsertRowid);
  },

  /**
   * Get order by ID
   */
  getById(id) {
    return db.prepare(`
      SELECT o.*, p.name as product_name
      FROM orders o
      JOIN products p ON o.product_id = p.id
      WHERE o.id = ?
    `).get(id);
  },

  /**
   * Get order by payment code
   */
  getByPaymentCode(code) {
    return db.prepare(`
      SELECT o.*, p.name as product_name
      FROM orders o
      JOIN products p ON o.product_id = p.id
      WHERE o.payment_code = ?
    `).get(code);
  },

  /**
   * Get user's pending orders
   */
  getPendingByUser(userId) {
    return db.prepare(`
      SELECT o.*, p.name as product_name
      FROM orders o
      JOIN products p ON o.product_id = p.id
      WHERE o.user_id = ? AND o.status = 'pending'
      ORDER BY o.created_at DESC
    `).all(userId);
  },

  /**
   * Get user's recent orders with their associated stock data
   */
  getRecentByUser(userId, limit = 5) {
    const orders = db.prepare(`
      SELECT o.*, p.name as product_name, p.is_file
      FROM orders o
      JOIN products p ON o.product_id = p.id
      WHERE o.user_id = ?
      ORDER BY o.created_at DESC
      LIMIT ?
    `).all(userId, limit);

    // For each delivered order, fetch the keys
    orders.forEach(order => {
      if (order.status === 'delivered') {
        const stockItems = db.prepare('SELECT data FROM stock WHERE order_id = ?').all(order.id);
        order.keys = stockItems.map(s => s.data);
      } else {
        order.keys = [];
      }
    });

    return orders;
  },

  /**
   * Get order keys by ID
   */
  getOrderKeys(orderId) {
    const stockItems = db.prepare('SELECT data FROM stock WHERE order_id = ?').all(orderId);
    return stockItems.map(s => s.data);
  },

  /**
   * Get full order info including product details and keys
   */
  getByIdWithKeys(orderId) {
    const order = this.getById(orderId);
    if (!order) return null;
    
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(order.product_id);
    const keys = this.getOrderKeys(orderId);
    
    return { ...order, product, keys };
  },

  /**
   * Confirm payment and deliver products
   * Returns { success, accounts, error }
   */
  confirmAndDeliver(orderId) {
    const order = this.getById(orderId);
    if (!order) return { success: false, error: 'Đơn hàng không tồn tại' };
    if (order.status !== 'pending') return { success: false, error: 'Đơn hàng đã được xử lý' };

    // Check user balance for mixed payments
    const userService = require('./userService');
    const user = userService.get(order.user_id);
    if (order.discount_balance > 0 && (!user || user.balance < order.discount_balance)) {
      return { success: false, error: `Khách hàng không đủ số dư để thanh toán phần còn lại. Cần ${order.discount_balance}, hiện có ${user ? user.balance : 0}` };
    }

    // Get available stock
    const stock = productService.getAvailableStock(order.product_id, order.quantity);
    if (stock.length < order.quantity) {
      return { success: false, error: `Không đủ hàng. Chỉ còn ${stock.length} sản phẩm.` };
    }

    // Mark stock as sold
    const stockIds = stock.map((s) => s.id);
    productService.markSold(stockIds, order.user_id, order.id);

    // Update order status
    db.prepare(`
      UPDATE orders SET status = 'delivered', paid_at = CURRENT_TIMESTAMP, delivered_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(orderId);

    // Deduct the balance
    if (order.discount_balance > 0) {
      userService.deductBalance(order.user_id, order.discount_balance);
    }

    // Get account data
    const accounts = stock.map((s) => s.data);

    return { success: true, accounts, order };
  },

  /**
   * Mark order as paid (waiting for admin to provide account info)
   */
  markPaid(orderId) {
    const order = this.getById(orderId);
    if (!order) return { success: false, error: 'Đơn hàng không tồn tại' };
    if (order.status !== 'pending') return { success: false, error: 'Đơn hàng đã được xử lý' };

    db.prepare(`
      UPDATE orders SET status = 'paid', paid_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(orderId);

    return { success: true, order };
  },

  /**
   * Manual deliver: admin provides account data as text
   */
  manualDeliver(orderId, accountKeys = []) {
    const order = this.getById(orderId);
    if (!order) return;

    db.prepare(`
      UPDATE orders SET status = 'delivered', delivered_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(orderId);

    // Save manual keys to stock table so they appear in history
    if (accountKeys.length > 0) {
      const insert = db.prepare('INSERT INTO stock (product_id, data, is_sold, sold_to, sold_at, order_id) VALUES (?, ?, 1, ?, CURRENT_TIMESTAMP, ?)');
      const insertMany = db.transaction((keys) => {
        for (const key of keys) {
          insert.run(order.product_id, key, order.user_id, order.id);
        }
      });
      insertMany(accountKeys);
    }

    if (order.discount_balance > 0) {
      const userService = require('./userService');
      const user = userService.get(order.user_id);
      if (user && user.balance >= order.discount_balance) {
        userService.deductBalance(order.user_id, order.discount_balance);
      }
    }
  },

  /**
   * Cancel order
   */
  cancel(orderId) {
    db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ? AND status = 'pending'").run(orderId);
  },

  /**
   * Get all pending orders (for admin)
   */
  getAllPending() {
    return db.prepare(`
      SELECT o.*, p.name as product_name, u.full_name as user_name
      FROM orders o
      JOIN products p ON o.product_id = p.id
      JOIN users u ON o.user_id = u.telegram_id
      WHERE o.status = 'pending'
      ORDER BY o.created_at ASC
    `).all();
  },

  /**
   * Get stats
   */
  getStats() {
    const totalOrders = db.prepare("SELECT COUNT(*) as c FROM orders WHERE status = 'delivered'").get().c;
    const totalRevenue = db.prepare("SELECT COALESCE(SUM(total_price), 0) as s FROM orders WHERE status = 'delivered'").get().s;
    const pendingOrders = db.prepare("SELECT COUNT(*) as c FROM orders WHERE status = 'pending'").get().c;
    const totalStock = db.prepare('SELECT COUNT(*) as c FROM stock WHERE is_sold = 0').get().c;
    const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users').get().c;

    return { totalOrders, totalRevenue, pendingOrders, totalStock, totalUsers };
  },

  /**
   * Get detailed revenue report including unique buyers
   */
  getRevenueReport() {
    const report = {};
    
    const getStats = (periodSql) => {
        const stats = db.prepare(`SELECT COUNT(*) as count, COALESCE(SUM(total_price), 0) as total FROM orders WHERE status = 'delivered' AND ${periodSql}`).get();
        const buyers = db.prepare(`
            SELECT u.full_name, u.username, u.telegram_id, GROUP_CONCAT(p.name || ' (x' || o.quantity || ')', ', ') as products
            FROM orders o 
            JOIN users u ON o.user_id = u.telegram_id 
            JOIN products p ON o.product_id = p.id
            WHERE o.status = 'delivered' AND ${periodSql}
            GROUP BY u.telegram_id
        `).all();
        return { ...stats, buyers };
    };

    // Today
    report.today = getStats("date(delivered_at) = date('now')");
    
    // Yesterday
    report.yesterday = getStats("date(delivered_at) = date('now', '-1 day')");
    
    // This Week (last 7 days)
    report.thisWeek = getStats("delivered_at >= date('now', '-7 days')");
    
    // This Month (last 30 days)
    report.thisMonth = getStats("delivered_at >= date('now', '-30 days')");
    
    return report;
  },
};

module.exports = orderService;
