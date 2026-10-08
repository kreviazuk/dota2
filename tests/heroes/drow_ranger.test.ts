import { describe, it, expect } from 'vitest';
import { heroAt, makeWorld, runFor, spawnDummy } from '../helpers';
import { abilitiesCastInSkirmish } from '../heroAi';
import { createHero } from '../../src/sim/systems/heroes';
import { addModifier, findModifier } from '../../src/sim/modifiers';
import { abilityCooldown, abilityManaCost, abilityValue } from '../../src/sim/systems/abilities';
import { learnAbility } from '../../src/sim/systems/progress';
import { applyControl } from '../../src/sim/status';
import { armorMultiplier } from '../../src/sim/formulas';
import { pickTalent, type TalentTier } from '../../src/sim/talents';
import { getHeroDef } from '../../src/sim/heroes/index';
import { DROW_RULES } from '../../src/ai/usage/drow_ranger';
import { SKILL_BUILDS, TALENT_BUILDS } from '../../src/ai/builds';
import { DIFFICULTY } from '../../src/ai/difficulty';
import { Team, type AbilitySlot } from '../../src/sim/core/types';
import type { World } from '../../src/sim/world';
import type { Unit } from '../../src/sim/entities/unit';
import type { AiCtx } from '../../src/ai/usage/types';

/** 不会还手的敌方木桩 */
const foe = (
  w: World, x: number, y: number,
  o: { kind?: 'hero' | 'creep' | 'building'; hp?: number; ms?: number; armor?: number; radius?: number } = {},
): Unit =>
  spawnDummy(w, {
    kind: o.kind ?? 'hero', team: Team.Dire, pos: { x, y }, radius: o.radius,
    base: { damageMin: 0, damageMax: 0, maxHp: o.hp ?? 1000, moveSpeed: o.ms ?? 300, armor: o.armor ?? 0 },
  });

const ALL = { Q: 4, W: 4, E: 4, R: 3 } as const;
const D = 'drow_ranger';

/** 本次 drain 里打到 targetId 身上的伤害事件 */
const damages = (w: World, targetId: number): { amount: number; isAttack: boolean }[] =>
  w.events.drain().flatMap((e) => (e.type === 'damage' && e.targetId === targetId ? [{ amount: e.amount, isAttack: e.isAttack }] : []));

/** 让 me 普攻 t，直到出现 n 次普攻伤害（或超时）；返回这些普攻伤害 */
function attackHits(w: World, me: Unit, t: Unit, n: number, maxSec = 30): number[] {
  w.events.drain();
  w.issue(me.id, { type: 'attack', mode: 'smart', targetId: t.id });
  const out: number[] = [];
  for (let i = 0; i < maxSec * 30 && out.length < n; i++) {
    w.step();
    for (const e of w.events.drain()) if (e.type === 'damage' && e.targetId === t.id && e.isAttack) out.push(e.amount);
  }
  return out;
}

describe('Drow Ranger', () => {
  it('has 7.41f level-1 stats (with Precision Aura 11%)', () => {
    const w = makeWorld();
    const d = createHero(w, D, Team.Radiant, false);
    w.step();
    expect(d.stats.agi).toBeCloseTo(26.64);
    expect(d.stats.maxHp).toBeCloseTo(472);
    expect(d.stats.maxMana).toBeCloseTo(255);
    expect(d.stats.armor).toBeCloseTo(4.44, 2);
    expect(d.stats.damageMin).toBeCloseTo(53.64);
    expect(d.stats.damageMax).toBeCloseTo(60.64);
    expect(d.stats.attackSpeed).toBeCloseTo(126.64);
    expect(d.stats.attackInterval).toBeCloseTo(1.7 / 1.2664, 3);
    expect(d.stats.attackRange).toBe(625);
    expect(d.stats.moveSpeed).toBe(310);
    const def = getHeroDef(D);
    expect(def.name).toBe('卓尔游侠');
    expect(def.title).toBe('崔希丝');
    expect(def.roles).toEqual(['核心', '远程', '减速']);
    expect(def.abilities.map((a) => a.id)).toEqual([
      'drow_frost_arrows', 'drow_gust', 'drow_multishot', 'drow_marksmanship', 'drow_precision_aura',
    ]);
  });

  it('Frost Arrows start switched on, cost mana per arrow, add damage and slow; switched off or out of mana they do nothing', () => {
    const w = makeWorld();
    const d = heroAt(w, D, { x: 1500, y: 5000 }, { heroLevel: 7 });
    const q = d.ability('Q')!;
    expect(q.toggled).toBe(false);
    d.hero!.skillPoints = 4;
    for (let i = 0; i < 4; i++) expect(learnAbility(w, d, 'Q')).toBe(true);
    // 第一次学会时自动开启
    expect(q.level).toBe(4);
    expect(q.toggled).toBe(true);
    const t = foe(w, 1500, 4600, { hp: 100000 });
    d.mana = 100;
    // 出手：扣 12 魔、+30 伤害、蓝色箭
    w.events.drain();
    w.issue(d.id, { type: 'attack', mode: 'smart', targetId: t.id });
    let proj = null as null | { visual: string };
    let spent = 0;
    for (let i = 0; i < 60 && !proj; i++) {
      const m = d.mana;
      w.step();
      proj = w.projectiles.find((p) => !p.done && p.sourceId === d.id) ?? null;
      spent = m - d.mana;
    }
    expect(proj?.visual).toBe('drow_frost_arrow');
    expect(spent).toBeCloseTo(12, 0);
    // 命中：45% 减速 1.5 秒
    let hit: number[] = [];
    for (let i = 0; i < 30 && hit.length === 0; i++) {
      w.step();
      hit = damages(w, t.id).filter((h) => h.isAttack).map((h) => h.amount);
    }
    expect(hit.length).toBe(1);
    expect(hit[0]).toBeGreaterThanOrEqual(d.stats.damageMin + d.stats.bonusDamage + 30 - 1e-6);
    expect(hit[0]).toBeLessThanOrEqual(d.stats.damageMax + d.stats.bonusDamage + 30 + 1e-6);
    const slow = findModifier(t, 'slow_drow_frost')!;
    expect(slow).toBeDefined();
    expect(slow.total).toBeCloseTo(1.5);
    expect(t.stats.moveSpeed).toBeCloseTo(300 * 0.55);

    // 关掉：不扣魔、普通箭、不减速
    w.issue(d.id, { type: 'toggle', slot: 'Q' });
    w.step();
    expect(q.toggled).toBe(false);
    const w2 = makeWorld();
    const d2 = heroAt(w2, D, { x: 1500, y: 5000 }, { levels: { Q: 4 } });
    const t2 = foe(w2, 1500, 4600, { hp: 100000 });
    d2.ability('Q')!.toggled = false;
    const m2 = d2.mana;
    const h2 = attackHits(w2, d2, t2, 2);
    expect(h2.length).toBe(2);
    expect(d2.mana).toBeGreaterThanOrEqual(m2 - 1e-6);
    expect(findModifier(t2, 'slow_drow_frost')).toBeUndefined();
    for (const a of h2) expect(a).toBeLessThanOrEqual(d2.stats.damageMax + d2.stats.bonusDamage + 1e-6);

    // 魔法 < 12：普通箭（开关仍开着）
    const w3 = makeWorld();
    const d3 = heroAt(w3, D, { x: 1500, y: 5000 }, { levels: { Q: 4 } });
    const t3 = foe(w3, 1500, 4600, { hp: 100000 });
    d3.ability('Q')!.toggled = true;
    d3.mana = 5;
    w3.issue(d3.id, { type: 'attack', mode: 'smart', targetId: t3.id });
    let p3 = null as null | { visual: string };
    for (let i = 0; i < 60 && !p3; i++) {
      w3.step();
      p3 = w3.projectiles.find((p) => !p.done && p.sourceId === d3.id) ?? null;
    }
    expect(p3?.visual).toBe('hero:drow_ranger');
    expect(d3.mana).toBeGreaterThan(4.9);
    expect(d3.ability('Q')!.toggled).toBe(true);
    runFor(w3, 0.6);
    expect(findModifier(t3, 'slow_drow_frost')).toBeUndefined();
  });

  it('Frost Arrows are never spent on buildings', () => {
    const w = makeWorld();
    const d = heroAt(w, D, { x: 1500, y: 5000 }, { levels: { Q: 4 } });
    d.ability('Q')!.toggled = true;
    const tower = foe(w, 1500, 4600, { kind: 'building', hp: 100000 });
    const m0 = d.mana;
    const hits = attackHits(w, d, tower, 2);
    expect(hits.length).toBe(2);
    expect(d.mana).toBeGreaterThanOrEqual(m0 - 1e-6);
    expect(findModifier(tower, 'slow_drow_frost')).toBeUndefined();
  });

  it('Gust silences and knocks back enemies in a 900 × 250 line, farther when closer', () => {
    const w = makeWorld();
    const d = heroAt(w, D, { x: 1500, y: 5000 }, { levels: { W: 4 } });
    const near = foe(w, 1500, 4900);
    const far = foe(w, 1560, 4300);
    const side = foe(w, 1700, 4600);
    const immune = foe(w, 1580, 4550);
    addModifier(w, immune, { id: 'test_bkb', states: ['debuffImmune'] }, { duration: 10 });
    // 正在引导的敌方水晶室女：被击退打断
    const cm = heroAt(w, 'crystal_maiden', { x: 1460, y: 4700 }, { levels: { R: 1 }, team: Team.Dire });
    w.issue(cm.id, { type: 'cast', slot: 'R' });
    w.step();
    expect(cm.cast?.phase).toBe('channel');
    w.events.drain();
    w.issue(d.id, { type: 'cast', slot: 'W', target: { dir: { x: 0, y: -1 } } });
    runFor(w, 0.4);
    expect(w.events.drain().some((e) => e.type === 'fx' && e.kind === 'drow_gust')).toBe(true);
    expect(near.hasState('silenced')).toBe(true);
    expect(findModifier(near, 'status_silence')!.total).toBeCloseTo(6);
    expect(near.motion?.kind).toBe('knockback');
    expect(cm.cast).toBeNull();
    runFor(w, 1.1);
    expect(far.hasState('silenced')).toBe(true);
    // 100 处推 ≈ 400，700 处推 ≈ 100（击退方向 = 卓尔 → 目标）
    expect(4900 - near.pos.y).toBeGreaterThan(385);
    expect(4900 - near.pos.y).toBeLessThan(415);
    expect(4300 - far.pos.y).toBeGreaterThan(85);
    expect(4300 - far.pos.y).toBeLessThan(115);
    // 线外的不受影响；减益免疫的不受影响
    expect(side.hasState('silenced')).toBe(false);
    expect(side.pos.y).toBeCloseTo(4600);
    expect(immune.hasState('silenced')).toBe(false);
    expect(immune.pos.y).toBeCloseTo(4550);
    expect(abilityCooldown(d.ability('W')!, d)).toBe(13);
  });

  it('Gust knockback duration shrinks with distance but never below 0.4 s', () => {
    const w = makeWorld();
    const d = heroAt(w, D, { x: 1500, y: 5000 }, { levels: { W: 4 } });
    const near = foe(w, 1500, 4910);
    const far = foe(w, 1560, 4250);
    w.issue(d.id, { type: 'cast', slot: 'W', target: { dir: { x: 0, y: -1 } } });
    let nearDur = 0;
    let farDur = 0;
    for (let i = 0; i < 40; i++) {
      w.step();
      if (near.motion && !nearDur) nearDur = near.motion.duration;
      if (far.motion && !farDur) farDur = far.motion.duration;
    }
    // 0.9 × (1 − 90/900) = 0.81；0.9 × (1 − 750/900) = 0.15 → 0.4
    expect(nearDur).toBeCloseTo(0.81, 1);
    expect(farDur).toBeCloseTo(0.4, 2);
  });

  it('Multishot fires 3 waves of 4 arrows in a 50° cone over 1.75 s, at most one arrow per unit per wave, and Drow can move at −35%', () => {
    const w = makeWorld();
    const d = heroAt(w, D, { x: 1500, y: 5000 }, { levels: { Q: 4, E: 4 } });
    const t = foe(w, 1500, 4600, { hp: 100000 });
    // 锥形边缘（25°）上的木桩被外侧的箭打中；锥形外的打不中
    const edge = foe(w, 1500 + Math.sin(25 * Math.PI / 180) * 700, 5000 - Math.cos(25 * Math.PI / 180) * 700, { hp: 100000 });
    const outside = foe(w, 1500 + Math.sin(40 * Math.PI / 180) * 500, 5000 - Math.cos(40 * Math.PI / 180) * 500, { hp: 100000 });
    w.events.drain();
    w.issue(d.id, { type: 'cast', slot: 'E', target: { dir: { x: 0, y: -1 } } });
    w.step();
    expect(d.cast?.phase).toBe('channel');
    // 第一波 4 支箭立即发出
    expect(w.projectiles.filter((p) => !p.done && p.visual === 'drow_multishot').length).toBe(4);
    const hits: { t: number; amount: number }[] = [];
    let edgeHits = 0;
    for (let i = 0; i < 90; i++) {
      w.step();
      for (const e of w.events.drain()) {
        if (e.type !== 'damage') continue;
        if (e.targetId === t.id) {
          expect(e.isAttack).toBe(false);
          hits.push({ t: w.time, amount: e.amount });
          // 附带霜冻减速（不耗蓝）
          expect(findModifier(t, 'slow_drow_frost')).toBeDefined();
        }
        if (e.targetId === edge.id) edgeHits++;
      }
    }
    expect(hits.length).toBe(3);
    expect(edgeHits).toBe(3);
    expect(outside.hp).toBe(100000);
    // 三波均匀分布在 1.75 秒内：间隔 ≈ 0.583
    expect(hits[1].t - hits[0].t).toBeCloseTo(1.75 / 3, 1);
    expect(hits[2].t - hits[1].t).toBeCloseTo(1.75 / 3, 1);
    // 攻击力 × 1.4 + 霜冻之箭 30（木桩 0 护甲）
    const s = d.stats;
    for (const h of hits) {
      expect(h.amount).toBeGreaterThanOrEqual((s.damageMin + s.bonusDamage) * 1.4 + 30 - 1e-6);
      expect(h.amount).toBeLessThanOrEqual((s.damageMax + s.bonusDamage) * 1.4 + 30 + 1e-6);
    }
    expect(d.cast).toBeNull();

    // 引导中移动不打断，移速 × 0.65；结束后恢复
    const w2 = makeWorld();
    const d2 = heroAt(w2, D, { x: 1500, y: 5000 }, { levels: { E: 4 } });
    const ms0 = d2.stats.moveSpeed;
    w2.issue(d2.id, { type: 'cast', slot: 'E', target: { dir: { x: 0, y: -1 } } });
    w2.step();
    expect(d2.cast?.phase).toBe('channel');
    w2.issue(d2.id, { type: 'move', dir: { x: 1, y: 0 } });
    runFor(w2, 0.7);
    expect(d2.cast?.phase).toBe('channel');
    expect(d2.stats.moveSpeed).toBeCloseTo(ms0 * 0.65);
    expect(d2.pos.x).toBeGreaterThan(1500 + ms0 * 0.65 * 0.6);
    // 边走边射：面向保持在施法方向
    expect(d2.facing).toBeCloseTo(-Math.PI / 2);
    // 方向固定在施放时（D19）：移动后发出的箭仍然朝上
    const arrows = w2.projectiles.filter((p) => !p.done && p.visual === 'drow_multishot');
    expect(arrows.length).toBeGreaterThan(0);
    expect(arrows.every((p) => (p.dir?.y ?? 0) < -0.85)).toBe(true);
    runFor(w2, 1.2);
    expect(d2.cast).toBeNull();
    expect(d2.stats.moveSpeed).toBeCloseTo(ms0);
    // 被眩晕打断时也移除自身减速
    const w3 = makeWorld();
    const d3 = heroAt(w3, D, { x: 1500, y: 5000 }, { levels: { E: 4 } });
    w3.issue(d3.id, { type: 'cast', slot: 'E', target: { dir: { x: 0, y: -1 } } });
    w3.step();
    applyControl(w3, d3, 'stun', { source: null, duration: 0.2 });
    w3.step();
    expect(d3.cast).toBeNull();
    runFor(w3, 0.3);
    expect(d3.stats.moveSpeed).toBeCloseTo(d3.base.moveSpeed);
  });

  it('Marksmanship pierces base armor with true strike and turns off with an enemy hero within 150', () => {
    const w = makeWorld(3);
    const d = heroAt(w, D, { x: 1500, y: 5000 }, { levels: { R: 3 } });
    const t = foe(w, 1500, 4500, { hp: 1e7, armor: 20 });
    // 100% 闪避
    addModifier(w, t, { id: 'test_evasion', stats: { evasion: 1 } });
    w.step();
    expect(t.stats.evasion).toBeCloseTo(1);
    const visuals = new Set<string>();
    w.issue(d.id, { type: 'attack', mode: 'smart', targetId: t.id });
    const hits: number[] = [];
    let misses = 0;
    for (let i = 0; i < 60 * 30; i++) {
      w.step();
      for (const p of w.projectiles) if (!p.done && p.sourceId === d.id) visuals.add(p.visual);
      for (const e of w.events.drain()) {
        if (e.type === 'damage' && e.targetId === t.id && e.isAttack) hits.push(e.amount);
        if (e.type === 'miss' && e.attackerId === d.id) misses++;
      }
    }
    const s = d.stats;
    const total = hits.length + misses;
    expect(total).toBeGreaterThan(40);
    // 命中的都是射手天赋的箭：按 0 护甲算 + 90
    for (const h of hits) {
      expect(h).toBeGreaterThanOrEqual(s.damageMin + s.bonusDamage + 90 - 1e-6);
      expect(h).toBeLessThanOrEqual(s.damageMax + s.bonusDamage + 90 + 1e-6);
    }
    expect(hits.length / total).toBeGreaterThan(0.25);
    expect(hits.length / total).toBeLessThan(0.55);
    expect(visuals.has('drow_marksman_arrow')).toBe(true);

    // 敌方英雄在 140 处：从不触发，inactive 为 true
    const w2 = makeWorld(5);
    const d2 = heroAt(w2, D, { x: 1500, y: 5000 }, { levels: { R: 3 } });
    const t2 = foe(w2, 1500, 4500, { hp: 1e7, armor: 20, kind: 'creep' });
    foe(w2, 1640, 5000, { hp: 1e7 });
    w2.step();
    const r = d2.ability('R')!;
    expect(r.def.inactive?.(d2, r)).toBe(true);
    const h2 = attackHits(w2, d2, t2, 15);
    expect(h2.length).toBe(15);
    for (const h of h2) expect(h).toBeLessThanOrEqual((s.damageMax + s.bonusDamage) * armorMultiplier(20) + 1e-6);
    // 隐藏的敌方英雄不算；离开 150 后恢复
    const w3 = makeWorld();
    const d3 = heroAt(w3, D, { x: 1500, y: 5000 }, { levels: { R: 3 } });
    const lurker = foe(w3, 1640, 5000);
    w3.step();
    const r3 = d3.ability('R')!;
    expect(r3.def.inactive?.(d3, r3)).toBe(true);
    lurker.pos = { x: 1800, y: 5000 };
    w3.step();
    expect(r3.def.inactive?.(d3, r3)).toBe(false);
    lurker.pos = { x: 1640, y: 5000 };
    addModifier(w3, lurker, { id: 'test_hidden', states: ['hidden'] }, { duration: 5 });
    w3.step();
    expect(r3.def.inactive?.(d3, r3)).toBe(false);
    // 被破坏：失效
    applyControl(w3, d3, 'break', { source: null, duration: 5 });
    w3.step();
    expect(r3.def.inactive?.(d3, r3)).toBe(true);
  });

  it('Precision Aura gives Drow 10% + 1% per level of her agility and half of that to ranged allied heroes within 1200', () => {
    const w = makeWorld();
    const zeusAlone = heroAt(w, 'zeus', { x: 1500, y: 9000 });
    const axeAlone = heroAt(w, 'axe', { x: 1700, y: 9000 });
    const zeusAgi0 = zeusAlone.stats.agi;
    const axeAgi0 = axeAlone.stats.agi;

    const w2 = makeWorld();
    const d = heroAt(w2, D, { x: 1500, y: 5000 }, { heroLevel: 18 });
    const zeus = heroAt(w2, 'zeus', { x: 1500, y: 4000 });
    const axe = heroAt(w2, 'axe', { x: 1600, y: 5000 });
    const enemyZeus = heroAt(w2, 'zeus', { x: 1300, y: 5000 }, { team: Team.Dire });
    w2.step();
    // 18 级：28%（第一轮敏捷 24 + 2.8 × 17 = 71.6）
    const own = 71.6 * 0.28;
    expect(d.stats.agi).toBeCloseTo(71.6 + own, 3);
    expect(zeus.stats.agi).toBeCloseTo(zeusAgi0 + own * 0.5, 3);
    expect(axe.stats.agi).toBeCloseTo(axeAgi0, 5);
    expect(enemyZeus.stats.agi).toBeCloseTo(zeusAgi0, 5);
    // 1300 外没有（离开后残留 0.5 秒）
    zeus.pos = { x: 1500, y: 3700 };
    runFor(w2, 0.7);
    expect(zeus.stats.agi).toBeCloseTo(zeusAgi0, 5);
    // 被破坏时都无效
    zeus.pos = { x: 1500, y: 4500 };
    runFor(w2, 0.1);
    expect(zeus.stats.agi).toBeGreaterThan(zeusAgi0 + 1);
    applyControl(w2, d, 'break', { source: null, duration: 5 });
    runFor(w2, 0.7);
    expect(d.stats.agi).toBeCloseTo(71.6, 3);
    expect(zeus.stats.agi).toBeCloseTo(zeusAgi0, 5);
  });
});

describe('Drow Ranger talents', () => {
  it('talents change the documented values', () => {
    const cases: { tier: TalentTier; side: 0 | 1; slot: AbilitySlot; key: string; before: number; after: number }[] = [
      { tier: 0, side: 0, slot: 'Q', key: 'manaPerArrow', before: 12, after: 12 * 0.82 },
      { tier: 0, side: 1, slot: 'E', key: 'arrows', before: 4, after: 5 },
      { tier: 1, side: 1, slot: 'E', key: 'cooldown', before: 15, after: 9 },
      { tier: 2, side: 0, slot: 'W', key: 'selfSpeed', before: 0, after: 0.5 },
      { tier: 2, side: 1, slot: 'E', key: 'damagePct', before: 1.4, after: 1.65 },
      { tier: 3, side: 0, slot: 'R', key: 'chance', before: 0.4, after: 0.48 },
      { tier: 3, side: 1, slot: 'E', key: 'waves', before: 3, after: 5 },
    ];
    const read = (u: Unit, slot: AbilitySlot, key: string): number => {
      const ab = u.ability(slot)!;
      if (key === 'cooldown') return abilityCooldown(ab, u);
      if (key === 'manaCost') return abilityManaCost(ab, u);
      return abilityValue(u, ab, key);
    };
    for (const c of cases) {
      const w = makeWorld();
      const u = heroAt(w, D, { x: 1500, y: 5000 }, { levels: ALL, heroLevel: 25 });
      expect(read(u, c.slot, c.key)).toBeCloseTo(c.before);
      expect(pickTalent(w, u, c.tier, c.side)).toBe(true);
      expect(read(u, c.slot, c.key)).toBeCloseTo(c.after);
    }
    // 15 级左：+75 攻击距离
    const w = makeWorld();
    const u = heroAt(w, D, { x: 1500, y: 5000 }, { levels: ALL, heroLevel: 25 });
    pickTalent(w, u, 1, 0);
    expect(u.stats.attackRange).toBe(700);
    for (const pair of getHeroDef(D).talents) for (const t of pair) expect(t.name.length).toBeGreaterThan(3);
  });

  it('talents change behaviour: cheaper frost arrows, Gust self speed, more arrows and waves, longer Multishot range', () => {
    // 10 级左：每箭 12 × 0.82 魔
    const w = makeWorld();
    const d = heroAt(w, D, { x: 1500, y: 5000 }, { levels: ALL, heroLevel: 25 });
    pickTalent(w, d, 0, 0);
    d.ability('Q')!.toggled = true;
    const t = foe(w, 1500, 4600, { hp: 1e6, kind: 'creep' });
    d.mana = 500;
    w.issue(d.id, { type: 'attack', mode: 'smart', targetId: t.id });
    let spent = 0;
    for (let i = 0; i < 60 && !spent; i++) {
      const m = d.mana;
      w.step();
      if (m - d.mana > 5) spent = m - d.mana;
    }
    expect(spent).toBeCloseTo(12 * 0.82, 0);

    // 20 级左：狂风命中后自己 +50% 移速 3 秒（没命中不加）
    const w2 = makeWorld();
    const d2 = heroAt(w2, D, { x: 1500, y: 5000 }, { levels: ALL, heroLevel: 25 });
    pickTalent(w2, d2, 2, 0);
    const ms0 = d2.stats.moveSpeed;
    w2.issue(d2.id, { type: 'cast', slot: 'W', target: { dir: { x: 0, y: -1 } } });
    runFor(w2, 0.6);
    expect(d2.stats.moveSpeed).toBeCloseTo(ms0);
    d2.ability('W')!.cooldown = 0;
    foe(w2, 1500, 4600);
    foe(w2, 1550, 4500);
    w2.issue(d2.id, { type: 'cast', slot: 'W', target: { dir: { x: 0, y: -1 } } });
    runFor(w2, 0.6);
    expect(d2.stats.moveSpeed).toBeCloseTo(ms0 * 1.5);
    runFor(w2, 3);
    expect(d2.stats.moveSpeed).toBeCloseTo(ms0);

    // 10 级右 + 25 级右：每波 5 支箭、5 波
    const w3 = makeWorld();
    const d3 = heroAt(w3, D, { x: 1500, y: 5000 }, { levels: ALL, heroLevel: 25 });
    pickTalent(w3, d3, 0, 1);
    pickTalent(w3, d3, 3, 1);
    const tgt = foe(w3, 1500, 4600, { hp: 1e6 });
    w3.issue(d3.id, { type: 'cast', slot: 'E', target: { dir: { x: 0, y: -1 } } });
    w3.step();
    expect(w3.projectiles.filter((p) => !p.done && p.visual === 'drow_multishot').length).toBe(5);
    w3.events.drain();
    runFor(w3, 2.5);
    expect(w3.events.drain().filter((e) => e.type === 'damage' && e.targetId === tgt.id).length).toBe(5);

    // 15 级左：+75 攻击距离 → 数箭齐发射程 1175
    const w4 = makeWorld();
    const d4 = heroAt(w4, D, { x: 1500, y: 6000 }, { levels: ALL, heroLevel: 25 });
    const e = d4.ability('E')!;
    expect(e.def.aimShape?.(d4, e).length).toBe(1100);
    pickTalent(w4, d4, 1, 0);
    expect(e.def.aimShape?.(d4, e).length).toBe(1175);
    // 4 支箭在 ±8.33°、±25°：放在 8.33° 方向 1200 处（边缘 1180，碰撞半径 45 + 20）——1100 打不到，1175 打得到
    const a = (50 / 3 / 2) * Math.PI / 180;
    const farT = foe(w4, 1500 + Math.sin(a) * 1200, 6000 - Math.cos(a) * 1200, { hp: 1e6 });
    w4.issue(d4.id, { type: 'cast', slot: 'E', target: { dir: { x: 0, y: -1 } } });
    runFor(w4, 2.8);
    expect(farT.hp).toBeLessThan(1e6);
  });
});

describe('Drow Ranger AI', () => {
  it('builds and talents follow the plan', () => {
    expect(SKILL_BUILDS.drow_ranger).toEqual(['W', 'Q', 'E', 'Q', 'E', 'R', 'E', 'Q', 'E', 'Q', 'R', 'W', 'W', 'W', 'R']);
    expect(TALENT_BUILDS.drow_ranger).toEqual([0, 0, 1, 0]);
  });

  const ctxFor = (w: World, me: Unit, slot: AbilitySlot, enemies: Unit[], retreating = false): AiCtx => ({
    world: w, me, ab: me.ability(slot)!, skill: DIFFICULTY.normal.skill, enemyHeroes: enemies, allyHeroes: [],
    hpPct: me.hp / me.stats.maxHp, manaPct: me.mana / me.stats.maxMana, retreating,
  });

  it('Frost Arrows switch on above 30% mana and off below 15%', () => {
    const w = makeWorld();
    const d = heroAt(w, D, { x: 1500, y: 5000 }, { levels: ALL });
    const Q = DROW_RULES.drow_frost_arrows;
    const q = d.ability('Q')!;
    q.toggled = false;
    d.mana = d.stats.maxMana * 0.5;
    expect(Q.decide(ctxFor(w, d, 'Q', []))).toEqual({ toggle: true });
    d.mana = d.stats.maxMana * 0.2;
    expect(Q.decide(ctxFor(w, d, 'Q', []))).toBeNull();
    q.toggled = true;
    expect(Q.decide(ctxFor(w, d, 'Q', []))).toBeNull();
    d.mana = d.stats.maxMana * 0.1;
    expect(Q.decide(ctxFor(w, d, 'Q', []))).toEqual({ toggle: true });
  });

  it('Gust pushes away melee heroes, interrupts channels, and covers a retreat', () => {
    const w = makeWorld();
    const d = heroAt(w, D, { x: 1500, y: 5000 }, { levels: ALL });
    const axe = heroAt(w, 'axe', { x: 1500, y: 4700 }, { team: Team.Dire });
    const lina = heroAt(w, 'lina', { x: 1700, y: 4800 }, { team: Team.Dire });
    w.step();
    const W = DROW_RULES.drow_gust;
    expect(W.priority).toBe(20);
    expect(W.escape).toBe(true);
    const dirTo = (u: Unit) => ({ x: u.pos.x - d.pos.x, y: u.pos.y - d.pos.y });
    expect(W.decide(ctxFor(w, d, 'W', [axe, lina]))).toEqual({ cast: { dir: dirTo(axe) } });
    // 远程英雄贴近不放；正在引导的英雄（900 内）放
    axe.pos = { x: 1500, y: 4400 };
    expect(W.decide(ctxFor(w, d, 'W', [axe, lina]))).toBeNull();
    const cm = heroAt(w, 'crystal_maiden', { x: 1500, y: 4300 }, { levels: ALL, team: Team.Dire });
    w.issue(cm.id, { type: 'cast', slot: 'R' });
    w.step();
    expect(W.decide(ctxFor(w, d, 'W', [axe, lina, cm]))).toEqual({ cast: { dir: dirTo(cm) } });
    // 撤退：500 内的任何敌方英雄
    const w2 = makeWorld();
    const d2 = heroAt(w2, D, { x: 1500, y: 5000 }, { levels: ALL });
    const l2 = heroAt(w2, 'lina', { x: 1500, y: 4600 }, { team: Team.Dire });
    w2.step();
    expect(W.decide(ctxFor(w2, d2, 'W', [l2]))).toBeNull();
    expect(W.decide(ctxFor(w2, d2, 'W', [l2], true))).toEqual({ cast: { dir: { x: 0, y: -400 } } });
  });

  it('Multishot fires at heroes in the cone, or at four creeps with spare mana', () => {
    const w = makeWorld();
    const d = heroAt(w, D, { x: 1500, y: 5000 }, { levels: ALL });
    const E = DROW_RULES.drow_multishot;
    const h = foe(w, 1500, 4000);
    w.step();
    const dec = E.decide(ctxFor(w, d, 'E', [h]));
    expect(dec && 'cast' in dec && dec.cast.dir!.y).toBeLessThan(0);
    // 1100 外的英雄不放
    h.pos = { x: 1500, y: 3800 };
    expect(E.decide(ctxFor(w, d, 'E', [h]))).toBeNull();
    // 4 个小兵，魔法 > 50%
    const w2 = makeWorld();
    const d2 = heroAt(w2, D, { x: 1500, y: 5000 }, { levels: ALL });
    for (let i = 0; i < 3; i++) foe(w2, 1450 + i * 50, 4500, { kind: 'creep' });
    w2.step();
    expect(E.decide(ctxFor(w2, d2, 'E', []))).toBeNull();
    foe(w2, 1500, 4400, { kind: 'creep' });
    w2.step();
    expect(E.decide(ctxFor(w2, d2, 'E', []))).not.toBeNull();
    d2.mana = d2.stats.maxMana * 0.4;
    expect(E.decide(ctxFor(w2, d2, 'E', []))).toBeNull();
  });

  it('AI uses every active ability in a skirmish', () => {
    const cast = abilitiesCastInSkirmish(D);
    for (const id of ['drow_frost_arrows', 'drow_gust', 'drow_multishot']) expect(cast).toContain(id);
  }, 60000);
});
