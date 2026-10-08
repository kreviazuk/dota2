import type { World } from './world';
import type { Unit } from './entities/unit';
import type { AbilityInstance, TalentDef, TalentValueMod } from './heroes/types';
import type { ModifierDef } from './modifiers';
import { addModifier } from './modifiers';
import { recomputeStats } from './stats';
import { getHeroDef } from './heroes/index';
import { abilityMaxCharges, syncPassives } from './systems/abilities';

export type TalentTier = 0 | 1 | 2 | 3;

const heroTalents = (u: Unit): [TalentDef, TalentDef][] => {
  if (!u.hero) return [];
  try {
    return getHeroDef(u.hero.heroId).talents;
  } catch {
    return [];
  }
};

/** 该层是否已解锁（英雄等级够、英雄有这一层天赋）且未选 */
export function canPickTalent(world: World, u: Unit, tier: number): boolean {
  const h = u.hero;
  if (!h || !Number.isInteger(tier) || tier < 0 || tier > 3) return false;
  const req = world.balance.hero.talentLevels[tier];
  if (req === undefined || h.level < req) return false;
  if (h.talents[tier] !== null && h.talents[tier] !== undefined) return false;
  return !!heroTalents(u)[tier];
}

/** 已解锁但未选的最低层；没有返回 null */
export function pendingTalentTier(world: World, u: Unit): TalentTier | null {
  for (let t = 0; t < 4; t++) if (canPickTalent(world, u, t)) return t as TalentTier;
  return null;
}

const talentModifier = (t: TalentDef): ModifierDef => ({
  id: `talent:${t.id}`, name: t.name, hidden: true, persistOnDeath: true, dispel: 'none', stats: t.stats,
});

/** 选择天赋：天赋不消耗技能点，死亡时也可以选 */
export function pickTalent(world: World, u: Unit, tier: TalentTier, side: 0 | 1): boolean {
  if (side !== 0 && side !== 1) return false;
  if (!canPickTalent(world, u, tier)) return false;
  const h = u.hero!;
  const t = heroTalents(u)[tier][side];
  h.talents[tier] = side;

  const mods: TalentValueMod[] = t.valueBonus ? (Array.isArray(t.valueBonus) ? t.valueBonus : [t.valueBonus]) : [];
  // 记下受影响技能原来的充能上限，天赋改变充能时补齐
  const chargeAbs = new Map<AbilityInstance, number>();
  for (const vm of mods) {
    if (vm.key !== 'charges') continue;
    const ab = u.abilities.find((a) => a.def.id === vm.abilityId);
    if (ab && !chargeAbs.has(ab)) chargeAbs.set(ab, abilityMaxCharges(u, ab));
  }
  for (const vm of mods) {
    const key = `${vm.abilityId}.${vm.key}`;
    if (vm.add !== undefined) h.talentValueBonus[key] = (h.talentValueBonus[key] ?? 0) + vm.add;
    if (vm.mult !== undefined) h.talentValueMult[key] = (h.talentValueMult[key] ?? 1) * vm.mult;
  }
  for (const [ab, oldMax] of chargeAbs) {
    const max = abilityMaxCharges(u, ab);
    if (oldMax <= 0 && max > 0) {
      // 原来不是充能制的技能变成充能制：直接给满层，冷却清零
      ab.charges = max;
      ab.cooldown = 0;
      ab.chargeTimer = 0;
      ab.chargeTimers = [];
    } else if (max > oldMax) {
      ab.charges = Math.min(max, ab.charges + (max - oldMax));
    } else {
      ab.charges = Math.min(ab.charges, max);
    }
  }

  if (t.stats) addModifier(world, u, talentModifier(t), { sourceId: u.id });
  if (t.modifier) addModifier(world, u, t.modifier, { sourceId: u.id });
  syncPassives(world, u);
  recomputeStats(world, u);
  world.events.emit({ type: 'talent', unitId: u.id, tier, side, talentId: t.id });
  return true;
}

export function pickedTalents(u: Unit): TalentDef[] {
  const h = u.hero;
  if (!h) return [];
  const all = heroTalents(u);
  const out: TalentDef[] = [];
  h.talents.forEach((side, tier) => {
    if (side !== null && side !== undefined && all[tier]) out.push(all[tier][side]);
  });
  return out;
}

export function hasTalent(u: Unit, talentId: string): boolean {
  const h = u.hero;
  if (!h) return false;
  const all = heroTalents(u);
  for (let tier = 0; tier < h.talents.length; tier++) {
    const side = h.talents[tier];
    if (side !== null && side !== undefined && all[tier]?.[side].id === talentId) return true;
  }
  return false;
}
