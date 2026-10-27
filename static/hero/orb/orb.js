// The tree-orb: MTHR's tree as a wireframe net with the fire held inside it. Leaves are points, reach-backs are threads,
// the heaviest beams sit inside the net and glow, and a write (live or remembered) flares where it lands and runs its threads.
// Built to run all day: every buffer is allocated once at a fixed capacity, the frame allocates nothing, and all motion that
// can live on the GPU (sparks, smoke, cooling, pulses) is computed in the shaders from one time uniform.
//
//   import { createOrb } from './orb.js'
//   const orb = createOrb(canvas, graph, { palette: 'slate' })   // graph: GET /graph (see server.mjs)
//   orb.frame(nowMs)                    // call from your one requestAnimationFrame loop
//   orb.ignite(i, { strength, ring })   // light node i and run its threads
//   orb.addLeaf(evt)                    // a live leaf from /events: placed into spare capacity, then lit
//   orb.breathe()                       // a pour: the core swells once
//   orb.resize(w, h) · orb.stats() · orb.dispose()
import * as THREE from './vendor/three.module.js';

const R = 100;
const PALETTES = {
  slate: { top: [0.106, 0.122, 0.137], bottom: [0.150, 0.122, 0.098], glow: [0.86, 0.55, 0.24], ring: [0.62, 0.66, 0.70], node: [0.62, 0.66, 0.70], heart: [0.66, 0.52, 0.42], line: [0.52, 0.57, 0.62], reach: [0.66, 0.59, 0.52], smoke: [0.56, 0.57, 0.58], additive: true },
  paper: { top: [0.80, 0.80, 0.80], bottom: [0.74, 0.74, 0.74], glow: [0.95, 0.70, 0.36], ring: [0.40, 0.40, 0.42], node: [0.16, 0.17, 0.18], heart: [0.30, 0.22, 0.17], line: [0.12, 0.12, 0.13], reach: [0.20, 0.17, 0.14], smoke: [0.30, 0.30, 0.31], additive: false },
};

// ---------------------------------------------------------------- shaders
const BG_VS = /* glsl */`
varying vec2 vPx;
uniform vec2 uRes;
void main() { vPx = (position.xy * 0.5 + 0.5) * uRes; gl_Position = vec4(position.xy, 0.9999, 1.0); }`;
const BG_FS = /* glsl */`
precision highp float;
varying vec2 vPx;
uniform vec2 uRes; uniform vec2 uCenter; uniform float uOrbPx; uniform float uTime; uniform float uBreath;
uniform vec3 uTop; uniform vec3 uBottom; uniform vec3 uGlow; uniform vec3 uRing;
uniform float uRings[24]; uniform int uRingN; uniform float uOpaque;
void main() {
  float y = vPx.y / uRes.y;
  vec3 c = mix(uBottom, uTop, smoothstep(0.0, 1.0, y));
  // the one warm light: an amber glow pooled under the orb
  vec2 g = (vPx - (uCenter - vec2(0.0, uOrbPx * 0.78))) / vec2(uOrbPx * 2.3, uOrbPx * 0.9);
  float glow = exp(-dot(g, g) * 1.6) * (0.26 + 0.10 * uBreath);
  c += uGlow * glow;
  // growth rings: one per month since Boot Day, spaced by how much the tree grew that month
  float d = length(vPx - uCenter);
  float ringA = 0.0;
  for (int i = 0; i < 24; i++) {
    if (i >= uRingN) break;
    float r = uRings[i];
    float k = float(i) / max(1.0, float(uRingN - 1));
    float line = 1.0 - smoothstep(0.0, 1.15, abs(d - r));
    ringA += line * mix(0.046, 0.10, k);
  }
  // the newest ring carries a slow amber arc: now, going round
  float rn = uRings[uRingN - 1 < 0 ? 0 : uRingN - 1];
  float ang = atan(vPx.y - uCenter.y, vPx.x - uCenter.x);
  float head = mod(uTime * 0.045, 6.2831853) - 3.1415926;
  float da = abs(mod(ang - head + 3.1415926, 6.2831853) - 3.1415926);
  float arc = (1.0 - smoothstep(0.0, 1.6, abs(d - rn))) * smoothstep(0.55, 0.0, da);
  c += uRing * ringA + uGlow * arc * (0.30 + 0.25 * uBreath);
  // vignette
  vec2 v = (vPx / uRes - 0.5) * vec2(1.0, 1.6);
  c *= 1.0 - 0.38 * dot(v, v);
  gl_FragColor = vec4(c, uOpaque);
}`;

const LUMPY = /* glsl */`
float lh(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float lnoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(lh(i), lh(i + vec3(1.0, 0.0, 0.0)), f.x), mix(lh(i + vec3(0.0, 1.0, 0.0)), lh(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(lh(i + vec3(0.0, 0.0, 1.0)), lh(i + vec3(1.0, 0.0, 1.0)), f.x), mix(lh(i + vec3(0.0, 1.0, 1.0)), lh(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
// the net's silhouette: slow noise over direction pushes the shell in and out, so the orb is ragged, not a ball (same in every shader)
vec3 lumpy(vec3 p) {
  float r = length(p); vec3 d = p / max(r, 0.001);
  float k = smoothstep(62.0, 90.0, r);
  float n = lnoise(d * 2.2 + vec3(0.0, uTime * 0.0035, 0.0)) * 2.0 - 1.0;
  float n2 = lnoise(d * 5.3 + vec3(7.0, 3.0, uTime * 0.002)) * 2.0 - 1.0;
  return p * (1.0 + k * (0.17 * n + 0.07 * n2));
}`;

const NODE_VS = /* glsl */`
uniform float uTime; uniform float uPxScale; uniform float uCamZ; uniform float uBreath;
uniform vec3 uNode; uniform vec3 uHeart; uniform vec3 uGlow;
attribute float aCharge; attribute float aWeight; attribute float aIgnite; attribute float aStrength;
varying vec3 vColor; varying float vAlpha; varying float vGlyph;
${LUMPY}
void main() {
  vec4 mv = modelViewMatrix * vec4(lumpy(position), 1.0);
  float r = length(position) / ${R.toFixed(1)};
  float dt = uTime - aIgnite;
  float heat = dt >= 0.0 ? aStrength * (0.9 * exp(-dt / 1.3) + 0.38 * exp(-dt / 15.0)) : 0.0;
  float w = clamp(aWeight / 14.0, 0.0, 1.0);
  float size = mix(0.85, 2.5, sqrt(w)) * (aCharge > 2.5 ? 1.3 : 1.0) * (1.0 + 3.0 * heat);
  float depth = clamp((mv.z - uCamZ) / ${R.toFixed(1)}, -1.0, 1.0);
  float fire = smoothstep(0.74, 0.34, r);
  vec3 c = (aCharge > 1.5 && aCharge < 2.5) ? uHeart : uNode;
  c = mix(c, uGlow, fire * 0.9);
  c = mix(c, vec3(1.0, 0.88, 0.66), clamp(heat, 0.0, 1.0));
  vColor = c;
  vAlpha = mix(0.16, 0.82, depth * 0.5 + 0.5) * (0.5 + 0.5 * fire + 0.25 * uBreath * fire) + heat;
  vGlyph = aCharge;
  gl_PointSize = max(1.0, size * uPxScale / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const NODE_FS = /* glsl */`
varying vec3 vColor; varying float vAlpha; varying float vGlyph;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d = length(p);
  if (d > 1.0) discard;
  float a = vGlyph > 2.5 ? smoothstep(1.0, 0.86, d) * smoothstep(0.56, 0.74, d) * 0.85   // a pour: a small thin ring
                         : (1.0 - d) * (1.0 - d);
  gl_FragColor = vec4(vColor, clamp(a * vAlpha, 0.0, 1.0));
}`;

const LINE_VS = /* glsl */`
uniform float uTime; uniform float uCamZ;
attribute float aKind; attribute float aIgnite; attribute float aStrength; attribute float aU; attribute float aDir;
varying float vDepth; varying float vKind; varying float vU; varying float vDt; varying float vStrength; varying float vInner;
${LUMPY}
void main() {
  vec4 mv = modelViewMatrix * vec4(lumpy(position), 1.0);
  vDepth = clamp((mv.z - uCamZ) / ${R.toFixed(1)}, -1.0, 1.0) * 0.5 + 0.5;
  vKind = aKind; vU = aDir > 0.5 ? 1.0 - aU : aU; vDt = uTime - aIgnite; vStrength = aStrength;
  vInner = smoothstep(0.80, 0.45, length(position) / ${R.toFixed(1)});
  gl_Position = projectionMatrix * mv;
}`;
const LINE_FS = /* glsl */`
uniform vec3 uLine; uniform vec3 uReach; uniform vec3 uGlow; uniform float uBreath;
varying float vDepth; varying float vKind; varying float vU; varying float vDt; varying float vStrength; varying float vInner;
void main() {
  float base = vKind < 0.5 ? 0.17 : 0.30;
  vec3 col = vKind < 0.5 ? uLine : uReach;
  col = mix(col, uGlow, vInner * 0.55);
  float a = base * mix(0.2, 1.0, vDepth) * (1.0 + 0.6 * vInner * uBreath);
  if (vDt >= 0.0 && vDt < 40.0) {
    float head = vDt / 1.7;                                   // the pulse runs the thread in 1.7 s
    float x = (vU - head) * 9.0;
    float pulse = exp(-x * x) * (head < 1.25 ? 1.0 : 0.0);
    float lit = vU < head ? 0.55 * exp(-vDt / 11.0) : 0.0;     // the thread stays warm behind it, cooling
    float glow = (pulse + lit) * vStrength;
    col = mix(col, vec3(1.0, 0.80, 0.50), clamp(glow * 1.4, 0.0, 1.0));
    a += glow * 0.85;
  }
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
}`;

const TRI_VS = /* glsl */`
uniform float uTime; uniform float uCamZ;
attribute float aIgnite; attribute float aStrength;
varying float vDt; varying float vStrength; varying float vDepth; varying float vInner;
${LUMPY}
void main() {
  vec4 mv = modelViewMatrix * vec4(lumpy(position), 1.0);
  vDt = uTime - aIgnite; vStrength = aStrength;
  vDepth = clamp((mv.z - uCamZ) / ${R.toFixed(1)}, -1.0, 1.0) * 0.5 + 0.5;
  vInner = smoothstep(0.78, 0.42, length(position) / ${R.toFixed(1)});
  gl_Position = projectionMatrix * mv;
}`;
const TRI_FS = /* glsl */`
uniform vec3 uGlow; uniform float uBreath; uniform float uTime;
varying float vDt; varying float vStrength; varying float vDepth; varying float vInner;
void main() {
  float heat = vDt >= 0.0 ? vStrength * (0.75 * exp(-vDt / 2.2) + 0.25 * exp(-vDt / 14.0)) * smoothstep(0.0, 0.8, vDt) : 0.0;
  float a = heat * 0.30 + vInner * (0.034 + 0.04 * uBreath);   // the beams' facets hold a faint gold even at rest
  gl_FragColor = vec4(mix(uGlow, vec3(1.0, 0.86, 0.6), heat), a * mix(0.35, 1.0, vDepth));
}`;

const SMOKE_VS = /* glsl */`
uniform float uTime;
attribute vec3 aOffset; attribute float aScale; attribute float aSeed;
varying vec2 vUv; varying float vSeed; varying float vCore;
void main() {
  vec3 o = aOffset + vec3(sin(uTime * 0.021 + aSeed * 6.0), sin(uTime * 0.017 + aSeed * 3.0) * 0.6, cos(uTime * 0.019 + aSeed * 5.0)) * 9.0;
  vec4 mv = modelViewMatrix * vec4(o, 1.0);
  mv.xy += position.xy * aScale;
  vUv = uv; vSeed = aSeed; vCore = 1.0 - clamp(length(o) / 70.0, 0.0, 1.0);
  gl_Position = projectionMatrix * mv;
}`;
const SMOKE_FS = /* glsl */`
uniform sampler2D uNoise; uniform float uTime; uniform vec3 uSmoke; uniform vec3 uGlow; uniform float uBreath;
varying vec2 vUv; varying float vSeed; varying float vCore;
void main() {
  vec2 p = vUv - 0.5;
  float ang = vSeed * 6.2831 + uTime * (0.010 + 0.008 * vSeed);
  float cs = cos(ang), sn = sin(ang);
  vec2 q = vec2(cs * p.x - sn * p.y, sn * p.x + cs * p.y);
  float n = texture2D(uNoise, q * 0.85 + 0.5 + vSeed).r;
  float n2 = texture2D(uNoise, q * 1.7 + vec2(uTime * 0.004, vSeed)).r;
  float mask = smoothstep(0.5, 0.08, length(p));
  float a = pow(n * 0.7 + n2 * 0.3, 2.2) * mask * 0.26;
  gl_FragColor = vec4(mix(uSmoke, uGlow, vCore * (0.55 + 0.2 * uBreath)), a);
}`;

const GLOW_VS = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0); mv.xy += position.xy; gl_Position = projectionMatrix * mv; }`;
const GLOW_FS = /* glsl */`
uniform float uTime; uniform float uBreath; uniform vec3 uGlow;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = pow(max(0.0, 1.0 - d), 2.4) * (0.20 + 0.045 * sin(uTime * 0.7) + 0.30 * uBreath);
  a += pow(max(0.0, 1.0 - d * 2.6), 3.0) * 0.35;
  gl_FragColor = vec4(uGlow, a);
}`;

const SPARK_VS = /* glsl */`
uniform float uTime; uniform float uPxScale; uniform float uBreath;
attribute vec4 aSeed;
varying float vA;
void main() {
  float life = 7.0 + aSeed.w * 10.0;
  float t = mod(uTime + aSeed.w * 97.0, life) / life;
  vec3 p = aSeed.xyz * 40.0;
  p.y += t * 52.0 - 14.0;
  float ang = t * 2.4 + aSeed.w * 6.2831;
  p.x += sin(ang) * 7.0; p.z += cos(ang) * 7.0;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float flick = 0.55 + 0.45 * sin(uTime * (6.0 + aSeed.w * 11.0) + aSeed.x * 17.0);
  vA = sin(3.14159 * t) * flick * (0.65 + 0.5 * uBreath);
  gl_PointSize = max(1.0, (1.2 + 2.3 * aSeed.w) * uPxScale / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const SPARK_FS = /* glsl */`
uniform vec3 uGlow;
varying float vA;
void main() { float d = length(gl_PointCoord * 2.0 - 1.0); if (d > 1.0) discard; gl_FragColor = vec4(mix(uGlow, vec3(1.0, 0.9, 0.7), 0.4), (1.0 - d) * vA); }`;

const PULSE_VS = /* glsl */`
uniform float uTime; uniform float uPxScale;
attribute float aIgnite; attribute float aStrength;
varying float vAge; varying float vStrength;
${LUMPY}
void main() {
  vec4 mv = modelViewMatrix * vec4(lumpy(position), 1.0);
  vAge = (uTime - aIgnite) / 3.2; vStrength = aStrength;
  gl_PointSize = (vAge >= 0.0 && vAge <= 1.0) ? 34.0 * uPxScale / -mv.z : 0.0;
  gl_Position = projectionMatrix * mv;
}`;
const PULSE_FS = /* glsl */`
uniform vec3 uGlow;
varying float vAge; varying float vStrength;
void main() {
  if (vAge < 0.0 || vAge > 1.0) discard;
  float d = length(gl_PointCoord * 2.0 - 1.0);
  float r = 0.12 + vAge * 0.86;
  float x = (d - r) * 22.0;
  float a = exp(-x * x) * (1.0 - vAge) * vStrength * 0.9;
  gl_FragColor = vec4(mix(uGlow, vec3(1.0, 0.9, 0.7), 0.5), a);
}`;

// ---------------------------------------------------------------- helpers
function noiseTexture(size = 256) {
  // value-noise fbm, tileable, made once
  const data = new Uint8Array(size * size * 4);
  const grid = (g, x, y) => g[((y % 64) + 64) % 64 * 64 + ((x % 64) + 64) % 64];
  const octaves = [];
  let seed = 1337;
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let o = 0; o < 5; o++) { const g = new Float32Array(64 * 64); for (let i = 0; i < g.length; i++) g[i] = rand(); octaves.push(g); }
  const smooth = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let v = 0, amp = 0.5, tot = 0;
    for (let o = 0; o < 5; o++) {
      const f = 4 << o, gx = (x / size) * f, gy = (y / size) * f, ix = Math.floor(gx), iy = Math.floor(gy), fx = smooth(gx - ix), fy = smooth(gy - iy), per = f;
      const g = octaves[o];
      const a = grid(g, ix % per, iy % per), b = grid(g, (ix + 1) % per, iy % per), c = grid(g, ix % per, (iy + 1) % per), d = grid(g, (ix + 1) % per, (iy + 1) % per);
      v += amp * ((a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy); tot += amp; amp *= 0.5;
    }
    const k = (y * size + x) * 4, n = Math.round((v / tot) * 255);
    data[k] = data[k + 1] = data[k + 2] = n; data[k + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
  return tex;
}

function seeded(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

// ---------------------------------------------------------------- the orb
export function createOrb(canvas, graph, opts = {}) {
  const pal = PALETTES[opts.palette ?? 'slate'] ?? PALETTES.slate;
  const transparent = !!opts.transparent;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: transparent, powerPreference: 'high-performance' });
  renderer.setPixelRatio(opts.dpr ?? Math.min(window.devicePixelRatio || 1, 2));
  renderer.autoClear = true;
  renderer.setClearColor(0x000000, transparent ? 0 : 1);
  const scene = new THREE.Scene();
  const FOV = opts.fov ?? 26;
  const fill = opts.fill ?? 0.70;          // the orb's diameter as a share of the view's height
  const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 4000);
  const dist = R / (fill * Math.tan((FOV * Math.PI) / 360));
  camera.position.set(0, 0, dist);
  const camZ = -dist;
  const group = new THREE.Group();
  scene.add(group);

  const cap = { nodes: graph.meta?.capacity?.nodes ?? graph.n + 4096, lines: graph.meta?.capacity?.lines ?? graph.lines.length / 3 + 16384 };
  const t0 = performance.now();
  let now = 0;                              // seconds since start: the one clock every shader reads
  let breath = 0, breathAt = -1e6;
  const common = {
    uTime: { value: 0 }, uPxScale: { value: 1 }, uCamZ: { value: camZ }, uBreath: { value: 0 },
    uGlow: { value: new THREE.Vector3(...pal.glow) },
  };
  const blend = pal.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
  const mat = (vs, fs, extra = {}, o = {}) => new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: fs, uniforms: { ...common, ...extra }, transparent: true, depthWrite: false, depthTest: false, blending: o.blending ?? blend });

  // ---- background
  let bg = null;
  const ringPx = new Float32Array(24);
  if (!transparent) {
    const bgMat = new THREE.ShaderMaterial({
      vertexShader: BG_VS, fragmentShader: BG_FS, depthWrite: false, depthTest: false, transparent,
      uniforms: { ...common, uRes: { value: new THREE.Vector2(1, 1) }, uCenter: { value: new THREE.Vector2() }, uOrbPx: { value: 1 }, uTop: { value: new THREE.Vector3(...pal.top) }, uBottom: { value: new THREE.Vector3(...pal.bottom) }, uRing: { value: new THREE.Vector3(...pal.ring) }, uRings: { value: ringPx }, uRingN: { value: 0 }, uOpaque: { value: transparent ? 0 : 1 } },
    });
    bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMat);
    bg.frustumCulled = false; bg.renderOrder = -10;
    scene.add(bg);
  }

  // ---- nodes
  const nPos = new Float32Array(cap.nodes * 3), nCharge = new Float32Array(cap.nodes), nWeight = new Float32Array(cap.nodes), nIgnite = new Float32Array(cap.nodes).fill(-1e6), nStrength = new Float32Array(cap.nodes);
  nPos.set(graph.pos.slice(0, graph.n * 3));
  for (let i = 0; i < graph.n; i++) { nCharge[i] = graph.charge[i]; nWeight[i] = graph.w[i]; }
  const nodeGeo = new THREE.BufferGeometry();
  const dyn = (arr, k) => new THREE.BufferAttribute(arr, k).setUsage(THREE.DynamicDrawUsage);
  const aNPos = dyn(nPos, 3), aNCharge = dyn(nCharge, 1), aNWeight = dyn(nWeight, 1), aNIgnite = dyn(nIgnite, 1), aNStrength = dyn(nStrength, 1);
  nodeGeo.setAttribute('position', aNPos); nodeGeo.setAttribute('aCharge', aNCharge); nodeGeo.setAttribute('aWeight', aNWeight); nodeGeo.setAttribute('aIgnite', aNIgnite); nodeGeo.setAttribute('aStrength', aNStrength);
  nodeGeo.setDrawRange(0, graph.n);
  nodeGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), R * 1.2);
  const nodes = new THREE.Points(nodeGeo, mat(NODE_VS, NODE_FS, { uNode: { value: new THREE.Vector3(...pal.node) }, uHeart: { value: new THREE.Vector3(...pal.heart) } }));
  nodes.frustumCulled = false; nodes.renderOrder = 3;
  group.add(nodes);
  let n = graph.n;

  // ---- threads
  const L = cap.lines;
  const lPos = new Float32Array(L * 6), lKind = new Float32Array(L * 2), lIgnite = new Float32Array(L * 2).fill(-1e6), lStrength = new Float32Array(L * 2), lU = new Float32Array(L * 2), lDir = new Float32Array(L * 2);
  for (let k = 0; k < L; k++) { lU[k * 2] = 0; lU[k * 2 + 1] = 1; }
  let m = 0;
  const lineA = new Int32Array(L), lineB = new Int32Array(L);
  const writeLine = (a, b, kind) => {
    const k = m++;
    lineA[k] = a; lineB[k] = b;
    lPos[k * 6] = nPos[a * 3]; lPos[k * 6 + 1] = nPos[a * 3 + 1]; lPos[k * 6 + 2] = nPos[a * 3 + 2];
    lPos[k * 6 + 3] = nPos[b * 3]; lPos[k * 6 + 4] = nPos[b * 3 + 1]; lPos[k * 6 + 5] = nPos[b * 3 + 2];
    lKind[k * 2] = lKind[k * 2 + 1] = kind;
    return k;
  };
  for (let i = 0; i < graph.lines.length; i += 3) writeLine(graph.lines[i], graph.lines[i + 1], graph.lines[i + 2]);
  const lineGeo = new THREE.BufferGeometry();
  const aLPos = dyn(lPos, 3), aLKind = dyn(lKind, 1), aLIgnite = dyn(lIgnite, 1), aLStrength = dyn(lStrength, 1), aLDir = dyn(lDir, 1);
  lineGeo.setAttribute('position', aLPos); lineGeo.setAttribute('aKind', aLKind); lineGeo.setAttribute('aIgnite', aLIgnite); lineGeo.setAttribute('aStrength', aLStrength); lineGeo.setAttribute('aU', new THREE.BufferAttribute(lU, 1)); lineGeo.setAttribute('aDir', aLDir);
  lineGeo.setDrawRange(0, m * 2);
  const threads = new THREE.LineSegments(lineGeo, mat(LINE_VS, LINE_FS, { uLine: { value: new THREE.Vector3(...pal.line) }, uReach: { value: new THREE.Vector3(...pal.reach) } }, { blending: THREE.NormalBlending }));
  threads.frustumCulled = false; threads.renderOrder = 1;
  group.add(threads);

  // adjacency (static part): for each node, the threads touching it, so a remembered leaf can run its own threads
  const adjStart = new Int32Array(graph.n + 1), adjCount = new Int32Array(graph.n);
  for (let k = 0; k < m; k++) { if (lineA[k] < graph.n) adjCount[lineA[k]]++; if (lineB[k] < graph.n) adjCount[lineB[k]]++; }
  for (let i = 0; i < graph.n; i++) adjStart[i + 1] = adjStart[i] + adjCount[i];
  const adj = new Int32Array(adjStart[graph.n]);
  adjCount.fill(0);
  for (let k = 0; k < m; k++) {
    const a = lineA[k], b = lineB[k];
    if (a < graph.n) adj[adjStart[a] + adjCount[a]++] = k;
    if (b < graph.n) adj[adjStart[b] + adjCount[b]++] = k;
  }

  // ---- facets: the graph's own triangles (three leaves joined pairwise), dark until a write lights them
  const triIdx = [];
  {
    const nb = new Map();
    const link = (a, b) => { let s = nb.get(a); if (!s) nb.set(a, (s = new Set())); s.add(b); };
    for (let k = 0; k < m; k++) { link(lineA[k], lineB[k]); link(lineB[k], lineA[k]); }
    const seen = new Set();
    for (let k = 0; k < m && triIdx.length < 3 * 12000; k++) {
      const a = lineA[k], b = lineB[k], sa = nb.get(a), sb = nb.get(b);
      if (!sa || !sb) continue;
      const [small, other] = sa.size < sb.size ? [sa, sb] : [sb, sa];
      for (const c of small) {
        if (c === a || c === b || !other.has(c)) continue;
        const t = [a, b, c].sort((x, y) => x - y), key = t.join(':');
        if (seen.has(key)) continue;
        seen.add(key); triIdx.push(t[0], t[1], t[2]);
      }
    }
  }
  const T = triIdx.length / 3;
  const tPos = new Float32Array(T * 9), tIgnite = new Float32Array(T * 3).fill(-1e6), tStrength = new Float32Array(T * 3);
  for (let t = 0; t < T; t++) for (let v = 0; v < 3; v++) { const i = triIdx[t * 3 + v]; tPos[t * 9 + v * 3] = nPos[i * 3]; tPos[t * 9 + v * 3 + 1] = nPos[i * 3 + 1]; tPos[t * 9 + v * 3 + 2] = nPos[i * 3 + 2]; }
  const triOf = new Map();
  for (let t = 0; t < T; t++) for (let v = 0; v < 3; v++) { const i = triIdx[t * 3 + v]; let a = triOf.get(i); if (!a) triOf.set(i, (a = [])); a.push(t); }
  const triOfNode = new Map([...triOf].map(([i, a]) => [i, Int32Array.from(a)]));
  const triGeo = new THREE.BufferGeometry();
  const aTIgnite = dyn(tIgnite, 1), aTStrength = dyn(tStrength, 1);
  triGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3)); triGeo.setAttribute('aIgnite', aTIgnite); triGeo.setAttribute('aStrength', aTStrength);
  const facets = new THREE.Mesh(triGeo, mat(TRI_VS, TRI_FS, {}, { blending: THREE.AdditiveBlending }));
  facets.material.side = THREE.DoubleSide;
  facets.frustumCulled = false; facets.renderOrder = 2;
  group.add(facets);

  // ---- smoke, held inside
  const rnd = seeded(20251013);
  const SMOKE = 9;
  const plane = new THREE.PlaneGeometry(1, 1);
  const smokeGeo = new THREE.InstancedBufferGeometry();
  smokeGeo.index = plane.index; smokeGeo.setAttribute('position', plane.getAttribute('position')); smokeGeo.setAttribute('uv', plane.getAttribute('uv'));
  const sOff = new Float32Array(SMOKE * 3), sScale = new Float32Array(SMOKE), sSeed = new Float32Array(SMOKE);
  for (let i = 0; i < SMOKE; i++) { const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, rr = 18 + rnd() * 40, s = Math.sqrt(1 - u * u); sOff[i * 3] = rr * s * Math.cos(th); sOff[i * 3 + 1] = rr * u * 0.7; sOff[i * 3 + 2] = rr * s * Math.sin(th); sScale[i] = 90 + rnd() * 80; sSeed[i] = rnd(); }
  smokeGeo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(sOff, 3)); smokeGeo.setAttribute('aScale', new THREE.InstancedBufferAttribute(sScale, 1)); smokeGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(sSeed, 1));
  smokeGeo.instanceCount = SMOKE;
  const noise = noiseTexture();
  const smoke = new THREE.Mesh(smokeGeo, mat(SMOKE_VS, SMOKE_FS, { uNoise: { value: noise }, uSmoke: { value: new THREE.Vector3(...pal.smoke) } }, { blending: THREE.NormalBlending }));
  smoke.frustumCulled = false; smoke.renderOrder = 0;
  group.add(smoke);

  // ---- the core's glow (the one amber light, at the heart of it)
  const glowGeo = new THREE.PlaneGeometry(R * 1.5, R * 1.5);
  const glow = new THREE.Mesh(glowGeo, mat(GLOW_VS, GLOW_FS, {}, { blending: THREE.AdditiveBlending }));
  glow.frustumCulled = false; glow.renderOrder = 4;
  group.add(glow);

  // ---- sparks: embers drifting up inside the net, entirely on the GPU
  const SPARKS = opts.sparks ?? 720;
  const spSeed = new Float32Array(SPARKS * 4);
  for (let i = 0; i < SPARKS; i++) { let x, y, z; do { x = rnd() * 2 - 1; y = rnd() * 2 - 1; z = rnd() * 2 - 1; } while (x * x + y * y + z * z > 1); spSeed.set([x, y, z, rnd()], i * 4); }
  const spGeo = new THREE.BufferGeometry();
  spGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARKS * 3), 3));
  spGeo.setAttribute('aSeed', new THREE.BufferAttribute(spSeed, 4));
  const sparks = new THREE.Points(spGeo, mat(SPARK_VS, SPARK_FS, {}, { blending: THREE.AdditiveBlending }));
  sparks.frustumCulled = false; sparks.renderOrder = 5;
  group.add(sparks);

  // ---- ember rings: a small pool of expanding rings where writes land
  const PULSES = 12;
  const pPos = new Float32Array(PULSES * 3), pIgnite = new Float32Array(PULSES).fill(-1e6), pStrength = new Float32Array(PULSES);
  const pGeo = new THREE.BufferGeometry();
  const aPPos = dyn(pPos, 3), aPIgnite = dyn(pIgnite, 1), aPStrength = dyn(pStrength, 1);
  pGeo.setAttribute('position', aPPos); pGeo.setAttribute('aIgnite', aPIgnite); pGeo.setAttribute('aStrength', aPStrength);
  const pulses = new THREE.Points(pGeo, mat(PULSE_VS, PULSE_FS, {}, { blending: THREE.AdditiveBlending }));
  pulses.frustumCulled = false; pulses.renderOrder = 6;
  group.add(pulses);
  let pNext = 0;

  // ---- size and rings
  const rings = graph.rings ?? [];
  let W = 1, H = 1;
  function resize(w, h) {
    W = w; H = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    const pxPerUnit = (h * renderer.getPixelRatio()) / (2 * dist * Math.tan((FOV * Math.PI) / 360));
    common.uPxScale.value = pxPerUnit * dist;   // so size_px = worldSize * uPxScale / depth
    if (bg) {
      const dpr = renderer.getPixelRatio(), wp = w * dpr, hp = h * dpr, orbPx = R * pxPerUnit;
      bg.material.uniforms.uRes.value.set(wp, hp);
      bg.material.uniforms.uCenter.value.set(wp / 2, hp / 2);
      bg.material.uniforms.uOrbPx.value = orbPx;
      const N = Math.min(24, rings.length);
      const widths = rings.slice(-N).map((r) => Math.pow(r.n + 5, 0.55));
      const total = widths.reduce((a, b) => a + b, 0) || 1;
      const r0 = orbPx * 1.18, r1 = Math.min(wp / 2 * 0.95, orbPx * (opts.ringReach ?? 4.2));
      let acc = r0;
      for (let i = 0; i < N; i++) { acc += (widths[i] / total) * (r1 - r0); ringPx[i] = acc; }
      bg.material.uniforms.uRingN.value = N;
    }
  }

  // ---- writes
  const touchNode = (i) => { aNIgnite.addUpdateRange(i, 1); aNStrength.addUpdateRange(i, 1); aNIgnite.needsUpdate = true; aNStrength.needsUpdate = true; };
  const touchLine = (k) => { aLIgnite.addUpdateRange(k * 2, 2); aLStrength.addUpdateRange(k * 2, 2); aLDir.addUpdateRange(k * 2, 2); aLIgnite.needsUpdate = aLStrength.needsUpdate = aLDir.needsUpdate = true; };
  function ring(i, strength) {
    const k = pNext; pNext = (pNext + 1) % PULSES;
    pPos[k * 3] = nPos[i * 3]; pPos[k * 3 + 1] = nPos[i * 3 + 1]; pPos[k * 3 + 2] = nPos[i * 3 + 2];
    pIgnite[k] = now; pStrength[k] = strength;
    aPPos.addUpdateRange(k * 3, 3); aPIgnite.addUpdateRange(k, 1); aPStrength.addUpdateRange(k, 1);
    aPPos.needsUpdate = aPIgnite.needsUpdate = aPStrength.needsUpdate = true;
  }
  function lightLine(k, from, strength, at) {
    lIgnite[k * 2] = lIgnite[k * 2 + 1] = at;
    lStrength[k * 2] = lStrength[k * 2 + 1] = strength;
    lDir[k * 2] = lDir[k * 2 + 1] = lineA[k] === from ? 0 : 1;
    touchLine(k);
  }
  /** Light node i: it flares, its threads carry a pulse outward, the leaves at their far ends flare when it arrives, its facets glow. */
  function ignite(i, { strength = 1, ring: withRing = true, lineBase = -1, lineCount = 0 } = {}) {
    if (!(i >= 0 && i < n)) return;
    nIgnite[i] = now; nStrength[i] = strength; touchNode(i);
    if (withRing) ring(i, strength);
    const own = lineBase >= 0;
    const start = own ? lineBase : i < graph.n ? adjStart[i] : 0, end = own ? lineBase + lineCount : i < graph.n ? adjStart[i + 1] : 0;
    for (let q = start; q < end; q++) {
      const k = own ? q : adj[q];
      const far = lineA[k] === i ? lineB[k] : lineA[k];
      const reach = lKind[k * 2] > 0.5;
      const s = strength * (reach ? 1 : 0.45);
      lightLine(k, i, s, now);
      if (reach && far < n && nIgnite[far] < now - 3) { nIgnite[far] = now + 1.6; nStrength[far] = s * 0.75; touchNode(far); }
    }
    const tris = triOfNode.get(i);
    if (tris) for (let q = 0; q < tris.length; q++) {
      const t = tris[q];
      tIgnite[t * 3] = tIgnite[t * 3 + 1] = tIgnite[t * 3 + 2] = now;
      tStrength[t * 3] = tStrength[t * 3 + 1] = tStrength[t * 3 + 2] = strength;
      aTIgnite.addUpdateRange(t * 3, 3); aTStrength.addUpdateRange(t * 3, 3);
      aTIgnite.needsUpdate = aTStrength.needsUpdate = true;
    }
  }
  /** A live leaf from /events: write it into the spare capacity (its index comes from the server), its threads too, then light it. */
  function addLeaf(e) {
    if (e.i >= cap.nodes) return false;
    nPos[e.i * 3] = e.pos[0]; nPos[e.i * 3 + 1] = e.pos[1]; nPos[e.i * 3 + 2] = e.pos[2];
    nCharge[e.i] = e.charge; nWeight[e.i] = e.w;
    aNPos.addUpdateRange(e.i * 3, 3); aNCharge.addUpdateRange(e.i, 1); aNWeight.addUpdateRange(e.i, 1);
    aNPos.needsUpdate = aNCharge.needsUpdate = aNWeight.needsUpdate = true;
    n = Math.max(n, e.i + 1); nodeGeo.setDrawRange(0, n);
    let base = -1, count = 0;
    for (let q = 0; q + 2 < e.lines.length && m < L; q += 3) {
      const k = writeLine(e.lines[q], e.lines[q + 1], e.lines[q + 2]);
      if (base < 0) base = k; count++;
      aLPos.addUpdateRange(k * 6, 6); aLKind.addUpdateRange(k * 2, 2); aLPos.needsUpdate = aLKind.needsUpdate = true;
    }
    lineGeo.setDrawRange(0, m * 2);
    ignite(e.i, { strength: 1, lineBase: base, lineCount: count });
    return true;
  }
  function breathe() { breathAt = now; }

  // ---- the frame
  let frames = 0, last = 0, fps = 0, fpsFrames = 0, fpsAt = 0;
  const spin = opts.spin ?? 0.0105;        // radians per second: one turn in about ten minutes
  function frame(ms) {
    now = (ms - t0) / 1000;
    common.uTime.value = now;
    breath = Math.exp(-Math.max(0, now - breathAt) / 5) * (now >= breathAt ? 1 : 0);
    common.uBreath.value = breath;
    group.rotation.y = now * spin;
    group.rotation.x = 0.16 * Math.sin(now * 0.021) + 0.08;
    group.rotation.z = 0.04 * Math.sin(now * 0.013);
    renderer.render(scene, camera);
    frames++; fpsFrames++;
    if (now - fpsAt >= 5) { fps = fpsFrames / (now - fpsAt); fpsFrames = 0; fpsAt = now; }
    last = now;
  }

  function stats() {
    const info = renderer.info;
    return { frames, fps: Math.round(fps * 10) / 10, nodes: n, threads: m, facets: T, capacity: cap, geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs ? info.programs.length : null, calls: info.render.calls, seconds: Math.round(last) };
  }

  function dispose() {
    for (const o of [nodeGeo, lineGeo, triGeo, smokeGeo, plane, glowGeo, spGeo, pGeo]) o.dispose();
    if (bg) { bg.geometry.dispose(); bg.material.dispose(); }
    for (const o of [nodes, threads, facets, smoke, glow, sparks, pulses]) o.material.dispose();
    noise.dispose(); renderer.dispose();
  }

  resize(opts.width ?? canvas.clientWidth ?? 1, opts.height ?? canvas.clientHeight ?? 1);
  return { frame, ignite, addLeaf, breathe, resize, stats, dispose, get count() { return n; }, renderer };
}
