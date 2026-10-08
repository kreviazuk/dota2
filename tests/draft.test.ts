import { describe, it, expect } from 'vitest';
import { Rng } from '../src/sim/core/rng';
import { draftTeams, HARD_DISABLE_HEROES, STRENGTH_HEROES } from '../src/game/draft';
import { availableHeroes, HERO_ROSTER } from '../src/game/roster';

const ALL = HERO_ROSTER.map((e) => e.id);
const FAKE = Array.from({ length: 10 }, (_, i) => `fake${i}`);
const unique = (xs: string[]) => new Set(xs).size === xs.length;

describe('hero draft', () => {
  it('keeps the player hero in radiant slot 0', () => {
    for (let s = 1; s <= 50; s++) {
      const d = draftTeams(new Rng(s), ALL, 'zeus');
      expect(d.radiant[0]).toBe('zeus');
      expect(d.radiant).toHaveLength(3);
      expect(d.dire).toHaveLength(3);
    }
  });

  it('no duplicates within a team; duplicates across teams are allowed', () => {
    let crossDup = 0;
    for (let s = 1; s <= 200; s++) {
      const d = draftTeams(new Rng(s), FAKE, s % 2 ? 'fake3' : undefined);
      expect(unique(d.radiant)).toBe(true);
      expect(unique(d.dire)).toBe(true);
      for (const id of [...d.radiant, ...d.dire]) expect(FAKE).toContain(id);
      if (d.radiant.some((id) => d.dire.includes(id))) crossDup++;
    }
    expect(crossDup).toBeGreaterThan(0);
  });

  it('each team gets a strength hero and a hard-disable hero when the pool allows', () => {
    for (let s = 1; s <= 200; s++) {
      for (const player of [undefined, 'zeus', 'drow_ranger', 'lina']) {
        const d = draftTeams(new Rng(s), ALL, player);
        for (const team of [d.radiant, d.dire]) {
          expect(team.some((id) => STRENGTH_HEROES.includes(id))).toBe(true);
          expect(team.some((id) => HARD_DISABLE_HEROES.includes(id))).toBe(true);
          expect(unique(team)).toBe(true);
        }
      }
    }
    // 池子里没有力量英雄时照常补齐
    const d = draftTeams(new Rng(7), ['zeus', 'lina', 'drow_ranger', 'juggernaut']);
    expect(unique(d.radiant) && unique(d.dire)).toBe(true);
    expect(d.radiant.some((id) => HARD_DISABLE_HEROES.includes(id))).toBe(true);
  });

  it('falls back to duplicates when fewer than 3 heroes are available', () => {
    expect(draftTeams(new Rng(1), ['axe'])).toEqual({ radiant: ['axe', 'axe', 'axe'], dire: ['axe', 'axe', 'axe'] });
    expect(draftTeams(new Rng(1), ['axe'], 'axe').radiant).toEqual(['axe', 'axe', 'axe']);
    const d = draftTeams(new Rng(3), ['axe', 'zeus']);
    for (const team of [d.radiant, d.dire]) {
      expect(team).toHaveLength(3);
      expect(new Set(team)).toEqual(new Set(['axe', 'zeus']));
    }
  });

  it('is deterministic for the same rng seed', () => {
    for (let s = 1; s <= 20; s++) expect(draftTeams(new Rng(s), ALL, 'pudge')).toEqual(draftTeams(new Rng(s), ALL, 'pudge'));
    const seen = new Set<string>();
    for (let s = 1; s <= 20; s++) seen.add(JSON.stringify(draftTeams(new Rng(s), ALL)));
    expect(seen.size).toBeGreaterThan(1);
  });

  it('roster lists all 10 heroes and only registered ones are available', () => {
    expect(ALL).toEqual(['axe', 'sven', 'pudge', 'juggernaut', 'phantom_assassin', 'drow_ranger', 'shadow_fiend', 'lina', 'zeus', 'crystal_maiden']);
    expect(availableHeroes()).toContain('axe');
    for (const id of availableHeroes()) expect(ALL).toContain(id);
  });
});
