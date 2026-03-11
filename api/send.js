module.exports = async (req, res) => {
    const token = process.env.bot;    
    const chatPhoto = process.env.yid; 
    const chatText = process.env.nid;  

    if (!token || !chatPhoto || !chatText) {
        return res.status(500).json({ error: "Thieu bien moi truong (bot, yid, nid)" });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { type, media, text, caption } = req.body;

        // Xử lý gửi Text
        if (type === 'text') {
            const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatText, text }) 
            });
            return res.status(200).json(await r.json());
        }

        // Xử lý gửi Ảnh (Media Group)
        if (type === 'media' && Array.isArray(media)) {
            const formData = new FormData();
            formData.append('chat_id', chatPhoto); 

            const telegramMediaArray = media.map((item, index) => {
                const fileKey = `photo${index}`;
                
                const base64Data = item.media.split(',')[1];
                const buffer = Buffer.from(base64Data, 'base64');
                const blob = new Blob([buffer], { type: 'image/jpeg' });

                formData.append(fileKey, blob, `image${index}.jpg`);

                return {
                    type: 'photo',
                    media: `attach://${fileKey}`,
                    caption: item.caption || ''
                };
            });

            formData.append('media', JSON.stringify(telegramMediaArray));

            const r = await fetch(`https://api.telegram.org/bot${token}/sendMediaGroup`, {
                method: 'POST',
                body: formData
            });
            return res.status(200).json(await r.json());
        }

        // Xử lý gửi Video (Nhận từ luồng mới thêm vào)
        if (type === 'video' && media) {
            const formData = new FormData();
            formData.append('chat_id', chatPhoto);
            formData.append('caption', caption || '');
            
            const base64Data = media.split(',')[1];
            const buffer = Buffer.from(base64Data, 'base64');
            const blob = new Blob([buffer], { type: 'video/mp4' });
            
            formData.append('video', blob, 'video.mp4');

            const r = await fetch(`https://api.telegram.org/bot${token}/sendVideo`, {
                method: 'POST',
                body: formData
            });
            return res.status(200).json(await r.json());
        }

        return res.status(400).json({ error: "Data loi" });

    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};
