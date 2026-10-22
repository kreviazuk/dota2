import type { Unit } from '../sim/entities/unit';

/**
 * 让镜头跟随变"松"的 Modifier：无敌斩这种在一片区域里连续来回闪烁的技能，镜头按正常速度跟随会随每一次闪烁来回摆动。
 * 带着这些 Modifier 时镜头按 CALM_FOLLOW_RATE 跟随（停在几个落点的平均位置附近），结束后照常追上。3D 和 2D 渲染器共用。
 */
const CALM = new Set<string>();

export function registerCalmCamera(modifierId: string): void {
  CALM.add(modifierId);
}

export const cameraCalm = (u: Unit): boolean => u.modifiers.some((m) => CALM.has(m.def.id));

/** 松跟随的速率（每秒；正常跟随 3D 是 7、2D 是 8） */
export const CALM_FOLLOW_RATE = 1.6;
