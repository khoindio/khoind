/**
 * Backend Proxy - Bản ổn định 2025
 * Tương thích Vercel, Node.js 18+
 */

// Cấu hình cho Vercel để cho phép nhận File (Multipart)
export const config = {
    api: {
        bodyParser: false,
    },
};

const formidable = require('formidable');
const fs = require('fs');

module.exports = async (req, res) => {
    // 1. Kiểm tra Method
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // 2. Lấy biến môi trường (Hỗ trợ cả tên cũ và mới)
    const botToken = process.env.BOT_TOKEN || process.env.bot;
    const chatId = process.env.CHAT_ID || process.env.yid || process.env.nid;

    if (!botToken || !chatId) {
        return res.status(500).json({ error: "Thanh cấu hình: Thiếu BOT_TOKEN hoặc CHAT_ID" });
    }

    const form = new formidable.IncomingForm({
        multiples: true,
        keepExtensions: true
    });

    form.parse(req, async (err, fields, files) => {
        if (err) {
            console.error("Formidable Error:", err);
            return res.status(500).json({ error: "Lỗi đọc dữ liệu từ Client" });
        }

        try {
            // Lấy Caption (Formidable v3 trả về Array)
            const caption = Array.isArray(fields.caption) ? fields.caption[0] : fields.caption;
            
            // Chuẩn bị FormData gửi tới Telegram
            const telegramFormData = new FormData();
            telegramFormData.append('chat_id', chatId);

            const mediaGroup = [];
            let fileCount = 0;

            // Duyệt qua các file gửi lên
            for (const key in files) {
                const fileList = Array.isArray(files[key]) ? files[key] : [files[key]];
                
                for (const file of fileList) {
                    const fileKey = `file_${fileCount}`;
                    
                    // Đọc file thành Buffer
                    const buffer = fs.readFileSync(file.filepath || file.path);
                    const blob = new Blob([buffer], { type: file.mimetype || file.type });
                    
                    telegramFormData.append(fileKey, blob, file.originalFilename || file.name);

                    mediaGroup.push({
                        type: (file.mimetype || file.type).includes('image') ? 'photo' : 'video',
                        media: `attach://${fileKey}`,
                        caption: fileCount === 0 ? caption : '' // Gắn text vào ảnh đầu tiên
                    });

                    fileCount++;
                }
            }

            if (mediaGroup.length > 0) {
                telegramFormData.append('media', JSON.stringify(mediaGroup));
                
                const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMediaGroup`, {
                    method: 'POST',
                    body: telegramFormData
                });

                const result = await response.json();
                return res.status(200).json(result);
            } else {
                // Nếu không có file, gửi tin nhắn văn bản
                const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chat_id: chatId, text: caption })
                });
                return res.status(200).json(await response.json());
            }

        } catch (error) {
            console.error("Telegram API Error:", error);
            return res.status(500).json({ error: error.message });
        }
    });
};
