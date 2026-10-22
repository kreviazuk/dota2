import { describe, it, expect, vi } from 'vitest';
import {
  buildEliteRig,
  poseElite,
  eliteScale,
  eliteHeadHeight,
} from '../../src/render3d/models/elites';
import { isEliteType } from '../../src/render3d/models/creeps';
import { AnimTracker } from '../../src/render3d/anim';
import { lookupFx, projectileStyle } from '../../src/render3d/fx/registry';
import '../../src/render3d/fx/index';
import { lookupFx2D, lookupProjectile2D } from '../../src/render/fx2d';
import { drawElite2D, drawBars } from '../../src/render/unitDraw';
import { makeWorld } from '../helpers';
import { spawnElite } from '../../src/sim/entities/elites';
import { spawnRoshan } from '../../src/sim/entities/roshan';
import { Team } from '../../src/sim/core/types';

describe('Elite & Roshan 3D models and rigs', () => {
  const eliteTypes = [
    'centaur_conqueror',
    'alpha_wolf',
    'satyr_hellcaller',
    'ancient_black_dragon',
    'ancient_rock_golem',
    'golem_shard',
    'roshan',
  ];

  it('identifies elite types properly with isEliteType', () => {
    for (const t of eliteTypes) {
      expect(isEliteType(t)).toBe(true);
    }
    expect(isEliteType('melee')).toBe(false);
    expect(isEliteType('ranged')).toBe(false);
    expect(isEliteType('siege')).toBe(false);
  });

  it('builds rigs with expected parts for all elite types and roshan', () => {
    for (const type of eliteTypes) {
      const rig = buildEliteRig(type);
      expect(rig.root).toBeDefined();
      expect(rig.body).toBeDefined();
      expect(rig.type).toBe(type);
      expect(rig.parts.length).toBeGreaterThan(0);

      expect(eliteScale(type)).toBeGreaterThan(0);
      expect(eliteHeadHeight(type)).toBeGreaterThan(0);
    }
  });

  it('poses elite rigs through all animation states without errors', () => {
    for (const type of eliteTypes) {
      const rig = buildEliteRig(type);
      const tracker = new AnimTracker();
      for (const state of ['idle', 'run', 'attack', 'dead'] as const) {
        tracker.state = state;
        tracker.runPhase = 1.2;
        tracker.speed = 300;
        if (state === 'attack') tracker.swing = 0.5;
        if (state === 'dead') tracker.deadTime = 0.4;
        expect(() => {
          poseElite(rig, tracker, 0.5);
        }).not.toThrow();
      }
    }
  });
});

describe('Elite & Roshan FX registrations', () => {
  it('registers 3D fx and projectiles', () => {
    expect(projectileStyle('satyr_shockwave')).toBeDefined();
    expect(lookupFx('centaur_war_stomp')).toBeDefined();
    expect(lookupFx('satyr_shockwave')).toBeDefined();
    expect(lookupFx('dragon_fireball')).toBeDefined();
    expect(lookupFx('roshan_slam')).toBeDefined();
    expect(lookupFx('roshan_spawn')).toBeDefined();
    expect(lookupFx('roshan_death')).toBeDefined();
  });

  it('registers 2D fx and projectiles', () => {
    expect(lookupProjectile2D('satyr_shockwave')).toBeDefined();
    expect(lookupFx2D('centaur_war_stomp')).toBeDefined();
    expect(lookupFx2D('satyr_shockwave')).toBeDefined();
    expect(lookupFx2D('dragon_fireball')).toBeDefined();
    expect(lookupFx2D('roshan_slam')).toBeDefined();
    expect(lookupFx2D('roshan_spawn')).toBeDefined();
    expect(lookupFx2D('roshan_death')).toBeDefined();
  });
});

describe('Elite & Roshan 2D canvas drawing', () => {
  function makeMockCtx() {
    return {
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      ellipse: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      setLineDash: vi.fn(),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
    } as unknown as CanvasRenderingContext2D;
  }

  it('draws 2D representations of all elites and roshan without throwing', () => {
    const w = makeWorld();
    const ctx = makeMockCtx();

    // Elites
    const centaur = spawnElite(w, Team.Radiant, 'centaur_conqueror', { x: 0, y: 0 });
    const wolf = spawnElite(w, Team.Radiant, 'alpha_wolf', { x: 0, y: 0 });
    const satyr = spawnElite(w, Team.Radiant, 'satyr_hellcaller', { x: 0, y: 0 });
    const dragon = spawnElite(w, Team.Radiant, 'ancient_black_dragon', { x: 0, y: 0 });
    const golem = spawnElite(w, Team.Radiant, 'ancient_rock_golem', { x: 0, y: 0 });
    const shard = spawnElite(w, Team.Radiant, 'golem_shard', { x: 0, y: 0 });
    const roshan = spawnRoshan(w);

    const units = [centaur, wolf, satyr, dragon, golem, shard, roshan];
    for (const u of units) {
      expect(() => drawElite2D(ctx, u, 100, 100, 1.0)).not.toThrow();
      expect(() => drawBars(ctx, u, 100, 100, false, Team.Radiant, {})).not.toThrow();
    }
  });
});
