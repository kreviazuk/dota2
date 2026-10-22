import { describe, it, expect } from 'vitest';
import { heroAt, makeWorld, runFor, spawnDummy } from '../helpers';
import { abilitiesCastInSkirmish } from '../heroAi';
import { createHero } from '../../src/sim/systems/heroes';
import { findModifier } from '../../src/sim/modifiers';
import { abilityCooldown, abilityManaCost, abilityValue } from '../../src/sim/systems/abilities';
import { applyControl } from '../../src/sim/status';
import { pickTalent, type TalentTier } from '../../src/sim/talents';
import { getHeroDef } from '../../src/sim/heroes/index';
import { LINA_RULES } from '../../src/ai/usage/lina';
import { SKILL_BUILDS, TALENT_BUILDS } from '../../src/ai/builds';
import { DIFFICULTY } from '../../src/ai/difficulty';
import { Team, type AbilitySlot } from '../../src/sim/core/types';
import type { World } from '../../src/sim/world';
import type { Unit } from '../../src/sim/entities/unit';
import type { AiCtx } from '../../src/ai/usage/types';

/** 不会还手的敌方木桩 */
const foe = (
  w: World, x: number, y: number, o: { kind?: 'hero' | 'creep' | 'building'; mr?: number; hp?: number } = {},
): Unit =>
  spawnDummy(w, {
    kind: o.kind ?? 'hero', team: Team.Dire, pos: { x, y },
    base: { damageMin: 0, damageMax: 0, magicResist: o.mr ?? 0, maxHp: o.hp ?? 1000 },
  });

const ALL = { Q: 4, W: 4, E: 4, R: 3 } as const;
const UP = { x: 0, y: -1 };

describe('Lina', () => {
  it('has 7.41f level-1 stats', () => {
    const w = makeWorld();
    const l = createHero(w, 'lina', Team.Radiant, false);
    w.step();
    expect(l.stats.maxHp).toBeCloseTo(560);
    expect(l.stats.maxMana).toBeCloseTo(411);
    expect(l.stats.armor).toBeCloseTo(3.5);
    expect(l.stats.damageMin).toBeCloseTo(49);
    expect(l.stats.damageMax).toBeCloseTo(57);
    expect(l.stats.hpRegen).toBeCloseTo(2.25);
    expect(l.stats.manaRegen).toBeCloseTo(1.4);
    expect(l.stats.attackInterval).toBeCloseTo(1.6 / 1.21, 3);
    expect(l.stats.attackRange).toBe(670);
    expect(l.stats.moveSpeed).toBe(290);
    const def = getHeroDef('lina');
    expect(def.name).toBe('莉娜');
    expect(def.abilities.map((a) => a.id)).toEqual([
      'lina_dragon_slave', 'lina_light_strike_array', 'lina_fiery_soul', 'lina_laguna_blade', 'lina_slow_burn',
    ]);
  });

  it('Dragon Slave pierces along 1075 with a width shrinking from 275 to 200', () => {
    const w = makeWorld();
    const l = heroAt(w, 'lina', { x: 1500, y: 5000 }, { levels: { Q: 4 } });
    const near = foe(w, 1500, 4800);
    const far = foe(w, 1500, 4100);
    // 900 处波宽约 212（半宽 106 + 半径 20）：横向 130 打不到
    const farSide = foe(w, 1630, 4100);
    // 100 处波宽约 268（半宽 134 + 半径 20）：横向 120 打得到
    const nearSide = foe(w, 1620, 4900);
    const building = foe(w, 1500, 4500, { kind: 'building' });
    // 终点 1075 之外（终点圆头半宽 100 + 半径 20 之外）
    const beyond = foe(w, 1500, 3780);
    w.issue(l.id, { type: 'cast', slot: 'Q', target: { dir: UP } });
    runFor(w, 0.3);
    expect(w.projectiles.length).toBe(0);
    runFor(w, 0.3);
    expect(w.projectiles.some((p) => p.visual === 'lina_dragon_slave')).toBe(true);
    runFor(w, 1);
    expect(near.hp).toBeLessThan(1000 - 244);
    expect(far.hp).toBeLessThan(1000 - 244);
    expect(nearSide.hp).toBeLessThan(1000 - 244);
    expect(farSide.hp).toBe(1000);
    expect(building.hp).toBe(1000);
    expect(beyond.hp).toBe(1000);
    expect(w.projectiles.length).toBe(0);
    expect(w.events.drain().some((e) => e.type === 'fx' && e.kind === 'lina_dragon_slave')).toBe(true);
  });

  it('Light Strike Array warns for 0.5 s, then damages and stuns in 250', () => {
    const w = makeWorld();
    const l = heroAt(w, 'lina', { x: 1500, y: 5000 }, { levels: { W: 4 } });
    const center = foe(w, 1500, 4500);
    const edge = foe(w, 1700, 4500);
    const outside = foe(w, 1790, 4500);
    w.issue(l.id, { type: 'cast', slot: 'W', target: { point: { x: 1500, y: 4500 } } });
    runFor(w, 0.5);
    expect(w.effects.some((e) => e.visual === 'lina_lsa' && !e.done)).toBe(true);
    runFor(w, 0.35);
    expect(center.hp).toBe(1000);
    expect(center.hasState('stunned')).toBe(false);
    runFor(w, 0.2);
    expect(center.hp).toBeCloseTo(1000 - 215);
    expect(edge.hp).toBeCloseTo(1000 - 215);
    expect(findModifier(center, 'status_stun')!.total).toBeCloseTo(2.4);
    expect(edge.hasState('stunned')).toBe(true);
    expect(outside.hp).toBe(1000);
    expect(outside.hasState('stunned')).toBe(false);
    expect(w.events.drain().some((e) => e.type === 'fx' && e.kind === 'lina_lsa' && e.radius === 250)).toBe(true);
  });

  it('Laguna Blade lands 0.25 s after the cast and smart-casts on a killable hero', () => {
    const w = makeWorld();
    const l = heroAt(w, 'lina', { x: 1500, y: 5000 }, { levels: { R: 3 } });
    const healthy = foe(w, 1500, 4600);
    const weak = foe(w, 1500, 4400);
    weak.hp = 300;
    w.issue(l.id, { type: 'cast', slot: 'R' });
    // 前摇 0.3 秒（第 10 个逻辑帧出手）
    runFor(w, 0.35);
    expect(w.events.drain().some((e) => e.type === 'fx' && e.kind === 'lina_laguna' && e.targetId === weak.id)).toBe(true);
    runFor(w, 0.15);
    expect(weak.hp).toBe(300);
    runFor(w, 0.15);
    expect(weak.alive).toBe(false);
    expect(healthy.hp).toBe(1000);
    // 没有能击杀的：最近的敌方英雄；伤害 760 × (1 + 技能增强)
    const w2 = makeWorld();
    const l2 = heroAt(w2, 'lina', { x: 1500, y: 5000 }, { levels: { R: 3 } });
    const close = foe(w2, 1500, 4600, { hp: 3000 });
    const tank = foe(w2, 1500, 4400, { hp: 3000 });
    w2.issue(l2.id, { type: 'cast', slot: 'R' });
    runFor(w2, 0.6);
    expect(close.hp).toBeCloseTo(3000 - 760 * (1 + l2.stats.spellAmp));
    expect(tank.hp).toBe(3000);
    expect(w2.events.drain().some((e) => e.type === 'fx' && e.kind === 'lina_laguna_hit')).toBe(true);
  });

  it('Slow Burn adds 64% of the pre-mitigation damage as magic damage over 4 s and merges burns', () => {
    const w = makeWorld();
    const l = heroAt(w, 'lina', { x: 1500, y: 5000 }, { levels: { Q: 4, E: 4 } });
    const t = foe(w, 1500, 4600, { mr: 0.25 });
    w.issue(l.id, { type: 'cast', slot: 'Q', target: { dir: UP } });
    runFor(w, 0.75);
    expect(t.hp).toBeCloseTo(1000 - 183.75);
    const burn = findModifier(t, 'lina_slow_burn_dot', l.id)!;
    expect(burn).toBeDefined();
    expect(burn.data.pool).toBeCloseTo(245 * 0.64);
    runFor(w, 4.5);
    expect(t.hp).toBeCloseTo(1000 - 183.75 - 117.6);
    expect(findModifier(t, 'lina_slow_burn_dot')).toBeUndefined();
    // 烧灼不触发炽魂（只有龙破斩那一次）
    expect(findModifier(l, 'lina_fiery_soul_stack')!.stacks).toBe(1);

    // 合并：第二次命中把伤害加进同一个池子，并把时间重置为满
    const w2 = makeWorld();
    const l2 = heroAt(w2, 'lina', { x: 1500, y: 5000 }, { levels: { Q: 4 } });
    const t2 = foe(w2, 1500, 4600, { mr: 0.25 });
    w2.issue(l2.id, { type: 'cast', slot: 'Q', target: { dir: UP } });
    runFor(w2, 0.75);
    runFor(w2, 2);
    const pool1 = findModifier(t2, 'lina_slow_burn_dot')!.data.pool;
    expect(pool1).toBeLessThan(245 * 0.64 - 1);
    l2.ability('Q')!.cooldown = 0;
    w2.issue(l2.id, { type: 'cast', slot: 'Q', target: { dir: UP } });
    runFor(w2, 0.75);
    const merged = findModifier(t2, 'lina_slow_burn_dot')!;
    expect(t2.modifiers.filter((m) => m.def.id === 'lina_slow_burn_dot').length).toBe(1);
    expect(merged.duration).toBeGreaterThan(3.6);
    runFor(w2, 5);
    expect(t2.hp).toBeCloseTo(1000 - 2 * 183.75 - 2 * 117.6);
  });

  it('Fiery Soul stacks per enemy hit up to 7 and refreshes for 16 s', () => {
    const w = makeWorld();
    const l = heroAt(w, 'lina', { x: 1500, y: 5000 }, { levels: { W: 4, E: 4 } });
    const ds = [foe(w, 1500, 4500, { hp: 5000 }), foe(w, 1550, 4500, { hp: 5000 }), foe(w, 1450, 4500, { hp: 5000 })];
    const as0 = l.stats.attackSpeed;
    const ms0 = l.stats.moveSpeed;
    w.issue(l.id, { type: 'cast', slot: 'W', target: { point: { x: 1500, y: 4500 } } });
    runFor(w, 1.1);
    const stack = findModifier(l, 'lina_fiery_soul_stack')!;
    expect(stack.stacks).toBe(3);
    expect(l.stats.attackSpeed).toBeCloseTo(as0 + 84);
    expect(l.stats.moveSpeed).toBeCloseTo(ms0 * 1.075);
    expect(l.ability('E')!.def.counter!(l, l.ability('E')!)).toBe(3);
    expect(l.ability('W')!.def.counter).toBeUndefined();
    for (let i = 0; i < 2; i++) {
      l.ability('W')!.cooldown = 0;
      l.mana = l.stats.maxMana;
      w.issue(l.id, { type: 'cast', slot: 'W', target: { point: { x: 1500, y: 4500 } } });
      runFor(w, 1.1);
    }
    expect(findModifier(l, 'lina_fiery_soul_stack')!.stacks).toBe(7);
    expect(l.stats.attackSpeed).toBeCloseTo(as0 + 196);
    // 最后一次命中后 16 秒消失
    runFor(w, 15.5);
    expect(findModifier(l, 'lina_fiery_soul_stack')).toBeDefined();
    runFor(w, 0.6);
    expect(findModifier(l, 'lina_fiery_soul_stack')).toBeUndefined();
    expect(l.stats.attackSpeed).toBeCloseTo(as0);
    void ds;
  });

  it('Fiery Soul is disabled by Break', () => {
    const w = makeWorld();
    const l = heroAt(w, 'lina', { x: 1500, y: 5000 }, { levels: { W: 4, E: 4 } });
    foe(w, 1500, 4500);
    const as0 = l.stats.attackSpeed;
    applyControl(w, l, 'break', { source: null, duration: 5 });
    w.issue(l.id, { type: 'cast', slot: 'W', target: { point: { x: 1500, y: 4500 } } });
    runFor(w, 1.1);
    expect(findModifier(l, 'lina_fiery_soul_stack')).toBeUndefined();
    expect(l.stats.attackSpeed).toBeCloseTo(as0);
  });
});

describe('Lina talents', () => {
  it('talents change the documented values', () => {
    const cases: { tier: TalentTier; side: 0 | 1; slot: AbilitySlot | 'innate'; key: string; before: number; after: number }[] = [
      { tier: 0, side: 1, slot: 'Q', key: 'cooldown', before: 8, after: 5 },
      { tier: 1, side: 0, slot: 'E', key: 'magicResist', before: 0, after: 0.05 },
      { tier: 1, side: 1, slot: 'W', key: 'damage', before: 215, after: 325 },
      { tier: 2, side: 0, slot: 'R', key: 'cooldown', before: 50, after: 30 },
      { tier: 2, side: 1, slot: 'E', key: 'attackSpeed', before: 28, after: 38 },
      { tier: 2, side: 1, slot: 'E', key: 'moveSpeed', before: 0.025, after: 0.035 },
      { tier: 3, side: 0, slot: 'innate', key: 'duration', before: 4, after: 5 },
      { tier: 3, side: 0, slot: 'innate', key: 'ratio', before: 0.64, after: 0.8 },
    ];
    const read = (l: Unit, slot: AbilitySlot | 'innate', key: string): number => {
      const ab = l.ability(slot)!;
      return key === 'cooldown' ? abilityCooldown(ab, l) : key === 'manaCost' ? abilityManaCost(ab, l) : abilityValue(l, ab, key);
    };
    for (const c of cases) {
      const w = makeWorld();
      const l = heroAt(w, 'lina', { x: 1500, y: 5000 }, { levels: ALL, heroLevel: 25 });
      expect(read(l, c.slot, c.key)).toBeCloseTo(c.before);
      expect(pickTalent(w, l, c.tier, c.side)).toBe(true);
      expect(read(l, c.slot, c.key)).toBeCloseTo(c.after);
    }
    // 10 级左：+25 攻击力
    const w = makeWorld();
    const l = heroAt(w, 'lina', { x: 1500, y: 5000 }, { levels: ALL, heroLevel: 25 });
    const dmg0 = l.stats.bonusDamage;
    pickTalent(w, l, 0, 0);
    expect(l.stats.bonusDamage).toBeCloseTo(dmg0 + 25);
    for (const pair of getHeroDef('lina').talents) for (const t of pair) expect(t.name.length).toBeGreaterThan(3);
  });

  it('talents change behaviour: magic resist per stack, longer and stronger burn, crit on burning targets', () => {
    // 15 级左：每层 +5% 魔抗
    const w = makeWorld();
    const l = heroAt(w, 'lina', { x: 1500, y: 5000 }, { levels: ALL, heroLevel: 25 });
    pickTalent(w, l, 1, 0);
    const mr0 = l.stats.magicResist;
    foe(w, 1500, 4500, { hp: 5000 });
    foe(w, 1550, 4500, { hp: 5000 });
    w.issue(l.id, { type: 'cast', slot: 'W', target: { point: { x: 1500, y: 4500 } } });
    runFor(w, 1.1);
    expect(findModifier(l, 'lina_fiery_soul_stack')!.stacks).toBe(2);
    expect(l.stats.magicResist).toBeCloseTo(1 - (1 - mr0) * (1 - 0.1));

    // 25 级左：烧灼 80%、持续 5 秒
    const w2 = makeWorld();
    const l2 = heroAt(w2, 'lina', { x: 1500, y: 5000 }, { levels: ALL, heroLevel: 25 });
    pickTalent(w2, l2, 3, 0);
    const t2 = foe(w2, 1500, 4600);
    w2.issue(l2.id, { type: 'cast', slot: 'Q', target: { dir: UP } });
    runFor(w2, 0.75);
    const amp = 1 + l2.stats.spellAmp;
    const burn = findModifier(t2, 'lina_slow_burn_dot')!;
    expect(burn.data.pool).toBeCloseTo(245 * amp * 0.8);
    expect(burn.total).toBeCloseTo(5);
    runFor(w2, 5.5);
    expect(t2.hp).toBeCloseTo(1000 - 245 * amp * 1.8);

    // 25 级右：普攻对慢热中的目标 150% 暴击
    const w3 = makeWorld();
    const l3 = heroAt(w3, 'lina', { x: 1500, y: 5000 }, { levels: ALL, heroLevel: 25 });
    pickTalent(w3, l3, 3, 1);
    const t3 = foe(w3, 1500, 4500, { hp: 5000 });
    l3.order = { kind: 'attack', targetId: t3.id, persistent: true };
    runFor(w3, 1.5);
    const before = w3.events.drain().filter((e) => e.type === 'damage' && e.isAttack && e.targetId === t3.id);
    expect(before.length).toBeGreaterThan(0);
    expect(before.every((e) => e.type === 'damage' && !e.crit)).toBe(true);
    l3.order = { kind: 'idle' };
    w3.issue(l3.id, { type: 'cast', slot: 'Q', target: { dir: UP } });
    runFor(w3, 1);
    expect(findModifier(t3, 'lina_slow_burn_dot', l3.id)).toBeDefined();
    w3.events.drain();
    l3.order = { kind: 'attack', targetId: t3.id, persistent: true };
    runFor(w3, 1.5);
    const after = w3.events.drain().filter((e) => e.type === 'damage' && e.isAttack && e.targetId === t3.id);
    expect(after.length).toBeGreaterThan(0);
    expect(after.every((e) => e.type === 'damage' && e.crit)).toBe(true);
  });
});

describe('Lina AI', () => {
  it('builds and talents follow the plan', () => {
    expect(SKILL_BUILDS.lina).toEqual(['Q', 'W', 'Q', 'E', 'Q', 'R', 'Q', 'W', 'W', 'W', 'R', 'E', 'E', 'E', 'R']);
    expect(TALENT_BUILDS.lina).toEqual([1, 1, 0, 0]);
  });

  const ctxFor = (w: World, me: Unit, slot: AbilitySlot, enemies: Unit[], allies: Unit[] = []): AiCtx => ({
    world: w, me, ab: me.ability(slot)!, skill: DIFFICULTY.normal.skill, enemyHeroes: enemies, allyHeroes: allies,
    hpPct: me.hp / me.stats.maxHp, manaPct: me.mana / me.stats.maxMana, retreating: false,
  });

  it('Dragon Slave aims at the nearest hero, or at a line of at least 3 creeps', () => {
    const w = makeWorld();
    const l = heroAt(w, 'lina', { x: 1500, y: 5000 }, { levels: ALL });
    const h = foe(w, 1800, 4400);
    w.step();
    const Q = LINA_RULES.lina_dragon_slave;
    const d = Q.decide(ctxFor(w, l, 'Q', [h]));
    expect(d && 'cast' in d && d.cast.dir).toBeTruthy();
    const dir = (d as { cast: { dir: { x: number; y: number } } }).cast.dir;
    expect(dir.x / Math.hypot(dir.x, dir.y)).toBeCloseTo(300 / Math.hypot(300, 600), 1);
    // 太远的英雄：不放；小兵排成一列（≥ 3 个）且魔法 > 50%：放
    const w2 = makeWorld();
    const l2 = heroAt(w2, 'lina', { x: 1500, y: 5000 }, { levels: ALL });
    const farHero = foe(w2, 1500, 3700);
    w2.step();
    expect(Q.decide(ctxFor(w2, l2, 'Q', [farHero]))).toBeNull();
    for (const y of [4700, 4550, 4400]) foe(w2, 1500, y, { kind: 'creep' });
    w2.step();
    expect(Q.decide(ctxFor(w2, l2, 'Q', [farHero]))).not.toBeNull();
    l2.mana = l2.stats.maxMana * 0.4;
    expect(Q.decide(ctxFor(w2, l2, 'Q', [farHero]))).toBeNull();
  });

  it('Light Strike Array goes under a disabled hero first', () => {
    const w = makeWorld();
    const l = heroAt(w, 'lina', { x: 1500, y: 5000 }, { levels: ALL });
    const a = foe(w, 1500, 4600);
    const b = foe(w, 1800, 4500);
    applyControl(w, b, 'stun', { source: null, duration: 2 });
    w.step();
    const W = LINA_RULES.lina_light_strike_array;
    expect(W.decide(ctxFor(w, l, 'W', [a, b]))).toEqual({ cast: { point: { x: 1800, y: 4500 } } });
    const d = W.decide(ctxFor(w, l, 'W', [a]));
    expect(d && 'cast' in d && d.cast.point).toBeTruthy();
  });

  it('Laguna Blade goes for kills or low heroes it is fighting', () => {
    const w = makeWorld();
    const l = heroAt(w, 'lina', { x: 1500, y: 5000 }, { levels: ALL });
    const healthy = foe(w, 1500, 4600, { hp: 3000 });
    w.step();
    const R = LINA_RULES.lina_laguna_blade;
    expect(R.priority).toBe(30);
    expect(R.decide(ctxFor(w, l, 'R', [healthy]))).toBeNull();
    const weak = foe(w, 1600, 4500);
    weak.hp = 400;
    w.step();
    expect(R.decide(ctxFor(w, l, 'R', [healthy, weak]))).toEqual({ cast: { unitId: weak.id } });
    // 血量 < 40% 且正在交战（打不死）
    const w2 = makeWorld();
    const l2 = heroAt(w2, 'lina', { x: 1500, y: 5000 }, { levels: ALL });
    const big = foe(w2, 1500, 4600, { hp: 5000 });
    big.hp = 1900;
    w2.step();
    expect(R.decide(ctxFor(w2, l2, 'R', [big]))).toBeNull();
    l2.order = { kind: 'attack', targetId: big.id, persistent: true };
    expect(R.decide(ctxFor(w2, l2, 'R', [big]))).toEqual({ cast: { unitId: big.id } });
  });

  it('AI uses every active ability in a skirmish', () => {
    const cast = abilitiesCastInSkirmish('lina');
    for (const id of ['lina_dragon_slave', 'lina_light_strike_array', 'lina_laguna_blade']) expect(cast).toContain(id);
  }, 60000);
});
