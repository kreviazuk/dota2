import { describe, it, expect } from 'vitest';
import { makeWorld, spawnDummy } from './helpers';
import { createHero } from '../src/sim/systems/heroes';
import { Team } from '../src/sim/core/types';
import { isKillable, killMarkerFor } from '../src/render/unitDraw';

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
