import type { HeroAiRules } from './types';
import type { Unit } from '../../sim/entities/unit';
import { dist, normalize, sub } from '../../sim/core/vec2';
import { abilityCastRange, abilityValue } from '../../sim/systems/abilities';
import { edgeDist, enemiesInRadius, isHiddenFrom, isTargetableBy } from '../../sim/query';
import { enemyCreepsNear, lineClearTo, predictPos, underAttack } from '../aiHelpers';

/**
 * 肉钩路线检查给别的单位留的余量（加大它们的碰撞半径、并要求比目标晚 25 才碰到），补偿出钩前摇 0.3 秒和飞行中它们的移动。
 * Task 17 模拟（帕吉 + 斧王 对 帕吉 + 斯温 + 斧王，12 局）：0 时钩到友方 56 次，25 时 26 次、钩中敌方英雄的次数不变；50 时钩中敌方英雄少三成
 */
const HOOK_MARGIN = 25;

/** 帕吉：肉钩只在路线上没有遮挡时出手，腐烂贴身开、没人时关，被打或肢解时开肉盾，肢解够得着的英雄 */
export const PUDGE_RULES: HeroAiRules = {
  // 肉钩：1300 内的敌方英雄，朝 predictPos(目标, 0.3 + 距离 / 1600) 出钩，且按钩子的扫掠判定（含帕吉身后的半圆）先碰到的是它、别的单位都至少晚 HOOK_MARGIN（`lineClearTo`）；魔法 > 30%
  pudge_meat_hook: {
    priority: 20,
    decide: (c) => {
      const { world, me, ab } = c;
      if (c.manaPct <= 0.3) return null;
      const range = abilityValue(me, ab, 'distance');
      const speed = abilityValue(me, ab, 'speed');
      const half = abilityValue(me, ab, 'width') / 2;
      const cands = c.enemyHeroes.filter((h) => dist(me.pos, h.pos) - h.radius <= range).sort((a, b) => dist(me.pos, a.pos) - dist(me.pos, b.pos));
      for (const h of cands) {
        const aim = predictPos(world, h, 0.3 + dist(me.pos, h.pos) / Math.max(1, speed), c.skill);
        if (dist(me.pos, aim) > range) continue;
        const dir = normalize(sub(aim, me.pos));
        if (!dir.x && !dir.y) continue;
        if (lineClearTo(world, me, h, dir, range, half, HOOK_MARGIN)) return { cast: { dir } };
      }
      return null;
    },
  },
  // 腐烂（开关）：关着时 300 内有敌方英雄、或 250 内 ≥ 2 个敌方小兵，且自己血量 > 50% → 打开；
  // 开着时 400 内没有敌人、或自己血量 < 25% → 关闭。撤退时也会考虑（只会关、不会开）
  pudge_rot: {
    escape: true,
    decide: (c) => {
      const { world, me, ab } = c;
      if (ab.toggled) {
        const anyone = enemiesInRadius(world, me.team, me.pos, 400).some((u) => !isHiddenFrom(u, me.team));
        return !anyone || c.hpPct < 0.25 ? { toggle: true } : null;
      }
      if (c.retreating || c.hpPct <= 0.5) return null;
      const hero = c.enemyHeroes.some((h) => edgeDist(me, h) <= 300);
      const radius = abilityValue(me, ab, 'radius');
      return hero || enemyCreepsNear(world, me, me.pos, radius).length >= 2 ? { toggle: true } : null;
    },
  },
  // 肉盾（即时）：正在被敌方英雄或防御塔攻击且 600 内有敌方英雄；或者正在引导肢解（施法中也会考虑）
  pudge_meat_shield: {
    whileCasting: true,
    escape: true,
    decide: (c) => {
      const { world, me } = c;
      if (me.cast?.phase === 'channel' && me.cast.ability.def.id === 'pudge_dismember') return { cast: {} };
      if (underAttack(world, me) && c.enemyHeroes.some((h) => edgeDist(me, h) <= 600)) return { cast: {} };
      return null;
    },
  },
  // 肢解：施法距离 + 100 内的敌方英雄（无视减益免疫），选最近的
  pudge_dismember: {
    priority: 30,
    decide: (c) => {
      const { me, ab } = c;
      const reach = abilityCastRange(me, ab) + 100;
      let best: Unit | null = null;
      for (const h of c.enemyHeroes) {
        if (edgeDist(me, h) > reach || !isTargetableBy(me, h, 'enemy', true)) continue;
        if (!best || edgeDist(me, h) < edgeDist(me, best)) best = h;
      }
      return best ? { cast: { unitId: best.id } } : null;
    },
  },
};
