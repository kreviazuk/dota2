import type { Vec2 } from './core/vec2';
import { dist } from './core/vec2';
import type { Team } from './core/types';
import type { Unit } from './entities/unit';
import type { World } from './world';
import type { TargetTeam } from './heroes/types';
import { armorMultiplier } from './formulas';

export const edgeDist = (a: Unit, b: Unit): number => dist(a.pos, b.pos) - a.radius - b.radius;

export const isAliveUnit = (u: Unit | undefined | null): u is Unit => !!u && u.alive && !u.removed;

/** 不能行动：眩晕，或处于会禁用行动的强制位移中（不能攻击、施法、按指令移动） */
export const isDisabled = (u: Unit): boolean => u.hasState('stunned') || !!u.motion?.disables;

/** 对 team 一方隐藏（看不见）：不能被普攻、不能被技能选为目标，范围效果照常命中 */
export const isHiddenFrom = (u: Unit, team: Team): boolean => u.team !== team && u.hasState('hidden');

/** 能否被 attacker 普攻 */
export const canAttack = (attacker: Unit, t: Unit): boolean =>
  isAliveUnit(t) && t.team !== attacker.team && !t.hasState('invulnerable') && !t.hasState('untargetable') &&
  !isHiddenFrom(t, attacker.team);

/**
 * 只受普攻影响的单位：按被攻击次数计算的召唤物（治疗守卫，D17）。技能不能选它为目标、范围技能不影响它
 * （isTargetableBy、RadiusOpts.spell、直线弹道 linearSweep 都排除它）；普攻和"打出一次普攻"的技能（窒碍短匕、无敌斩）照常能摧毁它
 */
export const attackOnly = (u: Unit): boolean => u.summon?.hitsToKill !== undefined;

/**
 * 能否被 caster 的技能选为目标。opts.attack：这个技能的效果是一次普攻（窒碍短匕、无敌斩），
 * 可以选只受普攻影响的单位（attackOnly）
 */
export function isTargetableBy(
  caster: Unit, t: Unit, team: TargetTeam, allowDebuffImmune: boolean, opts: { attack?: boolean } = {},
): boolean {
  if (!isAliveUnit(t) || t.kind === 'building') return false;
  if (!opts.attack && attackOnly(t)) return false;
  if (t.hasState('invulnerable') || t.hasState('untargetable')) return false;
  if (isHiddenFrom(t, caster.team)) return false;
  if (team === 'enemy' && t.team === caster.team) return false;
  if (team === 'ally' && t.team !== caster.team) return false;
  if (t.team !== caster.team && t.hasState('debuffImmune') && !allowDebuffImmune) return false;
  return true;
}

export interface RadiusOpts {
  heroesOnly?: boolean;
  includeBuildings?: boolean;
  includeInvulnerable?: boolean;
  excludeId?: number;
  /** 技能的范围效果：不含只受普攻影响的单位（attackOnly，治疗守卫） */
  spell?: boolean;
}

/** 边缘距离在 radius 内的存活单位 */
export function unitsInRadius(world: World, center: Vec2, radius: number, pred?: (u: Unit) => boolean): Unit[] {
  const out: Unit[] = [];
  for (const u of world.units) {
    if (!u.alive || u.removed) continue;
    if (dist(u.pos, center) - u.radius > radius) continue;
    if (pred && !pred(u)) continue;
    out.push(u);
  }
  return out;
}

const passes = (u: Unit, o: RadiusOpts): boolean =>
  (!o.heroesOnly || u.kind === 'hero') &&
  (o.includeBuildings || u.kind !== 'building') &&
  (o.includeInvulnerable || !u.hasState('invulnerable')) &&
  !(o.spell && attackOnly(u)) &&
  u.id !== o.excludeId;

export const enemiesInRadius = (world: World, team: Team, center: Vec2, radius: number, opts: RadiusOpts = {}): Unit[] =>
  unitsInRadius(world, center, radius, (u) => u.team !== team && passes(u, opts));

export const alliesInRadius = (world: World, team: Team, center: Vec2, radius: number, opts: RadiusOpts = {}): Unit[] =>
  unitsInRadius(world, center, radius, (u) => u.team === team && passes(u, opts));

export function nearestOf(center: Vec2, list: readonly Unit[]): Unit | null {
  let best: Unit | null = null;
  let bd = Infinity;
  for (const u of list) {
    const d = dist(center, u.pos);
    if (d < bd) { bd = d; best = u; }
  }
  return best;
}

export const nearestEnemy = (world: World, from: Unit, radius: number, opts: RadiusOpts = {}): Unit | null =>
  nearestOf(
    from.pos,
    enemiesInRadius(world, from.team, from.pos, radius, opts).filter((u) => !u.hasState('untargetable') && !isHiddenFrom(u, from.team)),
  );

/** 一次普攻（最低伤害）对目标的预期伤害，用于补刀判断 */
export function expectedAttackDamage(world: World, attacker: Unit, target: Unit): number {
  const s = attacker.stats;
  return (s.damageMin + s.bonusDamage) * world.balance.damageMatrix[attacker.attackClass][target.armorClass] * armorMultiplier(target.stats.armor);
}

const searchRadius = (u: Unit): number => u.stats.attackRange + 200 + u.radius;

/** 普攻键：英雄 > 非建筑单位 > 建筑 */
export function smartAttackTarget(world: World, u: Unit): Unit | null {
  const all = enemiesInRadius(world, u.team, u.pos, searchRadius(u), { includeBuildings: true }).filter((t) => canAttack(u, t));
  const heroes = all.filter((t) => t.kind === 'hero');
  if (heroes.length) return nearestOf(u.pos, heroes);
  const units = all.filter((t) => t.kind !== 'building');
  if (units.length) return nearestOf(u.pos, units);
  return nearestOf(u.pos, all);
}

/** 补刀键：一下能打死的血量最低小兵；没有则血量最低的小兵 */
export function lastHitTarget(world: World, u: Unit): Unit | null {
  const creeps = enemiesInRadius(world, u.team, u.pos, searchRadius(u)).filter((t) => t.kind !== 'hero' && canAttack(u, t));
  if (!creeps.length) return null;
  const killable = creeps.filter((t) => t.hp <= expectedAttackDamage(world, u, t));
  const pool = killable.length ? killable : creeps;
  return pool.reduce((a, b) => (b.hp < a.hp ? b : a));
}

/** 推塔键 */
export function buildingTarget(world: World, u: Unit): Unit | null {
  const b = enemiesInRadius(world, u.team, u.pos, searchRadius(u), { includeBuildings: true }).filter(
    (t) => t.kind === 'building' && canAttack(u, t),
  );
  return nearestOf(u.pos, b);
}
