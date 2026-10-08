import { describe, it, expect } from 'vitest';
import { makeWorld, spawnDummy, runFor } from './helpers';
import { applyControl, applyFear, applySlow, CONTROL_NAMES } from '../src/sim/status';
import { addModifier, dispel, findModifier } from '../src/sim/modifiers';
import { newAbilityInstance, syncPassives } from '../src/sim/systems/abilities';
import { createHero } from '../src/sim/systems/heroes';
import { dist } from '../src/sim/core/vec2';
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

const ability = (over: Partial<AbilityDef>): AbilityDef => ({
  id: 'st', name: '测试', description: '', slot: 'Q', maxLevel: 4, targetType: 'none', castPoint: 0, cooldown: [5], manaCost: [0], values: {},
  ...over,
});

/** 1500,5000 处的攻击者 + 贴身的敌方木桩 */
function duel(w: World): { a: Unit; e: Unit } {
  const a = spawnDummy(w, { kind: 'hero', pos: { x: 1500, y: 5000 } });
  const e = spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 4900 }, base: { damageMin: 0, damageMax: 0 } });
  return { a, e };
}

describe('control statuses', () => {
  it('has Chinese names for every control', () => {
    expect(CONTROL_NAMES.stun).toBe('眩晕');
    expect(CONTROL_NAMES.mute).toBe('禁用物品');
    expect(CONTROL_NAMES.fear).toBe('恐惧');
    expect(CONTROL_NAMES.slow).toBe('减速');
  });

  it('stun stops attacks, movement and casting, cancels a channel, and the longer stun wins', () => {
    const w = makeWorld();
    const { a, e } = duel(w);
    // 攻击被眩晕挡住
    w.issue(a.id, { type: 'attack', mode: 'smart', targetId: e.id });
    applyControl(w, a, 'stun', { source: e, duration: 2 });
    const st = applyControl(w, a, 'stun', { source: e, duration: 0.5 });
    expect(st).not.toBeNull();
    expect(findModifier(a, 'status_stun')!.duration).toBeCloseTo(2);
    runFor(w, 1);
    expect(e.hp).toBe(1000);
    expect(a.attack.windup).toBe(-1);
    // 移动被眩晕挡住
    w.issue(a.id, { type: 'move', dir: { x: 0, y: 1 } });
    runFor(w, 0.5);
    expect(a.pos.y).toBeCloseTo(5000, 0);
    // 施法被眩晕挡住
    const q = give(w, a, ability({ id: 'q' }));
    w.issue(a.id, { type: 'cast', slot: 'Q' });
    runFor(w, 0.1);
    expect(q.cooldown).toBe(0);
    expect(findModifier(a, 'status_stun')!.duration).toBeCloseTo(0.4, 1);
    // 眩晕结束后恢复攻击
    w.issue(a.id, { type: 'attack', mode: 'smart', targetId: e.id });
    runFor(w, 1.5);
    expect(e.hp).toBeLessThan(1000);

    // 引导中被眩晕 → onChannelEnd(interrupted = true)
    let ended: boolean | null = null;
    give(w, a, ability({ id: 'chan', slot: 'R', channelTime: [3], cooldown: [30], onChannelEnd: (_c, interrupted) => { ended = interrupted; } }));
    w.issue(a.id, { type: 'stop' });
    w.issue(a.id, { type: 'cast', slot: 'R' });
    runFor(w, 0.5);
    expect(a.cast?.phase).toBe('channel');
    applyControl(w, a, 'stun', { source: e, duration: 1 });
    w.step();
    expect(a.cast).toBeNull();
    expect(ended).toBe(true);
  });

  it('root stops movement but not attacks or casts', () => {
    const w = makeWorld();
    const { a, e } = duel(w);
    applyControl(w, a, 'root', { source: e, duration: 3 });
    w.issue(a.id, { type: 'move', dir: { x: 0, y: 1 } });
    runFor(w, 0.5);
    expect(a.pos.y).toBeCloseTo(5000, 0);
    w.issue(a.id, { type: 'attack', mode: 'smart', targetId: e.id });
    runFor(w, 1);
    expect(e.hp).toBeLessThan(1000);
    const q = give(w, a, ability({ id: 'q' }));
    w.issue(a.id, { type: 'cast', slot: 'Q' });
    runFor(w, 0.1);
    expect(q.cooldown).toBeGreaterThan(0);
  });

  it('silence blocks casting but not attacking; disarm blocks attacking but not casting', () => {
    const w = makeWorld();
    const { a, e } = duel(w);
    const q = give(w, a, ability({ id: 'q' }));
    applyControl(w, a, 'silence', { source: e, duration: 3 });
    w.issue(a.id, { type: 'cast', slot: 'Q' });
    runFor(w, 0.1);
    expect(q.cooldown).toBe(0);
    w.issue(a.id, { type: 'attack', mode: 'smart', targetId: e.id });
    runFor(w, 1);
    expect(e.hp).toBeLessThan(1000);

    const w2 = makeWorld();
    const d = duel(w2);
    const q2 = give(w2, d.a, ability({ id: 'q' }));
    applyControl(w2, d.a, 'disarm', { source: d.e, duration: 3 });
    w2.issue(d.a.id, { type: 'attack', mode: 'smart', targetId: d.e.id });
    runFor(w2, 1.5);
    expect(d.e.hp).toBe(1000);
    w2.issue(d.a.id, { type: 'cast', slot: 'Q' });
    runFor(w2, 0.1);
    expect(q2.cooldown).toBeGreaterThan(0);
  });

  it('slows with different keys stack, the same key and source refreshes, slow resist reduces them', () => {
    const w = makeWorld();
    const src = spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 4000 } });
    const src2 = spawnDummy(w, { team: Team.Dire, pos: { x: 1600, y: 4000 } });
    const u = spawnDummy(w, { pos: { x: 1500, y: 5000 } });
    applySlow(w, u, { source: src, duration: 3, key: 'a', moveSlow: 0.3 });
    applySlow(w, u, { source: src, duration: 3, key: 'b', moveSlow: 0.3 });
    expect(u.stats.moveSpeed).toBeCloseTo(300 * 0.4);
    // 同 key 同来源：刷新而不叠加
    applySlow(w, u, { source: src, duration: 5, key: 'a', moveSlow: 0.3 });
    expect(u.stats.moveSpeed).toBeCloseTo(300 * 0.4);
    expect(u.modifiers.filter((m) => m.def.id === 'slow_a')).toHaveLength(1);
    expect(findModifier(u, 'slow_a')!.duration).toBeCloseTo(5);
    // 同 key 不同来源：叠加
    applySlow(w, u, { source: src2, duration: 3, key: 'a', moveSlow: 0.05 });
    expect(u.stats.moveSpeed).toBeCloseTo(300 * 0.35);

    const v = spawnDummy(w, { pos: { x: 1500, y: 6000 } });
    addModifier(w, v, { id: 'sr', stats: { slowResist: 0.5 } });
    applySlow(w, v, { source: src, duration: 3, key: 'a', moveSlow: 0.4 });
    expect(v.stats.moveSpeed).toBeCloseTo(300 * 0.8);
  });

  it('attack slow and magic resist reduction from applySlow', () => {
    const w = makeWorld();
    const u = spawnDummy(w, { pos: { x: 1500, y: 5000 } });
    const as0 = u.stats.attackSpeed;
    applySlow(w, u, { source: null, duration: 2, key: 'frost', attackSlow: 40, magicResist: -0.1 });
    expect(u.stats.attackSpeed).toBeCloseTo(as0 - 40);
    expect(u.stats.magicResist).toBeCloseTo(-0.1);
    expect(u.stats.moveSpeed).toBeCloseTo(300);
    runFor(w, 2.1);
    expect(u.stats.attackSpeed).toBeCloseTo(as0);
    expect(u.stats.magicResist).toBeCloseTo(0);
  });

  it('fear moves the unit away from its source and addUpTo caps the total duration', () => {
    const w = makeWorld();
    const src = spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 4800 } });
    const u = spawnDummy(w, { kind: 'hero', pos: { x: 1500, y: 5000 } });
    w.issue(u.id, { type: 'move', dir: { x: 0, y: -1 } });
    w.step();
    for (let i = 0; i < 5; i++) applyFear(w, u, { source: src, duration: 0.6, addUpTo: 2.15 });
    const m = findModifier(u, 'status_fear')!;
    expect(m.duration).toBeCloseTo(2.15);
    expect(u.stats.fearedBy).toBe(src.id);
    // 恐惧期间指令无效
    expect(u.order.kind).toBe('idle');
    w.issue(u.id, { type: 'move', dir: { x: 0, y: -1 } });
    const y0 = u.pos.y;
    runFor(w, 1);
    expect(u.pos.y).toBeGreaterThan(y0 + 250);
    runFor(w, 1.3);
    expect(findModifier(u, 'status_fear')).toBeUndefined();
    // 没有 addUpTo：取剩余更长的一个
    applyFear(w, u, { source: src, duration: 1 });
    applyFear(w, u, { source: src, duration: 0.3 });
    expect(findModifier(u, 'status_fear')!.duration).toBeCloseTo(1);
  });

  it('debuff immunity blocks controls unless ignoreImmunity', () => {
    const w = makeWorld();
    const u = spawnDummy(w, { pos: { x: 1500, y: 5000 } });
    addModifier(w, u, { id: 'bkb', states: ['debuffImmune'] });
    expect(applyControl(w, u, 'stun', { source: null, duration: 1 })).toBeNull();
    expect(applySlow(w, u, { source: null, duration: 1, key: 'a', moveSlow: 0.5 })).toBeNull();
    expect(applyFear(w, u, { source: null, duration: 1 })).toBeNull();
    expect(u.hasState('stunned')).toBe(false);
    expect(applyControl(w, u, 'stun', { source: null, duration: 1, ignoreImmunity: true })).not.toBeNull();
    expect(u.hasState('stunned')).toBe(true);
  });

  it('strong dispel removes stuns, weak dispel removes roots and slows but not stuns', () => {
    const w = makeWorld();
    const u = spawnDummy(w, { pos: { x: 1500, y: 5000 } });
    applyControl(w, u, 'stun', { source: null, duration: 5 });
    applyControl(w, u, 'root', { source: null, duration: 5 });
    applyControl(w, u, 'silence', { source: null, duration: 5 });
    applySlow(w, u, { source: null, duration: 5, key: 'a', moveSlow: 0.5 });
    dispel(w, u, 'weak', 'debuffs');
    expect(u.hasState('stunned')).toBe(true);
    expect(u.hasState('rooted')).toBe(false);
    expect(u.hasState('silenced')).toBe(false);
    expect(u.stats.moveSpeed).toBeCloseTo(300);
    dispel(w, u, 'strong', 'debuffs');
    expect(u.hasState('stunned')).toBe(false);
  });

  it('busy units ignore move, attack, cast and recall commands but can still learn', () => {
    const w = makeWorld();
    const h = createHero(w, 'axe', Team.Radiant, false);
    h.pos = { x: 1500, y: 5000 };
    const e = spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 4900 }, base: { damageMin: 0, damageMax: 0 } });
    w.issue(h.id, { type: 'learn', slot: 'Q' });
    w.step();
    addModifier(w, h, { id: 'busy', states: ['busy'] }, { duration: 3 });
    w.issue(h.id, { type: 'attack', mode: 'smart', targetId: e.id });
    w.issue(h.id, { type: 'move', dir: { x: 0, y: 1 } });
    w.issue(h.id, { type: 'cast', slot: 'Q' });
    w.issue(h.id, { type: 'recall' });
    h.hero!.skillPoints = 1;
    h.hero!.level = 3;
    w.issue(h.id, { type: 'learn', slot: 'W' });
    runFor(w, 1);
    expect(h.order.kind).toBe('idle');
    expect(h.cast).toBeNull();
    expect(h.ability('Q')!.cooldown).toBe(0);
    expect(h.pos.y).toBeCloseTo(5000, 0);
    expect(h.ability('W')!.level).toBe(1);
    // 原本在攻击的单位变成 busy 后也不出手
    const w2 = makeWorld();
    const d = duel(w2);
    w2.issue(d.a.id, { type: 'attack', mode: 'smart', targetId: d.e.id });
    w2.step();
    addModifier(w2, d.a, { id: 'busy', states: ['busy'] }, { duration: 3 });
    runFor(w2, 2);
    expect(d.e.hp).toBe(1000);
    expect(dist(d.a.pos, { x: 1500, y: 5000 })).toBeLessThan(1);
  });
});
