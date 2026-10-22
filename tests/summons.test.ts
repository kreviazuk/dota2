import { describe, it, expect } from 'vitest';
import './testHero';
import { heroAt, makeWorld, spawnDummy, runFor } from './helpers';
import { canAttack, enemiesInRadius, isTargetableBy } from '../src/sim/query';
import { isValidUnitTarget } from '../src/sim/systems/abilities';
import { spawnSummon } from '../src/sim/systems/summons';
import { addModifier, findModifier, type ModifierDef } from '../src/sim/modifiers';
import { applyDamage, killUnit } from '../src/sim/systems/damage';
import { newAttackInfo, resolveAttack } from '../src/sim/systems/attack';
import { createBuildings, pickTowerTarget } from '../src/sim/systems/buildings';
import { pickCreepTarget } from '../src/sim/systems/creeps';
import { createHero } from '../src/sim/systems/heroes';
import { dist } from '../src/sim/core/vec2';
import { Team } from '../src/sim/core/types';
import type { Unit } from '../src/sim/entities/unit';

const asCreep = (u: Unit): Unit => {
  u.creep = { type: 'melee', laneOffset: 0, aggroTargetId: null, aggroUntil: 0, protectedUntilContact: false };
  return u;
};

describe('summons', () => {
  it('spawnSummon creates a summon that follows its owner and expires after its duration', () => {
    const w = makeWorld();
    const owner = spawnDummy(w, { pos: { x: 1500, y: 5000 } });
    const mark: ModifierDef = { id: 'test_summon_mark' };
    const s = spawnSummon(w, owner, {
      defId: 'test_ward', name: '守卫', pos: { x: 1500, y: 5150 }, radius: 16, duration: 5, follow: 150,
      base: { moveSpeed: 400 }, modifiers: [mark],
    });
    expect(s.kind).toBe('summon');
    expect(s.team).toBe(owner.team);
    expect(s.bounty).toEqual({ gold: 0, xp: 0 });
    expect(s.summon).toMatchObject({ ownerId: owner.id, follow: 150 });
    expect(s.summon!.expiresAt).toBeCloseTo(5, 5);
    expect(s.base.damageMax).toBe(0);
    expect(s.stats.maxHp).toBe(1);
    expect(findModifier(s, mark.id)?.sourceId).toBe(owner.id);
    expect(w.units).toContain(s);

    // 主人走远：召唤物跟上，停在 follow + 50 以内
    owner.pos = { x: 1500, y: 4200 };
    runFor(w, 3);
    expect(dist(s.pos, owner.pos)).toBeLessThanOrEqual(150 + 50 + 1);
    expect(s.order.kind).toBe('idle');

    runFor(w, 1.9);
    expect(s.alive).toBe(true);
    runFor(w, 0.2);
    expect(s.alive).toBe(false);
    expect(w.units).not.toContain(s);
  });

  it('a summon stays in place after its owner dies', () => {
    const w = makeWorld();
    const owner = spawnDummy(w, { pos: { x: 1500, y: 5000 } });
    const s = spawnSummon(w, owner, {
      defId: 'test_ward', name: '守卫', pos: { x: 1500, y: 5150 }, radius: 16, duration: 10, follow: 150, base: { moveSpeed: 400 },
    });
    killUnit(w, owner, null);
    const before = { ...s.pos };
    runFor(w, 1);
    expect(s.alive).toBe(true);
    expect(s.pos).toEqual(before);
    expect(s.order.kind).toBe('idle');
  });

  it('hitsToKill: one attack kills it, spells deal nothing', () => {
    const w = makeWorld();
    const owner = spawnDummy(w, { pos: { x: 1500, y: 5000 } });
    const ward = spawnSummon(w, owner, { defId: 'test_ward', name: '守卫', pos: { x: 1500, y: 5100 }, radius: 16, duration: 25, hitsToKill: 1 });
    const enemy = spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 5200 } });
    expect(ward.stats.maxHp).toBe(1);
    expect(applyDamage(w, { source: enemy, target: ward, amount: 5000, type: 'pure', isAttack: false, abilityId: 'x' })).toBe(0);
    expect(applyDamage(w, { source: enemy, target: ward, amount: 5000, type: 'magical', isAttack: false })).toBe(0);
    expect(ward.alive).toBe(true);
    resolveAttack(w, enemy, ward, newAttackInfo());
    expect(ward.alive).toBe(false);

    // 多次：每次普攻固定 1 点，与攻击力、暴击无关
    const tough = spawnSummon(w, owner, { defId: 'test_ward', name: '守卫', pos: { x: 1500, y: 5100 }, radius: 16, duration: 25, hitsToKill: 3 });
    expect(resolveAttack(w, enemy, tough, newAttackInfo({ critMult: 3, bonusDamage: 500 }))).toBe(1);
    expect(tough.hp).toBe(2);
    resolveAttack(w, enemy, tough, newAttackInfo());
    expect(tough.alive).toBe(true);
    resolveAttack(w, enemy, tough, newAttackInfo());
    expect(tough.alive).toBe(false);
  });

  it('a summon without hitsToKill takes normal damage', () => {
    const w = makeWorld();
    const owner = spawnDummy(w, { pos: { x: 1500, y: 5000 } });
    const s = spawnSummon(w, owner, { defId: 'test_bear', name: '熊', pos: { x: 1500, y: 5100 }, radius: 16, duration: 25, base: { maxHp: 500 } });
    expect(s.hp).toBe(500);
    applyDamage(w, { source: null, target: s, amount: 200, type: 'pure', isAttack: false });
    expect(s.hp).toBe(300);
  });

  it('towers and creeps attack summons; killing a summon gives no gold or xp', () => {
    const w = makeWorld();
    const b = createBuildings(w);
    const tower = b[Team.Dire].t1;
    const hero = createHero(w, 'testhero', Team.Radiant, false);
    hero.pos = { x: tower.pos.x, y: tower.pos.y + 250 };
    const ward = spawnSummon(w, hero, {
      defId: 'test_ward', name: '守卫', pos: { x: tower.pos.x, y: tower.pos.y + 500 }, radius: 16, duration: 25, hitsToKill: 1,
    });
    expect(pickTowerTarget(w, tower)).toBe(ward);

    const creep = asCreep(spawnDummy(w, { team: Team.Dire, pos: { x: hero.pos.x + 100, y: hero.pos.y } }));
    expect(pickCreepTarget(w, creep, 600)).toBe(ward);

    const killer = createHero(w, 'testhero', Team.Dire, false);
    killer.pos = { x: ward.pos.x, y: ward.pos.y - 100 };
    const gold = killer.hero!.gold;
    const xp = killer.hero!.xp;
    resolveAttack(w, killer, ward, newAttackInfo());
    expect(ward.alive).toBe(false);
    expect(killer.hero!.gold).toBe(gold);
    expect(killer.hero!.xp).toBe(xp);
    expect(killer.hero!.lastHits).toBe(0);
  });
});

describe('global death hook', () => {
  it('onUnitDeath fires on every living hero\'s modifiers with victim and killer', () => {
    const w = makeWorld();
    const a = createHero(w, 'testhero', Team.Radiant, false);
    const b = createHero(w, 'testhero', Team.Dire, false);
    const c = createHero(w, 'testhero', Team.Dire, false);
    const log: string[] = [];
    const hook: ModifierDef = {
      id: 'test_death_hook', persistOnDeath: true,
      onUnitDeath: (_m, owner, victim, killer) => { log.push(`${owner.id}:${victim.id}:${killer?.id ?? 'null'}`); },
    };
    for (const h of [a, b, c]) addModifier(w, h, hook);
    const creepWithHook = spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 5000 } });
    addModifier(w, creepWithHook, hook);
    killUnit(w, c, a);
    // 死者自己不触发；非英雄单位身上的不触发
    expect(log.sort()).toEqual([`${a.id}:${c.id}:${a.id}`, `${b.id}:${c.id}:${a.id}`].sort());

    log.length = 0;
    const victim = spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 5100 } });
    killUnit(w, victim, null);
    // c 已经死亡，不触发
    expect(log.sort()).toEqual([`${a.id}:${victim.id}:null`, `${b.id}:${victim.id}:null`].sort());
  });

  it('onUnitDeath runs after the killer\'s onKill', () => {
    const w = makeWorld();
    const a = createHero(w, 'testhero', Team.Radiant, false);
    const order: string[] = [];
    addModifier(w, a, {
      id: 'test_order', onKill: () => order.push('kill'), onUnitDeath: () => order.push('death'),
    });
    const victim = spawnDummy(w, { team: Team.Dire });
    killUnit(w, victim, a);
    expect(order).toEqual(['kill', 'death']);
  });
});

describe('hit-count summons and spells (D17)', () => {
  /** 夜魇的治疗守卫（按被攻击次数计算，1 次普攻摧毁） */
  const direWard = (w: ReturnType<typeof makeWorld>, x: number, y: number): Unit => {
    const owner = spawnDummy(w, { team: Team.Dire, pos: { x: x + 1500, y } });
    return spawnSummon(w, owner, { defId: 'test_ward', name: '守卫', pos: { x, y }, radius: 20, duration: 60, hitsToKill: 1 });
  };
  const foe = (w: ReturnType<typeof makeWorld>, x: number, y: number): Unit =>
    spawnDummy(w, { kind: 'hero', team: Team.Dire, pos: { x, y }, base: { maxHp: 5000, damageMin: 0, damageMax: 0 } });

  it('spells cannot select them, area queries for spells skip them, attacks still can', () => {
    const w = makeWorld();
    const me = heroAt(w, 'zeus', { x: 1500, y: 5000 }, { levels: { Q: 1 } });
    const ward = direWard(w, 1500, 4800);
    expect(isTargetableBy(me, ward, 'enemy', true)).toBe(false);
    expect(isTargetableBy(me, ward, 'enemy', true, { attack: true })).toBe(true);
    expect(isValidUnitTarget(me, me.ability('Q')!, ward)).toBe(false);
    expect(canAttack(me, ward)).toBe(true);
    expect(enemiesInRadius(w, me.team, me.pos, 500)).toContain(ward);
    expect(enemiesInRadius(w, me.team, me.pos, 500, { spell: true })).not.toContain(ward);
  });

  it('Arc Lightning does not bounce to the ward (it bounces past it to the next enemy)', () => {
    const w = makeWorld();
    const z = heroAt(w, 'zeus', { x: 1500, y: 5000 }, { levels: { Q: 1 }, heroLevel: 1 });
    const first = foe(w, 1500, 4600);
    const ward = direWard(w, 1500, 4450);
    const next = foe(w, 1500, 4250);
    w.events.drain();
    w.issue(z.id, { type: 'cast', slot: 'Q', target: { unitId: first.id } });
    const arcTargets: number[] = [];
    for (let i = 0; i < 60; i++) {
      w.step();
      for (const e of w.events.drain()) if (e.type === 'fx' && e.kind === 'zeus_arc' && e.targetId !== undefined) arcTargets.push(e.targetId);
    }
    expect(arcTargets).toEqual([first.id, next.id]);
    expect(ward.alive).toBe(true);
  });

  it('Gust does not silence or push the ward', () => {
    const w = makeWorld();
    const d = heroAt(w, 'drow_ranger', { x: 1500, y: 5000 }, { levels: { W: 4 } });
    const ward = direWard(w, 1500, 4850);
    const enemy = foe(w, 1530, 4700);
    w.issue(d.id, { type: 'cast', slot: 'W', target: { dir: { x: 0, y: -1 } } });
    runFor(w, 0.6);
    expect(enemy.hasState('silenced')).toBe(true);
    expect(ward.hasState('silenced')).toBe(false);
    expect(ward.motion).toBeNull();
    expect(ward.pos.y).toBeCloseTo(4850);
    expect(ward.alive).toBe(true);
  });

  it('a normal attack and an attack-based ability (Stifling Dagger) still destroy the ward', () => {
    const w = makeWorld();
    const pa = heroAt(w, 'phantom_assassin', { x: 1500, y: 5000 }, { levels: { Q: 4 } });
    const ward = direWard(w, 1500, 4900);
    w.issue(pa.id, { type: 'attack', mode: 'smart', targetId: ward.id });
    runFor(w, 1.5);
    expect(ward.alive).toBe(false);

    const ward2 = direWard(w, 1500, 4400);
    expect(isValidUnitTarget(pa, pa.ability('Q')!, ward2)).toBe(true);
    w.issue(pa.id, { type: 'cast', slot: 'Q', target: { unitId: ward2.id } });
    runFor(w, 1.5);
    expect(ward2.alive).toBe(false);
  });
});
