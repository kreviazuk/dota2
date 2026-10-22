import { describe, it, expect } from 'vitest';
import { abilityNumbers, abilityTags, heroBaseLine, orderedAbilities, PRIMARY_NAMES, SLOT_LABELS } from '../src/ui/abilityText';
import { getHeroDef } from '../src/sim/heroes/index';
import { BALANCE } from '../src/sim/data/balance';
import type { AbilityDef } from '../src/sim/heroes/types';

const axe = getHeroDef('axe');
const ab = (id: string): AbilityDef => axe.abilities.find((a) => a.id === id)!;
const base = (o: Partial<AbilityDef>): AbilityDef => ({ id: 'x', name: 'x', description: '', slot: 'Q', maxLevel: 4, targetType: 'none', values: {}, ...o });

describe('ability text', () => {
  it('abilityNumbers formats per-level values and collapses equal ones', () => {
    expect(abilityNumbers(ab('axe_berserkers_call'))).toEqual(['冷却 18/16/14/12', '魔耗 90/100/110/120']);
    expect(abilityNumbers(ab('axe_culling_blade'))).toEqual(['冷却 80/75/70', '魔耗 100/125/150', '距离 175']);
    expect(abilityNumbers(ab('axe_counter_helix'))).toEqual([]);
    expect(abilityNumbers(base({ cooldown: [9], manaCost: [0], charges: 3, channelTime: [1.5, 1.5] }))).toEqual(['充能时间 9', '引导 1.5 秒']);
  });

  it('abilityTags describe target type, damage type, channel and charges', () => {
    expect(abilityTags(ab('axe_counter_helix'))).toEqual(['被动', '纯粹伤害']);
    expect(abilityTags(ab('axe_battle_hunger'))).toEqual(['指向单位', '纯粹伤害']);
    expect(abilityTags(ab('axe_berserkers_call'))).toEqual(['无目标']);
    expect(abilityTags(base({ targetType: 'point', damageType: 'magical', channelTime: [2] }))).toEqual(['地点', '魔法伤害', '引导']);
    expect(abilityTags(base({ targetType: 'direction', charges: 3 }))).toEqual(['方向', '充能 ×3']);
    expect(abilityTags(base({ targetType: 'toggle' }))).toEqual(['开关']);
    expect(abilityTags(base({ instant: true }))).toEqual(['即时']);
    expect(abilityTags(base({ targetType: 'unit', targetTeam: 'ally' }))).toEqual(['指向友方']);
  });

  it('heroBaseLine matches the documented level-1 stats', () => {
    const b = heroBaseLine(axe, BALANCE);
    expect(b.hp).toBe(670);
    expect(b.mana).toBe(291);
    expect(b.damage).toEqual([56, 60]);
    expect(b.armor).toBeCloseTo(3.0);
    expect(b.moveSpeed).toBe(315);
    expect(b.attackRange).toBe(150);
    expect(b.attackInterval).toBeCloseTo(1.44, 2);
    expect(b.primary).toBe(PRIMARY_NAMES.str);
  });

  it('lists the innate ability first, then Q W E R', () => {
    expect(orderedAbilities(axe).map((a) => SLOT_LABELS[a.slot])).toEqual(['先天', 'Q', 'W', 'E', 'R']);
  });
});
