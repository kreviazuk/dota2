import { describe, it, expect } from 'vitest';
import { makeWorld, spawnDummy } from './helpers';
import { createHero } from '../src/sim/systems/heroes';
import { Team } from '../src/sim/core/types';
import { isKillable, killMarkerFor } from '../src/render/unitDraw';
import { LruCache, MAP_TILE, tileRect, visibleTiles } from '../src/render/mapLayer';

describe('Culling Blade kill marker', () => {
  it('appears once Culling Blade is learned and follows its level and talents', () => {
    const w = makeWorld();
    const axe = createHero(w, 'axe', Team.Radiant, true);
    w.step();
    expect(killMarkerFor(w, axe)).toBeNull();
    expect(killMarkerFor(w, undefined)).toBeNull();
    const r = axe.ability('R')!;
    r.level = 1;
    expect(killMarkerFor(w, axe)).toEqual({ threshold: 275, ready: true });
    r.level = 3;
    axe.hero!.talentValueBonus['axe_culling_blade.damage'] = 150;
    expect(killMarkerFor(w, axe)?.threshold).toBe(625);
  });

  it('is dimmed while Culling Blade cannot be cast', () => {
    const w = makeWorld();
    const axe = createHero(w, 'axe', Team.Radiant, true);
    w.step();
    const r = axe.ability('R')!;
    r.level = 1;
    r.cooldown = 10;
    expect(killMarkerFor(w, axe)?.ready).toBe(false);
    r.cooldown = 0;
    axe.mana = 50;
    expect(killMarkerFor(w, axe)?.ready).toBe(false);
    axe.mana = 500;
    expect(killMarkerFor(w, axe)?.ready).toBe(true);
    axe.baseStates.add('silenced');
    w.step();
    expect(killMarkerFor(w, axe)?.ready).toBe(false);
    axe.baseStates.delete('silenced');
    w.step();
    axe.alive = false;
    expect(killMarkerFor(w, axe)?.ready).toBe(false);
  });

  it('marks only living, targetable enemy heroes under the threshold', () => {
    const w = makeWorld();
    const axe = createHero(w, 'axe', Team.Radiant, true);
    w.step();
    axe.ability('R')!.level = 1;
    const marker = killMarkerFor(w, axe);
    const enemy = spawnDummy(w, { kind: 'hero', team: Team.Dire });
    const ally = spawnDummy(w, { kind: 'hero', team: Team.Radiant });
    const creep = spawnDummy(w, { kind: 'creep', team: Team.Dire });
    enemy.hp = ally.hp = creep.hp = 200;
    expect(isKillable(enemy, marker, Team.Radiant)).toBe(true);
    expect(isKillable(ally, marker, Team.Radiant)).toBe(false);
    expect(isKillable(creep, marker, Team.Radiant)).toBe(false);
    expect(isKillable(enemy, null, Team.Radiant)).toBe(false);
    enemy.hp = 276;
    expect(isKillable(enemy, marker, Team.Radiant)).toBe(false);
    enemy.hp = 275;
    expect(isKillable(enemy, marker, Team.Radiant)).toBe(true);
    enemy.baseStates.add('invulnerable');
    w.step();
    enemy.hp = 200;
    expect(isKillable(enemy, marker, Team.Radiant)).toBe(false);
    enemy.baseStates.delete('invulnerable');
    enemy.baseStates.add('untargetable');
    w.step();
    enemy.hp = 200;
    expect(isKillable(enemy, marker, Team.Radiant)).toBe(false);
    enemy.baseStates.delete('untargetable');
    w.step();
    enemy.hp = 200;
    expect(isKillable(enemy, marker, Team.Radiant)).toBe(true);
    enemy.alive = false;
    expect(isKillable(enemy, marker, Team.Radiant)).toBe(false);
  });
});

describe('map tiles', () => {
  it('visibleTiles covers every canvas pixel and tileRect tiles the canvas without gaps or overlaps', () => {
    for (const [k, tx, ty, w, h] of [[0.589, -55.3, -3710.8, 1830, 824], [1.03, 123.4, -9000.2, 2560, 1440], [0.514, 0.5, 0, 1280, 720]]) {
      const v = visibleTiles(k, tx, ty, w, h);
      const xs: number[] = [];
      for (let ix = v.ix0; ix <= v.ix1; ix++) {
        const r = tileRect(ix, 0, k, tx, ty);
        xs.push(r.x, r.x + r.w);
        expect(r.w).toBeLessThanOrEqual(Math.ceil(MAP_TILE * k) + 1);
      }
      // 相邻图块首尾相接，并且覆盖 [0, w)
      for (let i = 1; i + 1 < xs.length; i += 2) expect(xs[i]).toBe(xs[i + 1]);
      expect(xs[0]).toBeLessThanOrEqual(0);
      expect(xs[xs.length - 1]).toBeGreaterThanOrEqual(w);
      const top = tileRect(0, v.iy0, k, tx, ty);
      const bottom = tileRect(0, v.iy1, k, tx, ty);
      expect(top.y).toBeLessThanOrEqual(0);
      expect(bottom.y + bottom.h).toBeGreaterThanOrEqual(h);
    }
  });

  it('LruCache evicts the least recently used entries first', () => {
    const c = new LruCache<number, string>();
    c.set(1, 'a'); c.set(2, 'b'); c.set(3, 'c');
    expect(c.get(1)).toBe('a');
    expect(c.trim(2)).toEqual(['b']);
    expect(c.has(2)).toBe(false);
    c.set(4, 'd');
    expect(c.trim(2)).toEqual(['c']);
    expect(c.size).toBe(2);
    expect(c.clear().sort()).toEqual(['a', 'd']);
    expect(c.size).toBe(0);
  });
});
