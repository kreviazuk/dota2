import { describe, it, expect } from 'vitest';
import '../testHero';
import { makeWorld, heroAt } from '../helpers';
import { Team } from '../../src/sim/core/types';
import { MicroAI } from '../../src/ai/microAI';
import { DIFFICULTY } from '../../src/ai/difficulty';
import { grantItem } from '../../src/sim/items/inventory';
import { addModifier } from '../../src/sim/modifiers';
import { dist } from '../../src/sim/core/vec2';

const ALL = { Q: 4, W: 4, E: 4, R: 3 } as const;

describe('MicroAI', () => {
  const micro = new MicroAI();

  describe('leadAim calculation', () => {
    it('accurately predicts leading point with prediction 1.0', () => {
      const w = makeWorld();
      const me = heroAt(w, 'pudge', { x: 1000, y: 5000 }, { team: Team.Radiant });
      const target = heroAt(w, 'lina', { x: 1600, y: 5000 }, { team: Team.Dire });
      // Simulate target moving along Y axis with speed 300
      target.prevPos = { x: 1600, y: 4990 };
      target.pos = { x: 1600, y: 5000 };
      // Velocity = (5000 - 4990) / (1/30) = 300 units/sec

      const aimHard = micro.leadAim(w, me, target, 1600, 0.3, DIFFICULTY.hard.skill);
      // Hard prediction has full leadTime
      expect(aimHard.y).toBeGreaterThan(target.pos.y);
      expect(aimHard.x).toBeCloseTo(target.pos.x);
    });

    it('predicts half movement on normal (prediction 0.5)', () => {
      const w = makeWorld();
      const me = heroAt(w, 'pudge', { x: 1000, y: 5000 }, { team: Team.Radiant });
      const target = heroAt(w, 'lina', { x: 1600, y: 5000 }, { team: Team.Dire });
      target.prevPos = { x: 1600, y: 4990 };
      target.pos = { x: 1600, y: 5000 };

      const aimHard = micro.leadAim(w, me, target, 1600, 0.3, DIFFICULTY.hard.skill);
      const aimNormal = micro.leadAim(w, me, target, 1600, 0.3, DIFFICULTY.normal.skill);

      // Normal lead amount should be half of hard lead amount
      const leadHard = aimHard.y - target.pos.y;
      const leadNormal = aimNormal.y - target.pos.y;
      expect(leadNormal).toBeCloseTo(leadHard * 0.5, 0);
    });

    it('adds offset error on easy (prediction 0)', () => {
      const w = makeWorld();
      const me = heroAt(w, 'pudge', { x: 1000, y: 5000 }, { team: Team.Radiant });
      const target = heroAt(w, 'lina', { x: 1600, y: 5000 }, { team: Team.Dire });
      target.prevPos = { x: 1600, y: 5000 };
      target.pos = { x: 1600, y: 5000 };

      const aimEasy = micro.leadAim(w, me, target, 1600, 0.3, DIFFICULTY.easy.skill);
      // Even when target is stationary, easy adds a random error offset up to 150
      const d = dist(aimEasy, target.pos);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(150.1);
    });
  });

  describe('Axe Combo Chain', () => {
    it('blinks into range when blink dagger is available', () => {
      const w = makeWorld();
      const axe = heroAt(w, 'axe', { x: 1000, y: 5000 }, { team: Team.Radiant, levels: ALL });
      const target = heroAt(w, 'lina', { x: 1600, y: 5000 }, { team: Team.Dire, levels: ALL });
      grantItem(w, axe, 'blink_dagger');
      grantItem(w, axe, 'blade_mail');

      const cmd = micro.tryCombo(w, axe, target, DIFFICULTY.hard.skill);
      expect(cmd).not.toBeNull();
      expect(cmd?.type).toBe('useItem');
      expect((cmd as any).target?.point).toEqual(target.pos);
    });

    it('casts Berserkers Call and Blade Mail when already in melee range', () => {
      const w = makeWorld();
      const axe = heroAt(w, 'axe', { x: 1550, y: 5000 }, { team: Team.Radiant, levels: ALL });
      const target = heroAt(w, 'lina', { x: 1600, y: 5000 }, { team: Team.Dire, levels: ALL });
      grantItem(w, axe, 'blade_mail');

      // Step 2: Berserker's Call
      const cmdCall = micro.tryCombo(w, axe, target, DIFFICULTY.hard.skill);
      expect(cmdCall).toEqual({ type: 'cast', slot: 'Q' });

      // Put Call on cooldown, then should activate Blade Mail
      axe.ability('Q')!.cooldown = 10;
      const cmdBm = micro.tryCombo(w, axe, target, DIFFICULTY.hard.skill);
      expect(cmdBm?.type).toBe('useItem');

      // Put Blade Mail on cooldown, then should cast Battle Hunger
      axe.inventory[0]!.cooldownRemaining = 10;
      const cmdHunger = micro.tryCombo(w, axe, target, DIFFICULTY.hard.skill);
      expect(cmdHunger).toEqual({ type: 'cast', slot: 'W', target: { unitId: target.id } });
    });

    it('casts Culling Blade when target is below kill threshold', () => {
      const w = makeWorld();
      const axe = heroAt(w, 'axe', { x: 1550, y: 5000 }, { team: Team.Radiant, levels: ALL });
      const target = heroAt(w, 'lina', { x: 1600, y: 5000 }, { team: Team.Dire, levels: ALL });
      target.hp = 150; // Well below culling blade threshold (275)

      const cmd = micro.tryCombo(w, axe, target, DIFFICULTY.hard.skill);
      expect(cmd).toEqual({ type: 'cast', slot: 'R', target: { unitId: target.id } });
    });
  });

  describe('Lina Combo Chain', () => {
    it('uses Euls Scepter first when available', () => {
      const w = makeWorld();
      const lina = heroAt(w, 'lina', { x: 1300, y: 5000 }, { team: Team.Radiant, levels: ALL });
      const target = heroAt(w, 'axe', { x: 1600, y: 5000 }, { team: Team.Dire, levels: ALL });
      grantItem(w, lina, 'euls_scepter');

      const cmd = micro.tryCombo(w, lina, target, DIFFICULTY.hard.skill);
      expect(cmd?.type).toBe('useItem');
      expect((cmd as any).target?.unitId).toBe(target.id);
    });

    it('times Light Strike Array at 0.8s remaining into cyclone', () => {
      const w = makeWorld();
      w.time = 10;
      const lina = heroAt(w, 'lina', { x: 1300, y: 5000 }, { team: Team.Radiant, levels: ALL });
      const target = heroAt(w, 'axe', { x: 1600, y: 5000 }, { team: Team.Dire, levels: ALL });

      // Apply cyclone modifier with 0.7s remaining
      addModifier(w, target, { id: 'cyclone', name: '龙卷风', states: ['invulnerable'] }, {
        duration: 0.7,
      });

      const cmd = micro.tryCombo(w, lina, target, DIFFICULTY.hard.skill);
      expect(cmd).toEqual({ type: 'cast', slot: 'W', target: { point: target.pos } });
    });
  });

  describe('Pudge Combo Chain', () => {
    it('casts meat hook with lead aiming at distance', () => {
      const w = makeWorld();
      const pudge = heroAt(w, 'pudge', { x: 1000, y: 5000 }, { team: Team.Radiant, levels: ALL });
      const target = heroAt(w, 'lina', { x: 1600, y: 5000 }, { team: Team.Dire, levels: ALL });

      const cmd = micro.tryCombo(w, pudge, target, DIFFICULTY.hard.skill);
      expect(cmd?.type).toBe('cast');
      expect((cmd as any).slot).toBe('Q');
      expect((cmd as any).target?.dir).toBeDefined();
    });

    it('toggles Rot and casts Dismember when close', () => {
      const w = makeWorld();
      const pudge = heroAt(w, 'pudge', { x: 1550, y: 5000 }, { team: Team.Radiant, levels: ALL });
      const target = heroAt(w, 'lina', { x: 1600, y: 5000 }, { team: Team.Dire, levels: ALL });

      // Rot is toggled on first
      const cmdRot = micro.tryCombo(w, pudge, target, DIFFICULTY.hard.skill);
      expect(cmdRot).toEqual({ type: 'toggle', slot: 'W' });

      // Give Pudge the rot modifier (simulating toggle on)
      addModifier(w, pudge, { id: 'pudge_rot', name: '腐烂' });

      // Now Dismember is cast
      const cmdDismember = micro.tryCombo(w, pudge, target, DIFFICULTY.hard.skill);
      expect(cmdDismember).toEqual({ type: 'cast', slot: 'R', target: { unitId: target.id } });
    });
  });

  describe('Sven Combo Chain', () => {
    it('casts Warcry and Gods Strength before attacking', () => {
      const w = makeWorld();
      const sven = heroAt(w, 'sven', { x: 1200, y: 5000 }, { team: Team.Radiant, levels: ALL });
      const target = heroAt(w, 'lina', { x: 1600, y: 5000 }, { team: Team.Dire, levels: ALL });

      // Step 1: Warcry (slot E)
      const cmdWarcry = micro.tryCombo(w, sven, target, DIFFICULTY.hard.skill);
      expect(cmdWarcry).toEqual({ type: 'cast', slot: 'E' });

      // Apply warcry buff
      addModifier(w, sven, { id: 'sven_warcry', name: '战吼' });

      // Step 2: God's Strength (slot R)
      const cmdUlt = micro.tryCombo(w, sven, target, DIFFICULTY.hard.skill);
      expect(cmdUlt).toEqual({ type: 'cast', slot: 'R' });

      // Apply ult buff
      addModifier(w, sven, { id: 'sven_gods_strength', name: '神之力量' });

      // Step 3: Storm Hammer (slot Q)
      const cmdHammer = micro.tryCombo(w, sven, target, DIFFICULTY.hard.skill);
      expect(cmdHammer).toEqual({ type: 'cast', slot: 'Q', target: { unitId: target.id } });
    });
  });

  describe('Difficulty Calibration', () => {
    it('does not trigger combos on easy (comboChance: 0)', () => {
      const w = makeWorld();
      const axe = heroAt(w, 'axe', { x: 1550, y: 5000 }, { team: Team.Radiant, levels: ALL });
      const target = heroAt(w, 'lina', { x: 1600, y: 5000 }, { team: Team.Dire, levels: ALL });

      const cmd = micro.tryCombo(w, axe, target, DIFFICULTY.easy.skill);
      expect(cmd).toBeNull();
    });

    it('always triggers combos on hard (comboChance: 1.0)', () => {
      const w = makeWorld();
      const axe = heroAt(w, 'axe', { x: 1550, y: 5000 }, { team: Team.Radiant, levels: ALL });
      const target = heroAt(w, 'lina', { x: 1600, y: 5000 }, { team: Team.Dire, levels: ALL });

      const cmd = micro.tryCombo(w, axe, target, DIFFICULTY.hard.skill);
      expect(cmd).not.toBeNull();
    });
  });
});
