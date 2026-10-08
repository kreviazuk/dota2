import type { HeroAiRules } from './types';
import type { Unit } from '../../sim/entities/unit';
import { dist } from '../../sim/core/vec2';
import { layoutFor } from '../../sim/data/map';
import { abilityCastRange, abilityValue } from '../../sim/systems/abilities';
import { edgeDist, isAliveUnit, isTargetableBy } from '../../sim/query';
import { attackedEnemyHero, enemyCreepsNear, physicalDamageTo, underAttack } from '../aiHelpers';

/** 我方是否站在敌方防御塔的射程里（按塔中心到单位中心，含塔和单位半径） */
function underEnemyTower(me: Unit, u: Unit, world: { units: Unit[] }): boolean {
  return world.units.some(
    (b) => b.kind === 'building' && b.alive && b.team !== me.team && b.building?.type === 'tower' &&
      dist(b.pos, u.pos) <= b.stats.attackRange + b.radius + u.radius,
  );
}

/** 幻影刺客：短匕消耗 / 远程补刀、幻影突袭切入或借友方单位逃跑、魅影无形撤退或保命 */
export const PA_RULES: HeroAiRules = {
  // 窒碍短匕：施法距离内有敌方英雄（选当前生命最低的）且魔法 > 30%；
  // 或攻击距离 + 100 之外有一刀能补掉的小兵（按护甲减免估算，取攻击力下限）且魔法 > 60%
  pa_stifling_dagger: {
    decide: (c) => {
      const { world, me, ab } = c;
      const range = abilityCastRange(me, ab);
      const ok = (u: Unit): boolean => isTargetableBy(me, u, 'enemy', false);
      if (c.manaPct > 0.3) {
        const h = c.enemyHeroes.filter((u) => ok(u) && edgeDist(me, u) <= range).reduce<Unit | null>((a, b) => (!a || b.hp < a.hp ? b : a), null);
        if (h) return { cast: { unitId: h.id } };
      }
      if (c.manaPct <= 0.6) return null;
      const damage = (me.stats.damageMin + me.stats.bonusDamage) * abilityValue(me, ab, 'attackPct') + abilityValue(me, ab, 'baseDamage');
      const reach = me.stats.attackRange + 100;
      const kill = enemyCreepsNear(world, me, me.pos, range)
        .filter((u) => ok(u) && edgeDist(me, u) > reach && edgeDist(me, u) <= range && physicalDamageTo(u, damage) >= u.hp)
        .reduce<Unit | null>((a, b) => (!a || b.hp < a.hp ? b : a), null);
      return kill ? { cast: { unitId: kill.id } } : null;
    },
  },
  // 幻影突袭：进攻——施法距离内的敌方英雄，自己血量 > 50%，且目标血量 < 70% 或在攻击距离 + 100 之外（不跳进敌塔下，除非目标血量 < 25%）；
  // 撤退——600 内有敌方英雄时，跳到施法距离内"离家更近、离敌人更远"的友方单位（小兵或英雄）
  pa_phantom_strike: {
    escape: true,
    decide: (c) => {
      const { world, me, ab } = c;
      const range = abilityCastRange(me, ab);
      if (c.retreating) {
        const threats = c.enemyHeroes.filter((e) => edgeDist(me, e) <= 600);
        if (!threats.length) return null;
        const home = layoutFor(me.team).fountain;
        const myHome = dist(me.pos, home);
        const threatDist = (p: Unit): number => Math.min(...threats.map((e) => dist(e.pos, p.pos)));
        const myThreat = threatDist(me);
        let best: Unit | null = null;
        let bestGain = 150;
        for (const u of world.units) {
          if (!isAliveUnit(u) || u.team !== me.team || u.id === me.id || (u.kind !== 'creep' && u.kind !== 'hero')) continue;
          if (edgeDist(me, u) > range || !isTargetableBy(me, u, 'ally', false)) continue;
          const gain = myHome - dist(u.pos, home);
          if (gain > bestGain && threatDist(u) > myThreat) {
            bestGain = gain;
            best = u;
          }
        }
        return best ? { cast: { unitId: best.id } } : null;
      }
      if (c.hpPct <= 0.5) return null;
      const reach = me.stats.attackRange + 100;
      let best: Unit | null = null;
      for (const h of c.enemyHeroes) {
        const d = edgeDist(me, h);
        if (d > range || !isTargetableBy(me, h, 'enemy', false)) continue;
        const pct = h.hp / h.stats.maxHp;
        if (pct >= 0.7 && d <= reach) continue;
        if (pct >= 0.25 && underEnemyTower(me, h, world)) continue;
        if (!best || h.hp < best.hp) best = h;
      }
      return best ? { cast: { unitId: best.id } } : null;
    },
  },
  // 魅影无形：撤退中且 800 内有敌方英雄或正在被攻击；或者交战中（正在打敌方英雄 / 被攻击）自己血量 < 50%
  pa_blur: {
    priority: 20,
    escape: true,
    decide: (c) => {
      const { world, me } = c;
      const attacked = underAttack(world, me);
      if (c.retreating) return attacked || c.enemyHeroes.some((e) => edgeDist(me, e) <= 800) ? { cast: {} } : null;
      const fighting = attacked || !!attackedEnemyHero(c);
      return fighting && c.hpPct < 0.5 ? { cast: {} } : null;
    },
  },
};
