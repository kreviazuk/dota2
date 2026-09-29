import { describe, it, expect } from 'vitest';
import './testHero';
import { makeWorld, spawnDummy } from './helpers';
import { createHero } from '../src/sim/systems/heroes';
import { createBuildings } from '../src/sim/systems/buildings';
import { giveXp } from '../src/sim/systems/progress';
import { applyDamage, killUnit } from '../src/sim/systems/damage';
import { Team } from '../src/sim/core/types';

const place = (u: { pos: { x: number; y: number } }, x: number, y: number) => { u.pos = { x, y }; };

describe('creep bounties', () => {
  it('last hitter gets full gold, nearby allies 25%, xp split among nearby heroes', () => {
    const w = makeWorld();
    const a = createHero(w, 'testhero', Team.Radiant, false);
    const b = createHero(w, 'testhero', Team.Radiant, false);
    const far = createHero(w, 'testhero', Team.Radiant, false);
    place(a, 1500, 5000); place(b, 1600, 5000); place(far, 1500, 8000);
    const creep = spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 4900 }, bounty: { gold: 40, xp: 60 } });
    const g = [a, b, far].map((h) => h.hero!.gold);
    killUnit(w, creep, a);
    expect(a.hero!.gold - g[0]).toBeCloseTo(100);
    expect(b.hero!.gold - g[1]).toBeCloseTo(25);
    expect(far.hero!.gold - g[2]).toBeCloseTo(0);
    expect(a.hero!.xp).toBeCloseTo(45); expect(b.hero!.xp).toBeCloseTo(45); expect(far.hero!.xp).toBe(0);
    expect(a.hero!.lastHits).toBe(1);
  });
});

describe('hero kills', () => {
  it('pays kill gold, streak bounty, assists, xp and applies death penalty', () => {
    const w = makeWorld();
    const killer = createHero(w, 'testhero', Team.Radiant, false);
    const helper = createHero(w, 'testhero', Team.Radiant, false);
    const victim = createHero(w, 'testhero', Team.Dire, false);
    place(killer, 1500, 5000); place(helper, 1500, 6800); place(victim, 1500, 4900);
    giveXp(w, victim, 800);
    victim.hero!.streak = 3;
    victim.hero!.gold = 1000;
    applyDamage(w, { source: helper, target: victim, amount: 10, type: 'pure', isAttack: false });
    const g0 = killer.hero!.gold, h0 = helper.hero!.gold;
    killUnit(w, victim, killer);
    expect(killer.hero!.gold - g0).toBeCloseTo(125 + 8 * 5 + 60);
    expect(killer.hero!.kills).toBe(1);
    expect(helper.hero!.assists).toBe(1);
    expect(helper.hero!.gold - h0).toBeCloseTo(40 + 0.03 * 1000);
    expect(victim.hero!.gold).toBe(1000 - 75);
    expect(victim.hero!.deaths).toBe(1); expect(victim.hero!.streak).toBe(0);
    expect(killer.hero!.xp).toBeGreaterThan(0);
    expect(w.teams[Team.Radiant].kills).toBe(1);
  });
  it('credits the last damaging hero when a tower gets the kill', () => {
    const w = makeWorld();
    const hero = createHero(w, 'testhero', Team.Radiant, false);
    const victim = createHero(w, 'testhero', Team.Dire, false);
    const tower = spawnDummy(w, { kind: 'building', team: Team.Radiant });
    place(hero, 1500, 5000); place(victim, 1500, 4900);
    applyDamage(w, { source: hero, target: victim, amount: 10, type: 'pure', isAttack: false });
    killUnit(w, victim, tower);
    expect(hero.hero!.kills).toBe(1);
  });
});

describe('building gold', () => {
  it('gives team gold and last-hit gold', () => {
    const w = makeWorld(); const b = createBuildings(w);
    const a = createHero(w, 'testhero', Team.Radiant, false);
    const c = createHero(w, 'testhero', Team.Radiant, false);
    const ga = a.hero!.gold, gc = c.hero!.gold;
    killUnit(w, b[Team.Dire].t1, a);
    expect(a.hero!.gold - ga).toBeCloseTo(100 + 150);
    expect(c.hero!.gold - gc).toBeCloseTo(100);
  });
});
