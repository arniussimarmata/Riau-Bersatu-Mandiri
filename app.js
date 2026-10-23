/* =========================================
   KONFIGURASI SUPABASE (GANTI BAGIAN INI!)
   ========================================= */
const SUPABASE_URL = 'https://xxxxxx.supabase.co'; // GANTI URL SUPABASE KAMU
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'; // GANTI ANON KEY KAMU
const PUBLIC_URL = window.location.origin + window.location.pathname;

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* =========================================
   STATE & HELPER
   ========================================= */
let allMembers = [];
let currentUser = null;

function toast(msg, type = 'success') {
    const c = document.getElementById('toast-container');
    if(!c) return alert(msg);
    const t = document.createElement('div');
    t.className = `toast ${type === 'error' ? 'error' : type === 'warn' ? 'warn' : ''}`;
    // Pastikan class tailwind kamu mendukung ini, atau gunakan inline style
    t.style.cssText = `background: ${type==='error'?'#e11d48':type==='warn'?'#d97706':'#065f46'}; color:white; padding:10px 20px; border-radius:10px; margin-top:10px; font-weight:bold; font-size:12px; display:flex; align-items:center; gap:8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); transition: opacity 0.3s;`;
    t.innerHTML = `<i class="fa-solid ${type === 'error' ? 'fa-circle-xmark' : 'fa-circle-check'}"></i> ${msg}`;
    c.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3000);
}

function switchLoginTab(tab) {
    document.getElementById('tab-btn-admin').classList.toggle('active', tab === 'admin');
    document.getElementById('tab-btn-member').classList.toggle('active', tab === 'member');
    document.getElementById('form-login-admin').classList.toggle('hidden', tab !== 'admin');
    document.getElementById('form-login-member').classList.toggle('hidden', tab !== 'member');
}

function switchAdminTab(tab) {
    document.getElementById('admin-tab-members').classList.toggle('active', tab === 'members');
    document.getElementById('admin-tab-finance').classList.toggle('active', tab === 'finance');
    document.getElementById('content-admin-members').classList.toggle('hidden', tab !== 'members');
    document.getElementById('content-admin-finance').classList.toggle('hidden', tab !== 'finance');
}

/* =========================================
   AUTH & LOGIN
   ========================================= */
async function handleLoginAdmin(e) {
    e.preventDefault();
    const email = document.getElementById('admin-email').value;
    const pass = document.getElementById('admin-pass').value;
    const btn = e.target.querySelector('button[type="submit"]');
    
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Memeriksa...';
    btn.disabled = true;

    const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
    
    btn.innerHTML = 'Masuk Pengurus';
    btn.disabled = false;

    if (error) return toast(error.message, 'error');
    
    currentUser = { type: 'admin', ...data.user };
    document.getElementById('view-login').classList.add('hidden');
    document.getElementById('view-admin-dashboard').classList.remove('hidden');
    document.getElementById('user-info-section').classList.remove('hidden');
    document.getElementById('user-info-section').classList.add('flex');
    document.getElementById('nav-username').innerText = 'Admin';
    
    loadMembers();
    toast('Login berhasil');
}

async function handleLoginMember(e) {
    e.preventDefault();
    const no = document.getElementById('member-no-id').value;
    const pin = document.getElementById('member-pin').value;
    const btn = e.target.querySelector('button[type="submit"]');

    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Memeriksa...';
    btn.disabled = true;

    // Panggil fungsi SQL RPC
    const { data, error } = await sb.rpc('member_login', { p_no: no, p_pin: pin });
    
    btn.innerHTML = 'Masuk Anggota';
    btn.disabled = false;

    if (error || !data) return toast('Nomor anggota atau PIN salah', 'error');
    
    currentUser = { type: 'member', ...data };
    localStorage.setItem('rms_token', data.token);
    
    document.getElementById('view-login').classList.add('hidden');
    document.getElementById('view-member-dashboard').classList.remove('hidden');
    document.getElementById('user-info-section').classList.remove('hidden');
    document.getElementById('user-info-section').classList.add('flex');
    document.getElementById('nav-username').innerText = data.name;
    
    renderMemberDashboard(data);
    toast('Login berhasil');
}

function logout() {
    localStorage.removeItem('rms_token');
    window.location.reload();
}

/* =========================================
   DATA ANGGOTA (LOAD & RENDER)
   ========================================= */
async function loadMembers() {
    const { data, error } = await sb.from('members_public').select('*').order('name');
    if (error) return toast('Gagal memuat data anggota', 'error');
    
    allMembers = data || [];
    
    // Isi Dropdown Unduh Satuan
    const sel = document.getElementById('select-single-member-ecard');
    if (sel) {
        sel.innerHTML = '<option value="">-- Pilih Anggota --</option>';
        allMembers.forEach(m => {
            sel.innerHTML += `<option value="${m.id}">${m.name} (${m.no_anggota})</option>`;
        });
    }

    // Render List Anggota
    const c = document.getElementById('members-list-container');
    if (c) {
        c.innerHTML = allMembers.length === 0 ? '<p class="text-xs text-slate-500">Belum ada data.</p>' : '';
        allMembers.forEach(m => {
            c.innerHTML += `
                <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl flex justify-between items-center mb-2">
                    <div>
                        <p class="font-bold text-sm text-emerald-900">${m.name}</p>
                        <p class="text-xs text-slate-500">${m.no_anggota} • ${m.role}</p>
                    </div>
                    <button onclick="downloadCardById('${m.id}')" class="bg-emerald-100 text-emerald-800 hover:bg-emerald-200 px-3 py-1.5 rounded-lg text-xs font-bold transition">
                        <i class="fa-solid fa-download"></i> PDF
                    </button>
                </div>
            `;
        });
    }
}

function renderMemberDashboard(m) {
    if(document.getElementById('member-card-name')) document.getElementById('member-card-name').innerText = m.name;
    if(document.getElementById('member-card-role')) document.getElementById('member-card-role').innerText = m.role;
    if(document.getElementById('member-card-no')) document.getElementById('member-card-no').innerText = m.no_anggota;
    if(document.getElementById('member-card-loper')) document.getElementById('member-card-loper').innerText = m.loper || '-';
}

/* =========================================
   FITUR DOWNLOAD E-CARD (PDF & ZIP)
   ========================================= */
async function downloadSelectedSingleECard() {
    const id = document.getElementById('select-single-member-ecard').value;
    if (!id) return toast('Pilih anggota terlebih dahulu!', 'warn');
    
    const m = allMembers.find(x => x.id == id);
    if (!m) return toast('Data tidak ditemukan', 'error');

    toast('Menyiapkan PDF...');
    try {
        const canvas = await buildCardCanvas(m);
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [canvas.width, canvas.height] });

        pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height);
        pdf.save(`E-Card_${m.no_anggota}_${m.name}.pdf`);
        toast('PDF berhasil diunduh');
    } catch (err) {
        toast('Gagal membuat PDF', 'error');
        console.error(err);
    }
}

async function downloadCardById(id) {
    document.getElementById('select-single-member-ecard').value = id;
    downloadSelectedSingleECard();
}

async function downloadAllECardsZip() {
    if (allMembers.length === 0) return toast('Belum ada data anggota', 'warn');
    toast(`Memproses ${allMembers.length} E-Card... Mohon tunggu.`);
    
    const { jsPDF } = window.jspdf;
    const zip = new JSZip();
    
    for (let i = 0; i < allMembers.length; i++) {
        const m = allMembers[i];
        try {
            const canvas = await buildCardCanvas(m);
            const imgData = canvas.toDataURL('image/jpeg', 0.95);
            
            // Simpan JPG
            const imgBase64 = imgData.split('base64,')[1];
            zip.file(`${m.no_anggota}_${m.name}.jpg`, imgBase64, { base64: true });

            // Simpan PDF
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [canvas.width, canvas.height] });
            pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height);
            zip.file(`${m.no_anggota}_${m.name}.pdf`, pdf.output('blob'));
        } catch (e) {
            console.error('Gagal render:', m.name);
        }
    }

    const content = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(content);
    a.download = `E-Cards_Massal_RMS.zip`;
    a.click();
    toast('ZIP Massal berhasil diunduh');
}

/* =========================================
   E-CARD CANVAS RENDERER
   ========================================= */
function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function loadImg(src) {
    return new Promise(res => {
        if (!src) return res(null);
        const i = new Image(); i.crossOrigin = "Anonymous";
        i.onload = () => res(i); i.onerror = () => res(null); i.src = src;
    });
}

function fitFont(ctx, text, weight, size, family, maxW) {
    let s = size; ctx.font = `${weight} ${s}px ${family}`;
    while (ctx.measureText(text).width > maxW && s > 18) {
        s -= 2; ctx.font = `${weight} ${s}px ${family}`;
    }
}

// Generate QR Code lewat API publik (Aman untuk Canvas Export ke PDF)
function qrDataUrl(text, size = 430) {
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}`;
}

async function buildCardCanvas(m) {
    const F = '"Plus Jakarta Sans", "Segoe UI", Arial, sans-serif';
    try { await document.fonts.load(`900 36px "Plus Jakarta Sans"`); } catch (e) {}

    const [logoImg, qrImg] = await Promise.all([
        loadImg('./logo.webp'),
        loadImg(qrDataUrl(`${PUBLIC_URL}?t=${m.token || m.no_anggota}`, 430))
    ]);

    const M = 30, W = 1080, H = 1540, PAD = 48;
    const canvas = document.createElement('canvas');
    canvas.width = W + M * 2; canvas.height = H + M * 2;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.translate(M, M); ctx.textBaseline = 'middle';

    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#1E5E3A'); g.addColorStop(0.5, '#0F3D24'); g.addColorStop(1, '#1E5E3A');
    rrect(ctx, 0, 0, W, H, 64); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(252,211,77,0.35)'; ctx.stroke();

    const lx = PAD + 72, ly = 139;
    ctx.beginPath(); ctx.arc(lx, ly, 72, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = '#FCD34D'; ctx.stroke();
    if (logoImg) {
        ctx.save(); ctx.beginPath(); ctx.arc(lx, ly, 66, 0, Math.PI * 2); ctx.clip();
        const d = 132, sc = Math.max(d / logoImg.width, d / logoImg.height);
        const w = logoImg.width * sc, h = logoImg.height * sc;
        ctx.drawImage(logoImg, lx - w / 2, ly - h / 2, w, h); ctx.restore();
    }

    ctx.textAlign = 'left'; ctx.fillStyle = '#FCD34D'; ctx.font = `800 28px ${F}`;
    ctx.fillText('KELOMPOK TANI', 236, 112);
    ctx.fillStyle = '#ffffff'; fitFont(ctx, 'RIAU MANDIRI SEJAHTERA', 900, 38, F, 570);
    ctx.fillText('RIAU MANDIRI SEJAHTERA', 236, 160);

    rrect(ctx, W - PAD - 190, ly - 36, 190, 72, 36);
    ctx.fillStyle = '#FBBF24'; ctx.fill();
    ctx.fillStyle = '#052e16'; ctx.font = `900 30px ${F}`; ctx.textAlign = 'center';
    ctx.fillText('E-CARD', W - PAD - 95, ly + 1);

    ctx.beginPath(); ctx.moveTo(PAD, 252); ctx.lineTo(W - PAD, 252);
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.stroke();

    const rows = [
        ['Nama Anggota', m.name || '-', 'name'],
        ['Jabatan', m.role || '-', 'pill'],
        ['Nomor Anggota Unik', m.no_anggota || '-', 'mono'],
        ['Wilayah', m.loper || '-', 'plain']
    ];
    
    rows.forEach(([label, val, kind], i) => {
        const y = 335 + i * 86;
        ctx.textAlign = 'left'; ctx.font = `500 34px ${F}`; ctx.fillStyle = '#A7F3D0';
        ctx.fillText(label, PAD, y);
        const maxW = (W - PAD * 2) - ctx.measureText(label).width - 50;
        const right = W - PAD; ctx.textAlign = 'right';
        
        if (kind === 'name') {
            fitFont(ctx, val, 800, 44, F, maxW); ctx.fillStyle = '#FDE68A'; ctx.fillText(val, right, y);
        } else if (kind === 'plain') {
            fitFont(ctx, val, 500, 36, F, maxW); ctx.fillStyle = '#ffffff'; ctx.fillText(val, right, y);
        } else {
            const mono = kind === 'mono';
            if (mono) { ctx.font = '700 36px "Courier New", monospace'; } 
            else { fitFont(ctx, val, 700, 34, F, maxW - 44); }
            const tw = ctx.measureText(val).width, bw = tw + 44;
            rrect(ctx, right - bw, y - 31, bw, 62, 18);
            ctx.fillStyle = mono ? 'rgba(0,0,0,0.28)' : 'rgba(255,255,255,0.12)'; ctx.fill();
            ctx.fillStyle = mono ? '#FCD34D' : '#ffffff'; ctx.fillText(val, right - 22, y);
        }
    });

    const by = 676, bh = 800;
    rrect(ctx, PAD, by, W - PAD * 2, bh, 56); ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.lineWidth = 6; ctx.strokeStyle = '#FCD34D'; ctx.stroke();

    const title = 'QR CODE IDENTITAS ANGGOTA';
    ctx.font = `800 32px ${F}`; const tw = ctx.measureText(title).width;
    const startX = (W - (tw + 52)) / 2;
    rrect(ctx, startX, by + 76 - 14, 28, 28, 6); ctx.fillStyle = '#F59E0B'; ctx.fill();
    ctx.textAlign = 'left'; ctx.fillStyle = '#1E5E3A'; ctx.fillText(title, startX + 52, by + 76);

    const fs = 510, fx = (W - fs) / 2, fy = by + 112;
    rrect(ctx, fx, fy, fs, fs, 40); ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#E2E8F0'; ctx.stroke();
    if (qrImg) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(qrImg, fx + 40, fy + 40, 430, 430);
        ctx.imageSmoothingEnabled = true;
    }

    ctx.textAlign = 'center'; ctx.fillStyle = '#64748b'; ctx.font = `500 28px ${F}`;
    ctx.fillText('Scan QR Code di atas dengan Kamera / Google Lens untuk', W / 2, fy + fs + 52);
    ctx.fillText('masuk otomatis.', W / 2, fy + fs + 90);
    ctx.fillStyle = '#94a3b8'; ctx.font = `600 25px ${F}`;
    ctx.fillText('Jaga kerahasiaan kartu ini.', W / 2, fy + fs + 134);

    return canvas;
}

/* =========================================
   AUTO LOGIN (JIKA ADA TOKEN)
   ========================================= */
window.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('rms_token');
    if (token) {
        const { data } = await sb.rpc('member_login_token', { p_token: token });
        if (data) {
            currentUser = { type: 'member', ...data };
            document.getElementById('view-login').classList.add('hidden');
            document.getElementById('view-member-dashboard').classList.remove('hidden');
            document.getElementById('user-info-section').classList.remove('hidden');
            document.getElementById('user-info-section').classList.add('flex');
            document.getElementById('nav-username').innerText = data.name;
            renderMemberDashboard(data);
        }
    }
});
