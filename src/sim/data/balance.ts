import type { ArmorClass, AttackClass } from '../core/types';

export interface CreepStats {
  hp: number; hpRegen: number; armor: number; magicResist: number; damage: number; bat: number;
  attackRange: number; attackPoint: number; projectileSpeed: number; moveSpeed: number; acquireRange: number;
  radius: number; gold: number; xp: number; attackClass: AttackClass; armorClass: ArmorClass;
}

export interface TowerStats { hp: number; armor: number; damage: number; bat: number; attackRange: number; goldTeam: number; goldLastHit: number }

const creep = (c: CreepStats): CreepStats => c;

export const BALANCE = {
  economy: {
    startingGold: 600,
    passiveGoldPerMin: 150,
    creepGoldMult: 2.5,
    creepXpMult: 1.5,
    xpTableMult: 0.4,
    levelCap: 25,
    lastHitShareRadius: 1200,
    lastHitShareRatio: 0.25,
    xpShareRadius: 1500,
    heroKillBaseGold: 125,
    heroKillGoldPerLevel: 8,
    assistBaseGold: 40,
    assistNetWorthRatio: 0.03,
    assistRadius: 1500,
    assistWindow: 10,
    heroKillBaseXp: 100,
    heroKillXpRatio: 0.13,
    respawnBase: 4,
    respawnPerLevel: 2,
    deathGoldLossPerLevel: 15,
    killCreditWindow: 10,
    shardUnlockTime: 480,
  },
  waves: {
    firstWaveTime: 10,
    interval: 25,
    melee: 3,
    ranged: 2,
    siegeStartTime: 180,
    siegeEveryNWaves: 4,
    extraMeleeTime: 360,
    extraRangedTime: 720,
    upgradeInterval: 180,
    upgradeMelee: { hp: 30, damage: 2 },
    upgradeRanged: { hp: 25, damage: 3 },
    upgradeBountyPct: 0.05,
    superUpgradeMult: 2,
  },
  creeps: {
    melee: creep({ hp: 550, hpRegen: 0.5, armor: 2, magicResist: 0, damage: 21, bat: 1, attackRange: 100, attackPoint: 0.467, projectileSpeed: 0, moveSpeed: 325, acquireRange: 500, radius: 16, gold: 36, xp: 57, attackClass: 'basic', armorClass: 'basic' }),
    ranged: creep({ hp: 300, hpRegen: 2, armor: 0, magicResist: 0, damage: 24, bat: 1, attackRange: 500, attackPoint: 0.5, projectileSpeed: 900, moveSpeed: 325, acquireRange: 600, radius: 16, gold: 48, xp: 69, attackClass: 'pierce', armorClass: 'basic' }),
    siege: creep({ hp: 935, hpRegen: 0, armor: 0, magicResist: 0.8, damage: 40, bat: 3, attackRange: 690, attackPoint: 0.7, projectileSpeed: 1100, moveSpeed: 325, acquireRange: 800, radius: 22, gold: 65, xp: 88, attackClass: 'siege', armorClass: 'reinforced' }),
    superMelee: creep({ hp: 700, hpRegen: 0.5, armor: 3, magicResist: 0, damage: 45, bat: 1, attackRange: 100, attackPoint: 0.467, projectileSpeed: 0, moveSpeed: 325, acquireRange: 500, radius: 18, gold: 23, xp: 25, attackClass: 'basic', armorClass: 'basic' }),
    superRanged: creep({ hp: 475, hpRegen: 2, armor: 1, magicResist: 0, damage: 48, bat: 1, attackRange: 500, attackPoint: 0.5, projectileSpeed: 900, moveSpeed: 325, acquireRange: 600, radius: 18, gold: 22, xp: 22, attackClass: 'pierce', armorClass: 'basic' }),
  },
  buildings: {
    t1: { hp: 1800, armor: 12, damage: 100, bat: 1, attackRange: 700, goldTeam: 100, goldLastHit: 150 } as TowerStats,
    t2: { hp: 2400, armor: 14, damage: 150, bat: 1, attackRange: 700, goldTeam: 130, goldLastHit: 170 } as TowerStats,
    t3: { hp: 2800, armor: 16, damage: 170, bat: 1, attackRange: 700, goldTeam: 160, goldLastHit: 200 } as TowerStats,
    t4: { hp: 2600, armor: 18, damage: 170, bat: 1, attackRange: 700, goldTeam: 180, goldLastHit: 220 } as TowerStats,
    ancient: { hp: 5000, armor: 20, hpRegen: 5 },
    towerRadius: 90,
    ancientRadius: 150,
    towerAttackPoint: 0.3,
    towerProjectileSpeed: 750,
    backdoorRadius: 900,
    backdoorMult: 0.4,
    towerAggroHold: 3,
    fountain: { damage: 250, bat: 0.25, attackRange: 1100, healPctPerSec: 0.05, healRadius: 450, radius: 60 },
  },
  damageMatrix: {
    hero: { hero: 1, basic: 1, reinforced: 0.5 },
    basic: { hero: 0.75, basic: 1, reinforced: 0.7 },
    pierce: { hero: 0.5, basic: 1.5, reinforced: 0.35 },
    siege: { hero: 1, basic: 1, reinforced: 2.5 },
    tower: { hero: 1, basic: 1, reinforced: 1 },
    elite: { hero: 1, basic: 1, reinforced: 0.7 },
  } as Record<AttackClass, Record<ArmorClass, number>>,
  aggro: {
    creepHeroAggroRadius: 500,
    creepHeroAggroDuration: 2,
    creepHeroAggroCooldown: 3,
    leashMult: 1.5,
  },
  hero: {
    baseHp: 120,
    baseMana: 75,
    hpPerStr: 22,
    hpRegenPerStr: 0.1,
    manaPerInt: 12,
    manaRegenPerInt: 0.05,
    armorPerAgi: 1 / 6,
    attackSpeedPerAgi: 1,
    magicResistPerInt: 0.001,
    baseMagicResist: 0.25,
    minMoveSpeed: 100,
    maxMoveSpeed: 550,
    attributeBonusPerPoint: 2,
    recallTime: 5,
    radius: 24,
  },
  maxGameTime: 2400,
};

export type Balance = typeof BALANCE;

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

const deepMerge = (target: any, src: any): any => {
  for (const k of Object.keys(src ?? {})) {
    const v = src[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) deepMerge(target[k], v);
    else target[k] = v;
  }
  return target;
};

export const cloneBalance = (overrides?: DeepPartial<Balance>): Balance =>
  deepMerge(structuredClone(BALANCE), overrides ?? {}) as Balance;
