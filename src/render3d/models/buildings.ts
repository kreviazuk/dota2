import {
  AdditiveBlending, CanvasTexture, Color, Group, Mesh, ShaderMaterial, SphereGeometry, Sprite, SpriteMaterial, SRGBColorSpace,
  type BufferGeometry, type Material, type Texture,
} from 'three';
import { Rng } from '../../sim/core/rng';
import { GeoBuilder } from '../geo';
import { makeGlow, PAL, teamColor, teamDark, teamLight } from '../materials';
import { cachedGeo } from './rig';

/** 建筑外观：静态主体 + 会转动 / 呼吸的水晶 + 光晕；被摧毁后换成废墟 */
export interface BuildingParts {
  group: Group;
  body: Mesh;
  crystal: Mesh | null;
  halo: Sprite | null;
  /** 水晶中心高度 */
  crystalY: number;
  /** 血条锚点高度 */
  barHeight: number;
  /** 弹道发射点高度 */
  muzzleY: number;
}

const stoneOf = (team: number) => (team === 0 ? { base: 0xcdc6b2, light: 0xebe5d4, dark: 0x9a927e } : { base: 0x4a3e40, light: 0x645456, dark: 0x2e2628 });

export const towerHeight = (tier: number): number => 205 + tier * 20;

function towerGeo(team: number, tier: number): BufferGeometry {
  const b = new GeoBuilder(301 + team * 10 + tier);
  const st = stoneOf(team);
  const H = towerHeight(tier);
  const radiant = team === 0;
  b.cyl(90, 100, 22, 8, st.dark, { p: [0, 11, 0], r: [0, Math.PI / 8, 0] });
  b.cyl(78, 88, 18, 8, st.base, { p: [0, 31, 0], r: [0, Math.PI / 8, 0] });
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    b.box(24, 84, 40, st.base, { p: [Math.cos(a) * 62, 70, Math.sin(a) * 62], r: [0, -a, 0.18], top: st.light });
    if (!radiant) b.cone(7, 34, 4, 0xc8b8a0, { p: [Math.cos(a) * 74, 124, Math.sin(a) * 74], r: [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5] });
  }
  const shaftH = H - 92;
  b.cyl(42, 55, shaftH, 8, st.base, { p: [0, 40 + shaftH / 2, 0], r: [0, Math.PI / 8, 0], top: st.light });
  for (const f of [0.33, 0.7]) b.cyl(55 - f * 12, 57 - f * 12, 9, 8, teamColor(team), { p: [0, 40 + shaftH * f, 0], r: [0, Math.PI / 8, 0], jitter: 0.04 });
  // 两侧的阵营旗帜
  for (const s of [1, -1]) b.box(26, 74, 3, teamColor(team), { p: [0, 40 + shaftH * 0.5, s * 52], r: [s * 0.08, 0, 0], top: teamDark(team), jitter: 0.04 });
  // 塔顶平台 + 垛口
  b.cyl(64, 50, 22, 8, st.dark, { p: [0, H - 41, 0], r: [0, Math.PI / 8, 0] });
  b.cyl(64, 64, 6, 8, radiant ? PAL.gold : 0x8a2a20, { p: [0, H - 29, 0], r: [0, Math.PI / 8, 0] });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    b.box(15, 17, 15, st.base, { p: [Math.cos(a) * 56, H - 18, Math.sin(a) * 56], r: [0, -a, 0] });
  }
  // 托住水晶的爪
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    b.cone(6, 56, 5, radiant ? PAL.gold : 0x2a2224, { p: [Math.cos(a) * 26, H + 12, Math.sin(a) * 26], r: [Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35] });
  }
  return b.build();
}

function ancientGeo(team: number): BufferGeometry {
  const b = new GeoBuilder(351 + team);
  const st = stoneOf(team);
  const radiant = team === 0;
  b.cyl(178, 198, 30, 8, st.dark, { p: [0, 15, 0], r: [0, Math.PI / 8, 0] });
  b.cyl(146, 166, 30, 8, st.base, { p: [0, 45, 0], r: [0, Math.PI / 8, 0] });
  b.cyl(112, 128, 30, 8, st.light, { p: [0, 75, 0], r: [0, Math.PI / 8, 0] });
  b.cyl(130, 130, 6, 8, radiant ? PAL.gold : 0x8a2a20, { p: [0, 61, 0], r: [0, Math.PI / 8, 0] });
  // 外圈 6 根石柱
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const x = Math.cos(a) * 158, z = Math.sin(a) * 158;
    if (radiant) {
      b.cyl(14, 18, 150, 7, st.light, { p: [x, 105, z] });
      b.box(36, 12, 36, st.base, { p: [x, 186, z] });
    } else {
      b.cone(22, 190, 5, 0x2a2224, { p: [x, 125, z], r: [Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25], top: 0x4a3a3c });
    }
  }
  if (radiant) {
    // 中央的水晶簇（不发光的底座部分）
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      b.octa(30, 0x8ad8a0, { p: [Math.cos(a) * 52, 150, Math.sin(a) * 52], s: [0.7, 2.6, 0.7], r: [Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3], jitter: 0.12 });
    }
    b.cyl(70, 90, 40, 8, st.base, { p: [0, 108, 0] });
  } else {
    // 中央的尖刺王冠
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      b.cone(16, 170, 5, 0x3a2a2c, { p: [Math.cos(a) * 60, 170, Math.sin(a) * 60], r: [Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35], top: 0x6a3a30 });
    }
    b.cyl(70, 90, 50, 7, 0x2e2426, { p: [0, 112, 0] });
  }
  return b.build();
}

function fountainGeo(team: number): BufferGeometry {
  const b = new GeoBuilder(371 + team);
  const st = stoneOf(team);
  // 池沿：一圈贴地的矮石块（英雄会从池子里走过，不能有高墙）
  for (let k = 0; k < 20; k++) {
    const a = (k / 20) * Math.PI * 2;
    b.box(54, 7, 18, k % 2 ? st.base : st.light, { p: [Math.cos(a) * 166, 3.5, Math.sin(a) * 166], r: [0, -a + Math.PI / 2, 0] });
  }
  b.cyl(30, 42, 130, 8, st.base, { p: [0, 65, 0], top: st.light });
  b.cyl(60, 30, 22, 8, st.dark, { p: [0, 138, 0] });
  b.cyl(62, 62, 5, 8, team === 0 ? PAL.gold : 0x8a2a20, { p: [0, 149, 0] });
  return b.build();
}

/** 废墟：碎石堆 + 残桩 */
function rubbleGeo(team: number, radius: number, seed: number): BufferGeometry {
  const b = new GeoBuilder(seed);
  const r = new Rng(seed);
  const st = stoneOf(team);
  b.cyl(radius * 0.8, radius * 0.95, 20, 8, st.dark, { p: [0, 10, 0], r: [0, Math.PI / 8, 0] });
  b.cyl(radius * 0.42, radius * 0.5, 50, 8, st.base, { p: [0, 40, 0], r: [0.08, 0.3, -0.06], top: 0x3a3632 });
  for (let i = 0; i < 14; i++) {
    const a = r.range(0, Math.PI * 2), d = r.range(0.3, 1.1) * radius;
    b.dodeca(r.range(10, 26), r.pick([st.base, st.dark, st.light, 0x4a4642]), {
      p: [Math.cos(a) * d, r.range(4, 16), Math.sin(a) * d], s: [1, r.range(0.5, 0.9), 1], r: [r.range(0, 3), r.range(0, 3), 0], jitter: 0.15,
    });
  }
  // 熄灭的水晶碎片
  for (let i = 0; i < 3; i++) b.octa(12, 0x3a4a44, { p: [r.range(-30, 30), 14, r.range(-30, 30)], s: [0.6, 1.4, 0.6], r: [r.range(0.5, 1.4), 0, r.range(0, 1)] });
  return b.build();
}

let haloTex: Texture | null = null;
/** 柔和的径向光晕贴图 */
export function haloTexture(): Texture {
  if (!haloTex) {
    const S = 128;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0.12)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
    haloTex = new CanvasTexture(c);
    haloTex.colorSpace = SRGBColorSpace;
  }
  return haloTex;
}

const glowMats = new Map<string, Material>();
const glowMat = (key: string, color: number, additive = false, opacity = 1): Material => {
  let m = glowMats.get(key);
  if (!m) glowMats.set(key, (m = makeGlow(color, additive, opacity)));
  return m;
};

export function makeHalo(color: number, size: number, opacity = 0.8): Sprite {
  const s = new Sprite(new SpriteMaterial({ map: haloTexture(), color, blending: AdditiveBlending, transparent: true, depthWrite: false, opacity, toneMapped: false }));
  s.scale.set(size, size, 1);
  return s;
}

/** 建一座建筑的外观（mat：共享的建筑卡通材质） */
export function buildBuilding(type: 'tower' | 'ancient' | 'fountain', team: number, tier: number, mat: Material): BuildingParts {
  const group = new Group();
  let geo: BufferGeometry;
  let crystal: Mesh | null = null;
  let halo: Sprite | null = null;
  let crystalY = 0, barHeight = 0, muzzleY = 0;
  if (type === 'tower') {
    geo = cachedGeo(`tower:${team}:${tier}`, () => towerGeo(team, tier));
    const H = towerHeight(tier);
    crystalY = H + 44;
    const cg = cachedGeo('crystal:tower', () => new GeoBuilder(1).octa(24, 0xffffff, { s: [1, 1.7, 1], jitter: 0.25 }).build());
    crystal = new Mesh(cg, Object.assign(glowMat(`tower-crystal-vc-${team}`, teamLight(team)), { vertexColors: true }));
    halo = makeHalo(teamColor(team), 170, 0.75);
    barHeight = H + 115;
    muzzleY = crystalY;
  } else if (type === 'ancient') {
    geo = cachedGeo(`ancient:${team}`, () => ancientGeo(team));
    crystalY = team === 0 ? 270 : 210;
    const cg = cachedGeo(`crystal:ancient:${team}`, () =>
      team === 0
        ? new GeoBuilder(2).octa(46, 0xffffff, { s: [1, 2.3, 1], jitter: 0.2 }).build()
        : new GeoBuilder(3).ico(46, 0, 0xffffff, { jitter: 0.25 }).build(),
    );
    crystal = new Mesh(cg, Object.assign(glowMat(`ancient-crystal-vc-${team}`, teamLight(team)), { vertexColors: true }));
    halo = makeHalo(teamColor(team), 360, 0.85);
    barHeight = 420;
    muzzleY = crystalY;
  } else {
    geo = cachedGeo(`fountain:${team}`, () => fountainGeo(team));
    crystalY = 182;
    crystal = new Mesh(cachedGeo('crystal:fountain', () => new GeoBuilder(4).octa(20, 0xffffff, { s: [1, 1.5, 1], jitter: 0.25 }).build()),
      Object.assign(glowMat(`fountain-crystal-vc-${team}`, teamLight(team)), { vertexColors: true }));
    halo = makeHalo(teamColor(team), 150, 0.8);
    // 泉水池面
    const pool = new Mesh(cachedGeo('fountain:pool', () => new GeoBuilder(5).cyl(158, 158, 1.2, 20, 0xffffff, { jitter: 0 }).build()),
      Object.assign(glowMat(`fountain-pool-${team}`, team === 0 ? 0x5ad0b0 : 0xd0503a, false, 0.85), { vertexColors: true }));
    pool.position.y = 0.5;
    group.add(pool);
    barHeight = 0;
    muzzleY = crystalY;
  }
  const body = new Mesh(geo, mat);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  if (crystal) {
    crystal.position.y = crystalY;
    group.add(crystal);
  }
  if (halo) {
    halo.position.y = crystalY;
    group.add(halo);
  }
  return { group, body, crystal, halo, crystalY, barHeight, muzzleY };
}

export function rubbleMesh(type: string, team: number, radius: number, mat: Material): Mesh {
  const m = new Mesh(cachedGeo(`rubble:${type}:${team}`, () => rubbleGeo(team, radius, 391 + team + (type === 'ancient' ? 5 : 0))), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** 无敌护盾：半透明、边缘发亮的穹顶（菲涅尔效果，叠加混合） */
export function shieldMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uColor: { value: new Color(0x9ac8ff) }, uOpacity: { value: 0.38 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying float vY;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vY = position.y; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uTime; uniform vec3 uColor; uniform float uOpacity; varying vec3 vN; varying vec3 vV; varying float vY;
      void main() {
        float f = pow(1.0 - abs(dot(vN, vV)), 2.2);
        float bands = 0.75 + 0.25 * sin(vY * 0.12 - uTime * 3.0);
        gl_FragColor = vec4(uColor * (f * 1.1 + 0.06) * bands * uOpacity, 1.0);
      }`,
  });
}

let shieldGeo: SphereGeometry | null = null;
export function shieldGeometry(): SphereGeometry {
  if (!shieldGeo) shieldGeo = new SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  return shieldGeo;
}
