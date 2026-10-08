import type { AbilitySlot } from '../sim/core/types';
import type { Unit } from '../sim/entities/unit';
import { canLearn } from '../sim/systems/progress';

export const SKILL_BUILDS: Record<string, AbilitySlot[]> = {
  axe: ['Q', 'E', 'E', 'W', 'E', 'R', 'E', 'Q', 'Q', 'Q', 'R', 'W', 'W', 'W', 'R'],
  sven: ['Q', 'W', 'E', 'W', 'W', 'R', 'W', 'Q', 'Q', 'Q', 'R', 'E', 'E', 'E', 'R'],
  lina: ['Q', 'W', 'Q', 'E', 'Q', 'R', 'Q', 'W', 'W', 'W', 'R', 'E', 'E', 'E', 'R'],
  crystal_maiden: ['W', 'Q', 'E', 'Q', 'Q', 'R', 'Q', 'W', 'W', 'W', 'R', 'E', 'E', 'E', 'R'],
  zeus: ['Q', 'W', 'Q', 'E', 'Q', 'R', 'Q', 'W', 'W', 'W', 'R', 'E', 'E', 'E', 'R'],
  drow_ranger: ['W', 'Q', 'E', 'Q', 'E', 'R', 'E', 'Q', 'E', 'Q', 'R', 'W', 'W', 'W', 'R'],
  phantom_assassin: ['Q', 'W', 'Q', 'E', 'Q', 'R', 'Q', 'E', 'E', 'E', 'R', 'W', 'W', 'W', 'R'],
  juggernaut: ['Q', 'E', 'Q', 'W', 'Q', 'R', 'Q', 'E', 'E', 'E', 'R', 'W', 'W', 'W', 'R'],
  pudge: ['Q', 'W', 'Q', 'E', 'Q', 'R', 'Q', 'W', 'W', 'W', 'R', 'E', 'E', 'E', 'R'],
};

/** 天赋预设：下标 = 天赋层（10/15/20/25 级），0 = 左 / 1 = 右 */
export const TALENT_BUILDS: Record<string, (0 | 1)[]> = {
  // 移速、+8 饥渴伤害、+40 螺旋、+150 淘汰
  axe: [0, 1, 0, 0],
  // +5 秒战吼、+25% 分裂、−25% 风暴之拳冷却和魔耗、+50% 神之力量
  sven: [0, 1, 0, 0],
  // −3 秒龙破斩冷却、+110 光击阵伤害、−20 秒神灭斩冷却、慢热 80% / 5 秒
  lina: [1, 1, 0, 0],
  // +200 生命、−4.5 秒冰霜新星冷却、+50 极寒领域伤害、+300 冰霜新星伤害
  crystal_maiden: [0, 1, 1, 1],
  // +200 生命、−20% 弧形闪电冷却和魔耗、+60 弧形闪电伤害、雷击 325 范围
  zeus: [1, 1, 0, 0],
  // −18% 霜冻之箭魔耗、+75 攻击距离、+25% 数箭齐发伤害、+8% 射手天赋几率
  drow_ranger: [0, 0, 1, 0],
  // −2 秒窒碍短匕冷却、+20% 飘忽不定闪避、+60 幻影突袭攻速、+10% 恩赐解脱几率
  phantom_assassin: [1, 0, 1, 0],
  // −1 秒剑心间隔、−15 秒无敌斩冷却、+120 剑刃风暴每秒伤害、+1 秒无敌斩
  juggernaut: [1, 0, 1, 0],
  // +5 护甲、+150 肉钩伤害、+0.75 秒肢解、肢解伤害和治疗 ×1.5
  pudge: [0, 1, 0, 0],
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
