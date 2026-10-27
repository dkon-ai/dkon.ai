// The tree orb on the hero: ORB's module (/hero/orb/orb.js, Three.js, the real tree's shape) wearing the hero's orb face,
// { start, stop, setSky, resize, destroy }. No live feed on a public page, so the tree remembers itself: every few seconds a
// leaf lights and its threads carry the light out, now and then the core breathes. One requestAnimationFrame loop, here.
import { createOrb as createTreeOrb } from '/hero/orb/orb.js';
export const ORB_KIND = 'tree';

export function createOrb(canvas, graph, opts = {}) {
  let sky = opts.sky === 'slate' ? 'slate' : 'paper';
  let orb = null, raf = 0, running = false, want = true, timer = 0;
  let shown = graph.n, growP = 1;                       // how many leaves exist at the growth front (all, unless growing)
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // the remembered embers favour the leaves that carry weight: hearts and pours more often than orienting notes
  const pool = [];
  for (let i = 0; i < graph.n; i++) { const c = graph.charge[i]; const k = c >= 3 ? 3 : c === 2 ? 2 : 1; for (let j = 0; j < k; j++) pool.push(i); }

  const size = () => [Math.max(1, canvas.clientWidth), Math.max(1, canvas.clientHeight)];
  function make() {
    const [w, h] = size();
    orb = createTreeOrb(canvas, graph, { palette: sky, transparent: true, fill: opts.fill ?? 0.78, width: w, height: h, dpr: Math.min(window.devicePixelRatio || 1, opts.quality === 'wall' ? 1.5 : 2) });
    if (growP < 1) grow(growP);
  }
  /** Grow the tree to share p of its leaves (paced by leaves, so the quiet first months pass quickly): returns where the front stands. */
  function grow(p) {
    growP = Math.max(0, Math.min(1, p));
    if (!graph.born || typeof orb.setReveal !== 'function') return null;
    if (growP >= 1) { shown = graph.n; orb.setReveal(1e9, 1); return { count: graph.n, sec: graph.born[graph.n - 1] }; }
    const k = Math.min(graph.n - 1, Math.floor(growP * (graph.n - 1)));
    shown = k + 1;
    orb.setReveal((graph.born[k] - orb.born0) / 86400, shown / graph.n);
    return { count: shown, sec: graph.born[k] };
  }
  make();

  const loop = (now) => { raf = requestAnimationFrame(loop); orb.frame(now); };
  function remember() {
    let i = pool[(Math.random() * pool.length) | 0];
    if (i >= shown) i = (Math.random() * shown) | 0;   // while the tree grows, only what has been born can be remembered
    orb.ignite(i, { strength: graph.charge[i] >= 2 ? 0.62 : 0.42 });
    if (graph.charge[i] === 3 && Math.random() < 0.5) orb.breathe();
    timer = setTimeout(remember, (reduce ? 9000 : 2600) + Math.random() * 5200);
  }
  function start() { want = true; if (running || document.hidden) return; running = true; raf = requestAnimationFrame(loop); clearTimeout(timer); timer = setTimeout(remember, 1200); }
  function stop() { if (!document.hidden) want = false; running = false; cancelAnimationFrame(raf); clearTimeout(timer); }
  const onVis = () => { if (document.hidden) stop(); else if (want) start(); };
  document.addEventListener('visibilitychange', onVis);
  const ro = new ResizeObserver(() => { const [w, h] = size(); orb.resize(w, h); });
  ro.observe(canvas);
  start();

  return {
    start, stop,
    resize() { const [w, h] = size(); orb.resize(w, h); },
    // a palette is baked into the orb's materials, so a new sky is a new orb on a fresh canvas (only on a click)
    setSky(next) {
      if (next === sky || (next !== 'slate' && next !== 'paper')) return;
      sky = next;
      const was = running;
      stop(); ro.unobserve(canvas); orb.dispose();
      const fresh = canvas.cloneNode(false);
      canvas.replaceWith(fresh); canvas = fresh;
      make(); ro.observe(canvas);
      if (was) start();
    },
    grow,
    stats: () => orb.stats(),
    destroy() { stop(); ro.disconnect(); document.removeEventListener('visibilitychange', onVis); orb.dispose(); },
  };
}

/** The growth rings: one per month of the tree, spaced by how much grew that month (ORB's formula), as radii in the orb's own radii,
 *  each with the second its month began (so a growing tree can show only the months it has lived). */
export function ringRadii(graph, { from = 1.18, to = 4.2, max = 24 } = {}) {
  const rings = (graph.rings ?? []).slice(-max);
  const widths = rings.map((r) => Math.pow(r.n + 5, 0.55));
  const total = widths.reduce((a, b) => a + b, 0) || 1;
  let acc = from;
  return widths.map((w, i) => ({ r: (acc += (w / total) * (to - from)), sec: Date.UTC(rings[i].y, rings[i].m - 1, 1) / 1000 }));
}
