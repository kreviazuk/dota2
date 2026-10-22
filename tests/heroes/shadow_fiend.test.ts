import { describe, it, expect } from 'vitest';
import { heroAt, makeWorld, runFor, spawnDummy } from '../helpers';
import { abilitiesCastInSkirmish } from '../heroAi';
import { createHero } from '../../src/sim/systems/heroes';
import { findModifier } from '../../src/sim/modifiers';
import { abilityCastPoint, abilityCooldown, abilityManaCost, abilityMaxCharges, abilityValue, resolveTarget } from '../../src/sim/systems/abilities';
import { killUnit } from '../../src/sim/systems/damage';
import { applyControl } from '../../src/sim/status';
import { recomputeStats } from '../../src/sim/stats';
import { pickTalent, type TalentTier } from '../../src/sim/talents';
import { getHeroDef } from '../../src/sim/heroes/index';
import { getSouls, setSouls } from '../../src/sim/heroes/shadow_fiend';
import { SF_RULES } from '../../src/ai/usage/shadow_fiend';
import { SKILL_BUILDS, TALENT_BUILDS } from '../../src/ai/builds';
import { DIFFICULTY } from '../../src/ai/difficulty';
import { Team, type AbilitySlot } from '../../src/sim/core/types';
import type { World } from '../../src/sim/world';
import type { Unit } from '../../src/sim/entities/unit';
import type { AiCtx } from '../../src/ai/usage/types';

/** 不会还手的木桩（缺省敌方英雄） */
const foe = (
  w: World, x: number, y: number,
  o: { kind?: 'hero' | 'creep' | 'building' | 'summon'; hp?: number; team?: Team; armor?: number } = {},
): Unit =>
  spawnDummy(w, {
    kind: o.kind ?? 'hero', team: o.team ?? Team.Dire, pos: { x, y },
    base: { damageMin: 0, damageMax: 0, maxHp: o.hp ?? 1000, armor: o.armor ?? 0, moveSpeed: 300 },
  });

const ALL = { Q: 4, W: 4, E: 4, R: 3 } as const;
const SF = 'shadow_fiend';
const P0 = { x: 1500, y: 5000 };
const dist2 = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);
const lines = (w: World) => w.projectiles.filter((p) => p.visual === 'sf_requiem_line' && !p.done);

type Dmg = { sourceId: number | null; targetId: number; amount: number; isAttack: boolean; damageType: string };
type Ev = ReturnType<World['events']['drain']>[number];
const damages = (ev: Ev[]): Dmg[] =>
  ev.flatMap((e) => (e.type === 'damage' ? [{ sourceId: e.sourceId, targetId: e.targetId, amount: e.amount, isAttack: e.isAttack, damageType: e.damageType }] : []));
const fxOf = (ev: Ev[], kind: string) => ev.filter((e) => e.type === 'fx' && e.kind === kind);
const dmgTo = (ev: Ev[], src: Unit, t: Unit): Dmg[] => damages(ev).filter((d) => d.sourceId === src.id && d.targetId === t.id);

describe('Shadow Fiend', () => {
  it('has 7.41f level-1 stats', () => {
    const w = makeWorld();
    const s = createHero(w, SF, Team.Radiant, false);
    w.step();
    expect(s.stats.maxHp).toBeCloseTo(538);
    expect(s.stats.maxMana).toBeCloseTo(267);
    expect(s.stats.armor).toBeCloseTo(4.17, 2);
    expect(s.stats.damageMin).toBeCloseTo(41);
    expect(s.stats.damageMax).toBeCloseTo(47);
    expect(s.stats.bonusDamage).toBe(0);
    expect(s.stats.attackInterval).toBeCloseTo(1.28, 3);
    expect(s.stats.hpRegen).toBeCloseTo(2.15);
    expect(s.stats.manaRegen).toBeCloseTo(1.1);
    expect(s.stats.attackRange).toBe(525);
    expect(s.stats.moveSpeed).toBe(305);
    expect(s.isMelee).toBe(false);
    const def = getHeroDef(SF);
    expect(def.name).toBe('影魔');
    expect(def.title).toBe('奈文摩尔');
    expect(def.primary).toBe('agi');
    expect(def.roles).toEqual(['核心', '爆发', '推进']);
    expect(def.abilities.map((a) => a.id)).toEqual(['sf_shadowraze', 'sf_feast_of_souls', 'sf_presence', 'sf_requiem', 'sf_necromastery']);
    for (const a of def.abilities) expect(a.description.length).toBeGreaterThan(20);
  });

  it('Necromastery: +1 soul per kill, +4 per hero kill, capped at 20; damage per soul steps up every 6 levels; keeps 70% on death', () => {
    const w = makeWorld();
    const s = heroAt(w, SF, P0, { heroLevel: 5 });
    const inn = s.ability('innate')!;
    expect(inn.def.id).toBe('sf_necromastery');
    expect(inn.def.counter!(s, inn)).toBe(0);
    // 小兵 +1、英雄 +4（敌我都算：反补也收魂；建筑、召唤物不算）
    killUnit(w, foe(w, 2500, 4000, { kind: 'creep' }), s);
    expect(getSouls(s)).toBe(1);
    killUnit(w, foe(w, 2500, 4000), s);
    expect(getSouls(s)).toBe(5);
    killUnit(w, foe(w, 2500, 4000, { kind: 'creep', team: Team.Radiant }), s);
    expect(getSouls(s)).toBe(6);
    killUnit(w, foe(w, 2500, 4000, { kind: 'building' }), s);
    killUnit(w, foe(w, 2500, 4000, { kind: 'summon' }), s);
    expect(getSouls(s)).toBe(6);
    // 别人的击杀不给
    killUnit(w, foe(w, 2500, 4000, { kind: 'creep' }), null);
    expect(getSouls(s)).toBe(6);
    expect(inn.def.counter!(s, inn)).toBe(6);
    // 上限 20
    setSouls(s, 18);
    killUnit(w, foe(w, 2500, 4000), s);
    expect(getSouls(s)).toBe(20);
    killUnit(w, foe(w, 2500, 4000, { kind: 'creep' }), s);
    expect(getSouls(s)).toBe(20);
    // 已经超过上限（灵魂盛宴借来的）时击杀不会减少
    setSouls(s, 24);
    killUnit(w, foe(w, 2500, 4000, { kind: 'creep' }), s);
    expect(getSouls(s)).toBe(24);
    // 被破坏时不收魂
    setSouls(s, 3);
    applyControl(w, s, 'break', { source: null, duration: 5 });
    killUnit(w, foe(w, 2500, 4000), s);
    expect(getSouls(s)).toBe(3);

    // 每个灵魂的攻击力：5 级 1、6 级 1.8、12 级 2.6
    const w2 = makeWorld();
    const s2 = heroAt(w2, SF, P0, { heroLevel: 5 });
    setSouls(s2, 20, w2);
    expect(s2.stats.bonusDamage).toBeCloseTo(20);
    s2.hero!.level = 6;
    recomputeStats(w2, s2);
    expect(s2.stats.bonusDamage).toBeCloseTo(36);
    s2.hero!.level = 12;
    recomputeStats(w2, s2);
    expect(s2.stats.bonusDamage).toBeCloseTo(52);
    // 死亡保留 70%（向下取整），复活后仍然在
    killUnit(w2, s2, null);
    expect(getSouls(s2)).toBe(14);
    let n = 0;
    while (!s2.alive && n++ < 30 * 200) w2.step();
    expect(s2.alive).toBe(true);
    expect(getSouls(s2)).toBe(14);
    expect(s2.stats.bonusDamage).toBeCloseTo(14 * 2.6);
  });

  it('Shadowraze is one Q with 3 independent 9 s charges', () => {
    const w = makeWorld();
    const s = heroAt(w, SF, P0, { levels: { Q: 4 } });
    const q = s.ability('Q')!;
    expect(q.def.chargeMode).toBe('parallel');
    expect(abilityMaxCharges(s, q)).toBe(3);
    expect(q.charges).toBe(3);
    expect(abilityCooldown(q, s)).toBe(9);
    expect(abilityManaCost(q, s)).toBe(75);
    expect(abilityCastPoint(s, q)).toBeCloseTo(0.55);
    const raze = (): void => {
      w.issue(s.id, { type: 'cast', slot: 'Q', target: { point: { x: 1500, y: 4550 } } });
      runFor(w, 0.65);
    };
    raze();
    expect(q.charges).toBe(2);
    expect(s.mana).toBeCloseTo(s.stats.maxMana - 75, 0);
    // 3 秒后放第二下：两层各自计时
    runFor(w, 2.4);
    raze();
    raze();
    expect(q.charges).toBe(0);
    // 不能再放
    w.issue(s.id, { type: 'cast', slot: 'Q', target: { point: { x: 1500, y: 4550 } } });
    runFor(w, 0.65);
    expect(q.charges).toBe(0);
    // 第一下（0.6 秒）之后 9 秒：只回来 1 层（第二下在 3.67 秒，不是顺序充能）
    runFor(w, 5.0);
    expect(q.charges).toBe(1);
    // 第二、三下（3.67、4.33 秒）之后 9 秒：3 层全回
    runFor(w, 3.5);
    expect(q.charges).toBe(3);
  });

  it('tapping Shadowraze picks the 200/450/700 step that hits the nearest enemy hero, else 450', () => {
    const w = makeWorld();
    const s = heroAt(w, SF, P0, { levels: { Q: 1 } });
    const q = s.ability('Q')!;
    // 没有英雄：面向（北）450
    let t = resolveTarget(w, s, q)!;
    expect(dist2(t.point!, s.pos)).toBeCloseTo(450);
    expect(t.point!.y).toBeLessThan(s.pos.y);
    // 英雄在东边 680：700 档，方向朝它
    const h = foe(w, 1500 + 680, 5000);
    t = resolveTarget(w, s, q)!;
    expect(dist2(t.point!, s.pos)).toBeCloseTo(700);
    expect(t.point!.x).toBeCloseTo(1500 + 700);
    expect(t.point!.y).toBeCloseTo(5000);
    // 300：200 档（差 100）比 450 档（差 150）更近
    h.pos = { x: 1500, y: 5300 };
    t = resolveTarget(w, s, q)!;
    expect(dist2(t.point!, s.pos)).toBeCloseTo(200);
    expect(t.point!.y).toBeGreaterThan(s.pos.y);
    // 520：450 档
    h.pos = { x: 1500 - 520, y: 5000 };
    t = resolveTarget(w, s, q)!;
    expect(dist2(t.point!, s.pos)).toBeCloseTo(450);
    // 最近的英雄优先；小兵不算
    foe(w, 1500, 4800, { kind: 'creep' });
    const near = foe(w, 1500, 4700);
    t = resolveTarget(w, s, q)!;
    expect(dist2(t.point!, s.pos)).toBeCloseTo(200);
    expect(t.point!.y).toBeLessThan(s.pos.y);
    // 超出 700 + 250：当作没有英雄
    near.pos = { x: 1500, y: 3900 };
    h.pos = { x: 2600, y: 5000 };
    s.facing = Math.PI / 2;
    t = resolveTarget(w, s, q)!;
    expect(dist2(t.point!, s.pos)).toBeCloseTo(450);
    expect(t.point!.y).toBeGreaterThan(s.pos.y);
    // 智能施法真的放出去：打到 700 档的英雄
    const w2 = makeWorld();
    const s2 = heroAt(w2, SF, P0, { levels: { Q: 1 } });
    const h2 = foe(w2, 1500, 4300);
    w2.issue(s2.id, { type: 'cast', slot: 'Q' });
    runFor(w2, 0.65);
    expect(h2.hp).toBeCloseTo(1000 - 85);
  });

  it('dragging Shadowraze snaps to the nearest step', () => {
    const w = makeWorld();
    const s = heroAt(w, SF, P0, { levels: { Q: 1 } });
    const q = s.ability('Q')!;
    expect(q.def.pointSnap).toEqual([200, 450, 700]);
    const at = (d: number) => dist2(resolveTarget(w, s, q, { point: { x: 1500 + d, y: 5000 } })!.point!, s.pos);
    expect(at(380)).toBeCloseTo(450);
    expect(at(310)).toBeCloseTo(200);
    expect(at(600)).toBeCloseTo(700);
    expect(at(1200)).toBeCloseTo(700);
    // 落点在 450 档：250 内的敌人中招，250 外的不中
    const hit = foe(w, 1500, 4550 - 240);
    const miss = foe(w, 1500, 4550 + 290);
    w.issue(s.id, { type: 'cast', slot: 'Q', target: { point: { x: 1500, y: 4620 } } });
    runFor(w, 0.65);
    expect(hit.hp).toBeLessThan(1000);
    expect(miss.hp).toBe(1000);
  });

  it('Shadowraze damage = base + 2 per soul + stacking bonus per previous hit within 6 s', () => {
    const w = makeWorld();
    const s = heroAt(w, SF, P0, { levels: { Q: 4 }, heroLevel: 18 });
    setSouls(s, 10);
    const t = foe(w, 1500, 4550, { hp: 100000 });
    const creep = foe(w, 1600, 4550, { kind: 'creep', hp: 100000 });
    const tower = foe(w, 1400, 4550, { kind: 'building', hp: 100000 });
    const ally = foe(w, 1500, 4600, { team: Team.Radiant, hp: 100000 });
    const raze = (): void => {
      w.issue(s.id, { type: 'cast', slot: 'Q', target: { point: { x: 1500, y: 4550 } } });
      runFor(w, 0.65);
    };
    w.events.drain();
    raze();
    let ev = w.events.drain();
    let d = dmgTo(ev, s, t);
    expect(d).toHaveLength(1);
    expect(d[0].damageType).toBe('magical');
    expect(d[0].amount).toBeCloseTo(300);
    expect(dmgTo(ev, s, creep)[0].amount).toBeCloseTo(300);
    expect(tower.hp).toBe(100000);
    expect(ally.hp).toBe(100000);
    expect(fxOf(ev, 'sf_raze')).toHaveLength(1);
    expect(fxOf(ev, 'sf_raze')[0]).toMatchObject({ radius: 250 });
    expect(findModifier(t, 'sf_raze_stack', s.id)?.stacks).toBe(1);
    raze();
    ev = w.events.drain();
    expect(dmgTo(ev, s, t)[0].amount).toBeCloseTo(380);
    raze();
    ev = w.events.drain();
    expect(dmgTo(ev, s, t)[0].amount).toBeCloseTo(460);
    expect(findModifier(t, 'sf_raze_stack', s.id)?.stacks).toBe(3);
    // 6 秒没再中招：层数消失，回到 300
    runFor(w, 9.2);
    expect(findModifier(t, 'sf_raze_stack', s.id)).toBeUndefined();
    raze();
    expect(dmgTo(w.events.drain(), s, t)[0].amount).toBeCloseTo(300);
    // 另一个影魔的层数分开算
    const s2 = heroAt(w, SF, { x: 1500, y: 4000 }, { levels: { Q: 4 } });
    w.issue(s2.id, { type: 'cast', slot: 'Q', target: { point: { x: 1500, y: 4550 } } });
    runFor(w, 0.65);
    expect(dmgTo(w.events.drain(), s2, t)[0].amount).toBeCloseTo(280);
    expect(findModifier(t, 'sf_raze_stack', s.id)?.stacks).toBe(1);
    expect(findModifier(t, 'sf_raze_stack', s2.id)?.stacks).toBe(1);
  });

  it('Feast of Souls grants attack/move speed and harvests 3 souls per hero, 1 per creep, from up to 2 enemies every 0.5 s; souls borrowed from survivors return at the end', () => {
    const w = makeWorld();
    const s = heroAt(w, SF, P0, { levels: { W: 4 } });
    setSouls(s, 5);
    const ab = s.ability('W')!;
    expect(abilityCooldown(ab, s)).toBe(21);
    expect(abilityManaCost(ab, s)).toBe(75);
    const heroA = foe(w, 1500, 4700);
    const heroB = foe(w, 1500, 4500);
    const c1 = foe(w, 1600, 5000, { kind: 'creep' });
    const c2 = foe(w, 1400, 5000, { kind: 'creep' });
    const c3 = foe(w, 1500, 5250, { kind: 'creep' });
    foe(w, 1500, 4300, { kind: 'creep' }); // 700 外：不收
    const as0 = s.stats.attackSpeed;
    const ms0 = s.stats.moveSpeed;
    w.events.drain();
    w.issue(s.id, { type: 'cast', slot: 'W' });
    w.step();
    const m = findModifier(s, 'sf_feast')!;
    expect(m).toBeDefined();
    expect(m.total).toBeCloseTo(8);
    expect(s.stats.attackSpeed).toBeCloseTo(as0 + 80);
    expect(s.stats.moveSpeed).toBeCloseTo(ms0 * 1.1, 0);
    expect(s.mana).toBeCloseTo(s.stats.maxMana - 75, 0);
    // 第一跳：两个英雄（英雄优先）各 3
    runFor(w, 0.5);
    expect(getSouls(s)).toBe(11);
    let ev = w.events.drain();
    expect(fxOf(ev, 'sf_feast').map((e) => (e.type === 'fx' ? e.targetId : -1)).sort()).toEqual([heroA.id, heroB.id].sort());
    // 第二跳：最近的两个小兵各 1；第三跳：剩下的小兵；之后没人可收
    runFor(w, 0.5);
    expect(getSouls(s)).toBe(13);
    runFor(w, 0.5);
    expect(getSouls(s)).toBe(14);
    runFor(w, 1.5);
    expect(getSouls(s)).toBe(14);
    ev = w.events.drain();
    expect(fxOf(ev, 'sf_feast')).toHaveLength(3);
    // 被别人杀掉的敌人借的灵魂不用还
    killUnit(w, heroA, null);
    killUnit(w, c1, null);
    runFor(w, 8 - 3 + 0.1);
    expect(findModifier(s, 'sf_feast')).toBeUndefined();
    expect(s.stats.attackSpeed).toBeCloseTo(as0);
    // 14 − (英雄 B 3 + 小兵 2 + 小兵 3 各 1) = 9
    expect(getSouls(s)).toBe(9);
    expect(heroB.alive && c2.alive && c3.alive).toBe(true);

    // 1 级最多收 4 个敌人；可以超过 20 的上限，结束 8 秒后去掉超过的部分
    const w2 = makeWorld();
    const s2 = heroAt(w2, SF, P0, { levels: { W: 1 } });
    setSouls(s2, 18);
    const heroes = [0, 1, 2].map((i) => foe(w2, 1400 + i * 100, 4700));
    for (let i = 0; i < 3; i++) foe(w2, 1400 + i * 100, 5200, { kind: 'creep' });
    w2.issue(s2.id, { type: 'cast', slot: 'W' });
    w2.step();
    runFor(w2, 3);
    // 3 个英雄 + 1 个小兵 = 18 + 9 + 1
    expect(getSouls(s2)).toBe(28);
    for (const h of heroes) killUnit(w2, h, null);
    runFor(w2, 5.2);
    expect(findModifier(s2, 'sf_feast')).toBeUndefined();
    // 还活着的小兵借的 1 个收回，其余保留到 8 秒后
    expect(getSouls(s2)).toBe(27);
    runFor(w2, 7.5);
    expect(getSouls(s2)).toBe(27);
    runFor(w2, 0.7);
    expect(getSouls(s2)).toBe(20);
  });

  it('Presence of the Dark Lord lowers enemy armor within 1200, including towers', () => {
    const w = makeWorld();
    const s = heroAt(w, SF, P0, { levels: { E: 4 } });
    const near = foe(w, 1500, 4000, { armor: 5 });
    const tower = foe(w, 1500 + 1100, 5000, { kind: 'building', armor: 10 });
    const far = foe(w, 1500, 3700, { armor: 5 });
    const ally = foe(w, 1500, 5300, { team: Team.Radiant, armor: 5 });
    runFor(w, 0.1);
    expect(near.stats.armor).toBeCloseTo(5 - 7);
    expect(tower.stats.armor).toBeCloseTo(10 - 7);
    expect(far.stats.armor).toBeCloseTo(5);
    expect(ally.stats.armor).toBeCloseTo(5);
    // 1 级 2.5
    s.ability('E')!.level = 1;
    runFor(w, 0.1);
    expect(near.stats.armor).toBeCloseTo(2.5);
    // 被破坏时无效（光环残留 0.5 秒后消失）
    applyControl(w, s, 'break', { source: null, duration: 3 });
    runFor(w, 0.7);
    expect(near.stats.armor).toBeCloseTo(5);
    expect(tower.stats.armor).toBeCloseTo(10);
    runFor(w, 2.5);
    expect(near.stats.armor).toBeCloseTo(2.5);
  });

  it('Requiem of Souls fires one line per soul (max 20) after 1.67 s; each line damages, fears (stacking to 2.15 s), slows and lowers magic resistance', () => {
    const w = makeWorld();
    const s = heroAt(w, SF, P0, { levels: { R: 3 } });
    setSouls(s, 20);
    const r = s.ability('R')!;
    expect(abilityCastPoint(s, r)).toBeCloseTo(1.67);
    expect(abilityCooldown(r, s)).toBe(100);
    expect(abilityManaCost(r, s)).toBe(200);
    expect(r.def.aimShape!(s, r).radius).toBe(1000);
    const close = foe(w, 1500 + 60, 5000, { hp: 100000 });
    const far = foe(w, 1500, 5000 - 900, { hp: 100000 });
    const tower = foe(w, 1500 - 300, 5000, { kind: 'building', hp: 100000 });
    const ms0 = close.stats.moveSpeed;
    w.events.drain();
    w.issue(s.id, { type: 'cast', slot: 'R' });
    runFor(w, 1.6);
    expect(lines(w)).toHaveLength(0);
    expect(close.hp).toBe(100000);
    runFor(w, 0.15);
    const ls = lines(w);
    expect(ls).toHaveLength(20);
    // 从面向（北）开始每 18° 一道
    const dirs = ls.map((p) => Math.atan2(p.dir!.y, p.dir!.x)).sort((a, b) => a - b);
    for (let i = 1; i < dirs.length; i++) expect(dirs[i] - dirs[i - 1]).toBeCloseTo((Math.PI * 2) / 20, 5);
    expect(ls.some((p) => Math.abs(p.dir!.x) < 1e-6 && p.dir!.y < 0)).toBe(true);
    expect(ls[0].speed).toBe(700);
    expect(ls[0].maxDistance).toBe(1000);
    const ev0 = w.events.drain();
    expect(fxOf(ev0, 'sf_requiem')).toHaveLength(1);
    // 贴身的敌人被所有的线命中，恐惧封顶 2.15 秒，减速 30%、魔抗 −15%
    const closeHits = dmgTo(ev0, s, close);
    expect(closeHits.length).toBe(20);
    expect(closeHits[0].amount).toBeCloseTo(160);
    expect(closeHits[1].amount).toBeCloseTo(160 * 1.15);
    const fear = findModifier(close, 'status_fear')!;
    expect(fear).toBeDefined();
    expect(fear.sourceId).toBe(s.id);
    expect(fear.duration).toBeLessThanOrEqual(2.15 + 1e-6);
    expect(fear.duration).toBeGreaterThan(2.0);
    expect(close.stats.magicResist).toBeCloseTo(-0.15);
    expect(close.stats.moveSpeed).toBeCloseTo(ms0 * 0.7);
    // 线越飞越宽：碰撞半径从 62.5 到 150（width 是这一步移动之前设的，差一步 ≈ 2）；记下 900 处敌人中的恐惧
    let farFear = 0;
    for (let i = 0; i < 51; i++) {
      w.step();
      farFear = Math.max(farFear, findModifier(far, 'status_fear')?.total ?? 0);
      if (i === 20) {
        for (const p of lines(w)) expect(Math.abs(p.width - (125 + (300 - 125) * (p.traveled / 1000)) / 2)).toBeLessThan(3);
        expect(lines(w)[0].width).toBeGreaterThan(80);
      }
    }
    expect(lines(w)).toHaveLength(0);
    const ev = [...ev0, ...w.events.drain()];
    // 900 处正北的敌人只被正对它的那一道命中（两侧的线在 900 处横向相距 ±278）
    const farHits = dmgTo(ev, s, far);
    expect(farHits).toHaveLength(1);
    expect(farHits[0].amount).toBeCloseTo(160);
    expect(100000 - close.hp).toBeGreaterThan(10 * (100000 - far.hp));
    expect(farFear).toBeCloseTo(0.6, 1);
    expect(tower.hp).toBe(100000);
    // 减速和魔抗削减跟着恐惧结束
    runFor(w, 1);
    expect(findModifier(close, 'status_fear')).toBeUndefined();
    expect(close.stats.magicResist).toBeCloseTo(0);

    // 8 个灵魂：8 道；0 个灵魂也能放，但没有线
    const w2 = makeWorld();
    const s2 = heroAt(w2, SF, P0, { levels: { R: 1 } });
    setSouls(s2, 8);
    w2.issue(s2.id, { type: 'cast', slot: 'R' });
    runFor(w2, 1.75);
    expect(lines(w2)).toHaveLength(8);
    const w3 = makeWorld();
    const s3 = heroAt(w3, SF, P0, { levels: { R: 1 } });
    w3.events.drain();
    w3.issue(s3.id, { type: 'cast', slot: 'R' });
    runFor(w3, 1.75);
    expect(lines(w3)).toHaveLength(0);
    const ev3 = w3.events.drain();
    expect(ev3.some((e) => e.type === 'cast' && e.abilityId === 'sf_requiem')).toBe(true);
    expect(fxOf(ev3, 'sf_requiem')).toHaveLength(1);
    expect(s3.ability('R')!.cooldown).toBeGreaterThan(100);
    // 灵魂超过 20（灵魂盛宴）时最多 20 道
    const w4 = makeWorld();
    const s4 = heroAt(w4, SF, P0, { levels: { R: 1 } });
    setSouls(s4, 27);
    w4.issue(s4.id, { type: 'cast', slot: 'R' });
    runFor(w4, 1.75);
    expect(lines(w4)).toHaveLength(20);
  });

  it('Shadow Fiend releases half his souls as a Requiem without fear when he dies', () => {
    const w = makeWorld();
    const s = heroAt(w, SF, P0, { levels: { R: 2 } });
    setSouls(s, 19);
    // 小兵（木桩英雄没有经济数据，影魔死亡时会被算进助攻）
    const close = foe(w, 1500 + 60, 5000, { kind: 'creep', hp: 100000 });
    w.events.drain();
    killUnit(w, s, null);
    // 死亡前 19 个：9 道（向下取整），之后保留 floor(19 × 0.7) = 13
    expect(lines(w)).toHaveLength(9);
    expect(getSouls(s)).toBe(13);
    runFor(w, 0.2);
    const ev = w.events.drain();
    expect(fxOf(ev, 'sf_requiem')).toHaveLength(1);
    const hits = dmgTo(ev, s, close);
    expect(hits).toHaveLength(9);
    expect(hits[0].amount).toBeCloseTo(120);
    // 不带恐惧、减速、魔抗削减：每一道伤害都一样
    for (const d of hits) expect(d.amount).toBeCloseTo(120);
    expect(findModifier(close, 'status_fear')).toBeUndefined();
    expect(findModifier(close, 'slow_sf_requiem')).toBeUndefined();

    // 没学魂之挽歌：不放，只保留 70%
    const w2 = makeWorld();
    const s2 = heroAt(w2, SF, P0, { levels: { Q: 1 } });
    setSouls(s2, 20);
    killUnit(w2, s2, null);
    expect(lines(w2)).toHaveLength(0);
    expect(getSouls(s2)).toBe(14);

    // 1 个灵魂：floor(0.5) = 0 道
    const w3 = makeWorld();
    const s3 = heroAt(w3, SF, P0, { levels: { R: 1 } });
    setSouls(s3, 1);
    killUnit(w3, s3, null);
    expect(lines(w3)).toHaveLength(0);
    expect(getSouls(s3)).toBe(0);
  });

  it('souls borrowed by Feast of Souls are returned (never below 0) if Shadow Fiend dies during it', () => {
    const w = makeWorld();
    const s = heroAt(w, SF, P0, { levels: { W: 4 } });
    setSouls(s, 0);
    heroAt(w, 'axe', { x: 1500, y: 4700 }, { team: Team.Dire });
    heroAt(w, 'axe', { x: 1500, y: 4600 }, { team: Team.Dire });
    w.issue(s.id, { type: 'cast', slot: 'W' });
    w.step();
    runFor(w, 0.5);
    expect(getSouls(s)).toBe(6);
    // 死亡：先保留 70%（4），再把还活着的敌人借的 6 个收回，不低于 0
    killUnit(w, s, null);
    expect(findModifier(s, 'sf_feast')).toBeUndefined();
    expect(getSouls(s)).toBe(0);
  });
});

describe('Shadow Fiend talents', () => {
  it('talents change the documented values', () => {
    const cases: { tier: TalentTier; side: 0 | 1; slot: AbilitySlot | 'innate'; key: string; before: number; after: number }[] = [
      { tier: 0, side: 0, slot: 'Q', key: 'stackDamage', before: 80, after: 110 },
      { tier: 0, side: 1, slot: 'W', key: 'attackSpeed', before: 80, after: 110 },
      { tier: 1, side: 0, slot: 'E', key: 'armor', before: 7, after: 8.5 },
      { tier: 1, side: 1, slot: 'W', key: 'heroSouls', before: 3, after: 5 },
      { tier: 2, side: 0, slot: 'innate', key: 'maxSouls', before: 20, after: 25 },
      { tier: 2, side: 1, slot: 'R', key: 'fearPerLine', before: 0.6, after: 0.8 },
      { tier: 2, side: 1, slot: 'R', key: 'fearCap', before: 2.15, after: 2.6 },
      { tier: 3, side: 0, slot: 'W', key: 'castSpeed', before: 0, after: 0.3 },
      { tier: 3, side: 1, slot: 'Q', key: 'attackDamage', before: 0, after: 1 },
    ];
    for (const c of cases) {
      const w = makeWorld();
      const u = heroAt(w, SF, P0, { levels: ALL, heroLevel: 25 });
      const read = (): number => abilityValue(u, u.ability(c.slot)!, c.key);
      expect(read()).toBeCloseTo(c.before);
      expect(pickTalent(w, u, c.tier, c.side)).toBe(true);
      expect(read()).toBeCloseTo(c.after);
    }
    for (const pair of getHeroDef(SF).talents) for (const t of pair) expect(t.name.length).toBeGreaterThan(3);
  });

  it('talents change behaviour: soul cap 25, Presence on towers, Feast cast speed, Shadowraze attack damage, longer Requiem fear', () => {
    // 20 级左：上限 25
    const w = makeWorld();
    const s = heroAt(w, SF, P0, { levels: ALL, heroLevel: 25 });
    pickTalent(w, s, 2, 0);
    setSouls(s, 23);
    killUnit(w, foe(w, 2500, 4000), s);
    expect(getSouls(s)).toBe(25);
    // 15 级左：魔王降临 8.5（含建筑）
    pickTalent(w, s, 1, 0);
    const tower = foe(w, 1500, 4500, { kind: 'building', armor: 10 });
    runFor(w, 0.1);
    expect(tower.stats.armor).toBeCloseTo(1.5);
    // 25 级左：灵魂盛宴期间施法速度 +30%（毁灭阴影前摇 0.55 / 1.3）
    pickTalent(w, s, 3, 0);
    const q = s.ability('Q')!;
    expect(abilityCastPoint(s, q)).toBeCloseTo(0.55);
    w.issue(s.id, { type: 'cast', slot: 'W' });
    w.step();
    expect(abilityCastPoint(s, q)).toBeCloseTo(0.55 / 1.3);

    // 25 级右：毁灭阴影再附带一次攻击力的物理伤害
    const w2 = makeWorld();
    // 不学魔王降临（否则目标护甲 −7，物理伤害会被放大）
    const s2 = heroAt(w2, SF, P0, { levels: { Q: 4, W: 4, R: 3 }, heroLevel: 25 });
    setSouls(s2, 0);
    pickTalent(w2, s2, 3, 1);
    const t2 = foe(w2, 1500, 4550, { hp: 100000 });
    w2.events.drain();
    w2.issue(s2.id, { type: 'cast', slot: 'Q', target: { point: { x: 1500, y: 4550 } } });
    runFor(w2, 0.65);
    const d2 = dmgTo(w2.events.drain(), s2, t2);
    expect(d2).toHaveLength(2);
    expect(d2[0]).toMatchObject({ damageType: 'magical', isAttack: false });
    expect(d2[0].amount).toBeCloseTo(280);
    expect(d2[1]).toMatchObject({ damageType: 'physical', isAttack: false });
    expect(d2[1].amount).toBeGreaterThanOrEqual(s2.stats.damageMin + s2.stats.bonusDamage - 1e-6);
    expect(d2[1].amount).toBeLessThanOrEqual(s2.stats.damageMax + s2.stats.bonusDamage + 1e-6);

    // 20 级右：每道恐惧 0.8，上限 2.6
    const w3 = makeWorld();
    const s3 = heroAt(w3, SF, P0, { levels: ALL, heroLevel: 25 });
    pickTalent(w3, s3, 2, 1);
    setSouls(s3, 20);
    const t3 = foe(w3, 1560, 5000, { hp: 100000 });
    const t4 = foe(w3, 1500, 4100, { hp: 100000 });
    w3.issue(s3.id, { type: 'cast', slot: 'R' });
    runFor(w3, 1.75);
    expect(findModifier(t3, 'status_fear')!.duration).toBeGreaterThan(2.5);
    expect(findModifier(t3, 'status_fear')!.duration).toBeLessThanOrEqual(2.6 + 1e-6);
    let t4Fear = 0;
    for (let i = 0; i < 42; i++) {
      w3.step();
      t4Fear = Math.max(t4Fear, findModifier(t4, 'status_fear')?.total ?? 0);
    }
    expect(t4Fear).toBeCloseTo(0.8, 1);
  });
});

describe('Shadow Fiend AI', () => {
  it('builds and talents follow the plan', () => {
    expect(SKILL_BUILDS.shadow_fiend).toEqual(['Q', 'E', 'Q', 'E', 'Q', 'R', 'Q', 'E', 'E', 'W', 'R', 'W', 'W', 'W', 'R']);
    expect(TALENT_BUILDS.shadow_fiend).toEqual([0, 1, 0, 1]);
  });

  const ctxFor = (w: World, me: Unit, slot: AbilitySlot, enemies: Unit[], retreating = false): AiCtx => ({
    world: w, me, ab: me.ability(slot)!, skill: DIFFICULTY.normal.skill, enemyHeroes: enemies, allyHeroes: [],
    hpPct: me.hp / me.stats.maxHp, manaPct: me.mana / me.stats.maxMana, retreating,
  });

  it('Shadowraze: the step that hits a (predicted) enemy hero, or 3+ creeps with mana > 50% and 2+ charges left', () => {
    const w = makeWorld();
    const s = heroAt(w, SF, P0, { levels: ALL });
    const Q = SF_RULES.sf_shadowraze;
    expect(Q.priority).toBe(15);
    const h = foe(w, 1500, 4320);
    w.step();
    const d = Q.decide(ctxFor(w, s, 'Q', [h]));
    const p = (d as { cast: { point: { x: number; y: number } } }).cast.point;
    expect(dist2(p, s.pos)).toBeCloseTo(700);
    expect(Math.abs(p.x - 1500)).toBeLessThan(1);
    // 英雄太远：打不中
    h.pos = { x: 1500, y: 3900 };
    w.step();
    expect(Q.decide(ctxFor(w, s, 'Q', [h]))).toBeNull();
    // 清兵：450 档落点 250 内 3 个小兵
    for (const x of [1450, 1500, 1550]) foe(w, x, 4550, { kind: 'creep' });
    const c = Q.decide(ctxFor(w, s, 'Q', []));
    expect(dist2((c as { cast: { point: { x: number; y: number } } }).cast.point, s.pos)).toBeCloseTo(450);
    // 只剩 1 层充能 / 魔法 ≤ 50%：不清兵
    s.ability('Q')!.charges = 1;
    expect(Q.decide(ctxFor(w, s, 'Q', []))).toBeNull();
    s.ability('Q')!.charges = 3;
    s.mana = s.stats.maxMana * 0.45;
    expect(Q.decide(ctxFor(w, s, 'Q', []))).toBeNull();
  });

  it('Feast of Souls: while attacking an enemy hero in 600, or 3+ creeps in 600 with mana > 60%', () => {
    const w = makeWorld();
    const s = heroAt(w, SF, P0, { levels: ALL });
    const W = SF_RULES.sf_feast_of_souls;
    const h = foe(w, 1500, 4550);
    w.step();
    expect(W.decide(ctxFor(w, s, 'W', [h]))).toBeNull();
    s.attack.targetId = h.id;
    expect(W.decide(ctxFor(w, s, 'W', [h]))).toEqual({ cast: {} });
    h.pos = { x: 1500, y: 4200 };
    expect(W.decide(ctxFor(w, s, 'W', [h]))).toBeNull();
    s.attack.targetId = null;
    for (const x of [1300, 1500, 1700]) foe(w, x, 4700, { kind: 'creep' });
    expect(W.decide(ctxFor(w, s, 'W', []))).toEqual({ cast: {} });
    s.mana = s.stats.maxMana * 0.55;
    expect(W.decide(ctxFor(w, s, 'W', []))).toBeNull();
  });

  it('Requiem: 8+ souls and either 2 enemy heroes in 450 or one hurt (< 60%) enemy hero in 300', () => {
    const w = makeWorld();
    const s = heroAt(w, SF, P0, { levels: ALL });
    const R = SF_RULES.sf_requiem;
    expect(R.priority).toBe(30);
    setSouls(s, 8);
    const a = foe(w, 1500, 4650);
    const b = foe(w, 1800, 5000);
    w.step();
    expect(R.decide(ctxFor(w, s, 'R', [a, b]))).toEqual({ cast: {} });
    setSouls(s, 7);
    expect(R.decide(ctxFor(w, s, 'R', [a, b]))).toBeNull();
    setSouls(s, 20);
    b.pos = { x: 2200, y: 5000 };
    expect(R.decide(ctxFor(w, s, 'R', [a, b]))).toBeNull();
    a.pos = { x: 1500, y: 4780 };
    expect(R.decide(ctxFor(w, s, 'R', [a, b]))).toBeNull();
    a.hp = 550;
    expect(R.decide(ctxFor(w, s, 'R', [a, b]))).toEqual({ cast: {} });
  });

  it('AI uses every active ability in a skirmish', () => {
    const cast = abilitiesCastInSkirmish(SF, {
      setup: (m) => {
        for (const h of m.world.heroes()) if (h.defId === SF) setSouls(h, 20);
      },
    });
    for (const id of ['sf_shadowraze', 'sf_feast_of_souls', 'sf_requiem']) expect(cast).toContain(id);
  }, 60000);
});

