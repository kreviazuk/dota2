import type { World } from '../world';
import type { Unit } from '../entities/unit';
import type { AbilitySlot } from '../core/types';
import type { AbilityInstance } from '../heroes/types';
import { xpToReach } from '../data/xpTable';
import { recomputeStats } from '../stats';
import { syncPassives } from './abilities';

const MAIN_SLOTS: readonly string[] = ['Q', 'W', 'E', 'R'];

export function giveGold(world: World, u: Unit, amount: number, emit = true): void {
  if (!u.hero || amount === 0) return;
  const g = amount > 0 ? amount * world.teams[u.team].goldMult : amount;
  u.hero.gold = Math.max(0, u.hero.gold + g);
  if (emit && g >= 1) world.events.emit({ type: 'gold', unitId: u.id, amount: Math.round(g) });
}

export function giveXp(world: World, u: Unit, amount: number): void {
  const h = u.hero;
  if (!h || amount <= 0) return;
  const e = world.balance.economy;
  h.xp += amount * world.teams[u.team].xpMult;
  let leveled = false;
  while (h.level < e.levelCap && h.xp >= xpToReach(h.level + 1, e.xpTableMult)) {
    h.level++;
    h.skillPoints++;
    leveled = true;
    world.events.emit({ type: 'levelUp', unitId: u.id, level: h.level });
  }
  if (leveled) {
    convertAttributePoints(world, u);
    recomputeStats(world, u);
  }
}

export function canLearn(heroLevel: number, ab: AbilityInstance): boolean {
  const d = ab.def;
  if (d.slot === 'innate' || ab.level >= d.maxLevel) return false;
  const req = d.requiredHeroLevels ? d.requiredHeroLevels[ab.level] : 2 * ab.level + 1;
  return req !== undefined && heroLevel >= req;
}

export function convertAttributePoints(world: World, u: Unit): void {
  const h = u.hero;
  if (!h || h.skillPoints <= 0) return;
  const main = u.abilities.filter((a) => MAIN_SLOTS.includes(a.def.slot));
  if (!main.every((a) => a.level >= a.def.maxLevel)) return;
  h.attributeBonusLevel += h.skillPoints;
  h.skillPoints = 0;
  recomputeStats(world, u);
}

export function learnAbility(world: World, u: Unit, slot: AbilitySlot): boolean {
  const h = u.hero;
  if (!h || h.skillPoints <= 0) return false;
  const ab = u.ability(slot);
  if (!ab || !canLearn(h.level, ab)) return false;
  ab.level++;
  h.skillPoints--;
  syncPassives(world, u);
  convertAttributePoints(world, u);
  return true;
}

export const netWorth = (u: Unit): number => (u.hero ? u.hero.gold + u.hero.itemValue : 0);
