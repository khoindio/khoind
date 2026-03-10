const { Buffer } = require('buffer');

module.exports = async (req, res) => {
    // Ưu tiên biến môi trường, nếu không có mới dùng mặc định
    const token = process.env.BOT_TOKEN;
    const chat_id = process.env.CHAT_ID;

    // Log để kiểm tra biến môi trường có tồn tại không (không log giá trị thật để bảo mật)
    console.log('Environment Check:', { 
        hasToken: !!token, 
        hasChatId: !!chat_id,
        method: req.method 
    });

    if (!token || !chat_id) {
        return res.status(500).json({ error: 'Thiếu biến môi trường BOT_TOKEN hoặc CHAT_ID' });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { type, text, photos, video, caption } = req.body;

        if (type === 'text') {
            const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id, text, parse_mode: 'HTML' })
            });
            const d = await r.json();
            return res.status(200).json(d);
        }

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

            const r = await fetch(`https://api.telegram.org/bot${token}/sendMediaGroup`, {
                method: 'POST',
                body: formData
            });
            const d = await r.json();
            return res.status(200).json(d);
        }

        if (type === 'video' && video) {
            const formData = new FormData();
            formData.append('chat_id', chat_id);
            formData.append('caption', caption || '');

            const base64Data = video.split(',')[1];
            const buffer = Buffer.from(base64Data, 'base64');
            const blob = new Blob([buffer], { type: 'video/mp4' });
            formData.append('video', blob, 'video.mp4');

            const r = await fetch(`https://api.telegram.org/bot${token}/sendVideo`, {
                method: 'POST',
                body: formData
            });
            const d = await r.json();
            return res.status(200).json(d);
        }

        return res.status(400).json({ error: 'Type không hợp lệ' });

    } catch (error) {
        console.error('Telegram API Error:', error);
        return res.status(500).json({ error: error.message });
    }
};