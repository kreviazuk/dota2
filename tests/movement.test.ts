import { describe, it, expect } from 'vitest';
import { makeWorld, spawnDummy, runFor } from './helpers';
import { addModifier } from '../src/sim/modifiers';
import { dist } from '../src/sim/core/vec2';
import { MAP } from '../src/sim/data/map';
import { Team } from '../src/sim/core/types';

describe('movement', () => {
  it('moves along joystick direction at move speed', () => {
    const w = makeWorld(); const u = spawnDummy(w, { pos: { x: 1500, y: 5000 } });
    w.issue(u.id, { type: 'move', dir: { x: 0, y: -1 } });
    runFor(w, 1);
    expect(u.pos.y).toBeCloseTo(4700, -1);
  });
  it('stunned and rooted units do not move', () => {
    const w = makeWorld();
    const a = spawnDummy(w, { pos: { x: 1300, y: 5000 } });
    const b = spawnDummy(w, { pos: { x: 1700, y: 5000 } });
    addModifier(w, a, { id: 's', debuff: true, states: ['stunned'] }, { duration: 5 });
    addModifier(w, b, { id: 'r', debuff: true, states: ['rooted'] }, { duration: 5 });
    w.issue(a.id, { type: 'move', dir: { x: 0, y: -1 } });
    w.issue(b.id, { type: 'move', dir: { x: 0, y: -1 } });
    runFor(w, 1);
    expect(a.pos.y).toBe(5000); expect(b.pos.y).toBe(5000);
  });
  it('stays inside the lane', () => {
    const w = makeWorld(); const u = spawnDummy(w, { pos: { x: 1500, y: 5000 } });
    w.issue(u.id, { type: 'move', dir: { x: -1, y: 0 } });
    runFor(w, 5);
    expect(u.pos.x).toBeCloseTo(MAP.laneX - MAP.laneHalfWidth + u.radius);
  });
  it('slows reduce distance travelled', () => {
    const w = makeWorld(); const u = spawnDummy(w, { pos: { x: 1500, y: 5000 } });
    addModifier(w, u, { id: 'slow', debuff: true, stats: { moveSpeedPct: -0.5 } }, { duration: 5 });
    w.issue(u.id, { type: 'move', dir: { x: 0, y: -1 } });
    runFor(w, 1);
    expect(u.pos.y).toBeCloseTo(4850, -1);
  });
  it('moveTo stops at the destination', () => {
    const w = makeWorld(); const u = spawnDummy(w, { pos: { x: 1500, y: 5000 } });
    w.issue(u.id, { type: 'moveTo', point: { x: 1500, y: 4800 } });
    runFor(w, 2);
    expect(dist(u.pos, { x: 1500, y: 4800 })).toBeLessThan(5);
    expect(u.order.kind).toBe('moveTo');
  });
  it('overlapping units are pushed apart', () => {
    const w = makeWorld();
    const a = spawnDummy(w, { pos: { x: 1500, y: 5000 } });
    const b = spawnDummy(w, { pos: { x: 1505, y: 5000 } });
    runFor(w, 1);
    expect(dist(a.pos, b.pos)).toBeGreaterThan(36);
  });
  it('walks around buildings instead of through them', () => {
    const w = makeWorld();
    const tower = spawnDummy(w, { kind: 'building', team: Team.Dire, pos: { x: 1500, y: 5200 }, radius: 90, base: { moveSpeed: 0 } });
    const u = spawnDummy(w, { pos: { x: 1500, y: 5400 } });
    w.issue(u.id, { type: 'moveTo', point: { x: 1500, y: 4900 } });
    let minGap = Infinity;
    for (let i = 0; i < 150; i++) { w.step(); minGap = Math.min(minGap, dist(u.pos, tower.pos) - 110); }
    expect(minGap).toBeGreaterThan(-1);
    expect(dist(u.pos, { x: 1500, y: 4900 })).toBeLessThan(10);
  });
  it('feared units run away from the source', () => {
    const w = makeWorld();
    const src = spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 4900 } });
    const u = spawnDummy(w, { pos: { x: 1500, y: 5000 } });
    addModifier(w, u, { id: 'fear', debuff: true, fear: true }, { duration: 1, sourceId: src.id });
    runFor(w, 0.5);
    expect(u.pos.y).toBeGreaterThan(5100);
  });
});
