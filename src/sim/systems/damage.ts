import type { DamageType } from '../core/types';
import type { Unit } from '../entities/unit';
import type { World } from '../world';
import { armorMultiplier } from '../formulas';
import { removeModifiersOnDeath } from '../modifiers';

export interface DamageInfo {
  source: Unit | null;
  target: Unit;
  amount: number;
  type: DamageType;
  isAttack: boolean;
  abilityId?: string;
  crit?: boolean;
  /** 不会致死（最少留 1 血） */
  nonLethal?: boolean;
  /** 纯粹伤害无视减益免疫 */
  ignoreImmunity?: boolean;
  /** 反弹伤害，不会再次触发反弹 */
  reflected?: boolean;
}

/** 结算一次伤害，返回实际造成的伤害 */
export function applyDamage(world: World, info: DamageInfo): number {
  const t = info.target;
  if (!t.alive || t.removed || t.hasState('invulnerable')) return 0;
  const src = info.source;
  let amt = info.amount;
  if (src && info.isAttack) amt *= world.balance.damageMatrix[src.attackClass][t.armorClass];
  if (src && !info.isAttack && info.abilityId) amt *= 1 + src.stats.spellAmp;
  if (!info.isAttack && info.type === 'pure' && t.hasState('debuffImmune') && !info.ignoreImmunity && (!src || src.team !== t.team)) return 0;
  if (info.type === 'physical') amt *= armorMultiplier(t.stats.armor);
  else if (info.type === 'magical') amt *= 1 - t.stats.magicResist;
  info.amount = Math.max(0, amt);
  for (const m of t.modifiers.slice()) m.def.onIncomingDamage?.(m, t, world, info);
  amt = Math.max(0, info.amount);
  if (amt <= 0) return 0;
  if (info.nonLethal && t.hp - amt < 1) amt = Math.max(0, t.hp - 1);
  t.hp -= amt;
  if (t.hero) t.hero.lastDamagedTime = world.time;
  if (src && src.kind === 'hero' && src.team !== t.team) {
    t.lastHeroDamage = { heroId: src.id, time: world.time };
    t.heroDamageTimes.set(src.id, world.time);
  }
  world.events.emit({
    type: 'damage', sourceId: src?.id ?? null, targetId: t.id, amount: amt, damageType: info.type,
    crit: !!info.crit, isAttack: info.isAttack,
  });
  if (src) for (const m of src.modifiers.slice()) m.def.onDealtDamage?.(m, src, t, world, info);
  if (src && !info.isAttack && info.abilityId && src.stats.spellLifesteal > 0 && src.alive) heal(world, src, amt * src.stats.spellLifesteal);
  if (t.hp <= 0.0001 && t.alive) killUnit(world, t, src);
  return amt;
}

export function heal(world: World, u: Unit, amount: number): number {
  if (!u.alive || amount <= 0) return 0;
  const before = u.hp;
  u.hp = Math.min(u.stats.maxHp, u.hp + amount);
  const healed = u.hp - before;
  if (healed > 0.5) world.events.emit({ type: 'heal', targetId: u.id, amount: healed });
  return healed;
}

export function killUnit(world: World, victim: Unit, killer: Unit | null): void {
  if (!victim.alive) return;
  victim.alive = false;
  victim.hp = 0;
  victim.deathTime = world.time;
  victim.order = { kind: 'idle' };
  victim.cast = null;
  victim.attack.targetId = null;
  victim.attack.windup = -1;
  for (const m of victim.modifiers.slice()) m.def.onDeath?.(m, victim, killer, world);
  if (killer) for (const m of killer.modifiers.slice()) m.def.onKill?.(m, killer, victim, world);
  removeModifiersOnDeath(world, victim);
  world.events.emit({ type: 'death', unitId: victim.id, killerId: killer?.id ?? null });
  for (const l of world.killListeners) l(world, victim, killer);
  if (victim.kind !== 'hero' && victim.kind !== 'building') victim.removed = true;
}
