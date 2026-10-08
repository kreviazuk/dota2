import type { World } from '../world';
import type { Unit } from '../entities/unit';
import { add, angleOf, normalize, scale, sub } from '../core/vec2';
import { canAttack, edgeDist, enemiesInRadius, isDisabled, nearestOf } from '../query';
import { applyDamage, heal, type DamageInfo } from './damage';
import { spawnProjectile } from './projectiles';

export interface AttackInfo {
  critMult: number;
  trueStrike: boolean;
  bonusDamage: number;
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

export function launchAttack(world: World, attacker: Unit, target: Unit): void {
  const atk: AttackInfo = { critMult: 1, trueStrike: false, bonusDamage: 0 };
  for (const m of attacker.modifiers.slice()) m.def.onAttackStart?.(m, attacker, target, world, atk);
  if (attacker.isMelee) {
    resolveAttack(world, attacker, target, atk);
    return;
  }
  const dir = normalize(sub(target.pos, attacker.pos));
  spawnProjectile(world, {
    team: attacker.team,
    sourceId: attacker.id,
    pos: add(attacker.pos, scale(dir, attacker.radius)),
    speed: attacker.base.projectileSpeed,
    kind: 'homing',
    targetId: target.id,
    visual: attackVisual(attacker),
    onHit: (w, t) => {
      resolveAttack(w, attacker, t, atk);
    },
  });
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
  const raw = world.rng.range(s.damageMin, s.damageMax) + s.bonusDamage + atk.bonusDamage;
  const info: DamageInfo = { source: attacker, target, amount: raw * atk.critMult, type: 'physical', isAttack: true, crit: atk.critMult > 1 };
  const dealt = applyDamage(world, info);
  for (const m of attacker.modifiers.slice()) m.def.onAttackLanded?.(m, attacker, target, world, info);
  if (target.alive) for (const m of target.modifiers.slice()) m.def.onAttacked?.(m, target, attacker, world, info);
  if (attacker.alive && s.lifesteal > 0 && dealt > 0 && target.kind !== 'building') heal(world, attacker, dealt * s.lifesteal);
  return dealt;
}
