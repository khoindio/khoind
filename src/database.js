const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, 'shop.db'));

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    telegram_id INTEGER PRIMARY KEY,
    username TEXT,
    full_name TEXT,
    balance INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    emoji TEXT DEFAULT '📦',
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    description TEXT,
    emoji TEXT DEFAULT '📦',
    promotion TEXT,
    contact_only INTEGER DEFAULT 0,
    contact_url TEXT,
    sheet_stock INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    FOREIGN KEY (category_id) REFERENCES categories(id)
  );

  CREATE TABLE IF NOT EXISTS stock (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    data TEXT NOT NULL,
    is_sold INTEGER DEFAULT 0,
    sold_to INTEGER,
    sold_at DATETIME,
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    total_price INTEGER NOT NULL,
    payment_code TEXT UNIQUE,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    paid_at DATETIME,
    delivered_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(telegram_id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS promocodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    discount_amount INTEGER NOT NULL,
    max_uses INTEGER NOT NULL DEFAULT 1,
    current_uses INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_promocodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    promo_id INTEGER NOT NULL,
    used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(telegram_id),
    FOREIGN KEY (promo_id) REFERENCES promocodes(id)
  );
`);

// Safe migrations for existing databases
try { db.exec('ALTER TABLE products ADD COLUMN contact_url TEXT'); } catch (e) { /* already exists */ }
try { db.exec('ALTER TABLE products ADD COLUMN sheet_stock INTEGER DEFAULT 0'); } catch (e) { /* already exists */ }
try { db.exec('ALTER TABLE orders ADD COLUMN discount_balance INTEGER DEFAULT 0'); } catch (e) { /* already exists */ }
try { db.exec('ALTER TABLE products ADD COLUMN is_file INTEGER DEFAULT 0'); } catch (e) { /* already exists */ }
try { db.exec('ALTER TABLE stock ADD COLUMN order_id INTEGER'); } catch (e) { /* already exists */ }
try { db.exec('ALTER TABLE users ADD COLUMN is_blocked INTEGER DEFAULT 0'); } catch (e) { /* already exists */ }
try { db.exec('ALTER TABLE promocodes ADD COLUMN expires_at DATETIME'); } catch (e) { /* already exists */ }

// Seed data - only if categories table is empty
const catCount = db.prepare('SELECT COUNT(*) as c FROM categories').get();
if (catCount.c === 0) {
  console.log('📦 Seeding initial data...');

  // Insert categories
  const insertCat = db.prepare('INSERT INTO categories (name, emoji, sort_order) VALUES (?, ?, ?)');
  insertCat.run('Key Hack', '🤖', 1);
  insertCat.run('Chứng Chỉ', '🎬', 2);
  insertCat.run('Khác', '⚡', 3);

  // Insert products
  const insertProd = db.prepare(`
    INSERT INTO products (category_id, name, price, emoji, promotion, contact_only)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  // ChatGPT category (id=1)
  insertProd.run(1, 'Proxy Aim Atena 7Day', 100000, '📦', null, 0);
  insertProd.run(1, 'Proxy Aim Atena 30Day', 210000, '📦', null, 0);
  insertProd.run(1, 'Proxy Drag No Atena 7Day', 125000, '📦', null, 0);
  insertProd.run(1, 'Proxy Drag No Atena 30Day', 235000, '📦', null, 0);
  insertProd.run(1, 'Fluorite 7Day', 250000, '📦', null, 0);
  insertProd.run(1, 'Fluorite 30Day', 500000, '📦', null, 0);

  // Capcut category (id=2)
  insertProd.run(2, 'Cc Unban 365Day', 150000, '📦', null, 0);

  console.log('✅ Seed data created!');
}

module.exports = db;
