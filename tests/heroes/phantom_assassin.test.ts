import { describe, it, expect } from 'vitest';
import { heroAt, makeWorld, runFor, spawnDummy } from '../helpers';
import { abilitiesCastInSkirmish } from '../heroAi';
import { createHero } from '../../src/sim/systems/heroes';
import { addModifier, findModifier, removeModifier, type ModifierDef } from '../../src/sim/modifiers';
import { abilityCastRange, abilityCooldown, abilityManaCost, abilityValue, canCast, resolveTarget } from '../../src/sim/systems/abilities';
import { killUnit } from '../../src/sim/systems/damage';
import { newAttackInfo, performAttack, resolveAttack } from '../../src/sim/systems/attack';
import { spawnProjectile } from '../../src/sim/systems/projectiles';
import { learnAbility } from '../../src/sim/systems/progress';
import { applyControl } from '../../src/sim/status';
import { canAttack, isTargetableBy, smartAttackTarget } from '../../src/sim/query';
import { pickTalent, type TalentTier } from '../../src/sim/talents';
import { getHeroDef } from '../../src/sim/heroes/index';
import { PA_RULES } from '../../src/ai/usage/phantom_assassin';
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

/** 敌方防御塔木桩（不攻击） */
function tower(w: World, x: number, y: number): Unit {
  const t = foe(w, x, y, { kind: 'building', hp: 5000 });
  t.radius = 100;
  t.building = { type: 'tower', tier: 1, key: 't1', prereqIds: [], forcedTargetId: null, forcedUntil: 0, goldTeam: 0, goldLastHit: 0 };
  return t;
}

const ALL = { Q: 4, W: 4, E: 4, R: 3 } as const;
const PA = 'phantom_assassin';

/** 本次 drain 里打到 targetId 身上的伤害事件 */
const damages = (w: World, targetId: number): { amount: number; isAttack: boolean; crit: boolean }[] =>
  w.events.drain().flatMap((e) => (e.type === 'damage' && e.targetId === targetId ? [{ amount: e.amount, isAttack: e.isAttack, crit: e.crit }] : []));

describe('Phantom Assassin', () => {
  it('has 7.41f level-1 stats', () => {
    const w = makeWorld();
    const p = createHero(w, PA, Team.Radiant, false);
    w.step();
    expect(p.stats.maxHp).toBeCloseTo(538);
    expect(p.stats.maxMana).toBeCloseTo(255);
    expect(p.stats.armor).toBeCloseTo(4.67, 1);
    expect(p.stats.damageMin).toBeCloseTo(57);
    expect(p.stats.damageMax).toBeCloseTo(59);
    expect(p.stats.hpRegen).toBeCloseTo(2.9);
    expect(p.stats.manaRegen).toBeCloseTo(0.75);
    expect(p.stats.attackInterval).toBeCloseTo(1.288, 3);
    expect(p.stats.attackRange).toBe(150);
    expect(p.stats.moveSpeed).toBe(310);
    const def = getHeroDef(PA);
    expect(def.name).toBe('幻影刺客');
    expect(def.title).toBe('茉朵');
    expect(def.primary).toBe('agi');
    expect(def.roles).toEqual(['核心', '刺客', '爆发']);
    expect(def.abilities.map((a) => a.id)).toEqual([
      'pa_stifling_dagger', 'pa_phantom_strike', 'pa_immaterial', 'pa_coup_de_grace', 'pa_blur',
    ]);
    for (const a of def.abilities) expect(a.description.length).toBeGreaterThan(20);
  });

  it('Stifling Dagger strikes as an attack for base + attack% damage and slows 50%', () => {
    const w = makeWorld();
    const p = heroAt(w, PA, { x: 1500, y: 5000 }, { levels: { Q: 4 } });
    // 记录 onAttackLanded（短匕会触发攻击特效）
    const landed: (string | undefined)[] = [];
    const SPY: ModifierDef = { id: 'test_spy', hidden: true, onAttackLanded: (_m, _o, _t, _w, info) => landed.push(info.attack?.abilityId) };
    addModifier(w, p, SPY);
    const t = foe(w, 1500, 4000, { hp: 100000 });
    const lo = (p.stats.damageMin + p.stats.bonusDamage) * 0.75 + 80;
    const hi = (p.stats.damageMax + p.stats.bonusDamage) * 0.75 + 80;
    w.events.drain();
    w.issue(p.id, { type: 'cast', slot: 'Q', target: { unitId: t.id } });
    runFor(w, 0.35);
    // 前摇 0.3 秒后发出追踪飞刀（1200），还没命中
    expect(w.projectiles.some((x) => !x.done && x.visual === 'pa_dagger' && x.targetId === t.id)).toBe(true);
    expect(t.hp).toBe(100000);
    expect(p.mana).toBeCloseTo(p.stats.maxMana - 30, 0);
    let hits: { amount: number; isAttack: boolean }[] = [];
    for (let i = 0; i < 60 && hits.length === 0; i++) {
      w.step();
      hits = damages(w, t.id);
    }
    expect(hits.length).toBe(1);
    expect(hits[0].isAttack).toBe(true);
    expect(hits[0].amount).toBeGreaterThanOrEqual(lo - 1e-6);
    expect(hits[0].amount).toBeLessThanOrEqual(hi + 1e-6);
    expect(landed).toEqual(['pa_stifling_dagger']);
    const slow = findModifier(t, 'slow_pa_dagger')!;
    expect(slow).toBeDefined();
    expect(slow.total).toBeCloseTo(3);
    expect(t.stats.moveSpeed).toBeCloseTo(150);
    expect(abilityCastRange(p, p.ability('Q')!)).toBe(1150);
    expect(abilityCooldown(p.ability('Q')!, p)).toBe(6);
    // 必定命中：目标 100% 闪避也打得中
    const w2 = makeWorld();
    const p2 = heroAt(w2, PA, { x: 1500, y: 5000 }, { levels: { Q: 1 } });
    const t2 = foe(w2, 1500, 4500, { hp: 100000 });
    addModifier(w2, t2, { id: 'test_evade', stats: { evasion: 1 } });
    w2.issue(p2.id, { type: 'cast', slot: 'Q', target: { unitId: t2.id } });
    runFor(w2, 1);
    expect(t2.hp).toBeLessThan(100000);
    expect(findModifier(t2, 'slow_pa_dagger')!.total).toBeCloseTo(2.1);
    expect(abilityCastRange(p2, p2.ability('Q')!)).toBe(700);
  });

  it('Phantom Strike blinks next to the target; on enemies it grants attack speed and starts attacking; on allies it is an escape; 2 sequential charges', () => {
    const w = makeWorld();
    const p = heroAt(w, PA, { x: 1500, y: 5000 }, { levels: { W: 4 } });
    const t = foe(w, 1500, 4200, { hp: 100000 });
    const w0 = p.ability('W')!;
    expect(w0.charges).toBe(2);
    const as0 = p.stats.attackSpeed;
    w.events.drain();
    w.issue(p.id, { type: 'cast', slot: 'W', target: { unitId: t.id } });
    runFor(w, 0.3);
    // 落在目标靠近幻刺的一侧，贴身（两者半径 + 8）
    expect(p.pos.y).toBeGreaterThan(t.pos.y);
    expect(Math.hypot(p.pos.x - t.pos.x, p.pos.y - t.pos.y)).toBeCloseTo(p.radius + t.radius + 8, 0);
    expect(p.stats.attackSpeed).toBeCloseTo(as0 + 200);
    expect(p.order).toMatchObject({ kind: 'attack', targetId: t.id });
    const ev = w.events.drain();
    expect(ev.some((e) => e.type === 'fx' && e.kind === 'pa_phantom_strike' && e.targetId === t.id)).toBe(true);
    expect(ev.some((e) => e.type === 'fx' && e.kind === 'blink')).toBe(true);
    expect(w0.charges).toBe(1);
    runFor(w, 3);
    expect(p.stats.attackSpeed).toBeCloseTo(as0);

    // 友方小兵：只是位移（逃跑），没有攻速、不下攻击指令
    const ally = spawnDummy(w, { kind: 'creep', team: Team.Radiant, pos: { x: 1500, y: 4900 }, base: { damageMin: 0, damageMax: 0 } });
    w.issue(p.id, { type: 'cast', slot: 'W', target: { unitId: ally.id } });
    runFor(w, 0.3);
    expect(Math.hypot(p.pos.x - ally.pos.x, p.pos.y - ally.pos.y)).toBeCloseTo(p.radius + ally.radius + 8, 0);
    expect(p.pos.y).toBeLessThan(ally.pos.y);
    expect(p.stats.attackSpeed).toBeCloseTo(as0);
    expect(p.order.kind).not.toBe('attack');
    // 两层用完：不能再放；12 秒后恢复一层，再 12 秒恢复第二层（按顺序）
    // 第一层在第一次施放（约 0.27 秒）后 12 秒恢复，第二层再过 12 秒
    expect(w0.charges).toBe(0);
    expect(canCast(w, p, w0)).toBe(false);
    runFor(w, 15.35 - w.time);
    expect(w0.charges).toBe(1);
    runFor(w, 23.6 - w.time);
    expect(w0.charges).toBe(1);
    runFor(w, 24.8 - w.time);
    expect(w0.charges).toBe(2);
    // 不能以自己为目标
    expect(resolveTarget(w, p, w0, { unitId: p.id })).toBeNull();
    // 智能施法：施法距离 + 300 内最近的敌方英雄（其次敌方单位）
    const w2 = makeWorld();
    const p2 = heroAt(w2, PA, { x: 1500, y: 5000 }, { levels: { W: 1 } });
    const creep = foe(w2, 1500, 4700, { kind: 'creep' });
    const hero = foe(w2, 1500, 4200);
    expect(resolveTarget(w2, p2, p2.ability('W')!, {})?.unit?.id).toBe(hero.id);
    hero.pos = { x: 1500, y: 3000 };
    expect(resolveTarget(w2, p2, p2.ability('W')!, {})?.unit?.id).toBe(creep.id);
  });

  it('Immaterial evades about 55% of attacks at level 4', () => {
    const w = makeWorld(7);
    const p = heroAt(w, PA, { x: 1500, y: 5000 }, { levels: { E: 4 } });
    expect(p.stats.evasion).toBeCloseTo(0.55);
    const a = foe(w, 1500, 4850, { damage: 50 });
    let hit = 0;
    for (let i = 0; i < 400; i++) {
      p.hp = p.stats.maxHp;
      if (resolveAttack(w, a, p, newAttackInfo()) > 0) hit++;
    }
    expect(Math.abs(hit / 400 - 0.45)).toBeLessThan(0.05);
    // 被破坏时没有闪避
    applyControl(w, p, 'break', { source: null, duration: 1 });
    w.step();
    expect(p.stats.evasion).toBe(0);
  });

  it('Coup de Grace grants Deadly Focus on ~17% of attacks and the next attack crits 450%', () => {
    const w = makeWorld(3);
    const p = heroAt(w, PA, { x: 1500, y: 5000 }, { levels: { R: 3 } });
    const t = foe(w, 1500, 4850, { hp: 1e9 });
    const lo = p.stats.damageMin + p.stats.bonusDamage;
    const hi = p.stats.damageMax + p.stats.bonusDamage;
    w.events.drain();
    let crits = 0;
    for (let i = 0; i < 2000; i++) {
      const hadFocus = !!findModifier(p, 'pa_deadly_focus');
      performAttack(w, p, t);
      const ev = w.events.drain();
      const d = ev.find((e) => e.type === 'damage' && e.targetId === t.id);
      expect(d && d.type === 'damage').toBe(true);
      if (d && d.type === 'damage' && d.crit) {
        crits++;
        // 带着致命专注的那一下必定暴击 4.5 倍，并消耗掉专注
        expect(hadFocus).toBe(true);
        expect(d.amount).toBeGreaterThanOrEqual(lo * 4.5 - 1e-6);
        expect(d.amount).toBeLessThanOrEqual(hi * 4.5 + 1e-6);
        expect(ev.some((e) => e.type === 'fx' && e.kind === 'pa_crit' && e.targetId === t.id && e.unitId === p.id)).toBe(true);
      } else {
        expect(hadFocus).toBe(false);
      }
      // 专注暴击的那一下不再判定新的专注
      if (d && d.type === 'damage' && d.crit) expect(findModifier(p, 'pa_deadly_focus')).toBeUndefined();
    }
    expect(crits / 2000).toBeGreaterThan(0.12);
    expect(crits / 2000).toBeLessThan(0.19);
    // 专注持续 10 秒，过期作废
    const w2 = makeWorld(5);
    const p2 = heroAt(w2, PA, { x: 1500, y: 5000 }, { levels: { R: 3 } });
    const t2 = foe(w2, 1500, 4850, { hp: 1e9 });
    let n = 0;
    while (!findModifier(p2, 'pa_deadly_focus') && n++ < 200) performAttack(w2, p2, t2);
    expect(findModifier(p2, 'pa_deadly_focus')!.total).toBeCloseTo(10);
    runFor(w2, 10.1);
    expect(findModifier(p2, 'pa_deadly_focus')).toBeUndefined();

    // 短匕命中按 34% 判定
    const w3 = makeWorld(11);
    const p3 = heroAt(w3, PA, { x: 1500, y: 5000 }, { levels: { R: 3 } });
    const t3 = foe(w3, 1500, 4850, { hp: 1e9 });
    let focus = 0;
    for (let i = 0; i < 2000; i++) {
      performAttack(w3, p3, t3, { instant: true, abilityId: 'pa_stifling_dagger', damageMult: 0.75, bonusDamage: 80, trueStrike: true });
      const m = findModifier(p3, 'pa_deadly_focus');
      if (m) {
        focus++;
        removeModifier(w3, p3, m);
      }
    }
    expect(Math.abs(focus / 2000 - 0.34)).toBeLessThan(0.03);
    // 不对建筑和友方单位生效；被破坏时不判定
    const w4 = makeWorld(2);
    const p4 = heroAt(w4, PA, { x: 1500, y: 5000 }, { levels: { R: 3 } });
    const b = foe(w4, 1500, 4850, { kind: 'building', hp: 1e9 });
    const mate = spawnDummy(w4, { kind: 'creep', team: Team.Radiant, pos: { x: 1600, y: 5000 }, base: { maxHp: 1e9 } });
    for (let i = 0; i < 100; i++) {
      performAttack(w4, p4, b);
      performAttack(w4, p4, mate);
    }
    expect(findModifier(p4, 'pa_deadly_focus')).toBeUndefined();
    applyControl(w4, p4, 'break', { source: null, duration: 100 });
    const t4 = foe(w4, 1500, 5150, { hp: 1e9 });
    for (let i = 0; i < 100; i++) performAttack(w4, p4, t4);
    expect(findModifier(p4, 'pa_deadly_focus')).toBeUndefined();
  });

  it('Blur disjoints projectiles, hides her from enemies after 0.8 s unless an enemy hero or tower is within 500, and ends when she attacks', () => {
    const w = makeWorld();
    const p = heroAt(w, PA, { x: 1500, y: 5000 }, { levels: ALL, heroLevel: 18 });
    const ms0 = p.stats.moveSpeed;
    const enemy = foe(w, 1500, 4200, { hp: 1e6 });
    const creep = foe(w, 1500, 4900, { kind: 'creep', hp: 1e6 });
    // 一个慢速追踪弹道正飞向她
    let hitByProj = false;
    const proj = spawnProjectile(w, {
      team: Team.Dire, sourceId: enemy.id, pos: { x: 1500, y: 4500 }, speed: 300, kind: 'homing', targetId: p.id, visual: 'test',
      onHit: () => { hitByProj = true; },
    });
    w.events.drain();
    w.issue(p.id, { type: 'cast', slot: 'X1' });
    runFor(w, 0.35);
    const blur = findModifier(p, 'pa_blur')!;
    expect(blur).toBeDefined();
    expect(blur.total).toBeCloseTo(30);
    expect(blur.def.dispel).toBe('none');
    expect(proj.done).toBe(true);
    runFor(w, 2);
    expect(hitByProj).toBe(false);
    expect(w.events.drain().some((e) => e.type === 'fx' && e.kind === 'pa_blur')).toBe(true);
    // 移速 + (9.5% + 0.5% × 18)
    expect(p.stats.moveSpeed).toBeCloseTo(ms0 * (1 + 0.095 + 0.005 * 18));
    expect(p.ability('X1')!.cooldown).toBeGreaterThan(40);
    expect(abilityManaCost(p.ability('X1')!, p)).toBe(50);
    // 敌方英雄在 800 外：已经隐藏
    expect(p.hasState('hidden')).toBe(true);
    expect(canAttack(enemy, p)).toBe(false);
    expect(isTargetableBy(enemy, p, 'enemy', true)).toBe(false);
    expect(smartAttackTarget(w, creep)).not.toBe(p);
    // 敌方英雄走到 450：显形；离开后再次隐藏
    enemy.pos = { x: 1500, y: 4550 };
    w.step();
    expect(p.hasState('hidden')).toBe(false);
    expect(canAttack(enemy, p)).toBe(true);
    enemy.pos = { x: 1500, y: 4200 };
    w.step();
    expect(p.hasState('hidden')).toBe(true);
    // 扔短匕不结束模糊
    w.issue(p.id, { type: 'cast', slot: 'Q', target: { unitId: creep.id } });
    runFor(w, 0.6);
    expect(creep.hp).toBeLessThan(1e6);
    expect(findModifier(p, 'pa_blur')).toBeDefined();
    expect(p.hasState('hidden')).toBe(true);
    // 普攻结束模糊（隐藏一起移除）
    w.issue(p.id, { type: 'attack', mode: 'smart', targetId: creep.id });
    runFor(w, 0.6);
    expect(findModifier(p, 'pa_blur')).toBeUndefined();
    expect(findModifier(p, 'pa_blur_hidden')).toBeUndefined();
    expect(p.hasState('hidden')).toBe(false);
    expect(p.stats.moveSpeed).toBeCloseTo(ms0);

    // 施放后 0.8 秒内不隐藏；敌方防御塔 500 内（中心距离 ≤ 500 + 塔半径）不隐藏
    const w2 = makeWorld();
    const p2 = heroAt(w2, PA, { x: 1500, y: 5000 }, { levels: ALL });
    const tw = tower(w2, 1500, 4380);
    w2.issue(p2.id, { type: 'cast', slot: 'X1' });
    runFor(w2, 0.3 + 0.7);
    expect(findModifier(p2, 'pa_blur')).toBeDefined();
    expect(p2.hasState('hidden')).toBe(false);
    runFor(w2, 0.2);
    expect(p2.hasState('hidden')).toBe(true);
    tw.pos = { x: 1500, y: 4420 };
    w2.step();
    expect(p2.hasState('hidden')).toBe(false);
    // 死亡时模糊和隐藏一起移除
    const w3 = makeWorld();
    const p3 = heroAt(w3, PA, { x: 1500, y: 5000 }, { levels: ALL });
    w3.issue(p3.id, { type: 'cast', slot: 'X1' });
    runFor(w3, 1.3);
    expect(p3.hasState('hidden')).toBe(true);
    killUnit(w3, p3, null);
    expect(findModifier(p3, 'pa_blur')).toBeUndefined();
    expect(findModifier(p3, 'pa_blur_hidden')).toBeUndefined();
    expect(p3.hasState('hidden')).toBe(false);
  });

  it('Blur sits in X1 from level 1 and cannot be learned', () => {
    const w = makeWorld();
    const p = createHero(w, PA, Team.Radiant, false);
    w.step();
    const x1 = p.ability('X1')!;
    expect(x1.def.id).toBe('pa_blur');
    expect(x1.def.innate).toBe(true);
    expect(x1.level).toBe(1);
    p.hero!.skillPoints = 1;
    expect(learnAbility(w, p, 'X1')).toBe(false);
    expect(x1.level).toBe(1);
    // 1 级就能放
    p.mana = p.stats.maxMana;
    w.issue(p.id, { type: 'cast', slot: 'X1' });
    runFor(w, 0.4);
    expect(findModifier(p, 'pa_blur')).toBeDefined();
    expect(p.stats.moveSpeed).toBeCloseTo(310 * 1.1);
  });
});

describe('Phantom Assassin talents', () => {
  it('talents change the documented values', () => {
    const cases: { tier: TalentTier; side: 0 | 1; slot: AbilitySlot; key: string; before: number; after: number }[] = [
      { tier: 0, side: 0, slot: 'W', key: 'duration', before: 3, after: 3.8 },
      { tier: 0, side: 1, slot: 'Q', key: 'cooldown', before: 6, after: 4 },
      { tier: 1, side: 0, slot: 'E', key: 'evasion', before: 0.55, after: 0.75 },
      { tier: 1, side: 1, slot: 'Q', key: 'attackPct', before: 0.75, after: 0.9 },
      { tier: 2, side: 0, slot: 'W', key: 'castRange', before: 950, after: 1150 },
      { tier: 2, side: 1, slot: 'W', key: 'attackSpeed', before: 200, after: 260 },
      { tier: 3, side: 0, slot: 'R', key: 'chance', before: 0.17, after: 0.27 },
      { tier: 3, side: 0, slot: 'R', key: 'daggerChance', before: 0.34, after: 0.44 },
      { tier: 3, side: 1, slot: 'Q', key: 'extraTargets', before: 0, after: 2 },
    ];
    const read = (u: Unit, slot: AbilitySlot, key: string): number => {
      const ab = u.ability(slot)!;
      if (key === 'cooldown') return abilityCooldown(ab, u);
      if (key === 'castRange') return abilityCastRange(u, ab);
      return abilityValue(u, ab, key);
    };
    for (const c of cases) {
      const w = makeWorld();
      const u = heroAt(w, PA, { x: 1500, y: 5000 }, { levels: ALL, heroLevel: 25 });
      expect(read(u, c.slot, c.key)).toBeCloseTo(c.before);
      expect(pickTalent(w, u, c.tier, c.side)).toBe(true);
      expect(read(u, c.slot, c.key)).toBeCloseTo(c.after);
    }
    for (const pair of getHeroDef(PA).talents) for (const t of pair) expect(t.name.length).toBeGreaterThan(3);
  });

  it('talents change behaviour: longer Phantom Strike buff, 75% evasion, three daggers', () => {
    // 10 级左：幻影突袭攻速持续 3.8 秒
    const w = makeWorld();
    const p = heroAt(w, PA, { x: 1500, y: 5000 }, { levels: ALL, heroLevel: 25 });
    pickTalent(w, p, 0, 0);
    const t = foe(w, 1500, 4400, { hp: 1e6 });
    w.issue(p.id, { type: 'cast', slot: 'W', target: { unitId: t.id } });
    runFor(w, 0.3);
    expect(findModifier(p, 'pa_phantom_strike')!.total).toBeCloseTo(3.8);
    // 15 级左：闪避 75%
    const w2 = makeWorld();
    const p2 = heroAt(w2, PA, { x: 1500, y: 5000 }, { levels: ALL, heroLevel: 25 });
    pickTalent(w2, p2, 1, 0);
    expect(p2.stats.evasion).toBeCloseTo(0.75);
    // 25 级右：主目标 + 施法距离内另外 2 个最近的敌方单位（英雄优先）
    const w3 = makeWorld();
    const p3 = heroAt(w3, PA, { x: 1500, y: 5000 }, { levels: ALL, heroLevel: 25 });
    pickTalent(w3, p3, 3, 1);
    const main = foe(w3, 1500, 4600, { hp: 1e6 });
    const nearCreep = foe(w3, 1550, 4900, { kind: 'creep', hp: 1e6 });
    const farHero = foe(w3, 1500, 4000, { hp: 1e6 });
    const creep2 = foe(w3, 1450, 4800, { kind: 'creep', hp: 1e6 });
    const outOfRange = foe(w3, 1500, 3700, { hp: 1e6 });
    w3.issue(p3.id, { type: 'cast', slot: 'Q', target: { unitId: main.id } });
    runFor(w3, 0.32);
    const targets = w3.projectiles.filter((x) => x.visual === 'pa_dagger').map((x) => x.targetId).sort();
    expect(targets).toEqual([main.id, farHero.id, nearCreep.id].sort());
    runFor(w3, 1.2);
    for (const u of [main, farHero, nearCreep]) expect(findModifier(u, 'slow_pa_dagger')).toBeDefined();
    for (const u of [creep2, outOfRange]) expect(u.hp).toBe(1e6);
  });
});

describe('Phantom Assassin AI', () => {
  it('builds and talents follow the plan', () => {
    expect(SKILL_BUILDS.phantom_assassin).toEqual(['Q', 'W', 'Q', 'E', 'Q', 'R', 'Q', 'E', 'E', 'E', 'R', 'W', 'W', 'W', 'R']);
    expect(TALENT_BUILDS.phantom_assassin).toEqual([1, 0, 1, 0]);
  });

  const ctxFor = (w: World, me: Unit, slot: AbilitySlot, enemies: Unit[], retreating = false, allies: Unit[] = []): AiCtx => ({
    world: w, me, ab: me.ability(slot)!, skill: DIFFICULTY.normal.skill, enemyHeroes: enemies, allyHeroes: allies,
    hpPct: me.hp / me.stats.maxHp, manaPct: me.mana / me.stats.maxMana, retreating,
  });

  it('Stifling Dagger targets the weakest hero in range, or last-hits a creep out of reach', () => {
    const w = makeWorld();
    const p = heroAt(w, PA, { x: 1500, y: 5000 }, { levels: ALL });
    const Q = PA_RULES.pa_stifling_dagger;
    const a = foe(w, 1500, 4200);
    const b = foe(w, 1600, 4300);
    b.hp = 400;
    w.step();
    expect(Q.decide(ctxFor(w, p, 'Q', [a, b]))).toEqual({ cast: { unitId: b.id } });
    p.mana = p.stats.maxMana * 0.25;
    expect(Q.decide(ctxFor(w, p, 'Q', [a, b]))).toBeNull();
    // 小兵：攻击距离 + 100 外、一刀能补掉（魔法 > 60%）
    const w2 = makeWorld();
    const p2 = heroAt(w2, PA, { x: 1500, y: 5000 }, { levels: ALL });
    const c = foe(w2, 1500, 4600, { kind: 'creep' });
    const close = foe(w2, 1600, 4900, { kind: 'creep' });
    close.hp = 10;
    c.hp = 2000;
    w2.step();
    expect(PA_RULES.pa_stifling_dagger.decide(ctxFor(w2, p2, 'Q', []))).toBeNull();
    c.hp = 50;
    expect(PA_RULES.pa_stifling_dagger.decide(ctxFor(w2, p2, 'Q', []))).toEqual({ cast: { unitId: c.id } });
    p2.mana = p2.stats.maxMana * 0.5;
    expect(PA_RULES.pa_stifling_dagger.decide(ctxFor(w2, p2, 'Q', []))).toBeNull();
  });

  it('Phantom Strike jumps on weakened or distant heroes when healthy, and escapes to an ally creep closer to home', () => {
    const w = makeWorld();
    const p = heroAt(w, PA, { x: 1500, y: 5000 }, { levels: ALL });
    const W = PA_RULES.pa_phantom_strike;
    expect(W.escape).toBe(true);
    const h = foe(w, 1500, 4300);
    w.step();
    // 目标满血但在攻击距离 + 100 外
    expect(W.decide(ctxFor(w, p, 'W', [h]))).toEqual({ cast: { unitId: h.id } });
    // 贴身的满血目标：不跳；残血：跳
    h.pos = { x: 1500, y: 4800 };
    expect(W.decide(ctxFor(w, p, 'W', [h]))).toBeNull();
    h.hp = 600;
    expect(W.decide(ctxFor(w, p, 'W', [h]))).toEqual({ cast: { unitId: h.id } });
    // 自己血量 ≤ 50%：不进攻
    p.hp = p.stats.maxHp * 0.45;
    expect(W.decide(ctxFor(w, p, 'W', [h]))).toBeNull();
    // 撤退：600 内有敌方英雄 → 跳到离家更近、离敌人更远的友方单位（天辉的家在下方）
    const ally = spawnDummy(w, { kind: 'creep', team: Team.Radiant, pos: { x: 1500, y: 5700 } });
    const wrong = spawnDummy(w, { kind: 'creep', team: Team.Radiant, pos: { x: 1500, y: 4700 } });
    void wrong;
    expect(W.decide(ctxFor(w, p, 'W', [h], true))).toEqual({ cast: { unitId: ally.id } });
    h.pos = { x: 1500, y: 4000 };
    expect(W.decide(ctxFor(w, p, 'W', [h], true))).toBeNull();
  });

  it('Blur covers a retreat or a losing fight', () => {
    const w = makeWorld();
    const p = heroAt(w, PA, { x: 1500, y: 5000 }, { levels: ALL });
    const X = PA_RULES.pa_blur;
    expect(X.priority).toBe(20);
    expect(X.escape).toBe(true);
    const h = foe(w, 1500, 4300);
    w.step();
    expect(X.decide(ctxFor(w, p, 'X1', [h]))).toBeNull();
    expect(X.decide(ctxFor(w, p, 'X1', [h], true))).toEqual({ cast: {} });
    h.pos = { x: 1500, y: 3900 };
    expect(X.decide(ctxFor(w, p, 'X1', [h], true))).toBeNull();
    // 交战中（正在打敌方英雄）血量 < 50%
    h.pos = { x: 1500, y: 4850 };
    p.order = { kind: 'attack', targetId: h.id, persistent: true };
    expect(X.decide(ctxFor(w, p, 'X1', [h]))).toBeNull();
    p.hp = p.stats.maxHp * 0.4;
    expect(X.decide(ctxFor(w, p, 'X1', [h]))).toEqual({ cast: {} });
  });

  it('AI uses every active ability in a skirmish and Coup de Grace procs', () => {
    let crits = 0;
    const cast = abilitiesCastInSkirmish(PA, {
      setup: (m) => {
        const orig = m.world.events.emit.bind(m.world.events);
        m.world.events.emit = (e) => {
          if (e.type === 'fx' && e.kind === 'pa_crit') crits++;
          orig(e);
        };
      },
    });
    for (const id of ['pa_stifling_dagger', 'pa_phantom_strike', 'pa_blur']) expect(cast).toContain(id);
    expect(crits).toBeGreaterThan(0);
  }, 60000);
});
