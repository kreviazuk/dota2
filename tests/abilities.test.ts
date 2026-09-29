import { describe, it, expect } from 'vitest';
import { makeWorld, spawnDummy, runFor } from './helpers';
import { abilityCooldown, abilityManaCost, newAbilityInstance, syncPassives, abilityValue, resolveTarget } from '../src/sim/systems/abilities';
import { applyDamage, killUnit } from '../src/sim/systems/damage';
import { addModifier, findModifier } from '../src/sim/modifiers';
import { Team } from '../src/sim/core/types';
import type { AbilityDef } from '../src/sim/heroes/types';
import type { Unit } from '../src/sim/entities/unit';
import type { World } from '../src/sim/world';

const nuke: AbilityDef = {
  id: 'nuke', name: '飞弹', description: '', slot: 'Q', maxLevel: 4, targetType: 'unit', castRange: [600], castPoint: 0.3,
  cooldown: [10], manaCost: [100], values: { damage: [100, 200, 300, 400] },
  onCast: (ctx) => {
    applyDamage(ctx.world, { source: ctx.caster, target: ctx.target.unit!, amount: ctx.v('damage'), type: 'magical', isAttack: false, abilityId: 'nuke' });
  },
};

function give(w: World, u: Unit, def: AbilityDef, level = 1) {
  const ab = newAbilityInstance(def);
  ab.level = level;
  u.abilities.push(ab);
  syncPassives(w, u);
  return ab;
}

describe('ability casting', () => {
  it('smart-casts on the nearest enemy hero after the cast point', () => {
    const w = makeWorld();
    const me = spawnDummy(w, { kind: 'hero', pos: { x: 1500, y: 5000 } });
    const creep = spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 4900 } });
    const hero = spawnDummy(w, { kind: 'hero', team: Team.Dire, pos: { x: 1500, y: 4600 } });
    const ab = give(w, me, nuke);
    w.issue(me.id, { type: 'cast', slot: 'Q' });
    runFor(w, 0.2);
    expect(hero.hp).toBe(1000);
    runFor(w, 0.2);
    expect(hero.hp).toBe(900); expect(creep.hp).toBe(1000);
    expect(me.mana).toBeCloseTo(400); expect(ab.cooldown).toBeGreaterThan(9.5);
  });
  it('walks into cast range first', () => {
    const w = makeWorld();
    const me = spawnDummy(w, { kind: 'hero', pos: { x: 1500, y: 5000 } });
    const hero = spawnDummy(w, { kind: 'hero', team: Team.Dire, pos: { x: 1500, y: 4200 } });
    give(w, me, nuke);
    w.issue(me.id, { type: 'cast', slot: 'Q', target: { unitId: hero.id } });
    runFor(w, 1.5);
    expect(hero.hp).toBe(900);
    expect(me.pos.y).toBeLessThan(5000);
  });
  it('cannot cast while silenced; stun during cast point cancels without spending mana', () => {
    const w = makeWorld();
    const me = spawnDummy(w, { kind: 'hero', pos: { x: 1500, y: 5000 } });
    const hero = spawnDummy(w, { kind: 'hero', team: Team.Dire, pos: { x: 1500, y: 4700 } });
    give(w, me, nuke);
    addModifier(w, me, { id: 'sil', debuff: true, states: ['silenced'] }, { duration: 0.5 });
    w.issue(me.id, { type: 'cast', slot: 'Q' });
    runFor(w, 0.4);
    expect(hero.hp).toBe(1000);
    runFor(w, 0.2);
    w.issue(me.id, { type: 'cast', slot: 'Q' });
    runFor(w, 0.1);
    addModifier(w, me, { id: 'stun', debuff: true, states: ['stunned'] }, { duration: 0.5 });
    runFor(w, 0.5);
    expect(hero.hp).toBe(1000); expect(me.mana).toBe(500); expect(me.cast).toBeNull();
  });
  it('respects cooldown and mana', () => {
    const w = makeWorld();
    const me = spawnDummy(w, { kind: 'hero', pos: { x: 1500, y: 5000 } });
    const hero = spawnDummy(w, { kind: 'hero', team: Team.Dire, pos: { x: 1500, y: 4700 } });
    give(w, me, nuke);
    w.issue(me.id, { type: 'cast', slot: 'Q' }); runFor(w, 0.5);
    w.issue(me.id, { type: 'cast', slot: 'Q' }); runFor(w, 0.5);
    expect(hero.hp).toBe(900);
    me.mana = 50;
    runFor(w, 10);
    w.issue(me.id, { type: 'cast', slot: 'Q' }); runFor(w, 0.5);
    expect(hero.hp).toBe(900);
  });
  it('point targets clamp to cast range, direction targets aim at the nearest enemy hero', () => {
    const w = makeWorld();
    const me = spawnDummy(w, { kind: 'hero', pos: { x: 1500, y: 5000 } });
    spawnDummy(w, { kind: 'hero', team: Team.Dire, pos: { x: 1800, y: 5000 } });
    const pointAb = newAbilityInstance({ ...nuke, id: 'p', targetType: 'point', castRange: [500] }); pointAb.level = 1;
    const t = resolveTarget(w, me, pointAb, { point: { x: 1500, y: 3000 } })!;
    expect(t.point!.y).toBeCloseTo(4500);
    const dirAb = newAbilityInstance({ ...nuke, id: 'd', targetType: 'direction' }); dirAb.level = 1;
    expect(resolveTarget(w, me, dirAb)!.dir!.x).toBeCloseTo(1);
  });
  it('channels tick and are interrupted by movement', () => {
    const w = makeWorld();
    const me = spawnDummy(w, { kind: 'hero', pos: { x: 1500, y: 5000 } });
    let ticks = 0; let interrupted: boolean | null = null;
    give(w, me, {
      id: 'ch', name: '引导', description: '', slot: 'R', maxLevel: 3, targetType: 'none', castPoint: 0, cooldown: [30],
      manaCost: [0], channelTime: [3], values: {},
      onChannelTick: () => { ticks++; }, onChannelEnd: (_c, i) => { interrupted = i; },
    });
    w.issue(me.id, { type: 'cast', slot: 'R' });
    runFor(w, 1);
    expect(me.cast?.phase).toBe('channel'); expect(ticks).toBeGreaterThan(25);
    w.issue(me.id, { type: 'move', dir: { x: 0, y: -1 } });
    w.step();
    expect(me.cast).toBeNull(); expect(interrupted).toBe(true);
  });
  it('toggles flip state and call onToggle', () => {
    const w = makeWorld();
    const me = spawnDummy(w, { kind: 'hero' });
    const seen: boolean[] = [];
    const ab = give(w, me, { id: 'tg', name: '开关', description: '', slot: 'W', maxLevel: 4, targetType: 'toggle', values: {}, onToggle: (_c, on) => { seen.push(on); } });
    w.issue(me.id, { type: 'toggle', slot: 'W' }); w.step();
    w.issue(me.id, { type: 'toggle', slot: 'W' }); w.step();
    expect(seen).toEqual([true, false]); expect(ab.toggled).toBe(false);
  });
  it('charges restore one at a time', () => {
    const w = makeWorld();
    const me = spawnDummy(w, { kind: 'hero', pos: { x: 1500, y: 5000 } });
    spawnDummy(w, { kind: 'hero', team: Team.Dire, pos: { x: 1500, y: 4700 } });
    const ab = give(w, me, { ...nuke, id: 'raze', castPoint: 0, manaCost: [0], cooldown: [9], charges: 3 });
    ab.charges = 3;
    for (let i = 0; i < 4; i++) { w.issue(me.id, { type: 'cast', slot: 'Q' }); runFor(w, 0.1); }
    expect(ab.charges).toBe(0);
    runFor(w, 9);
    expect(ab.charges).toBe(1);
  });
  it('passives apply while learned and read their level; talents add to values', () => {
    const w = makeWorld();
    const me = spawnDummy(w, { kind: 'hero' });
    me.hero = undefined;
    const ab = give(w, me, {
      id: 'aura', name: '被动', description: '', slot: 'E', maxLevel: 4, targetType: 'passive', values: { armor: [1, 2, 3, 4] },
      passive: { id: 'aura_mod', hidden: true, persistOnDeath: true, dispel: 'none', stats: (m) => ({ armor: m.abilityLevel }) },
    }, 2);
    expect(me.stats.armor).toBe(2);
    ab.level = 3; syncPassives(w, me);
    expect(me.stats.armor).toBe(3);
    ab.level = 0; syncPassives(w, me);
    expect(findModifier(me, 'aura_mod')).toBeUndefined();
    const h = spawnDummy(w, { kind: 'hero' });
    h.hero = { talentValueBonus: { 'nuke.damage': 50 } } as never;
    const nab = newAbilityInstance(nuke); nab.level = 2;
    expect(abilityValue(h, nab, 'damage')).toBe(250);
  });
  it('debuff-immune units are not valid targets unless the ability pierces immunity', () => {
    const w = makeWorld();
    const me = spawnDummy(w, { kind: 'hero', pos: { x: 1500, y: 5000 } });
    const e = spawnDummy(w, { kind: 'hero', team: Team.Dire, pos: { x: 1500, y: 4700 } });
    addModifier(w, e, { id: 'bkb', states: ['debuffImmune'] }, { duration: 10 });
    const normal = newAbilityInstance(nuke); normal.level = 1;
    expect(resolveTarget(w, me, normal, { unitId: e.id })).toBeNull();
    const pierce = newAbilityInstance({ ...nuke, ignoresDebuffImmune: true }); pierce.level = 1;
    expect(resolveTarget(w, me, pierce, { unitId: e.id })?.unit).toBe(e);
  });
});

const chan = (over: Partial<AbilityDef> = {}, log: { ends: boolean[] } = { ends: [] }): AbilityDef => ({
  id: 'ch2', name: '引导', description: '', slot: 'R', maxLevel: 3, targetType: 'none', castPoint: 0, cooldown: [30],
  manaCost: [0], channelTime: [3], values: {}, onChannelEnd: (_c, i) => { log.ends.push(i); }, ...over,
});

describe('ability contracts', () => {
  it('death mid-channel calls onChannelEnd(true) exactly once', () => {
    const w = makeWorld();
    const me = spawnDummy(w, { kind: 'hero' });
    const log = { ends: [] as boolean[] };
    give(w, me, chan({}, log));
    w.issue(me.id, { type: 'cast', slot: 'R' }); runFor(w, 0.5);
    expect(me.cast?.phase).toBe('channel');
    killUnit(w, me, null);
    runFor(w, 0.2);
    expect(log.ends).toEqual([true]); expect(me.cast).toBeNull();
  });
  it('stun during a channel calls onChannelEnd(true)', () => {
    const w = makeWorld();
    const me = spawnDummy(w, { kind: 'hero' });
    const log = { ends: [] as boolean[] };
    give(w, me, chan({}, log));
    w.issue(me.id, { type: 'cast', slot: 'R' }); runFor(w, 0.5);
    addModifier(w, me, { id: 'stun', debuff: true, states: ['stunned'] }, { duration: 0.5 });
    runFor(w, 0.1);
    expect(log.ends).toEqual([true]); expect(me.cast).toBeNull();
  });
  it('a completed channel calls onChannelEnd(false) once and clears cast', () => {
    const w = makeWorld();
    const me = spawnDummy(w, { kind: 'hero' });
    const log = { ends: [] as boolean[] };
    give(w, me, chan({}, log));
    w.issue(me.id, { type: 'cast', slot: 'R' }); runFor(w, 3.5);
    expect(log.ends).toEqual([false]); expect(me.cast).toBeNull();
  });
  it('channelAllowsMove: move and moveTo keep the channel, stop cancels it', () => {
    const w = makeWorld();
    const me = spawnDummy(w, { kind: 'hero', pos: { x: 1500, y: 5000 } });
    const log = { ends: [] as boolean[] };
    give(w, me, chan({ channelAllowsMove: true }, log));
    w.issue(me.id, { type: 'cast', slot: 'R' }); runFor(w, 0.3);
    w.issue(me.id, { type: 'moveTo', point: { x: 1500, y: 4000 } }); runFor(w, 0.5);
    expect(me.cast?.phase).toBe('channel'); expect(me.pos.y).toBeLessThan(5000);
    w.issue(me.id, { type: 'move', dir: { x: 0, y: -1 } }); w.step();
    expect(me.cast?.phase).toBe('channel');
    w.issue(me.id, { type: 'stop' }); w.step();
    expect(me.cast).toBeNull(); expect(log.ends).toEqual([true]);
  });
  it('talent cooldown/mana bonuses are additive and clamped at 0', () => {
    const w = makeWorld();
    const me = spawnDummy(w, { kind: 'hero' });
    me.hero = { talentValueBonus: { 'nuke.cooldown': -4, 'nuke.manaCost': -500 } } as never;
    const ab = newAbilityInstance(nuke); ab.level = 1;
    expect(abilityCooldown(ab)).toBe(10);
    expect(abilityCooldown(ab, me)).toBe(6);
    expect(abilityManaCost(ab, me)).toBe(0);
  });
  it('smartTarget override is used when no explicit target is given', () => {
    const w = makeWorld();
    const me = spawnDummy(w, { kind: 'hero', pos: { x: 1500, y: 5000 } });
    const near = spawnDummy(w, { kind: 'hero', team: Team.Dire, pos: { x: 1500, y: 4700 } });
    const far = spawnDummy(w, { kind: 'hero', team: Team.Dire, pos: { x: 1500, y: 4500 } });
    give(w, me, { ...nuke, smartTarget: () => ({ unit: far }) });
    w.issue(me.id, { type: 'cast', slot: 'Q' }); runFor(w, 0.5);
    expect(far.hp).toBe(900); expect(near.hp).toBe(1000);
  });
  it('charges restore one at a time (9s, 18s, 27s)', () => {
    const w = makeWorld();
    const me = spawnDummy(w, { kind: 'hero', pos: { x: 1500, y: 5000 } });
    spawnDummy(w, { kind: 'hero', team: Team.Dire, pos: { x: 1500, y: 4700 } });
    const ab = give(w, me, { ...nuke, id: 'raze', castPoint: 0, manaCost: [0], cooldown: [9], charges: 3 });
    ab.charges = 3;
    for (let i = 0; i < 3; i++) { w.issue(me.id, { type: 'cast', slot: 'Q' }); runFor(w, 0.1); }
    expect(ab.charges).toBe(0);
    runFor(w, 9); expect(ab.charges).toBe(1);
    runFor(w, 9); expect(ab.charges).toBe(2);
    runFor(w, 9); expect(ab.charges).toBe(3);
  });
  it('prefers the nearest enemy hero over a nearer enemy creep', () => {
    const w = makeWorld();
    const me = spawnDummy(w, { kind: 'hero', pos: { x: 1500, y: 5000 } });
    const creep = spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 4900 } });
    const hero = spawnDummy(w, { kind: 'hero', team: Team.Dire, pos: { x: 1500, y: 4500 } });
    const ab = newAbilityInstance(nuke); ab.level = 1;
    expect(resolveTarget(w, me, ab)!.unit).toBe(hero);
    expect(creep.hp).toBe(1000);
  });
  it('cooldown-blocked and mana-blocked casts are separate', () => {
    const w = makeWorld();
    const me = spawnDummy(w, { kind: 'hero', pos: { x: 1500, y: 5000 } });
    const hero = spawnDummy(w, { kind: 'hero', team: Team.Dire, pos: { x: 1500, y: 4700 } });
    const ab = give(w, me, nuke);
    w.issue(me.id, { type: 'cast', slot: 'Q' }); runFor(w, 0.5);
    expect(hero.hp).toBe(900);
    // on cooldown with plenty of mana: blocked
    expect(me.mana).toBeCloseTo(400);
    w.issue(me.id, { type: 'cast', slot: 'Q' }); runFor(w, 0.5);
    expect(hero.hp).toBe(900); expect(me.mana).toBeCloseTo(400);
    // cooldown expired, mana short: blocked
    runFor(w, 10);
    expect(ab.cooldown).toBe(0);
    me.mana = 50;
    w.issue(me.id, { type: 'cast', slot: 'Q' }); runFor(w, 0.5);
    expect(hero.hp).toBe(900); expect(me.mana).toBe(50);
    // cooldown expired, mana sufficient: casts
    me.mana = 100;
    w.issue(me.id, { type: 'cast', slot: 'Q' }); runFor(w, 0.5);
    expect(hero.hp).toBe(800);
  });
});
