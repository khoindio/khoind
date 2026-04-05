const express = require('express');
const config = require('./config');
const db = require('./database');
const userService = require('./services/userService');
const { formatPrice } = require('./utils/keyboard');
const path = require('path');
const fs = require('fs');

module.exports = (bot) => {
    const app = express();
    app.use(express.json());

    // Root
    app.get('/', (req, res) => {
        res.send('<h1>iOS 26 Bot is Running</h1>');
    });

    // API: User Info
    app.get('/api/webapp/user/:id', (req, res) => {
        try {
            const user = userService.get(parseInt(req.params.id));
            if (user) {
                const stats = db.prepare('SELECT COUNT(*) as orders, COALESCE(SUM(total_price), 0) as spent FROM orders WHERE user_id = ? AND status = "delivered"').get(user.telegram_id);
                res.json({
                    telegram_id: user.telegram_id,
                    full_name: user.full_name,
                    balance: user.balance,
                    orders: stats.orders,
                    spent: stats.spent
                });
            } else {
                res.status(404).json({ error: 'User not found' });
            }
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // API: History
    app.get('/api/webapp/history/:id', (req, res) => {
        try {
            const orderService = require('./services/orderService');
            const orders = orderService.getRecentByUser(parseInt(req.params.id), 30);
            res.json(orders);
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // API: Payment
    app.post('/api/webapp/payment/create', (req, res) => {
        try {
            const { userId, amount } = req.body;
            const paymentService = require('./services/paymentService');
            const payment = paymentService.generatePayment(amount, 0, userId);
            res.json(payment);
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // API: Promo
    app.post('/api/webapp/promo/apply', (req, res) => {
        try {
            const { userId, code } = req.body;
            const promoService = require('./services/promoService');
            const result = promoService.apply(userId, code);
            res.json(result);
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // API: Support
    app.post('/api/webapp/support/send', (req, res) => {
        try {
            const { userId, message, fullName } = req.body;
            const forwardMsg = '🆘 <b>HỖ TRỢ WEBAPP</b>\n👤 Từ: ' + (fullName || 'Khách') + ' [ID:' + userId + ']\n💬 Nội dung: ' + message;
            config.ADMIN_IDS.forEach(id => bot.telegram.sendMessage(id, forwardMsg, { parse_mode: 'HTML' }).catch(() => {}));
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // MAIN WEBAPP - iOS 26 LIQUID GLASS EDITION
    app.get('/webapp', (req, res) => {
        const productService = require('./services/productService');
        const categories = productService.getCategories();
        const products = productService.getAll();
        const botUsername = bot.botInfo ? bot.botInfo.username : '';

        // Category Pills
        let catsHtml = '';
        categories.forEach(c => {
            catsHtml += '<div class="cat-pill" onclick="onC(' + c.id + ')" data-id="' + c.id + '">' + c.emoji + ' ' + c.name + '</div>';
        });

        // Product Cards
        let prodsHtml = '';
        products.forEach((p, i) => {
            const price = new Intl.NumberFormat('vi-VN').format(p.price) + 'đ';
            prodsHtml += 
                '<div class="card" data-cat="' + p.category_id + '" data-name="' + p.name.toLowerCase() + '">' +
                    (p.promotion ? '<div class="badge">HOT</div>' : '') +
                    '<div class="icon">' + (p.emoji || '📦') + '</div>' +
                    '<div class="info">' +
                        '<div class="name">' + p.name + '</div>' +
                        '<div class="desc">' + (p.description || 'Sản phẩm chất lượng') + '</div>' +
                        '<div class="price">' + price + '</div>' +
                    '</div>' +
                    '<button class="btn" onclick="buy(' + p.id + ')">MUA</button>' +
                '</div>';
        });

        let h = `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<title>Store</title><script src="https://telegram.org/js/telegram-web-app.js"></script><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>:root { --bg: var(--tg-theme-bg-color, #ffffff); --text: var(--tg-theme-text-color, #000000); --hint: var(--tg-theme-hint-color, #999999); --link: var(--tg-theme-link-color, #2481cc); --btn: var(--tg-theme-button-color, #2481cc); --btn-text: var(--tg-theme-button-text-color, #ffffff); --sec-bg: var(--tg-theme-secondary-bg-color, #f0f0f0); } body { font-family: "Inter", sans-serif; background: var(--bg); color: var(--text); margin: 0; padding: 0 0 80px 0; -webkit-font-smoothing: antialiased; } * { box-sizing: border-box; }
.view { display: none; padding: 16px; animation: fade 0.3s ease; } .view.active { display: block; } @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
.header { display: flex; justify-content: space-between; align-items: center; padding: 16px 16px 8px; position: sticky; top: 0; background: var(--bg); z-index: 100; border-bottom: 1px solid var(--sec-bg); } .header h2 { margin: 0; font-size: 20px; font-weight: 700; } .header p { margin: 2px 0 0; font-size: 13px; color: var(--hint); } .top-bal { background: var(--sec-bg); padding: 6px 12px; border-radius: 16px; font-weight: 600; font-size: 14px; cursor: pointer; }
.search { background: var(--sec-bg); border-radius: 12px; padding: 10px 16px; display: flex; align-items: center; gap: 10px; margin-bottom: 16px; } .search input { background: none; border: none; outline: none; color: var(--text); width: 100%; font-size: 15px; font-family: "Inter", sans-serif; } .search input::placeholder { color: var(--hint); } .search i { color: var(--hint); }
.cat-scroll { display: flex; overflow-x: auto; gap: 8px; padding-bottom: 12px; margin-bottom: 16px; scrollbar-width: none; } .cat-scroll::-webkit-scrollbar { display: none; } .cat-pill { padding: 8px 16px; background: var(--sec-bg); border-radius: 20px; font-size: 14px; font-weight: 500; white-space: nowrap; cursor: pointer; color: var(--hint); transition: all 0.2s; } .cat-pill.active { background: var(--btn); color: var(--btn-text); }
.card { display: flex; align-items: center; padding: 12px; background: var(--bg); border: 1px solid var(--sec-bg); border-radius: 16px; margin-bottom: 12px; position: relative; gap: 12px; } .badge { position: absolute; top: -6px; right: -6px; background: #FF3B30; color: #fff; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 8px; }
.icon { width: 48px; height: 48px; min-width: 48px; background: var(--sec-bg); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px; } .info { flex: 1; } .name { font-size: 15px; font-weight: 600; margin-bottom: 2px; } .desc { font-size: 12px; color: var(--hint); margin-bottom: 4px; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; } .price { font-size: 14px; font-weight: 700; color: var(--link); } .btn { background: var(--btn); color: var(--btn-text); border: none; border-radius: 12px; padding: 8px 16px; font-weight: 600; font-size: 13px; cursor: pointer; }
.dock { position: fixed; bottom: 0; left: 0; right: 0; background: var(--sec-bg); padding: 12px 24px 24px; display: flex; justify-content: space-between; align-items: center; border-top-left-radius: 20px; border-top-right-radius: 20px; z-index: 1000; } .dock-item { color: var(--hint); font-size: 20px; padding: 8px; cursor: pointer; transition: color 0.2s; } .dock-item.active { color: var(--link); } .dock-close { background: #FF3B30; width: 44px; height: 44px; border-radius: 22px; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 18px; cursor: pointer; }
.m-item { background: var(--bg); border: 1px solid var(--sec-bg); padding: 16px; border-radius: 16px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; } .m-item b { font-size: 15px; } .m-item small { color: var(--hint); font-size: 11px; text-transform: uppercase; font-weight: 600; } .m-item .price { font-size: 15px; } .m-item .btn-sm { background: var(--sec-bg); color: var(--text); border: none; padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; }
.p-card { background: var(--bg); border: 1px solid var(--sec-bg); border-radius: 16px; padding: 20px; text-align: center; margin-bottom: 20px; } .avatar { width: 64px; height: 64px; background: var(--btn); color: var(--btn-text); border-radius: 32px; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 700; margin: 0 auto 12px; } .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 20px; } .stat-box { background: var(--sec-bg); padding: 12px; border-radius: 12px; } .stat-box b { display: block; font-size: 18px; margin-bottom: 4px; } .stat-box span { font-size: 12px; color: var(--hint); }
.input-group { margin-bottom: 16px; } .input-group label { display: block; font-size: 12px; color: var(--hint); font-weight: 600; margin-bottom: 6px; text-transform: uppercase; } .input-group input, .input-group textarea { width: 100%; background: var(--bg); border: 1px solid var(--sec-bg); color: var(--text); padding: 12px 16px; border-radius: 12px; font-size: 15px; font-family: "Inter", sans-serif; outline: none; } .input-group textarea { resize: vertical; min-height: 80px; } .btn-primary { width: 100%; background: var(--btn); color: var(--btn-text); border: none; padding: 14px; border-radius: 12px; font-size: 15px; font-weight: 600; cursor: pointer; margin-top: 8px; }
.amt-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; } .amt-btn { background: var(--sec-bg); padding: 16px; text-align: center; border-radius: 12px; font-weight: 600; cursor: pointer; border: 1px solid transparent; } .amt-btn:active { border-color: var(--btn); }
.modal { position: fixed; inset: 0; z-index: 3000; display: none; align-items: center; justify-content: center; padding: 24px; } .m-bg { position: absolute; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(5px); } .m-box { position: relative; width: 100%; max-width: 400px; background: var(--bg); border-radius: 20px; padding: 24px; text-align: center; } .k-box { background: var(--sec-bg); border-radius: 12px; padding: 16px; font-family: monospace; text-align: left; margin: 16px 0; color: var(--text); word-break: break-all; max-height: 300px; overflow-y: auto; }</style></head><body>
<header class="header"><div><h2 id="greet">Xin chào</h2><p id="v-title">Cửa Hàng</p></div><div class="top-bal" onclick="switchT('deposit')"><span id="u-bal">0đ</span></div></header>
<div id="view-discover" class="view active"><div class="search"><i class="fa-solid fa-magnifying-glass"></i><input type="text" id="q" placeholder="Tìm kiếm sản phẩm..." oninput="onQ()"></div><div class="cat-scroll"><div class="cat-pill active" data-id="all" onclick="onC('all')">Tất cả</div>${catsHtml}</div><div id="plist">${prodsHtml}</div></div>
<div id="view-history" class="view"><div id="hlist"><p style="text-align:center; color:var(--hint); padding:100px 0;">Lịch sử trống.</p></div></div>
<div id="view-deposit" class="view"><div class="input-group"><label>Chọn số tiền nạp</label><div class="amt-grid"><div class="amt-btn" onclick="setA(50000)">50.000đ</div><div class="amt-btn" onclick="setA(100000)">100.000đ</div><div class="amt-btn" onclick="setA(200000)">200.000đ</div><div class="amt-btn" onclick="setA(500000)">500.000đ</div></div><input type="number" id="ain" placeholder="Nhập số tiền khác..." style="text-align:center; font-size:20px; font-weight:600;"></div><button class="btn-primary" onclick="pay()">Tạo mã Nạp Tiền</button><div id="qrw" style="margin-top:32px; padding:24px; background:var(--sec-bg); border-radius:20px; text-align:center; display:none;"><img id="qri" style="width:100%; max-width:200px; border-radius:12px; margin-bottom:16px; border:4px solid var(--sec-bg);"><div id="qri-info" style="font-size:14px; line-height:1.6;"></div></div></div>
<div id="view-profile" class="view"><div class="p-card"><div class="avatar" id="u-av">?</div><div id="u-name" style="font-size:20px; font-weight:700;">Khách</div><div class="stats-grid"><div class="stat-box"><b id="s-ord">0</b><span>Đơn hàng</span></div><div class="stat-box"><b id="s-spt" style="color:var(--link);">0đ</b><span>Đã tiêu</span></div></div></div><div class="p-card" style="text-align:left;"><div class="input-group"><label>Mã Giảm Giá</label><div style="display:flex; gap:8px;"><input type="text" id="p-code" placeholder="Nhập mã..."><button class="btn" onclick="promo()">Áp dụng</button></div></div></div><div class="p-card" style="text-align:left;"><div class="input-group" style="margin-bottom:0;"><label>Hỗ trợ khách hàng</label><textarea id="s-msg" placeholder="Nhập nội dung cần hỗ trợ..."></textarea><button class="btn-primary" onclick="ask()">Gửi tin nhắn</button></div></div></div>
<nav class="dock"><div class="dock-item active" id="t-discover" onclick="switchT('discover')"><i class="fa-solid fa-store"></i></div><div class="dock-item" id="t-history" onclick="switchT('history')"><i class="fa-solid fa-receipt"></i></div><div class="dock-close" onclick="tg.close()"><i class="fa-solid fa-xmark"></i></div><div class="dock-item" id="t-deposit" onclick="switchT('deposit')"><i class="fa-solid fa-wallet"></i></div><div class="dock-item" id="t-profile" onclick="switchT('profile')"><i class="fa-solid fa-user"></i></div></nav>
<div id="modal" class="modal"><div class="m-bg" onclick="closeM()"></div><div class="m-box"><h3 style="margin:0 0 16px;">Chi tiết đơn hàng</h3><div id="m-b" class="k-box"></div><button class="btn-primary" onclick="closeM()">Đóng</button></div></div>
<script>
const tg = window.Telegram.WebApp; tg.expand(); tg.enableClosingConfirmation(); tg.headerColor = "bg_color"; tg.backgroundColor = "bg_color";
const userId = tg.initDataUnsafe && tg.initDataUnsafe.user ? tg.initDataUnsafe.user.id : 0; const botName = "${botUsername}";
if(userId) { const u = tg.initDataUnsafe.user; document.getElementById("greet").innerText = "Chào, " + u.first_name; document.getElementById("u-name").innerText = u.first_name; document.getElementById("u-av").innerText = u.first_name.charAt(0); sync(); }
function switchT(t) { document.querySelectorAll(".view").forEach(v => v.classList.remove("active")); document.querySelectorAll(".dock-item").forEach(i => i.classList.remove("active")); document.getElementById("view-" + t).classList.add("active"); document.getElementById("t-" + t).classList.add("active"); const titles = {discover: "Cửa Hàng", history: "Lịch Sử Mua Hàng", deposit: "Nạp Tiền", profile: "Tài Khoản"}; document.getElementById("v-title").innerText = titles[t] || t; window.scrollTo(0,0); if(t==="history") loadH(); if(t==="profile") sync(); }
async function sync() { if(!userId) return; try { const r = await fetch("/api/webapp/user/" + userId); const d = await r.json(); if(d.error) { document.getElementById("u-bal").innerText = "0đ"; return; } document.getElementById("u-bal").innerText = new Intl.NumberFormat("vi-VN").format(d.balance) + "đ"; document.getElementById("s-ord").innerText = d.orders; document.getElementById("s-spt").innerText = new Intl.NumberFormat("vi-VN").format(d.spent) + "đ"; } catch(e) {} }
async function loadH() { const l = document.getElementById("hlist"); try { const r = await fetch("/api/webapp/history/" + userId); const orders = await r.json(); if(orders.length === 0 || orders.error) { l.innerHTML = "<p style=\\'text-align:center; color:var(--hint); padding:100px 0;\\'>Lịch sử trống.</p>"; return; } l.innerHTML = orders.map(o => { return \\'<div class="m-item"><div><b>\\' + o.product_name + \\'</b><br><small>\\' + o.status + \\'</small></div>\\' + (o.status==="delivered" ? \\'<button class="btn-sm" onclick="showK(\\\\\\\'\\' + o.keys.join(\\'\\\\n\\') + \\'\\\\\\\')">Xem KEY</button>\\' : \\'<b class="price">\\' + new Intl.NumberFormat("vi-VN").format(o.total_price) + \\'đ</b>\\') + \\'</div>\\'; }).join(""); } catch(e) { l.innerHTML = "Lỗi tải lịch sử."; } }
function onQ() { const q = document.getElementById("q").value.toLowerCase(); document.querySelectorAll(".card").forEach(c => c.style.display = c.dataset.name.includes(q) ? "flex" : "none"); }
function onC(id) { document.querySelectorAll(".cat-pill").forEach(p => p.classList.remove("active")); if(id!=="all") document.querySelector(".cat-pill[data-id=\\'"+id+"\\']").classList.add("active"); else document.querySelector(".cat-pill[data-id=\\'all\\']").classList.add("active"); document.querySelectorAll(".card").forEach(c => c.style.display = (id==="all" || c.dataset.cat == id) ? "flex" : "none"); }
function setA(a) { document.getElementById("ain").value = a; pay(); } async function pay() { const a = document.getElementById("ain").value; if(!a) return tg.showAlert("Vui lòng nhập số tiền"); try { const r = await fetch("/api/webapp/payment/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, amount: a }) }); const d = await r.json(); document.getElementById("qri").src = d.qrUrl; document.getElementById("qri-info").innerHTML = "Ngân hàng: <b>" + d.bankName + "</b><br>Nội dung: <b>" + d.paymentCode + "</b>"; document.getElementById("qrw").style.display = "block"; } catch(e) { tg.showAlert("Lỗi nạp tiền"); } }
async function promo() { const c = document.getElementById("p-code").value; if(!c) return; try { const r = await fetch("/api/webapp/promo/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, code: c }) }); const res = await r.json(); tg.showAlert(res.msg); if(res.success) { document.getElementById("p-code").value=""; sync(); } } catch(e) { tg.showAlert("Lỗi mã giảm giá"); } }
async function ask() { const m = document.getElementById("s-msg").value; if(!m) return; try { await fetch("/api/webapp/support/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, message: m, fullName: tg.initDataUnsafe.user.first_name }) }); tg.showAlert("Đã gửi tin nhắn cho Admin!"); document.getElementById("s-msg").value=""; } catch(e) { tg.showAlert("Lỗi gửi tin nhắn"); } }
function buy(id) { tg.openTelegramLink("https://t.me/" + botName + "?start=buy_" + id); tg.close(); } function showK(k) { document.getElementById("m-b").innerText = k; document.getElementById("modal").style.display = "flex"; } function closeM() { document.getElementById("modal").style.display = "none"; }
</script></body></html>`;
        res.send(h);

    });

    // SePay Webhook Endpoint
    app.post('/api/webhook/sepay', (req, res) => {
        try {
            const { content, transferType, transferAmount } = req.body;
            const authHeader = req.headers['authorization'] || req.headers['x-api-key'] || req.query.apikey;
            if (config.SEPAY_API_KEY && authHeader !== 'Bearer ' + config.SEPAY_API_KEY && authHeader !== config.SEPAY_API_KEY) {
                return res.status(401).json({ success: false });
            }

            if (transferType === 'in' && transferAmount > 0) {
                const napMatch = content.match(/NAP\s+(\d+)/i);
                const dhMatch = content.match(/DH\d+/i);

                if (napMatch) {
                    const userId = parseInt(napMatch[1]);
                    const user = userService.get(userId);
                    if (user) {
                        userService.addBalance(userId, transferAmount);
                        bot.telegram.sendMessage(userId, '✅ NẠP TIỀN THÀNH CÔNG: ' + formatPrice(transferAmount)).catch(() => {});
                    }
                } else if (dhMatch) {
                    const paymentCode = dhMatch[0].toUpperCase();
                    const orderService = require('./services/orderService');
                    const order = orderService.getByPaymentCode(paymentCode);
                    if (order && order.status === 'pending') {
                        if (transferAmount >= order.total_price) {
                            require('./handlers/paymentConfirm').deliverOrder(bot, order.id);
                        }
                    }
                }
            }
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.listen(config.WEBHOOK_PORT, () => {
        console.log('🌐 Server running on port ' + config.WEBHOOK_PORT);
    });
};
