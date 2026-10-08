import type { HeroAiRules } from './types';
import type { Unit } from '../../sim/entities/unit';
import { abilityCastRange, abilityValue } from '../../sim/systems/abilities';
import { edgeDist, enemiesInRadius, isHiddenFrom, isTargetableBy } from '../../sim/query';
import { bestCirclePoint, channelling, isMelee, keepsUltMana } from '../aiHelpers';

/** 水晶室女：冰霜新星消耗和清兵、冰封禁制控人和自保、极寒领域团战 */
export const CM_RULES: HeroAiRules = {
  // 冰霜新星：施法距离 + 425 内的敌方单位里找最优落点（半径 425）；覆盖 ≥ 1 个英雄，或 ≥ 3 个单位且魔法 > 50%
  cm_crystal_nova: {
    decide: (c) => {
      const { world, me, ab } = c;
      if (!keepsUltMana(c)) return null;
      const range = abilityCastRange(me, ab);
      const radius = abilityValue(me, ab, 'radius');
      const cands = enemiesInRadius(world, me.team, me.pos, range + radius, { spell: true }).filter((u) => !isHiddenFrom(u, me.team));
      const best = bestCirclePoint(cands, radius, me.pos, range, world.balance.ai.heroWeight);
      if (!best) return null;
      if (best.heroes >= 1 || (best.count >= 3 && c.manaPct > 0.5)) return { cast: { point: best.point } };
      return null;
    },
  },
  // 冰封禁制：撤退时冻住 400 内的敌方英雄；否则施法距离 + 100 内正在引导的敌方英雄最优先，其次最近的敌方近战英雄
  cm_frostbite: {
    priority: 15,
    escape: true,
    decide: (c) => {
      const { me, ab } = c;
      const ok = (h: Unit): boolean => isTargetableBy(me, h, 'enemy', false);
      const nearest = (list: Unit[]): Unit | null =>
        list.reduce<Unit | null>((a, b) => (!a || edgeDist(me, b) < edgeDist(me, a) ? b : a), null);
      if (c.retreating) {
        const t = nearest(c.enemyHeroes.filter((h) => ok(h) && edgeDist(me, h) <= 400));
        return t ? { cast: { unitId: t.id } } : null;
      }
      const range = abilityCastRange(me, ab) + 100;
      const inRange = c.enemyHeroes.filter((h) => ok(h) && edgeDist(me, h) <= range);
      const ch = nearest(inRange.filter(channelling));
      if (ch) return { cast: { unitId: ch.id } };
      if (!keepsUltMana(c)) return null;
      const melee = nearest(inRange.filter(isMelee));
      return melee ? { cast: { unitId: melee.id } } : null;
    },
  },
  // 极寒领域：自己血量 > 40%，且 600 内有 ≥ 2 个敌方英雄，或 450 内有被眩晕 / 缠绕的敌方英雄且 800 内有友方英雄
  cm_freezing_field: {
    priority: 30,
    decide: (c) => {
      const { me } = c;
      if (c.hpPct <= 0.4) return null;
      const near = c.enemyHeroes.filter((h) => edgeDist(me, h) <= 600);
      if (near.length >= 2) return { cast: {} };
      const pinned = c.enemyHeroes.some(
        (h) => edgeDist(me, h) <= 450 && (h.hasState('stunned') || h.hasState('rooted')),
      );
      const ally = c.allyHeroes.some((a) => a.alive && edgeDist(me, a) <= 800);
      return pinned && ally ? { cast: {} } : null;
    },
  },
};
