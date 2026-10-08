import { describe, it, expect } from 'vitest';
import { makeWorld, spawnDummy } from './helpers';
import { Team } from '../src/sim/core/types';
import { dist } from '../src/sim/core/vec2';
import { createHero } from '../src/sim/systems/heroes';
import { recomputeStats } from '../src/sim/stats';
import {
  bestCirclePoint, enemyCreepsNear, firstInLine, keepsUltMana, lineClearTo, lowestHpEnemyHero, magicDamageTo, nearestEnemyHero,
  physicalDamageTo, predictPos, towardHome, underAttack, unitVelocity, unitsInLine,
} from '../src/ai/aiHelpers';
import { DIFFICULTY } from '../src/ai/difficulty';
import type { AiCtx } from '../src/ai/usage/types';
import type { AiSkill } from '../src/sim/heroes/types';
import type { Unit } from '../src/sim/entities/unit';
import type { World } from '../src/sim/world';

const skill = (prediction: number): AiSkill => ({ ...DIFFICULTY.normal.skill, prediction });

const ctxFor = (w: World, me: Unit, enemies: Unit[]): AiCtx => ({
  world: w, me, ab: me.abilities[0], skill: DIFFICULTY.normal.skill, enemyHeroes: enemies, allyHeroes: [],
  hpPct: 1, manaPct: 1, retreating: false,
});

describe('ai helpers', () => {
  it('predictPos leads a moving target by velocity × lead × prediction', () => {
    const w = makeWorld();
    const t = spawnDummy(w, { pos: { x: 1500, y: 5000 } });
    t.prevPos = { x: 1490, y: 5000 }; // 10 / DT = 300 单位/秒
    expect(unitVelocity(t).x).toBeCloseTo(300);
    expect(unitVelocity(t).y).toBeCloseTo(0);
    const p1 = predictPos(w, t, 0.5, skill(1));
    expect(p1.x).toBeCloseTo(1650);
    expect(p1.y).toBeCloseTo(5000);
    expect(predictPos(w, t, 0.5, skill(0.5)).x).toBeCloseTo(1575);
    // prediction 0：不预判，只有不超过 easyAimError 的随机偏差
    let maxErr = 0;
    for (let i = 0; i < 200; i++) maxErr = Math.max(maxErr, dist(predictPos(w, t, 0.5, skill(0)), t.pos));
    expect(maxErr).toBeLessThanOrEqual(w.balance.ai.easyAimError + 1e-9);
    expect(maxErr).toBeGreaterThan(50);
  });

  it('bestCirclePoint prefers the point covering the most units, weighting heroes', () => {
    const w = makeWorld();
    const origin = { x: 1500, y: 6000 };
    // 三个小兵挤在一起，一个英雄单独站着
    const creeps = [0, 30, 60].map((dx) => spawnDummy(w, { team: Team.Dire, pos: { x: 1300 + dx, y: 5500 }, radius: 16 }));
    const hero = spawnDummy(w, { kind: 'hero', team: Team.Dire, pos: { x: 1800, y: 5500 }, radius: 24 });
    const r = bestCirclePoint([...creeps, hero], 100, origin, 1000, 1)!;
    expect(r.count).toBe(3);
    expect(r.heroes).toBe(0);
    // 英雄权重 4 > 3 个小兵
    const r2 = bestCirclePoint([...creeps, hero], 100, origin, 1000, 4)!;
    expect(r2.point).toEqual(hero.pos);
    expect(r2.heroes).toBe(1);
    // 英雄在小兵堆旁边时一起覆盖
    hero.pos = { x: 1390, y: 5500 };
    const r3 = bestCirclePoint([...creeps, hero], 100, origin, 1000)!;
    expect(r3.count).toBe(4);
    expect(r3.heroes).toBe(1);
    // 施法距离外的候选不考虑
    expect(bestCirclePoint([...creeps, hero], 100, origin, 100)).toBeNull();
  });

  it('lineClearTo checks the projectile sweep capsule, including the half circle behind the caster', () => {
    const w = makeWorld();
    const me = spawnDummy(w, { kind: 'hero', team: Team.Radiant, pos: { x: 1500, y: 6000 } });
    const target = spawnDummy(w, { kind: 'hero', team: Team.Dire, pos: { x: 1500, y: 5300 } });
    const up = { x: 0, y: -1 };
    expect(lineClearTo(w, me, target, up, 1300, 100)).toBe(true);
    // 目标不在线上
    expect(lineClearTo(w, me, target, { x: 1, y: 0 }, 1300, 100)).toBe(false);
    // 贴在身后的友方小兵：矩形（firstInLine）看不到它，但弹道从施法者中心出发、先扫到它
    const behind = spawnDummy(w, { team: Team.Radiant, pos: { x: 1540, y: 6060 } });
    expect(firstInLine(w, me, up, 1300, 100)).toBe(target);
    expect(lineClearTo(w, me, target, up, 1300, 100)).toBe(false);
    behind.alive = false;
    // 比目标晚碰到的单位不算（紧贴在目标身后也一样）；margin 加大别的单位的碰撞半径，并要求它们比目标晚 margin 以上
    const past = spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 5100 } });
    expect(lineClearTo(w, me, target, up, 1300, 100)).toBe(true);
    const side = spawnDummy(w, { team: Team.Radiant, pos: { x: 1650, y: 5700 } });
    expect(lineClearTo(w, me, target, up, 1300, 100)).toBe(true);
    expect(lineClearTo(w, me, target, up, 1300, 100, 50)).toBe(false);
    side.alive = false;
    past.pos = { x: 1500, y: 5240 };
    expect(lineClearTo(w, me, target, up, 1300, 100)).toBe(true);
    expect(lineClearTo(w, me, target, up, 1300, 100, 50)).toBe(false);
    // 施法者身后、碰撞半径之外的单位不算
    past.alive = false;
    spawnDummy(w, { team: Team.Radiant, pos: { x: 1500, y: 6200 } });
    expect(lineClearTo(w, me, target, up, 1300, 100)).toBe(true);
  });

  it('unitsInLine and firstInLine find units inside the rectangle in distance order', () => {
    const w = makeWorld();
    const me = spawnDummy(w, { kind: 'hero', team: Team.Radiant, pos: { x: 1500, y: 6000 } });
    const far = spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 5300 } });
    const near = spawnDummy(w, { team: Team.Dire, pos: { x: 1530, y: 5700 } });
    const side = spawnDummy(w, { team: Team.Dire, pos: { x: 1700, y: 5600 } });
    const behind = spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 6200 } });
    const ally = spawnDummy(w, { team: Team.Radiant, pos: { x: 1500, y: 5800 } });
    const tooFar = spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 4800 } });
    const up = { x: 0, y: -1 };
    const line = unitsInLine(w, Team.Radiant, me.pos, up, 1000, 50);
    expect(line.map((u) => u.id)).toEqual([near.id, far.id]);
    expect(line).not.toContain(side);
    expect(line).not.toContain(behind);
    expect(line).not.toContain(tooFar);
    // AI 看不见对我方隐藏的单位
    far.baseStates.add('hidden');
    recomputeStats(w, far);
    expect(unitsInLine(w, Team.Radiant, me.pos, up, 1000, 50)).toEqual([near]);
    far.baseStates.delete('hidden');
    recomputeStats(w, far);
    // 第一个碰到的是友方小兵（敌我都算），然后是 near
    expect(firstInLine(w, me, up, 1000, 50)).toBe(ally);
    ally.alive = false;
    expect(firstInLine(w, me, up, 1000, 50)).toBe(near);
    expect(firstInLine(w, me, { x: 1, y: 0 }, 1000, 50)).toBeNull();
    // 召唤物不算
    near.alive = false;
    far.alive = false;
    spawnDummy(w, { kind: 'summon', team: Team.Dire, pos: { x: 1500, y: 5600 } });
    expect(firstInLine(w, me, up, 1000, 50)).toBeNull();
  });

  it('magicDamageTo / physicalDamageTo apply resistances', () => {
    const w = makeWorld();
    const t = spawnDummy(w, { base: { armor: 5, magicResist: 0.25 } });
    recomputeStats(w, t);
    expect(magicDamageTo(t, 100)).toBeCloseTo(75);
    // 5 护甲 → 1 − 0.3 / 1.3
    expect(physicalDamageTo(t, 100)).toBeCloseTo(100 * (1 - 0.3 / 1.3));
  });

  it('target pickers, home direction, creeps near and underAttack', () => {
    const w = makeWorld();
    const me = createHero(w, 'axe', Team.Radiant, false);
    me.pos = { x: 1500, y: 5000 };
    const a = createHero(w, 'axe', Team.Dire, false);
    const b = createHero(w, 'axe', Team.Dire, false);
    a.pos = { x: 1500, y: 4700 };
    b.pos = { x: 1500, y: 4300 };
    b.hp = 100;
    const c = ctxFor(w, me, [a, b]);
    expect(nearestEnemyHero(c, 1000)).toBe(a);
    expect(nearestEnemyHero(c, 100)).toBeNull();
    expect(lowestHpEnemyHero(c, 1000)).toBe(b);
    expect(lowestHpEnemyHero(c, 400)).toBe(a);
    // 天辉泉水在下方
    expect(towardHome(me).y).toBeGreaterThan(0.99);
    const creep = spawnDummy(w, { team: Team.Dire, pos: { x: 1550, y: 5000 } });
    spawnDummy(w, { kind: 'summon', team: Team.Dire, pos: { x: 1450, y: 5000 } });
    expect(enemyCreepsNear(w, me, me.pos, 200)).toEqual([creep]);
    expect(underAttack(w, me)).toBe(false);
    a.attack.targetId = me.id;
    expect(underAttack(w, me)).toBe(true);
    a.attack.targetId = null;
    me.heroDamageTimes.set(b.id, w.time - 0.5);
    expect(underAttack(w, me)).toBe(true);
    me.heroDamageTimes.set(b.id, w.time - 2);
    expect(underAttack(w, me)).toBe(false);
  });

  it('keepsUltMana keeps enough mana for a ready ultimate', () => {
    const w = makeWorld();
    const me = createHero(w, 'axe', Team.Radiant, false);
    const q = me.ability('Q')!;
    const r = me.ability('R')!;
    q.level = 1; // 90 魔
    const c = { ...ctxFor(w, me, []), ab: q };
    me.mana = 150;
    expect(keepsUltMana(c)).toBe(true); // 还没学大招
    r.level = 1; // 100 魔
    expect(keepsUltMana(c)).toBe(false);
    me.mana = 190;
    expect(keepsUltMana(c)).toBe(true);
    me.mana = 150;
    r.cooldown = 30;
    expect(keepsUltMana(c)).toBe(true); // 大招还要很久才好
    r.cooldown = 0;
    expect(keepsUltMana({ ...c, ab: r })).toBe(true);
    w.balance.ai.conserveUltMana = false;
    expect(keepsUltMana(c)).toBe(true);
  });
});
