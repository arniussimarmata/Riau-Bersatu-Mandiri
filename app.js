'use strict';

/* =========================================================
   RMS - Kelompok Tani Riau Mandiri Sejahtera
   Terhubung ke skema Supabase baru (RLS + Auth)
   ========================================================= */

const SUPABASE_URL = "https://hihhduyzosdrzbvtxsts.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_FR47_uA2_HAesqrPGvzmoA_n0KL358W";
const PUBLIC_URL = "https://Kelompoktani.github.io/Riau-Mandiri-Sejaterah/";

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let me = null;            // { role:'admin'|'member', ... }
let members = [];         // khusus admin
let transactions = [];    // khusus admin
let logoSrcCache = null;

/* ---------- Helper umum ---------- */
const $ = (id) => document.getElementById(id);

function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function fmtRp(n) { return 'Rp ' + (Number(n) || 0).toLocaleString('id-ID'); }
function fmtDate(iso) {
    return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}
function monthKey(iso) {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function one(x) { return Array.isArray(x) ? (x[0] || {}) : (x || {}); }
const privOf = (m) => one(m.members_private);
const authOf = (m) => one(m.members_auth);

function toast(msg, type = 'success') {
    const c = $('toast-container');
    if (!c) return;
    const t = document.createElement('div');
    t.className = 'toast' + (type !== 'success' ? ' ' + type : '');
    const icon = type === 'error' ? 'fa-circle-xmark' : type === 'warn' ? 'fa-triangle-exclamation' : 'fa-circle-check';
    t.innerHTML = `<i class="fa-solid ${icon}"></i><span>${esc(msg)}</span>`;
    c.appendChild(t);
    setTimeout(() => {
        t.style.opacity = '0';
        t.style.transform = 'translateY(20px)';
        setTimeout(() => t.remove(), 300);
    }, 3000);
}

function setSync(text, ok) {
    const el = $('sync-text');
    if (el) el.innerText = text;
    const b = $('sync-badge');
    if (b) {
        b.className = (ok
            ? 'bg-emerald-950/50 border-amber-300/40 text-amber-200'
            : 'bg-amber-900/50 border-amber-400/40 text-amber-100')
            + ' hover:opacity-90 border text-[10px] sm:text-xs px-2.5 py-1.5 rounded-full font-semibold shadow backdrop-blur-sm transition active:scale-95 whitespace-nowrap';
    }
}

function setBusy(btn, busy, text) {
    if (!btn) return;
    if (busy) { btn.dataset.old = btn.innerHTML; btn.innerText = text || 'Memproses…'; btn.disabled = true; }
    else { btn.innerHTML = btn.dataset.old || btn.innerHTML; btn.disabled = false; }
}

function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function friendlyError(err) {
    if (!err) return 'Terjadi kesalahan';
    if (err.code === '23505') return 'NIK atau nomor anggota sudah terdaftar';
    if (err.code === '23514') return 'Data tidak sesuai aturan (cek NIK 16 digit / jumlah)';
    if (err.code === '42501') return 'Tidak punya izin. Pastikan login sebagai pengurus';
    return err.message || 'Terjadi kesalahan';
}

/* ---------- Inisialisasi ---------- */
window.addEventListener('load', init);

async function init() {
    setSync('Menghubungkan…', false);
    try {
        const token = new URLSearchParams(window.location.search).get('t');
        if (token) window.history.replaceState({}, document.title, window.location.pathname);

        if (token && UUID_RE.test(token)) {
            const { data, error } = await db.rpc('member_login_token', { p_token: token });
            if (!error && data) {
                await enterMember(data);
                toast(`Login otomatis berhasil: ${data.name}`);
                return;
            }
            toast('QR Code tidak valid', 'error');
        }

        const { data: sess } = await db.auth.getSession();
        if (sess && sess.session) {
            const ok = await enterAdmin(sess.session.user);
            if (ok) return;
        }

        const saved = sessionStorage.getItem('rms_member');
        if (saved) {
            try { await enterMember(JSON.parse(saved)); return; } catch (e) { sessionStorage.removeItem('rms_member'); }
        }
        setSync('Siap', true);
    } catch (err) {
        console.error(err);
        setSync('Offline', false);
    }
}

async function syncCloudData() {
    if (!me) { setSync('Siap', true); return; }
    setSync('Menyinkronkan…', false);
    try {
        if (me.role === 'admin') await loadAdminData();
        else await loadMemberSummary();
        renderApp();
        setSync('Cloud Online', true);
    } catch (err) {
        console.error(err);
        setSync('Offline', false);
        toast('Gagal sinkronisasi: ' + friendlyError(err), 'error');
    }
}

/* ---------- Login / Logout ---------- */
function switchLoginTab(type) {
    const aBtn = $('tab-btn-admin'), mBtn = $('tab-btn-member');
    if (type === 'admin') {
        aBtn.classList.add('active'); mBtn.classList.remove('active');
        $('form-login-admin').classList.remove('hidden'); $('form-login-member').classList.add('hidden');
    } else {
        mBtn.classList.add('active'); aBtn.classList.remove('active');
        $('form-login-member').classList.remove('hidden'); $('form-login-admin').classList.add('hidden');
    }
}

async function handleLoginAdmin(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const email = $('admin-email').value.trim().toLowerCase();
    const password = $('admin-pass').value;
    setBusy(btn, true, 'Masuk…');
    try {
        const { data, error } = await db.auth.signInWithPassword({ email, password });
        if (error || !data.user) { toast('Email atau Kata Sandi salah', 'error'); return; }
        const ok = await enterAdmin(data.user);
        if (!ok) toast('Akun ini bukan pengurus yang terdaftar', 'error');
        else { $('admin-pass').value = ''; toast('Berhasil masuk sebagai Pengurus'); }
    } finally {
        setBusy(btn, false);
    }
}

async function enterAdmin(user) {
    const { data: adm } = await db.from('admins').select('name').eq('user_id', user.id).maybeSingle();
    if (!adm) { await db.auth.signOut(); return false; }
    me = { role: 'admin', name: adm.name, userId: user.id };
    await loadAdminData();
    renderApp();
    setSync('Cloud Online', true);
    return true;
}

async function handleLoginMember(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const no = $('member-no-id').value.trim().toUpperCase();
    const pin = $('member-pin').value.trim();
    setBusy(btn, true, 'Masuk…');
    try {
        const { data, error } = await db.rpc('member_login', { p_no: no, p_pin: pin || null });
        if (error || !data) {
            toast('Nomor Anggota / PIN salah, atau akun terkunci 15 menit', 'error');
            return;
        }
        await enterMember(data);
        $('member-pin').value = '';
        toast(`Selamat datang, ${data.name.split(' ')[0]}`);
    } finally {
        setBusy(btn, false);
    }
}

async function enterMember(data) {
    me = { ...data, role: 'member', jabatan: data.role };
    sessionStorage.setItem('rms_member', JSON.stringify(data));
    await loadMemberSummary();
    renderApp();
    setSync('Cloud Online', true);
}

async function logout() {
    if (me && me.role === 'admin') await db.auth.signOut();
    me = null; members = []; transactions = [];
    sessionStorage.removeItem('rms_member');
    $('view-login').classList.remove('hidden');
    $('view-admin-dashboard').classList.add('hidden');
    $('view-member-dashboard').classList.add('hidden');
    const u = $('user-info-section');
    u.classList.add('hidden'); u.classList.remove('flex');
    toast('Anda telah keluar');
}

/* ---------- Muat data ---------- */
async function loadAdminData() {
    const [mem, trx] = await Promise.all([
        db.from('members_public')
            .select('*, members_private(nik, phone), members_auth(token)')
            .order('created_at', { ascending: true }),
        db.from('transactions').select('*').order('created_at', { ascending: false })
    ]);
    if (mem.error) throw mem.error;
    if (trx.error) throw trx.error;
    members = mem.data || [];
    transactions = trx.data || [];
}

let memberSummary = { income: 0, expense: 0 };
async function loadMemberSummary() {
    const { data, error } = await db.rpc('kas_summary');
    if (error) throw error;
    memberSummary = data || { income: 0, expense: 0 };
}

/* ---------- Render utama ---------- */
function renderApp() {
    $('view-login').classList.add('hidden');
    const u = $('user-info-section');
    u.classList.remove('hidden'); u.classList.add('flex');
    $('nav-username').innerText = me.name;

    if (me.role === 'admin') {
        $('view-admin-dashboard').classList.remove('hidden');
        $('view-member-dashboard').classList.add('hidden');
        renderMembersList(); renderFinanceList(); populateECardDropdown();
    } else {
        $('view-admin-dashboard').classList.add('hidden');
        $('view-member-dashboard').classList.remove('hidden');
        renderMemberCard(); renderMemberFinanceView();
    }
}

function switchAdminTab(tab) {
    ['members', 'finance'].forEach(t => {
        $(`admin-tab-${t}`).classList.remove('active');
        $(`content-admin-${t}`).classList.add('hidden');
    });
    $(`admin-tab-${tab}`).classList.add('active');
    $(`content-admin-${tab}`).classList.remove('hidden');
}

/* ---------- OCR KTP ---------- */
async function scanKTPImage(e) {
    const file = e.target.files[0];
    if (!file) return;
    const status = $('ocr-status');
    status.classList.remove('hidden');
    try {
        const result = await Tesseract.recognize(file, 'ind');
        const text = result.data.text;
        const nikMatch = text.match(/\b\d{16}\b/);
        if (nikMatch) $('add-nik').value = nikMatch[0];
        const lines = text.split('\n').filter(l => l.trim().length > 3);
        if (lines.length > 0) {
            const line = lines.find(l => /nama/i.test(l)) || lines[0];
            $('add-name').value = line.replace(/nama|:|nik/gi, '').trim();
        }
        toast('Teks berhasil dibaca. Periksa lagi sebelum menyimpan.');
    } catch (err) {
        toast('Gagal memproses gambar, silakan isi manual', 'warn');
    } finally {
        status.classList.add('hidden');
        e.target.value = '';
    }
}

/* ---------- Anggota ---------- */
function generateMemberNo() {
    let no, exists = true;
    while (exists) {
        no = `RMS-${Math.floor(100000 + Math.random() * 900000)}`;
        exists = members.some(m => m.no_anggota === no);
    }
    return no;
}

async function handleAddMember(e) {
    e.preventDefault();
    const btn = $('btn-save-member');
    const editId = $('edit-member-id').value;
    const name = $('add-name').value.trim();
    const nik = $('add-nik').value.trim();
    const role = $('add-role').value;
    const phone = $('add-phone').value.trim() || '-';
    const loper = $('add-loper-location').value.trim() || '-';

    if (!/^\d{16}$/.test(nik)) { toast('NIK harus 16 digit angka', 'error'); return; }

    setBusy(btn, true, 'Menyimpan…');
    try {
        if (editId) {
            const r1 = await db.from('members_public').update({ name, role, loper }).eq('id', editId);
            if (r1.error) throw r1.error;
            const r2 = await db.from('members_private').upsert({ member_id: editId, nik, phone });
            if (r2.error) throw r2.error;
            toast('Data anggota diperbarui');
        } else {
            const no = generateMemberNo();
            const r1 = await db.from('members_public')
                .insert({ no_anggota: no, name, role, loper }).select('id').single();
            if (r1.error) throw r1.error;
            const r2 = await db.from('members_private').insert({ member_id: r1.data.id, nik, phone });
            if (r2.error) {
                await db.from('members_public').delete().eq('id', r1.data.id);
                throw r2.error;
            }
            toast(`Anggota berhasil didaftarkan (${no})`);
        }
        await loadAdminData();
        renderMembersList(); populateECardDropdown();
        cancelEditMember();
    } catch (err) {
        toast(friendlyError(err), 'error');
    } finally {
        setBusy(btn, false);
    }
}

function editMember(id) {
    const m = members.find(x => x.id === id);
    if (!m) return;
    const p = privOf(m);
    $('edit-member-id').value = m.id;
    $('add-name').value = m.name;
    $('add-nik').value = p.nik || '';
    $('add-role').value = m.role;
    $('add-phone').value = p.phone && p.phone !== '-' ? p.phone : '';
    $('add-loper-location').value = m.loper && m.loper !== '-' ? m.loper : '';
    $('form-member-title').innerHTML = '<i class="fa-solid fa-user-pen mr-1"></i> Ubah Data Anggota';
    $('btn-save-member').innerText = 'Simpan Perubahan';
    $('btn-save-member').dataset.old = 'Simpan Perubahan';
    $('btn-cancel-edit-member').classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cancelEditMember() {
    $('form-member-input').reset();
    $('edit-member-id').value = '';
    $('form-member-title').innerHTML = '<i class="fa-solid fa-user-plus mr-1"></i> Pendaftaran Anggota Baru';
    $('btn-save-member').innerText = 'Simpan Anggota Baru';
    $('btn-save-member').dataset.old = 'Simpan Anggota Baru';
    $('btn-cancel-edit-member').classList.add('hidden');
}

async function deleteMember(id) {
    const m = members.find(x => x.id === id);
    if (!m) return;
    if (!confirm(`Hapus anggota "${m.name}"? Data tidak bisa dikembalikan.`)) return;
    const { error } = await db.from('members_public').delete().eq('id', id);
    if (error) { toast(friendlyError(error), 'error'); return; }
    members = members.filter(x => x.id !== id);
    renderMembersList(); populateECardDropdown();
    toast('Anggota dihapus');
}

async function setMemberPin(id) {
    const m = members.find(x => x.id === id);
    if (!m) return;
    const pin = prompt(`PIN baru untuk ${m.name} (4-6 angka).\nKosongkan lalu OK untuk MENGHAPUS PIN.`);
    if (pin === null) return;
    const clean = pin.trim();
    if (clean && !/^\d{4,6}$/.test(clean)) { toast('PIN harus 4-6 digit angka', 'error'); return; }
    const { error } = await db.rpc('set_member_pin', { p_member: id, p_pin: clean || null });
    if (error) { toast(friendlyError(error), 'error'); return; }
    toast(clean ? 'PIN berhasil diatur' : 'PIN dihapus');
}

function renderMembersList() {
    const c = $('members-list-container');
    if (!members.length) {
        c.innerHTML = `<div class="text-center py-8 text-slate-400"><i class="fa-solid fa-users-slash text-3xl mb-2 block"></i><p class="text-xs">Belum ada data anggota.</p></div>`;
        return;
    }
    c.innerHTML = members.map(m => {
        const p = privOf(m);
        return `
        <div class="flex items-center justify-between p-3 bg-amber-50/30 border border-amber-100/80 rounded-2xl gap-2 flex-wrap">
            <div class="min-w-0">
                <h4 class="font-extrabold text-xs text-slate-800 truncate">
                    ${esc(m.name)}
                    <span class="text-[10px] bg-amber-100 text-amber-900 border border-amber-200 px-2 py-0.5 rounded-md ml-1 font-bold font-mono">${esc(m.no_anggota)}</span>
                </h4>
                <p class="text-[11px] text-slate-500 font-medium truncate">${esc(m.role)} · Telp: ${esc(p.phone || '-')} · Wilayah: ${esc(m.loper || '-')}</p>
            </div>
            <div class="flex items-center space-x-1 shrink-0">
                <button onclick="downloadSingleECard('${m.id}')" title="Unduh E-Card" class="text-emerald-700 text-xs px-2.5 py-1.5 font-bold bg-emerald-50 hover:bg-emerald-100 rounded-lg transition border border-emerald-200"><i class="fa-solid fa-id-card mr-1"></i> E-Card</button>
                <button onclick="setMemberPin('${m.id}')" title="Atur PIN" class="text-slate-700 text-xs px-2 py-1.5 font-bold hover:bg-slate-100 rounded-lg transition"><i class="fa-solid fa-key"></i></button>
                <button onclick="editMember('${m.id}')" title="Ubah" class="text-amber-700 text-xs px-2 py-1.5 font-bold hover:bg-amber-100 rounded-lg transition"><i class="fa-solid fa-pen"></i></button>
                <button onclick="deleteMember('${m.id}')" title="Hapus" class="text-rose-500 text-xs px-2 py-1.5 font-bold hover:bg-rose-50 rounded-lg shrink-0"><i class="fa-solid fa-trash"></i></button>
            </div>
        </div>`;
    }).join('');
}

function populateECardDropdown() {
    const sel = $('select-single-member-ecard');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Pilih Anggota --</option>' +
        members.map(m => `<option value="${m.id}">${esc(m.name)} (${esc(m.no_anggota)})</option>`).join('');
}

/* ---------- E-Card ---------- */
function qrDataUrl(text, size = 160) {
    const tmp = document.createElement('div');
    new QRCode(tmp, { text, width: size, height: size, correctLevel: QRCode.CorrectLevel.M });
    const canvas = tmp.querySelector('canvas');
    return canvas ? canvas.toDataURL('image/png') : '';
}

function getLogoSrc() {
    if (logoSrcCache !== null) return Promise.resolve(logoSrcCache);
    const tryLoad = (src) => new Promise(res => {
        const img = new Image();
        img.onload = () => res(src);
        img.onerror = () => res('');
        img.src = src;
    });
    return tryLoad('./logo.webp').then(s => s || tryLoad('./logo.jpg')).then(s => (logoSrcCache = s));
}

async function buildCardCanvas(m) {
    const area = $('export-card-hidden-area');
    const qr = qrDataUrl(`${PUBLIC_URL}?t=${authOf(m).token}`);
    const logo = await getLogoSrc();
    const logoHtml = logo
        ? `<img src="${logo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`
        : '';
    area.innerHTML = `
    <div id="card-to-capture" style="width:380px;padding:24px;background:linear-gradient(135deg,#1E5E3A 0%,#0F3D24 100%);color:#fff;border-radius:24px;border:3px solid #E5A93C;font-family:'Plus Jakarta Sans',sans-serif;box-sizing:border-box;">
        <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,0.2);padding-bottom:12px;margin-bottom:16px;">
            <div style="display:flex;align-items:center;gap:10px;">
                <div style="width:38px;height:38px;background:#fff;border-radius:50%;overflow:hidden;padding:2px;box-sizing:border-box;">${logoHtml}</div>
                <div>
                    <p style="margin:0;font-size:9px;font-weight:800;color:#FDE68A;letter-spacing:0.5px;">KELOMPOK TANI</p>
                    <h3 style="margin:0;font-size:13px;font-weight:900;color:#fff;">RIAU MANDIRI SEJAHTERA</h3>
                </div>
            </div>
            <span style="background:#F59E0B;color:#0F3D24;font-size:9px;font-weight:900;padding:3px 8px;border-radius:99px;">E-CARD</span>
        </div>
        <div style="font-size:12px;margin-bottom:16px;line-height:1.6;">
            <div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:6px;"><span style="color:#A7F3D0;">Nama Anggota</span><strong style="font-size:13px;color:#FDE68A;text-align:right;">${esc(m.name)}</strong></div>
            <div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:6px;"><span style="color:#A7F3D0;">Jabatan</span><span style="background:rgba(255,255,255,0.15);padding:1px 6px;border-radius:4px;font-weight:bold;">${esc(m.role)}</span></div>
            <div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:6px;"><span style="color:#A7F3D0;">Nomor Anggota</span><span style="font-family:monospace;color:#FDE68A;background:rgba(0,0,0,0.3);padding:1px 6px;border-radius:4px;font-weight:bold;">${esc(m.no_anggota)}</span></div>
            <div style="display:flex;justify-content:space-between;gap:8px;"><span style="color:#A7F3D0;">Wilayah</span><strong style="text-align:right;">${esc(m.loper || '-')}</strong></div>
        </div>
        <div style="background:#fff;padding:16px;border-radius:16px;text-align:center;color:#1E5E3A;border:2px solid #F59E0B;">
            <p style="margin:0 0 8px 0;font-size:10px;font-weight:900;letter-spacing:0.5px;">QR CODE IDENTITAS ANGGOTA</p>
            <div style="display:inline-block;background:#fff;padding:4px;"><img src="${qr}" style="width:140px;height:140px;display:block;margin:0 auto;" /></div>
            <p style="margin:8px 0 0 0;font-size:8px;color:#64748b;font-weight:600;">Scan dengan Kamera / Google Lens untuk masuk otomatis.<br>Jaga kerahasiaan kartu ini.</p>
        </div>
    </div>`;
    const el = $('card-to-capture');
    await new Promise(r => setTimeout(r, 100));
    const canvas = await html2canvas(el, { scale: 3, useCORS: true, backgroundColor: null });
    area.innerHTML = '';
    return canvas;
}

const toBlob = (canvas) => new Promise(res => canvas.toBlob(res, 'image/png'));
const safeName = (s) => String(s).replace(/[^\w\-]+/g, '_');

async function downloadSingleECard(id) {
    const m = members.find(x => x.id === id);
    if (!m) return;
    toast('Menyiapkan E-Card…');
    try {
        const canvas = await buildCardCanvas(m);
        saveBlob(await toBlob(canvas), `E-Card_${safeName(m.name)}.png`);
        toast(`E-Card ${m.name} berhasil diunduh`);
    } catch (err) {
        console.error(err);
        toast('Gagal membuat E-Card', 'error');
    }
}

function downloadSelectedSingleECard() {
    const id = $('select-single-member-ecard').value;
    if (!id) { toast('Pilih anggota terlebih dahulu', 'warn'); return; }
    downloadSingleECard(id);
}

async function downloadAllECardsZip() {
    if (!members.length) { toast('Belum ada anggota', 'warn'); return; }
    if (!confirm(`Buat ZIP berisi ${members.length} E-Card?`)) return;
    try {
        const zip = new JSZip();
        for (let i = 0; i < members.length; i++) {
            toast(`Memproses ${i + 1} dari ${members.length}…`);
            const m = members[i];
            const canvas = await buildCardCanvas(m);
            zip.file(`E-Card_${safeName(m.name)}_${m.no_anggota}.png`, await toBlob(canvas));
        }
        const out = await zip.generateAsync({ type: 'blob' });
        saveBlob(out, 'E-Card_RMS.zip');
        toast('ZIP E-Card berhasil diunduh');
    } catch (err) {
        console.error(err);
        toast('Gagal membuat ZIP', 'error');
    }
}

/* ---------- Keuangan ---------- */
function calcTotals(list = transactions) {
    let income = 0, expense = 0;
    list.forEach(t => {
        if (t.type === 'Masuk') income += Number(t.amount);
        else expense += Number(t.amount);
    });
    return { income, expense, balance: income - expense };
}

async function handleTransaction(e) {
    e.preventDefault();
    const form = e.target;
    const btn = form.querySelector('button[type="submit"]');
    const type = $('trx-type').value;
    const amount = Number($('trx-amount').value);
    const description = $('trx-desc').value.trim();
    const file = $('trx-file').files[0];

    if (!amount || amount <= 0) { toast('Jumlah harus lebih dari 0', 'error'); return; }

    setBusy(btn, true, 'Menyimpan…');
    try {
        let proof_path = null;
        if (file) {
            if (file.size > 5 * 1024 * 1024) { toast('Ukuran bukti maksimal 5 MB', 'error'); return; }
            const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
            proof_path = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
            const up = await db.storage.from('proofs').upload(proof_path, file);
            if (up.error) { toast('Upload bukti gagal: ' + up.error.message, 'error'); return; }
        }
        const { error } = await db.from('transactions').insert({ type, amount, description, proof_path });
        if (error) {
            if (proof_path) await db.storage.from('proofs').remove([proof_path]);
            throw error;
        }
        await loadAdminData();
        renderFinanceList();
        form.reset();
        toast('Transaksi dicatat');
    } catch (err) {
        toast(friendlyError(err), 'error');
    } finally {
        setBusy(btn, false);
    }
}

function filteredTransactions() {
    const mf = $('filter-month') && $('filter-month').value;
    return mf ? transactions.filter(t => monthKey(t.created_at) === mf) : transactions;
}

function renderFinanceList() {
    const c = $('finance-list-container');
    const list = filteredTransactions();
    if (!list.length) {
        c.innerHTML = `<div class="text-center py-8 text-slate-400"><i class="fa-solid fa-receipt text-3xl mb-2 block"></i><p class="text-xs">Belum ada catatan kas.</p></div>`;
    } else {
        c.innerHTML = list.map(t => `
        <div class="flex items-center justify-between p-3 bg-amber-50/30 border border-amber-100/80 rounded-2xl gap-2">
            <div class="min-w-0">
                <span class="text-[10px] font-black px-2 py-0.5 rounded-md ${t.type === 'Masuk' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">${esc(t.type)}</span>
                <span class="font-bold text-xs text-slate-800 ml-1.5">${esc(t.description)}</span>
                <p class="text-[11px] font-extrabold text-slate-700 mt-0.5">${fmtRp(t.amount)} <span class="text-slate-400 font-medium">· ${fmtDate(t.created_at)}</span></p>
                ${t.proof_path ? `<button onclick="openProof('${t.id}')" class="text-[10px] text-blue-600 underline font-bold"><i class="fa-solid fa-paperclip"></i> Lihat Bukti</button>` : ''}
            </div>
            <button onclick="deleteTransaction('${t.id}')" class="text-rose-500 text-xs px-2 py-1.5 font-bold hover:bg-rose-50 rounded-lg shrink-0"><i class="fa-solid fa-trash"></i></button>
        </div>`).join('');
    }
    const { income, expense, balance } = calcTotals(); // total keseluruhan
    $('summary-income').innerText = fmtRp(income);
    $('summary-expense').innerText = fmtRp(expense);
    $('summary-balance').innerText = fmtRp(balance);
}

async function openProof(id) {
    const t = transactions.find(x => x.id === id);
    if (!t || !t.proof_path) return;
    const win = window.open('', '_blank');
    const { data, error } = await db.storage.from('proofs').createSignedUrl(t.proof_path, 3600);
    if (error || !data) { if (win) win.close(); toast('Gagal membuka bukti', 'error'); return; }
    if (win) win.location.href = data.signedUrl;
    else window.location.href = data.signedUrl;
}

async function deleteTransaction(id) {
    const t = transactions.find(x => x.id === id);
    if (!t) return;
    if (!confirm(`Hapus catatan "${t.description}" (${fmtRp(t.amount)})?`)) return;
    const { error } = await db.from('transactions').delete().eq('id', id);
    if (error) { toast(friendlyError(error), 'error'); return; }
    if (t.proof_path) await db.storage.from('proofs').remove([t.proof_path]);
    transactions = transactions.filter(x => x.id !== id);
    renderFinanceList();
    toast('Catatan dihapus');
}

/* ---------- Laporan PDF ---------- */
function exportMemberReport() {
    if (!members.length) { toast('Belum ada anggota', 'warn'); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text('Laporan Anggota - Kelompok Tani Riau Mandiri Sejahtera', 14, 16);
    doc.setFontSize(9);
    doc.text(`Dicetak: ${fmtDate(new Date().toISOString())}   Total: ${members.length} anggota`, 14, 22);
    doc.autoTable({
        startY: 28,
        head: [['No', 'No. Anggota', 'Nama', 'Jabatan', 'Telepon', 'Wilayah']],
        body: members.map((m, i) => [i + 1, m.no_anggota, m.name, m.role, privOf(m).phone || '-', m.loper || '-']),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [30, 94, 58] }
    });
    doc.save('Laporan_Anggota_RMS.pdf');
}

function exportFinanceReport() {
    const list = filteredTransactions();
    if (!list.length) { toast('Tidak ada data kas untuk dicetak', 'warn'); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const mf = $('filter-month').value;
    doc.setFontSize(14);
    doc.text('Laporan Kas - Kelompok Tani Riau Mandiri Sejahtera', 14, 16);
    doc.setFontSize(9);
    doc.text(`Periode: ${mf || 'Semua'}   Dicetak: ${fmtDate(new Date().toISOString())}`, 14, 22);
    const { income, expense, balance } = calcTotals(list);
    doc.autoTable({
        startY: 28,
        head: [['Tanggal', 'Jenis', 'Keterangan', 'Jumlah']],
        body: list.map(t => [fmtDate(t.created_at), t.type, t.description, fmtRp(t.amount)]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [30, 94, 58] },
        columnStyles: { 3: { halign: 'right' } }
    });
    const y = doc.lastAutoTable.finalY + 8;
    doc.setFontSize(10);
    doc.text(`Total Masuk : ${fmtRp(income)}`, 14, y);
    doc.text(`Total Keluar: ${fmtRp(expense)}`, 14, y + 6);
    doc.text(`Saldo       : ${fmtRp(balance)}`, 14, y + 12);
    doc.save(`Laporan_Kas_RMS_${mf || 'semua'}.pdf`);
}

/* ---------- Dashboard anggota ---------- */
function renderMemberCard() {
    $('member-card-name').innerText = me.name || '-';
    $('member-card-role').innerText = me.jabatan || '-';
    $('member-card-no').innerText = me.no_anggota || '-';
    $('member-card-loper').innerText = me.loper || '-';

    const container = $('qrcode-container');
    container.innerHTML = '';
    if (me.token) {
        new QRCode(container, {
            text: `${PUBLIC_URL}?t=${me.token}`,
            width: 140, height: 140,
            colorDark: '#000000', colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M
        });
    } else {
        container.innerHTML = '<p class="text-[11px] text-slate-500">QR belum tersedia. Hubungi pengurus.</p>';
    }
}

function renderMemberFinanceView() {
    const income = Number(memberSummary.income) || 0;
    const expense = Number(memberSummary.expense) || 0;
    $('member-summary-income').innerText = fmtRp(income);
    $('member-summary-expense').innerText = fmtRp(expense);
    $('member-summary-balance').innerText = fmtRp(income - expense);
}
