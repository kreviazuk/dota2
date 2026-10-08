import { describe, it, expect } from 'vitest';
import { Match } from '../src/game/match';
import { Team } from '../src/sim/core/types';

const cfg = (seed: number) => ({
  seed, radiantHeroes: ['axe', 'axe', 'axe'], direHeroes: ['axe', 'axe', 'axe'], playerSlot: null, difficulty: 'normal' as const,
});

const snapshot = (m: Match) =>
  JSON.stringify(m.world.units.map((u) => [u.id, Math.round(u.pos.x * 100), Math.round(u.pos.y * 100), Math.round(u.hp * 100)]));

describe('match', () => {
  it('sets up 14 buildings and 6 heroes', () => {
    const m = new Match(cfg(1));
    expect(m.world.units.filter((u) => u.kind === 'building')).toHaveLength(14);
    expect(m.world.heroes(Team.Radiant)).toHaveLength(3);
    expect(m.world.heroes(Team.Dire)).toHaveLength(3);
    expect(m.ais).toHaveLength(6);
  });
  it('player slot is excluded from AI control', () => {
    const m = new Match({ ...cfg(1), playerSlot: 0 });
    expect(m.ais).toHaveLength(5);
    expect(m.world.getUnit(m.playerUnitId!)?.hero?.playerControlled).toBe(true);
  });
  it('is deterministic for the same seed', () => {
    const a = new Match(cfg(7)), b = new Match(cfg(7));
    for (let i = 0; i < 3000; i++) { a.step(); b.step(); }
    expect(snapshot(a)).toBe(snapshot(b));
  }, 30_000);
  it('runs 10 minutes of AI vs AI without breaking', () => {
    const m = new Match(cfg(3));
    for (let i = 0; i < 30 * 600 && !m.over; i++) m.step();
    const heroes = m.world.heroes();
    for (const h of heroes) {
      expect(Number.isFinite(h.hp)).toBe(true);
      expect(Number.isFinite(h.pos.x) && Number.isFinite(h.pos.y)).toBe(true);
    }
    expect(heroes.some((h) => h.hero!.level >= 6)).toBe(true);
    expect(heroes.every((h) => h.hero!.gold >= 0)).toBe(true);
  }, 60_000);
  it('mixed lineups are deterministic for the same seed', () => {
    const mixed = (seed: number) => new Match({
      seed, radiantHeroes: ['sven', 'lina', 'pudge'], direHeroes: ['zeus', 'crystal_maiden', 'phantom_assassin'],
      playerSlot: null, difficulty: 'normal',
    });
    const a = mixed(11), b = mixed(11);
    for (let i = 0; i < 3000; i++) { a.step(); b.step(); }
    expect(snapshot(a)).toBe(snapshot(b));
  }, 120_000);
  it('10 minutes of AI vs AI with every hero stays finite', () => {
    const lineups: [string[], string[]][] = [
      [['axe', 'sven', 'pudge'], ['juggernaut', 'phantom_assassin', 'drow_ranger']],
      [['shadow_fiend', 'lina', 'zeus'], ['crystal_maiden', 'axe', 'sven']],
    ];
    const seen = new Set<string>();
    for (const [radiantHeroes, direHeroes] of lineups) {
      const m = new Match({ seed: 5, radiantHeroes, direHeroes, playerSlot: null, difficulty: 'normal' });
      for (let i = 0; i < 30 * 600 && !m.over; i++) m.step();
      const heroes = m.world.heroes();
      for (const h of heroes) {
        seen.add(h.defId);
        expect(Number.isFinite(h.hp)).toBe(true);
        expect(Number.isFinite(h.pos.x) && Number.isFinite(h.pos.y)).toBe(true);
      }
      expect(heroes.some((h) => h.hero!.level >= 6)).toBe(true);
      expect(heroes.every((h) => h.hero!.gold >= 0)).toBe(true);
    }
    expect(seen.size).toBe(10);
  }, 120_000);
});
