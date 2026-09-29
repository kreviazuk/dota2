import { describe, it, expect } from 'vitest';
import { makeWorld, spawnDummy, runFor } from './helpers';
import { addModifier } from '../src/sim/modifiers';
import { spawnProjectile, spawnEffect } from '../src/sim/systems/projectiles';
import { Team } from '../src/sim/core/types';
import type { Unit } from '../src/sim/entities/unit';

const asCreep = (u: Unit) => {
  u.creep = { type: 'melee', laneOffset: 0, aggroTargetId: null, aggroUntil: 0, protectedUntilContact: false };
  return u;
};

describe('attacks', () => {
  it('melee attack lands after attack point, then repeats every interval', () => {
    const w = makeWorld();
    const a = spawnDummy(w, { pos: { x: 1500, y: 5000 } });
    const t = spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 5100 } });
    a.order = { kind: 'attack', targetId: t.id, persistent: true };
    runFor(w, 0.2); expect(t.hp).toBe(1000);
    runFor(w, 0.2); expect(t.hp).toBe(950);
    runFor(w, 1.0); expect(t.hp).toBe(900);
  });
  it('ranged attacks travel as projectiles', () => {
    const w = makeWorld();
    const a = spawnDummy(w, { pos: { x: 1500, y: 5000 }, base: { attackRange: 600, projectileSpeed: 900 } });
    const t = spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 4500 } });
    a.order = { kind: 'attack', targetId: t.id, persistent: true };
    runFor(w, 0.4);
    expect(w.projectiles).toHaveLength(1); expect(t.hp).toBe(1000);
    runFor(w, 0.6);
    expect(t.hp).toBe(950);
  });
  it('evasion causes misses', () => {
    const w = makeWorld();
    const a = spawnDummy(w, { pos: { x: 1500, y: 5000 } });
    const t = spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 5100 } });
    addModifier(w, t, { id: 'ev', stats: { evasion: 1 } });
    a.order = { kind: 'attack', targetId: t.id, persistent: true };
    runFor(w, 2);
    expect(t.hp).toBe(1000);
    expect(w.events.drain().some((e) => e.type === 'miss')).toBe(true);
  });
  it('armor reduces attack damage', () => {
    const w = makeWorld();
    const a = spawnDummy(w, { pos: { x: 1500, y: 5000 } });
    const t = spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 5100 }, base: { armor: 10 } });
    a.order = { kind: 'attack', targetId: t.id, persistent: true };
    runFor(w, 0.4);
    expect(t.hp).toBeCloseTo(968.75);
  });
  it('chases a target that is out of range', () => {
    const w = makeWorld();
    const a = spawnDummy(w, { pos: { x: 1500, y: 5000 } });
    const t = spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 4400 } });
    a.order = { kind: 'attack', targetId: t.id, persistent: true };
    runFor(w, 3);
    expect(t.hp).toBeLessThan(1000);
  });
  it('onAttackStart can apply a crit', () => {
    const w = makeWorld();
    const a = spawnDummy(w, { pos: { x: 1500, y: 5000 } });
    const t = spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 5100 } });
    addModifier(w, a, { id: 'crit', onAttackStart: (_m, _o, _t, _w, atk) => { atk.critMult = 2; } });
    a.order = { kind: 'attack', targetId: t.id, persistent: true };
    runFor(w, 0.4);
    expect(t.hp).toBe(900);
  });
  it('lifesteal heals the attacker', () => {
    const w = makeWorld();
    const a = spawnDummy(w, { pos: { x: 1500, y: 5000 } });
    const t = spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 5100 } });
    addModifier(w, a, { id: 'ls', stats: { lifesteal: 0.5 } });
    a.hp = 500;
    a.order = { kind: 'attack', targetId: t.id, persistent: true };
    runFor(w, 0.4);
    expect(a.hp).toBeCloseTo(525);
  });
  it('idle heroes auto-attack enemies in range unless autoAttack is off', () => {
    const w = makeWorld();
    const h = spawnDummy(w, { kind: 'hero', pos: { x: 1500, y: 5000 } });
    const t = spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 5100 } });
    runFor(w, 0.5);
    expect(t.hp).toBe(950);
    h.autoAttack = false;
    runFor(w, 2);
    expect(t.hp).toBe(950);
  });
  it('smart attack command prefers heroes, lastHit picks killable creeps', () => {
    const w = makeWorld();
    const h = spawnDummy(w, { kind: 'hero', pos: { x: 1500, y: 5000 } });
    const creepFull = asCreep(spawnDummy(w, { team: Team.Dire, pos: { x: 1450, y: 4900 } }));
    const creepLow = asCreep(spawnDummy(w, { team: Team.Dire, pos: { x: 1550, y: 4900 } }));
    const enemyHero = spawnDummy(w, { kind: 'hero', team: Team.Dire, pos: { x: 1500, y: 4800 } });
    creepLow.hp = 40;
    w.issue(h.id, { type: 'attack', mode: 'smart' }); w.step();
    expect(h.order).toMatchObject({ kind: 'attack', targetId: enemyHero.id });
    w.issue(h.id, { type: 'attack', mode: 'lastHit' }); w.step();
    expect(h.order).toMatchObject({ kind: 'attack', targetId: creepLow.id });
    void creepFull;
  });
  it('hero attacking a hero draws creep aggro and tower aggro', () => {
    const w = makeWorld();
    const attacker = spawnDummy(w, { kind: 'hero', team: Team.Dire, pos: { x: 1500, y: 5000 } });
    const victim = spawnDummy(w, { kind: 'hero', team: Team.Radiant, pos: { x: 1500, y: 5100 } });
    const creep = asCreep(spawnDummy(w, { team: Team.Radiant, pos: { x: 1600, y: 5200 } }));
    const tower = spawnDummy(w, { kind: 'building', team: Team.Radiant, pos: { x: 1500, y: 5600 }, radius: 90, base: { attackRange: 700, moveSpeed: 0 } });
    tower.building = { type: 'tower', tier: 1, key: 't1', prereqIds: [], forcedTargetId: null, forcedUntil: 0, goldTeam: 0, goldLastHit: 0 };
    attacker.order = { kind: 'attack', targetId: victim.id, persistent: true };
    w.step();
    expect(creep.creep!.aggroTargetId).toBe(attacker.id);
    expect(tower.building.forcedTargetId).toBe(attacker.id);
  });
  it('kills remove the target and emit death', () => {
    const w = makeWorld();
    const a = spawnDummy(w, { pos: { x: 1500, y: 5000 }, base: { damageMin: 2000, damageMax: 2000 } });
    const t = spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 5100 } });
    a.order = { kind: 'attack', targetId: t.id, persistent: true };
    runFor(w, 0.5);
    expect(t.alive).toBe(false);
    expect(w.units.includes(t)).toBe(false);
    expect(a.order.kind).toBe('idle');
  });
});

describe('projectiles and effects', () => {
  it('linear projectiles hit the first enemy, piercing ones hit all', () => {
    const w = makeWorld();
    const src = spawnDummy(w, { pos: { x: 1500, y: 5000 } });
    const e1 = spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 4800 } });
    const e2 = spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 4600 } });
    const hits: number[] = [];
    spawnProjectile(w, { team: src.team, sourceId: src.id, pos: src.pos, speed: 1500, kind: 'linear', dir: { x: 0, y: -1 }, maxDistance: 1000, width: 50, visual: 'test', onHit: (_w, t) => { hits.push(t.id); } });
    runFor(w, 1);
    expect(hits).toEqual([e1.id]);
    hits.length = 0;
    spawnProjectile(w, { team: src.team, sourceId: src.id, pos: src.pos, speed: 1500, kind: 'linear', dir: { x: 0, y: -1 }, maxDistance: 1000, width: 50, pierce: true, visual: 'test', onHit: (_w, t) => { hits.push(t.id); } });
    runFor(w, 1);
    expect(hits).toEqual([e1.id, e2.id]);
    expect(w.projectiles).toHaveLength(0);
  });
  it('area effects tick on interval and end', () => {
    const w = makeWorld();
    let ticks = 0, ended = 0;
    spawnEffect(w, { team: Team.Radiant, sourceId: 0, pos: { x: 1500, y: 5000 }, radius: 200, duration: 2, interval: 0.5, visual: 'test', onInterval: () => { ticks++; }, onEnd: () => { ended++; } });
    runFor(w, 2.1);
    expect(ticks).toBe(4); expect(ended).toBe(1); expect(w.effects).toHaveLength(0);
  });
});
