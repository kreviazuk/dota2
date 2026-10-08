import { describe, it, expect } from 'vitest';
import { makeWorld, spawnDummy, runFor } from './helpers';
import { blinkTo, endMotion, knockback, motionHeight, startMotion, type ForcedMotion } from '../src/sim/systems/motion';
import { newAbilityInstance, resolveTarget, syncPassives } from '../src/sim/systems/abilities';
import { createHero } from '../src/sim/systems/heroes';
import { pickCreepTarget } from '../src/sim/systems/creeps';
import { pickTowerTarget } from '../src/sim/systems/buildings';
import { killUnit } from '../src/sim/systems/damage';
import { addModifier } from '../src/sim/modifiers';
import { canAttack, enemiesInRadius, isDisabled, isHiddenFrom, isTargetableBy } from '../src/sim/query';
import { MAP } from '../src/sim/data/map';
import { Team } from '../src/sim/core/types';
import type { AbilityDef, AbilityInstance } from '../src/sim/heroes/types';
import type { Unit } from '../src/sim/entities/unit';
import type { World } from '../src/sim/world';

function give(w: World, u: Unit, def: AbilityDef, level = 1): AbilityInstance {
  const ab = newAbilityInstance(def);
  ab.level = level;
  u.abilities.push(ab);
  syncPassives(w, u);
  return ab;
}

const HIDDEN = { id: 'hide', states: ['hidden' as const] };

describe('forced motion', () => {
  it('knockback moves the unit over its duration, stays on walkable ground, disables it and interrupts channel and recall', () => {
    const w = makeWorld();
    const u = spawnDummy(w, { kind: 'hero', pos: { x: 1500, y: 5000 } });
    knockback(w, u, null, { x: 0, y: 1 }, 300, 0.5);
    expect(u.motion?.kind).toBe('knockback');
    expect(isDisabled(u)).toBe(true);
    // 期间不能按指令移动
    w.issue(u.id, { type: 'move', dir: { x: 0, y: -1 } });
    runFor(w, 0.2);
    expect(u.pos.y).toBeCloseTo(5120, 0);
    w.issue(u.id, { type: 'move', dir: null });
    runFor(w, 0.3);
    expect(u.motion).toBeNull();
    expect(u.pos.y).toBeCloseTo(5300, 0);
    expect(isDisabled(u)).toBe(false);

    // 撞到车道边缘：停在可行走区域内
    knockback(w, u, null, { x: -1, y: 0 }, 2000, 0.5);
    runFor(w, 0.6);
    expect(u.pos.x).toBeCloseTo(MAP.laneX - MAP.laneHalfWidth + u.radius);

    // 引导被打断
    let ended: boolean | null = null;
    give(w, u, {
      id: 'chan', name: '引导', description: '', slot: 'R', maxLevel: 3, targetType: 'none', castPoint: 0, cooldown: [30], manaCost: [0],
      channelTime: [3], values: {}, onChannelEnd: (_c, interrupted) => { ended = interrupted; },
    });
    w.issue(u.id, { type: 'cast', slot: 'R' });
    runFor(w, 0.2);
    expect(u.cast?.phase).toBe('channel');
    knockback(w, u, null, { x: 1, y: 0 }, 100, 0.3);
    expect(u.cast).toBeNull();
    expect(ended).toBe(true);

    // 回城被打断
    const h = createHero(w, 'axe', Team.Radiant, false);
    h.pos = { x: 1500, y: 6000 };
    w.issue(h.id, { type: 'recall' });
    runFor(w, 1);
    expect(h.order.kind).toBe('recall');
    knockback(w, h, null, { x: 0, y: 1 }, 100, 0.3);
    expect(h.order.kind).toBe('idle');
  });

  it('a new motion interrupts the old one and a non-disabling motion does not disable', () => {
    const w = makeWorld();
    const u = spawnDummy(w, { pos: { x: 1500, y: 5000 } });
    const log: string[] = [];
    startMotion(w, u, { kind: 'leap', sourceId: u.id, to: { x: 1500, y: 4500 }, duration: 1, height: 100, disables: false, onEnd: (_w, _u, i) => log.push(`a${i}`) });
    expect(isDisabled(u)).toBe(false);
    runFor(w, 0.5);
    startMotion(w, u, { kind: 'dash', sourceId: u.id, to: { x: 1500, y: 5000 }, duration: 0.2, height: 0, disables: false, onEnd: (_w, _u, i) => log.push(`b${i}`) });
    expect(log).toEqual(['atrue']);
    runFor(w, 0.3);
    expect(log).toEqual(['atrue', 'bfalse']);
    expect(u.pos.y).toBeCloseTo(5000, 0);
  });

  it('follow motion tracks the callback until it returns null', () => {
    const w = makeWorld();
    const u = spawnDummy(w, { pos: { x: 1500, y: 5000 } });
    let n = 0;
    let endedWith: boolean | null = null;
    startMotion(w, u, {
      kind: 'hook', sourceId: null, to: { x: 1500, y: 5000 }, duration: Infinity, height: 0, disables: true,
      follow: () => (++n <= 10 ? { x: 1500, y: 5000 - n * 20 } : null),
      onEnd: (_w, _u, i) => { endedWith = i; },
    });
    runFor(w, 0.2);
    expect(u.pos.y).toBeCloseTo(5000 - 6 * 20);
    runFor(w, 0.5);
    expect(u.pos.y).toBeCloseTo(5000 - 10 * 20);
    expect(u.motion).toBeNull();
    expect(endedWith).toBe(false);
  });

  it('blinkTo teleports instantly, clamps to walkable ground and emits a blink fx', () => {
    const w = makeWorld();
    const u = spawnDummy(w, { pos: { x: 1500, y: 5000 } });
    w.events.drain();
    blinkTo(w, u, { x: 2500, y: 4600 });
    expect(u.pos.x).toBeCloseTo(MAP.laneX + MAP.laneHalfWidth - u.radius);
    expect(u.pos.y).toBeCloseTo(4600);
    expect(u.prevPos).toEqual(u.pos);
    const fx = w.events.drain().filter((e) => e.type === 'fx' && e.kind === 'blink');
    expect(fx).toHaveLength(1);
    const e = fx[0] as Extract<(typeof fx)[number], { type: 'fx' }>;
    expect(e.pos).toEqual({ x: 1500, y: 5000 });
    expect(e.dir!.x).toBeCloseTo(u.pos.x - 1500);
    expect(e.dir!.y).toBeCloseTo(-400);
    expect(e.unitId).toBe(u.id);
    blinkTo(w, u, { x: 1500, y: 5000 }, { fx: false });
    expect(u.pos).toEqual({ x: 1500, y: 5000 });
    expect(w.events.drain().filter((e) => e.type === 'fx')).toHaveLength(0);
  });

  it('motion ends as interrupted when the unit dies', () => {
    const w = makeWorld();
    const u = spawnDummy(w, { kind: 'hero', pos: { x: 1500, y: 5000 } });
    let endedWith: boolean | null = null;
    startMotion(w, u, { kind: 'knockback', sourceId: null, to: { x: 1500, y: 5400 }, duration: 1, height: 50, disables: true, onEnd: (_w, _u, i) => { endedWith = i; } });
    runFor(w, 0.2);
    killUnit(w, u, null);
    expect(u.motion).toBeNull();
    expect(endedWith).toBe(true);
  });

  it('motionHeight is a parabola that peaks at half time', () => {
    const m: ForcedMotion = {
      kind: 'leap', sourceId: null, from: { x: 0, y: 0 }, to: { x: 0, y: 0 }, duration: 2, elapsed: 0, height: 200, disables: false,
    };
    expect(motionHeight(null)).toBe(0);
    expect(motionHeight(m)).toBeCloseTo(0);
    m.elapsed = 1;
    expect(motionHeight(m)).toBeCloseTo(200);
    m.elapsed = 0.5;
    expect(motionHeight(m)).toBeCloseTo(150);
    m.elapsed = 2;
    expect(motionHeight(m)).toBeCloseTo(0);
    expect(motionHeight({ ...m, elapsed: 1, height: 0 })).toBe(0);
  });

  it('endMotion without a motion is a no-op', () => {
    const w = makeWorld();
    const u = spawnDummy(w);
    expect(() => endMotion(w, u, true)).not.toThrow();
  });
});

describe('world timers', () => {
  it('world.after runs callbacks in time then insertion order, including callbacks scheduled from callbacks', () => {
    const w = makeWorld();
    const log: string[] = [];
    w.after(0.2, () => log.push('b'));
    w.after(0.1, (world) => {
      log.push('a');
      world.after(0.05, () => log.push('a2'));
      world.after(0, () => log.push('a0'));
    });
    w.after(0.2, () => log.push('c'));
    w.after(0, () => log.push('now'));
    w.step();
    expect(log).toEqual(['now']);
    runFor(w, 0.1);
    expect(log).toEqual(['now', 'a', 'a0']);
    runFor(w, 0.2);
    expect(log).toEqual(['now', 'a', 'a0', 'a2', 'b', 'c']);
  });
});

describe('hidden units', () => {
  it('hidden enemies cannot be attacked or targeted but AoE still hits them; allies can still target them', () => {
    const w = makeWorld();
    const me = spawnDummy(w, { kind: 'hero', pos: { x: 1500, y: 5000 } });
    const ally = spawnDummy(w, { kind: 'hero', pos: { x: 1550, y: 5000 } });
    const foe = spawnDummy(w, { kind: 'hero', team: Team.Dire, pos: { x: 1500, y: 4900 }, base: { damageMin: 0, damageMax: 0 } });
    addModifier(w, foe, HIDDEN);
    addModifier(w, ally, HIDDEN);
    expect(isHiddenFrom(foe, Team.Radiant)).toBe(true);
    expect(isHiddenFrom(foe, Team.Dire)).toBe(false);
    expect(canAttack(me, foe)).toBe(false);
    expect(isTargetableBy(me, foe, 'enemy', true)).toBe(false);
    expect(isTargetableBy(me, foe, 'any', true)).toBe(false);
    expect(isTargetableBy(me, ally, 'ally', false)).toBe(true);
    expect(enemiesInRadius(w, Team.Radiant, me.pos, 300).map((u) => u.id)).toContain(foe.id);
    // 智能施法选不到隐藏的敌人
    const nuke = give(w, me, {
      id: 'nuke', name: '单体', description: '', slot: 'Q', maxLevel: 4, targetType: 'unit', targetTeam: 'enemy', castRange: [600],
      castPoint: 0, cooldown: [5], manaCost: [0], values: {},
    });
    expect(resolveTarget(w, me, nuke, {})).toBeNull();
    expect(resolveTarget(w, me, nuke, { unitId: foe.id })).toBeNull();
    // 普攻指令无效；站立自动攻击也不会锁定
    w.issue(me.id, { type: 'attack', mode: 'smart', targetId: foe.id });
    runFor(w, 1);
    expect(foe.hp).toBe(1000);
    // 小兵和防御塔不锁定它
    const creep = spawnDummy(w, { pos: { x: 1450, y: 4950 } });
    expect(pickCreepTarget(w, creep, 600)).toBeNull();
    // 隐藏结束后又能被打
    foe.modifiers = foe.modifiers.filter((m) => m.def.id !== 'hide');
    w.step();
    expect(canAttack(me, foe)).toBe(true);
    expect(pickCreepTarget(w, creep, 600)?.id).toBe(foe.id);
  });

  it('a unit attacking an enemy loses its target when the enemy becomes hidden, and towers ignore hidden heroes', () => {
    const w = makeWorld();
    const me = spawnDummy(w, { kind: 'hero', pos: { x: 1500, y: 5000 } });
    const foe = spawnDummy(w, { kind: 'hero', team: Team.Dire, pos: { x: 1500, y: 4900 }, base: { damageMin: 0, damageMax: 0 } });
    w.issue(me.id, { type: 'attack', mode: 'smart', targetId: foe.id });
    runFor(w, 0.1);
    expect(me.attack.windup).toBeGreaterThan(0);
    addModifier(w, foe, HIDDEN);
    w.step();
    expect(me.order.kind).toBe('idle');
    expect(me.attack.targetId).toBeNull();
    runFor(w, 1);
    expect(foe.hp).toBe(1000);

    // 防御塔：用 createBuildings 之外的最小塔替身
    const tw = spawnDummy(w, { kind: 'building', team: Team.Radiant, pos: { x: 1500, y: 4700 }, base: { attackRange: 700, moveSpeed: 0 } });
    tw.building = { type: 'tower', tier: 1, key: 't1', prereqIds: [], forcedTargetId: foe.id, forcedUntil: 999, goldTeam: 0, goldLastHit: 0 };
    expect(pickTowerTarget(w, tw)).toBeNull();
  });
});
