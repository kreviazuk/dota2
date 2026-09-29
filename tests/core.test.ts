import { describe, it, expect } from 'vitest';
import { Rng } from '../src/sim/core/rng';
import { vec, dist, normalize, moveToward, distToSegment, rotate } from '../src/sim/core/vec2';
import { EventBus } from '../src/sim/core/events';
import { Team, enemyTeam } from '../src/sim/core/types';
import { DT, TICK_RATE } from '../src/sim/core/constants';

describe('Rng', () => {
  it('is deterministic for the same seed', () => {
    const a = new Rng(42), b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
  it('produces values in [0,1)', () => {
    const r = new Rng(7);
    for (let i = 0; i < 1000; i++) { const x = r.next(); expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(1); }
  });
  it('int is inclusive on both ends', () => {
    const r = new Rng(1); const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(r.int(1, 3));
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });
  it('seed 0 does not get stuck', () => {
    const r = new Rng(0); expect(r.next()).not.toBe(r.next());
  });
});

describe('vec2', () => {
  it('dist and normalize', () => {
    expect(dist(vec(0, 0), vec(3, 4))).toBe(5);
    const n = normalize(vec(10, 0)); expect(n.x).toBe(1); expect(n.y).toBe(0);
    expect(normalize(vec(0, 0))).toEqual({ x: 0, y: 0 });
  });
  it('moveToward does not overshoot', () => {
    expect(moveToward(vec(0, 0), vec(10, 0), 3)).toEqual({ x: 3, y: 0 });
    expect(moveToward(vec(0, 0), vec(2, 0), 3)).toEqual({ x: 2, y: 0 });
  });
  it('distToSegment', () => {
    expect(distToSegment(vec(5, 5), vec(0, 0), vec(10, 0))).toBe(5);
    expect(distToSegment(vec(-3, 4), vec(0, 0), vec(10, 0))).toBe(5);
  });
  it('rotate 90 degrees', () => {
    const r = rotate(vec(1, 0), Math.PI / 2);
    expect(r.x).toBeCloseTo(0); expect(r.y).toBeCloseTo(1);
  });
});

describe('events & constants', () => {
  it('drain returns and clears', () => {
    const bus = new EventBus(true);
    bus.emit({ type: 'wave', team: Team.Radiant, index: 0 });
    expect(bus.drain()).toHaveLength(1);
    expect(bus.drain()).toHaveLength(0);
  });
  it('disabled bus drops events', () => {
    const bus = new EventBus(false);
    bus.emit({ type: 'wave', team: Team.Radiant, index: 0 });
    expect(bus.drain()).toHaveLength(0);
  });
  it('enemyTeam and tick', () => {
    expect(enemyTeam(Team.Radiant)).toBe(Team.Dire);
    expect(TICK_RATE).toBe(30); expect(DT).toBeCloseTo(1 / 30);
  });
});
