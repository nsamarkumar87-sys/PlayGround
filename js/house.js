import * as THREE from 'three';
import { RoundedBoxGeometry } from '../vendor/RoundedBoxGeometry.js';

export const STAGES = [
  { name: 'Breaking ground', sub: 'Stone foundation laid' },
  { name: 'Oak floor', sub: 'Solid planks underfoot' },
  { name: 'Front frame', sub: 'The cottage takes shape' },
  { name: 'Side walls', sub: 'Room to call your own' },
  { name: 'Upper walls', sub: 'Windows framed in timber' },
  { name: 'Door & glass', sub: 'Light spills inside' },
  { name: 'Roofline', sub: 'A proper shelter' },
  { name: 'Shingles', sub: 'Warm terracotta overhead' },
  { name: 'Chimney', sub: 'Ready for a fire' },
  { name: 'Cozy porch', sub: 'Somewhere to sit' },
  { name: 'Garden', sub: 'Flowers at the fence' },
  { name: 'Homecoming', sub: 'Lanterns lit — welcome home' }
];

const CELL = 0.78;
const BASE_Y = 0.05;

const MAT_DEFS = {
  cobble: { tex: 'cobble', roughness: 0.92 },
  stone: { tex: 'stone', roughness: 0.95 },
  oak: { tex: 'oak', roughness: 0.84 },
  oakLight: { tex: 'oakLight', roughness: 0.82 },
  spruce: { tex: 'spruce', roughness: 0.88 },
  roof: { tex: 'roof', roughness: 0.78 },
  roofDark: { tex: 'roofDark', roughness: 0.8 },
  brick: { tex: 'brick', roughness: 0.88 },
  glass: { tex: 'glass', roughness: 0.08, transparent: true, opacity: 0.62, emissive: 0x4bc6c9, emissiveIntensity: 0.25 },
  door: { tex: 'door', roughness: 0.7 },
  leaves: { tex: 'leaves', roughness: 0.9 },
  leavesLight: { tex: 'leavesLight', roughness: 0.9 },
  lantern: { color: 0xffd166, emissive: 0xffb52e, emissiveIntensity: 1.8, roughness: 0.35 },
  flowerPink: { color: 0xff8fa8, emissive: 0xff477a, emissiveIntensity: 0.2, roughness: 0.75 },
  flowerYellow: { color: 0xffe16b, emissive: 0xffc21a, emissiveIntensity: 0.2, roughness: 0.75 }
};

function easeOutBack(t) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export class Cottage {
  constructor(scene, textures, position = { x: 6.15, z: -1.35 }) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.position.set(position.x, 0, position.z);
    scene.add(this.group);

    this.stage = -1;
    this.blocks = [];
    this.materials = {};
    this.instances = {};
    this.animating = [];
    this.clock = 0;
    this.winGlow = 0;

    this.geometry = new RoundedBoxGeometry(CELL * 0.95, CELL * 0.95, CELL * 0.95, 2, 0.055);
    this.ghostGeometry = new THREE.BoxGeometry(CELL * 0.94, CELL * 0.94, CELL * 0.94);

    for (const [key, def] of Object.entries(MAT_DEFS)) {
      const mat = new THREE.MeshStandardMaterial({
        color: def.color ?? 0xffffff,
        map: def.tex ? textures[def.tex] : null,
        roughness: def.roughness ?? 0.8,
        metalness: def.metalness ?? 0,
        transparent: def.transparent ?? false,
        opacity: def.opacity ?? 1,
        emissive: def.emissive ? new THREE.Color(def.emissive) : 0x000000,
        emissiveIntensity: def.emissiveIntensity ?? 0,
        depthWrite: def.transparent ? false : true
      });
      this.materials[key] = mat;
    }

    this.ghostMaterial = new THREE.MeshBasicMaterial({
      color: 0x8fffe6,
      transparent: true,
      opacity: 0.09,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    this.buildLayout();
    this.ghostMesh = new THREE.InstancedMesh(this.ghostGeometry, this.ghostMaterial, this.blocks.length);
    this.ghostMesh.frustumCulled = false;
    this.ghostMesh.renderOrder = 1;
    this.group.add(this.ghostMesh);
    this.ghostWireMaterial = new THREE.MeshBasicMaterial({
      color: 0x9bffe1, wireframe: true, transparent: true, opacity: 0.15, depthWrite: false
    });
    this.ghostWireMesh = new THREE.InstancedMesh(this.ghostGeometry, this.ghostWireMaterial, this.blocks.length);
    this.ghostWireMesh.frustumCulled = false;
    this.ghostWireMesh.renderOrder = 2;
    this.group.add(this.ghostWireMesh);
    this.createInstances();
    this.createScaffolding();
    this.createLight();
    this.updateGhost();

    this.dummy = new THREE.Object3D();
  }

  add(x, y, z, mat, stage, scale = 1, rot = 0) {
    this.blocks.push({
      x, y, z, mat, stage, scale, rot,
      built: false,
      animating: false,
      start: 0,
      index: 0,
      mesh: null,
      target: new THREE.Vector3(x * CELL, BASE_Y + y * CELL, z * CELL)
    });
  }

  buildLayout() {
    // 0 — foundation
    for (let x = -5; x <= 5; x++) for (let z = -4; z <= 3; z++) {
      this.add(x, 0, z, (x + z) % 3 === 0 ? 'stone' : 'cobble', 0);
    }
    // 1 — floor
    for (let x = -4; x <= 4; x++) for (let z = -3; z <= 2; z++) {
      this.add(x, 1, z, (x + z) % 4 === 0 ? 'oakLight' : 'oak', 1);
    }
    // 2 — front + back lower walls
    for (let x = -5; x <= 5; x++) {
      for (let y = 2; y <= 3; y++) {
        if (!(x === -1 || x === 0)) this.add(x, y, 3, Math.abs(x) === 5 ? 'spruce' : 'oak', 2);
        this.add(x, y, -4, Math.abs(x) === 5 ? 'spruce' : 'oak', 2);
      }
    }
    // 3 — side walls
    for (let z = -3; z <= 2; z++) for (let y = 2; y <= 3; y++) {
      this.add(-5, y, z, z % 3 === 0 ? 'spruce' : 'oak', 3);
      this.add(5, y, z, z % 3 === 0 ? 'spruce' : 'oak', 3);
    }
    // corner posts
    for (const x of [-5, 5]) for (const z of [-4, 3]) for (let y = 2; y <= 5; y++) {
      this.add(x, y, z, 'spruce', y <= 3 ? 3 : 4);
    }
    // 4 — upper walls, with door and window openings
    for (let y = 4; y <= 5; y++) {
      for (let x = -5; x <= 5; x++) {
        const door = y <= 4 && (x === -1 || x === 0);
        const frontWindow = (x === -4 || x === -3 || x === 2 || x === 3);
        if (!door && !frontWindow) this.add(x, y, 3, 'oak', 4);
        const backWindow = (x === -3 || x === -2 || x === 1 || x === 2);
        if (!backWindow) this.add(x, y, -4, 'oak', 4);
      }
      for (let z = -3; z <= 2; z++) {
        const sideWindow = z === -1 || z === 0;
        if (!sideWindow) {
          this.add(-5, y, z, 'oak', 4);
          this.add(5, y, z, 'oak', 4);
        }
      }
    }
    // 5 — door, glass, trim
    for (let y = 2; y <= 4; y++) for (const x of [-1, 0]) {
      this.add(x, y, 3, 'door', 5, 0.98);
    }
    this.add(-1, 4, 3.02, 'lantern', 5, 0.16);
    for (const x of [-4, -3, 2, 3]) for (let y = 4; y <= 5; y++) {
      this.add(x, y, 3, 'glass', 5, 0.96);
    }
    for (const x of [-3, -2, 1, 2]) for (let y = 4; y <= 5; y++) {
      this.add(x, y, -4, 'glass', 5, 0.96);
    }
    for (const z of [-1, 0]) for (let y = 4; y <= 5; y++) {
      this.add(-5, y, z, 'glass', 5, 0.96);
      this.add(5, y, z, 'glass', 5, 0.96);
    }
    // window trim
    for (const x of [-4, -3, 2, 3]) {
      this.add(x, 6, 3, 'spruce', 5, 1.02);
    }
    // 6 — roof base / eaves
    for (let x = -6; x <= 6; x++) for (let z = -5; z <= 4; z++) {
      this.add(x, 6, z, (x + z) % 5 === 0 ? 'roofDark' : 'roof', 6);
    }
    // 7 — stepped gable
    for (let x = -6; x <= 6; x++) {
      for (let z = -4; z <= 3; z++) this.add(x, 7, z, 'roof', 7);
      for (let z = -3; z <= 2; z++) this.add(x, 8, z, 'roof', 7);
      for (let z = -2; z <= 1; z++) this.add(x, 9, z, 'roof', 7);
    }
    // ridge trim
    for (let x = -6; x <= 6; x++) this.add(x, 9.6, 0, 'roofDark', 7, 0.4);
    // 8 — chimney
    for (let y = 6; y <= 10; y++) {
      this.add(3, y, -3, 'brick' in MAT_DEFS ? 'brick' : 'cobble', 8);
    }
    this.add(3, 11, -3, 'cobble', 8, 1.08);
    this.add(3, 11.4, -3, 'stone', 8, 0.7);
    // 9 — porch and steps
    for (let x = -2; x <= 1; x++) for (let z = 4; z <= 5; z++) {
      this.add(x, 1, z, 'oakLight', 9);
    }
    for (let x = -2; x <= 1; x++) {
      this.add(x, 0, 6, 'cobble', 9);
      this.add(x, 1, 6, 'cobble', 9);
    }
    for (const x of [-2, 1]) for (let y = 2; y <= 4; y++) {
      this.add(x, y, 5, 'spruce', 9);
    }
    for (let x = -2; x <= 1; x++) this.add(x, 5, 5, 'roof', 9);
    for (let x = -2; x <= 1; x++) this.add(x, 5, 4, 'roofDark', 9);
    // porch rails
    for (const x of [-2, 1]) {
      this.add(x, 1.6, 5.45, 'spruce', 9, 0.35);
      this.add(x, 2.4, 5.45, 'spruce', 9, 0.35);
    }
    // 10 — garden fence and flowers
    const fenceX = [-7, -6, -5, 5, 6, 7];
    for (const x of fenceX) {
      for (const z of [5, 6]) {
        this.add(x, 0.5, z, 'spruce', 10, 0.8);
        this.add(x, 1.5, z, 'spruce', 10, 0.65);
      }
    }
    for (let x = -7; x <= 7; x++) {
      if (x === -2 || x === -1 || x === 0 || x === 1) continue;
      this.add(x, 1.05, 6.2, 'spruce', 10, 0.35);
    }
    const flowers = [
      [-7, 5.4, 'flowerPink'], [-6, 5.5, 'flowerYellow'], [5.6, 5.3, 'flowerPink'],
      [6.6, 5.4, 'flowerYellow'], [-4.5, 5.5, 'flowerYellow'], [4.6, 5.4, 'flowerPink']
    ];
    for (const [x, z, mat] of flowers) {
      this.add(x, 0.7, z, mat, 10, 0.3);
      this.add(x, 0.38, z, 'leaves', 10, 0.4);
    }
    for (const x of [-7.5, 7.5]) {
      this.add(x, 1.2, 3.2, 'leaves', 10, 1.3);
      this.add(x, 2.0, 3.2, 'leavesLight', 10, 0.95);
    }
    // 11 — lanterns and finishing touches
    for (const x of [-2, 1]) {
      this.add(x, 4.1, 5.4, 'lantern', 11, 0.32);
    }
    for (const x of [-6.8, 6.8]) {
      this.add(x, 0.8, 6.2, 'lantern', 11, 0.24);
    }
    // welcome mat
    for (let x = -1; x <= 0; x++) for (let z = 4; z <= 5; z++) {
      this.add(x, 1.04, z, 'roofDark', 11, 0.98);
    }
  }

  createInstances() {
    const byMat = {};
    for (const block of this.blocks) {
      (byMat[block.mat] ||= []).push(block);
    }
    for (const [mat, list] of Object.entries(byMat)) {
      const mesh = new THREE.InstancedMesh(this.geometry, this.materials[mat], list.length);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.instances[mat] = mesh;
      list.forEach((block, i) => {
        block.index = i;
        block.mesh = mesh;
        block.built = false;
        this.hideBlock(block);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
    this.ghostMesh.count = this.blocks.length;
    this.ghostMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.ghostWireMesh.count = this.blocks.length;
    this.ghostWireMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const m = new THREE.Matrix4();
    this.blocks.forEach((b, i) => {
      m.compose(b.target, new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
      this.ghostMesh.setMatrixAt(i, m);
      this.ghostWireMesh.setMatrixAt(i, m);
    });
    this.ghostMesh.instanceMatrix.needsUpdate = true;
    this.ghostWireMesh.instanceMatrix.needsUpdate = true;
  }

  hideBlock(block) {
    const m = new THREE.Matrix4().makeScale(0, 0, 0);
    block.mesh.setMatrixAt(block.index, m);
  }

  setBlockMatrix(block, scale, lift = 0) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, block.rot, 0));
    const pos = block.target.clone();
    pos.y += lift;
    const s = block.scale * scale;
    const m = new THREE.Matrix4().compose(pos, q, new THREE.Vector3(s, s, s));
    block.mesh.setMatrixAt(block.index, m);
  }

  createScaffolding() {
    this.scaffold = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0xb08355, roughness: 0.9 });
    const woodDark = new THREE.MeshStandardMaterial({ color: 0x7b5a3b, roughness: 0.92 });
    const postGeo = new THREE.BoxGeometry(0.16, 5.4, 0.16);
    const beamGeo = new THREE.BoxGeometry(0.12, 0.12, 3.2);
    for (const x of [-6.4, 6.4]) {
      for (const z of [-5.1, 4.1]) {
        const p = new THREE.Mesh(postGeo, wood);
        p.position.set(x, 2.8, z);
        p.castShadow = true;
        this.scaffold.add(p);
      }
      for (const y of [1.2, 3.2, 5.1]) {
        const b = new THREE.Mesh(beamGeo, woodDark);
        b.position.set(x, y, -0.5);
        b.castShadow = true;
        this.scaffold.add(b);
      }
    }
    for (const z of [4.1, -5.1]) {
      for (const y of [1.2, 3.2, 5.1]) {
        const beam = new THREE.Mesh(new THREE.BoxGeometry(12.8, 0.12, 0.12), woodDark);
        beam.position.set(0, y, z);
        this.scaffold.add(beam);
      }
    }
    for (let i = 0; i < 4; i++) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 0.75), wood);
      plank.position.set(-5.4 + i * 3.6, 3.25, 4.1);
      plank.castShadow = true;
      this.scaffold.add(plank);
    }
    this.group.add(this.scaffold);
  }

  createLight() {
    this.porchLight = new THREE.PointLight(0xffc46b, 0, 10, 2);
    this.porchLight.position.set(0, 3.2, 4.8);
    this.group.add(this.porchLight);
    this.windowLight = new THREE.PointLight(0x7de8dc, 0, 7, 2);
    this.windowLight.position.set(-2.5, 3.6, 3.6);
    this.group.add(this.windowLight);
  }

  setStage(stage, now = performance.now() / 1000) {
    const next = Math.max(-1, Math.min(STAGES.length - 1, stage));
    if (next <= this.stage) return;
    const fresh = this.blocks.filter(b => b.stage > this.stage && b.stage <= next && !b.built);
    fresh.forEach((b, i) => {
      b.animating = true;
      b.start = now + Math.random() * 0.16 + i * 0.004;
    });
    this.animating.push(...fresh);
    this.stage = next;
    this.updateGhost();
    if (next >= 9) this.porchLight.intensity = 2.2;
    if (next >= 11) this.windowLight.intensity = 1.1;
    if (next >= 9) this.scaffold.visible = next < 11;
  }

  reset() {
    this.stage = -1;
    this.animating = [];
    this.blocks.forEach(b => {
      b.built = false;
      b.animating = false;
      this.hideBlock(b);
    });
    for (const mesh of Object.values(this.instances)) mesh.instanceMatrix.needsUpdate = true;
    this.porchLight.intensity = 0;
    this.windowLight.intensity = 0;
    this.scaffold.visible = true;
    this.updateGhost();
  }

  updateGhost() {
    if (!this.ghostMesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const zero = new THREE.Vector3(0, 0, 0);
    const one = new THREE.Vector3(1, 1, 1);
    const nextStage = this.stage + 1;
    // Show only the next stage as a translucent blueprint so the cottage
    // never turns into a milky cloud of overlapping ghost cubes.
    this.blocks.forEach((b, i) => {
      const upcoming = !b.built && b.stage > this.stage && b.stage === nextStage;
      m.compose(b.target, q, upcoming ? one : zero);
      this.ghostMesh.setMatrixAt(i, m);
      this.ghostWireMesh.setMatrixAt(i, m);
    });
    this.ghostMesh.instanceMatrix.needsUpdate = true;
    this.ghostWireMesh.instanceMatrix.needsUpdate = true;
    this.ghostMaterial.opacity = 0.075;
    this.ghostWireMaterial.opacity = 0.32;
  }

  update(dt, now) {
    this.clock += dt;
    if (this.animating.length) {
      const done = [];
      const dirty = new Set();
      for (const b of this.animating) {
        const t = (now - b.start) / 0.58;
        if (t <= 0) {
          this.setBlockMatrix(b, 0);
          dirty.add(b.mesh);
          continue;
        }
        if (t < 1) {
          const s = easeOutBack(t);
          this.setBlockMatrix(b, Math.max(0, s), (1 - Math.min(1, t)) * 1.8);
          dirty.add(b.mesh);
        } else {
          this.setBlockMatrix(b, 1);
          b.animating = false;
          b.built = true;
          dirty.add(b.mesh);
          done.push(b);
        }
      }
      for (const mesh of dirty) mesh.instanceMatrix.needsUpdate = true;
      this.animating = this.animating.filter(b => !done.includes(b));
    }
    if (this.windowLight.intensity > 0) {
      this.windowLight.intensity = 1.1 + Math.sin(this.clock * 2.1) * 0.1;
    }
    if (this.porchLight.intensity > 0) {
      this.porchLight.intensity = 2.2 + Math.sin(this.clock * 3.3) * 0.18;
    }
    if (this.stage < STAGES.length - 1) {
      const pulse = 0.5 + Math.sin(this.clock * 2.2) * 0.5;
      this.ghostMaterial.opacity = 0.055 + pulse * 0.035;
      this.ghostWireMaterial.opacity = 0.24 + pulse * 0.16;
    }
    if (this.scaffold.visible) {
      const target = this.stage >= 10 ? 0 : 1;
      const cur = this.scaffold.scale.y;
      const next = THREE.MathUtils.damp(cur, target, 4, dt);
      this.scaffold.scale.y = next;
      this.scaffold.scale.x = THREE.MathUtils.damp(this.scaffold.scale.x, target, 4, dt);
      this.scaffold.scale.z = THREE.MathUtils.damp(this.scaffold.scale.z, target, 4, dt);
      if (this.stage >= 10 && next < 0.02) this.scaffold.visible = false;
    }
  }

  getSmokeOrigin() {
    return this.group.localToWorld(new THREE.Vector3(3 * CELL, BASE_Y + 11.6 * CELL, -3 * CELL));
  }

  getCenter() {
    return this.group.localToWorld(new THREE.Vector3(0, 4.2, 0));
  }
}
