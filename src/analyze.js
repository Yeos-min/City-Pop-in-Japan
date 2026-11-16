// 속성 분류 단계: 건물 평면을 읽어 면적·층수·방향을 구하고, 격자 위에서 "어느 변이 길에 닿는지"를 판정한다.
import { cleanRing, ringArea, edgeOf, mulberry32 } from './util.js';

const FLOOR_H = 3.1;

export function prepareBuildings(raw) {
  const out = [];
  for (const b of raw) {
    let ring = [];
    for (let i = 0; i < b.r.length; i += 2) ring.push([b.r[i], b.r[i + 1]]);
    ring = cleanRing(ring);
    if (ring.length < 3) continue;
    let area = ringArea(ring);
    if (area < 0) { ring.reverse(); area = -area; }
    if (area < 6) continue;
    const h = Math.max(2.6, b.h);
    // 가장 딱 맞는 방향 상자(OBB)
    let best = null;
    for (let i = 0; i < ring.length; i++) {
      const e = edgeOf(ring, i); if (e.len < 0.5) continue;
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const p of ring) { const a = p[0] * e.t[0] + p[1] * e.t[1], c = -p[0] * e.t[1] + p[1] * e.t[0]; a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, c); b1 = Math.max(b1, c); }
      const ar = (a1 - a0) * (b1 - b0);
      if (!best || ar < best.ar) best = { ar, t: e.t, a0, a1, b0, b1 };
    }
    if (!best) continue;
    let u = best.t, v = [-u[1], u[0]], hl = (best.a1 - best.a0) / 2, hs = (best.b1 - best.b0) / 2;
    const ca = (best.a0 + best.a1) / 2, cb = (best.b0 + best.b1) / 2;
    const c = [u[0] * ca + v[0] * cb, u[1] * ca + v[1] * cb];
    if (hs > hl) { const t = hl; hl = hs; hs = t; const u2 = v; v = [-u2[1], u2[0]]; u = u2; }
    const floors = Math.max(1, Math.round(h / FLOOR_H));
    let cx = 0, cy = 0; for (const p of ring) { cx += p[0]; cy += p[1]; } cx /= ring.length; cy /= ring.length;
    out.push({ id: out.length, ring, area, h, floors, fh: h / floors, obb: { c, u, v, hl, hs }, rect: area / best.ar, cen: [cx, cy], rng: mulberry32(1000 + out.length * 7919) });
  }
  return out;
}

export function buildGrids(data, bs) {
  const half = data.half + data.pad + 20, res = 0.5, N = Math.round((2 * half) / res);
  const bld = new Int32Array(N * N).fill(-1), road = new Uint8Array(N * N);
  const fill = (pts, fn) => {
    let y0 = Infinity, y1 = -Infinity; for (const p of pts) { if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    const r0 = Math.max(0, Math.floor((y0 + half) / res)), r1 = Math.min(N - 1, Math.floor((y1 + half) / res));
    for (let r = r0; r <= r1; r++) {
      const y = (r + 0.5) * res - half, xs = [];
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1])); }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.max(0, Math.ceil((xs[k] + half) / res - 0.5)), c1 = Math.min(N - 1, Math.floor((xs[k + 1] + half) / res - 0.5));
        for (let c = c0; c <= c1; c++) fn(r * N + c);
      }
    }
  };
  for (const b of data.far) { // 코어 밖 건물도 막힌 칸으로 표시(-2)
    if (Math.abs(b.r[0]) > half + 60 || Math.abs(b.r[1]) > half + 60) continue;
    const pts = []; for (let i = 0; i < b.r.length; i += 2) pts.push([b.r[i], b.r[i + 1]]);
    fill(pts, i => { bld[i] = -2; });
  }
  for (const b of bs) fill(b.ring, i => { bld[i] = b.id; });
  const R = data.roads;
  for (let i = 0; i < R.length; i += 6) fill([[R[i], R[i + 1]], [R[i + 2], R[i + 3]], [R[i + 4], R[i + 5]]], k => { road[k] = 1; });

  // 길 안쪽으로 들어온 거리(m). 길이 아닌 칸은 0.
  const sdf = new Float32Array(N * N), INF = 1e6, D2 = Math.SQRT2;
  for (let i = 0; i < N * N; i++) sdf[i] = road[i] && bld[i] === -1 ? INF : 0;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const i = r * N + c; let d = sdf[i]; if (d === 0) continue;
    if (c > 0) d = Math.min(d, sdf[i - 1] + 1);
    if (r > 0) { d = Math.min(d, sdf[i - N] + 1); if (c > 0) d = Math.min(d, sdf[i - N - 1] + D2); if (c < N - 1) d = Math.min(d, sdf[i - N + 1] + D2); }
    sdf[i] = d;
  }
  for (let r = N - 1; r >= 0; r--) for (let c = N - 1; c >= 0; c--) {
    const i = r * N + c; let d = sdf[i]; if (d === 0) continue;
    if (c < N - 1) d = Math.min(d, sdf[i + 1] + 1);
    if (r < N - 1) { d = Math.min(d, sdf[i + N] + 1); if (c < N - 1) d = Math.min(d, sdf[i + N + 1] + D2); if (c > 0) d = Math.min(d, sdf[i + N - 1] + D2); }
    sdf[i] = d;
  }
  for (let i = 0; i < N * N; i++) sdf[i] = sdf[i] === 0 ? 0 : Math.min(60, (sdf[i] - 0.5) * res);

  // 가장자리 근처는 격자 계단 때문에 선이 울퉁불퉁해진다 → 실제 경계 선분까지의 거리로 다시 잰다.
  const emap = new Map(), k2 = p => p[0].toFixed(2) + ',' + p[1].toFixed(2);
  for (let i = 0; i < R.length; i += 6) {
    const pts = [[R[i], R[i + 1]], [R[i + 2], R[i + 3]], [R[i + 4], R[i + 5]]];
    if (pts.every(p => Math.abs(p[0]) > half + 8 || Math.abs(p[1]) > half + 8)) continue;
    for (let k = 0; k < 3; k++) { const a = pts[k], b = pts[(k + 1) % 3], ka = k2(a), kb = k2(b); if (ka === kb) continue; const key = ka < kb ? ka + '|' + kb : kb + '|' + ka, o = emap.get(key); if (o) o.n++; else emap.set(key, { a, b, n: 1 }); }
  }
  const gi = v => Math.floor((v + half) / res);
  const onRoad = (x, y) => { const c = gi(x), r = gi(y); return c >= 0 && r >= 0 && c < N && r < N && road[r * N + c] === 1; };
  const segs = [];
  for (const o of emap.values()) {
    if (o.n !== 1) continue;
    const dx = o.b[0] - o.a[0], dy = o.b[1] - o.a[1], l = Math.hypot(dx, dy); if (l < 0.05) continue;
    const mx = (o.a[0] + o.b[0]) / 2, my = (o.a[1] + o.b[1]) / 2, nx = (-dy / l) * 0.45, ny = (dx / l) * 0.45;
    if (onRoad(mx + nx, my + ny) && onRoad(mx - nx, my - ny)) continue; // 길 안쪽의 이음매는 경계가 아니다
    segs.push([o.a, o.b]);
  }
  for (const b of bs) for (let i = 0; i < b.ring.length; i++) segs.push([b.ring[i], b.ring[(i + 1) % b.ring.length]]);
  const HC = 4, HR = 5, hash = new Map();
  for (const s of segs) {
    const x0 = Math.floor((Math.min(s[0][0], s[1][0]) - HR) / HC), x1 = Math.floor((Math.max(s[0][0], s[1][0]) + HR) / HC), y0 = Math.floor((Math.min(s[0][1], s[1][1]) - HR) / HC), y1 = Math.floor((Math.max(s[0][1], s[1][1]) + HR) / HC);
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) { const k = cx * 8192 + cy; (hash.get(k) || hash.set(k, []).get(k)).push(s); }
  }
  for (let i = 0; i < N * N; i++) {
    if (sdf[i] <= 0 || sdf[i] > HR) continue;
    const x = ((i % N) + 0.5) * res - half, y = (Math.floor(i / N) + 0.5) * res - half, list = hash.get(Math.floor(x / HC) * 8192 + Math.floor(y / HC));
    if (!list) continue;
    let m = Infinity;
    for (const [a, b] of list) { const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1e-9))), d = Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t); if (d < m) m = d; }
    if (m < Infinity) sdf[i] = Math.max(0.02, Math.min(m, sdf[i] + 0.6));
  }

  const sdfAt = (x, y) => {
    const fx = (x + half) / res - 0.5, fy = (y + half) / res - 0.5, c = Math.floor(fx), r = Math.floor(fy);
    if (c < 0 || r < 0 || c >= N - 1 || r >= N - 1) return 0;
    const tx = fx - c, ty = fy - r, i = r * N + c;
    return (sdf[i] * (1 - tx) + sdf[i + 1] * tx) * (1 - ty) + (sdf[i + N] * (1 - tx) + sdf[i + N + 1] * tx) * ty;
  };
  // 길 반폭: 가장자리에서 길 안쪽으로 걸어 들어가 만나는 가장 깊은 값(그 자리의 길 폭 절반)
  const hwRaw = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) {
    const d = sdf[i]; if (d <= 0) continue; if (d >= 5) { hwRaw[i] = d; continue; }
    const x = ((i % N) + 0.5) * res - half, y = (Math.floor(i / N) + 0.5) * res - half;
    let gx = sdfAt(x + 1, y) - sdfAt(x - 1, y), gy = sdfAt(x, y + 1) - sdfAt(x, y - 1); const gl = Math.hypot(gx, gy);
    if (gl < 1e-4) { hwRaw[i] = d; continue; } gx /= gl; gy /= gl;
    let m = d;
    for (let s = 0.5; s <= 30; s += 0.5) { const v = sdfAt(x + gx * s, y + gy * s); if (v > m) m = v; else if (v < m - 0.4) break; }
    hwRaw[i] = m;
  }
  const hw = new Float32Array(N * N); // 주변 1m 평균으로 고르게
  for (let r = 2; r < N - 2; r++) for (let c = 2; c < N - 2; c++) {
    const i = r * N + c; if (hwRaw[i] <= 0) continue;
    let s = 0, n = 0; for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) { const v = hwRaw[i + a * N + b]; if (v > 0) { s += v; n++; } }
    hw[i] = s / n;
  }
  const HN = N;

  const G = {
    half, res, N, bld, road, sdf, hw, HN,
    idx(x, y) { const c = gi(x), r = gi(y); return c < 0 || r < 0 || c >= N || r >= N ? -1 : r * N + c; },
    bldAt(x, y) { const i = G.idx(x, y); return i < 0 ? -1 : bld[i]; },
    isRoad(x, y) { const i = G.idx(x, y); return i >= 0 && road[i] === 1 && bld[i] === -1; },
    sdfAt,
    hwAt(x, y) { const i = G.idx(x, y); return i < 0 ? 0 : hw[i]; },
    /** 길 안쪽을 가리키는 방향 */
    grad(x, y) { const gx = G.sdfAt(x + 1, y) - G.sdfAt(x - 1, y), gy = G.sdfAt(x, y + 1) - G.sdfAt(x, y - 1), l = Math.hypot(gx, gy); return l < 1e-4 ? null : [gx / l, gy / l]; },
    cell(i) { return [((i % N) + 0.5) * res - half, (Math.floor(i / N) + 0.5) * res - half]; },
  };
  return G;
}

/** 변마다 트였는지/길에 닿는지 판정하고, 건물 종류를 나눈다 */
export function probeBuildings(bs, G) {
  for (const b of bs) {
    b.edges = b.ring.map((_, i) => {
      const e = edgeOf(b.ring, i);
      let clear = 6, blockId = -1;
      for (let s = 0.75; s <= 6; s += 0.5) {
        let hit = -1;
        for (const f of [0.5, 0.25, 0.75]) { const id = G.bldAt(e.p[0] + e.t[0] * e.len * f + e.n[0] * s, e.p[1] + e.t[1] * e.len * f + e.n[1] * s); if (id !== -1 && id !== b.id) { hit = id; break; } }
        if (hit !== -1) { clear = s - 0.5; blockId = hit; break; }
      }
      let roadDist = Infinity;
      for (let s = 0.25; s <= Math.min(clear, 4.5); s += 0.5) if (G.isRoad(e.mid[0] + e.n[0] * s, e.mid[1] + e.n[1] * s)) { roadDist = s; break; }
      e.clear = clear; e.open = clear >= 1.0; e.roadDist = roadDist;
      e.hw = roadDist < Infinity ? G.hwAt(e.mid[0] + e.n[0] * (roadDist + 1), e.mid[1] + e.n[1] * (roadDist + 1)) : 0;
      e.blockH = blockId >= 0 ? bs[blockId].h : blockId === -2 ? 9 : 0;
      return e;
    });
    let best = -1, bestS = 0;
    for (const e of b.edges) { if (e.roadDist > 3.5 || e.len < 2.2) continue; const s = e.len * (0.6 + Math.min(e.hw, 10) / 6); if (s > bestS) { bestS = s; best = e.i; } }
    b.front = best; b.frontHw = best >= 0 ? b.edges[best].hw : 0;
    // 종류: 층수·면적·길쭉함으로 나눈다
    const f = b.floors, A = b.area, slender = b.obb.hl / Math.max(0.5, b.obb.hs), r = b.rng();
    if (f <= 2) b.type = A < 140 ? 'house' : 'low';
    else if (A < 420 && f <= 11) b.type = A >= 170 && slender >= 1.6 && f >= 4 && r < 0.6 ? 'mansion' : 'zakkyo';
    else if (f >= 4 && slender >= 1.8 && A < 1600 && r < 0.6) b.type = 'mansion';
    else b.type = 'office';
  }
}
