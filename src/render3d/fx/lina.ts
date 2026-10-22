import { Group, IcosahedronGeometry, Mesh } from 'three';
import { groundHeight } from '../coords';
import { makeGlow } from '../materials';
import { cachedGeo } from '../models/rig';
import { registerAreaVisual, registerFx, registerModifierVisual, registerProjectileStyle, registerUnitVisual } from './registry';

/**
 * 莉娜的 3D 特效：火球普攻、龙破斩的贴地火墙、光击阵的预警圈和火柱、神灭斩的红白闪电和命中爆闪、
 * 炽魂层数（肩部高度环绕的火球）、慢热烧灼（目标身上的小火苗）、发梢持续飘出的火星。
 */
const FIRE = 0xff6a1e;
const FIRE_LIGHT = 0xffb040;
const FIRE_CORE = 0xffe9a0;
const EMBER = 0xff3a12;
const LAGUNA = 0xff2a1a;

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

// ---------- 普攻 ----------
registerProjectileStyle('hero:lina', {
  mesh: 'orb', color: 0xff8a30, size: 17, halo: 54,
  trail: { color: 0xff5a1a, every: 0.012, size: 13, additive: true },
});

// ---------- Q 龙破斩 ----------
/**
 * 贴地推进的火墙：新月形的火焰波（宽度跟随碰撞半径收窄）贴着地面飞，每帧在波前整个宽度上喷出火焰——
 * 深红 / 橙色的普通混合火焰做火墙主体（在浅色地面上也不发白），少量叠加混合的亮黄火芯；火焰向上飘、
 * 带一点向前的速度，在波后面拖出约 300 长、逐渐熄灭的火带。
 */
registerProjectileStyle('lina_dragon_slave', {
  mesh: 'wave', color: 0xff5a14, size: 30, halo: 110, height: 26, scaleWithWidth: true,
  emitter: (c) => {
    const px = -c.dir.y, py = c.dir.x;
    const n = Math.ceil(c.dt * 420);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1;
      const edge = Math.abs(u);
      const off = u * c.width * 1.05;
      const back = rnd(-40, 6);
      const x = c.x + px * off + c.dir.x * back;
      const y = c.y + py * off + c.dir.y * back;
      const tall = 1 - 0.5 * edge;
      if (Math.random() < 0.72) {
        const col = edge > 0.7 ? 0xc81e0c : Math.random() < 0.5 ? 0xff4a10 : 0xff7a1e;
        c.fx.emit(x, c.gy + rnd(6, 70) * tall, y, c.dir.x * 160, rnd(90, 190) * tall, c.dir.y * 160, col, rnd(20, 32), rnd(0.28, 0.42), false, -22, 0.85);
      } else {
        c.fx.emit(x, c.gy + rnd(10, 60) * tall, y, c.dir.x * 200, rnd(110, 200), c.dir.y * 200, Math.random() < 0.5 ? FIRE_CORE : FIRE_LIGHT, rnd(14, 22), rnd(0.18, 0.3), true, -26);
      }
    }
  },
});

/** 出手：双手前方喷出一团火焰 */
registerFx('lina_dragon_slave', (e, c) => {
  const u = c.world.getUnit(e.unitId);
  const d = e.dir ?? { x: 0, y: -1 };
  const p = u?.pos ?? e.pos;
  const x = p.x + d.x * 45, y = p.y + d.y * 45;
  const gy = groundHeight(x, y);
  c.fx.burst(x, y, gy + 100, 22, FIRE_LIGHT, 320, 12, 0.35, true, { up: 40 });
  c.fx.burst(x, y, gy + 100, 10, FIRE_CORE, 180, 9, 0.25, true);
});

// ---------- W 光击阵 ----------
/** 预警圈：外圈红橙色符文虚线（转动），内层发光圆盘在 0.5 秒内从圆心扩到整个范围，圈上冒火星 */
registerAreaVisual('lina_lsa', (e, c) => {
  const k = Math.min(1, e.elapsed / Math.max(0.001, e.duration));
  const gy = Math.max(0, groundHeight(e.pos.x, e.pos.y));
  const r = e.radius;
  c.decal.set(e.pos.x, gy + 3, e.pos.y, r, {
    color: 0xff6a2a, opacity: 0.9, width: 8, dash: 20, dashOffset: -c.time * 0.7, fill: 0.1 + 0.15 * k, soft: 2,
  });
  const ri = Math.max(1, r * (0.08 + 0.92 * k));
  c.extra().set(e.pos.x, gy + 3.5, e.pos.y, ri, { color: 0xff3a14, opacity: 0.3 + 0.4 * k, width: Math.max(6, ri * 0.16), fill: 0.7, soft: 6 });
  if (c.dt <= 0) return;
  const n = Math.ceil(c.dt * 50);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    c.fx.emit(e.pos.x + Math.cos(a) * r, gy + 6, e.pos.y + Math.sin(a) * r, 0, rnd(60, 140), 0, Math.random() < 0.5 ? FIRE : FIRE_LIGHT, rnd(9, 14), 0.4, true, -8);
  }
});

/**
 * 命中：一圈和眩晕范围一样大、只有半人高的火墙 + 中间冲天的火柱、向上爆散的火星、地面焦痕（深色烟尘）、冲击环、震屏。
 * 火柱只占范围的四成、不用 pillar 的白色光芯：按计划用 250 半径的高光柱会把范围里的单位全部照成白色。
 */
registerFx('lina_lsa', (e, c) => {
  const { x, y } = e.pos;
  const gy = groundHeight(x, y);
  const r = e.radius ?? 250;
  c.fx.beam(x, y, r * 0.95, 100, 0xff3a10, 0.32);
  c.fx.beam(x, y, r * 0.4, 430, 0xff5a14, 0.5);
  c.fx.beam(x, y, r * 0.14, 470, FIRE_LIGHT, 0.4);
  c.fx.decalFlash(x, y, r * 0.8, 0xff6a1e, 0.4);
  c.fx.ring(x, y, r * 0.3, r * 1.1, FIRE, 0.45, 36);
  c.fx.burst(x, y, gy + 40, 40, 0xff6a1e, 480, 14, 0.7, false, { up: 360, grav: 380, a: 0.9 });
  c.fx.burst(x, y, gy + 30, 22, FIRE_CORE, 300, 11, 0.5, true, { up: 260 });
  c.fx.burst(x, y, gy + 10, 22, 0x2a1a14, r * 1.2, 30, 1.2, false, { flat: true, up: 20, grow: 26, a: 0.55 });
  if (c.cam.visible(e.pos)) c.cam.shake(6);
});

// ---------- R 神灭斩 ----------
/** 施放：从莉娜双手到目标的红白色折线闪电（抖动）+ 手上的爆闪 */
registerFx('lina_laguna', (e, c) => {
  const u = c.world.getUnit(e.unitId);
  const t = c.world.getUnit(e.targetId);
  if (!u) return;
  const f = { x: Math.cos(u.facing), y: Math.sin(u.facing) };
  const sx = u.pos.x + f.x * 32, sy = u.pos.y + f.y * 32;
  const sh = groundHeight(sx, sy) + 105;
  const tp = t?.pos ?? e.pos;
  const th = groundHeight(tp.x, tp.y) + (t ? c.heightOf(t) * 0.55 : 90);
  const pts = [{ x: sx, y: sy, h: sh }, { x: tp.x, y: tp.y, h: th }];
  c.fx.line(pts, LAGUNA, 30, 0.5, { jag: 20, segs: 9 });
  c.fx.line(pts, 0xff9a80, 16, 0.42, { jag: 14, segs: 9 });
  c.fx.line(pts, 0xffffff, 7, 0.36, { jag: 8, segs: 9 });
  // 两道细的分叉
  for (let i = 0; i < 2; i++) c.fx.line(pts, 0xff5a40, 5, 0.3, { jag: 34, segs: 7 });
  c.fx.burst(sx, sy, sh, 18, 0xffd0c0, 260, 10, 0.3, true);
});

/** 命中：目标处大爆闪 + 红色光柱 + 火星 + 震屏；打到玩家或玩家放的，全屏轻微红闪 */
registerFx('lina_laguna_hit', (e, c) => {
  const t = c.world.getUnit(e.targetId);
  const p = t?.pos ?? e.pos;
  const gy = groundHeight(p.x, p.y);
  const h = gy + (t ? c.heightOf(t) * 0.55 : 90);
  c.fx.pillar(p.x, p.y, 75, 460, LAGUNA, 0.55);
  c.fx.ring(p.x, p.y, 20, 240, 0xff5a40, 0.45, 30);
  c.fx.burst(p.x, p.y, h, 48, 0xff6a50, 560, 12, 0.6, true, { grav: 300 });
  c.fx.burst(p.x, p.y, h, 20, 0xffffff, 340, 10, 0.35, true);
  if (c.cam.visible(p)) c.cam.shake(14);
  if (c.playerId !== null && (e.targetId === c.playerId || e.unitId === c.playerId)) c.fx.screenFlash('255,40,30', 0.28);
});

// ---------- E 炽魂 ----------
const ORBS = 7;
let orbMat: ReturnType<typeof makeGlow> | null = null;

function orbGroup(): Group {
  const geo = cachedGeo('lina:orb', () => new IcosahedronGeometry(1, 1));
  // 普通混合的橙色火球（叠加混合在浅色地面上会发白）
  orbMat ??= makeGlow(0xff7a1e, false);
  const g = new Group();
  for (let i = 0; i < ORBS; i++) {
    const m = new Mesh(geo, orbMat);
    m.renderOrder = 9;
    g.add(m);
  }
  return g;
}

/** 层数：肩部高度环绕的火焰小球，个数 = 层数，每个球拖一点火星 */
registerModifierVisual('lina_fiery_soul_stack', (c) => {
  if (!c.u.alive) return;
  const g = c.obj('lina_fiery_soul', orbGroup);
  const n = Math.min(ORBS, c.m.stacks);
  const rr = Math.max(42, c.u.radius * 1.9);
  const h = c.gy + c.lift + c.height * 0.62;
  const fade = Math.min(1, c.m.duration / 0.8);
  g.position.set(c.x, h, c.y);
  g.children.forEach((m, i) => {
    m.visible = i < n;
    if (!m.visible) return;
    const a = c.time * 2.6 + (i / n) * Math.PI * 2;
    m.position.set(Math.cos(a) * rr, Math.sin(c.time * 4 + i) * 5, Math.sin(a) * rr);
    m.scale.setScalar((7 + Math.sin(c.time * 9 + i * 1.7)) * Math.max(0.3, fade));
    if (c.dt > 0 && Math.random() < c.dt * 12) {
      c.fx.emit(c.x + m.position.x, h + m.position.y, c.y + m.position.z, 0, 40, 0, Math.random() < 0.5 ? FIRE : FIRE_LIGHT, 8, 0.3, true, -10);
    }
  });
});

// ---------- 先天 慢热 ----------
/** 烧灼：目标身上不断冒出的小火苗 */
registerModifierVisual('lina_slow_burn_dot', (c) => {
  if (!c.u.alive || c.dt <= 0) return;
  const n = Math.random() < c.dt * 22 ? 1 : 0;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const rr = c.u.radius * rnd(0.2, 0.8);
    c.fx.emit(c.x + Math.cos(a) * rr, c.gy + c.lift + c.height * rnd(0.15, 0.8), c.y + Math.sin(a) * rr, 0, rnd(60, 110), 0,
      Math.random() < 0.4 ? FIRE_LIGHT : Math.random() < 0.6 ? FIRE : EMBER, rnd(10, 15), 0.45, true, -12);
  }
});

// ---------- 发梢的火星、普攻蓄力时掌心变亮 ----------
registerUnitVisual((c) => {
  const u = c.u;
  if (u.defId !== 'lina' || u.kind !== 'hero' || !u.alive || c.dt <= 0 || !c.view) return;
  const f = { x: Math.cos(u.facing), y: Math.sin(u.facing) };
  if (Math.random() < c.dt * 7) {
    // 马尾垂在背后：头后方、肩膀到腰之间
    const back = rnd(24, 40);
    c.fx.emit(c.x - f.x * back + rnd(-6, 6), c.gy + c.lift + c.height * rnd(0.4, 0.72), c.y - f.y * back + rnd(-6, 6), 0, rnd(40, 80), 0,
      Math.random() < 0.5 ? FIRE_LIGHT : FIRE, rnd(7, 10), 0.5, true, -6);
  }
  if (u.attack.windup > 0 && Math.random() < c.dt * 30) {
    // 右手在身体右前方（sim 坐标 y 向下：朝向顺时针转 90° 是右手边）
    const side = { x: -f.y, y: f.x };
    c.fx.emit(c.x + side.x * 22 + f.x * 12, c.gy + c.lift + c.height * 0.38, c.y + side.y * 22 + f.y * 12, 0, 50, 0, FIRE_CORE, 11, 0.25, true, -14);
  }
});
