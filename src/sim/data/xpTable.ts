/** Dota 7.41f 累计经验（下标 0 = 1 级） */
export const DOTA_XP_CUMULATIVE: readonly number[] = [
  0, 240, 640, 1160, 1760, 2440, 3200, 4000, 4900, 5900, 7000, 8200, 9500, 10900, 12400, 14000, 15700, 17500, 19400,
  21400, 23600, 26000, 28600, 31400, 34400, 38400, 43400, 49400, 56400, 64400,
];

/** 到达 level（1 起）所需的累计经验 */
export const xpToReach = (level: number, mult: number): number =>
  Math.round(DOTA_XP_CUMULATIVE[Math.max(0, Math.min(level, DOTA_XP_CUMULATIVE.length) - 1)] * mult);

export const levelForXp = (xp: number, mult: number, cap: number): number => {
  let lvl = 1;
  while (lvl < cap && xp >= xpToReach(lvl + 1, mult)) lvl++;
  return lvl;
};
