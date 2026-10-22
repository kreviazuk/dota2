import { describe, it, expect } from 'vitest';
import { heroAt, makeWorld, runFor, spawnDummy } from '../helpers';
import { abilitiesCastInSkirmish } from '../heroAi';
import { createHero } from '../../src/sim/systems/heroes';
import { findModifier } from '../../src/sim/modifiers';
import { killUnit } from '../../src/sim/systems/damage';
import { abilityCooldown, abilityManaCost, abilityValue } from '../../src/sim/systems/abilities';
import { applyControl, applySlow } from '../../src/sim/status';
import { pickTalent, type TalentTier } from '../../src/sim/talents';
import { setHeroLevel } from '../../src/game/debug';
import { getHeroDef } from '../../src/sim/heroes/index';
import { SVEN_RULES } from '../../src/ai/usage/sven';
import { SKILL_BUILDS, TALENT_BUILDS } from '../../src/ai/builds';
import { DIFFICULTY } from '../../src/ai/difficulty';
import { Team, type AbilitySlot } from '../../src/sim/core/types';
import type { World } from '../../src/sim/world';
import type { Unit } from '../../src/sim/entities/unit';
import type { AiCtx } from '../../src/ai/usage/types';

/** 不会还手的敌方木桩 */
const foe = (w: World, x: number, y: number, o: { kind?: 'hero' | 'creep' | 'building'; armor?: number } = {}): Unit =>
  spawnDummy(w, { kind: o.kind ?? 'hero', team: Team.Dire, pos: { x, y }, base: { damageMin: 0, damageMax: 0, armor: o.armor ?? 0 } });

const ALL = { Q: 4, W: 4, E: 4, R: 3 } as const;

describe('Sven', () => {
  it('has 7.41f level-1 stats', () => {
    const w = makeWorld();
    const s = createHero(w, 'sven', Team.Radiant, false);
    w.step();
    expect(s.stats.maxHp).toBeCloseTo(648);
    expect(s.stats.maxMana).toBeCloseTo(267);
    expect(s.stats.armor).toBeCloseTo(3);
    expect(s.stats.damageMin).toBeCloseTo(61);
    expect(s.stats.damageMax).toBeCloseTo(63);
    expect(s.stats.hpRegen).toBeCloseTo(3.15);
    expect(s.stats.manaRegen).toBeCloseTo(0.8);
    expect(s.stats.attackInterval).toBeCloseTo(1.484, 3);
    expect(s.stats.attackRange).toBe(150);
    expect(s.stats.moveSpeed).toBe(325);
    const def = getHeroDef('sven');
    expect(def.name).toBe('斯温');
    expect(def.abilities.map((a) => a.id)).toEqual(['sven_storm_hammer', 'sven_great_cleave', 'sven_warcry', 'sven_gods_strength', 'sven_wrath_of_god']);
  });

  it('Wrath of God adds 0.08 + 0.02 × level damage per strength', () => {
    const w = makeWorld();
    const s = createHero(w, 'sven', Team.Radiant, false);
    w.step();
    expect(s.stats.bonusDamage).toBeCloseTo(2.4);
    setHeroLevel(w, s, 10, { learn: 'none', talents: false });
    w.step();
    expect(s.stats.str).toBeCloseTo(55.5);
    expect(s.stats.bonusDamage).toBeCloseTo(15.54);
    // 被破坏时无效
    applyControl(w, s, 'break', { source: null, duration: 1 });
    w.step();
    expect(s.stats.bonusDamage).toBeCloseTo(0);
    runFor(w, 1.1);
    expect(s.stats.bonusDamage).toBeCloseTo(15.54);
  });

  it('Storm Hammer flies to its target, then stuns and damages every enemy around it', () => {
    const w = makeWorld();
    const s = heroAt(w, 'sven', { x: 1500, y: 5000 }, { levels: { Q: 4 } });
    const t = foe(w, 1500, 4500);
    const near = foe(w, 1700, 4500, { kind: 'creep' });
    const far = foe(w, 1500, 4150);
    const ally = spawnDummy(w, { kind: 'hero', team: Team.Radiant, pos: { x: 1350, y: 4500 }, base: { damageMin: 0, damageMax: 0 } });
    w.issue(s.id, { type: 'cast', slot: 'Q', target: { unitId: t.id } });
    runFor(w, 0.5);
    // 前摇 0.2 秒 + 飞行约 0.45 秒：还没命中
    expect(w.projectiles.some((p) => p.visual === 'sven_hammer' && p.targetId === t.id)).toBe(true);
    expect(t.hp).toBe(1000);
    expect(s.mana).toBeLessThan(s.stats.maxMana - 105);
    runFor(w, 0.4);
    expect(t.hp).toBeCloseTo(1000 - 320);
    expect(near.hp).toBeCloseTo(1000 - 320);
    expect(t.hasState('stunned')).toBe(true);
    expect(near.hasState('stunned')).toBe(true);
    expect(findModifier(t, 'status_stun')!.total).toBeCloseTo(1.75);
    expect(far.hp).toBe(1000);
    expect(far.hasState('stunned')).toBe(false);
    expect(ally.hp).toBe(1000);
    expect(ally.hasState('stunned')).toBe(false);
    expect(w.events.drain().some((e) => e.type === 'fx' && e.kind === 'sven_hammer_hit' && e.radius === 310)).toBe(true);
    runFor(w, 1.8);
    expect(t.hasState('stunned')).toBe(false);
  });

  it('Storm Hammer does nothing if its target is gone before impact', () => {
    const w = makeWorld();
    const s = heroAt(w, 'sven', { x: 1500, y: 5000 }, { levels: { Q: 1 } });
    const t = foe(w, 1500, 4500);
    const near = foe(w, 1600, 4500);
    w.issue(s.id, { type: 'cast', slot: 'Q', target: { unitId: t.id } });
    runFor(w, 0.3);
    killUnit(w, t, null);
    runFor(w, 1);
    expect(near.hp).toBe(1000);
    expect(near.hasState('stunned')).toBe(false);
    expect(w.projectiles.length).toBe(0);
  });

  it('Great Cleave splashes the pre-armor attack damage in a trapezoid, ignoring armor', () => {
    const w = makeWorld();
    const s = heroAt(w, 'sven', { x: 1500, y: 5000 }, { levels: { W: 4 } });
    const main = foe(w, 1500, 4870);
    // 主目标正后方 300（离斯温 430），护甲 20
    const behind = foe(w, 1500, 4570, { armor: 20 });
    // 离斯温 300 处梯形半宽 120（+ 半径 20），侧面 250 的不受影响
    const side = foe(w, 1750, 4700);
    const tower = foe(w, 1500, 4700, { kind: 'building' });
    s.order = { kind: 'attack', targetId: main.id, persistent: true };
    runFor(w, 0.5);
    const lost = 1000 - main.hp;
    expect(lost).toBeGreaterThan(100);
    expect(1000 - behind.hp).toBeCloseTo(lost * 0.9, 4);
    expect(side.hp).toBe(1000);
    expect(tower.hp).toBe(1000);
    // 打建筑不分裂
    const w2 = makeWorld();
    const s2 = heroAt(w2, 'sven', { x: 1500, y: 5000 }, { levels: { W: 4 } });
    const b = foe(w2, 1500, 4870, { kind: 'building' });
    const behind2 = foe(w2, 1500, 4600);
    s2.order = { kind: 'attack', targetId: b.id, persistent: true };
    runFor(w2, 0.5);
    expect(b.hp).toBeLessThan(1000);
    expect(behind2.hp).toBe(1000);
  });

  it('Great Cleave is disabled by Break', () => {
    const w = makeWorld();
    const s = heroAt(w, 'sven', { x: 1500, y: 5000 }, { levels: { W: 4 } });
    const main = foe(w, 1500, 4870);
    const behind = foe(w, 1500, 4600);
    applyControl(w, s, 'break', { source: null, duration: 5 });
    s.order = { kind: 'attack', targetId: main.id, persistent: true };
    runFor(w, 0.5);
    expect(main.hp).toBeLessThan(1000);
    expect(behind.hp).toBe(1000);
  });

  it('Warcry is instant and buffs allied heroes within 700', () => {
    const w = makeWorld();
    const s = heroAt(w, 'sven', { x: 1500, y: 5000 }, { levels: { E: 4 } });
    const ally = heroAt(w, 'axe', { x: 1500, y: 5500 });
    const farAlly = heroAt(w, 'axe', { x: 1500, y: 5800 });
    const allyCreep = spawnDummy(w, { team: Team.Radiant, pos: { x: 1650, y: 5000 }, base: { damageMin: 0, damageMax: 0 } });
    const enemy = foe(w, 1500, 4870);
    const armor0 = s.stats.armor;
    const ms0 = s.stats.moveSpeed;
    const allyArmor0 = ally.stats.armor;
    s.order = { kind: 'attack', targetId: enemy.id, persistent: true };
    w.step();
    w.step();
    expect(s.attack.windup).toBeGreaterThan(0);
    w.issue(s.id, { type: 'cast', slot: 'E' });
    w.step();
    // 不打断普攻前摇，也不改指令
    expect(s.attack.windup).toBeGreaterThan(0);
    expect(s.order.kind).toBe('attack');
    expect(s.ability('E')!.cooldown).toBeCloseTo(24, 0);
    expect(s.stats.armor).toBeCloseTo(armor0 + 14);
    expect(s.stats.moveSpeed).toBeCloseTo(ms0 * 1.15);
    expect(ally.stats.armor).toBeCloseTo(allyArmor0 + 14);
    expect(findModifier(farAlly, 'sven_warcry')).toBeUndefined();
    expect(findModifier(allyCreep, 'sven_warcry')).toBeUndefined();
    expect(findModifier(enemy, 'sven_warcry')).toBeUndefined();
    runFor(w, 0.3);
    expect(enemy.hp).toBeLessThan(1000);
    runFor(w, 7.6);
    expect(findModifier(s, 'sven_warcry')).toBeDefined();
    runFor(w, 0.2);
    expect(findModifier(s, 'sven_warcry')).toBeUndefined();
    expect(s.stats.armor).toBeCloseTo(armor0);
  });

  it("God's Strength multiplies base damage and adds slow resistance", () => {
    const w = makeWorld();
    const s = heroAt(w, 'sven', { x: 1500, y: 5000 }, { levels: { R: 3 } });
    const plain = s.stats.damageMin;
    w.issue(s.id, { type: 'cast', slot: 'R' });
    runFor(w, 0.2);
    expect(findModifier(s, 'sven_gods_strength')).toBeUndefined();
    runFor(w, 0.2);
    expect(findModifier(s, 'sven_gods_strength')).toBeDefined();
    expect(s.stats.damageMin).toBeCloseTo((37 + s.stats.str) * 2.9);
    expect(s.stats.damageMax).toBeCloseTo((39 + s.stats.str) * 2.9);
    expect(s.stats.damageMin).toBeCloseTo(plain * 2.9);
    const ms = s.stats.moveSpeed;
    applySlow(w, s, { source: null, duration: 2, key: 'test', moveSlow: 0.3 });
    expect(s.stats.moveSpeed).toBeCloseTo(ms * (1 - 0.18));
    runFor(w, 29.5);
    expect(findModifier(s, 'sven_gods_strength')).toBeDefined();
    runFor(w, 0.5);
    expect(findModifier(s, 'sven_gods_strength')).toBeUndefined();
    expect(s.stats.damageMin).toBeCloseTo(plain);
  });
});

describe('Sven talents', () => {
  it('talents change the documented values', () => {
    const cases: { tier: TalentTier; side: 0 | 1; slot: AbilitySlot; key: string; before: number; after: number }[] = [
      { tier: 0, side: 0, slot: 'E', key: 'duration', before: 8, after: 13 },
      { tier: 0, side: 1, slot: 'R', key: 'slowResist', before: 0.4, after: 0.6 },
      { tier: 1, side: 0, slot: 'R', key: 'cooldown', before: 100, after: 88 },
      { tier: 1, side: 1, slot: 'W', key: 'pct', before: 0.9, after: 1.15 },
      { tier: 2, side: 0, slot: 'Q', key: 'cooldown', before: 12, after: 9 },
      { tier: 2, side: 0, slot: 'Q', key: 'manaCost', before: 110, after: 82.5 },
      { tier: 2, side: 1, slot: 'E', key: 'armor', before: 14, after: 22 },
      { tier: 3, side: 0, slot: 'R', key: 'damagePct', before: 1.9, after: 2.4 },
      { tier: 3, side: 1, slot: 'Q', key: 'stun', before: 1.75, after: 2.75 },
    ];
    const read = (s: Unit, slot: AbilitySlot, key: string): number => {
      const ab = s.ability(slot)!;
      return key === 'cooldown' ? abilityCooldown(ab, s) : key === 'manaCost' ? abilityManaCost(ab, s) : abilityValue(s, ab, key);
    };
    for (const c of cases) {
      const w = makeWorld();
      const s = heroAt(w, 'sven', { x: 1500, y: 5000 }, { levels: ALL, heroLevel: 25 });
      expect(read(s, c.slot, c.key)).toBeCloseTo(c.before);
      expect(pickTalent(w, s, c.tier, c.side)).toBe(true);
      expect(read(s, c.slot, c.key)).toBeCloseTo(c.after);
    }
    // 8 个天赋都有名字
    for (const pair of getHeroDef('sven').talents) for (const t of pair) expect(t.name.length).toBeGreaterThan(3);
  });

  it('talents change behaviour: longer stun, stronger slow resistance, wider warcry armor', () => {
    // 25 级右：风暴之拳眩晕 2.75 秒
    const w = makeWorld();
    const s = heroAt(w, 'sven', { x: 1500, y: 5000 }, { levels: ALL, heroLevel: 25 });
    pickTalent(w, s, 3, 1);
    const t = foe(w, 1500, 4600);
    w.issue(s.id, { type: 'cast', slot: 'Q', target: { unitId: t.id } });
    runFor(w, 0.8);
    expect(findModifier(t, 'status_stun')!.total).toBeCloseTo(2.75);
    // 10 级右：神之力量减速抗性 60%，30% 减速只剩 12%
    pickTalent(w, s, 0, 1);
    w.issue(s.id, { type: 'cast', slot: 'R' });
    runFor(w, 0.4);
    const ms = s.stats.moveSpeed;
    applySlow(w, s, { source: null, duration: 2, key: 'test', moveSlow: 0.3 });
    expect(s.stats.moveSpeed).toBeCloseTo(ms * 0.88);
    // 20 级右 + 10 级左：战吼 +22 护甲、持续 13 秒
    const w2 = makeWorld();
    const s2 = heroAt(w2, 'sven', { x: 1500, y: 5000 }, { levels: ALL, heroLevel: 25 });
    pickTalent(w2, s2, 0, 0);
    pickTalent(w2, s2, 2, 1);
    const a0 = s2.stats.armor;
    w2.issue(s2.id, { type: 'cast', slot: 'E' });
    w2.step();
    expect(s2.stats.armor).toBeCloseTo(a0 + 22);
    runFor(w2, 12.8);
    expect(findModifier(s2, 'sven_warcry')).toBeDefined();
    runFor(w2, 0.3);
    expect(findModifier(s2, 'sven_warcry')).toBeUndefined();
    // 15 级右：分裂 115%
    const w3 = makeWorld();
    const s3 = heroAt(w3, 'sven', { x: 1500, y: 5000 }, { levels: ALL, heroLevel: 25 });
    pickTalent(w3, s3, 1, 1);
    const main = foe(w3, 1500, 4870);
    const behind = foe(w3, 1500, 4600);
    s3.order = { kind: 'attack', targetId: main.id, persistent: true };
    runFor(w3, 0.4);
    expect(1000 - behind.hp).toBeCloseTo((1000 - main.hp) * 1.15, 4);
  });
});

describe('Sven AI', () => {
  it('builds and talents follow the plan', () => {
    expect(SKILL_BUILDS.sven).toEqual(['Q', 'W', 'E', 'W', 'W', 'R', 'W', 'Q', 'Q', 'Q', 'R', 'E', 'E', 'E', 'R']);
    expect(TALENT_BUILDS.sven).toEqual([0, 1, 0, 0]);
  });

  const ctxFor = (w: World, me: Unit, slot: AbilitySlot, enemies: Unit[], allies: Unit[] = [], retreating = false): AiCtx => ({
    world: w, me, ab: me.ability(slot)!, skill: DIFFICULTY.normal.skill, enemyHeroes: enemies, allyHeroes: allies,
    hpPct: me.hp / me.stats.maxHp, manaPct: me.mana / me.stats.maxMana, retreating,
  });

  it('Storm Hammer prefers channelling heroes, then the hero with the most enemy heroes around it', () => {
    const w = makeWorld();
    const s = heroAt(w, 'sven', { x: 1500, y: 5000 }, { levels: ALL });
    const lone = foe(w, 1500, 4600);
    const pairA = foe(w, 1900, 4600);
    const pairB = foe(w, 2050, 4650);
    w.step();
    const rule = SVEN_RULES.sven_storm_hammer;
    expect(rule.priority).toBe(15);
    expect(rule.decide(ctxFor(w, s, 'Q', [lone, pairA, pairB]))).toEqual({ cast: { unitId: pairA.id } });
    // 正在引导的英雄最优先
    lone.cast = { ability: s.ability('Q')!, target: {}, phase: 'channel', timer: 2, channelTotal: 3 };
    expect(rule.decide(ctxFor(w, s, 'Q', [lone, pairA, pairB]))).toEqual({ cast: { unitId: lone.id } });
    // 施法距离 + 100 外的不考虑
    const far = foe(w, 1500, 4250);
    expect(rule.decide(ctxFor(w, s, 'Q', [far]))).toBeNull();
  });

  it("Warcry and God's Strength trigger in fights", () => {
    const w = makeWorld();
    const s = heroAt(w, 'sven', { x: 1500, y: 5000 }, { levels: ALL });
    const e = foe(w, 1500, 4870);
    w.step();
    const E = SVEN_RULES.sven_warcry;
    const R = SVEN_RULES.sven_gods_strength;
    expect(E.escape).toBe(true);
    expect(R.priority).toBe(30);
    // 没有交战时都不放
    expect(E.decide(ctxFor(w, s, 'E', [e]))).toBeNull();
    expect(R.decide(ctxFor(w, s, 'R', [e]))).toBeNull();
    // 撤退中、700 内有敌方英雄：战吼
    expect(E.decide(ctxFor(w, s, 'E', [e], [], true))).toEqual({ cast: {} });
    // 正在攻击敌方英雄：战吼；目标满血、只有一个敌方英雄：不开大
    s.order = { kind: 'attack', targetId: e.id, persistent: true };
    expect(E.decide(ctxFor(w, s, 'E', [e]))).toEqual({ cast: {} });
    expect(R.decide(ctxFor(w, s, 'R', [e]))).toBeNull();
    e.hp = 600;
    expect(R.decide(ctxFor(w, s, 'R', [e]))).toEqual({ cast: {} });
    // 400 内的友方英雄正在被敌方英雄攻击：战吼
    s.order = { kind: 'idle' };
    const ally = heroAt(w, 'axe', { x: 1700, y: 5000 });
    const attacker = heroAt(w, 'axe', { x: 1700, y: 4880 }, { team: Team.Dire });
    attacker.attack.targetId = ally.id;
    expect(E.decide(ctxFor(w, s, 'E', [attacker], [ally]))).toEqual({ cast: {} });
  });

  it('AI uses every active ability in a skirmish', () => {
    const cast = abilitiesCastInSkirmish('sven');
    for (const id of ['sven_storm_hammer', 'sven_warcry', 'sven_gods_strength']) expect(cast).toContain(id);
  }, 60000);
});
