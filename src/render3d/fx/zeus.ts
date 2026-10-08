import { groundHeight } from '../coords';
import type { Fx3D, LinePoint } from '../fx3d';
import { registerFx, registerModifierVisual, registerProjectileStyle } from './registry';

/**
 * 宙斯的 3D 特效：蓝白色电球普攻、弧形闪电的折线电弧、雷击从高空劈下的竖直闪电、神圣一跳的电火花圈和电击、
 * 雷神之怒的全屏闪光和每个敌方英雄头顶的天雷、静电场的小电火花、双手周围持续冒出的电弧（挂在先天 zeus_static_field 上）。
 * 闪电都是三层：普通混合的饱和蓝色外层（浅色沙地上也看得清，纯白或叠加混合的会被洗掉）+ 叠加混合的浅蓝中层 + 细的白芯。
 */
const BOLT = 0x2f7fff;
const BOLT_LIGHT = 0x8fd0ff;
const BOLT_CORE = 0xf0faff;
const SPARK = 0x5aa8ff;

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** 三层闪电：width = 外层宽度，jag = 折点振幅 */
function bolt(fx: Fx3D, pts: LinePoint[], width: number, life: number, jag: number, segs: number): void {
  fx.line(pts, BOLT, width, life, { jag, segs, normal: true, flicker: 0.3 });
  fx.line(pts, BOLT_LIGHT, width * 0.5, life * 0.9, { jag: jag * 0.6, segs, flicker: 0.4 });
  fx.line(pts, BOLT_CORE, Math.max(2, width * 0.2), life * 0.8, { jag: jag * 0.35, segs });
}

/** 一小团电火花（普通混合的蓝色碎点 + 几个叠加混合的白芯） */
function sparks(fx: Fx3D, x: number, y: number, h: number, n: number, speed: number, life = 0.3): void {
  fx.burst(x, y, h, n, SPARK, speed, 7, life, false, { a: 0.95 });
  fx.burst(x, y, h, Math.ceil(n / 3), BOLT_CORE, speed * 0.8, 6, life * 0.7, true);
}

// ---------- 普攻 ----------
/** 蓝白色小电球，飞得快；身后拖一截一闪而过的折线电火花 */
registerProjectileStyle('hero:zeus', {
  mesh: 'orb', color: 0x8cccff, size: 22, halo: 60,
  trail: { color: SPARK, every: 0.012, size: 10, additive: false },
  emitter: (c) => {
    if (Math.random() > c.dt * 45) return;
    const back = rnd(30, 55);
    const pts: LinePoint[] = [
      { x: c.x, y: c.y, h: c.h },
      { x: c.x - c.dir.x * back + rnd(-10, 10), y: c.y - c.dir.y * back + rnd(-10, 10), h: c.h + rnd(-10, 10) },
    ];
    c.fx.line(pts, BOLT, 6, 0.08, { jag: 7, segs: 3, normal: true });
    c.fx.line(pts, BOLT_CORE, 2.5, 0.07, { jag: 4, segs: 3 });
  },
});

// ---------- Q 弧形闪电 ----------
/** 一跳：上一个点（第一跳是宙斯指尖）到新目标胸口的抖动电弧 + 目标处的小爆散 */
registerFx('zeus_arc', (e, c) => {
  const t = c.world.getUnit(e.targetId);
  if (!t) return;
  const z = c.world.getUnit(e.unitId);
  const fromZeus = !!z && Math.hypot(z.pos.x - e.pos.x, z.pos.y - e.pos.y) < 1;
  let sx = e.pos.x, sy = e.pos.y, sh = groundHeight(sx, sy) + 70;
  if (z && fromZeus) {
    // 右手食指：身体右前方
    const f = { x: Math.cos(z.facing), y: Math.sin(z.facing) };
    sx += f.x * 40 - f.y * 22;
    sy += f.y * 40 + f.x * 22;
    sh = groundHeight(sx, sy) + 115;
  }
  const th = groundHeight(t.pos.x, t.pos.y) + c.heightOf(t) * 0.55;
  bolt(c.fx, [{ x: sx, y: sy, h: sh }, { x: t.pos.x, y: t.pos.y, h: th }], 15, 0.32, 16, 8);
  sparks(c.fx, t.pos.x, t.pos.y, th, 12, 220);
});

// ---------- W 雷击 ----------
/** 从 900 高空劈到目标的竖直折线闪电 + 地面焦痕和电光 + 震屏；25 级天赋的范围雷击再加一圈冲击环 */
registerFx('zeus_bolt', (e, c) => {
  const t = c.world.getUnit(e.targetId);
  const p = t?.pos ?? e.pos;
  const gy = groundHeight(p.x, p.y);
  const th = gy + (t ? c.heightOf(t) * 0.5 : 60);
  const pts: LinePoint[] = [
    { x: p.x + rnd(-60, 60), y: p.y + rnd(-40, 20), h: gy + 900 },
    { x: p.x + rnd(-30, 30), y: p.y + rnd(-20, 20), h: gy + 450 },
    { x: p.x, y: p.y, h: th },
    { x: p.x, y: p.y, h: gy + 2 },
  ];
  bolt(c.fx, pts, 28, 0.4, 34, 6);
  // 两道细的分叉
  for (let i = 0; i < 2; i++) {
    const a = Math.random() * Math.PI * 2;
    c.fx.line([pts[1], { x: p.x + Math.cos(a) * 90, y: p.y + Math.sin(a) * 90, h: gy + rnd(150, 300) }], BOLT, 7, 0.25, { jag: 20, segs: 5, normal: true });
  }
  c.fx.decalFlash(p.x, p.y, 70, BOLT_LIGHT, 0.35);
  // 焦痕：贴地扩散的深色烟尘
  c.fx.burst(p.x, p.y, gy + 8, 14, 0x2a2e3a, 160, 22, 1.0, false, { flat: true, up: 15, grow: 22, a: 0.5 });
  sparks(c.fx, p.x, p.y, gy + 30, 22, 360, 0.4);
  if (e.radius) {
    c.fx.ring(p.x, p.y, 30, e.radius, BOLT, 0.45, 26);
    c.fx.ring(p.x, p.y, e.radius * 0.6, e.radius, BOLT_LIGHT, 0.35, 10);
  }
  if (c.cam.visible(p)) c.cam.shake(6);
});

// ---------- E 神圣一跳 ----------
/** 起跳点：一圈向外贴地飞散的电火花 + 蓝色冲击环 + 几道贴地的短电弧 */
registerFx('zeus_jump', (e, c) => {
  const { x, y } = e.pos;
  const gy = groundHeight(x, y);
  c.fx.ring(x, y, 20, 170, BOLT, 0.4, 18);
  c.fx.decalFlash(x, y, 60, BOLT_LIGHT, 0.3);
  c.fx.burst(x, y, gy + 10, 26, SPARK, 520, 8, 0.35, false, { flat: true, up: 20 });
  c.fx.burst(x, y, gy + 20, 10, BOLT_CORE, 300, 6, 0.25, true, { up: 60 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.random();
    const r = rnd(90, 150);
    c.fx.line([{ x, y, h: gy + 8 }, { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, h: gy + 6 }], BOLT, 6, 0.22, { jag: 12, segs: 5, normal: true });
  }
});

/** 电击：宙斯身上到目标的折线闪电 + 目标处爆散 */
registerFx('zeus_jump_shock', (e, c) => {
  const z = c.world.getUnit(e.unitId);
  const t = c.world.getUnit(e.targetId);
  if (!z || !t) return;
  const sh = groundHeight(z.pos.x, z.pos.y) + c.heightOf(z) * 0.5;
  const th = groundHeight(t.pos.x, t.pos.y) + c.heightOf(t) * 0.5;
  bolt(c.fx, [{ x: z.pos.x, y: z.pos.y, h: sh }, { x: t.pos.x, y: t.pos.y, h: th }], 13, 0.3, 18, 9);
  sparks(c.fx, t.pos.x, t.pos.y, th, 14, 240);
});

// ---------- R 雷神之怒 ----------
/** 全屏蓝白闪光（0.35 秒内快速闪两次，不挡画面） */
registerFx('zeus_wrath', (_e, c) => {
  c.fx.screenFlash('200,230,255', 0.35, 2);
});

/** 每个敌方英雄头顶劈下的天雷：更粗的竖直闪电 + 光柱 + 冲击环；在画面内时重重震屏 */
registerFx('zeus_wrath_hit', (e, c) => {
  const t = c.world.getUnit(e.targetId);
  const p = t?.pos ?? e.pos;
  const gy = groundHeight(p.x, p.y);
  const th = gy + (t ? c.heightOf(t) : 150);
  const pts: LinePoint[] = [
    { x: p.x + rnd(-40, 40), y: p.y + rnd(-30, 10), h: gy + 1100 },
    { x: p.x + rnd(-40, 40), y: p.y + rnd(-20, 20), h: gy + 600 },
    { x: p.x, y: p.y, h: th },
    { x: p.x, y: p.y, h: gy + 2 },
  ];
  bolt(c.fx, pts, 40, 0.55, 40, 6);
  bolt(c.fx, pts, 22, 0.35, 60, 6);
  c.fx.beam(p.x, p.y, 34, 520, BOLT, 0.45);
  c.fx.ring(p.x, p.y, 20, 220, BOLT, 0.5, 24);
  c.fx.decalFlash(p.x, p.y, 90, BOLT_LIGHT, 0.45);
  c.fx.burst(p.x, p.y, gy + 12, 18, 0x2a2e3a, 200, 26, 1.2, false, { flat: true, up: 15, grow: 24, a: 0.5 });
  sparks(c.fx, p.x, p.y, th * 0.6 + gy * 0.4, 30, 480, 0.5);
  if (c.cam.visible(p)) c.cam.shake(18);
});

// ---------- 先天 静电场 ----------
/** 目标身上一小团电火花 + 一道很短的电弧 */
registerFx('zeus_static', (e, c) => {
  const t = c.world.getUnit(e.targetId);
  const p = t?.pos ?? e.pos;
  const h = groundHeight(p.x, p.y) + (t ? c.heightOf(t) * rnd(0.4, 0.7) : 50);
  sparks(c.fx, p.x, p.y, h, 6, 130, 0.25);
  const a = Math.random() * Math.PI * 2;
  const r = (t?.radius ?? 20) * 1.2;
  c.fx.line([{ x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r, h: h + 18 }, { x: p.x - Math.cos(a) * r, y: p.y - Math.sin(a) * r, h: h - 12 }], BOLT, 5, 0.12, { jag: 8, segs: 4, normal: true });
});

/** 宙斯双手周围一直跳动的细小电弧（挂在先天被动上）；普攻蓄力时右手的电光更密 */
registerModifierVisual('zeus_static_field', (c) => {
  const u = c.u;
  if (!u.alive || u.kind !== 'hero' || c.dt <= 0) return;
  const f = { x: Math.cos(u.facing), y: Math.sin(u.facing) };
  // sim 坐标 y 向下：朝向顺时针转 90° 是右手边
  const side = { x: -f.y, y: f.x };
  const h = c.gy + c.lift + c.height * 0.36;
  const charging = u.attack.windup > 0;
  for (const s of [1, -1]) {
    const hx = c.x + side.x * s * 34 + f.x * 14, hy = c.y + side.y * s * 34 + f.y * 14;
    const rate = s === 1 && charging ? 40 : 10;
    if (Math.random() < c.dt * rate) {
      c.fx.emit(hx + rnd(-6, 6), h + rnd(-6, 8), hy + rnd(-6, 6), rnd(-30, 30), rnd(10, 50), rnd(-30, 30), Math.random() < 0.6 ? SPARK : BOLT_LIGHT, rnd(7, 10), 0.22, false, 0, 0.95);
    }
    if (Math.random() < c.dt * (rate * 0.4)) {
      const a = Math.random() * Math.PI * 2;
      const r = rnd(12, 22);
      c.fx.line(
        [{ x: hx, y: hy, h: h + rnd(-4, 4) }, { x: hx + Math.cos(a) * r, y: hy + Math.sin(a) * r, h: h + rnd(-14, 16) }],
        Math.random() < 0.5 ? BOLT : 0x4a9aff, 5, 0.08, { jag: 5, segs: 3, normal: true },
      );
    }
  }
});
