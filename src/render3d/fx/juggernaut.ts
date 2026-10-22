import { groundHeight } from '../coords';
import type { LinePoint } from '../fx3d';
import { registerFx, registerModifierVisual } from './registry';
import { registerCalmCamera } from '../../render/cameraHints';

/**
 * 主宰的 3D 特效：剑刃风暴（贴地旋转的橙金色旋风圈 + 被卷起的尘土 / 叶片 / 刀光粒子）、治疗守卫（放下时的绿色光爆、
 * 脚下 400 的淡绿色圈、火焰飘出的绿色火星）、无敌斩（目标处的橙色斩击弧、起点到终点一串橙色残影、主宰半透明并拖橙色残影）。
 * 浅色沙地上叠加混合会发白：旋风圈、刀光、绿色火焰都用普通混合的饱和色，只有很小的亮芯用叠加。
 */
const GOLD = 0xf0a020;
const ORANGE = 0xe86a10;
const ORANGE_DEEP = 0xa83c08;
const DUST = 0x9a7a4a;
const LEAF = 0x5a8a2a;
const WARD_GREEN = 0x2fc23e;
const WARD_DEEP = 0x128a20;
const WARD_PALE = 0x8ee88a;

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

// ---------- Q 剑刃风暴 ----------
/** 施放：脚下一圈橙金色的冲击环 + 向外甩出的刀光碎片 */
registerFx('jugg_blade_fury', (e, c) => {
  const u = c.world.getUnit(e.unitId);
  const p = u?.pos ?? e.pos;
  const gy = groundHeight(p.x, p.y);
  c.fx.decalFlash(p.x, p.y, 120, ORANGE, 0.3);
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2;
    const sp = rnd(260, 420);
    // 切向 + 向外：像被甩出去的刀光
    c.fx.emit(p.x + Math.cos(a) * 30, gy + rnd(40, 80), p.y + Math.sin(a) * 30, (Math.cos(a) - Math.sin(a) * 0.8) * sp, rnd(-10, 30), (Math.sin(a) + Math.cos(a) * 0.8) * sp,
      Math.random() < 0.5 ? GOLD : ORANGE, rnd(12, 18), rnd(0.25, 0.4), false, -10);
  }
  c.fx.burst(p.x, p.y, gy + 60, 8, 0xfff0c0, 200, 5, 0.2, true);
});

/**
 * 旋转中：260 的贴地旋风圈（两层反向转动的橙金色虚线环 + 很淡的填充），绕着主宰旋转的刀光、被卷起来的尘土和叶片。
 * 都是普通混合，不会在浅色沙地上洗白。
 */
registerModifierVisual('jugg_blade_fury', (c) => {
  const u = c.u;
  if (!u.alive) return;
  const R = c.m.data.radius || 260;
  const fadeIn = Math.min(1, (c.m.total - c.m.duration) / 0.25);
  const fadeOut = Math.min(1, c.m.duration / 0.3);
  const k = Math.min(fadeIn, fadeOut);
  const gy = c.gy + 1.6;
  c.decal('jugg_fury_outer').set(c.x, gy, c.y, R, { color: ORANGE, opacity: 0.75 * k, width: 12, dash: 9, dashOffset: -c.time * 2.4, soft: 4, fill: 0.1 });
  c.decal('jugg_fury_inner').set(c.x, gy + 0.2, c.y, R * 0.62, { color: GOLD, opacity: 0.7 * k, width: 9, dash: 6, dashOffset: c.time * 3.2, soft: 4 });
  c.decal('jugg_fury_core').set(c.x, gy + 0.4, c.y, R * 0.3, { color: ORANGE_DEEP, opacity: 0.35 * k, width: 26, soft: 10, fill: 0.25 });
  c.view?.rim(0xffb040, 0.2);
  if (c.dt <= 0) return;
  // 刀光：贴着 0.3–1 倍半径、沿切向飞的橙金色短线粒子
  const spinDir = 1;
  for (let i = 0; i < 3; i++) {
    if (Math.random() > c.dt * 70) continue;
    const a = Math.random() * Math.PI * 2;
    const r = rnd(0.3, 1) * R;
    const sp = rnd(360, 520) * spinDir;
    c.fx.emit(c.x + Math.cos(a) * r, c.gy + rnd(25, 85), c.y + Math.sin(a) * r, -Math.sin(a) * sp, rnd(-10, 20), Math.cos(a) * sp,
      Math.random() < 0.55 ? GOLD : ORANGE, rnd(10, 15), rnd(0.18, 0.3), false, -12);
  }
  // 卷起的尘土（贴地、变大、慢慢淡出）
  if (Math.random() < c.dt * 22) {
    const a = Math.random() * Math.PI * 2;
    const r = rnd(0.5, 1) * R;
    const sp = rnd(180, 260);
    c.fx.emit(c.x + Math.cos(a) * r, c.gy + rnd(5, 25), c.y + Math.sin(a) * r, -Math.sin(a) * sp, rnd(20, 60), Math.cos(a) * sp, DUST, rnd(22, 34), rnd(0.5, 0.8), false, 30, 0.45);
  }
  // 被卷起的叶片
  if (Math.random() < c.dt * 14) {
    const a = Math.random() * Math.PI * 2;
    const r = rnd(0.4, 0.95) * R;
    const sp = rnd(260, 340);
    c.fx.emit(c.x + Math.cos(a) * r, c.gy + rnd(20, 110), c.y + Math.sin(a) * r, -Math.sin(a) * sp, rnd(40, 120), Math.cos(a) * sp, Math.random() < 0.5 ? LEAF : 0x8aa83a, rnd(7, 10), rnd(0.5, 0.8), false, 0);
  }
  // 中心一点亮芯（叠加，很小）
  if (Math.random() < c.dt * 20) c.fx.emit(c.x + rnd(-20, 20), c.gy + rnd(50, 90), c.y + rnd(-20, 20), 0, 0, 0, 0xfff0c0, 7, 0.15, true);
});

// ---------- W 治疗守卫 ----------
/** 放下守卫：绿色光爆 + 贴地闪光 + 从地面升起的绿色火星 */
registerFx('jugg_healing_ward', (e, c) => {
  const w = c.world.getUnit(e.unitId);
  const p = w?.pos ?? e.pos;
  const gy = groundHeight(p.x, p.y);
  c.fx.decalFlash(p.x, p.y, 90, WARD_GREEN, 0.4);
  for (let i = 0; i < 22; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = rnd(60, 160);
    c.fx.emit(p.x + Math.cos(a) * 20, gy + rnd(10, 60), p.y + Math.sin(a) * 20, Math.cos(a) * sp, rnd(80, 200), Math.sin(a) * sp,
      Math.random() < 0.5 ? WARD_GREEN : WARD_DEEP, rnd(12, 18), rnd(0.4, 0.7), false, -8);
  }
  c.fx.burst(p.x, p.y, gy + 70, 8, 0xe8ffe0, 140, 5, 0.25, true);
});

/** 守卫：脚下 400 的淡绿色回复范围圈（慢慢转动的虚线 + 很淡的填充），火焰顶上不停飘出绿色火星 */
registerModifierVisual('jugg_healing_ward_heal', (c) => {
  const u = c.u;
  if (!u.alive) return;
  const R = c.m.data.radius || 400;
  const pulse = 0.5 + 0.5 * Math.sin(c.time * 2.5 + u.id);
  c.decal('jugg_ward_range').set(c.x, c.gy + 1.4, c.y, R, { color: WARD_GREEN, opacity: 0.55 + 0.1 * pulse, width: 9, dash: 28, dashOffset: c.time * 0.25, soft: 3, fill: 0.1 });
  c.decal('jugg_ward_base').set(c.x, c.gy + 1.6, c.y, 44, { color: WARD_GREEN, opacity: 0.45 + 0.2 * pulse, width: 8, soft: 6, fill: 0.2 });
  if (c.dt <= 0) return;
  const top = c.gy + 145;
  if (Math.random() < c.dt * 16) {
    c.fx.emit(c.x + rnd(-6, 6), top + rnd(0, 10), c.y + rnd(-6, 6), rnd(-12, 12), rnd(50, 90), rnd(-12, 12), Math.random() < 0.6 ? WARD_GREEN : WARD_PALE, rnd(8, 12), rnd(0.5, 0.8), false, -8);
  }
  if (Math.random() < c.dt * 6) c.fx.emit(c.x, top + 4, c.y, 0, 40, 0, 0xf0fff0, 5, 0.3, true, -4);
});

// ---------- R 无敌斩 ----------
/**
 * 一道斜向的斩痕（面向镜头、略微弯曲的折线）：中心 (x, y, h)，半长 r，ang = 屏幕上的倾斜角（弧度）。
 * 屏幕的左右 = sim 的 x，上下 = 世界高度 + 往北（俯视镜头下高度被压扁，上端同时往北移）。
 */
function slashPoints(x: number, y: number, h: number, r: number, ang: number): LinePoint[] {
  const pts: LinePoint[] = [];
  const cx = Math.cos(ang);
  const sy = Math.sin(ang);
  for (let i = 0; i <= 8; i++) {
    const t = i / 8 - 0.5;
    const bow = (0.25 - t * t) * r * 0.6;
    const along = t * 2 * r;
    const sx = along * cx - bow * sy * 0.7;
    const up = along * sy + bow * cx * 0.7;
    pts.push({ x: x + sx, y: y - up * 0.45, h: h + up * 1.1 });
  }
  return pts;
}

/** 一斩：目标身上一道橙色斩弧（普通混合的饱和橙 + 细亮芯）、火星；起点到终点一串橙色残影粒子；涉及玩家时轻微震屏 */
registerFx('jugg_omnislash', (e, c) => {
  const t = c.world.getUnit(e.targetId);
  const j = c.world.getUnit(e.unitId);
  const tp = t?.pos ?? e.pos;
  // 斩痕画在目标朝向主宰的一侧、略靠镜头（不被目标的模型挡住）
  const toward = j ? { x: j.pos.x - tp.x, y: j.pos.y - tp.y } : { x: 0, y: 1 };
  const len = Math.hypot(toward.x, toward.y) || 1;
  const off = (t?.radius ?? 24) * 0.7;
  const p = { x: tp.x + (toward.x / len) * off, y: tp.y + (toward.y / len) * off + 16 };
  const gy = groundHeight(p.x, p.y);
  const h = gy + (t ? c.heightOf(t) * 0.5 : 70);
  // 斜向的一刀（±30°–60°，不画成水平的一条横杠）
  const ang = (Math.random() < 0.5 ? 1 : -1) * rnd(0.5, 1.05);
  const pts = slashPoints(p.x, p.y, h, 95, ang);
  c.fx.line(pts, 0xd8500c, 30, 0.4, { normal: true });
  c.fx.line(pts, 0xffb030, 13, 0.32, { normal: true });
  c.fx.line(pts, 0xfff6e0, 4, 0.22);
  c.fx.decalFlash(tp.x, tp.y, 60, ORANGE, 0.25);
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = rnd(120, 300);
    c.fx.emit(p.x, h + rnd(-15, 15), p.y, Math.cos(a) * sp, rnd(0, 120), Math.sin(a) * sp, Math.random() < 0.5 ? GOLD : ORANGE, rnd(8, 13), rnd(0.25, 0.45), false, -6);
  }
  c.fx.burst(p.x, p.y, h, 4, 0xfff0c0, 160, 5, 0.15, true);
  // 起点 → 终点：一串橙色残影（人形高度的竖排粒子，越靠近终点越亮）
  if (j) {
    const from = e.pos;
    const to = j.pos;
    const d = Math.hypot(to.x - from.x, to.y - from.y);
    const n = Math.max(2, Math.round(d / 22));
    const hh = c.heightOf(j);
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      const x = from.x + (to.x - from.x) * k;
      const y = from.y + (to.y - from.y) * k;
      const g = groundHeight(x, y);
      for (const f of [0.25, 0.5, 0.75]) {
        c.fx.emit(x + rnd(-4, 4), g + hh * f, y + rnd(-4, 4), 0, rnd(0, 10), 0, k > 0.6 ? GOLD : ORANGE, rnd(16, 22) * (0.6 + 0.4 * k), 0.22 + 0.2 * k, false, -10, 0.55);
      }
    }
  }
  if (c.playerId !== null && (e.unitId === c.playerId || e.targetId === c.playerId)) c.cam.shake(4);
});

/** 无敌斩期间镜头松跟随：主宰在 425 范围里来回闪烁，镜头不跟着每一斩来回摆 */
registerCalmCamera('jugg_omnislash');

/** 无敌斩中：模型半透明 0.6、橙色描边，身后拖出橙色残影粒子 */
registerModifierVisual('jugg_omnislash', (c) => {
  const u = c.u;
  if (!u.alive) return;
  c.view?.opacity(0.6);
  c.view?.rim(0xff8a20, 1);
  c.view?.tint(0xff7a10, 0.18);
  c.decal('jugg_omni').set(c.x, c.gy + 1.6, c.y, 60, { color: ORANGE, opacity: 0.7, width: 10, soft: 6, fill: 0.15 });
  if (c.dt <= 0) return;
  for (let i = 0; i < 3; i++) {
    if (Math.random() > c.dt * 50) continue;
    c.fx.emit(c.x + rnd(-16, 16), c.gy + c.lift + c.height * rnd(0.15, 0.85), c.y + rnd(-16, 16), 0, rnd(0, 15), 0,
      Math.random() < 0.6 ? ORANGE : GOLD, rnd(20, 28), rnd(0.3, 0.45), false, -8, 0.65);
  }
});
