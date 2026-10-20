// KONFIGURASI DATABASE (Jangan diubah)
const SUPABASE_URL = "https://hihhduyzosdrzbvtxsts.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_FR47_uA2_HAesqrPGvzmoA_n0KL358W";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// STATE APLIKASI
let dbMembers = [];
let dbFinance = [];
let currentUser = null;

// ================= FUNGSI BANTU =================
const formatRp = (angka) => "Rp " + Number(angka).toLocaleString('id-ID');
const bukaHalaman = (id) => document.getElementById(id).classList.remove('hidden');
const tutupHalaman = (id) => document.getElementById(id).classList.add('hidden');

// ================= LOGIN & AUTH =================
function switchLoginTab(type) {
    const btnAdmin = document.getElementById('tab-admin');
    const btnMember = document.getElementById('tab-member');
    const formAdmin = document.getElementById('form-login-admin');
    const formMember = document.getElementById('form-login-member');

    if (type === 'admin') {
        btnAdmin.className = "flex-1 py-2 text-xs font-bold rounded-xl bg-green-900 text-white shadow-sm transition";
        btnMember.className = "flex-1 py-2 text-xs font-bold rounded-xl text-slate-500 transition";
        formAdmin.classList.remove('hidden'); formMember.classList.add('hidden');
    } else {
        btnMember.className = "flex-1 py-2 text-xs font-bold rounded-xl bg-amber-500 text-white shadow-sm transition";
        btnAdmin.className = "flex-1 py-2 text-xs font-bold rounded-xl text-slate-500 transition";
        formMember.classList.remove('hidden'); formAdmin.classList.add('hidden');
    }
}

function handleLoginAdmin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    // Login bypass untuk demo (bisa disesuaikan nanti)
    currentUser = { role: 'admin', nama: 'Pengurus RMS', email: email };
    masukDasbor();
}

function handleLoginMember(e) {
    e.preventDefault();
    const nik = document.getElementById('login-nik').value;
    const member = dbMembers.find(m => m.nik === nik);
    if (member) {
        currentUser = { role: 'member', ...member };
        masukDasbor();
    } else {
        alert('NIK tidak ditemukan!');
    }
}

function masukDasbor() {
    tutupHalaman('halaman-login');
    bukaHalaman('halaman-dasbor');
    document.getElementById('nav-user').innerText = "Halo, " + (currentUser.nama || 'User').split(' ')[0];
    
    if (currentUser.role === 'admin') {
        bukaHalaman('view-admin'); tutupHalaman('view-member');
        renderAnggota(); renderKas();
    } else {
        bukaHalaman('view-member'); tutupHalaman('view-admin');
        renderKartuAnggota();
    }
}

function logout() {
    currentUser = null;
    tutupHalaman('halaman-dasbor');
    bukaHalaman('halaman-login');
}

// ================= FITUR SCAN KTP OTOMATIS =================
async function prosesScanKTP(event) {
    const file = event.target.files[0];
    if (!file) return;

    const status = document.getElementById('scan-status');
    status.classList.remove('hidden');

    try {
        // Proses membaca gambar menggunakan Tesseract (Bahasa Indonesia)
        const { data: { text } } = await Tesseract.recognize(file, 'ind');
        
        // Logika Pintar Mencari NIK (16 digit angka berurutan)
        const nikMatch = text.match(/\b\d{16}\b/);
        if (nikMatch) {
            document.getElementById('input-nik').value = nikMatch[0];
        }

        // Logika Pintar Mencari Nama
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 3);
        let namaDitemukan = "";
        
        for (let i = 0; i < lines.length; i++) {
            // Cari baris yang mengandung kata "Nama"
            if (lines[i].toUpperCase().includes('NAMA')) {
                let teksNama = lines[i].replace(/NAMA/i, '').replace(/[:;]/g, '').trim();
                if (teksNama.length > 2) {
                    namaDitemukan = teksNama;
                } else if (lines[i+1] && !lines[i+1].match(/\d/)) {
                    // Jika nama ada di baris bawahnya
                    namaDitemukan = lines[i+1];
                }
                break;
            }
        }

        // Jika tidak ada tulisan "Nama", cari baris huruf kapital terpanjang di atas NIK
        if (!namaDitemukan) {
            const barisKapital = lines.filter(l => /^[A-Z\s]{4,}$/.test(l) && !l.includes('PROVINSI') && !l.includes('KABUPATEN') && !l.includes('KOTA'));
            if (barisKapital.length > 0) namaDitemukan = barisKapital[0];
        }

        if (namaDitemukan) {
            document.getElementById('input-nama').value = namaDitemukan.toUpperCase();
        }

        alert("Scan Selesai! Silakan periksa kembali kolom Nama dan NIK sebelum disimpan.");
    } catch (error) {
        alert("Gagal membaca KTP. Pastikan foto jelas dan tidak silau.");
        console.error(error);
    } finally {
        status.classList.add('hidden');
        event.target.value = ''; // Reset input file
    }
}

// ================= FITUR MANAJEMEN ANGGOTA =================
function simpanAnggota(e) {
    e.preventDefault();
    const editId = document.getElementById('edit-id').value;
    const nama = document.getElementById('input-nama').value;
    const nik = document.getElementById('input-nik').value;
    const jabatan = document.getElementById('input-jabatan').value;
    const hp = document.getElementById('input-hp').value;

    if (nik.length !== 16) {
        alert('NIK harus tepat 16 digit!');
        return;
    }

    if (editId) {
        // Mode Edit
        const index = dbMembers.findIndex(m => m.id === editId);
        dbMembers[index] = { id: editId, nama, nik, jabatan, hp, noAnggota: dbMembers[index].noAnggota };
    } else {
        // Mode Tambah Baru
        const noBaru = 'RMS-' + String(dbMembers.length + 1).padStart(3, '0');
        dbMembers.push({ id: Date.now().toString(), noAnggota: noBaru, nama, nik, jabatan, hp });
    }

    resetFormAnggota();
    renderAnggota();
    alert('Data Anggota Berhasil Disimpan!');
}

function renderAnggota() {
    const container = document.getElementById('list-anggota');
    container.innerHTML = dbMembers.length ? '' : '<p class="text-xs text-slate-400 text-center">Belum ada data.</p>';
    
    dbMembers.forEach((m, i) => {
        container.innerHTML += `
            <div class="flex justify-between items-center p-3 border border-slate-100 bg-slate-50 rounded-2xl">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 bg-green-100 text-green-800 rounded-full flex items-center justify-center font-bold text-xs">${i+1}</div>
                    <div>
                        <h4 class="text-xs font-bold text-slate-800">${m.nama} <span class="text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded ml-1">${m.noAnggota}</span></h4>
                        <p class="text-[10px] text-slate-500 mt-0.5">${m.jabatan} · NIK: ${m.nik}</p>
                    </div>
                </div>
                <div class="flex gap-1">
                    <button onclick="editAnggota('${m.id}')" class="w-7 h-7 bg-amber-100 text-amber-600 rounded-lg flex items-center justify-center"><i class="fa-solid fa-pen text-[10px]"></i></button>
                    <button onclick="hapusAnggota('${m.id}')" class="w-7 h-7 bg-rose-100 text-rose-600 rounded-lg flex items-center justify-center"><i class="fa-solid fa-trash text-[10px]"></i></button>
                </div>
            </div>
        `;
    });
}

function editAnggota(id) {
    const m = dbMembers.find(x => x.id === id);
    if (!m) return;
    document.getElementById('edit-id').value = m.id;
    document.getElementById('input-nama').value = m.nama;
    document.getElementById('input-nik').value = m.nik;
    document.getElementById('input-jabatan').value = m.jabatan;
    document.getElementById('input-hp').value = m.hp;
    document.getElementById('form-title').innerText = "Edit Data Anggota";
    document.getElementById('btn-cancel').classList.remove('hidden');
}

function resetFormAnggota() {
    document.getElementById('form-member').reset();
    document.getElementById('edit-id').value = "";
    document.getElementById('form-title').innerText = "Pendaftaran Anggota";
    document.getElementById('btn-cancel').classList.add('hidden');
}

function hapusAnggota(id) {
    if (confirm('Yakin ingin menghapus anggota ini?')) {
        dbMembers = dbMembers.filter(m => m.id !== id);
        renderAnggota();
    }
}

// ================= FITUR KEUANGAN =================
function simpanKas(e) {
    e.preventDefault();
    const jenis = document.getElementById('kas-jenis').value;
    const jumlah = Number(document.getElementById('kas-jumlah').value);
    const ket = document.getElementById('kas-ket').value;

    dbFinance.push({ id: Date.now().toString(), jenis, jumlah, ket });
    document.getElementById('kas-jumlah').value = '';
    document.getElementById('kas-ket').value = '';
    
    renderKas();
    alert('Transaksi Dicatat!');
}

function renderKas() {
    const container = document.getElementById('list-kas');
    let masuk = 0, keluar = 0;
    
    container.innerHTML = dbFinance.length ? '' : '<p class="text-xs text-slate-400 text-center">Belum ada transaksi.</p>';

    dbFinance.forEach(t => {
        if (t.jenis === 'Masuk') masuk += t.jumlah; else keluar += t.jumlah;
        container.innerHTML += `
            <div class="flex justify-between items-center p-3 border border-slate-100 bg-slate-50 rounded-2xl">
                <div>
                    <span class="text-[9px] font-bold px-1.5 py-0.5 rounded ${t.jenis === 'Masuk' ? 'bg-green-100 text-green-800' : 'bg-rose-100 text-rose-800'}">${t.jenis}</span>
                    <span class="text-xs font-bold text-slate-800 ml-1">${t.ket}</span>
                    <p class="text-[10px] font-bold text-slate-700 mt-1">${formatRp(t.jumlah)}</p>
                </div>
                <button onclick="hapusKas('${t.id}')" class="text-rose-500 hover:text-rose-700"><i class="fa-solid fa-trash text-xs"></i></button>
            </div>
        `;
    });

    document.getElementById('total-masuk').innerText = formatRp(masuk);
    document.getElementById('total-keluar').innerText = formatRp(keluar);
    document.getElementById('saldo-kas').innerText = formatRp(masuk - keluar);
}

function hapusKas(id) {
    if (confirm('Hapus transaksi ini?')) {
        dbFinance = dbFinance.filter(t => t.id !== id);
        renderKas();
    }
}

// ================= FITUR KARTU ANGGOTA =================
function renderKartuAnggota() {
    document.getElementById('member-nama').innerText = currentUser.nama;
    document.getElementById('member-jabatan').innerText = currentUser.jabatan;
    document.getElementById('member-no').innerText = currentUser.noAnggota;
    
    // Bikin QR Code
    document.getElementById('qrcode').innerHTML = "";
    new QRCode(document.getElementById("qrcode"), {
        text: "RMS|" + currentUser.nik + "|" + currentUser.noAnggota,
        width: 60, height: 60
    });
}

function switchAdminTab(tab) {
    if (tab === 'members') {
        bukaHalaman('tab-members'); tutupHalaman('tab-finance');
        document.getElementById('btn-tab-members').className = "flex-1 py-2.5 bg-green-800 text-white font-bold text-xs rounded-xl shadow flex items-center justify-center gap-2 transition";
        document.getElementById('btn-tab-finance').className = "flex-1 py-2.5 text-slate-500 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition";
    } else {
        tutupHalaman('tab-members'); bukaHalaman('tab-finance');
        document.getElementById('btn-tab-finance').className = "flex-1 py-2.5 bg-green-800 text-white font-bold text-xs rounded-xl shadow flex items-center justify-center gap-2 transition";
        document.getElementById('btn-tab-members').className = "flex-1 py-2.5 text-slate-500 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition";
    }
            }
