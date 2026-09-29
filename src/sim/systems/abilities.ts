import type { World } from '../world';
import type { Unit } from '../entities/unit';
import type { AbilityDef, AbilityInstance, CastContext, CastState, CastTarget, ResolvedTarget } from '../heroes/types';
import type { Vec2 } from '../core/vec2';
import { add, angleOf, dist, fromAngle, normalize, scale, sub } from '../core/vec2';
import { edgeDist, enemiesInRadius, isTargetableBy, nearestOf } from '../query';
import { addModifier, findModifier, removeModifier } from '../modifiers';
import { recomputeStats } from '../stats';

export const levelValue = (arr: readonly number[] | undefined, level: number): number => {
  if (!arr || arr.length === 0) return 0;
  return arr[Math.max(0, Math.min(arr.length, level) - 1)];
};

export const newAbilityInstance = (def: AbilityDef): AbilityInstance => ({
  def, level: def.slot === 'innate' ? 1 : 0, cooldown: 0, charges: def.charges ?? 0, chargeTimer: 0, toggled: false, data: {},
});

export function abilityValue(caster: Unit, ab: AbilityInstance, key: string): number {
  const base = levelValue(ab.def.values[key], Math.max(1, ab.level));
  return base + (caster.hero?.talentValueBonus[`${ab.def.id}.${key}`] ?? 0);
}

export const abilityCooldown = (ab: AbilityInstance, caster?: Unit): number =>
  Math.max(0, levelValue(ab.def.cooldown, Math.max(1, ab.level)) + (caster?.hero?.talentValueBonus[`${ab.def.id}.cooldown`] ?? 0));
export const abilityManaCost = (ab: AbilityInstance, caster?: Unit): number =>
  Math.max(0, levelValue(ab.def.manaCost, Math.max(1, ab.level)) + (caster?.hero?.talentValueBonus[`${ab.def.id}.manaCost`] ?? 0));
export const abilityCastRange = (caster: Unit, ab: AbilityInstance): number =>
  levelValue(ab.def.castRange, Math.max(1, ab.level)) + caster.stats.castRangeBonus;

export const makeCastContext = (world: World, caster: Unit, ab: AbilityInstance, target: ResolvedTarget): CastContext => ({
  world, caster, ability: ab, level: ab.level, target, v: (key: string) => abilityValue(caster, ab, key),
});

export const isReady = (ab: AbilityInstance): boolean => (ab.def.charges ? ab.charges > 0 : ab.cooldown <= 1e-6);

export function canCast(world: World, caster: Unit, ab: AbilityInstance): boolean {
  void world;
  if (!caster.alive || ab.level <= 0) return false;
  const tt = ab.def.targetType;
  if (tt === 'passive') return false;
  if (caster.hasState('stunned') || caster.hasState('silenced')) return false;
  if (tt === 'toggle') return true;
  return isReady(ab) && caster.mana + 1e-6 >= abilityManaCost(ab, caster);
}

export const isValidUnitTarget = (caster: Unit, ab: AbilityInstance, t: Unit): boolean =>
  isTargetableBy(caster, t, ab.def.targetTeam ?? 'enemy', !!ab.def.ignoresDebuffImmune) && (!ab.def.heroesOnly || t.kind === 'hero');

export function resolveTarget(world: World, caster: Unit, ab: AbilityInstance, given?: CastTarget): ResolvedTarget | null {
  const def = ab.def;
  const range = abilityCastRange(caster, ab);
  const search = Math.max(range, 200) + 300;
  const nearestEnemyPos = (): Vec2 | null => {
    const e = enemiesInRadius(world, caster.team, caster.pos, search).filter((u) => isTargetableBy(caster, u, 'enemy', true));
    const heroes = e.filter((u) => u.kind === 'hero');
    return nearestOf(caster.pos, heroes.length ? heroes : e)?.pos ?? null;
  };
  switch (def.targetType) {
    case 'none':
    case 'toggle':
      return {};
    case 'passive':
      return null;
    case 'unit': {
      if (given?.unitId !== undefined) {
        const u = world.getUnit(given.unitId);
        return u && isValidUnitTarget(caster, ab, u) ? { unit: u } : null;
      }
      const smart = def.smartTarget?.(world, caster, ab);
      if (smart) return smart;
      const pool = world.units.filter((u) => dist(u.pos, caster.pos) - u.radius <= search && isValidUnitTarget(caster, ab, u));
      if ((def.targetTeam ?? 'enemy') === 'ally') {
        const allies = pool.filter((u) => u.kind === 'hero' && u.id !== caster.id);
        return { unit: nearestOf(caster.pos, allies) ?? caster };
      }
      const heroes = pool.filter((u) => u.kind === 'hero');
      const t = nearestOf(caster.pos, heroes.length ? heroes : pool);
      return t ? { unit: t } : null;
    }
    case 'point': {
      const clampP = (p: Vec2): Vec2 =>
        dist(caster.pos, p) <= range ? { x: p.x, y: p.y } : add(caster.pos, scale(normalize(sub(p, caster.pos)), range));
      if (given?.point) return { point: clampP(given.point) };
      if (given?.dir) return { point: add(caster.pos, scale(normalize(given.dir), range)) };
      const p = nearestEnemyPos();
      return { point: p ? clampP(p) : add(caster.pos, scale(fromAngle(caster.facing), Math.min(range, 400))) };
    }
    case 'direction': {
      const tryDir = (d: Vec2): ResolvedTarget | null => (d.x || d.y ? { dir: d } : null);
      if (given?.dir) { const r = tryDir(normalize(given.dir)); if (r) return r; }
      if (given?.point) { const r = tryDir(normalize(sub(given.point, caster.pos))); if (r) return r; }
      const p = nearestEnemyPos();
      if (p) { const r = tryDir(normalize(sub(p, caster.pos))); if (r) return r; }
      return { dir: fromAngle(caster.facing) };
    }
  }
}

export function inCastRange(world: World, caster: Unit, ab: AbilityInstance, t: ResolvedTarget): boolean {
  void world;
  if (ab.def.targetType === 'unit' && t.unit) return edgeDist(caster, t.unit) <= abilityCastRange(caster, ab) + 1;
  if (ab.def.targetType === 'point' && t.point) return dist(caster.pos, t.point) <= abilityCastRange(caster, ab) + 1;
  return true;
}

/** 施法指令下需要走向的位置；已在范围内或正在施法时返回 null */
export function castGoal(world: World, caster: Unit): Vec2 | null {
  if (caster.order.kind !== 'cast' || caster.cast) return null;
  const { ability, target } = caster.order;
  if (inCastRange(world, caster, ability, target)) return null;
  return target.unit?.pos ?? target.point ?? null;
}

export function cancelCast(world: World, caster: Unit, interrupted: boolean): void {
  const c = caster.cast;
  if (!c) return;
  caster.cast = null;
  if (caster.order.kind === 'cast') caster.order = { kind: 'idle' };
  if (c.phase === 'channel') c.ability.def.onChannelEnd?.(makeCastContext(world, caster, c.ability, c.target), interrupted);
}

export function toggleAbility(world: World, caster: Unit, ab: AbilityInstance): void {
  if (ab.level <= 0) return;
  ab.toggled = !ab.toggled;
  ab.def.onToggle?.(makeCastContext(world, caster, ab, {}), ab.toggled);
  world.events.emit({ type: 'cast', unitId: caster.id, abilityId: ab.def.id });
}

export function issueCast(world: World, caster: Unit, ab: AbilityInstance, given?: CastTarget): boolean {
  if (!canCast(world, caster, ab)) return false;
  if (ab.def.targetType === 'toggle') {
    toggleAbility(world, caster, ab);
    return true;
  }
  const t = resolveTarget(world, caster, ab, given);
  if (!t) return false;
  if (caster.cast) cancelCast(world, caster, true);
  caster.order = { kind: 'cast', ability: ab, target: t };
  caster.attack.windup = -1;
  return true;
}

function tickCooldown(u: Unit, ab: AbilityInstance, dt: number): void {
  if (ab.cooldown > 0) ab.cooldown = Math.max(0, ab.cooldown - dt);
  const max = ab.def.charges;
  if (max && ab.charges < max) {
    ab.chargeTimer -= dt;
    if (ab.chargeTimer <= 1e-6) {
      ab.charges++;
      ab.chargeTimer = ab.charges < max ? abilityCooldown(ab, u) : 0;
    }
  }
}

function executeCast(world: World, u: Unit, c: CastState): void {
  const ab = c.ability;
  if (c.target.unit && !isValidUnitTarget(u, ab, c.target.unit)) {
    cancelCast(world, u, true);
    return;
  }
  const cost = abilityManaCost(ab, u);
  if (u.mana + 1e-6 < cost || !isReady(ab)) {
    cancelCast(world, u, true);
    return;
  }
  u.mana -= cost;
  const cd = abilityCooldown(ab, u);
  if (ab.def.charges) {
    ab.charges--;
    if (ab.chargeTimer <= 1e-6) ab.chargeTimer = cd;
  } else {
    ab.cooldown = cd;
  }
  world.events.emit({ type: 'cast', unitId: u.id, abilityId: ab.def.id });
  const channel = levelValue(ab.def.channelTime, ab.level);
  if (channel > 0) {
    c.phase = 'channel';
    c.timer = channel;
    c.channelTotal = channel;
  } else {
    u.cast = null;
    if (u.order.kind === 'cast') u.order = { kind: 'idle' };
  }
  ab.def.onCast?.(makeCastContext(world, u, ab, c.target));
  for (const m of u.modifiers.slice()) m.def.onAbilityCast?.(m, u, ab.def.id, world);
}

export function updateAbilities(world: World, dt: number): void {
  for (const u of world.units) {
    if (u.abilities.length === 0) continue;
    for (const ab of u.abilities) tickCooldown(u, ab, dt);
    if (!u.alive) continue;
    const c = u.cast;
    if (c) {
      if (u.hasState('stunned') || u.hasState('silenced')) {
        cancelCast(world, u, true);
        continue;
      }
      c.timer -= dt;
      if (c.phase === 'point') {
        if (c.timer <= 1e-6) executeCast(world, u, c);
      } else {
        const ctx = makeCastContext(world, u, c.ability, c.target);
        c.ability.def.onChannelTick?.(ctx, dt);
        if (u.cast === c && c.timer <= 1e-6) {
          u.cast = null;
          if (u.order.kind === 'cast') u.order = { kind: 'idle' };
          c.ability.def.onChannelEnd?.(ctx, false);
        }
      }
      continue;
    }
    if (u.order.kind !== 'cast') continue;
    const { ability, target } = u.order;
    if (target.unit && !isValidUnitTarget(u, ability, target.unit)) {
      u.order = { kind: 'idle' };
      continue;
    }
    if (u.hasState('stunned') || u.hasState('silenced')) continue;
    if (!canCast(world, u, ability)) {
      u.order = { kind: 'idle' };
      continue;
    }
    if (!inCastRange(world, u, ability, target)) continue;
    const aim = target.unit?.pos ?? target.point ?? (target.dir ? add(u.pos, target.dir) : null);
    if (aim) {
      const d = sub(aim, u.pos);
      if (d.x || d.y) u.facing = angleOf(d);
    }
    u.attack.windup = -1;
    const cast: CastState = { ability, target, phase: 'point', timer: ability.def.castPoint ?? 0, channelTotal: 0 };
    u.cast = cast;
    if (cast.timer <= 1e-6) executeCast(world, u, cast);
  }
}

export function syncPassives(world: World, u: Unit): void {
  for (const ab of u.abilities) {
    const p = ab.def.passive;
    if (!p) continue;
    const existing = findModifier(u, p.id);
    if (ab.level > 0) {
      if (existing) {
        existing.abilityLevel = ab.level;
        recomputeStats(world, u);
      } else addModifier(world, u, p, { sourceId: u.id, abilityLevel: ab.level });
    } else if (existing) {
      removeModifier(world, u, existing);
    }
  }
}
