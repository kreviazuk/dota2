import type { HeroAiRules } from './types';
import type { Unit } from '../../sim/entities/unit';
import { dist } from '../../sim/core/vec2';
import { abilityCastRange, abilityValue } from '../../sim/systems/abilities';
import { edgeDist, isTargetableBy } from '../../sim/query';
import { findModifier } from '../../sim/modifiers';
import { attackedEnemyHero, channelling, keepsUltMana } from '../aiHelpers';

/** 剩余眩晕时间（没有眩晕为 0） */
const stunLeft = (u: Unit): number => findModifier(u, 'status_stun')?.duration ?? 0;

/** 斯温：先手锤、交战时开吼、贴身打英雄时开大 */
export const SVEN_RULES: HeroAiRules = {
  // 风暴之拳：施法距离 + 100 内的敌方英雄，正在引导的最优先；否则选锤子落点周围敌方英雄最多的（同样多时选近的）
  sven_storm_hammer: {
    priority: 15,
    decide: (c) => {
      const { me, ab } = c;
      const range = abilityCastRange(me, ab) + 100;
      const radius = abilityValue(me, ab, 'radius');
      let best: Unit | null = null;
      let bestScore = -Infinity;
      for (const h of c.enemyHeroes) {
        const d = edgeDist(me, h);
        if (d > range || !isTargetableBy(me, h, 'enemy', false)) continue;
        const around = c.enemyHeroes.filter((o) => dist(o.pos, h.pos) - o.radius <= radius).length;
        // 已经被长时间眩晕的目标往后排（避免和队友的控制叠在一起）
        const score = (channelling(h) ? 100 : 0) + around * 10 - (stunLeft(h) > 0.6 ? 5 : 0) - d / 1000;
        if (score > bestScore) {
          bestScore = score;
          best = h;
        }
      }
      if (!best) return null;
      // 打断引导不计较蓝；其他情况留够大招的魔法
      if (!channelling(best) && !keepsUltMana(c)) return null;
      return { cast: { unitId: best.id } };
    },
  },
  // 战吼（即时，不打断动作）：撤退中且 700 内有敌方英雄；或者自己正在打敌方英雄；或者 400 内的友方英雄正在被敌方英雄攻击
  sven_warcry: {
    escape: true,
    whileCasting: true,
    decide: (c) => {
      const { me, ab } = c;
      const radius = abilityValue(me, ab, 'radius');
      if (c.retreating) return c.enemyHeroes.some((e) => edgeDist(me, e) <= radius) ? { cast: {} } : null;
      const t = attackedEnemyHero(c);
      if (t && edgeDist(me, t) <= me.stats.attackRange + 250) return { cast: {} };
      const allyHit = c.allyHeroes.some(
        (a) => a.alive && edgeDist(me, a) <= 400 && c.enemyHeroes.some((e) => e.attack.targetId === a.id),
      );
      return allyHit ? { cast: {} } : null;
    },
  },
  // 神之力量：正在攻击 500 内的敌方英雄，且它血量 < 70% 或附近有 ≥ 2 个敌方英雄
  sven_gods_strength: {
    priority: 30,
    decide: (c) => {
      const { me } = c;
      const t = attackedEnemyHero(c);
      if (!t || edgeDist(me, t) > 500) return null;
      const nearby = c.enemyHeroes.filter((e) => edgeDist(me, e) <= 800).length;
      return t.hp / t.stats.maxHp < 0.7 || nearby >= 2 ? { cast: {} } : null;
    },
  },
};
