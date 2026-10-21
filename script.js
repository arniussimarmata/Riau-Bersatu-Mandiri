const SUPABASE_URL = "https://hihhduyzosdrzbvtxsts.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_FR47_uA2_HAesqrPGvzmoA_n0KL358W";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const OWNER_EMAILS = ['arniusputra6895@gmail.com', 'arniussimarmata@gmail.com'];
const OWNER_PASSWORDS = ['@Simarmata28', 'admin123'];

let dbAdmins = [
    { id: '1', name: 'Arnius Simarmata', email: 'arniussimarmata@gmail.com', pass: '@Simarmata28' },
    { id: '2', name: 'Arnius Putra', email: 'arniusputra6895@gmail.com', pass: '@Simarmata28' }
];
let dbMembers = [
    { id: '1', noAnggota: 'RMS-001', name: 'Arnius Simarmata', nik: '1404142801980001', role: 'Ketua Kelompok Tani', phone: '082383301041', loper: 'Pekanbaru / Indragiri' }
];
let dbFinance = [];
let currentUser = JSON.parse(localStorage.getItem('rms_current_user')) || null;
let activeOtpCode = null;
let pendingAction = null;
let realtimeChannel = null;
let tesseractLoaded = false;

function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function fmtRp(n) {
    return 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');
}

function toast(msg, type = 'success') {
    const c = document.getElementById('toast-container');
    if (!c) return;
    const t = document.createElement('div');
    t.className = 'toast' + (type !== 'success' ? ' ' + type : '');
    const icon = type === 'error' ? 'fa-circle-xmark' : type === 'warn' ? 'fa-triangle-exclamation' : 'fa-circle-check';
    t.innerHTML = `<i class="fa-solid ${icon}"></i><span>${esc(msg)}</span>`;
    c.appendChild(t);
    setTimeout(() => {
        t.style.opacity = '0'; t.style.transform = 'translateY(20px)'; t.style.transition = 'all 0.3s';
        setTimeout(() => t.remove(), 300);
    }, 2800);
}

window.onload = async function () {
    // 1. Cek parameter NIK dari URL terlebih dahulu SEBELUM sinkronisasi cloud
    const urlParams = new URLSearchParams(window.location.search);
    const scanNik = urlParams.get('nik');

    await syncCloudData();

    if (scanNik) {
        const foundMember = dbMembers.find(m => m.nik === scanNik);
        if (foundMember) {
            currentUser = { role: 'member', ...foundMember };
            localStorage.setItem('rms_current_user', JSON.stringify(currentUser));
            toast(`Login otomatis berhasil: ${foundMember.name}`);
            // Bersihkan parameter NIK dari URL browser agar bersih
            window.history.replaceState({}, document.title, window.location.pathname);
        } else {
            toast('NIK dari QR Code tidak terdaftar dalam sistem', 'error');
        }
    }

    if (currentUser) renderApp();
    subscribeRealtimeCloud();
};

function updateSyncBadge(text, ok) {
    const textEl = document.getElementById('sync-text');
    if (textEl) textEl.innerText = text;
    const b = document.getElementById('sync-badge');
    if (b) {
        b.className = ok
            ? "bg-emerald-950/50 hover:bg-emerald-950/60 border border-amber-300/40 text-amber-200 text-[10px] sm:text-xs px-2.5 py-1.5 rounded-full font-semibold shadow backdrop-blur-sm transition active:scale-95 whitespace-nowrap"
            : "bg-amber-900/50 hover:bg-amber-900/60 border border-amber-400/40 text-amber-100 text-[10px] sm:text-xs px-2.5 py-1.5 rounded-full font-semibold shadow backdrop-blur-sm transition active:scale-95 whitespace-nowrap";
    }
}

async function syncCloudData() {
    updateSyncBadge('Menyinkronkan…', false);
    try {
        const { data, error } = await supabaseClient.from('rbm_data').select('*');
        if (error) throw error;
        if (data && data.length > 0) {
            data.forEach(row => {
                if (row.id === 'admins' && row.data) dbAdmins = row.data;
                if (row.id === 'members' && row.data) dbMembers = row.data;
                if (row.id === 'finance' && row.data) dbFinance = row.data;
            });
            updateSyncBadge('Cloud Online', true);
        } else {
            await pushAllToCloud();
            updateSyncBadge('Cloud Online', true);
        }
        if (currentUser) renderApp();
        else renderMemberListForMembers();
    } catch (err) {
        console.error('Sync error:', err);
        updateSyncBadge('Offline', false);
    }
}

async function pushAllToCloud() {
    try {
        localStorage.setItem('rms_current_user', JSON.stringify(currentUser));
        await Promise.all([
            supabaseClient.from('rbm_data').upsert({ id: 'admins', data: dbAdmins }),
            supabaseClient.from('rbm_data').upsert({ id: 'members', data: dbMembers }),
            supabaseClient.from('rbm_data').upsert({ id: 'finance', data: dbFinance })
        ]);
    } catch (err) {
        console.error('Push error:', err);
    }
}

function subscribeRealtimeCloud() {
    if (realtimeChannel) supabaseClient.removeChannel(realtimeChannel);
    realtimeChannel = supabaseClient
        .channel('public:rbm_data')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'rbm_data' }, async () => {
            await syncCloudData();
        })
        .subscribe();
}

function switchLoginTab(type) {
    const aBtn = document.getElementById('tab-btn-admin');
    const mBtn = document.getElementById('tab-btn-member');
    const aForm = document.getElementById('form-login-admin');
    const mForm = document.getElementById('form-login-member');
    if (type === 'admin') {
        aBtn.className = "flex-1 py-2.5 text-xs font-bold rounded-xl bg-rms-green text-white shadow-sm transition";
        mBtn.className = "flex-1 py-2.5 text-xs font-bold rounded-xl text-slate-600 transition";
        aForm.classList.remove('hidden'); mForm.classList.add('hidden');
    } else {
        mBtn.className = "flex-1 py-2.5 text-xs font-bold rounded-xl bg-rms-amber text-white shadow-sm transition";
        aBtn.className = "flex-1 py-2.5 text-xs font-bold rounded-xl text-slate-600 transition";
        mForm.classList.remove('hidden'); aForm.classList.add('hidden');
    }
}

function handleLoginAdmin(e) {
    e.preventDefault();
    const email = document.getElementById('admin-email').value.trim().toLowerCase();
    const pass = document.getElementById('admin-pass').value.trim();
    const isOwner = OWNER_EMAILS.includes(email) && OWNER_PASSWORDS.includes(pass);
    const found = dbAdmins.find(a => a.email.toLowerCase() === email && a.pass === pass);
    if (isOwner || found) {
        currentUser = { role: 'admin', name: (found?.name) || 'Owner', email };
        localStorage.setItem('rms_current_user', JSON.stringify(currentUser));
        renderApp();
        toast('Berhasil masuk sebagai Pengurus');
    } else {
        toast('Email atau Kata Sandi salah', 'error');
    }
}

function handleLoginMember(e) {
    e.preventDefault();
    const nik = document.getElementById('member-nik').value.trim();
    const found = dbMembers.find(m => m.nik === nik);
    if (found) {
        currentUser = { role: 'member', ...found };
        localStorage.setItem('rms_current_user', JSON.stringify(currentUser));
        renderApp();
        toast(`Selamat datang, ${found.name.split(' ')[0]}`);
    } else {
        toast('NIK tidak ditemukan', 'error');
    }
}

function logout() {
    currentUser = null;
    localStorage.removeItem('rms_current_user');
    document.getElementById('view-login').classList.remove('hidden');
    document.getElementById('view-admin-dashboard').classList.add('hidden');
    document.getElementById('view-member-dashboard').classList.add('hidden');
    const u = document.getElementById('user-info-section');
    u.classList.add('hidden'); u.classList.remove('flex');
    toast('Anda telah keluar');
}

function renderApp() {
    document.getElementById('view-login').classList.add('hidden');
    const u = document.getElementById('user-info-section');
    u.classList.remove('hidden'); u.classList.add('flex');
    document.getElementById('nav-username').innerText = currentUser.name;
    if (currentUser.role === 'admin') {
        document.getElementById('view-admin-dashboard').classList.remove('hidden');
        document.getElementById('view-member-dashboard').classList.add('hidden');
        renderMembersList(); renderFinanceList(); renderAdminsList();
    } else {
        document.getElementById('view-admin-dashboard').classList.add('hidden');
        document.getElementById('view-member-dashboard').classList.remove('hidden');
        renderMemberCard(); renderMemberFinanceView(); renderMemberListForMembers();
    }
}

function switchAdminTab(tab) {
    ['members','finance','admins'].forEach(t => {
        document.getElementById(`admin-tab-${t}`).classList.remove('active');
        document.getElementById(`content-admin-${t}`).classList.add('hidden');
    });
    document.getElementById(`admin-tab-${tab}`).classList.add('active');
    document.getElementById(`content-admin-${tab}`).classList.remove('hidden');
}

function initiateAddAdmin(e) {
    e.preventDefault();
    const name = document.getElementById('add-admin-name').value.trim();
    const email = document.getElementById('add-admin-email').value.trim();
    const pass = document.getElementById('add-admin-pass').value.trim();
    if (dbAdmins.some(a => a.email.toLowerCase() === email.toLowerCase())) {
        toast('Email sudah terdaftar', 'error'); return;
    }
    pendingAction = { type: 'add', payload: { name, email, pass } };
    sendOtpToOwnerEmail();
}

function requestDeleteAdmin(id) {
    if (dbAdmins.length <= 1) { toast('Tidak bisa hapus admin terakhir', 'warn'); return; }
    const t = dbAdmins.find(a => a.id === id);
    if (!t) return;
    if (confirm(`Hapus admin "${t.name}"?`)) {
        pendingAction = { type: 'delete', payload: { id, name: t.name } };
        sendOtpToOwnerEmail();
    }
}

function sendOtpToOwnerEmail() {
    activeOtpCode = String(Math.floor(100000 + Math.random() * 900000));
    document.getElementById('otp-input-code').value = '';
    document.getElementById('otp-modal').classList.remove('hidden');
    document.getElementById('otp-modal').classList.add('flex');
    alert(`Kode OTP Persetujuan: ${activeOtpCode}`);
}

async function confirmOtpSubmission() {
    const entered = document.getElementById('otp-input-code').value.trim();
    if (entered !== activeOtpCode) { toast('Kode OTP salah', 'error'); return; }
    if (pendingAction.type === 'add') {
        const { name, email, pass } = pendingAction.payload;
        dbAdmins.push({ id: Date.now().toString(), name, email, pass });
        await pushAllToCloud(); renderAdminsList();
        document.getElementById('add-admin-name').value = '';
        document.getElementById('add-admin-email').value = '';
        document.getElementById('add-admin-pass').value = '';
        toast('Admin baru ditambahkan');
    } else if (pendingAction.type === 'delete') {
        dbAdmins = dbAdmins.filter(a => a.id !== pendingAction.payload.id);
        await pushAllToCloud(); renderAdminsList();
        toast('Admin dihapus');
    }
    closeOtpModal();
}

function closeOtpModal() {
    activeOtpCode = null; pendingAction = null;
    document.getElementById('otp-modal').classList.add('hidden');
    document.getElementById('otp-modal').classList.remove('flex');
}

function renderAdminsList() {
    const c = document.getElementById('admins-list-container');
    if (!dbAdmins.length) { c.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">Belum ada admin.</p>`; return; }
    c.innerHTML = dbAdmins.map(a => `
        <div class="flex items-center justify-between p-3 bg-amber-50/30 border border-amber-100 rounded-2xl gap-2">
            <div class="min-w-0">
                <h4 class="font-bold text-xs text-slate-800 truncate">${esc(a.name)}</h4>
                <p class="text-[11px] text-slate-500 truncate">${esc(a.email)}</p>
            </div>
            <button onclick="requestDeleteAdmin('${a.id}')" class="text-rose-500 text-xs px-2 py-1.5 font-bold hover:bg-rose-50 rounded-lg transition shrink-0">
                <i class="fa-solid fa-trash"></i>
            </button>
        </div>
    `).join('');
}

function handleRoleChange() {
    const role = document.getElementById('add-role').value;
    const c = document.getElementById('seksi-field-container');
    const inp = document.getElementById('add-seksi-name');
    if (role === 'Seksi') { c.classList.remove('hidden'); inp.required = true; }
    else { c.classList.add('hidden'); inp.required = false; }
}

async function processDocumentScan(event) {
    const file = event.target.files[0];
    if (!file) return;
    const statusEl = document.getElementById('scan-status');
    statusEl.classList.remove('hidden');
    try {
        if (!tesseractLoaded) {
            await new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = 'https://unpkg.com/tesseract.js@v4.0.2/dist/tesseract.min.js';
                s.onload = resolve; s.onerror = reject;
                document.head.appendChild(s);
            });
            tesseractLoaded = true;
        }
        const { data: { text } } = await Tesseract.recognize(file, 'ind');
        statusEl.classList.add('hidden');
        const nikMatch = text.match(/\b\d{16}\b/);
        if (nikMatch) document.getElementById('add-nik').value = nikMatch[0];
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 3);
        if (lines.length) {
            const nameLine = lines.find(l => /^[A-Z\s]{4,}$/.test(l) && l.length < 40);
            if (nameLine) document.getElementById('add-name').value = nameLine;
        }
        toast('Pemindaian selesai — periksa hasilnya');
    } catch (err) {
        statusEl.classList.add('hidden');
        toast('Gagal memindai dokumen', 'error');
    }
}

async function handleAddMember(e) {
    e.preventDefault();
    const editId = document.getElementById('edit-member-id').value;
    const name = document.getElementById('add-name').value.trim();
    const nik = document.getElementById('add-nik').value.trim();
    const baseRole = document.getElementById('add-role').value;
    const phone = document.getElementById('add-phone').value.trim();
    const loper = document.getElementById('add-loper-location').value.trim() || '-';
    if (!/^\d{16}$/.test(nik)) { toast('NIK harus 16 digit angka', 'error'); return; }
    const dup = dbMembers.find(m => m.nik === nik && m.id !== editId);
    if (dup) { toast('NIK sudah terdaftar atas nama ' + dup.name, 'error'); return; }
    let finalRole = baseRole;
    if (baseRole === 'Seksi') {
        const s = document.getElementById('add-seksi-name').value.trim();
        finalRole = s ? `Seksi (${s})` : 'Seksi Bidang';
    }
    if (editId) {
        const i = dbMembers.findIndex(m => m.id === editId);
        if (i !== -1) dbMembers[i] = { ...dbMembers[i], name, nik, role: finalRole, phone, loper };
        toast('Data anggota diperbarui');
    } else {
        const nextNo = 'RMS-' + String(dbMembers.length + 1).padStart(3, '0');
        dbMembers.push({ id: Date.now().toString(), noAnggota: nextNo, name, nik, role: finalRole, phone, loper });
        toast(`Anggota ${nextNo} ditambahkan`);
    }
    await pushAllToCloud();
    renderMembersList(); renderMemberListForMembers(); cancelEditMember();
}

function editMember(id) {
    const m = dbMembers.find(x => x.id === id);
    if (!m) return;
    document.getElementById('edit-member-id').value = m.id;
    document.getElementById('add-name').value = m.name;
    document.getElementById('add-nik').value = m.nik;
    document.getElementById('add-phone').value = m.phone || '';
    document.getElementById('add-loper-location').value = m.loper || '';
    if (m.role.startsWith('Seksi')) {
        document.getElementById('add-role').value = 'Seksi';
        document.getElementById('seksi-field-container').classList.remove('hidden');
        document.getElementById('add-seksi-name').value = m.role.replace('Seksi (','').replace(')','');
    } else {
        document.getElementById('add-role').value = m.role;
        document.getElementById('seksi-field-container').classList.add('hidden');
    }
    document.getElementById('form-member-title').innerHTML = '<i class="fa-solid fa-user-pen mr-1"></i> Perbaiki Data Anggota';
    document.getElementById('btn-save-member').innerText = 'Simpan Perubahan';
    document.getElementById('btn-cancel-edit-member').classList.remove('hidden');
    document.getElementById('scan-container').classList.add('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cancelEditMember() {
    document.getElementById('edit-member-id').value = '';
    document.getElementById('form-member-input').reset();
    document.getElementById('form-member-title').innerHTML = '<i class="fa-solid fa-user-plus mr-1"></i> Pendaftaran Anggota Baru';
    document.getElementById('btn-save-member').innerText = 'Simpan Anggota';
    document.getElementById('btn-cancel-edit-member').classList.add('hidden');
    document.getElementById('scan-container').classList.remove('hidden');
    document.getElementById('seksi-field-container').classList.add('hidden');
}

async function deleteMember(id) {
    if (!confirm('Hapus anggota ini?')) return;
    dbMembers = dbMembers.filter(m => m.id !== id);
    await pushAllToCloud();
    renderMembersList(); renderMemberListForMembers();
    toast('Anggota dihapus');
}

function renderMembersList() {
    const c = document.getElementById('members-list-container');
    if (!dbMembers.length) {
        c.innerHTML = `<div class="text-center py-8 text-slate-400"><i class="fa-solid fa-users-slash text-3xl mb-2 block"></i><p class="text-xs">Belum ada data anggota.</p></div>`;
        return;
    }
    c.innerHTML = dbMembers.map(m => `
        <div class="flex items-center justify-between p-3 bg-amber-50/30 border border-amber-100/80 rounded-2xl gap-2">
            <div class="min-w-0">
                <h4 class="font-extrabold text-xs text-slate-800 truncate">
                    ${esc(m.name)}
                    <span class="text-[10px] bg-amber-100 text-amber-900 border border-amber-200 px-2 py-0.5 rounded-md ml-1 font-bold">${esc(m.noAnggota || 'RMS-000')}</span>
                </h4>
                <p class="text-[11px] text-slate-500 font-medium truncate">${esc(m.role)} · NIK: ${esc(m.nik)} · ${esc(m.loper || '-')}</p>
            </div>
            <div class="flex items-center space-x-1 shrink-0">
                <button onclick="editMember('${m.id}')" class="text-amber-700 text-xs px-2 py-1.5 font-bold hover:bg-amber-100 rounded-lg transition"><i class="fa-solid fa-pen"></i></button>
                <button onclick="deleteMember('${m.id}')" class="text-rose-500 text-xs px-2 py-1.5 font-bold hover:bg-rose-50 rounded-lg transition"><i class="fa-solid fa-trash"></i></button>
            </div>
        </div>
    `).join('');
}

async function handleTransaction(e) {
    e.preventDefault();
    const type = document.getElementById('trx-type').value;
    const amount = Number(document.getElementById('trx-amount').value);
    const desc = document.getElementById('trx-desc').value.trim();
    const fileInput = document.getElementById('trx-proof');
    if (!amount || amount <= 0) { toast('Jumlah harus lebih dari 0', 'error'); return; }
    const save = async (proofData) => {
        dbFinance.push({ id: Date.now().toString(), type, amount, desc, proof: proofData });
        await pushAllToCloud();
        renderFinanceList(); renderMemberFinanceView();
        e.target.reset();
        toast('Transaksi dicatat');
    };
    if (fileInput.files && fileInput.files[0]) {
        const reader = new FileReader();
        reader.onload = ev => save(ev.target.result);
        reader.readAsDataURL(fileInput.files[0]);
    } else {
        await save('');
    }
}

async function deleteTransaction(id) {
    if (!confirm('Hapus transaksi ini?')) return;
    dbFinance = dbFinance.filter(t => t.id !== id);
    await pushAllToCloud();
    renderFinanceList(); renderMemberFinanceView();
    toast('Transaksi dihapus');
}

function calcTotals() {
    let income = 0, expense = 0;
    dbFinance.forEach(t => {
        const amt = Number(t.amount) || 0;
        if (t.type === 'Masuk') income += amt; else expense += amt;
    });
    return { income, expense, balance: income - expense };
}

function renderFinanceList() {
    const c = document.getElementById('finance-list-container');
    if (!dbFinance.length) {
        c.innerHTML = `<div class="text-center py-8 text-slate-400"><i class="fa-solid fa-receipt text-3xl mb-2 block"></i><p class="text-xs">Belum ada catatan kas.</p></div>`;
    } else {
        c.innerHTML = dbFinance.map(t => `
            <div class="flex items-center justify-between p-3 bg-amber-50/30 border border-amber-100/80 rounded-2xl gap-2">
                <div class="min-w-0">
                    <span class="text-[10px] font-black px-2 py-0.5 rounded-md ${t.type === 'Masuk' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">${esc(t.type)}</span>
                    <span class="font-bold text-xs text-slate-800 ml-1.5">${esc(t.desc)}</span>
                    <p class="text-[11px] font-extrabold text-slate-700 mt-0.5">${fmtRp(t.amount)}</p>
                </div>
                <button onclick="deleteTransaction('${t.id}')" class="text-rose-500 text-xs px-2 py-1.5 font-bold hover:bg-rose-50 rounded-lg transition shrink-0"><i class="fa-solid fa-trash"></i></button>
            </div>
        `).join('');
    }
    const { income, expense, balance } = calcTotals();
    document.getElementById('summary-income').innerText = fmtRp(income);
    document.getElementById('summary-expense').innerText = fmtRp(expense);
    document.getElementById('summary-balance').innerText = fmtRp(balance);
}

function renderMemberCard() {
    document.getElementById('member-card-name').innerText = currentUser.name;
    document.getElementById('member-card-role').innerText = currentUser.role;
    document.getElementById('member-card-no').innerText = currentUser.noAnggota || 'RMS-001';
    document.getElementById('member-card-loper').innerText = currentUser.loper || '-';
    
    const qrContainer = document.getElementById('qrcode-container');
    qrContainer.innerHTML = '';

    // Memastikan link mutlak terbentuk dengan domain Netlify asli Anda
    const targetUrl = `https://Riau-Bersatu-Mandiri.netlify.app/?nik=${encodeURIComponent(currentUser.nik)}`;

    new QRCode(qrContainer, {
        text: targetUrl,
        width: 130, 
        height: 130,
        correctLevel: QRCode.CorrectLevel.H
    });
}

function renderMemberFinanceView() {
    const { income, expense, balance } = calcTotals();
    document.getElementById('member-summary-income').innerText = fmtRp(income);
    document.getElementById('member-summary-expense').innerText = fmtRp(expense);
    document.getElementById('member-summary-balance').innerText = fmtRp(balance);
}

function renderMemberListForMembers() {
    const c = document.getElementById('member-view-members-list');
    const total = document.getElementById('member-total-count');
    if (total) total.innerText = `Total: ${dbMembers.length}`;
    if (!c) return;
    if (!dbMembers.length) { c.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">Belum ada anggota.</p>`; return; }
    c.innerHTML = dbMembers.map((m, i) => `
        <div class="flex items-center justify-between p-3 bg-amber-50/30 border border-amber-100/80 rounded-2xl gap-2">
            <div class="flex items-center space-x-2.5 min-w-0">
                <span class="w-6 h-6 bg-rms-green text-amber-300 rounded-lg flex items-center justify-center text-[10px] font-black shadow-sm shrink-0">${i + 1}</span>
                <h4 class="font-bold text-xs text-slate-800 truncate">${esc(m.name)} <span class="text-[10px] text-slate-400">(${esc(m.noAnggota || 'RMS-000')})</span></h4>
            </div>
            <span class="text-[10px] bg-amber-100 text-amber-900 border border-amber-200/60 font-bold px-2 py-0.5 rounded-lg shrink-0">${esc(m.role)}</span>
        </div>
    `).join('');
}

function exportMemberReport() {
    const area = document.getElementById('print-area');
    const rows = dbMembers.map((m, i) => `
        <tr><td>${i + 1}</td><td>${esc(m.noAnggota || 'RMS-000')}</td><td>${esc(m.name)}</td><td>${esc(m.nik)}</td><td>${esc(m.role)}</td><td>${esc(m.phone || '-')}</td><td>${esc(m.loper || '-')}</td></tr>
    `).join('');
    area.innerHTML = `
        <h1>Laporan Daftar Anggota</h1>
        <p class="report-meta">Kelompok Tani Riau Mandiri Sejahtera (RMS) · Dicetak ${new Date().toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' })}</p>
        <table>
            <thead><tr><th>#</th><th>No. Anggota</th><th>Nama</th><th>NIK</th><th>Jabatan</th><th>Telepon</th><th>Wilayah</th></tr></thead>
            <tbody>${rows}</tbody>
            <tfoot><tr class="total-row"><td colspan="7">Total: ${dbMembers.length} anggota</td></tr></tfoot>
        </table>`;
    area.classList.remove('hidden');
    window.print();
    setTimeout(() => { area.classList.add('hidden'); area.innerHTML = ''; }, 1000);
}

function exportFinanceReport() {
    const area = document.getElementById('print-area');
    const rows = dbFinance.map((t, i) => `
        <tr><td>${i + 1}</td><td>${esc(t.type)}</td><td>${esc(t.desc)}</td><td style="text-align:right">${fmtRp(t.amount)}</td></tr>
    `).join('');
    const { income, expense, balance } = calcTotals();
    area.innerHTML = `
        <h1>Laporan Keuangan Kas</h1>
        <p class="report-meta">Kelompok Tani Riau Mandiri Sejahtera (RMS) · Dicetak ${new Date().toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' })}</p>
        <table>
            <thead><tr><th>#</th><th>Jenis</th><th>Keterangan</th><th style="text-align:right">Jumlah</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="4" style="text-align:center;color:#94a3b8">Belum ada transaksi</td></tr>'}</tbody>
            <tfoot>
                <tr class="total-row"><td colspan="3">Total Pemasukan</td><td style="text-align:right">${fmtRp(income)}</td></tr>
                <tr class="total-row"><td colspan="3">Total Pengeluaran</td><td style="text-align:right">${fmtRp(expense)}</td></tr>
                <tr class="total-row"><td colspan="3">Saldo Akhir</td><td style="text-align:right">${fmtRp(balance)}</td></tr>
            </tfoot>
        </table>`;
    area.classList.add('hidden');
    window.print();
    setTimeout(() => { area.classList.add('hidden'); area.innerHTML = ''; }, 1000);
}
