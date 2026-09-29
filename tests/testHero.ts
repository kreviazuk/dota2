import type { AbilityDef, HeroDef } from '../src/sim/heroes/types';
import { registerHero } from '../src/sim/heroes/index';

const simple = (slot: 'Q' | 'W' | 'E'): AbilityDef => ({
  id: `test_${slot}`, name: slot, description: '', slot, maxLevel: 4, targetType: 'none', castPoint: 0, cooldown: [5], manaCost: [0], values: {},
});

export const TEST_HERO: HeroDef = {
  id: 'testhero', name: '测试英雄', title: '', primary: 'str', str: [20, 2], agi: [20, 2], int: [20, 2],
  baseDamage: [30, 30], baseArmor: 0, baseHpRegen: 0, baseManaRegen: 0, attackRange: 150, bat: 1.7, baseAttackSpeed: 100,
  attackPoint: 0.3, projectileSpeed: 0, moveSpeed: 300, roles: [],
  abilities: [
    simple('Q'), simple('W'), simple('E'),
    { id: 'test_R', name: 'R', description: '', slot: 'R', maxLevel: 3, requiredHeroLevels: [6, 12, 18], targetType: 'none', castPoint: 0, cooldown: [60], manaCost: [0], values: {} },
  ],
  talents: [],
};

registerHero(TEST_HERO);
