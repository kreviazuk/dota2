import { describe, it, expect } from 'vitest';
import { heroAt, makeWorld, runFor, spawnDummy } from '../helpers';
import { abilitiesCastInSkirmish } from '../heroAi';
import { createHero } from '../../src/sim/systems/heroes';
import { addModifier, findModifier } from '../../src/sim/modifiers';
import { abilityCastRange, abilityCooldown, abilityManaCost, abilityMaxCharges, abilityValue } from '../../src/sim/systems/abilities';
import { applyControl } from '../../src/sim/status';
import { isDisabled } from '../../src/sim/query';
import { pickTalent, type TalentTier } from '../../src/sim/talents';
import { getHeroDef } from '../../src/sim/heroes/index';
import { ZEUS_RULES } from '../../src/ai/usage/zeus';
import { SKILL_BUILDS, TALENT_BUILDS } from '../../src/ai/builds';
import { DIFFICULTY } from '../../src/ai/difficulty';
import { towardHome } from '../../src/ai/aiHelpers';
import { dist } from '../../src/sim/core/vec2';
import { Team, type AbilitySlot } from '../../src/sim/core/types';
import type { World } from '../../src/sim/world';
import type { Unit } from '../../src/sim/entities/unit';
import type { AiCtx } from '../../src/ai/usage/types';

/** 不会还手的敌方木桩 */
const foe = (
  w: World, x: number, y: number,
  o: { kind?: 'hero' | 'creep' | 'building'; hp?: number; ms?: number; as?: number; mr?: number } = {},
): Unit =>
  spawnDummy(w, {
    kind: o.kind ?? 'hero', team: Team.Dire, pos: { x, y },
    base: { damageMin: 0, damageMax: 0, maxHp: o.hp ?? 1000, moveSpeed: o.ms ?? 300, attackSpeed: o.as ?? 100, magicResist: o.mr ?? 0 },
  });

const ALL = { Q: 4, W: 4, E: 4, R: 3 } as const;
const Z = 'zeus';
/** 本次 drain 里各类伤害事件的数值（按发生顺序） */
const damages = (w: World, targetId: number): { amount: number; type: string; isAttack: boolean }[] =>
  w.events.drain().flatMap((e) => (e.type === 'damage' && e.targetId === targetId ? [{ amount: e.amount, type: e.damageType, isAttack: e.isAttack }] : []));

describe('Zeus', () => {
  it('has 7.41f level-1 stats', () => {
    const w = makeWorld();
    const z = createHero(w, Z, Team.Radiant, false);
    w.step();
    expect(z.stats.maxHp).toBeCloseTo(582);
    expect(z.stats.maxMana).toBeCloseTo(351);
    expect(z.stats.armor).toBeCloseTo(2.83, 2);
    expect(z.stats.damageMin).toBeCloseTo(53);
    expect(z.stats.damageMax).toBeCloseTo(63);
    expect(z.stats.hpRegen).toBeCloseTo(2.35);
    expect(z.stats.manaRegen).toBeCloseTo(1.15);
    expect(z.stats.attackInterval).toBeCloseTo(1.7 / 1.11, 3);
    expect(z.stats.attackRange).toBe(380);
    expect(z.stats.moveSpeed).toBe(305);
    const def = getHeroDef(Z);
    expect(def.name).toBe('宙斯');
    expect(def.title).toBe('众神之王');
    expect(def.abilities.map((a) => a.id)).toEqual([
      'zeus_arc_lightning', 'zeus_lightning_bolt', 'zeus_heavenly_jump', 'zeus_thundergods_wrath', 'zeus_static_field',
    ]);
  });

  it('Static Field deals current-hp% magic damage before the hit, on attacks and abilities, never on buildings', () => {
    const w = makeWorld();
    const z = heroAt(w, Z, { x: 1500, y: 5000 }, { levels: { W: 4 }, heroLevel: 1 });
    const t = foe(w, 1500, 4700);
    w.events.drain();
    w.issue(z.id, { type: 'cast', slot: 'W', target: { unitId: t.id } });
    runFor(w, 0.4);
    // 1 级 3.45% + 0.05% = 3.5%：先 1000 × 3.5% = 35，再 380；静电场不再触发静电场
    const evs = w.events.drain();
    const dmg = evs.flatMap((e) => (e.type === 'damage' && e.targetId === t.id ? [e] : []));
    expect(dmg.map((e) => Math.round(e.amount * 100) / 100)).toEqual([35, 380]);
    expect(dmg.every((e) => e.damageType === 'magical')).toBe(true);
    expect(t.hp).toBeCloseTo(1000 - 35 - 380);
    expect(evs.filter((e) => e.type === 'fx' && e.kind === 'zeus_static' && e.targetId === t.id).length).toBe(1);

    // 普攻：先 585 × 3.5% 魔法，再普攻本体
    w.issue(z.id, { type: 'attack', mode: 'smart', targetId: t.id });
    let hits: ReturnType<typeof damages> = [];
    for (let i = 0; i < 90 && !hits.some((h) => h.isAttack); i++) {
      w.step();
      hits = hits.concat(damages(w, t.id));
    }
    expect(hits.length).toBe(2);
    expect(hits[0]).toMatchObject({ type: 'magical', isAttack: false });
    expect(hits[0].amount).toBeCloseTo(585 * 0.035);
    expect(hits[1].isAttack).toBe(true);

    // 打塔：不触发
    const w2 = makeWorld();
    const z2 = heroAt(w2, Z, { x: 1500, y: 5000 }, { heroLevel: 1 });
    const tower = foe(w2, 1500, 4750, { kind: 'building' });
    w2.events.drain();
    w2.issue(z2.id, { type: 'attack', mode: 'smart', targetId: tower.id });
    runFor(w2, 2);
    const th = damages(w2, tower.id);
    expect(th.length).toBeGreaterThan(0);
    expect(th.every((h) => h.isAttack)).toBe(true);

    // 被破坏：不触发
    const w3 = makeWorld();
    const z3 = heroAt(w3, Z, { x: 1500, y: 5000 }, { levels: { W: 1 }, heroLevel: 1 });
    const t3 = foe(w3, 1500, 4700);
    applyControl(w3, z3, 'break', { source: null, duration: 5 });
    w3.events.drain();
    w3.issue(z3.id, { type: 'cast', slot: 'W', target: { unitId: t3.id } });
    runFor(w3, 0.4);
    expect(damages(w3, t3.id).map((h) => h.amount)).toEqual([140]);
  });

  it('Arc Lightning bounces every 0.25 s to unhit enemies within 450 until the target count', () => {
    const w = makeWorld();
    const z = heroAt(w, Z, { x: 1500, y: 5000 }, { levels: { Q: 1 }, heroLevel: 1 });
    const chain = [0, 1, 2, 3, 4, 5].map((i) => foe(w, 1500, 4600 - i * 300, { hp: 5000, kind: i === 2 ? 'creep' : 'hero' }));
    // 一座塔就在第一个木桩旁边：不会被弹到
    const tower = foe(w, 1600, 4600, { kind: 'building' });
    w.events.drain();
    w.issue(z.id, { type: 'cast', slot: 'Q', target: { unitId: chain[0].id } });
    const hitAt = new Map<number, number>();
    for (let i = 0; i < 90; i++) {
      w.step();
      for (const e of w.events.drain()) {
        if (e.type === 'damage' && !hitAt.has(e.targetId)) hitAt.set(e.targetId, w.time);
        if (e.type === 'fx' && e.kind === 'zeus_arc') {
          expect(e.unitId).toBe(z.id);
          expect(chain.map((u) => u.id)).toContain(e.targetId);
        }
      }
    }
    // 恰好前 5 个受伤：每个 105 + 静电场 5000 × 3.5%
    for (let i = 0; i < 5; i++) expect(chain[i].hp).toBeCloseTo(5000 - 105 - 175);
    expect(chain[5].hp).toBe(5000);
    expect(tower.hp).toBe(1000);
    const t0 = hitAt.get(chain[0].id)!;
    expect(t0).toBeGreaterThan(0.15);
    expect(hitAt.get(chain[1].id)! - t0).toBeCloseTo(0.25, 1);
    expect(hitAt.get(chain[2].id)! - t0).toBeCloseTo(0.5, 1);
    expect(hitAt.get(chain[4].id)! - t0).toBeCloseTo(1.0, 1);

    // 4 级 11 个目标，但只有 3 个敌人：每个只打一次，打完就停
    const w2 = makeWorld();
    const z2 = heroAt(w2, Z, { x: 1500, y: 5000 }, { levels: { Q: 4 }, heroLevel: 1 });
    const few = [0, 1, 2].map((i) => foe(w2, 1450 + i * 50, 4600 - i * 200, { hp: 5000 }));
    const far = foe(w2, 1500, 3500, { hp: 5000 });
    w2.issue(z2.id, { type: 'cast', slot: 'Q', target: { unitId: few[0].id } });
    runFor(w2, 3);
    for (const u of few) expect(u.hp).toBeCloseTo(5000 - 180 - 175);
    expect(far.hp).toBe(5000);
  });

  it('Lightning Bolt ministuns and interrupts a channel', () => {
    const w = makeWorld();
    const z = heroAt(w, Z, { x: 1500, y: 5000 }, { levels: { W: 4 } });
    const cm = heroAt(w, 'crystal_maiden', { x: 1500, y: 4300 }, { levels: { R: 1 }, team: Team.Dire });
    w.issue(cm.id, { type: 'cast', slot: 'R' });
    w.step();
    expect(cm.cast?.phase).toBe('channel');
    const hp0 = cm.hp;
    w.events.drain();
    w.issue(z.id, { type: 'cast', slot: 'W', target: { unitId: cm.id } });
    runFor(w, 0.4);
    expect(cm.cast).toBeNull();
    expect(findModifier(cm, 'status_stun')).toBeDefined();
    expect(findModifier(cm, 'status_stun')!.total).toBeCloseTo(0.35 * (1 - cm.stats.statusResist));
    expect(cm.hp).toBeLessThan(hp0 - 380 * (1 - cm.stats.magicResist) + 1);
    expect(w.events.drain().some((e) => e.type === 'fx' && e.kind === 'zeus_bolt' && Math.abs(e.pos.x - 1500) < 1)).toBe(true);
    expect(abilityCastRange(z, z.ability('W')!)).toBe(850);
    runFor(w, 0.4);
    expect(cm.hasState('stunned')).toBe(false);
  });

  it('Heavenly Jump leaps forward over 0.5 s and shocks the nearest enemy, preferring heroes', () => {
    const w = makeWorld();
    const z = heroAt(w, Z, { x: 1500, y: 5000 }, { levels: { E: 4 }, heroLevel: 1 });
    z.facing = 0;
    const creep = foe(w, 1500, 5200, { kind: 'creep', ms: 600, as: 150 });
    const hero = foe(w, 1500, 5500, { ms: 600, as: 150 });
    const outside = foe(w, 1500, 6200, { ms: 600 });
    const start = { ...z.pos };
    w.events.drain();
    w.issue(z.id, { type: 'cast', slot: 'E', target: { dir: { x: 0, y: -1 } } });
    w.step();
    expect(z.motion?.kind).toBe('leap');
    expect(isDisabled(z)).toBe(true);
    const evs = w.events.drain();
    expect(evs.some((e) => e.type === 'fx' && e.kind === 'zeus_jump')).toBe(true);
    expect(evs.filter((e) => e.type === 'fx' && e.kind === 'zeus_jump_shock').map((e) => (e.type === 'fx' ? e.targetId : -1))).toEqual([hero.id]);
    // 英雄：100 + 静电场 1000 × 3.5%；小兵和范围外的不受影响
    expect(hero.hp).toBeCloseTo(1000 - 100 - 35);
    expect(creep.hp).toBe(1000);
    expect(outside.hp).toBe(1000);
    const slow = findModifier(hero, 'slow_zeus_jump')!;
    expect(slow.total).toBeCloseTo(1.4);
    expect(hero.stats.moveSpeed).toBeCloseTo(600 * 0.2);
    expect(hero.stats.attackSpeed).toBeCloseTo(50);
    // 跳跃中不能攻击
    w.issue(z.id, { type: 'attack', mode: 'smart', targetId: creep.id });
    runFor(w, 0.2);
    expect(z.attack.windup).toBe(-1);
    expect(dist(z.pos, start)).toBeGreaterThan(150);
    w.issue(z.id, { type: 'stop' });
    runFor(w, 0.3);
    expect(z.motion).toBeNull();
    expect(z.pos.x).toBeCloseTo(1500);
    expect(z.pos.y).toBeCloseTo(4400);
    runFor(w, 1.0);
    expect(findModifier(hero, 'slow_zeus_jump')).toBeUndefined();

    // 没给方向：按面向跳
    const w2 = makeWorld();
    const z2 = heroAt(w2, Z, { x: 1500, y: 5000 }, { levels: { E: 1 } });
    z2.facing = Math.PI / 2;
    w2.issue(z2.id, { type: 'cast', slot: 'E' });
    runFor(w2, 0.6);
    expect(z2.pos.x).toBeCloseTo(1500);
    expect(z2.pos.y).toBeCloseTo(5375);
    // 被缠绕时不能跳
    applyControl(w2, z2, 'root', { source: null, duration: 2 });
    w2.step();
    z2.ability('E')!.cooldown = 0;
    w2.events.drain();
    w2.issue(z2.id, { type: 'cast', slot: 'E' });
    runFor(w2, 0.3);
    expect(z2.motion).toBeNull();
    expect(w2.events.drain().some((e) => e.type === 'cast')).toBe(false);
    // 终点限制在可行走区域内
    const w3 = makeWorld();
    const z3 = heroAt(w3, Z, { x: 1800, y: 5000 }, { levels: { E: 4 } });
    w3.issue(z3.id, { type: 'cast', slot: 'E', target: { dir: { x: 1, y: 0 } } });
    runFor(w3, 0.6);
    expect(z3.pos.x).toBeLessThanOrEqual(2000 - z3.radius + 1e-6);
  });

  it("Thundergod's Wrath hits every living enemy hero on the map, including hidden ones, not invulnerable ones", () => {
    const w = makeWorld();
    const z = heroAt(w, Z, { x: 1500, y: 9000 }, { levels: { R: 3 } });
    const near = foe(w, 1500, 8500, { hp: 5000 });
    const far = foe(w, 1500, 600, { hp: 5000 });
    const hidden = foe(w, 1300, 3000, { hp: 5000 });
    addModifier(w, hidden, { id: 'test_hidden', states: ['hidden'] }, { duration: 10 });
    const invul = foe(w, 1700, 3000, { hp: 5000 });
    addModifier(w, invul, { id: 'test_invul', states: ['invulnerable'] }, { duration: 10 });
    const creep = foe(w, 1500, 8600, { kind: 'creep', hp: 5000 });
    const dead = foe(w, 1500, 4000, { hp: 5000 });
    dead.alive = false;
    const ally = spawnDummy(w, { kind: 'hero', team: Team.Radiant, pos: { x: 1500, y: 8800 } });
    w.events.drain();
    w.issue(z.id, { type: 'cast', slot: 'R' });
    runFor(w, 0.35);
    expect(near.hp).toBe(5000);
    runFor(w, 0.1);
    // 575 + 静电场（18 级 4.35%）
    for (const h of [near, far, hidden]) expect(h.hp).toBeCloseTo(5000 - 575 - 5000 * 0.0435);
    expect(invul.hp).toBe(5000);
    expect(creep.hp).toBe(5000);
    expect(dead.hp).toBe(5000);
    expect(ally.hp).toBe(1000);
    const evs = w.events.drain();
    const hits = evs.flatMap((e) => (e.type === 'fx' && e.kind === 'zeus_wrath_hit' ? [e.targetId] : []));
    expect(new Set(hits)).toEqual(new Set([near.id, far.id, hidden.id]));
    expect(evs.filter((e) => e.type === 'fx' && e.kind === 'zeus_wrath').length).toBe(1);
  });
});

describe('Zeus talents', () => {
  it('talents change the documented values', () => {
    const cases: { tier: TalentTier; side: 0 | 1; slot: AbilitySlot; key: string; before: number; after: number }[] = [
      { tier: 0, side: 0, slot: 'E', key: 'targets', before: 1, after: 2 },
      { tier: 1, side: 0, slot: 'R', key: 'damage', before: 575, after: 650 },
      { tier: 1, side: 1, slot: 'Q', key: 'cooldown', before: 1.6, after: 1.28 },
      { tier: 1, side: 1, slot: 'Q', key: 'manaCost', before: 100, after: 80 },
      { tier: 2, side: 0, slot: 'Q', key: 'damage', before: 180, after: 240 },
      { tier: 2, side: 1, slot: 'W', key: 'stun', before: 0.35, after: 0.85 },
      { tier: 3, side: 0, slot: 'W', key: 'aoe', before: 0, after: 325 },
      { tier: 3, side: 1, slot: 'E', key: 'charges', before: 0, after: 3 },
    ];
    const read = (u: Unit, slot: AbilitySlot, key: string): number => {
      const ab = u.ability(slot)!;
      if (key === 'cooldown') return abilityCooldown(ab, u);
      if (key === 'manaCost') return abilityManaCost(ab, u);
      if (key === 'charges') return abilityMaxCharges(u, ab);
      return abilityValue(u, ab, key);
    };
    for (const c of cases) {
      const w = makeWorld();
      const u = heroAt(w, Z, { x: 1500, y: 5000 }, { levels: ALL, heroLevel: 25 });
      expect(read(u, c.slot, c.key)).toBeCloseTo(c.before);
      expect(pickTalent(w, u, c.tier, c.side)).toBe(true);
      expect(read(u, c.slot, c.key)).toBeCloseTo(c.after);
    }
    // 10 级右：+200 生命
    const w = makeWorld();
    const u = heroAt(w, Z, { x: 1500, y: 5000 }, { levels: ALL, heroLevel: 25 });
    const hp0 = u.stats.maxHp;
    pickTalent(w, u, 0, 1);
    expect(u.stats.maxHp).toBeCloseTo(hp0 + 200);
    for (const pair of getHeroDef(Z).talents) for (const t of pair) expect(t.name.length).toBeGreaterThan(3);
  });

  it('talents change behaviour: two jump targets, area bolt, three jump charges', () => {
    // 10 级左：神圣一跳打 2 个目标（英雄优先，再最近的）
    const w = makeWorld();
    const z = heroAt(w, Z, { x: 1500, y: 5000 }, { levels: ALL, heroLevel: 25 });
    pickTalent(w, z, 0, 0);
    const a = foe(w, 1500, 4800, { kind: 'creep' });
    const b = foe(w, 1500, 4600, { kind: 'creep' });
    const h = foe(w, 1500, 4100);
    w.issue(z.id, { type: 'cast', slot: 'E', target: { dir: { x: 0, y: 1 } } });
    w.step();
    expect(h.hp).toBeLessThan(1000);
    expect(a.hp).toBeLessThan(1000);
    expect(b.hp).toBe(1000);

    // 25 级左：雷击 325 范围
    const w2 = makeWorld();
    const z2 = heroAt(w2, Z, { x: 1500, y: 5000 }, { levels: ALL, heroLevel: 25 });
    pickTalent(w2, z2, 3, 0);
    const main = foe(w2, 1500, 4400, { hp: 5000 });
    const side = foe(w2, 1700, 4400, { hp: 5000, kind: 'creep' });
    const away = foe(w2, 1500, 3900, { hp: 5000 });
    w2.issue(z2.id, { type: 'cast', slot: 'W', target: { unitId: main.id } });
    runFor(w2, 0.4);
    expect(main.hp).toBeLessThan(5000 - 380);
    expect(side.hp).toBeLessThan(5000 - 380);
    expect(side.hasState('stunned')).toBe(true);
    expect(away.hp).toBe(5000);

    // 25 级右：3 层充能，选上时满层，可以连跳三次
    const w3 = makeWorld();
    const z3 = heroAt(w3, Z, { x: 1500, y: 5000 }, { levels: ALL, heroLevel: 25 });
    const e = z3.ability('E')!;
    w3.issue(z3.id, { type: 'cast', slot: 'E', target: { dir: { x: 0, y: -1 } } });
    runFor(w3, 0.6);
    expect(e.cooldown).toBeGreaterThan(10);
    pickTalent(w3, z3, 3, 1);
    expect(e.charges).toBe(3);
    expect(e.cooldown).toBe(0);
    for (let i = 0; i < 3; i++) {
      w3.issue(z3.id, { type: 'cast', slot: 'E', target: { dir: { x: 0, y: i % 2 ? 1 : -1 } } });
      runFor(w3, 0.6);
    }
    expect(e.charges).toBe(0);
    const casts = w3.events.drain().filter((ev) => ev.type === 'cast' && ev.abilityId === 'zeus_heavenly_jump').length;
    expect(casts).toBe(4);
  });
});

describe('Zeus AI', () => {
  it('builds and talents follow the plan', () => {
    expect(SKILL_BUILDS.zeus).toEqual(['Q', 'W', 'Q', 'E', 'Q', 'R', 'Q', 'W', 'W', 'W', 'R', 'E', 'E', 'E', 'R']);
    expect(TALENT_BUILDS.zeus).toEqual([1, 1, 0, 0]);
  });

  const ctxFor = (w: World, me: Unit, slot: AbilitySlot, enemies: Unit[], retreating = false): AiCtx => ({
    world: w, me, ab: me.ability(slot)!, skill: DIFFICULTY.normal.skill, enemyHeroes: enemies, allyHeroes: [],
    hpPct: me.hp / me.stats.maxHp, manaPct: me.mana / me.stats.maxMana, retreating,
  });

  it('Arc Lightning hits heroes, secures creep kills, and clears clumps of creeps', () => {
    const w = makeWorld();
    const z = heroAt(w, Z, { x: 1500, y: 5000 }, { levels: ALL });
    const h = foe(w, 1500, 4150);
    w.step();
    const Q = ZEUS_RULES.zeus_arc_lightning;
    expect(Q.decide(ctxFor(w, z, 'Q', [h]))).toEqual({ cast: { unitId: h.id } });
    z.mana = z.stats.maxMana * 0.3;
    expect(Q.decide(ctxFor(w, z, 'Q', [h]))).toBeNull();
    // 小兵：一下能打死的（魔法 > 60%）
    const w2 = makeWorld();
    const z2 = heroAt(w2, Z, { x: 1500, y: 5000 }, { levels: ALL });
    const full = foe(w2, 1500, 4700, { kind: 'creep', hp: 550 });
    const low = foe(w2, 1600, 4700, { kind: 'creep', hp: 550 });
    low.hp = 150;
    w2.step();
    expect(Q.decide(ctxFor(w2, z2, 'Q', []))).toEqual({ cast: { unitId: low.id } });
    z2.mana = z2.stats.maxMana * 0.5;
    expect(Q.decide(ctxFor(w2, z2, 'Q', []))).toBeNull();
    // 三个小兵扎堆（魔法 > 70%）
    z2.mana = z2.stats.maxMana;
    low.hp = 550;
    expect(Q.decide(ctxFor(w2, z2, 'Q', []))).toBeNull();
    foe(w2, 1550, 4600, { kind: 'creep', hp: 550 });
    w2.step();
    expect(Q.decide(ctxFor(w2, z2, 'Q', []))).not.toBeNull();
    z2.mana = z2.stats.maxMana * 0.65;
    expect(Q.decide(ctxFor(w2, z2, 'Q', []))).toBeNull();
    void full;
  });

  it('Lightning Bolt interrupts channels first, then finishes low heroes, then pokes with spare mana', () => {
    const w = makeWorld();
    const z = heroAt(w, Z, { x: 1500, y: 5000 }, { levels: ALL });
    const a = foe(w, 1500, 4500);
    const cm = heroAt(w, 'crystal_maiden', { x: 1700, y: 4300 }, { levels: ALL, team: Team.Dire });
    w.step();
    const W = ZEUS_RULES.zeus_lightning_bolt;
    expect(W.priority).toBe(25);
    expect(W.decide(ctxFor(w, z, 'W', [a, cm]))).toEqual({ cast: { unitId: a.id } });
    w.issue(cm.id, { type: 'cast', slot: 'R' });
    w.step();
    expect(W.decide(ctxFor(w, z, 'W', [a, cm]))).toEqual({ cast: { unitId: cm.id } });
    // 魔法 ≤ 50%：只打半血以下的
    const w2 = makeWorld();
    const z2 = heroAt(w2, Z, { x: 1500, y: 5000 }, { levels: ALL });
    const b = foe(w2, 1500, 4500);
    const c = foe(w2, 1700, 4400);
    w2.step();
    z2.mana = z2.stats.maxMana * 0.45;
    expect(W.decide(ctxFor(w2, z2, 'W', [b, c]))).toBeNull();
    c.hp = 400;
    expect(W.decide(ctxFor(w2, z2, 'W', [b, c]))).toEqual({ cast: { unitId: c.id } });
  });

  it('Heavenly Jump escapes home when retreating, and dives toward heroes when healthy', () => {
    const w = makeWorld();
    const z = heroAt(w, Z, { x: 1500, y: 5000 }, { levels: ALL });
    const h = foe(w, 1500, 4600);
    w.step();
    const E = ZEUS_RULES.zeus_heavenly_jump;
    expect(E.escape).toBe(true);
    const esc = E.decide(ctxFor(w, z, 'E', [h], true));
    expect(esc).toEqual({ cast: { dir: towardHome(z) } });
    expect(E.decide(ctxFor(w, z, 'E', [], true))).toBeNull();
    const dive = E.decide(ctxFor(w, z, 'E', [h]));
    expect(dive && 'cast' in dive && dive.cast.dir!.y).toBeLessThan(0);
    z.hp = z.stats.maxHp * 0.5;
    expect(E.decide(ctxFor(w, z, 'E', [h]))).toBeNull();
  });

  it("Thundergod's Wrath fires when it kills anyone on the map, or two heroes are low", () => {
    const w = makeWorld();
    const z = heroAt(w, Z, { x: 1500, y: 9000 }, { levels: ALL });
    const a = foe(w, 1500, 1000, { hp: 2000 });
    const b = foe(w, 1500, 1500, { hp: 2000 });
    w.step();
    const R = ZEUS_RULES.zeus_thundergods_wrath;
    expect(R.priority).toBe(30);
    expect(R.decide(ctxFor(w, z, 'R', []))).toBeNull();
    // 575 + 静电场（590 × 4.35%）：590 血可以杀
    a.hp = 590;
    expect(R.decide(ctxFor(w, z, 'R', []))).toEqual({ cast: {} });
    a.hp = 700;
    expect(R.decide(ctxFor(w, z, 'R', []))).toBeNull();
    b.hp = 700;
    expect(R.decide(ctxFor(w, z, 'R', []))).toEqual({ cast: {} });
  });

  it('AI uses every active ability in a skirmish', () => {
    const cast = abilitiesCastInSkirmish(Z);
    for (const id of ['zeus_arc_lightning', 'zeus_lightning_bolt', 'zeus_heavenly_jump', 'zeus_thundergods_wrath']) expect(cast).toContain(id);
  }, 60000);
});
