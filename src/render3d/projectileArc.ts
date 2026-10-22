/**
 * 弹道的飞行高度（纯函数）：从发射高度 h0 直线过渡到目标高度 h1，再叠加一条抛物线拱起 arc（中点最高）。
 * progress 0..1 = 飞行进度（追踪弹道按"已飞距离 / (已飞 + 剩余)"估计）。
 */
export function projectileHeight(h0: number, h1: number, progress: number, arc: number): number {
  const t = Math.max(0, Math.min(1, progress));
  return h0 + (h1 - h0) * t + arc * 4 * t * (1 - t);
}

/** 追踪弹道的飞行进度：起点到目标的初始距离 d0，当前离目标 dLeft */
export function homingProgress(d0: number, dLeft: number): number {
  if (d0 <= 1e-6) return 1;
  return Math.max(0, Math.min(1, 1 - dLeft / d0));
}

/** 各种弹道外观的拱起高度 */
export function arcFor(visual: string, d0: number): number {
  if (visual === 'siege') return Math.min(260, 60 + d0 * 0.3);
  if (visual === 'tower' || visual === 'fountain') return 10;
  return Math.min(60, d0 * 0.08);
}
