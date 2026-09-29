import type { AbilitySlot } from '../sim/core/types';
import type { Unit } from '../sim/entities/unit';
import { canLearn } from '../sim/systems/progress';

export const SKILL_BUILDS: Record<string, AbilitySlot[]> = {
  axe: ['Q', 'E', 'E', 'W', 'E', 'R', 'E', 'Q', 'Q', 'Q', 'R', 'W', 'W', 'W', 'R'],
};

const DEFAULT_BUILD: AbilitySlot[] = ['Q', 'W', 'E', 'Q', 'W', 'R', 'E', 'Q', 'W', 'E', 'R', 'Q', 'W', 'E', 'R'];

/** 按预设加点顺序返回下一个可学的技能 */
export function nextSkillToLearn(u: Unit): AbilitySlot | null {
  const h = u.hero;
  if (!h || h.skillPoints <= 0) return null;
  const build = SKILL_BUILDS[u.defId] ?? DEFAULT_BUILD;
  const counts: Partial<Record<AbilitySlot, number>> = {};
  for (const slot of build) {
    counts[slot] = (counts[slot] ?? 0) + 1;
    const ab = u.ability(slot);
    if (ab && ab.level < counts[slot]! && canLearn(h.level, ab)) return slot;
  }
  for (const ab of u.abilities) if (ab.def.slot !== 'innate' && canLearn(h.level, ab)) return ab.def.slot as AbilitySlot;
  return null;
}
