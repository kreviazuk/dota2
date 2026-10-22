import { describe, it, expect, beforeEach } from 'vitest';
import { World } from '../../src/sim/world';
import { Team } from '../../src/sim/core/types';
import { createHero } from '../../src/sim/systems/heroes';
import { SimpleAI } from '../../src/ai/simpleAI';
import { DIFFICULTY } from '../../src/ai/difficulty';
import { buyItem } from '../../src/sim/items/inventory';
import { decideItemUsage } from '../../src/ai/itemUsage';
import { applyControl } from '../../src/sim/status';

describe('AI Item Purchasing & Tactical Usage (Task 7)', () => {
  let world: World;

  beforeEach(() => {
    world = new World({ seed: 42 });
  });

  describe('AI Auto Purchasing', () => {
    it('automatically purchases components and combines big items as gold increases', () => {
      const axe = createHero(world, 'axe', Team.Radiant, false);
      const ai = new SimpleAI(axe.id, DIFFICULTY.normal.skill);

      // Initially no gold, does not issue buy command
      axe.hero!.gold = 100;
      let cmds = ai.think(world, axe);
      expect(cmds.some((c) => c.type === 'buy')).toBe(false);

      // Give 500 gold: Axe recommends tranquil_boots (first component: boots_of_speed, 500)
      axe.hero!.gold = 500;
      cmds = ai.think(world, axe);
      const buyCmd1 = cmds.find((c) => c.type === 'buy');
      expect(buyCmd1).toEqual({ type: 'buy', itemId: 'boots_of_speed' });

      // Apply the command in world
      world.issue(axe.id, buyCmd1!);
      world.step();
      expect(axe.hasItem('boots_of_speed')).toBe(true);
      expect(Math.floor(axe.hero!.gold)).toBe(0);

      // Give 225 gold: next component is wind_lace (225)
      axe.hero!.gold = 225;
      cmds = ai.think(world, axe);
      const buyCmd2 = cmds.find((c) => c.type === 'buy');
      expect(buyCmd2).toEqual({ type: 'buy', itemId: 'wind_lace' });
      world.issue(axe.id, buyCmd2!);
      world.step();
      expect(axe.hasItem('wind_lace')).toBe(true);

      // Give 175 gold: next component is ring_of_regen (175)
      axe.hero!.gold = 175;
      cmds = ai.think(world, axe);
      const buyCmd3 = cmds.find((c) => c.type === 'buy');
      expect(buyCmd3).toEqual({ type: 'buy', itemId: 'ring_of_regen' });
      world.issue(axe.id, buyCmd3!);
      world.step();

      // Tranquil boots should have auto-combined!
      expect(axe.hasItem('tranquil_boots')).toBe(true);
      expect(axe.hasItem('boots_of_speed')).toBe(false);
      expect(axe.hasItem('wind_lace')).toBe(false);
      expect(axe.hasItem('ring_of_regen')).toBe(false);
    });
  });

  describe('AI Tactical Item Usage', () => {
    it('activates Black King Bar in combat when stunned or faced with multiple enemies', () => {
      const sven = createHero(world, 'sven', Team.Radiant, false);
      const enemy1 = createHero(world, 'lina', Team.Dire, false);
      const enemy2 = createHero(world, 'zeus', Team.Dire, false);
      enemy1.pos = { x: sven.pos.x + 300, y: sven.pos.y };
      enemy2.pos = { x: sven.pos.x + 350, y: sven.pos.y };

      sven.hero!.gold = 5000;
      buyItem(world, sven, 'black_king_bar');
      expect(sven.hasItem('black_king_bar')).toBe(true);

      // Apply stun onto Sven
      applyControl(world, sven, 'stun', { source: null, duration: 2.0 });
      expect(sven.hasState('stunned')).toBe(true);

      const ctx = {
        enemyHeroes: [enemy1, enemy2],
        allyHeroes: [],
        hpPct: sven.hp / sven.stats.maxHp,
        manaPct: sven.mana / sven.stats.maxMana,
        retreating: false,
      };

      const cmd = decideItemUsage(world, sven, ctx);
      expect(cmd).toEqual({ type: 'useItem', index: 0 });
    });

    it('blinks towards enemies to initiate combat and blinks towards fountain when retreating', () => {
      const axe = createHero(world, 'axe', Team.Radiant, false);
      const enemy = createHero(world, 'drow_ranger', Team.Dire, false);
      axe.pos = { x: 1500, y: 1500 };
      enemy.pos = { x: 1500, y: 2200 }; // 700 units away

      axe.hero!.gold = 3000;
      buyItem(world, axe, 'blink_dagger');
      expect(axe.hasItem('blink_dagger')).toBe(true);

      // 1. Aggressive initiation
      const engageCtx = {
        enemyHeroes: [enemy],
        allyHeroes: [],
        hpPct: 1.0,
        manaPct: 1.0,
        retreating: false,
      };
      const engageCmd = decideItemUsage(world, axe, engageCtx);
      expect(engageCmd).not.toBeNull();
      expect(engageCmd?.type).toBe('useItem');
      if (engageCmd && engageCmd.type === 'useItem') {
        expect(engageCmd.target?.point).toEqual(enemy.pos);
      }

      // 2. Retreating escape
      const escapeCtx = {
        enemyHeroes: [enemy],
        allyHeroes: [],
        hpPct: 0.2,
        manaPct: 0.5,
        retreating: true,
      };
      const escapeCmd = decideItemUsage(world, axe, escapeCtx);
      expect(escapeCmd).not.toBeNull();
      expect(escapeCmd?.type).toBe('useItem');
      if (escapeCmd && escapeCmd.type === 'useItem') {
        // Should blink towards Radiant fountain (y > 1500)
        expect(escapeCmd.target?.point?.y).toBeGreaterThan(axe.pos.y);
      }
    });

    it('activates Blade Mail when taking heavy damage near enemies', () => {
      const axe = createHero(world, 'axe', Team.Radiant, false);
      const enemy = createHero(world, 'phantom_assassin', Team.Dire, false);
      axe.pos = { x: 1500, y: 1500 };
      enemy.pos = { x: 1500, y: 1700 };

      axe.hero!.gold = 3000;
      buyItem(world, axe, 'blade_mail');
      axe.hp = axe.stats.maxHp * 0.5; // low hp

      const ctx = {
        enemyHeroes: [enemy],
        allyHeroes: [],
        hpPct: 0.5,
        manaPct: 1.0,
        retreating: false,
      };

      const cmd = decideItemUsage(world, axe, ctx);
      expect(cmd).toEqual({ type: 'useItem', index: 0 });
    });

    it('activates Mekansm when self or ally health is low', () => {
      const cm = createHero(world, 'crystal_maiden', Team.Radiant, false);
      cm.hero!.gold = 3000;
      buyItem(world, cm, 'mekansm');
      cm.hp = cm.stats.maxHp * 0.4; // 40% hp

      const ctx = {
        enemyHeroes: [],
        allyHeroes: [],
        hpPct: 0.4,
        manaPct: 1.0,
        retreating: false,
      };

      const cmd = decideItemUsage(world, cm, ctx);
      expect(cmd).toEqual({ type: 'useItem', index: 0 });
    });

    it('activates Magic Wand when charges >= 3 and health is low', () => {
      const pudge = createHero(world, 'pudge', Team.Radiant, false);
      pudge.hero!.gold = 1000;
      buyItem(world, pudge, 'magic_wand');
      const wand = pudge.inventory[0]!;
      wand.charges = 8;
      pudge.hp = pudge.stats.maxHp * 0.35; // 35% hp

      const ctx = {
        enemyHeroes: [],
        allyHeroes: [],
        hpPct: 0.35,
        manaPct: 0.8,
        retreating: false,
      };

      const cmd = decideItemUsage(world, pudge, ctx);
      expect(cmd).toEqual({ type: 'useItem', index: 0 });
    });
  });
});
