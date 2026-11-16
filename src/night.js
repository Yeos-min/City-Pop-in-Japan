// 낮과 밤: 시각에 따른 하늘·빛 색, 해와 달의 방향, 밤에 켜지는 면, 원경의 불 켜진 창.
// 해는 계절과 상관없이 6시에 뜨고 18시에 진다(예오스 결정). 색과 수치는 Claude가 임시로 잡았다.
import * as THREE from 'three';
import { Batch, edgeOf, mulberry32 } from './util.js';

const DAY = { zen: '#0a48bd', mid: '#3e8ee0', hor: '#bfe8ee', sun: '#fff1d4', sunI: 3.0, hs: '#86aeff', hg: '#d9b790', hI: 1.45, fog: '#bfe8ee', fN: 250, fF: 3600, night: 0 };
const NIGHT = { zen: '#0c1150', mid: '#232a84', hor: '#5a55a6', sun: '#9fb0ff', sunI: 0.6, hs: '#4a5cc4', hg: '#262c58', hI: 1.0, fog: '#0c0f22', fN: 60, fF: 650, night: 1 };
const KEYS = [
  { t: 0, ...NIGHT }, { t: 4.9, ...NIGHT },
  { t: 5.6, zen: '#2a2f8f', mid: '#6a5fb5', hor: '#e3a0b4', sun: '#9fb0ff', sunI: 0, hs: '#5a62b8', hg: '#3a3350', hI: 0.85, fog: '#3a3760', fN: 120, fF: 1500, night: 0.55 }, // 새벽
  { t: 6.3, zen: '#2c55b8', mid: '#7fa5df', hor: '#ffc9a0', sun: '#ffc28a', sunI: 1.6, hs: '#7f9df0', hg: '#c9a590', hI: 1.15, fog: '#f1c9ae', fN: 250, fF: 3200, night: 0 }, // 해 뜬 직후
  { t: 7.6, ...DAY }, { t: 16.3, ...DAY },
  { t: 17.6, zen: '#2a4fb5', mid: '#8a8fd8', hor: '#ffb880', sun: '#ffae6a', sunI: 2.0, hs: '#8a90e8', hg: '#d0a080', hI: 1.1, fog: '#f0b890', fN: 250, fF: 3200, night: 0 }, // 해 지기 직전
  { t: 18.25, zen: '#2a2a8c', mid: '#6f58b0', hor: '#e58fb0', sun: '#ff9a70', sunI: 0, hs: '#5f5fb5', hg: '#3f3555', hI: 0.85, fog: '#40365f', fN: 120, fF: 1500, night: 0.5 }, // 해 진 직후
  { t: 19.2, ...NIGHT }, { t: 24, ...NIGHT },
].map(k => { const o = { ...k }; for (const c of ['zen', 'mid', 'hor', 'sun', 'hs', 'hg', 'fog']) o[c] = new THREE.Color(k[c]); return o; });

const S = { zen: new THREE.Color(), mid: new THREE.Color(), hor: new THREE.Color(), sun: new THREE.Color(), hs: new THREE.Color(), hg: new THREE.Color(), fog: new THREE.Color(), sunI: 0, hI: 0, fN: 0, fF: 0, night: 0 };
/** t(시, 0~24)의 하늘·빛 상태 */
export function sampleSky(t) {
  let i = 0; while (i < KEYS.length - 2 && t >= KEYS[i + 1].t) i++;
  const a = KEYS[i], b = KEYS[i + 1], f = Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t)));
  for (const c of ['zen', 'mid', 'hor', 'sun', 'hs', 'hg', 'fog']) S[c].copy(a[c]).lerp(b[c], f);
  for (const n of ['sunI', 'hI', 'fN', 'fF', 'night']) S[n] = a[n] + (b[n] - a[n]) * f;
  return S;
}
/** 빛이 오는 방향. 낮에는 해(동→남→서), 밤에는 달. 지평선 근처에서는 세기가 0이라 바뀌는 순간이 안 보인다. */
export function lightDir(t, out) {
  const day = t >= 5.6 && t < 18.25, cl = (v, a, b) => Math.min(b, Math.max(a, v));
  const a = (day ? cl((t - 6) / 12, 0.04, 0.96) : cl((((t - 18) % 24) + 24) % 24 / 12, 0.08, 0.92)) * Math.PI, el = ((day ? 62 : 48) * Math.PI) / 180;
  return out.set(Math.cos(a), Math.max(0.24, Math.sin(a) * Math.sin(el)), Math.sin(a) * Math.cos(el)).normalize();
}

const v3 = hex => { const n = parseInt(hex.slice(1), 16); return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };
export const NU = { uNight: { value: 0 }, uLampA: { value: v3('#ffe84d') }, uLampB: { value: v3('#fff2b8') } };
/** 재질에 "밤에 켜지는 면"을 더한다. aLit 속성: 양수=등불 색, 음수=자기 색, 절댓값=켜지는 시점. onlyLit이면 켜진 면만 그린다. */
export function nightify(mat, onlyLit = false) {
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, NU);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aLit; varying float vLit;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLit = aLit;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vLit; uniform float uNight; uniform vec3 uLampA; uniform vec3 uLampB;')
      .replace('#include <fog_fragment>', `#include <fog_fragment>
      float th = abs(vLit);
      ${onlyLit ? 'if (th <= 0.0 || uNight * 1.08 < th) discard;' : ''}
      if (th > 0.0) {
        float on = smoothstep(th - 0.02, th + 0.02, uNight * 1.08);
        vec3 lamp = vLit > 0.0 ? (fract(th * 37.0) > 0.8 ? uLampB : uLampA) : pow(vColor.rgb, vec3(0.4545));
        gl_FragColor.rgb = mix(gl_FragColor.rgb, lamp, on);
      }`);
  };
  mat.customProgramCacheKey = () => 'night' + (onlyLit ? 1 : 0);
  return mat;
}

/** 원경(창이 없는 덩어리)에 밤에만 보이는 불 켜진 창을 뿌린다 */
export function buildFarLights(data) {
  const B = new Batch(), rng = mulberry32(99), dark = [0.02, 0.03, 0.06], th = () => 0.06 + rng() * 0.9;
  for (const b of data.far) { // LOD1: 벽마다 3m×3.3m 칸
    const ring = []; for (let i = 0; i < b.r.length; i += 2) ring.push([b.r[i], b.r[i + 1]]);
    let ar = 0; for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; ar += p[0] * q[1] - q[0] * p[1]; }
    if (ar < 0) ring.reverse();
    const floors = Math.floor(b.h / 3.3), p = b.h < 7 ? 0.1 : 0.2; if (floors < 1) continue;
    for (let i = 0; i < ring.length; i++) {
      const e = edgeOf(ring, i); if (e.len < 3.5) continue;
      const cols = Math.floor(e.len / 3), s0 = (e.len - cols * 3) / 2;
      for (let f = 0; f < floors; f++) for (let c = 0; c < cols; c++) { if (rng() >= p) continue; B.aux = th(); B.erect(e, s0 + c * 3 + 0.7, s0 + c * 3 + 2.3, f * 3.3 + 1.0, f * 3.3 + 2.6, 0.12, dark); }
    }
  }
  const L = data.lod2, CW = 3.0, CH = 3.4; // LOD2: 수직에 가까운 면 위에 칸을 깐다
  for (let i = 0; i < L.length; i += 9) {
    const P = [[L[i], L[i + 2] - 2.5, -L[i + 1]], [L[i + 3], L[i + 5] - 2.5, -L[i + 4]], [L[i + 6], L[i + 8] - 2.5, -L[i + 7]]];
    const ax = P[1][0] - P[0][0], ay = P[1][1] - P[0][1], az = P[1][2] - P[0][2], bx = P[2][0] - P[0][0], by = P[2][1] - P[0][1], bz = P[2][2] - P[0][2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx; const nl = Math.hypot(nx, ny, nz);
    if (nl < 24) continue; nx /= nl; ny /= nl; nz /= nl; if (Math.abs(ny) > 0.35) continue;
    let ux = nz, uz = -nx; const ul = Math.hypot(ux, uz); ux /= ul; uz /= ul; // 수평 접선
    let vx = ny * uz, vy = nz * ux - nx * uz, vz = -ny * ux; if (vy < 0) { vx = -vx; vy = -vy; vz = -vz; } // 면 위에서 위쪽
    const s = P.map(p => p[0] * ux + p[2] * uz), y = P.map(p => p[1]);
    const inside = (S, Y) => { const d = (a, b) => (s[b] - s[a]) * (Y - y[a]) - (y[b] - y[a]) * (S - s[a]); const d0 = d(0, 1), d1 = d(1, 2), d2 = d(2, 0); return (d0 >= 0 && d1 >= 0 && d2 >= 0) || (d0 <= 0 && d1 <= 0 && d2 <= 0); };
    const at = (S, Y, o) => { const k = (Y - y[0]) / vy, ds = S - s[0]; return [P[0][0] + ux * ds + vx * k + nx * o, P[0][1] + vy * k + ny * o, P[0][2] + uz * ds + vz * k + nz * o]; };
    for (let gs = Math.ceil(Math.min(...s) / CW) * CW; gs + CW <= Math.max(...s); gs += CW) for (let gy = Math.max(CH, Math.ceil(Math.min(...y) / CH) * CH); gy + CH <= Math.max(...y); gy += CH) {
      if (rng() >= 0.16 || !inside(gs + 0.7, gy + 1.0) || !inside(gs + 2.3, gy + 2.6) || !inside(gs + 0.7, gy + 2.6) || !inside(gs + 2.3, gy + 1.0)) continue;
      B.aux = th();
      for (const o of [0.15, -0.15]) B.quad(at(gs + 0.7, gy + 1.0, o), at(gs + 2.3, gy + 1.0, o), at(gs + 2.3, gy + 2.6, o), at(gs + 0.7, gy + 2.6, o), dark);
    }
  }
  B.aux = 0;
  return B;
}
