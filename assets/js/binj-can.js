/**
 * Binj 2 kg round composite can (v5 packaging design) - procedural three.js
 * model.
 *
 * Usage:
 *   import * as THREE from 'three';
 *   import { buildBinjCan } from './binj-can.js';
 *   const can = await buildBinjCan(THREE, { fontsReady, onChange });
 *   stage.setObject(can.model);
 *   can.toggle();
 *
 * Returns { model, setOpen(bool), toggle(), isOpen() }.
 * Options:
 *   fontsReady - optional promise the caller wants awaited before the label
 *                canvases are drawn (the required faces are also loaded here)
 *   onChange   - optional callback(isOpen) fired whenever the target state flips
 *
 * Label fonts must match assets/css/fonts.css: "Cormorant Garamond" 600,
 * "Jost" 400/500/600, "Vazirmatn" 400/500 and "Noto Nastaliq Urdu" 400/700 (the
 * Persian brand lettering; 700 for the mark and headings, 400 for the small
 * Persian captions). The rice plants, paddies and the barcode are drawn from a
 * seeded generator so every render looks identical.
 *
 * Model: a round composite can, 13 cm diameter x 25 cm tall (about 2.65 L for
 * 2 kg of rice plus liner headspace). A spiral-wound kraft tube with a 3 mm
 * wall, a gold-lacquered tinplate base rim, a paper wrap printed in the
 * pomegranate / ivory / turquoise palette (termeh boteh lattice, paddy
 * terraces, a toranj medallion with corner lachaks on the front, bilingual
 * EN/FA text on the back and both sides, boteh border bands top and bottom)
 * with gold hot-foil stamping (metalness/roughness maps) on the Nastaliq mark,
 * medallion and borders, a gold paper tamper seal across lid and body, and a
 * telescoping lid (border-band side, medallion top, kraft lining) that
 * friction-fits over an inner kraft collar holding the vacuum-sealed liner. A
 * braided gold cord handle passes through two gold-finish eyelets. The handle
 * folds flat, then the lid lifts straight up and tilts aside.
 *
 * The can stands on y = 0 and is centred on the origin.
 */

export async function buildBinjCan(THREE, { fontsReady, onChange } = {}) {
  // Persian samples make the browser fetch the arabic subsets (and, for
  // Vazirmatn, the latin one for spaces and the middle dot).
  const FA_SAMPLE = 'بینج برنج هاشمی فریدونکنار مازندران ایران ویژگی‌ها طرز پخت ارزش غذایی ۰۱۲۳۴۵۶۷۸۹';
  const FA_MIXED = FA_SAMPLE + ' · ×';
  await Promise.all([
    fontsReady,
    document.fonts.load('600 100px "Cormorant Garamond"'),
    document.fonts.load('400 40px "Jost"'),
    document.fonts.load('500 40px "Jost"'),
    document.fonts.load('600 40px "Jost"'),
    document.fonts.load('400 40px "Noto Nastaliq Urdu"', FA_SAMPLE),
    document.fonts.load('700 40px "Noto Nastaliq Urdu"', FA_SAMPLE),
    document.fonts.load('400 40px "Vazirmatn"', FA_MIXED),
    document.fonts.load('500 40px "Vazirmatn"', FA_MIXED),
  ]).catch(() => {});

  // Palette
  const ANAR = '#6e1a26', IVORY = '#f4ecdc', IVORY2 = '#f9f4ea', GOLDC = '#b48a3c';
  const FIROUZEH = '#2f8a8f', INK = '#2a1a1c', BODY = '#4a3a3a';

  // Persian lettering: Noto Nastaliq Urdu, 700 for the brand mark, 400 for captions.
  const NQ = (s, w = 700) => `${w} ${s}px "Noto Nastaliq Urdu"`;
  const VZ = (s, w = 400) => `${w} ${s}px Vazirmatn`;

  // Dimensions (m): 13 cm diameter x 25 cm, body ~2.65 L for 2 kg rice (~0.85 kg/L) + liner headspace
  const RB = 0.065, H = 0.25, LID_H = 0.05, BODY_H = H - LID_H, RL = RB + 0.0025;
  const LBL_R = RB + 0.0006, LBL_B = 0.014, LBL_H = BODY_H - LBL_B, LBL_Y = LBL_B + LBL_H / 2;
  const CIRC = 2 * Math.PI * LBL_R;

  const mats = {
    body: new THREE.MeshStandardMaterial({ name: 'composite_tube_kraft', color: IVORY, roughness: 0.85 }),
    anar: new THREE.MeshStandardMaterial({ name: 'print_pomegranate_matte', color: ANAR, roughness: 0.8 }),
    gold: new THREE.MeshStandardMaterial({ name: 'tinplate_gold_lacquer', color: '#d4ae55', roughness: 0.35, metalness: 0.4 }),
    seal: new THREE.MeshStandardMaterial({
      name: 'tamper_seal_gold_paper', color: '#d4ae55', roughness: 0.4, metalness: 0.35, side: THREE.DoubleSide,
    }),
    liner: new THREE.MeshStandardMaterial({ name: 'liner_PA_PE', color: '#e2e0da', roughness: 0.28, metalness: 0.15 }),
    collar: new THREE.MeshStandardMaterial({ name: 'inner_collar_kraft', color: '#c9a877', roughness: 0.85 }),
    lidInner: new THREE.MeshStandardMaterial({
      name: 'lid_inner_kraft', color: '#c9a877', roughness: 0.85, side: THREE.BackSide,
    }),
  };

  const model = new THREE.Group();
  model.name = 'Binj_Hashemi_2kg_Can';
  function add(geo, mat, name, x = 0, y = 0, z = 0, parent = model) {
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  // ---------- 2D helpers ----------
  function tex(c) {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }
  function spaced(ctx, text, x, y, sp, align = 'center') {
    ctx.letterSpacing = sp + 'px';
    ctx.textAlign = align;
    ctx.fillText(text, x, y);
    ctx.letterSpacing = '0px';
  }
  function fa(ctx, text, x, y, align = 'right') {
    ctx.direction = 'rtl';
    ctx.textAlign = align;
    ctx.fillText(text, x, y);
    ctx.direction = 'ltr';
  }
  function wrap(ctx, text, x, y, maxW, lh, rtl = false) {
    ctx.direction = rtl ? 'rtl' : 'ltr';
    ctx.textAlign = rtl ? 'right' : 'left';
    const words = text.split(' ');
    let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line) {
        ctx.fillText(line, x, y);
        y += lh;
        line = w;
      } else line = t;
    }
    ctx.fillText(line, x, y);
    ctx.direction = 'ltr';
    return y + lh;
  }
  // Park-Miller generator: the paddy pattern is identical on every render.
  function rng(seed) {
    return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  }

  // boteh (Persian paisley), unit height ~ 2.2
  function boteh(ctx, x, y, s, rot = 0, flip = false) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(flip ? -s : s, s);
    ctx.lineWidth = 2 / s;
    const shape = (k, dx, dy) => {
      ctx.beginPath();
      ctx.save();
      ctx.translate(dx, dy);
      ctx.scale(k, k);
      ctx.moveTo(0, 1);
      ctx.bezierCurveTo(-0.95, 1, -0.95, -0.25, 0, -0.55);
      ctx.bezierCurveTo(0.3, -0.7, 0.45, -1.0, 0.25, -1.2);
      ctx.bezierCurveTo(0.75, -1.0, 0.95, 0.1, 0.6, 0.65);
      ctx.bezierCurveTo(0.45, 0.9, 0.2, 1, 0, 1);
      ctx.restore();
      ctx.stroke();
    };
    shape(1, 0, 0);
    shape(0.55, 0.05, 0.25);
    ctx.beginPath();
    ctx.arc(0.05, 0.4, 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  function diamond(ctx, x, y, r) {
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r * 0.7, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r * 0.7, y);
    ctx.closePath();
    ctx.fill();
  }
  // Scalloped ellipse: radius rx/ry modulated by a * cos(n t).
  function lobed(ctx, cx, cy, rx, ry, a, n) {
    ctx.beginPath();
    for (let i = 0; i <= 720; i++) {
      const t = i / 720 * Math.PI * 2, k = a * Math.cos(n * t);
      const x = cx + (rx + k) * Math.sin(t), y = cy - (ry + k) * Math.cos(t);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.closePath();
  }
  function stalk(ctx, x, y, len, lean) {
    const tx = x + lean, ty = y - len;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + lean * 0.2, y - len * 0.6, tx, ty);
    ctx.stroke();
    ctx.lineWidth = 2.5;
    [[-1, 0.55], [1, 0.4]].forEach(([s, k]) => {
      ctx.beginPath();
      ctx.moveTo(x + lean * 0.1, y - len * 0.15);
      ctx.quadraticCurveTo(x + s * len * 0.25, y - len * k, x + s * len * 0.42, y - len * (k - 0.12));
      ctx.stroke();
    });
    const dir = Math.sign(lean) || 1;
    for (let i = 0; i < 9; i++) {
      const u = i / 8;
      ctx.beginPath();
      ctx.ellipse(tx + dir * u * len * 0.28, ty + u * u * len * 0.3, 3.5, 8, dir * (0.4 + u), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Paddy terraces with rice plants. The wave frequency is snapped to whole
  // cycles across the width w, and the plants are drawn at -w, 0 and +w, so
  // the pattern closes seamlessly where the label wraps round the can.
  function paddies(ctx, w, y0, y1, alpha, color, seed) {
    const rnd = rng(seed);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y0, w, y1 - y0);
    ctx.clip();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = ctx.fillStyle = color;
    const rows = [];
    for (let y = y0 + 50; y < y1 + 40; y += 60 + rnd() * 26) {
      const a = 6 + rnd() * 10, ph = rnd() * 6;
      const fr = (2 * Math.PI / w) * Math.round(w * (0.003 + rnd() * 0.003) / (2 * Math.PI));
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 8) {
        const yy = y + Math.sin(x * fr + ph) * a;
        if (x) ctx.lineTo(x, yy); else ctx.moveTo(x, yy);
      }
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.setLineDash([14, 10]);
      ctx.beginPath();
      for (let x = 0; x <= w; x += 8) {
        const yy = y + 14 + Math.sin(x * fr + ph) * a;
        if (x) ctx.lineTo(x, yy); else ctx.moveTo(x, yy);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      rows.push([y, a, ph, fr]);
    }
    rows.forEach(([y, a, ph, fr], i) => {
      if (i % 2) return;
      for (let n = 0; n < 9; n++) {
        const x = rnd() * w, by = y + Math.sin(x * fr + ph) * a;
        if (Math.abs(x - 1024) < 560) continue; // keep the front medallion clear
        for (let k = 0; k < 3; k++) {
          const L0 = 70 + rnd() * 50, ln = (k - 1) * 14 + (rnd() - 0.5) * 20;
          [-w, 0, w].forEach((o) => stalk(ctx, x + o + k * 16 - 16, by, L0, ln));
        }
      }
    });
    ctx.restore();
  }

  // Canvas triple: colour + matching foil maps (metalness, roughness). Draw in
  // logical px; the canvases are stored at scale S.
  function sheet(lw, lh, S) {
    const mk = () => {
      const c = document.createElement('canvas');
      c.width = Math.round(lw * S);
      c.height = Math.round(lh * S);
      const x = c.getContext('2d');
      x.setTransform(S, 0, 0, S, 0, 0);
      return [c, x];
    };
    const [c, ctx] = mk(), [mc, m] = mk(), [rc, r] = mk();
    return { c, ctx, mc, m, rc, r, lw, lh };
  }
  // Hot-foil gold: foil() paints the same strokes into the colour canvas (gold)
  // and into the metalness (white) + roughness (dark grey) maps, so only the
  // foil catches the light while the printed paper stays matte.
  function foilReset(P) {
    P.m.fillStyle = '#000';
    P.m.fillRect(0, 0, P.lw, P.lh);
    P.r.fillStyle = '#fff';
    P.r.fillRect(0, 0, P.lw, P.lh);
  }
  function foil(P, fn) {
    P.ctx.save();
    P.ctx.fillStyle = P.ctx.strokeStyle = GOLDC;
    fn(P.ctx);
    P.ctx.restore();
    [[P.m, '#fff'], [P.r, '#4a4a4a']].forEach(([c, col]) => {
      c.save();
      c.fillStyle = c.strokeStyle = col;
      fn(c);
      c.restore();
    });
  }
  // foil maps are data textures: no colour-space conversion
  function sheetMat(name, P, extra = {}) {
    const data = (c) => {
      const t = new THREE.CanvasTexture(c);
      t.anisotropy = 8;
      return t;
    };
    return new THREE.MeshStandardMaterial({
      name, map: tex(P.c), metalnessMap: data(P.mc), roughnessMap: data(P.rc), metalness: 0.4, roughness: 0.82, ...extra,
    });
  }
  // Pomegranate band with turquoise dots, foil rules and alternating boteh /
  // diamond motifs. `step` must divide the sheet width so the band tiles round.
  function borderBand(P, y0, h, step) {
    const c = P.ctx;
    c.fillStyle = ANAR;
    c.fillRect(0, y0, P.lw, h);
    const cy = y0 + h / 2, s = h * 0.16;
    c.fillStyle = FIROUZEH;
    for (let x = step / 2; x < P.lw; x += step) {
      c.beginPath();
      c.arc(x + step / 2, cy, s * 0.3, 0, Math.PI * 2);
      c.fill();
    }
    // The motifs at x = lw (the last dot and diamond) straddle the seam where
    // the band wraps round the can: repeat them at x = 0 so both halves exist.
    c.beginPath();
    c.arc(0, cy, s * 0.3, 0, Math.PI * 2);
    c.fill();
    foil(P, (g) => {
      g.fillRect(0, y0 + 12, P.lw, 2.5);
      g.fillRect(0, y0 + h - 14.5, P.lw, 2.5);
      g.fillRect(0, y0 + 20, P.lw, 1);
      g.fillRect(0, y0 + h - 21, P.lw, 1);
      let i = 0;
      for (let x = step / 2; x < P.lw + step; x += step, i++) {
        boteh(g, x, cy + s * 0.1, s, 0.5, i % 2 === 1);
        diamond(g, x + step / 2, cy, s * 0.55);
      }
      diamond(g, 0, cy, s * 0.55);
    });
  }

  // ---------- body wrap ----------
  // The wrap is 4096 logical px round the can (x = 0 at -X, 1024 front, 2048
  // right, 3072 back) stored at 0.75 scale, i.e. 3072 px wide. Panels: front
  // toranj medallion, right cooking, back about/nutrition, left properties
  // (drawn at both ends so the seam closes).
  const LW = 4096, LH = Math.round(LW * LBL_H / CIRC);
  const WR = sheet(LW, LH, 0.75), w = WR.ctx;
  const TOPB = 120, BOTB = 90, HALF = 422;
  function head(ctx, cx, y, en, faT) {
    ctx.fillStyle = ANAR;
    ctx.font = '600 20px Jost';
    spaced(ctx, en, cx - HALF, y, 5, 'left');
    ctx.font = NQ(30);
    fa(ctx, faT, cx + HALF, y + 4, 'right');
    ctx.fillStyle = 'rgba(110,26,38,.28)';
    ctx.fillRect(cx - HALF, y + 42, HALF * 2, 1.5);
  }
  function drawWrap() {
    foilReset(WR);
    w.fillStyle = IVORY;
    w.fillRect(0, 0, LW, LH);
    // termeh-style boteh lattice + paddies
    w.save();
    w.globalAlpha = 0.07;
    w.strokeStyle = w.fillStyle = ANAR;
    for (let r = 0, y = TOPB + 70; y < 1380; y += 130, r++) {
      for (let x = (r % 2) * 64; x <= LW; x += 128) boteh(w, x, y, 22, 0.5, r % 2 === 1);
    }
    w.restore();
    paddies(w, LW, 1400, LH - BOTB, 0.12, '#8a6a3a', 7);
    borderBand(WR, 0, TOPB, 128);
    borderBand(WR, LH - BOTB, BOTB, 128);
    drawFront(1024);
    drawSideR(2048);
    drawBack(3072);
    drawSideL(0);
    drawSideL(LW);
  }
  function drawFront(cx) {
    const x0 = cx - 490, x1 = cx + 490, y0 = TOPB + 30, y1 = LH - BOTB - 24;
    const TY = Math.round((y0 + y1) / 2) - 20, TRX = 360, TRY = 470;
    // lachak (corner quarter medallions)
    [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].forEach(([px, py]) => {
      w.save();
      w.beginPath();
      w.rect(x0, y0, x1 - x0, y1 - y0);
      w.clip();
      lobed(w, px, py, 170, 170, 7, 18);
      w.fillStyle = ANAR;
      w.fill();
      foil(WR, (g) => {
        g.save();
        g.beginPath();
        g.rect(x0, y0, x1 - x0, y1 - y0);
        g.clip();
        lobed(g, px, py, 170, 170, 7, 18);
        g.lineWidth = 4;
        g.stroke();
        lobed(g, px, py, 146, 146, 5, 18);
        g.lineWidth = 1.5;
        g.stroke();
        const ang = Math.atan2(TY - py, cx - px);
        boteh(g, px + Math.cos(ang) * 78, py + Math.sin(ang) * 78, 24, ang + Math.PI / 2, false);
        g.restore();
      });
      w.restore();
    });
    // toranj (central medallion) with pendants
    const pendant = (g, s) => {
      g.beginPath();
      g.moveTo(cx - 46, TY + s * (TRY - 12));
      g.quadraticCurveTo(cx - 36, TY + s * (TRY + 50), cx, TY + s * (TRY + 88));
      g.quadraticCurveTo(cx + 36, TY + s * (TRY + 50), cx + 46, TY + s * (TRY - 12));
    };
    w.fillStyle = IVORY2;
    [-1, 1].forEach((s) => {
      pendant(w, s);
      w.closePath();
      w.fill();
    });
    lobed(w, cx, TY, TRX, TRY, 9, 30);
    w.fill();
    foil(WR, (g) => {
      g.lineWidth = 2.5;
      g.strokeRect(x0, y0, x1 - x0, y1 - y0);
      g.lineWidth = 1;
      g.strokeRect(x0 + 10, y0 + 10, x1 - x0 - 20, y1 - y0 - 20);
      [-1, 1].forEach((s) => {
        pendant(g, s);
        g.lineWidth = 3;
        g.stroke();
        g.beginPath();
        g.arc(cx, TY + s * (TRY + 104), 9, 0, Math.PI * 2);
        g.fill();
      });
      lobed(g, cx, TY, TRX, TRY, 9, 30);
      g.lineWidth = 5;
      g.stroke();
      lobed(g, cx, TY, TRX - 24, TRY - 24, 6, 30);
      g.lineWidth = 1.5;
      g.stroke();
    });
    // top line between lachaks
    w.fillStyle = ANAR;
    w.font = '500 18px Jost';
    spaced(w, 'PRODUCT OF IRAN', cx, y0 + 70, 7);
    w.font = NQ(26, 400);
    fa(w, 'محصول ایران', cx, y0 + 122, 'center');
    // medallion contents
    w.fillStyle = ANAR;
    w.font = '500 16px Jost';
    spaced(w, 'FEREYDUNKENAR · MAZANDARAN', cx, TY - TRY + 150, 5);
    w.font = NQ(24, 400);
    fa(w, 'فریدونکنار · مازندران', cx, TY - TRY + 196, 'center');
    w.font = NQ(170);
    const m = w.measureText('بینج');
    const by = TY - TRY + 225 + m.actualBoundingBoxAscent;
    foil(WR, (g) => {
      g.font = NQ(170);
      fa(g, 'بینج', cx, by, 'center');
      const bw = m.width / 2 + 50;
      [-1, 1].forEach((s) => {
        g.beginPath();
        g.arc(cx + s * bw, by - 56, 5, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.arc(cx + s * (bw + 14), by - 56, 5, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.arc(cx + s * (bw + 7), by - 69, 5, 0, Math.PI * 2);
        g.fill();
      });
    });
    let y = by + m.actualBoundingBoxDescent + 60;
    w.fillStyle = ANAR;
    w.font = '600 88px "Cormorant Garamond"';
    w.textAlign = 'center';
    w.fillText('Binj', cx, y);
    foil(WR, (g) => { g.fillRect(cx - 36, y + 24, 72, 2); });
    y += 76;
    w.fillStyle = INK;
    w.font = '500 24px Jost';
    spaced(w, 'HASHEMI RICE', cx, y, 12);
    y += 54;
    w.fillStyle = ANAR;
    w.font = NQ(34);
    fa(w, 'برنج هاشمی', cx, y, 'center');
    y += 58;
    w.fillStyle = BODY;
    w.font = '400 18px Jost';
    w.textAlign = 'center';
    w.fillText('Aromatic long grain from the Caspian plain', cx, y);
    y += 44;
    w.font = NQ(20, 400);
    fa(w, 'دانه‌بلند و معطر از دشت خزر', cx, y, 'center');
    // weight between lower lachaks
    w.fillStyle = ANAR;
    w.font = '600 80px "Cormorant Garamond"';
    w.textAlign = 'center';
    w.fillText('2 kg', cx, y1 - 64);
    w.font = '500 16px Jost';
    spaced(w, 'NET WT 4.4 LB · VACUUM-SEALED', cx, y1 - 28, 6);
  }
  function drawBack(cx) {
    const L = cx - HALF, Rr = cx + HALF;
    w.fillStyle = ANAR;
    w.font = '600 84px "Cormorant Garamond"';
    w.textAlign = 'left';
    w.fillText('Binj', L, 250);
    foil(WR, (g) => {
      g.font = NQ(80);
      fa(g, 'بینج', Rr, 250, 'right');
      g.fillRect(L, 290, HALF * 2, 2);
    });
    let y = 360;
    head(w, cx, y, 'ABOUT', 'درباره');
    y += 80;
    w.fillStyle = BODY;
    w.font = '400 22px Jost';
    y = wrap(w, 'Hashemi is a slender, aromatic long-grain rice from the paddies of Fereydunkenar on the Caspian plain of Mazandaran. Harvested once a year and aged, its grains cook long, fluffy and separate.', L, y, HALF * 2, 32);
    y += 22;
    w.font = VZ(22);
    y = wrap(w, 'هاشمی برنجی دانه‌بلند، باریک و معطر از شالیزارهای فریدونکنار در دشت خزر مازندران است. سالی یک‌بار برداشت و کهنه می‌شود تا دانه‌ها پس از پخت بلند، پف‌دار و جدا از هم بمانند.', Rr, y, HALF * 2, 40, true);
    y += 20;
    w.fillStyle = ANAR;
    w.fillRect(L, y, HALF * 2, 58);
    w.fillStyle = IVORY;
    w.font = '600 21px Jost';
    spaced(w, 'NUTRITION FACTS', L + 18, y + 37, 4, 'left');
    w.font = NQ(24);
    fa(w, 'ارزش غذایی', Rr - 18, y + 40, 'right');
    y += 96;
    w.fillStyle = BODY;
    w.font = '400 18px Jost';
    w.textAlign = 'left';
    w.fillText('Typical values per 100 g uncooked', L, y);
    w.font = VZ(18);
    fa(w, 'در هر ۱۰۰ گرم برنج خام', Rr, y, 'right');
    y += 20;
    const rows = [
      ['Energy', '1510 kJ / 356 kcal', 'انرژی'],
      ['Fat', '0.6 g', 'چربی'],
      ['of which saturates', '0.2 g', 'اسیدهای چرب اشباع', 1],
      ['Carbohydrate', '79 g', 'کربوهیدرات'],
      ['of which sugars', '0.1 g', 'قند', 1],
      ['Fibre', '1.3 g', 'فیبر'],
      ['Protein', '7.1 g', 'پروتئین'],
      ['Salt', '0.01 g', 'نمک'],
    ];
    rows.forEach(([en, v, p, sub]) => {
      w.fillStyle = 'rgba(110,26,38,.25)';
      w.fillRect(L, y, HALF * 2, 1.5);
      y += 34;
      w.fillStyle = INK;
      w.font = sub ? '400 19px Jost' : '500 21px Jost';
      w.textAlign = 'left';
      w.fillText(en, L + (sub ? 22 : 0), y);
      w.font = '600 21px Jost';
      w.textAlign = 'center';
      w.fillText(v, cx, y);
      w.font = VZ(sub ? 18 : 20, sub ? 400 : 500);
      fa(w, p, Rr - (sub ? 22 : 0), y, 'right');
      y += 18;
    });
    w.fillStyle = ANAR;
    w.fillRect(L, y, HALF * 2, 3);
  }
  function drawSideR(cx) {
    const L = cx - HALF, Rr = cx + HALF;
    let y = 250;
    head(w, cx, y, 'COOKING', 'طرز پخت');
    y += 90;
    const steps = [
      ['Rinse 3–4 times, then soak for 2 hours in salted water.', 'برنج را ۳ تا ۴ بار بشویید و ۲ ساعت در آب‌نمک خیس کنید.'],
      ['Boil 8–10 minutes until just tender at the core, then drain.', '۸ تا ۱۰ دقیقه بجوشانید تا مغز دانه کمی نرم شود، سپس آبکش کنید.'],
      ['Return to the pot with oil or butter and steam covered on low heat for 45 minutes.', 'با کمی روغن یا کره به قابلمه برگردانید و ۴۵ دقیقه روی حرارت ملایم دم کنید.'],
    ];
    steps.forEach(([en, p], i) => {
      foil(WR, (g) => {
        g.font = '600 56px "Cormorant Garamond"';
        g.textAlign = 'left';
        g.fillText(String(i + 1), L, y + 16);
      });
      w.fillStyle = BODY;
      w.font = '400 22px Jost';
      let yy = wrap(w, en, L + 60, y, HALF * 2 - 60, 32);
      w.font = VZ(21);
      yy = wrap(w, p, Rr, yy + 10, HALF * 2 - 60, 36, true);
      y = yy + 26;
    });
    y += 20;
    head(w, cx, y, 'STORAGE', 'نگهداری');
    y += 80;
    w.fillStyle = BODY;
    w.font = '400 22px Jost';
    y = wrap(w, 'Keep sealed in a cool, dry place. Once opened, store in an airtight container.', L, y, HALF * 2, 32);
    w.font = VZ(21);
    wrap(w, 'در جای خشک و خنک نگهداری شود. پس از باز کردن، در ظرف دربسته نگهداری کنید.', Rr, y + 10, HALF * 2, 36, true);
  }
  const bars = Array.from({ length: 60 }, (_, i) => [[3, 3, 6, 9][(i * 7) % 4], [3, 5, 7][(i * 5) % 3]]);
  function drawSideL(cx) {
    const L = cx - HALF, Rr = cx + HALF;
    let y = 250;
    head(w, cx, y, 'PROPERTIES', 'ویژگی‌ها');
    y += 60;
    const props = [
      ['7+ mm', 'Grain length', 'طول دانه'],
      ['×2', 'Length after cooking', 'افزایش طول پس از پخت'],
      ['100%', 'Pure Hashemi', 'هاشمی خالص'],
      ['0', 'Additives', 'بدون افزودنی'],
    ];
    props.forEach(([v, en, p], i) => {
      const tx = L + (i % 2) * HALF + HALF / 2, ty = y + Math.floor(i / 2) * 200;
      if (i % 2) {
        w.fillStyle = 'rgba(110,26,38,.25)';
        w.fillRect(cx - 0.75, ty + 10, 1.5, 170); // centred so it closes across the seam
      }
      if (i >= 2) {
        w.fillStyle = 'rgba(110,26,38,.25)';
        w.fillRect(tx - HALF / 2 + 20, ty - 4, HALF - 40, 1.5);
      }
      w.fillStyle = ANAR;
      w.font = '600 64px "Cormorant Garamond"';
      w.textAlign = 'center';
      w.fillText(v, tx, ty + 76);
      w.fillStyle = INK;
      w.font = '500 18px Jost';
      w.fillText(en, tx, ty + 112);
      w.fillStyle = BODY;
      w.font = VZ(20);
      fa(w, p, tx, ty + 146, 'center');
    });
    y += 440;
    head(w, cx, y, 'ORIGIN', 'خاستگاه');
    y += 80;
    w.fillStyle = BODY;
    w.font = '400 22px Jost';
    y = wrap(w, 'Grown and milled in Fereydunkenar, Mazandaran, on the southern shore of the Caspian Sea.', L, y, HALF * 2, 32);
    w.font = VZ(21);
    y = wrap(w, 'کشت و فرآوری در فریدونکنار مازندران، در کرانهٔ جنوبی دریای خزر.', Rr, y + 10, HALF * 2, 36, true);
    const bxL = cx - 150, bY = y + 30;
    w.fillStyle = '#fff';
    w.fillRect(bxL, bY, 300, 150);
    w.fillStyle = INK;
    let bx = bxL + 20;
    for (const [bw, g] of bars) {
      if (bx + bw > bxL + 280) break;
      w.fillRect(bx, bY + 16, bw, 96);
      bx += bw + g;
    }
    w.font = '400 18px Jost';
    w.textAlign = 'center';
    w.fillText('6 26 00000 00000', cx, bY + 138);
    w.fillStyle = ANAR;
    w.font = '500 15px Jost';
    spaced(w, 'COMPOSITE CAN · BARRIER LINER · 2 KG', cx, bY + 190, 4);
  }

  // ---------- lid side band + lid top ----------
  const LCIRC = 2 * Math.PI * RL, LLH = Math.round(LW * LID_H / LCIRC);
  const LS = sheet(LW, LLH, 0.75);
  function drawLidSide() {
    foilReset(LS);
    borderBand(LS, 0, LLH, 256);
    foil(LS, (g) => {
      g.fillRect(0, 6, LS.lw, 3);
      g.fillRect(0, LLH - 9, LS.lw, 3);
    });
  }
  const LT = sheet(1024, 1024, 1), lt = LT.ctx;
  function drawLidTop() {
    foilReset(LT);
    lt.fillStyle = ANAR;
    lt.fillRect(0, 0, 1024, 1024);
    foil(LT, (g) => {
      g.lineWidth = 5;
      g.beginPath();
      g.arc(512, 512, 492, 0, Math.PI * 2);
      g.stroke();
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(512, 512, 472, 0, Math.PI * 2);
      g.stroke();
      for (let i = 0; i < 28; i++) {
        const a = i / 28 * Math.PI * 2;
        boteh(g, 512 + Math.cos(a) * 420, 512 + Math.sin(a) * 420, 17, a + Math.PI / 2, false);
      }
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(512, 512, 370, 0, Math.PI * 2);
      g.stroke();
      lobed(g, 512, 512, 300, 300, 8, 24);
      g.lineWidth = 3;
      g.stroke();
      g.font = NQ(170);
      const m = g.measureText('بینج');
      fa(g, 'بینج', 512, 512 + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2 - 30, 'center');
    });
    lt.fillStyle = IVORY;
    lt.font = '600 56px "Cormorant Garamond"';
    lt.textAlign = 'center';
    lt.fillText('Binj', 512, 700);
  }

  drawWrap();
  drawLidSide();
  drawLidTop();

  // ---------- geometry ----------
  // No two surfaces of the can are ever coplanar: the stacked parts are set
  // 0.6 mm or more apart in radius, the caps that would share a plane are
  // offset, and the lid's lining closes the gap between its two walls. (Coplanar
  // faces z-fight and show as striped moire when the can is orbited or the lid
  // is lifted.)
  const SEG = 160;
  const RIM_H = 0.005, BODY_Y0 = 0.001;
  // The tube starts 1 mm up, inside the gold base rim, so its bottom cap is not
  // coplanar with the rim's (the rim is wider and closed at y = 0).
  add(new THREE.CylinderGeometry(RB, RB, BODY_H - BODY_Y0, SEG), mats.body, 'can_body', 0, (BODY_H + BODY_Y0) / 2, 0);
  add(
    new THREE.CylinderGeometry(LBL_R, LBL_R, LBL_H, SEG, 1, true, -Math.PI / 2, Math.PI * 2),
    sheetMat('label_wrap', WR), 'label_wrap', 0, LBL_Y, 0,
  );
  add(
    new THREE.CylinderGeometry(RB + 0.0006, RB + 0.0006, LBL_B - 0.004, SEG, 1, true),
    mats.anar, 'base_band', 0, 0.004 + (LBL_B - 0.004) / 2, 0,
  );
  add(new THREE.CylinderGeometry(RB + 0.0014, RB + 0.0014, RIM_H, SEG), mats.gold, 'tinplate_base_rim', 0, RIM_H / 2, 0);
  add(
    new THREE.CylinderGeometry(RB - 0.0015, RB - 0.0015, LID_H - 0.008, SEG),
    mats.collar, 'inner_collar', 0, BODY_H + (LID_H - 0.008) / 2 - 0.002, 0,
  );
  // The liner bulges 3 mm above the collar's top; its rim sits below the top
  // plane and crosses it at a slope, never flush with it.
  const pillow = add(
    new THREE.SphereGeometry(1, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    mats.liner, 'vacuum_liner_top', 0, BODY_H + LID_H - 0.012, 0,
  );
  pillow.scale.set(RB - 0.008, 0.005, RB - 0.008);
  // tamper seal: a gold paper strip across the lid / body joint (half on each)
  const SW = 0.024, SA = Math.PI / 4;
  add(
    new THREE.CylinderGeometry(RB + 0.0012, RB + 0.0012, 0.016, 12, 1, true, SA - SW / RB / 2, SW / RB),
    mats.seal, 'tamper_seal_body_stub', 0, BODY_H - 0.008, 0,
  );

  // telescoping lid
  const lid = new THREE.Group();
  lid.name = 'lid';
  lid.position.set(0, BODY_H, 0);
  model.add(lid);
  add(
    new THREE.CylinderGeometry(RL, RL, LID_H, SEG, 1, true, -Math.PI / 2, Math.PI * 2),
    sheetMat('lid_band', LS), 'lid_side', 0, LID_H / 2, 0, lid,
  );
  add(
    new THREE.CylinderGeometry(RL - 0.0012, RL - 0.0012, LID_H - 0.002, SEG, 1, true),
    mats.lidInner, 'lid_inner', 0, LID_H / 2 - 0.001, 0, lid,
  );
  const top = add(new THREE.CircleGeometry(RL, SEG), sheetMat('lid_top', LT), 'lid_top', 0, LID_H, 0, lid);
  top.rotation.x = -Math.PI / 2;
  // Kraft ceiling under the lid top, 2 mm below it and facing down. It spans
  // the full outer radius so the 1.2 mm gap between the lid's outer and inner
  // walls is closed (seen from below it would otherwise be a see-through slit).
  const under = add(new THREE.CircleGeometry(RL, SEG), mats.collar, 'lid_underside', 0, LID_H - 0.002, 0, lid);
  under.rotation.x = Math.PI / 2;
  add(
    new THREE.CylinderGeometry(RL + 0.0016, RL + 0.0016, 0.003, SEG, 1, true),
    mats.gold, 'lid_rim_gold', 0, 0.0015, 0, lid,
  );
  add(new THREE.TorusGeometry(RL + 0.0002, 0.0014, 10, SEG), mats.gold, 'lid_top_bead', 0, LID_H, 0, lid).rotation.x = Math.PI / 2;
  add(
    new THREE.CylinderGeometry(RL + 0.0012, RL + 0.0012, LID_H - 0.004, 12, 1, true, SA - SW / RL / 2, SW / RL),
    mats.seal, 'tamper_seal_lid', 0, LID_H / 2 - 0.002, 0, lid,
  );

  // braided gold cord handle through two eyelets
  const EX = 0.036;
  [-1, 1].forEach((s) => {
    const e = add(
      new THREE.TorusGeometry(0.0075, 0.002, 12, 32), mats.gold, `eyelet_${s > 0 ? 'r' : 'l'}`,
      s * EX, LID_H + 0.0005, 0, lid,
    );
    e.rotation.x = Math.PI / 2;
  });
  const cc = document.createElement('canvas');
  cc.width = cc.height = 64;
  const cx2 = cc.getContext('2d');
  cx2.fillStyle = '#c9a24a';
  cx2.fillRect(0, 0, 64, 64);
  cx2.strokeStyle = '#8a6a26';
  cx2.lineWidth = 7;
  for (let i = -64; i < 128; i += 21) {
    cx2.beginPath();
    cx2.moveTo(i, 0);
    cx2.lineTo(i + 64, 64);
    cx2.stroke();
  }
  cx2.strokeStyle = 'rgba(255,240,200,.5)';
  cx2.lineWidth = 3;
  for (let i = -54; i < 138; i += 21) {
    cx2.beginPath();
    cx2.moveTo(i, 0);
    cx2.lineTo(i + 64, 64);
    cx2.stroke();
  }
  const cordTex = tex(cc);
  cordTex.wrapS = cordTex.wrapT = THREE.RepeatWrapping;
  cordTex.repeat.set(60, 1);
  // trilinear + anisotropic so the fine braid averages out at a distance (and when zoomed out) instead of shimmering
  cordTex.minFilter = THREE.LinearMipmapLinearFilter;
  cordTex.generateMipmaps = true;
  cordTex.anisotropy = 16;
  const cordMat = new THREE.MeshStandardMaterial({ name: 'handle_braided_cord_gold', map: cordTex, roughness: 0.6, metalness: 0.2 });
  const HP = 0.0045;
  const handle = new THREE.Group();
  handle.name = 'carry_handle_cord';
  handle.position.set(0, LID_H + HP, 0);
  lid.add(handle);
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-EX, -0.012, 0), new THREE.Vector3(-EX, 0.004, 0), new THREE.Vector3(-0.029, 0.024, 0),
    new THREE.Vector3(0, 0.04, 0), new THREE.Vector3(0.029, 0.024, 0), new THREE.Vector3(EX, 0.004, 0), new THREE.Vector3(EX, -0.012, 0),
  ]);
  add(new THREE.TubeGeometry(curve, 160, HP, 14, false), cordMat, 'handle_cord', 0, 0, 0, handle);
  const REST = -0.2, FOLD = -(Math.PI / 2 - 0.06);
  handle.rotation.x = REST;

  // ---------- open / close animation ----------
  // fold the cord flat, lift the lid straight off, then tilt it aside
  let t = 0, target = 0, last = performance.now(), running = false;
  const ease = (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  const clamp = (x) => Math.min(1, Math.max(0, x));
  function apply() {
    handle.rotation.x = REST + ease(clamp(t / 0.3)) * (FOLD - REST);
    const lift = ease(clamp((t - 0.3) / 0.45)), aside = ease(clamp((t - 0.7) / 0.3));
    lid.position.set(0.055 * aside, BODY_H + 0.08 * lift, -0.03 * aside);
    lid.rotation.z = -0.35 * aside;
  }
  function tick(now) {
    const dt = (now - last) / 1000;
    last = now;
    if (t !== target) {
      t = target > t ? Math.min(target, t + dt / 2) : Math.max(target, t - dt / 2);
      apply();
      requestAnimationFrame(tick);
    } else running = false;
  }
  function setOpen(open) {
    const next = open ? 1 : 0;
    if (next === target) return;
    target = next;
    if (onChange) onChange(target === 1);
    last = performance.now();
    if (!running) {
      running = true;
      requestAnimationFrame(tick);
    }
  }

  return {
    model,
    setOpen,
    toggle() { setOpen(!target); },
    isOpen() { return target === 1; },
  };
}
