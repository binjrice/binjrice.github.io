/**
 * Binj 5 kg octagonal export carton (v2 packaging design) - procedural
 * three.js model.
 *
 * Usage:
 *   import * as THREE from 'three';
 *   import { buildBinjBox } from './binj-box.js';
 *   const box = await buildBinjBox(THREE, { fontsReady, onChange });
 *   stage.setObject(box.model);
 *   box.toggle();
 *
 * Returns { model, setOpen(bool), toggle(), isOpen() }.
 * Options:
 *   fontsReady - optional promise the caller wants awaited before the label
 *                canvases are drawn (the required faces are also loaded here)
 *   onChange   - optional callback(isOpen) fired whenever the target state flips
 *
 * Label fonts must match assets/css/fonts.css: "Cormorant Garamond" 700,
 * "Jost" 400/500/600, "Vazirmatn" 400/600/700 and "Aref Ruqaa" 700 (the
 * Persian brand lettering). The rice grains and the barcode are drawn from a
 * seeded generator so every render looks identical.
 *
 * Model: 24 x 32 x 10 cm octagonal carton (2.5 cm 45-degree chamfers) with
 * chamfer reinforcement panels, bilingual EN/FA labels, a Persian pointed-arch
 * window, and a braided saffron cotton cord handle through two brass-finish
 * eyelets. The handle folds flat, then the lid hinges open at the rear edge.
 */

// Small deterministic PRNG (mulberry32).
function seededRandom(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function buildBinjBox(THREE, { fontsReady, onChange } = {}) {
  // Persian samples make the browser fetch the arabic subsets (and, for
  // Vazirmatn, the latin one for spaces and the middle dot).
  const FA_SAMPLE = 'بینج برنج هاشمی فریدونکنار مازندران ایران ۰۱۲۳۴۵۶۷۸۹';
  const FA_MIXED = FA_SAMPLE + ' · ×';
  await Promise.all([
    fontsReady,
    document.fonts.load('700 100px "Cormorant Garamond"'),
    document.fonts.load('400 40px "Jost"'),
    document.fonts.load('500 40px "Jost"'),
    document.fonts.load('600 40px "Jost"'),
    document.fonts.load('400 40px "Vazirmatn"', FA_MIXED),
    document.fonts.load('600 40px "Vazirmatn"', FA_MIXED),
    document.fonts.load('700 40px "Vazirmatn"', FA_MIXED),
    document.fonts.load('700 60px "Aref Ruqaa"', FA_SAMPLE),
  ]).catch(() => {});

  const rand = seededRandom(0xb1a5);

  // Palette
  const GREEN = '#1f4a3a', SAFFRON = '#c98f22', CREAM = '#f3ecdd', INK = '#1d2a24', BODY = '#3c4a43', GOLD = '#e3b85e';

  // Persian brand lettering: Aref Ruqaa 700. The scale factor k keeps the
  // apparent size of the lettering equal to the design (Aref Ruqaa is 1.0).
  const BRAND_K = 1.0;
  const brand = (s) => `700 ${Math.round(s * BRAND_K)}px "Aref Ruqaa"`;

  // Dimensions (m). Octagon footprint: 24 x 10 cm with 2.5 cm chamfers, 32 cm tall ~ 7.3 L
  const W = 0.24, H = 0.32, D = 0.10, C = 0.025;
  const BASE_H = 0.03, LID_H = 0.025, MARGIN = 0.005, T = 0.0015;
  const LBL_W = W - 2 * C - 2 * MARGIN, SIDE_W = D - 2 * C - 2 * 0.004;
  const LBL_H = H - BASE_H - LID_H - 0.006, LBL_Y = BASE_H + 0.003 + LBL_H / 2;

  const mats = {
    carton: new THREE.MeshStandardMaterial({ name: 'corrugated_board_double_wall', color: CREAM, roughness: 0.7 }),
    green: new THREE.MeshStandardMaterial({ name: 'reinforcement_board_green', color: GREEN, roughness: 0.55 }),
    saffron: new THREE.MeshStandardMaterial({ name: 'tamper_seal_paper', color: '#d9a13a', roughness: 0.35, metalness: 0.3 }),
    brass: new THREE.MeshStandardMaterial({ name: 'eyelet_brass_finish', color: '#c9a24a', roughness: 0.3, metalness: 0.85 }),
    liner: new THREE.MeshStandardMaterial({ name: 'liner_PA_PE', color: '#dfe2dc', roughness: 0.28, metalness: 0.15 }),
    collar: new THREE.MeshStandardMaterial({ name: 'inner_collar_kraft', color: '#c9a877', roughness: 0.8 }),
    film: new THREE.MeshStandardMaterial({ name: 'window_PET', color: '#ffffff', roughness: 0.05, transparent: true, opacity: 0.18 }),
  };

  const model = new THREE.Group();
  model.name = 'Binj_Hashemi_5kg_Octagon';
  function add(geo, mat, name, x = 0, y = 0, z = 0, parent = model) {
    const m = new THREE.Mesh(geo, mat); m.name = name; m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true; parent.add(m); return m;
  }
  function octPrism(w, d, c, h) {
    const s = new THREE.Shape(), a = w / 2, b = d / 2;
    s.moveTo(-a + c, -b); s.lineTo(a - c, -b); s.lineTo(a, -b + c); s.lineTo(a, b - c);
    s.lineTo(a - c, b); s.lineTo(-a + c, b); s.lineTo(-a, b - c); s.lineTo(-a, -b + c); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    return g;
  }

  // ---------- canvas helpers ----------
  function canvas(wm, hm, pxW) {
    const c = document.createElement('canvas');
    c.width = pxW; c.height = Math.round(pxW * hm / wm);
    return [c, c.getContext('2d')];
  }
  function tex(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }
  function spaced(ctx, text, x, y, sp, align = 'center') {
    ctx.letterSpacing = sp + 'px'; ctx.textAlign = align; ctx.fillText(text, x, y); ctx.letterSpacing = '0px';
  }
  function fa(ctx, text, x, y, align = 'right') {
    ctx.direction = 'rtl'; ctx.textAlign = align; ctx.fillText(text, x, y); ctx.direction = 'ltr';
  }
  function wrap(ctx, text, x, y, maxW, lh, rtl = false) {
    ctx.direction = rtl ? 'rtl' : 'ltr'; ctx.textAlign = rtl ? 'right' : 'left';
    const words = text.split(' '); let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, y); y += lh; line = w; } else line = t;
    }
    ctx.fillText(line, x, y); ctx.direction = 'ltr'; return y + lh;
  }
  // Persian pointed arch (iwan). Works on a 2D context or a THREE.Shape via map().
  function arch(p, cx, top, bottom, w, map = (x, y) => [x, y]) {
    const x0 = cx - w / 2, x1 = cx + w / 2, spring = top + w * 0.62, hh = spring - top;
    p.moveTo(...map(x0, bottom)); p.lineTo(...map(x0, spring));
    p.bezierCurveTo(...map(x0, spring - hh * 0.6), ...map(cx - w * 0.2, top + hh * 0.25), ...map(cx, top));
    p.bezierCurveTo(...map(cx + w * 0.2, top + hh * 0.25), ...map(x1, spring - hh * 0.6), ...map(x1, spring));
    p.lineTo(...map(x1, bottom)); p.closePath();
  }
  function dots(ctx, cx, cy, r) {
    [[-r * 1.2, 0], [r * 1.2, 0], [0, -r * 2.1]].forEach(([dx, dy]) => {
      ctx.beginPath(); ctx.arc(cx + dx, cy + dy, r, 0, Math.PI * 2); ctx.fill();
    });
  }

  // ---------- front ----------
  const [fc, f] = canvas(LBL_W, LBL_H, 1024);
  const FW = fc.width, FH = fc.height;
  const WIN = { cx: FW / 2, top: 790, bottom: 1240, w: 460 };
  function drawFront() {
    f.clearRect(0, 0, FW, FH);
    f.fillStyle = CREAM; f.fillRect(0, 0, FW, FH);
    f.fillStyle = GREEN; f.font = '500 24px Jost'; spaced(f, 'FEREYDUNKENAR · MAZANDARAN · IRAN', FW / 2, 72, 6);
    f.font = '400 26px Vazirmatn'; fa(f, 'فریدونکنار · مازندران · ایران', FW / 2, 116, 'center');
    f.strokeStyle = SAFFRON; f.lineWidth = 3; f.beginPath(); f.moveTo(FW / 2 - 60, 146); f.lineTo(FW / 2 + 60, 146); f.stroke();
    f.fillStyle = GREEN; f.font = '700 250px "Cormorant Garamond"'; f.textAlign = 'center'; f.fillText('Binj', FW / 2, 360);
    f.fillStyle = SAFFRON; f.font = brand(128); fa(f, 'بینج', FW / 2, 500, 'center');
    const bw = f.measureText('بینج').width; dots(f, FW / 2 - bw / 2 - 44, 470, 6); dots(f, FW / 2 + bw / 2 + 44, 470, 6);
    f.fillStyle = INK; f.font = '600 40px Jost'; spaced(f, 'HASHEMI RICE', FW / 2, 588, 12);
    f.font = '700 38px Vazirmatn'; fa(f, 'برنج هاشمی', FW / 2, 642, 'center');
    f.fillStyle = '#4a5a52'; f.font = '400 26px Jost'; f.textAlign = 'center'; f.fillText('Aromatic long grain from the Caspian plain', FW / 2, 700);
    f.font = '400 26px Vazirmatn'; fa(f, 'دانه‌بلند معطر از دشت خزر', FW / 2, 742, 'center');
    // arch window cut-out + rim
    f.save(); f.globalCompositeOperation = 'destination-out'; f.beginPath(); arch(f, WIN.cx, WIN.top, WIN.bottom, WIN.w); f.fill(); f.restore();
    f.strokeStyle = SAFFRON; f.lineWidth = 10; f.beginPath(); arch(f, WIN.cx, WIN.top - 9, WIN.bottom + 9, WIN.w + 18); f.stroke();
    // net weight band
    f.fillStyle = GREEN; f.fillRect(0, FH - 200, FW, 200);
    f.fillStyle = CREAM; f.font = '700 104px "Cormorant Garamond"'; f.textAlign = 'left'; f.fillText('5 kg', 64, FH - 50);
    f.font = '500 24px Jost'; spaced(f, 'NET WT 11 LB', 66, FH - 152, 6, 'left');
    f.font = '500 24px Jost'; spaced(f, 'PRODUCT OF IRAN', FW - 64, FH - 140, 6, 'right');
    f.font = '600 28px Vazirmatn'; fa(f, 'محصول ایران', FW - 64, FH - 96, 'right');
    f.fillStyle = GOLD; f.font = '500 22px Jost'; spaced(f, 'VACUUM-SEALED', FW - 64, FH - 50, 6, 'right');
  }

  // rice seen through the window
  const [rc, r] = canvas(1, 1.1, 640);
  r.fillStyle = '#e9e1cf'; r.fillRect(0, 0, rc.width, rc.height);
  for (let i = 0; i < 2600; i++) {
    const x = rand() * rc.width, y = rand() * rc.height, a = rand() * Math.PI, l = 30 + rand() * 9, tone = 238 + rand() * 17;
    r.save(); r.translate(x, y); r.rotate(a);
    r.fillStyle = 'rgba(0,0,0,0.12)'; r.beginPath(); r.ellipse(1.5, 2, l / 2, 5, 0, 0, Math.PI * 2); r.fill();
    r.fillStyle = `rgb(${tone},${tone - 4},${tone - 14})`; r.beginPath(); r.ellipse(0, 0, l / 2, 4.6, 0, 0, Math.PI * 2); r.fill(); r.restore();
  }

  // ---------- back: bilingual description, properties, nutrition ----------
  const [bc, b] = canvas(LBL_W, LBL_H, 1024);
  const BW = bc.width, BH = bc.height, M = 64, IW = BW - 2 * M;
  const bars = Array.from({ length: 60 }, () => [[3, 3, 6, 9][Math.floor(rand() * 4)], [3, 5, 7][Math.floor(rand() * 3)]]);
  function drawBack() {
    b.clearRect(0, 0, BW, BH);
    b.fillStyle = CREAM; b.fillRect(0, 0, BW, BH);
    b.fillStyle = GREEN; b.font = '700 96px "Cormorant Garamond"'; b.textAlign = 'left'; b.fillText('Binj', M, 112);
    b.fillStyle = SAFFRON; b.font = brand(84); fa(b, 'بینج', BW - M, 108, 'right');
    b.fillStyle = SAFFRON; b.fillRect(M, 140, IW, 3);
    // about
    let y = 196;
    b.fillStyle = GREEN; b.font = '600 20px Jost'; spaced(b, 'ABOUT', M, y, 5, 'left');
    b.font = '700 22px Vazirmatn'; fa(b, 'درباره', BW - M, y, 'right');
    y += 40; b.fillStyle = BODY; b.font = '400 23px Jost';
    y = wrap(b, 'Hashemi is a slender, aromatic long-grain rice from the paddies of Fereydunkenar on the Caspian plain of Mazandaran. Harvested once a year and aged, its grains cook long, fluffy and separate.', M, y, IW, 33);
    y += 8; b.font = '400 23px Vazirmatn';
    y = wrap(b, 'هاشمی برنجی دانه‌بلند، باریک و معطر از شالیزارهای فریدونکنار در دشت خزر مازندران است. سالی یک‌بار برداشت و کهنه می‌شود تا دانه‌ها پس از پخت بلند، پف‌دار و جدا از هم بمانند.', BW - M, y, IW, 40, true);
    // properties
    y += 6;
    const props = [['7+ mm', 'Grain length', 'طول دانه'], ['×2', 'Length after cooking', 'افزایش طول پس از پخت'], ['100%', 'Pure Hashemi', 'هاشمی خالص'], ['0', 'Additives', 'بدون افزودنی']];
    const cw = IW / 4;
    props.forEach(([v, en, p], i) => {
      const x = M + i * cw, cx = x + cw / 2;
      b.strokeStyle = 'rgba(31,74,58,.35)'; b.lineWidth = 2; b.strokeRect(x + 5, y, cw - 10, 150);
      b.fillStyle = GREEN; b.font = '700 50px "Cormorant Garamond"'; b.textAlign = 'center'; b.fillText(v, cx, y + 58);
      b.fillStyle = INK; b.font = '500 17px Jost'; b.fillText(en, cx, y + 94);
      b.fillStyle = BODY; b.font = '400 17px Vazirmatn'; fa(b, p, cx, y + 128, 'center');
    });
    y += 180;
    // nutrition
    b.fillStyle = GREEN; b.fillRect(M, y, IW, 52);
    b.fillStyle = CREAM; b.font = '600 22px Jost'; spaced(b, 'NUTRITION FACTS', M + 18, y + 35, 4, 'left');
    b.font = '700 24px Vazirmatn'; fa(b, 'ارزش غذایی', BW - M - 18, y + 36, 'right');
    y += 88; b.fillStyle = BODY; b.font = '400 18px Jost'; b.textAlign = 'left'; b.fillText('Typical values per 100 g uncooked', M, y);
    b.font = '400 19px Vazirmatn'; fa(b, 'در هر ۱۰۰ گرم برنج خام', BW - M, y, 'right');
    y += 14;
    const rows = [['Energy', '1510 kJ / 356 kcal', 'انرژی'], ['Fat', '0.6 g', 'چربی'], ['of which saturates', '0.2 g', 'اسیدهای چرب اشباع', 1], ['Carbohydrate', '79 g', 'کربوهیدرات'],
      ['of which sugars', '0.1 g', 'قند', 1], ['Fibre', '1.3 g', 'فیبر'], ['Protein', '7.1 g', 'پروتئین'], ['Salt', '0.01 g', 'نمک']];
    rows.forEach(([en, v, p, sub]) => {
      b.strokeStyle = 'rgba(31,74,58,.3)'; b.lineWidth = 1.5; b.beginPath(); b.moveTo(M, y); b.lineTo(BW - M, y); b.stroke();
      y += 29;
      b.fillStyle = INK; b.font = sub ? '400 19px Jost' : '500 21px Jost'; b.textAlign = 'left'; b.fillText(en, M + (sub ? 22 : 0), y);
      b.font = '600 21px Jost'; b.textAlign = 'center'; b.fillText(v, BW / 2, y);
      b.font = sub ? '400 19px Vazirmatn' : '600 21px Vazirmatn'; fa(b, p, BW - M - (sub ? 22 : 0), y, 'right');
      y += 13;
    });
    b.strokeStyle = GREEN; b.lineWidth = 3; b.beginPath(); b.moveTo(M, y); b.lineTo(BW - M, y); b.stroke();
    // cooking
    y += 40; b.fillStyle = GREEN; b.font = '600 20px Jost'; spaced(b, 'COOKING', M, y, 5, 'left');
    b.font = '700 22px Vazirmatn'; fa(b, 'طرز پخت', BW - M, y, 'right');
    y += 34; b.fillStyle = BODY; b.font = '400 20px Jost';
    y = wrap(b, 'Rinse 3–4 times, soak 2 h in salted water, boil 8–10 min until just tender, drain, then steam covered on low heat for 45 min.', M, y, IW, 28);
    b.font = '400 20px Vazirmatn';
    wrap(b, '۳ تا ۴ بار بشویید، ۲ ساعت در آب‌نمک خیس کنید، ۸ تا ۱۰ دقیقه بجوشانید، آبکش کنید و ۴۵ دقیقه روی حرارت ملایم دم کنید.', BW - M, y + 2, IW, 34, true);
    // barcode + net weight band
    b.fillStyle = GREEN; b.fillRect(0, BH - 170, BW, 170);
    b.fillStyle = '#fff'; b.fillRect(M, BH - 150, 270, 124);
    b.fillStyle = INK; let bx = M + 18;
    for (const [w, g] of bars) { if (bx + w > M + 252) break; b.fillRect(bx, BH - 138, w, 80); bx += w + g; }
    b.font = '400 18px Jost'; b.textAlign = 'center'; b.fillText('6 26 00000 00000', M + 135, BH - 36);
    b.fillStyle = CREAM; b.textAlign = 'right'; b.font = '700 80px "Cormorant Garamond"'; b.fillText('5 kg', BW - M, BH - 78);
    b.font = '500 18px Jost'; spaced(b, 'DOUBLE-WALL CARTON · BARRIER LINER', BW - M, BH - 38, 3, 'right');
  }

  // ---------- narrow sides ----------
  const sideCanvas = () => canvas(SIDE_W, LBL_H, 256);
  const [sAc, sA] = sideCanvas(), [sBc, sB] = sideCanvas();
  function rotated(ctx, c, draw) {
    ctx.clearRect(0, 0, c.width, c.height); ctx.fillStyle = GREEN; ctx.fillRect(0, 0, c.width, c.height);
    ctx.save(); ctx.translate(c.width / 2, c.height / 2); ctx.rotate(-Math.PI / 2); draw(ctx); ctx.restore();
  }
  function drawSides() {
    rotated(sA, sAc, (s) => {
      s.fillStyle = CREAM; s.font = '700 150px "Cormorant Garamond"'; s.textAlign = 'center'; s.fillText('Binj', -260, 50);
      s.fillStyle = GOLD; s.font = brand(96); fa(s, 'بینج', 110, 36, 'center');
      s.fillStyle = CREAM; s.font = '500 22px Jost'; spaced(s, 'HASHEMI · 5 KG', 480, -8, 6);
      s.font = '400 24px Vazirmatn'; fa(s, 'هاشمی · ۵ کیلوگرم', 480, 36, 'center');
    });
    rotated(sB, sBc, (s) => {
      s.fillStyle = GOLD; s.font = brand(52); fa(s, 'برنج هاشمی فریدونکنار', 0, -30, 'center');
      s.fillStyle = CREAM; s.font = '500 20px Jost'; spaced(s, 'FEREYDUNKENAR HASHEMI RICE', 0, 16, 5);
      s.font = '400 17px Jost'; spaced(s, 'STORE SEALED · COOL & DRY', 0, 58, 3);
      s.font = '400 19px Vazirmatn'; fa(s, 'در جای خشک و خنک نگهداری شود', 0, 94, 'center');
    });
  }

  drawFront(); drawBack(); drawSides();
  const lblMat = (name, c, extra = {}) => new THREE.MeshStandardMaterial({ name, map: tex(c), roughness: 0.55, ...extra });
  const labelMats = [lblMat('label_front', fc, { alphaTest: 0.5 }), lblMat('label_back', bc), lblMat('label_side_right', sAc), lblMat('label_side_left', sBc)];

  // ---------- geometry ----------
  add(octPrism(W + 0.004, D + 0.004, C + 0.0008, BASE_H), mats.green, 'base_tray_reinforced');
  add(octPrism(W, D, C, H - LID_H - 0.001), mats.carton, 'carton_body_octagon', 0, 0.001, 0);
  add(octPrism(W - 0.006, D - 0.006, C - 0.0012, LID_H - 0.004), mats.collar, 'inner_collar', 0, H - LID_H, 0);
  const pillow = add(new THREE.SphereGeometry(1, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2), mats.liner, 'vacuum_liner_top', 0, H - 0.0041, 0);
  pillow.scale.set((W - 0.03) / 2, 0.003, (D - 0.03) / 2);

  // chamfer reinforcement panels
  const gH = H - BASE_H - LID_H, gY = BASE_H + gH / 2, CW = C * Math.SQRT2;
  [[1, 1], [1, -1], [-1, -1], [-1, 1]].forEach(([sx, sz], i) => {
    const p = add(new THREE.BoxGeometry(CW, gH, T), mats.green, `chamfer_panel_${i + 1}`,
      sx * (W / 2 - C / 2) + sx * T / (2 * Math.SQRT2), gY, sz * (D / 2 - C / 2) + sz * T / (2 * Math.SQRT2));
    p.rotation.y = Math.atan2(sx, sz);
  });

  // labels
  add(new THREE.PlaneGeometry(LBL_W, LBL_H), labelMats[0], 'label_front', 0, LBL_Y, D / 2 + 0.0012);
  const back = add(new THREE.PlaneGeometry(LBL_W, LBL_H), labelMats[1], 'label_back', 0, LBL_Y, -D / 2 - 0.0012); back.rotation.y = Math.PI;
  const sRa = add(new THREE.PlaneGeometry(SIDE_W, LBL_H), labelMats[2], 'label_side_right', W / 2 + 0.0012, LBL_Y, 0); sRa.rotation.y = Math.PI / 2;
  const sLa = add(new THREE.PlaneGeometry(SIDE_W, LBL_H), labelMats[3], 'label_side_left', -W / 2 - 0.0012, LBL_Y, 0); sLa.rotation.y = -Math.PI / 2;

  // arch window: rice behind the cut-out, clear film on top
  const pxs = LBL_W / FW, toM = (x, y) => [(x - FW / 2) * pxs, LBL_Y + (FH / 2 - y) * pxs];
  const winH = (WIN.bottom - WIN.top + 24) * pxs, winY = LBL_Y + (FH / 2 - (WIN.top + WIN.bottom) / 2) * pxs;
  add(new THREE.PlaneGeometry((WIN.w + 24) * pxs, winH), lblMat('rice_grains', rc, { roughness: 0.6 }), 'rice_visible', 0, winY, D / 2 + 0.0005);
  const winShape = new THREE.Shape(); arch(winShape, WIN.cx, WIN.top, WIN.bottom, WIN.w, toM);
  const film = add(new THREE.ShapeGeometry(winShape, 24), mats.film, 'window_film_arch', 0, 0, D / 2 + 0.0019); film.castShadow = false;

  // base body tamper stub
  add(new THREE.BoxGeometry(0.035, 0.012, 0.0008), mats.saffron, 'tamper_seal_body_stub', 0, H - LID_H - 0.006, D / 2 + 0.0024);

  // lid (hinged at the rear edge)
  const PZ = -(D / 2 + 0.002), PY = H - LID_H;
  const lid = new THREE.Group(); lid.name = 'lid'; lid.position.set(0, PY, PZ); model.add(lid);
  const LY = (y) => y - PY, LZ = (z) => z - PZ;
  add(octPrism(W + 0.004, D + 0.004, C + 0.0008, LID_H), mats.green, 'lid_cap', 0, 0, LZ(0), lid);
  add(new THREE.BoxGeometry(0.035, 0.0008, D + 0.006), mats.saffron, 'tamper_seal_top', 0, LY(H + 0.0004), LZ(0), lid);
  add(new THREE.BoxGeometry(0.035, LID_H, 0.0008), mats.saffron, 'tamper_seal_lid_front', 0, LY(H - LID_H / 2), LZ(D / 2 + 0.0024), lid);

  // braided cotton cord handle through two eyelets
  const EX = 0.06;
  [-1, 1].forEach((s) => {
    const e = add(new THREE.TorusGeometry(0.0075, 0.002, 12, 32), mats.brass, `eyelet_${s > 0 ? 'r' : 'l'}`, s * EX, LY(H + 0.0005), LZ(0), lid);
    e.rotation.x = Math.PI / 2;
  });
  const [cc, cx2] = canvas(1, 1, 64);
  cx2.fillStyle = '#c98f22'; cx2.fillRect(0, 0, 64, 64);
  cx2.strokeStyle = '#8f5f12'; cx2.lineWidth = 7;
  for (let i = -64; i < 128; i += 21) { cx2.beginPath(); cx2.moveTo(i, 0); cx2.lineTo(i + 64, 64); cx2.stroke(); }
  cx2.strokeStyle = 'rgba(255,230,170,.45)'; cx2.lineWidth = 3;
  for (let i = -54; i < 138; i += 21) { cx2.beginPath(); cx2.moveTo(i, 0); cx2.lineTo(i + 64, 64); cx2.stroke(); }
  const cordTex = tex(cc); cordTex.wrapS = cordTex.wrapT = THREE.RepeatWrapping; cordTex.repeat.set(70, 1);
  const cordMat = new THREE.MeshStandardMaterial({ name: 'handle_cotton_cord_saffron', map: cordTex, roughness: 0.9 });
  const HP = 0.0045;
  const handle = new THREE.Group(); handle.name = 'carry_handle_cord'; handle.position.set(0, LY(H + HP), LZ(0)); lid.add(handle);
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-EX, -0.012, 0), new THREE.Vector3(-EX, 0.004, 0), new THREE.Vector3(-0.048, 0.034, 0),
    new THREE.Vector3(0, 0.056, 0), new THREE.Vector3(0.048, 0.034, 0), new THREE.Vector3(EX, 0.004, 0), new THREE.Vector3(EX, -0.012, 0),
  ]);
  add(new THREE.TubeGeometry(curve, 160, HP, 14, false), cordMat, 'handle_cord', 0, 0, 0, handle);
  const REST = -0.2, FOLD = -(Math.PI / 2 - 0.06);
  handle.rotation.x = REST;

  // ---------- open / close animation ----------
  // fold the handle flat, then hinge the lid at the rear edge
  let t = 0, target = 0, last = performance.now(), running = false;
  const ease = (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  const clamp = (x) => Math.min(1, Math.max(0, x));
  function apply() {
    handle.rotation.x = REST + ease(clamp(t / 0.35)) * (FOLD - REST);
    lid.rotation.x = -ease(clamp((t - 0.35) / 0.65)) * THREE.MathUtils.degToRad(115);
  }
  function tick(now) {
    const dt = (now - last) / 1000; last = now;
    if (t !== target) {
      t = target > t ? Math.min(target, t + dt / 1.8) : Math.max(target, t - dt / 1.8);
      apply(); requestAnimationFrame(tick);
    } else running = false;
  }
  function setOpen(open) {
    const next = open ? 1 : 0;
    if (next === target) return;
    target = next;
    if (onChange) onChange(target === 1);
    last = performance.now();
    if (!running) { running = true; requestAnimationFrame(tick); }
  }

  return {
    model,
    setOpen,
    toggle() { setOpen(!target); },
    isOpen() { return target === 1; },
  };
}
