import { describe, it, expect } from 'vitest';
import { chargeBadge, cooldownState, formatClock, innateCounter, skillSlotsFor, talentChoices, vitalText } from '../src/ui/hud';
import { makeWorld } from './helpers';
import { TEST_INNATE_INSTANT, TEST_PARALLEL } from './testHero';
import { createHero } from '../src/sim/systems/heroes';
import { newAbilityInstance } from '../src/sim/systems/abilities';
import { setHeroLevel } from '../src/game/debug';
import { pickTalent } from '../src/sim/talents';
import { getHeroDef } from '../src/sim/heroes/index';
import { Team } from '../src/sim/core/types';

describe('HUD text', () => {
  it('formats the match clock as mm:ss', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(65.9)).toBe('01:05');
    expect(formatClock(40 * 60 + 1)).toBe('40:01');
  });
  it('never shows current hp/mana above the displayed maximum', () => {
    expect(vitalText(693.4, 693.4, true)).toBe('693 / 693');
    expect(vitalText(693.1, 693.4, true)).toBe('693 / 693');
    expect(vitalText(291.6, 291.6, false)).toBe('292 / 292');
    expect(vitalText(150.7, 291.6, false)).toBe('150 / 292');
  });
  it('shows at least 1 hp while alive and 0 when empty', () => {
    expect(vitalText(0.3, 700, true)).toBe('1 / 700');
    expect(vitalText(0, 700, true)).toBe('0 / 700');
    expect(vitalText(-5, 700, true)).toBe('0 / 700');
  });
});

describe('HUD ability helpers', () => {
  const setup = () => {
    const w = makeWorld();
    const axe = createHero(w, 'axe', Team.Radiant, true);
    return { w, axe };
  };

  it('skillSlotsFor adds X1/X2 only when the hero has them', () => {
    const { w, axe } = setup();
    expect(skillSlotsFor(axe)).toEqual(['Q', 'W', 'E', 'R']);
    const t = createHero(w, 'testhero', Team.Radiant, false);
    t.abilities.push(newAbilityInstance(TEST_INNATE_INSTANT));
    expect(skillSlotsFor(t)).toEqual(['Q', 'W', 'E', 'R', 'X1']);
    t.abilities.push(newAbilityInstance({ ...TEST_INNATE_INSTANT, id: 'test_x2', slot: 'X2', innate: false }));
    expect(skillSlotsFor(t)).toEqual(['Q', 'W', 'E', 'R', 'X1', 'X2']);
  });

  it('talentChoices returns the lowest pending tier with both names', () => {
    const { w, axe } = setup();
    expect(talentChoices(w, axe)).toBeNull();
    setHeroLevel(w, axe, 15, { learn: 'none', talents: false });
    const def = getHeroDef('axe');
    expect(talentChoices(w, axe)).toEqual({ tier: 0, level: 10, names: [def.talents[0][0].name, def.talents[0][1].name] });
    expect(pickTalent(w, axe, 0, 1)).toBe(true);
    expect(talentChoices(w, axe)).toEqual({ tier: 1, level: 15, names: [def.talents[1][0].name, def.talents[1][1].name] });
    pickTalent(w, axe, 1, 0);
    expect(talentChoices(w, axe)).toBeNull();
  });

  it('chargeBadge shows remaining charges for charge abilities only', () => {
    const { w, axe } = setup();
    const q = axe.ability('Q')!;
    q.level = 1;
    expect(chargeBadge(axe, q)).toBe('');
    const t = createHero(w, 'testhero', Team.Radiant, false);
    const par = newAbilityInstance(TEST_PARALLEL);
    t.abilities.push(par);
    expect(chargeBadge(t, par)).toBe('');
    par.level = 1;
    expect(chargeBadge(t, par)).toBe('3');
    par.charges = 1;
    par.chargeTimers = [6, 3];
    expect(chargeBadge(t, par)).toBe('1');
    // 冷却遮罩按最快恢复的一层：3 / 9
    expect(cooldownState(t, par).frac).toBeCloseTo(1 / 3);
    expect(cooldownState(t, par).remaining).toBe(3);
    par.charges = 3;
    par.chargeTimers = [];
    expect(cooldownState(t, par).frac).toBe(0);
  });

  it('innateCounter reads the innate ability counter', () => {
    const { w, axe } = setup();
    expect(innateCounter(axe)).toBeNull();
    const t = createHero(w, 'testhero', Team.Radiant, false);
    t.abilities.push(newAbilityInstance({ id: 'test_souls', name: '灵魂', description: '', slot: 'innate', maxLevel: 1, targetType: 'passive', values: {}, counter: () => 12 }));
    expect(innateCounter(t)).toEqual({ label: '灵魂', value: 12 });
  });
});
