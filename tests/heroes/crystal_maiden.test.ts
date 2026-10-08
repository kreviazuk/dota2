import { describe, it, expect } from 'vitest';
import { heroAt, makeWorld, runFor, spawnDummy } from '../helpers';
import { abilitiesCastInSkirmish } from '../heroAi';
import { createHero } from '../../src/sim/systems/heroes';
import { findModifier } from '../../src/sim/modifiers';
import { applyDamage } from '../../src/sim/systems/damage';
import { abilityCastRange, abilityCooldown, abilityManaCost, abilityValue } from '../../src/sim/systems/abilities';
import { applyControl } from '../../src/sim/status';
import { shieldTotal } from '../../src/sim/shields';
import { pickTalent, type TalentTier } from '../../src/sim/talents';
import { getHeroDef } from '../../src/sim/heroes/index';
import { CM_RULES } from '../../src/ai/usage/crystal_maiden';
import { SKILL_BUILDS, TALENT_BUILDS } from '../../src/ai/builds';
import { DIFFICULTY } from '../../src/ai/difficulty';
import { dist } from '../../src/sim/core/vec2';
import { Team, type AbilitySlot } from '../../src/sim/core/types';
import type { World } from '../../src/sim/world';
import type { Unit } from '../../src/sim/entities/unit';
import type { AiCtx } from '../../src/ai/usage/types';

/** 不会还手的敌方木桩；给了 range 的是远程（普攻有弹道，D28） */
const foe = (
  w: World, x: number, y: number, o: { kind?: 'hero' | 'creep' | 'building'; hp?: number; range?: number } = {},
): Unit =>
  spawnDummy(w, {
    kind: o.kind ?? 'hero', team: Team.Dire, pos: { x, y },
    base: { damageMin: 0, damageMax: 0, maxHp: o.hp ?? 1000, attackRange: o.range ?? 150, projectileSpeed: o.range ? 900 : 0 },
  });

const ALL = { Q: 4, W: 4, E: 4, R: 3 } as const;
const CM = 'crystal_maiden';
const castEvents = (w: World, id: number): string[] =>
  w.events.drain().flatMap((e) => (e.type === 'cast' && e.unitId === id ? [e.abilityId] : []));

describe('Crystal Maiden', () => {
  it('has 7.41f level-1 stats', () => {
    const w = makeWorld();
    const c = createHero(w, CM, Team.Radiant, false);
    w.step();
    expect(c.stats.maxHp).toBeCloseTo(494);
    expect(c.stats.maxMana).toBeCloseTo(315);
    expect(c.stats.armor).toBeCloseTo(2.67, 2);
    expect(c.stats.damageMin).toBeCloseTo(48);
    expect(c.stats.damageMax).toBeCloseTo(54);
    expect(c.stats.hpRegen).toBeCloseTo(1.95);
    expect(c.stats.manaRegen).toBeCloseTo(1.0);
    expect(c.stats.attackInterval).toBeCloseTo(1.7 / 1.16, 3);
    expect(c.stats.attackRange).toBe(600);
    expect(c.stats.moveSpeed).toBe(280);
    const def = getHeroDef(CM);
    expect(def.name).toBe('水晶室女');
    expect(def.title).toBe('莉莉丝');
    expect(def.abilities.map((a) => a.id)).toEqual([
      'cm_crystal_nova', 'cm_frostbite', 'cm_arcane_aura', 'cm_freezing_field', 'cm_glacial_guard',
    ]);
  });

  it('Crystal Nova damages and slows enemies within 425 for 4 s', () => {
    const w = makeWorld();
    const c = heroAt(w, CM, { x: 1500, y: 5000 }, { levels: { Q: 4 } });
    const inside = foe(w, 1900, 4500);
    const outside = foe(w, 1050, 4500);
    const creep = foe(w, 1500, 4300, { kind: 'creep' });
    const building = foe(w, 1500, 4600, { kind: 'building' });
    w.issue(c.id, { type: 'cast', slot: 'Q', target: { point: { x: 1500, y: 4500 } } });
    runFor(w, 0.25);
    expect(inside.hp).toBe(1000);
    runFor(w, 0.1);
    expect(inside.hp).toBeCloseTo(1000 - 260);
    expect(creep.hp).toBeCloseTo(1000 - 260);
    expect(inside.stats.moveSpeed).toBeCloseTo(150);
    expect(inside.stats.attackSpeed).toBeCloseTo(25);
    expect(findModifier(inside, 'slow_cm_nova')!.total).toBeCloseTo(4);
    expect(outside.hp).toBe(1000);
    expect(outside.stats.moveSpeed).toBeCloseTo(300);
    expect(building.hp).toBe(1000);
    expect(w.events.drain().some((e) => e.type === 'fx' && e.kind === 'cm_nova' && e.radius === 425)).toBe(true);
    runFor(w, 4.1);
    expect(inside.stats.moveSpeed).toBeCloseTo(300);
    expect(inside.stats.attackSpeed).toBeCloseTo(100);
  });

  it('Frostbite roots and disarms, deals 100 dps, and 4× against creeps', () => {
    const w = makeWorld();
    const c = heroAt(w, CM, { x: 1500, y: 5000 }, { levels: { W: 4 } });
    const t = foe(w, 1500, 4600);
    w.issue(c.id, { type: 'cast', slot: 'W', target: { unitId: t.id } });
    runFor(w, 0.35);
    const m = findModifier(t, 'cm_frostbite')!;
    expect(m.total).toBeCloseTo(3);
    expect(t.hasState('rooted')).toBe(true);
    expect(t.hasState('disarmed')).toBe(true);
    expect(w.events.drain().some((e) => e.type === 'fx' && e.kind === 'cm_frostbite' && e.targetId === t.id)).toBe(true);
    runFor(w, 3.1);
    expect(t.hp).toBeCloseTo(1000 - 300);
    expect(findModifier(t, 'cm_frostbite')).toBeUndefined();
    expect(t.hasState('rooted')).toBe(false);

    // 小兵：每跳 × 4
    const w2 = makeWorld();
    const c2 = heroAt(w2, CM, { x: 1500, y: 5000 }, { levels: { W: 4 } });
    const cr = foe(w2, 1500, 4600, { kind: 'creep', hp: 5000 });
    w2.issue(c2.id, { type: 'cast', slot: 'W', target: { unitId: cr.id } });
    runFor(w2, 3.5);
    expect(cr.hp).toBeCloseTo(5000 - 1200);

    // 被冻住的英雄不能移动、不能攻击，但能施法
    const w3 = makeWorld();
    const c3 = heroAt(w3, CM, { x: 1500, y: 5000 }, { levels: { W: 4 } });
    const enemy = heroAt(w3, CM, { x: 1500, y: 4600 }, { levels: { Q: 1 }, team: Team.Dire });
    w3.issue(c3.id, { type: 'cast', slot: 'W', target: { unitId: enemy.id } });
    runFor(w3, 0.35);
    expect(enemy.hasState('rooted')).toBe(true);
    const p0 = { ...enemy.pos };
    w3.issue(enemy.id, { type: 'move', dir: { x: 1, y: 0 } });
    runFor(w3, 0.5);
    expect(dist(enemy.pos, p0)).toBeLessThan(1);
    w3.events.drain();
    w3.issue(enemy.id, { type: 'attack', mode: 'smart', targetId: c3.id });
    runFor(w3, 1);
    expect(w3.events.drain().some((e) => e.type === 'damage' && e.isAttack && e.targetId === c3.id)).toBe(false);
    w3.issue(enemy.id, { type: 'cast', slot: 'Q', target: { point: { x: 1500, y: 4900 } } });
    runFor(w3, 0.5);
    expect(castEvents(w3, enemy.id)).toContain('cm_crystal_nova');
  });

  it('Arcane Aura: global mana regen for allied heroes, ×3 within 1200, and amplifies her own regen', () => {
    const w = makeWorld();
    const c = heroAt(w, CM, { x: 1500, y: 5000 }, { levels: { E: 4 }, heroLevel: 1 });
    const near = spawnDummy(w, { kind: 'hero', team: Team.Radiant, pos: { x: 1500, y: 4000 }, base: { manaRegen: 0 } });
    const far = spawnDummy(w, { kind: 'hero', team: Team.Radiant, pos: { x: 1500, y: 100 }, base: { manaRegen: 0 } });
    const creep = spawnDummy(w, { kind: 'creep', team: Team.Radiant, pos: { x: 1600, y: 5000 }, base: { manaRegen: 0 } });
    const enemy = spawnDummy(w, { kind: 'hero', team: Team.Dire, pos: { x: 1400, y: 5000 }, base: { manaRegen: 0 } });
    runFor(w, 0.1);
    expect(near.stats.manaRegen).toBeCloseTo(3.0);
    expect(far.stats.manaRegen).toBeCloseTo(1.0);
    expect(creep.stats.manaRegen).toBeCloseTo(0);
    expect(enemy.stats.manaRegen).toBeCloseTo(0);
    expect(c.stats.manaRegen).toBeCloseTo((1.0 + 3.0) * 1.8);
    // 走远后变成 1 倍
    near.pos = { x: 1500, y: 3000 };
    runFor(w, 0.1);
    expect(near.stats.manaRegen).toBeCloseTo(1.0);
  });

  it('Freezing Field explodes at random spots in its ring for 10 s, slows enemies, and stops when she moves', () => {
    const w = makeWorld(7);
    const c = heroAt(w, CM, { x: 1500, y: 5000 }, { levels: { R: 1 } });
    const t = foe(w, 1500, 4500, { hp: 20000 });
    const outside = foe(w, 1500, 4000, { hp: 20000 });
    const center = { ...c.pos };
    w.events.drain();
    w.issue(c.id, { type: 'cast', slot: 'R' });
    runFor(w, 2);
    expect(c.cast?.phase).toBe('channel');
    expect(findModifier(c, 'cm_freezing_field')).toBeDefined();
    expect(t.hp).toBeLessThan(20000);
    expect(t.stats.moveSpeed).toBeCloseTo(300 * 0.6);
    expect(t.stats.attackSpeed).toBeCloseTo(100 - 80);
    expect(outside.stats.moveSpeed).toBeCloseTo(300);
    const blasts = w.events.drain().flatMap((e) => (e.type === 'fx' && e.kind === 'cm_ff_blast' ? [e] : []));
    expect(blasts.length).toBeGreaterThanOrEqual(19);
    expect(blasts.length).toBeLessThanOrEqual(21);
    for (const b of blasts) {
      const d = dist(b.pos, center);
      expect(d).toBeGreaterThanOrEqual(195 - 1e-6);
      expect(d).toBeLessThanOrEqual(785 + 1e-6);
      expect(b.radius).toBe(320);
    }
    // 不同的落点（随机）
    expect(new Set(blasts.map((b) => Math.round(b.pos.x))).size).toBeGreaterThan(10);
    // 移动打断引导
    w.issue(c.id, { type: 'move', dir: { x: 1, y: 0 } });
    w.step();
    expect(c.cast).toBeNull();
    expect(findModifier(c, 'cm_freezing_field')).toBeUndefined();
    const hp = t.hp;
    runFor(w, 0.6);
    expect(t.stats.moveSpeed).toBeCloseTo(300);
    expect(t.hp).toBe(hp);
    expect(w.events.drain().some((e) => e.type === 'fx' && e.kind === 'cm_ff_blast')).toBe(false);
  });

  it('Freezing Field lasts 10 s when uninterrupted', () => {
    const w = makeWorld();
    const c = heroAt(w, CM, { x: 1500, y: 5000 }, { levels: { R: 3 } });
    w.events.drain();
    w.issue(c.id, { type: 'cast', slot: 'R' });
    runFor(w, 9.9);
    expect(c.cast?.phase).toBe('channel');
    runFor(w, 0.2);
    expect(c.cast).toBeNull();
    expect(findModifier(c, 'cm_freezing_field')).toBeUndefined();
    expect(w.events.drain().filter((e) => e.type === 'fx' && e.kind === 'cm_ff_blast').length).toBe(100);
  });

  it('Glacial Guard turns mana spent into stacking physical shields for 8 s', () => {
    const w = makeWorld();
    const c = heroAt(w, CM, { x: 1500, y: 5000 }, { levels: { Q: 1 }, heroLevel: 1 });
    const gg = c.ability('innate')!;
    expect(gg.def.counter!(c, gg)).toBeNull();
    w.issue(c.id, { type: 'cast', slot: 'Q', target: { point: { x: 1500, y: 4500 } } });
    runFor(w, 0.35);
    expect(shieldTotal(c, 'physical')).toBeCloseTo(115 * 0.32);
    expect(shieldTotal(c, 'magical')).toBeCloseTo(0);
    expect(gg.def.counter!(c, gg)).toBe(37);
    // 物理攻击被吸收
    const hp0 = c.hp;
    const attacker = foe(w, 1500, 4900);
    applyDamage(w, { source: attacker, target: c, amount: 10, type: 'physical', isAttack: true });
    expect(c.hp).toBeCloseTo(hp0);
    expect(shieldTotal(c)).toBeLessThan(36.8);
    expect(shieldTotal(c)).toBeGreaterThan(25);
    // 魔法伤害不吸收
    const s1 = shieldTotal(c);
    applyDamage(w, { source: attacker, target: c, amount: 10, type: 'magical', isAttack: false });
    expect(c.hp).toBeLessThan(hp0);
    expect(shieldTotal(c)).toBeCloseTo(s1);
    // 第二次施法叠加
    c.ability('Q')!.cooldown = 0;
    c.mana = c.stats.maxMana;
    w.issue(c.id, { type: 'cast', slot: 'Q', target: { point: { x: 1500, y: 4500 } } });
    runFor(w, 0.35);
    expect(shieldTotal(c)).toBeCloseTo(s1 + 36.8);
    expect(c.modifiers.filter((m) => m.def.id === 'cm_glacial_guard').length).toBe(2);
    // 第一个在施放 8 秒后消失，第二个稍后
    runFor(w, 7.75);
    expect(shieldTotal(c)).toBeCloseTo(36.8);
    runFor(w, 0.4);
    expect(shieldTotal(c)).toBeCloseTo(0);
    expect(gg.def.counter!(c, gg)).toBeNull();
  });
});

describe('Crystal Maiden talents', () => {
  it('talents change the documented values', () => {
    const cases: { tier: TalentTier; side: 0 | 1; slot: AbilitySlot | 'innate'; key: string; before: number; after: number }[] = [
      { tier: 1, side: 0, slot: 'W', key: 'castRange', before: 600, after: 700 },
      { tier: 1, side: 1, slot: 'Q', key: 'cooldown', before: 8, after: 3.5 },
      { tier: 2, side: 0, slot: 'innate', key: 'ratio', before: 0.3 + 0.02 * 25, after: 0.5 + 0.02 * 25 },
      { tier: 2, side: 1, slot: 'R', key: 'damage', before: 250, after: 300 },
      { tier: 3, side: 0, slot: 'W', key: 'duration', before: 3, after: 4 },
      { tier: 3, side: 1, slot: 'Q', key: 'damage', before: 260, after: 560 },
    ];
    const read = (u: Unit, slot: AbilitySlot | 'innate', key: string): number => {
      const ab = u.ability(slot)!;
      if (key === 'cooldown') return abilityCooldown(ab, u);
      if (key === 'manaCost') return abilityManaCost(ab, u);
      if (key === 'castRange') return abilityCastRange(u, ab);
      return abilityValue(u, ab, key);
    };
    for (const c of cases) {
      const w = makeWorld();
      const u = heroAt(w, CM, { x: 1500, y: 5000 }, { levels: ALL, heroLevel: 25 });
      expect(read(u, c.slot, c.key)).toBeCloseTo(c.before);
      expect(pickTalent(w, u, c.tier, c.side)).toBe(true);
      expect(read(u, c.slot, c.key)).toBeCloseTo(c.after);
    }
    // 10 级：+200 生命 / +12 智力
    const w = makeWorld();
    const u = heroAt(w, CM, { x: 1500, y: 5000 }, { levels: ALL, heroLevel: 25 });
    const hp0 = u.stats.maxHp;
    pickTalent(w, u, 0, 0);
    expect(u.stats.maxHp).toBeCloseTo(hp0 + 200);
    const w2 = makeWorld();
    const u2 = heroAt(w2, CM, { x: 1500, y: 5000 }, { levels: ALL, heroLevel: 25 });
    const int0 = u2.stats.int;
    pickTalent(w2, u2, 0, 1);
    expect(u2.stats.int).toBeCloseTo(int0 + 12);
    for (const pair of getHeroDef(CM).talents) for (const t of pair) expect(t.name.length).toBeGreaterThan(3);
  });

  it('talents change behaviour: longer Frostbite, bigger shields', () => {
    const w = makeWorld();
    const c = heroAt(w, CM, { x: 1500, y: 5000 }, { levels: ALL, heroLevel: 25 });
    pickTalent(w, c, 3, 0);
    const t = foe(w, 1500, 4600, { hp: 5000 });
    w.issue(c.id, { type: 'cast', slot: 'W', target: { unitId: t.id } });
    runFor(w, 4.5);
    expect(t.hp).toBeCloseTo(5000 - 400);

    const w2 = makeWorld();
    const c2 = heroAt(w2, CM, { x: 1500, y: 5000 }, { levels: ALL, heroLevel: 25 });
    pickTalent(w2, c2, 2, 0);
    w2.issue(c2.id, { type: 'cast', slot: 'Q', target: { point: { x: 1500, y: 4500 } } });
    runFor(w2, 0.35);
    expect(shieldTotal(c2, 'physical')).toBeCloseTo(175 * 1.0);
  });
});

describe('Crystal Maiden AI', () => {
  it('builds and talents follow the plan', () => {
    expect(SKILL_BUILDS.crystal_maiden).toEqual(['W', 'Q', 'E', 'Q', 'Q', 'R', 'Q', 'W', 'W', 'W', 'R', 'E', 'E', 'E', 'R']);
    expect(TALENT_BUILDS.crystal_maiden).toEqual([0, 1, 1, 1]);
  });

  const ctxFor = (w: World, me: Unit, slot: AbilitySlot, enemies: Unit[], allies: Unit[] = [], retreating = false): AiCtx => ({
    world: w, me, ab: me.ability(slot)!, skill: DIFFICULTY.normal.skill, enemyHeroes: enemies, allyHeroes: allies,
    hpPct: me.hp / me.stats.maxHp, manaPct: me.mana / me.stats.maxMana, retreating,
  });

  it('Crystal Nova covers a hero, or at least 3 units with mana above 50%', () => {
    const w = makeWorld();
    const c = heroAt(w, CM, { x: 1500, y: 5000 }, { levels: ALL });
    const h = foe(w, 1500, 4400);
    w.step();
    const Q = CM_RULES.cm_crystal_nova;
    expect(Q.decide(ctxFor(w, c, 'Q', [h]))).toEqual({ cast: { point: { x: 1500, y: 4400 } } });
    // 只有两个小兵：不放；三个：放；魔法不足一半：不放
    const w2 = makeWorld();
    const c2 = heroAt(w2, CM, { x: 1500, y: 5000 }, { levels: ALL });
    foe(w2, 1500, 4500, { kind: 'creep' });
    foe(w2, 1600, 4500, { kind: 'creep' });
    w2.step();
    expect(Q.decide(ctxFor(w2, c2, 'Q', []))).toBeNull();
    foe(w2, 1400, 4500, { kind: 'creep' });
    w2.step();
    expect(Q.decide(ctxFor(w2, c2, 'Q', []))).not.toBeNull();
    c2.mana = c2.stats.maxMana * 0.4;
    expect(Q.decide(ctxFor(w2, c2, 'Q', []))).toBeNull();
  });

  it('Frostbite prefers channelling heroes, then the nearest melee hero, and freezes chasers when retreating', () => {
    const w = makeWorld();
    const c = heroAt(w, CM, { x: 1500, y: 5000 }, { levels: ALL });
    const melee = foe(w, 1500, 4700);
    const ranged = foe(w, 1500, 4600, { range: 600 });
    const caster = heroAt(w, CM, { x: 1700, y: 4500 }, { levels: ALL, team: Team.Dire });
    w.step();
    const W = CM_RULES.cm_frostbite;
    expect(W.priority).toBe(15);
    expect(W.escape).toBe(true);
    expect(W.decide(ctxFor(w, c, 'W', [melee, ranged, caster]))).toEqual({ cast: { unitId: melee.id } });
    expect(W.decide(ctxFor(w, c, 'W', [ranged]))).toBeNull();
    // 攻击距离不到 400 的远程英雄（宙斯 380）也不算近战
    const shortRanged = foe(w, 1450, 4700, { range: 380 });
    expect(W.decide(ctxFor(w, c, 'W', [shortRanged]))).toBeNull();
    w.issue(caster.id, { type: 'cast', slot: 'R' });
    w.step();
    expect(caster.cast?.phase).toBe('channel');
    expect(W.decide(ctxFor(w, c, 'W', [melee, ranged, caster]))).toEqual({ cast: { unitId: caster.id } });
    // 撤退：400 内的敌方英雄（远程也冻）
    const w2 = makeWorld();
    const c2 = heroAt(w2, CM, { x: 1500, y: 5000 }, { levels: ALL });
    const chaser = foe(w2, 1500, 4700, { range: 600 });
    const farOne = foe(w2, 1500, 4400);
    w2.step();
    expect(W.decide(ctxFor(w2, c2, 'W', [chaser, farOne], [], true))).toEqual({ cast: { unitId: chaser.id } });
    expect(W.decide(ctxFor(w2, c2, 'W', [farOne], [], true))).toBeNull();
  });

  it('Freezing Field needs two heroes in 600, or a disabled hero in 450 with an ally nearby, and healthy CM', () => {
    const w = makeWorld();
    const c = heroAt(w, CM, { x: 1500, y: 5000 }, { levels: ALL });
    const a = foe(w, 1500, 4600);
    const b = foe(w, 1700, 4700);
    w.step();
    const R = CM_RULES.cm_freezing_field;
    expect(R.priority).toBe(30);
    expect(R.decide(ctxFor(w, c, 'R', [a]))).toBeNull();
    expect(R.decide(ctxFor(w, c, 'R', [a, b]))).toEqual({ cast: {} });
    c.hp = c.stats.maxHp * 0.3;
    expect(R.decide(ctxFor(w, c, 'R', [a, b]))).toBeNull();
    c.hp = c.stats.maxHp;
    // 一个被眩晕的英雄 + 800 内有友方英雄
    const ally = spawnDummy(w, { kind: 'hero', team: Team.Radiant, pos: { x: 1300, y: 5200 } });
    applyControl(w, a, 'stun', { source: null, duration: 2 });
    w.step();
    expect(R.decide(ctxFor(w, c, 'R', [a]))).toBeNull();
    expect(R.decide(ctxFor(w, c, 'R', [a], [ally]))).toEqual({ cast: {} });
  });

  it('AI uses every active ability in a skirmish', () => {
    const cast = abilitiesCastInSkirmish(CM);
    for (const id of ['cm_crystal_nova', 'cm_frostbite', 'cm_freezing_field']) expect(cast).toContain(id);
  }, 60000);
});
