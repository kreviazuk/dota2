import { Group, IcosahedronGeometry, Mesh } from 'three';
import { groundHeight } from '../coords';
import { makeGlow } from '../materials';
import { cachedGeo } from '../models/rig';
import { getSouls } from '../../sim/heroes/shadow_fiend';
import { abilityCastPoint } from '../../sim/systems/abilities';
import { registerFx, registerModifierVisual, registerProjectileStyle, registerUnitVisual } from './registry';

/**
 * 影魔的 3D 特效：暗红色魂弹普攻（黑烟拖尾）、毁灭阴影的暗红魂柱、灵魂盛宴的魂火（从敌人飞向影魔）和周身红光、
 * 魔王降临脚下的暗紫小光圈、魂之挽歌的蓄力（红色粒子螺旋汇聚）和向四周飞出的暗红魂能段（黑烟拖尾）+ 1000 的冲击环、
 * 支配死灵的灵魂球（胸口高度环绕，个数 = ceil(灵魂 / 4)，最多 6 个）、普攻蓄力时右爪聚集红光。
 * 浅色沙地上叠加混合会洗成白色：暗红 / 黑烟全部用普通混合，只有很小的亮红火星用叠加。
 */
const SOUL = 0xc81a14;
const SOUL_DEEP = 0x7a0a10;
const SOUL_DARK = 0x3a0408;
const SOUL_LIGHT = 0xff4a22;
const EMBER = 0xff6a2a;
const SMOKE = 0x1a0a0c;
const SMOKE_LIGHT = 0x2e1418;
const PRESENCE = 0x5a2a7a;

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

// ---------- 普攻 ----------
/** 暗红色的魂球 + 黑烟拖尾（普通混合），中间一点叠加的亮红 */
registerProjectileStyle('hero:shadow_fiend', {
  mesh: 'orb', color: 0xb8141a, size: 18, halo: 40,
  trail: { color: SMOKE, every: 0.01, size: 15, additive: false },
  emitter: (c) => {
    if (Math.random() < c.dt * 40) {
      c.fx.emit(c.x + rnd(-5, 5), c.h + rnd(-5, 5), c.y + rnd(-5, 5), rnd(-20, 20), rnd(0, 25), rnd(-20, 20), Math.random() < 0.5 ? SOUL : SOUL_LIGHT, rnd(6, 9), 0.25, true);
    }
  },
});

// ---------- Q 毁灭阴影 ----------
/**
 * 暗红魂柱：没有用 pillar（白色光芯会把站在里面的单位照白），而是一根细的叠加暗红光柱 +
 * 普通混合的暗红 / 黑色粒子从地面向上喷出（范围内越靠中心越密）+ 贴地的暗红闪光和冲击环、焦黑烟尘、几点亮红火星、震屏 5。
 */
registerFx('sf_raze', (e, c) => {
  const { x, y } = e.pos;
  const gy = groundHeight(x, y);
  const r = e.radius ?? 250;
  // 只有中间一根细的叠加光柱（不罩住范围里的单位）
  c.fx.beam(x, y, r * 0.16, 320, 0xa0140e, 0.35);
  c.fx.decalFlash(x, y, r * 0.95, SOUL_DEEP, 0.45);
  c.fx.ring(x, y, r * 0.35, r * 1.05, SOUL, 0.4, 26);
  for (let i = 0; i < 70; i++) {
    const a = Math.random() * Math.PI * 2;
    const rr = Math.pow(Math.random(), 0.7) * r * 0.75;
    const col = Math.random() < 0.35 ? SMOKE : Math.random() < 0.5 ? SOUL_DEEP : Math.random() < 0.6 ? SOUL : SOUL_DARK;
    c.fx.emit(x + Math.cos(a) * rr, gy + rnd(0, 40), y + Math.sin(a) * rr, Math.cos(a) * rnd(10, 40), rnd(320, 640) * (1 - rr / r * 0.5), Math.sin(a) * rnd(10, 40),
      col, rnd(26, 40), rnd(0.35, 0.6), false, 20, 0.85);
  }
  // 地面的焦黑烟尘
  c.fx.burst(x, y, gy + 8, 20, SMOKE_LIGHT, r * 1.1, 32, 1.0, false, { flat: true, up: 15, grow: 24, a: 0.6 });
  c.fx.burst(x, y, gy + 40, 14, EMBER, 260, 6, 0.5, true, { up: 300, grav: 300 });
  if (c.cam.visible(e.pos)) c.cam.shake(5);
});

// ---------- W 灵魂盛宴 ----------
/** 施放：影魔脚下一圈暗红冲击环 + 向上的红色魂火 */
registerFx('sf_feast_cast', (e, c) => {
  const u = c.world.getUnit(e.unitId);
  const p = u?.pos ?? e.pos;
  const gy = groundHeight(p.x, p.y);
  c.fx.ring(p.x, p.y, 30, 180, SOUL, 0.45, 18);
  c.fx.burst(p.x, p.y, gy + 60, 18, SOUL, 160, 14, 0.5, false, { up: 140, a: 0.9 });
});

/** 吸取：目标身上冒出的一串红色魂火，沿弧线飞向影魔胸口 */
registerFx('sf_feast', (e, c) => {
  const t = c.world.getUnit(e.targetId);
  const u = c.world.getUnit(e.unitId);
  if (!u) return;
  const from = t?.pos ?? e.pos;
  const fgy = groundHeight(from.x, from.y);
  const fh = fgy + (t ? c.heightOf(t) * 0.55 : 60);
  const th = groundHeight(u.pos.x, u.pos.y) + c.heightOf(u) * 0.55;
  const life = 0.45;
  for (let i = 0; i < 9; i++) {
    const k = rnd(0.85, 1.1);
    const vx = (u.pos.x - from.x) / (life * k);
    const vz = (u.pos.y - from.y) / (life * k);
    const vy = (th - fh) / (life * k) + rnd(40, 120);
    c.fx.emit(from.x + rnd(-10, 10), fh + rnd(-10, 10), from.y + rnd(-10, 10), vx, vy, vz, i % 3 === 0 ? SOUL_LIGHT : SOUL, rnd(12, 18), life * k, false, -8, 0.95);
  }
  c.fx.burst(from.x, from.y, fh, 6, SOUL_DEEP, 90, 12, 0.35, false);
});

/** 灵魂盛宴期间：影魔周身的红色光晕（上升的红色魂火 + 脚下红圈 + 很淡的红色调；不加红色描边：影魔又细又瘦、掠射面多，描边会把整个模型染成一团红） */
registerModifierVisual('sf_feast', (c) => {
  const u = c.u;
  if (!u.alive) return;
  const pulse = 0.5 + 0.5 * Math.sin(c.time * 6);
  c.view?.tint(0xff1a0a, 0.03 + 0.02 * pulse);
  c.decal('sf_feast').set(c.x, c.gy + 2, c.y, Math.max(48, u.radius * 2.2), { color: SOUL, opacity: 0.45 + 0.15 * pulse, width: 10, soft: 8, fill: 0.25 });
  if (c.dt <= 0) return;
  for (let i = 0; i < 2; i++) {
    if (Math.random() > c.dt * 18) continue;
    const a = Math.random() * Math.PI * 2;
    const rr = u.radius * rnd(0.6, 1.4);
    c.fx.emit(c.x + Math.cos(a) * rr, c.gy + c.lift + c.height * rnd(0.1, 0.7), c.y + Math.sin(a) * rr, 0, rnd(60, 110), 0,
      Math.random() < 0.6 ? SOUL : SOUL_LIGHT, rnd(10, 15), rnd(0.4, 0.6), false, -6, 0.9);
  }
});

// ---------- E 魔王降临 ----------
/** 只在影魔脚下画一个小的暗紫色光圈（不画 1200 的大圈）；被破坏时不画 */
registerModifierVisual('sf_presence', (c) => {
  const u = c.u;
  if (!u.alive || u.hasState('breakPassives')) return;
  c.decal('sf_presence').set(c.x, c.gy + 1.5, c.y, Math.max(40, u.radius * 1.9), {
    color: PRESENCE, opacity: 0.5 + 0.1 * Math.sin(c.time * 1.6), width: 5, soft: 3, dash: 9, dashOffset: c.time * 0.05,
  });
});

// ---------- R 魂之挽歌 ----------
/** 魂能段：一小段暗红色的波，离地 42；每帧在波前喷出普通混合的暗红魂火，拖出一条细长的黑红色尾迹 */
registerProjectileStyle('sf_requiem_line', {
  // 不按碰撞宽度缩放：20 道波在 300 外就会首尾相接糊成一个圈；固定成一小段（约 57 宽）的暗红魂能段，每道线都看得清
  mesh: 'wave', color: 0x6a060c, size: 8, height: 42,
  emitter: (c) => {
    // 每道线一个清楚的"头"：普通混合的暗红魂火 + 很小的叠加亮芯
    if (Math.random() < c.dt * 70) {
      c.fx.emit(c.x, c.gy + rnd(36, 50), c.y, c.dir.x * 260, rnd(0, 20), c.dir.y * 260, Math.random() < 0.6 ? SOUL : SOUL_DEEP, rnd(24, 30), 0.14, false, -30, 0.95);
    }
    if (Math.random() < c.dt * 25) c.fx.emit(c.x, c.gy + 44, c.y, c.dir.x * 300, 0, c.dir.y * 300, SOUL_LIGHT, 10, 0.1, true);
    // 细长的黑红尾迹（只铺在线的中间）
    const n = Math.ceil(c.dt * 50);
    for (let i = 0; i < n; i++) {
      const off = (Math.random() * 2 - 1) * Math.min(18, c.width * 0.15);
      const back = rnd(0, 26);
      const x = c.x - c.dir.y * off - c.dir.x * back;
      const y = c.y + c.dir.x * off - c.dir.y * back;
      const r = Math.random();
      const col = r < 0.45 ? SMOKE : r < 0.85 ? SOUL_DEEP : SOUL;
      c.fx.emit(x, c.gy + rnd(20, 60), y, c.dir.x * 60, rnd(15, 45), c.dir.y * 60, col, rnd(14, 22), rnd(0.35, 0.5), false, 10, 0.8);
    }
  },
});

/** 放出：影魔脚下 1000 的冲击环（两层）+ 一圈向外的黑红烟尘 + 震屏 16（死亡时的魂之挽歌也用这个） */
registerFx('sf_requiem', (e, c) => {
  const { x, y } = e.pos;
  const gy = groundHeight(x, y);
  const R = e.radius ?? 1000;
  // 冲击环和魂能段一起扩到 1000（约 1.43 秒）；环很细，不把中间糊成一片红
  c.fx.ring(x, y, 60, R, SOUL, 1.45, 22);
  c.fx.ring(x, y, 40, R * 0.55, SOUL_DEEP, 0.8, 14);
  c.fx.decalFlash(x, y, 140, SOUL_DEEP, 0.4);
  c.fx.burst(x, y, gy + 60, 20, SOUL, 380, 16, 0.5, false, { flat: true, up: 30, a: 0.85 });
  c.fx.burst(x, y, gy + 20, 14, SMOKE, 300, 24, 0.7, false, { flat: true, up: 20, grow: 16, a: 0.6 });
  c.fx.burst(x, y, gy + 90, 16, SOUL_LIGHT, 300, 8, 0.4, true);
  if (c.cam.visible(e.pos, 600)) c.cam.shake(16);
});

/**
 * 蓄力（1.67 秒前摇）：红色魂火按前摇进度从 260 外螺旋汇聚到影魔胸口，越到后面越密、越近；
 * 脚下一个从外向内收缩的暗红圈；影魔的红色描边越来越强。
 */
registerUnitVisual((c) => {
  const u = c.u;
  if (u.defId !== 'shadow_fiend' || u.kind !== 'hero' || !u.alive || !c.view) return;
  const cast = u.cast;
  if (cast && cast.phase === 'point' && cast.ability.def.id === 'sf_requiem') {
    const total = Math.max(0.01, abilityCastPoint(u, cast.ability));
    const k = Math.max(0, Math.min(1, 1 - cast.timer / total));
    c.view.rim(0xff2a14, 0.06 + 0.14 * k);
    c.view.shake(1.5 * k);
    const R = 260 * (1 - 0.75 * k) + 40;
    c.decal('sf_requiem_charge').set(c.x, c.gy + 2, c.y, R, { color: SOUL, opacity: 0.35 + 0.45 * k, width: 10 + 20 * k, soft: 10, fill: 0.15 + 0.25 * k });
    c.decal('sf_requiem_charge2').set(c.x, c.gy + 2.2, c.y, R * 0.6, { color: SOUL_DEEP, opacity: 0.25 + 0.4 * k, width: 6, soft: 4, dash: 12, dashOffset: -c.time * 0.4 });
    if (c.dt > 0) {
      const n = Math.ceil(c.dt * (40 + 140 * k));
      const ch = c.gy + c.lift + c.height * 0.5;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const rr = rnd(0.6, 1) * R + 30;
        const life = rnd(0.3, 0.45);
        // 切向 + 向内的速度：螺旋地汇聚到胸口
        const inward = rr / life;
        const vx = -Math.cos(a) * inward - Math.sin(a) * 240;
        const vz = -Math.sin(a) * inward + Math.cos(a) * 240;
        const h0 = c.gy + rnd(10, 60);
        c.fx.emit(c.x + Math.cos(a) * rr, h0, c.y + Math.sin(a) * rr, vx, (ch - h0) / life, vz,
          Math.random() < 0.3 ? SMOKE : Math.random() < 0.6 ? SOUL : SOUL_LIGHT, rnd(10, 16) * (0.8 + 0.5 * k), life, false, -10, 0.9);
      }
    }
  }
  // 普攻蓄力：右爪聚集红光（右手在身体右前方；sim 坐标 y 向下，朝向顺时针转 90° 是右手边）
  if (u.attack.windup > 0 && c.dt > 0 && Math.random() < c.dt * 28) {
    const f = { x: Math.cos(u.facing), y: Math.sin(u.facing) };
    const side = { x: -f.y, y: f.x };
    c.fx.emit(c.x + side.x * 30 - f.x * 6 + rnd(-5, 5), c.gy + c.lift + c.height * 0.62 + rnd(-5, 5), c.y + side.y * 30 - f.y * 6 + rnd(-5, 5), 0, 30, 0,
      Math.random() < 0.5 ? SOUL_LIGHT : EMBER, rnd(7, 10), 0.22, true, -10);
  }
});

// ---------- 先天 支配死灵 ----------
const ORBS = 6;
let orbMat: ReturnType<typeof makeGlow> | null = null;
let orbCoreMat: ReturnType<typeof makeGlow> | null = null;

function orbGroup(): Group {
  const geo = cachedGeo('sf:orb', () => new IcosahedronGeometry(1, 1));
  // 普通混合的暗红外壳 + 很小的叠加亮芯
  orbMat ??= makeGlow(0xb01418, false, 0.9);
  orbCoreMat ??= makeGlow(0xff5a2a, true, 0.8);
  const g = new Group();
  for (let i = 0; i < ORBS; i++) {
    const m = new Mesh(geo, orbMat);
    m.renderOrder = 9;
    const core = new Mesh(geo, orbCoreMat);
    core.scale.setScalar(0.45);
    core.renderOrder = 10;
    m.add(core);
    g.add(m);
  }
  return g;
}

/** 灵魂：胸口高度环绕的暗红魂球，个数 = ceil(灵魂 / 4)（最多 6 个），每个球拖一点黑红色的烟 */
registerModifierVisual('sf_necromastery', (c) => {
  const u = c.u;
  if (!u.alive) return;
  const n = Math.min(ORBS, Math.ceil(getSouls(u) / 4));
  if (n <= 0) return;
  const g = c.obj('sf_souls', orbGroup);
  const rr = Math.max(40, u.radius * 1.8);
  const h = c.gy + c.lift + c.height * 0.5;
  g.position.set(c.x, h, c.y);
  g.children.forEach((m, i) => {
    m.visible = i < n;
    if (!m.visible) return;
    const a = -c.time * 1.8 + (i / n) * Math.PI * 2;
    m.position.set(Math.cos(a) * rr, Math.sin(c.time * 3 + i * 1.3) * 7, Math.sin(a) * rr);
    m.scale.setScalar(6.5 + Math.sin(c.time * 7 + i * 1.9));
    if (c.dt > 0 && Math.random() < c.dt * 8) {
      c.fx.emit(c.x + m.position.x, h + m.position.y, c.y + m.position.z, 0, 25, 0, Math.random() < 0.5 ? SMOKE_LIGHT : SOUL_DEEP, 9, 0.4, false, 4, 0.7);
    }
  });
});
