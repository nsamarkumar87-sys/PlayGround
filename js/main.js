import * as THREE from 'three';
import { RoundedBoxGeometry } from '../vendor/RoundedBoxGeometry.js';
import { createTextures, createPieceMaterials } from './textures.js';
import { Soundscape } from './audio.js';
import { Cottage, STAGES } from './house.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const W = 10;
const H = 18;
const CELL = 1;
const BOARD_X = -5.1;
const BOARD_BASE = 0.1;
const PIECE_COLORS = {
  I: '#49d8e4', O: '#ffd34e', T: '#b77bff', S: '#75e05d', Z: '#ff6e61', J: '#5f8fff', L: '#ff9f43'
};
const BASE_SHAPES = {
  I: [[0, 0], [1, 0], [2, 0], [3, 0]],
  O: [[0, 0], [1, 0], [0, 1], [1, 1]],
  T: [[0, 0], [1, 0], [2, 0], [1, 1]],
  S: [[1, 0], [2, 0], [0, 1], [1, 1]],
  Z: [[0, 0], [1, 0], [1, 1], [2, 1]],
  J: [[0, 0], [0, 1], [1, 1], [2, 1]],
  L: [[2, 0], [0, 1], [1, 1], [2, 1]]
};

function normalize(cells) {
  const minX = Math.min(...cells.map(c => c[0]));
  const minY = Math.min(...cells.map(c => c[1]));
  const out = cells.map(([x, y]) => [x - minX, y - minY]);
  const width = Math.max(...out.map(c => c[0])) + 1;
  const height = Math.max(...out.map(c => c[1])) + 1;
  return { cells: out, width, height };
}

const SHAPES = {};
for (const [type, base] of Object.entries(BASE_SHAPES)) {
  SHAPES[type] = [];
  let cells = base;
  for (let r = 0; r < 4; r++) {
    SHAPES[type].push(normalize(cells));
    cells = cells.map(([x, y]) => [-y, x]);
  }
}

const ui = {
  score: $('score'), level: $('level'), lines: $('lines'),
  buildPct: $('buildPct'), buildBar: $('buildBar'), buildPips: $('buildPips'),
  stageName: $('stageName'), stageSub: $('stageSub'),
  nextGrid: $('nextGrid'), holdGrid: $('holdGrid'), holdPanel: $('holdPanel'),
  toast: $('toast'), toastText: $('toastText'),
  comboPop: $('comboPop'), comboText: $('comboText'), comboSub: $('comboSub'),
  menu: $('menuOverlay'), pause: $('pauseOverlay'), gameover: $('gameOverOverlay'), win: $('winOverlay'),
  gameOverPct: $('gameOverPct'), finalScore: $('finalScore'), finalLines: $('finalLines'), finalLevel: $('finalLevel'),
  winScore: $('winScore'), winLines: $('winLines'), winCombo: $('winCombo'),
  soundBtn: $('soundBtn'), pauseBtn: $('pauseBtn'),
  camWindow: $('camWindow')
};

// ---------- renderer / scene ----------
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: true
});
const glInfo = renderer.getContext();
const debugInfo = glInfo.getExtension('WEBGL_debug_renderer_info');
const gpuName = debugInfo ? glInfo.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : '';
const softwareGL = /swiftshader|llvmpipe|software/i.test(gpuName || '');
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, softwareGL ? 1 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = !softwareGL;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xc7e5dc, 45, 105);
const camera = new THREE.PerspectiveCamera(36, window.innerWidth / window.innerHeight, 0.1, 140);
camera.layers.enable(1);
scene.add(camera);

const textures = createTextures();
const pieceMats = createPieceMaterials(textures);

// ---------- lighting ----------
const hemi = new THREE.HemisphereLight(0xe2f4ff, 0x4f7d43, 2.45);
hemi.layers.set(1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe6b5, 3.1);
sun.position.set(15, 27, 18);
sun.castShadow = !softwareGL;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -22;
sun.shadow.camera.right = 22;
sun.shadow.camera.top = 22;
sun.shadow.camera.bottom = -18;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 70;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.025;
sun.layers.set(1);
scene.add(sun);
scene.add(sun.target);
const fill = new THREE.DirectionalLight(0x9fe8ff, 0.62);
fill.position.set(-12, 12, 18);
fill.layers.set(1);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xffbd82, 0.42);
rim.position.set(-3, 8, -18);
rim.layers.set(1);
scene.add(rim);
const ambient = new THREE.AmbientLight(0xcfe7d8, 0.32);
scene.add(ambient);

// ---------- environment ----------
const env = buildEnvironment();
const cottage = new Cottage(scene, textures, { x: 6.15, z: -1.35 });
cottage.group.traverse((obj) => {
  if (obj.isMesh || obj.isLight) obj.layers.set(1);
});

const boardGroup = new THREE.Group();
boardGroup.position.set(BOARD_X, BOARD_BASE, 0);
boardGroup.visible = false;
scene.add(boardGroup);
buildBoardWell();

// scissored preview camera for portrait cottage cam (uses the main renderer)
const previewCamera = new THREE.PerspectiveCamera(34, 1.7, 0.1, 80);
previewCamera.layers.set(1);
previewCamera.layers.enable(2);
const previewGround = new THREE.Mesh(
  new THREE.CylinderGeometry(5.6, 5.2, 0.55, 36),
  new THREE.MeshStandardMaterial({ color: 0x74b950, roughness: 1 })
);
previewGround.position.set(cottage.group.position.x, -0.34, cottage.group.position.z);
previewGround.layers.set(2);
scene.add(previewGround);
const previewHemi = new THREE.HemisphereLight(0xe4f7ff, 0x4b7a3c, 2.6);
previewHemi.layers.set(2);
scene.add(previewHemi);
const previewSun = new THREE.DirectionalLight(0xffe4b4, 2.5);
previewSun.position.set(12, 16, 12);
previewSun.layers.set(2);
scene.add(previewSun);

// ---------- environment ----------
function buildEnvironment() {
  const root = new THREE.Group();
  scene.add(root);
  const data = { root, clouds: [], fireflies: null, waterMat: null };

  const grassMap = textures.grass.clone();
  grassMap.repeat.set(20, 13);
  grassMap.needsUpdate = true;
  const grassMat = new THREE.MeshStandardMaterial({ map: grassMap, color: 0xd8f2b8, roughness: 1 });
  const dirtMap = textures.dirt.clone();
  dirtMap.repeat.set(8, 2);
  dirtMap.needsUpdate = true;
  const dirtMat = new THREE.MeshStandardMaterial({ map: dirtMap, roughness: 1 });
  const stoneMap = textures.stone.clone();
  stoneMap.repeat.set(7, 2);
  stoneMap.needsUpdate = true;
  const stoneMat = new THREE.MeshStandardMaterial({ map: stoneMap, roughness: 0.98 });

  const top = new THREE.Mesh(new THREE.PlaneGeometry(33, 22), grassMat);
  top.rotation.x = -Math.PI / 2;
  top.position.set(0.5, -0.13, 0);
  top.receiveShadow = true;
  root.add(top);

  const dirt = new THREE.Mesh(new THREE.BoxGeometry(33, 2.7, 22), dirtMat);
  dirt.position.set(0.5, -1.55, 0);
  dirt.receiveShadow = true;
  root.add(dirt);
  const stone = new THREE.Mesh(new THREE.BoxGeometry(29, 2.2, 18.5), stoneMat);
  stone.position.set(0.5, -3.6, 0);
  stone.receiveShadow = true;
  root.add(stone);
  const stone2 = new THREE.Mesh(new THREE.BoxGeometry(22, 1.8, 13.5), stoneMat);
  stone2.position.set(0.5, -5.3, 0);
  stone2.receiveShadow = true;
  root.add(stone2);

  // chunky grass rim
  const rimMat = new THREE.MeshStandardMaterial({ map: textures.grass, color: 0xcaf0a2, roughness: 1 });
  const rimGeo = new THREE.BoxGeometry(1.02, 0.36, 1.02);
  const rimPositions = [];
  for (let x = -16; x <= 17; x++) { rimPositions.push([x, 0, 10.6]); rimPositions.push([x, 0, -10.6]); }
  for (let z = -10; z <= 10; z++) { rimPositions.push([-16.1, 0, z]); rimPositions.push([17.1, 0, z]); }
  const rim = new THREE.InstancedMesh(rimGeo, rimMat, rimPositions.length);
  const dummy = new THREE.Object3D();
  rimPositions.forEach(([x, y, z], i) => {
    dummy.position.set(x, -0.3 + Math.random() * 0.06, z);
    dummy.rotation.y = Math.random() < 0.2 ? Math.PI / 2 : 0;
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    rim.setMatrixAt(i, dummy.matrix);
  });
  rim.receiveShadow = true;
  rim.castShadow = true;
  root.add(rim);

  // pond
  const waterMap = textures.water.clone();
  waterMap.repeat.set(2.5, 2.5);
  waterMap.needsUpdate = true;
  const waterMat = new THREE.MeshStandardMaterial({
    map: waterMap, color: 0x6ad8ed, roughness: 0.12, metalness: 0.28,
    transparent: true, opacity: 0.88, emissive: 0x1d91a5, emissiveIntensity: 0.18
  });
  const water = new THREE.Mesh(new THREE.CircleGeometry(3.3, 40), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(-12.3, -0.14, 6.4);
  root.add(water);
  data.waterMat = waterMat;

  const pondRockMat = new THREE.MeshStandardMaterial({ map: textures.cobble, roughness: 0.95 });
  const rocks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.8, 0.55, 0.7), pondRockMat, 24);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    dummy.position.set(-12.3 + Math.cos(a) * 3.45, -0.1, 6.4 + Math.sin(a) * 3.45);
    dummy.rotation.set(Math.random() * 0.3, Math.random() * 3, Math.random() * 0.2);
    dummy.scale.setScalar(0.7 + Math.random() * 0.7);
    dummy.updateMatrix();
    rocks.setMatrixAt(i, dummy.matrix);
  }
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  root.add(rocks);

  // lily pads
  const lilyMat = new THREE.MeshStandardMaterial({ map: textures.leavesLight, color: 0x9de26c, roughness: 0.9 });
  for (let i = 0; i < 4; i++) {
    const lily = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.05, 10), lilyMat);
    lily.position.set(-12.3 + (Math.random() - 0.5) * 3.2, -0.08, 6.4 + (Math.random() - 0.5) * 3.2);
    lily.scale.z = 0.75;
    root.add(lily);
  }

  // stepping-stone path from porch
  const pathMat = new THREE.MeshStandardMaterial({ map: textures.stone, roughness: 0.95 });
  for (let i = 0; i < 6; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.16, 1.0), pathMat);
    step.position.set(6.0 + Math.sin(i * 2.2) * 0.28, -0.11, 4.0 + i * 1.18);
    step.rotation.y = (Math.random() - 0.5) * 0.35;
    step.receiveShadow = true;
    root.add(step);
  }

  // trees
  const treeBlocks = [];
  const trees = [
    [-13.4, -5.4, 5], [-12.7, 2.8, 4], [-9.1, 8.1, 4], [-7.7, -7.5, 3],
    [12.8, -8.6, 6], [10.2, -9.2, 4], [2.0, -9.3, 5]
  ];
  for (const [tx, tz, h] of trees) {
    for (let y = 0; y < h; y++) {
      treeBlocks.push({ x: tx, y: y + 0.4, z: tz, s: 0.82, mat: 'log' });
    }
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        for (let dy = 0; dy <= 3; dy++) {
          if (Math.abs(dx) === 2 && Math.abs(dz) === 2 && Math.random() < 0.7) continue;
          if (dy === 3 && (Math.abs(dx) > 1 || Math.abs(dz) > 1)) continue;
          if (Math.random() < 0.16) continue;
          treeBlocks.push({
            x: tx + dx * 0.72 + (Math.random() - 0.5) * 0.12,
            y: h + 0.1 + dy * 0.68,
            z: tz + dz * 0.72 + (Math.random() - 0.5) * 0.12,
            s: 0.92 + Math.random() * 0.16,
            mat: Math.random() < 0.28 ? 'leavesLight' : 'leaves'
          });
        }
      }
    }
  }
  const logMat = new THREE.MeshStandardMaterial({ map: textures.spruce, roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ map: textures.leaves, roughness: 0.94 });
  const leafLightMat = new THREE.MeshStandardMaterial({ map: textures.leavesLight, roughness: 0.94 });
  const treeGeo = new RoundedBoxGeometry(0.95, 0.95, 0.95, 1, 0.04);
  const byMat = { log: [], leaves: [], leavesLight: [] };
  treeBlocks.forEach(b => byMat[b.mat].push(b));
  for (const [key, list] of Object.entries(byMat)) {
    const mat = key === 'log' ? logMat : key === 'leaves' ? leafMat : leafLightMat;
    const mesh = new THREE.InstancedMesh(treeGeo, mat, list.length);
    list.forEach((b, i) => {
      dummy.position.set(b.x, b.y, b.z);
      dummy.rotation.set(0, Math.random() * Math.PI, 0);
      dummy.scale.setScalar(b.s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  }

  // flowers + grass tufts
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x4f9b3b, roughness: 1 });
  const bloomMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
  const stemGeo = new THREE.BoxGeometry(0.06, 0.3, 0.06);
  const bloomGeo = new THREE.BoxGeometry(0.17, 0.17, 0.17);
  const spots = [];
  let attempts = 0;
  while (spots.length < 65 && attempts++ < 400) {
    const x = -15 + Math.random() * 31;
    const z = -9 + Math.random() * 18;
    if (x > -11 && x < 0.5 && Math.abs(z) < 2.2) continue;
    if (x > 0.8 && x < 11.3 && z > -6.5 && z < 6.4) continue;
    if (Math.hypot(x + 12.3, z - 6.4) < 4.1) continue;
    if (Math.abs(x - 6.2) < 1.2 && z > 3 && z < 11) continue;
    spots.push([x, z]);
  }
  const stems = new THREE.InstancedMesh(stemGeo, stemMat, spots.length);
  const blooms = new THREE.InstancedMesh(bloomGeo, bloomMat, spots.length);
  const flowerColors = [0xff8fa8, 0xffe16b, 0xffffff, 0xc39bff, 0xff9d64];
  spots.forEach(([x, z], i) => {
    dummy.position.set(x, 0.08, z);
    dummy.rotation.set(0, Math.random() * 2, 0);
    dummy.scale.setScalar(0.8 + Math.random() * 0.7);
    dummy.updateMatrix();
    stems.setMatrixAt(i, dummy.matrix);
    dummy.position.y = 0.3;
    dummy.scale.setScalar(0.7 + Math.random() * 0.8);
    dummy.updateMatrix();
    blooms.setMatrixAt(i, dummy.matrix);
    blooms.setColorAt(i, new THREE.Color(flowerColors[i % flowerColors.length]));
  });
  stems.castShadow = true;
  blooms.castShadow = true;
  root.add(stems, blooms);

  // scattered stones
  const scatter = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.36, 0.45), stoneMat, 14);
  for (let i = 0; i < 14; i++) {
    dummy.position.set(-14 + Math.random() * 28, 0.02, -8 + Math.random() * 16);
    dummy.rotation.set(Math.random(), Math.random() * 4, Math.random());
    dummy.scale.setScalar(0.5 + Math.random() * 0.8);
    dummy.updateMatrix();
    scatter.setMatrixAt(i, dummy.matrix);
  }
  scatter.castShadow = true;
  scatter.receiveShadow = true;
  root.add(scatter);

  // clouds
  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 1, emissive: 0xcdefff, emissiveIntensity: 0.22,
    transparent: true, opacity: 0.94
  });
  const cloudGeo = new RoundedBoxGeometry(1, 1, 1, 2, 0.12);
  const cloudSpots = [
    [-18, 18, -17, 1.2], [9, 21, -23, 1.5], [22, 17, -11, 1.0], [-3, 24, -29, 1.7],
    [-25, 20, -7, 1.2], [17, 23, -33, 1.3]
  ];
  for (const [cx, cy, cz, scale] of cloudSpots) {
    const cloud = new THREE.Group();
    const parts = 4 + ((Math.random() * 4) | 0);
    for (let i = 0; i < parts; i++) {
      const p = new THREE.Mesh(cloudGeo, cloudMat);
      p.position.set((Math.random() - 0.5) * 3.4, (Math.random() - 0.5) * 0.55, (Math.random() - 0.5) * 1.5);
      p.scale.set(1.2 + Math.random() * 1.7, 0.55 + Math.random() * 0.5, 0.8 + Math.random() * 1.1);
      p.castShadow = false;
      cloud.add(p);
    }
    cloud.position.set(cx, cy, cz);
    cloud.scale.setScalar(scale);
    cloud.userData.speed = 0.12 + Math.random() * 0.16;
    root.add(cloud);
    data.clouds.push(cloud);
  }

  // distant hills
  const hillMat = new THREE.MeshBasicMaterial({ color: 0x78b7a0, fog: true });
  const hillMat2 = new THREE.MeshBasicMaterial({ color: 0x5e9f91, fog: true });
  for (let i = 0; i < 7; i++) {
    const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 10), i % 2 ? hillMat : hillMat2);
    hill.scale.set(8 + Math.random() * 8, 3.2 + Math.random() * 3, 5 + Math.random() * 4);
    hill.position.set(-34 + i * 12, -5.5, -38 - Math.random() * 15);
    root.add(hill);
  }

  // sun
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture('rgba(255,249,213,1)', 'rgba(255,238,164,0)'),
    color: 0xfff3c1, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false
  }));
  sunSprite.position.set(22, 25, -34);
  sunSprite.scale.set(18, 18, 1);
  root.add(sunSprite);

  // hand-painted sign by the path
  const signCanvas = document.createElement('canvas');
  signCanvas.width = 512; signCanvas.height = 256;
  const sctx = signCanvas.getContext('2d');
  sctx.fillStyle = '#7c5433';
  sctx.fillRect(0, 0, 512, 256);
  for (let y = 0; y < 256; y += 42) {
    sctx.fillStyle = y % 84 ? '#8b613c' : '#6f4a2d';
    sctx.fillRect(0, y, 512, 2);
  }
  sctx.fillStyle = '#5a3b22';
  sctx.fillRect(12, 12, 488, 232);
  sctx.fillStyle = '#b98954';
  sctx.fillRect(20, 20, 472, 216);
  sctx.fillStyle = '#5f3f27';
  sctx.font = '900 52px Nunito, sans-serif';
  sctx.textAlign = 'center';
  sctx.fillText('BLOCKHAVEN', 256, 96);
  sctx.font = '800 27px Nunito, sans-serif';
  sctx.fillStyle = '#7a5734';
  sctx.fillText('DREAM COTTAGE', 256, 145);
  sctx.font = '700 21px Nunito, sans-serif';
  sctx.fillStyle = '#947046';
  sctx.fillText('STACK  ·  CLEAR  ·  BUILD', 256, 187);
  sctx.strokeStyle = '#d4aa70';
  sctx.lineWidth = 4;
  sctx.strokeRect(30, 30, 452, 196);
  const signTex = new THREE.CanvasTexture(signCanvas);
  signTex.colorSpace = THREE.SRGBColorSpace;
  const signMat = new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.86 });
  const signGroup = new THREE.Group();
  signGroup.position.set(11.05, 0, 7.1);
  signGroup.rotation.y = -0.42;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 1.35), signMat);
  sign.position.set(0, 1.9, 0);
  signGroup.add(sign);
  const signBack = new THREE.Mesh(new THREE.BoxGeometry(2.9, 1.5, 0.14), new THREE.MeshStandardMaterial({ map: textures.spruce, roughness: 0.9 }));
  signBack.position.set(0, 1.9, 0.06);
  signBack.castShadow = true;
  signGroup.add(signBack);
  for (const x of [-1.05, 1.05]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.6, 0.14), new THREE.MeshStandardMaterial({ map: textures.spruce, roughness: 0.9 }));
    post.position.set(x, 0.85, 0.12);
    post.castShadow = true;
    signGroup.add(post);
  }
  root.add(signGroup);

  // fireflies
  const count = 48;
  const fpos = new Float32Array(count * 3);
  const bases = [];
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 3 + Math.random() * 9;
    const x = 6 + Math.cos(a) * r;
    const z = 1 + Math.sin(a) * r * 0.6;
    const y = 0.6 + Math.random() * 3.4;
    bases.push([x, y, z, Math.random() * Math.PI * 2]);
    fpos[i * 3] = x; fpos[i * 3 + 1] = y; fpos[i * 3 + 2] = z;
  }
  const fgeo = new THREE.BufferGeometry();
  fgeo.setAttribute('position', new THREE.BufferAttribute(fpos, 3));
  const fmat = new THREE.PointsMaterial({
    color: 0xd9ff9b, size: 0.11, map: makeGlowTexture(), transparent: true,
    opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending
  });
  const fireflies = new THREE.Points(fgeo, fmat);
  fireflies.userData.bases = bases;
  fireflies.frustumCulled = false;
  root.add(fireflies);
  data.fireflies = fireflies;

  // a few warm garden lamps
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffd06b, emissive: 0xffaa2e, emissiveIntensity: 2.1, roughness: 0.4 });
  for (const [x, z] of [[4.6, 5.2], [7.7, 5.2]]) {
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.6, 0.1), new THREE.MeshStandardMaterial({ map: textures.spruce, roughness: 0.9 }));
    pole.position.set(x, 0.7, z);
    pole.castShadow = true;
    root.add(pole);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 0.22), lampMat);
    lamp.position.set(x, 1.55, z);
    root.add(lamp);
  }

  return data;
}

function updateEnvironment(dt, time) {
  for (const cloud of env.clouds) {
    cloud.position.x += cloud.userData.speed * dt;
    if (cloud.position.x > 28) cloud.position.x = -28;
  }
  if (env.waterMat) {
    env.waterMat.map.offset.x = time * 0.012;
    env.waterMat.map.offset.y = time * 0.008;
    env.waterMat.emissiveIntensity = 0.16 + Math.sin(time * 1.4) * 0.03;
  }
  if (env.fireflies) {
    const pos = env.fireflies.geometry.attributes.position;
    const bases = env.fireflies.userData.bases;
    for (let i = 0; i < bases.length; i++) {
      const [x, y, z, phase] = bases[i];
      pos.array[i * 3] = x + Math.sin(time * 0.35 + phase) * 0.35;
      pos.array[i * 3 + 1] = y + Math.sin(time * 0.7 + phase * 2) * 0.35;
      pos.array[i * 3 + 2] = z + Math.cos(time * 0.3 + phase) * 0.3;
    }
    pos.needsUpdate = true;
  }
}

// ---------- board visuals ----------
function makeBackdropTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#163b32');
  g.addColorStop(0.5, '#0c2b24');
  g.addColorStop(1, '#071d18');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 110; i++) {
    ctx.fillStyle = `rgba(130,235,205,${Math.random() * 0.05})`;
    ctx.fillRect((Math.random() * 128) | 0, (Math.random() * 256) | 0, 1, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildBoardWell() {
  const backMat = new THREE.MeshStandardMaterial({
    map: makeBackdropTexture(), color: 0xffffff, roughness: 0.58, metalness: 0.18,
    emissive: 0x0b352b, emissiveIntensity: 0.8
  });
  const back = new THREE.Mesh(new THREE.BoxGeometry(W + 0.65, H + 0.7, 0.34), backMat);
  back.position.set(0, H / 2, -0.78);
  back.receiveShadow = true;
  boardGroup.add(back);

  // grid lines
  const points = [];
  const halfW = W / 2;
  for (let x = 0; x <= W; x++) {
    points.push(x - halfW, 0, -0.585, x - halfW, H, -0.585);
  }
  for (let y = 0; y <= H; y++) {
    points.push(-halfW, y, -0.585, halfW, y, -0.585);
  }
  const gridGeo = new THREE.BufferGeometry();
  gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  const grid = new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({
    color: 0x79e2c5, transparent: true, opacity: 0.13, depthWrite: false
  }));
  boardGroup.add(grid);

  const frameMat = new THREE.MeshStandardMaterial({ map: textures.spruce, roughness: 0.86 });
  const stoneMat = new THREE.MeshStandardMaterial({ map: textures.stone, roughness: 0.9 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x102b23, roughness: 0.6, metalness: 0.15 });
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0xa9ffc7, emissive: 0x63e6a4, emissiveIntensity: 1.6, roughness: 0.35
  });

  const railGeo = new THREE.BoxGeometry(0.52, H + 1.5, 0.92);
  for (const x of [-W / 2 - 0.56, W / 2 + 0.56]) {
    const rail = new THREE.Mesh(railGeo, frameMat);
    rail.position.set(x, H / 2, -0.28);
    rail.castShadow = true;
    rail.receiveShadow = true;
    boardGroup.add(rail);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.055, H + 0.2, 0.06), glowMat);
    strip.position.set(x + (x < 0 ? 0.3 : -0.3), H / 2, 0.19);
    boardGroup.add(strip);
  }
  const topRail = new THREE.Mesh(new THREE.BoxGeometry(W + 1.65, 0.52, 0.92), frameMat);
  topRail.position.set(0, H + 0.35, -0.28);
  topRail.castShadow = true;
  boardGroup.add(topRail);
  const bottomRail = new THREE.Mesh(new THREE.BoxGeometry(W + 1.65, 0.42, 1.1), frameMat);
  bottomRail.position.set(0, -0.22, -0.15);
  bottomRail.castShadow = true;
  boardGroup.add(bottomRail);

  const plinth = new THREE.Mesh(new THREE.BoxGeometry(W + 2.5, 0.75, 2.4), stoneMat);
  plinth.position.set(0, -0.65, 0);
  plinth.receiveShadow = true;
  plinth.castShadow = true;
  boardGroup.add(plinth);
  const plinthTop = new THREE.Mesh(new THREE.BoxGeometry(W + 2.0, 0.16, 2.1), new THREE.MeshStandardMaterial({ map: textures.cobble, roughness: 0.95 }));
  plinthTop.position.set(0, -0.23, 0);
  plinthTop.receiveShadow = true;
  boardGroup.add(plinthTop);

  const boardLight = new THREE.PointLight(0x74ffcf, 1.4, 15, 2);
  boardLight.position.set(0, 8, 3.5);
  boardLight.layers.set(1);
  boardGroup.add(boardLight);
  const boardLight2 = new THREE.PointLight(0xffb15c, 0.5, 12, 2);
  boardLight2.position.set(4, 2, 3);
  boardLight2.layers.set(1);
  boardGroup.add(boardLight2);

  // little rune lights on frame
  for (let i = 0; i < 7; i++) {
    for (const x of [-W / 2 - 0.56, W / 2 + 0.56]) {
      const rune = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), glowMat);
      rune.position.set(x, 2 + i * 2.25, 0.23);
      boardGroup.add(rune);
    }
  }
}

// ---------- board block meshes ----------
const blockGeo = new RoundedBoxGeometry(0.92, 0.92, 0.92, 2, 0.055);
const boardMeshes = {};
for (const type of Object.keys(PIECE_COLORS)) {
  const mesh = new THREE.InstancedMesh(blockGeo, pieceMats[type], W * H);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  boardGroup.add(mesh);
  boardMeshes[type] = mesh;
}

const activeGroup = new THREE.Group();
boardGroup.add(activeGroup);
const activeMeshes = [];
for (let i = 0; i < 4; i++) {
  const m = new THREE.Mesh(blockGeo, pieceMats.I);
  m.castShadow = true;
  m.receiveShadow = true;
  m.visible = false;
  activeGroup.add(m);
  activeMeshes.push(m);
}

const ghostMat = new THREE.MeshBasicMaterial({
  color: 0x9bffe1, transparent: true, opacity: 0.11, depthWrite: false
});
const ghostLineMat = new THREE.LineBasicMaterial({
  color: 0xb6ffeb, transparent: true, opacity: 0.45, depthWrite: false
});
const ghostGeo = new THREE.BoxGeometry(0.95, 0.95, 0.95);
const ghostEdges = new THREE.EdgesGeometry(ghostGeo);
const ghostMeshes = [];
for (let i = 0; i < 4; i++) {
  const g = new THREE.Group();
  const face = new THREE.Mesh(ghostGeo, ghostMat);
  const line = new THREE.LineSegments(ghostEdges, ghostLineMat);
  g.add(face, line);
  g.visible = false;
  activeGroup.add(g);
  ghostMeshes.push(g);
}

// ---------- particles ----------
function makeGlowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 1, 32, 32, 31);
  g.addColorStop(0, inner);
  g.addColorStop(0.35, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const glowTexture = makeGlowTexture();

class ParticleField {
  constructor(scene, max, opts = {}) {
    this.max = max;
    this.parts = [];
    this.cursor = 0;
    const pos = new Float32Array(max * 3);
    const col = new Float32Array(max * 3);
    for (let i = 0; i < max; i++) pos[i * 3 + 1] = -999;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.geometry = geo;
    const mat = new THREE.PointsMaterial({
      size: opts.size ?? 0.16,
      map: opts.map ?? glowTexture,
      vertexColors: true,
      transparent: true,
      opacity: opts.opacity ?? 1,
      depthWrite: false,
      blending: opts.blending ?? THREE.AdditiveBlending,
      sizeAttenuation: true
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this.gravity = opts.gravity ?? -5;
    this.drag = opts.drag ?? 0.985;
  }

  burst(position, color, count = 22, opts = {}) {
    const speed = opts.speed ?? 3.2;
    const life = opts.life ?? 0.9;
    const spread = opts.spread ?? 0.3;
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const idx = this.cursor++ % this.max;
      const p = this.parts[idx] || (this.parts[idx] = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, max: 1, color: new THREE.Color() });
      p.pos.copy(position).add(new THREE.Vector3((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread));
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const s = speed * (0.35 + Math.random() * 0.8);
      p.vel.set(Math.sin(phi) * Math.cos(theta) * s, Math.cos(phi) * s * 0.8 + (opts.up ?? 1.4), Math.sin(phi) * Math.sin(theta) * s);
      p.life = p.max = life * (0.6 + Math.random() * 0.7);
      p.color.copy(c).offsetHSL((Math.random() - 0.5) * 0.06, 0, (Math.random() - 0.5) * 0.16);
      p.gravity = opts.gravity ?? this.gravity;
    }
  }

  update(dt) {
    const pos = this.geometry.attributes.position.array;
    const col = this.geometry.attributes.color.array;
    for (let i = 0; i < this.max; i++) {
      const p = this.parts[i];
      if (!p || p.life <= 0) {
        pos[i * 3 + 1] = -999;
        col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0;
        continue;
      }
      p.life -= dt;
      p.vel.y += p.gravity * dt;
      p.vel.multiplyScalar(Math.pow(this.drag, dt * 60));
      p.pos.addScaledVector(p.vel, dt);
      const t = clamp(p.life / p.max, 0, 1);
      pos[i * 3] = p.pos.x;
      pos[i * 3 + 1] = p.pos.y;
      pos[i * 3 + 2] = p.pos.z;
      col[i * 3] = p.color.r * t;
      col[i * 3 + 1] = p.color.g * t;
      col[i * 3 + 2] = p.color.b * t;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }
}

const sparks = new ParticleField(scene, 650, { size: 0.18, blending: THREE.AdditiveBlending });
const confetti = new ParticleField(scene, 700, { size: 0.23, blending: THREE.AdditiveBlending, gravity: -4.2, drag: 0.975 });
const smoke = new ParticleField(scene, 150, {
  size: 0.75, map: glowTexture, blending: THREE.AdditiveBlending, opacity: 0.22, gravity: 0.25, drag: 0.992
});

// ---------- attract / game state ----------
const state = {
  status: 'menu',
  cells: Array.from({ length: H }, () => Array(W).fill(null)),
  piece: null,
  queue: [],
  bag: [],
  hold: null,
  canHold: true,
  score: 0,
  level: 1,
  lines: 0,
  buildStage: -1,
  combo: 0,
  bestCombo: 0,
  dropTimer: 0,
  lockTimer: 0,
  clearing: false,
  clearRows: [],
  clearTimer: 0,
  clearStart: 0,
  celebrated: false,
  shake: 0,
  shakeTime: 0,
  lastTime: performance.now() / 1000
};

const sound = new Soundscape();
window.__bh = { scene, camera, renderer, cottage, state, boardGroup, env };

function updateBoard(now = performance.now() / 1000) {
  const counts = {};
  for (const type of Object.keys(PIECE_COLORS)) counts[type] = 0;
  const dummy = new THREE.Object3D();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const cell = state.cells[y][x];
      if (!cell) continue;
      const type = cell.type;
      let scale = 1;
      let lift = 0;
      let spin = 0;
      if (cell.clearStart != null) {
        const t = clamp((now - cell.clearStart) / 0.34, 0, 1);
        scale = 1 - t * 0.94;
        lift = t * 0.9;
        spin = t * 1.5;
      }
      dummy.position.set(x - (W - 1) / 2, y + 0.5 + lift, 0);
      dummy.rotation.set(0, spin, 0);
      dummy.scale.setScalar(scale * 0.995);
      dummy.updateMatrix();
      const idx = counts[type]++;
      boardMeshes[type].setMatrixAt(idx, dummy.matrix);
    }
  }
  for (const type of Object.keys(PIECE_COLORS)) {
    boardMeshes[type].count = counts[type];
    boardMeshes[type].instanceMatrix.needsUpdate = true;
  }
}

function updateActive() {
  const p = state.piece;
  for (const m of activeMeshes) m.visible = false;
  for (const g of ghostMeshes) g.visible = false;
  if (!p) return;
  const shape = SHAPES[p.type][p.rot];
  for (let i = 0; i < 4; i++) {
    const m = activeMeshes[i];
    m.visible = true;
    m.material = pieceMats[p.type];
    const [cx, cy] = shape.cells[i];
    m.position.set(p.x + cx - (W - 1) / 2, p.y + cy + 0.5, 0);
  }
  // ghost landing
  let gy = p.y;
  while (!collides(p.type, p.rot, p.x, gy - 1)) gy--;
  if (gy !== p.y) {
    for (let i = 0; i < 4; i++) {
      const g = ghostMeshes[i];
      g.visible = true;
      const [cx, cy] = shape.cells[i];
      g.position.set(p.x + cx - (W - 1) / 2, gy + cy + 0.5, 0);
    }
  }
}

function collides(type, rot, x, y) {
  const shape = SHAPES[type][rot];
  for (const [cx, cy] of shape.cells) {
    const bx = x + cx;
    const by = y + cy;
    if (bx < 0 || bx >= W || by < 0) return true;
    if (by < H && state.cells[by][bx]) return true;
  }
  return false;
}

function nextType() {
  if (!state.bag.length) {
    state.bag = Object.keys(PIECE_COLORS);
    for (let i = state.bag.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [state.bag[i], state.bag[j]] = [state.bag[j], state.bag[i]];
    }
  }
  return state.bag.pop();
}

function fillQueue() {
  while (state.queue.length < 4) state.queue.push(nextType());
}

function spawnPiece() {
  if (state.status !== 'playing') return;
  fillQueue();
  const type = state.queue.shift();
  fillQueue();
  const shape = SHAPES[type][0];
  const p = {
    type, rot: 0,
    x: Math.floor((W - shape.width) / 2),
    y: H - shape.height - 1
  };
  state.piece = p;
  state.canHold = true;
  state.dropTimer = 0;
  state.lockTimer = 0;
  updateActive();
  updateNextUI();
  updateHoldUI();
  if (collides(type, 0, p.x, p.y)) {
    state.piece = p;
    updateActive();
    endGame();
  }
}

function tryMove(dx, dy) {
  const p = state.piece;
  if (!p || state.clearing || state.status !== 'playing') return false;
  if (!collides(p.type, p.rot, p.x + dx, p.y + dy)) {
    p.x += dx;
    p.y += dy;
    state.lockTimer = 0;
    updateActive();
    return true;
  }
  return false;
}

function moveHorizontal(dir) {
  if (tryMove(dir, 0)) sound.move();
}

function rotatePiece(dir = 1) {
  const p = state.piece;
  if (!p || state.clearing || state.status !== 'playing') return;
  const nr = (p.rot + (dir > 0 ? 1 : 3)) % 4;
  const kicks = [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, 1], [0, -1]];
  for (const [kx, ky] of kicks) {
    if (!collides(p.type, nr, p.x + kx, p.y + ky)) {
      p.rot = nr;
      p.x += kx;
      p.y += ky;
      state.lockTimer = 0;
      updateActive();
      sound.rotate();
      return;
    }
  }
}

function softDrop() {
  if (state.status !== 'playing' || state.clearing) return;
  if (tryMove(0, -1)) {
    state.score += 1;
    updateHUD();
    sound.softDrop();
  }
}

function hardDrop() {
  const p = state.piece;
  if (!p || state.clearing || state.status !== 'playing') return;
  let distance = 0;
  while (tryMove(0, -1)) distance++;
  state.score += distance * 2;
  updateHUD();
  sound.hardDrop();
  addShake(0.16);
  lockPiece();
}

function holdPiece() {
  if (state.status !== 'playing' || state.clearing || !state.canHold) return;
  const p = state.piece;
  if (!p) return;
  const old = state.hold;
  state.hold = p.type;
  state.canHold = false;
  if (old) {
    const shape = SHAPES[old][0];
    state.piece = {
      type: old, rot: 0,
      x: Math.floor((W - shape.width) / 2),
      y: H - shape.height - 1
    };
    state.dropTimer = 0;
    state.lockTimer = 0;
    updateActive();
    if (collides(state.piece.type, 0, state.piece.x, state.piece.y)) endGame();
  } else {
    state.piece = null;
    spawnPiece();
    state.canHold = false;
  }
  sound.hold();
  updateHoldUI();
}

function lockPiece() {
  const p = state.piece;
  if (!p) return;
  const shape = SHAPES[p.type][p.rot];
  for (const [cx, cy] of shape.cells) {
    const bx = p.x + cx;
    const by = p.y + cy;
    if (by >= 0 && by < H && bx >= 0 && bx < W) state.cells[by][bx] = { type: p.type };
  }
  state.piece = null;
  updateActive();
  updateBoard();
  sound.lock();
  const rows = [];
  for (let y = 0; y < H; y++) {
    if (state.cells[y].every(c => c)) rows.push(y);
  }
  if (rows.length) {
    beginClear(rows);
  } else {
    state.combo = 0;
    spawnPiece();
  }
}

function beginClear(rows) {
  const now = performance.now() / 1000;
  state.clearing = true;
  state.clearRows = rows;
  state.clearTimer = 0;
  state.clearStart = now;
  state.combo++;
  state.bestCombo = Math.max(state.bestCombo, state.combo);
  const n = rows.length;
  const base = [0, 100, 300, 500, 800][n] || 800;
  const comboBonus = Math.max(0, state.combo - 1) * 50;
  const gained = (base + comboBonus) * state.level;
  state.score += gained;
  for (const y of rows) {
    for (let x = 0; x < W; x++) {
      const cell = state.cells[y][x];
      if (cell) cell.clearStart = now;
      const pos = new THREE.Vector3(x - (W - 1) / 2, y + 0.5, 0);
      boardGroup.localToWorld(pos);
      sparks.burst(pos, PIECE_COLORS[cell?.type || 'I'], 3, { speed: 2.4, life: 0.7, spread: 0.55, up: 1.1 });
    }
  }
  updateBoard(now);
  updateHUD();
  showCombo(n, gained);
  addShake(0.3);
  sound.clear(n);
}

function finishClear() {
  const rows = state.clearRows.slice().sort((a, b) => b - a);
  for (const y of rows) state.cells.splice(y, 1);
  while (state.cells.length < H) state.cells.unshift(Array(W).fill(null));
  state.lines += rows.length;
  state.level = 1 + Math.floor(state.lines / 5);
  state.buildStage = Math.min(11, state.lines - 1);
  state.clearing = false;
  state.clearRows = [];
  state.clearTimer = 0;
  updateBoard();
  updateHUD();
  const stage = Math.min(11, state.buildStage);
  if (stage >= 0) {
    const before = cottage.stage;
    cottage.setStage(stage, performance.now() / 1000);
    if (cottage.stage > before) {
      const p = cottage.getCenter();
      sparks.burst(p, '#c8ff7a', 40, { speed: 4.2, life: 1.4, spread: 2.2, up: 2.2 });
      sound.build();
      toast(`Stage ${stage + 1} · ${STAGES[stage].name}`);
      pulseBuild();
    }
  }
  if (state.lines >= 12 && !state.celebrated) {
    state.celebrated = true;
    setTimeout(celebrate, 900);
  } else {
    spawnPiece();
  }
}

function addShake(amount) {
  state.shake = Math.max(state.shake, amount);
  state.shakeTime = 0.3;
}

// ---------- HUD ----------
function formatNumber(n) {
  return n.toLocaleString('en-US');
}

function updateHUD() {
  ui.score.textContent = formatNumber(state.score);
  ui.level.textContent = state.level;
  ui.lines.textContent = state.lines;
  const stage = Math.max(0, state.buildStage);
  const pct = state.buildStage < 0 ? 0 : Math.round(((stage + 1) / 12) * 100);
  ui.buildPct.textContent = pct + '%';
  ui.buildBar.style.width = pct + '%';
  const s = STAGES[Math.max(0, stage)];
  ui.stageName.textContent = state.buildStage < 0 ? 'Breaking ground' : s.name;
  ui.stageSub.textContent = state.buildStage < 0 ? 'Clear lines to raise the cottage' : s.sub;
  const pips = ui.buildPips.children;
  for (let i = 0; i < pips.length; i++) pips[i].classList.toggle('on', i <= state.buildStage);
}

function buildPips() {
  ui.buildPips.innerHTML = '';
  for (let i = 0; i < 12; i++) ui.buildPips.appendChild(document.createElement('i'));
}

function miniPiece(type, empty = false) {
  const el = document.createElement('div');
  el.className = 'mini-piece' + (empty ? ' hold-empty' : '');
  const cells = [];
  for (let i = 0; i < 16; i++) cells.push(document.createElement('i'));
  if (type) {
    const shape = SHAPES[type][0];
    const offX = Math.floor((4 - shape.width) / 2);
    const offY = Math.floor((4 - shape.height) / 2);
    for (const [x, y] of shape.cells) {
      const idx = (y + offY) * 4 + (x + offX);
      const cell = cells[idx];
      if (cell) {
        cell.classList.add('fill');
        cell.style.background = PIECE_COLORS[type];
        cell.style.boxShadow = `inset 0 -2px 0 rgba(0,0,0,.24), inset 0 1px 0 rgba(255,255,255,.4), 0 0 10px ${PIECE_COLORS[type]}44`;
      }
    }
  }
  for (const c of cells) el.appendChild(c);
  return el;
}

function updateNextUI() {
  ui.nextGrid.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const type = state.queue[i];
    if (type) ui.nextGrid.appendChild(miniPiece(type));
  }
}

function updateHoldUI() {
  ui.holdGrid.innerHTML = '';
  const type = state.hold;
  const el = miniPiece(type, !type);
  ui.holdGrid.classList.toggle('hold-empty', !type);
  for (const c of el.children) ui.holdGrid.appendChild(c.cloneNode(true));
  ui.holdPanel.classList.toggle('empty', !type);
}

function toast(text) {
  ui.toastText.textContent = text;
  ui.toast.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => ui.toast.classList.remove('show'), 2100);
}

function showCombo(n, gained) {
  const names = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS!'];
  ui.comboText.textContent = names[n] || 'MEGA CLEAR';
  ui.comboSub.textContent = `+${formatNumber(gained)}`;
  ui.comboPop.classList.remove('show');
  void ui.comboPop.offsetWidth;
  ui.comboPop.classList.add('show');
  clearTimeout(showCombo._t);
  showCombo._t = setTimeout(() => ui.comboPop.classList.remove('show'), 1050);
}

function pulseBuild() {
  ui.buildBar.animate(
    [{ filter: 'brightness(1)' }, { filter: 'brightness(1.8)' }, { filter: 'brightness(1)' }],
    { duration: 650, easing: 'ease-out' }
  );
}

function updateCamera(dt, time) {
  const portrait = window.innerHeight > window.innerWidth * 1.05 && window.innerWidth < 1000;
  const menu = state.status === 'menu';
  let pos, target, fov;
  if (menu) {
    if (portrait) {
      pos = new THREE.Vector3(6.7 + Math.sin(time * 0.25) * 0.4, 9.2, 31);
      target = new THREE.Vector3(6.15, 4.4, -1.2);
      fov = 38;
    } else {
      pos = new THREE.Vector3(12.5 + Math.sin(time * 0.25) * 0.6, 9.6, 25.5);
      target = new THREE.Vector3(5.8, 4.2, -1.4);
      fov = 36;
    }
  } else if (portrait) {
    pos = new THREE.Vector3(BOARD_X, 14.5, 43);
    target = new THREE.Vector3(BOARD_X, 8.8, 0);
    fov = 38;
  } else {
    pos = new THREE.Vector3(-2.5, 15.5, 39.5);
    target = new THREE.Vector3(0.7, 8.4, 0);
    fov = 36;
  }
  const k = 1 - Math.exp(-4.2 * dt);
  camera.position.lerp(pos, k);
  camera.userData.target = camera.userData.target || target.clone();
  camera.userData.target.lerp(target, k);
  camera.fov = lerp(camera.fov, fov, k);
  camera.updateProjectionMatrix();
  const look = camera.userData.target.clone();
  if (state.shake > 0.001) {
    const s = state.shake;
    look.x += (Math.random() - 0.5) * s;
    look.y += (Math.random() - 0.5) * s * 0.6;
    camera.position.x += (Math.random() - 0.5) * s * 0.3;
  }
  camera.lookAt(look);
}

// ---------- game lifecycle ----------
function startGame() {
  sound.unlock();
  sound.click();
  document.body.classList.add('in-game');
  ui.menu.classList.add('hidden');
  ui.pause.classList.add('hidden');
  ui.gameover.classList.add('hidden');
  ui.win.classList.add('hidden');
  state.status = 'playing';
  boardGroup.visible = true;
  state.cells = Array.from({ length: H }, () => Array(W).fill(null));
  state.piece = null;
  state.queue = [];
  state.bag = [];
  state.hold = null;
  state.canHold = true;
  state.score = 0;
  state.level = 1;
  state.lines = 0;
  state.combo = 0;
  state.bestCombo = 0;
  state.buildStage = -1;
  state.dropTimer = 0;
  state.lockTimer = 0;
  state.clearing = false;
  state.clearRows = [];
  state.clearTimer = 0;
  state.celebrated = false;
  state.shake = 0;
  cottage.reset();
  updateBoard();
  updateActive();
  updateHUD();
  updateHoldUI();
  fillQueue();
  spawnPiece();
  toast('Clear lines to raise your cottage');
}

function endGame() {
  if (state.status !== 'playing') return;
  state.status = 'gameover';
  sound.gameOver();
  state.piece = null;
  updateActive();
  ui.gameOverPct.textContent = (state.buildStage < 0 ? 0 : Math.round(((state.buildStage + 1) / 12) * 100)) + '%';
  ui.finalScore.textContent = formatNumber(state.score);
  ui.finalLines.textContent = state.lines;
  ui.finalLevel.textContent = state.level;
  ui.gameover.classList.remove('hidden');
}

function celebrate() {
  if (state.status !== 'playing') return;
  state.status = 'won';
  sound.win();
  ui.winScore.textContent = formatNumber(state.score);
  ui.winLines.textContent = state.lines;
  ui.winCombo.textContent = state.bestCombo;
  ui.win.classList.remove('hidden');
  const center = cottage.getCenter();
  for (let i = 0; i < 7; i++) {
    setTimeout(() => {
      const p = center.clone().add(new THREE.Vector3((Math.random() - 0.5) * 9, Math.random() * 6, (Math.random() - 0.5) * 7));
      confetti.burst(p, ['#ffd166', '#b8f36b', '#79eee2', '#ff8b6a', '#ffffff'][i % 5], 90, { speed: 5, life: 2.8, spread: 0.4, up: 2.6, gravity: -2.2 });
    }, i * 170);
  }
}

function togglePause(force) {
  if (state.status === 'playing') {
    state.status = 'paused';
    ui.pause.classList.remove('hidden');
  } else if (state.status === 'paused' && force !== true) {
    state.status = 'playing';
    ui.pause.classList.add('hidden');
    state.lastTime = performance.now() / 1000;
  }
}

// ---------- touch / keyboard ----------
const touchState = { startX: 0, startY: 0, moved: false, down: false, lastMove: 0, lastDrop: 0, startTime: 0 };

canvas.addEventListener('pointerdown', (e) => {
  if (state.status !== 'playing') return;
  canvas.setPointerCapture?.(e.pointerId);
  touchState.down = true;
  touchState.startX = e.clientX;
  touchState.startY = e.clientY;
  touchState.moved = false;
  touchState.startTime = performance.now();
  touchState.lastMove = e.clientX;
  touchState.lastDrop = e.clientY;
});

canvas.addEventListener('pointermove', (e) => {
  if (!touchState.down || state.status !== 'playing') return;
  const dx = e.clientX - touchState.lastMove;
  const dy = e.clientY - touchState.lastDrop;
  if (Math.abs(dx) > 26) {
    moveHorizontal(Math.sign(dx));
    touchState.lastMove = e.clientX;
    touchState.moved = true;
  }
  if (dy > 30) {
    softDrop();
    touchState.lastDrop = e.clientY;
    touchState.moved = true;
  }
  if (dy < -36) {
    hardDrop();
    touchState.down = false;
    touchState.moved = true;
  }
});

canvas.addEventListener('pointerup', (e) => {
  if (!touchState.down) return;
  touchState.down = false;
  if (state.status !== 'playing') return;
  const dt = performance.now() - touchState.startTime;
  const dist = Math.hypot(e.clientX - touchState.startX, e.clientY - touchState.startY);
  if (!touchState.moved && dist < 18 && dt < 320) rotatePiece(1);
});

canvas.addEventListener('pointercancel', () => { touchState.down = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// buttons with hold repeat
const repeatTimers = new Map();
for (const btn of document.querySelectorAll('[data-action]')) {
  const action = btn.dataset.action;
  const fire = () => {
    if (state.status !== 'playing') return;
    if (action === 'left') moveHorizontal(-1);
    else if (action === 'right') moveHorizontal(1);
    else if (action === 'rotate') rotatePiece(1);
    else if (action === 'down') softDrop();
    else if (action === 'drop') hardDrop();
    else if (action === 'hold') holdPiece();
  };
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    sound.unlock();
    btn.classList.add('pressed');
    fire();
    if (action === 'left' || action === 'right' || action === 'down') {
      const timer = setTimeout(() => {
        const iv = setInterval(fire, action === 'down' ? 55 : 85);
        repeatTimers.set(btn, iv);
      }, 260);
      repeatTimers.set(btn, timer);
    }
  });
  const clear = () => {
    btn.classList.remove('pressed');
    const t = repeatTimers.get(btn);
    if (t) { clearTimeout(t); clearInterval(t); repeatTimers.delete(btn); }
  };
  btn.addEventListener('pointerup', clear);
  btn.addEventListener('pointercancel', clear);
  btn.addEventListener('pointerleave', clear);
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (state.status === 'menu' || state.status === 'gameover')) {
    if (state.status === 'menu') startGame(); else startGame();
    return;
  }
  if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
    if (state.status === 'playing' || state.status === 'paused') togglePause();
    return;
  }
  if (state.status !== 'playing') return;
  const k = e.key;
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') { e.preventDefault(); moveHorizontal(-1); }
  else if (k === 'ArrowRight' || k === 'd' || k === 'D') { e.preventDefault(); moveHorizontal(1); }
  else if (k === 'ArrowDown' || k === 's' || k === 'S') { e.preventDefault(); softDrop(); }
  else if (k === 'ArrowUp' || k === 'w' || k === 'W' || k === 'x' || k === 'X') { e.preventDefault(); rotatePiece(1); }
  else if (k === 'z' || k === 'Z') { e.preventDefault(); rotatePiece(-1); }
  else if (k === ' ') { e.preventDefault(); hardDrop(); }
  else if (k === 'c' || k === 'C' || k === 'Shift') { e.preventDefault(); holdPiece(); }
});

ui.soundBtn.addEventListener('click', () => {
  sound.unlock();
  sound.setMuted(!sound.muted);
  document.body.classList.toggle('muted', sound.muted);
});
ui.pauseBtn.addEventListener('click', () => togglePause());
$('playBtn').addEventListener('click', startGame);
$('resumeBtn').addEventListener('click', () => togglePause());
$('restartFromPause').addEventListener('click', () => { ui.pause.classList.add('hidden'); startGame(); });
$('retryBtn').addEventListener('click', startGame);
$('winBtn').addEventListener('click', startGame);
$('keepBtn').addEventListener('click', () => {
  ui.win.classList.add('hidden');
  state.status = 'playing';
  state.lastTime = performance.now() / 1000;
  spawnPiece();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.status === 'playing') togglePause(true);
});

// ---------- resize ----------
function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, softwareGL ? 1 : 2));
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);

// ---------- attract setup ----------
buildPips();
updateHUD();
updateHoldUI();
fillQueue();
updateNextUI();
// Show the cottage under construction behind the menu.
cottage.setStage(11, performance.now() / 1000 + 0.3);
// A little decorative stack so the well feels alive.
for (let y = 0; y < 3; y++) {
  for (let x = 0; x < W; x++) {
    if ((x === 1 && y === 0) || (x === 7 && y === 2) || (x === 4 && y === 1)) continue;
    state.cells[y][x] = { type: Object.keys(PIECE_COLORS)[(x + y * 3) % 7] };
  }
}
state.piece = { type: 'T', rot: 0, x: 3, y: 10 };
updateBoard();
updateActive();

// ---------- main loop ----------
const clock = new THREE.Clock();
let elapsed = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;
  const now = performance.now() / 1000;

  if (state.status === 'playing' && !state.clearing && state.piece) {
    const interval = Math.max(0.1, 0.82 - (state.level - 1) * 0.085);
    state.dropTimer += dt;
    if (state.dropTimer >= interval) {
      state.dropTimer = 0;
      if (!tryMove(0, -1)) state.lockTimer += interval;
    }
    if (!collides(state.piece.type, state.piece.rot, state.piece.x, state.piece.y - 1)) {
      state.lockTimer = 0;
    } else {
      state.lockTimer += dt;
      if (state.lockTimer > 0.44) lockPiece();
    }
  }
  if (state.clearing) {
    state.clearTimer += dt;
    if (state.clearTimer > 0.35) finishClear();
    updateBoard(now);
  }

  if (state.shakeTime > 0) {
    state.shakeTime -= dt;
    state.shake = Math.max(0, state.shake * Math.pow(0.02, dt));
  }

  cottage.update(dt, now);
  sparks.update(dt);
  confetti.update(dt);
  updateSmoke(dt, now);
  updateEnvironment(dt, elapsed);
  updateCamera(dt, elapsed);

  renderer.render(scene, camera);

  const portrait = window.innerHeight > window.innerWidth * 1.05 && window.innerWidth < 1000;
  if (portrait && document.body.classList.contains('in-game')) {
    const rect = ui.camWindow.getBoundingClientRect();
    if (rect.width > 4 && rect.height > 4) {
      const c = cottage.group.position;
      const center = new THREE.Vector3(c.x, 3.9, c.z);
      previewCamera.position.set(c.x + 8.8, 7.6, c.z + 11.6);
      previewCamera.lookAt(center);
      previewCamera.aspect = rect.width / rect.height;
      previewCamera.updateProjectionMatrix();
      renderer.setScissorTest(true);
      renderer.setViewport(rect.left, window.innerHeight - rect.bottom, rect.width, rect.height);
      renderer.setScissor(rect.left, window.innerHeight - rect.bottom, rect.width, rect.height);
      renderer.render(scene, previewCamera);
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
    }
  }
}

function updateSmoke(dt, now) {
  if (cottage.stage < 8) return;
  if (!updateSmoke._t || now - updateSmoke._t > 0.14) {
    updateSmoke._t = now;
    const origin = cottage.getSmokeOrigin();
    smoke.burst(origin, Math.random() < 0.5 ? '#e9efe6' : '#c9d2c6', 1, {
      speed: 0.12, life: 3.2, spread: 0.18, up: 0.45, gravity: 0.22
    });
  }
}

frame();
