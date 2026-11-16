import * as THREE from 'three';
import { Batch, lin, mulberry32, pick, W } from './util.js';
import { P } from './palette.js';
import { prepareBuildings, buildGrids, probeBuildings } from './analyze.js';
import { generateBuildings } from './rules.js';
import { makeRoads, buildStreet } from './street.js';
import { placeVending, glowMats } from './vending.js';
import { sampleSky, lightDir, nightify, buildFarLights, NU } from './night.js';

const hud = document.getElementById('hud');
const t0 = performance.now();
const data = await (await fetch('data/area.json')).json();

// ── 렌더러·장면 ──
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.shadowMap.autoUpdate = false;
renderer.toneMapping = THREE.NoToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(P.sky.horizon, 250, 3600);
const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.3, 6000);
camera.rotation.order = 'YXZ';

// 하늘: 천정은 짙은 파랑, 지평선은 옅은 청록
const sky = new THREE.Mesh(new THREE.SphereGeometry(5000, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { cZ: { value: new THREE.Color(P.sky.zenith) }, cM: { value: new THREE.Color(P.sky.mid) }, cH: { value: new THREE.Color(P.sky.horizon) } },
  vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `varying vec3 vP; uniform vec3 cZ, cM, cH;
    void main(){ float t = max(normalize(vP).y, 0.0); vec3 c = mix(cH, cM, smoothstep(0.0, 0.28, t)); c = mix(c, cZ, smoothstep(0.2, 0.85, t)); gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
    }`,
}));
scene.add(sky);

// 빛: 해(밤에는 달) 하나와 하늘빛. 방향과 색은 시각에 따라 applyTime()이 바꾼다.
const sunDir = new THREE.Vector3(0, 0.88, 0.47).normalize();
const sun = new THREE.DirectionalLight(P.sun, 3.0);
// 그림자 경계가 딱 떨어지게 해상도를 높게 잡는다(?shadow=4096 으로 낮출 수 있다)
const SH_SIZE = Math.min(+new URLSearchParams(location.search).get('shadow') || 8192, renderer.capabilities.maxTextureSize), SH_HALF = 120;
sun.castShadow = true; sun.shadow.mapSize.set(SH_SIZE, SH_SIZE);
Object.assign(sun.shadow.camera, { left: -SH_HALF, right: SH_HALF, top: SH_HALF, bottom: -SH_HALF, near: 1, far: 1200 });
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.1;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(P.hemiSky, P.hemiGround, 1.45); scene.add(hemi);

const matV = nightify(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
const matDecal = nightify(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }));
// 원경의 불 켜진 창(밤에만 그린다), 바닥에 떨어지는 빛 모양
const matFarWin = nightify(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 }), true);
const matPool = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });

// ── 땅·도로 ──
const ground = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000), new THREE.MeshLambertMaterial({ color: P.lot }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

// ── 분석 → 규칙 ──
const bs = prepareBuildings(data.core);
const G = buildGrids(data, bs);
probeBuildings(bs, G);
const out = { raw: new Batch(), form: new Batch(), win: new Batch(), roof: new Batch(), sign: new Batch(), pool: new Batch() };
const stats = generateBuildings(bs, out);
const roads = makeRoads(data, G); scene.add(roads.mesh);
const streetB = new Batch(), LIM = data.half + data.pad;
const street = buildStreet(G, bs, mulberry32(7), streetB, LIM, out.pool);
const vend = placeVending(bs, mulberry32(21), data.half - 10);
for (const v of vend.spots) { // 자판기 앞 바닥의 빛
  const c = [v.x + v.n[0] * 0.36, v.y + v.n[1] * 0.36], al = [-v.n[1], v.n[0]], pq = (a, d) => [c[0] + al[0] * a + v.n[0] * d, c[1] + al[1] * a + v.n[1] * d];
  out.pool.cap([pq(0.5, 0), pq(-0.5, 0), pq(-1.4, 2.8), pq(1.4, 2.8)], 0.05, lin('#e4f2ff'));
}

// 원경: LOD1은 팔레트 색 상자, LOD2는 흰 덩어리
const farB = new Batch(), frng = mulberry32(3), farWalls = [...P.walls.zakkyo, ...P.walls.office];
for (const b of data.far) {
  const ring = []; for (let i = 0; i < b.r.length; i += 2) ring.push([b.r[i], b.r[i + 1]]);
  let a = 0; for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; a += p[0] * q[1] - q[0] * p[1]; }
  if (a < 0) ring.reverse();
  try { farB.prism(ring, 0, Math.max(2.6, b.h), lin(pick(frng, farWalls)), lin(pick(frng, P.roofTop))); } catch (e) { /* 삼각분할 실패는 건너뜀 */ }
}
const cFar = lin(P.far), L2 = data.lod2;
for (let i = 0; i < L2.length; i += 9) farB.tri([L2[i], L2[i + 2] - 2.5, -L2[i + 1]], [L2[i + 3], L2[i + 5] - 2.5, -L2[i + 4]], [L2[i + 6], L2[i + 8] - 2.5, -L2[i + 7]], cFar);

const mesh = { far: farB.toMesh(matV), raw: out.raw.toMesh(matV), form: out.form.toMesh(matV), win: out.win.toMesh(matDecal), roof: out.roof.toMesh(matV), sign: out.sign.toMesh(matV), street: streetB.toMesh(matV) };
mesh.win.castShadow = false;
mesh.farWin = buildFarLights(data).toMesh(matFarWin); mesh.farWin.castShadow = mesh.farWin.receiveShadow = false;
mesh.pool = out.pool.toMesh(matPool); mesh.pool.castShadow = mesh.pool.receiveShadow = false; mesh.pool.renderOrder = 2;
for (const m of Object.values(mesh)) scene.add(m);
scene.add(street.wires, vend.group);

// ── 확인용 켜고 끄기(기획에 없는 도구) ──
const layers = { form: true, win: true, roof: true, street: true, sign: true, vend: true };
const LABEL = [['form', '형태(지붕·세트백·계단·발코니)'], ['win', '창문·층 구분'], ['roof', '옥상 설비'], ['street', '전봇대·신호등·가로수·도로 표시'], ['sign', '간판(임시 색판)'], ['vend', '자판기(스즈키식)']];
function applyLayers() {
  mesh.form.visible = layers.form; mesh.raw.visible = !layers.form;
  mesh.win.visible = layers.win; mesh.roof.visible = layers.roof; mesh.sign.visible = layers.sign;
  mesh.street.visible = street.wires.visible = layers.street; roads.uniforms.uMark.value = layers.street ? 1 : 0;
  vend.group.visible = layers.vend; shadowDirty = true;
}

// ── 걷기 ──
const segGrid = new Map(), CELL = 12, key = (cx, cy) => cx * 4096 + cy;
const addSeg = (p, q) => {
  const x0 = Math.floor(Math.min(p[0], q[0]) / CELL), x1 = Math.floor(Math.max(p[0], q[0]) / CELL), y0 = Math.floor(Math.min(p[1], q[1]) / CELL), y1 = Math.floor(Math.max(p[1], q[1]) / CELL);
  for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) { const k = key(cx, cy); (segGrid.get(k) || segGrid.set(k, []).get(k)).push([p, q]); }
};
for (const b of bs) for (const e of b.edges) addSeg(e.p, e.q);
function collide(x, y, r) {
  for (let it = 0; it < 3; it++) {
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    for (let ax = cx - 1; ax <= cx + 1; ax++) for (let ay = cy - 1; ay <= cy + 1; ay++) {
      const list = segGrid.get(key(ax, ay)); if (!list) continue;
      for (const [p, q] of list) {
        const dx = q[0] - p[0], dy = q[1] - p[1], l2 = dx * dx + dy * dy || 1e-9;
        const t = Math.max(0, Math.min(1, ((x - p[0]) * dx + (y - p[1]) * dy) / l2)), px = p[0] + dx * t, py = p[1] + dy * t, d = Math.hypot(x - px, y - py);
        if (d < r && d > 1e-6) { x = px + ((x - px) / d) * r; y = py + ((y - py) / d) * r; }
      }
    }
  }
  return [x, y];
}
// 처음 위치: 중심 근처의 길 한가운데
function findStart() {
  let best = null;
  for (let r = 0; r < 120 && !best; r += 2) for (let a = 0; a < 6.28; a += 0.2) { const x = Math.cos(a) * r, y = Math.sin(a) * r, d = G.sdfAt(x, y); if (d > 1.8 && G.hwAt(x, y) < 5) { best = [x, y]; break; } }
  return best || [0, 0];
}
const startPos = findStart();
const player = { x: startPos[0], y: startPos[1], h: 1.6, yaw: 0, pitch: 0, fly: false };
const keys = new Set();
let vendIdx = -1;
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return; // 시각을 입력하는 중에는 단축키를 먹지 않는다
  keys.add(e.code);
  if (e.code === 'BracketLeft') setTime(curMin() - 10);
  if (e.code === 'BracketRight') setTime(curMin() + 10);
  const n = '123456'.indexOf(e.key);
  if (n >= 0) { const k = LABEL[n][0]; layers[k] = !layers[k]; applyLayers(); }
  if (e.key === '0') { const on = !Object.values(layers).every(v => v); for (const k in layers) layers[k] = on; applyLayers(); }
  if (e.code === 'KeyF') { player.fly = !player.fly; if (!player.fly) player.h = 1.6; }
  if (e.code === 'KeyR') { player.x = startPos[0]; player.y = startPos[1]; player.h = 1.6; player.fly = false; }
  if (e.code === 'KeyV' && vend.spots.length) { vendIdx = (vendIdx + 1) % vend.spots.length; const s = vend.spots[vendIdx]; player.x = s.x + s.n[0] * 3.2; player.y = s.y + s.n[1] * 3.2; player.yaw = Math.atan2(s.n[0], -s.n[1]); player.pitch = -0.05; player.h = 1.6; player.fly = false; }
});
addEventListener('keyup', e => keys.delete(e.code));
const startEl = document.getElementById('start');
startEl.addEventListener('click', () => renderer.domElement.requestPointerLock());
renderer.domElement.addEventListener('click', () => renderer.domElement.requestPointerLock());
document.addEventListener('pointerlockchange', () => { startEl.style.display = document.pointerLockElement ? 'none' : 'flex'; });
addEventListener('mousemove', e => { if (!document.pointerLockElement) return; player.yaw -= e.movementX * 0.0022; player.pitch = Math.max(-1.5, Math.min(1.5, player.pitch - e.movementY * 0.0022)); });
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

// URL로 시점 지정(확인용): ?pos=x,y&h=1.6&yaw=도&pitch=도&layers=123456
const q = new URLSearchParams(location.search);
if (q.has('pos')) { const [x, y] = q.get('pos').split(',').map(Number); player.x = x; player.y = y; player.fly = true; startEl.style.display = 'none'; }
if (q.has('h')) player.h = +q.get('h');
if (q.has('yaw')) player.yaw = (-q.get('yaw') * Math.PI) / 180; // 0=북, 90=동
if (q.has('pitch')) player.pitch = (q.get('pitch') * Math.PI) / 180;
if (q.has('layers')) { LABEL.forEach(([k], i) => { layers[k] = q.get('layers').includes(String(i + 1)); }); }
if (q.has('fov')) { camera.fov = +q.get('fov'); camera.updateProjectionMatrix(); }

// ── 시각: 기본은 컴퓨터 시계를 따라가고, 직접 정하면 그 시각부터 실제 속도로 이어서 흐른다 ──
let offsetMin = 0;
const realMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; };
const curMin = () => (((realMin() + offsetMin) % 1440) + 1440) % 1440;
function setTime(min) { offsetMin = (((min % 1440) + 1440) % 1440) - realMin(); }
const ckTime = document.getElementById('ck-time'), ckRange = document.getElementById('ck-range'), ckNow = document.getElementById('ck-now');
const hhmm = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(Math.floor(m % 60)).padStart(2, '0');
ckTime.addEventListener('change', () => { const [h, m] = ckTime.value.split(':').map(Number); if (!isNaN(h) && !isNaN(m)) setTime(h * 60 + m); });
ckRange.addEventListener('input', () => setTime(+ckRange.value));
ckNow.addEventListener('click', () => { offsetMin = 0; });
if (q.has('time')) { const [h, m] = q.get('time').split(':').map(Number); setTime(h * 60 + (m || 0)); }
const dirTmp = new THREE.Vector3(), skyU = sky.material.uniforms;
function applyTime() {
  const t = curMin() / 60, s = sampleSky(t);
  skyU.cZ.value.copy(s.zen); skyU.cM.value.copy(s.mid); skyU.cH.value.copy(s.hor);
  scene.fog.color.copy(s.fog); scene.fog.near = s.fN; scene.fog.far = s.fF;
  sun.color.copy(s.sun); sun.intensity = s.sunI; hemi.color.copy(s.hs); hemi.groundColor.copy(s.hg); hemi.intensity = s.hI;
  NU.uNight.value = s.night; mesh.farWin.visible = mesh.pool.visible = s.night > 0.01; matPool.opacity = s.night * 0.5;
  for (const m of glowMats) m.emissiveIntensity = s.night * m.userData.glow;
  if (lightDir(t, dirTmp).angleTo(sunDir) > 0.004) { sunDir.copy(dirTmp); shadowDirty = true; }
}

// ── 그림자: 플레이어를 따라가되 텍셀 단위로 끊어서 옮긴다 ──
let shadowDirty = true; const lastS = new THREE.Vector3(1e9, 0, 0);
function updateShadow() {
  const step = ((2 * SH_HALF) / SH_SIZE) * 64, tx = Math.round(player.x / step) * step, tz = Math.round(-player.y / step) * step;
  if (!shadowDirty && tx === lastS.x && tz === lastS.z) return;
  lastS.set(tx, 0, tz); sun.target.position.set(tx, 0, tz); sun.position.copy(sun.target.position).addScaledVector(sunDir, 500);
  sun.target.updateMatrixWorld(); renderer.shadowMap.needsUpdate = true; shadowDirty = false;
}

applyLayers(); lightDir(curMin() / 60, sunDir); applyTime();
const buildMs = performance.now() - t0;
let last = performance.now(), fps = 60, acc = 1;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;
  const f = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0), s = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  const run = keys.has('ShiftLeft') || keys.has('ShiftRight'), sp = player.fly ? (run ? 60 : 14) : run ? 5.0 : 1.5;
  if (f || s) {
    const l = Math.hypot(f, s), fx = -Math.sin(player.yaw), fy = Math.cos(player.yaw); // 데이터 좌표에서 앞 방향(yaw 0 = 북)
    let nx = player.x + ((fx * f + fy * s) / l) * sp * dt, ny = player.y + ((fy * f - fx * s) / l) * sp * dt;
    if (!player.fly) { [nx, ny] = collide(nx, ny, 0.35); nx = Math.max(-LIM + 6, Math.min(LIM - 6, nx)); ny = Math.max(-LIM + 6, Math.min(LIM - 6, ny)); }
    player.x = nx; player.y = ny;
  }
  if (player.fly) player.h = Math.max(0.5, player.h + ((keys.has('KeyE') ? 1 : 0) - (keys.has('KeyQ') ? 1 : 0)) * sp * dt);
  camera.position.set(player.x, player.h, -player.y); camera.rotation.set(player.pitch, player.yaw, 0);
  sky.position.copy(camera.position);
  applyTime();
  updateShadow();
  renderer.render(scene, camera);
  acc += dt;
  if (acc > 0.25) {
    acc = 0;
    const L = LABEL.map(([k, name], i) => `<span class="${layers[k] ? '' : 'off'}">${i + 1} ${layers[k] ? '●' : '○'} ${name}</span>`).join('\n');
    const cm = curMin();
    if (document.activeElement !== ckTime) ckTime.value = hhmm(cm);
    if (document.activeElement !== ckRange) ckRange.value = Math.floor(cm);
    ckNow.disabled = Math.abs(offsetMin) < 0.01;
    hud.innerHTML = `<b>노게 500m · 건물 ${bs.length}채 · ${hhmm(cm)}${Math.abs(offsetMin) < 0.01 ? '' : ' (직접 설정)'}</b>\n${L}\n${fps.toFixed(0)} fps · 삼각형 ${(renderer.info.render.triangles / 1000).toFixed(0)}k · 호출 ${renderer.info.render.calls}\n위치 ${player.x.toFixed(0)}, ${player.y.toFixed(0)} · ${player.fly ? '비행 ' + player.h.toFixed(0) + 'm' : run ? '달리기 5.0m/s' : '걷기 1.5m/s'}`;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 확인용 창구
window.__go = (x, y, yawDeg = 0, pitchDeg = 0, h = 1.6) => { Object.assign(player, { x, y, h, yaw: (-yawDeg * Math.PI) / 180, pitch: (pitchDeg * Math.PI) / 180, fly: true }); };
window.__app = { player, startPos, setTime, curMin, collide, keys, layers, applyLayers, stats, street: street.counts, vend: vend.spots, bs, G, buildMs, renderer, tris: { far: farB.tris, raw: out.raw.tris, form: out.form.tris, win: out.win.tris, roof: out.roof.tris, sign: out.sign.tris, street: streetB.tris } };
console.log('build', buildMs.toFixed(0), 'ms', stats, street.counts, window.__app.tris);
