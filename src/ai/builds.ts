import type { AbilitySlot } from '../sim/core/types';
import type { Unit } from '../sim/entities/unit';
import { canLearn } from '../sim/systems/progress';

export const SKILL_BUILDS: Record<string, AbilitySlot[]> = {
  axe: ['Q', 'E', 'E', 'W', 'E', 'R', 'E', 'Q', 'Q', 'Q', 'R', 'W', 'W', 'W', 'R'],
  sven: ['Q', 'W', 'E', 'W', 'W', 'R', 'W', 'Q', 'Q', 'Q', 'R', 'E', 'E', 'E', 'R'],
  lina: ['Q', 'W', 'Q', 'E', 'Q', 'R', 'Q', 'W', 'W', 'W', 'R', 'E', 'E', 'E', 'R'],
};

/** 天赋预设：下标 = 天赋层（10/15/20/25 级），0 = 左 / 1 = 右 */
export const TALENT_BUILDS: Record<string, (0 | 1)[]> = {
  // 移速、+8 饥渴伤害、+40 螺旋、+150 淘汰
  axe: [0, 1, 0, 0],
  // +5 秒战吼、+25% 分裂、−25% 风暴之拳冷却和魔耗、+50% 神之力量
  sven: [0, 1, 0, 0],
  // −3 秒龙破斩冷却、+110 光击阵伤害、−20 秒神灭斩冷却、慢热 80% / 5 秒
  lina: [1, 1, 0, 0],
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
