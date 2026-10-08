import type { World } from './world';

/**
 * 伪随机分布（Dota PRD）：第 N 次尝试（上次触发后连续 N−1 次没有触发）的触发概率 = min(1, C × N)。
 * 长期触发频率等于名义概率 p，但连续不触发的次数有上限 ⌈1/C⌉ − 1。
 */

/** 给定 C 时的长期触发频率 = 1 / 平均尝试次数 */
function procRate(c: number): number {
  let before = 0; // 前 n−1 次之内已经触发的概率
  let expected = 0;
  const maxN = Math.ceil(1 / c);
  for (let n = 1; n <= maxN; n++) {
    const pn = Math.min(1, n * c) * (1 - before);
    before += pn;
    expected += n * pn;
    if (1 - before < 1e-12) break;
  }
  return 1 / expected;
}

const cache = new Map<number, number>();

/** 二分法求 Dota PRD 常数 C（按 p 缓存） */
export function prdC(p: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  const hit = cache.get(p);
  if (hit !== undefined) return hit;
  let lo = 0;
  let hi = p;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (procRate(mid) < p) lo = mid;
    else hi = mid;
  }
  const c = (lo + hi) / 2;
  cache.set(p, c);
  return c;
}

/** state[key] = 连续未触发次数；第 N 次的触发概率 = min(1, C × N)。触发后清零 */
export function prdRoll(world: World, state: Record<string, number>, key: string, p: number): boolean {
  if (p <= 0) {
    state[key] = (state[key] ?? 0) + 1;
    return false;
  }
  const n = (state[key] ?? 0) + 1;
  if (world.rng.next() < Math.min(1, prdC(p) * n)) {
    state[key] = 0;
    return true;
  }
  state[key] = n;
  return false;
}
