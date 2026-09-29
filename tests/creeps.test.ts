import { describe, it, expect } from 'vitest';
import { spawnDummy, runFor } from './helpers';
import { World } from '../src/sim/world';
import { spawnCreep, waveComposition, pickCreepTarget } from '../src/sim/systems/creeps';
import { Team } from '../src/sim/core/types';

const creepWorld = () => new World({ seed: 3, recordEvents: true, spawnCreeps: true });
const creeps = (w: World, team?: Team) => w.units.filter((u) => u.kind === 'creep' && (team === undefined || u.team === team));

describe('creep waves', () => {
  it('first wave spawns at 0:10 with 3 melee + 2 ranged per team', () => {
    const w = creepWorld();
    runFor(w, 9.9); expect(creeps(w)).toHaveLength(0);
    runFor(w, 0.2);
    expect(creeps(w, Team.Radiant)).toHaveLength(5);
    expect(creeps(w, Team.Dire)).toHaveLength(5);
    expect(creeps(w, Team.Radiant).filter((c) => c.creep!.type === 'ranged')).toHaveLength(2);
  });
  it('composition grows over time and switches to super creeps', () => {
    const w = creepWorld();
    w.time = 210;
    expect(waveComposition(w, Team.Radiant, 8)).toContain('siege');
    expect(waveComposition(w, Team.Radiant, 9)).not.toContain('siege');
    w.time = 400;
    expect(waveComposition(w, Team.Radiant, 1).filter((t) => t === 'melee')).toHaveLength(4);
    w.time = 800;
    expect(waveComposition(w, Team.Radiant, 1).filter((t) => t === 'ranged')).toHaveLength(3);
    w.teams[Team.Radiant].superCreeps = true;
    expect(waveComposition(w, Team.Radiant, 1)).toContain('superMelee');
  });
  it('creeps upgrade every 3 minutes', () => {
    const w = creepWorld();
    w.time = 361;
    const c = spawnCreep(w, Team.Radiant, 'melee', { x: 1500, y: 8000 }, 0);
    expect(c.stats.maxHp).toBe(550 + 30 * 2);
    expect(c.bounty.gold).toBeCloseTo(36 * 1.1);
  });
  it('creeps march forward and fight in the middle', () => {
    const w = creepWorld();
    runFor(w, 12);
    const r = creeps(w, Team.Radiant);
    expect(Math.max(...r.map((c) => c.pos.y))).toBeLessThan(8900);
    runFor(w, 30);
    const total = creeps(w).length;
    const damaged = creeps(w).some((c) => c.hp < c.stats.maxHp);
    expect(total < 20 || damaged).toBe(true);
  });
  it('creeps prefer creeps over heroes', () => {
    const w = new World({ seed: 1, spawnCreeps: false });
    const me = spawnCreep(w, Team.Radiant, 'melee', { x: 1500, y: 5000 }, 0);
    const hero = spawnDummy(w, { kind: 'hero', team: Team.Dire, pos: { x: 1500, y: 4900 } });
    const other = spawnCreep(w, Team.Dire, 'melee', { x: 1500, y: 4700 }, 0);
    expect(pickCreepTarget(w, me, 500)?.id).toBe(other.id);
    void hero;
  });
  it('creeps retaliate against heroes attacking allied heroes', () => {
    const w = new World({ seed: 1, spawnCreeps: false });
    const c = spawnCreep(w, Team.Radiant, 'melee', { x: 1600, y: 5100 }, 0);
    spawnCreep(w, Team.Dire, 'melee', { x: 1500, y: 4700 }, 0);
    const ally = spawnDummy(w, { kind: 'hero', team: Team.Radiant, pos: { x: 1500, y: 5050 } });
    const enemy = spawnDummy(w, { kind: 'hero', team: Team.Dire, pos: { x: 1500, y: 4950 } });
    enemy.order = { kind: 'attack', targetId: ally.id, persistent: true };
    runFor(w, 0.2);
    expect(c.order).toMatchObject({ kind: 'attack', targetId: enemy.id });
  });
});
