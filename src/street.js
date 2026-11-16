// 거리: 땅·도로(도로 표시), 전봇대·전선, 신호등, 가로수. 나가이 쪽(반복되고 실루엣과 리듬을 만드는 것).
import * as THREE from 'three';
import { lin, pick, shuffle, mixc } from './util.js';
import { P } from './palette.js';

/** 도로 메시. 길 안쪽 거리(sdf)와 반폭(hw) 텍스처로 보도·흰 선을 칠한다. */
export function makeRoads(data, G) {
  const R = data.roads, pos = new Float32Array((R.length / 2) * 3);
  for (let i = 0, j = 0; i < R.length; i += 2, j += 3) { pos[j] = R[i]; pos[j + 1] = 0.02; pos[j + 2] = -R[i + 1]; }
  // 삼각형이 위를 보도록 감는 방향 정리
  for (let k = 0; k < pos.length; k += 9) {
    const ny = (pos[k + 5] - pos[k + 2]) * (pos[k + 6] - pos[k]) - (pos[k + 3] - pos[k]) * (pos[k + 8] - pos[k + 2]);
    if (ny < 0) for (let a = 0; a < 3; a++) { const t = pos[k + 3 + a]; pos[k + 3 + a] = pos[k + 6 + a]; pos[k + 6 + a] = t; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  const half16 = arr => { const o = new Uint16Array(arr.length); for (let i = 0; i < arr.length; i++) o[i] = THREE.DataUtils.toHalfFloat(arr[i]); return o; };
  const tex = (arr, n) => { const t = new THREE.DataTexture(half16(arr), n, n, THREE.RedFormat, THREE.HalfFloatType); t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true; return t; };
  const uniforms = {
    uSdf: { value: tex(G.sdf, G.N) }, uHw: { value: tex(G.hw, G.HN) }, uHalf: { value: G.half }, uMark: { value: 1 },
    cSide: { value: new THREE.Color(P.sidewalk) }, cCurb: { value: new THREE.Color(P.curb) }, cLine: { value: new THREE.Color(P.line) },
  };
  const mat = new THREE.MeshLambertMaterial({ color: P.asphalt, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvXZ = (modelMatrix * vec4(position, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec2 vXZ; uniform sampler2D uSdf; uniform sampler2D uHw; uniform float uHalf; uniform float uMark; uniform vec3 cSide; uniform vec3 cCurb; uniform vec3 cLine;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      vec2 suv = vec2(vXZ.x + uHalf, -vXZ.y + uHalf) / (2.0 * uHalf);
      if (uMark > 0.5 && suv.x > 0.0 && suv.x < 1.0 && suv.y > 0.0 && suv.y < 1.0) {
        float d = texture2D(uSdf, suv).r, hw = texture2D(uHw, suv).r, aa = max(fwidth(d), 0.01);
        if (hw > 5.5) {
          diffuseColor.rgb = mix(diffuseColor.rgb, cSide, 1.0 - smoothstep(2.6 - aa, 2.6 + aa, d));
          diffuseColor.rgb = mix(diffuseColor.rgb, cCurb, smoothstep(2.6 - aa, 2.6 + aa, d) - smoothstep(2.82 - aa, 2.82 + aa, d));
          diffuseColor.rgb = mix(diffuseColor.rgb, cLine, smoothstep(3.3 - aa, 3.3 + aa, d) - smoothstep(3.45 - aa, 3.45 + aa, d));
        } else if (hw > 2.3) {
          diffuseColor.rgb = mix(diffuseColor.rgb, cLine, smoothstep(0.7 - aa, 0.7 + aa, d) - smoothstep(0.85 - aa, 0.85 + aa, d));
        }
      }`);
  };
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true;
  return { mesh: m, uniforms };
}

/** 전봇대·전선·신호등·가로수를 길 가장자리에 규칙으로 놓는다 */
export function buildStreet(G, bs, rng, B, lim, pool) {
  const N = G.N, near = (list, x, y, d) => { for (const p of list) if (Math.abs(p.x - x) < d && Math.abs(p.y - y) < d && Math.hypot(p.x - x, p.y - y) < d) return true; return false; };
  // 길 가장자리 칸
  const cand = [];
  for (let i = 0; i < N * N; i++) {
    if (G.sdf[i] <= 0 || G.sdf[i] > 0.6) continue;
    const [x, y] = G.cell(i); if (Math.abs(x) > lim || Math.abs(y) > lim) continue;
    cand.push(i);
  }
  shuffle(cand, rng);
  const poles = [], signals = [], trees = [];
  // 1) 신호등: 넓은 길끼리 만나는 블록 모서리(주변에 길 칸이 많은 가장자리)
  for (const i of cand) {
    const [x, y] = G.cell(i); if (G.hwAt(x, y) < 6.5) continue;
    let free = 0, tot = 0;
    for (let dy = -12; dy <= 12; dy += 2) for (let dx = -12; dx <= 12; dx += 2) { if (dx * dx + dy * dy > 144) continue; tot++; if (G.isRoad(x + dx * 0.5, y + dy * 0.5)) free++; }
    if (free / tot < 0.66 || near(signals, x, y, 26)) continue;
    const g = G.grad(x, y); if (g) signals.push({ x: x + g[0] * 0.5, y: y + g[1] * 0.5, g });
  }
  // 2) 가로수: 넓은 길의 보도 위
  for (const i of cand) {
    const [x, y] = G.cell(i); if (G.hwAt(x, y) < 6.5) continue;
    const g = G.grad(x, y); if (!g) continue;
    const tx = x + g[0] * 1.5, ty = y + g[1] * 1.5;
    if (G.sdfAt(tx, ty) < 1.0 || near(trees, tx, ty, 12) || near(signals, tx, ty, 6)) continue;
    trees.push({ x: tx, y: ty });
  }
  // 3) 전봇대: 좁은 길 가장자리
  for (const i of cand) {
    const [x, y] = G.cell(i), hw = G.hwAt(x, y); if (hw >= 6.5 || hw < 1.3) continue;
    if (near(poles, x, y, 30)) continue;
    const g = G.grad(x, y); if (g) poles.push({ x: x + g[0] * 0.4, y: y + g[1] * 0.4, g });
  }

  const cPole = lin(P.pole), cMetal = lin(P.poleMetal), cTr = lin('#8f959a');
  for (const p of poles) {
    const c = [p.x, p.y], g = p.g, along = [-g[1], g[0]];
    B.cyl(c, 0, 10.6, 0.17, 0.1, 6, cPole);
    B.obox([c[0], c[1]], g, 0.9, 0.045, 9.7, 9.8, cMetal); B.obox(c, g, 0.7, 0.045, 9.0, 9.1, cMetal);
    for (const a of [-0.8, 0, 0.8]) B.obox([c[0] + g[0] * a, c[1] + g[1] * a], g, 0.04, 0.04, 9.8, 9.95, lin('#e9e6dc'));
    B.obox(c, along, 0.5, 0.035, 6.1, 6.2, cMetal);
    if (rng() < 0.4) B.cyl([c[0] + along[0] * 0.38, c[1] + along[1] * 0.38], 7.3, 8.2, 0.27, 0.27, 8, cTr, mixc(cTr, [1, 1, 1], 0.3));
    if (rng() < 0.6) { // 가로등: 밤에 등이 켜지고 바닥에 빛 모양이 생긴다
      const lc = [c[0] + g[0] * 1.4, c[1] + g[1] * 1.4];
      B.obox([c[0] + g[0] * 0.7, c[1] + g[1] * 0.7], g, 0.7, 0.03, 7.6, 7.66, cMetal);
      B.aux = 0.05; B.obox(lc, g, 0.28, 0.1, 7.5, 7.6, lin('#e9e6dc')); B.aux = 0;
      const ring = []; for (let k = 0; k < 14; k++) { const a = (k / 14) * 6.2832; ring.push([lc[0] + Math.cos(a) * 3.4, lc[1] + Math.sin(a) * 3.4]); }
      pool.cap(ring, 0.04, lin('#ffe9a8'));
    }
  }
  // 전선: 가까운 전봇대끼리, 사이가 길 위일 때만 잇는다
  const wire = [], seg = (a, b) => { wire.push(a[0], a[1], a[2], b[0], b[1], b[2]); };
  const span = (ax, ay, ah, bx, by, bh, sagK) => {
    const d = Math.hypot(bx - ax, by - ay), sag = d * sagK, n = 8; let prev = null;
    for (let i = 0; i <= n; i++) { const t = i / n, q = [ax + (bx - ax) * t, ah + (bh - ah) * t - sag * 4 * t * (1 - t), -(ay + (by - ay) * t)]; if (prev) seg(prev, q); prev = q; }
  };
  const linked = new Set();
  poles.forEach((p, i) => {
    const nb = poles.map((q, j) => ({ j, d: Math.hypot(q.x - p.x, q.y - p.y) })).filter(o => o.j !== i && o.d < 48).sort((a, b) => a.d - b.d);
    let made = 0;
    for (const { j, d } of nb) {
      if (made >= 2) break;
      const q = poles[j]; let ok = 0, tot = 0;
      for (let s = 2; s < d - 2; s += 2) { tot++; if (G.isRoad(p.x + ((q.x - p.x) * s) / d, p.y + ((q.y - p.y) * s) / d)) ok++; }
      if (tot && ok / tot < 0.85) continue;
      made++;
      const key = i < j ? i + '_' + j : j + '_' + i; if (linked.has(key)) continue; linked.add(key);
      const flip = p.g[0] * q.g[0] + p.g[1] * q.g[1] < 0 ? -1 : 1;
      for (const a of [-0.8, 0, 0.8]) span(p.x + p.g[0] * a, p.y + p.g[1] * a, 9.95, q.x + q.g[0] * a * flip, q.y + q.g[1] * a * flip, 9.95, 0.02);
      span(p.x, p.y, 9.1, q.x, q.y, 9.1, 0.025); span(p.x, p.y, 6.2, q.x, q.y, 6.2, 0.03); span(p.x, p.y, 6.05, q.x, q.y, 6.05, 0.034);
    }
    // 인입선: 전봇대에서 가까운 건물 벽으로
    let drops = 0;
    for (const b of bs) {
      if (drops >= 3) break; if (Math.abs(b.cen[0] - p.x) > 25 || Math.abs(b.cen[1] - p.y) > 25) continue;
      for (const e of b.edges) { if (e.roadDist > 2.5) continue; const d = Math.hypot(e.mid[0] - p.x, e.mid[1] - p.y); if (d > 13 || d < 2) continue; span(p.x, p.y, 6.2, e.mid[0], e.mid[1], Math.min(b.h - 0.2, 4.5 + rng() * 1.5), 0.03); drops++; break; }
    }
  });

  const cSig = lin(P.signal);
  for (const s of signals) {
    const c = [s.x, s.y], g = s.g, along = [-g[1], g[0]];
    B.cyl(c, 0, 6.3, 0.12, 0.09, 6, cSig);
    B.obox([c[0] + g[0] * 1.9, c[1] + g[1] * 1.9], g, 1.9, 0.05, 5.9, 6.0, cSig);
    const hc = [c[0] + g[0] * 3.3, c[1] + g[1] * 3.3];
    B.obox(hc, g, 0.63, 0.14, 5.35, 5.8, lin('#3f4a48'));
    B.aux = -0.03;
    [['#2fb38a', -0.4], ['#f0c02c', 0], ['#d83a2e', 0.4]].forEach(([hex, a]) => { for (const sd of [-1, 1]) B.obox([hc[0] + g[0] * a + along[0] * 0.15 * sd, hc[1] + g[1] * a + along[1] * 0.15 * sd], g, 0.13, 0.02, 5.45, 5.71, lin(hex)); });
    B.aux = 0; B.obox([c[0] + g[0] * 0.2, c[1] + g[1] * 0.2], along, 0.17, 0.1, 2.5, 3.2, lin('#3f4a48')); // 보행자 신호
    B.aux = -0.03;
    B.obox([c[0] + g[0] * 0.31, c[1] + g[1] * 0.31], along, 0.11, 0.01, 2.88, 3.12, lin('#d83a2e')); B.obox([c[0] + g[0] * 0.31, c[1] + g[1] * 0.31], along, 0.11, 0.01, 2.58, 2.82, lin('#2fb38a')); B.aux = 0;
  }

  const ico = new THREE.IcosahedronGeometry(1, 1).toNonIndexed().attributes.position.array, cTrunk = lin(P.trunk);
  for (const t of trees) {
    const hgt = 2.2 + rng() * 0.8, r = 1.5 + rng() * 0.7;
    B.cyl([t.x, t.y], 0, hgt + 0.6, 0.14, 0.09, 6, cTrunk);
    B.blob(ico, t.x, hgt + r * 0.85, -t.y, r, r * 1.1, r, rng() * 6.28, lin(pick(rng, P.leaf)));
    B.blob(ico, t.x + (rng() - 0.5) * r, hgt + r * 1.7, -t.y + (rng() - 0.5) * r, r * 0.65, r * 0.7, r * 0.65, rng() * 6.28, lin(pick(rng, P.leaf)));
  }
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(wire), 3));
  const wires = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: P.wire }));
  return { wires, counts: { poles: poles.length, signals: signals.length, trees: trees.length } };
}
