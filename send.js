/**
 * Backend Proxy - Hợp nhất Media Group gửi Telegram
 * Hỗ trợ gửi đồng thời Ảnh, Video và Caption
 */

const formidable = require('formidable');
const fs = require('fs');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const form = new formidable.IncomingForm();
    
    form.parse(req, async (err, fields, files) => {
        if (err) return res.status(500).json({ error: "Lỗi xử lý Form dữ liệu" });

        const botToken = process.env.BOT_TOKEN || process.env.bot;
        const chatId = process.env.CHAT_ID || process.env.yid || process.env.nid;
        const caption = fields.caption;

        if (!botToken || !chatId) {
            return res.status(500).json({ error: "Thiếu biến môi trường (BOT_TOKEN, CHAT_ID)" });
        }

        try {
            const formData = new FormData();
            formData.append('chat_id', chatId);

            const mediaGroup = [];
            let index = 0;

            // Xử lý danh sách các file (Ảnh/Video)
            for (const key in files) {
                const file = Array.isArray(files[key]) ? files[key][0] : files[key];
                const fileKey = `file_${index}`;
                
                // Đọc file sang Buffer và tạo Blob
                const buffer = fs.readFileSync(file.filepath || file.path);
                const blob = new Blob([buffer], { type: file.mimetype || file.type });
                
                formData.append(fileKey, blob, file.originalFilename || file.name);

                mediaGroup.push({
                    type: (file.mimetype || file.type).includes('image') ? 'photo' : 'video',
                    media: `attach://${fileKey}`,
                    caption: index === 0 ? (Array.isArray(caption) ? caption[0] : caption) : ''
                });

                index++;
            }

            if (mediaGroup.length > 0) {
                // Gửi album ảnh/video
                formData.append('media', JSON.stringify(mediaGroup));
                const r = await fetch(`https://api.telegram.org/bot${botToken}/sendMediaGroup`, {
                    method: 'POST',
                    body: formData
                });
                return res.status(200).json(await r.json());
            } else {
                // Gửi tin nhắn văn bản nếu không có media
                const r = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chat_id: chatId, text: caption })
                });
                return res.status(200).json(await r.json());
            }

        } catch (e) {
            console.error("Lỗi Telegram API:", e);
            return res.status(500).json({ error: e.message });
        }
    });
};
