import { describe, it, expect } from 'vitest';
import { Unit, newHeroState } from '../src/sim/entities/unit';
import { recomputeStats } from '../src/sim/stats';
import { addModifier, tickModifiers, dispel, findModifier, type ModifierDef } from '../src/sim/modifiers';
import { BALANCE } from '../src/sim/data/balance';
import { EventBus } from '../src/sim/core/events';
import { Team } from '../src/sim/core/types';
import type { World } from '../src/sim/world';

const stubWorld = () =>
  ({ balance: structuredClone(BALANCE), events: new EventBus(false), time: 0, units: [], getUnit: () => undefined }) as unknown as World;

function axeLike(level = 1): Unit {
  const u = new Unit({
    id: 1, kind: 'hero', team: Team.Radiant, defId: 'axe', name: '斧王', pos: { x: 1500, y: 9000 }, radius: 24,
    base: { maxHp: 120, hpRegen: 2, maxMana: 75, manaRegen: 0, armor: 0, magicResist: 0.25, damageMin: 31, damageMax: 35, bat: 1.7, attackSpeed: 100, attackPoint: 0.4, attackRange: 150, projectileSpeed: 0, moveSpeed: 315, acquireRange: 600 },
    attackClass: 'hero', armorClass: 'hero',
  });
  u.hero = newHeroState('axe', { primary: 'str', str: [25, 2.7], agi: [18, 1.7], int: [18, 1.6] }, false, 600);
  u.hero.level = level;
  return u;
}

const ticks = (w: World, u: Unit, seconds: number) => {
  for (let i = 0; i < Math.round(seconds * 30); i++) { tickModifiers(w, u, 1 / 30); recomputeStats(w, u); }
};

describe('hero stats (Axe level 1 matches 7.41f)', () => {
  it('derives hp/mana/armor/damage/attack speed from attributes', () => {
    const w = stubWorld(); const u = axeLike(); recomputeStats(w, u);
    const s = u.stats;
    expect(s.maxHp).toBeCloseTo(670); expect(s.hpRegen).toBeCloseTo(4.5);
    expect(s.maxMana).toBeCloseTo(291); expect(s.manaRegen).toBeCloseTo(0.9);
    expect(s.armor).toBeCloseTo(3); expect(s.magicResist).toBeCloseTo(0.268);
    expect(s.damageMin).toBeCloseTo(56); expect(s.damageMax).toBeCloseTo(60);
    expect(s.attackSpeed).toBeCloseTo(118); expect(s.attackInterval).toBeCloseTo(1.4407, 3);
    expect(s.attackPoint).toBeCloseTo(0.4 / 1.18, 4); expect(s.moveSpeed).toBe(315);
  });
  it('grows with level', () => {
    const w = stubWorld(); const u = axeLike(10); recomputeStats(w, u);
    expect(u.stats.maxHp).toBeCloseTo(120 + 22 * (25 + 2.7 * 9));
  });
});

describe('modifiers', () => {
  it('flat stats and slows', () => {
    const w = stubWorld(); const u = axeLike(); recomputeStats(w, u);
    addModifier(w, u, { id: 'x', stats: { armor: 10, moveSpeedPct: -0.3 } });
    expect(u.stats.armor).toBeCloseTo(13); expect(u.stats.moveSpeed).toBeCloseTo(220.5);
  });
  it('states expire with duration', () => {
    const w = stubWorld(); const u = axeLike(); recomputeStats(w, u);
    addModifier(w, u, { id: 'stun', debuff: true, states: ['stunned'] }, { duration: 1 });
    expect(u.hasState('stunned')).toBe(true);
    ticks(w, u, 1.01);
    expect(u.hasState('stunned')).toBe(false);
    expect(findModifier(u, 'stun')).toBeUndefined();
  });
  it('debuff immunity blocks debuffs unless ignoreImmunity', () => {
    const w = stubWorld(); const u = axeLike(); recomputeStats(w, u);
    addModifier(w, u, { id: 'bkb', states: ['debuffImmune'] }, { duration: 5 });
    const def: ModifierDef = { id: 'slow', debuff: true, stats: { moveSpeedPct: -0.5 } };
    expect(addModifier(w, u, def, { duration: 2 })).toBeNull();
    expect(addModifier(w, u, def, { duration: 2, ignoreImmunity: true })).not.toBeNull();
  });
  it('stacks up to maxStacks and multiplies static stats', () => {
    const w = stubWorld(); const u = axeLike(); recomputeStats(w, u);
    const def: ModifierDef = { id: 'st', stacking: 'stacks', maxStacks: 3, stats: { armor: 1 } };
    for (let i = 0; i < 5; i++) addModifier(w, u, def);
    expect(findModifier(u, 'st')!.stacks).toBe(3);
    expect(u.stats.armor).toBeCloseTo(6);
  });
  it('refresh keeps one instance and resets duration', () => {
    const w = stubWorld(); const u = axeLike(); recomputeStats(w, u);
    const def: ModifierDef = { id: 'r', debuff: true };
    addModifier(w, u, def, { duration: 1 }); ticks(w, u, 0.5); addModifier(w, u, def, { duration: 1 });
    expect(u.modifiers.filter((m) => m.def.id === 'r')).toHaveLength(1);
    expect(findModifier(u, 'r')!.duration).toBeCloseTo(1);
  });
  it('dispel respects strength and buff/debuff', () => {
    const w = stubWorld(); const u = axeLike(); recomputeStats(w, u);
    addModifier(w, u, { id: 'weakDebuff', debuff: true }, { duration: 5 });
    addModifier(w, u, { id: 'strongDebuff', debuff: true, dispel: 'strong' }, { duration: 5 });
    addModifier(w, u, { id: 'buff' }, { duration: 5 });
    dispel(w, u, 'weak', 'debuffs');
    expect(findModifier(u, 'weakDebuff')).toBeUndefined();
    expect(findModifier(u, 'strongDebuff')).toBeDefined();
    dispel(w, u, 'strong', 'debuffs');
    expect(findModifier(u, 'strongDebuff')).toBeUndefined();
    expect(findModifier(u, 'buff')).toBeDefined();
  });
  it('keeps hp ratio when max hp changes', () => {
    const w = stubWorld(); const u = axeLike(); recomputeStats(w, u);
    u.hp = u.stats.maxHp / 2;
    addModifier(w, u, { id: 'str', stats: { str: 10 } });
    expect(u.hp / u.stats.maxHp).toBeCloseTo(0.5);
  });
  it('lateStats can add attributes based on computed armor', () => {
    const w = stubWorld(); const u = axeLike(); recomputeStats(w, u);
    addModifier(w, u, { id: 'oma', lateStats: (_m, _o, _w, s) => ({ str: s.armor * 0.5 }) });
    expect(u.stats.str).toBeCloseTo(26.5);
    expect(u.stats.maxHp).toBeCloseTo(120 + 22 * 26.5);
  });
  it('interval callbacks fire every interval', () => {
    const w = stubWorld(); const u = axeLike(); recomputeStats(w, u);
    let n = 0;
    addModifier(w, u, { id: 'dot', debuff: true, interval: 0.5, onInterval: () => { n++; } }, { duration: 2 });
    ticks(w, u, 2);
    expect(n).toBe(4);
  });
  it('taunt sets tauntedBy to the source', () => {
    const w = stubWorld(); const u = axeLike(); recomputeStats(w, u);
    addModifier(w, u, { id: 'taunt', debuff: true, taunt: true }, { duration: 2, sourceId: 77 });
    expect(u.stats.tauntedBy).toBe(77);
  });
  it('status resistance shortens debuffs', () => {
    const w = stubWorld(); const u = axeLike(); recomputeStats(w, u);
    addModifier(w, u, { id: 'sr', stats: { statusResist: 0.5 } });
    const m = addModifier(w, u, { id: 'd', debuff: true }, { duration: 2 })!;
    expect(m.duration).toBeCloseTo(1);
  });
});
