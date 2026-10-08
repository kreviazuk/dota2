import type { Object3D } from 'three';
import type { SimEvent } from '../../sim/core/events';
import type { World } from '../../sim/world';
import type { Unit } from '../../sim/entities/unit';
import type { AreaEffect } from '../../sim/entities/effect';
import type { ModifierInstance } from '../../sim/modifiers';
import type { Fx3D, HeightOf } from '../fx3d';
import type { Camera3D } from '../camera3d';
import type { RingDecal } from '../decals';

/**
 * 3D 特效注册表：sim 的 fx 事件、弹道外观、Modifier 外观、区域效果外观、每个单位的通用外观（状态标记）。
 * 各英雄在 `fx/<id>.ts` 里注册，渲染器只查表；查不到时走内置的默认表现。
 */
export type FxEvent = Extract<SimEvent, { type: 'fx' }>;

export interface FxCtx {
  fx: Fx3D; world: World; cam: Camera3D; heightOf: HeightOf;
  /** 镜头跟随的玩家英雄（没有时 null）：涉及玩家的特效可以加全屏闪光 */
  playerId: number | null;
}
export type FxHandler = (e: FxEvent, c: FxCtx) => void;

const FX = new Map<string, FxHandler>();

/** sim 的 fx 事件（kind = 事件的 kind） */
export function registerFx(kind: string, h: FxHandler): void {
  FX.set(kind, h);
}

/** 查不到时返回 undefined（调用方走内置分支） */
export const lookupFx = (kind: string): FxHandler | undefined => FX.get(kind);

// ---------- 弹道 ----------
export interface ProjectileStyle {
  mesh: 'orb' | 'arrow' | 'dagger' | 'hammer' | 'hook' | 'wave' | 'shard' | 'rock';
  color: number;
  /** 尺寸（世界单位，约等于模型的长度；网格按 size / 14 缩放，20 的法球直径约 20） */
  size: number;
  /** 光晕半径，0 = 无 */
  halo?: number;
  trail?: { color: number; every: number; size: number; additive: boolean };
  /** 抛物线高度，缺省按 P1 的 arcFor */
  arc?: number;
  /** 固定的飞行高度（离地），缺省从施法者的出手高度飞向目标（贴地推进的火墙用） */
  height?: number;
  /** 弧度 / 秒（绕横轴翻滚） */
  spin?: number;
  /** 从施法者手部画一条链子到弹道（肉钩）；bone = 链子起点所在的英雄骨骼（缺省按 muzzleHeight 从施法者中心出发） */
  chain?: { color: number; width: number; bone?: string };
  /** 直线波：宽度跟随 projectile.width 缩放（基准宽度 100） */
  scaleWithWidth?: boolean;
  /** 每帧调用的粒子发射器（贴地火墙之类网格做不出来的部分） */
  emitter?: (c: ProjectileFrameCtx) => void;
}

/** 弹道外观的逐帧上下文：x / y 是插值后的位置（sim 坐标），h 是弹道的世界高度，gy 是脚下地面高度 */
export interface ProjectileFrameCtx {
  fx: Fx3D;
  x: number;
  y: number;
  h: number;
  gy: number;
  /** 飞行方向（单位向量，sim 坐标） */
  dir: { x: number; y: number };
  /** 直线弹道的碰撞半径（Projectile.width） */
  width: number;
  traveled: number;
  dt: number;
}

const PROJ = new Map<string, ProjectileStyle>();

/** visual = Projectile.visual，英雄普攻是 'hero:<id>' */
export function registerProjectileStyle(visual: string, s: ProjectileStyle): void {
  PROJ.set(visual, s);
}

export const projectileStyle = (visual: string): ProjectileStyle | undefined => PROJ.get(visual);

// ---------- 单位外观（Modifier 外观、通用状态标记） ----------
/** 通用状态标记的种类；Modifier 外观可以声明替换掉其中几种（例如冰封禁制的冰环替换通用的藤蔓缠绕） */
export type StatusMark = 'stun' | 'silence' | 'root' | 'disarm' | 'fear' | 'slow' | 'shield' | 'break';

/** 英雄模型的外观调节（每帧重置；多个外观的 scale 相乘、opacity 取最小、lift 相加、tint / rim 取最强） */
export interface ViewFx {
  tint(color: number, k: number): void;
  /** 轮廓边缘光换成 color（k = 0..1，取最强的一个）：神之力量的红色描边 */
  rim(color: number, k: number): void;
  scale(k: number): void;
  opacity(k: number): void;
  lift(h: number): void;
  /** 身体发抖（世界单位的振幅） */
  shake(amp: number): void;
}

export interface UnitVisualCtx {
  u: Unit;
  world: World;
  /** 插值后的位置（sim 坐标） */
  x: number;
  y: number;
  /** 脚下地面高度 */
  gy: number;
  /** 当前位移抬高（被击退 / 跳跃时 > 0） */
  lift: number;
  /** 头顶高度（相对脚下，不含 lift） */
  height: number;
  /** 头顶的世界高度 = gy + lift + height */
  top: number;
  /** 头顶已经被眩晕金星 / 嘲讽"!"占用 */
  headBusy: boolean;
  time: number;
  dt: number;
  fx: Fx3D;
  /** 这个单位专用的贴地圆环（按 key 缓存，本帧没有调用的自动隐藏） */
  decal(key: string): RingDecal;
  /** 这个单位专用的 3D 对象（按 key 缓存，第一次调用 build；本帧没有调用的自动隐藏） */
  obj<T extends Object3D>(key: string, build: () => T): T;
  /** 只有英雄有（小兵、建筑、召唤物为 null） */
  view: ViewFx | null;
  /** 被 Modifier 外观替换掉的通用状态标记 */
  suppressed: ReadonlySet<StatusMark>;
}

export interface ModVisualCtx extends UnitVisualCtx { m: ModifierInstance }
export type ModVisual = (c: ModVisualCtx) => void;
export type UnitVisual = (c: UnitVisualCtx) => void;

const MODS = new Map<string, { v: ModVisual; replaces: StatusMark[] }>();
const UNIT_VISUALS: UnitVisual[] = [];

/** 每帧对带某个 Modifier 的单位调用（光圈、头顶图标、环绕粒子、模型发光……） */
export function registerModifierVisual(modifierId: string, v: ModVisual, o: { replaces?: StatusMark[] } = {}): void {
  MODS.set(modifierId, { v, replaces: o.replaces ?? [] });
}

export const lookupModifierVisual = (modifierId: string): { v: ModVisual; replaces: StatusMark[] } | undefined => MODS.get(modifierId);

/** 每帧对每个可见的单位调用（通用状态标记） */
export function registerUnitVisual(v: UnitVisual): void {
  UNIT_VISUALS.push(v);
}

export const unitVisuals = (): readonly UnitVisual[] => UNIT_VISUALS;

// ---------- 区域效果 ----------
export interface AreaVisualCtx {
  decal: RingDecal; fx: Fx3D; world: World; time: number; dt: number;
  /** 这个区域效果的第二个贴地圈（第一次调用时创建，效果结束时一起回收）：预警圈的内层填充之类 */
  extra(): RingDecal;
}
export type AreaVisual = (e: AreaEffect, c: AreaVisualCtx) => void;

const AREAS = new Map<string, AreaVisual>();

/** visual = AreaEffect.visual；没有注册时画 P1 的阵营色虚线圈 */
export function registerAreaVisual(visual: string, v: AreaVisual): void {
  AREAS.set(visual, v);
}

export const lookupAreaVisual = (visual: string): AreaVisual | undefined => AREAS.get(visual);
