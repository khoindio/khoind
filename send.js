const { Buffer } = require('buffer');

module.exports = async (req, res) => {
    // Lấy biến môi trường (Cấu hình trên Vercel)
    const token = process.env.BOT_TOKEN || '8637781182:AAH3RgQ_vuSl3urLFb-5MDizgTbZnF0LQMs';
    const chat_id = process.env.CHAT_ID || '-1003479049955';

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { type, text, photos, video, caption } = req.body;

        // 1. Gửi tin nhắn văn bản
        if (type === 'text') {
            await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id, text, parse_mode: 'HTML' })
            });
            return res.status(200).json({ success: true });
        }

        // 2. Gửi nhóm ảnh (Media Group)
        if (type === 'media' && Array.isArray(photos)) {
            const formData = new FormData();
            formData.append('chat_id', chat_id);

            const mediaGroup = photos.map((p, i) => {
                const fileKey = `photo_${i}`;
                const base64Data = p.data.split(',')[1];
                const buffer = Buffer.from(base64Data, 'base64');
                const blob = new Blob([buffer], { type: 'image/jpeg' });
                
                formData.append(fileKey, blob, `image_${i}.jpg`);
                return {
                    type: 'photo',
                    media: `attach://${fileKey}`,
                    caption: p.caption || ''
                };
            });

            formData.append('media', JSON.stringify(mediaGroup));

            await fetch(`https://api.telegram.org/bot${token}/sendMediaGroup`, {
                method: 'POST',
                body: formData
            });
            return res.status(200).json({ success: true });
        }

        // 3. Gửi Video
        if (type === 'video' && video) {
            const formData = new FormData();
            formData.append('chat_id', chat_id);
            formData.append('caption', caption || '');

            const base64Data = video.split(',')[1];
            const buffer = Buffer.from(base64Data, 'base64');
            const blob = new Blob([buffer], { type: 'video/mp4' });
            
            formData.append('video', blob, 'video.mp4');

            await fetch(`https://api.telegram.org/bot${token}/sendVideo`, {
                method: 'POST',
                body: formData
            });
            return res.status(200).json({ success: true });
        }

        return res.status(400).json({ error: 'Invalid data type' });

    } catch (error) {
        console.error('Telegram API Error:', error);
        return res.status(500).json({ error: error.message });
    }
};