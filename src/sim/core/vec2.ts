export interface Vec2 {
  x: number;
  y: number;
}
export const vec = (x = 0, y = 0): Vec2 => ({ x, y });
export const copy = (a: Vec2): Vec2 => ({ x: a.x, y: a.y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const dist2 = (a: Vec2, b: Vec2): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
export const normalize = (a: Vec2): Vec2 => {
  const l = len(a);
  return l > 1e-9 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 };
};
export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export const fromAngle = (rad: number): Vec2 => ({ x: Math.cos(rad), y: Math.sin(rad) });
export const angleOf = (a: Vec2): number => Math.atan2(a.y, a.x);
export const rotate = (a: Vec2, rad: number): Vec2 => {
  const c = Math.cos(rad), s = Math.sin(rad);
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c };
};
/** 从 from 向 to 移动至多 maxStep，不会越过 to */
export const moveToward = (from: Vec2, to: Vec2, maxStep: number): Vec2 => {
  const d = dist(from, to);
  if (d <= maxStep || d < 1e-9) return { x: to.x, y: to.y };
  const k = maxStep / d;
  return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
};
/** 点 p 到线段 ab 的距离 */
export const distToSegment = (p: Vec2, a: Vec2, b: Vec2): number => {
  const abx = b.x - a.x, aby = b.y - a.y;
  const l2 = abx * abx + aby * aby;
  if (l2 < 1e-9) return dist(p, a);
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t));
};
