const SUPABASE_URL = "https://hihhduyzosdrzbvtxsts.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_FR47_uA2_HAesqrPGvzmoA_n0KL358W";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentMember = null;
let currentProfile = null;
let realtimeChannel = null;
let qrTimer = null;

// ========== HELPERS ==========
function esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function fmtRp(n) { return 'Rp ' + (Number(n)||0).toLocaleString('id-ID'); }
function toast(msg, type='success') {
    const c = document.getElementById('toast-container');
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
function switchAdminTab(tab) {
    ['members','finance','admins'].forEach(t => {
        document.getElementById(`admin-tab-${t}`).classList.remove('active');
        document.getElementById(`content-admin-${t}`).classList.add('hidden');
    });
    document.getElementById(`admin-tab-${tab}`).classList.add('active');
    document.getElementById(`content-admin-${tab}`).classList.remove('hidden');
}
function handleRoleChange() {
    const role = document.getElementById('add-role').value;
    const c = document.getElementById('seksi-field-container');
    const inp = document.getElementById('add-seksi-name');
    if (role === 'Seksi') { c.classList.remove('hidden'); inp.required = true; }
    else { c.classList.add('hidden'); inp.required = false; }
}
function cancelEditMember() {
    document.getElementById('edit-member-id').value = '';
    document.getElementById('form-member-input').reset();
    document.getElementById('form-member-title').innerHTML = '<i class="fa-solid fa-user-plus mr-1"></i> Pendaftaran Anggota Baru';
    document.getElementById('btn-save-member').innerText = 'Simpan Anggota';
    document.getElementById('btn-cancel-edit-member').classList.add('hidden');
    document.getElementById('seksi-field-container').classList.add('hidden');
}

// ========== BOOT ==========
window.addEventListener('DOMContentLoaded', boot);

async function boot() {
    // Cek QR token di URL
    const params = new URLSearchParams(location.search);
    const qrToken = params.get('t');
    if (qrToken) {
        history.replaceState({}, '', location.pathname);
        await loginWithQrToken(qrToken);
    }

    // Cek session yang tersimpan
    const { data: { session } } = await supabase.auth.getSession();
    if (session && !currentUser) {
        currentUser = session.user;
        await loadProfileAndMember();
        renderApp();
    } else if (!session) {
        renderLogin();
    }

    subscribeRealtime();
}

// ========== QR LOGIN ==========
async function loginWithQrToken(token) {
    try {
        const { data, error } = await supabase.rpc('login_by_qr', { p_token: token });
        if (error) throw error;

        const { email, password } = data;
        const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({ email, password });
        if (authErr) throw authErr;

        currentUser = authData.user;
        await loadProfileAndMember();
        renderApp();
        toast(`Selamat datang, ${currentMember?.name ?? ''}`);
    } catch (e) {
        console.error(e);
        toast(e.message || 'QR tidak valid / kadaluarsa', 'error');
    }
}

// ========== AUTH ==========
async function handleLoginAdmin(e) {
    e.preventDefault();
    const email = document.getElementById('admin-email').value.trim();
    const pass = document.getElementById('admin-pass').value;
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error) return toast(error.message, 'error');
    const { data: { user } } = await supabase.auth.getUser();
    currentUser = user;
    await loadProfileAndMember();
    if (currentProfile?.role !== 'admin') {
        await supabase.auth.signOut();
        return toast('Akun ini bukan admin', 'error');
    }
    renderApp();
    toast('Berhasil masuk sebagai Pengurus');
}

async function handleLoginMember(e) {
    e.preventDefault();
    const email = document.getElementById('member-email').value.trim();
    const pass = document.getElementById('member-pass').value;
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error) return toast(error.message, 'error');
    const { data: { user } } = await supabase.auth.getUser();
    currentUser = user;
    await loadProfileAndMember();
    if (!currentMember) {
        await supabase.auth.signOut();
        return toast('Akun ini bukan anggota', 'error');
    }
    renderApp();
    toast('Berhasil masuk');
}

async function logout() {
    await supabase.auth.signOut();
    currentUser = null; currentMember = null; currentProfile = null;
    renderLogin();
    toast('Anda telah keluar');
}

async function loadProfileAndMember() {
    if (!currentUser) return;
    const { data: prof } = await supabase.from('profiles').select('role').eq('user_id', currentUser.id).maybeSingle();
    const { data: mem } = await supabase.from('members').select('*').eq('user_id', currentUser.id).maybeSingle();
    currentProfile = prof;
    currentMember = mem;
}

// ========== RENDER ==========
function renderLogin() {
    document.getElementById('view-login').classList.remove('hidden');
    document.getElementById('view-admin-dashboard').classList.add('hidden');
    document.getElementById('view-member-dashboard').classList.add('hidden');
    const u = document.getElementById('user-info-section');
    u.classList.add('hidden'); u.classList.remove('flex');
}

function renderApp() {
    document.getElementById('view-login').classList.add('hidden');
    const u = document.getElementById('user-info-section');
    u.classList.remove('hidden'); u.classList.add('flex');
    document.getElementById('nav-username').innerText = currentMember?.name ?? currentUser.email;

    if (currentProfile?.role === 'admin') {
        document.getElementById('view-admin-dashboard').classList.remove('hidden');
        document.getElementById('view-member-dashboard').classList.add('hidden');
        loadMembers(); loadFinance(); loadAdmins();
    } else {
        document.getElementById('view-admin-dashboard').classList.add('hidden');
        document.getElementById('view-member-dashboard').classList.remove('hidden');
        renderMemberCard();
        loadFinanceForMember();
        loadMemberListForMembers();
    }
}

// ========== MEMBERS (ADMIN) ==========
async function loadMembers() {
    const { data, error } = await supabase.from('members').select('*').order('no_anggota');
    if (error) return toast(error.message, 'error');
    renderMembersList(data || []);
}

async function handleAddMember(e) {
    e.preventDefault();
    const editId = document.getElementById('edit-member-id').value;
    const name = document.getElementById('add-name').value.trim();
    const nik = document.getElementById('add-nik').value.trim();
    const baseRole = document.getElementById('add-role').value;
    const phone = document.getElementById('add-phone').value.trim();
    const email = document.getElementById('add-member-email')?.value.trim();
    const loper = document.getElementById('add-loper-location').value.trim() || '-';

    if (!/^\d{16}$/.test(nik)) return toast('NIK harus 16 digit', 'error');

    let finalRole = baseRole;
    if (baseRole === 'Seksi') {
        const s = document.getElementById('add-seksi-name').value.trim();
        finalRole = s ? `Seksi (${s})` : 'Seksi Bidang';
    }

    if (editId) {
        const { error } = await supabase.from('members')
            .update({ name, nik, role: finalRole, phone, loper })
            .eq('id', editId);
        if (error) return toast(error.message, 'error');
        toast('Data anggota diperbarui');
    } else {
        if (!email) return toast('Email wajib diisi', 'error');
        const tempPass = Math.random().toString(36).slice(-10) + 'Aa1!';
        const { data: signUp, error: sErr } = await supabase.auth.signUp({ email, password: tempPass });
        if (sErr) return toast(sErr.message, 'error');
        if (!signUp.user) return toast('Gagal membuat user (email mungkin terdaftar)', 'error');

        const { count } = await supabase.from('members').select('*', { count: 'exact', head: true });
        const nextNo = 'RMS-' + String((count || 0) + 1).padStart(3, '0');

        const { error } = await supabase.from('members').insert({
            user_id: signUp.user.id,
            no_anggota: nextNo, name, nik, role: finalRole, phone, loper,
        });
        if (error) return toast(error.message, 'error');

        await supabase.from('profiles').upsert({ user_id: signUp.user.id, role: 'member' });
        toast(`Anggota ${nextNo} ditambahkan. Password sementara: ${tempPass}`, 'warn');
    }

    cancelEditMember();
    await loadMembers();
}

async function editMember(id) {
    const { data: m } = await supabase.from('members').select('*').eq('id', id).single();
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
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteMember(id) {
    if (!confirm('Hapus anggota ini?')) return;
    const { error } = await supabase.from('members').delete().eq('id', id);
    if (error) return toast(error.message, 'error');
    await loadMembers();
    toast('Anggota dihapus');
}

function renderMembersList(members) {
    const c = document.getElementById('members-list-container');
    if (!members.length) {
        c.innerHTML = `<div class="text-center py-8 text-slate-400"><i class="fa-solid fa-users-slash text-3xl mb-2 block"></i><p class="text-xs">Belum ada data anggota.</p></div>`;
        return;
    }
    c.innerHTML = members.map(m => `
        <div class="flex items-center justify-between p-3 bg-amber-50/30 border border-amber-100/80 rounded-2xl gap-2">
            <div class="min-w-0">
                <h4 class="font-extrabold text-xs text-slate-800 truncate">
                    ${esc(m.name)}
                    <span class="text-[10px] bg-amber-100 text-amber-900 border border-amber-200 px-2 py-0.5 rounded-md ml-1 font-bold">${esc(m.no_anggota)}</span>
                </h4>
                <p class="text-[11px] text-slate-500 font-medium truncate">${esc(m.role)} · NIK: ${esc(m.nik)} · ${esc(m.loper || '-')}</p>
            </div>
            <div class="flex items-center space-x-1 shrink-0">
                <button onclick="generateMemberQr('${m.id}')" class="text-rms-green text-xs px-2 py-1.5 font-bold hover:bg-emerald-50 rounded-lg transition" title="Buat QR"><i class="fa-solid fa-qrcode"></i></button>
                <button onclick="editMember('${m.id}')" class="text-amber-700 text-xs px-2 py-1.5 font-bold hover:bg-amber-100 rounded-lg transition"><i class="fa-solid fa-pen"></i></button>
                <button onclick="deleteMember('${m.id}')" class="text-rose-500 text-xs px-2 py-1.5 font-bold hover:bg-rose-50 rounded-lg transition"><i class="fa-solid fa-trash"></i></button>
            </div>
        </div>
    `).join('');
}

// ========== QR GENERATOR ==========
async function generateMemberQr(memberId) {
    try {
        const { data: token, error } = await supabase.rpc('make_qr_token', { p_member_id: memberId });
        if (error) throw error;

        const url = `${location.origin}${location.pathname}?t=${token}`;
        const container = document.getElementById('qrcode-container');
        
        // Jika dipanggil dari admin list, kita tampilkan alert link-nya saja atau
        // jika container qr tersedia (di halaman anggota), tampilkan QR.
        if (!container || container.offsetParent === null) {
            alert(`Link Login QR:\n\n${url}\n\n(Berlaku 5 menit)`);
            return;
        }

        container.innerHTML = '';
        new QRCode(container, { text: url, width: 150, height: 150 });

        let sisa = 5 * 60;
        const el = document.getElementById('qr-countdown');
        if (qrTimer) clearInterval(qrTimer);
        el.innerText = 'Berlaku 05:00';
        qrTimer = setInterval(() => {
            sisa--;
            el.innerText = sisa > 0
                ? `Berlaku ${String(Math.floor(sisa/60)).padStart(2,'0')}:${String(sisa%60).padStart(2,'0')}`
                : 'Kadaluarsa — buat ulang';
            if (sisa <= 0) clearInterval(qrTimer);
        }, 1000);
    } catch (e) {
        toast(e.message || 'Gagal membuat QR', 'error');
    }
}

// ========== FINANCE ==========
async function loadFinance() {
    const { data, error } = await supabase.from('finance').select('*').order('created_at', { ascending: false });
    if (error) return toast(error.message, 'error');
    renderFinanceList(data || []);
    renderMemberFinanceView(data || []);
}

async function loadFinanceForMember() {
    const { data } = await supabase.from('finance').select('type, amount');
    renderMemberFinanceView(data || []);
}

async function handleTransaction(e) {
    e.preventDefault();
    const type = document.getElementById('trx-type').value;
    const amount = Number(document.getElementById('trx-amount').value);
    const description = document.getElementById('trx-desc').value.trim();
    if (!amount || amount <= 0) return toast('Jumlah > 0', 'error');

    const { error } = await supabase.from('finance').insert({ type, amount, description });
    if (error) return toast(error.message, 'error');

    e.target.reset();
    await loadFinance();
    toast('Transaksi dicatat');
}

async function deleteTransaction(id) {
    if (!confirm('Hapus transaksi ini?')) return;
    const { error } = await supabase.from('finance').delete().eq('id', id);
    if (error) return toast(error.message, 'error');
    await loadFinance();
    toast('Transaksi dihapus');
}

function renderFinanceList(finance) {
    const c = document.getElementById('finance-list-container');
    if (!finance.length) {
        c.innerHTML = `<div class="text-center py-8 text-slate-400"><i class="fa-solid fa-receipt text-3xl mb-2 block"></i><p class="text-xs">Belum ada catatan kas.</p></div>`;
    } else {
        c.innerHTML = finance.map(t => `
            <div class="flex items-center justify-between p-3 bg-amber-50/30 border border-amber-100/80 rounded-2xl gap-2">
                <div class="min-w-0">
                    <span class="text-[10px] font-black px-2 py-0.5 rounded-md ${t.type === 'Masuk' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">${esc(t.type)}</span>
                    <span class="font-bold text-xs text-slate-800 ml-1.5">${esc(t.description)}</span>
                    <p class="text-[11px] font-extrabold text-slate-700 mt-0.5">${fmtRp(t.amount)}</p>
                </div>
                <button onclick="deleteTransaction('${t.id}')" class="text-rose-500 text-xs px-2 py-1.5 font-bold hover:bg-rose-50 rounded-lg transition shrink-0"><i class="fa-solid fa-trash"></i></button>
            </div>
        `).join('');
    }
    const { income, expense, balance } = finance.reduce((acc, t) => {
        const amt = Number(t.amount) || 0;
        if (t.type === 'Masuk') acc.income += amt; else acc.expense += amt;
        acc.balance = acc.income - acc.expense;
        return acc;
    }, { income: 0, expense: 0, balance: 0 });
    document.getElementById('summary-income').innerText = fmtRp(income);
    document.getElementById('summary-expense').innerText = fmtRp(expense);
    document.getElementById('summary-balance').innerText = fmtRp(balance);
}

function renderMemberFinanceView(finance) {
    const { income, expense, balance } = finance.reduce((acc, t) => {
        const amt = Number(t.amount) || 0;
        if (t.type === 'Masuk') acc.income += amt; else acc.expense += amt;
        acc.balance = acc.income - acc.expense;
        return acc;
    }, { income: 0, expense: 0, balance: 0 });
    document.getElementById('member-summary-income').innerText = fmtRp(income);
    document.getElementById('member-summary-expense').innerText = fmtRp(expense);
    document.getElementById('member-summary-balance').innerText = fmtRp(balance);
}

// ========== MEMBER CARD & LIST ==========
function renderMemberCard() {
    if (!currentMember) return;
    document.getElementById('member-card-name').innerText = currentMember.name;
    document.getElementById('member-card-role').innerText = currentMember.role;
    document.getElementById('member-card-no').innerText = currentMember.no_anggota;
    document.getElementById('member-card-loper').innerText = currentMember.loper || '-';
    const qrContainer = document.getElementById('qrcode-container');
    if (qrContainer) qrContainer.innerHTML = '<p class="text-[10px] text-slate-400">Klik tombol di bawah</p>';
}

async function loadMemberListForMembers() {
    const { data } = await supabase.from('members').select('no_anggota, name, role');
    renderMemberListForMembers(data || []);
}

function renderMemberListForMembers(members) {
    const c = document.getElementById('member-view-members-list');
    const total = document.getElementById('member-total-count');
    if (total) total.innerText = `Total: ${members.length}`;
    if (!c) return;
    if (!members.length) { c.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">Belum ada anggota.</p>`; return; }
    c.innerHTML = members.map((m, i) => `
        <div class="flex items-center justify-between p-3 bg-amber-50/30 border border-amber-100/80 rounded-2xl gap-2">
            <div class="flex items-center space-x-2.5 min-w-0">
                <span class="w-6 h-6 bg-rms-green text-amber-300 rounded-lg flex items-center justify-center text-[10px] font-black shadow-sm shrink-0">${i + 1}</span>
                <h4 class="font-bold text-xs text-slate-800 truncate">${esc(m.name)} <span class="text-[10px] text-slate-400">(${esc(m.no_anggota)})</span></h4>
            </div>
            <span class="text-[10px] bg-amber-100 text-amber-900 border border-amber-200/60 font-bold px-2 py-0.5 rounded-lg shrink-0">${esc(m.role)}</span>
        </div>
    `).join('');
}

// ========== ADMINS ==========
async function loadAdmins() {
    const { data } = await supabase.from('profiles').select('user_id, role').eq('role', 'admin');
    const c = document.getElementById('admins-list-container');
    if (!data || !data.length) {
        c.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">Belum ada admin.</p>`;
        return;
    }
    c.innerHTML = data.map(a => `
        <div class="flex items-center justify-between p-3 bg-amber-50/30 border border-amber-100 rounded-2xl gap-2">
            <p class="text-[11px] text-slate-500 truncate">User ID: ${esc(a.user_id)}</p>
        </div>
    `).join('');
}

// ========== REALTIME ==========
function subscribeRealtime() {
    if (realtimeChannel) supabase.removeChannel(realtimeChannel);
    realtimeChannel = supabase
        .channel('rms-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, () => {
            if (currentProfile?.role === 'admin') loadMembers();
            else if (currentUser) loadMemberListForMembers();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'finance' }, () => {
            if (currentProfile?.role === 'admin') loadFinance();
            else if (currentUser) loadFinanceForMember();
        })
        .subscribe();
}

// ========== EXPORT REPORTS ==========
function exportMemberReport() {
    const area = document.getElementById('print-area');
    supabase.from('members').select('*').order('no_anggota').then(({ data }) => {
        const rows = (data || []).map((m, i) => `
            <tr><td>${i + 1}</td><td>${esc(m.no_anggota)}</td><td>${esc(m.name)}</td><td>${esc(m.nik)}</td><td>${esc(m.role)}</td><td>${esc(m.phone || '-')}</td><td>${esc(m.loper || '-')}</td></tr>
        `).join('');
        area.innerHTML = `
            <h1>Laporan Daftar Anggota</h1>
            <p class="report-meta">Kelompok Tani Riau Mandiri Sejahtera (RMS) · Dicetak ${new Date().toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' })}</p>
            <table>
                <thead><tr><th>#</th><th>No. Anggota</th><th>Nama</th><th>NIK</th><th>Jabatan</th><th>Telepon</th><th>Wilayah</th></tr></thead>
                <tbody>${rows}</tbody>
                <tfoot><tr class="total-row"><td colspan="7">Total: ${data.length} anggota</td></tr></tfoot>
            </table>`;
        area.classList.remove('hidden');
        window.print();
        setTimeout(() => { area.classList.add('hidden'); area.innerHTML = ''; }, 1000);
    });
}

function exportFinanceReport() {
    const area = document.getElementById('print-area');
    supabase.from('finance').select('*').order('created_at', { ascending: true }).then(({ data }) => {
        const rows = (data || []).map((t, i) => `
            <tr><td>${i + 1}</td><td>${esc(t.type)}</td><td>${esc(t.description)}</td><td style="text-align:right">${fmtRp(t.amount)}</td></tr>
        `).join('');
        const { income, expense, balance } = (data || []).reduce((acc, t) => {
            const amt = Number(t.amount) || 0;
            if (t.type === 'Masuk') acc.income += amt; else acc.expense += amt;
            acc.balance = acc.income - acc.expense;
            return acc;
        }, { income: 0, expense: 0, balance: 0 });
        
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
        area.classList.remove('hidden');
        window.print();
        setTimeout(() => { area.classList.add('hidden'); area.innerHTML = ''; }, 1000);
    });
}
