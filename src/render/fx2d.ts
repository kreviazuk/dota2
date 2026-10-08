import type { SimEvent } from '../sim/core/events';
import type { World } from '../sim/world';
import type { Unit } from '../sim/entities/unit';
import type { ModifierInstance } from '../sim/modifiers';
import type { FxSystem } from './fx';
import type { ViewCamera } from './view';

/**
 * 2D 后备渲染器的特效注册表：sim 的 fx 事件和弹道外观。各英雄任务在这里注册自己的 2D 表现（简单的圈 / 粒子 / 颜色）；
 * 查不到时 FxSystem 走内置分支（默认白圈），drawProjectile 走 P1 的法球。
 */
export type FxEvent2D = Extract<SimEvent, { type: 'fx' }>;
export type Fx2DHandler = (fx: FxSystem, e: FxEvent2D, world: World, cam: ViewCamera) => void;

const FX = new Map<string, Fx2DHandler>();

export function registerFx2D(kind: string, h: Fx2DHandler): void {
  FX.set(kind, h);
}

/** 查不到时返回 undefined（调用方走默认分支） */
export const lookupFx2D = (kind: string): Fx2DHandler | undefined => FX.get(kind);

export interface Projectile2DStyle { color: string; size: number; shape?: 'orb' | 'line' | 'arrow' | 'wave' }

const PROJ = new Map<string, Projectile2DStyle>();

/** visual = Projectile.visual，英雄普攻是 'hero:<id>' */
export function registerProjectile2D(visual: string, s: Projectile2DStyle): void {
  PROJ.set(visual, s);
}

export const lookupProjectile2D = (visual: string): Projectile2DStyle | undefined => PROJ.get(visual);

/** 持续的 Modifier 外观（贴地画在单位脚下，和缠绕 / 减速圈同一层）；(x, y) 是单位位置 */
export type Modifier2D = (ctx: CanvasRenderingContext2D, u: Unit, m: ModifierInstance, x: number, y: number, t: number) => void;

const MODS = new Map<string, Modifier2D>();

export function registerModifier2D(modifierId: string, v: Modifier2D): void {
  MODS.set(modifierId, v);
}

export const lookupModifier2D = (modifierId: string): Modifier2D | undefined => MODS.get(modifierId);

// ---------- 通用 ----------
/** 闪烁：起点和终点各一团粒子 + 圈 */
registerFx2D('blink', (fx, e) => {
  const to = { x: e.pos.x + (e.dir?.x ?? 0), y: e.pos.y + (e.dir?.y ?? 0) };
  for (const p of [e.pos, to]) {
    fx.burst(p.x, p.y, 16, 'rgba(200,180,255,0.95)', 200, 6, 0.45);
    fx.ring(p.x, p.y, 10, 80, 'rgba(170,150,255,', 0.4, 8);
  }
});

/** 分裂：朝攻击方向的扇形斩痕 */
registerFx2D('cleave', (fx, e, world) => {
  const u = world.getUnit(e.unitId);
  const p = u?.pos ?? e.pos;
  const d = e.dir ?? { x: Math.cos(u?.facing ?? 0), y: Math.sin(u?.facing ?? 0) };
  fx.arc(p.x, p.y, Math.atan2(d.y, d.x), 1.1, (e.radius ?? 400) * 0.8, 'rgba(255,200,140,', 0.3, 14);
});

// ---------- 斯温 ----------
registerProjectile2D('sven_hammer', { color: '#7cc8ff', size: 10, shape: 'orb' });

registerFx2D('sven_storm_hammer', (fx, e) => {
  fx.burst(e.pos.x, e.pos.y, 10, 'rgba(190,230,255,0.95)', 160, 5, 0.3);
});

/** 锤击：蓝圈扩到眩晕半径 + 电火花 */
registerFx2D('sven_hammer_hit', (fx, e, _w, cam) => {
  const r = e.radius ?? 250;
  fx.ring(e.pos.x, e.pos.y, 15, r, 'rgba(124,200,255,', 0.45, 14);
  fx.ring(e.pos.x, e.pos.y, r * 0.7, r, 'rgba(220,240,255,', 0.3, 5);
  fx.burst(e.pos.x, e.pos.y, 26, 'rgba(190,230,255,0.95)', 380, 6, 0.4);
  if (cam.visible(e.pos)) cam.shake(6);
});

/** 战吼：金圈扩到 700 */
registerFx2D('sven_warcry', (fx, e) => {
  const r = e.radius ?? 700;
  fx.ring(e.pos.x, e.pos.y, 30, r, 'rgba(255,210,90,', 0.6, 16);
  fx.ring(e.pos.x, e.pos.y, 20, r * 0.8, 'rgba(124,200,255,', 0.5, 8);
  fx.burst(e.pos.x, e.pos.y, 20, 'rgba(255,220,120,0.95)', 260, 6, 0.5);
});

/** 神之力量：红圈 + 红色火星 */
registerFx2D('sven_gods_strength', (fx, e, _w, cam) => {
  fx.ring(e.pos.x, e.pos.y, 10, 230, 'rgba(255,50,30,', 0.6, 16);
  fx.burst(e.pos.x, e.pos.y, 30, 'rgba(255,80,40,0.95)', 300, 7, 0.6);
  if (cam.visible(e.pos)) cam.shake(6);
});

/** 战吼增益：脚下的金色虚线圈（缓慢转动） */
registerModifier2D('sven_warcry', (ctx, u, _m, x, y, t) => {
  const r = u.radius * 2.25;
  ctx.strokeStyle = 'rgba(255,214,100,0.85)';
  ctx.lineWidth = 3;
  ctx.setLineDash([7, 6]);
  ctx.lineDashOffset = t * 18;
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.2, r, r * 0.66, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
});

/** 神之力量：脚下脉动的红色光圈 */
registerModifier2D('sven_gods_strength', (ctx, u, _m, x, y, t) => {
  const r = u.radius * 2.0;
  const k = 0.5 + 0.5 * Math.sin(t * 6);
  ctx.fillStyle = `rgba(255,40,20,${0.22 + 0.14 * k})`;
  ctx.strokeStyle = `rgba(255,70,40,${0.7 + 0.3 * k})`;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.2, r, r * 0.66, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
});

// ---------- 莉娜 ----------
registerProjectile2D('hero:lina', { color: '#ff8a30', size: 8, shape: 'orb' });
registerProjectile2D('lina_dragon_slave', { color: '#ff6a1e', size: 34, shape: 'wave' });

/** 龙破斩出手：手前一团火 */
registerFx2D('lina_dragon_slave', (fx, e) => {
  const d = e.dir ?? { x: 0, y: -1 };
  fx.burst(e.pos.x + d.x * 40, e.pos.y + d.y * 40, 16, 'rgba(255,170,60,0.95)', 260, 7, 0.35);
});

/** 光击阵：火圈 + 向外飞散的火星 + 轻微震屏 */
registerFx2D('lina_lsa', (fx, e, _w, cam) => {
  const r = e.radius ?? 250;
  fx.ring(e.pos.x, e.pos.y, 20, r, 'rgba(255,110,40,', 0.45, 18);
  fx.ring(e.pos.x, e.pos.y, r * 0.6, r * 1.05, 'rgba(255,200,90,', 0.35, 6);
  fx.burst(e.pos.x, e.pos.y, 36, 'rgba(255,150,50,0.95)', 420, 8, 0.6);
  if (cam.visible(e.pos)) cam.shake(5);
});

/** 神灭斩：沿莉娜 → 目标的直线排一串红白火花 */
registerFx2D('lina_laguna', (fx, e, world) => {
  const u = world.getUnit(e.unitId);
  const t = world.getUnit(e.targetId);
  if (!u) return;
  const to = t?.pos ?? e.pos;
  for (let i = 0; i <= 10; i++) {
    const k = i / 10;
    fx.burst(u.pos.x + (to.x - u.pos.x) * k, u.pos.y + (to.y - u.pos.y) * k, 3, i % 2 ? 'rgba(255,255,255,0.95)' : 'rgba(255,50,30,0.95)', 70, 7, 0.35);
  }
});

registerFx2D('lina_laguna_hit', (fx, e, _w, cam) => {
  fx.ring(e.pos.x, e.pos.y, 10, 200, 'rgba(255,40,30,', 0.5, 14);
  fx.burst(e.pos.x, e.pos.y, 40, 'rgba(255,80,60,0.95)', 420, 8, 0.6);
  if (cam.visible(e.pos)) cam.shake(10);
});

/** 炽魂：脚下绕圈的火点，个数 = 层数 */
registerModifier2D('lina_fiery_soul_stack', (ctx, u, m, x, y, t) => {
  const r = u.radius * 1.9;
  ctx.fillStyle = 'rgba(255,150,50,0.95)';
  for (let i = 0; i < m.stacks; i++) {
    const a = t * 2.6 + (i / m.stacks) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * r, y + r * 0.2 + Math.sin(a) * r * 0.66, 4, 0, Math.PI * 2);
    ctx.fill();
  }
});

/** 慢热烧灼：脚下闪烁的橙红色圈 */
registerModifier2D('lina_slow_burn_dot', (ctx, u, _m, x, y, t) => {
  const r = u.radius * 1.4;
  ctx.strokeStyle = `rgba(255,${90 + Math.round(60 * Math.sin(t * 14))},30,0.85)`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.2, r, r * 0.66, 0, 0, Math.PI * 2);
  ctx.stroke();
});

// ---------- 水晶室女 ----------
registerProjectile2D('hero:crystal_maiden', { color: '#9fe8ff', size: 7, shape: 'orb' });

/** 冰霜新星：冰蓝色的圈扩到 425 + 向外飞散的冰屑 */
registerFx2D('cm_nova', (fx, e) => {
  const r = e.radius ?? 425;
  fx.ring(e.pos.x, e.pos.y, 30, r, 'rgba(120,210,255,', 0.5, 18);
  fx.ring(e.pos.x, e.pos.y, r * 0.7, r, 'rgba(230,248,255,', 0.4, 6);
  fx.burst(e.pos.x, e.pos.y, 34, 'rgba(200,240,255,0.95)', 480, 6, 0.55);
});

/** 冰封禁制：目标身上一团冰屑 */
registerFx2D('cm_frostbite', (fx, e) => {
  fx.burst(e.pos.x, e.pos.y, 18, 'rgba(170,235,255,0.95)', 200, 6, 0.4);
  fx.ring(e.pos.x, e.pos.y, 10, 70, 'rgba(140,220,255,', 0.35, 6);
});

/** 极寒领域开始：一圈淡蓝色的冲击 */
registerFx2D('cm_freezing_field', (fx, e) => {
  fx.ring(e.pos.x, e.pos.y, 40, e.radius ?? 810, 'rgba(160,220,255,', 0.6, 10);
});

/** 极寒领域的冰爆：快速淡出的 320 圈 + 冰屑 */
registerFx2D('cm_ff_blast', (fx, e) => {
  const r = e.radius ?? 320;
  fx.ring(e.pos.x, e.pos.y, r * 0.2, r, 'rgba(170,225,255,', 0.3, 8);
  fx.burst(e.pos.x, e.pos.y, 10, 'rgba(225,246,255,0.95)', 240, 5, 0.35);
});

/** 冰封禁制：裹住单位的半透明青色冰块 */
registerModifier2D('cm_frostbite', (ctx, u, _m, x, y) => {
  const r = u.radius * 1.5;
  ctx.fillStyle = 'rgba(150,225,255,0.42)';
  ctx.strokeStyle = 'rgba(225,248,255,0.95)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  const pts = 7;
  for (let i = 0; i < pts; i++) {
    const a = (i / pts) * Math.PI * 2 - Math.PI / 2;
    const k = i % 2 ? 0.86 : 1.08;
    const px = x + Math.cos(a) * r * k, py = y - r * 0.5 + Math.sin(a) * r * 1.25 * k;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
});

/** 极寒领域：水晶室女脚下 810 的淡蓝色大圈 + 转动的虚线 */
registerModifier2D('cm_freezing_field', (ctx, _u, _m, x, y, t) => {
  const r = 810;
  ctx.fillStyle = 'rgba(170,225,255,0.10)';
  ctx.strokeStyle = 'rgba(170,225,255,0.75)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(240,250,255,0.9)';
  ctx.lineWidth = 4;
  ctx.setLineDash([26, 22]);
  ctx.lineDashOffset = -t * 60;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.95, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
});
