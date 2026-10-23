// CONFIG SUPABASE
const SUPABASE_URL = "https://hihhduyzosdrzbvtxsts.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_FR47_uA2_HAesqrPGvzmoA_n0KL358W";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const PUBLIC_URL = "https://Kelompoktani.github.io/Riau-Mandiri-Sejaterah/";

let dbMembers = [];
let dbFinance = [];
let currentUser = JSON.parse(localStorage.getItem('rms_current_user')) || null;

// UTILITIES
const esc = str => str ? String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : '';
const fmtRp = n => 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');

// SANITASI LINK BUKTI TRANSAKSI (Mencegah XSS & Link Jahat)
const safeLink = u => /^https:\/\//i.test(u) ? u : '#';

function toast(msg, type = 'success') {
    const c = document.getElementById('toast-container');
    if (!c) return;
    const t = document.createElement('div');
    t.className = 'toast' + (type !== 'success' ? ' ' + type : '');
    const icon = type === 'error' ? 'fa-circle-xmark' : type === 'warn' ? 'fa-triangle-exclamation' : 'fa-circle-check';
    t.innerHTML = `<i class="fa-solid ${icon}"></i><span>${esc(msg)}</span>`;
    c.appendChild(t);
    setTimeout(() => {
        t.style.opacity = '0'; t.style.transform = 'translateY(20px)';
        setTimeout(() => t.remove(), 300);
    }, 2800);
}

// DEBOUNCE SYNC CLOUD (Mencegah Pemanggilan Berulang dari Realtime)
let syncTimeout = null;
function syncCloudDataDebounced() {
    clearTimeout(syncTimeout);
    syncTimeout = setTimeout(syncCloudData, 400);
}

async function syncCloudData() {
    updateSyncBadge('Menyinkronkan…', false);
    try {
        // Ambil Data Anggota (Public Data saja untuk keamanan)
        const { data: members, error: errM } = await supabaseClient
            .from('members_public')
            .select('*')
            .order('created_at', { ascending: true });
            
        if (errM) throw errM;
        dbMembers = members || [];

        // Ambil Data Keuangan
        const { data: finance, error: errF } = await supabaseClient
            .from('transactions')
            .select('*')
            .order('created_at', { ascending: false });
            
        if (errF) throw errF;
        dbFinance = finance || [];

        updateSyncBadge('Cloud Online', true);
        if (currentUser) renderApp();
        else populateECardDropdown();
    } catch (err) {
        console.error('Sync error:', err);
        updateSyncBadge('Offline', false);
    }
}

function updateSyncBadge(text, ok) {
    const textEl = document.getElementById('sync-text');
    if (textEl) textEl.innerText = text;
    const b = document.getElementById('sync-badge');
    if (b) {
        b.className = ok
            ? "bg-emerald-950/50 border border-amber-300/40 text-amber-200 text-[10px] sm:text-xs px-2.5 py-1.5 rounded-full font-semibold shadow backdrop-blur-sm"
            : "bg-amber-900/50 border border-amber-400/40 text-amber-100 text-[10px] sm:text-xs px-2.5 py-1.5 rounded-full font-semibold shadow backdrop-blur-sm";
    }
}

// REALTIME SUBSCRIPTION
function subscribeRealtimeCloud() {
    supabaseClient
        .channel('public:db_changes')
        .on('postgres_changes', { event: '*', schema: 'public' }, () => syncCloudDataDebounced())
        .subscribe();
}

// AUTHENTICATION (SUPABASE AUTH)
async function handleLoginAdmin(e) {
    e.preventDefault();
    const email = document.getElementById('admin-email').value.trim();
    const password = document.getElementById('admin-pass').value.trim();

    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;

        currentUser = { role: 'admin', email: data.user.email, name: data.user.email.split('@')[0] };
        localStorage.setItem('rms_current_user', JSON.stringify(currentUser));
        renderApp();
        toast('Berhasil masuk sebagai Pengurus');
    } catch (err) {
        toast('Login Pengurus gagal: Kata sandi / email salah', 'error');
    }
}

async function handleLoginMember(e) {
    e.preventDefault();
    const inputKey = document.getElementById('member-no-id').value.trim();
    const pin = document.getElementById('member-pin').value.trim();

    const found = dbMembers.find(m => 
        m.no_anggota.toUpperCase() === inputKey.toUpperCase() || 
        m.token === inputKey || 
        m.id === inputKey
    );

    if (found) {
        if (found.pin && found.pin !== pin) {
            toast('PIN Keamanan Salah!', 'error');
            return;
        }
        currentUser = { role: 'member', ...found };
        localStorage.setItem('rms_current_user', JSON.stringify(currentUser));
        renderApp();
        toast(`Selamat datang, ${found.name}`);
    } else {
        toast('Nomor Anggota / Token Kunci tidak ditemukan', 'error');
    }
}

function logout() {
    supabaseClient.auth.signOut();
    currentUser = null;
    localStorage.removeItem('rms_current_user');
    document.getElementById('view-login').classList.remove('hidden');
    document.getElementById('view-admin-dashboard').classList.add('hidden');
    document.getElementById('view-member-dashboard').classList.add('hidden');
    document.getElementById('user-info-section').classList.add('hidden');
    toast('Anda telah keluar');
}

// CRUD MEMBER
async function handleAddMember(e) {
    e.preventDefault();
    const editId = document.getElementById('edit-member-id').value;
    const name = document.getElementById('add-name').value.trim();
    const nik = document.getElementById('add-nik').value.trim();
    const role = document.getElementById('add-role').value;
    const phone = document.getElementById('add-phone').value.trim();
    const loper = document.getElementById('add-loper-location').value.trim() || '-';

    if (!/^\d{16}$/.test(nik)) { toast('NIK harus 16 digit angka', 'error'); return; }

    try {
        if (editId) {
            // Update Public Info
            const { error: err1 } = await supabaseClient.from('members_public').update({ name, role, loper }).eq('id', editId);
            if (err1) throw err1;
            // Update Private Info (NIK/Telp)
            const { error: err2 } = await supabaseClient.from('members_private').update({ nik, phone }).eq('member_id', editId);
            if (err2) throw err2;
            toast('Data anggota diperbarui');
        } else {
            // Insert Public
            const randomDigits = Math.floor(100000 + Math.random() * 900000);
            const no_anggota = `RMS-${randomDigits}`;
            const { data: newPub, error: err1 } = await supabaseClient.from('members_public').insert([{ no_anggota, name, role, loper }]).select().single();
            if (err1) throw err1;

            // Insert Private
            const { error: err2 } = await supabaseClient.from('members_private').insert([{ member_id: newPub.id, nik, phone }]);
            if (err2) throw err2;
            toast(`Anggota terdaftar (${no_anggota})`);
        }
        await syncCloudData();
        cancelEditMember();
    } catch (err) {
        toast('Gagal menyimpan data anggota', 'error');
    }
}

async function editMember(id) {
    try {
        const mPub = dbMembers.find(m => m.id === id);
        if (!mPub) return;

        // Ambil Data NIK & Telp Rahasia dari members_private
        const { data: mPriv, error } = await supabaseClient.from('members_private').select('*').eq('member_id', id).single();
        if (error) throw error;

        document.getElementById('edit-member-id').value = mPub.id;
        document.getElementById('add-name').value = mPub.name;
        document.getElementById('add-role').value = mPub.role;
        document.getElementById('add-loper-location').value = mPub.loper;
        document.getElementById('add-nik').value = mPriv.nik;
        document.getElementById('add-phone').value = mPriv.phone;

        document.getElementById('form-member-title').innerText = 'Edit Data Anggota';
        document.getElementById('btn-save-member').innerText = 'Simpan Perubahan';
        document.getElementById('btn-cancel-edit-member').classList.remove('hidden');
    } catch (err) {
        toast('Gagal mengambil data privat (Hanya Admin)', 'error');
    }
}

function cancelEditMember() {
    document.getElementById('form-member-input').reset();
    document.getElementById('edit-member-id').value = '';
    document.getElementById('form-member-title').innerText = 'Pendaftaran Anggota Baru';
    document.getElementById('btn-save-member').innerText = 'Simpan Anggota Baru';
    document.getElementById('btn-cancel-edit-member').classList.add('hidden');
}

async function deleteMember(id) {
    if (!confirm('Hapus anggota ini selamanya?')) return;
    try {
        const { error } = await supabaseClient.from('members_public').delete().eq('id', id);
        if (error) throw error;
        toast('Anggota berhasil dihapus');
        await syncCloudData();
    } catch (err) {
        toast('Gagal menghapus anggota', 'error');
    }
}

// TRANSAKSI KEUANGAN
async function handleTransaction(e) {
    e.preventDefault();
    const type = document.getElementById('trx-type').value;
    const amount = Number(document.getElementById('trx-amount').value);
    const description = document.getElementById('trx-desc').value.trim();
    const fileInput = document.getElementById('trx-file');

    let proof_path = null;
    if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        const fileName = `${Date.now()}_${file.name}`;
        
        // Upload Bukti ke Private Bucket
        const { data: upData, error: upErr } = await supabaseClient.storage.from('proofs').upload(fileName, file);
        if (upErr) {
            toast('Upload bukti transaksi gagal! Transaksi dibatalkan.', 'error');
            return;
        }
        proof_path = fileName;
    }

    try {
        const { error } = await supabaseClient.from('transactions').insert([{ type, amount, description, proof_path }]);
        if (error) throw error;
        toast('Transaksi berhasil dicatat');
        e.target.reset();
        await syncCloudData();
    } catch (err) {
        toast('Gagal mencatat transaksi', 'error');
    }
}

async function deleteTransaction(id) {
    if (!confirm('Hapus catatan kas ini?')) return;
    try {
        const { error } = await supabaseClient.from('transactions').delete().eq('id', id);
        if (error) throw error;
        toast('Transaksi dihapus');
        await syncCloudData();
    } catch (err) {
        toast('Gagal menghapus transaksi', 'error');
    }
}

// UNDUH ZIP MASSAL (JSZip)
async function downloadAllECardsZip() {
    if (!dbMembers.length) { toast('Belum ada data anggota!', 'warn'); return; }
    toast('Menyiapkan berkas ZIP massal...');

    const zip = new JSZip();
    const folder = zip.folder("E-Cards_RMS");

    for (let i = 0; i < dbMembers.length; i++) {
        const m = dbMembers[i];
        const canvas = await generateCardCanvasElement(m);
        const dataUrl = canvas.toDataURL("image/png");
        const base64Data = dataUrl.replace(/^data:image\/(png|jpg);base64,/, "");
        folder.file(`E-Card_${m.name.replace(/\s+/g,'_')}.png`, base64Data, { base64: true });
    }

    zip.generateAsync({ type: "blob" }).then(content => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(content);
        a.download = `E-Cards_RMS_Massal.zip`;
        a.click();
        toast('ZIP Massal berhasil diunduh!');
    });
}

function generateCardCanvasElement(m) {
    return new Promise(resolve => {
        const hiddenArea = document.getElementById('export-card-hidden-area');
        const tokenKey = m.token || m.no_anggota;
        const qrUrl = PUBLIC_URL + "?no_anggota=" + encodeURIComponent(tokenKey);

        hiddenArea.innerHTML = `
            <div id="temp-card" style="width:380px; padding:24px; background:linear-gradient(135deg, #1E5E3A 0%, #0F3D24 100%); color:#ffffff; border-radius:24px; border:3px solid #E5A93C; font-family:'Plus Jakarta Sans', sans-serif;">
                <div style="display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.2); padding-bottom:12px; margin-bottom:16px;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <img src="./logo.jpg" style="width:38px; height:38px; border-radius:50%; object-fit:cover;" />
                        <div>
                            <p style="margin:0; font-size:9px; font-weight:800; color:#FDE68A;">KELOMPOK TANI</p>
                            <h3 style="margin:0; font-size:13px; font-weight:900; color:#ffffff;">RIAU MANDIRI SEJAHTERA</h3>
                        </div>
                    </div>
                    <span style="background:#F59E0B; color:#0F3D24; font-size:9px; font-weight:900; padding:3px 8px; border-radius:99px;">E-CARD</span>
                </div>
                <div style="font-size:12px; margin-bottom:16px; line-height:1.6;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                        <span style="color:#A7F3D0;">Nama Anggota</span>
                        <strong style="font-size:13px; color:#FDE68A;">${esc(m.name)}</strong>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                        <span style="color:#A7F3D0;">Jabatan</span>
                        <span style="background:rgba(255,255,255,0.15); padding:1px 6px; border-radius:4px; font-weight:bold;">${esc(m.role)}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between;">
                        <span style="color:#A7F3D0;">Nomor Unik</span>
                        <span style="font-family:monospace; color:#FDE68A; background:rgba(0,0,0,0.3); padding:1px 6px; border-radius:4px;">${esc(m.no_anggota)}</span>
                    </div>
                </div>
                <div style="background:#ffffff; padding:16px; border-radius:16px; text-align:center;">
                    <img src="https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(qrUrl)}" style="width:140px; height:140px; display:block; margin:0 auto;" />
                </div>
            </div>
        `;

        setTimeout(() => {
            html2canvas(document.getElementById('temp-card'), { scale: 2, useCORS: true }).then(canvas => {
                hiddenArea.innerHTML = '';
                resolve(canvas);
            });
        }, 300);
    });
}

function downloadSingleECard(id) {
    const m = dbMembers.find(x => x.id === id);
    if (!m) return;
    toast('Mengunduh E-Card...');
    generateCardCanvasElement(m).then(canvas => {
        const link = document.createElement('a');
        link.download = `E-Card_${m.name.replace(/\s+/g,'_')}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        toast('Selesai diunduh!');
    });
}

function downloadSelectedSingleECard() {
    const selectedId = document.getElementById('select-single-member-ecard').value;
    if (!selectedId) { toast('Pilih anggota terlebih dahulu', 'warn'); return; }
    downloadSingleECard(selectedId);
}

// RENDERING DAFTAR & NAVIGATION
function renderApp() {
    document.getElementById('view-login').classList.add('hidden');
    document.getElementById('user-info-section').classList.remove('hidden');
    document.getElementById('user-info-section').classList.add('flex');
    document.getElementById('nav-username').innerText = currentUser.name;

    if (currentUser.role === 'admin') {
        document.getElementById('view-admin-dashboard').classList.remove('hidden');
        document.getElementById('view-member-dashboard').classList.add('hidden');
        renderMembersList(); renderFinanceList(); populateECardDropdown();
    } else {
        document.getElementById('view-admin-dashboard').classList.add('hidden');
        document.getElementById('view-member-dashboard').classList.remove('hidden');
        renderMemberCard(); renderMemberFinanceView();
    }
}

function switchLoginTab(type) {
    const aBtn = document.getElementById('tab-btn-admin');
    const mBtn = document.getElementById('tab-btn-member');
    const aForm = document.getElementById('form-login-admin');
    const mForm = document.getElementById('form-login-member');
    if (type === 'admin') {
        aBtn.classList.add('active'); mBtn.classList.remove('active');
        aForm.classList.remove('hidden'); mForm.classList.add('hidden');
    } else {
        mBtn.classList.add('active'); aBtn.classList.remove('active');
        mForm.classList.remove('hidden'); aForm.classList.add('hidden');
    }
}

function switchAdminTab(tab) {
    ['members','finance'].forEach(t => {
        document.getElementById(`admin-tab-${t}`)?.classList.remove('active');
        document.getElementById(`content-admin-${t}`)?.classList.add('hidden');
    });
    document.getElementById(`admin-tab-${tab}`).classList.add('active');
    document.getElementById(`content-admin-${tab}`).classList.remove('hidden');
}

function populateECardDropdown() {
    const select = document.getElementById('select-single-member-ecard');
    if (!select) return;
    select.innerHTML = '<option value="">-- Pilih Anggota --</option>' + 
        dbMembers.map(m => `<option value="${m.id}">${esc(m.name)} (${esc(m.no_anggota)})</option>`).join('');
}

function renderMembersList() {
    const c = document.getElementById('members-list-container');
    if (!dbMembers.length) {
        c.innerHTML = `<p class="text-xs text-slate-400 text-center py-6">Belum ada data anggota.</p>`;
        return;
    }
    c.innerHTML = dbMembers.map(m => `
        <div class="flex items-center justify-between p-3 bg-amber-50/30 border border-amber-100/80 rounded-2xl gap-2">
            <div class="min-w-0">
                <h4 class="font-extrabold text-xs text-slate-800 truncate">
                    ${esc(m.name)}
                    <span class="text-[10px] bg-amber-100 text-amber-900 border border-amber-200 px-2 py-0.5 rounded-md ml-1 font-bold font-mono">${esc(m.no_anggota)}</span>
                </h4>
                <p class="text-[11px] text-slate-500 font-medium truncate">${esc(m.role)} · Wilayah: ${esc(m.loper)}</p>
            </div>
            <div class="flex items-center space-x-1 shrink-0">
                <button onclick="downloadSingleECard('${m.id}')" class="text-emerald-800 text-xs px-2.5 py-1.5 font-bold bg-emerald-50 hover:bg-emerald-100 rounded-lg transition border border-emerald-200"><i class="fa-solid fa-id-card"></i></button>
                <button onclick="editMember('${m.id}')" class="text-amber-700 text-xs px-2 py-1.5 font-bold hover:bg-amber-100 rounded-lg transition"><i class="fa-solid fa-pen"></i></button>
                <button onclick="deleteMember('${m.id}')" class="text-rose-500 text-xs px-2 py-1.5 font-bold hover:bg-rose-50 rounded-lg"><i class="fa-solid fa-trash"></i></button>
            </div>
        </div>
    `).join('');
}

async function renderFinanceList() {
    const c = document.getElementById('finance-list-container');
    if (!dbFinance.length) {
        c.innerHTML = `<p class="text-xs text-slate-400 text-center py-6">Belum ada catatan kas.</p>`;
        return;
    }

    let html = '';
    for (let t of dbFinance) {
        let signedUrl = '#';
        if (t.proof_path) {
            // Ambil Signed URL sementara (1 jam) untuk Bucket Private
            const { data } = await supabaseClient.storage.from('proofs').createSignedUrl(t.proof_path, 3600);
            if (data) signedUrl = data.signedUrl;
        }

        html += `
            <div class="flex items-center justify-between p-3 bg-amber-50/30 border border-amber-100/80 rounded-2xl gap-2">
                <div class="min-w-0">
                    <span class="text-[10px] font-black px-2 py-0.5 rounded-md ${t.type === 'Masuk' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">${esc(t.type)}</span>
                    <span class="font-bold text-xs text-slate-800 ml-1.5">${esc(t.description)}</span>
                    <p class="text-[11px] font-extrabold text-slate-700 mt-0.5">${fmtRp(t.amount)}</p>
                    ${t.proof_path ? `<a href="${safeLink(signedUrl)}" target="_blank" rel="noopener" class="text-[10px] text-blue-600 underline font-bold"><i class="fa-solid fa-paperclip"></i> Lihat Bukti (Tergembok)</a>` : ''}
                </div>
                <button onclick="deleteTransaction('${t.id}')" class="text-rose-500 text-xs px-2 py-1.5 font-bold hover:bg-rose-50 rounded-lg"><i class="fa-solid fa-trash"></i></button>
            </div>
        `;
    }
    c.innerHTML = html;

    const income = dbFinance.filter(t => t.type === 'Masuk').reduce((acc, t) => acc + Number(t.amount), 0);
    const expense = dbFinance.filter(t => t.type === 'Keluar').reduce((acc, t) => acc + Number(t.amount), 0);
    document.getElementById('summary-income').innerText = fmtRp(income);
    document.getElementById('summary-expense').innerText = fmtRp(expense);
    document.getElementById('summary-balance').innerText = fmtRp(income - expense);
}

function renderMemberCard() {
    const userNo = currentUser.no_anggota || currentUser.id;
    document.getElementById('member-card-name').innerText = currentUser.name || '-';
    document.getElementById('member-card-role').innerText = currentUser.role || '-';
    document.getElementById('member-card-no').innerText = userNo;
    document.getElementById('member-card-loper').innerText = currentUser.loper || '-';
    
    const container = document.getElementById('qrcode-container');
    if (!container) return;
    container.innerHTML = '';

    const targetUrl = PUBLIC_URL + "?no_anggota=" + encodeURIComponent(currentUser.token || userNo);
    new QRCode(container, { text: targetUrl, width: 140, height: 140 });
}

function renderMemberFinanceView() {
    const income = dbFinance.filter(t => t.type === 'Masuk').reduce((acc, t) => acc + Number(t.amount), 0);
    const expense = dbFinance.filter(t => t.type === 'Keluar').reduce((acc, t) => acc + Number(t.amount), 0);
    document.getElementById('member-summary-income').innerText = fmtRp(income);
    document.getElementById('member-summary-expense').innerText = fmtRp(expense);
    document.getElementById('member-summary-balance').innerText = fmtRp(income - expense);
}

// EKSPOR LAPORAN PDF (jsPDF + autoTable)
function exportMemberReport() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.text("Laporan Anggota Kelompok Tani RMS", 14, 15);
    doc.autoTable({
        startY: 20,
        head: [['#', 'No. Anggota', 'Nama Anggota', 'Jabatan', 'Wilayah']],
        body: dbMembers.map((m, i) => [i + 1, m.no_anggota, m.name, m.role, m.loper])
    });
    doc.save('Laporan_Anggota_RMS.pdf');
}

function exportFinanceReport() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.text("Laporan Transaksi Kas Kelompok Tani RMS", 14, 15);
    doc.autoTable({
        startY: 20,
        head: [['#', 'Jenis', 'Keterangan', 'Jumlah']],
        body: dbFinance.map((t, i) => [i + 1, t.type, t.description, fmtRp(t.amount)])
    });
    doc.save('Laporan_Keuangan_RMS.pdf');
}

// INITIALIZATION
window.onload = async () => {
    await syncCloudData();
    subscribeRealtimeCloud();
};
