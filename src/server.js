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
            catsHtml += '<div class="cat-pill glass" onclick="onC(' + c.id + ')" data-id="' + c.id + '">' + c.emoji + ' ' + c.name + '</div>';
        });

        // Product Cards
        let prodsHtml = '';
        products.forEach((p, i) => {
            const price = new Intl.NumberFormat('vi-VN').format(p.price) + 'đ';
            prodsHtml += 
                '<div class="card glass" data-cat="' + p.category_id + '" data-name="' + p.name.toLowerCase() + '" style="animation-delay:' + (i * 0.05) + 's">' +
                    (p.promotion ? '<div class="badge">HOT</div>' : '') +
                    '<div class="icon">' + (p.emoji || '📦') + '</div>' +
                    '<div class="name">' + p.name + '</div>' +
                    '<div class="desc">' + (p.description || 'Sản phẩm chất lượng') + '</div>' +
                    '<div class="foot">' +
                        '<div class="price">' + price + '</div>' +
                        '<button class="btn" onclick="buy(' + p.id + ')">MUA</button>' +
                    '</div>' +
                '</div>';
        });

        let h = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">';
        h += '<title>Store</title><script src="https://telegram.org/js/telegram-web-app.js"></script><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"><link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">';
        h += '<style>:root { --p: #007AFF; --s: #AF52DE; --a: #FF375F; --glass: rgba(255, 255, 255, 0.05); } body { font-family: "Plus Jakarta Sans", sans-serif; background: #000; color: #fff; margin: 0; padding-bottom: 120px; overflow-x: hidden; -webkit-font-smoothing: antialiased; }';
        h += '.mesh { position: fixed; inset: 0; z-index: -1; background: #000; overflow: hidden; } .blob { position: absolute; width: 70vw; height: 70vw; border-radius: 50%; filter: blur(100px); opacity: 0.4; animation: drift 30s infinite alternate; } .b1 { background: var(--p); top: -10%; left: -10%; } .b2 { background: var(--s); bottom: -10%; right: -15%; animation-delay: -5s; } @keyframes drift { from { transform: translate(0,0) scale(1); } to { transform: translate(15%, 15%) scale(1.2); } }';
        h += '.glass { background: var(--glass); backdrop-filter: blur(40px) saturate(200%); border: 0.5px solid rgba(255,255,255,0.12); box-shadow: inset 0 0 0 0.5px rgba(255,255,255,0.08), 0 20px 40px rgba(0,0,0,0.5); }';
        h += '.view { display: none; padding: 20px; animation: in 0.6s cubic-bezier(0.34, 1.56, 0.64, 1); } .view.active { display: block; } @keyframes in { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }';
        h += '.header { position: sticky; top: 12px; z-index: 1000; margin: 0 16px 24px; padding: 16px 24px; border-radius: 32px; display: flex; justify-content: space-between; align-items: center; } .top-bal { background: rgba(255,255,255,0.1); padding: 10px 20px; border-radius: 20px; font-weight: 900; }';
        h += '.search { background: rgba(255,255,255,0.06); border-radius: 20px; padding: 14px 24px; display: flex; align-items: center; gap: 14px; margin: 0 16px 24px; border: 0.5px solid rgba(255,255,255,0.1); } .search input { background: none; border: none; color: #fff; width: 100%; font-size: 17px; }';
        h += '.cat-scroll { display: flex; overflow-x: auto; gap: 10px; padding: 0 16px; margin-bottom: 32px; scrollbar-width: none; } .cat-pill { padding: 12px 24px; border-radius: 100px; font-size: 15px; font-weight: 700; opacity: 0.5; white-space: nowrap; } .cat-pill.active { background: #fff; color: #000; opacity: 1; }';
        h += '.card { border-radius: 40px; padding: 32px; position: relative; margin-bottom: 24px; } .badge { position: absolute; top: 24px; right: 24px; background: #FF3B30; color: #fff; font-size: 10px; font-weight: 900; padding: 5px 12px; border-radius: 100px; }';
        h += '.icon { width: 70px; height: 70px; background: rgba(255,255,255,0.05); border-radius: 20px; display: flex; align-items: center; justify-content: center; font-size: 36px; margin-bottom: 24px; } .name { font-size: 24px; font-weight: 900; margin-bottom: 8px; } .desc { font-size: 15px; opacity: 0.5; margin-bottom: 32px; line-height: 1.4; } .foot { display: flex; justify-content: space-between; align-items: center; } .price { font-size: 26px; font-weight: 900; } .btn { background: #fff; color: #000; border: none; border-radius: 20px; padding: 12px 36px; font-weight: 900; }';
        h += '.dock { position: fixed; bottom: 32px; left: 50%; transform: translateX(-50%); width: calc(100% - 48px); max-width: 440px; padding: 16px 32px; border-radius: 36px; display: flex; justify-content: space-between; align-items: center; z-index: 2000; } .dock-item { color: rgba(255,255,255,0.3); font-size: 24px; } .dock-item.active { color: #fff; } .dock-close { background: #FF3B30; width: 56px; height: 56px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 22px; }';
        h += '.modal { position: fixed; inset: 0; z-index: 3000; display: none; align-items: center; justify-content: center; padding: 24px; } .m-bg { position: absolute; inset: 0; background: rgba(0,0,0,0.9); backdrop-filter: blur(20px); } .m-box { position: relative; width: 100%; max-width: 400px; border-radius: 40px; padding: 40px; text-align: center; } .k-box { background: rgba(0,0,0,0.4); border-radius: 20px; padding: 20px; font-family: monospace; text-align: left; margin: 20px 0; color: var(--p); word-break: break-all; }</style></head><body>';
        h += '<div class="mesh"><div class="blob b1"></div><div class="blob b2"></div></div>';
        h += '<header class="header glass"><div><h2 id="greet">Xin chào</h2><p id="v-title">Khám phá</p></div><div class="top-bal" onclick="switchT(\'deposit\')"><span id="u-bal">0đ</span></div></header>';
        h += '<div id="view-discover" class="view active"><div class="search"><i class="fa-solid fa-magnifying-glass"></i><input type="text" id="q" placeholder="Tìm kiếm sản phẩm..." oninput="onQ()"></div><div class="cat-scroll"><div class="cat-pill active" data-id="all" onclick="onC(\'all\')">✨ Khám phá</div>' + catsHtml + '</div><div id="plist">' + prodsHtml + '</div></div>';
        h += '<div id="view-history" class="view"><div id="hlist"><p style="text-align:center; opacity:0.3; padding:100px 0;">Lịch sử trống.</p></div></div>';
        h += '<div id="view-deposit" class="view"><h3>Nạp Tiền</h3><div class="amt-grid"><div class="amt-btn glass" onclick="setA(50000)">50k</div><div class="amt-btn glass" onclick="setA(100000)">100k</div><div class="amt-btn glass" onclick="setA(200000)">200k</div><div class="amt-btn glass" onclick="setA(500000)">500k</div></div><input type="number" id="ain" style="width:100%; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); border-radius:24px; padding:24px; color:#fff; font-size:28px; font-weight:900; text-align:center; margin-bottom:32px;" placeholder="0đ"><button style="width:100%; background:var(--p); color:#fff; border:none; border-radius:24px; padding:20px; font-size:18px; font-weight:800; box-shadow:0 15px 30px rgba(0,122,255,0.4);" onclick="pay()">Nạp Ngay</button><div id="qrw" class="glass" style="margin-top:40px; padding:32px; border-radius:40px; text-align:center; display:none;"><img id="qri" style="width:100%; max-width:240px; border-radius:20px; margin-bottom:20px; border:8px solid #fff;"><div id="qri-info" style="font-size:15px; line-height:1.8;"></div></div></div>';
        h += '<div id="view-profile" class="view"><div class="prof-hero glass"><div class="avatar" id="u-av">?</div><div id="u-name" style="font-size:28px; font-weight:900;">Khách</div><div style="display:flex; background:rgba(255,255,255,0.1); border-radius:24px; overflow:hidden; margin-top:32px;"><div style="flex:1; padding:20px; background:rgba(0,0,0,0.25); border-right:1px solid rgba(255,255,255,0.1);"><span id="s-ord" style="display:block; font-size:20px; font-weight:900;">0</span>Đơn hàng</div><div style="flex:1; padding:20px; background:rgba(0,0,0,0.25);"><span id="s-spt" style="display:block; font-size:20px; font-weight:900;">0đ</span>Đã tiêu</div></div></div><div style="padding:0 16px;"><p style="font-size:12px; font-weight:800; color:rgba(255,255,255,0.4); text-transform:uppercase;">Mã Giảm Giá</p><div style="display:flex; gap:12px; margin-top:12px;"><input type="text" id="p-code" style="width:100%; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); border-radius:20px; padding:18px 24px; color:#fff; font-size:16px; font-weight:600;"><button class="btn" style="height:60px;" onclick="promo()">Áp Dụng</button></div><p style="font-size:12px; font-weight:800; color:rgba(255,255,255,0.4); text-transform:uppercase; margin-top:24px;">Gửi tin nhắn Hỗ trợ</p><textarea id="s-msg" style="width:100%; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); border-radius:20px; padding:18px 24px; color:#fff; font-size:15px; height:100px; resize:none; margin-top:12px;"></textarea><button style="width:100%; background:var(--s); color:#fff; border:none; border-radius:24px; padding:20px; font-size:18px; font-weight:800; margin-top:16px;" onclick="ask()">Gửi cho Admin</button></div></div>';
        h += '<nav class="dock glass"><div class="dock-item active" id="t-discover" onclick="switchT(\'discover\')"><i class="fa-solid fa-compass"></i></div><div class="dock-item" id="t-history" onclick="switchT(\'history\')"><i class="fa-solid fa-clock-rotate-left"></i></div><div class="dock-close" onclick="tg.close()"><i class="fa-solid fa-xmark"></i></div><div class="dock-item" id="t-deposit" onclick="switchT(\'deposit\')"><i class="fa-solid fa-wallet"></i></div><div class="dock-item" id="t-profile" onclick="switchT(\'profile\')"><i class="fa-solid fa-user-ninja"></i></div></nav>';
        h += '<div id="modal" class="modal"><div class="m-bg" onclick="closeM()"></div><div class="m-box glass"><h3>Chi Tiết</h3><div id="m-b" class="k-box"></div><button style="width:100%; background:#fff; color:#000; border:none; border-radius:20px; padding:16px; font-weight:900;" onclick="closeM()">Đóng</button></div></div>';
        h += '<script>const tg = window.Telegram.WebApp; tg.expand(); tg.enableClosingConfirmation(); tg.headerColor = "#000000"; tg.backgroundColor = "#000000";';
        h += 'const userId = tg.initDataUnsafe && tg.initDataUnsafe.user ? tg.initDataUnsafe.user.id : 0; const botName = "' + botUsername + '";';
        h += 'if(userId) { const u = tg.initDataUnsafe.user; document.getElementById("greet").innerText = "Chào, " + u.first_name; document.getElementById("u-name").innerText = u.first_name; document.getElementById("u-av").innerText = u.first_name.charAt(0); sync(); }';
        h += 'function switchT(t) { document.querySelectorAll(".view").forEach(v => v.classList.remove("active")); document.querySelectorAll(".dock-item").forEach(i => i.classList.remove("active")); document.getElementById("view-" + t).classList.add("active"); document.getElementById("t-" + t).classList.add("active"); const titles = {discover: "Khám phá", history: "Lịch sử", deposit: "Nạp tiền", profile: "Cá nhân"}; document.getElementById("v-title").innerText = titles[t] || t; if(t==="history") loadH(); if(t==="profile") sync(); }';
        h += 'async function sync() { if(!userId) return; try { const r = await fetch("/api/webapp/user/" + userId); const d = await r.json(); if(d.error) { document.getElementById("u-bal").innerText = "0đ"; return; } document.getElementById("u-bal").innerText = new Intl.NumberFormat("vi-VN").format(d.balance) + "đ"; document.getElementById("s-ord").innerText = d.orders; document.getElementById("s-spt").innerText = new Intl.NumberFormat("vi-VN").format(d.spent) + "đ"; } catch(e) {} }';
        h += 'async function loadH() { const l = document.getElementById("hlist"); try { const r = await fetch("/api/webapp/history/" + userId); const orders = await r.json(); if(orders.length === 0 || orders.error) { l.innerHTML = "<p style=\'opacity:0.3; padding:100px 0; text-align:center;\'>Lịch sử trống.</p>"; return; } l.innerHTML = orders.map(o => { return \'<div class="glass" style="padding:24px; border-radius:28px; margin-bottom:20px; display:flex; justify-content:space-between; align-items:center;"><div><b style="font-size:17px;">\' + o.product_name + \'</b><br><small style="opacity:0.4; text-transform:uppercase; font-weight:800; font-size:10px;">\' + o.status + \'</small></div>\' + (o.status==="delivered" ? \'<button style="background:#fff; color:#000; border:none; border-radius:12px; padding:10px 20px; font-weight:800; font-size:13px;" onclick="showK(\\\'\' + o.keys.join(\'\\\\n\') + \'\\\')">Xem KEY</button>\' : \'<b style="font-size:16px;">\' + new Intl.NumberFormat("vi-VN").format(o.total_price) + \'đ</b>\') + \'</div>\'; }).join(""); } catch(e) { l.innerHTML = "Lỗi tải lịch sử."; } }';
        h += 'function onQ() { const q = document.getElementById("q").value.toLowerCase(); document.querySelectorAll(".card").forEach(c => c.style.display = c.dataset.name.includes(q) ? "block" : "none"); }';
        h += 'function onC(id) { document.querySelectorAll(".cat-pill").forEach(p => p.classList.remove("active")); if(id!=="all") document.querySelector(".cat-pill[data-id=\'"+id+"\']").classList.add("active"); else document.querySelector(".cat-pill[data-id=\'all\']").classList.add("active"); document.querySelectorAll(".card").forEach(c => c.style.display = (id==="all" || c.dataset.cat == id) ? "block" : "none"); }';
        h += 'function setA(a) { document.getElementById("ain").value = a; pay(); } async function pay() { const a = document.getElementById("ain").value; try { const r = await fetch("/api/webapp/payment/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, amount: a }) }); const d = await r.json(); document.getElementById("qri").src = d.qrUrl; document.getElementById("qri-info").innerHTML = "Ngân hàng: <b>" + d.bankName + "</b><br>Nội dung: <b>" + d.paymentCode + "</b>"; document.getElementById("qrw").style.display = "block"; } catch(e) { tg.showAlert("Lỗi nạp tiền"); } }';
        h += 'async function promo() { const c = document.getElementById("p-code").value; try { const r = await fetch("/api/webapp/promo/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, code: c }) }); const res = await r.json(); tg.showAlert(res.msg); if(res.success) { document.getElementById("p-code").value=""; sync(); } } catch(e) { tg.showAlert("Lỗi mã giảm giá"); } }';
        h += 'async function ask() { const m = document.getElementById("s-msg").value; try { await fetch("/api/webapp/support/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, message: m, fullName: tg.initDataUnsafe.user.first_name }) }); tg.showAlert("Đã gửi!"); document.getElementById("s-msg").value=""; } catch(e) { tg.showAlert("Lỗi gửi tin nhắn"); } }';
        h += 'function buy(id) { tg.openTelegramLink("https://t.me/" + botName + "?start=buy_" + id); tg.close(); } function showK(k) { document.getElementById("m-b").innerText = k; document.getElementById("modal").style.display = "flex"; } function closeM() { document.getElementById("modal").style.display = "none"; }</script></body></html>';
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
