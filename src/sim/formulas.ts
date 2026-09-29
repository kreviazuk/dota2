import type { Balance } from './data/balance';

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** 物理伤害倍率（Dota 护甲公式） */
export const armorMultiplier = (armor: number): number => 1 - (0.06 * armor) / (1 + 0.06 * Math.abs(armor));

export const effectiveAttackSpeed = (attackSpeed: number): number => clamp(attackSpeed, 20, 700);

export const attackInterval = (bat: number, attackSpeed: number): number => bat / (effectiveAttackSpeed(attackSpeed) / 100);

export const scaledAttackPoint = (attackPoint: number, attackSpeed: number): number =>
  attackPoint / (effectiveAttackSpeed(attackSpeed) / 100);

/** 乘算叠加：1 - Π(1 - x)，用于魔抗、闪避 */
export const combineMultiplicative = (sources: readonly number[]): number => {
  let m = 1;
  for (const s of sources) m *= 1 - s;
  return 1 - m;
};

export const respawnTime = (level: number, b: Balance): number => b.economy.respawnBase + b.economy.respawnPerLevel * level;

/** 终结连杀奖励：x = 死者连杀数 */
export const streakBounty = (streak: number): number => {
  if (streak < 3) return 0;
  const x = Math.min(streak, 10);
  return 5 * x * x + 5 * x;
};
