import type { World } from '../world';
import type { Unit } from '../entities/unit';
import type { AbilityDef, AbilityInstance, CastContext, CastState, CastTarget, ResolvedTarget } from '../heroes/types';
import type { Vec2 } from '../core/vec2';
import { add, angleOf, dist, fromAngle, normalize, scale, sub } from '../core/vec2';
import { edgeDist, enemiesInRadius, isDisabled, isTargetableBy, nearestOf } from '../query';
import { addModifier, findModifier, removeModifier } from '../modifiers';
import { recomputeStats } from '../stats';

export const levelValue = (arr: readonly number[] | undefined, level: number): number => {
  if (!arr || arr.length === 0) return 0;
  return arr[Math.max(0, Math.min(arr.length, level) - 1)];
};

export const isInnate = (def: AbilityDef): boolean => def.slot === 'innate' || !!def.innate;

export const newAbilityInstance = (def: AbilityDef): AbilityInstance => ({
  def, level: isInnate(def) ? 1 : 0, cooldown: 0, charges: def.charges ?? 0, chargeTimer: 0, toggled: false, data: {}, chargeTimers: [],
});

const talentKey = (abilityId: string, key: string): string => `${abilityId}.${key}`;

/** 天赋加值（`技能id.键`），缺省 0 */
export function talentAdd(caster: Unit | undefined, abilityId: string, key: string): number {
  return caster?.hero?.talentValueBonus?.[talentKey(abilityId, key)] ?? 0;
}

/** 天赋乘数（`技能id.键`），缺省 1 */
export function talentMult(caster: Unit | undefined, abilityId: string, key: string): number {
  return caster?.hero?.talentValueMult?.[talentKey(abilityId, key)] ?? 1;
}

/** 基础数值 × 天赋乘数 + 天赋加值 */
const withTalent = (caster: Unit | undefined, ab: AbilityInstance, key: string, base: number): number =>
  base * talentMult(caster, ab.def.id, key) + talentAdd(caster, ab.def.id, key);

const abLevel = (ab: AbilityInstance): number => Math.max(1, ab.level);

/** (等级数值 + 每英雄等级成长 × 英雄等级) × 天赋乘数 + 天赋加值。成长键名：`${key}PerLevel`；非英雄单位英雄等级按 1 */
export function abilityValue(caster: Unit, ab: AbilityInstance, key: string): number {
  const lv = abLevel(ab);
  let base = levelValue(ab.def.values[key], lv);
  const per = ab.def.values[`${key}PerLevel`];
  if (per) base += levelValue(per, lv) * (caster.hero?.level ?? 1);
  return withTalent(caster, ab, key, base);
}

export const abilityCooldown = (ab: AbilityInstance, caster?: Unit): number =>
  Math.max(0, withTalent(caster, ab, 'cooldown', levelValue(ab.def.cooldown, abLevel(ab))));
export const abilityManaCost = (ab: AbilityInstance, caster?: Unit): number =>
  Math.max(0, withTalent(caster, ab, 'manaCost', levelValue(ab.def.manaCost, abLevel(ab))));
/** 施法距离：等级数值（含天赋）+ 施法距离加成 */
export const abilityCastRange = (caster: Unit, ab: AbilityInstance): number =>
  withTalent(caster, ab, 'castRange', levelValue(ab.def.castRange, abLevel(ab))) + caster.stats.castRangeBonus;

/** 施法前摇：castPoint / (1 + 施法速度)；instant 技能为 0 */
export function abilityCastPoint(caster: Unit, ab: AbilityInstance): number {
  if (ab.def.instant) return 0;
  return (ab.def.castPoint ?? 0) / (1 + Math.max(-0.9, caster.stats.castSpeed));
}

/** 引导时间（含天赋）；0 = 不是引导技能 */
export function abilityChannelTime(caster: Unit, ab: AbilityInstance): number {
  const base = levelValue(ab.def.channelTime, ab.level);
  return Math.max(0, withTalent(caster, ab, 'channelTime', base));
}

/** 充能上限（含天赋）；> 0 即充能制 */
export function abilityMaxCharges(caster: Unit | undefined, ab: AbilityInstance): number {
  return Math.max(0, Math.round(withTalent(caster, ab, 'charges', ab.def.charges ?? 0)));
}

export const makeCastContext = (world: World, caster: Unit, ab: AbilityInstance, target: ResolvedTarget): CastContext => ({
  world, caster, ability: ab, level: ab.level, target, v: (key: string) => abilityValue(caster, ab, key),
});

export const isReady = (ab: AbilityInstance, caster?: Unit): boolean =>
  abilityMaxCharges(caster, ab) > 0 ? ab.charges > 0 : ab.cooldown <= 1e-6;

export function canCast(world: World, caster: Unit, ab: AbilityInstance): boolean {
  void world;
  if (!caster.alive || ab.level <= 0) return false;
  const tt = ab.def.targetType;
  if (tt === 'passive') return false;
  if (isDisabled(caster) || caster.hasState('silenced')) return false;
  if (ab.def.blockedByRoot && caster.hasState('rooted')) return false;
  if (tt === 'toggle') return true;
  return isReady(ab, caster) && caster.mana + 1e-6 >= abilityManaCost(ab, caster);
}

/** 能否被这个单位技能选为目标；"敌我皆可"（'any'）的技能不能以施法者自己为目标（幻影突袭） */
export const isValidUnitTarget = (caster: Unit, ab: AbilityInstance, t: Unit): boolean =>
  isTargetableBy(caster, t, ab.def.targetTeam ?? 'enemy', !!ab.def.ignoresDebuffImmune) && (!ab.def.heroesOnly || t.kind === 'hero') &&
  !(ab.def.targetTeam === 'any' && t.id === caster.id);

/** pointSnap：把"origin → 落点"的距离吸附到最近的一档（方向不变；距离为 0 时用 fallbackDir） */
export function snapPoint(origin: Vec2, fallbackDir: Vec2, steps: readonly number[], p: Vec2): Vec2 {
  if (steps.length === 0) return { x: p.x, y: p.y };
  const d = dist(origin, p);
  const step = steps.reduce((a, b) => (Math.abs(b - d) < Math.abs(a - d) ? b : a));
  const dir = d > 1e-6 ? normalize(sub(p, origin)) : fallbackDir;
  return add(origin, scale(dir, step));
}

const hasExplicitTarget = (given?: CastTarget): boolean =>
  !!given && (given.unitId !== undefined || given.point !== undefined || given.dir !== undefined);

export function resolveTarget(world: World, caster: Unit, ab: AbilityInstance, given?: CastTarget): ResolvedTarget | null {
  const def = ab.def;
  const range = abilityCastRange(caster, ab);
  const search = Math.max(range, 200) + 300;
  const nearestEnemyPos = (): Vec2 | null => {
    const e = enemiesInRadius(world, caster.team, caster.pos, search).filter((u) => isTargetableBy(caster, u, 'enemy', true));
    const heroes = e.filter((u) => u.kind === 'hero');
    return nearestOf(caster.pos, heroes.length ? heroes : e)?.pos ?? null;
  };
  // 智能施法覆盖：没有给目标时先问技能自己的 smartTarget（所有目标类型）
  const smartTarget = (): ResolvedTarget | null => (hasExplicitTarget(given) ? null : def.smartTarget?.(world, caster, ab) ?? null);
  switch (def.targetType) {
    case 'none': {
      const smart = smartTarget();
      if (smart) return smart;
      if (given?.dir && (given.dir.x || given.dir.y)) return { dir: normalize(given.dir) };
      return {};
    }
    case 'toggle':
      return {};
    case 'passive':
      return null;
    case 'unit': {
      if (given?.unitId !== undefined) {
        const u = world.getUnit(given.unitId);
        return u && isValidUnitTarget(caster, ab, u) ? { unit: u } : null;
      }
      // 单位技能：只要没指定单位就走 smartTarget（P1 行为）
      const smart = def.smartTarget?.(world, caster, ab) ?? null;
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
      const finish = (p: Vec2, fallbackDir: Vec2 = fromAngle(caster.facing)): Vec2 => {
        if (def.pointSnap) return snapPoint(caster.pos, fallbackDir, def.pointSnap, p);
        return dist(caster.pos, p) <= range ? { x: p.x, y: p.y } : add(caster.pos, scale(normalize(sub(p, caster.pos)), range));
      };
      if (given?.point) return { point: finish(given.point) };
      if (given?.dir && (given.dir.x || given.dir.y)) {
        const d = normalize(given.dir);
        return { point: finish(add(caster.pos, scale(d, range)), d) };
      }
      const smart = smartTarget();
      if (smart?.point) return { ...smart, point: finish(smart.point) };
      if (smart) return smart;
      const p = nearestEnemyPos();
      return { point: finish(p ?? add(caster.pos, scale(fromAngle(caster.facing), Math.min(range, 400)))) };
    }
    case 'direction': {
      const tryDir = (d: Vec2): ResolvedTarget | null => (d.x || d.y ? { dir: d } : null);
      if (given?.dir) { const r = tryDir(normalize(given.dir)); if (r) return r; }
      if (given?.point) { const r = tryDir(normalize(sub(given.point, caster.pos))); if (r) return r; }
      const smart = smartTarget();
      if (smart) return smart;
      const p = nearestEnemyPos();
      if (p) { const r = tryDir(normalize(sub(p, caster.pos))); if (r) return r; }
      return { dir: fromAngle(caster.facing) };
    }
  }
}

export function inCastRange(world: World, caster: Unit, ab: AbilityInstance, t: ResolvedTarget): boolean {
  void world;
  if (ab.def.targetType === 'unit' && t.unit) return edgeDist(caster, t.unit) <= abilityCastRange(caster, ab) + 1;
  // 吸附落点的技能按"施法者 → 落点"的相对距离施放，原地就能放
  if (ab.def.targetType === 'point' && t.point && !ab.def.pointSnap) return dist(caster.pos, t.point) <= abilityCastRange(caster, ab) + 1;
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
  if (ab.toggled) countCast(caster, ab);
  world.events.emit({ type: 'cast', unitId: caster.id, abilityId: ab.def.id });
}

/** 英雄的技能施放计数（HeroState.abilityCasts） */
function countCast(u: Unit, ab: AbilityInstance): void {
  if (u.hero) u.hero.abilityCasts[ab.def.id] = (u.hero.abilityCasts[ab.def.id] ?? 0) + 1;
}

/** 扣蓝、进冷却或消耗一层充能 */
function spendCast(u: Unit, ab: AbilityInstance): void {
  u.mana -= abilityManaCost(ab, u);
  const cd = abilityCooldown(ab, u);
  if (abilityMaxCharges(u, ab) > 0) {
    ab.charges--;
    if (ab.def.chargeMode === 'parallel') ab.chargeTimers.push(cd);
    else if (ab.chargeTimer <= 1e-6) ab.chargeTimer = cd;
  } else {
    ab.cooldown = cd;
  }
}

/** 技能生效：cast 事件、onCast、施法者的 onAbilityCast 钩子 */
function fireCast(world: World, u: Unit, ab: AbilityInstance, target: ResolvedTarget): void {
  ab.def.onCast?.(makeCastContext(world, u, ab, target));
  for (const m of u.modifiers.slice()) m.def.onAbilityCast?.(m, u, ab.def.id, world);
}

export function issueCast(world: World, caster: Unit, ab: AbilityInstance, given?: CastTarget): boolean {
  if (!canCast(world, caster, ab)) return false;
  if (ab.def.targetType === 'toggle') {
    toggleAbility(world, caster, ab);
    return true;
  }
  const t = resolveTarget(world, caster, ab, given);
  if (!t) return false;
  if (ab.def.instant) {
    // 即时技能：不打断前摇、引导和普攻，也不改变当前指令
    spendCast(caster, ab);
    countCast(caster, ab);
    world.events.emit({ type: 'cast', unitId: caster.id, abilityId: ab.def.id });
    fireCast(world, caster, ab, t);
    return true;
  }
  if (caster.cast) cancelCast(world, caster, true);
  caster.order = { kind: 'cast', ability: ab, target: t };
  caster.attack.windup = -1;
  return true;
}

function tickCooldown(u: Unit, ab: AbilityInstance, dt: number): void {
  if (ab.cooldown > 0) ab.cooldown = Math.max(0, ab.cooldown - dt);
  const max = abilityMaxCharges(u, ab);
  if (max <= 0) return;
  if (ab.def.chargeMode === 'parallel') {
    if (ab.chargeTimers.length === 0) return;
    const timers = ab.chargeTimers;
    let w = 0;
    for (let i = 0; i < timers.length; i++) {
      const t = timers[i] - dt;
      if (t <= 1e-6) ab.charges = Math.min(max, ab.charges + 1);
      else timers[w++] = t;
    }
    timers.length = w;
    return;
  }
  if (ab.charges < max) {
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
  if (u.mana + 1e-6 < abilityManaCost(ab, u) || !isReady(ab, u)) {
    cancelCast(world, u, true);
    return;
  }
  spendCast(u, ab);
  countCast(u, ab);
  world.events.emit({ type: 'cast', unitId: u.id, abilityId: ab.def.id });
  const channel = abilityChannelTime(u, ab);
  if (channel > 0) {
    c.phase = 'channel';
    c.timer = channel;
    c.channelTotal = channel;
  } else {
    u.cast = null;
    if (u.order.kind === 'cast') u.order = { kind: 'idle' };
  }
  fireCast(world, u, ab, c.target);
}

export function updateAbilities(world: World, dt: number): void {
  for (const u of world.units) {
    if (u.abilities.length === 0) continue;
    for (const ab of u.abilities) tickCooldown(u, ab, dt);
    if (!u.alive) continue;
    const c = u.cast;
    if (c) {
      if (isDisabled(u) || u.hasState('silenced')) {
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
    if (isDisabled(u) || u.hasState('silenced') || u.hasState('busy')) continue;
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
    const cast: CastState = { ability, target, phase: 'point', timer: abilityCastPoint(u, ability), channelTotal: 0 };
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
