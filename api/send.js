const { Buffer } = require('buffer');

module.exports = async (req, res) => {
    const token = process.env.BOT_TOKEN;
    const chat_id = process.env.CHAT_ID;

    if (!token || !chat_id) {
        return res.status(500).json({ error: 'Missing environment variables' });
    }

    try {
        const { type, text, photos, video, caption } = req.body;

        if (type === 'text') {
            const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id, text, parse_mode: 'HTML' })
            });
            return res.status(200).json(await r.json());
        }

        if (type === 'media') {
            const formData = new FormData();
            formData.append('chat_id', chat_id);
            const mediaGroup = photos.map((p, i) => {
                const fileKey = `photo_${i}`;
                const buffer = Buffer.from(p.data.split(',')[1], 'base64');
                const blob = new Blob([buffer], { type: 'image/jpeg' });
                formData.append(fileKey, blob, `img_${i}.jpg`);
                return { type: 'photo', media: `attach://${fileKey}`, caption: p.caption || '', parse_mode: 'HTML' };
            });
            formData.append('media', JSON.stringify(mediaGroup));
            const r = await fetch(`https://api.telegram.org/bot${token}/sendMediaGroup`, { method: 'POST', body: formData });
            return res.status(200).json(await r.json());
        }

        if (type === 'video') {
            const formData = new FormData();
            formData.append('chat_id', chat_id);
            formData.append('caption', caption || '');
            formData.append('parse_mode', 'HTML');
            
            const base64Parts = video.split(',');
            const mime = base64Parts[0].match(/:(.*?);/)[1];
            const ext = mime.split('/')[1] === 'mp4' ? 'mp4' : 'webm';
            const buffer = Buffer.from(base64Parts[1], 'base64');
            const blob = new Blob([buffer], { type: mime });
            
            formData.append('video', blob, `video_${Date.now()}.${ext}`);
            const r = await fetch(`https://api.telegram.org/bot${token}/sendVideo`, { method: 'POST', body: formData });
            return res.status(200).json(await r.json());
        }

        return res.status(400).json({ error: 'Invalid type' });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};