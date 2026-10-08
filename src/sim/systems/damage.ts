import type { DamageType } from '../core/types';
import type { Unit } from '../entities/unit';
import type { World } from '../world';
import type { AttackInfo } from './attack';
import { armorMultiplier } from '../formulas';
import { removeModifiersOnDeath } from '../modifiers';
import { cancelCast } from './abilities';
import { endMotion } from './motion';

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
  /** 反弹伤害：不会再次触发反弹，也不触发技能吸血 */
  reflected?: boolean;
  /** 物理伤害无视护甲（分裂） */
  ignoreArmor?: boolean;
  /** 物理伤害只按目标的 bonusArmor 计算（射手天赋） */
  ignoreBaseArmor?: boolean;
  /** 带 abilityId 但不受技能增强、不触发技能吸血（分裂、数箭齐发） */
  noSpellAmp?: boolean;
  /** 普攻（含技能发起的攻击）的攻击信息 */
  attack?: AttackInfo;
  /** applyDamage 写入：攻击类型系数和技能增强之后、护甲 / 魔抗之前的数值 */
  preMitigation?: number;
}

/** 结算一次伤害，返回实际造成的伤害 */
export function applyDamage(world: World, info: DamageInfo): number {
  const t = info.target;
  if (!t.alive || t.removed || t.hasState('invulnerable')) return 0;
  const src = info.source;
  // 按被攻击次数计算的召唤物（治疗守卫）：普攻固定 1 点，其他伤害无效
  if (t.summon?.hitsToKill !== undefined) return applyHitCountDamage(world, info);
  let amt = info.amount;
  if (src && info.isAttack) amt *= world.balance.damageMatrix[src.attackClass][t.armorClass];
  if (src && !info.isAttack && info.abilityId && !info.noSpellAmp) amt *= 1 + src.stats.spellAmp;
  info.preMitigation = amt;
  if (src) {
    for (const m of src.modifiers.slice()) {
      m.def.onBeforeDealDamage?.(m, src, t, world, info);
      if (!t.alive || t.removed) return 0;
    }
    if (t.hasState('invulnerable')) return 0;
  }
  if (!info.isAttack && info.type === 'pure' && t.hasState('debuffImmune') && !info.ignoreImmunity && (!src || src.team !== t.team)) return 0;
  if (info.type === 'physical' && !info.ignoreArmor) amt *= armorMultiplier(info.ignoreBaseArmor ? t.stats.bonusArmor : t.stats.armor);
  else if (info.type === 'magical') amt *= 1 - t.stats.magicResist;
  info.amount = Math.max(0, amt);
  for (const m of t.modifiers.slice()) m.def.onIncomingDamage?.(m, t, world, info);
  amt = Math.max(0, info.amount);
  if (amt <= 0) return 0;
  if (info.nonLethal && t.hp - amt < 1) amt = Math.max(0, t.hp - 1);
  const hpLost = Math.min(amt, Math.max(0, t.hp));
  t.hp -= amt;
  if (t.hero) t.hero.lastDamagedTime = world.time;
  if (src && src.kind === 'hero' && src.team !== t.team) {
    t.lastHeroDamage = { heroId: src.id, time: world.time };
    t.heroDamageTimes.set(src.id, world.time);
    if (src.hero) {
      const dd = src.hero.damageDealt;
      if (t.kind === 'hero') dd.heroes += hpLost;
      else if (t.kind === 'building') dd.buildings += hpLost;
      else dd.creeps += hpLost;
    }
  }
  world.events.emit({
    type: 'damage', sourceId: src?.id ?? null, targetId: t.id, amount: amt, damageType: info.type,
    crit: !!info.crit, isAttack: info.isAttack,
  });
  if (src) for (const m of src.modifiers.slice()) m.def.onDealtDamage?.(m, src, t, world, info);
  if (src && !info.isAttack && info.abilityId && !info.reflected && !info.noSpellAmp && src.stats.spellLifesteal > 0 && src.alive) {
    heal(world, src, amt * src.stats.spellLifesteal);
  }
  if (t.hp <= 0.0001 && t.alive) killUnit(world, t, src);
  return amt;
}

function applyHitCountDamage(world: World, info: DamageInfo): number {
  const t = info.target;
  if (!info.isAttack) return 0;
  const src = info.source;
  info.preMitigation = 1;
  info.amount = 1;
  t.hp -= 1;
  if (src && src.hero && src.team !== t.team) src.hero.damageDealt.creeps += 1;
  world.events.emit({ type: 'damage', sourceId: src?.id ?? null, targetId: t.id, amount: 1, damageType: info.type, crit: false, isAttack: true });
  if (src) for (const m of src.modifiers.slice()) m.def.onDealtDamage?.(m, src, t, world, info);
  if (t.hp <= 0.0001 && t.alive) killUnit(world, t, src);
  return 1;
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
  if (victim.cast) cancelCast(world, victim, true);
  victim.cast = null;
  if (victim.motion) endMotion(world, victim, true);
  victim.attack.targetId = null;
  victim.attack.windup = -1;
  for (const m of victim.modifiers.slice()) m.def.onDeath?.(m, victim, killer, world);
  if (killer) for (const m of killer.modifiers.slice()) m.def.onKill?.(m, killer, victim, world);
  for (const h of world.units.slice()) {
    if (h.kind !== 'hero' || !h.alive || h === victim) continue;
    for (const m of h.modifiers.slice()) m.def.onUnitDeath?.(m, h, victim, killer, world);
  }
  removeModifiersOnDeath(world, victim);
  world.events.emit({ type: 'death', unitId: victim.id, killerId: killer?.id ?? null });
  for (const l of world.killListeners) l(world, victim, killer);
  if (victim.kind !== 'hero' && victim.kind !== 'building') victim.removed = true;
}
