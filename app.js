/* ===== E-CARD VERSI BARU (digambar langsung, hasil sama persis dengan tampilan kartu) ===== */
function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function loadImg(src) {
    return new Promise(res => {
        if (!src) return res(null);
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = () => res(null);
        i.src = src;
    });
}

function fitFont(ctx, text, weight, size, family, maxW) {
    let s = size;
    ctx.font = `${weight} ${s}px ${family}`;
    while (ctx.measureText(text).width > maxW && s > 18) {
        s -= 2;
        ctx.font = `${weight} ${s}px ${family}`;
    }
}

async function buildCardCanvas(m) {
    const F = '"Plus Jakarta Sans", "Segoe UI", Arial, sans-serif';
    try {
        await Promise.all(['400', '500', '700', '800', '900'].map(w => document.fonts.load(`${w} 36px "Plus Jakarta Sans"`)));
    } catch (e) { /* pakai font cadangan */ }

    const [logoImg, qrImg] = await Promise.all([
        getLogoSrc().then(loadImg),
        loadImg(qrDataUrl(`${PUBLIC_URL}?t=${authOf(m).token}`, 430))
    ]);

    const M = 30, W = 1080, H = 1540, PAD = 48;
    const canvas = document.createElement('canvas');
    canvas.width = W + M * 2;
    canvas.height = H + M * 2;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.translate(M, M);
    ctx.textBaseline = 'middle';

    // Latar kartu
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#1E5E3A');
    g.addColorStop(0.5, '#0F3D24');
    g.addColorStop(1, '#1E5E3A');
    rrect(ctx, 0, 0, W, H, 64);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(252,211,77,0.35)';
    ctx.stroke();

    // Logo
    const lx = PAD + 72, ly = 139;
    ctx.beginPath(); ctx.arc(lx, ly, 72, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = '#FCD34D'; ctx.stroke();
    if (logoImg) {
        ctx.save();
        ctx.beginPath(); ctx.arc(lx, ly, 66, 0, Math.PI * 2); ctx.clip();
        const d = 132;
        const sc = Math.max(d / logoImg.width, d / logoImg.height);
        const w = logoImg.width * sc, h = logoImg.height * sc;
        ctx.drawImage(logoImg, lx - w / 2, ly - h / 2, w, h);
        ctx.restore();
    }

    // Judul
    ctx.textAlign = 'left';
    ctx.fillStyle = '#FCD34D';
    ctx.font = `800 28px ${F}`;
    ctx.letterSpacing = '3px';
    ctx.fillText('KELOMPOK TANI', 236, 112);
    ctx.letterSpacing = '0px';
    ctx.fillStyle = '#ffffff';
    fitFont(ctx, 'RIAU MANDIRI SEJAHTERA', 900, 38, F, 570);
    ctx.fillText('RIAU MANDIRI SEJAHTERA', 236, 160);

    // Label E-CARD
    rrect(ctx, W - PAD - 190, ly - 36, 190, 72, 36);
    ctx.fillStyle = '#FBBF24'; ctx.fill();
    ctx.fillStyle = '#052e16';
    ctx.font = `900 30px ${F}`;
    ctx.textAlign = 'center';
    ctx.fillText('E-CARD', W - PAD - 95, ly + 1);

    // Garis pemisah
    ctx.beginPath(); ctx.moveTo(PAD, 252); ctx.lineTo(W - PAD, 252);
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.stroke();

    // Baris data
    const rows = [
        ['Nama Anggota', m.name, 'name'],
        ['Jabatan', m.role, 'pill'],
        ['Nomor Anggota Unik', m.no_anggota, 'mono'],
        ['Wilayah', m.loper || '-', 'plain']
    ];
    rows.forEach(([label, val, kind], i) => {
        const y = 335 + i * 86;
        ctx.textAlign = 'left';
        ctx.font = `500 34px ${F}`;
        ctx.fillStyle = '#A7F3D0';
        ctx.fillText(label, PAD, y);
        const maxW = (W - PAD * 2) - ctx.measureText(label).width - 50;
        const right = W - PAD;
        ctx.textAlign = 'right';
        if (kind === 'name') {
            fitFont(ctx, val, 800, 44, F, maxW);
            ctx.fillStyle = '#FDE68A';
            ctx.fillText(val, right, y);
        } else if (kind === 'plain') {
            fitFont(ctx, val, 500, 36, F, maxW);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(val, right, y);
        } else {
            const mono = kind === 'mono';
            if (mono) { ctx.font = '700 36px "Courier New", monospace'; }
            else { fitFont(ctx, val, 700, 34, F, maxW - 44); }
            const tw = ctx.measureText(val).width;
            const bw = tw + 44;
            rrect(ctx, right - bw, y - 31, bw, 62, 18);
            ctx.fillStyle = mono ? 'rgba(0,0,0,0.28)' : 'rgba(255,255,255,0.12)';
            ctx.fill();
            ctx.fillStyle = mono ? '#FCD34D' : '#ffffff';
            ctx.fillText(val, right - 22, y);
        }
    });

    // Kotak QR
    const by = 676, bh = 800;
    rrect(ctx, PAD, by, W - PAD * 2, bh, 56);
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.lineWidth = 6; ctx.strokeStyle = '#FCD34D'; ctx.stroke();

    const title = 'QR CODE IDENTITAS ANGGOTA';
    ctx.font = `800 32px ${F}`;
    ctx.letterSpacing = '2px';
    const tw = ctx.measureText(title).width;
    const startX = (W - (tw + 52)) / 2;
    rrect(ctx, startX, by + 76 - 14, 28, 28, 6);
    ctx.fillStyle = '#F59E0B'; ctx.fill();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#1E5E3A';
    ctx.fillText(title, startX + 52, by + 76);
    ctx.letterSpacing = '0px';

    const fs = 510, fx = (W - fs) / 2, fy = by + 112;
    rrect(ctx, fx, fy, fs, fs, 40);
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#E2E8F0'; ctx.stroke();
    if (qrImg) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(qrImg, fx + 40, fy + 40, 430, 430);
        ctx.imageSmoothingEnabled = true;
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = '#64748b';
    ctx.font = `500 28px ${F}`;
    ctx.fillText('Scan QR Code di atas dengan Kamera / Google Lens untuk', W / 2, fy + fs + 52);
    ctx.fillText('masuk otomatis.', W / 2, fy + fs + 90);
    ctx.fillStyle = '#94a3b8';
    ctx.font = `600 25px ${F}`;
    ctx.fillText('Jaga kerahasiaan kartu ini.', W / 2, fy + fs + 134);

    return canvas;
}
