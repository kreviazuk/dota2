import type { HeroAiRules } from './types';
import type { Unit } from '../../sim/entities/unit';
import type { Vec2 } from '../../sim/core/vec2';
import { dist, dot, normalize, sub } from '../../sim/core/vec2';
import { abilityValue } from '../../sim/systems/abilities';
import { edgeDist, isTargetableBy } from '../../sim/query';
import { enemyCreepsNear } from '../aiHelpers';

/** 正在引导（持续施法）的单位 */
const channelling = (u: Unit): boolean => u.cast?.phase === 'channel';

/** 近战 = 普攻没有弹道（与精准光环的远程标准一致） */
const isMelee = (u: Unit): boolean => u.isMelee;

/** 狂风能影响到的目标（不打减益免疫的） */
const gustable = (me: Unit, u: Unit): boolean => isTargetableBy(me, u, 'enemy', false);

/** u 是否在以 me 为顶点、朝 dir、半角 half、长 length 的扇形里（按单位边缘算） */
function inCone(me: Unit, u: Unit, dir: Vec2, half: number, length: number): boolean {
  const to = sub(u.pos, me.pos);
  const d = dist(u.pos, me.pos);
  if (d - u.radius > length) return false;
  if (d <= u.radius) return true;
  // 单位半径带来的角度余量
  const slack = Math.asin(Math.min(1, u.radius / d));
  return Math.acos(Math.max(-1, Math.min(1, dot(to, dir) / d))) <= half + slack;
}

/** 卓尔：霜冻之箭按魔法开关、狂风推开近战和打断引导 / 掩护撤退、数箭齐发打英雄或清兵 */
export const DROW_RULES: HeroAiRules = {
  // 霜冻之箭（开关）：魔法 > 30% 且关着 → 打开；魔法 < 15% 且开着 → 关掉
  drow_frost_arrows: {
    decide: (c) => {
      const on = c.ab.toggled;
      if (!on && c.manaPct > 0.3) return { toggle: true };
      if (on && c.manaPct < 0.15) return { toggle: true };
      return null;
    },
  },
  // 狂风：350 内的敌方近战英雄 → 朝它放；900 内正在引导的敌方英雄 → 朝它放；撤退中 500 内有敌方英雄 → 朝它放
  drow_gust: {
    priority: 20,
    escape: true,
    decide: (c) => {
      const { me } = c;
      const nearest = (maxDist: number, pred: (u: Unit) => boolean): Unit | null => {
        let best: Unit | null = null;
        let bd = Infinity;
        for (const h of c.enemyHeroes) {
          const d = edgeDist(me, h);
          if (d <= maxDist && d < bd && gustable(me, h) && pred(h)) { bd = d; best = h; }
        }
        return best;
      };
      const t = nearest(350, isMelee) ?? nearest(900, channelling) ?? (c.retreating ? nearest(500, () => true) : null);
      if (!t) return null;
      const dir = sub(t.pos, me.pos);
      return dir.x || dir.y ? { cast: { dir } } : null;
    },
  },
  // 数箭齐发：朝最近的敌方英雄（没有英雄时朝最近的敌方小兵）；扇形（攻击距离 + 475）里有 ≥ 1 个英雄，或 ≥ 4 个小兵且魔法 > 50%
  drow_multishot: {
    decide: (c) => {
      const { world, me, ab } = c;
      const length = me.stats.attackRange + abilityValue(me, ab, 'rangeBonus');
      const half = (abilityValue(me, ab, 'cone') * Math.PI) / 360;
      const heroes = c.enemyHeroes.filter((h) => edgeDist(me, h) <= length);
      const creeps = enemyCreepsNear(world, me, me.pos, length);
      const pool = heroes.length ? heroes : creeps;
      const aim = pool.reduce<Unit | null>((a, b) => (!a || dist(me.pos, b.pos) < dist(me.pos, a.pos) ? b : a), null);
      if (!aim) return null;
      const dir = normalize(sub(aim.pos, me.pos));
      if (!dir.x && !dir.y) return null;
      const nHeroes = c.enemyHeroes.filter((h) => inCone(me, h, dir, half, length)).length;
      const nCreeps = creeps.filter((u) => inCone(me, u, dir, half, length)).length;
      if (nHeroes >= 1 || (nCreeps >= 4 && c.manaPct > 0.5)) return { cast: { dir } };
      return null;
    },
  },
};
