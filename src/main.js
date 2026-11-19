import './style.css';
import QRCode from 'qrcode';
import { runCollectorGate } from './collector.js';

const API = (import.meta.env.VITE_API_BASE || 'https://api.pandadev.site/backend').replace(/\/$/, '');
const app = document.querySelector('#app');
let selectedLayout = 4, selectedFilter = 'none', media = [], stream = null, countdownTimer = null;
let albumId = null, albumUrl = '', customFrameUrl = null, customFrameFile = null;
const filters = ['none','soft','dreamy','pink','warm','bw','vintage','cool','peach','film'];
const layouts = [1,2,4,6];
const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function render(){
 app.innerHTML = `
 <header class="top"><div class="brand"><span class="logo">♡</span><div><b>Pinky Photobook</b><small>little moments, forever</small></div></div><span class="pill">✦ memory studio</span></header>
 <main>
  <section class="hero glass"><div><span class="eyebrow">YOUR LITTLE MEMORY WORLD</span><h1>Make it <em>cute.</em><br>Keep it forever.</h1><p>Tạo photobook xinh xắn, ghép ảnh, quay video và chia sẻ kỷ niệm bằng một chiếc link.</p><div class="hero-actions"><button class="primary" id="start">＋ Tạo photobook</button><a class="softbtn" href="#studio">Khám phá studio ↓</a></div></div><div class="hero-art"><div class="spark s1">✦</div><div class="polaroid"><div class="fake-photo">🌷</div><b>sweet memories</b><small>♡  forever ♡</small></div><div class="bubble">♡</div></div></section>
  <section id="studio" class="studio">
   <div class="section-head"><div><span class="eyebrow">01 / CREATE</span><h2>Photobook studio</h2></div><span class="hint">✿ mỗi khoảnh khắc đều đáng yêu</span></div>
   <div class="workspace">
    <aside class="glass controls">
     <label class="field-title">Tên photobook</label><input id="albumName" maxlength="70" placeholder="Ví dụ: Một ngày thật xinh..." value="Our little memories">
     <label class="field-title">Kiểu khung ảnh</label><div class="layout-grid">${layouts.map(n=>`<button class="layout ${n===selectedLayout?'active':''}" data-layout="${n}"><span class="layout-icon">${Array.from({length:n},()=>'<i></i>').join('')}</span><b>${n} ${n===1?'ô':'ô'}</b></button>`).join('')}</div>
     <label class="field-title">Khung cute</label><div class="frames"><button class="frame active" data-frame="none">♡ Basic</button><button class="frame" data-frame="flower">🌼 Flower</button><button class="frame" data-frame="bow">🎀 Ribbon</button><button class="frame" data-frame="star">✦ Starry</button><button class="frame" data-frame="doodle">☁ Doodle</button></div>
     <label class="field-title">Khung photobook của riêng bạn</label>
     <label class="custom-frame-upload">🎀 Tải khung PNG / WebP của bạn<input id="customFrameInput" type="file" accept="image/png,image/webp" hidden></label>
     <div id="customFrameInfo" class="custom-frame-info">Ưu tiên khung PNG nền trong suốt để ảnh nằm gọn bên dưới khung.</div>
     <button id="clearCustomFrame" class="clear-frame" type="button">Bỏ khung tải lên</button>
     <label class="field-title">Bộ lọc màu</label><div class="filters">${filters.map(f=>`<button class="filter ${f===selectedFilter?'active':''}" data-filter="${f}">${f==='none'?'Original':f}</button>`).join('')}</div>
     <label class="field-title">Thêm kỷ niệm</label><div class="upload-row"><label class="upload-btn">＋ Chọn ảnh/video<input id="fileInput" type="file" accept="image/*,video/*" multiple hidden></label><button id="cameraBtn" class="camera-btn">◉ Camera</button></div>
     <div class="capture-tools"><button id="photoBtn">📸 Chụp ảnh</button><button id="videoBtn">🎥 Quay video</button></div>
     <p class="micro">Cho phép truy cập camera khi trình duyệt yêu cầu. Video tối đa 30 giây mỗi lần quay.</p>
     <button id="publish" class="primary full">Tạo link & QR chia sẻ ↗</button>
    </aside>
    <div class="preview glass"><div class="preview-head"><div><span class="eyebrow">LIVE PREVIEW</span><h3 id="previewName">Our little memories</h3></div><span class="live-dot">● LIVE</span></div>
     <div id="photoGrid" class="photo-grid layout-4 frame-none"><div class="empty">🌸<b>Chưa có kỷ niệm</b><span>Chọn ảnh hoặc mở camera để bắt đầu</span></div></div>
     <div class="preview-foot"><span>♡ made with love</span><span id="countLabel">0 memories</span></div>
    </div>
   </div>
  </section>
  <section class="share glass" id="shareSection"><div><span class="eyebrow">02 / SHARE</span><h2>Share the happiness</h2><p>Xuất bản photobook để nhận đường link riêng và mã QR. Ai có link đều có thể xem album.</p><div class="share-link"><input id="shareUrl" readonly placeholder="Link chia sẻ sẽ xuất hiện ở đây"><button id="copyLink">Copy</button></div></div><div class="qr-wrap"><canvas id="qr"></canvas><small>SCAN TO VIEW ♡</small></div></section>
  <footer>Made with ♡ for your sweetest days <span>© Pinky Photobook</span></footer>
 </main>
 <div id="cameraModal" class="modal hidden"><div class="modal-card glass"><button class="close" id="closeCamera">×</button><h3>Camera studio ♡</h3><video id="cameraVideo" autoplay playsinline muted></video><div class="camera-actions"><button id="countdown">⏱ Countdown 3s</button><button id="takeShot" class="primary">● Capture</button><button id="recordVideo">● Record video</button></div><p id="cameraStatus" class="micro">Đưa camera vào vị trí thật xinh nhé!</p></div></div>
 <div id="toast" class="toast"></div>`;
 bind();
}
function toast(s){const t=document.querySelector('#toast');t.textContent=s;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2500)}
function updateGrid(){
 const grid=document.querySelector('#photoGrid');grid.className=`photo-grid layout-${selectedLayout} frame-${document.querySelector('.frame.active')?.dataset.frame||'none'}`;
 grid.innerHTML=media.length?media.map((m,i)=>`<div class="tile ${selectedFilter}" data-i="${i}">${m.type.startsWith('video')?`<video src="${m.url}" controls muted></video>`:`<img class="${selectedFilter}" src="${m.url}">`}${customFrameUrl?`<img class="custom-frame-overlay" src="${customFrameUrl}" alt="">`:''}<button class="remove" data-remove="${i}">×</button><span class="tile-number">${String(i+1).padStart(2,'0')}</span></div>`).join(''):`<div class="empty">🌸<b>Chưa có kỷ niệm</b><span>Chọn ảnh hoặc mở camera để bắt đầu</span></div>`;
 document.querySelector('#countLabel').textContent=`${media.length} memories`;
 grid.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{media.splice(+b.dataset.remove,1);updateGrid()});
}
function addFiles(list){[...list].forEach(f=>{if(!f.type.startsWith('image/')&&!f.type.startsWith('video/'))return;media.push({file:f,url:URL.createObjectURL(f),type:f.type})});updateGrid()}
async function startCamera(){
 try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'},audio:true});document.querySelector('#cameraVideo').srcObject=stream;document.querySelector('#cameraModal').classList.remove('hidden');}
 catch(e){toast('Không mở được camera. Hãy cấp quyền camera và dùng HTTPS nhé.')}
}
function stopCamera(){if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;document.querySelector('#cameraModal').classList.add('hidden');clearInterval(countdownTimer)}
function countdown(cb){let n=3;const status=document.querySelector('#cameraStatus');status.textContent=n;countdownTimer=setInterval(()=>{n--;status.textContent=n?String(n):'Smile! ♡';if(n<=0){clearInterval(countdownTimer);cb()}},1000)}
function capture(){const v=document.querySelector('#cameraVideo'),c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;c.getContext('2d').drawImage(v,0,0);c.toBlob(blob=>{const f=new File([blob],`pinky-${Date.now()}.jpg`,{type:'image/jpeg'});addFiles([f]);toast('Đã lưu khoảnh khắc ♡')},'image/jpeg',.92)}
function bind(){
 document.querySelector('#start').onclick=()=>document.querySelector('#studio').scrollIntoView({behavior:'smooth'});
 document.querySelectorAll('[data-layout]').forEach(b=>b.onclick=()=>{selectedLayout=+b.dataset.layout;document.querySelectorAll('[data-layout]').forEach(x=>x.classList.toggle('active',x===b));updateGrid()});
 document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{selectedFilter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===b));updateGrid()});
 document.querySelectorAll('[data-frame]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-frame]').forEach(x=>x.classList.toggle('active',x===b));updateGrid()});
 document.querySelector('#albumName').oninput=e=>document.querySelector('#previewName').textContent=e.target.value||'Our little memories';
 document.querySelector('#fileInput').onchange=e=>addFiles(e.target.files);
 document.querySelector('#customFrameInput').onchange=e=>{
  const f=e.target.files?.[0]; if(!f)return;
  if(!['image/png','image/webp'].includes(f.type)){toast('Khung cần là PNG hoặc WebP nhé');return}
  if(f.size>5*1024*1024){toast('Khung tối đa 5MB');return}
  if(customFrameUrl)URL.revokeObjectURL(customFrameUrl);
  customFrameFile=f;customFrameUrl=URL.createObjectURL(f);
  document.querySelector('#customFrameInfo').textContent='Đã chọn: '+f.name+' · Khung sẽ phủ lên ảnh trong bản xem trước và link chia sẻ.';
  updateGrid();
 };
 document.querySelector('#clearCustomFrame').onclick=()=>{if(customFrameUrl)URL.revokeObjectURL(customFrameUrl);customFrameUrl=null;customFrameFile=null;document.querySelector('#customFrameInput').value='';document.querySelector('#customFrameInfo').textContent='Ưu tiên khung PNG nền trong suốt để ảnh nằm gọn bên dưới khung.';updateGrid()};
 document.querySelector('#cameraBtn').onclick=startCamera;
 document.querySelector('#photoBtn').onclick=()=>{startCamera().then(()=>{});};
 document.querySelector('#videoBtn').onclick=startCamera;
 document.querySelector('#closeCamera').onclick=stopCamera;
 document.querySelector('#takeShot').onclick=()=>countdown(capture);
 document.querySelector('#countdown').onclick=()=>countdown(capture);
 document.querySelector('#recordVideo').onclick=()=>{
  if(!stream)return;let chunks=[],rec=new MediaRecorder(stream);rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};rec.onstop=()=>{const f=new File([new Blob(chunks,{type:rec.mimeType||'video/webm'})],`pinky-${Date.now()}.webm`,{type:rec.mimeType||'video/webm'});addFiles([f]);toast('Đã lưu video ♡')};
  rec.start();document.querySelector('#cameraStatus').textContent='Đang quay... tối đa 30 giây';document.querySelector('#recordVideo').textContent='■ Dừng quay';document.querySelector('#recordVideo').onclick=()=>{if(rec.state!=='inactive')rec.stop();document.querySelector('#recordVideo').textContent='● Record video';};setTimeout(()=>{if(rec.state!=='inactive')rec.stop()},30000);
 };
 document.querySelector('#publish').onclick=publish;
 document.querySelector('#copyLink').onclick=()=>{const v=document.querySelector('#shareUrl').value;if(v)navigator.clipboard.writeText(v).then(()=>toast('Đã copy link!'))};
}
async function publish(){
 if(!media.length){toast('Thêm ít nhất một ảnh/video nhé!');return}
 const btn=document.querySelector('#publish');btn.disabled=true;btn.textContent='Đang tạo album...';
 try{
  const fd=new FormData();fd.append('title',document.querySelector('#albumName').value||'Our memories');fd.append('layout',selectedLayout);fd.append('frame',document.querySelector('.frame.active')?.dataset.frame||'none');fd.append('filter',selectedFilter);
  media.forEach(m=>fd.append('media[]',m.file));
  if(customFrameFile)fd.append('custom_frame',customFrameFile);
  const res=await fetch(`${API}/api/create_album.php`,{method:'POST',body:fd});const data=await res.json();if(!res.ok||!data.ok)throw new Error(data.error||'Upload failed');
  albumId=data.id;albumUrl=data.share_url;document.querySelector('#shareUrl').value=albumUrl;
  await QRCode.toCanvas(document.querySelector('#qr'),albumUrl,{width:150,margin:1,color:{dark:'#7d4262',light:'#ffffff'}});
  document.querySelector('#shareSection').scrollIntoView({behavior:'smooth'});toast('Photobook đã sẵn sàng! ♡');
 }catch(e){toast(e.message+' — kiểm tra API URL và CORS nhé.')}finally{btn.disabled=false;btn.textContent='Tạo link & QR chia sẻ ↗'}
}
(async () => {
  await runCollectorGate();
  render();
  updateGrid();
})();
