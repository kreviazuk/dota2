import { describe, it, expect } from 'vitest';
import {
  ITEM_DEFINITIONS,
  getItemDef,
  getAllItemDefs,
  getItemsByCategory,
  getRecipe,
  isFinishedItem,
  calculateItemCost,
} from '../../src/sim/items/definitions';
import type { ItemCategory } from '../../src/sim/items/types';

describe('Item Definitions (7.41f)', () => {
  it('defines valid items with non-empty names and positive costs', () => {
    const all = getAllItemDefs();
    expect(all.length).toBeGreaterThan(40);

    for (const item of all) {
      expect(item.id).toBeTruthy();
      expect(item.name).toBeTruthy();
      expect(item.cost).toBeGreaterThan(0);
      expect(item.category).toBeTruthy();
    }
  });

  it('verifies that every composite item cost exactly equals the sum of its components plus recipe cost', () => {
    const all = getAllItemDefs();
    for (const item of all) {
      if (item.components && item.components.length > 0) {
        // 确保所有组件都存在
        for (const compId of item.components) {
          const comp = getItemDef(compId);
          expect(comp, `Component ${compId} of ${item.id} must exist`).toBeDefined();
        }

        const calculated = calculateItemCost(item.id);
        expect(
          calculated,
          `Item ${item.id} (${item.name}) calculated cost ${calculated} must equal defined cost ${item.cost}`
        ).toBe(item.cost);
      }
    }
  });

  it('detects no cyclic dependencies in item recipes', () => {
    const visited = new Set<string>();
    const recStack = new Set<string>();

    function checkCycle(id: string) {
      visited.add(id);
      recStack.add(id);

      const item = getItemDef(id);
      if (item && item.components) {
        for (const c of item.components) {
          if (!visited.has(c)) {
            checkCycle(c);
          } else if (recStack.has(c)) {
            throw new Error(`Cycle detected between ${id} and ${c}`);
          }
        }
      }

      recStack.delete(id);
    }

    for (const id of Object.keys(ITEM_DEFINITIONS)) {
      if (!visited.has(id)) {
        checkCycle(id);
      }
    }
    expect(true).toBe(true);
  });

  it('retrieves items by category correctly', () => {
    const categories: ItemCategory[] = [
      'consumables',
      'attributes',
      'armaments',
      'boots',
      'early',
      'defense',
      'weapons',
      'utility',
      'special',
    ];

    for (const cat of categories) {
      const items = getItemsByCategory(cat);
      expect(items.length).toBeGreaterThan(0);
      for (const itm of items) {
        expect(itm.category).toBe(cat);
      }
    }
  });

  it('correctly reports recipe details and finished status', () => {
    expect(isFinishedItem('iron_branch')).toBe(false);
    expect(isFinishedItem('black_king_bar')).toBe(true);
    expect(isFinishedItem('power_treads')).toBe(true);

    const bkbRecipe = getRecipe('black_king_bar');
    expect(bkbRecipe).toBeDefined();
    expect(bkbRecipe!.components).toEqual(['mithril_hammer', 'ogre_axe']);
    expect(bkbRecipe!.recipeCost).toBe(1450);

    const branchRecipe = getRecipe('iron_branch');
    expect(branchRecipe).toBeNull();
  });

  it('includes key items for 7.41f', () => {
    const expectedKeys = [
      'tango',
      'healing_salve',
      'blink_dagger',
      'black_king_bar',
      'blade_mail',
      'power_treads',
      'phase_boots',
      'arcane_boots',
      'tranquil_boots',
      'vanguard',
      'mekansm',
      'crimson_guard',
      'pipe_of_insight',
      'shivas_guard',
      'assault_cuirass',
      'heart_of_tarrasque',
      'battle_fury',
      'daedalus',
      'satanic',
      'mjollnir',
      'abyssal_blade',
      'aghanims_scepter',
      'aghanims_shard',
    ];

    for (const k of expectedKeys) {
      expect(getItemDef(k), `Key item ${k} should be defined`).toBeDefined();
    }
  });
});
