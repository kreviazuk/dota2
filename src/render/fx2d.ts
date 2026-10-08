import type { SimEvent } from '../sim/core/events';
import type { World } from '../sim/world';
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

export interface Projectile2DStyle { color: string; size: number; shape?: 'orb' | 'line' | 'arrow' }

const PROJ = new Map<string, Projectile2DStyle>();

/** visual = Projectile.visual，英雄普攻是 'hero:<id>' */
export function registerProjectile2D(visual: string, s: Projectile2DStyle): void {
  PROJ.set(visual, s);
}

export const lookupProjectile2D = (visual: string): Projectile2DStyle | undefined => PROJ.get(visual);

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
