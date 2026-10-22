import { describe, it, expect } from 'vitest';
import { makeWorld, runFor, heroAt } from '../helpers';
import { Team } from '../../src/sim/core/types';
import {
  spawnRoshan,
  calculateRoshanBase,
  ROSHAN_PIT,
} from '../../src/sim/entities/roshan';
import { grantAegis, MOD_AEGIS } from '../../src/sim/items/aegis';
import { findModifier } from '../../src/sim/modifiers';
import { applyDamage } from '../../src/sim/systems/damage';

describe('Roshan & Aegis system', () => {
  it('calculates roshan scaling based on match time', () => {
    // 15:00 (900s) = 15 minutes
    const base15 = calculateRoshanBase(900);
    expect(base15.maxHp).toBe(6000 + 15 * 150);
    expect(base15.damageMin).toBe(150 + 15 * 6 - 5);
    expect(base15.armor).toBe(20);
    expect(base15.magicResist).toBe(0.55);
  });

  it('spawns roshan at pit with neutral team and spell shield', () => {
    const w = makeWorld();
    const roshan = spawnRoshan(w);
    expect(roshan.team).toBe(Team.Neutral);
    expect(roshan.defId).toBe('roshan');
    expect(roshan.stats.armor).toBe(20);
    expect(roshan.stats.magicResist).toBeCloseTo(0.55);
    expect(roshan.pos.x).toBe(ROSHAN_PIT.x);
    expect(roshan.pos.y).toBe(ROSHAN_PIT.y);
  });

  it('roshan casts slam on nearby enemies inflicting damage and slow', () => {
    const w = makeWorld();
    const hero = heroAt(w, 'axe', { x: ROSHAN_PIT.x + 100, y: ROSHAN_PIT.y });
    const initialHp = hero.hp;
    spawnRoshan(w);

    runFor(w, 0.2);
    expect(hero.hp).toBeLessThan(initialHp);
    expect(findModifier(hero, 'slow_roshan_slam')).toBeDefined();
  });

  it('roshan leashes back to pit if pulled too far', () => {
    const w = makeWorld();
    const roshan = spawnRoshan(w);
    // Move Roshan 600 units away from pit
    roshan.pos = { x: ROSHAN_PIT.x + 600, y: ROSHAN_PIT.y };
    roshan.hp = 2000;

    runFor(w, 0.2);
    expect(roshan.order.kind).toBe('moveTo');
    expect(roshan.hp).toBeGreaterThan(2000);
  });

  it('grants aegis of the immortal to killer hero upon roshan death', () => {
    const w = makeWorld();
    const roshan = spawnRoshan(w);
    const hero = heroAt(w, 'axe', { x: ROSHAN_PIT.x + 50, y: ROSHAN_PIT.y });

    // Kill roshan with hero as killer
    roshan.hp = 0;
    roshan.alive = false;
    w.killListeners.forEach((l) => l(w, roshan, hero));

    expect(findModifier(hero, MOD_AEGIS.id)).toBeDefined();
  });

  it('aegis triggers reincarnation on fatal damage, reviving in 5 seconds with full hp/mana', () => {
    const w = makeWorld();
    const hero = heroAt(w, 'sven', { x: 1500, y: 5000 });
    grantAegis(w, hero);
    expect(findModifier(hero, MOD_AEGIS.id)).toBeDefined();

    // Deal lethal damage
    applyDamage(w, {
      source: null,
      target: hero,
      amount: 99999,
      type: 'pure',
      isAttack: false,
    });

    // Hero should NOT be dead (killUnit bypassed)
    expect(hero.alive).toBe(true);
    // Aegis consumed
    expect(findModifier(hero, MOD_AEGIS.id)).toBeUndefined();
    // Stasis active
    expect(findModifier(hero, 'mod_aegis_reincarnating')).toBeDefined();
    expect(hero.hasState('invulnerable')).toBe(true);
    expect(hero.hasState('stunned')).toBe(true);

    // After 5 seconds, reincarnation completes
    runFor(w, 5.1);
    expect(findModifier(hero, 'mod_aegis_reincarnating')).toBeUndefined();
    expect(hero.hp).toBe(hero.stats.maxHp);
    expect(hero.mana).toBe(hero.stats.maxMana);
  });

  it('aegis expires after 300s and grants healing salve', () => {
    const w = makeWorld();
    const hero = heroAt(w, 'lina', { x: 1500, y: 5000 });
    grantAegis(w, hero);

    expect(hero.inventory.some((it) => it?.id === 'healing_salve')).toBe(false);

    // Fast forward 300 seconds
    runFor(w, 301);

    expect(findModifier(hero, MOD_AEGIS.id)).toBeUndefined();
    expect(hero.inventory.some((it) => it?.id === 'healing_salve')).toBe(true);
  });
});
