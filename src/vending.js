// 자판기: 스즈키 에이진 방식(뚜렷한 선, 잘게 나뉜 색면, 높은 정보 밀도). 이번엔 모양만 놓는다.
// 디자인은 Claude가 임시로 그린 것이다. 실제 상표는 쓰지 않았다.
import * as THREE from 'three';
import { shuffle } from './util.js';

const INK = '#22305a'; // 선은 순검정 대신 남색
const SCHEMES = [
  { body: '#f4f1e8', accent: '#d8352a', band: '#2456a6' },
  { body: '#d8352a', accent: '#f4f1e8', band: '#f2c230' },
  { body: '#2a5fb0', accent: '#f4f1e8', band: '#f2c230' },
  { body: '#f2c230', accent: '#22305a', band: '#d8352a' },
  { body: '#2f8f5b', accent: '#f4f1e8', band: '#f4f1e8' },
];
const CANS = ['#d8352a', '#2456a6', '#f2c230', '#2f8f5b', '#ef7d22', '#7a4a2a', '#f4f1e8', '#1d2433', '#e86b9a', '#2aa3a3', '#8a5fb0', '#c9d6dc'];

function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function box(g, x, y, w, h, r, fill, lw = 4) { rr(g, x, y, w, h, r); if (fill) { g.fillStyle = fill; g.fill(); } if (lw) { g.lineWidth = lw; g.strokeStyle = INK; g.stroke(); } }

function frontTexture(s, rnd) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 936;
  const g = cv.getContext('2d'); g.lineJoin = 'round';
  g.fillStyle = s.body; g.fillRect(0, 0, 512, 936);
  // 위 띠
  box(g, 14, 12, 484, 62, 10, s.band);
  for (let i = 0; i < 5; i++) { g.fillStyle = i % 2 ? s.accent : s.body; g.fillRect(40 + i * 34, 28, 20, 30); g.lineWidth = 3; g.strokeStyle = INK; g.strokeRect(40 + i * 34, 28, 20, 30); }
  g.fillStyle = s.accent; g.beginPath(); g.arc(440, 43, 19, 0, 7); g.fill(); g.lineWidth = 4; g.stroke();
  g.fillStyle = INK; g.font = 'bold 26px "Yu Gothic", "Meiryo", sans-serif'; g.textBaseline = 'middle'; g.fillText('DRINK ♪', 232, 45);
  // 진열창
  box(g, 14, 86, 392, 478, 8, '#dfeef2', 6);
  for (let row = 0; row < 3; row++) {
    const y0 = 98 + row * 156, n = 9, cw = 392 / n - 3.5;
    g.fillStyle = '#c3dbe2'; g.fillRect(20, y0 + 96, 380, 8); g.lineWidth = 2.5; g.strokeStyle = INK; g.strokeRect(20, y0 + 96, 380, 8);
    for (let i = 0; i < n; i++) {
      const x = 24 + i * (cw + 3.4), c = CANS[Math.floor(rnd() * CANS.length)], c2 = CANS[Math.floor(rnd() * CANS.length)], tall = rnd() < 0.3;
      const top = y0 + (tall ? 4 : 22), hh = tall ? 92 : 74;
      box(g, x, top, cw, hh, tall ? 9 : 5, c, 3);
      g.fillStyle = c2; g.fillRect(x + 2, top + hh * 0.38, cw - 4, hh * 0.3); g.lineWidth = 2; g.strokeStyle = INK; g.strokeRect(x + 2, top + hh * 0.38, cw - 4, hh * 0.3);
      g.fillStyle = 'rgba(255,255,255,.75)'; g.fillRect(x + 5, top + 6, 5, hh - 12);
      if (tall) { g.fillStyle = '#f4f1e8'; g.fillRect(x + cw * 0.28, top - 5, cw * 0.44, 8); g.strokeRect(x + cw * 0.28, top - 5, cw * 0.44, 8); }
      const cold = row < 2 || i < 5;
      box(g, x, y0 + 108, cw, 18, 3, '#fffdf5', 2);
      g.fillStyle = INK; g.font = 'bold 13px sans-serif'; g.fillText(String(100 + 10 * Math.floor(rnd() * 6)), x + 6, y0 + 118);
      box(g, x + 5, y0 + 130, cw - 10, 14, 7, cold ? '#2a7fd6' : '#e0452f', 2.5);
    }
    g.font = 'bold 15px "Yu Gothic", "Meiryo", sans-serif';
    if (row < 2) { g.fillStyle = '#2456a6'; g.fillText('つめた〜い', 26, y0 + 151); } else { g.fillStyle = '#2456a6'; g.fillText('つめた〜い', 26, y0 + 151); g.fillStyle = '#c8372d'; g.fillText('あったか〜い', 236, y0 + 151); }
  }
  // 오른쪽 조작부
  box(g, 416, 86, 82, 478, 8, s.body, 5);
  box(g, 428, 104, 58, 40, 4, '#1d2433', 3); g.fillStyle = '#7fe0a0'; g.font = 'bold 22px monospace'; g.fillText('120', 438, 125);
  box(g, 428, 160, 58, 16, 4, '#1d2433', 3);
  box(g, 446, 196, 22, 54, 6, '#c9d0d6', 3); g.fillStyle = INK; g.fillRect(455, 206, 4, 34);
  g.beginPath(); g.arc(457, 284, 17, 0, 7); g.fillStyle = '#c9d0d6'; g.fill(); g.lineWidth = 3; g.stroke(); g.fillStyle = INK; g.fillRect(443, 281, 28, 6);
  box(g, 432, 322, 50, 58, 5, '#fffdf5', 3); g.fillStyle = s.accent === '#f4f1e8' ? s.band : s.accent; g.fillRect(438, 330, 38, 16); g.fillStyle = INK; g.fillRect(438, 354, 38, 3); g.fillRect(438, 362, 26, 3); g.fillRect(438, 370, 32, 3);
  box(g, 440, 400, 34, 46, 5, '#1d2433', 3); box(g, 446, 470, 22, 22, 11, '#f2c230', 3);
  for (let i = 0; i < 4; i++) { g.fillStyle = INK; g.fillRect(430, 510 + i * 11, 54, 3); }
  // 아래: 광고 띠, 꺼내는 곳
  box(g, 14, 578, 484, 108, 8, s.band, 5);
  for (let i = 0; i < 7; i++) { g.beginPath(); g.arc(60 + i * 64, 632, 24, 0, 7); g.fillStyle = i % 2 ? s.body : s.accent; g.fill(); g.lineWidth = 3.5; g.strokeStyle = INK; g.stroke(); }
  box(g, 40, 706, 432, 112, 12, '#3a4458', 6); box(g, 54, 720, 404, 60, 6, '#566178', 3);
  g.fillStyle = '#c9d0d6'; g.fillRect(200, 790, 112, 12); g.lineWidth = 3; g.strokeStyle = INK; g.strokeRect(200, 790, 112, 12);
  box(g, 14, 838, 484, 84, 6, s.body, 5);
  for (let i = 0; i < 16; i++) { g.fillStyle = INK; g.fillRect(34 + i * 29, 856, 4, 48); }
  g.lineWidth = 10; g.strokeStyle = INK; g.strokeRect(0, 0, 512, 936);
  return cv;
}
function sideTexture(s, top) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = top ? 256 : 468;
  const g = cv.getContext('2d');
  g.fillStyle = s.body; g.fillRect(0, 0, cv.width, cv.height);
  g.lineWidth = 8; g.strokeStyle = INK; g.strokeRect(0, 0, cv.width, cv.height);
  if (!top) { g.lineWidth = 3; g.strokeRect(22, 24, 212, 330); g.fillStyle = s.band; g.fillRect(22, 372, 212, 26); g.strokeRect(22, 372, 212, 26); for (let i = 0; i < 6; i++) { g.fillStyle = INK; g.fillRect(40, 414 + i * 8, 176, 3); } }
  return cv;
}
export const glowMats = []; // 밤에 스스로 빛나는 재질(자판기)
const glow = (m, k) => { m.emissive = new THREE.Color('#ffffff'); m.emissiveMap = m.map; m.emissiveIntensity = 0; m.userData.glow = k; glowMats.push(m); return m; };
const toTex = cv => { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };

function makeMachine(scheme, rnd) {
  const g = new THREE.Group(), Wd = 1.0, Ht = 1.83, Dp = 0.72;
  const side = new THREE.MeshLambertMaterial({ map: toTex(sideTexture(scheme, false)) }), topM = new THREE.MeshLambertMaterial({ map: toTex(sideTexture(scheme, true)) });
  const front = glow(new THREE.MeshLambertMaterial({ map: toTex(frontTexture(scheme, rnd)) }), 0.95);
  glow(side, 0.22); glow(topM, 0.22);
  const body = new THREE.Mesh(new THREE.BoxGeometry(Wd, Ht, Dp), [side, side, topM, topM, front, side]);
  body.position.y = Ht / 2 + 0.04; body.castShadow = body.receiveShadow = true; g.add(body);
  const ink = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(Wd + 0.05, Ht + 0.05, Dp + 0.05), ink); hull.position.copy(body.position); g.add(hull);
  // 옆의 재활용함
  const binM = new THREE.MeshLambertMaterial({ color: '#c9d0d6' }), bin = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.95, 0.4), binM);
  bin.position.set(Wd / 2 + 0.3, 0.475, -0.12); bin.castShadow = bin.receiveShadow = true; g.add(bin);
  const binHull = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.99, 0.44), ink); binHull.position.copy(bin.position); g.add(binHull);
  for (const dx of [-0.09, 0.09]) { const hole = new THREE.Mesh(new THREE.CircleGeometry(0.06, 16), new THREE.MeshBasicMaterial({ color: INK })); hole.position.set(bin.position.x + dx, 0.78, bin.position.z + 0.203); g.add(hole); }
  return g;
}

/** 길에 바로 붙은 벽 앞에 자판기를 세운다 */
export function placeVending(bs, rng, limit, count = 12) {
  const cand = [];
  for (const b of bs) for (const e of b.edges) {
    if (e.roadDist > 1.0 || e.len < 2.4 || Math.abs(e.mid[0]) > limit || Math.abs(e.mid[1]) > limit) continue;
    cand.push({ e, b });
  }
  shuffle(cand, rng);
  const group = new THREE.Group(), spots = [];
  for (let minD = 90; minD >= 50 && spots.length < count; minD -= 20) {
    for (const { e } of cand) {
      if (spots.length >= count) break;
      const t = 0.9 + rng() * (e.len - 1.8), x = e.p[0] + e.t[0] * t + e.n[0] * 0.42, y = e.p[1] + e.t[1] * t + e.n[1] * 0.42;
      if (spots.some(s => Math.hypot(s.x - x, s.y - y) < minD)) continue;
      const m = makeMachine(SCHEMES[spots.length % SCHEMES.length], rng);
      m.position.set(x, 0, -y); m.rotation.y = Math.atan2(e.n[0], -e.n[1]);
      group.add(m); spots.push({ x, y, n: e.n, hw: e.hw });
    }
  }
  return { group, spots };
}
