import { describe, it, expect } from 'vitest';
import { TEST_INNATE_INSTANT, TEST_PARALLEL } from './testHero';
import { makeWorld, spawnDummy, runFor } from './helpers';
import {
  abilityCastPoint, abilityValue, newAbilityInstance, resolveTarget, syncPassives,
} from '../src/sim/systems/abilities';
import { canLearn, learnAbility } from '../src/sim/systems/progress';
import { nextSkillToLearn } from '../src/ai/builds';
import { createHero } from '../src/sim/systems/heroes';
import { addModifier } from '../src/sim/modifiers';
import { dist } from '../src/sim/core/vec2';
import { aimAbility } from '../src/input/aim';
import { Team } from '../src/sim/core/types';
import type { AbilityDef, AbilityInstance } from '../src/sim/heroes/types';
import type { Unit } from '../src/sim/entities/unit';
import type { World } from '../src/sim/world';

function give(w: World, u: Unit, def: AbilityDef, level = 1): AbilityInstance {
  const ab = newAbilityInstance(def);
  if (!def.innate) ab.level = level;
  u.abilities.push(ab);
  syncPassives(w, u);
  return ab;
}

const base = (over: Partial<AbilityDef>): AbilityDef => ({
  id: 'fw', name: '测试', description: '', slot: 'Q', maxLevel: 4, targetType: 'none', castPoint: 0, cooldown: [5], manaCost: [0], values: {}, ...over,
});

describe('ability framework', () => {
  it('innate actives start at level 1 and cannot be learned', () => {
    const w = makeWorld();
    const u = createHero(w, 'axe', Team.Radiant, false);
    const x1 = give(w, u, TEST_INNATE_INSTANT);
    expect(x1.level).toBe(1);
    expect(canLearn(25, x1)).toBe(false);
    for (const ab of u.abilities) if (ab.def.slot !== 'innate' && ab !== x1) ab.level = ab.def.maxLevel;
    u.hero!.level = 25;
    u.hero!.skillPoints = 3;
    expect(nextSkillToLearn(u)).toBeNull();
    expect(learnAbility(w, u, 'X1')).toBe(false);
    expect(x1.level).toBe(1);
  });

  it('instant abilities do not interrupt a channel or an attack windup', () => {
    const w = makeWorld();
    const me = spawnDummy(w, { kind: 'hero', pos: { x: 1500, y: 5000 } });
    const chan = give(w, me, base({ id: 'chan', slot: 'R', channelTime: [2], cooldown: [30] }));
    const x1 = give(w, me, TEST_INNATE_INSTANT);
    w.issue(me.id, { type: 'cast', slot: 'R' });
    runFor(w, 0.5);
    const c = me.cast;
    expect(c?.phase).toBe('channel');
    expect(c?.ability).toBe(chan);
    w.issue(me.id, { type: 'cast', slot: 'X1' });
    w.step();
    expect(me.cast).toBe(c);
    expect(me.order.kind).toBe('cast');
    expect(x1.data.casts).toBe(1);
    expect(me.mana).toBeCloseTo(500 - 25);
    expect(x1.cooldown).toBeGreaterThan(9.9);

    // 普攻前摇中施放
    const w2 = makeWorld();
    const a = spawnDummy(w2, { kind: 'hero', pos: { x: 1500, y: 5000 }, base: { attackPoint: 0.5 } });
    const enemy = spawnDummy(w2, { kind: 'hero', team: Team.Dire, pos: { x: 1500, y: 4900 }, base: { damageMin: 0, damageMax: 0 } });
    const x = give(w2, a, TEST_INNATE_INSTANT);
    a.order = { kind: 'attack', targetId: enemy.id, persistent: true };
    runFor(w2, 0.2);
    expect(a.attack.windup).toBeGreaterThan(0);
    const windup = a.attack.windup;
    w2.issue(a.id, { type: 'cast', slot: 'X1' });
    w2.step();
    expect(x.data.casts).toBe(1);
    expect(a.attack.windup).toBeCloseTo(windup - 1 / 30);
    expect(a.order.kind).toBe('attack');
  });

  it('parallel charges recover independently', () => {
    const w = makeWorld();
    const me = spawnDummy(w, { kind: 'hero' });
    const ab = give(w, me, TEST_PARALLEL);
    expect(ab.charges).toBe(3);
    for (let i = 0; i < 3; i++) { w.issue(me.id, { type: 'cast', slot: 'E' }); runFor(w, 0.1); }
    expect(ab.charges).toBe(0);
    expect(ab.chargeTimers.length).toBe(3);
    runFor(w, 8.6);
    expect(ab.charges).toBe(0);
    runFor(w, 0.5);
    expect(ab.charges).toBe(3);
    expect(ab.chargeTimers.length).toBe(0);
  });

  it('sequential charges keep the P1 behaviour', () => {
    const w = makeWorld();
    const me = spawnDummy(w, { kind: 'hero' });
    const ab = give(w, me, { ...TEST_PARALLEL, chargeMode: undefined });
    for (let i = 0; i < 3; i++) { w.issue(me.id, { type: 'cast', slot: 'E' }); runFor(w, 0.1); }
    expect(ab.charges).toBe(0);
    runFor(w, 9);
    expect(ab.charges).toBe(1);
    runFor(w, 9);
    expect(ab.charges).toBe(2);
  });

  it('smartTarget overrides targeting for point, direction and none abilities', () => {
    const w = makeWorld();
    const me = spawnDummy(w, { kind: 'hero', pos: { x: 1500, y: 5000 } });
    spawnDummy(w, { kind: 'hero', team: Team.Dire, pos: { x: 1500, y: 4700 } });
    const p = give(w, me, base({ targetType: 'point', castRange: [600], smartTarget: () => ({ point: { x: 1700, y: 5000 } }) }));
    expect(resolveTarget(w, me, p)?.point).toEqual({ x: 1700, y: 5000 });
    // 明确给了目标时不走 smartTarget
    expect(resolveTarget(w, me, p, { point: { x: 1500, y: 4800 } })?.point).toEqual({ x: 1500, y: 4800 });
    const d = give(w, me, base({ targetType: 'direction', smartTarget: () => ({ dir: { x: -1, y: 0 } }) }));
    expect(resolveTarget(w, me, d)?.dir).toEqual({ x: -1, y: 0 });
    const n = give(w, me, base({ targetType: 'none', smartTarget: () => ({ dir: { x: 0, y: 1 } }) }));
    expect(resolveTarget(w, me, n)?.dir).toEqual({ x: 0, y: 1 });
  });

  it('none abilities pass through the given dir', () => {
    const w = makeWorld();
    const me = spawnDummy(w, { kind: 'hero' });
    const n = give(w, me, base({}));
    expect(resolveTarget(w, me, n)).toEqual({});
    const r = resolveTarget(w, me, n, { dir: { x: 3, y: 4 } })!;
    expect(r.dir!.x).toBeCloseTo(0.6);
    expect(r.dir!.y).toBeCloseTo(0.8);
  });

  it('pointSnap snaps the cast distance to the nearest step', () => {
    const w = makeWorld();
    const me = spawnDummy(w, { kind: 'hero', pos: { x: 1500, y: 5000 } });
    const ab = give(w, me, base({ targetType: 'point', castRange: [700], pointSnap: [200, 450, 700] }));
    const a = resolveTarget(w, me, ab, { point: { x: 1500, y: 5000 - 330 } })!.point!;
    expect(dist(a, me.pos)).toBeCloseTo(450);
    expect(a.x).toBeCloseTo(1500);
    expect(a.y).toBeLessThan(5000);
    const b = resolveTarget(w, me, ab, { point: { x: 1600, y: 5000 } })!.point!;
    expect(b.x).toBeCloseTo(1700);
    expect(b.y).toBeCloseTo(5000);
    // 落点就在脚下时沿面向方向
    me.facing = 0;
    const c = resolveTarget(w, me, ab, { point: { x: 1500, y: 5000 } })!.point!;
    expect(c.x).toBeCloseTo(1700);
    // 只给方向（没有施法距离的吸附技能）：沿给定方向吸附
    let castAt: { x: number; y: number } | undefined;
    const noRange = give(w, me, base({ id: 'snap0', slot: 'W', targetType: 'point', pointSnap: [200, 450, 700], onCast: (ctx) => { castAt = ctx.target.point; } }));
    const e = resolveTarget(w, me, noRange, { dir: { x: 0, y: 1 } })!.point!;
    expect(e.x).toBeCloseTo(1500);
    expect(e.y).toBeCloseTo(5200);
    // 吸附技能原地就能放，不需要走过去
    w.issue(me.id, { type: 'cast', slot: 'W', target: { point: { x: 1500, y: 4300 } } });
    w.step();
    expect(me.pos).toEqual({ x: 1500, y: 5000 });
    expect(castAt?.y).toBeCloseTo(4300);
  });

  it('drag aiming snaps pointSnap abilities and uses values.radius for the circle', () => {
    const w = makeWorld();
    const me = spawnDummy(w, { kind: 'hero', pos: { x: 1500, y: 5000 } });
    const ab = give(w, me, base({ targetType: 'point', pointSnap: [200, 450, 700], values: { radius: [250] } }));
    const r = aimAbility(w, me, ab, { x: 1, y: 0 }, 0.5, false);
    expect(r.target?.point?.x).toBeCloseTo(1950);
    expect(r.indicator.kind === 'point' && r.indicator.radius).toBe(250);
    expect(r.indicator.range).toBe(700);
  });

  it('<key>PerLevel scales with hero level', () => {
    const w = makeWorld();
    const u = createHero(w, 'axe', Team.Radiant, false);
    u.hero!.level = 10;
    const ab = newAbilityInstance(base({ slot: 'innate', targetType: 'passive', values: { pct: [0.08], pctPerLevel: [0.02] } }));
    expect(ab.level).toBe(1);
    expect(abilityValue(u, ab, 'pct')).toBeCloseTo(0.28);
    u.hero!.level = 1;
    expect(abilityValue(u, ab, 'pct')).toBeCloseTo(0.1);
    const creep = spawnDummy(w, {});
    expect(abilityValue(creep, ab, 'pct')).toBeCloseTo(0.1);
  });

  it('castSpeed shortens the cast point', () => {
    const w = makeWorld();
    const me = spawnDummy(w, { kind: 'hero' });
    const ab = give(w, me, base({ castPoint: 0.65 }));
    expect(abilityCastPoint(me, ab)).toBeCloseTo(0.65);
    addModifier(w, me, { id: 'cs', stats: { castSpeed: 0.3 } });
    expect(me.stats.castSpeed).toBeCloseTo(0.3);
    expect(abilityCastPoint(me, ab)).toBeCloseTo(0.5);
    w.issue(me.id, { type: 'cast', slot: 'Q' });
    w.step();
    expect(me.cast?.timer).toBeCloseTo(0.5);
    const inst = newAbilityInstance(TEST_INNATE_INSTANT);
    expect(abilityCastPoint(me, inst)).toBe(0);
  });

  it('defaultToggled abilities switch on when first learned', () => {
    const w = makeWorld();
    const u = createHero(w, 'axe', Team.Radiant, false);
    const seen: boolean[] = [];
    const ab = newAbilityInstance(base({ id: 'tg', slot: 'W', targetType: 'toggle', defaultToggled: true, onToggle: (_c, on) => { seen.push(on); } }));
    u.abilities = u.abilities.filter((a) => a.def.slot !== 'W');
    u.abilities.push(ab);
    u.hero!.level = 5;
    u.hero!.skillPoints = 2;
    expect(learnAbility(w, u, 'W')).toBe(true);
    expect(ab.toggled).toBe(true);
    expect(seen).toEqual([true]);
    expect(learnAbility(w, u, 'W')).toBe(true);
    expect(seen).toEqual([true]);
  });
});
