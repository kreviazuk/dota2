import { describe, it, expect } from 'vitest';
import { makeWorld, runFor, spawnDummy } from '../helpers';
import { Team } from '../../src/sim/core/types';
import {
  getUnlockedElites,
  spawnElite,
  ELITE_CONFIGS,
} from '../../src/sim/entities/elites';
import { updateSpawner } from '../../src/sim/systems/creeps';

describe('Elites system', () => {
  it('unlocks elites over time based on schedule', () => {
    expect(getUnlockedElites(0)).toEqual([]);
    expect(getUnlockedElites(179)).toEqual([]);
    expect(getUnlockedElites(180)).toEqual(['centaur_conqueror']);
    expect(getUnlockedElites(300)).toEqual(['centaur_conqueror', 'alpha_wolf']);
    expect(getUnlockedElites(420)).toEqual(['centaur_conqueror', 'alpha_wolf', 'satyr_hellcaller']);
    expect(getUnlockedElites(540)).toEqual([
      'centaur_conqueror',
      'alpha_wolf',
      'satyr_hellcaller',
      'ancient_black_dragon',
    ]);
    expect(getUnlockedElites(720)).toEqual([
      'centaur_conqueror',
      'alpha_wolf',
      'satyr_hellcaller',
      'ancient_black_dragon',
      'ancient_rock_golem',
    ]);
  });

  it('spawns elite with growth scaling and correct stats', () => {
    const w = makeWorld();
    w.time = 300; // 5 minutes: growth = 1 + 5 * 0.04 = 1.20
    const elite = spawnElite(w, Team.Radiant, 'centaur_conqueror', { x: 1500, y: 5000 }, 0);
    expect(elite.kind).toBe('elite');
    expect(elite.elite?.type).toBe('centaur_conqueror');
    // base hp 1100 * 1.2 = 1320
    expect(elite.stats.maxHp).toBe(1320);
    expect(elite.stats.armor).toBe(ELITE_CONFIGS.centaur_conqueror.armor);
  });

  it('centaur conqueror casts war stomp when enemy is in range', () => {
    const w = makeWorld();
    const centaur = spawnElite(w, Team.Radiant, 'centaur_conqueror', { x: 1500, y: 5000 }, 0);
    const enemy = spawnDummy(w, { team: Team.Dire, pos: { x: 1600, y: 5000 }, base: { maxHp: 500 } });

    expect(enemy.hasState('stunned')).toBe(false);
    runFor(w, 0.1);

    expect(enemy.hasState('stunned')).toBe(true);
    expect(enemy.hp).toBeLessThan(500);
    expect(centaur.elite?.abilityCooldowns.stomp).toBeGreaterThan(w.time);
  });

  it('alpha wolf aura grants +20% base damage to allied creeps and procs crit', () => {
    const w = makeWorld();
    const wolf = spawnElite(w, Team.Radiant, 'alpha_wolf', { x: 1500, y: 5000 }, 0);
    const creep = spawnDummy(w, { team: Team.Radiant, pos: { x: 1600, y: 5000 }, kind: 'creep', base: { damageMin: 50, damageMax: 50 } });

    runFor(w, 0.1);
    // +20% damage
    expect(creep.stats.damageMin).toBe(60);
    expect(creep.stats.damageMax).toBe(60);

    // Wolf itself attacks
    const enemy = spawnDummy(w, { team: Team.Dire, pos: { x: 1550, y: 5000 }, base: { maxHp: 1000 } });
    wolf.order = { kind: 'attack', targetId: enemy.id, persistent: true };
    runFor(w, 2);
    expect(enemy.hp).toBeLessThan(1000);
  });

  it('satyr hellcaller fires shockwave damaging enemies in line', () => {
    const w = makeWorld();
    spawnElite(w, Team.Radiant, 'satyr_hellcaller', { x: 1500, y: 5000 }, 0);
    const enemy = spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 4600 }, base: { maxHp: 500 } });

    runFor(w, 0.5);
    // Shockwave reaches target in ~0.5s (dist 400, speed 900)
    expect(enemy.hp).toBeLessThan(500);
  });

  it('ancient black dragon spits fireball creating ground burn', () => {
    const w = makeWorld();
    spawnElite(w, Team.Radiant, 'ancient_black_dragon', { x: 1500, y: 5000 }, 0);
    const enemy = spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 4700 }, base: { maxHp: 800 } });

    runFor(w, 1.5);
    expect(w.effects.some((e) => e.visual === 'dragon_fireball')).toBe(true);
    expect(enemy.hp).toBeLessThan(800);
  });

  it('ancient rock golem provides granite aura and splits into 2 golem shards on death', () => {
    const w = makeWorld();
    const golem = spawnElite(w, Team.Radiant, 'ancient_rock_golem', { x: 1500, y: 5000 }, 0);
    const creep = spawnDummy(w, { team: Team.Radiant, pos: { x: 1600, y: 5000 }, kind: 'creep', base: { maxHp: 500 } });

    runFor(w, 0.1);
    expect(creep.stats.maxHp).toBe(650); // 500 + 150

    // Kill the golem
    golem.hp = 0;
    golem.alive = false;
    w.killListeners.forEach((listener) => listener(w, golem, null));

    const shards = w.units.filter((u) => u.kind === 'elite' && u.elite?.type === 'golem_shard');
    expect(shards.length).toBe(2);
    expect(shards[0].stats.maxHp).toBe(880);
  });

  it('updateSpawner spawns elite at wave 6 (3:00)', () => {
    const w = makeWorld();
    w.config.spawnCreeps = true;
    w.time = 180;
    w.spawner.waveIndex = 6;
    w.spawner.nextWaveTime = 180;

    updateSpawner(w, 1 / 30);
    const radiantElites = w.units.filter((u) => u.team === Team.Radiant && u.kind === 'elite');
    const direElites = w.units.filter((u) => u.team === Team.Dire && u.kind === 'elite');

    expect(radiantElites.length).toBe(1);
    expect(direElites.length).toBe(1);
    expect(radiantElites[0].elite?.type).toBe('centaur_conqueror');
  });
});
