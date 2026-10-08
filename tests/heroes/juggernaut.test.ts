import { describe, it, expect } from 'vitest';
import { heroAt, makeWorld, runFor, spawnDummy } from '../helpers';
import { abilitiesCastInSkirmish } from '../heroAi';
import { createHero } from '../../src/sim/systems/heroes';
import { addModifier, findModifier, type ModifierDef } from '../../src/sim/modifiers';
import { abilityCastRange, abilityCooldown, abilityManaCost, abilityValue } from '../../src/sim/systems/abilities';
import { applyDamage } from '../../src/sim/systems/damage';
import { performAttack } from '../../src/sim/systems/attack';
import { applyControl, applySlow } from '../../src/sim/status';
import { canAttack, isTargetableBy } from '../../src/sim/query';
import { pickTalent, type TalentTier } from '../../src/sim/talents';
import { getHeroDef } from '../../src/sim/heroes/index';
import { bladeformStep, type BladeformState } from '../../src/sim/heroes/juggernaut';
import { JUGG_RULES } from '../../src/ai/usage/juggernaut';
import { SKILL_BUILDS, TALENT_BUILDS } from '../../src/ai/builds';
import { DIFFICULTY } from '../../src/ai/difficulty';
import { Team, type AbilitySlot } from '../../src/sim/core/types';
import type { World } from '../../src/sim/world';
import type { Unit } from '../../src/sim/entities/unit';
import type { AiCtx } from '../../src/ai/usage/types';

/** 不会还手的敌方木桩 */
const foe = (
  w: World, x: number, y: number,
  o: { kind?: 'hero' | 'creep' | 'building'; hp?: number; armor?: number; team?: Team; damage?: number } = {},
): Unit =>
  spawnDummy(w, {
    kind: o.kind ?? 'hero', team: o.team ?? Team.Dire, pos: { x, y },
    base: { damageMin: o.damage ?? 0, damageMax: o.damage ?? 0, maxHp: o.hp ?? 1000, armor: o.armor ?? 0 },
  });

const ALL = { Q: 4, W: 4, E: 4, R: 3 } as const;
const JUGG = 'juggernaut';

type Dmg = { sourceId: number | null; targetId: number; amount: number; isAttack: boolean; crit: boolean; damageType: string };
const damageEvents = (w: World): Dmg[] =>
  w.events.drain().flatMap((e) =>
    e.type === 'damage' ? [{ sourceId: e.sourceId, targetId: e.targetId, amount: e.amount, isAttack: e.isAttack, crit: e.crit, damageType: e.damageType }] : [],
  );

describe('Juggernaut', () => {
  it('has 7.41f level-1 stats', () => {
    const w = makeWorld();
    const j = createHero(w, JUGG, Team.Radiant, false);
    w.step();
    expect(j.stats.maxHp).toBeCloseTo(560);
    expect(j.stats.maxMana).toBeCloseTo(243);
    expect(j.stats.armor).toBeCloseTo(5.33, 1);
    expect(j.stats.damageMin).toBeCloseTo(54);
    expect(j.stats.damageMax).toBeCloseTo(56);
    expect(j.stats.hpRegen).toBeCloseTo(2.5);
    expect(j.stats.manaRegen).toBeCloseTo(0.7);
    expect(j.stats.attackInterval).toBeCloseTo(0.986, 3);
    expect(j.stats.attackRange).toBe(150);
    expect(j.stats.moveSpeed).toBe(305);
    const def = getHeroDef(JUGG);
    expect(def.name).toBe('主宰');
    expect(def.title).toBe('尤涅若');
    expect(def.primary).toBe('agi');
    expect(def.roles).toEqual(['核心', '推进', '爆发']);
    expect(def.abilities.map((a) => a.id)).toEqual([
      'jugg_blade_fury', 'jugg_healing_ward', 'jugg_blade_dance', 'jugg_omnislash', 'jugg_bladeform',
    ]);
    for (const a of def.abilities) expect(a.description.length).toBeGreaterThan(20);
  });

  it('Blade Fury spins for 5 s dealing 175 dps in 260, with debuff immunity, +80% magic resist, disarm and a strong dispel on cast; Juggernaut can still move', () => {
    const w = makeWorld();
    const j = heroAt(w, JUGG, { x: 1500, y: 5000 }, { levels: { Q: 4 } });
    const mr0 = j.stats.magicResist;
    // 施放前身上的减益：缠绕（弱驱散）、只能被强驱散的减益、减速，全部被驱散
    const STRONG: ModifierDef = { id: 'test_strong_debuff', debuff: true, dispel: 'strong', stats: { moveSpeedPct: -0.5 } };
    applyControl(w, j, 'root', { source: null, duration: 10 });
    addModifier(w, j, STRONG, { duration: 10 });
    applySlow(w, j, { source: null, key: 'test', moveSlow: 0.3, duration: 10 });
    const near = foe(w, 1500, 4800, { hp: 100000 });
    const far = foe(w, 1500, 4700, { hp: 100000 });
    far.pos = { x: 1500, y: 5000 - 260 - far.radius - 5 };
    const creep = foe(w, 1650, 5000, { kind: 'creep', hp: 100000 });
    w.events.drain();
    w.issue(j.id, { type: 'cast', slot: 'Q' });
    w.step();
    const m = findModifier(j, 'jugg_blade_fury')!;
    expect(m).toBeDefined();
    expect(m.total).toBeCloseTo(5);
    expect(m.def.dispel).toBe('none');
    expect(findModifier(j, 'status_root')).toBeUndefined();
    expect(findModifier(j, 'test_strong_debuff')).toBeUndefined();
    expect(findModifier(j, 'slow_test')).toBeUndefined();
    expect(j.hasState('debuffImmune')).toBe(true);
    expect(j.hasState('disarmed')).toBe(true);
    expect(j.stats.magicResist).toBeCloseTo(1 - (1 - mr0) * 0.2);
    expect(j.mana).toBeCloseTo(j.stats.maxMana - 110, 0);
    expect(abilityCooldown(j.ability('Q')!, j)).toBe(18);
    expect(w.events.drain().some((e) => e.type === 'fx' && e.kind === 'jugg_blade_fury' && e.unitId === j.id)).toBe(true);
    // 期间控制无效
    expect(applyControl(w, j, 'stun', { source: null, duration: 2 })).toBeNull();
    // 5 秒约 875 伤害（25 跳 × 35，魔法）
    runFor(w, 5.2);
    expect(100000 - near.hp).toBeCloseTo(875, 0);
    expect(100000 - creep.hp).toBeCloseTo(875, 0);
    expect(far.hp).toBe(100000);
    expect(findModifier(j, 'jugg_blade_fury')).toBeUndefined();
    expect(j.hasState('disarmed')).toBe(false);
    expect(j.stats.magicResist).toBeCloseTo(mr0);

    // 可以移动、不能普攻
    const w2 = makeWorld();
    const j2 = heroAt(w2, JUGG, { x: 1500, y: 5000 }, { levels: { Q: 1 } });
    const t2 = foe(w2, 1500, 4880, { hp: 100000 });
    w2.issue(j2.id, { type: 'cast', slot: 'Q' });
    w2.step();
    w2.events.drain();
    w2.issue(j2.id, { type: 'attack', mode: 'smart', targetId: t2.id });
    runFor(w2, 1.5);
    expect(damageEvents(w2).some((d) => d.isAttack && d.sourceId === j2.id)).toBe(false);
    const y0 = j2.pos.y;
    w2.issue(j2.id, { type: 'move', dir: { x: 0, y: 1 } });
    runFor(w2, 1);
    expect(j2.pos.y - y0).toBeGreaterThan(250);
    expect(findModifier(j2, 'jugg_blade_fury')).toBeDefined();
  });

  it('Blade Dance crits about 35% of attacks for 200% and also crits Blade Fury ticks', () => {
    const w = makeWorld(4);
    const j = heroAt(w, JUGG, { x: 1500, y: 5000 }, { levels: { E: 4 } });
    const t = foe(w, 1500, 4850, { hp: 1e9 });
    const lo = j.stats.damageMin + j.stats.bonusDamage;
    const hi = j.stats.damageMax + j.stats.bonusDamage;
    w.events.drain();
    let crits = 0;
    for (let i = 0; i < 2000; i++) {
      performAttack(w, j, t);
      const d = damageEvents(w).find((e) => e.targetId === t.id)!;
      if (d.crit) {
        crits++;
        expect(d.amount).toBeGreaterThanOrEqual(lo * 2 - 1e-6);
        expect(d.amount).toBeLessThanOrEqual(hi * 2 + 1e-6);
      } else {
        expect(d.amount).toBeLessThanOrEqual(hi + 1e-6);
      }
    }
    expect(Math.abs(crits / 2000 - 0.35)).toBeLessThan(0.03);
    // 被破坏时不暴击
    applyControl(w, j, 'break', { source: null, duration: 1000 });
    for (let i = 0; i < 100; i++) performAttack(w, j, t);
    expect(damageEvents(w).some((d) => d.crit)).toBe(false);

    // 剑刃风暴的伤害也会暴击（35 × 2 = 70）
    const w2 = makeWorld(9);
    const j2 = heroAt(w2, JUGG, { x: 1500, y: 5000 }, { levels: { Q: 4, E: 4 } });
    const t2 = foe(w2, 1500, 4850, { hp: 1e9 });
    w2.events.drain();
    w2.issue(j2.id, { type: 'cast', slot: 'Q' });
    runFor(w2, 5.2);
    const ticks = damageEvents(w2).filter((d) => d.targetId === t2.id && d.sourceId === j2.id && !d.isAttack);
    expect(ticks.length).toBe(25);
    const critTicks = ticks.filter((d) => d.crit);
    expect(critTicks.length).toBeGreaterThan(0);
    expect(critTicks.length).toBeLessThan(25);
    for (const d of critTicks) expect(d.amount).toBeCloseTo(70);
    for (const d of ticks.filter((x) => !x.crit)) expect(d.amount).toBeCloseTo(35);
  });

  it('Healing Ward follows Juggernaut, heals allies within 400 by 5% max hp per second, dies to a single attack and expires', () => {
    const w = makeWorld();
    const j = heroAt(w, JUGG, { x: 1500, y: 5000 }, { levels: { W: 4 } });
    j.facing = -Math.PI / 2;
    const ally = spawnDummy(w, { kind: 'hero', team: Team.Radiant, pos: { x: 1700, y: 5000 }, base: { maxHp: 2000, hpRegen: 0 } });
    const farAlly = spawnDummy(w, { kind: 'creep', team: Team.Radiant, pos: { x: 2100, y: 5000 }, base: { maxHp: 2000, hpRegen: 0 } });
    const enemy = foe(w, 1300, 4950, { hp: 2000 });
    ally.hp = 1000;
    farAlly.hp = 1000;
    const allyCreep = spawnDummy(w, { kind: 'creep', team: Team.Radiant, pos: { x: 1300, y: 5050 }, base: { maxHp: 600, hpRegen: 0 } });
    allyCreep.hp = 300;
    enemy.hp = 1000;
    w.events.drain();
    w.issue(j.id, { type: 'cast', slot: 'W' });
    runFor(w, 0.35);
    const ward = w.units.find((u) => u.kind === 'summon' && u.defId === 'jugg_healing_ward')!;
    expect(ward).toBeDefined();
    expect(ward.name).toBe('治疗守卫');
    expect(ward.team).toBe(j.team);
    expect(ward.radius).toBe(20);
    expect(ward.summon!.hitsToKill).toBe(1);
    expect(ward.summon!.follow).toBe(150);
    expect(ward.summon!.expiresAt - w.time).toBeGreaterThan(23.5);
    expect(ward.summon!.expiresAt - w.time).toBeLessThanOrEqual(24);
    // 主宰前方 80
    expect(ward.pos.x).toBeCloseTo(1500, 0);
    expect(ward.pos.y).toBeCloseTo(5000 - 80, 0);
    expect(w.events.drain().some((e) => e.type === 'fx' && e.kind === 'jugg_healing_ward')).toBe(true);
    expect(abilityCooldown(j.ability('W')!, j)).toBe(60);
    expect(abilityManaCost(j.ability('W')!, j)).toBe(120);
    // 每秒 5% 最大生命（每 0.25 秒 1.25%），范围外和敌人不回
    const h0 = ally.hp;
    runFor(w, 2);
    expect(ally.hp - h0).toBeCloseTo(2000 * 0.05 * 2, -1);
    expect(farAlly.hp).toBe(1000);
    expect(allyCreep.hp - 300).toBeCloseTo(600 * 0.05 * 2, 0);
    expect(enemy.hp).toBe(1000);
    // 跟随主宰
    w.issue(j.id, { type: 'moveTo', point: { x: 1500, y: 4000 } });
    runFor(w, 4.5);
    expect(Math.hypot(ward.pos.x - j.pos.x, ward.pos.y - j.pos.y)).toBeLessThan(150 + 60);
    expect(ward.pos.y).toBeLessThan(4400);
    // 技能伤害无效，一次普攻摧毁
    applyDamage(w, { source: enemy, target: ward, amount: 5000, type: 'magical', isAttack: false, abilityId: 'x' });
    expect(ward.alive).toBe(true);
    const e2 = foe(w, ward.pos.x + 60, ward.pos.y, { damage: 1 });
    performAttack(w, e2, ward);
    expect(ward.alive).toBe(false);

    // 摧毁守卫没有赏金：敌方英雄一刀打掉，金钱和经验不变（D17）
    const w3 = makeWorld();
    const j3 = heroAt(w3, JUGG, { x: 1500, y: 5000 }, { levels: { W: 1 } });
    w3.issue(j3.id, { type: 'cast', slot: 'W' });
    runFor(w3, 0.35);
    const ward3 = w3.units.find((u) => u.defId === 'jugg_healing_ward')!;
    const killer = heroAt(w3, 'axe', { x: ward3.pos.x, y: ward3.pos.y - 100 }, { team: Team.Dire });
    const gold0 = killer.hero!.gold;
    const xp0 = killer.hero!.xp;
    performAttack(w3, killer, ward3);
    expect(ward3.alive).toBe(false);
    expect(killer.hero!.gold).toBe(gold0);
    expect(killer.hero!.xp).toBe(xp0);

    // 到期消失
    const w2 = makeWorld();
    const j2 = heroAt(w2, JUGG, { x: 1500, y: 5000 }, { levels: { W: 1 } });
    w2.issue(j2.id, { type: 'cast', slot: 'W' });
    runFor(w2, 0.35);
    const ward2 = w2.units.find((u) => u.defId === 'jugg_healing_ward')!;
    expect(ward2.summon!.expiresAt - w2.time).toBeCloseTo(18, 0);
    runFor(w2, 18.1);
    expect(w2.units.includes(ward2)).toBe(false);
  });

  it('Omnislash makes Juggernaut invulnerable and untargetable while slashing every 100 / attack speed seconds among enemies within 425, and ends early without targets', () => {
    const w = makeWorld(3);
    const j = heroAt(w, JUGG, { x: 1500, y: 5000 }, { levels: { R: 3 } });
    const as0 = j.stats.attackSpeed;
    const bd0 = j.stats.bonusDamage;
    const a = foe(w, 1500, 4650, { hp: 1e6 });
    const b = foe(w, 1700, 4500, { hp: 1e6 });
    const c = foe(w, 1300, 4500, { hp: 1e6 });
    const tooFar = foe(w, 1500, 3000, { hp: 1e6 });
    w.events.drain();
    w.issue(j.id, { type: 'cast', slot: 'R', target: { unitId: a.id } });
    runFor(w, 0.35);
    const m = findModifier(j, 'jugg_omnislash')!;
    expect(m).toBeDefined();
    expect(m.total).toBeCloseTo(3.5);
    expect(m.def.dispel).toBe('none');
    for (const s of ['invulnerable', 'debuffImmune', 'untargetable', 'busy'] as const) expect(j.hasState(s)).toBe(true);
    expect(j.stats.attackSpeed).toBeCloseTo(as0 + 40);
    expect(j.stats.bonusDamage).toBeCloseTo(bd0 + 35);
    expect(j.mana).toBeCloseTo(j.stats.maxMana - 350, 0);
    expect(abilityCooldown(j.ability('R')!, j)).toBe(120);
    expect(abilityCastRange(j, j.ability('R')!)).toBe(450);
    // 无敌、不可选中
    const enemyHero = foe(w, 1500, 4600);
    expect(canAttack(enemyHero, j)).toBe(false);
    expect(isTargetableBy(enemyHero, j, 'enemy', true)).toBe(false);
    expect(applyDamage(w, { source: enemyHero, target: j, amount: 500, type: 'pure', isAttack: false, abilityId: 'x' })).toBe(0);
    enemyHero.pos = { x: 2600, y: 7000 };
    // move 指令无效
    w.issue(j.id, { type: 'move', dir: { x: 1, y: 0 } });
    w.step();
    expect(j.order.kind).not.toBe('moveDir');
    runFor(w, 3.6);
    expect(findModifier(j, 'jugg_omnislash')).toBeUndefined();
    expect(j.hasState('invulnerable')).toBe(false);
    const ev = w.events.drain();
    const slashes = ev.filter((e) => e.type === 'fx' && e.kind === 'jugg_omnislash');
    const hits = ev.filter((e) => e.type === 'damage' && e.sourceId === j.id && e.isAttack);
    const expected = (3.5 * (as0 + 40)) / 100;
    expect(Math.abs(slashes.length - expected)).toBeLessThanOrEqual(1.5);
    expect(hits.length).toBe(slashes.length);
    // 几个目标都被斩到，范围外的没有
    const struck = new Set(hits.map((e) => (e.type === 'damage' ? e.targetId : -1)));
    expect(struck.has(a.id)).toBe(true);
    expect(struck.size).toBeGreaterThanOrEqual(2);
    expect(tooFar.hp).toBe(1e6);
    // 每一斩都贴在目标身边
    expect(Math.min(...[a, b, c].map((u) => Math.hypot(u.pos.x - j.pos.x, u.pos.y - j.pos.y)))).toBeLessThan(j.radius + 20 + 20);

    // 优先斩英雄
    const w2 = makeWorld(5);
    const j2 = heroAt(w2, JUGG, { x: 1500, y: 5000 }, { levels: { R: 1 } });
    const hero = foe(w2, 1500, 4700, { hp: 1e6 });
    for (let i = 0; i < 4; i++) foe(w2, 1400 + i * 60, 4550, { kind: 'creep', hp: 1e6 });
    w2.events.drain();
    w2.issue(j2.id, { type: 'cast', slot: 'R', target: { unitId: hero.id } });
    runFor(w2, 3.5);
    const hits2 = damageEvents(w2).filter((d) => d.sourceId === j2.id && d.isAttack);
    expect(hits2.length).toBeGreaterThan(3);
    expect(hits2.every((d) => d.targetId === hero.id)).toBe(true);

    // 斩击是攻击：100% 闪避的目标一刀都不掉血（发 miss 事件）
    const w4 = makeWorld(2);
    const j4 = heroAt(w4, JUGG, { x: 1500, y: 5000 }, { levels: { R: 3 } });
    const dodger = foe(w4, 1500, 4700, { hp: 1e6 });
    addModifier(w4, dodger, { id: 'test_evade', stats: { evasion: 1 } });
    w4.events.drain();
    w4.issue(j4.id, { type: 'cast', slot: 'R', target: { unitId: dodger.id } });
    runFor(w4, 2);
    const ev4 = w4.events.drain();
    expect(ev4.filter((x) => x.type === 'miss' && x.attackerId === j4.id && x.targetId === dodger.id).length).toBeGreaterThan(2);
    expect(dodger.hp).toBe(1e6);

    // 学了剑舞时斩击会暴击（把伪随机计数拉满，下一刀必定暴击）
    const w5 = makeWorld(4);
    const j5 = heroAt(w5, JUGG, { x: 1500, y: 5000 }, { levels: { R: 3, E: 4 } });
    const t5 = foe(w5, 1500, 4700, { hp: 1e6 });
    findModifier(j5, 'jugg_blade_dance')!.data.prd = 1000;
    w5.events.drain();
    w5.issue(j5.id, { type: 'cast', slot: 'R', target: { unitId: t5.id } });
    runFor(w5, 0.35);
    const first = damageEvents(w5).filter((d) => d.sourceId === j5.id && d.isAttack);
    expect(first.length).toBeGreaterThanOrEqual(1);
    expect(first[0].crit).toBe(true);
    runFor(w5, 3.5);
    const all5 = damageEvents(w5).filter((d) => d.sourceId === j5.id && d.isAttack);
    expect(all5.some((d) => d.crit)).toBe(true);
    expect(all5.some((d) => !d.crit)).toBe(true);

    // 目标全部死亡后提前结束
    const w3 = makeWorld();
    const j3 = heroAt(w3, JUGG, { x: 1500, y: 5000 }, { levels: { R: 3 } });
    const weak = foe(w3, 1500, 4700, { kind: 'creep', hp: 10 });
    const weak2 = foe(w3, 1600, 4600, { kind: 'creep', hp: 10 });
    w3.issue(j3.id, { type: 'cast', slot: 'R', target: { unitId: weak.id } });
    runFor(w3, 0.3 + 1.2);
    expect(weak.alive).toBe(false);
    expect(weak2.alive).toBe(false);
    expect(findModifier(j3, 'jugg_omnislash')).toBeUndefined();
    expect(j3.hasState('busy')).toBe(false);
    const x0 = j3.pos.x;
    w3.issue(j3.id, { type: 'move', dir: { x: 1, y: 0 } });
    runFor(w3, 0.5);
    expect(j3.pos.x).toBeGreaterThan(x0 + 50);
  });

  it('Bladeform gains a stack every 2 s without damage up to 10 and drops all stacks 2 s after taking damage', () => {
    // 纯函数
    const cfg = { interval: 2, maxStacks: 10, linger: 2, canGain: true };
    let s: BladeformState = { stacks: 0, quietSince: 0, lastHit: -999, dropAt: Infinity };
    const at = (now: number, lastDamaged = -999, c = cfg): number => (s = bladeformStep(s, now, lastDamaged, c)).stacks;
    expect(at(1.9)).toBe(0);
    expect(at(2)).toBe(1);
    expect(at(5.9)).toBe(2);
    expect(at(6)).toBe(3);
    expect(at(30)).toBe(10);
    expect(at(40)).toBe(10);
    // 40 秒时受到伤害：层数保留 2 秒，然后清零并重新计时
    expect(at(40, 40)).toBe(10);
    expect(at(41.9, 40)).toBe(10);
    expect(at(42, 40)).toBe(0);
    expect(at(43.9, 40)).toBe(0);
    expect(at(44, 40)).toBe(1);
    // 保留期间再次受伤：从最后一次受伤算起
    expect(at(50, 40)).toBe(4);
    expect(at(51, 51)).toBe(4);
    expect(at(52.5, 52)).toBe(4);
    expect(at(53.9, 52)).toBe(4);
    expect(at(54, 52)).toBe(0);
    // 被破坏：不获得新层，已有层数保留
    expect(at(60, 52)).toBe(3);
    expect(at(70, 52, { ...cfg, canGain: false })).toBe(3);
    expect(at(71.9, 52)).toBe(3);
    expect(at(72, 52)).toBe(4);

    // 真实 World：10 级主宰
    const w = makeWorld();
    const j = heroAt(w, JUGG, { x: 1500, y: 5000 }, { heroLevel: 10 });
    const innate = j.ability('innate')!;
    expect(innate.def.id).toBe('jugg_bladeform');
    const counter = (): number | null => innate.def.counter!(j, innate);
    const agi0 = j.stats.agi;
    const ms0 = j.stats.moveSpeed;
    expect(counter()).toBe(0);
    runFor(w, 2.1);
    expect(counter()).toBe(1);
    runFor(w, 20);
    expect(counter()).toBe(10);
    const baseAgi = 32 + 2.8 * 9;
    expect(j.stats.agi - agi0).toBeCloseTo(baseAgi * (0.025 + 0.001 * 10) * 10, 3);
    expect(j.stats.moveSpeed).toBeCloseTo(ms0 * 1.1, 3);
    // 受伤：2 秒后全部清零
    const e = foe(w, 1500, 4800);
    applyDamage(w, { source: e, target: j, amount: 10, type: 'pure', isAttack: false, abilityId: 'x' });
    runFor(w, 1.8);
    expect(counter()).toBe(10);
    runFor(w, 0.3);
    expect(counter()).toBe(0);
    expect(j.stats.agi).toBeCloseTo(agi0);
    expect(j.stats.moveSpeed).toBeCloseTo(ms0);
    // 被破坏时不再获得新层
    runFor(w, 4.1);
    expect(counter()).toBe(2);
    applyControl(w, j, 'break', { source: null, duration: 5 });
    runFor(w, 4.5);
    expect(counter()).toBe(2);
    const def = getHeroDef(JUGG).abilities.find((a) => a.id === 'jugg_bladeform')!;
    expect(def.passive?.persistOnDeath).toBe(true);
  });

  it('Bladeform drops to 0 on death and restarts from the respawn (the lethal hit does not linger or grant stacks after revival)', () => {
    const w = makeWorld();
    const j = heroAt(w, JUGG, { x: 1500, y: 5000 }, { heroLevel: 10 });
    const innate = j.ability('innate')!;
    const counter = (): number | null => innate.def.counter!(j, innate);
    const agi0 = j.stats.agi;
    runFor(w, 21);
    expect(counter()).toBe(10);
    expect(j.stats.agi).toBeGreaterThan(agi0 + 15);
    // 致死的一下（经过 applyDamage，会写 lastDamagedTime）
    const e = heroAt(w, 'axe', { x: 1500, y: 4800 }, { team: Team.Dire });
    applyDamage(w, { source: e, target: j, amount: 1e6, type: 'pure', isAttack: false, abilityId: 'x' });
    expect(j.alive).toBe(false);
    expect(counter()).toBe(0);
    expect(findModifier(j, 'jugg_bladeform')).toBeDefined();
    const deathTime = w.time;
    // 真实的复活流程（updateHeroes → respawnHero）
    let n = 0;
    while (!j.alive && n++ < 30 * 200) w.step();
    expect(j.alive).toBe(true);
    const revive = w.time;
    expect(revive - deathTime).toBeGreaterThan(2.5);
    w.step();
    expect(counter()).toBe(0);
    expect(j.stats.agi).toBeCloseTo(agi0);
    // 复活后 2 秒内没有新层（旧的致死伤害既不清零也不让计时从死亡时刻算起）
    runFor(w, 1.85);
    expect(counter()).toBe(0);
    runFor(w, 0.3);
    expect(counter()).toBe(1);
    runFor(w, 1.6);
    expect(counter()).toBe(1);
    runFor(w, 0.5);
    expect(counter()).toBe(2);
    expect(j.stats.agi).toBeGreaterThan(agi0);
  });
});

describe('Juggernaut talents', () => {
  it('talents change the documented values', () => {
    const cases: { tier: TalentTier; side: 0 | 1; slot: AbilitySlot | 'innate'; key: string; before: number; after: number }[] = [
      { tier: 0, side: 0, slot: 'W', key: 'cooldown', before: 60, after: 48 },
      { tier: 0, side: 1, slot: 'innate', key: 'interval', before: 2, after: 1 },
      { tier: 1, side: 0, slot: 'R', key: 'cooldown', before: 120, after: 105 },
      { tier: 1, side: 1, slot: 'Q', key: 'moveSpeed', before: 0, after: 45 },
      { tier: 2, side: 0, slot: 'E', key: 'critMult', before: 2.0, after: 2.15 },
      { tier: 2, side: 1, slot: 'Q', key: 'dps', before: 175, after: 295 },
      { tier: 3, side: 0, slot: 'R', key: 'duration', before: 3.5, after: 4.5 },
      { tier: 3, side: 1, slot: 'E', key: 'critLifesteal', before: 0, after: 0.4 },
    ];
    const read = (u: Unit, slot: AbilitySlot | 'innate', key: string): number => {
      const ab = u.ability(slot)!;
      if (key === 'cooldown') return abilityCooldown(ab, u);
      return abilityValue(u, ab, key);
    };
    for (const c of cases) {
      const w = makeWorld();
      const u = heroAt(w, JUGG, { x: 1500, y: 5000 }, { levels: ALL, heroLevel: 25 });
      expect(read(u, c.slot, c.key)).toBeCloseTo(c.before);
      expect(pickTalent(w, u, c.tier, c.side)).toBe(true);
      expect(read(u, c.slot, c.key)).toBeCloseTo(c.after);
    }
    for (const pair of getHeroDef(JUGG).talents) for (const t of pair) expect(t.name.length).toBeGreaterThan(3);
  });

  it('talents change behaviour: faster Bladeform, faster Blade Fury, crit lifesteal', () => {
    // 10 级右：每 1 秒一层
    const w = makeWorld();
    const j = heroAt(w, JUGG, { x: 1500, y: 5000 }, { levels: ALL, heroLevel: 25 });
    pickTalent(w, j, 0, 1);
    const innate = j.ability('innate')!;
    runFor(w, 3.1);
    expect(innate.def.counter!(j, innate)).toBe(3);
    // 15 级右：风暴期间 +45 移速
    const w2 = makeWorld();
    const j2 = heroAt(w2, JUGG, { x: 1500, y: 5000 }, { levels: ALL, heroLevel: 25 });
    pickTalent(w2, j2, 1, 1);
    const ms = j2.stats.moveSpeed;
    w2.issue(j2.id, { type: 'cast', slot: 'Q' });
    w2.step();
    expect(j2.stats.moveSpeed).toBeGreaterThan(ms + 40);
    // 25 级右：暴击吸血 40%
    const w3 = makeWorld(6);
    const j3 = heroAt(w3, JUGG, { x: 1500, y: 5000 }, { levels: ALL, heroLevel: 25 });
    pickTalent(w3, j3, 3, 1);
    const t = foe(w3, 1500, 4850, { hp: 1e9 });
    let checked = 0;
    for (let i = 0; i < 40; i++) {
      j3.hp = j3.stats.maxHp / 2;
      const before = j3.hp;
      w3.events.drain();
      performAttack(w3, j3, t);
      const d = damageEvents(w3).find((x) => x.targetId === t.id)!;
      if (d.crit) {
        expect(j3.hp - before).toBeCloseTo(d.amount * 0.4, 3);
        checked++;
      } else {
        expect(j3.hp).toBeCloseTo(before);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('Juggernaut AI', () => {
  it('builds and talents follow the plan', () => {
    expect(SKILL_BUILDS.juggernaut).toEqual(['Q', 'E', 'Q', 'W', 'Q', 'R', 'Q', 'E', 'E', 'E', 'R', 'W', 'W', 'W', 'R']);
    expect(TALENT_BUILDS.juggernaut).toEqual([1, 0, 1, 0]);
  });

  const ctxFor = (w: World, me: Unit, slot: AbilitySlot, enemies: Unit[], retreating = false, allies: Unit[] = []): AiCtx => ({
    world: w, me, ab: me.ability(slot)!, skill: DIFFICULTY.normal.skill, enemyHeroes: enemies, allyHeroes: allies,
    hpPct: me.hp / me.stats.maxHp, manaPct: me.mana / me.stats.maxMana, retreating,
  });

  it('Blade Fury: fighting a hero in 300, low hp, retreating, or clearing 4+ creeps', () => {
    const w = makeWorld();
    const j = heroAt(w, JUGG, { x: 1500, y: 5000 }, { levels: ALL });
    const Q = JUGG_RULES.jugg_blade_fury;
    expect(Q.escape).toBe(true);
    const h = foe(w, 1500, 4800);
    w.step();
    expect(Q.decide(ctxFor(w, j, 'Q', [h]))).toBeNull();
    j.order = { kind: 'attack', targetId: h.id, persistent: true };
    expect(Q.decide(ctxFor(w, j, 'Q', [h]))).toEqual({ cast: {} });
    j.order = { kind: 'idle' };
    j.hp = j.stats.maxHp * 0.4;
    expect(Q.decide(ctxFor(w, j, 'Q', [h]))).toEqual({ cast: {} });
    h.pos = { x: 1500, y: 4600 };
    expect(Q.decide(ctxFor(w, j, 'Q', [h]))).toBeNull();
    // 撤退：400 内有敌方英雄
    expect(Q.decide(ctxFor(w, j, 'Q', [h], true))).toEqual({ cast: {} });
    h.pos = { x: 1500, y: 4400 };
    expect(Q.decide(ctxFor(w, j, 'Q', [h], true))).toBeNull();
    // 清兵：260 内 ≥ 4 个小兵且魔法 > 60%
    j.hp = j.stats.maxHp;
    const creeps = [0, 1, 2].map((i) => foe(w, 1400 + i * 100, 4850, { kind: 'creep' }));
    void creeps;
    expect(Q.decide(ctxFor(w, j, 'Q', []))).toBeNull();
    foe(w, 1500, 5150, { kind: 'creep' });
    expect(Q.decide(ctxFor(w, j, 'Q', []))).toEqual({ cast: {} });
    j.mana = j.stats.maxMana * 0.5;
    expect(Q.decide(ctxFor(w, j, 'Q', []))).toBeNull();
  });

  it('Healing Ward when hurt near enemy heroes or an ally hero in 400 is low', () => {
    const w = makeWorld();
    const j = heroAt(w, JUGG, { x: 1500, y: 5000 }, { levels: ALL });
    const W = JUGG_RULES.jugg_healing_ward;
    const h = foe(w, 1500, 4400);
    const mate = spawnDummy(w, { kind: 'hero', team: Team.Radiant, pos: { x: 1800, y: 5000 }, base: { maxHp: 1000 } });
    w.step();
    expect(W.decide(ctxFor(w, j, 'W', [h], false, [mate]))).toBeNull();
    j.hp = j.stats.maxHp * 0.6;
    expect(W.decide(ctxFor(w, j, 'W', [h], false, [mate]))).toEqual({ cast: {} });
    expect(W.decide(ctxFor(w, j, 'W', [], false, [mate]))).toBeNull();
    j.hp = j.stats.maxHp;
    mate.hp = 500;
    expect(W.decide(ctxFor(w, j, 'W', [], false, [mate]))).toEqual({ cast: {} });
    mate.pos = { x: 2000, y: 5000 };
    expect(W.decide(ctxFor(w, j, 'W', [], false, [mate]))).toBeNull();
  });

  it('Omnislash on a low enemy hero in range + 100 with at most 3 enemy units around it', () => {
    const w = makeWorld();
    const j = heroAt(w, JUGG, { x: 1500, y: 5000 }, { levels: ALL });
    const R = JUGG_RULES.jugg_omnislash;
    expect(R.priority).toBe(30);
    const h = foe(w, 1500, 4500);
    w.step();
    expect(R.decide(ctxFor(w, j, 'R', [h]))).toBeNull();
    h.hp = 500;
    expect(R.decide(ctxFor(w, j, 'R', [h]))).toEqual({ cast: { unitId: h.id } });
    // 太远
    h.pos = { x: 1500, y: 4300 };
    expect(R.decide(ctxFor(w, j, 'R', [h]))).toBeNull();
    h.pos = { x: 1500, y: 4500 };
    // 它周围 425 内敌方单位 > 3（含它自己）：斩击太分散
    for (let i = 0; i < 3; i++) foe(w, 1400 + i * 100, 4300, { kind: 'creep' });
    expect(R.decide(ctxFor(w, j, 'R', [h]))).toBeNull();
  });

  it('AI uses every active ability in a skirmish and Blade Dance procs', () => {
    let crits = 0;
    const cast = abilitiesCastInSkirmish(JUGG, {
      setup: (m) => {
        const juggs = new Set(m.world.heroes().filter((u) => u.defId === JUGG).map((u) => u.id));
        const orig = m.world.events.emit.bind(m.world.events);
        m.world.events.emit = (e) => {
          if (e.type === 'damage' && e.crit && e.sourceId !== null && juggs.has(e.sourceId)) crits++;
          orig(e);
        };
      },
    });
    for (const id of ['jugg_blade_fury', 'jugg_healing_ward', 'jugg_omnislash']) expect(cast).toContain(id);
    expect(crits).toBeGreaterThan(0);
  }, 60000);
});
