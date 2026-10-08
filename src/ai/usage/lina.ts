import type { HeroAiRules } from './types';
import type { Unit } from '../../sim/entities/unit';
import type { Vec2 } from '../../sim/core/vec2';
import { dist, sub } from '../../sim/core/vec2';
import { abilityCastPoint, abilityCastRange, abilityValue } from '../../sim/systems/abilities';
import { edgeDist, isTargetableBy } from '../../sim/query';
import { lagunaKills } from '../../sim/heroes/lina';
import { attackedEnemyHero, channelling, enemyCreepsNear, keepsUltMana, nearestEnemyHero, predictPos, unitsInLine } from '../aiHelpers';

/** 站着不能走：眩晕、缠绕或正在引导 */
const pinned = (u: Unit): boolean => u.hasState('stunned') || u.hasState('rooted') || channelling(u);

const hasDir = (d: Vec2): boolean => d.x !== 0 || d.y !== 0;

/** 莉娜：龙破斩消耗和清兵、光击阵接控制或预判、神灭斩收人头 */
export const LINA_RULES: HeroAiRules = {
  // 龙破斩：朝预判后的最近敌方英雄喷；没有英雄时，直线上有 ≥ 3 个敌方小兵且魔法 > 50% 也放
  lina_dragon_slave: {
    decide: (c) => {
      const { world, me, ab, skill } = c;
      if (!keepsUltMana(c)) return null;
      const distance = abilityValue(me, ab, 'distance');
      const halfWidth = abilityValue(me, ab, 'endWidth') / 2;
      const h = nearestEnemyHero(c, distance);
      if (h) {
        const lead = abilityCastPoint(me, ab) + dist(me.pos, h.pos) / abilityValue(me, ab, 'speed');
        const p = predictPos(world, h, lead, skill);
        const dir = sub(p, me.pos);
        if (hasDir(dir) && dist(me.pos, p) - h.radius <= distance) return { cast: { dir } };
      }
      if (c.manaPct <= 0.5) return null;
      let best: Vec2 | null = null;
      let bestCount = 2;
      for (const cr of enemyCreepsNear(world, me, me.pos, distance)) {
        const dir = sub(cr.pos, me.pos);
        if (!hasDir(dir)) continue;
        const n = unitsInLine(world, me.team, me.pos, dir, distance, halfWidth).filter((u) => u.kind === 'creep' || u.kind === 'elite').length;
        if (n > bestCount) {
          bestCount = n;
          best = dir;
        }
      }
      return best ? { cast: { dir: best } } : null;
    },
  },
  // 光击阵：施法距离 + 100 内站着不能走的敌方英雄脚下优先；否则落在最近敌方英雄 0.95 秒后的预判位置
  lina_light_strike_array: {
    decide: (c) => {
      const { world, me, ab, skill } = c;
      const range = abilityCastRange(me, ab);
      let pinnedBest: Unit | null = null;
      for (const h of c.enemyHeroes) {
        if (!pinned(h) || edgeDist(me, h) > range + 100) continue;
        if (!pinnedBest || edgeDist(me, h) < edgeDist(me, pinnedBest)) pinnedBest = h;
      }
      if (pinnedBest) return { cast: { point: { x: pinnedBest.pos.x, y: pinnedBest.pos.y } } };
      if (!keepsUltMana(c)) return null;
      const h = nearestEnemyHero(c, range + 100);
      if (!h) return null;
      const p = predictPos(world, h, abilityCastPoint(me, ab) + abilityValue(me, ab, 'delay'), skill);
      return dist(me.pos, p) <= range ? { cast: { point: p } } : null;
    },
  },
  // 神灭斩：施法距离 + 100 内能击杀的敌方英雄（血量最低的）；或者正在交战、血量 < 40% 的敌方英雄
  lina_laguna_blade: {
    priority: 30,
    decide: (c) => {
      const { me, ab } = c;
      const range = abilityCastRange(me, ab) + 100;
      const inRange = c.enemyHeroes.filter((h) => edgeDist(me, h) <= range && isTargetableBy(me, h, 'enemy', false));
      const killable = inRange.filter((h) => lagunaKills(me, ab, h));
      if (killable.length) return { cast: { unitId: killable.reduce((a, b) => (b.hp < a.hp ? b : a)).id } };
      const low = (h: Unit): boolean => h.hp / h.stats.maxHp < 0.4;
      const t = attackedEnemyHero(c);
      if (t && inRange.includes(t) && low(t)) return { cast: { unitId: t.id } };
      const attacker = inRange.find((h) => h.attack.targetId === me.id && low(h));
      return attacker ? { cast: { unitId: attacker.id } } : null;
    },
  },
};
