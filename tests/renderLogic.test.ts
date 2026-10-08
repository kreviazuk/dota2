import { describe, it, expect } from 'vitest';
import { makeWorld, spawnDummy } from './helpers';
import { createHero } from '../src/sim/systems/heroes';
import { Team } from '../src/sim/core/types';
import { isKillable, isSlowed, killMarkerFor, shieldSegment, statusIcons2D } from '../src/render/unitDraw';
import { HERO_LOOKS } from '../src/render/heroVisuals';
import { allHeroIds } from '../src/sim/heroes';
import { lookupFx, registerFx, lookupModifierVisual, projectileStyle, registerProjectileStyle } from '../src/render3d/fx/registry';
import '../src/render3d/fx/common';
import { lookupFx2D, lookupModifier2D, lookupProjectile2D, registerFx2D, registerProjectile2D } from '../src/render/fx2d';
import { applyControl, applyFear, applySlow } from '../src/sim/status';
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

describe('2D looks, shield bar and status markers', () => {
  it('every registered hero has a 2D look', () => {
    for (const id of allHeroIds()) expect(HERO_LOOKS[id]).toBeDefined();
    // 10 名英雄都有（选人界面的头像也用它）
    expect(Object.keys(HERO_LOOKS).sort()).toEqual(
      ['axe', 'crystal_maiden', 'drow_ranger', 'juggernaut', 'lina', 'phantom_assassin', 'pudge', 'shadow_fiend', 'sven', 'zeus'],
    );
  });

  it('shieldSegment starts at current hp and is clipped to the bar', () => {
    expect(shieldSegment(500, 1000, 200)).toEqual({ from: 0.5, to: 0.7 });
    expect(shieldSegment(900, 1000, 300)).toEqual({ from: 0.9, to: 1 });
    expect(shieldSegment(1000, 1000, 300)).toEqual({ from: 1, to: 1 });
    expect(shieldSegment(400, 1000, 0)).toEqual({ from: 0.4, to: 0.4 });
    expect(shieldSegment(-5, 1000, 100)).toEqual({ from: 0, to: 0.1 });
  });

  it('fx registries fall back to defaults for unknown kinds', () => {
    expect(lookupFx('no_such_fx')).toBeUndefined();
    expect(lookupFx2D('no_such_fx')).toBeUndefined();
    expect(projectileStyle('hero:no_such_hero')).toBeUndefined();
    expect(lookupProjectile2D('hero:no_such_hero')).toBeUndefined();
    expect(lookupModifierVisual('no_such_modifier')).toBeUndefined();
    // 通用的闪烁、分裂已经注册（3D 和 2D）
    for (const k of ['blink', 'cleave']) {
      expect(lookupFx(k)).toBeTypeOf('function');
      expect(lookupFx2D(k)).toBeTypeOf('function');
    }
    const h = () => {};
    registerFx('test_fx', h);
    registerFx2D('test_fx', h);
    expect(lookupFx('test_fx')).toBe(h);
    expect(lookupFx2D('test_fx')).toBe(h);
    registerProjectileStyle('test_proj', { mesh: 'arrow', color: 0xffffff, size: 20 });
    registerProjectile2D('test_proj', { color: '#fff', size: 6 });
    expect(projectileStyle('test_proj')?.mesh).toBe('arrow');
    expect(lookupProjectile2D('test_proj')?.size).toBe(6);
  });

  it('Sven has 2D effects for every fx event, its hammer and its buffs', () => {
    for (const k of ['sven_storm_hammer', 'sven_hammer_hit', 'sven_warcry', 'sven_gods_strength']) expect(lookupFx2D(k)).toBeTypeOf('function');
    expect(lookupProjectile2D('sven_hammer')?.color).toBe('#7cc8ff');
    for (const k of ['sven_warcry', 'sven_gods_strength']) expect(lookupModifier2D(k)).toBeTypeOf('function');
    expect(lookupModifier2D('no_such_modifier')).toBeUndefined();
    expect(HERO_LOOKS.sven).toMatchObject({ body: '#2f4f8f', trim: '#c9d3e2', skin: '#8fa0b5', initial: '斯', weapon: 'greatsword' });
  });

  it('status markers follow control states, fear and slows', () => {
    const w = makeWorld();
    const src = spawnDummy(w, { kind: 'hero', team: Team.Radiant });
    const t = spawnDummy(w, { kind: 'hero', team: Team.Dire });
    w.step();
    expect(statusIcons2D(t)).toEqual([]);
    expect(isSlowed(t)).toBe(false);
    applyControl(w, t, 'stun', { source: src, duration: 2 });
    applyControl(w, t, 'silence', { source: src, duration: 2 });
    applyControl(w, t, 'disarm', { source: src, duration: 2 });
    applyControl(w, t, 'break', { source: src, duration: 2 });
    applyFear(w, t, { source: src, duration: 2 });
    w.step();
    expect(statusIcons2D(t)).toEqual(['stun', 'silence', 'disarm', 'break', 'fear']);
    applySlow(w, t, { source: src, duration: 2, key: 'test', moveSlow: 0.3 });
    expect(isSlowed(t)).toBe(true);
    // 只削魔抗的"减速"不算减速
    const u = spawnDummy(w, { kind: 'hero', team: Team.Dire });
    applySlow(w, u, { source: src, duration: 2, key: 'mr', magicResist: -0.1 });
    expect(isSlowed(u)).toBe(false);
  });
});
