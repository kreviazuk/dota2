import { describe, it, expect, beforeEach } from 'vitest';
import { World } from '../../src/sim/world';
import { Team } from '../../src/sim/core/types';
import { createHero } from '../../src/sim/systems/heroes';
import { buyItem } from '../../src/sim/items/inventory';
import { getNextQuickBuyItem, ITEM_BUILDS } from '../../src/ai/builds';
import { getItemVisual, getItemIconCanvas } from '../../src/render/itemIcons';
import { ITEM_DEFINITIONS, getItemDef } from '../../src/sim/items/definitions';

describe('Shop & HUD Inventory (Task 6)', () => {
  let world: World;

  beforeEach(() => {
    world = new World({ seed: 100 });
  });

  describe('Procedural Canvas Icon Generator', () => {
    it('returns valid visuals with non-empty glyphs and tags for items', () => {
      const itemsToCheck = ['blink_dagger', 'black_king_bar', 'tango', 'boots_of_speed', 'vanguard', 'aghanims_scepter'];
      for (const id of itemsToCheck) {
        const v = getItemVisual(id);
        expect(v).toBeDefined();
        expect(v.bg.length).toBe(2);
        expect(v.glyph.length).toBeGreaterThan(0);
        expect(v.tag.length).toBeGreaterThan(0);
        expect(v.border).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    });

    it('generates HTMLCanvasElement / texture surface with requested dimension', () => {
      const canvas = getItemIconCanvas('blink_dagger', 48);
      expect(canvas).toBeDefined();
      expect(canvas.width).toBe(48);
      expect(canvas.height).toBe(48);
    });

    it('provides visuals for all defined game items', () => {
      for (const id of Object.keys(ITEM_DEFINITIONS)) {
        const v = getItemVisual(id);
        expect(v).toBeDefined();
        expect(v.tag).toBeDefined();
        expect(v.glyph).toBeDefined();
      }
    });
  });

  describe('Hero Recommended Builds Verification', () => {
    const heroIds = ['axe', 'sven', 'lina', 'crystal_maiden', 'zeus', 'drow_ranger', 'phantom_assassin', 'juggernaut', 'pudge', 'shadow_fiend'];

    it('all 10 heroes have non-empty recommended build lists', () => {
      for (const heroId of heroIds) {
        const build = ITEM_BUILDS[heroId];
        expect(build).toBeDefined();
        expect(build.length).toBeGreaterThanOrEqual(6);
      }
    });

    it('all items in hero build lists exist in ITEM_DEFINITIONS', () => {
      for (const heroId of heroIds) {
        const build = ITEM_BUILDS[heroId];
        for (const itemId of build) {
          const def = getItemDef(itemId);
          expect(def, `Hero ${heroId} references non-existent item ${itemId}`).toBeDefined();
        }
      }
    });
  });

  describe('Quick Buy Component Progression', () => {
    it('suggests the first missing component of recommended build', () => {
      const axe = createHero(world, 'axe', Team.Radiant, true);
      // Axe recommended build begins with tranquil_boots:
      // components: ['boots_of_speed', 'wind_lace', 'ring_of_regen']
      const qb1 = getNextQuickBuyItem(world, axe);
      expect(qb1).not.toBeNull();
      expect(qb1?.itemId).toBe('boots_of_speed');
      expect(qb1?.cost).toBe(500);

      // Buy boots_of_speed
      axe.hero!.gold = 5000;
      buyItem(world, axe, 'boots_of_speed');
      const qb2 = getNextQuickBuyItem(world, axe);
      expect(qb2?.itemId).toBe('wind_lace');
      expect(qb2?.cost).toBe(225);

      // Buy wind_lace
      buyItem(world, axe, 'wind_lace');
      const qb3 = getNextQuickBuyItem(world, axe);
      expect(qb3?.itemId).toBe('ring_of_regen');
      expect(qb3?.cost).toBe(175);

      // Buy ring_of_regen -> tranquil_boots auto-combines!
      buyItem(world, axe, 'ring_of_regen');
      expect(axe.hasItem('tranquil_boots')).toBe(true);

      // Next build item is vanguard -> requires vitality_booster (1000) + ring_of_health (700)
      const qb4 = getNextQuickBuyItem(world, axe);
      expect(qb4?.itemId).toBe('vitality_booster');
      expect(qb4?.cost).toBe(1000);

      // Buy vitality_booster
      buyItem(world, axe, 'vitality_booster');
      const qb5 = getNextQuickBuyItem(world, axe);
      expect(qb5?.itemId).toBe('ring_of_health');
      expect(qb5?.cost).toBe(700);

      // Buy ring_of_health -> vanguard auto-combines!
      buyItem(world, axe, 'ring_of_health');
      expect(axe.hasItem('vanguard')).toBe(true);

      // Next build item is blink_dagger (basic item, 2250)
      const qb6 = getNextQuickBuyItem(world, axe);
      expect(qb6?.itemId).toBe('blink_dagger');
      expect(qb6?.cost).toBe(2250);
    });

    it('waits until 8:00 (480s) to suggest Aghanim Shard', () => {
      const zeus = createHero(world, 'zeus', Team.Radiant, true);
      const originalBuild = ITEM_BUILDS.zeus;
      ITEM_BUILDS.zeus = ['aghanims_shard'];

      world.time = 300; // 5:00
      expect(getNextQuickBuyItem(world, zeus)).toBeNull();

      world.time = 480; // 8:00
      const qb = getNextQuickBuyItem(world, zeus);
      expect(qb).not.toBeNull();
      expect(qb?.itemId).toBe('aghanims_shard');
      expect(qb?.cost).toBe(1400);

      // Once consumed, shard is no longer suggested
      zeus.hero!.hasShard = true;
      expect(getNextQuickBuyItem(world, zeus)).toBeNull();

      ITEM_BUILDS.zeus = originalBuild;
    });

    it('returns null when all recommended items are purchased', () => {
      const pudge = createHero(world, 'pudge', Team.Radiant, true);
      const originalBuild = ITEM_BUILDS.pudge;
      ITEM_BUILDS.pudge = ['boots_of_speed'];

      expect(getNextQuickBuyItem(world, pudge)?.itemId).toBe('boots_of_speed');
      pudge.hero!.gold = 1000;
      buyItem(world, pudge, 'boots_of_speed');
      expect(getNextQuickBuyItem(world, pudge)).toBeNull();

      ITEM_BUILDS.pudge = originalBuild;
    });
  });
});
