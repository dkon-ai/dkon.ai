// dkon.ai hero, branch hero-optimind. One pinned stage (001-003) scrubbed by scroll, slow and heavy; then 004 and 005 reveal as they arrive.
// The orb: ORB's module when it is copied into /hero/orb/ (orb.js + graph.json), else the stand-in beside this file.
const { gsap, ScrollTrigger } = window;
gsap.registerPlugin(ScrollTrigger);

const root = document.documentElement;
const page = document.getElementById('page');
const q = new URLSearchParams(location.search);
// The wall (5120x1440 and its kin): the page floats as a frosted panel and scrolls inside it. ?float=1 forces it, ?float=0 refuses it.
const installation = q.get('float') === '1' || (q.get('float') !== '0' && matchMedia('(min-aspect-ratio: 21/9) and (min-width: 2400px)').matches);
if (installation) root.classList.add('installation');
const scroller = installation ? page : window;
const scrollEl = installation ? page : document.scrollingElement;
ScrollTrigger.defaults({ scroller });

const vh = () => (installation ? page.clientHeight : window.innerHeight);
const setVh = () => root.style.setProperty('--vh', `${vh()}px`);
setVh();

// ---- the orb ----
let orb = null;
const sky = () => root.getAttribute('data-sky') || 'paper';
let treeRings = null, treeGraph = null;
async function startOrb() {
  let canvas = document.getElementById('orb');
  const quality = installation ? 'wall' : 'page';
  if (q.get('orb') !== 'standin') {
    try {
      const probe = await fetch('/hero/orb/orb.js', { method: 'HEAD' });
      if (probe.ok) {
        const [mod, r] = await Promise.all([import('/hero/orb-tree.js'), fetch('/hero/orb/graph.json')]);
        if (r.ok) {
          treeGraph = await r.json();
          orb = mod.createOrb(canvas, treeGraph, { sky: sky(), quality });
          treeRings = mod.ringRadii;
          root.dataset.orb = mod.ORB_KIND;
          drawRings();
          setGrowth(growP);
          return;
        }
      }
    } catch (e) {
      console.warn('the tree orb could not start; the stand-in draws instead', e);
      const fresh = canvas.cloneNode(false); canvas.replaceWith(fresh); canvas = fresh;   // a canvas that tried WebGL can't give a 2D context
    }
  }
  const mod = await import('/hero/orb-standin.js');
  orb = mod.createOrb(canvas, null, { sky: sky(), quality });
  root.dataset.orb = mod.ORB_KIND;
}
// the growth rings behind the tree: one per month, spaced by how much grew that month, measured in the orb's own radius
function drawRings() {
  if (!treeRings || !treeGraph) return;
  const svg = document.querySelector('.rings'), wrap = document.querySelector('.orb-wrap'), stage = document.querySelector('.stage');
  const orbR = (wrap.offsetHeight * 0.78) / 2;
  const svgPx = parseFloat(getComputedStyle(svg).width) || 1;
  const radii = treeRings(treeGraph, { to: Math.min(4.2, (Math.max(stage.clientWidth, stage.clientHeight) * 0.55) / orbR) });
  const u = 1000 / svgPx;
  svg.replaceChildren(...radii.map(({ r, sec }) => { const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); c.setAttribute('r', (r * orbR * u).toFixed(1)); c.dataset.sec = sec; return c; }));
  showRings(frontSec);
}
// ---- the growth: the hero opens on the tree's first seed and the scroll grows it, a ring arriving with each month (?grow=0: the full tree from the start)
const growing = q.get('grow') !== '0';
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const capMonth = document.querySelector('.grow-month'), capCount = document.querySelector('.grow-count');
let frontSec = Infinity, growP = growing ? 0 : 1;
function showRings(sec) {
  document.querySelectorAll('.rings circle').forEach((c) => c.classList.toggle('unborn', Number(c.dataset.sec) > sec));
}
function setGrowth(p) {
  growP = p;
  const at = orb?.grow?.(p);
  if (!at) return;
  frontSec = p >= 1 ? Infinity : at.sec;
  showRings(frontSec);
  const d = new Date(at.sec * 1000);
  capMonth.textContent = `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  capCount.textContent = `${at.count.toLocaleString('en-US')} ${at.count === 1 ? 'memory' : 'memories'}`;
}
const orbReady = startOrb().catch((e) => console.warn('orb failed', e));

// ---- the plates: EMBOSS's renders for this sky (unless ?icons=svg)
function setPlates() {
  if (!root.classList.contains('icons-plates')) return;
  const s = sky();
  document.querySelectorAll('.plate-stack').forEach((st) => {
    const m = st.dataset.plate;
    st.querySelector('.plate-base').src = `/hero/plates/${m}-${s}-base.webp`;
    st.querySelector('.plate-gold').src = `/hero/plates/${m}-${s}-gold.webp`;
  });
}
setPlates();

// ---- the counter and the nav glow ----
const counter = document.querySelector('.c-now');
const glow = document.querySelector('.nav-glow');
const navLinks = [...document.querySelectorAll('.nav-main a')];
let shown = 0;
function setSection(n) {
  if (n === shown) return;
  shown = n;
  counter.textContent = String(n).padStart(3, '0');
  const key = { 2: 'tree', 3: 'studio', 4: 'story', 5: 'letters' }[n];
  const a = navLinks.find((l) => l.dataset.to === key);
  if (!a) { gsap.to(glow, { opacity: 0, duration: 0.8, ease: 'power2.out' }); return; }
  const x = a.offsetLeft + a.offsetWidth / 2 - glow.offsetWidth / 2;
  gsap.to(glow, { x, opacity: 1, duration: 1.1, ease: 'power3.inOut' });
}

// ---- 001-003: the pinned stage ----
const narrow = matchMedia('(max-width: 900px)').matches;   // on a phone the split is taller, so the orb starts lower to peek out under it
// CSS centres these with the translate property for the first paint; GSAP takes them over here, so its percentages mean what they say
const own = (sel, vars) => document.querySelectorAll(sel).forEach((el) => { el.style.translate = 'none'; gsap.set(el, vars); });
own('.orb-wrap', { xPercent: -50, yPercent: -50 });
own('.rings', { xPercent: -50, yPercent: -50 });
own('.tree-title', { yPercent: -50 });
own('.wipe', { yPercent: 100 });
const cardLamps = [0, 1, 2].map((i) => document.querySelector(`#emb-${i} .lamp`));
const growth = { p: 0 };   // the growth front, scrubbed by the pinned timeline
const tl = gsap.timeline({
  defaults: { ease: 'power2.inOut' },
  scrollTrigger: {
    trigger: '.stage', start: 'top top', end: () => `+=${Math.round(vh() * (growing ? 6.2 : 4.4))}`, pin: true, scrub: 1.6, anticipatePin: 1,
    invalidateOnRefresh: true,
    onUpdate: (st) => { const t = st.progress * tl.duration(); setSection(t < tl.labels.tree ? 1 : t < tl.labels.studio ? 2 : 3); },
    onLeave: () => orb?.stop?.(), onEnterBack: () => orb?.start?.(),
  },
});
tl.addLabel('split', 0)
  .to('.split', { yPercent: -101, duration: 1.2, ease: 'power3.inOut' }, 'split')
  .to('.split-note', { autoAlpha: 0, y: -24, duration: 0.5 }, 'split')
  .fromTo('.orb-wrap', { yPercent: narrow ? 6 : -36, scale: 0.84 }, { yPercent: -50, scale: 1, duration: 1.3, ease: 'power3.inOut' }, 'split')
  .fromTo('.rings', { scale: 0.86, autoAlpha: 0.4 }, { scale: 1, autoAlpha: 1, duration: 1.4 }, 'split+=0.1')
  .fromTo(growth, { p: 0 }, { p: 1, duration: growing ? 2.6 : 0.01, ease: 'power1.in', onUpdate: () => { if (growing) setGrowth(growth.p); } }, 'split+=0.15')
  .fromTo('.grow-caption', { autoAlpha: 0, y: 18 }, { autoAlpha: growing ? 1 : 0, y: 0, duration: 0.5, ease: 'power2.out' }, 'split+=0.35')
  .addLabel('tree', growing ? 'split+=2.6' : 0.8)
  .fromTo('.tree-title', { autoAlpha: 0, y: 34 }, { autoAlpha: 1, y: 0, duration: 0.6, ease: 'power3.out' }, 'tree')
  .to({}, { duration: 1.0 })                                                    // hold on the tree: installation, not demo
  .addLabel('wipe')
  .to('.tree-title', { autoAlpha: 0, y: -24, duration: 0.45 }, 'wipe')
  .to('.grow-caption', { autoAlpha: 0, duration: 0.4 }, 'wipe')
  .fromTo('.wipe', { yPercent: 100 }, { yPercent: 0, duration: 1.25, ease: 'power3.inOut' }, 'wipe')
  .addLabel('studio', '>-0.35')
  .fromTo('.card', { y: 160, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 1.0, stagger: 0.18, ease: 'power3.out' }, 'studio')
  .addLabel('gold', '>-0.1')
  .fromTo('.card .emb', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.7, stagger: 0.22, ease: 'power1.inOut' }, 'gold')
  .fromTo(cardLamps, { attr: { x: -110, y: 10, z: 46 } }, { attr: { x: 300, y: 190, z: 64 }, duration: 1.6, stagger: 0.22, ease: 'power1.inOut' }, 'gold')
  .fromTo('.card .plate-base', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.7, stagger: 0.22, ease: 'power1.inOut' }, 'gold')
  .fromTo('.card .plate-gold', { '--sweep': 0 }, { '--sweep': 1, duration: 1.7, stagger: 0.22, ease: 'power1.inOut' }, 'gold+=0.25')
  .fromTo('.card h3, .card p', { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.55, stagger: 0.05, ease: 'power2.out' }, 'gold+=0.9')
  .fromTo('.consult', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5 }, '>-0.2')
  .to({}, { duration: 0.5 });

// after the trace, each card's gold follows the hand (and drifts home when it leaves)
document.querySelectorAll('.card').forEach((card, i) => {
  const lamp = cardLamps[i];
  if (!lamp) return;
  const svg = card.querySelector('svg.emb');
  const qx = gsap.quickTo(lamp, 'attr:x', { duration: 1.1, ease: 'power3.out' });
  const qy = gsap.quickTo(lamp, 'attr:y', { duration: 1.1, ease: 'power3.out' });
  card.addEventListener('pointermove', (e) => {
    if (tl.scrollTrigger.progress < 0.97) return;
    const r = svg.getBoundingClientRect();
    qx(((e.clientX - r.left) / r.width) * 200);
    qy(((e.clientY - r.top) / r.height) * 200);
  });
  card.addEventListener('pointerleave', () => { if (tl.scrollTrigger.progress >= 0.97) { qx(300); qy(190); } });
});

// ---- 004 and 005 ----
ScrollTrigger.create({ trigger: '#story', start: 'top 55%', end: 'bottom 55%', onEnter: () => setSection(4), onEnterBack: () => setSection(4) });
ScrollTrigger.create({ trigger: '#letters', start: 'top 55%', onEnter: () => setSection(5), onLeaveBack: () => setSection(4) });
gsap.utils.toArray('.reveal').forEach((el) => {
  gsap.fromTo(el, { autoAlpha: 0, y: 46 }, { autoAlpha: 1, y: 0, duration: 1.6, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 88%' } });
});
// the story's tree takes its own slow light when it arrives
const treeLamp = document.querySelector('#emb-3 .lamp');
gsap.fromTo('.story-tree .plate-gold', { '--sweep': 0 }, { '--sweep': 1, duration: 3.2, ease: 'power1.inOut', scrollTrigger: { trigger: '.story-tree', start: 'top 80%' } });
if (treeLamp) gsap.fromTo(treeLamp, { attr: { x: -80, y: -20, z: 50 } }, { attr: { x: 280, y: 220, z: 70 }, duration: 3.2, ease: 'power1.inOut', scrollTrigger: { trigger: '.story-tree', start: 'top 80%' } });

// ---- nav: jump to a beat, even inside the pin ----
function scrollToLabel(label) {
  const st = tl.scrollTrigger;
  const y = st.start + (tl.labels[label] / tl.duration()) * (st.end - st.start) + 2;
  scrollEl.scrollTo({ top: y, behavior: 'smooth' });
}
navLinks.forEach((a) => a.addEventListener('click', (e) => {
  const to = a.dataset.to;
  if (to === 'tree' || to === 'studio') { e.preventDefault(); scrollToLabel(to === 'tree' ? 'tree' : 'gold'); }
  else if (installation) { e.preventDefault(); const el = document.getElementById(to); scrollEl.scrollTo({ top: el.offsetTop, behavior: 'smooth' }); }
}));

// ---- the sky ----
document.querySelector('.sky-toggle').addEventListener('click', () => {
  const next = sky() === 'paper' ? 'slate' : 'paper';
  root.setAttribute('data-sky', next);
  localStorage.setItem('dkon-sky', next);
  setPlates();
  orb?.setSky?.(next);
  const u = new URL(location.href); u.searchParams.set('sky', next); history.replaceState(null, '', u);
});

// ---- the tour: the wall drifts through the sequence on its own, holds, fades, and begins again ----
if (root.classList.contains('tour')) {
  const max = () => scrollEl.scrollHeight - vh();
  const run = () => {
    scrollEl.scrollTop = 0;
    ScrollTrigger.update();
    gsap.fromTo(page, { autoAlpha: 0 }, { autoAlpha: 1, duration: 2.4, ease: 'power2.out' });
    gsap.to(scrollEl, { scrollTop: max(), duration: Number(q.get('tourSec')) || 96, ease: 'none', delay: 4,
      onComplete: () => gsap.to(page, { autoAlpha: 0, duration: 2.4, delay: 9, ease: 'power2.in', onComplete: run }) });
  };
  orbReady.then(() => setTimeout(run, 800));
}

// ---- the intro: on a fresh load at the top, the room fades up and the headline rises line by line (slow, heavy)
if (scrollEl.scrollTop < 8 && !matchMedia('(prefers-reduced-motion: reduce)').matches && !root.classList.contains('tour')) {
  gsap.timeline({ defaults: { ease: 'expo.out' } })
    .from('.nav, .counter, .scroll-cue, .sky-toggle', { autoAlpha: 0, duration: 1.6, ease: 'power2.out' }, 0)
    .from('.intro-lines .line > span', { yPercent: 115, duration: 1.7, stagger: 0.14 }, 0.15)
    .from('.split .lede', { autoAlpha: 0, y: 16, duration: 1.4, ease: 'power3.out' }, 0.75)
    .from('.split .ctas .pill', { autoAlpha: 0, y: 14, duration: 1.2, stagger: 0.1, ease: 'power3.out' }, 0.95)
    .from('.split .ember', { scale: 0, duration: 0.9, ease: 'back.out(3)' }, 1.15)
    .from('.orb-wrap', { autoAlpha: 0, duration: 2.2, ease: 'power2.out' }, 0.3);
}

window.addEventListener('resize', () => { setVh(); orb?.resize?.(); drawRings(); ScrollTrigger.refresh(); });
setSection(1);
window.__hero = { tl, scroller: scrollEl, get orb() { return orb; } };   // for the headless eyes
