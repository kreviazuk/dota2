import { describe, it, expect } from 'vitest';
import { makeWorld, spawnDummy, runFor } from './helpers';
import { applyDamage, heal } from '../src/sim/systems/damage';
import { addModifier } from '../src/sim/modifiers';
import { enemiesInRadius, nearestEnemy, edgeDist } from '../src/sim/query';
import { Team } from '../src/sim/core/types';

describe('World basics', () => {
  it('advances time by ticks', () => {
    const w = makeWorld(); runFor(w, 1);
    expect(w.tick).toBe(30); expect(w.time).toBeCloseTo(1);
  });
  it('addUnit fills hp/mana from computed stats and registers id', () => {
    const w = makeWorld(); const u = spawnDummy(w);
    expect(u.hp).toBe(1000); expect(w.getUnit(u.id)).toBe(u);
  });
  it('regenerates hp and mana', () => {
    const w = makeWorld(); const u = spawnDummy(w, { base: { hpRegen: 10, manaRegen: 5 } });
    u.hp = 500; u.mana = 100; runFor(w, 1);
    expect(u.hp).toBeCloseTo(510); expect(u.mana).toBeCloseTo(105);
  });
});

describe('damage', () => {
  it('physical damage is reduced by armor', () => {
    const w = makeWorld(); const a = spawnDummy(w); const t = spawnDummy(w, { team: Team.Dire, base: { armor: 10 } });
    const dealt = applyDamage(w, { source: a, target: t, amount: 100, type: 'physical', isAttack: false });
    expect(dealt).toBeCloseTo(62.5); expect(t.hp).toBeCloseTo(937.5);
  });
  it('magical damage is reduced by magic resist, pure is not', () => {
    const w = makeWorld(); const a = spawnDummy(w); const t = spawnDummy(w, { team: Team.Dire, base: { magicResist: 0.25 } });
    expect(applyDamage(w, { source: a, target: t, amount: 100, type: 'magical', isAttack: false })).toBeCloseTo(75);
    expect(applyDamage(w, { source: a, target: t, amount: 100, type: 'pure', isAttack: false })).toBeCloseTo(100);
  });
  it('attack damage uses damage matrix', () => {
    const w = makeWorld(); const a = spawnDummy(w, { attackClass: 'basic' }); const t = spawnDummy(w, { team: Team.Dire, armorClass: 'hero' });
    expect(applyDamage(w, { source: a, target: t, amount: 100, type: 'pure', isAttack: true })).toBeCloseTo(75);
  });
  it('invulnerable takes no damage', () => {
    const w = makeWorld(); const t = spawnDummy(w); t.baseStates.add('invulnerable'); runFor(w, 1 / 30);
    expect(applyDamage(w, { source: null, target: t, amount: 100, type: 'pure', isAttack: false })).toBe(0);
  });
  it('debuff immune blocks pure spell damage but not attacks', () => {
    const w = makeWorld(); const t = spawnDummy(w);
    addModifier(w, t, { id: 'bkb', states: ['debuffImmune'] }, { duration: 5 });
    expect(applyDamage(w, { source: null, target: t, amount: 100, type: 'pure', isAttack: false })).toBe(0);
    expect(applyDamage(w, { source: null, target: t, amount: 100, type: 'pure', isAttack: true })).toBe(100);
  });
  it('debuff immunity does not block same-team or self pure spell damage', () => {
    const w = makeWorld(); const t = spawnDummy(w); const ally = spawnDummy(w);
    addModifier(w, t, { id: 'bkb', states: ['debuffImmune'] }, { duration: 5 });
    expect(applyDamage(w, { source: ally, target: t, amount: 100, type: 'pure', isAttack: false })).toBe(100);
    expect(applyDamage(w, { source: t, target: t, amount: 100, type: 'pure', isAttack: false })).toBe(100);
  });
  it('incoming damage hooks can absorb', () => {
    const w = makeWorld(); const t = spawnDummy(w);
    addModifier(w, t, { id: 'shield', onIncomingDamage: (_m, _o, _w, info) => { info.amount = Math.max(0, info.amount - 30); } });
    expect(applyDamage(w, { source: null, target: t, amount: 100, type: 'pure', isAttack: false })).toBe(70);
  });
  it('nonLethal leaves 1 hp', () => {
    const w = makeWorld(); const t = spawnDummy(w);
    applyDamage(w, { source: null, target: t, amount: 5000, type: 'pure', isAttack: false, nonLethal: true });
    expect(t.hp).toBe(1); expect(t.alive).toBe(true);
  });
  it('lethal damage kills, emits death, runs kill listeners and removes non-hero units', () => {
    const w = makeWorld(); const a = spawnDummy(w); const t = spawnDummy(w, { team: Team.Dire });
    let heard = 0; w.killListeners.push(() => { heard++; });
    applyDamage(w, { source: a, target: t, amount: 5000, type: 'pure', isAttack: false });
    expect(t.alive).toBe(false); expect(heard).toBe(1);
    expect(w.events.drain().some((e) => e.type === 'death' && e.unitId === t.id)).toBe(true);
    w.step();
    expect(w.units.includes(t)).toBe(false);
  });
  it('records last hero damage for kill credit', () => {
    const w = makeWorld(); const h = spawnDummy(w, { kind: 'hero' }); const t = spawnDummy(w, { team: Team.Dire });
    applyDamage(w, { source: h, target: t, amount: 10, type: 'pure', isAttack: false });
    expect(t.lastHeroDamage?.heroId).toBe(h.id);
  });
  it('heal clamps to max hp', () => {
    const w = makeWorld(); const u = spawnDummy(w); u.hp = 900;
    expect(heal(w, u, 500)).toBeCloseTo(100); expect(u.hp).toBe(1000);
  });
});

describe('query', () => {
  it('finds enemies in radius using edge distance', () => {
    const w = makeWorld();
    const me = spawnDummy(w, { pos: { x: 1500, y: 5000 } });
    const near = spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 5300 } });
    spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 6000 } });
    spawnDummy(w, { team: Team.Radiant, pos: { x: 1500, y: 5100 } });
    expect(enemiesInRadius(w, me.team, me.pos, 300).map((u) => u.id)).toEqual([near.id]);
    expect(nearestEnemy(w, me, 2000)?.id).toBe(near.id);
    expect(edgeDist(me, near)).toBe(260);
  });
});
