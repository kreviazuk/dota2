import { describe, it, expect } from 'vitest';
import { heroAt, makeWorld, runFor, spawnDummy } from '../helpers';
import { abilitiesCastInSkirmish } from '../heroAi';
import { createHero } from '../../src/sim/systems/heroes';
import { addModifier, findModifier } from '../../src/sim/modifiers';
import { abilityCastRange, abilityChannelTime, abilityCooldown, abilityManaCost, abilityValue } from '../../src/sim/systems/abilities';
import { applyDamage, killUnit } from '../../src/sim/systems/damage';
import { isDisabled } from '../../src/sim/query';
import { pickTalent, type TalentTier } from '../../src/sim/talents';
import { getHeroDef } from '../../src/sim/heroes/index';
import { PUDGE_RULES } from '../../src/ai/usage/pudge';
import { SKILL_BUILDS, TALENT_BUILDS } from '../../src/ai/builds';
import { DIFFICULTY } from '../../src/ai/difficulty';
import { Team, type AbilitySlot } from '../../src/sim/core/types';
import type { World } from '../../src/sim/world';
import type { Unit } from '../../src/sim/entities/unit';
import type { AiCtx } from '../../src/ai/usage/types';

/** 不会还手的木桩（缺省敌方英雄） */
const foe = (
  w: World, x: number, y: number,
  o: { kind?: 'hero' | 'creep' | 'building' | 'summon' | 'elite'; hp?: number; team?: Team; ms?: number } = {},
): Unit =>
  spawnDummy(w, {
    kind: o.kind ?? 'hero', team: o.team ?? Team.Dire, pos: { x, y },
    base: { damageMin: 0, damageMax: 0, maxHp: o.hp ?? 1000, armor: 0, moveSpeed: o.ms ?? 300 },
  });

const ALL = { Q: 4, W: 4, E: 4, R: 3 } as const;
const PUDGE = 'pudge';
const P0 = { x: 1500, y: 5000 };
const dist = (a: Unit, b: Unit): number => Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y);
const hookProj = (w: World) => w.projectiles.find((p) => p.visual === 'pudge_hook' && !p.done);

type Dmg = { sourceId: number | null; targetId: number; amount: number; isAttack: boolean; damageType: string };
type Ev = ReturnType<World['events']['drain']>[number];
const damages = (ev: Ev[]): Dmg[] =>
  ev.flatMap((e) => (e.type === 'damage' ? [{ sourceId: e.sourceId, targetId: e.targetId, amount: e.amount, isAttack: e.isAttack, damageType: e.damageType }] : []));
const fxOf = (ev: Ev[], kind: string) => ev.filter((e) => e.type === 'fx' && e.kind === kind);

describe('Pudge', () => {
  it('has 7.41f level-1 stats', () => {
    const w = makeWorld();
    const p = createHero(w, PUDGE, Team.Radiant, false);
    w.step();
    expect(p.stats.maxHp).toBeCloseTo(670);
    expect(p.stats.maxMana).toBeCloseTo(267);
    expect(p.stats.armor).toBeCloseTo(2.17, 2);
    expect(p.stats.damageMin).toBeCloseTo(70);
    expect(p.stats.damageMax).toBeCloseTo(76);
    expect(p.stats.hpRegen).toBeCloseTo(5.0);
    expect(p.stats.manaRegen).toBeCloseTo(0.8);
    expect(p.stats.attackInterval).toBeCloseTo(1.504, 3);
    expect(p.stats.attackRange).toBe(175);
    expect(p.stats.moveSpeed).toBe(280);
    expect(p.isMelee).toBe(true);
    const def = getHeroDef(PUDGE);
    expect(def.name).toBe('帕吉');
    expect(def.title).toBe('屠夫');
    expect(def.primary).toBe('str');
    expect(def.roles).toEqual(['先手', '坦克', '控制']);
    expect(def.abilities.map((a) => a.id)).toEqual([
      'pudge_meat_hook', 'pudge_rot', 'pudge_meat_shield', 'pudge_dismember', 'pudge_flesh_heap',
    ]);
    for (const a of def.abilities) expect(a.description.length).toBeGreaterThan(20);
  });

  it('Meat Hook hooks the first unit along its 1300 path and drags it back in front of Pudge', () => {
    // 800 处的敌方英雄：4 级 360 纯粹伤害，拉回期间不能行动，最后落在帕吉面前
    const w = makeWorld();
    const p = heroAt(w, PUDGE, P0, { levels: { Q: 4 } });
    const t = foe(w, 1500, 4200, { hp: 2000 });
    const q = p.ability('Q')!;
    expect(abilityCastRange(p, q)).toBe(1300);
    expect(abilityCooldown(q, p)).toBe(12);
    expect(abilityManaCost(q, p)).toBe(120);
    w.events.drain();
    w.issue(p.id, { type: 'cast', slot: 'Q', target: { dir: { x: 0, y: -1 } } });
    runFor(w, 0.35);
    const hook = hookProj(w)!;
    expect(hook).toBeDefined();
    expect(hook.width).toBe(100);
    expect(hook.speed).toBe(1600);
    expect(p.mana).toBeCloseTo(p.stats.maxMana - 120, 0);
    runFor(w, 0.5);
    expect(t.hp).toBeCloseTo(2000 - 360);
    const ev = w.events.drain();
    const hit = damages(ev).filter((d) => d.targetId === t.id && d.sourceId === p.id);
    expect(hit).toHaveLength(1);
    expect(hit[0].damageType).toBe('pure');
    expect(fxOf(ev, 'pudge_hook_hit').length).toBe(1);
    expect(t.motion?.kind).toBe('hook');
    expect(t.motion?.disables).toBe(true);
    expect(isDisabled(t)).toBe(true);
    // 被拖的目标跟着钩尖走
    expect(Math.hypot(t.pos.x - hook.pos.x, t.pos.y - hook.pos.y)).toBeLessThan(60);
    const yMid = t.pos.y;
    runFor(w, 0.1);
    expect(t.pos.y).toBeGreaterThan(yMid + 100);
    runFor(w, 0.8);
    expect(hookProj(w)).toBeUndefined();
    expect(t.motion).toBeNull();
    expect(isDisabled(t)).toBe(false);
    expect(dist(t, p)).toBeLessThanOrEqual(p.radius + t.radius + 50);
    expect(t.pos.y).toBeLessThan(p.pos.y);
    expect(t.hp).toBeCloseTo(2000 - 360);

    // 友方英雄被拉回但不掉血，也不被禁止行动
    const w2 = makeWorld();
    const p2 = heroAt(w2, PUDGE, P0, { levels: { Q: 4 } });
    const ally = foe(w2, 1500, 4200, { team: Team.Radiant });
    w2.issue(p2.id, { type: 'cast', slot: 'Q', target: { dir: { x: 0, y: -1 } } });
    runFor(w2, 0.85);
    expect(ally.motion?.kind).toBe('hook');
    expect(ally.motion?.disables).toBe(false);
    runFor(w2, 0.9);
    expect(ally.motion).toBeNull();
    expect(ally.hp).toBe(1000);
    expect(dist(ally, p2)).toBeLessThanOrEqual(p2.radius + ally.radius + 50);

    // 敌方小兵被直接击杀，钩子空着收回，后面的英雄不受影响
    const w3 = makeWorld();
    const p3 = heroAt(w3, PUDGE, P0, { levels: { Q: 1 } });
    const creep = foe(w3, 1500, 4400, { kind: 'creep', hp: 5000 });
    const behind = foe(w3, 1500, 4100);
    w3.issue(p3.id, { type: 'cast', slot: 'Q', target: { dir: { x: 0, y: -1 } } });
    runFor(w3, 0.75);
    expect(creep.alive).toBe(false);
    expect(hookProj(w3)).toBeDefined();
    runFor(w3, 1.2);
    expect(hookProj(w3)).toBeUndefined();
    expect(behind.hp).toBe(1000);
    expect(behind.motion).toBeNull();
    expect(Math.abs(behind.pos.y - 4100)).toBeLessThan(1);
  });

  it('Meat Hook flies the full 1300 and returns when it hits nothing, and skips buildings, summons and invulnerable units', () => {
    const w = makeWorld();
    const p = heroAt(w, PUDGE, P0, { levels: { Q: 4 } });
    // 召唤物、建筑、无敌英雄挡在路上都不会被钩到
    const summon = foe(w, 1500, 4700, { kind: 'summon' });
    const tower = foe(w, 1500, 4500, { kind: 'building' });
    const ghost = foe(w, 1500, 4300);
    addModifier(w, ghost, { id: 'test_invuln', states: ['invulnerable'] });
    w.issue(p.id, { type: 'cast', slot: 'Q', target: { dir: { x: 0, y: -1 } } });
    runFor(w, 0.35);
    // 飞行中的钩子数（渲染层据此隐藏手里的钩子）
    expect(p.ability('Q')!.data.hookOut).toBe(1);
    let farthest = 0;
    let n = 0;
    while (hookProj(w) && n++ < 30 * 4) {
      farthest = Math.max(farthest, 5000 - hookProj(w)!.pos.y);
      w.step();
    }
    expect(hookProj(w)).toBeUndefined();
    expect(p.ability('Q')!.data.hookOut).toBe(0);
    expect(farthest).toBeCloseTo(1300, -1);
    // 往返 2 × 1300 / 1600 ≈ 1.63 秒
    expect(n / 30).toBeGreaterThan(1.5);
    expect(n / 30).toBeLessThan(1.8);
    for (const u of [summon, tower, ghost]) expect(u.motion).toBeNull();
    expect(summon.alive).toBe(true);
    expect(Math.abs(summon.pos.y - 4700)).toBeLessThan(1);
    expect(Math.abs(ghost.pos.y - 4300)).toBeLessThan(1);

    // 减益免疫的敌方英雄：纯粹伤害为 0，但仍然被拉回
    const w2 = makeWorld();
    const p2 = heroAt(w2, PUDGE, P0, { levels: { Q: 4 } });
    const bkb = foe(w2, 1500, 4300);
    addModifier(w2, bkb, { id: 'test_bkb', states: ['debuffImmune'] });
    w2.issue(p2.id, { type: 'cast', slot: 'Q', target: { dir: { x: 0, y: -1 } } });
    runFor(w2, 0.75);
    expect(bkb.hp).toBe(1000);
    expect(bkb.motion?.kind).toBe('hook');
    runFor(w2, 0.8);
    expect(bkb.motion).toBeNull();
    expect(dist(bkb, p2)).toBeLessThanOrEqual(p2.radius + bkb.radius + 50);
  });

  it('Meat Hook ends at once when Pudge dies, dropping the target where it is', () => {
    const w = makeWorld();
    const p = heroAt(w, PUDGE, P0, { levels: { Q: 4 } });
    // 真实的敌方英雄（帕吉死亡时附近的敌方英雄要拿助攻）
    const t = heroAt(w, 'axe', { x: 1500, y: 3900 }, { team: Team.Dire });
    w.issue(p.id, { type: 'cast', slot: 'Q', target: { dir: { x: 0, y: -1 } } });
    runFor(w, 0.3 + 0.62 + 0.15);
    expect(t.motion?.kind).toBe('hook');
    killUnit(w, p, null);
    const at = { ...t.pos };
    w.step();
    expect(hookProj(w)).toBeUndefined();
    expect(p.ability('Q')!.data.hookOut).toBe(0);
    expect(t.motion).toBeNull();
    expect(isDisabled(t)).toBe(false);
    runFor(w, 0.5);
    expect(Math.hypot(t.pos.x - at.x, t.pos.y - at.y)).toBeLessThan(5);
    expect(t.pos.y).toBeLessThan(4600);
  });

  it('Pudge cannot act until the hook has flown 65% of its range or hit something', () => {
    const w = makeWorld();
    const p = heroAt(w, PUDGE, P0, { levels: { Q: 4 } });
    w.issue(p.id, { type: 'cast', slot: 'Q', target: { dir: { x: 0, y: -1 } } });
    runFor(w, 0.35);
    expect(p.hasState('busy')).toBe(true);
    // 出钩后 0.3 秒（480 / 1300）：移动指令无效
    runFor(w, 0.3);
    const x0 = p.pos.x;
    w.issue(p.id, { type: 'move', dir: { x: 1, y: 0 } });
    runFor(w, 0.1);
    expect(p.order.kind).not.toBe('moveDir');
    expect(p.pos.x).toBeCloseTo(x0);
    // 出钩后 0.6 秒（960 > 845）：可以移动
    runFor(w, 0.2);
    expect(p.hasState('busy')).toBe(false);
    w.issue(p.id, { type: 'move', dir: { x: 1, y: 0 } });
    runFor(w, 0.3);
    expect(p.pos.x).toBeGreaterThan(x0 + 50);

    // 提前命中：命中时立即可以行动
    const w2 = makeWorld();
    const p2 = heroAt(w2, PUDGE, P0, { levels: { Q: 4 } });
    foe(w2, 1500, 4700);
    w2.issue(p2.id, { type: 'cast', slot: 'Q', target: { dir: { x: 0, y: -1 } } });
    runFor(w2, 0.3 + 0.15);
    expect(p2.hasState('busy')).toBe(false);
  });

  it('Rot damages and slows enemies within 250 and damages Pudge the same amount without ever killing him', () => {
    const w = makeWorld();
    const p = heroAt(w, PUDGE, P0, { levels: { W: 4 } });
    const near = foe(w, 1500, 4850, { hp: 100000 });
    const far = foe(w, 1500, 4600, { hp: 100000 });
    const tower = foe(w, 1650, 5000, { kind: 'building', hp: 100000 });
    const ms0 = near.stats.moveSpeed;
    w.events.drain();
    w.issue(p.id, { type: 'toggle', slot: 'W' });
    w.step();
    expect(p.ability('W')!.toggled).toBe(true);
    expect(findModifier(p, 'pudge_rot')).toBeDefined();
    runFor(w, 1.05);
    expect(100000 - near.hp).toBeCloseTo(120, 3);
    expect(near.stats.moveSpeed).toBeCloseTo(ms0 * 0.68, 3);
    expect(far.hp).toBe(100000);
    expect(far.stats.moveSpeed).toBe(ms0);
    expect(tower.hp).toBe(100000);
    const ev = w.events.drain();
    const self = damages(ev).filter((d) => d.targetId === p.id && d.sourceId === p.id);
    expect(self).toHaveLength(5);
    for (const d of self) {
      expect(d.damageType).toBe('magical');
      expect(d.amount).toBeCloseTo(24 * (1 - p.stats.magicResist), 3);
    }
    // 关闭后不再伤害
    w.issue(p.id, { type: 'toggle', slot: 'W' });
    w.step();
    expect(findModifier(p, 'pudge_rot')).toBeUndefined();
    const hp1 = near.hp;
    runFor(w, 1);
    expect(near.hp).toBe(hp1);
    expect(near.stats.moveSpeed).toBe(ms0);

    // 剩 50 血时开着腐烂 5 秒，仍然活着（≥ 1 血），并且确实掉到了很低
    const w2 = makeWorld();
    const p2 = heroAt(w2, PUDGE, P0, { levels: { W: 4 } });
    p2.hp = 50;
    w2.issue(p2.id, { type: 'toggle', slot: 'W' });
    let minHp = Infinity;
    for (let i = 0; i < 150; i++) {
      w2.step();
      minHp = Math.min(minHp, p2.hp);
    }
    expect(p2.alive).toBe(true);
    expect(minHp).toBeGreaterThanOrEqual(1 - 1e-9);
    expect(minHp).toBeLessThan(5);

    // 帕吉死亡时开关自动关闭
    const w3 = makeWorld();
    const p3 = heroAt(w3, PUDGE, P0, { levels: { W: 1 } });
    w3.issue(p3.id, { type: 'toggle', slot: 'W' });
    w3.step();
    expect(p3.ability('W')!.toggled).toBe(true);
    killUnit(w3, p3, null);
    expect(p3.ability('W')!.toggled).toBe(false);
    expect(findModifier(p3, 'pudge_rot')).toBeUndefined();
  });

  it('Meat Shield blocks a flat amount from every damage instance and does not interrupt Dismember', () => {
    const w = makeWorld();
    const p = heroAt(w, PUDGE, P0, { levels: { E: 4, R: 3 } });
    const e = foe(w, 1500, 4820, { hp: 100000 });
    const ab = p.ability('E')!;
    expect(ab.def.instant).toBe(true);
    w.issue(p.id, { type: 'cast', slot: 'E' });
    w.step();
    const m = findModifier(p, 'pudge_meat_shield')!;
    expect(m).toBeDefined();
    expect(m.total).toBeCloseTo(7);
    expect(abilityCooldown(ab, p)).toBe(17);
    expect(p.mana).toBeCloseTo(p.stats.maxMana - 80, 0);
    expect(applyDamage(w, { source: e, target: p, amount: 100, type: 'pure', isAttack: false, abilityId: 'x' })).toBeCloseTo(74);
    // 魔法 20 × (1 − 25%) = 15 < 26：完全挡住
    expect(applyDamage(w, { source: e, target: p, amount: 20, type: 'magical', isAttack: false, abilityId: 'x' })).toBe(0);
    runFor(w, 7.1);
    expect(findModifier(p, 'pudge_meat_shield')).toBeUndefined();
    expect(applyDamage(w, { source: e, target: p, amount: 100, type: 'pure', isAttack: false, abilityId: 'x' })).toBeCloseTo(100);

    // 肢解引导中施放，引导继续
    const w2 = makeWorld();
    const p2 = heroAt(w2, PUDGE, P0, { levels: { E: 4, R: 3 } });
    const t2 = foe(w2, 1500, 4820, { hp: 100000 });
    w2.issue(p2.id, { type: 'cast', slot: 'R', target: { unitId: t2.id } });
    runFor(w2, 0.3 + 0.5);
    expect(p2.cast?.phase).toBe('channel');
    w2.issue(p2.id, { type: 'cast', slot: 'E' });
    w2.step();
    expect(findModifier(p2, 'pudge_meat_shield')).toBeDefined();
    expect(p2.cast?.phase).toBe('channel');
    expect(p2.cast?.ability.def.id).toBe('pudge_dismember');
    expect(t2.hasState('stunned')).toBe(true);
  });

  it('Dismember stuns through debuff immunity, deals (dps + str%) every 0.5 s for 6 ticks, heals Pudge, pulls the target to 125, and stops when Pudge moves', () => {
    const w = makeWorld();
    const p = heroAt(w, PUDGE, P0, { levels: { R: 3 } });
    const t = foe(w, 1500, 4800, { hp: 100000 });
    const r = p.ability('R')!;
    expect(abilityCastRange(p, r)).toBe(200);
    expect(abilityChannelTime(p, r)).toBeCloseTo(2.75);
    expect(abilityCooldown(r, p)).toBe(20);
    expect(abilityManaCost(r, p)).toBe(170);
    const S = p.stats.str;
    const tick = (120 + 0.9 * S) * 0.5;
    p.hp = 300;
    w.events.drain();
    w.issue(p.id, { type: 'cast', slot: 'R', target: { unitId: t.id } });
    runFor(w, 0.35);
    expect(p.cast?.phase).toBe('channel');
    const dm = findModifier(t, 'pudge_dismembered')!;
    expect(dm).toBeDefined();
    expect(dm.def.dispel).toBe('none');
    expect(t.hasState('stunned')).toBe(true);
    // 第一跳立即结算
    expect(100000 - t.hp).toBeCloseTo(tick, 3);
    runFor(w, 1.2);
    // 75 / 秒拉近，直到中心距离 125
    expect(dist(p, t)).toBeCloseTo(125, -1);
    expect(dist(p, t)).toBeGreaterThanOrEqual(124);
    runFor(w, 1.8);
    expect(p.cast).toBeNull();
    expect(findModifier(t, 'pudge_dismembered')).toBeUndefined();
    expect(t.hasState('stunned')).toBe(false);
    const ev = w.events.drain();
    const ticks = damages(ev).filter((d) => d.sourceId === p.id && d.targetId === t.id);
    expect(ticks).toHaveLength(6);
    for (const d of ticks) {
      expect(d.damageType).toBe('magical');
      expect(d.amount).toBeCloseTo(tick, 3);
    }
    expect(fxOf(ev, 'pudge_dismember').length).toBe(6);
    const heals = ev.filter((e) => e.type === 'heal' && e.targetId === p.id);
    expect(heals).toHaveLength(6);
    for (const h of heals) if (h.type === 'heal') expect(h.amount).toBeCloseTo(tick, 3);

    // 减益免疫的目标同样被控制
    const w2 = makeWorld();
    const p2 = heroAt(w2, PUDGE, P0, { levels: { R: 1 } });
    const bkb = foe(w2, 1500, 4800, { hp: 100000 });
    addModifier(w2, bkb, { id: 'test_bkb', states: ['debuffImmune'] });
    w2.issue(p2.id, { type: 'cast', slot: 'R', target: { unitId: bkb.id } });
    runFor(w2, 0.4);
    expect(p2.cast?.phase).toBe('channel');
    expect(bkb.hasState('stunned')).toBe(true);
    expect(bkb.hp).toBeLessThan(100000);

    // 第 1 秒下移动指令：引导中断，目标恢复
    const w3 = makeWorld();
    const p3 = heroAt(w3, PUDGE, P0, { levels: { R: 3 } });
    const t3 = foe(w3, 1500, 4800, { hp: 100000 });
    w3.events.drain();
    w3.issue(p3.id, { type: 'cast', slot: 'R', target: { unitId: t3.id } });
    runFor(w3, 0.3 + 0.9);
    w3.issue(p3.id, { type: 'move', dir: { x: 1, y: 0 } });
    w3.step();
    expect(p3.cast).toBeNull();
    expect(findModifier(t3, 'pudge_dismembered')).toBeUndefined();
    expect(t3.hasState('stunned')).toBe(false);
    runFor(w3, 2);
    const n3 = damages(w3.events.drain()).filter((d) => d.sourceId === p3.id && d.targetId === t3.id).length;
    expect(n3).toBe(2);

    // 目标死亡：引导立即结束
    const w4 = makeWorld();
    const p4 = heroAt(w4, PUDGE, P0, { levels: { R: 3 } });
    const t4 = foe(w4, 1500, 4800, { hp: 150 });
    w4.issue(p4.id, { type: 'cast', slot: 'R', target: { unitId: t4.id } });
    runFor(w4, 0.3 + 0.6);
    expect(t4.alive).toBe(false);
    expect(p4.cast).toBeNull();

    // 对小兵也是 2.75 秒 6 跳（D22）
    const w5 = makeWorld();
    const p5 = heroAt(w5, PUDGE, P0, { levels: { R: 1 } });
    const c5 = foe(w5, 1500, 4800, { kind: 'creep', hp: 100000 });
    w5.events.drain();
    w5.issue(p5.id, { type: 'cast', slot: 'R', target: { unitId: c5.id } });
    runFor(w5, 3.3);
    expect(damages(w5.events.drain()).filter((d) => d.sourceId === p5.id && d.targetId === c5.id)).toHaveLength(6);
  });

  it('Flesh Heap gains 2 strength when an enemy hero dies within 450 or is killed by Pudge', () => {
    const w = makeWorld();
    const p = heroAt(w, PUDGE, P0, { heroLevel: 10 });
    const inn = p.ability('innate')!;
    expect(inn.def.id).toBe('pudge_flesh_heap');
    const counter = (): number | null => inn.def.counter!(p, inn);
    const str0 = p.stats.str;
    const other = foe(w, 2500, 6000, { team: Team.Radiant });
    expect(counter()).toBe(0);
    // 450 内死亡的敌方英雄（别人击杀）
    w.events.drain();
    killUnit(w, foe(w, 1500, 4600), other);
    expect(counter()).toBe(1);
    expect(p.stats.str).toBeCloseTo(str0 + 2);
    expect(fxOf(w.events.drain(), 'pudge_flesh_heap').length).toBe(1);
    // 远处被别人击杀：不给
    killUnit(w, foe(w, 1500, 4000), other);
    expect(counter()).toBe(1);
    // 远处被帕吉击杀：给
    killUnit(w, foe(w, 1500, 3000), p);
    expect(counter()).toBe(2);
    expect(p.stats.str).toBeCloseTo(str0 + 4);
    // 友方英雄、敌方小兵死在旁边：不给
    killUnit(w, foe(w, 1500, 4800, { team: Team.Radiant }), null);
    killUnit(w, foe(w, 1500, 4800, { kind: 'creep' }), p);
    expect(counter()).toBe(2);
    // 帕吉死亡后层数保留，复活后力量仍然包含层数
    killUnit(w, p, null);
    expect(findModifier(p, 'pudge_flesh_heap')?.data.stacks).toBe(2);
    let n = 0;
    while (!p.alive && n++ < 30 * 200) w.step();
    expect(p.alive).toBe(true);
    expect(counter()).toBe(2);
    expect(p.stats.str).toBeCloseTo(str0 + 4);
  });
});

describe('Pudge talents', () => {
  it('talents change the documented values', () => {
    const cases: { tier: TalentTier; side: 0 | 1; slot: AbilitySlot | 'innate' | 'stats'; key: string; before: number; after: number }[] = [
      { tier: 0, side: 0, slot: 'stats', key: 'armor', before: 0, after: 5 },
      { tier: 0, side: 1, slot: 'W', key: 'slow', before: 32, after: 42 },
      { tier: 1, side: 0, slot: 'stats', key: 'spellLifesteal', before: 0, after: 0.08 },
      { tier: 1, side: 1, slot: 'Q', key: 'damage', before: 360, after: 510 },
      { tier: 2, side: 0, slot: 'R', key: 'channelTime', before: 2.75, after: 3.5 },
      { tier: 2, side: 1, slot: 'Q', key: 'cooldown', before: 12, after: 8 },
      { tier: 3, side: 0, slot: 'R', key: 'dps', before: 120, after: 180 },
      { tier: 3, side: 0, slot: 'R', key: 'strPct', before: 0.9, after: 1.62 },
      { tier: 3, side: 1, slot: 'innate', key: 'strPerStack', before: 2, after: 3 },
      { tier: 3, side: 1, slot: 'E', key: 'block', before: 26, after: 39 },
    ];
    for (const c of cases) {
      const w = makeWorld();
      const u = heroAt(w, PUDGE, P0, { levels: ALL, heroLevel: 25 });
      const armor0 = u.stats.armor;
      const read = (): number => {
        if (c.slot === 'stats') return c.key === 'armor' ? u.stats.armor - armor0 : u.stats.spellLifesteal;
        const ab = u.ability(c.slot)!;
        if (c.key === 'cooldown') return abilityCooldown(ab, u);
        if (c.key === 'channelTime') return abilityChannelTime(u, ab);
        return abilityValue(u, ab, c.key);
      };
      expect(read()).toBeCloseTo(c.before);
      expect(pickTalent(w, u, c.tier, c.side)).toBe(true);
      expect(read()).toBeCloseTo(c.after);
    }
    for (const pair of getHeroDef(PUDGE).talents) for (const t of pair) expect(t.name.length).toBeGreaterThan(3);
  });

  it('talents change behaviour: longer Dismember, bigger hook, stronger Flesh Heap stacks and Meat Shield, spell lifesteal', () => {
    // 20 级左：3.5 秒肢解 → 7 跳
    const w = makeWorld();
    const p = heroAt(w, PUDGE, P0, { levels: ALL, heroLevel: 25 });
    pickTalent(w, p, 2, 0);
    const t = foe(w, 1500, 4800, { hp: 1e6 });
    w.events.drain();
    w.issue(p.id, { type: 'cast', slot: 'R', target: { unitId: t.id } });
    runFor(w, 0.3 + 3.6);
    expect(damages(w.events.drain()).filter((d) => d.sourceId === p.id && d.targetId === t.id)).toHaveLength(7);
    // 25 级右：每层腐肉堆积 3 力量（已有的层数一起变），肉盾 39
    const w2 = makeWorld();
    const p2 = heroAt(w2, PUDGE, P0, { levels: ALL, heroLevel: 25 });
    killUnit(w2, foe(w2, 1500, 4800), p2);
    const str1 = p2.stats.str;
    pickTalent(w2, p2, 3, 1);
    expect(p2.stats.str).toBeCloseTo(str1 + 1);
    w2.issue(p2.id, { type: 'cast', slot: 'E' });
    w2.step();
    const e = foe(w2, 1500, 4700);
    expect(applyDamage(w2, { source: e, target: p2, amount: 100, type: 'pure', isAttack: false, abilityId: 'x' })).toBeCloseTo(61);
    // 15 级左：技能吸血（肉钩的 360 纯粹伤害回 8%）
    const w3 = makeWorld();
    const p3 = heroAt(w3, PUDGE, P0, { levels: ALL, heroLevel: 25 });
    pickTalent(w3, p3, 1, 0);
    p3.hp = 500;
    foe(w3, 1500, 4600, { hp: 5000 });
    w3.events.drain();
    w3.issue(p3.id, { type: 'cast', slot: 'Q', target: { dir: { x: 0, y: -1 } } });
    runFor(w3, 0.6);
    const heals = w3.events.drain().filter((x) => x.type === 'heal' && x.targetId === p3.id);
    expect(heals.some((h) => h.type === 'heal' && Math.abs(h.amount - 360 * 0.08) < 0.01)).toBe(true);
  });
});

describe('Pudge AI', () => {
  it('builds and talents follow the plan', () => {
    expect(SKILL_BUILDS.pudge).toEqual(['Q', 'W', 'Q', 'E', 'Q', 'R', 'Q', 'W', 'W', 'W', 'R', 'E', 'E', 'E', 'R']);
    expect(TALENT_BUILDS.pudge).toEqual([0, 1, 0, 0]);
  });

  const ctxFor = (w: World, me: Unit, slot: AbilitySlot, enemies: Unit[], retreating = false): AiCtx => ({
    world: w, me, ab: me.ability(slot)!, skill: DIFFICULTY.normal.skill, enemyHeroes: enemies, allyHeroes: [],
    hpPct: me.hp / me.stats.maxHp, manaPct: me.mana / me.stats.maxMana, retreating,
  });

  it('Meat Hook: an enemy hero in 1300 with nothing in between and mana > 30%', () => {
    const w = makeWorld();
    const p = heroAt(w, PUDGE, P0, { levels: ALL });
    const Q = PUDGE_RULES.pudge_meat_hook;
    expect(Q.priority).toBe(20);
    const h = foe(w, 1500, 4300);
    w.step();
    const d = Q.decide(ctxFor(w, p, 'Q', [h]));
    expect(d && 'cast' in d ? d.cast.dir : null).toBeTruthy();
    const dir = (d as { cast: { dir: { x: number; y: number } } }).cast.dir;
    expect(Math.abs(dir.x) / Math.hypot(dir.x, dir.y)).toBeLessThan(0.05);
    expect(dir.y).toBeLessThan(0);
    // 小兵挡在中间
    const creep = foe(w, 1520, 4650, { kind: 'creep', team: Team.Radiant });
    expect(Q.decide(ctxFor(w, p, 'Q', [h]))).toBeNull();
    creep.pos = { x: 1800, y: 4650 };
    expect(Q.decide(ctxFor(w, p, 'Q', [h]))).not.toBeNull();
    // 魔法不够 30%
    p.mana = p.stats.maxMana * 0.25;
    expect(Q.decide(ctxFor(w, p, 'Q', [h]))).toBeNull();
    p.mana = p.stats.maxMana;
    // 太远
    h.pos = { x: 1500, y: 3500 };
    expect(Q.decide(ctxFor(w, p, 'Q', [h]))).toBeNull();
  });

  it('Rot: on near an enemy hero or 2+ creeps while healthy, off when nobody is in 400 or hp < 25%', () => {
    const w = makeWorld();
    const p = heroAt(w, PUDGE, P0, { levels: ALL });
    const W = PUDGE_RULES.pudge_rot;
    const ab = p.ability('W')!;
    const h = foe(w, 1500, 4750);
    w.step();
    expect(W.decide(ctxFor(w, p, 'W', [h]))).toEqual({ toggle: true });
    p.hp = p.stats.maxHp * 0.45;
    expect(W.decide(ctxFor(w, p, 'W', [h]))).toBeNull();
    p.hp = p.stats.maxHp;
    h.pos = { x: 1500, y: 4500 };
    expect(W.decide(ctxFor(w, p, 'W', [h]))).toBeNull();
    const c1 = foe(w, 1600, 4900, { kind: 'creep' });
    expect(W.decide(ctxFor(w, p, 'W', [h]))).toBeNull();
    foe(w, 1400, 4900, { kind: 'creep' });
    expect(W.decide(ctxFor(w, p, 'W', [h]))).toEqual({ toggle: true });
    // 开着：附近还有敌人 → 不动；血量 < 25% → 关
    ab.toggled = true;
    expect(W.decide(ctxFor(w, p, 'W', [h]))).toBeNull();
    p.hp = p.stats.maxHp * 0.2;
    expect(W.decide(ctxFor(w, p, 'W', [h]))).toEqual({ toggle: true });
    p.hp = p.stats.maxHp;
    // 400 内没有敌人 → 关
    for (const u of w.units) if (u.team === Team.Dire && u.kind === 'creep') u.pos = { x: 2400, y: 4000 };
    void c1;
    expect(W.decide(ctxFor(w, p, 'W', [h]))).toEqual({ toggle: true });
  });

  it('Meat Shield: while attacked by an enemy hero with one in 600, or while channelling Dismember (also mid-cast)', () => {
    const w = makeWorld();
    const p = heroAt(w, PUDGE, P0, { levels: ALL });
    const E = PUDGE_RULES.pudge_meat_shield;
    expect(E.whileCasting).toBe(true);
    const h = foe(w, 1500, 4600);
    w.step();
    expect(E.decide(ctxFor(w, p, 'E', [h]))).toBeNull();
    h.attack.targetId = p.id;
    expect(E.decide(ctxFor(w, p, 'E', [h]))).toEqual({ cast: {} });
    h.pos = { x: 1500, y: 4200 };
    expect(E.decide(ctxFor(w, p, 'E', [h]))).toBeNull();
    h.attack.targetId = null;
    // 正在引导肢解
    const t = foe(w, 1500, 4820, { hp: 100000 });
    w.issue(p.id, { type: 'cast', slot: 'R', target: { unitId: t.id } });
    runFor(w, 0.4);
    expect(p.cast?.phase).toBe('channel');
    expect(E.decide(ctxFor(w, p, 'E', []))).toEqual({ cast: {} });
  });

  it('Dismember: an enemy hero within cast range + 100', () => {
    const w = makeWorld();
    const p = heroAt(w, PUDGE, P0, { levels: ALL });
    const R = PUDGE_RULES.pudge_dismember;
    expect(R.priority).toBe(30);
    const h = foe(w, 1500, 4700);
    w.step();
    expect(R.decide(ctxFor(w, p, 'R', [h]))).toEqual({ cast: { unitId: h.id } });
    h.pos = { x: 1500, y: 4600 };
    expect(R.decide(ctxFor(w, p, 'R', [h]))).toBeNull();
  });

  it('AI uses every active ability in a skirmish and lands hooks', () => {
    let hookHits = 0;
    const cast = abilitiesCastInSkirmish(PUDGE, {
      setup: (m) => {
        const orig = m.world.events.emit.bind(m.world.events);
        m.world.events.emit = (e) => {
          if (e.type === 'fx' && e.kind === 'pudge_hook_hit') hookHits++;
          orig(e);
        };
      },
    });
    for (const id of ['pudge_meat_hook', 'pudge_rot', 'pudge_meat_shield', 'pudge_dismember']) expect(cast).toContain(id);
    expect(hookHits).toBeGreaterThan(0);
  }, 60000);
});
