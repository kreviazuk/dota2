import { Mesh, MeshLambertMaterial } from 'three';
import { groundHeight } from '../coords';
import { GeoBuilder } from '../geo';
import { cachedGeo } from '../models/rig';
import type { Fx3D } from '../fx3d';
import { registerFx, registerModifierVisual, registerProjectileStyle, registerUnitVisual } from './registry';

/**
 * 水晶室女的 3D 特效：冰片普攻、冰霜新星的冰刺爆散环、冰封禁制的冰晶爆散和裹住目标的冰块、
 * 极寒领域的 810 大圈（转动的雪花虚线、满场飘雪）和随机冰爆、法杖顶端持续飘出的冰霜粒子。
 * 冰川护体用通用的护盾光壳（fx/common.ts）。
 * 冰蓝色在浅色沙地上用叠加混合会发白，粒子和冰刺大多用普通混合，只有很小的亮芯用叠加。
 */
const ICE = 0x6cc8f0;
const ICE_DEEP = 0x3a9ad8;
const ICE_LIGHT = 0xa8e4ff;
const FROST = 0xd8f2ff;
const SNOW = 0xeef8ff;

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** 一根向上的小冰刺：一串由粗到细、由深到浅的静止粒子叠成的锥（普通混合，浅色地面上也看得清） */
function iceSpike(fx: Fx3D, x: number, y: number, h: number, life: number): void {
  const gy = groundHeight(x, y);
  const n = 6;
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1);
    const col = k < 0.3 ? ICE_DEEP : k < 0.7 ? ICE : FROST;
    fx.emit(x, gy + 5 + h * k, y, 0, 0, 0, col, 11 - k * 8, life * (1 - 0.15 * k), false, 0, 0.95);
  }
}

// ---------- 普攻 ----------
/** 青色冰片 + 一路飘出的霜雾（普通混合的淡蓝色小雾团，慢慢变大淡出） */
registerProjectileStyle('hero:crystal_maiden', {
  mesh: 'shard', color: 0x8fe4ff, size: 20, halo: 40,
  trail: { color: 0x9adcf8, every: 0.014, size: 12, additive: false },
  emitter: (c) => {
    if (Math.random() > c.dt * 40) return;
    c.fx.emit(c.x + rnd(-6, 6), c.h + rnd(-6, 6), c.y + rnd(-6, 6), rnd(-15, 15), rnd(-10, 10), rnd(-15, 15), Math.random() < 0.5 ? FROST : ICE_LIGHT, rnd(9, 13), 0.4, false, 24, 0.7);
  },
});

// ---------- Q 冰霜新星 ----------
/**
 * 落点：冰蓝色冲击环扩到 425、一圈向外贴地飞散的冰屑、一圈向上的小冰刺（外圈 + 内圈）、
 * 中心的贴地冰光、飘起又落下的雪花、轻微震屏。
 */
registerFx('cm_nova', (e, c) => {
  const { x, y } = e.pos;
  const gy = groundHeight(x, y);
  const r = e.radius ?? 425;
  c.fx.ring(x, y, 30, r, ICE, 0.55, 46);
  c.fx.ring(x, y, r * 0.82, r * 1.02, FROST, 0.5, 14);
  c.fx.decalFlash(x, y, r * 0.55, ICE_LIGHT, 0.45);
  c.fx.burst(x, y, gy + 16, 46, ICE_LIGHT, 1300, 11, 0.55, false, { flat: true, up: 30 });
  c.fx.burst(x, y, gy + 40, 18, 0xffffff, 380, 8, 0.35, true, { up: 120 });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + Math.random() * 0.2;
    const rr = r * rnd(0.82, 0.95);
    iceSpike(c.fx, x + Math.cos(a) * rr, y + Math.sin(a) * rr, rnd(45, 70), 0.75);
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2 + Math.random() * 0.3;
    const rr = r * rnd(0.35, 0.55);
    iceSpike(c.fx, x + Math.cos(a) * rr, y + Math.sin(a) * rr, rnd(35, 55), 0.65);
  }
  c.fx.burst(x, y, gy + 70, 30, SNOW, 360, 6, 1.3, false, { up: 160, grav: 90, drag: 2.5 });
  if (c.cam.visible(e.pos)) c.cam.shake(4);
});

// ---------- W 冰封禁制 ----------
/** 施放命中：目标身上冰晶爆散（普通混合的青色碎晶 + 小的亮白芯） */
registerFx('cm_frostbite', (e, c) => {
  const t = c.world.getUnit(e.targetId);
  const p = t?.pos ?? e.pos;
  const gy = groundHeight(p.x, p.y);
  const h = gy + (t ? c.heightOf(t) * 0.5 : 70);
  c.fx.burst(p.x, p.y, h, 26, ICE_LIGHT, 300, 10, 0.5, false, { up: 60, grav: 200 });
  c.fx.burst(p.x, p.y, h, 10, 0xffffff, 200, 8, 0.3, true);
  c.fx.ring(p.x, p.y, 20, 110, ICE, 0.35, 14);
});

let iceMat: MeshLambertMaterial | null = null;

/** 冰块（半宽 1、高 1，底面在 y = 0）：几块歪斜的大冰棱拼成，顶上和四周突出几根尖冰晶 */
function iceBlock(): Mesh {
  const geo = cachedGeo('cm:ice', () => {
    const b = new GeoBuilder(491);
    b.box(1.7, 0.95, 1.6, 0x9fe4ff, { p: [0, 0.47, 0], r: [0, 0.3, 0], top: 0xd8f6ff, jitter: 0.12 });
    b.box(1.3, 0.75, 1.5, 0x8adcff, { p: [0.22, 0.55, -0.1], r: [0.12, 0.9, 0.08], top: 0xe0f8ff, jitter: 0.12 });
    b.box(1.2, 0.6, 1.2, 0xb0ecff, { p: [-0.2, 0.62, 0.15], r: [-0.1, -0.5, 0.1], jitter: 0.12 });
    const spikes: [number, number, number, number, number][] = [[0.15, 1.0, 0.1, 0.1, 0.2], [-0.5, 0.85, -0.3, -0.35, 0.5], [0.6, 0.8, 0.35, 0.4, -0.5], [-0.3, 0.75, 0.6, 0.6, 0.25], [0.45, 0.7, -0.6, -0.55, -0.3]];
    for (const [x, y, z, rx, rz] of spikes) b.octa(0.28, 0xc8f2ff, { p: [x, y, z], s: [0.7, 1.9, 0.7], r: [rx, 0, rz], jitter: 0.05 });
    return b.build();
  });
  iceMat ??= new MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false, emissive: 0x1a4a6a });
  const m = new Mesh(geo, iceMat);
  m.renderOrder = 9;
  return m;
}

/** 冻住期间：身体高度裹一块半透明的青色冰块（替换通用的缠绕藤蔓），模型泛冰蓝色，偶尔飘出霜气 */
registerModifierVisual('cm_frostbite', (c) => {
  if (!c.u.alive) return;
  const m = c.obj('cm_frostbite', iceBlock);
  const hero = c.u.kind === 'hero';
  const grow = Math.min(1, (c.m.total - c.m.duration) / 0.12);
  const shrink = Math.min(1, c.m.duration / 0.15);
  const k = Math.max(0.05, Math.min(grow, shrink));
  const w = Math.max(c.u.radius * 1.5, hero ? 38 : 24) * k;
  const h = (hero ? c.height * 0.72 : c.height * 0.9) * k;
  m.position.set(c.x, c.gy + c.lift, c.y);
  m.scale.set(w, h, w);
  m.rotation.y = (c.u.id * 1.7) % (Math.PI * 2);
  c.view?.tint(0x8fd8ff, 0.35);
  if (c.dt > 0 && Math.random() < c.dt * 8) {
    const a = Math.random() * Math.PI * 2;
    c.fx.emit(c.x + Math.cos(a) * w, c.gy + c.lift + h * rnd(0.3, 1), c.y + Math.sin(a) * w, 0, rnd(20, 40), 0, FROST, rnd(10, 14), 0.6, false, 14, 0.6);
  }
}, { replaces: ['root'] });

// ---------- R 极寒领域 ----------
/** 开始引导：淡蓝色的冲击环扩到 810 + 一团向上的雪 + 震屏 */
registerFx('cm_freezing_field', (e, c) => {
  const { x, y } = e.pos;
  const gy = groundHeight(x, y);
  const r = e.radius ?? 810;
  c.fx.ring(x, y, 60, r, ICE_LIGHT, 0.7, 40);
  c.fx.burst(x, y, gy + 150, 30, SNOW, 300, 9, 1.0, false, { up: 120, grav: 60 });
  c.fx.burst(x, y, gy + 150, 12, 0xffffff, 200, 8, 0.4, true);
  if (c.cam.visible(e.pos)) c.cam.shake(6);
});

/**
 * 引导期间（挂在水晶室女身上）：810 的淡蓝色大圈（淡淡的填充 + 柔边实线），内侧一圈转动的白色雪花虚线，
 * 范围内持续飘雪（普通混合的白 / 淡蓝雪片，从 120–260 高处慢慢落下），水晶室女身上泛冰蓝色的描边。
 */
registerModifierVisual('cm_freezing_field', (c) => {
  if (!c.u.alive) return;
  const r = 810;
  const gy = Math.max(c.gy, groundHeight(c.x, c.y));
  const fadeIn = Math.min(1, (c.m.total - c.m.duration) / 0.3);
  c.decal('cm_ff').set(c.x, gy + 2.2, c.y, r, { color: 0x8fd0f5, opacity: 0.7 * fadeIn, width: 14, fill: 0.1, soft: 8 });
  c.decal('cm_ff_dash').set(c.x, gy + 2.6, c.y, r * 0.955, {
    color: 0xeaf8ff, opacity: 0.9 * fadeIn, width: 10, dash: 44, dashOffset: c.time * 0.06, soft: 2,
  });
  c.view?.rim(0x7fd8ff, 0.3);
  if (c.dt <= 0) return;
  const n = Math.round(c.dt * 65 + Math.random() * 0.5);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const rr = r * Math.sqrt(Math.random());
    const px = c.x + Math.cos(a) * rr, py = c.y + Math.sin(a) * rr;
    c.fx.emit(px, groundHeight(px, py) + rnd(120, 260), py, rnd(-25, 25), -rnd(70, 120), rnd(-25, 25), Math.random() < 0.55 ? SNOW : ICE_LIGHT, rnd(5, 8), 2.2, false, 0, 0.9);
  }
});

/** 冰爆：贴地冰光 + 快速淡出的 320 圈 + 向上崩起又落下的冰屑 + 中间一根短冰刺 */
registerFx('cm_ff_blast', (e, c) => {
  const { x, y } = e.pos;
  const gy = groundHeight(x, y);
  const r = e.radius ?? 320;
  c.fx.ring(x, y, r * 0.12, r, ICE_DEEP, 0.38, 22);
  c.fx.decalFlash(x, y, r * 0.32, ICE, 0.32);
  c.fx.burst(x, y, gy + 24, 18, ICE, 400, 11, 0.55, false, { up: 260, grav: 560 });
  c.fx.burst(x, y, gy + 20, 8, FROST, 260, 9, 0.5, false, { up: 160, grav: 400 });
  c.fx.burst(x, y, gy + 30, 4, 0xffffff, 180, 8, 0.22, true);
  iceSpike(c.fx, x, y, rnd(70, 100), 0.5);
});

// ---------- 法杖顶端的冰霜粒子、普攻蓄力时冰晶变亮 ----------
registerUnitVisual((c) => {
  const u = c.u;
  if (u.defId !== 'crystal_maiden' || u.kind !== 'hero' || !u.alive || c.dt <= 0 || !c.view || u.cast) return;
  const f = { x: Math.cos(u.facing), y: Math.sin(u.facing) };
  // 法杖在右手（sim 坐标 y 向下：朝向顺时针转 90° 是右手边），竖在身体右前方，杖头约在头顶高度
  const side = { x: -f.y, y: f.x };
  const tx = c.x + side.x * 28 + f.x * 32, ty = c.y + side.y * 28 + f.y * 32;
  const th = c.gy + c.lift + c.height * 0.98;
  if (Math.random() < c.dt * 9) {
    c.fx.emit(tx + rnd(-5, 5), th + rnd(-6, 6), ty + rnd(-5, 5), rnd(-10, 10), -rnd(10, 30), rnd(-10, 10), Math.random() < 0.5 ? FROST : ICE_LIGHT, rnd(7, 10), 0.8, false, 6, 0.85);
  }
  if (u.attack.windup > 0 && Math.random() < c.dt * 30) {
    c.fx.emit(tx + rnd(-4, 4), th + rnd(-4, 4), ty + rnd(-4, 4), 0, rnd(10, 30), 0, Math.random() < 0.5 ? 0xffffff : ICE_LIGHT, rnd(9, 13), 0.25, true, -10);
  }
});
