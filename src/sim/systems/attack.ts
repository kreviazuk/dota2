import type { World } from '../world';
import type { Unit } from '../entities/unit';
import { add, angleOf, normalize, scale, sub } from '../core/vec2';
import { canAttack, edgeDist, enemiesInRadius, isDisabled, nearestOf } from '../query';
import { applyDamage, heal, type DamageInfo } from './damage';
import { spawnProjectile } from './projectiles';

export interface AttackInfo {
  critMult: number;
  trueStrike: boolean;
  /** 固定加伤（不乘 damageMult，乘暴击） */
  bonusDamage: number;
  /** 攻击力倍率（窒碍短匕 30–75%），默认 1 */
  damageMult: number;
  /** 由技能发起的攻击（'pa_stifling_dagger'、'jugg_omnislash'……），被动可以据此判断 */
  abilityId?: string;
  /** 不触发攻击特效：不调用攻击者的 onAttackStart / onAttackLanded（被攻击者的 onAttacked 照常） */
  noProcs?: boolean;
  /** 只按目标的 bonusArmor 计算护甲（射手天赋） */
  ignoreBaseArmor?: boolean;
  /** 覆盖弹道外观（霜冻之箭、射手天赋） */
  visual?: string;
  /** 被动之间传递的标记，例如 flags.frost = 1 */
  flags: Record<string, number>;
}

export const newAttackInfo = (o: Partial<AttackInfo> = {}): AttackInfo => ({
  critMult: 1, trueStrike: false, bonusDamage: 0, damageMult: 1, ...o, flags: { ...o.flags },
});

export interface PerformAttackOpts extends Partial<AttackInfo> {
  /** 立即结算（不发射弹道），远程攻击者也一样 */
  instant?: boolean;
  /** 远程攻击的弹道速度，缺省为攻击者的弹道速度 */
  projectileSpeed?: number;
}

export const canUnitAttack = (u: Unit): boolean => u.base.damageMax > 0 && u.base.attackRange > 0;

/** 当前应该攻击的目标（考虑嘲讽、恐惧、指令、站立自动攻击） */
export function currentAttackTarget(world: World, u: Unit): Unit | null {
  const s = u.stats;
  if (s.tauntedBy !== null) {
    const t = world.getUnit(s.tauntedBy);
    if (t && canAttack(u, t)) return t;
  }
  if (s.fearedBy !== null) return null;
  if (u.kind === 'building') {
    const t = world.getUnit(u.attack.targetId);
    return t && canAttack(u, t) ? t : null;
  }
  if (u.order.kind === 'attack') {
    const t = world.getUnit(u.order.targetId);
    if (t && canAttack(u, t)) return t;
    u.order = { kind: 'idle' };
  }
  if (u.order.kind !== 'idle' || u.kind !== 'hero' || !u.autoAttack) return null;
  const cur = world.getUnit(u.attack.targetId);
  if (cur && canAttack(u, cur) && edgeDist(u, cur) <= s.attackRange) return cur;
  const inRange = enemiesInRadius(world, u.team, u.pos, s.attackRange + u.radius, { includeBuildings: true }).filter((t) =>
    canAttack(u, t),
  );
  const units = inRange.filter((t) => t.kind !== 'building');
  return nearestOf(u.pos, units.length ? units : inRange);
}

export function drawAggro(world: World, attacker: Unit, target: Unit): void {
  if (attacker.kind !== 'hero' || target.kind !== 'hero') return;
  const ag = world.balance.aggro;
  for (const c of enemiesInRadius(world, attacker.team, attacker.pos, ag.creepHeroAggroRadius)) {
    if (!c.creep || c.creep.protectedUntilContact) continue;
    c.creep.aggroTargetId = attacker.id;
    c.creep.aggroUntil = world.time + ag.creepHeroAggroDuration;
  }
  for (const b of world.units) {
    if (b.kind !== 'building' || !b.alive || !b.building || b.team === attacker.team) continue;
    if (edgeDist(b, attacker) <= b.stats.attackRange) {
      b.building.forcedTargetId = attacker.id;
      b.building.forcedUntil = world.time + world.balance.buildings.towerAggroHold;
    }
  }
}

export function updateAttacks(world: World, dt: number): void {
  // 同一 tick 内完成前摇的攻击视为同时出手：先收集再统一结算。
  // 否则在双方互相致死时，先加入 world.units 的一方（总是先刷出的天辉兵）总能先打死对方，造成系统性的阵营偏差。
  const launches: { attacker: Unit; target: Unit }[] = [];
  for (const u of world.units) {
    if (!u.alive || !canUnitAttack(u)) continue;
    const a = u.attack;
    if (a.cooldown > 0) a.cooldown = Math.max(0, a.cooldown - dt);
    if (u.cast || isDisabled(u) || u.hasState('disarmed') || u.hasState('busy')) {
      a.windup = -1;
      continue;
    }
    const target = currentAttackTarget(world, u);
    if (!target) {
      a.windup = -1;
      a.targetId = null;
      continue;
    }
    if (a.targetId !== target.id) a.windup = -1;
    a.targetId = target.id;
    const reach = u.stats.attackRange + (a.windup >= 0 ? 100 : 0);
    if (edgeDist(u, target) > reach) {
      a.windup = -1;
      continue;
    }
    u.facing = angleOf(sub(target.pos, u.pos));
    if (a.windup < 0) {
      if (a.cooldown > 1e-6) continue;
      a.windup = u.stats.attackPoint;
      a.cooldown = u.stats.attackInterval;
      world.events.emit({ type: 'attackStart', attackerId: u.id, targetId: target.id });
      drawAggro(world, u, target);
    }
    a.windup -= dt;
    if (a.windup <= 1e-6) {
      a.windup = -1;
      launches.push({ attacker: u, target });
    }
  }
  for (const { attacker, target } of launches) launchAttack(world, attacker, target);
}

const attackVisual = (u: Unit): string =>
  u.kind === 'building'
    ? u.building?.type === 'fountain' ? 'fountain' : 'tower'
    : u.kind === 'hero' ? `hero:${u.defId}` : u.creep?.type === 'siege' ? 'siege' : 'creep';

/** 普攻出手（前摇结束）：触发 onAttackStart，近战立即结算，远程发射追踪弹道 */
export function launchAttack(world: World, attacker: Unit, target: Unit): void {
  performAttack(world, attacker, target);
}

/**
 * 技能发起的一次攻击：先调用攻击者的 onAttackStart（除非 noProcs），
 * 然后立即结算（instant 或近战）或发射追踪弹道（远程）。不发 attackStart 事件、不引仇恨。
 */
export function performAttack(world: World, attacker: Unit, target: Unit, o: PerformAttackOpts = {}): void {
  const { instant, projectileSpeed, ...rest } = o;
  const atk = newAttackInfo(rest);
  if (!atk.noProcs) for (const m of attacker.modifiers.slice()) m.def.onAttackStart?.(m, attacker, target, world, atk);
  if (instant || attacker.isMelee) {
    resolveAttack(world, attacker, target, atk);
    return;
  }
  const dir = normalize(sub(target.pos, attacker.pos));
  spawnProjectile(world, {
    team: attacker.team,
    sourceId: attacker.id,
    pos: add(attacker.pos, scale(dir, attacker.radius)),
    speed: projectileSpeed ?? attacker.base.projectileSpeed,
    kind: 'homing',
    targetId: target.id,
    visual: atk.visual ?? attackVisual(attacker),
    onHit: (w, t) => {
      resolveAttack(w, attacker, t, atk);
    },
  });
}

/** 一次攻击的伤害随机值（不含暴击和攻击类型系数）：rng(min, max) + 额外攻击力 */
export function rollAttackDamage(world: World, attacker: Unit): number {
  const s = attacker.stats;
  return world.rng.range(s.damageMin, s.damageMax) + s.bonusDamage;
}

/** 结算一次普攻命中，返回实际伤害（闪避返回 0） */
export function resolveAttack(world: World, attacker: Unit, target: Unit, atk: AttackInfo): number {
  if (!target.alive || target.removed || target.hasState('invulnerable')) return 0;
  const ev = target.stats.evasion;
  if (!atk.trueStrike && ev > 0 && world.rng.chance(ev)) {
    world.events.emit({ type: 'miss', attackerId: attacker.id, targetId: target.id });
    return 0;
  }
  const s = attacker.stats;
  const raw = rollAttackDamage(world, attacker) * atk.damageMult + atk.bonusDamage;
  const info: DamageInfo = {
    source: attacker, target, amount: raw * atk.critMult, type: 'physical', isAttack: true, crit: atk.critMult > 1,
    abilityId: atk.abilityId, ignoreBaseArmor: atk.ignoreBaseArmor, attack: atk,
  };
  const dealt = applyDamage(world, info);
  if (!atk.noProcs) for (const m of attacker.modifiers.slice()) m.def.onAttackLanded?.(m, attacker, target, world, info);
  if (target.alive) for (const m of target.modifiers.slice()) m.def.onAttacked?.(m, target, attacker, world, info);
  if (attacker.alive && s.lifesteal > 0 && dealt > 0 && target.kind !== 'building') heal(world, attacker, dealt * s.lifesteal);
  return dealt;
}
