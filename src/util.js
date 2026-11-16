import * as THREE from 'three';

// 2D 계산은 전부 데이터 좌표(x=동, y=북)로 하고, 내보낼 때만 월드(X=동, Y=위, Z=-북)로 바꾼다.
export const W = (p, h) => [p[0], h, -p[1]];

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
export function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
  return arr;
}

const _c = new THREE.Color();
const _cache = new Map();
/** sRGB hex → 선형 RGB 배열 */
export function lin(hex) {
  let v = _cache.get(hex);
  if (!v) { _c.set(hex); v = [_c.r, _c.g, _c.b]; _cache.set(hex, v); }
  return v;
}
export const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// ── 2D 다각형 ──
export function ringArea(r) { let s = 0; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
export function pointInRing(p, r) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i], b = r[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < a[0] + ((p[1] - a[1]) * (b[0] - a[0])) / (b[1] - a[1])) inside = !inside;
  }
  return inside;
}
export function cleanRing(r) {
  let out = [];
  for (const p of r) { const q = out[out.length - 1]; if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.15) out.push(p); }
  if (out.length > 1 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= 0.15) out.pop();
  for (let pass = 0; pass < 2; pass++) {
    const keep = [];
    for (let i = 0; i < out.length; i++) {
      const a = out[(i - 1 + out.length) % out.length], b = out[i], c = out[(i + 1) % out.length];
      const ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - b[0], vy = c[1] - b[1];
      const cr = Math.abs(ux * vy - uy * vx) / ((Math.hypot(ux, uy) * Math.hypot(vx, vy)) || 1);
      if (cr > 0.03) keep.push(b);
    }
    out = keep;
  }
  return out;
}
/** 반시계 고리의 변 i 정보 */
export function edgeOf(r, i) {
  const p = r[i], q = r[(i + 1) % r.length];
  const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy) || 1e-6;
  const t = [dx / len, dy / len];
  return { i, p, q, len, t, n: [t[1], -t[0]], mid: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] };
}
/** 고리를 안쪽으로 d만큼 줄인다(모서리는 마이터) */
export function inset(r, d) {
  const n = r.length, out = [];
  for (let i = 0; i < n; i++) {
    const e0 = edgeOf(r, (i - 1 + n) % n), e1 = edgeOf(r, i);
    const k = Math.max(0.25, 1 + e0.n[0] * e1.n[0] + e0.n[1] * e1.n[1]);
    out.push([r[i][0] - ((e0.n[0] + e1.n[0]) * d) / k, r[i][1] - ((e0.n[1] + e1.n[1]) * d) / k]);
  }
  return out;
}
/** 변 i를 안쪽으로 s만큼 밀어 넣는다(이웃 변을 따라 미끄러진다). 모양이 안 맞으면 null */
export function shiftEdge(r, i, s) {
  const n = r.length, e = edgeOf(r, i);
  const ia = i, ib = (i + 1) % n, ip = (i - 1 + n) % n, inx = (i + 2) % n;
  const inward = [-e.n[0], -e.n[1]];
  const slide = (v, to) => {
    const dx = to[0] - v[0], dy = to[1] - v[1], l = Math.hypot(dx, dy); if (l < 1e-6) return null;
    const c = (dx * inward[0] + dy * inward[1]) / l; if (c < 0.6) return null;
    const m = s / c; if (m > l - 0.8) return null;
    return [v[0] + (dx / l) * m, v[1] + (dy / l) * m];
  };
  const a = slide(r[ia], r[ip]), b = slide(r[ib], r[inx]);
  if (!a || !b) return null;
  const out = r.slice(); out[ia] = a; out[ib] = b;
  return out;
}

// ── 지오메트리 모으는 통 ──
export class Batch {
  // aux: 밤에 빛나는 면 표시. 0=안 빛남, 양수=등불 색으로 켜짐, 음수=자기 색으로 빛남. 절댓값이 켜지는 시점(0~1, 작을수록 일찍).
  constructor() { this.p = []; this.n = []; this.c = []; this.l = []; this.aux = 0; }
  get tris() { return this.p.length / 9; }
  tri(a, b, c, col) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz); if (l < 1e-9) return; nx /= l; ny /= l; nz /= l;
    this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    for (let i = 0; i < 3; i++) { this.n.push(nx, ny, nz); this.c.push(col[0], col[1], col[2]); this.l.push(this.aux); }
  }
  quad(a, b, c, d, col) { this.tri(a, b, c, col); this.tri(a, c, d, col); }
  /** 위를 보도록 감는 방향을 맞춘 사각형 */
  quadUp(a, b, c, d, col) {
    const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    if (ny >= 0) this.quad(a, b, c, d, col); else this.quad(a, d, c, b, col);
  }
  /** a→b가 반시계 진행 방향일 때 바깥을 보는 수직 사각형 */
  vquad(a, b, y0, y1, col) { this.quad(W(a, y0), W(b, y0), W(b, y1), W(a, y1), col); }
  cap(ring, y, col, up = true) {
    const faces = THREE.ShapeUtils.triangulateShape(ring.map(p => new THREE.Vector2(p[0], p[1])), []);
    for (const f of faces) { if (up) this.tri(W(ring[f[0]], y), W(ring[f[1]], y), W(ring[f[2]], y), col); else this.tri(W(ring[f[0]], y), W(ring[f[2]], y), W(ring[f[1]], y), col); }
  }
  prism(ring, y0, y1, wall, top) {
    for (let i = 0; i < ring.length; i++) this.vquad(ring[i], ring[(i + 1) % ring.length], y0, y1, wall);
    this.cap(ring, y1, top);
  }
  /** 변 기준 좌표: 변을 따라 t, 바깥으로 o */
  pt(e, t, o) { return [e.p[0] + e.t[0] * t + e.n[0] * o, e.p[1] + e.t[1] * t + e.n[1] * o]; }
  /** 벽에 붙은 평면 사각형(바깥으로 off만큼 띄움) */
  erect(e, t0, t1, y0, y1, off, col) { this.vquad(this.pt(e, t0, off), this.pt(e, t1, off), y0, y1, col); }
  /** 변 기준 상자 */
  ebox(e, t0, t1, o0, o1, y0, y1, col, top = col) {
    const a = this.pt(e, t0, o0), b = this.pt(e, t1, o0), c = this.pt(e, t1, o1), d = this.pt(e, t0, o1);
    this.vquad(a, d, y0, y1, col); this.vquad(d, c, y0, y1, col); this.vquad(c, b, y0, y1, col); this.vquad(b, a, y0, y1, col);
    this.quad(W(a, y1), W(d, y1), W(c, y1), W(b, y1), top);
    this.quad(W(a, y0), W(b, y0), W(c, y0), W(d, y0), col);
  }
  /** 변을 따라 기울어진 판(계단 한 줄): tA에서 yA, tB에서 yB */
  eramp(e, tA, tB, o0, o1, yA, yB, th, col) {
    const a0 = this.pt(e, tA, o0), a1 = this.pt(e, tA, o1), b0 = this.pt(e, tB, o0), b1 = this.pt(e, tB, o1);
    this.quadUp(W(a0, yA), W(a1, yA), W(b1, yB), W(b0, yB), col);
    this.quad(W(a0, yA - th), W(b0, yB - th), W(b1, yB - th), W(a1, yA - th), col);
    this.quad(W(a1, yA - th), W(b1, yB - th), W(b1, yB), W(a1, yA), col);
    this.quad(W(a0, yA - th), W(a0, yA), W(b0, yB), W(b0, yB - th), col);
  }
  /** 기울어진 수직 판(계단 옆판) */
  eslope(e, tA, tB, o, yA, yB, hgt, col) {
    const a = this.pt(e, tA, o), b = this.pt(e, tB, o);
    this.quad(W(a, yA), W(b, yB), W(b, yB + hgt), W(a, yA + hgt), col);
  }
  /** 중심 c, 축 u(단위벡터) 기준 상자 */
  obox(c, u, hx, hy, y0, y1, col, top = col) {
    this.ebox({ p: c, t: u, n: [u[1], -u[0]] }, -hx, hx, -hy, hy, y0, y1, col, top);
  }
  cyl(c, y0, y1, r0, r1, seg, col, top = col) {
    const ring0 = [], ring1 = [];
    for (let i = 0; i < seg; i++) { const a = (i / seg) * Math.PI * 2; ring0.push([c[0] + Math.cos(a) * r0, c[1] + Math.sin(a) * r0]); ring1.push([c[0] + Math.cos(a) * r1, c[1] + Math.sin(a) * r1]); }
    for (let i = 0; i < seg; i++) { const j = (i + 1) % seg; this.quad(W(ring0[i], y0), W(ring0[j], y0), W(ring1[j], y1), W(ring1[i], y1), col); }
    this.cap(ring1, y1, top);
  }
  /** 준비된 삼각형 위치 배열(로컬)을 옮겨 붙인다 */
  blob(posArr, cx, cy, cz, sx, sy, sz, rot, col) {
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const T = k => { const x = posArr[k] * sx, y = posArr[k + 1] * sy, z = posArr[k + 2] * sz; return [cx + x * cs - z * sn, cy + y, cz + x * sn + z * cs]; };
    for (let k = 0; k < posArr.length; k += 9) this.tri(T(k), T(k + 3), T(k + 6), col);
  }
  toGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.p), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.n), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.c), 3));
    g.setAttribute('aLit', new THREE.BufferAttribute(new Float32Array(this.l), 1));
    g.computeBoundingSphere();
    return g;
  }
  toMesh(material) { const m = new THREE.Mesh(this.toGeometry(), material); m.castShadow = true; m.receiveShadow = true; return m; }
}
