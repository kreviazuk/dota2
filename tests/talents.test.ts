import { describe, it, expect } from 'vitest';
import './testHero';
import { makeWorld } from './helpers';
import { createHero, respawnHero } from '../src/sim/systems/heroes';
import { killUnit } from '../src/sim/systems/damage';
import { dispel, findModifier } from '../src/sim/modifiers';
import {
  abilityCastRange, abilityChannelTime, abilityCooldown, abilityManaCost, abilityMaxCharges, abilityValue,
} from '../src/sim/systems/abilities';
import { canPickTalent, hasTalent, pendingTalentTier, pickTalent, pickedTalents } from '../src/sim/talents';
import { giveXp } from '../src/sim/systems/progress';
import { xpToReach } from '../src/sim/data/xpTable';
import { SimpleAI } from '../src/ai/simpleAI';
import { DIFFICULTY } from '../src/ai/difficulty';
import { TALENT_BUILDS } from '../src/ai/builds';
import { World } from '../src/sim/world';
import { Team } from '../src/sim/core/types';
import type { World as WorldT } from '../src/sim/world';
import type { Unit } from '../src/sim/entities/unit';

const hero = (w: WorldT, level: number): Unit => {
  const u = createHero(w, 'testhero', Team.Radiant, false);
  u.hero!.level = level;
  return u;
};

describe('talents', () => {
  it('pendingTalentTier unlocks at 10/15/20/25 and returns the lowest unpicked tier', () => {
    const w = makeWorld();
    const u = hero(w, 9);
    expect(w.balance.hero.talentLevels).toEqual([10, 15, 20, 25]);
    expect(pendingTalentTier(w, u)).toBeNull();
    u.hero!.level = 10;
    expect(pendingTalentTier(w, u)).toBe(0);
    expect(pickTalent(w, u, 0, 1)).toBe(true);
    expect(pendingTalentTier(w, u)).toBeNull();
    u.hero!.level = 20;
    expect(pendingTalentTier(w, u)).toBe(1);
    expect(pickTalent(w, u, 2, 0)).toBe(true);
    expect(pendingTalentTier(w, u)).toBe(1);
  });

  it('pickTalent rejects locked or already-picked tiers', () => {
    const w = makeWorld();
    const u = hero(w, 9);
    expect(canPickTalent(w, u, 0)).toBe(false);
    expect(pickTalent(w, u, 0, 0)).toBe(false);
    expect(u.hero!.talents).toEqual([null, null, null, null]);
    u.hero!.level = 10;
    expect(pickTalent(w, u, 0, 0)).toBe(true);
    expect(pickTalent(w, u, 0, 1)).toBe(false);
    expect(pickTalent(w, u, 1, 0)).toBe(false);
    expect(u.hero!.talents).toEqual([0, null, null, null]);
    expect(hasTalent(u, 'test_t10a')).toBe(true);
    expect(hasTalent(u, 'test_t10b')).toBe(false);
    expect(pickedTalents(u).map((t) => t.id)).toEqual(['test_t10a']);
  });

  it('valueBonus add/mult change ability values, cooldown, mana cost, cast range, channel time and charges', () => {
    const w = makeWorld();
    const u = hero(w, 25);
    const q = u.ability('Q')!;
    const wAb = u.ability('W')!;
    q.level = 1;
    wAb.level = 1;
    expect(abilityValue(u, q, 'damage')).toBe(100);
    expect(abilityCooldown(q, u)).toBe(20);
    expect(abilityManaCost(q, u)).toBe(100);
    expect(abilityCastRange(u, q)).toBe(600);
    expect(abilityChannelTime(u, q)).toBe(2);
    expect(abilityMaxCharges(u, wAb)).toBe(0);

    pickTalent(w, u, 0, 0); // +50 伤害，冷却 ×0.75
    expect(abilityValue(u, q, 'damage')).toBe(150);
    expect(abilityCooldown(q, u)).toBe(15);
    pickTalent(w, u, 1, 0); // 魔耗 ×0.8，+100 施法距离
    expect(abilityManaCost(q, u)).toBeCloseTo(80);
    expect(abilityCastRange(u, q)).toBe(700);
    pickTalent(w, u, 2, 0); // +1 秒引导，伤害 ×2
    expect(abilityChannelTime(u, q)).toBe(3);
    expect(abilityValue(u, q, 'damage')).toBe(250);
    pickTalent(w, u, 3, 0); // 施法距离 ×1.5
    expect(abilityCastRange(u, q)).toBe(1000);

    const v = hero(w, 20);
    v.ability('W')!.level = 1;
    pickTalent(w, v, 2, 1);
    expect(abilityMaxCharges(v, v.ability('W')!)).toBe(2);
  });

  it('stats talents apply a permanent hidden modifier that survives death and dispel', () => {
    const w = makeWorld();
    const u = hero(w, 10);
    w.step();
    const before = u.stats.maxHp;
    expect(pickTalent(w, u, 0, 1)).toBe(true);
    const m = findModifier(u, 'talent:test_t10b');
    expect(m?.def.hidden).toBe(true);
    expect(u.stats.maxHp).toBeCloseTo(before + 200);
    killUnit(w, u, null);
    respawnHero(w, u);
    expect(u.stats.maxHp).toBeCloseTo(before + 200);
    dispel(w, u, 'strong', 'buffs');
    dispel(w, u, 'strong', 'debuffs');
    w.step();
    expect(u.stats.maxHp).toBeCloseTo(before + 200);
  });

  it('modifier talents apply their custom ModifierDef', () => {
    const w = makeWorld();
    const u = hero(w, 15);
    w.step();
    const before = u.stats.armor;
    expect(pickTalent(w, u, 1, 1)).toBe(true);
    const m = findModifier(u, 'test_talent_armor');
    expect(m?.sourceId).toBe(u.id);
    expect(u.stats.armor).toBeCloseTo(before + 5);
  });

  it('pickTalent via world.issue emits a talent event, also while dead', () => {
    const w = makeWorld();
    const u = hero(w, 10);
    w.step();
    w.events.drain();
    killUnit(w, u, null);
    w.issue(u.id, { type: 'pickTalent', tier: 0, side: 1 });
    w.step();
    expect(u.alive).toBe(false);
    expect(u.hero!.talents[0]).toBe(1);
    const ev = w.events.drain().find((e) => e.type === 'talent');
    expect(ev).toEqual({ type: 'talent', unitId: u.id, tier: 0, side: 1, talentId: 'test_t10b' });
    respawnHero(w, u);
    expect(findModifier(u, 'talent:test_t10b')).toBeDefined();
  });

  it('a talent that grants charges converts the ability to full charges', () => {
    const w = makeWorld();
    const u = hero(w, 20);
    const ab = u.ability('W')!;
    ab.level = 1;
    ab.cooldown = 3;
    pickTalent(w, u, 2, 1);
    expect(ab.charges).toBe(2);
    expect(ab.cooldown).toBe(0);
    w.issue(u.id, { type: 'cast', slot: 'W' });
    w.step();
    w.issue(u.id, { type: 'cast', slot: 'W' });
    w.step();
    expect(ab.charges).toBe(0);
    w.issue(u.id, { type: 'cast', slot: 'W' });
    w.step();
    expect(ab.charges).toBe(0);
  });

  it('AI picks talents from TALENT_BUILDS when a tier unlocks', () => {
    const w = new World({ seed: 1, spawnCreeps: false });
    const me = createHero(w, 'axe', Team.Radiant, false);
    giveXp(w, me, xpToReach(25, w.balance.economy.xpTableMult));
    expect(me.hero!.level).toBe(25);
    const ai = new SimpleAI(me.id, DIFFICULTY.normal.skill);
    for (let i = 0; i < 30; i++) {
      ai.update(w);
      w.step();
    }
    expect(me.hero!.talents).toEqual(TALENT_BUILDS.axe);
    expect(TALENT_BUILDS.axe).toEqual([0, 1, 0, 0]);
  });
});
