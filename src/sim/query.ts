import type { Vec2 } from './core/vec2';
import { dist } from './core/vec2';
import type { Team } from './core/types';
import type { Unit } from './entities/unit';
import type { World } from './world';
import type { TargetTeam } from './heroes/types';

export const edgeDist = (a: Unit, b: Unit): number => dist(a.pos, b.pos) - a.radius - b.radius;

export const isAliveUnit = (u: Unit | undefined | null): u is Unit => !!u && u.alive && !u.removed;

/** 能否被 attacker 普攻 */
export const canAttack = (attacker: Unit, t: Unit): boolean =>
  isAliveUnit(t) && t.team !== attacker.team && !t.hasState('invulnerable') && !t.hasState('untargetable');

/** 能否被 caster 的技能选为目标 */
export function isTargetableBy(caster: Unit, t: Unit, team: TargetTeam, allowDebuffImmune: boolean): boolean {
  if (!isAliveUnit(t) || t.kind === 'building') return false;
  if (t.hasState('invulnerable') || t.hasState('untargetable')) return false;
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
  nearestOf(from.pos, enemiesInRadius(world, from.team, from.pos, radius, opts).filter((u) => !u.hasState('untargetable')));
