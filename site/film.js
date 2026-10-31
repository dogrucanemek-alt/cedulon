(() => {
  const TAU = Math.PI * 2, N = 96, EPOCH = 12, NEW = 47, ORPH = 36.5;
  const $ = (q) => document.querySelector(q);
  const css = getComputedStyle(document.documentElement);
  const tok = (n) => css.getPropertyValue(n).trim();
  const rgb = (hex) => { const h = hex.replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
  const C = { ink: rgb(tok('--ink')), accent: rgb(tok('--accent')), ok: rgb(tok('--ok')), fail: rgb(tok('--fail')), dim: rgb(tok('--dim')), void: tok('--void'), panel: tok('--panel') };
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a))})`;
  const mixc = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const smooth = (v) => { v = clamp(v); return v * v * (3 - 2 * v); };
  const lerp = (a, b, t) => a + (b - a) * t;

  const BASE = { payer: 'agent-7', payee: 'api.weather.example', amount: '0.25', currency: 'USDC', policyHash: '4be1c29a07d3', manifestHash: 'c09d71e45b2f', noManifest: false, x402PaymentRef: '0x9a3e51c8:1', timestampMs: 1793462400000, nonce: 'n-0412', prevReceiptHash: '9f3a0c17e2b6', outcome: 'settled' };

  async function digest(obj) {
    const s = JSON.stringify(obj);
    try { return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))); }
    catch (e) {
      const out = new Uint8Array(32); let h = 2166136261 >>> 0;
      for (let k = 0; k < 32; k++) { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i) + k; h = Math.imul(h, 16777619) >>> 0; } out[k] = h & 255; }
      return out;
    }
  }
  const toHex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

  // Each band is a rosette: a scalloped base (j lobes) carrying a net of M phase-shifted waves (k crossings per turn).
  function paramsFrom(b) {
    const f = (i, lo, span) => lo + (b[i] / 255) * span;
    return [
      { rb: .56, lobe: .025, a: .085, k: 12 + b[0] % 9, j: 6 + b[1] % 6, ph: f(3, 0, TAU), M: 14, steps: 1440, weave: true, spin: .012 },
      { rb: .37, lobe: .03, a: .08, k: 9 + b[4] % 7, j: 4 + b[5] % 5, ph: f(7, 0, TAU), M: 12, steps: 1200, weave: true, spin: -.018 },
      { rb: .2, lobe: .025, a: .07, k: 6 + b[8] % 5, j: 3 + b[9] % 4, ph: f(11, 0, TAU), M: 12, steps: 960, weave: false, spin: .026 },
      { rb: .08, lobe: .012, a: .03, k: 5 + b[12] % 4, j: 2 + b[13] % 3, ph: f(15, 0, TAU), M: 10, steps: 600, weave: false, spin: -.04 },
    ];
  }
  function bandColors(bad) {
    return bad
      ? [rgba(C.fail, .34), rgba(mixc(C.ink, C.fail, .4), .24), rgba(mixc(C.fail, C.ink, .25), .34), rgba(mixc(C.ink, C.fail, .3), .4)]
      : [rgba(C.accent, .34), rgba(C.ink, .24), rgba(mixc(C.accent, C.ink, .4), .34), rgba(C.ink, .4)];
  }
  function strokeBand(g, cx, cy, RM, p, color, lw) {
    g.globalCompositeOperation = 'lighter'; g.strokeStyle = color; g.lineWidth = lw; g.lineJoin = 'round';
    const nets = p.weave ? [p.k, p.k + p.j] : [p.k];
    nets.forEach((k, n) => {
      g.globalAlpha = n ? .62 : 1;
      for (let i = 0; i < p.M; i++) {
        const phi = i * TAU / p.M;
        g.beginPath();
        for (let s = 0; s <= p.steps; s++) {
          const t = s / p.steps * TAU;
          const r = (p.rb + p.lobe * Math.cos(p.j * t + p.ph) + p.a * Math.sin(k * t + phi)) * RM;
          const x = cx + r * Math.cos(t), y = cy + r * Math.sin(t);
          s ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.stroke();
      }
    });
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }

  // ---------- stage ----------
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stage = $('#stage'), cv = $('#film-canvas'), ctx = cv.getContext('2d');
  const beats = Array.from(document.querySelectorAll('.beat'));
  const chapterItems = Array.from(document.querySelectorAll('#chapters li'));
  const chaptersEl = $('#chapters');
  let W = 0, H = 0, DPR = 1, U = 1, LW = 1, wide = true;
  let hashHex = '', hashBad = '', imgs = null, imgsBad = null, beatBox = [];
  let sTarget = 0, s = 0, t = 0, last = performance.now(), paused = reduce, visible = true;
  let psi = -Math.PI / 2 + .4, prevPsi = psi;
  const SPEED = .46, SWEEP_W = .62;
  const sb = { tampered: false, orphan: false, caught: false, caughtAt: 0 };

  const angleOf = (i) => -Math.PI / 2 + i * TAU / N;
  const cwFromTop = (th) => { let d = (th + Math.PI / 2) % TAU; if (d < 0) d += TAU; return d; };

  // floors: z is height in the opened stack, d is depth for the dive into the core
  const FL = {
    gate: { z: 1.42, d: 0 }, rail: { z: .62, d: 0 }, legend: { z: .02, d: .3 },
    A: { z: -.06, d: .45 }, B: { z: -.16, d: .6 }, C: { z: -.26, d: .75 }, D: { z: -.34, d: .85 }, core: { z: -.4, d: .9 },
    chain: { z: -.98, d: .2 },
  };
  const K = (cx, cy, Z, phi, E, c, fx, fy) => ({ cx, cy, Z, phi, E, c, fx, fy });
  const KEYS_WIDE = [
    K(.69, .55, .96, 0, 0, 0, 0, 0),
    K(.64, .53, .66, 1.02, 1, 0, 0, 0),
    K(.64, .62, .7, 1.02, 1, 0, 0, 0),
    K(.64, .62, .7, 1.02, 1, 0, 0, 0),
    K(.64, .53, .66, 1.02, 1, 0, 0, 0),
    K(.66, .5, 1, 0, 0, .8, 0, 0),
    K(.66, .72, 2.1, 0, 0, 0, 0, .81),
    K(.64, .53, .66, 1.02, 1, 0, 0, 0),
    K(.64, .53, .66, 1.02, 1, 0, 0, 0),
    K(.68, .53, .96, 0, 0, 0, 0, 0),
  ];
  const KEYS_NARROW = [
    K(.5, .93, .7, 0, 0, 0, 0, 0),
    K(.44, .36, .7, 1.02, 1, 0, 0, 0),
    K(.44, .42, .74, 1.02, 1, 0, 0, 0),
    K(.44, .42, .74, 1.02, 1, 0, 0, 0),
    K(.44, .36, .7, 1.02, 1, 0, 0, 0),
    K(.5, .32, 1, 0, 0, .8, 0, 0),
    K(.5, .4, 2.2, 0, 0, 0, 0, .81),
    K(.44, .36, .7, 1.02, 1, 0, 0, 0),
    K(.44, .36, .7, 1.02, 1, 0, 0, 0),
    K(.5, .3, .9, 0, 0, 0, 0, 0),
  ];
  const mixKey = (a, b, u) => { const o = {}; for (const k in a) o[k] = lerp(a[k], b[k], u); return o; };
  function camAt(sv) {
    const keys = wide ? KEYS_WIDE : KEYS_NARROW, n = keys.length;
    if (reduce) return keys[clamp(Math.floor(sv), 0, n - 1)];
    const x = sv - .72, j = Math.floor(x), u = x - j;
    if (j < 0) return keys[0];
    if (j >= n - 1) return keys[n - 1];
    return u < .5 ? mixKey(keys[j], keys[j + 1], smooth(u / .5)) : keys[j + 1];
  }
  let cam = KEYS_WIDE[0];

  const scl = (d) => { const den = .3 + d - cam.c; return den <= .02 ? 60 : (.3 + d) / den; };
  const fadeD = (d) => 1 - smooth((scl(d) - 3.3) / 2.4);
  function B(fl) {
    const k = U * cam.Z * scl(fl.d), cs = Math.cos(cam.phi), sn = Math.sin(cam.phi);
    return { k, cs, ox: cam.cx * W - cam.fx * U * cam.Z, oy: cam.cy * H - cam.fy * U * cam.Z * cs - fl.z * cam.E * sn * U * cam.Z };
  }
  function P(fl, th, r) { const b = B(fl); return [b.ox + Math.cos(th) * r * b.k, b.oy + Math.sin(th) * r * b.k * b.cs]; }
  const at = (z) => ({ z, d: 0 });

  // ---------- cached layers ----------
  function mk(ext, res) { const q = U * res, sz = Math.ceil(ext * 2 * q) + 6, c = document.createElement('canvas'); c.width = c.height = sz; return { c, q, g: c.getContext('2d'), m: sz / 2 }; }
  function ringOn(L, r, color, w, scallop) {
    const g = L.g; g.beginPath();
    if (!scallop) g.arc(L.m, L.m, r * L.q, 0, TAU);
    else for (let s2 = 0; s2 <= 720; s2++) { const th = s2 / 720 * TAU, rr = (r + scallop * Math.sin(th * 180)) * L.q; const x = L.m + Math.cos(th) * rr, y = L.m + Math.sin(th) * rr; s2 ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.strokeStyle = color; g.lineWidth = w; g.stroke();
  }
  function ringText(L, r, tokens, px, color, sepColor) {
    const g = L.g, rr = r * L.q;
    g.font = `400 ${px}px "IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace`; g.textAlign = 'center'; g.textBaseline = 'middle';
    let list = tokens.slice(); const circ = TAU * rr, minGap = px * 2.4;
    const width = (l) => l.reduce((a, k) => a + g.measureText(k.t).width, 0) + l.length * minGap;
    while (width(list) > circ * .985) { const opts = list.filter((k) => k.opt); if (!opts.length) break; const drop = opts.reduce((a, b) => (a.opt < b.opt ? a : b)); list = list.filter((k) => k !== drop); }
    const textW = list.reduce((a, k) => a + g.measureText(k.t).width, 0), gap = Math.max(minGap, (circ - textW) / list.length);
    let th = -Math.PI / 2 + (gap / 2) / rr;
    for (const k of list) {
      g.fillStyle = k.color || color;
      for (const ch of k.t) { const w = g.measureText(ch).width, mid = th + (w / 2) / rr; g.save(); g.translate(L.m + Math.cos(mid) * rr, L.m + Math.sin(mid) * rr); g.rotate(mid + Math.PI / 2); g.fillText(ch, 0, 0); g.restore(); th += w / rr; }
      const dm = th + (gap / 2) / rr, q = px * .26; g.save(); g.translate(L.m + Math.cos(dm) * rr, L.m + Math.sin(dm) * rr); g.rotate(dm);
      g.beginPath(); g.moveTo(-q, 0); g.lineTo(0, -q); g.lineTo(q, 0); g.lineTo(0, q); g.closePath(); g.fillStyle = sepColor; g.fill(); g.restore();
      th += gap / rr;
    }
  }
  function buildLayers(params, hex, claims, bad) {
    const cols = bandColors(bad), out = { spin: params.map((p) => p.spin) };
    ['A', 'B', 'C', 'D'].forEach((key, i) => {
      const p = params[i], ext = p.rb + p.lobe + p.a + .01;
      const n = mk(ext, 1); strokeBand(n.g, n.m, n.m, n.q, p, cols[i], LW); out[key] = n;
      if (key === 'C' || key === 'D') { const d = mk(ext, 3.4); strokeBand(d.g, d.m, d.m, d.q, p, cols[i], LW * 1.7); out[key + 'z'] = d; }
    });
    const px = Math.max(8.5, Math.min(11, .036 * U / DPR)) * DPR * 1.3;
    const lg = mk(.8, 1.3);
    ringOn(lg, .688, rgba(C.ink, .3), LW * 1.3); ringOn(lg, .7, rgba(C.accent, .35), LW * 1.3, .003); ringOn(lg, .772, rgba(C.ink, .22), LW * 1.3);
    ringText(lg, .735, [
      { t: 'payer ' + claims.payer }, { t: 'payee ' + claims.payee },
      { t: 'amount ' + claims.amount + ' ' + claims.currency, color: bad ? rgba(C.fail, .95) : null },
      { t: 'policyHash ' + claims.policyHash.slice(0, 8) + '…', opt: 3 }, { t: 'manifestHash ' + claims.manifestHash.slice(0, 8) + '…', opt: 1 },
      { t: 'x402PaymentRef ' + claims.x402PaymentRef, opt: 2 }, { t: 'nonce ' + claims.nonce, opt: 4 },
      { t: 'prevReceiptHash ' + claims.prevReceiptHash.slice(0, 8) + '…' }, { t: 'outcome ' + claims.outcome },
      { t: 'sha-256 ' + hex.slice(0, 16) + '…', color: bad ? rgba(C.fail, .95) : null },
    ], px, rgba(C.ink, .62), rgba(C.accent, .8));
    out.legend = lg;
    return out;
  }
  let railImg = null, gateImg = null;
  function buildStatic() {
    const r = mk(1.01, 1.3), g = r.g;
    g.strokeStyle = rgba(C.ink, .13); g.lineWidth = LW * 1.3;
    for (let i = 0; i < N * 4; i++) { if (i % 4 === 0) continue; const th = -Math.PI / 2 + i * TAU / (N * 4); g.beginPath(); g.moveTo(r.m + Math.cos(th) * .938 * r.q, r.m + Math.sin(th) * .938 * r.q); g.lineTo(r.m + Math.cos(th) * .975 * r.q, r.m + Math.sin(th) * .975 * r.q); g.stroke(); }
    ringOn(r, .99, rgba(C.ink, .28), LW * 1.3); ringOn(r, 1, rgba(C.ink, .5), LW * 1.8);
    railImg = r;
    const gt = mk(.7, 1.3);
    ringOn(gt, .66, rgba(C.ink, .5), LW * 1.8); ringOn(gt, .62, rgba(C.accent, .45), LW * 1.3, .003); ringOn(gt, .42, rgba(C.ink, .22), LW * 1.3); ringOn(gt, .24, rgba(C.ink, .35), LW * 1.3);
    const px = Math.max(8.5, Math.min(11, .036 * U / DPR)) * DPR * 1.3;
    ringText(gt, .52, [{ t: 'maxAmount 10' }, { t: 'maxCumulative 30' }, { t: 'maxPayments 3' }, { t: 'payees api.weather.example' }, { t: 'currencies USDC' }, { t: 'default deny' }], px, rgba(C.ink, .7), rgba(C.accent, .8));
    g.strokeStyle = rgba(C.ink, .25);
    const gg = gt.g; gg.strokeStyle = rgba(C.ink, .3); gg.lineWidth = LW * 1.3;
    for (let i = 0; i < 48; i++) { const th = i / 48 * TAU; gg.beginPath(); gg.moveTo(gt.m + Math.cos(th) * .25 * gt.q, gt.m + Math.sin(th) * .25 * gt.q); gg.lineTo(gt.m + Math.cos(th) * .3 * gt.q, gt.m + Math.sin(th) * .3 * gt.q); gg.stroke(); }
    gateImg = gt;
  }

  function drawImg(L, fl, spin, alpha) {
    if (!L || alpha <= .004) return;
    const b = B(fl), sc = b.k / L.q;
    ctx.setTransform(sc, 0, 0, sc * b.cs, b.ox, b.oy); ctx.rotate(spin); ctx.globalAlpha = Math.min(1, alpha);
    ctx.drawImage(L.c, -L.c.width / 2, -L.c.height / 2);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
  }
  function wedgeClip(fl, from, ang) {
    ctx.beginPath(); const [cx0, cy0] = P(fl, 0, 0); ctx.moveTo(cx0, cy0);
    const n = Math.max(2, Math.ceil(ang / .05));
    for (let i = 0; i <= n; i++) { const [x, y] = P(fl, from + ang * i / n, 1.4); ctx.lineTo(x, y); }
    ctx.closePath(); ctx.clip();
  }
  function dot(x, y, r, col, a) {
    const gr = ctx.createRadialGradient(x, y, 0, x, y, r * 3.2);
    gr.addColorStop(0, rgba(col, a)); gr.addColorStop(.35, rgba(col, a * .45)); gr.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r * 3.2, 0, TAU); ctx.fill();
    ctx.fillStyle = rgba(mixc(col, C.ink, .55), a); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  function text(str, x, y, opt) {
    const o = Object.assign({ size: 12, weight: 400, font: 'mono', color: rgba(C.ink, .9), align: 'left', base: 'middle', back: false }, opt || {});
    const fam = o.font === 'mono' ? '"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace' : o.font === 'display' ? 'Manrope, ui-sans-serif, system-ui, sans-serif' : '"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif';
    ctx.font = `${o.weight} ${o.size * DPR}px ${fam}`; ctx.textAlign = o.align; ctx.textBaseline = o.base;
    if (o.back) {
      const w = ctx.measureText(str).width, h = o.size * DPR * 1.5, pad = 6 * DPR;
      const x0 = o.align === 'right' ? x - w - pad : o.align === 'center' ? x - w / 2 - pad : x - pad;
      ctx.fillStyle = rgba(rgb(C.void), .82 * (o.alpha ?? 1)); ctx.fillRect(x0, y - h / 2, w + pad * 2, h);
    }
    ctx.fillStyle = o.color; ctx.fillText(str, x, y);
  }

  // ---------- story, as a pure function of scroll ----------
  let Seff = 0;
  const pr = (i, a, b) => clamp((Seff - i - a) / (b - a));
  function story() {
    const S = reduce ? Math.floor(s) + .999 : s;
    Seff = S;
    const p = (i, a, b) => clamp((S - i - a) / (b - a));
    const st = { S, p };
    st.ambient = S < .8 || S >= 8.9;
    st.sandbox = S >= 8.9;
    st.newTick = S < 4 ? (S < 1 ? 1 : 1 - p(1, 0, .4)) : p(4, .62, .78);
    st.newBead = S < 6 ? (S < 1 ? 1 : 1 - p(1, 0, .4)) : p(6, .05, .3);
    st.bands = S < 1 ? 1 : S < 5 ? lerp(1, .42, p(1, 0, .5)) : S < 6 ? .25 : 1;
    st.reveal = S < 5 ? 0 : S < 6 ? p(5, .22, .82) : 1;
    st.legend = S < 1 ? 1 : S < 6 ? lerp(1, .35, p(1, 0, .5)) : 1;
    st.gate = S < 1 ? 0 : S < 8.5 ? p(1, .1, .5) : 1 - p(8, .5, .9);
    st.orphan = S >= 7 && S < 8.95 ? p(7, .55, .7) : 0;
    st.audit = S >= 8 && S < 8.95 ? p(8, .05, .82) : (S >= 8.95 ? 1 : 0);
    st.auditOn = S >= 8 && S < 8.95;
    return st;
  }

  // ---------- frame ----------
  function frame(now) {
    const dt = Math.min(.1, (now - last) / 1000); last = now;
    s = reduce ? sTarget : s + (sTarget - s) * (1 - Math.exp(-dt * 7));
    if (Math.abs(sTarget - s) < .0005) s = sTarget;
    prevPsi = psi;
    if (!paused) { t += dt; psi = (psi + dt * SPEED) % TAU; }
    if (visible && imgs) draw(now);
    updateChapters();
    requestAnimationFrame(frame);
  }

  function draw(now) {
    cam = camAt(s);
    const st = story(), L = sb.tampered && st.sandbox ? imgsBad || imgs : imgs;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.clearRect(0, 0, cv.width, cv.height);

    // glow behind the seal
    { const [gx, gy] = P(FL.legend, 0, 0), gr = U * cam.Z * 1.25, ga = 1 - .75 * clamp(cam.c / .8);
      const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
      g.addColorStop(0, rgba(C.accent, .2 * ga)); g.addColorStop(.55, rgba(C.accent, .06 * ga)); g.addColorStop(1, rgba(C.accent, 0));
      ctx.fillStyle = g; ctx.fillRect(gx - gr, gy - gr, gr * 2, gr * 2); }

    const sweep = sweepFn(st);

    // chain floor (bottom)
    const chA = fadeD(FL.chain.d);
    if (chA > .01) {
      const b = B(FL.chain);
      ctx.globalAlpha = chA;
      ctx.beginPath(); ctx.ellipse(b.ox, b.oy, .81 * b.k, .81 * b.k * b.cs, 0, 0, TAU); ctx.strokeStyle = rgba(C.ink, .16); ctx.lineWidth = LW; ctx.stroke();
      const beadR = Math.max(1.4 * DPR, .0072 * b.k);
      for (let i = 0; i < N; i++) {
        const th = angleOf(i), g = sweep(th).g;
        let a = 1; if (i === NEW) a = st.sandbox ? 1 : st.newBead; if (a <= .01) continue;
        const [x, y] = P(FL.chain, th, .81);
        if (i % EPOCH === 0) {
          const q = beadR * 2, lit = i === 48 ? pr(6, .55, .72) * (st.S < 7 ? 1 : 0) : 0;
          ctx.save(); ctx.translate(x, y); ctx.rotate(th); ctx.scale(1, 1);
          ctx.beginPath(); ctx.moveTo(-q, 0); ctx.lineTo(0, -q); ctx.lineTo(q, 0); ctx.lineTo(0, q); ctx.closePath();
          ctx.fillStyle = lit > .01 ? rgba(C.accent, .9 * lit) : C.void; ctx.fill(); ctx.strokeStyle = rgba(C.accent, .75 + .25 * g); ctx.lineWidth = LW * 1.3; ctx.stroke(); ctx.restore();
        } else {
          const self = i === NEW, red = self && sb.tampered && st.sandbox;
          ctx.beginPath(); ctx.arc(x, y, beadR * (self ? 1 + .8 * (1 - st.newBead) * (st.S >= 6 && st.S < 7 ? 1 : 0) : 1), 0, TAU);
          ctx.fillStyle = red ? rgba(C.fail, a) : rgba(C.ink, (.5 + .5 * g) * a); ctx.fill();
          if (self) { ctx.beginPath(); ctx.arc(x, y, beadR * 2.6, 0, TAU); ctx.strokeStyle = red ? rgba(C.fail, .95 * a) : rgba(C.accent, .9 * a); ctx.lineWidth = LW * 1.3; ctx.stroke(); }
        }
      }
      ctx.globalAlpha = 1;
    }

    // receipt floor: bands and core
    const bandAlpha = (key) => st.bands * fadeD(FL[key].d);
    ['D', 'C', 'B', 'A'].forEach((key, idx) => {
      const i = 3 - idx, fl = FL[key];
      const zoomed = (key === 'C' || key === 'D') && B(fl).k / U > 1.7;
      const img = zoomed ? L[key + 'z'] : L[key], spin = reduce ? 0 : t * L.spin[i];
      ctx.globalCompositeOperation = 'lighter';
      drawImg(img, fl, spin, bandAlpha(key));
      if (st.reveal > 0 && st.reveal < 1 && st.bands < 1) {
        ctx.save(); wedgeClip(fl, -Math.PI / 2 + spin * 0, TAU * st.reveal);
        drawImg(img, fl, spin, (1 - st.bands) * fadeD(fl.d)); ctx.restore();
      } else if (st.reveal >= 1 && st.bands < 1) drawImg(img, fl, spin, (1 - st.bands) * fadeD(fl.d));
      ctx.globalCompositeOperation = 'source-over';
    });
    { const b = B(FL.core); const r = .036 * b.k, a = fadeD(FL.core.d);
      ctx.globalAlpha = a; ctx.beginPath(); ctx.ellipse(b.ox, b.oy, r, r * b.cs, 0, 0, TAU); ctx.fillStyle = C.void; ctx.fill();
      ctx.strokeStyle = sb.tampered && st.sandbox ? rgba(C.fail, .9) : rgba(C.ink, .7); ctx.lineWidth = LW * 1.4; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(b.ox, b.oy, r / 3, r / 3 * b.cs, 0, 0, TAU); ctx.fillStyle = sb.tampered && st.sandbox ? rgba(C.fail, 1) : rgba(C.ink, .9); ctx.fill(); ctx.globalAlpha = 1; }

    drawImg(L.legend, FL.legend, 0, st.legend * fadeD(FL.legend.d));

    // threads: each settlement on the rail paired with a receipt in the chain
    { const a0 = fadeD(FL.rail.d) * fadeD(FL.chain.d);
      if (a0 > .01) {
        ctx.lineWidth = LW * 1.2;
        for (let i = 0; i < N; i++) {
          if (i === NEW && !st.sandbox && Math.min(st.newTick, st.newBead) < .99) continue;
          const th = angleOf(i), sw = sweep(th);
          let a;
          if (st.auditOn) a = (sw.done ? .26 : .03) + .55 * sw.g;
          else if (st.ambient) a = (reduce ? .32 : .1 + .62 * sw.g);
          else a = .05 + .1 * (1 - cam.E);
          const [x1, y1] = P(FL.rail, th, .875), [x2, y2] = P(FL.chain, th, .822);
          ctx.strokeStyle = rgba(C.ok, a * a0); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        }
      } }

    // rail floor
    const raA = fadeD(FL.rail.d);
    if (raA > .01) {
      drawImg(railImg, FL.rail, 0, raA);
      const tickW = Math.max(1.1, 1.25 * DPR);
      ctx.lineWidth = tickW;
      for (let i = 0; i < N; i++) {
        const th = angleOf(i), g = sweep(th).g;
        let a = 1; if (i === NEW && !st.sandbox) a = st.newTick; if (a <= .01) continue;
        const [x1, y1] = P(FL.rail, th, .878), [x2, y2] = P(FL.rail, th, .975);
        const flash = i === NEW && st.S >= 4 && st.S < 5 ? (1 - pr(4, .78, 1)) * st.newTick : 0;
        ctx.strokeStyle = flash > .01 ? rgba(mixc(C.ink, C.ok, flash), .95) : rgba(C.ink, (.46 + .5 * g) * a * raA);
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
    }

    // gate floor (only in the opened stack)
    const gA = st.gate * cam.E;
    if (gA > .01) {
      drawImg(gateImg, FL.gate, reduce ? 0 : t * .01, gA);
    }

    storyOverlays(st, now, sweep);
    sandboxOverlay(st, now);
    floorLabels(st);
  }

  function sweepFn(st) {
    if (st.auditOn) {
      const ang = TAU * st.audit;
      return (th) => { const d = cwFromTop(th), behind = ang - d; return { done: behind >= 0, g: behind >= 0 && behind < SWEEP_W ? 1 - behind / SWEEP_W : 0 }; };
    }
    if (st.ambient && !reduce) return (th) => { let d = (psi - th) % TAU; if (d < 0) d += TAU; return { done: true, g: d < SWEEP_W ? 1 - d / SWEEP_W : 0 }; };
    return () => ({ done: true, g: 0 });
  }

  function storyOverlays(st, now, sweep) {
    const S = st.S, Tok = Math.max(3.2 * DPR, .012 * U * cam.Z);
    // 2: the manifest card comes down onto the gate
    if (S >= 2 && S < 3.2) {
      const u = smooth(pr(2, .1, .7)), merge = pr(2, .72, .92);
      const z = lerp(2.75, FL.gate.z + .05, u), [x, y] = P(at(z), 0, 0);
      const a = (1 - merge) * clamp((S - 2) / .15) * cam.E;
      if (a > .01) {
        const w = 170 * DPR * Math.min(1, U / (300 * DPR)) , h = w * .5, x0 = x - w / 2, y0 = y - h;
        ctx.globalAlpha = a; ctx.fillStyle = C.panel; ctx.fillRect(x0, y0, w, h); ctx.strokeStyle = rgba(C.ink, .55); ctx.lineWidth = LW * 1.2; ctx.strokeRect(x0, y0, w, h);
        const fs = Math.max(9, 11 * w / (170 * DPR));
        text('trade manifest', x0 + 10 * DPR, y0 + h * .24, { size: fs, color: rgba(C.ink, .95), font: 'mono' });
        text('0.25 USDC, api.weather.example', x0 + 10 * DPR, y0 + h * .5, { size: fs * .9, color: rgba(C.dim, .95) });
        text('signed by the seller', x0 + 10 * DPR, y0 + h * .76, { size: fs * .9, color: rgba(C.accent, .95) });
        ctx.globalAlpha = 1;
      }
      if (merge > 0 && merge < 1) dot(x, y, Tok, C.accent, (1 - merge) * cam.E);
    }
    // 3: two requests refused at the gate, ours let through
    if (S >= 3 && S < 4.4) {
      const deny = (a0, a1, th, label) => {
        const u = pr(3, a0, a1); if (u <= 0 || u >= 1) return;
        const r = u < .55 ? lerp(1.5, .26, smooth(u / .55)) : lerp(.26, .62, smooth((u - .55) / .45));
        const a = u < .55 ? clamp(u / .1) : 1 - smooth((u - .7) / .3);
        const [x, y] = P(FL.gate, th, r);
        dot(x, y, Tok, u < .55 ? C.ink : C.fail, a * cam.E);
        if (u > .5) { const [lx, ly] = P(FL.gate, th, .62); text(label, lx, ly - 16 * DPR, { size: 11.5, color: rgba(C.fail, a), align: 'center', back: true, alpha: a }); }
        if (u > .45 && u < .75) { const [cx0, cy0] = P(FL.gate, 0, 0), bb = B(FL.gate); ctx.beginPath(); ctx.ellipse(cx0, cy0, .24 * bb.k, .24 * bb.k * bb.cs, 0, 0, TAU); ctx.fillStyle = rgba(C.fail, .22 * (1 - Math.abs(u - .6) / .15) * cam.E); ctx.fill(); }
      };
      deny(0, .42, Math.PI * .92, 'limit-amount');
      deny(.22, .64, Math.PI * .1, 'scope-payee');
      const u = pr(3, .55, .95);
      if (u > 0 && S < 4.4) {
        const z = S < 4 ? lerp(2.6, FL.gate.z, smooth(u)) : FL.gate.z;
        const [x, y] = P(at(z), 0, 0);
        const open = pr(3, .78, .92);
        if (open > 0) { const bb = B(FL.gate), [cx0, cy0] = P(FL.gate, 0, 0); ctx.beginPath(); ctx.ellipse(cx0, cy0, .24 * bb.k, .24 * bb.k * bb.cs, 0, 0, TAU); ctx.strokeStyle = rgba(C.ok, .9 * open * cam.E * (1 - pr(4, .2, .4))); ctx.lineWidth = LW * 2.4; ctx.stroke(); }
        if (S < 4) dot(x, y, Tok, C.ok, cam.E);
        if (S < 4 && open > .5) { const [lx, ly] = P(FL.gate, Math.PI * .5, .62); text('allow', lx, ly + 16 * DPR, { size: 11.5, color: rgba(C.ok, open), align: 'center', back: true, alpha: open }); }
      }
    }
    // 4: down to the rail, out to its tick
    if (S >= 4 && S < 5.1) {
      const u1 = pr(4, 0, .35), u2 = pr(4, .35, .66), a = (1 - pr(4, .7, .82)) * cam.E;
      let x, y;
      if (u2 <= 0) [x, y] = P(at(lerp(FL.gate.z, FL.rail.z, smooth(u1))), 0, 0);
      else [x, y] = P(FL.rail, angleOf(NEW), lerp(0, .93, smooth(u2)));
      if (a > .01) dot(x, y, Tok, C.ok, a);
      const la = pr(4, .7, .82) * (1 - pr(4, .95, 1.1)) * cam.E;
      if (la > .01) { const [lx, ly] = P(FL.rail, angleOf(NEW), 1.04); text('x402 0x9a3e51c8:1  0.25 USDC', lx, ly + 18 * DPR, { size: 11.5, color: rgba(C.ink, la), align: 'center', back: true, alpha: la }); }
    }
    // 5: the receipt's hash around the core while its pattern is woven
    if (S >= 5 && S < 6.1) {
      const a = pr(5, .05, .2) * (1 - pr(5, .9, 1.05)), n = Math.floor(64 * pr(5, .12, .6));
      if (a > .01 && hashHex) {
        const [cx0, cy0] = P(FL.core, 0, 0), rr = Math.min(W, H) * (wide ? .42 : .4) * .5 + 20 * DPR, str = 'sha-256 ' + hashHex.slice(0, n);
        ctx.font = `400 ${12 * DPR}px "IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        let th = -Math.PI / 2 - (ctx.measureText(str).width / rr) / 2;
        ctx.fillStyle = rgba(C.ink, .8 * a);
        for (const ch of str) { const w = ctx.measureText(ch).width, mid = th + (w / 2) / rr; ctx.save(); ctx.translate(cx0 + Math.cos(mid) * rr, cy0 + Math.sin(mid) * rr); ctx.rotate(mid + Math.PI / 2); ctx.fillText(ch, 0, 0); ctx.restore(); th += w / rr; }
        const sig = pr(5, .82, .95);
        if (sig > 0) text('COSE_Sign1  Ed25519', cx0, cy0 + rr + 26 * DPR, { size: 12, color: rgba(C.accent, sig * a), align: 'center' });
      }
    }
    // 6: the new bead joins the chain, then the epoch closes
    if (S >= 6 && S < 7.1) {
      const fade = 1 - pr(6, .92, 1.08);
      const l = pr(6, .25, .5) * fade;
      if (l > .01) {
        const b = B(FL.chain), a0 = angleOf(NEW), a1 = angleOf(NEW - 1);
        ctx.beginPath(); ctx.ellipse(b.ox, b.oy, .81 * b.k, .81 * b.k * b.cs, 0, a1, lerp(a1, a0, 1), false); ctx.strokeStyle = rgba(C.accent, .95 * l); ctx.lineWidth = LW * 3; ctx.stroke();
        const [x, y] = P(FL.chain, (a0 + a1) / 2, .81);
        text('prevReceiptHash 9f3a0c17…', x, y - 26 * DPR, { size: 12, color: rgba(C.ink, l), align: 'center', back: true, alpha: l });
      }
      const e = pr(6, .55, .75) * fade;
      if (e > .01) {
        const [x, y] = P(FL.chain, angleOf(48), .81);
        ctx.beginPath(); ctx.arc(x, y, 18 * DPR * (1 + .3 * (1 - e)), 0, TAU); ctx.strokeStyle = rgba(C.accent, e * .8); ctx.lineWidth = LW * 1.6; ctx.stroke();
        text('epoch 8 closed: 12 receipts, totals, chain head', x, y + 34 * DPR, { size: 12, color: rgba(C.ink, e), align: 'center', back: true, alpha: e });
      }
    }
    // 7 and 8: the bypass lands on the rail, then the audit reaches it
    if (st.orphan > 0 || (S >= 7 && S < 8.95)) {
      const th = angleOf(ORPH);
      const u = pr(7, .08, .58);
      if (S < 8 && u > 0 && u < 1) {
        const [ex, ey] = P(FL.rail, th, .93), sx = wide ? W * 1.02 : W * 1.05, sy = ey - 140 * DPR;
        const k = smooth(u), cx1 = lerp(sx, ex, .5), cy1 = sy - 60 * DPR;
        const x = (1 - k) * (1 - k) * sx + 2 * (1 - k) * k * cx1 + k * k * ex, y = (1 - k) * (1 - k) * sy + 2 * (1 - k) * k * cy1 + k * k * ey;
        ctx.setLineDash([3 * DPR, 4 * DPR]); ctx.strokeStyle = rgba(C.ink, .35 * cam.E); ctx.lineWidth = LW;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(cx1, cy1, x, y); ctx.stroke(); ctx.setLineDash([]);
        dot(x, y, Tok, C.ink, cam.E);
      }
      if (st.orphan > .01) {
        const caught = st.auditOn && sweep(th).done;
        const col = caught ? C.fail : C.ink;
        const [x1, y1] = P(FL.rail, th, .878), [x2, y2] = P(FL.rail, th, .975);
        ctx.strokeStyle = rgba(col, st.orphan); ctx.lineWidth = Math.max(1.6, 1.9 * DPR); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        if (!caught && S < 8.3) { const [lx, ly] = P(FL.rail, th, .93); text('bypass-hidden 7 USD', lx - 14 * DPR, ly + 20 * DPR, { size: 11.5, color: rgba(C.ink, st.orphan * pr(7, .6, .75)), align: 'right', back: true, alpha: st.orphan }); }
        if (caught) {
          const [bx, by] = P(FL.chain, th, .81), bR = Math.max(1.4 * DPR, .0072 * B(FL.chain).k);
          ctx.setLineDash([2.2 * DPR, 2.2 * DPR]); ctx.beginPath(); ctx.arc(bx, by, bR * 2.4, 0, TAU); ctx.strokeStyle = rgba(C.fail, .95); ctx.lineWidth = LW * 1.4; ctx.stroke();
          const [tx, ty] = P(FL.rail, th, .875); ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(bx, by); ctx.strokeStyle = rgba(C.fail, .45); ctx.stroke(); ctx.setLineDash([]);
          const [cx2, cy2] = P(FL.rail, th, .925), k = reduce ? 0 : (now / 1000 % 2.4) / 2.4;
          ctx.beginPath(); ctx.arc(cx2, cy2, (.03 + .09 * k) * U * cam.Z, 0, TAU); ctx.strokeStyle = rgba(C.fail, reduce ? .5 : .7 * (1 - k)); ctx.lineWidth = LW * 1.4; ctx.stroke();
          const [lx, ly] = P(FL.rail, th, .93); text('settlement-without-receipt', lx - 14 * DPR, ly + 20 * DPR, { size: 12, color: rgba(C.fail, 1), align: 'right', back: true });
        }
      }
    }
  }

  function sandboxOverlay(st, now) {
    if (!st.sandbox || !sb.orphan) return;
    const th = angleOf(ORPH);
    if (!sb.caught && (reduce || paused || passed(th))) { sb.caught = true; sb.caughtAt = now; render(); }
    const col = sb.caught ? C.fail : C.ink;
    const [x1, y1] = P(FL.rail, th, .878), [x2, y2] = P(FL.rail, th, .975);
    ctx.strokeStyle = rgba(col, 1); ctx.lineWidth = Math.max(1.6, 1.9 * DPR); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    if (sb.caught) {
      const [bx, by] = P(FL.chain, th, .81), bR = Math.max(1.4 * DPR, .0072 * B(FL.chain).k);
      ctx.setLineDash([2.2 * DPR, 2.2 * DPR]); ctx.beginPath(); ctx.arc(bx, by, bR * 2.2, 0, TAU); ctx.strokeStyle = rgba(C.fail, .95); ctx.lineWidth = LW * 1.3; ctx.stroke(); ctx.setLineDash([]);
      const [cx2, cy2] = P(FL.rail, th, .925), k = reduce ? 0 : ((now - sb.caughtAt) / 1000 % 2.4) / 2.4;
      ctx.beginPath(); ctx.arc(cx2, cy2, (.03 + .09 * k) * U * cam.Z, 0, TAU); ctx.strokeStyle = rgba(C.fail, reduce ? .5 : .7 * (1 - k)); ctx.lineWidth = LW * 1.4; ctx.stroke();
    }
  }
  function passed(th) { let a = (th - prevPsi) % TAU; if (a < 0) a += TAU; let span = (psi - prevPsi) % TAU; if (span < 0) span += TAU; return a > 0 && a <= span; }

  function floorLabels(st) {
    const E = cam.E; if (E < .05) return;
    const items = [
      { fl: FL.gate, t: 'Policy decision point', n: 'Policy', s: 'default deny', a: st.gate },
      { fl: FL.rail, t: 'Rail extract', n: 'Rail', s: 'what the rail settled', a: 1 },
      { fl: FL.legend, t: 'Signed receipt', n: 'Receipt', s: 'COSE_Sign1, Ed25519', a: 1 },
      { fl: FL.chain, t: 'Receipt chain', n: 'Chain', s: 'with epoch checkpoints', a: 1 },
    ];
    for (const it of items) {
      const a = E * it.a; if (a < .02) continue;
      const [x, y] = P(it.fl, 0, wide ? 1.08 : 1.02);
      const tx = wide ? x + 14 * DPR : Math.min(x + 6 * DPR, W - 4 * DPR);
      const al = wide ? 'left' : 'right';
      const xx = wide ? tx : W - 10 * DPR;
      text(wide ? it.t : it.n, xx, y - 8 * DPR, { size: wide ? 14 : 12, weight: 600, font: 'display', color: rgba(C.ink, a), align: al, back: !wide, alpha: a });
      if (wide) text(it.s, xx, y + 10 * DPR, { size: 12, font: 'sans', color: rgba(C.dim, a), align: al });
      if (wide) { ctx.strokeStyle = rgba(C.ink, .3 * a); ctx.lineWidth = LW; ctx.beginPath(); ctx.moveTo(x - 4 * DPR, y); ctx.lineTo(tx - 6 * DPR, y); ctx.stroke(); }
    }
  }

  // ---------- scroll ----------
  function measure() {
    beatBox = beats.map((el) => { const r = el.getBoundingClientRect(); return { top: r.top + window.scrollY, h: r.height }; });
  }
  function readScroll() {
    if (!beatBox.length) return;
    const ref = window.scrollY + window.innerHeight * .5;
    let v = 0;
    for (let i = 0; i < beatBox.length; i++) { const b = beatBox[i]; if (ref >= b.top) v = i + clamp((ref - b.top) / b.h, 0, .999); }
    if (ref < beatBox[0].top) v = 0;
    sTarget = v;
  }
  function updateChapters() {
    const on = s >= .85;
    chaptersEl.classList.toggle('on', on);
    const idx = Math.floor(s + .02) - 1;
    chapterItems.forEach((li, i) => { li.dataset.on = i === idx ? '1' : '0'; });
  }
  chapterItems.forEach((li) => li.querySelector('button').addEventListener('click', (e) => {
    const i = +e.currentTarget.dataset.go, b = beatBox[i]; if (!b) return;
    window.scrollTo({ top: b.top + b.h * .5 - window.innerHeight * .5 + 1, behavior: reduce ? 'auto' : 'smooth' });
  }));
  window.addEventListener('scroll', readScroll, { passive: true });

  // ---------- sandbox ----------
  const stSig = $('#st-sig'), stChain = $('#st-chain'), stAudit = $('#st-audit');
  const bTamper = $('#do-tamper'), bOrphan = $('#do-orphan'), bReset = $('#do-reset');
  function render() {
    stSig.dataset.state = sb.tampered ? 'fail' : 'ok';
    stSig.textContent = sb.tampered ? 'fails: amount changed from 0.25 to 0.26 after signing' : 'valid';
    stChain.dataset.state = 'neutral';
    stChain.textContent = sb.orphan ? '97 settlements, 96 receipts' : '96 settlements, 96 receipts';
    if (sb.orphan && sb.caught) { stAudit.dataset.state = 'fail'; stAudit.innerHTML = '<code>audit: 1 settlement without receipt → FAIL</code>'; }
    else if (sb.orphan) { stAudit.dataset.state = 'neutral'; stAudit.textContent = 'reconciling the extract'; }
    else if (sb.tampered) { stAudit.dataset.state = 'fail'; stAudit.textContent = 'a receipt fails its signature check'; }
    else { stAudit.dataset.state = 'ok'; stAudit.innerHTML = '<code>audit: balanced</code>'; }
    bTamper.disabled = sb.tampered; bOrphan.disabled = sb.orphan; bReset.disabled = !sb.tampered && !sb.orphan;
  }
  bTamper.addEventListener('click', async () => {
    if (sb.tampered) return; sb.tampered = true; render();
    if (!imgsBad) { const claims = { ...BASE, amount: '0.26' }, by = await digest(claims); hashBad = toHex(by); imgsBad = buildLayers(paramsFrom(by), hashBad, claims, true); }
  });
  bOrphan.addEventListener('click', () => { if (sb.orphan) return; sb.orphan = true; sb.caught = false; const th = angleOf(ORPH); psi = prevPsi = ((th - 1.05) % TAU + TAU) % TAU; render(); });
  function resetSandbox() { sb.tampered = false; sb.orphan = false; sb.caught = false; render(); }
  bReset.addEventListener('click', resetSandbox);
  setInterval(() => { if (sTarget < 8.6 && (sb.tampered || sb.orphan)) resetSandbox(); }, 500);

  const motionBtn = $('#motion');
  if (reduce) motionBtn.hidden = true;
  motionBtn.addEventListener('click', () => { paused = !paused; motionBtn.textContent = paused ? 'Resume the motion' : 'Stop the motion'; });

  document.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
    const el = document.getElementById(b.dataset.copy), txt = el.textContent.trim();
    try { await navigator.clipboard.writeText(txt); b.textContent = 'Copied'; }
    catch (e) { const r = document.createRange(); r.selectNodeContents(el); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); b.textContent = 'Selected'; }
    setTimeout(() => { b.textContent = 'Copy'; }, 1600);
  }));

  // ---------- layout ----------
  let baseBytes = null;
  async function layout() {
    const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return;
    DPR = Math.min(2, window.devicePixelRatio || 1); wide = w >= 760;
    W = Math.round(w * DPR); H = Math.round(h * DPR); cv.width = W; cv.height = H;
    U = (wide ? Math.min(w * .22, h * .37) : Math.min(w * .44, h * .3)) * DPR;
    LW = Math.max(.7, .72 * DPR);
    if (wide) {
      // free space left of the seal, over every scene where the seal is whole (the dive and the zoom fill the screen anyway)
      const Uc = U / DPR, X = Math.min(...KEYS_WIDE.filter((k) => k.c === 0 && k.fy === 0).map((k) => k.cx * w - k.Z * Uc));
      const pw = Math.round(clamp(X - 2 * Math.max(56, X * .12), 300, 440)), left = Math.round(Math.max(28, (X - pw) / 2));
      const root = document.documentElement.style;
      root.setProperty('--panel-w', pw + 'px'); root.setProperty('--panel-left', left + 'px'); root.setProperty('--veil-x', Math.round(left + pw + Math.max(40, left * .6)) + 'px');
    }
    if (!baseBytes) { baseBytes = await digest(BASE); hashHex = toHex(baseBytes); }
    buildStatic();
    imgs = buildLayers(paramsFrom(baseBytes), hashHex, BASE, false);
    imgsBad = null; if (sb.tampered) { const claims = { ...BASE, amount: '0.26' }, by = await digest(claims); imgsBad = buildLayers(paramsFrom(by), toHex(by), claims, true); }
    measure(); readScroll(); s = sTarget;
  }
  let rt = 0;
  new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(layout, 140); }).observe(stage);
  new ResizeObserver(() => { measure(); readScroll(); }).observe(document.querySelector('.beats'));
  document.addEventListener('visibilitychange', () => { last = performance.now(); });

  const fontsReady = document.fonts && document.fonts.load
    ? Promise.all([document.fonts.load('400 11px "IBM Plex Mono"'), document.fonts.load('600 14px Manrope'), document.fonts.load('400 12px "IBM Plex Sans"'), document.fonts.ready]).catch(() => {})
    : Promise.resolve();
  fontsReady.then(() => layout()).then(() => { render(); requestAnimationFrame(frame); });
})();
