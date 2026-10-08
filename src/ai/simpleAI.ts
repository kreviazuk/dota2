import type { World } from '../sim/world';
import type { Unit } from '../sim/entities/unit';
import { enemyTeam, type AbilitySlot, type Team } from '../sim/core/types';
import type { Vec2 } from '../sim/core/vec2';
import { dist } from '../sim/core/vec2';
import type { AbilityInstance, AiSkill } from '../sim/heroes/types';
import type { Command } from '../sim/commands';
import { isCommandLocked } from '../sim/commands';
import { canCast } from '../sim/systems/abilities';
import { alliesInRadius, canAttack, edgeDist, enemiesInRadius, expectedAttackDamage, nearestOf } from '../sim/query';
import { forwardY, layoutFor } from '../sim/data/map';
import { nextSkillToLearn, TALENT_BUILDS } from './builds';
import { enemyTowers, underEnemyTower } from './aiHelpers';
import { canPickTalent } from '../sim/talents';
import { AI_RULES, type AiCtx, type AiDecision, type AiRule, type HeroAiRules } from './usage/index';

/** AiCtx.enemyHeroes / allyHeroes 的搜索半径 */
const CTX_RADIUS = 1500;

/** 缺省优先级：R 30、X1/X2 20、其他 10 */
const defaultPriority = (slot: AbilitySlot): number => (slot === 'R' ? 30 : slot === 'X1' || slot === 'X2' ? 20 : 10);

interface RuleEntry { ab: AbilityInstance; slot: AbilitySlot; rule: AiRule; priority: number }

/** P1 的简单 AI：会补刀、会放技能、低血回家、跟着兵线推进。P4 会替换为完整三层 AI。 */
export class SimpleAI {
  private nextThink = 0;
  private retreating = false;
  /** 脱离战斗（disengage 施法之后）撤退到这个时刻；期间按撤退处理，但不回城、到时间后恢复正常 */
  private disengageUntil = -Infinity;

  /** rules 缺省为全部英雄的规则表（测试可以换成假规则） */
  constructor(readonly unitId: number, readonly skill: AiSkill, private readonly rules: HeroAiRules = AI_RULES) {}

  update(world: World): void {
    if (world.time < this.nextThink) return;
    this.nextThink = world.time + 0.2 + world.rng.range(0, this.skill.reaction * 0.5);
    const me = world.getUnit(this.unitId);
    if (!me || !me.hero) return;
    for (const c of this.think(world, me)) world.issue(me.id, c);
  }

  think(world: World, me: Unit): Command[] {
    const out: Command[] = [];
    const learn = nextSkillToLearn(me);
    if (learn) out.push({ type: 'learn', slot: learn });
    // 天赋（死亡时也选）：一次把所有已解锁的层都选上
    for (const tier of [0, 1, 2, 3] as const) {
      if (canPickTalent(world, me, tier)) out.push({ type: 'pickTalent', tier, side: TALENT_BUILDS[me.defId]?.[tier] ?? 0 });
    }
    if (!me.alive || me.order.kind === 'recall' || isCommandLocked(me)) return out;

    const L = layoutFor(me.team);
    const fy = forwardY(me.team);
    const hpPct = me.hp / me.stats.maxHp;
    const manaPct = me.stats.maxMana > 0 ? me.mana / me.stats.maxMana : 1;
    const atHome = dist(me.pos, L.fountain) < 450;
    if (this.retreating) {
      if (atHome && hpPct > 0.95 && manaPct > 0.7) this.retreating = false;
    } else if (hpPct < this.skill.retreatHp) {
      this.retreating = true;
    }
    const retreating = this.retreating || world.time < this.disengageUntil;
    // P1 的 1000 范围（回城判断、换血目标）保持不变；技能规则看 1500 范围（AiCtx）
    const enemyHeroes = enemiesInRadius(world, me.team, me.pos, 1000, { heroesOnly: true }).filter((h) => canAttack(me, h));
    const ctx: Omit<AiCtx, 'ab'> = {
      world, me, skill: this.skill,
      enemyHeroes: enemiesInRadius(world, me.team, me.pos, CTX_RADIUS, { heroesOnly: true }).filter((h) => canAttack(me, h)),
      allyHeroes: alliesInRadius(world, me.team, me.pos, CTX_RADIUS, { heroesOnly: true, excludeId: me.id }),
      hpPct, manaPct, retreating,
    };
    const rules = this.ruleEntries(me);

    if (retreating) {
      // 正在施放（或走向施放位置的）逃跑技能：不下移动指令，否则会把它打断
      const busyAb = me.cast?.ability ?? (me.order.kind === 'cast' ? me.order.ability : null);
      // 逃跑技能从下指令到施放结束每帧都重新思考：施法一结束（指令变回 idle）就下移动指令，
      // 不给站立自动攻击出手的时间（普攻会结束魅影无形）
      if (busyAb && this.rules[busyAb.def.id]?.escape) {
        this.nextThink = world.time;
        return out;
      }
      if (this.tryRules(world, ctx, rules.filter((r) => r.rule.escape), out)) {
        this.nextThink = world.time;
        return out;
      }
      if (atHome) out.push({ type: 'stop' });
      else if (this.retreating && enemyHeroes.length === 0 && dist(me.pos, L.fountain) > 2500) out.push({ type: 'recall' });
      else out.push({ type: 'moveTo', point: L.fountain });
      return out;
    }

    // 正在前摇或引导时不再下施法指令：重新施法会取消当前施法（思考间隔短于施法前摇时永远放不出技能）；
    // 只有 whileCasting 的（即时）技能可以插进来
    if (me.cast) {
      this.tryRules(world, ctx, rules.filter((r) => r.rule.whileCasting), out);
      return out;
    }
    if (this.tryRules(world, ctx, rules, out)) return out;
    if (me.order.kind === 'cast') return out;

    // 敌方英雄全灭或人数劣势明显时，趁机推塔：不必等小兵抗塔，血量够时也不躲塔（但仍然躲泉水）
    const push = hpPct > 0.5 && this.hasPushAdvantage(world, me.team);
    const towerOnMe = this.enemyTowerTargeting(world, me);
    if (towerOnMe && (!push || towerOnMe.building?.type === 'fountain')) {
      out.push({ type: 'moveTo', point: { x: me.pos.x, y: me.pos.y - fy * 500 } });
      return out;
    }

    const heroTarget = this.pickHeroTarget(world, me, enemyHeroes, hpPct);
    if (heroTarget) {
      out.push({ type: 'attack', mode: 'smart', targetId: heroTarget.id });
      return out;
    }

    const lh = this.pickLastHit(world, me);
    if (lh) {
      out.push({ type: 'attack', mode: 'lastHit', targetId: lh.id });
      return out;
    }

    const ownCreeps = world.units.filter((u) => u.team === me.team && u.creep && u.alive);
    const front = ownCreeps.length ? ownCreeps.reduce((a, b) => (b.pos.y * fy > a.pos.y * fy ? b : a)) : null;

    const building = push ? this.nearestEnemyBuilding(world, me) : this.pickBuilding(world, me, ownCreeps);
    if (building) {
      out.push({ type: 'attack', mode: 'building', targetId: building.id });
      return out;
    }

    const enemyCreeps = enemiesInRadius(world, me.team, me.pos, 800).filter((u) => u.kind !== 'hero' && canAttack(me, u));
    const safeCreeps = enemyCreeps.filter((c) => !underEnemyTower(world, me.team, c.pos) || this.towerBusy(world, me));
    if (safeCreeps.length && hpPct > 0.4) {
      const t = safeCreeps.reduce((a, b) => (b.hp < a.hp ? b : a));
      out.push({ type: 'attack', mode: 'smart', targetId: t.id });
      return out;
    }

    const anchor: Vec2 = front
      ? { x: front.pos.x, y: front.pos.y - fy * 150 }
      : { x: L.t1.x, y: this.frontTowerY(world, me) + fy * 250 };
    if (dist(me.pos, anchor) > 120) out.push({ type: 'moveTo', point: anchor });
    return out;
  }

  /** 已学会、有规则的技能，按优先级从高到低（同优先级保持技能顺序） */
  private ruleEntries(me: Unit): RuleEntry[] {
    const out: RuleEntry[] = [];
    for (const ab of me.abilities) {
      const slot = ab.def.slot;
      if (slot === 'innate' || ab.level <= 0) continue;
      const rule = this.rules[ab.def.id];
      if (rule) out.push({ ab, slot, rule, priority: rule.priority ?? defaultPriority(slot) });
    }
    return out.sort((a, b) => b.priority - a.priority);
  }

  /** 依次试规则：canCast 为真才调用 decide；第一个做出决定的规则下指令，返回 true */
  private tryRules(world: World, ctx: Omit<AiCtx, 'ab'>, entries: readonly RuleEntry[], out: Command[]): boolean {
    for (const e of entries) {
      if (!canCast(world, ctx.me, e.ab)) continue;
      const d: AiDecision = e.rule.decide({ ...ctx, ab: e.ab });
      if (!d) continue;
      if ('toggle' in d) out.push({ type: 'toggle', slot: e.slot });
      else {
        out.push({ type: 'cast', slot: e.slot, target: d.cast });
        if (d.disengage) {
          this.disengageUntil = world.time + world.balance.ai.disengageTime;
          this.nextThink = world.time;
        }
      }
      return true;
    }
    return false;
  }

  private hasPushAdvantage(world: World, team: Team): boolean {
    const alive = (t: Team) => world.heroes(t).filter((h) => h.alive).length;
    const enemies = alive(enemyTeam(team));
    return enemies === 0 || alive(team) - enemies >= 2;
  }

  private nearestEnemyBuilding(world: World, me: Unit): Unit | null {
    return nearestOf(me.pos, world.units.filter((u) => u.kind === 'building' && canAttack(me, u)));
  }

  /** 敌塔正在打我方小兵（可以安全地在塔下输出） */
  private towerBusy(world: World, me: Unit): boolean {
    return enemyTowers(world, me.team).some((t) => {
      const tgt = world.getUnit(t.attack.targetId);
      return !!tgt && tgt.kind !== 'hero' && dist(t.pos, me.pos) < t.stats.attackRange + 400;
    });
  }

  private enemyTowerTargeting(world: World, me: Unit): Unit | null {
    return enemyTowers(world, me.team).find((t) => t.attack.targetId === me.id) ?? null;
  }

  private pickHeroTarget(world: World, me: Unit, enemies: Unit[], hpPct: number): Unit | null {
    const cands = enemies.filter((e) => edgeDist(me, e) < 700);
    if (!cands.length) return null;
    const scored = cands
      .map((e) => ({ e, pct: e.hp / e.stats.maxHp }))
      .filter(({ e, pct }) => {
        if (underEnemyTower(world, me.team, e.pos) && !(pct < 0.25 && hpPct > 0.5)) return false;
        return !(hpPct < 0.45 && pct > 0.5);
      })
      .sort((a, b) => a.pct - b.pct);
    if (!scored.length) return null;
    const best = scored[0];
    return best.pct < hpPct + 0.1 || world.rng.chance(this.skill.focus * 0.3) ? best.e : null;
  }

  private pickLastHit(world: World, me: Unit): Unit | null {
    const creeps = enemiesInRadius(world, me.team, me.pos, me.stats.attackRange + 250).filter((u) => u.kind !== 'hero' && canAttack(me, u));
    const killable = creeps.filter((c) => c.hp <= expectedAttackDamage(world, me, c) * 1.05);
    if (!killable.length || !world.rng.chance(this.skill.lastHitSkill)) return null;
    return nearestOf(me.pos, killable);
  }

  private pickBuilding(world: World, me: Unit, ownCreeps: Unit[]): Unit | null {
    const b = enemiesInRadius(world, me.team, me.pos, 900, { includeBuildings: true }).filter(
      (u) => u.kind === 'building' && canAttack(me, u),
    );
    const t = nearestOf(me.pos, b);
    if (!t) return null;
    // 不会攻击的建筑（遗迹）可以直接打；防御塔需要我方小兵在塔下吸收仇恨
    if (t.base.damageMax <= 0) return t;
    const tanking = ownCreeps.some((c) => dist(c.pos, t.pos) < t.stats.attackRange + t.radius);
    return tanking ? t : null;
  }

  private frontTowerY(world: World, me: Unit): number {
    const fy = forwardY(me.team);
    const own = world.units.filter((u) => u.kind === 'building' && u.team === me.team && u.alive && u.building?.type === 'tower');
    if (!own.length) return layoutFor(me.team).ancient.y;
    return own.reduce((a, b) => (b.pos.y * fy > a.pos.y * fy ? b : a)).pos.y;
  }
}
