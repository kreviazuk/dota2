import type { AbilitySlot } from '../sim/core/types';
import type { Unit } from '../sim/entities/unit';
import type { World } from '../sim/world';
import { canLearn } from '../sim/systems/progress';
import { getItemDef } from '../sim/items/definitions';

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
  shadow_fiend: ['Q', 'E', 'Q', 'E', 'Q', 'R', 'Q', 'E', 'E', 'W', 'R', 'W', 'W', 'W', 'R'],
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
  // +30 毁灭阴影连中伤害、灵魂盛宴每名英雄多收 2 个灵魂、+5 灵魂上限、毁灭阴影附带攻击伤害
  shadow_fiend: [0, 1, 0, 1],
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

// 10 名英雄推荐出装序列
export const ITEM_BUILDS: Record<string, string[]> = {
  axe: ['tranquil_boots', 'vanguard', 'blink_dagger', 'blade_mail', 'black_king_bar', 'heart_of_tarrasque', 'aghanims_shard', 'assault_cuirass'],
  sven: ['power_treads', 'echo_sabre', 'black_king_bar', 'blink_dagger', 'aghanims_scepter', 'daedalus', 'aghanims_shard', 'satanic'],
  lina: ['arcane_boots', 'euls_scepter', 'black_king_bar', 'aghanims_scepter', 'aghanims_shard', 'shivas_guard', 'daedalus'],
  crystal_maiden: ['tranquil_boots', 'force_staff', 'black_king_bar', 'aghanims_shard', 'aghanims_scepter', 'shivas_guard'],
  zeus: ['arcane_boots', 'force_staff', 'aghanims_scepter', 'aghanims_shard', 'black_king_bar', 'shivas_guard'],
  drow_ranger: ['power_treads', 'yasha', 'aghanims_shard', 'sange_and_yasha', 'black_king_bar', 'butterfly', 'aghanims_scepter'],
  phantom_assassin: ['power_treads', 'vanguard', 'desolator', 'black_king_bar', 'skull_basher', 'sange_and_yasha', 'aghanims_shard', 'abyssal_blade'],
  juggernaut: ['phase_boots', 'battle_fury', 'sange_and_yasha', 'aghanims_shard', 'black_king_bar', 'butterfly', 'abyssal_blade'],
  pudge: ['tranquil_boots', 'vanguard', 'pipe_of_insight', 'blade_mail', 'blink_dagger', 'aghanims_scepter', 'heart_of_tarrasque', 'aghanims_shard'],
  shadow_fiend: ['power_treads', 'euls_scepter', 'black_king_bar', 'desolator', 'aghanims_scepter', 'daedalus', 'butterfly', 'aghanims_shard'],
};

export interface QuickBuyItem {
  itemId: string;
  name: string;
  cost: number;
}

/**
 * 获取英雄当前推荐出装中下一个应购买的配件或成品
 */
export function getNextQuickBuyItem(world: World, unit: Unit): QuickBuyItem | null {
  const build = ITEM_BUILDS[unit.defId] ?? ITEM_BUILDS.axe;
  const invCounts: Record<string, number> = {};
  for (const item of unit.inventory) {
    if (item) invCounts[item.id] = (invCounts[item.id] ?? 0) + 1;
  }

  for (const targetId of build) {
    if (targetId === 'aghanims_shard') {
      if (unit.hero?.hasShard) continue;
      if (world.time < 480) continue; // 8 分钟前不可买魔晶
      return { itemId: 'aghanims_shard', name: '阿哈利姆魔晶', cost: 1400 };
    }

    if (unit.hasItem(targetId)) continue;

    const def = getItemDef(targetId);
    if (!def) continue;

    // 如果该装备有合成配方
    if (def.components && def.components.length > 0) {
      // 遍历所有配件，找到背包中缺失的第一个配件
      const tempInv = { ...invCounts };
      let missingComponentId: string | null = null;

      for (const compId of def.components) {
        if ((tempInv[compId] ?? 0) > 0) {
          tempInv[compId]--;
        } else if (!missingComponentId) {
          missingComponentId = compId;
        }
      }

      if (missingComponentId) {
        const compDef = getItemDef(missingComponentId);
        if (compDef) {
          return { itemId: compDef.id, name: compDef.name, cost: compDef.cost };
        }
      }

      // 如果所有配件都已拥有，还需要购买卷轴
      if ((def.recipeCost ?? 0) > 0) {
        return { itemId: targetId, name: `${def.name} 卷轴`, cost: def.recipeCost! };
      }
    } else {
      // 基础无配方散件
      return { itemId: def.id, name: def.name, cost: def.cost };
    }
  }

  return null;
}

