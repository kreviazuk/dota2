import { groundHeight } from '../coords';
import type { LinePoint } from '../fx3d';
import { registerFx, registerModifierVisual, registerProjectileStyle } from './registry';

/**
 * 幻影刺客的 3D 特效：窒碍短匕的旋转飞刀（紫白拖尾）、幻影突袭起点和终点的紫色烟雾（叠加在通用闪烁之上）、
 * 魅影无形的紫色闪烁爆散和身后的淡紫色残影、致命专注时双手冒出的红色火花、恩赐解脱暴击时目标处的红色交叉斩弧和血雾。
 * 浅色沙地上叠加混合会发白：紫色烟雾、残影、红色斩弧和血雾都用普通混合的饱和色，只有很小的亮芯用叠加。
 */
const PURPLE = 0x8a4ec8;
const PURPLE_DEEP = 0x4a1f78;
const LAVENDER = 0xc9b0e6;
const BLOOD = 0xc0101a;
const BLOOD_DEEP = 0x6a0610;
const CRIT_RED = 0xff2a1a;

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

// ---------- Q 窒碍短匕 ----------
/** 旋转的银紫色飞刀：淡紫光晕，拖出普通混合的紫色轨迹和少量叠加的白色亮点 */
registerProjectileStyle('pa_dagger', {
  mesh: 'dagger', color: 0xe6def4, size: 24, halo: 30, spin: 22, arc: 18,
  trail: { color: PURPLE, every: 0.006, size: 9, additive: false },
  emitter: (c) => {
    if (Math.random() < c.dt * 30) c.fx.emit(c.x + rnd(-3, 3), c.h + rnd(-3, 3), c.y + rnd(-3, 3), 0, rnd(0, 10), 0, LAVENDER, rnd(6, 9), 0.35, false, 6, 0.8);
    if (Math.random() < c.dt * 16) c.fx.emit(c.x, c.h, c.y, 0, 0, 0, 0xffffff, 5, 0.18, true, -6);
  },
});

/** 出手：右手处一小团淡紫色闪光 */
registerFx('pa_stifling_dagger', (e, c) => {
  const u = c.world.getUnit(e.unitId);
  const p = u?.pos ?? e.pos;
  const f = u?.facing ?? 0;
  // 右手边（sim 坐标 y 向下：朝向顺时针转 90° 是右手边）稍靠前
  const x = p.x + Math.cos(f) * 20 - Math.sin(f) * 22;
  const y = p.y + Math.sin(f) * 20 + Math.cos(f) * 22;
  const h = groundHeight(x, y) + (u ? c.heightOf(u) * 0.62 : 110);
  c.fx.burst(x, y, h, 10, LAVENDER, 180, 7, 0.3, false, { up: 20 });
  c.fx.burst(x, y, h, 4, 0xffffff, 100, 5, 0.18, true);
});

// ---------- W 幻影突袭 ----------
/** 一团紫色烟雾 + 贴地闪光（k = 大小） */
function smokePuff(c: Parameters<Parameters<typeof registerFx>[1]>[1], x: number, y: number, k: number): void {
  const gy = groundHeight(x, y);
  // 翻滚上升的烟团：越往外越深、越大
  for (let i = 0; i < Math.round(26 * k); i++) {
    const a = Math.random() * Math.PI * 2;
    const r = rnd(0, 50);
    const sp = rnd(40, 120);
    c.fx.emit(x + Math.cos(a) * r, gy + rnd(5, 120), y + Math.sin(a) * r, Math.cos(a) * sp, rnd(30, 90), Math.sin(a) * sp,
      r > 25 || Math.random() < 0.35 ? PURPLE_DEEP : PURPLE, rnd(20, 32) * k, rnd(0.5, 0.8), false, 36, 0.65);
  }
  c.fx.burst(x, y, gy + 60, Math.round(8 * k), LAVENDER, 160, 7, 0.35, false, { up: 30 });
  c.fx.decalFlash(x, y, 70 * k, PURPLE, 0.4);
}

/** 起点和终点（幻刺落地的位置）各一团紫色烟雾 */
registerFx('pa_phantom_strike', (e, c) => {
  smokePuff(c, e.pos.x, e.pos.y, 0.8);
  const u = c.world.getUnit(e.unitId);
  if (u) smokePuff(c, u.pos.x, u.pos.y, 1);
});

// ---------- R 恩赐解脱 ----------
/**
 * 一道斜向的斩痕（面向镜头、略微弯曲的折线）：中心 (x, y, h)，半长 r，s = 1 从左上斩到右下，−1 从右上斩到左下。
 * 屏幕的左右 = sim 的 x，上下 = 世界高度 + 往北（俯视镜头下高度被压扁，上端同时往北移，看起来才是一道够陡的斜线）。
 */
function slashPoints(x: number, y: number, h: number, r: number, s: number): LinePoint[] {
  const pts: LinePoint[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8 - 0.5;
    const bow = (0.25 - t * t) * r * 0.5;
    const up = -t * 2 * r;
    pts.push({ x: x + s * t * 2 * r + s * bow * 0.7, y: y - up * 0.45, h: h + up * 1.1 + bow * 0.7 });
  }
  return pts;
}

/** 暴击：目标身上两道交叉的红色斩弧（普通混合的饱和红 + 细的亮芯）、喷出的血雾和火星；涉及玩家时震屏 10 */
registerFx('pa_crit', (e, c) => {
  const t = c.world.getUnit(e.targetId);
  const a = c.world.getUnit(e.unitId);
  const tp = t?.pos ?? e.pos;
  // 斩痕画在目标朝向幻刺的一侧、略靠镜头（不被目标的模型挡住）
  const toward = a ? { x: a.pos.x - tp.x, y: a.pos.y - tp.y } : { x: 0, y: 1 };
  const len = Math.hypot(toward.x, toward.y) || 1;
  const off = (t?.radius ?? 24) * 0.8;
  const p = { x: tp.x + (toward.x / len) * off, y: tp.y + (toward.y / len) * off + 18 };
  const gy = groundHeight(p.x, p.y);
  const h = gy + (t ? c.heightOf(t) * 0.55 : 70);
  const r = 78;
  for (const s of [1, -1]) {
    const pts = slashPoints(p.x, p.y, h, r, s);
    c.fx.line(pts, 0xd01818, 28, 0.42, { normal: true });
    c.fx.line(pts, 0xff5030, 11, 0.34, { normal: true });
    c.fx.line(pts, 0xffe8e0, 3.5, 0.22);
  }
  // 血雾：深红 / 红色的普通混合粒子向四周喷开，慢慢落下
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = rnd(60, 260);
    c.fx.emit(p.x, h + rnd(-20, 20), p.y, Math.cos(a) * sp, rnd(-20, 110), Math.sin(a) * sp, Math.random() < 0.5 ? BLOOD : BLOOD_DEEP, rnd(14, 26), rnd(0.45, 0.8), false, 20, 0.9);
  }
  c.fx.burst(p.x, p.y, h, 8, 0xffe0c0, 260, 5, 0.2, true);
  c.fx.decalFlash(p.x, p.y, 60, BLOOD, 0.35);
  if (c.playerId !== null && (e.unitId === c.playerId || e.targetId === c.playerId)) c.cam.shake(10);
});

/** 致命专注（下一刀必定暴击）：两只手的位置不停冒出红色火花 */
registerModifierVisual('pa_deadly_focus', (c) => {
  const u = c.u;
  if (!u.alive || c.dt <= 0) return;
  const f = u.facing;
  const fwd = { x: Math.cos(f), y: Math.sin(f) };
  const right = { x: -fwd.y, y: fwd.x };
  const h = c.gy + c.lift + c.height * 0.42;
  for (const s of [1, -1]) {
    if (Math.random() > c.dt * 50) continue;
    const x = c.x + right.x * 26 * s + fwd.x * 16 + rnd(-5, 5);
    const y = c.y + right.y * 26 * s + fwd.y * 16 + rnd(-5, 5);
    c.fx.emit(x, h + rnd(-8, 8), y, rnd(-30, 30), rnd(50, 120), rnd(-30, 30), Math.random() < 0.6 ? CRIT_RED : BLOOD, rnd(11, 16), 0.42, false, -10);
    if (Math.random() < 0.4) c.fx.emit(x, h, y, 0, rnd(30, 60), 0, 0xffc0a0, 6, 0.22, true, -5);
  }
});

// ---------- X1 魅影无形 ----------
/** 施放：紫色的闪烁爆散（几圈向外散开的烟雾和淡紫碎光） */
registerFx('pa_blur', (e, c) => {
  const u = c.world.getUnit(e.unitId);
  const p = u?.pos ?? e.pos;
  const gy = groundHeight(p.x, p.y);
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2 + rnd(-0.1, 0.1);
    const sp = rnd(120, 240);
    c.fx.emit(p.x, gy + rnd(20, 130), p.y, Math.cos(a) * sp, rnd(-10, 40), Math.sin(a) * sp, Math.random() < 0.4 ? PURPLE_DEEP : PURPLE, rnd(18, 28), rnd(0.35, 0.55), false, 24, 0.7);
  }
  c.fx.burst(p.x, p.y, gy + 80, 16, LAVENDER, 220, 7, 0.4, false, { up: 30 });
  c.fx.burst(p.x, p.y, gy + 80, 6, 0xffffff, 140, 5, 0.2, true);
  c.fx.ring(p.x, p.y, 20, 140, PURPLE, 0.4, 14);
});

/** 模糊中：身后拖出淡紫色的残影粒子（移动越快越多），身上一点紫色 */
registerModifierVisual('pa_blur', (c) => {
  const u = c.u;
  if (!u.alive) return;
  c.view?.tint(0x8a4ec8, 0.12);
  if (c.dt <= 0) return;
  const moving = Math.hypot(u.pos.x - u.prevPos.x, u.pos.y - u.prevPos.y) > 0.5;
  if (Math.random() > c.dt * (moving ? 40 : 10)) return;
  const f = u.facing;
  const back = { x: -Math.cos(f), y: -Math.sin(f) };
  const d = rnd(8, 26);
  c.fx.emit(c.x + back.x * d + rnd(-10, 10), c.gy + c.lift + c.height * rnd(0.15, 0.85), c.y + back.y * d + rnd(-10, 10), 0, rnd(-5, 10), 0,
    Math.random() < 0.6 ? LAVENDER : PURPLE, rnd(16, 26), rnd(0.35, 0.55), false, 10, 0.55);
});
