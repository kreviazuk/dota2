import type { World } from '../sim/world';
import type { Unit } from '../sim/entities/unit';
import type { Command } from '../sim/commands';
import type { AiSkill } from '../sim/heroes/types';
import { enemyTeam } from '../sim/core/types';
import type { TeamPlan } from './teamAI';
import { alliesInRadius, canAttack, enemiesInRadius, expectedAttackDamage, nearestOf } from '../sim/query';
import { dist, type Vec2 } from '../sim/core/vec2';
import { forwardY, layoutFor } from '../sim/data/map';
import { enemyTowers, underEnemyTower } from './aiHelpers';

export type UtilityActionType =
  | 'avoid_tower'
  | 'retreat_safe'
  | 'last_hit'
  | 'deny'
  | 'chase_kill'
  | 'use_consumables'
  | 'push_tower'
  | 'harass';

export interface UtilityAction {
  type: UtilityActionType;
  /** 动态打分：0 到 100 分 */
  score: number;
  /** 决策执行的具体指令（score > 0 时有效） */
  command: Command | null;
  /** 关联的目标单位 ID */
  targetId?: number;
  /** 决策原因/说明 */
  reason?: string;
}

export interface UtilityEvaluation {
  actions: Record<UtilityActionType, UtilityAction>;
  /** 打分最高且 score > 0 的最优战术行为 */
  bestAction: UtilityAction | null;
}

/**
 * 战术效用评估层（Utility AI）
 * 每 0.2 秒对 8 类候选行为打分并选出最优行为
 */
export class UtilityAI {
  evaluate(world: World, me: Unit, skill: AiSkill, teamPlan?: TeamPlan): UtilityEvaluation {
    const actions: Record<UtilityActionType, UtilityAction> = {
      avoid_tower: this.evalAvoidTower(world, me),
      retreat_safe: this.evalRetreatSafe(world, me, skill, teamPlan),
      last_hit: this.evalLastHit(world, me, skill),
      deny: this.evalDeny(world, me, skill),
      chase_kill: this.evalChaseKill(world, me, teamPlan),
      use_consumables: this.evalUseConsumables(world, me),
      push_tower: this.evalPushTower(world, me, teamPlan),
      harass: this.evalHarass(world, me),
    };

    let bestAction: UtilityAction | null = null;
    let maxScore = 0;

    for (const key of Object.keys(actions) as UtilityActionType[]) {
      const act = actions[key];
      if (act.score > maxScore) {
        maxScore = act.score;
        bestAction = act;
      }
    }

    return { actions, bestAction };
  }

  /**
   * 1. 防御塔仇恨警觉与脱离 (avoid_tower: 95-100 分)
   * 当被防御塔集火锁定，或在敌方防御塔射程内无己方小兵抗塔时触发
   */
  evalAvoidTower(world: World, me: Unit): UtilityAction {
    const towers = enemyTowers(world, me.team);
    const targetedTower = towers.find((t) => t.attack.targetId === me.id);

    const fy = forwardY(me.team);

    if (targetedTower) {
      // 正在被防御塔攻击，极度危险，立即向己方方向撤离
      const escapePoint: Vec2 = { x: me.pos.x, y: me.pos.y - fy * 600 };
      return {
        type: 'avoid_tower',
        score: 100,
        command: { type: 'moveTo', point: escapePoint },
        targetId: targetedTower.id,
        reason: 'targeted by enemy tower',
      };
    }

    // 检查是否在敌塔范围内且无小兵吸收仇恨
    const inRangeTower = towers.find((t) => dist(me.pos, t.pos) <= t.stats.attackRange + me.radius + 50);
    if (inRangeTower) {
      const ownCreeps = world.units.filter(
        (u) => u.team === me.team && (u.kind === 'creep' || !!u.creep) && u.alive && dist(u.pos, inRangeTower.pos) <= inRangeTower.stats.attackRange + inRangeTower.radius,
      );
      if (ownCreeps.length === 0) {
        const escapePoint: Vec2 = { x: me.pos.x, y: me.pos.y - fy * 500 };
        return {
          type: 'avoid_tower',
          score: 95,
          command: { type: 'moveTo', point: escapePoint },
          targetId: inRangeTower.id,
          reason: 'in tower range with no creep tanking',
        };
      }
    }

    return { type: 'avoid_tower', score: 0, command: null };
  }

  /**
   * 2. 残血安全撤离或回城 (retreat_safe: 90-100 分)
   */
  evalRetreatSafe(world: World, me: Unit, skill: AiSkill, teamPlan?: TeamPlan): UtilityAction {
    const hpPct = me.hp / me.stats.maxHp;
    const manaPct = me.stats.maxMana > 0 ? me.mana / me.stats.maxMana : 1;
    const L = layoutFor(me.team);
    const atHome = dist(me.pos, L.fountain) < 450;

    const isLowHp = hpPct < skill.retreatHp;
    const isTeamRetreat = teamPlan?.mode === 'retreating' && hpPct < 0.5;

    if (atHome) {
      // 已经到家
      if (hpPct > 0.95 && manaPct > 0.7) {
        // 恢复完毕，重返战场
        return { type: 'retreat_safe', score: 0, command: null };
      }
      return {
        type: 'retreat_safe',
        score: 95,
        command: { type: 'stop' },
        reason: 'recovering at fountain',
      };
    }

    if (isLowHp || isTeamRetreat) {
      const enemies = enemiesInRadius(world, me.team, me.pos, 1000, { heroesOnly: true });
      const farFromHome = dist(me.pos, L.fountain) > 2500;

      // 敌方英雄远离且距离较远时选择快速回城 (Recall)
      if (enemies.length === 0 && farFromHome) {
        return {
          type: 'retreat_safe',
          score: 95,
          command: { type: 'recall' },
          reason: 'safe recall on low health',
        };
      }

      // 否则步行撤退至泉水
      const score = Math.min(100, Math.floor(90 + (1 - hpPct) * 10));
      return {
        type: 'retreat_safe',
        score,
        command: { type: 'moveTo', point: L.fountain },
        reason: 'retreating to fountain',
      };
    }

    return { type: 'retreat_safe', score: 0, command: null };
  }

  /**
   * 3. 正补 (last_hit: 85-95 分)
   * 考虑自身攻击前摇与远程弹道时间，计算斩杀线
   */
  evalLastHit(world: World, me: Unit, skill: AiSkill): UtilityAction {
    const range = me.stats.attackRange + 250;
    const enemyCreeps = enemiesInRadius(world, me.team, me.pos, range).filter(
      (u) => u.kind !== 'hero' && u.kind !== 'building' && canAttack(me, u),
    );

    if (!enemyCreeps.length) {
      return { type: 'last_hit', score: 0, command: null };
    }

    let bestCreep: Unit | null = null;
    let bestScore = 0;

    for (const creep of enemyCreeps) {
      const expDmg = expectedAttackDamage(world, me, creep);
      const d = dist(me.pos, creep.pos);
      // 弹道飞行时间与攻击前摇
      const travelTime = me.isMelee ? 0 : d / Math.max(1, me.base.projectileSpeed);
      const hitDelay = me.stats.attackPoint + travelTime;

      // 斩杀线：血量在一次普攻伤害以内（考虑弹道与前摇延迟的容差）
      const killThreshold = expDmg * (1 + Math.min(0.1, hitDelay * 0.05));
      if (creep.hp <= killThreshold) {
        // 血量越接近 0 斩杀紧迫度越高（85 ~ 95 分）
        const urgency = 1 - creep.hp / killThreshold;
        const score = Math.round(85 + 10 * urgency);
        if (score > bestScore) {
          bestScore = score;
          bestCreep = creep;
        }
      }
    }

    if (bestCreep && bestScore > 0) {
      return {
        type: 'last_hit',
        score: bestScore,
        command: { type: 'attack', mode: 'lastHit', targetId: bestCreep.id },
        targetId: bestCreep.id,
        reason: 'last hit enemy creep',
      };
    }

    return { type: 'last_hit', score: 0, command: null };
  }

  /**
   * 4. 反补 (deny: 70-80 分)
   * 友方小兵血量 < 50% 且进入斩杀线时反补压制敌方经验
   */
  evalDeny(world: World, me: Unit, skill: AiSkill): UtilityAction {
    const range = me.stats.attackRange + 250;
    const alliedCreeps = alliesInRadius(world, me.team, me.pos, range).filter(
      (u) => u.kind === 'creep' && u.hp < u.stats.maxHp * 0.5 && canAttack(me, u, true),
    );

    if (!alliedCreeps.length) {
      return { type: 'deny', score: 0, command: null };
    }

    let bestCreep: Unit | null = null;
    let bestScore = 0;

    for (const creep of alliedCreeps) {
      const expDmg = expectedAttackDamage(world, me, creep);
      if (creep.hp <= expDmg * 1.05) {
        const urgency = 1 - creep.hp / (expDmg * 1.05);
        const score = Math.round(70 + 10 * urgency);
        if (score > bestScore) {
          bestScore = score;
          bestCreep = creep;
        }
      }
    }

    if (bestCreep && bestScore > 0) {
      return {
        type: 'deny',
        score: bestScore,
        command: { type: 'attack', mode: 'lastHit', targetId: bestCreep.id },
        targetId: bestCreep.id,
        reason: 'deny allied creep',
      };
    }

    return { type: 'deny', score: 0, command: null };
  }

  /**
   * 5. 追杀脱节残血敌人 (chase_kill: 80-90 分)
   * 遵循防御塔仇恨规避：在敌方防御塔射程内禁止普攻敌方英雄，除非目标必定被 1 次攻击斩杀且自身血量安全
   */
  evalChaseKill(world: World, me: Unit, teamPlan?: TeamPlan): UtilityAction {
    const hpPct = me.hp / me.stats.maxHp;
    if (hpPct < 0.4) return { type: 'chase_kill', score: 0, command: null };

    const enemies = enemiesInRadius(world, me.team, me.pos, 900, { heroesOnly: true }).filter((h) => canAttack(me, h));
    if (!enemies.length) return { type: 'chase_kill', score: 0, command: null };

    for (const enemy of enemies) {
      const enemyHpPct = enemy.hp / enemy.stats.maxHp;
      const isPriority = teamPlan?.priorityTargetId === enemy.id;
      const isLowHp = enemyHpPct < 0.35;

      if (!isLowHp && !isPriority) continue;

      // 敌方泉水射程内严禁追击，防止送命
      const oppFountain = layoutFor(enemyTeam(me.team)).fountain;
      if (dist(enemy.pos, oppFountain) < 320) continue;

      const underTower = underEnemyTower(world, me.team, enemy.pos) || underEnemyTower(world, me.team, me.pos);
      if (underTower) {
        // 规则 4.2：敌方防御塔射程内禁止普攻敌方英雄，除非目标必定被 1 次攻击斩杀且自身血量安全
        const oneHitKill = enemy.hp <= expectedAttackDamage(world, me, enemy);
        if (!oneHitKill || hpPct <= 0.5) {
          continue; // 规避塔仇恨，不越塔普攻
        }
      }

      const score = Math.min(90, Math.round(80 + (0.35 - Math.min(0.35, enemyHpPct)) * 25 + (isPriority ? 5 : 0)));
      return {
        type: 'chase_kill',
        score,
        command: { type: 'attack', mode: 'smart', targetId: enemy.id },
        targetId: enemy.id,
        reason: 'chasing killable enemy',
      };
    }

    return { type: 'chase_kill', score: 0, command: null };
  }

  /**
   * 6. 使用消耗品急救 (use_consumables: 75-85 分)
   * 安全脱战状态下吃树/大药/魔棒急救
   */
  evalUseConsumables(world: World, me: Unit): UtilityAction {
    const hpPct = me.hp / me.stats.maxHp;
    const manaPct = me.stats.maxMana > 0 ? me.mana / me.stats.maxMana : 1;

    // 脱战判定：至少 3 秒未受伤害且附近 700 内无敌方英雄
    const outOfCombat = world.time - (me.hero?.lastDamagedTime ?? -999) > 3.0;
    const nearbyEnemyHeroes = enemiesInRadius(world, me.team, me.pos, 700, { heroesOnly: true });

    if (!outOfCombat || nearbyEnemyHeroes.length > 0) {
      return { type: 'use_consumables', score: 0, command: null };
    }

    for (let i = 0; i < me.inventory.length; i++) {
      const it = me.inventory[i];
      if (!it || (it.cooldownRemaining ?? 0) > 0) continue;

      // 治疗药膏 (healing_salve): 大量回血（受英雄伤害中断）
      if (it.id === 'healing_salve' && hpPct < 0.65) {
        return {
          type: 'use_consumables',
          score: Math.round(80 + (0.65 - hpPct) * 10),
          command: { type: 'useItem', index: i, target: { unitId: me.id } },
          reason: 'use healing salve out of combat',
        };
      }

      // 树之祭祀 (tango): 持续平稳回血
      if (it.id === 'tango' && hpPct < 0.8) {
        return {
          type: 'use_consumables',
          score: 75,
          command: { type: 'useItem', index: i },
          reason: 'use tango out of combat',
        };
      }

      // 仙灵之火 (faerie_fire): 瞬回 85 生命
      if (it.id === 'faerie_fire' && hpPct < 0.4) {
        return {
          type: 'use_consumables',
          score: 82,
          command: { type: 'useItem', index: i },
          reason: 'use faerie fire for quick heal',
        };
      }

      // 净化药水 (clarity): 持续回蓝（受英雄伤害中断）
      if (it.id === 'clarity' && manaPct < 0.45 && me.stats.maxMana > 0) {
        return {
          type: 'use_consumables',
          score: 76,
          command: { type: 'useItem', index: i, target: { unitId: me.id } },
          reason: 'use clarity out of combat',
        };
      }

      // 魔法芒果 (enchanted_mango): 瞬回 100 魔法
      if (it.id === 'enchanted_mango' && manaPct < 0.3 && me.stats.maxMana > 0) {
        return {
          type: 'use_consumables',
          score: 78,
          command: { type: 'useItem', index: i },
          reason: 'use enchanted mango for mana',
        };
      }

      // 魔棒 / 魔杖 (magic_stick / magic_wand): 充能回复
      if ((it.id === 'magic_stick' || it.id === 'magic_wand') && (it.charges ?? 0) >= 3) {
        if (hpPct < 0.55 || manaPct < 0.4) {
          return {
            type: 'use_consumables',
            score: 79,
            command: { type: 'useItem', index: i },
            reason: 'use magic stick charges',
          };
        }
      }
    }

    return { type: 'use_consumables', score: 0, command: null };
  }

  /**
   * 7. 配合小兵推塔 (push_tower: 60-75 分)
   */
  evalPushTower(world: World, me: Unit, teamPlan?: TeamPlan): UtilityAction {
    const hpPct = me.hp / me.stats.maxHp;
    if (hpPct < 0.4) return { type: 'push_tower', score: 0, command: null };

    const buildings = enemiesInRadius(world, me.team, me.pos, 1100, { includeBuildings: true }).filter(
      (u) => u.kind === 'building' && canAttack(me, u),
    );
    // 优先集火敌方遗迹以终结比赛
    const ancient = buildings.find((b) => b.building?.type === 'ancient');
    const targetBuilding = ancient ?? nearestOf(me.pos, buildings);
    if (!targetBuilding) return { type: 'push_tower', score: 0, command: null };

    // 如果是具有攻击力的防御塔，需要有己方小兵在塔下抗塔
    if (targetBuilding.base.damageMax > 0) {
      const ownCreeps = world.units.filter(
        (u) =>
          u.team === me.team &&
          (u.kind === 'creep' || !!u.creep) &&
          u.alive &&
          dist(u.pos, targetBuilding.pos) <= targetBuilding.stats.attackRange + targetBuilding.radius,
      );
      if (ownCreeps.length === 0) {
        return { type: 'push_tower', score: 0, command: null };
      }
    }

    const isAncient = targetBuilding.building?.type === 'ancient';
    const isPushMode = teamPlan?.mode === 'pushing';
    // 攻打遗迹以 98 分顶格效用全力终结比赛
    const score = isAncient ? 98 : isPushMode ? 75 : 65;

    return {
      type: 'push_tower',
      score,
      command: { type: 'attack', mode: 'building', targetId: targetBuilding.id },
      targetId: targetBuilding.id,
      reason: isAncient ? 'destroy enemy ancient to win' : 'pushing building with creeps tanking',
    };
  }

  /**
   * 8. 安全消耗敌方英雄 (harass: 40-60 分)
   * 遵循防御塔仇恨规避：敌塔射程内严格禁止普攻敌方英雄
   */
  evalHarass(world: World, me: Unit): UtilityAction {
    const hpPct = me.hp / me.stats.maxHp;
    if (hpPct < 0.45) return { type: 'harass', score: 0, command: null };

    // 自身在敌方塔下：禁止消耗（防止吸引塔仇恨）
    if (underEnemyTower(world, me.team, me.pos)) {
      return { type: 'harass', score: 0, command: null };
    }

    const range = me.stats.attackRange + 200;
    const enemyHeroes = enemiesInRadius(world, me.team, me.pos, range, { heroesOnly: true }).filter((h) => canAttack(me, h));
    if (!enemyHeroes.length) return { type: 'harass', score: 0, command: null };

    for (const enemy of enemyHeroes) {
      // 目标在敌方塔下：禁止普攻（攻击会吸引塔仇恨）
      if (underEnemyTower(world, me.team, enemy.pos)) continue;

      const enemyHpPct = enemy.hp / enemy.stats.maxHp;
      // 自身血量相对优势
      if (hpPct >= enemyHpPct - 0.1) {
        const hpAdvantage = Math.max(0, hpPct - enemyHpPct);
        const score = Math.round(40 + hpAdvantage * 20);
        return {
          type: 'harass',
          score,
          command: { type: 'attack', mode: 'smart', targetId: enemy.id },
          targetId: enemy.id,
          reason: 'safely harassing enemy hero',
        };
      }
    }

    return { type: 'harass', score: 0, command: null };
  }
}
