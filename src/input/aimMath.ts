import type { Vec2 } from '../sim/core/vec2';

/** 摇杆死区（CSS 像素） */
const DEAD_ZONE = 8;

/** 摇杆：按下点到手指的偏移 → 移动方向（死区内为 null）和摇杆头位置（限制在半径内） */
export function joystickVector(dx: number, dy: number, radius: number): { dir: Vec2 | null; knob: Vec2 } {
  const len = Math.hypot(dx, dy);
  const k = len > radius ? radius / len : 1;
  const knob = { x: dx * k, y: dy * k };
  return { dir: len < DEAD_ZONE ? null : { x: dx / len, y: dy / len }, knob };
}

/** 两个方向的夹角是否超过 threshold（弧度）；一边为 null 时只要不同就算变化 */
export function dirChanged(a: Vec2 | null, b: Vec2 | null, threshold: number): boolean {
  if (!a || !b) return a !== b;
  return Math.abs(Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y)) > threshold;
}

/** 拖动技能键：偏移 → 方向和 0..1 的拖动比例（拖到 maxDrag 为 1） */
export function dragToAim(dx: number, dy: number, maxDrag: number): { dir: Vec2 | null; ratio: number } {
  const len = Math.hypot(dx, dy);
  if (len < 1) return { dir: null, ratio: 0 };
  return { dir: { x: dx / len, y: dy / len }, ratio: Math.min(1, len / maxDrag) };
}
