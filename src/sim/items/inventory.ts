import type { World } from '../world';
import type { Unit } from '../entities/unit';
import type { ItemInstance } from './types';
import { getItemDef, ITEM_DEFINITIONS } from './definitions';
import { giveGold } from '../systems/progress';
import { recomputeStats } from '../stats';

export interface ResolveResult {
  missingItems: string[];
  missingCost: number;
  consumedSlots: number[];
}

/** 计算英雄当前物品栏总价值（含已消费的魔晶） */
export function calculateInventoryValue(unit: Unit): number {
  let val = 0;
  for (const it of unit.inventory) {
    if (it) {
      const def = getItemDef(it.id);
      if (def) val += def.cost;
    }
  }
  if (unit.hero?.hasShard) {
    val += 1400;
  }
  return val;
}

/** 递归分析合成目标所需的缺失配件、所需金钱及需消耗的现有物品栏格子 */
export function resolveRecipe(unit: Unit, targetId: string): ResolveResult | null {
  const targetDef = getItemDef(targetId);
  if (!targetDef) return null;

  // 基础物品（无散件配方）：直接作为单件购买，不消耗已有物品
  if (!targetDef.components || targetDef.components.length === 0) {
    return {
      missingItems: [targetId],
      missingCost: targetDef.cost,
      consumedSlots: [],
    };
  }

  // 复制一份当前格子状态用于模拟匹配
  const availableSlots = unit.inventory.map((item, idx) => ({ item, idx, used: false }));

  const missingItems: string[] = [];
  let missingCost = targetDef.recipeCost ?? 0;
  const consumedSlots: number[] = [];

  function resolveComponent(compId: string): void {
    // 1. 优先在未占用的格子中寻找是否有完全相同的现成物品
    const match = availableSlots.find((s) => !s.used && s.item?.id === compId);
    if (match) {
      match.used = true;
      consumedSlots.push(match.idx);
      return;
    }

    const def = getItemDef(compId);
    if (!def) return;

    // 2. 如果是合成件，递归匹配其散件
    if (def.components && def.components.length > 0) {
      for (const subComp of def.components) {
        resolveComponent(subComp);
      }
      missingCost += def.recipeCost ?? 0;
    } else {
      // 3. 基础件直接加入缺失列表与费用
      missingItems.push(compId);
      missingCost += def.cost;
    }
  }

  for (const compId of targetDef.components) {
    resolveComponent(compId);
  }

  return { missingItems, missingCost, consumedSlots };
}

/** 购买物品（支持基础件购买、消耗品堆叠、神杖魔晶以及成品缺件自动补齐并合成） */
export function buyItem(world: World, unit: Unit, itemId: string): { success: boolean; reason?: string } {
  if (!unit.hero || !unit.alive) {
    return { success: false, reason: 'invalid_unit' };
  }

  // 特殊处理：阿哈利姆魔晶（Shard）
  if (itemId === 'aghanims_shard') {
    if (unit.hero.hasShard) {
      return { success: false, reason: 'already_have_shard' };
    }
    const unlockTime = world.balance?.economy?.shardUnlockTime ?? 480;
    if (world.time < unlockTime) {
      return { success: false, reason: 'shard_locked' };
    }
    if (unit.hero.gold < 1400) {
      return { success: false, reason: 'not_enough_gold' };
    }

    unit.hero.gold -= 1400;
    unit.hero.hasShard = true;
    unit.hero.shardTime = world.time;
    unit.hero.itemValue = calculateInventoryValue(unit);

    world.events.emit({ type: 'itemBuy', unitId: unit.id, itemId, cost: 1400 });
    recomputeStats(world, unit);
    return { success: true };
  }

  const def = getItemDef(itemId);
  if (!def) {
    return { success: false, reason: 'invalid_item' };
  }

  // 处理可堆叠消耗品已有槽位的情况
  if (def.stackable) {
    const existingSlot = unit.findItemSlot(itemId);
    if (existingSlot >= 0) {
      const cost = def.cost;
      if (unit.hero.gold < cost) {
        return { success: false, reason: 'not_enough_gold' };
      }
      unit.hero.gold -= cost;
      const slotItem = unit.inventory[existingSlot]!;
      slotItem.charges = (slotItem.charges ?? 1) + (def.initialCharges ?? 1);
      slotItem.costPaid += cost;
      unit.hero.itemValue = calculateInventoryValue(unit);

      world.events.emit({ type: 'itemBuy', unitId: unit.id, itemId, cost });
      recomputeStats(world, unit);
      return { success: true };
    }
  }

  // 递归解析配方所需散件与金钱
  const recipe = resolveRecipe(unit, itemId);
  if (!recipe) {
    return { success: false, reason: 'invalid_recipe' };
  }

  // 检查金钱
  if (unit.hero.gold < recipe.missingCost) {
    return { success: false, reason: 'not_enough_gold' };
  }

  // 检查空间：现有空槽位 + 本次合成消耗释放的槽位必须 >= 1
  const freeSlots = unit.inventory.filter((s) => s === null).length;
  if (freeSlots + recipe.consumedSlots.length < 1) {
    return { success: false, reason: 'inventory_full' };
  }

  // 扣款
  unit.hero.gold -= recipe.missingCost;

  // 计算已被消耗散件累计的购买成本
  let componentsCostPaid = 0;
  for (const sIdx of recipe.consumedSlots) {
    componentsCostPaid += unit.inventory[sIdx]!.costPaid;
    unit.inventory[sIdx] = null;
  }

  // 寻找合成后放入的槽位（优先使用被消耗散件的原有最低槽位，否则选首个空槽位）
  let targetSlot = -1;
  if (recipe.consumedSlots.length > 0) {
    targetSlot = Math.min(...recipe.consumedSlots);
  } else {
    targetSlot = unit.inventory.findIndex((s) => s === null);
  }

  const instance: ItemInstance = {
    id: itemId,
    buyTime: world.time,
    costPaid: componentsCostPaid + recipe.missingCost,
    charges: def.initialCharges,
    selectedStat: itemId === 'power_treads' ? 'str' : undefined,
  };

  unit.inventory[targetSlot] = instance;
  unit.hero.itemValue = calculateInventoryValue(unit);

  world.events.emit({ type: 'itemBuy', unitId: unit.id, itemId, cost: recipe.missingCost });
  if (recipe.consumedSlots.length > 0) {
    world.events.emit({ type: 'itemCombine', unitId: unit.id, itemId });
  }

  // 尝试检查是否有无卷轴费用的其他成品能继续合成
  checkAndCombine(world, unit);

  recomputeStats(world, unit);
  return { success: true };
}

/** 出售物品（10秒内未使用的物品全额原价退款，否则50%折价） */
export function sellItem(world: World, unit: Unit, slotIndex: number): { success: boolean; refund: number } {
  if (!unit.hero || slotIndex < 0 || slotIndex >= 6) {
    return { success: false, refund: 0 };
  }

  const item = unit.inventory[slotIndex];
  if (!item) {
    return { success: false, refund: 0 };
  }

  const def = getItemDef(item.id);
  if (!def) {
    return { success: false, refund: 0 };
  }

  // 10 秒原价全额退款判定：10秒内、未切换状态、且充能未消耗
  const isFullRefund =
    world.time - item.buyTime <= 10.0 &&
    !item.toggled &&
    (def.initialCharges === undefined || item.charges === def.initialCharges);

  let refund = 0;
  if (isFullRefund) {
    refund = item.costPaid;
  } else {
    if (def.stackable && item.charges !== undefined && def.initialCharges !== undefined) {
      refund = Math.floor((def.cost / def.initialCharges) * item.charges * 0.5);
    } else {
      refund = Math.floor(def.cost * 0.5);
    }
  }

  unit.inventory[slotIndex] = null;
  giveGold(world, unit, refund);
  unit.hero.itemValue = calculateInventoryValue(unit);

  world.events.emit({ type: 'itemSell', unitId: unit.id, itemId: item.id, refund });
  recomputeStats(world, unit);

  return { success: true, refund };
}

/** 自动检查并合成本身无卷轴费用的成品（如假腿、坚韧球、散夜对剑等） */
export function checkAndCombine(world: World, unit: Unit): boolean {
  let combinedAny = false;

  let changed = true;
  while (changed) {
    changed = false;

    // 遍历所有卷轴费用为 0 的合成物品
    for (const def of Object.values(ITEM_DEFINITIONS)) {
      if (!def.components || def.components.length === 0) continue;
      if (def.recipeCost && def.recipeCost > 0) continue;

      // 检查当前背包是否拥有全部组件
      const available = unit.inventory.map((it, idx) => ({ it, idx, used: false }));
      const matchedSlots: number[] = [];
      let allMatch = true;

      for (const compId of def.components) {
        const found = available.find((a) => !a.used && a.it?.id === compId);
        if (found) {
          found.used = true;
          matchedSlots.push(found.idx);
        } else {
          allMatch = false;
          break;
        }
      }

      if (allMatch && matchedSlots.length > 0) {
        let totalCostPaid = 0;
        let latestBuyTime = 0;
        for (const sIdx of matchedSlots) {
          const comp = unit.inventory[sIdx]!;
          totalCostPaid += comp.costPaid;
          if (comp.buyTime > latestBuyTime) latestBuyTime = comp.buyTime;
          unit.inventory[sIdx] = null;
        }

        const targetSlot = Math.min(...matchedSlots);
        unit.inventory[targetSlot] = {
          id: def.id,
          buyTime: latestBuyTime,
          costPaid: totalCostPaid,
          charges: def.initialCharges,
          selectedStat: def.id === 'power_treads' ? 'str' : undefined,
        };

        world.events.emit({ type: 'itemCombine', unitId: unit.id, itemId: def.id });
        changed = true;
        combinedAny = true;
        break;
      }
    }
  }

  if (combinedAny) {
    if (unit.hero) {
      unit.hero.itemValue = calculateInventoryValue(unit);
    }
    recomputeStats(world, unit);
  }

  return combinedAny;
}
