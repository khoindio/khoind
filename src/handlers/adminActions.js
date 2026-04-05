const config = require('../config');
const orderService = require('../services/orderService');
const productService = require('../services/productService');
const userService = require('../services/userService');
const { deliverOrder } = require('./paymentConfirm');
const { formatPrice } = require('../utils/keyboard');
const { Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');

// Admin state per user (for multi-step flows)
const adminState = {};

function isAdmin(ctx) {
    return config.ADMIN_IDS.includes(ctx.from.id);
}

function adminOnly(ctx, next) {
    if (!isAdmin(ctx)) {
        return ctx.replyWithHTML('⛔ Bạn không có quyền sử dụng lệnh này.');
    }
    return next();
}

module.exports = (bot) => {

    // ═══════════════════════════════════════
    // /admin - Admin Panel (Main Menu)
    // ═══════════════════════════════════════
    bot.command('admin', adminOnly, (ctx) => {
        const stats = orderService.getStats();
        ctx.replyWithHTML(
            `🔧 <b>ADMIN PANEL — ${config.SHOP_NAME}</b>\n\n` +
            `📊 <b>Thống kê nhanh:</b>\n` +
            `├ 👥 Users: ${stats.totalUsers}\n` +
            `├ 📦 Đơn hoàn thành: ${stats.totalOrders}\n` +
            `├ 💰 Doanh thu: ${formatPrice(stats.totalRevenue)}\n` +
            `├ ⏳ Đơn chờ: ${stats.pendingOrders}\n` +
            `└ 🏪 Tồn kho: ${stats.totalStock}\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `📦 <b>QUẢN LÝ SẢN PHẨM:</b>\n` +
            `/listproduct — Xem tất cả sản phẩm\n` +
            `/addproduct — Thêm sản phẩm mới\n` +
            `/editprice [ID] [giá] — Sửa giá\n` +
            `/editname [ID] [tên] — Sửa tên\n` +
            `/toggleproduct [ID] — Bật/tắt sản phẩm\n` +
            `/togglefile [ID] — Bật/tắt chế độ File\n` +
            `/deleteproduct [ID] — Xóa sản phẩm\n\n` +
            `📋 <b>QUẢN LÝ KHO:</b>\n` +
            `/addstock [ID] — Thêm KEY vào kho\n` +
            `/viewstock [ID] — Xem kho sản phẩm\n` +
            `/clearstock [ID] — Xóa toàn bộ kho (chưa bán)\n\n` +
            `💰 <b>ĐƠN HÀNG & THANH TOÁN:</b>\n` +
            `/pending — Xem đơn chờ thanh toán\n` +
            `/confirm [orderID] — Xác nhận & giao hàng\n` +
            `/cancelorder [orderID] — Hủy đơn\n` +
            `/orders — Xem tất cả đơn hàng\n\n` +
            `👤 <b>NGƯỜI DÙNG:</b>\n` +
            `/userinfo [ID/@user] — Tìm & quản lý user\n` +
            `/users — Xem users mới nhất\n` +
            `/send [ID/@user] [Nội dung] — Gửi thông báo tới 1 user\n` +
            `/broadcast — Gửi thông báo tới all users\n\n` +
            `🎫 <b>KHUYẾN MÃI:</b>\n` +
            `/addpromo [Mã] [Tiền] [Lượt] — Tạo mã Voucher\n\n` +
            `🏦 <b>CÀI ĐẶT:</b>\n` +
            `/setbank — Xem/Sửa thông tin ngân hàng\n` +
            `/setshop — Xem/Sửa thông tin shop\n` +
            `/setwebapp — Cài đặt link Mini App\n\n` +
            `📊 <b>BÁO CÁO & ĐỒNG BỘ:</b>\n` +
            `/report — Doanh thu chi tiết\n` +
            `/sync — Đồng bộ từ Google Sheet`,
            Markup.inlineKeyboard([
                [Markup.button.callback('📦 Sản phẩm', 'adm_products'), Markup.button.callback('⏳ Đơn chờ', 'adm_pending')],
                [Markup.button.callback('📈 Báo cáo', 'adm_report'), Markup.button.callback('👤 Tìm User', 'adm_userinfo')],
                [Markup.button.callback('🔄 Sync Sheet', 'adm_sync'), Markup.button.callback('📊 Thống kê', 'adm_stats')],
            ])
        );
    });

    // Admin button callbacks
    bot.action('adm_products', (ctx) => { if (isAdmin(ctx)) { ctx.answerCbQuery(); showProductList(ctx); } });
    bot.action('adm_pending', (ctx) => { if (isAdmin(ctx)) { ctx.answerCbQuery(); showPending(ctx); } });
    bot.action('adm_stats', (ctx) => { if (isAdmin(ctx)) { ctx.answerCbQuery(); showStats(ctx); } });
    bot.action('adm_report', (ctx) => { if (isAdmin(ctx)) { ctx.answerCbQuery(); showReport(ctx); } });
    bot.action('adm_userinfo', (ctx) => { if (isAdmin(ctx)) { ctx.answerCbQuery(); ctx.reply('🔍 Gõ <code>/userinfo [ID hoặc @username]</code> để tìm kiếm.', { parse_mode: 'HTML' }); } });
    
    bot.action('adm_sync', async (ctx) => {
        if (!isAdmin(ctx)) return;
        ctx.answerCbQuery('🔄 Đang sync...');
        await runSync(ctx);
    });

    // /report - Revenue report
    bot.command('report', adminOnly, (ctx) => {
        showReport(ctx);
    });

    function showReport(ctx) {
        const report = orderService.getRevenueReport();
        
        const formatBuyers = (buyers) => {
            if (!buyers || buyers.length === 0) return ' (Chưa có khách)';
            const names = buyers.map(b => {
                const username = b.username ? ` (@${b.username})` : '';
                return `${b.full_name}${username} (${b.products})`;
            }).join(', ');
            return `\n└ 👥 Khách: <i>${names}</i>`;
        };

        ctx.replyWithHTML(
            `📈 <b>BÁO CÁO DOANH THU</b>\n\n` +
            `📅 <b>Hôm nay:</b>\n` +
            `├ Đơn: ${report.today.count}\n` +
            `├ Tiền: <b>${formatPrice(report.today.total)}</b>` + 
            formatBuyers(report.today.buyers) + `\n\n` +

            `📅 <b>Hôm qua:</b>\n` +
            `├ Đơn: ${report.yesterday.count}\n` +
            `├ Tiền: <b>${formatPrice(report.yesterday.total)}</b>` +
            formatBuyers(report.yesterday.buyers) + `\n\n` +

            `📅 <b>7 ngày qua:</b>\n` +
            `├ Đơn: ${report.thisWeek.count}\n` +
            `├ Tiền: <b>${formatPrice(report.thisWeek.total)}</b>` +
            formatBuyers(report.thisWeek.buyers) + `\n\n` +

            `📅 <b>30 ngày qua:</b>\n` +
            `├ Đơn: ${report.thisMonth.count}\n` +
            `└ Tiền: <b>${formatPrice(report.thisMonth.total)}</b>` +
            formatBuyers(report.thisMonth.buyers)
        );
    }

    // /userinfo [ID/@username]
    bot.command('userinfo', adminOnly, (ctx) => {
        const args = ctx.message.text.split(' ');
        if (args.length < 2) return ctx.reply('Cách dùng: /userinfo [ID hoặc @username]');

        const query = args[1];
        let user = null;

        if (query.startsWith('@')) {
            user = userService.getByUsername(query);
        } else if (!isNaN(query)) {
            user = userService.get(parseInt(query));
        }

        if (!user) return ctx.reply('❌ Không tìm thấy người dùng này.');

        const fullStats = userService.getFullStats(user.telegram_id);
        
        const text = 
            `👤 <b>THÔNG TIN NGƯỜI DÙNG</b>\n\n` +
            `🆔 ID: <code>${user.telegram_id}</code>\n` +
            `👤 Tên: ${user.full_name}\n` +
            `📱 Username: ${user.username ? '@' + user.username : 'N/A'}\n` +
            `💰 Số dư: <b>${formatPrice(user.balance)}</b>\n` +
            `📦 Đã mua: ${fullStats.total_orders} đơn\n` +
            `💸 Tổng tiêu: ${formatPrice(fullStats.total_spent)}\n` +
            `📅 Tham gia: ${user.created_at}\n` +
            `🚫 Trạng thái: ${user.is_blocked ? '🔴 Đã chặn' : '🟢 Hoạt động'}`;

        ctx.replyWithHTML(text, Markup.inlineKeyboard([
            [
                Markup.button.callback('💰 Cộng tiền', `usr_add_${user.telegram_id}`),
                Markup.button.callback('💸 Trừ tiền', `usr_sub_${user.telegram_id}`)
            ],
            [
                Markup.button.callback(user.is_blocked ? '🔓 Bỏ chặn' : '🚫 Chặn User', `usr_block_${user.telegram_id}`),
                Markup.button.callback('📜 Đơn hàng', `usr_orders_${user.telegram_id}`)
            ]
        ]));
    });

    // User management actions
    bot.action(/^usr_add_(\d+)$/, (ctx) => {
        if (!isAdmin(ctx)) return;
        const targetId = ctx.match[1];
        adminState[ctx.from.id] = { action: 'user_add_bal', targetId };
        ctx.reply('👇 Nhập số tiền muốn CỘNG cho user này (Gõ /cancel để hủy):');
        ctx.answerCbQuery();
    });

    bot.action(/^usr_sub_(\d+)$/, (ctx) => {
        if (!isAdmin(ctx)) return;
        const targetId = ctx.match[1];
        adminState[ctx.from.id] = { action: 'user_sub_bal', targetId };
        ctx.reply('👇 Nhập số tiền muốn TRỪ của user này (Gõ /cancel để hủy):');
        ctx.answerCbQuery();
    });

    bot.action(/^usr_block_(\d+)$/, (ctx) => {
        if (!isAdmin(ctx)) return;
        const targetId = parseInt(ctx.match[1]);
        const newState = userService.toggleBlock(targetId);
        ctx.answerCbQuery(newState ? '🔴 Đã chặn' : '🟢 Đã bỏ chặn');
        ctx.reply(`✅ Đã ${newState ? 'CHẶN' : 'BỎ CHẶN'} người dùng <code>${targetId}</code>`, { parse_mode: 'HTML' });
    });

    bot.action(/^usr_orders_(\d+)$/, (ctx) => {
        if (!isAdmin(ctx)) return;
        const targetId = parseInt(ctx.match[1]);
        const orders = orderService.getRecentByUser(targetId, 10);
        if (orders.length === 0) return ctx.reply('User này chưa có đơn hàng nào.');
        
        let text = `📜 <b>ĐƠN HÀNG GẦN ĐÂY (ID:${targetId})</b>\n\n`;
        orders.forEach(o => {
            text += `#${o.id} | ${o.product_name} | ${formatPrice(o.total_price)} | ${o.status}\n`;
        });
        ctx.replyWithHTML(text);
        ctx.answerCbQuery();
    });

    // /sync - Manual sync from Google Sheet
    bot.command('sync', adminOnly, async (ctx) => {
        await runSync(ctx);
    });

    async function runSync(ctx) {
        const { syncFromSheet, SYNC_INTERVAL } = require('../services/sheetSync');
        if (!process.env.GOOGLE_SHEET_ID) {
            return ctx.replyWithHTML(
                `❌ <b>Chưa cài đặt Google Sheet!</b>\n\n` +
                `Thêm <code>GOOGLE_SHEET_ID</code> vào file .env\n\n` +
                `📋 Hướng dẫn:\n` +
                `1. Mở Google Sheet\n` +
                `2. File → Chia sẻ → Xuất bản lên web → Xuất bản\n` +
                `3. Copy Sheet ID từ URL:\n` +
                `   <code>docs.google.com/spreadsheets/d/<b>[SHEET_ID]</b>/edit</code>\n` +
                `4. Thêm vào .env:\n` +
                `   <code>GOOGLE_SHEET_ID=your_sheet_id</code>\n` +
                `5. Restart bot`
            );
        }

        await ctx.replyWithHTML('🔄 Đang đồng bộ từ Google Sheet...');
        const result = await syncFromSheet();

        if (result && !result.error) {
            ctx.replyWithHTML(
                `✅ <b>Đồng bộ thành công!</b>\n\n` +
                `├ ✏️ Đã cập nhật: ${result.updated} sản phẩm\n` +
                `├ ➕ Đã thêm mới: ${result.added} sản phẩm\n` +
                `└ 📊 Tổng: ${result.total} sản phẩm\n\n` +
                `🔄 Tự động sync mỗi ${SYNC_INTERVAL} phút`
            );
        } else {
            ctx.replyWithHTML(`❌ Lỗi sync: ${result?.error || 'Unknown error'}\n\n💡 Kiểm tra Sheet đã "Xuất bản lên web" chưa.`);
        }
    }

    // ═══════════════════════════════════════
    // QUẢN LÝ SẢN PHẨM
    // ═══════════════════════════════════════

    // /listproduct - List all products with IDs
    bot.command('listproduct', adminOnly, (ctx) => {
        showProductList(ctx);
    });

    // /addproduct - Add new product (interactive)
    bot.command('addproduct', adminOnly, (ctx) => {
        const argsText = ctx.message.text.replace('/addproduct', '').trim();
        const parts = argsText.split('|').map((s) => s.trim());

        if (parts.length < 3 || !parts[0]) {
            const categories = productService.getCategories();
            let catList = categories.map((c) => `  ${c.id}. ${c.emoji} ${c.name}`).join('\n');
            return ctx.replyWithHTML(
                `➕ <b>THÊM SẢN PHẨM</b>\n\n` +
                `Cách dùng:\n` +
                `<code>/addproduct catID | tên | giá</code>\n\n` +
                `Ví dụ:\n` +
                `<code>/addproduct 1 | Tên Hack | 10000</code>\n\n` +
                `📂 <b>Danh mục:</b>\n${catList}\n\n` +
                `💡 Thêm danh mục: <code>/addcategory tên | emoji</code>`
            );
        }

        const [catId, name, priceStr] = parts;
        const price = parseInt(priceStr);
        if (isNaN(price)) return ctx.reply('❌ Giá phải là số.');

        const id = productService.addProduct(parseInt(catId), name, price);
        ctx.replyWithHTML(
            `✅ Đã thêm sản phẩm:\n` +
            `├ ID: <b>#${id}</b>\n` +
            `├ Tên: ${name}\n` +
            `├ Giá: ${formatPrice(price)}\n` +
            `└ Danh mục: #${catId}\n\n` +
            `👉 Thêm kho: <code>/addstock ${id}</code>`
        );
    });

    // /addcategory - Add new category
    bot.command('addcategory', adminOnly, (ctx) => {
        const argsText = ctx.message.text.replace('/addcategory', '').trim();
        const parts = argsText.split('|').map((s) => s.trim());

        if (parts.length < 1 || !parts[0]) {
            return ctx.replyWithHTML('Cách dùng: <code>/addcategory tên | emoji</code>\nVí dụ: <code>/addcategory Tên Hack | 🎬</code>');
        }

        const name = parts[0];
        const emoji = parts[1] || '📦';
        const db = require('../database');
        const result = db.prepare('INSERT INTO categories (name, emoji, sort_order) VALUES (?, ?, ?)').run(name, emoji, 99);
        ctx.replyWithHTML(`✅ Đã thêm danh mục #${result.lastInsertRowid}: ${emoji} ${name}`);
    });

    // /editprice [ID] [price] - Edit product price
    bot.command('editprice', adminOnly, (ctx) => {
        const args = ctx.message.text.split(' ');
        if (args.length < 3) {
            return ctx.replyWithHTML('Cách dùng: <code>/editprice [productID] [giá mới]</code>\nVí dụ: <code>/editprice 1 10000</code>');
        }

        const productId = parseInt(args[1]);
        const newPrice = parseInt(args[2]);
        const product = productService.getById(productId);
        if (!product) return ctx.reply('❌ Sản phẩm không tồn tại');

        const db = require('../database');
        db.prepare('UPDATE products SET price = ? WHERE id = ?').run(newPrice, productId);
        ctx.replyWithHTML(
            `✅ Đã cập nhật giá:\n` +
            `├ Sản phẩm: ${product.name}\n` +
            `├ Giá cũ: ${formatPrice(product.price)}\n` +
            `└ Giá mới: <b>${formatPrice(newPrice)}</b>`
        );
    });

    // /editname [ID] [name] - Edit product name
    bot.command('editname', adminOnly, (ctx) => {
        const match = ctx.message.text.match(/^\/editname\s+(\d+)\s+(.+)$/);
        if (!match) {
            return ctx.replyWithHTML('Cách dùng: <code>/editname [productID] [tên mới]</code>\nVí dụ: <code>/editname 1 Tên Hack</code>');
        }

        const productId = parseInt(match[1]);
        const newName = match[2].trim();
        const product = productService.getById(productId);
        if (!product) return ctx.reply('❌ Sản phẩm không tồn tại');

        const db = require('../database');
        db.prepare('UPDATE products SET name = ? WHERE id = ?').run(newName, productId);
        ctx.replyWithHTML(
            `✅ Đã đổi tên:\n` +
            `├ Cũ: ${product.name}\n` +
            `└ Mới: <b>${newName}</b>`
        );
    });

    // /toggleproduct [ID] - Toggle product active/inactive
    bot.command('toggleproduct', adminOnly, (ctx) => {
        const args = ctx.message.text.split(' ');
        if (args.length < 2) return ctx.replyWithHTML('Cách dùng: <code>/toggleproduct [productID]</code>');

        const productId = parseInt(args[1]);
        const product = productService.getById(productId);
        if (!product) return ctx.reply('❌ Sản phẩm không tồn tại');

        const newState = product.is_active ? 0 : 1;
        const db = require('../database');
        db.prepare('UPDATE products SET is_active = ? WHERE id = ?').run(newState, productId);
        ctx.replyWithHTML(
            `✅ Sản phẩm <b>${product.name}</b>: ${newState ? '🟢 Đã BẬT' : '🔴 Đã TẮT'}`
        );
    });

    // /deleteproduct [ID] - Delete product
    bot.command('deleteproduct', adminOnly, (ctx) => {
        const args = ctx.message.text.split(' ');
        if (args.length < 2) return ctx.replyWithHTML('Cách dùng: <code>/deleteproduct [productID]</code>');

        const productId = parseInt(args[1]);
        const product = productService.getById(productId);
        if (!product) return ctx.reply('❌ Sản phẩm không tồn tại');

        const db = require('../database');
        
        try {
            // Check if product has sold items or orders
            const soldCount = db.prepare('SELECT COUNT(*) as c FROM stock WHERE product_id = ? AND is_sold = 1').get(productId).c;
            const orderCount = db.prepare('SELECT COUNT(*) as c FROM orders WHERE product_id = ?').get(productId).c;

            if (soldCount > 0 || orderCount > 0) {
                return ctx.replyWithHTML(
                    `❌ <b>Không thể xóa sản phẩm này!</b>\n\n` +
                    `Sản phẩm <b>${product.name}</b> đã có lịch sử bán hàng (${orderCount} đơn hàng).\n\n` +
                    `💡 <b>Giải pháp:</b> Hãy sử dụng lệnh <code>/toggleproduct ${productId}</code> để TẮT sản phẩm này thay vì xóa để giữ lại lịch sử đơn hàng.`
                );
            }

            // If no history, proceed to delete
            db.prepare('DELETE FROM stock WHERE product_id = ? AND is_sold = 0').run(productId);
            db.prepare('DELETE FROM products WHERE id = ?').run(productId);
            ctx.replyWithHTML(`🗑️ Đã xóa sản phẩm: <b>${product.name}</b>`);
        } catch (err) {
            console.error('Delete product error:', err);
            ctx.reply('❌ Lỗi khi xóa sản phẩm: ' + err.message);
        }
    });

    // /togglefile [ID] - Toggle file mode
    bot.command('togglefile', adminOnly, (ctx) => {
        const args = ctx.message.text.split(' ');
        if (args.length < 2) return ctx.replyWithHTML('Cách dùng: <code>/togglefile [productID]</code>');

        const productId = parseInt(args[1]);
        const product = productService.getById(productId);
        if (!product) return ctx.reply('❌ Sản phẩm không tồn tại');

        const db = require('../database');
        // Treat undefined as 0 since old products won't have it explicitly set yet if queried by object
        const currentValue = product.is_file === undefined ? 0 : product.is_file;
        const newValue = currentValue ? 0 : 1;
        db.prepare('UPDATE products SET is_file = ? WHERE id = ?').run(newValue, productId);
        
        ctx.replyWithHTML(`🔄 Đã chuyển sản phẩm <b>${product.name}</b> thành dạng: ${newValue ? '<b>FILE/ẢNH/VIDEO</b>' : '<b>TEXT/KEY</b>'}`);
    });

    // ═══════════════════════════════════════
    // QUẢN LÝ KHO
    // ═══════════════════════════════════════

    // /addstock [ID] - Add stock items
    bot.command('addstock', adminOnly, (ctx) => {
        const args = ctx.message.text.split(' ');
        if (args.length < 2) {
            // List products so admin can see IDs
            const products = productService.getAll();
            let list = products.map((p) => `  #${p.id} ${p.name} (kho: ${p.stock_count})`).join('\n');
            return ctx.replyWithHTML(
                `📦 <b>THÊM KEY VÀO KHO</b>\n\n` +
                `Cách dùng: <code>/addstock [productID]</code>\n\n` +
                `Sau đó gửi danh sách KEY (mỗi dòng 1 cái).\n\n` +
                `📋 <b>Sản phẩm:</b>\n${list}`
            );
        }

        const productId = parseInt(args[1]);
        const product = productService.getById(productId);
        if (!product) return ctx.reply('❌ Sản phẩm không tồn tại');

        // Set admin waiting state
        adminState[ctx.from.id] = { action: 'addstock', productId };
        ctx.replyWithHTML(
            `📦 Thêm KEY cho: <b>${product.name}</b>\n` +
            `📊 Kho hiện tại: ${product.stock_count}\n\n` +
            `👇 Gửi danh sách KEY ngay bây giờ (mỗi dòng 1 cái):\n\n` +
            `<i>Ví dụ:</i>\n` +
            `<code>KEY\nKEY</code>\n\n` +
            `Gõ /cancel để hủy.`
        );
    });

    // /viewstock [ID] - View stock details
    bot.command('viewstock', adminOnly, (ctx) => {
        const args = ctx.message.text.split(' ');
        if (args.length < 2) {
            const products = productService.getAll();
            let list = products.map((p) => `  #${p.id} ${p.name} — 📦 ${p.stock_count} sản phẩm`).join('\n');
            return ctx.replyWithHTML(`🏪 <b>TỒN KHO</b>\n\n${list}\n\n💡 Xem chi tiết: <code>/viewstock [ID]</code>`);
        }

        const productId = parseInt(args[1]);
        const product = productService.getById(productId);
        if (!product) return ctx.reply('❌ Sản phẩm không tồn tại');

        const db = require('../database');
        const items = db.prepare('SELECT * FROM stock WHERE product_id = ? AND is_sold = 0').all(productId);

        if (items.length === 0) {
            return ctx.replyWithHTML(`📦 <b>${product.name}</b>\n\n❌ Kho trống!`);
        }

        let text = `📦 <b>${product.name}</b> — ${product.stock_count} sản phẩm\n\n`;
        let displayedCount = 0;

        for (let i = 0; i < items.length; i++) {
            const itemText = `${i + 1}. <code>${items[i].data}</code>\n`;
            
            // Check if adding this item would exceed Telegram's 4096 char limit (with some buffer)
            if (text.length + itemText.length > 3900) {
                text += `\n⚠️ <i>Danh sách quá dài, chỉ hiển thị ${displayedCount}/${items.length} sản phẩm đầu tiên...</i>`;
                break;
            }
            
            text += itemText;
            displayedCount++;
        }

        ctx.replyWithHTML(text);
    });

    // /clearstock [ID] - Clear unsold stock
    bot.command('clearstock', adminOnly, (ctx) => {
        const args = ctx.message.text.split(' ');
        if (args.length < 2) return ctx.replyWithHTML('Cách dùng: <code>/clearstock [productID]</code>');

        const productId = parseInt(args[1]);
        const product = productService.getById(productId);
        if (!product) return ctx.reply('❌ Sản phẩm không tồn tại');

        const db = require('../database');
        const result = db.prepare('DELETE FROM stock WHERE product_id = ? AND is_sold = 0').run(productId);
        ctx.replyWithHTML(`🗑️ Đã xóa <b>${result.changes}</b> KEY chưa bán khỏi <b>${product.name}</b>`);
    });

    // ═══════════════════════════════════════
    // ĐƠN HÀNG
    // ═══════════════════════════════════════

    // /confirm {orderID}
    bot.command('confirm', adminOnly, async (ctx) => {
        const args = ctx.message.text.split(' ');
        if (args.length < 2) return ctx.reply('Cách dùng: /confirm [orderID]');

        const orderId = parseInt(args[1]);
        const result = await deliverOrder(bot, orderId);

        if (result.success) {
            ctx.replyWithHTML(`✅ Đơn <b>#${orderId}</b> đã xác nhận & giao hàng thành công!`);
        } else {
            ctx.replyWithHTML(`❌ Lỗi: ${result.error}`);
        }
    });

    // /pending - View pending orders
    bot.command('pending', adminOnly, (ctx) => {
        showPending(ctx);
    });

    // /cancelorder [ID]
    bot.command('cancelorder', adminOnly, (ctx) => {
        const args = ctx.message.text.split(' ');
        if (args.length < 2) return ctx.replyWithHTML('Cách dùng: <code>/cancelorder [orderID]</code>');

        const orderId = parseInt(args[1]);
        orderService.cancel(orderId);
        ctx.replyWithHTML(`❌ Đã hủy đơn hàng <b>#${orderId}</b>`);
    });

    // /orders - View all orders
    bot.command('orders', adminOnly, (ctx) => {
        const db = require('../database');
        const orders = db.prepare(`
      SELECT o.*, p.name as product_name, u.full_name as user_name
      FROM orders o
      JOIN products p ON o.product_id = p.id
      JOIN users u ON o.user_id = u.telegram_id
      ORDER BY o.created_at DESC
      LIMIT 20
    `).all();

        if (orders.length === 0) return ctx.reply('📋 Chưa có đơn hàng nào.');

        let text = `📋 <b>ĐƠN HÀNG GẦN ĐÂY (${orders.length})</b>\n\n`;
        const statusEmoji = { pending: '⏳', paid: '💵', delivered: '✅', cancelled: '❌' };
        orders.forEach((o) => {
            text += `${statusEmoji[o.status] || '❓'} <b>#${o.id}</b> | ${o.user_name}\n`;
            text += `  ${o.product_name} × ${o.quantity} = ${formatPrice(o.total_price)}\n`;
            text += `  📅 ${o.created_at}\n\n`;
        });

        ctx.replyWithHTML(text);
    });

    // ═══════════════════════════════════════
    // CÀI ĐẶT THANH TOÁN / SHOP
    // ═══════════════════════════════════════

    // /setbank - View or Edit bank info
    bot.command('setbank', adminOnly, (ctx) => {
        const argsText = ctx.message.text.replace('/setbank', '').trim();

        if (!argsText) {
            return ctx.replyWithHTML(
                `🏦 <b>THÔNG TIN NGÂN HÀNG</b>\n\n` +
                `├ Ngân hàng: <b>${config.BANK.NAME}</b>\n` +
                `├ BIN: <code>${config.BANK.BIN}</code>\n` +
                `├ Số TK: <code>${config.BANK.ACCOUNT}</code>\n` +
                `└ Chủ TK: <b>${config.BANK.ACCOUNT_NAME}</b>\n\n` +
                `✏️ Để sửa:\n` +
                `<code>/setbank BIN | SốTK | TênChủTK | TênNgânHàng</code>\n\n` +
                `💡 Tra mã BIN tại: vietqr.io/danh-sach-ngan-hang`
            );
        }

        const parts = argsText.split('|').map((s) => s.trim());
        if (parts.length < 4) return ctx.reply('❌ Cú pháp thiếu. Cần đủ 4 thông tin: BIN | SốTK | TênChủTK | TênNH');

        const [bin, account, accName, bankName] = parts;

        const envPath = path.join(__dirname, '..', '..', '.env');
        if (fs.existsSync(envPath)) {
            let envContent = fs.readFileSync(envPath, 'utf8');
            envContent = envContent.replace(/BANK_BIN=.*/, `BANK_BIN=${bin}`);
            envContent = envContent.replace(/BANK_ACCOUNT=.*/, `BANK_ACCOUNT=${account}`);
            envContent = envContent.replace(/BANK_ACCOUNT_NAME=.*/, `BANK_ACCOUNT_NAME=${accName}`);
            envContent = envContent.replace(/BANK_NAME=.*/, `BANK_NAME=${bankName}`);
            fs.writeFileSync(envPath, envContent);
        }

        config.BANK.BIN = bin;
        config.BANK.ACCOUNT = account;
        config.BANK.ACCOUNT_NAME = accName;
        config.BANK.NAME = bankName;

        ctx.replyWithHTML(`✅ Đã cập nhật ngân hàng:\n├ ${bankName}\n├ ${account}\n└ ${accName}`);
    });

    // /setshop - Edit shop name & support
    bot.command('setshop', adminOnly, (ctx) => {
        const argsText = ctx.message.text.replace('/setshop', '').trim();

        if (!argsText) {
            return ctx.replyWithHTML(
                `🏪 <b>THÔNG TIN SHOP</b>\n\n` +
                `├ Tên: <b>${config.SHOP_NAME}</b>\n` +
                `└ Hỗ trợ: ${config.SUPPORT_CONTACT}\n\n` +
                `✏️ Để sửa:\n` +
                `<code>/setshop tên shop | @contact_hỗ_trợ</code>`
            );
        }

        const parts = argsText.split('|').map((s) => s.trim());
        const shopName = parts[0];
        const support = parts[1] || config.SUPPORT_CONTACT;

        const envPath = path.join(__dirname, '..', '..', '.env');
        if (fs.existsSync(envPath)) {
            let envContent = fs.readFileSync(envPath, 'utf8');
            envContent = envContent.replace(/SHOP_NAME=.*/, `SHOP_NAME=${shopName}`);
            envContent = envContent.replace(/SUPPORT_CONTACT=.*/, `SUPPORT_CONTACT=${support}`);
            fs.writeFileSync(envPath, envContent);
        }

        config.SHOP_NAME = shopName;
        config.SUPPORT_CONTACT = support;

        ctx.replyWithHTML(`✅ Đã cập nhật:\n├ Shop: <b>${shopName}</b>\n└ Hỗ trợ: ${support}`);
    });

    // /setwebapp [URL] - Set Telegram Mini App URL
    bot.command('setwebapp', adminOnly, async (ctx) => {
        const url = ctx.message.text.replace('/setwebapp', '').trim();

        if (!url) {
            return ctx.replyWithHTML(
                `📱 <b>CÀI ĐẶT MINI APP</b>\n\n` +
                `URL hiện tại: <code>${config.WEBAPP_URL || 'Chưa cài đặt'}</code>\n\n` +
                `✏️ Để cài đặt link mới:\n` +
                `<code>/setwebapp https://your-domain.com/webapp</code>\n\n` +
                `💡 <i>Lưu ý: Link phải bắt đầu bằng https://</i>\n` +
                `🗑 Gõ <code>/setwebapp none</code> để xóa nút.`
            );
        }

        // Handle clear/none
        if (['none', 'clear', 'remove', 'delete'].includes(url.toLowerCase())) {
            try {
                const envPath = path.join(__dirname, '..', '..', '.env');
                if (fs.existsSync(envPath)) {
                    let envContent = fs.readFileSync(envPath, 'utf8');
                    envContent = envContent.replace(/WEBAPP_URL=.*/, `WEBAPP_URL=`);
                    fs.writeFileSync(envPath, envContent);
                }
                config.WEBAPP_URL = '';
                
                // Clear for this user specifically
                await ctx.setChatMenuButton({ type: 'default' });
                // Clear globally
                await bot.telegram.callApi('setChatMenuButton', { menu_button: { type: 'default' } });
                
                return ctx.reply('✅ Đã xóa nút Mini App!');
            } catch (err) {
                return ctx.reply('❌ Lỗi: ' + err.message);
            }
        }

        if (!url.startsWith('https://')) {
            return ctx.reply('❌ URL của Web App phải bắt đầu bằng https:// để đảm bảo bảo mật của Telegram.');
        }

        try {
            // Update .env file (Optional - might fail on Render/Cloud)
            const envPath = path.join(__dirname, '..', '..', '.env');
            if (fs.existsSync(envPath)) {
                let envContent = fs.readFileSync(envPath, 'utf8');
                if (envContent.includes('WEBAPP_URL=')) {
                    envContent = envContent.replace(/WEBAPP_URL=.*/, `WEBAPP_URL=${url}`);
                } else {
                    envContent += `\nWEBAPP_URL=${url}`;
                }
                fs.writeFileSync(envPath, envContent);
            }

            // Update running config
            config.WEBAPP_URL = url;

            const menuButton = {
                type: 'web_app',
                text: 'Mở Shop',
                web_app: { url: url }
            };

            // Set for current admin specifically
            await ctx.setChatMenuButton(menuButton);

            // Set globally
            await bot.telegram.callApi('setChatMenuButton', { menu_button: menuButton });

            ctx.replyWithHTML(`✅ <b>Thành công!</b>\nĐã cài đặt Mini App tại:\n<code>${url}</code>\n\nNút "Mở Shop" sẽ xuất hiện ở góc dưới bên trái ngay bây giờ.\n\n⚠️ <i>Lưu ý: Nếu bạn dùng Render, hãy nhớ cập nhật biến môi trường WEBAPP_URL trong Dashboard để cài đặt không bị mất khi bot restart.</i>`);
        } catch (err) {
            console.error('Failed to set WebApp:', err);
            ctx.reply('❌ Lỗi: ' + err.message);
        }
    });

    // ═══════════════════════════════════════
    // THỐNG KÊ & USERS
    // ═══════════════════════════════════════

    // /stats - Detailed stats
    bot.command('stats', adminOnly, (ctx) => {
        showStats(ctx);
    });

    // /users - List users
    bot.command('users', adminOnly, async (ctx) => {
        const db = require('../database');
        const users = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();

        if (users.length === 0) return ctx.reply('❌ Chưa có người dùng nào.');

        let header = `👥 <b>DANH SÁCH TẤT CẢ NGƯỜI DÙNG (${users.length})</b>\n\n`;
        let text = header;
        
        for (let i = 0; i < users.length; i++) {
            const u = users[i];
            let userStr = `🆔 <code>${u.telegram_id}</code> | ${u.full_name}`;
            if (u.username) userStr += ` (@${u.username})`;
            userStr += `\n  💰 ${formatPrice(u.balance)} | 📅 ${u.created_at}\n\n`;

            if ((text + userStr).length > 4000) {
                await ctx.replyWithHTML(text);
                text = userStr; // Start new message without header
            } else {
                text += userStr;
            }
        }
        
        if (text.length > 0) {
            await ctx.replyWithHTML(text);
        }
    });

    // /send [ID/@username] [Nội dung] - Gửi thông báo tới 1 user
    bot.command('send', adminOnly, async (ctx) => {
        try {
            const text = ctx.message.text.trim();
            const parts = text.split(/\s+/); // Handle multiple spaces/tabs
            
            if (parts.length < 3) {
                return ctx.replyWithHTML(
                    `⚠️ <b>CÁCH DÙNG /SEND</b>\n\n` +
                    `<code>/send [ID hoặc @username] [Nội dung]</code>\n\n` +
                    `Ví dụ:\n` +
                    `<code>/send 12345678 Chào bạn!</code>\n` +
                    `<code>/send @username Thông báo quan trọng...</code>`
                );
            }

            const query = parts[1];
            const content = parts.slice(2).join(' ');
            let user = null;

            if (query.startsWith('@')) {
                user = userService.getByUsername(query);
            } else if (!isNaN(query)) {
                user = userService.get(parseInt(query));
            }

            if (!user) {
                return ctx.reply('❌ Không tìm thấy người dùng này trong cơ sở dữ liệu.');
            }

            await bot.telegram.sendMessage(user.telegram_id, `📢 <b>THÔNG BÁO TỪ ADMIN</b>\n\n${content}`, { parse_mode: 'HTML' });
            return ctx.replyWithHTML(`✅ <b>ĐÃ GỬI XONG!</b>\n\n├ 👤 Tới: ${user.full_name} (@${user.username || 'N/A'})\n└ 🆔 ID: <code>${user.telegram_id}</code>`);
        } catch (err) {
            console.error('Error in /send command:', err);
            return ctx.reply(`❌ Lỗi: ${err.message}`);
        }
    });

    // /cancel - Cancel current admin action
    bot.command('cancel', (ctx) => {
        if (adminState[ctx.from.id]) {
            delete adminState[ctx.from.id];
            ctx.reply('❌ Đã hủy thao tác.');
        }
    });

    // ═══════════════════════════════════════
    // MULTI-STEP ADMIN FLOWS
    // ═══════════════════════════════════════
    bot.on(['text', 'document', 'photo', 'video'], async (ctx, next) => {
        if (!isAdmin(ctx)) return next();

        const state = adminState[ctx.from.id];
        if (!state) return next();

        // Handle addstock input
        if (state.action === 'addstock') {
            const product = productService.getById(state.productId);
            let itemsToAdd = [];

            if (product && product.is_file) {
                let fileId = null;
                let fileType = 'document';

                if (ctx.message.document) {
                    fileId = ctx.message.document.file_id;
                    fileType = 'document';
                } else if (ctx.message.photo) {
                    fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
                    fileType = 'photo';
                } else if (ctx.message.video) {
                    fileId = ctx.message.video.file_id;
                    fileType = 'video';
                } else if (ctx.message.text) {
                    if (ctx.message.text.startsWith('/')) return next();
                    return ctx.reply('⚠️ Sản phẩm này yêu cầu FILE, ẢNH hoặc VIDEO. Gửi file để thêm vào kho hoặc gõ /cancel để kết thúc.');
                }
                
                if (fileId) {
                    const caption = ctx.message.caption || '';
                    const stockData = caption ? `${fileType}:${fileId}|${caption}` : `${fileType}:${fileId}`;
                    itemsToAdd = [stockData];
                }
            } else {
                // Text mode
                if (!ctx.message.text) return ctx.reply('⚠️ Sản phẩm này yêu cầu văn bản/KEY. Hãy gửi nội dung text.');
                if (ctx.message.text.startsWith('/')) return next();
                
                itemsToAdd = ctx.message.text.split('\n').filter((l) => l.trim());
            }

            if (itemsToAdd.length > 0) {
                // Change action to ask for quantity
                adminState[ctx.from.id] = { 
                    action: 'addstock_qty', 
                    productId: state.productId, 
                    itemsTemplate: itemsToAdd 
                };
                
                ctx.replyWithHTML(
                    `📥 <b>ĐÃ NHẬN DỮ LIỆU (${itemsToAdd.length} mục)</b>\n\n` +
                    `Bạn muốn nhân bản số lượng này lên bao nhiêu lần?\n` +
                    `<i>(Ví dụ: Gửi 1 key và nhập 100 -> sẽ có 100 key trong kho)</i>`
                );
            }
            return;
        }

        // Handle addstock_qty input
        if (state.action === 'addstock_qty' && ctx.message.text) {
            const qty = parseInt(ctx.message.text);
            if (isNaN(qty) || qty <= 0 || qty > 1000) {
                return ctx.reply('⚠️ Vui lòng nhập một số lượng hợp lệ (từ 1 đến 1000).');
            }

            const productId = state.productId;
            const template = state.itemsTemplate;
            delete adminState[ctx.from.id];

            // Add the template QTY times
            for (let i = 0; i < qty; i++) {
                productService.addStock(productId, template);
            }

            const product = productService.getById(productId);
            ctx.replyWithHTML(
                `✅ <b>THÀNH CÔNG!</b>\n\n` +
                `├ Đã thêm: <b>${template.length * qty}</b> mục vào kho\n` +
                `├ Sản phẩm: ${product.name}\n` +
                `└ 📦 Tồn kho hiện tại: <b>${product.stock_count}</b>`
            );
            return;
        }

        // Handle broadcast text input
        if (state.action === 'broadcast' && ctx.message.text) {
            delete adminState[ctx.from.id];
            sendBroadcast(ctx, bot, ctx.message.text);
            return;
        }

        // Handle manual delivery: admin provides account info
        if (state.action === 'deliver_order' && ctx.message.text) {
            delete adminState[ctx.from.id];

            const accountData = ctx.message.text.trim();
            const accounts = accountData.split('\n').filter((l) => l.trim());

            // Mark order as delivered and save keys
            orderService.manualDeliver(state.orderId, accounts);

            // Decrease sheet_stock in DB
            const db = require('../database');
            db.prepare('UPDATE products SET sheet_stock = MAX(sheet_stock - ?, 0) WHERE id = (SELECT product_id FROM orders WHERE id = ?)').run(state.quantity, state.orderId);

            // Build success message for customer
            let customerMsg =
                `✅ <b>ĐƠN HÀNG THÀNH CÔNG!</b>\n\n` +
                `📦 ${state.productName} × ${state.quantity}\n\n` +
                `🔑 <b>Thông tin KEY:</b>\n`;

            accounts.forEach((acc, i) => {
                customerMsg += `${i + 1})\n<code>${acc}</code>\n`;
            });

            // Send to customer
            try {
                await bot.telegram.sendMessage(state.userId, customerMsg, { parse_mode: 'HTML' });
                ctx.replyWithHTML(
                    `✅ <b>Đã giao hàng đơn #${state.orderId}!</b>\n\n` +
                    `📦 ${state.productName} × ${state.quantity}\n` +
                    `👤 Đã gửi cho khách: <code>${state.userId}</code>`
                );
            } catch (err) {
                ctx.replyWithHTML(`❌ Không gửi được cho khách: ${err.message}`);
            }
            return;
        }

        // Handle user balance management
        if (state.action === 'user_add_bal' || state.action === 'user_sub_bal') {
            const amount = parseInt(ctx.message.text);
            if (isNaN(amount) || amount <= 0) return ctx.reply('❌ Vui lòng nhập số tiền hợp lệ.');
            
            delete adminState[ctx.from.id];
            const targetId = state.targetId;
            
            if (state.action === 'user_add_bal') {
                userService.addBalance(targetId, amount);
                ctx.reply(`✅ Đã CỘNG ${formatPrice(amount)} cho user ${targetId}`);
                bot.telegram.sendMessage(targetId, `💰 Bạn vừa được Admin cộng <b>${formatPrice(amount)}</b> vào số dư tài khoản.`, { parse_mode: 'HTML' }).catch(() => {});
            } else {
                const success = userService.deductBalance(targetId, amount);
                if (success) {
                    ctx.reply(`✅ Đã TRỪ ${formatPrice(amount)} của user ${targetId}`);
                    bot.telegram.sendMessage(targetId, `💸 Admin đã trừ <b>${formatPrice(amount)}</b> từ số dư tài khoản của bạn.`, { parse_mode: 'HTML' }).catch(() => {});
                } else {
                    ctx.reply('❌ User không đủ số dư để trừ.');
                }
            }
            return;
        }

        return next();
    });

    // ═══════════════════════════════════════
    // HELPER FUNCTIONS
    // ═══════════════════════════════════════

    function showProductList(ctx) {
        const db = require('../database');
        const products = db.prepare(`
      SELECT p.id as product_id, p.name, p.price, p.emoji, p.promotion, p.contact_only, p.is_active, p.category_id, p.is_file,
        c.name as cat_name, c.emoji as cat_emoji,
        (SELECT COUNT(*) FROM stock s WHERE s.product_id = p.id AND s.is_sold = 0) as stock_count
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      ORDER BY p.category_id, p.id
    `).all();

        if (products.length === 0) return ctx.reply('❌ Chưa có sản phẩm nào.');

        let text = `📦 <b>TẤT CẢ SẢN PHẨM</b>\n\n`;
        let currentCat = null;

        products.forEach((p) => {
            if (p.category_id !== currentCat) {
                currentCat = p.category_id;
                text += `\n${p.cat_emoji || '📂'} <b>${p.cat_name || 'Chung'}</b>\n`;
            }

            const status = p.is_active ? '🟢' : '🔴';
            const fileTag = p.is_file ? ' <b>[FILE]</b>' : '';
            text += `${status} <b>ID:${p.product_id}</b> | ${p.name}${fileTag}\n`;
            text += `     💰 ${formatPrice(p.price)} | 📦 Kho: ${p.stock_count}`;
            if (p.contact_only) text += ` | 💬 Liên hệ`;
            if (p.promotion) text += ` | ${p.promotion}`;
            text += `\n`;
        });

        text += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        text += `💡 Dùng ID ở trên cho các lệnh:\n`;
        text += `/addstock [ID] | /editprice [ID] [giá]\n`;
        text += `/editname [ID] [tên] | /viewstock [ID]\n`;
        text += `/togglefile [ID] — Bật/tắt chế độ gửi File`;

        ctx.replyWithHTML(text);
    }

    function showPending(ctx) {
        const orders = orderService.getAllPending();
        if (orders.length === 0) return ctx.reply('✅ Không có đơn hàng chờ!');

        let text = `⏳ <b>ĐƠN CHỜ THANH TOÁN (${orders.length})</b>\n\n`;
        orders.forEach((o) => {
            text +=
                `📌 <b>#${o.id}</b> | ${o.user_name}\n` +
                `  📦 ${o.product_name} × ${o.quantity}\n` +
                `  💰 ${formatPrice(o.total_price)}\n` +
                `  🔑 <code>${o.payment_code}</code>\n` +
                `  📅 ${o.created_at}\n` +
                `  → <code>/confirm ${o.id}</code>\n\n`;
        });

        ctx.replyWithHTML(text);
    }

    function showStats(ctx) {
        const stats = orderService.getStats();
        const db = require('../database');
        const todayOrders = db.prepare("SELECT COUNT(*) as c, COALESCE(SUM(total_price),0) as s FROM orders WHERE status='delivered' AND date(delivered_at)=date('now')").get();
        
        const todayBuyers = db.prepare(`
            SELECT u.full_name, u.username, GROUP_CONCAT(p.name || ' (x' || o.quantity || ')', ', ') as products
            FROM orders o 
            JOIN users u ON o.user_id = u.telegram_id 
            JOIN products p ON o.product_id = p.id
            WHERE o.status = 'delivered' AND date(delivered_at) = date('now')
            GROUP BY u.telegram_id
        `).all();

        const buyersText = todayBuyers.length > 0 
            ? todayBuyers.map(b => {
                const username = b.username ? ` (@${b.username})` : '';
                return `${b.full_name}${username} (${b.products})`;
            }).join(', ')
            : '(Chưa có khách)';

        ctx.replyWithHTML(
            `📊 <b>THỐNG KÊ CHI TIẾT</b>\n\n` +
            `<b>Tổng quan:</b>\n` +
            `├ 👥 Users: ${stats.totalUsers}\n` +
            `├ 📦 Đơn hoàn thành: ${stats.totalOrders}\n` +
            `├ 💰 Tổng doanh thu: ${formatPrice(stats.totalRevenue)}\n` +
            `├ ⏳ Đơn chờ: ${stats.pendingOrders}\n` +
            `└ 🏪 Tồn kho: ${stats.totalStock}\n\n` +
            `<b>Hôm nay:</b>\n` +
            `├ 📦 Đơn: ${todayOrders.c}\n` +
            `├ 💰 Doanh thu: ${formatPrice(todayOrders.s)}\n` +
            `└ 👥 Khách: <i>${buyersText}</i>`
        );
    }

    function showBank(ctx) {
        ctx.replyWithHTML(
            `🏦 <b>THÔNG TIN NGÂN HÀNG</b>\n\n` +
            `├ Ngân hàng: <b>${config.BANK.NAME}</b>\n` +
            `├ BIN: <code>${config.BANK.BIN}</code>\n` +
            `├ Số TK: <code>${config.BANK.ACCOUNT}</code>\n` +
            `└ Chủ TK: <b>${config.BANK.ACCOUNT_NAME}</b>\n\n` +
            `✏️ Sửa: <code>/setbank BIN | SốTK | TênCTK | TênNH</code>`
        );
    }

    async function sendBroadcast(ctx, bot, message) {
        const db = require('../database');
        const users = db.prepare('SELECT telegram_id FROM users').all();

        let sent = 0;
        let failed = 0;

        await ctx.reply(`📢 Đang gửi tới ${users.length} users...`);

        for (const user of users) {
            try {
                await bot.telegram.sendMessage(user.telegram_id, message, { parse_mode: 'HTML' });
                sent++;
            } catch (err) {
                failed++;
            }
        }

        ctx.replyWithHTML(`📢 <b>Đã gửi xong!</b>\n├ ✅ Thành công: ${sent}\n└ ❌ Thất bại: ${failed}`);
    }
};

// Export setAdminState so other handlers can set admin state
module.exports.setAdminState = (userId, state) => {
    adminState[userId] = state;
};
