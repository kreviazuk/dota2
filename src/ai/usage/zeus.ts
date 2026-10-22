import type { HeroAiRules } from './types';
import type { Unit } from '../../sim/entities/unit';
import { sub } from '../../sim/core/vec2';
import { abilityCastRange, abilityValue } from '../../sim/systems/abilities';
import { edgeDist, isAliveUnit, isHiddenFrom, isTargetableBy } from '../../sim/query';
import { staticFieldPct } from '../../sim/heroes/zeus';
import { channelling, enemyCreepsNear, keepsUltMana, magicDamageTo, nearestEnemyHero, towardHome } from '../aiHelpers';

/** 宙斯一次技能伤害（含技能增强）+ 按目标当前生命估算的静电场，打到 t 身上的实际数值 */
function zeusHitOn(me: Unit, t: Unit, damage: number): number {
  const amp = 1 + me.stats.spellAmp;
  return magicDamageTo(t, (damage + t.hp * staticFieldPct(me)) * amp);
}

/** 宙斯：弧形闪电消耗 / 补刀 / 清兵、雷击打断和收人头、神圣一跳逃跑或追击、雷神之怒全图收人头 */
export const ZEUS_RULES: HeroAiRules = {
  // 弧形闪电：施法距离 + 100 内有敌方英雄且魔法 > 35% → 最近的英雄；
  // 否则一下能打死的小兵（魔法 > 60%），或 ≥ 3 个小兵扎堆（彼此在弹跳距离内，魔法 > 70%）
  zeus_arc_lightning: {
    decide: (c) => {
      const { world, me, ab } = c;
      if (!keepsUltMana(c)) return null;
      const range = abilityCastRange(me, ab);
      const ok = (u: Unit): boolean => isTargetableBy(me, u, 'enemy', false);
      const h = nearestEnemyHero(c, range + 100);
      if (h && ok(h) && c.manaPct > 0.35) return { cast: { unitId: h.id } };
      if (c.manaPct <= 0.6) return null;
      const creeps = enemyCreepsNear(world, me, me.pos, range).filter(ok);
      const damage = abilityValue(me, ab, 'damage');
      const kill = creeps.filter((u) => zeusHitOn(me, u, damage) >= u.hp).reduce<Unit | null>((a, b) => (!a || b.hp < a.hp ? b : a), null);
      if (kill) return { cast: { unitId: kill.id } };
      if (c.manaPct <= 0.7) return null;
      const bounce = abilityValue(me, ab, 'bounceRadius');
      let best: Unit | null = null;
      let bestN = 2;
      for (const cr of creeps) {
        const n = enemyCreepsNear(world, me, cr.pos, bounce).length;
        if (n > bestN) { bestN = n; best = cr; }
      }
      return best ? { cast: { unitId: best.id } } : null;
    },
  },
  // 雷击：施法距离 + 100 内正在引导的敌方英雄最优先；其次施法距离内血量 < 50% 的；魔法 > 50% 时打最近的英雄
  zeus_lightning_bolt: {
    priority: 25,
    decide: (c) => {
      const { me, ab } = c;
      const range = abilityCastRange(me, ab);
      const ok = (u: Unit): boolean => isTargetableBy(me, u, 'enemy', false);
      const nearest = (list: Unit[]): Unit | null =>
        list.reduce<Unit | null>((a, b) => (!a || edgeDist(me, b) < edgeDist(me, a) ? b : a), null);
      const ch = nearest(c.enemyHeroes.filter((h) => ok(h) && channelling(h) && edgeDist(me, h) <= range + 100));
      if (ch) return { cast: { unitId: ch.id } };
      const inRange = c.enemyHeroes.filter((h) => ok(h) && edgeDist(me, h) <= range);
      const low = inRange.filter((h) => h.hp / h.stats.maxHp < 0.5).reduce<Unit | null>((a, b) => (!a || b.hp < a.hp ? b : a), null);
      if (low) return { cast: { unitId: low.id } };
      if (c.manaPct <= 0.5 || !keepsUltMana(c)) return null;
      const t = nearest(inRange);
      return t ? { cast: { unitId: t.id } } : null;
    },
  },
  // 神圣一跳：撤退中且 600 内有敌方英雄 → 朝泉水跳；不撤退时，跳跃范围内有敌方英雄、血量 > 60%、魔法 > 50% → 朝它跳
  zeus_heavenly_jump: {
    escape: true,
    decide: (c) => {
      const { me, ab } = c;
      if (c.retreating) return nearestEnemyHero(c, 600) ? { cast: { dir: towardHome(me) } } : null;
      if (c.hpPct <= 0.6 || c.manaPct <= 0.5 || !keepsUltMana(c)) return null;
      const h = nearestEnemyHero(c, abilityValue(me, ab, 'radius'));
      if (!h) return null;
      const dir = sub(h.pos, me.pos);
      return dir.x || dir.y ? { cast: { dir } } : null;
    },
  },
  // 雷神之怒（全图）：任何一个看得见的敌方英雄会被这一下（含静电场）打死，或者 ≥ 2 个敌方英雄血量 < 40%
  zeus_thundergods_wrath: {
    priority: 30,
    decide: (c) => {
      const { world, me, ab } = c;
      const damage = abilityValue(me, ab, 'damage');
      const heroes = world.units.filter(
        (u) => isAliveUnit(u) && u.kind === 'hero' && u.team !== me.team && !u.hasState('invulnerable') && !isHiddenFrom(u, me.team),
      );
      if (heroes.some((h) => zeusHitOn(me, h, damage) >= h.hp)) return { cast: {} };
      return heroes.filter((h) => h.hp / h.stats.maxHp < 0.4).length >= 2 ? { cast: {} } : null;
    },
  },
};
