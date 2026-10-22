import { describe, it, expect } from 'vitest';
import '../testHero';
import { makeWorld, spawnDummy } from '../helpers';
import { createHero } from '../../src/sim/systems/heroes';
import { createBuildings } from '../../src/sim/systems/buildings';
import { Team } from '../../src/sim/core/types';
import { UtilityAI } from '../../src/ai/utilityAI';
import { DIFFICULTY } from '../../src/ai/difficulty';
import { grantItem } from '../../src/sim/items/inventory';
import { expectedAttackDamage } from '../../src/sim/query';
import { Rune } from '../../src/sim/entities/rune';

const place = (u: { pos: { x: number; y: number } }, x: number, y: number) => {
  u.pos = { x, y };
};

describe('UtilityAI', () => {
  const utility = new UtilityAI();
  const skill = DIFFICULTY.normal.skill;

  describe('last_hit vs deny priority', () => {
    it('scores last_hit between 85-95 when enemy creep is killable', () => {
      const w = makeWorld();
      const me = createHero(w, 'testhero', Team.Radiant, false);
      place(me, 1500, 5000);
      const enemyCreep = spawnDummy(w, {
        team: Team.Dire,
        pos: { x: 1550, y: 5000 },
        kind: 'creep',
      });
      // Set creep HP within 1-hit kill threshold
      const dmg = expectedAttackDamage(w, me, enemyCreep);
      enemyCreep.hp = dmg * 0.8;

      const evalResult = utility.evaluate(w, me, skill);
      expect(evalResult.actions.last_hit.score).toBeGreaterThanOrEqual(85);
      expect(evalResult.actions.last_hit.score).toBeLessThanOrEqual(95);
      expect(evalResult.actions.last_hit.command?.type).toBe('attack');
      expect(evalResult.bestAction?.type).toBe('last_hit');
    });

    it('scores deny between 70-80 when allied creep is < 50% HP and killable', () => {
      const w = makeWorld();
      const me = createHero(w, 'testhero', Team.Radiant, false);
      place(me, 1500, 5000);
      const alliedCreep = spawnDummy(w, {
        team: Team.Radiant,
        pos: { x: 1550, y: 5000 },
        kind: 'creep',
      });
      alliedCreep.stats.maxHp = 500;
      // HP < 50% and killable
      const dmg = expectedAttackDamage(w, me, alliedCreep);
      alliedCreep.hp = Math.min(200, dmg * 0.9);

      const evalResult = utility.evaluate(w, me, skill);
      expect(evalResult.actions.deny.score).toBeGreaterThanOrEqual(70);
      expect(evalResult.actions.deny.score).toBeLessThanOrEqual(80);
      expect(evalResult.actions.deny.command?.type).toBe('attack');
      expect(evalResult.bestAction?.type).toBe('deny');
    });

    it('does NOT score deny when allied creep is >= 50% maxHp', () => {
      const w = makeWorld();
      const me = createHero(w, 'testhero', Team.Radiant, false);
      place(me, 1500, 5000);
      const alliedCreep = spawnDummy(w, {
        team: Team.Radiant,
        pos: { x: 1550, y: 5000 },
        kind: 'creep',
      });
      alliedCreep.stats.maxHp = 500;
      alliedCreep.hp = 300; // > 50%

      const evalResult = utility.evaluate(w, me, skill);
      expect(evalResult.actions.deny.score).toBe(0);
    });

    it('prioritizes positive last hit over deny when both are available', () => {
      const w = makeWorld();
      const me = createHero(w, 'testhero', Team.Radiant, false);
      place(me, 1500, 5000);

      const enemyCreep = spawnDummy(w, { team: Team.Dire, pos: { x: 1550, y: 5000 }, kind: 'creep' });
      const alliedCreep = spawnDummy(w, { team: Team.Radiant, pos: { x: 1450, y: 5000 }, kind: 'creep' });
      alliedCreep.stats.maxHp = 500;
      alliedCreep.hp = 30; // Killable and < 50%
      enemyCreep.hp = 30; // Killable

      const evalResult = utility.evaluate(w, me, skill);
      expect(evalResult.actions.last_hit.score).toBeGreaterThan(evalResult.actions.deny.score);
      expect(evalResult.bestAction?.type).toBe('last_hit');
    });
  });

  describe('tower avoidance and aggro rules', () => {
    it('scores avoid_tower 100 when targeted by an enemy tower', () => {
      const w = makeWorld();
      createBuildings(w);
      const me = createHero(w, 'testhero', Team.Radiant, false);
      place(me, 1500, 6000);

      // Find dire tower
      const direTower = w.units.find(
        (u) => u.team === Team.Dire && u.kind === 'building' && u.building?.type === 'tower',
      )!;
      direTower.attack.targetId = me.id;

      const evalResult = utility.evaluate(w, me, skill);
      expect(evalResult.actions.avoid_tower.score).toBe(100);
      expect(evalResult.bestAction?.type).toBe('avoid_tower');
      expect(evalResult.actions.avoid_tower.command?.type).toBe('moveTo');
    });

    it('scores avoid_tower 95 when inside tower range with no creeps tanking', () => {
      const w = makeWorld();
      createBuildings(w);
      const me = createHero(w, 'testhero', Team.Radiant, false);
      const direTower = w.units.find(
        (u) => u.team === Team.Dire && u.kind === 'building' && u.building?.type === 'tower',
      )!;
      // Place hero inside tower range
      place(me, direTower.pos.x, direTower.pos.y - 300);

      const evalResult = utility.evaluate(w, me, skill);
      expect(evalResult.actions.avoid_tower.score).toBe(95);
      expect(evalResult.bestAction?.type).toBe('avoid_tower');
    });

    it('strictly forbids harass inside enemy tower range (score 0)', () => {
      const w = makeWorld();
      createBuildings(w);
      const me = createHero(w, 'testhero', Team.Radiant, false);
      const enemy = createHero(w, 'testhero', Team.Dire, false);
      const direTower = w.units.find(
        (u) => u.team === Team.Dire && u.kind === 'building' && u.building?.type === 'tower',
      )!;

      // Both are under enemy tower
      place(me, direTower.pos.x, direTower.pos.y - 300);
      place(enemy, direTower.pos.x, direTower.pos.y - 250);

      const evalResult = utility.evaluate(w, me, skill);
      expect(evalResult.actions.harass.score).toBe(0);
    });

    it('forbids chase_kill dive under enemy tower unless target is 1-hit killable and self HP > 50%', () => {
      const w = makeWorld();
      createBuildings(w);
      const me = createHero(w, 'testhero', Team.Radiant, false);
      const enemy = createHero(w, 'testhero', Team.Dire, false);
      const direTower = w.units.find(
        (u) => u.team === Team.Dire && u.kind === 'building' && u.building?.type === 'tower',
      )!;

      place(me, direTower.pos.x, direTower.pos.y - 850);
      place(enemy, direTower.pos.x, direTower.pos.y - 200); // under tower
      enemy.hp = enemy.stats.maxHp * 0.25; // low HP but not 1 hit

      let evalResult = utility.evaluate(w, me, skill);
      expect(evalResult.actions.chase_kill.score).toBe(0);

      // Now target is 1-hit killable, but self is low HP (< 50%)
      enemy.hp = 10;
      me.hp = me.stats.maxHp * 0.35;
      evalResult = utility.evaluate(w, me, skill);
      expect(evalResult.actions.chase_kill.score).toBe(0);

      // Now target is 1-hit killable and self is healthy (> 50%)
      me.hp = me.stats.maxHp * 0.8;
      evalResult = utility.evaluate(w, me, skill);
      expect(evalResult.actions.chase_kill.score).toBeGreaterThanOrEqual(80);
    });
  });

  describe('retreat_safe and recall', () => {
    it('initiates recall when far from home and no enemies nearby', () => {
      const w = makeWorld();
      const me = createHero(w, 'testhero', Team.Radiant, false);
      // Lane position far from radiant fountain (which is at y ~ 8500)
      place(me, 1500, 5000);
      me.hp = me.stats.maxHp * 0.15; // Low HP (< 30%)

      const evalResult = utility.evaluate(w, me, skill);
      expect(evalResult.actions.retreat_safe.score).toBeGreaterThanOrEqual(90);
      expect(evalResult.actions.retreat_safe.command?.type).toBe('recall');
      expect(evalResult.bestAction?.type).toBe('retreat_safe');
    });

    it('stops and recovers when at fountain', () => {
      const w = makeWorld();
      const me = createHero(w, 'testhero', Team.Radiant, false);
      place(me, 1500, 9750); // at radiant fountain
      me.hp = me.stats.maxHp * 0.4;

      const evalResult = utility.evaluate(w, me, skill);
      expect(evalResult.actions.retreat_safe.score).toBe(95);
      expect(evalResult.actions.retreat_safe.command?.type).toBe('stop');
    });
  });

  describe('use_consumables', () => {
    it('uses healing salve when out of combat and hurt', () => {
      const w = makeWorld();
      const me = createHero(w, 'testhero', Team.Radiant, false);
      place(me, 1500, 5000);
      grantItem(w, me, 'healing_salve');
      me.hp = me.stats.maxHp * 0.5;
      me.hero!.lastDamagedTime = -100; // Out of combat

      const evalResult = utility.evaluate(w, me, skill);
      expect(evalResult.actions.use_consumables.score).toBeGreaterThanOrEqual(75);
      expect(evalResult.actions.use_consumables.command?.type).toBe('useItem');
    });

    it('does NOT use consumables if damaged within combat window', () => {
      const w = makeWorld();
      w.time = 50;
      const me = createHero(w, 'testhero', Team.Radiant, false);
      place(me, 1500, 5000);
      grantItem(w, me, 'healing_salve');
      me.hp = me.stats.maxHp * 0.5;
      me.hero!.lastDamagedTime = 49.0; // Damaged 1 second ago

      const evalResult = utility.evaluate(w, me, skill);
      expect(evalResult.actions.use_consumables.score).toBe(0);
    });
  });

  describe('push_tower', () => {
    it('scores push_tower when allied creeps are tanking the tower', () => {
      const w = makeWorld();
      const b = createBuildings(w);
      const me = createHero(w, 'testhero', Team.Radiant, false);
      const direTower = b[Team.Dire].t1;

      // Place hero and allied creep near tower
      place(me, direTower.pos.x, direTower.pos.y + 450);
      spawnDummy(w, {
        team: Team.Radiant,
        pos: { x: direTower.pos.x, y: direTower.pos.y + 300 },
        kind: 'creep',
      });

      const evalResult = utility.evaluate(w, me, skill);
      expect(evalResult.actions.push_tower.score).toBeGreaterThanOrEqual(60);
      expect(evalResult.actions.push_tower.command?.type).toBe('attack');
    });

    it('does NOT score push_tower when no creeps are tanking the tower', () => {
      const w = makeWorld();
      const b = createBuildings(w);
      const me = createHero(w, 'testhero', Team.Radiant, false);
      const direTower = b[Team.Dire].t1;

      place(me, direTower.pos.x, direTower.pos.y + 450);
      // No creeps

      const evalResult = utility.evaluate(w, me, skill);
      expect(evalResult.actions.push_tower.score).toBe(0);
    });
  });

  describe('pick_rune decision', () => {
    it('scores pick_rune between 75-85 when active rune is within range and safe', () => {
      const w = makeWorld();
      const me = createHero(w, 'testhero', Team.Radiant, false);
      place(me, 1800, 5200);

      const rune = new Rune(w.allocId(), 'haste', { x: 1800, y: 5000 }, 'east_power', w.time);
      w.runes.push(rune);

      const evalResult = utility.evaluate(w, me, skill);
      expect(evalResult.actions.pick_rune.score).toBeGreaterThanOrEqual(75);
      expect(evalResult.actions.pick_rune.score).toBeLessThanOrEqual(86);
      expect(evalResult.actions.pick_rune.command?.type).toBe('moveTo');
    });

    it('does NOT score pick_rune when HP is dangerously low (< 30%)', () => {
      const w = makeWorld();
      const me = createHero(w, 'testhero', Team.Radiant, false);
      place(me, 1800, 5200);
      me.hp = me.stats.maxHp * 0.2; // 20% HP

      const rune = new Rune(w.allocId(), 'haste', { x: 1800, y: 5000 }, 'east_power', w.time);
      w.runes.push(rune);

      const evalResult = utility.evaluate(w, me, skill);
      expect(evalResult.actions.pick_rune.score).toBe(0);
    });
  });
});
