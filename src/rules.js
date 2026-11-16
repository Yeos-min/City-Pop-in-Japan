// 규칙 기반 디테일 단계: 상자(LOD1 평면+높이) 위에 형태·창·옥상·간판을 규칙으로 얹는다.
// 여기 규칙과 수치는 전부 Claude가 프로토타입용으로 임시로 잡은 것이다.
import { lin, pick, inset, pointInRing, shiftEdge, edgeOf, W, mixc, mulberry32 } from './util.js';
import { P } from './palette.js';

// 밤 조명용 난수(건물 생김새 난수와 따로 굴린다). lit(): 이 창이 밤에 켜지는지, 켜진다면 언제(0~1)
let LR = Math.random;
const lit = (p = 0.42) => (LR() < p ? 0.06 + LR() * 0.9 : 0);

/** out = { raw, form, win, roof, sign, pool } (각각 Batch) */
export function generateBuildings(bs, out) {
  const stats = { house: 0, low: 0, zakkyo: 0, mansion: 0, office: 0, gable: 0, setback: 0, stair: 0, balcony: 0, shop: 0, vsign: 0, billboard: 0 };
  for (const b of bs) { stats[b.type]++; genOne(b, out, stats); }
  return stats;
}

function genOne(b, o, st) {
  const rng = b.rng, F = b.floors, fh = b.fh, h = b.h;
  LR = mulberry32(5000 + b.id * 31);
  const col = b.col = {
    wall: lin(pick(rng, P.walls[b.type])), top: lin(pick(rng, P.roofTop)), tile: lin(pick(rng, P.tile)),
    glass: lin(pick(rng, P.glass)), frame: lin(pick(rng, P.frame)), stair: lin(pick(rng, P.stair)), awning: lin(pick(rng, P.awning)),
  };
  col.trim = mixc(col.wall, [1, 1, 1], 0.35);
  col.wallDark = mixc(col.wall, lin('#5a6274'), 0.25);
  const front = b.front >= 0 ? b.edges[b.front] : null;

  // ── 0. 원본 덩어리(형태 규칙을 끈 상태) ──
  o.raw.prism(b.ring, 0, h, col.wall, col.top);

  // ── 1. 형태: 단(세트백) ──
  let tiers = [{ ring: b.ring, edges: b.edges, y0: 0, y1: h }];
  if ((b.type === 'zakkyo' || b.type === 'office') && F >= 5 && front && front.hw < 6.5 && b.ring.length <= 8) {
    // 좁은 길에 면한 높은 건물은 위층을 길 쪽에서 물린다(도로 사선 제한 흉내)
    const steps = F >= 8 ? 2 : 1, yA = (F - steps) * fh;
    let r = shiftEdge(b.ring, b.front, 1.8);
    if (r) {
      tiers = [{ ring: b.ring, edges: b.edges, y0: 0, y1: yA }];
      for (let s = 1; s <= steps && r; s++) {
        tiers.push({ ring: r, edges: copyEdges(r, b.edges), y0: yA + (s - 1) * fh, y1: yA + s * fh });
        r = s < steps ? shiftEdge(r, b.front, 1.8) : null;
      }
      tiers[tiers.length - 1].y1 = h; st.setback++;
    }
  }
  const top = tiers[tiers.length - 1];
  const gable = (b.type === 'house' || b.type === 'low') && b.rect >= 0.8 && b.obb.hs < 7 && rng() < 0.8;
  const par = gable ? 0 : b.type === 'house' ? 0.25 : b.type === 'office' ? 1.0 : 0.7;

  for (const t of tiers) {
    const isTop = t === top, yTop = t.y1 + (isTop ? par : 0);
    for (const e of t.edges) o.form.vquad(e.p, e.q, t.y0, yTop, col.wall);
    o.form.cap(t.ring, t.y1, col.top);
    if (isTop && par > 0) { // 난간벽(파라펫)
      const ri = inset(t.ring, 0.22), n = t.ring.length;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        o.form.quad(W(t.ring[i], yTop), W(t.ring[j], yTop), W(ri[j], yTop), W(ri[i], yTop), col.trim);
        o.form.vquad(ri[j], ri[i], t.y1, yTop, col.wallDark);
      }
    }
  }
  if (gable) { gableRoof(o.form, b, col); st.gable++; }

  // ── 무엇을 어느 변에 붙일지 먼저 정한다 ──
  const shop = front && front.roadDist <= 2.5 && front.len >= 3 && (b.type === 'zakkyo' ? rng() < 0.75 : b.type === 'house' ? rng() < 0.4 : b.type === 'low' ? rng() < 0.8 : false);
  let balEdge = null, stairEdge = null;
  if (b.type === 'mansion') {
    let s0 = 0;
    for (const e of b.edges) { if (!e.open || e.clear < 1.6 || e.len < 6) continue; const s = e.len * (1 + 0.4 * Math.max(0, -e.n[1])); if (s > s0) { s0 = s; balEdge = e; } }
  }
  if ((b.type === 'zakkyo' && F >= 3 && rng() < 0.55) || (b.type === 'mansion' && rng() < 0.85)) {
    let s0 = 0;
    for (const e of b.edges) {
      if (e === front || e === balEdge || e.clear < 1.4 || e.len < 3.6) continue;
      if (e.roadDist < 1.2 && e.hw < 3) continue; // 좁은 길을 막지 않는다
      const s = e.len + (e.roadDist === Infinity ? 3 : 0); if (s > s0) { s0 = s; stairEdge = e; }
    }
  }

  // ── 1. 형태: 점포 개구부·차양, 발코니, 바깥 계단 ──
  if (shop) {
    st.shop++;
    const e = front, t0 = 0.35, t1 = e.len - 0.35;
    const shopLit = LR() < 0.6 ? 0.08 + LR() * 0.3 : 0; // 밤에 불 켜진 가게
    o.form.aux = shopLit; o.form.erect(e, t0, t1, 0.08, Math.min(2.5, fh - 0.5), 0.035, lin(P.shopDark)); o.form.aux = 0;
    if (shopLit) o.pool.cap([o.pool.pt(e, t0, 0.05), o.pool.pt(e, t1, 0.05), o.pool.pt(e, t1 + 0.5, 2.3), o.pool.pt(e, t0 - 0.5, 2.3)], 0.045, lin('#ffe07a'));
    if (rng() < 0.7) { // 차양
      const a = o.form.pt(e, t0 - 0.1, 0.02), c = o.form.pt(e, t1 + 0.1, 0.02), a2 = o.form.pt(e, t0 - 0.1, 0.95), c2 = o.form.pt(e, t1 + 0.1, 0.95);
      const yw = Math.min(2.75, fh - 0.3), yo = yw - 0.38;
      o.form.quadUp(W(a, yw), W(c, yw), W(c2, yo), W(a2, yo), col.awning);
      o.form.vquad(a2, c2, yo - 0.18, yo, col.awning);
    }
    // 간판: 점포 위 띠 간판(임시 색판)
    if (fh >= 3.0) {
      const sc = lin(pick(rng, P.sign)), sc2 = lin(pick(rng, P.sign));
      const y0 = Math.min(2.85, fh - 0.25), y1 = Math.min(y0 + 0.75, fh + 0.35);
      o.sign.aux = -(0.1 + LR() * 0.4);
      o.sign.ebox(e, t0, t1, 0.02, 0.14, y0, y1, sc);
      o.sign.ebox(e, t0 + (t1 - t0) * 0.12, t0 + (t1 - t0) * 0.6, 0.02, 0.16, y0 + 0.18, y1 - 0.18, sc2); o.sign.aux = 0;
    }
  } else if (front && b.type !== 'house') { // 점포가 아니면 출입구 하나
    const e = front, t0 = Math.min(e.len - 1.6, 0.6 + rng() * Math.max(0, e.len - 2.4));
    if (t0 > 0.2) o.form.erect(e, t0, t0 + 1.3, 0.05, 2.25, 0.035, lin(P.shopDark));
  }
  if (balEdge) { st.balcony++; balconies(o, b, balEdge, col); }
  if (stairEdge && stair(o.form, b, stairEdge, col)) st.stair++; else stairEdge = null;

  // ── 2. 창문·층 구분 ──
  const ribbon = (b.type === 'zakkyo' || b.type === 'office') && rng() < 0.55;
  const pitch = 2.0 + rng() * 0.8;
  for (const t of tiers) {
    const k0 = Math.round(t.y0 / fh), k1 = Math.round(t.y1 / fh);
    for (const e of t.edges) {
      if (e.len < 1.7 || (stairEdge && e.i === stairEdge.i)) continue;
      const isFront = e.i === b.front, onRoad = e.roadDist <= 3.5;
      for (let k = k0; k < k1; k++) {
        const yb = k * fh;
        if (k === 0 && isFront && shop) continue;
        const exposed = e.open || yb + 1 > e.blockH + 0.3;
        if (!exposed) continue;
        if (!e.open && rng() < 0.85) continue; // 이웃 위로 드러난 경계벽은 대부분 민벽
        if (e === balEdge) { if (k === 0) winGrid(o.win, e, yb, { w: 1.5, hg: 1.2, sill: 0.95, pitch: 3.2 }, col); continue; }
        if (b.type === 'house') {
          if (!onRoad && rng() < 0.4) continue;
          if (k === 0 && isFront) { door(o.win, e, 0.6, col); if (e.len > 4.2) winHouse(o.win, e, yb, 2.3, e.len - 0.6, col); }
          else winHouse(o.win, e, yb, 0.6, e.len - 0.6, col);
        } else if (b.type === 'zakkyo' || b.type === 'office') {
          if (onRoad || b.type === 'office') { if (ribbon) winRibbon(o.win, e, yb, fh, col, k === 0 && isFront); else winGrid(o.win, e, yb, { w: pitch * 0.62, hg: fh - 1.55, sill: 0.95, pitch }, col); }
          else if (rng() < 0.7) winGrid(o.win, e, yb, { w: 0.8, hg: 0.9, sill: 1.1, pitch: 3.4 }, col);
        } else if (b.type === 'mansion') {
          winGrid(o.win, e, yb, { w: 0.9, hg: 1.0, sill: 1.05, pitch: 2.9 }, col);
        } else { // low
          if (onRoad) winGrid(o.win, e, yb, { w: 1.8, hg: 1.3, sill: 0.9, pitch: 3.0 }, col); else if (rng() < 0.5) winGrid(o.win, e, yb, { w: 0.9, hg: 0.8, sill: 1.3, pitch: 4 }, col);
        }
      }
      // 층 구분 띠(길에 면한 변만)
      if (onRoad && e.open && b.type !== 'house' && !ribbon) for (let k = Math.max(1, k0); k < k1; k++) o.win.erect(e, 0, e.len, k * fh - 0.07, k * fh + 0.07, 0.03, col.trim);
    }
  }

  // ── 3. 옥상 설비 ──
  if (!gable) rooftop(o.roof, b, top, col, par);
  else if (rng() < 0.3) antenna(o.roof, b);

  // ── 5. 간판: 세로 돌출 간판, 옥상 광고판 ──
  if (front && front.roadDist <= 2.5 && (b.type === 'zakkyo' ? rng() < 0.75 : b.type === 'house' ? shop && rng() < 0.3 : b.type === 'office' ? rng() < 0.3 : false)) {
    st.vsign++;
    const e = tiers[0].edges[b.front], atEnd = rng() < 0.5, tc = atEnd ? e.len - 0.35 : 0.35;
    const yTopS = Math.min(tiers[0].y1 - 0.3, fh + Math.max(1, F - 1) * fh * (0.6 + rng() * 0.4));
    let y = Math.max(2.9, fh * 0.95);
    const ph = b.type === 'house' ? 1.2 : Math.max(1.2, fh * 0.92);
    while (y + ph <= yTopS + 0.01) {
      const sc = lin(pick(rng, P.sign)), sc2 = lin(pick(rng, P.sign));
      o.sign.aux = LR() < 0.85 ? -(0.1 + LR() * 0.4) : 0;
      o.sign.ebox(e, tc - 0.11, tc + 0.11, 0.12, 0.98, y, y + ph - 0.06, sc);
      o.sign.ebox(e, tc - 0.125, tc + 0.125, 0.27, 0.83, y + ph * 0.18, y + ph * 0.72, sc2); o.sign.aux = 0;
      y += ph; if (b.type === 'house') break;
    }
  }
  if (!gable && front && F >= 4 && front.hw >= 4.5 && (b.type === 'zakkyo' || b.type === 'office') && rng() < 0.4) {
    const e = top.edges[b.front], L = Math.min(e.len - 1, 7.5);
    if (L >= 3) {
      st.billboard++;
      const t0 = (e.len - L) / 2, y0 = top.y1 + par + 0.9, y1 = y0 + 2.4 + rng() * 1.2, sc = lin(pick(rng, P.sign)), sc2 = lin(pick(rng, P.sign));
      for (const t of [t0 + 0.3, t0 + L / 2, t0 + L - 0.3]) o.sign.ebox(e, t - 0.05, t + 0.05, -0.75, -0.65, top.y1, y1, lin(P.poleMetal));
      o.sign.aux = -(0.1 + LR() * 0.3);
      o.sign.ebox(e, t0, t0 + L, -0.65, -0.55, y0, y1, sc);
      o.sign.ebox(e, t0 + L * 0.1, t0 + L * 0.9, -0.66, -0.54, y0 + (y1 - y0) * 0.25, y0 + (y1 - y0) * 0.75, sc2); o.sign.aux = 0;
    }
  }
}

function copyEdges(ring, base) {
  return ring.map((_, i) => { const e = edgeOf(ring, i), s = base[i]; e.clear = s.clear; e.open = s.open; e.roadDist = s.roadDist; e.hw = s.hw; e.blockH = s.blockH; return e; });
}

// 맞배지붕: OBB의 긴 축을 용마루로
function gableRoof(B, b, col) {
  const { c, u, v, hl, hs } = b.obb, h = b.h, ov = 0.35, rise = Math.min(2.2, hs * 0.55), yE = h - rise * (ov / hs), yR = h + rise;
  const at = (a, s) => [c[0] + u[0] * a + v[0] * s, c[1] + u[1] * a + v[1] * s];
  const L = hl + ov, S = hs + ov;
  B.quadUp(W(at(-L, 0), yR), W(at(L, 0), yR), W(at(L, S), yE), W(at(-L, S), yE), col.tile);
  B.quadUp(W(at(-L, 0), yR), W(at(L, 0), yR), W(at(L, -S), yE), W(at(-L, -S), yE), col.tile);
  for (const a of [-hl, hl]) B.tri(W(at(a, -hs), h), W(at(a, hs), h), W(at(a, 0), yR), col.wall);
}

function balconies(o, b, e, col) {
  const F = b.floors, fh = b.fh, t0 = 0.25, t1 = e.len - 0.25, D = 1.3;
  const units = Math.max(1, Math.round((t1 - t0) / 5.5)), uw = (t1 - t0) / units;
  const panel = b.rng() < 0.5 ? col.trim : mixc(col.wall, lin('#6f8fa8'), 0.35);
  for (let k = 1; k <= F; k++) {
    const y = k * fh;
    o.form.ebox(e, t0, t1, 0, D, y - 0.14, y, col.trim); // 바닥판(맨 위는 처마)
    if (k === F) break;
    o.form.ebox(e, t0, t1, D - 0.08, D, y, y + 1.1, panel);
    o.form.ebox(e, t0, t0 + 0.08, 0, D, y, y + 1.1, panel);
    o.form.ebox(e, t1 - 0.08, t1, 0, D, y, y + 1.1, panel);
    for (let u = 1; u < units; u++) o.form.ebox(e, t0 + u * uw - 0.03, t0 + u * uw + 0.03, 0, D - 0.05, y, y + fh - 0.14, col.trim);
    for (let u = 0; u < units; u++) { const a = t0 + u * uw + 0.7, c = t0 + (u + 1) * uw - 0.7, m = (a + c) / 2; if (c - a < 1) continue; o.win.aux = lit(); o.win.erect(e, a, m - 0.03, y + 0.06, y + 2.0, 0.04, col.glass); o.win.erect(e, m + 0.03, c, y + 0.06, y + 2.0, 0.04, col.glass); o.win.aux = 0; }
  }
}

// 바깥 철골 계단: 한 평면 안에서 지그재그
function stair(B, b, e, col) {
  const F = b.floors, fh = b.fh, R = Math.min(e.len - 0.4, 4.4);
  if (R < 3.2) return false;
  const t0 = b.rng() < 0.5 ? 0.2 : e.len - 0.2 - R, a = t0 + 0.95, c = t0 + R - 0.95, o0 = 0.04, o1 = 1.0, sc = col.stair, sp = mixc(sc, [1, 1, 1], 0.25);
  for (let k = 0; k < F; k++) {
    const y0 = k * fh, ym = y0 + fh / 2, y1 = y0 + fh;
    B.eramp(e, a, c, o0, o1, y0, ym, 0.14, sc); B.eslope(e, a, c, o1, y0, ym, 0.95, sp);
    B.ebox(e, c, t0 + R, o0, o1, ym - 0.14, ym, sc); B.ebox(e, t0 + R - 0.05, t0 + R, o0, o1, ym, ym + 0.95, sp); B.ebox(e, c, t0 + R, o1 - 0.05, o1, ym, ym + 0.95, sp);
    B.eramp(e, c, a, o0, o1, ym, y1, 0.14, sc); B.eslope(e, c, a, o1, ym, y1, 0.95, sp);
    B.ebox(e, t0, a, o0, o1, y1 - 0.14, y1, sc); B.ebox(e, t0, t0 + 0.05, o0, o1, y1, y1 + 0.95, sp); B.ebox(e, t0, a, o1 - 0.05, o1, y1, y1 + 0.95, sp);
  }
  for (const t of [t0 + 0.04, t0 + R - 0.04]) B.ebox(e, t - 0.04, t + 0.04, o1 - 0.08, o1, 0, F * fh + 0.95, sc);
  return true;
}

// ── 창 ──
function winGrid(B, e, yb, o, col) {
  const m = 0.55, n = Math.floor((e.len - 2 * m + (o.pitch - o.w)) / o.pitch);
  if (n < 1 || o.hg < 0.4) return;
  const s = (e.len - (n * o.pitch - (o.pitch - o.w))) / 2;
  for (let i = 0; i < n; i++) { const t = s + i * o.pitch; B.aux = lit(); B.erect(e, t, t + o.w, yb + o.sill, yb + o.sill + o.hg, 0.04, col.glass); }
  B.aux = 0;
}
function winRibbon(B, e, yb, fh, col, ground) {
  const t0 = 0.45, t1 = e.len - 0.45; if (t1 - t0 < 1.2) return;
  const y0 = yb + (ground ? 0.3 : 0.95), y1 = yb + fh - 0.5, n = Math.max(1, Math.round((t1 - t0) / 1.5)), w = (t1 - t0) / n;
  B.aux = lit(0.4); // 띠창은 한 층이 통째로 켜진다
  for (let i = 0; i < n; i++) B.erect(e, t0 + i * w + 0.04, t0 + (i + 1) * w - 0.04, y0, y1, 0.04, col.glass);
  B.aux = 0;
}
// 미닫이창: 유리 두 장 + 알루미늄 틀
function winHouse(B, e, yb, tA, tB, col) {
  const span = tB - tA; if (span < 1.5) return;
  const n = span > 5.5 ? 2 : 1, w = 1.65, hg = 1.1, sill = 0.95, f = 0.06;
  for (let i = 0; i < n; i++) {
    const t = tA + (span * (i + 0.5)) / n - w / 2, y0 = yb + sill, y1 = y0 + hg, m = t + w / 2;
    B.aux = lit(0.5); B.erect(e, t, m - 0.025, y0, y1, 0.04, col.glass); B.erect(e, m + 0.025, t + w, y0, y1, 0.04, col.glass); B.aux = 0;
    B.erect(e, t - f, t + w + f, y1, y1 + f, 0.04, col.frame); B.erect(e, t - f, t + w + f, y0 - f, y0, 0.04, col.frame);
    B.erect(e, t - f, t, y0, y1, 0.04, col.frame); B.erect(e, t + w, t + w + f, y0, y1, 0.04, col.frame); B.erect(e, m - 0.025, m + 0.025, y0, y1, 0.04, col.frame);
  }
}
function door(B, e, t, col) { B.erect(e, t, t + 0.95, 0.06, 2.1, 0.04, lin(P.shopDark)); B.erect(e, t - 0.06, t + 1.01, 2.1, 2.17, 0.04, col.frame); }

// ── 옥상 ──
function rooftop(B, b, top, col, par) {
  const rng = b.rng, { c, u, v, hl, hs } = b.obb, y = top.y1, safe = inset(top.ring, 0.7);
  if (b.type === 'house' && rng() < 0.6) return;
  const placed = [];
  const fits = (p, hx, hy) => {
    for (const [a, s] of [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]]) if (!pointInRing([p[0] + u[0] * a + v[0] * s, p[1] + u[1] * a + v[1] * s], safe)) return false;
    for (const q of placed) if (Math.hypot(q[0] - p[0], q[1] - p[1]) < q[2] + Math.max(hx, hy)) return false;
    return true;
  };
  const slot = (hx, hy, tries = 14) => {
    for (let i = 0; i < tries; i++) { const p = [c[0] + u[0] * (rng() * 2 - 1) * hl * 0.85 + v[0] * (rng() * 2 - 1) * hs * 0.8, c[1] + u[1] * (rng() * 2 - 1) * hl * 0.85 + v[1] * (rng() * 2 - 1) * hs * 0.8]; if (fits(p, hx, hy)) { placed.push([p[0], p[1], Math.max(hx, hy)]); return p; } }
    return null;
  };
  if (b.type === 'office' && b.area > 500) { // 기계실: 평면을 줄여 올린다
    const k = 0.5, ring = top.ring.map(p => [b.cen[0] + (p[0] - b.cen[0]) * k, b.cen[1] + (p[1] - b.cen[1]) * k]);
    B.prism(ring, y, y + 3.6, col.wallDark, col.top); placed.push([b.cen[0], b.cen[1], Math.max(hl, hs) * k]);
  } else if (b.floors >= 3) { // 옥탑(계단실)
    const p = slot(1.5, 1.3);
    if (p) {
      B.obox(p, u, 1.5, 1.3, y, y + 2.6, col.wall, col.top);
      if (rng() < 0.5) { const tc = lin(pick(rng, P.tank)); B.cyl(p, y + 2.6, y + 3.0, 0.08, 0.08, 4, lin(P.poleMetal)); B.cyl(p, y + 3.0, y + 4.3, 0.75, 0.75, 8, tc, mixc(tc, [1, 1, 1], 0.3)); }
    }
  }
  if (b.floors >= 3 && rng() < 0.55) { // 고가 수조
    const p = slot(1.1, 1.1);
    if (p) {
      const tc = lin(pick(rng, P.tank)), m = lin(P.poleMetal);
      for (const [a, s] of [[-0.8, -0.8], [0.8, -0.8], [0.8, 0.8], [-0.8, 0.8]]) B.obox([p[0] + u[0] * a + v[0] * s, p[1] + u[1] * a + v[1] * s], u, 0.05, 0.05, y, y + 1.5, m);
      B.obox(p, u, 0.95, 0.95, y + 1.5, y + 1.6, m);
      if (rng() < 0.5) B.cyl(p, y + 1.6, y + 3.3, 0.85, 0.85, 10, tc, mixc(tc, [1, 1, 1], 0.3)); else B.obox(p, u, 0.9, 0.9, y + 1.6, y + 3.2, tc, mixc(tc, [1, 1, 1], 0.3));
    }
  }
  const nAc = b.type === 'house' ? 1 : 1 + Math.floor(rng() * Math.min(5, 1 + b.area / 60)); // 실외기
  const ac = lin(P.ac), acD = mixc(ac, lin('#4a5058'), 0.5);
  for (let i = 0; i < nAc; i++) {
    const n = 1 + Math.floor(rng() * 3), p = slot(0.45 * n + 0.1, 0.25);
    if (!p) continue;
    for (let k = 0; k < n; k++) { const q = [p[0] + u[0] * (k - (n - 1) / 2) * 0.95, p[1] + u[1] * (k - (n - 1) / 2) * 0.95]; B.obox(q, u, 0.42, 0.17, y + 0.08, y + 0.75, ac, acD); }
  }
  if (b.floors >= 5 && rng() < 0.25) { const p = slot(0.3, 0.3); if (p) { B.cyl(p, y, y + 6.5, 0.06, 0.03, 5, lin(P.poleMetal)); } }
}
function antenna(B, b) { // 지붕 위 TV 안테나
  const { c, u, v } = b.obb, m = lin(P.poleMetal), y = b.h + Math.min(2.2, b.obb.hs * 0.55), p = [c[0] + u[0] * (b.rng() - 0.5) * b.obb.hl, c[1] + u[1] * (b.rng() - 0.5) * b.obb.hl];
  B.obox(p, u, 0.025, 0.025, y - 0.2, y + 2.2, m);
  for (let i = 0; i < 4; i++) B.obox([p[0] + u[0] * (i * 0.22 - 0.33), p[1] + u[1] * (i * 0.22 - 0.33)], v, 0.35 - i * 0.04, 0.012, y + 1.9, y + 1.93, m);
}
