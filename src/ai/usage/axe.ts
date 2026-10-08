import type { HeroAiRules } from './types';
import { abilityCastRange, abilityValue } from '../../sim/systems/abilities';
import { enemiesInRadius, isTargetableBy, nearestOf } from '../../sim/query';

/** 斧王：P1 的三条规则原样搬过来（行为不变） */
export const AXE_RULES: HeroAiRules = {
  // 狂战士之吼：吼得到英雄就吼；否则蓝够时吼 4 个以上的小兵（不吼还没接触过的第一波兵）
  axe_berserkers_call: {
    decide: ({ world, me, ab }) => {
      const r = abilityValue(me, ab, 'radius') - 40;
      const heroes = enemiesInRadius(world, me.team, me.pos, r, { heroesOnly: true }).filter((h) => !h.hasState('hidden'));
      if (heroes.length > 0) return { cast: {} };
      const creeps = enemiesInRadius(world, me.team, me.pos, r).filter((u) => u.kind !== 'hero' && !u.creep?.protectedUntilContact);
      return creeps.length >= 4 && me.mana / me.stats.maxMana > 0.6 ? { cast: {} } : null;
    },
  },
  // 战斗饥渴：施法距离内最近的、身上还没有饥渴的敌方英雄
  axe_battle_hunger: {
    decide: ({ world, me, ab }) => {
      const range = abilityCastRange(me, ab);
      const heroes = enemiesInRadius(world, me.team, me.pos, range, { heroesOnly: true }).filter(
        (h) => isTargetableBy(me, h, 'enemy', false) && !h.modifiers.some((m) => m.def.id === 'axe_battle_hunger'),
      );
      const t = nearestOf(me.pos, heroes);
      return t ? { cast: { unitId: t.id } } : null;
    },
  },
  // 淘汰之刃：附近有血量低于斩杀线的英雄就走过去斩
  axe_culling_blade: {
    // P1 的顺序是 Q → W → R（吼和饥渴排在斩杀之前）；保持这个顺序，迁移前后同种子同结果
    priority: 10,
    decide: ({ world, me, ab }) => {
      const threshold = abilityValue(me, ab, 'damage');
      const t = enemiesInRadius(world, me.team, me.pos, abilityCastRange(me, ab) + 275, { heroesOnly: true }).find(
        (u) => u.hp <= threshold && isTargetableBy(me, u, 'enemy', true),
      );
      return t ? { cast: { unitId: t.id } } : null;
    },
  },
};
