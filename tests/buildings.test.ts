import { describe, it, expect } from 'vitest';
import { makeWorld, spawnDummy, runFor } from './helpers';
import { createBuildings } from '../src/sim/systems/buildings';
import { applyDamage, killUnit } from '../src/sim/systems/damage';
import { Team } from '../src/sim/core/types';
import type { Unit } from '../src/sim/entities/unit';

const asCreep = (u: Unit, type: 'melee' | 'siege' = 'melee') => {
  u.creep = { type, laneOffset: 0, aggroTargetId: null, aggroUntil: 0, protectedUntilContact: false };
  return u;
};

describe('buildings', () => {
  it('creates 7 buildings per team with an invulnerability chain', () => {
    const w = makeWorld(); const b = createBuildings(w); w.step();
    expect(w.units.filter((u) => u.kind === 'building')).toHaveLength(14);
    const r = b[Team.Radiant];
    expect(r.t1.hasState('invulnerable')).toBe(false);
    expect(r.t2.hasState('invulnerable')).toBe(true);
    expect(r.ancient.hasState('invulnerable')).toBe(true);
    expect(r.fountain.hasState('invulnerable')).toBe(true);
    killUnit(w, r.t1, null); w.step();
    expect(r.t2.hasState('invulnerable')).toBe(false);
    expect(r.t3.hasState('invulnerable')).toBe(true);
  });
  it('towers prefer creeps over heroes', () => {
    const w = makeWorld(); const b = createBuildings(w);
    const t1 = b[Team.Radiant].t1;
    const hero = spawnDummy(w, { kind: 'hero', team: Team.Dire, pos: { x: t1.pos.x, y: t1.pos.y - 300 } });
    const creep = asCreep(spawnDummy(w, { team: Team.Dire, pos: { x: t1.pos.x + 200, y: t1.pos.y - 500 } }));
    w.step();
    expect(t1.attack.targetId).toBe(creep.id);
    void hero;
  });
  it('towers switch to an enemy hero that attacks an allied hero', () => {
    const w = makeWorld(); const b = createBuildings(w);
    const t1 = b[Team.Radiant].t1;
    asCreep(spawnDummy(w, { team: Team.Dire, pos: { x: t1.pos.x + 200, y: t1.pos.y - 500 } }));
    const ally = spawnDummy(w, { kind: 'hero', team: Team.Radiant, pos: { x: t1.pos.x - 200, y: t1.pos.y - 400 } });
    const enemy = spawnDummy(w, { kind: 'hero', team: Team.Dire, pos: { x: t1.pos.x - 200, y: t1.pos.y - 500 } });
    enemy.order = { kind: 'attack', targetId: ally.id, persistent: true };
    runFor(w, 0.1);
    expect(t1.attack.targetId).toBe(enemy.id);
  });
  it('backdoor protection reduces damage when no attacking creeps are near', () => {
    const w = makeWorld(); const b = createBuildings(w);
    const r = b[Team.Radiant];
    killUnit(w, r.t1, null); w.step();
    const hero = spawnDummy(w, { kind: 'hero', team: Team.Dire, pos: { x: r.t2.pos.x, y: r.t2.pos.y - 150 } });
    expect(applyDamage(w, { source: hero, target: r.t2, amount: 100, type: 'pure', isAttack: false })).toBeCloseTo(40);
    asCreep(spawnDummy(w, { team: Team.Dire, pos: { x: r.t2.pos.x + 100, y: r.t2.pos.y - 300 } }));
    expect(applyDamage(w, { source: hero, target: r.t2, amount: 100, type: 'pure', isAttack: false })).toBeCloseTo(100);
  });
  it('T1 has no backdoor protection', () => {
    const w = makeWorld(); const b = createBuildings(w); w.step();
    expect(applyDamage(w, { source: null, target: b[Team.Radiant].t1, amount: 100, type: 'pure', isAttack: false })).toBeCloseTo(100);
  });
  it('destroying a T3 grants super creeps, destroying the ancient ends the game', () => {
    const w = makeWorld(); const b = createBuildings(w);
    killUnit(w, b[Team.Dire].t3, null);
    expect(w.teams[Team.Radiant].superCreeps).toBe(true);
    killUnit(w, b[Team.Dire].ancient, null);
    expect(w.winner).toBe(Team.Radiant);
    expect(w.events.drain().some((e) => e.type === 'victory')).toBe(true);
  });
  it('fountain heals allies', () => {
    const w = makeWorld(); const b = createBuildings(w);
    const f = b[Team.Radiant].fountain;
    const hero = spawnDummy(w, { kind: 'hero', team: Team.Radiant, pos: { x: f.pos.x, y: f.pos.y - 150 } });
    hero.hp = 100;
    runFor(w, 1);
    expect(hero.hp).toBeGreaterThan(145);
  });
  it('towers kill creeps over time', () => {
    const w = makeWorld(); const b = createBuildings(w);
    const t1 = b[Team.Radiant].t1;
    const creep = asCreep(spawnDummy(w, { team: Team.Dire, pos: { x: t1.pos.x, y: t1.pos.y - 400 }, base: { damageMax: 0, damageMin: 0, maxHp: 550 } }));
    runFor(w, 8);
    expect(creep.alive).toBe(false);
  });
});
