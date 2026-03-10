const multiparty = require('multiparty');
const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs');

module.exports = async (req, res) => {
    const token = process.env.bot;
    const chatPhoto = process.env.yid; // Chat ID nhận ảnh/video
    const chatText = process.env.nid;  // Chat ID nhận text (dự phòng)

    if (!token || !chatPhoto) {
        return res.status(500).json({ error: "Thiếu biến môi trường (bot, yid)" });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Parse multipart form từ request
    const form = new multiparty.Form();
    const { fields, files } = await new Promise((resolve, reject) => {
        form.parse(req, (err, fields, files) => {
            if (err) return reject(err);
            resolve({ fields, files });
        });
    });

    const caption = fields.caption ? fields.caption[0] : '';
    let mediaSent = false;

    // Hàm gửi ảnh lên Telegram
    const sendPhoto = async (filePath, fileName, customCaption = null) => {
        const tgForm = new FormData();
        tgForm.append('chat_id', chatPhoto);
        tgForm.append('photo', fs.createReadStream(filePath), fileName);
        if (customCaption) tgForm.append('caption', customCaption);
        await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: 'POST', body: tgForm });
    };

    // Hàm gửi video lên Telegram
    const sendVideo = async (filePath, fileName, customCaption = null) => {
        const tgForm = new FormData();
        tgForm.append('chat_id', chatPhoto);
        tgForm.append('video', fs.createReadStream(filePath), fileName);
        if (customCaption) tgForm.append('caption', customCaption);
        await fetch(`https://api.telegram.org/bot${token}/sendVideo`, { method: 'POST', body: tgForm });
    };

    try {
        // Gửi ảnh trước (có caption)
        if (files.front) {
            await sendPhoto(files.front[0].path, 'front.jpg', caption);
            mediaSent = true;
        }

        // Gửi ảnh sau (chỉ gửi caption nếu chưa có media nào được gửi)
        if (files.back) {
            await sendPhoto(files.back[0].path, 'back.jpg', mediaSent ? null : caption);
            mediaSent = true;
        }

        // Gửi video (chỉ gửi caption nếu chưa có media nào)
        if (files.video) {
            await sendVideo(files.video[0].path, 'video.mp4', mediaSent ? null : caption);
            mediaSent = true;
        }

        // Nếu không có file nào, gửi text
        if (!mediaSent) {
            await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatText || chatPhoto, text: caption })
            });
        }

        res.status(200).json({ ok: true });
    } catch (error) {
        console.error('Lỗi khi gửi lên Telegram:', error);
        res.status(500).json({ error: error.message });
    }
};
