import type { HeroAiRules } from './types';
import { abilityCastRange, abilityValue } from '../../sim/systems/abilities';
import { edgeDist, enemiesInRadius, isTargetableBy } from '../../sim/query';
import { attackedEnemyHero, enemyCreepsNear, underAttack } from '../aiHelpers';

/** 主宰：剑刃风暴打架 / 保命 / 清兵，治疗守卫给自己和队友回血，无敌斩收残血英雄 */
export const JUGG_RULES: HeroAiRules = {
  // 剑刃风暴：300 内有敌方英雄且（正在打它或自己血量 < 50%）；撤退中 400 内有敌方英雄或正在被攻击；
  // 或者风暴范围内 ≥ 4 个敌方小兵且魔法 > 60%（清兵）
  jugg_blade_fury: {
    escape: true,
    decide: (c) => {
      const { world, me, ab } = c;
      if (c.retreating) return underAttack(world, me) || c.enemyHeroes.some((e) => edgeDist(me, e) <= 400) ? { cast: {} } : null;
      const target = attackedEnemyHero(c);
      for (const e of c.enemyHeroes) {
        if (edgeDist(me, e) > 300) continue;
        if (c.hpPct < 0.5 || target?.id === e.id) return { cast: {} };
      }
      const radius = abilityValue(me, ab, 'radius');
      if (c.manaPct > 0.6 && enemyCreepsNear(world, me, me.pos, radius).length >= 4) return { cast: {} };
      return null;
    },
  },
  // 治疗守卫：自己血量 < 65% 且 800 内有敌方英雄，或 400 内有血量 < 60% 的友方英雄
  jugg_healing_ward: {
    decide: (c) => {
      const { me, ab } = c;
      if (c.hpPct < 0.65 && c.enemyHeroes.some((e) => edgeDist(me, e) <= 800)) return { cast: {} };
      const radius = abilityValue(me, ab, 'radius');
      return c.allyHeroes.some((a) => a.alive && edgeDist(me, a) <= radius && a.hp / a.stats.maxHp < 0.6) ? { cast: {} } : null;
    },
  },
  // 无敌斩：施法距离 + 100 内血量 < 55% 的敌方英雄（选血量比例最低的），且它周围 425 内的敌方单位（含它自己）≤ 3，斩击能集中
  jugg_omnislash: {
    priority: 30,
    decide: (c) => {
      const { world, me, ab } = c;
      const reach = abilityCastRange(me, ab) + 100;
      const radius = abilityValue(me, ab, 'radius');
      let best = null as (typeof c.enemyHeroes)[number] | null;
      for (const h of c.enemyHeroes) {
        const pct = h.hp / h.stats.maxHp;
        if (pct >= 0.55 || edgeDist(me, h) > reach || !isTargetableBy(me, h, 'enemy', false)) continue;
        const around = enemiesInRadius(world, me.team, h.pos, radius).filter((u) => isTargetableBy(me, u, 'enemy', true)).length;
        if (around > 3) continue;
        if (!best || pct < best.hp / best.stats.maxHp) best = h;
      }
      return best ? { cast: { unitId: best.id } } : null;
    },
  },
};
