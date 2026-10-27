// The stand-in orb (HERO, Oct 26 2026): a Canvas 2D plexus shell holding smoke, embers and a hot core, until ORB's module
// (the real tree, Three.js) is copied into /hero/orb/. Same face: createOrb(canvas, data, opts) -> { start, stop, setSky, resize, destroy }.
// Synthetic on purpose: it draws no data. Every buffer is allocated once; the frame loop allocates nothing.
export const ORB_KIND = 'standin';

const SKIES = {
  paper: { line: [26, 23, 21], lineA: [0.10, 0.24, 0.52], node: 'rgba(22,20,18,0.78)', smoke: [62, 60, 58], smokeA: 0.20, core: 1.0 },
  slate: { line: [196, 204, 214], lineA: [0.06, 0.15, 0.34], node: 'rgba(226,230,236,0.72)', smoke: [120, 118, 116], smokeA: 0.12, core: 0.85 },
};

function sprite(size, stops) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) grd.addColorStop(o, col);
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  return c;
}

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

export function createOrb(canvas, _data, opts = {}) {
  const ctx = canvas.getContext('2d');
  const rand = rng(404);
  const N = opts.quality === 'wall' ? 520 : 380;
  const K = 3;

  // the shell: a fibonacci sphere, ragged: radius jitter, and a band pulled in so the silhouette breaks like the reference's
  const ux = new Float32Array(N), uy = new Float32Array(N), uz = new Float32Array(N);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = golden * i;
    const jitter = 0.80 + rand() * 0.24 - (rand() < 0.12 ? 0.18 : 0);
    ux[i] = Math.cos(th) * r * jitter; uy[i] = y * jitter * 0.96; uz[i] = Math.sin(th) * r * jitter;
  }
  // edges: each point to its K nearest (unique pairs)
  const ea = [], eb = [];
  const seen = new Set();
  for (let i = 0; i < N; i++) {
    const best = [];
    for (let j = 0; j < N; j++) {
      if (i === j) continue;
      const d = (ux[i] - ux[j]) ** 2 + (uy[i] - uy[j]) ** 2 + (uz[i] - uz[j]) ** 2;
      best.push([d, j]);
    }
    best.sort((a, b) => a[0] - b[0]);
    for (let k = 0; k < K + (rand() < 0.3 ? 1 : 0); k++) {
      const j = best[k][1], key = i < j ? i * N + j : j * N + i;
      if (!seen.has(key)) { seen.add(key); ea.push(i); eb.push(j); }
    }
  }
  const E = ea.length, EA = Int32Array.from(ea), EB = Int32Array.from(eb);
  // triangles: triples whose three edges all exist, for the gold facets
  const tri = [];
  for (let e = 0; e < E && tri.length < 600; e++) {
    const i = EA[e], j = EB[e];
    for (let k = 0; k < N; k++) {
      if (k === i || k === j) continue;
      const ik = i < k ? i * N + k : k * N + i, jk = j < k ? j * N + k : k * N + j;
      if (seen.has(ik) && seen.has(jk) && k > j) tri.push(i, j, k);
    }
  }
  const T = tri.length / 3, TR = Int32Array.from(tri);
  const FL = 6, flareTri = new Int32Array(FL).fill(-1), flareT = new Float32Array(FL);   // a few facets lit at once
  // embers inside: slow orbits, slow rise, flicker
  const M = opts.quality === 'wall' ? 170 : 120;
  const er = new Float32Array(M), ea0 = new Float32Array(M), ey = new Float32Array(M), es = new Float32Array(M), ep = new Float32Array(M), esz = new Float32Array(M);
  for (let m = 0; m < M; m++) { er[m] = Math.sqrt(rand()) * 0.56; ea0[m] = rand() * Math.PI * 2; ey[m] = rand() * 1.2 - 0.6; es[m] = 0.08 + rand() * 0.25; ep[m] = rand() * 10; esz[m] = 0.6 + rand() * 1.4; }
  // smoke: soft blobs drifting through
  const S = 14;
  const sx0 = new Float32Array(S), sy0 = new Float32Array(S), sz0 = new Float32Array(S), ss = new Float32Array(S), sp = new Float32Array(S);
  for (let s = 0; s < S; s++) { sx0[s] = rand() * 1.0 - 0.5; sy0[s] = rand() * 0.9 - 0.45; sz0[s] = rand() * 0.8 - 0.4; ss[s] = 0.35 + rand() * 0.45; sp[s] = rand() * 6.28; }

  // projected positions, reused every frame
  const px = new Float32Array(N), py = new Float32Array(N), pz = new Float32Array(N);
  const emberSprite = sprite(64, [[0, 'rgba(255,246,220,1)'], [0.18, 'rgba(255,196,96,0.95)'], [0.45, 'rgba(255,128,40,0.35)'], [1, 'rgba(255,90,20,0)']]);
  const coreSprite = sprite(256, [[0, 'rgba(255,244,214,0.95)'], [0.12, 'rgba(255,198,104,0.75)'], [0.38, 'rgba(255,140,44,0.22)'], [1, 'rgba(255,120,30,0)']]);
  let smokeSprite = null;

  let sky = SKIES[opts.sky] ? opts.sky : 'paper';
  let pal = SKIES[sky];
  const makeSmoke = () => { const [r, g, b] = pal.smoke; smokeSprite = sprite(128, [[0, `rgba(${r},${g},${b},1)`], [0.5, `rgba(${r},${g},${b},0.45)`], [1, `rgba(${r},${g},${b},0)`]]); };
  makeSmoke();
  const lineStyle = [0, 1, 2].map(() => '');
  const setLines = () => { const [r, g, b] = pal.line; for (let i = 0; i < 3; i++) lineStyle[i] = `rgba(${r},${g},${b},${pal.lineA[i]})`; };
  setLines();

  let W = 0, H = 0, dpr = 1;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (w !== W || h !== H) { W = canvas.width = w; H = canvas.height = h; }
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let raf = 0, running = false, last = 0, t = 0, nextFlare = 0;

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now;
    t += dt * (reduce ? 0.25 : 1);
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.40;
    const ay = t * 0.055, ax = 0.34 + Math.sin(t * 0.07) * 0.06;
    const cyA = Math.cos(ay), syA = Math.sin(ay), cxA = Math.cos(ax), sxA = Math.sin(ax);
    const f = 3.0;
    for (let i = 0; i < N; i++) {
      const x1 = ux[i] * cyA + uz[i] * syA, z1 = -ux[i] * syA + uz[i] * cyA;
      const y2 = uy[i] * cxA - z1 * sxA, z2 = uy[i] * sxA + z1 * cxA;
      const s = f / (f - z2);
      px[i] = cx + x1 * R * s; py[i] = cy + y2 * R * s; pz[i] = z2;
    }
    ctx.clearRect(0, 0, W, H);

    // smoke and the core first, so the net reads in front of them
    ctx.globalCompositeOperation = 'source-over';
    for (let s = 0; s < S; s++) {
      const a = t * 0.03 + sp[s];
      const x = sx0[s] + Math.sin(a) * 0.12, z = sz0[s] + Math.cos(a * 0.8) * 0.12, y = sy0[s] + Math.sin(a * 0.6) * 0.06;
      const x1 = x * cyA + z * syA;
      const size = ss[s] * R * (1.1 + Math.sin(a * 1.3) * 0.15);
      ctx.globalAlpha = pal.smokeA * (0.65 + Math.sin(a * 0.9) * 0.35);
      ctx.drawImage(smokeSprite, cx + x1 * R - size, cy + y * R - size, size * 2, size * 2);
    }
    ctx.globalCompositeOperation = 'lighter';
    const pulse = 0.82 + Math.sin(t * 0.6) * 0.1 + Math.sin(t * 1.7) * 0.05;
    const cs = R * 0.95 * pulse;
    ctx.globalAlpha = 0.55 * pal.core;
    ctx.drawImage(coreSprite, cx - cs + R * 0.08, cy - cs + R * 0.12, cs * 2, cs * 2);

    // the net, back to front in three depth bands
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.lineWidth = Math.max(1, dpr * 0.8);
    for (let band = 0; band < 3; band++) {
      const lo = band === 0 ? -9 : band === 1 ? -0.25 : 0.3, hi = band === 0 ? -0.25 : band === 1 ? 0.3 : 9;
      ctx.strokeStyle = lineStyle[band];
      ctx.beginPath();
      for (let e = 0; e < E; e++) {
        const a = EA[e], b = EB[e], z = (pz[a] + pz[b]) * 0.5;
        if (z < lo || z >= hi) continue;
        ctx.moveTo(px[a], py[a]); ctx.lineTo(px[b], py[b]);
      }
      ctx.stroke();
    }
    ctx.fillStyle = pal.node;
    const ns = Math.max(1.4, dpr * 1.3);
    for (let i = 0; i < N; i++) if (pz[i] > 0.05) ctx.fillRect(px[i] - ns / 2, py[i] - ns / 2, ns, ns);

    // the gold facets: one lights every so often, near the front, and cools over a few seconds
    if (t > nextFlare && T > 0) {
      nextFlare = t + 0.9 + Math.random() * 1.6;
      let slot = 0;
      for (let k = 1; k < FL; k++) if (flareT[k] < flareT[slot]) slot = k;
      for (let tries = 0; tries < 12; tries++) {
        const c = (Math.random() * T) | 0;
        if (pz[TR[c * 3]] > -0.1) { flareTri[slot] = c; flareT[slot] = 1; break; }
      }
    }
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < FL; k++) {
      if (flareTri[k] < 0 || flareT[k] <= 0) continue;
      flareT[k] = Math.max(0, flareT[k] - dt * 0.38);
      const c = flareTri[k], a = TR[c * 3], b = TR[c * 3 + 1], d = TR[c * 3 + 2];
      const heat = flareT[k] * flareT[k];
      ctx.globalAlpha = heat * 0.42;
      ctx.fillStyle = 'rgb(255,176,74)';
      ctx.beginPath(); ctx.moveTo(px[a], py[a]); ctx.lineTo(px[b], py[b]); ctx.lineTo(px[d], py[d]); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = heat * 0.95;
      ctx.strokeStyle = 'rgb(255,226,170)';
      ctx.lineWidth = Math.max(1.2, dpr * 1.1);
      ctx.stroke();
      const gs = R * 0.16 * heat;
      ctx.globalAlpha = heat * 0.8;
      ctx.drawImage(emberSprite, (px[a] + px[b] + px[d]) / 3 - gs, (py[a] + py[b] + py[d]) / 3 - gs, gs * 2, gs * 2);
    }

    // embers: drifting, rising, flickering
    for (let m = 0; m < M; m++) {
      const ang = ea0[m] + t * es[m];
      let y = ey[m] - ((t * 0.02 * es[m] * 4) % 1.2);
      if (y < -0.6) y += 1.2;
      const x = Math.cos(ang) * er[m], z = Math.sin(ang) * er[m];
      const x1 = x * cyA + z * syA, z1 = -x * syA + z * cyA;
      const y2 = y * cxA - z1 * sxA, z2 = y * sxA + z1 * cxA;
      const s = f / (f - z2);
      const flick = 0.55 + 0.45 * Math.sin(t * (2 + es[m] * 9) + ep[m]);
      const size = (2.2 + esz[m] * 2.6) * dpr * s * (0.7 + flick * 0.5);
      ctx.globalAlpha = Math.min(1, 0.35 + flick * 0.65) * (z2 > -0.3 ? 1 : 0.55);
      ctx.drawImage(emberSprite, cx + x1 * R * s - size, cy + y2 * R * s - size, size * 2, size * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  const onVis = () => { if (document.hidden) stop(); else if (want) start(); };
  let want = true;
  function start() { want = true; if (running || document.hidden) return; running = true; last = 0; raf = requestAnimationFrame(frame); }
  function stop() { if (!document.hidden) want = false; running = false; cancelAnimationFrame(raf); }
  document.addEventListener('visibilitychange', onVis);
  start();

  return {
    start, stop, resize,
    setSky(next) { if (!SKIES[next]) return; sky = next; pal = SKIES[next]; makeSmoke(); setLines(); },
    destroy() { stop(); ro.disconnect(); document.removeEventListener('visibilitychange', onVis); },
  };
}
