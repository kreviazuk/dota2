import { describe, it, expect } from 'vitest';
import { Camera, VIEW_WORLD_HEIGHT } from '../src/render/camera';
import { Team } from '../src/sim/core/types';

describe('Camera', () => {
  it('scales so the screen height shows 1400 world units', () => {
    const c = new Camera(); c.resize(1600, 800, 2);
    expect(c.scale).toBeCloseTo(800 / VIEW_WORLD_HEIGHT);
    expect(c.worldH).toBeCloseTo(1400);
  });
  it('looks ahead toward the enemy base', () => {
    const c = new Camera(); c.resize(1600, 800, 1);
    c.follow({ x: 1500, y: 6000 }, Team.Radiant, 0, true);
    expect(c.y).toBeCloseTo(6000 - 1400 * 0.2);
    c.follow({ x: 1500, y: 4000 }, Team.Dire, 0, true);
    expect(c.y).toBeCloseTo(4000 + 1400 * 0.2);
  });
  it('worldToScreen and screenToWorld are inverse', () => {
    const c = new Camera(); c.resize(1600, 800, 1);
    c.follow({ x: 1500, y: 5000 }, Team.Radiant, 0, true);
    const w = c.screenToWorld(c.worldToScreen({ x: 1234, y: 4567 }));
    expect(w.x).toBeCloseTo(1234); expect(w.y).toBeCloseTo(4567);
  });
});

describe('Camera uiScale', () => {
  it('enlarges bars and floating text on short landscape phone screens only', () => {
    const c = new Camera();
    c.resize(1600, 800, 1);
    expect(c.uiScale).toBe(1);
    c.resize(844, 390, 2);
    expect(c.uiScale).toBeCloseTo(720 / 390);
    c.resize(640, 300, 2);
    expect(c.uiScale).toBe(2);
  });
});
