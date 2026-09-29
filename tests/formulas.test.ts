import { describe, it, expect } from 'vitest';
import { armorMultiplier, attackInterval, scaledAttackPoint, combineMultiplicative, respawnTime, streakBounty, clamp } from '../src/sim/formulas';
import { xpToReach, levelForXp, DOTA_XP_CUMULATIVE } from '../src/sim/data/xpTable';
import { layoutFor, clampToWalkable, MAP, walkableHalfWidthAt } from '../src/sim/data/map';
import { BALANCE, cloneBalance } from '../src/sim/data/balance';
import { Team } from '../src/sim/core/types';

describe('armor', () => {
  it('matches Dota table', () => {
    expect(1 - armorMultiplier(0)).toBeCloseTo(0);
    expect(1 - armorMultiplier(5)).toBeCloseTo(0.2308, 3);
    expect(1 - armorMultiplier(10)).toBeCloseTo(0.375, 3);
    expect(1 - armorMultiplier(20)).toBeCloseTo(0.5454, 3);
    expect(armorMultiplier(-5)).toBeCloseTo(1.2308, 3);
  });
});

describe('attack timing', () => {
  it('attack interval = BAT / (AS/100) with clamp', () => {
    expect(attackInterval(1.7, 100)).toBeCloseTo(1.7);
    expect(attackInterval(1.7, 118)).toBeCloseTo(1.4407, 3);
    expect(attackInterval(1.7, 5)).toBeCloseTo(1.7 / 0.2);
    expect(attackInterval(1.7, 9999)).toBeCloseTo(1.7 / 7);
  });
  it('attack point scales with attack speed', () => {
    expect(scaledAttackPoint(0.5, 100)).toBeCloseTo(0.5);
    expect(scaledAttackPoint(0.5, 200)).toBeCloseTo(0.25);
  });
});

describe('misc formulas', () => {
  it('combineMultiplicative', () => {
    expect(combineMultiplicative([0.25, 0.3])).toBeCloseTo(0.475);
    expect(combineMultiplicative([])).toBe(0);
  });
  it('respawn and streak', () => {
    expect(respawnTime(1, BALANCE)).toBe(6);
    expect(respawnTime(25, BALANCE)).toBe(54);
    expect(streakBounty(2)).toBe(0);
    expect(streakBounty(3)).toBe(60);
    expect(streakBounty(10)).toBe(550);
    expect(streakBounty(15)).toBe(550);
  });
  it('clamp', () => { expect(clamp(5, 0, 3)).toBe(3); expect(clamp(-1, 0, 3)).toBe(0); });
});

describe('xp table', () => {
  it('has 30 entries and scales', () => {
    expect(DOTA_XP_CUMULATIVE).toHaveLength(30);
    expect(xpToReach(1, 0.4)).toBe(0);
    expect(xpToReach(6, 0.4)).toBe(976);
    expect(xpToReach(25, 1)).toBe(34400);
  });
  it('levelForXp respects cap', () => {
    expect(levelForXp(0, 0.4, 25)).toBe(1);
    expect(levelForXp(975, 0.4, 25)).toBe(5);
    expect(levelForXp(976, 0.4, 25)).toBe(6);
    expect(levelForXp(1e9, 0.4, 25)).toBe(25);
  });
});

describe('map', () => {
  it('dire layout mirrors radiant', () => {
    const r = layoutFor(Team.Radiant), d = layoutFor(Team.Dire);
    expect(d.t1.y).toBe(MAP.height - r.t1.y);
    expect(d.ancient.x).toBe(r.ancient.x);
    expect(r.t1.y).toBeGreaterThan(MAP.height / 2);
  });
  it('clampToWalkable keeps units in lane / base', () => {
    const p = clampToWalkable({ x: 0, y: 5000 }, 20);
    expect(p.x).toBe(MAP.laneX - MAP.laneHalfWidth + 20);
    expect(walkableHalfWidthAt(9500)).toBe(MAP.baseHalfWidth);
    expect(walkableHalfWidthAt(5000)).toBe(MAP.laneHalfWidth);
    const q = clampToWalkable({ x: 1500, y: 99999 }, 20);
    expect(q.y).toBe(MAP.maxY - 20);
  });
});

describe('balance', () => {
  it('cloneBalance deep-copies and applies overrides', () => {
    const b = cloneBalance({ economy: { passiveGoldPerMin: 999 } });
    expect(b.economy.passiveGoldPerMin).toBe(999);
    expect(b.economy.startingGold).toBe(BALANCE.economy.startingGold);
    b.creeps.melee.hp = 1;
    expect(BALANCE.creeps.melee.hp).toBe(550);
  });
});
