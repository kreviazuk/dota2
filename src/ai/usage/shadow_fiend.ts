import type { HeroAiRules } from './types';
import type { Vec2 } from '../../sim/core/vec2';
import { add, dist, fromAngle, normalize, scale, sub } from '../../sim/core/vec2';
import { abilityCastPoint, abilityValue } from '../../sim/systems/abilities';
import { edgeDist } from '../../sim/query';
import { getSouls } from '../../sim/heroes/shadow_fiend';
import { attackedEnemyHero, enemyCreepsNear, keepsUltMana, predictPos } from '../aiHelpers';

/** 影魔：毁灭阴影打英雄 / 清兵、灵魂盛宴打架或刷兵时开、魂之挽歌贴脸放 */
export const SF_RULES: HeroAiRules = {
  // 毁灭阴影：按智能施法的规则（与预判 0.55 秒后的英雄距离之差 ≤ 半径 + 英雄半径的一档）能打中就放，从近到远试敌方英雄；
  // 没有能打中的英雄时清兵：某一档的落点 250 内 ≥ 3 个敌方小兵、魔法 > 50% 且至少还有 2 层充能。两种情况都留大招的魔法
  sf_shadowraze: {
    priority: 15,
    decide: (c) => {
      const { world, me, ab, skill } = c;
      if (!keepsUltMana(c)) return null;
      const steps = ab.def.pointSnap ?? [];
      if (steps.length === 0) return null;
      const radius = abilityValue(me, ab, 'radius');
      const reach = Math.max(...steps) + radius;
      const lead = abilityCastPoint(me, ab);
      const heroes = c.enemyHeroes.filter((h) => dist(me.pos, h.pos) - h.radius <= reach).sort((a, b) => dist(me.pos, a.pos) - dist(me.pos, b.pos));
      for (const h of heroes) {
        const p = predictPos(world, h, lead, skill);
        const d = dist(me.pos, p);
        const dir = d > 1e-6 ? normalize(sub(p, me.pos)) : fromAngle(me.facing);
        let best: number | null = null;
        for (const s of steps) {
          const diff = Math.abs(d - s);
          if (diff <= radius + h.radius && (best === null || diff < Math.abs(d - best))) best = s;
        }
        if (best !== null) return { cast: { point: add(me.pos, scale(dir, best)) } };
      }
      if (c.manaPct <= 0.5 || ab.charges < 2) return null;
      let bestPoint: Vec2 | null = null;
      let bestCount = 2;
      for (const cr of enemyCreepsNear(world, me, me.pos, reach)) {
        const d = dist(me.pos, cr.pos);
        if (d < 1e-6) continue;
        const step = steps.reduce((a, b) => (Math.abs(b - d) < Math.abs(a - d) ? b : a));
        const point = add(me.pos, scale(normalize(sub(cr.pos, me.pos)), step));
        const n = enemyCreepsNear(world, me, point, radius).length;
        if (n > bestCount) {
          bestCount = n;
          bestPoint = point;
        }
      }
      return bestPoint ? { cast: { point: bestPoint } } : null;
    },
  },
  // 灵魂盛宴：自己正在攻击 600 内的敌方英雄；或 600 内 ≥ 3 个敌方小兵且魔法 > 60%（刷兵时留大招的魔法）
  sf_feast_of_souls: {
    decide: (c) => {
      const { world, me, ab } = c;
      const radius = abilityValue(me, ab, 'radius');
      const t = attackedEnemyHero(c);
      if (t && edgeDist(me, t) <= radius) return { cast: {} };
      if (c.manaPct <= 0.6 || !keepsUltMana(c)) return null;
      return enemyCreepsNear(world, me, me.pos, radius).length >= 3 ? { cast: {} } : null;
    },
  },
  // 魂之挽歌：灵魂 ≥ 8，且 450 内 ≥ 2 个敌方英雄，或 300 内有血量 < 60% 的敌方英雄
  sf_requiem: {
    priority: 30,
    decide: (c) => {
      const { me } = c;
      if (getSouls(me) < 8) return null;
      const near = c.enemyHeroes.filter((h) => edgeDist(me, h) <= 450);
      if (near.length >= 2) return { cast: {} };
      return c.enemyHeroes.some((h) => edgeDist(me, h) <= 300 && h.hp / h.stats.maxHp < 0.6) ? { cast: {} } : null;
    },
  },
};
