// PLATEAU OBJ(요코하마 533915) → 프로토타입용 데이터 추출
// 실행: node --max-old-space-size=6000 prototype/tools/extract.js
// 출력: prototype/data/area.json (건물 평면+높이, 도로 삼각형, 원경 LOD2 삼각형)
//
// 좌표: 원본은 EPSG:6677, OBJ에 (x=동, y=북, z=위)로 들어 있다.
//       여기서는 구역 중심을 원점으로 옮긴 (x=동, y=북) m 단위로 내보낸다.
const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '..', '..');
const OUT = path.resolve(__dirname, '..', 'data');

// ── 구역 설정 ─────────────────────────────────────────────
// 지도(블록선택_지도.png) 원점: x0=-19218, 위쪽 y1=-58491, 한 칸 250m
const MAP_X0 = -19218, MAP_Y1 = -58491, CELL = 250;
const cell = (col, row) => ({ x: MAP_X0 + col * CELL, y: MAP_Y1 - row * CELL }); // 칸의 왼쪽 위 모서리 (col: A=0, row: 1→0)
// 코어(걸어다니며 디테일을 얹는 곳): C10~D11 = 500m 사방
const c0 = cell(2, 9), c1 = cell(4, 11);
const CORE = { minX: c0.x, maxX: c1.x, minY: c1.y, maxY: c0.y };
const CX = (CORE.minX + CORE.maxX) / 2, CY = (CORE.minY + CORE.maxY) / 2;
const FAR_R = 1500;   // 원경으로 남길 반경(m)
const ROAD_R = 420;   // 도로를 남길 반경(m, 코어 중심에서 사각 반폭)

const statsOnly = process.argv.includes('--stats');

function parseObj(file) {
  const txt = fs.readFileSync(path.join(SRC, file), 'latin1');
  const vs = [], fa = [];
  let i = 0; const n = txt.length;
  while (i < n) {
    let j = txt.indexOf('\n', i); if (j < 0) j = n;
    const a = txt.charCodeAt(i), b = txt.charCodeAt(i + 1);
    if (a === 118 && b === 32) { const p = txt.substring(i + 2, j).trim().split(/\s+/); vs.push(+p[0], +p[1], +p[2]); }
    else if (a === 102 && b === 32) {
      const p = txt.substring(i + 2, j).trim().split(/\s+/).map(s => parseInt(s, 10) - 1);
      for (let k = 1; k + 1 < p.length; k++) fa.push(p[0], p[k], p[k + 1]);
    }
    i = j + 1;
  }
  return { v: Float64Array.from(vs), f: Int32Array.from(fa) };
}
const r2 = x => Math.round(x * 100) / 100;

// ── LOD1: 건물 단위로 분리해서 평면(외곽 고리)과 높이를 뽑는다 ──
function extractLod1() {
  const m = parseObj('yokohama_533915_bldg_lod1.obj');
  const nv = m.v.length / 3, nf = m.f.length / 3;
  const par = new Int32Array(nv); for (let i = 0; i < nv; i++) par[i] = i;
  const find = x => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  for (let t = 0; t < nf; t++) {
    const a = find(m.f[t * 3]), b = find(m.f[t * 3 + 1]), c = find(m.f[t * 3 + 2]);
    if (b !== a) par[b] = a; if (c !== a) par[find(c)] = a;
  }
  const comp = new Map();
  for (let t = 0; t < nf; t++) { const r = find(m.f[t * 3]); let l = comp.get(r); if (!l) comp.set(r, l = []); l.push(t); }
  const out = [];
  for (const tris of comp.values()) {
    let zmin = Infinity, zmax = -Infinity, sx = 0, sy = 0, cnt = 0;
    for (const t of tris) for (let k = 0; k < 3; k++) {
      const vi = m.f[t * 3 + k] * 3; const z = m.v[vi + 2];
      if (z < zmin) zmin = z; if (z > zmax) zmax = z; sx += m.v[vi]; sy += m.v[vi + 1]; cnt++;
    }
    const cx = sx / cnt, cy = sy / cnt;
    if (Math.hypot(cx - CX, cy - CY) > FAR_R) continue;
    // 지붕 삼각형(세 점 모두 zmax) → 한 번만 쓰인 변이 외곽선
    const edges = new Map(); const key = vi => m.v[vi * 3].toFixed(2) + ',' + m.v[vi * 3 + 1].toFixed(2);
    const pos = new Map(); const roof = [];
    for (const t of tris) {
      const ids = [m.f[t * 3], m.f[t * 3 + 1], m.f[t * 3 + 2]];
      if (!ids.every(vi => Math.abs(m.v[vi * 3 + 2] - zmax) < 0.01)) continue;
      const ks = ids.map(key); ids.forEach((vi, k) => pos.set(ks[k], [m.v[vi * 3], m.v[vi * 3 + 1]]));
      roof.push(ks);
      for (let k = 0; k < 3; k++) {
        const a = ks[k], b = ks[(k + 1) % 3]; if (a === b) continue;
        const e = a < b ? a + '|' + b : b + '|' + a; edges.set(e, (edges.get(e) || 0) + 1);
      }
    }
    if (!roof.length) continue;
    const adj = new Map();
    for (const [e, c] of edges) { if (c !== 1) continue; const [a, b] = e.split('|'); (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); }
    const used = new Set(); const loops = [];
    for (const start of adj.keys()) {
      if (used.has(start)) continue;
      const loop = [start]; used.add(start); let prev = null, cur = start;
      for (let guard = 0; guard < 10000; guard++) {
        const nx = adj.get(cur).find(k => k !== prev && !used.has(k));
        if (!nx) break; loop.push(nx); used.add(nx); prev = cur; cur = nx;
      }
      if (loop.length >= 3) loops.push(loop.map(k => pos.get(k)));
    }
    if (!loops.length) continue;
    const area = l => { let s = 0; for (let i = 0; i < l.length; i++) { const a = l[i], b = l[(i + 1) % l.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
    loops.sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)));
    let ring = loops[0]; const A = area(ring); if (A < 0) ring = ring.slice().reverse(); // 반시계
    if (Math.abs(A) < 4) continue; // 4㎡ 미만은 버림
    out.push({ cx, cy, base: zmin, h: zmax - zmin, area: Math.abs(A), ring, holes: loops.length - 1 });
  }
  return out;
}

function inCore(b, pad = 0) { return b.cx >= CORE.minX - pad && b.cx <= CORE.maxX + pad && b.cy >= CORE.minY - pad && b.cy <= CORE.maxY + pad; }

console.log('코어', CORE, '중심', CX, CY);
const blds = extractLod1();
const core = blds.filter(b => inCore(b));
const q = (arr, p) => { const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const rep = (name, list) => {
  if (!list.length) return console.log(name, '0채');
  const hs = list.map(b => b.h), bs = list.map(b => b.base), as = list.map(b => b.area);
  console.log(`${name}: ${list.length}채 | 높이 중앙 ${q(hs, .5).toFixed(1)} 90% ${q(hs, .9).toFixed(1)} 최고 ${q(hs, 1).toFixed(1)} | 3m이하 ${list.filter(b => b.h <= 3.01).length} | 바닥z 10% ${q(bs, .1).toFixed(1)} 중앙 ${q(bs, .5).toFixed(1)} 90% ${q(bs, .9).toFixed(1)} 최고 ${q(bs, 1).toFixed(1)} | 면적 중앙 ${q(as, .5).toFixed(0)} 90% ${q(as, .9).toFixed(0)} | 구멍있는 건물 ${list.filter(b => b.holes).length}`);
};
rep('반경 전체', blds); rep('코어 C10~D11', core);
for (const [nm, col, row] of [['B9', 1, 8], ['B10', 1, 9], ['C9', 2, 8], ['C10', 2, 9], ['D10', 3, 9], ['C11', 2, 10], ['D11', 3, 10], ['C12', 2, 11], ['D12', 3, 11], ['F11', 5, 10], ['G11', 6, 10], ['G12', 6, 11]]) {
  const a = cell(col, row); rep(nm, blds.filter(b => b.cx >= a.x && b.cx < a.x + CELL && b.cy <= a.y && b.cy > a.y - CELL));
}
if (statsOnly) process.exit(0);

// ── 도로 ──
const tran = parseObj('yokohama_533915_tran.obj');
const roads = [];
for (let t = 0; t < tran.f.length; t += 3) {
  const p = [0, 1, 2].map(k => [tran.v[tran.f[t + k] * 3] - CX, tran.v[tran.f[t + k] * 3 + 1] - CY]);
  const mx = (p[0][0] + p[1][0] + p[2][0]) / 3, my = (p[0][1] + p[1][1] + p[2][1]) / 3;
  if (Math.abs(mx) > ROAD_R || Math.abs(my) > ROAD_R) continue;
  for (const q of p) roads.push(r2(q[0]), r2(q[1]));
}

// ── LOD2: 원경용 삼각형(코어 밖, 반경 안) + 덮는 범위 마스크 ──
const l2 = parseObj('yokohama_533915_bldg_lod2.obj');
const MS = 4, MW = Math.ceil(2 * FAR_R / MS); const mask = new Uint8Array(MW * MW);
const lod2 = [];
for (let t = 0; t < l2.f.length; t += 3) {
  const p = [0, 1, 2].map(k => { const vi = l2.f[t + k] * 3; return [l2.v[vi] - CX, l2.v[vi + 1] - CY, l2.v[vi + 2]]; });
  const mx = (p[0][0] + p[1][0] + p[2][0]) / 3, my = (p[0][1] + p[1][1] + p[2][1]) / 3;
  if (Math.hypot(mx, my) > FAR_R) continue;
  for (const q of p) { lod2.push(r2(q[0]), r2(q[1]), r2(q[2])); }
  // 삼각형을 마스크에 래스터화(평면 투영)
  const g = p.map(q => [(q[0] + FAR_R) / MS, (q[1] + FAR_R) / MS]);
  const x0 = Math.max(0, Math.floor(Math.min(g[0][0], g[1][0], g[2][0]))), x1 = Math.min(MW - 1, Math.floor(Math.max(g[0][0], g[1][0], g[2][0])));
  const y0 = Math.max(0, Math.floor(Math.min(g[0][1], g[1][1], g[2][1]))), y1 = Math.min(MW - 1, Math.floor(Math.max(g[0][1], g[1][1], g[2][1])));
  const den = (g[1][1] - g[2][1]) * (g[0][0] - g[2][0]) + (g[2][0] - g[1][0]) * (g[0][1] - g[2][1]);
  for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
    if (Math.abs(den) < 1e-9) { mask[gy * MW + gx] = 1; continue; } // 수직면: 지나가는 칸을 그대로 표시
    const X = gx + 0.5, Y = gy + 0.5;
    const w0 = ((g[1][1] - g[2][1]) * (X - g[2][0]) + (g[2][0] - g[1][0]) * (Y - g[2][1])) / den;
    const w1 = ((g[2][1] - g[0][1]) * (X - g[2][0]) + (g[0][0] - g[2][0]) * (Y - g[2][1])) / den;
    if (w0 >= -0.15 && w1 >= -0.15 && 1 - w0 - w1 >= -0.15) mask[gy * MW + gx] = 1;
  }
}
const inMask = (x, y) => { const gx = Math.floor((x - CX + FAR_R) / MS), gy = Math.floor((y - CY + FAR_R) / MS); return gx >= 0 && gy >= 0 && gx < MW && gy < MW && mask[gy * MW + gx] === 1; };

// ── 내보내기 ──
const pack = b => ({ r: b.ring.flatMap(p => [r2(p[0] - CX), r2(p[1] - CY)]), h: r2(b.h), z: r2(b.base) });
const PAD = 30; // 코어 가장자리 밖 30m까지는 디테일 대상
const coreOut = [], farOut = []; let dropped = 0;
for (const b of blds) {
  if (inCore(b, PAD)) { coreOut.push(pack(b)); continue; }
  // LOD2가 덮는 곳의 LOD1은 버린다(겹침 방지)
  const pts = [[b.cx, b.cy], ...b.ring]; const hit = pts.filter(p => inMask(p[0], p[1])).length;
  if (hit / pts.length > 0.5) { dropped++; continue; }
  farOut.push(pack(b));
}
// 코어 안의 LOD2 삼각형은 뺀다(코어는 LOD1 평면에서 다시 쌓는다)
const lod2Out = [];
for (let i = 0; i < lod2.length; i += 9) {
  const mx = (lod2[i] + lod2[i + 3] + lod2[i + 6]) / 3 + CX, my = (lod2[i + 1] + lod2[i + 4] + lod2[i + 7]) / 3 + CY;
  if (mx >= CORE.minX - PAD - 10 && mx <= CORE.maxX + PAD + 10 && my >= CORE.minY - PAD - 10 && my <= CORE.maxY + PAD + 10) continue;
  for (let k = 0; k < 9; k++) lod2Out.push(lod2[i + k]);
}
fs.mkdirSync(OUT, { recursive: true });
const data = {
  note: 'PLATEAU yokohama 2020, mesh 533915. x=동, y=북, m. 원점=코어 중심.',
  origin: { x: CX, y: CY, epsg: 6677 }, half: (CORE.maxX - CORE.minX) / 2, pad: PAD,
  core: coreOut, far: farOut, roads, lod2: lod2Out,
};
fs.writeFileSync(path.join(OUT, 'area.json'), JSON.stringify(data));
console.log(`코어 ${coreOut.length}채, 원경 LOD1 ${farOut.length}채 (LOD2와 겹쳐 버린 ${dropped}채), 도로 삼각형 ${roads.length / 6}, 원경 LOD2 삼각형 ${lod2Out.length / 9}`);
console.log('area.json', (fs.statSync(path.join(OUT, 'area.json')).size / 1e6).toFixed(1), 'MB');
