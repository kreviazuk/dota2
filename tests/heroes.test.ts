import { describe, it, expect } from 'vitest';
import './testHero';
import { makeWorld, spawnDummy, runFor } from './helpers';
import { createHero } from '../src/sim/systems/heroes';
import { giveXp, learnAbility } from '../src/sim/systems/progress';
import { applyDamage, killUnit } from '../src/sim/systems/damage';
import { layoutFor } from '../src/sim/data/map';
import { dist } from '../src/sim/core/vec2';
import { addModifier } from '../src/sim/modifiers';
import { Team } from '../src/sim/core/types';
import { launchAttack } from '../src/sim/systems/attack';

describe('heroes', () => {
  it('spawns at the fountain with full hp and starting gold', () => {
    const w = makeWorld(); const h = createHero(w, 'testhero', Team.Radiant, true);
    expect(dist(h.pos, layoutFor(Team.Radiant).fountain)).toBeLessThan(300);
    expect(h.stats.maxHp).toBe(120 + 22 * 20); expect(h.hp).toBe(h.stats.maxHp);
    expect(h.hero!.gold).toBe(600); expect(h.hero!.level).toBe(1); expect(h.hero!.skillPoints).toBe(1);
    expect(h.abilities.map((a) => a.level)).toEqual([0, 0, 0, 0]);
  });
  it('earns passive gold', () => {
    const w = makeWorld(); const h = createHero(w, 'testhero', Team.Radiant, false);
    runFor(w, 60);
    expect(h.hero!.gold).toBeCloseTo(750, 0);
  });
  it('levels up from xp using the scaled table', () => {
    const w = makeWorld(); const h = createHero(w, 'testhero', Team.Radiant, false);
    giveXp(w, h, 976);
    expect(h.hero!.level).toBe(6); expect(h.hero!.skillPoints).toBe(6);
    giveXp(w, h, 1e9);
    expect(h.hero!.level).toBe(25);
  });
  it('enforces skill level requirements', () => {
    const w = makeWorld(); const h = createHero(w, 'testhero', Team.Radiant, false);
    expect(learnAbility(w, h, 'R')).toBe(false);
    expect(learnAbility(w, h, 'Q')).toBe(true);
    giveXp(w, h, 1);
    expect(learnAbility(w, h, 'Q')).toBe(false);
    giveXp(w, h, 975);
    expect(learnAbility(w, h, 'R')).toBe(true);
    expect(learnAbility(w, h, 'Q')).toBe(true);
  });
  it('converts leftover points into attribute bonus once all abilities are maxed', () => {
    const w = makeWorld(); const h = createHero(w, 'testhero', Team.Radiant, false);
    giveXp(w, h, 1e9);
    for (let i = 0; i < 30; i++) for (const s of ['Q', 'W', 'E', 'R'] as const) learnAbility(w, h, s);
    expect(h.abilities.map((a) => a.level)).toEqual([4, 4, 4, 3]);
    expect(h.hero!.skillPoints).toBe(0);
    expect(h.hero!.attributeBonusLevel).toBe(25 - 15);
  });
  it('respawns after the respawn timer at the fountain', () => {
    const w = makeWorld(); const h = createHero(w, 'testhero', Team.Radiant, false);
    giveXp(w, h, 400);
    h.pos = { x: 1500, y: 5000 };
    killUnit(w, h, null);
    expect(h.hero!.respawnTimer).toBe(4 + 2 * h.hero!.level);
    runFor(w, h.hero!.respawnTimer + 0.1);
    expect(h.alive).toBe(true); expect(h.hp).toBe(h.stats.maxHp);
    expect(dist(h.pos, layoutFor(Team.Radiant).fountain)).toBeLessThan(300);
  });
  it('recall teleports home after 5s and is interrupted by damage', () => {
    const w = makeWorld(); const h = createHero(w, 'testhero', Team.Radiant, false);
    h.pos = { x: 1500, y: 5000 };
    w.issue(h.id, { type: 'recall' });
    runFor(w, 2);
    applyDamage(w, { source: null, target: h, amount: 10, type: 'pure', isAttack: false });
    runFor(w, 4);
    expect(h.pos.y).toBe(5000);
    w.issue(h.id, { type: 'recall' });
    runFor(w, 5.1);
    expect(dist(h.pos, layoutFor(Team.Radiant).fountain)).toBeLessThan(300);
  });
  it('recall is interrupted by damage stamped at the issue tick', () => {
    const w = makeWorld(); const h = createHero(w, 'testhero', Team.Radiant, false);
    h.pos = { x: 1500, y: 5000 };
    w.issue(h.id, { type: 'recall' });
    w.step();
    h.hero!.lastDamagedTime = (h.order as { startedAt: number }).startedAt;
    w.step();
    expect(h.order.kind).toBe('idle');
  });
  it('recall is cancelled by a stun', () => {
    const w = makeWorld(); const h = createHero(w, 'testhero', Team.Radiant, false);
    h.pos = { x: 1500, y: 5000 };
    w.issue(h.id, { type: 'recall' });
    w.step();
    addModifier(w, h, { id: 'stun', debuff: true, states: ['stunned'] }, { duration: 0.5 });
    runFor(w, 0.1);
    expect(h.order.kind).toBe('idle');
  });
  it('recall is cancelled by a move command', () => {
    const w = makeWorld(); const h = createHero(w, 'testhero', Team.Radiant, false);
    h.pos = { x: 1500, y: 5000 };
    w.issue(h.id, { type: 'recall' });
    w.step();
    w.issue(h.id, { type: 'moveTo', point: { x: 1500, y: 4000 } });
    runFor(w, 6);
    expect(dist(h.pos, layoutFor(Team.Radiant).fountain)).toBeGreaterThan(300);
  });
  it('recall teleport dodges homing projectiles already in flight', () => {
    const w = makeWorld(); const h = createHero(w, 'testhero', Team.Radiant, false);
    h.pos = { x: 1500, y: 5000 };
    const shooter = spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 4400 }, base: { attackRange: 700, projectileSpeed: 600 } });
    const bystander = spawnDummy(w, { team: Team.Radiant, pos: { x: 1600, y: 5000 } });
    w.issue(h.id, { type: 'recall' });
    runFor(w, 4.8);
    // 飞行约 1 秒，回城在 0.2 秒后完成
    launchAttack(w, shooter, h);
    launchAttack(w, shooter, bystander);
    expect(w.projectiles.length).toBe(2);
    runFor(w, 0.4);
    expect(dist(h.pos, layoutFor(Team.Radiant).fountain)).toBeLessThan(300);
    expect(w.projectiles.filter((p) => p.targetId === h.id)).toHaveLength(0);
    runFor(w, 2);
    expect(h.hp).toBe(h.stats.maxHp);
    // 不影响飞向其他单位的弹道
    expect(bystander.hp).toBe(1000 - 50);
  });
  it('dummy helper still works alongside heroes', () => {
    const w = makeWorld(); expect(spawnDummy(w).alive).toBe(true);
  });
});
