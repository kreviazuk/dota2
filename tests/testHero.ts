import type { AbilityDef, HeroDef } from '../src/sim/heroes/types';
import { registerHero } from '../src/sim/heroes/index';

const simple = (slot: 'Q' | 'W' | 'E'): AbilityDef => ({
  id: `test_${slot}`, name: slot, description: '', slot, maxLevel: 4, targetType: 'none', castPoint: 0, cooldown: [5], manaCost: [0], values: {},
});

/** 天赋测试用的 Q：带冷却、魔耗、施法距离、引导时间和一个技能数值 */
const talentQ: AbilityDef = {
  ...simple('Q'), cooldown: [20], manaCost: [100], castRange: [600], channelTime: [2], values: { damage: [100, 200, 300, 400] },
};

/** 先天主动（X1）+ 即时生效：不打断当前动作 */
export const TEST_INNATE_INSTANT: AbilityDef = {
  id: 'test_x1', name: 'X1', description: '', slot: 'X1', innate: true, instant: true, maxLevel: 1, targetType: 'none',
  cooldown: [10], manaCost: [25], values: {},
  onCast: (ctx) => {
    ctx.ability.data.casts = (ctx.ability.data.casts ?? 0) + 1;
  },
};

/** 3 层并行充能，每层 9 秒 */
export const TEST_PARALLEL: AbilityDef = {
  id: 'test_parallel', name: '并行充能', description: '', slot: 'E', maxLevel: 4, targetType: 'none', castPoint: 0,
  cooldown: [9], manaCost: [0], charges: 3, chargeMode: 'parallel', values: {},
};

export const TEST_HERO: HeroDef = {
  id: 'testhero', name: '测试英雄', title: '', primary: 'str', str: [20, 2], agi: [20, 2], int: [20, 2],
  baseDamage: [30, 30], baseArmor: 0, baseHpRegen: 0, baseManaRegen: 0, attackRange: 150, bat: 1.7, baseAttackSpeed: 100,
  attackPoint: 0.3, projectileSpeed: 0, moveSpeed: 300, roles: [],
  abilities: [
    talentQ, simple('W'), simple('E'),
    { id: 'test_R', name: 'R', description: '', slot: 'R', maxLevel: 3, requiredHeroLevels: [6, 12, 18], targetType: 'none', castPoint: 0, cooldown: [60], manaCost: [0], values: {} },
  ],
  talents: [
    [
      { id: 'test_t10a', name: '+50 伤害，-25% 冷却', valueBonus: [{ abilityId: 'test_Q', key: 'damage', add: 50 }, { abilityId: 'test_Q', key: 'cooldown', mult: 0.75 }] },
      { id: 'test_t10b', name: '+200 生命', stats: { maxHp: 200 } },
    ],
    [
      { id: 'test_t15a', name: '-20% 魔耗，+100 施法距离', valueBonus: [{ abilityId: 'test_Q', key: 'manaCost', mult: 0.8 }, { abilityId: 'test_Q', key: 'castRange', add: 100 }] },
      {
        id: 'test_t15b', name: '+5 护甲（自定义 Modifier）',
        modifier: { id: 'test_talent_armor', hidden: true, persistOnDeath: true, dispel: 'none', stats: { armor: 5 } },
      },
    ],
    [
      { id: 'test_t20a', name: '+1 秒引导，伤害 ×2', valueBonus: [{ abilityId: 'test_Q', key: 'channelTime', add: 1 }, { abilityId: 'test_Q', key: 'damage', mult: 2 }] },
      { id: 'test_t20b', name: 'W 变为 2 层充能', valueBonus: { abilityId: 'test_W', key: 'charges', add: 2 } },
    ],
    [
      { id: 'test_t25a', name: '施法距离 ×1.5', valueBonus: { abilityId: 'test_Q', key: 'castRange', mult: 1.5 } },
      { id: 'test_t25b', name: '+30% 施法速度', stats: { castSpeed: 0.3 } },
    ],
  ],
};

registerHero(TEST_HERO);
