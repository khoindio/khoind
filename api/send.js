const multiparty = require('multiparty');
const fetch = require('node-fetch');
const FormData = require('form-data');

module.exports = async (req, res) => {
    const token = process.env.bot;
    const chatPhoto = process.env.yid;  // Chat ID gửi ảnh/video
    const chatText = process.env.nid;   // Chat ID gửi text (có thể dùng chung)

    if (!token || !chatPhoto) {
        return res.status(500).json({ error: "Thiếu biến môi trường (bot, yid)" });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Parse multipart form
    const form = new multiparty.Form();
    const { fields, files } = await new Promise((resolve, reject) => {
        form.parse(req, (err, fields, files) => {
            if (err) return reject(err);
            resolve({ fields, files });
        });
    });

    const caption = fields.caption ? fields.caption[0] : '';

    // Tạo FormData gửi lên Telegram
    const tgForm = new FormData();
    tgForm.append('chat_id', chatPhoto);

    let mediaCount = 0;

    // Gửi ảnh trước (nếu có)
    if (files.front) {
        tgForm.append('photo', require('fs').createReadStream(files.front[0].path), 'front.jpg');
        tgForm.append('caption', caption);  // chỉ caption cho ảnh đầu tiên
        await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: 'POST', body: tgForm });
        tgForm.delete('photo');
        tgForm.delete('caption');
        mediaCount++;
    }

    if (files.back) {
        tgForm.append('photo', require('fs').createReadStream(files.back[0].path), 'back.jpg');
        await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: 'POST', body: tgForm });
        tgForm.delete('photo');
        mediaCount++;
    }

    // Gửi video (nếu có)
    if (files.video) {
        tgForm.append('video', require('fs').createReadStream(files.video[0].path), 'video.mp4');
        tgForm.append('caption', caption);
        await fetch(`https://api.telegram.org/bot${token}/sendVideo`, { method: 'POST', body: tgForm });
        tgForm.delete('video');
        tgForm.delete('caption');
        mediaCount++;
    }

    // Nếu không có file nào, gửi text riêng
    if (mediaCount === 0) {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatText || chatPhoto, text: caption })
        });
    }

    res.status(200).json({ ok: true });
};