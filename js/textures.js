import * as THREE from 'three';

const TEX_SIZE = 16;

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
}

function canvas() {
  const c = document.createElement('canvas');
  c.width = c.height = TEX_SIZE;
  return c;
}

function finish(c, repeat = 1) {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapNearestFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

function border(ctx, color = 'rgba(0,0,0,.28)', w = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, TEX_SIZE, w);
  ctx.fillRect(0, TEX_SIZE - w, TEX_SIZE, w);
  ctx.fillRect(0, 0, w, TEX_SIZE);
  ctx.fillRect(TEX_SIZE - w, 0, w, TEX_SIZE);
}

function speckle(ctx, count, colors, alpha = 0.7) {
  for (let i = 0; i < count; i++) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = colors[(Math.random() * colors.length) | 0];
    const s = Math.random() < 0.15 ? 2 : 1;
    ctx.fillRect((Math.random() * TEX_SIZE) | 0, (Math.random() * TEX_SIZE) | 0, s, s);
  }
  ctx.globalAlpha = 1;
}

function planks(ctx, base, dark, light) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  for (let y = 0; y < TEX_SIZE; y += 4) {
    ctx.fillStyle = dark;
    ctx.fillRect(0, y, TEX_SIZE, 1);
    ctx.fillStyle = light;
    ctx.globalAlpha = 0.25;
    ctx.fillRect(0, y + 1, TEX_SIZE, 1);
    ctx.globalAlpha = 1;
    const seam = 2 + ((y * 7) % 11);
    ctx.fillStyle = dark;
    ctx.fillRect(seam, y + 1, 1, 3);
  }
  speckle(ctx, 11, [light, dark], 0.35);
}

function stones(ctx, base, dark, light, mortar) {
  ctx.fillStyle = mortar;
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  const blocks = [
    [1, 1, 6, 4], [8, 1, 7, 4], [1, 6, 4, 4], [6, 6, 4, 4], [11, 6, 4, 4],
    [1, 11, 8, 4], [10, 11, 5, 4], [1, 15, 14, 0]
  ];
  for (const [x, y, w, h] of blocks) {
    if (h <= 0) continue;
    ctx.fillStyle = base;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = light;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(x, y, w, 1);
    ctx.fillRect(x, y, 1, h);
    ctx.globalAlpha = 1;
    ctx.fillStyle = dark;
    ctx.fillRect(x, y + h - 1, w, 1);
    ctx.fillRect(x + w - 1, y, 1, h);
  }
  speckle(ctx, 15, [dark, light], 0.45);
}

function bricks(ctx, base, dark, light, mortar) {
  ctx.fillStyle = mortar;
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  for (let row = 0; row < 4; row++) {
    const y = row * 4;
    const offset = row % 2 ? -4 : 0;
    for (let col = 0; col < 3; col++) {
      const x = offset + col * 8 + 1;
      ctx.fillStyle = base;
      ctx.fillRect(x, y + 1, 7, 3);
      ctx.fillStyle = light;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(x, y + 1, 7, 1);
      ctx.globalAlpha = 1;
      ctx.fillStyle = dark;
      ctx.fillRect(x, y + 3, 7, 1);
    }
  }
  speckle(ctx, 9, [light, dark], 0.35);
}

function crystal(ctx, base, dark, light) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  ctx.fillStyle = light;
  ctx.globalAlpha = 0.65;
  ctx.beginPath();
  ctx.moveTo(2, 13); ctx.lineTo(7, 2); ctx.lineTo(9, 2); ctx.lineTo(5, 14); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(9, 2); ctx.lineTo(14, 10); ctx.lineTo(12, 15); ctx.lineTo(8, 9); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(255,255,255,.75)';
  ctx.fillRect(5, 4, 1, 1); ctx.fillRect(6, 3, 1, 1); ctx.fillRect(10, 7, 1, 1);
  border(ctx, 'rgba(0,0,0,.18)', 1);
}

function leaf(ctx, base, dark, light) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = [dark, light, base][i % 3];
    const x = (Math.random() * 15) | 0, y = (Math.random() * 15) | 0;
    ctx.fillRect(x, y, 2, 2);
    ctx.fillRect(x + 1, y + 1, 1, 1);
  }
  border(ctx, 'rgba(10,42,16,.34)', 1);
}

function glass(ctx, base, light) {
  ctx.clearRect(0, 0, TEX_SIZE, TEX_SIZE);
  ctx.fillStyle = base;
  ctx.globalAlpha = 0.62;
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(255,255,255,.58)';
  ctx.fillRect(2, 2, 1, 12);
  ctx.fillRect(2, 2, 8, 1);
  ctx.fillStyle = 'rgba(255,255,255,.3)';
  ctx.fillRect(10, 5, 1, 7);
  ctx.fillStyle = 'rgba(14,58,62,.55)';
  ctx.fillRect(0, 0, 16, 1); ctx.fillRect(0, 15, 16, 1); ctx.fillRect(0, 0, 1, 16); ctx.fillRect(15, 0, 1, 16);
  ctx.fillRect(5, 0, 1, 16); ctx.fillRect(11, 0, 1, 16); ctx.fillRect(0, 5, 16, 1); ctx.fillRect(0, 11, 16, 1);
}

function roof(ctx, base, dark, light) {
  ctx.fillStyle = dark;
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  for (let row = 0; row < 4; row++) {
    const y = row * 4;
    for (let x = (row % 2) * -4; x < 16; x += 8) {
      ctx.fillStyle = base;
      ctx.fillRect(x + 1, y + 1, 7, 3);
      ctx.fillStyle = light;
      ctx.globalAlpha = 0.42;
      ctx.fillRect(x + 1, y + 1, 7, 1);
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(0,0,0,.16)';
      ctx.fillRect(x + 1, y + 3, 7, 1);
    }
  }
  speckle(ctx, 10, [light, dark], 0.3);
}

function door(ctx, base, dark, light) {
  ctx.fillStyle = dark;
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  ctx.fillStyle = base;
  ctx.fillRect(1, 1, 14, 14);
  for (let y = 3; y < 15; y += 4) {
    ctx.fillStyle = dark;
    ctx.fillRect(2, y, 12, 1);
    ctx.fillStyle = light;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(2, y + 1, 12, 1);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = dark;
  ctx.fillRect(1, 1, 1, 14); ctx.fillRect(14, 1, 1, 14); ctx.fillRect(1, 1, 14, 1); ctx.fillRect(1, 14, 14, 1);
  ctx.fillStyle = '#ffd166';
  ctx.fillRect(11, 8, 2, 2);
  ctx.fillStyle = '#8d6428';
  ctx.fillRect(11, 9, 1, 1);
}

function grass(ctx, base, dark, light) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  for (let i = 0; i < 46; i++) {
    ctx.fillStyle = [dark, light, base, light][i % 4];
    ctx.globalAlpha = 0.5 + Math.random() * 0.5;
    const x = (Math.random() * 16) | 0, y = (Math.random() * 16) | 0;
    ctx.fillRect(x, y, 1, Math.random() < 0.35 ? 2 : 1);
  }
  ctx.globalAlpha = 1;
}

function dirt(ctx, base, dark, light) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = [dark, light, base][i % 3];
    ctx.globalAlpha = 0.55 + Math.random() * 0.4;
    const x = (Math.random() * 15) | 0, y = (Math.random() * 15) | 0;
    ctx.fillRect(x, y, Math.random() < 0.3 ? 2 : 1, 1);
  }
  ctx.globalAlpha = 1;
}

function water(ctx, base, light) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  for (let y = 1; y < 16; y += 3) {
    ctx.fillStyle = light;
    ctx.globalAlpha = 0.32;
    ctx.fillRect((y * 3) % 8, y, 5, 1);
    ctx.globalAlpha = 0.18;
    ctx.fillRect((y * 5 + 4) % 10, y + 1, 7, 1);
  }
  ctx.globalAlpha = 1;
}

export function createTextures() {
  const defs = {};
  const t = (name, fn, repeat = 1) => {
    const c = canvas(); const ctx = c.getContext('2d');
    fn(ctx); defs[name] = finish(c, repeat);
  };

  t('oak', c => planks(c, '#b9834e', '#8b5b32', '#d9a96d'));
  t('oakLight', c => planks(c, '#d1a166', '#a87844', '#edc88d'));
  t('spruce', c => planks(c, '#78543b', '#513526', '#9b714e'));
  t('cobble', c => stones(c, '#777b7c', '#565b5c', '#a0a5a2', '#454a49'));
  t('stone', c => stones(c, '#8e918c', '#666a66', '#b1b4ad', '#585d57'));
  t('brick', c => bricks(c, '#b66b55', '#8c4b3c', '#d18d73', '#6e493c'));
  t('roof', c => roof(c, '#a44e40', '#753328', '#cc6e59'));
  t('roofDark', c => roof(c, '#824237', '#58271f', '#a9604f'));
  t('glass', c => glass(c, '#8fe8ec', '#d8ffff'));
  t('door', c => door(c, '#8d6039', '#5e3d25', '#b98754'));
  t('leaves', c => leaf(c, '#4e9f45', '#347a37', '#7ac85c'));
  t('leavesLight', c => leaf(c, '#68b84e', '#418c3d', '#96dc6a'));
  t('grass', c => grass(c, '#6ab24b', '#4a913b', '#92d468'), 1);
  t('dirt', c => dirt(c, '#765437', '#5b3f29', '#916d47'));
  t('water', c => water(c, '#3ba8c4', '#9defff'));
  t('plankDark', c => planks(c, '#624631', '#402c20', '#846345'));

  // Bright, chunky tetromino skins. Each has a clear border + lit edge.
  const pieces = {
    I: ['#49d8e4', '#1e9fae', '#a8fbff'],
    O: ['#ffd34e', '#d99a1f', '#fff2a3'],
    T: ['#b77bff', '#7e45cc', '#e5c2ff'],
    S: ['#75e05d', '#3fa53c', '#c3ff9a'],
    Z: ['#ff6e61', '#c33d38', '#ffb2a7'],
    J: ['#5f8fff', '#3158c2', '#b2c8ff'],
    L: ['#ff9f43', '#c96a1d', '#ffd09b']
  };
  for (const [key, [base, dark, light]] of Object.entries(pieces)) {
    t('piece' + key, c => {
      c.fillStyle = base;
      c.fillRect(0, 0, 16, 16);
      c.fillStyle = light;
      c.fillRect(1, 1, 14, 2);
      c.fillRect(1, 3, 2, 11);
      c.fillStyle = dark;
      c.fillRect(1, 13, 14, 2);
      c.fillRect(13, 3, 2, 11);
      c.globalAlpha = 0.25;
      for (let i = 0; i < 18; i++) {
        c.fillStyle = i % 2 ? dark : light;
        c.fillRect((Math.random() * 12 + 2) | 0, (Math.random() * 12 + 2) | 0, 1, 1);
      }
      c.globalAlpha = 1;
      c.fillStyle = 'rgba(255,255,255,.28)';
      c.fillRect(3, 4, 5, 1);
      border(c, 'rgba(8,20,14,.24)', 1);
    });
  }

  return defs;
}

export function createPieceMaterials(textures) {
  const mats = {};
  const colors = {
    I: 0x49d8e4, O: 0xffd34e, T: 0xb77bff, S: 0x75e05d, Z: 0xff6e61, J: 0x5f8fff, L: 0xff9f43
  };
  for (const key of Object.keys(colors)) {
    mats[key] = new THREE.MeshStandardMaterial({
      map: textures['piece' + key],
      color: 0xffffff,
      roughness: 0.42,
      metalness: 0.08,
      emissive: new THREE.Color(colors[key]),
      emissiveIntensity: 0.075
    });
  }
  return mats;
}
