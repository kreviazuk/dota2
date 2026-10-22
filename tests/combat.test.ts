import { describe, it, expect } from 'vitest';
import { makeWorld, spawnDummy, runFor } from './helpers';
import { addModifier, type ModifierDef } from '../src/sim/modifiers';
import { newAttackInfo, performAttack, resolveAttack, rollAttackDamage } from '../src/sim/systems/attack';
import { applyDamage, type DamageInfo } from '../src/sim/systems/damage';
import { applyCleave, cleaveTargets } from '../src/sim/systems/cleave';
import { prdC, prdRoll } from '../src/sim/prd';
import { addShield, shieldTotal } from '../src/sim/shields';
import { armorMultiplier } from '../src/sim/formulas';
import { Rng } from '../src/sim/core/rng';
import { Team } from '../src/sim/core/types';
import { createHero } from '../src/sim/systems/heroes';
import type { Unit } from '../src/sim/entities/unit';

const asCreep = (u: Unit): Unit => {
  u.creep = { type: 'melee', laneOffset: 0, aggroTargetId: null, aggroUntil: 0, protectedUntilContact: false };
  return u;
};

describe('attack info', () => {
  it('attack damage = (roll + bonus) × damageMult + flat, then × crit', () => {
    const w = makeWorld();
    const a = spawnDummy(w, { pos: { x: 1500, y: 5000 }, base: { damageMin: 60, damageMax: 60 } });
    addModifier(w, a, { id: 'bd', stats: { bonusDamage: 40 } });
    const t = spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 4900 } });
    expect(rollAttackDamage(w, a)).toBe(100);
    const dealt = resolveAttack(w, a, t, newAttackInfo({ damageMult: 0.5, bonusDamage: 65, critMult: 2 }));
    expect(dealt).toBe((100 * 0.5 + 65) * 2);
    expect(t.hp).toBe(1000 - 230);
    const dmg = w.events.drain().find((e) => e.type === 'damage');
    expect(dmg).toMatchObject({ crit: true, isAttack: true, amount: 230 });
  });

  it('newAttackInfo has neutral defaults', () => {
    expect(newAttackInfo()).toEqual({ critMult: 1, trueStrike: false, bonusDamage: 0, damageMult: 1, flags: {} });
    const a = newAttackInfo({ flags: { frost: 1 } });
    const b = newAttackInfo();
    b.flags.x = 1;
    expect(a.flags).toEqual({ frost: 1 });
    expect(newAttackInfo().flags).toEqual({});
  });

  it('performAttack instant resolves immediately and runs onAttackStart/onAttackLanded unless noProcs', () => {
    const w = makeWorld();
    const a = spawnDummy(w, { pos: { x: 1500, y: 5000 }, base: { attackRange: 600, projectileSpeed: 900 } });
    const t = spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 4500 } });
    const log: string[] = [];
    let seen: DamageInfo | null = null;
    addModifier(w, a, {
      id: 'procs',
      onAttackStart: (_m, _o, _t, _w, atk) => { log.push(`start:${atk.abilityId}`); atk.flags.marked = 1; },
      onAttackLanded: (_m, _o, _t, _w, info) => { log.push('landed'); seen = info; },
    });
    let attackedInfo: DamageInfo | null = null;
    addModifier(w, t, { id: 'victim', onAttacked: (_m, _o, _a, _w, info) => { attackedInfo = info; } });
    performAttack(w, a, t, { instant: true, abilityId: 'pa_stifling_dagger', damageMult: 0.5 });
    expect(t.hp).toBe(975);
    expect(w.projectiles).toHaveLength(0);
    expect(log).toEqual(['start:pa_stifling_dagger', 'landed']);
    expect(seen!.attack!.flags.marked).toBe(1);
    expect(seen!.attack!.abilityId).toBe('pa_stifling_dagger');
    expect(seen!.isAttack).toBe(true);

    log.length = 0;
    attackedInfo = null;
    performAttack(w, a, t, { instant: true, noProcs: true });
    expect(t.hp).toBe(925);
    expect(log).toEqual([]);
    // 被攻击者的 onAttacked 照常调用
    expect(attackedInfo).not.toBeNull();
    expect(attackedInfo!.attack!.noProcs).toBe(true);
  });

  it('performAttack from a ranged attacker launches a homing projectile with the visual override', () => {
    const w = makeWorld();
    const a = spawnDummy(w, { kind: 'hero', pos: { x: 1500, y: 5000 }, base: { attackRange: 600, projectileSpeed: 900 } });
    const t = spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 4400 } });
    performAttack(w, a, t, { visual: 'drow_frost_arrow', bonusDamage: 10, projectileSpeed: 1800 });
    expect(w.projectiles).toHaveLength(1);
    const p = w.projectiles[0];
    expect(p.kind).toBe('homing');
    expect(p.targetId).toBe(t.id);
    expect(p.visual).toBe('drow_frost_arrow');
    expect(p.speed).toBe(1800);
    expect(t.hp).toBe(1000);
    runFor(w, 0.4);
    expect(t.hp).toBe(940);
    // 没有覆盖时用默认外观
    performAttack(w, a, t);
    expect(w.projectiles.at(-1)!.visual).toBe('hero:dummy');
    expect(w.projectiles.at(-1)!.speed).toBe(900);
  });

  it('regular attacks pass info.attack to onAttackLanded', () => {
    const w = makeWorld();
    const a = spawnDummy(w, { pos: { x: 1500, y: 5000 } });
    const t = spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 5100 } });
    const seen: DamageInfo[] = [];
    addModifier(w, a, {
      id: 'orb',
      onAttackStart: (_m, _o, _t, _w, atk) => { atk.flags.orb = 1; atk.bonusDamage = 20; },
      onAttackLanded: (_m, _o, _t, _w, info) => { seen.push(info); },
    });
    a.order = { kind: 'attack', targetId: t.id, persistent: true };
    runFor(w, 0.4);
    expect(t.hp).toBe(930);
    expect(seen).toHaveLength(1);
    expect(seen[0].attack!.flags.orb).toBe(1);
  });
});

describe('armor split', () => {
  it('ignoreBaseArmor only counts bonus armor; ignoreArmor ignores all armor; baseArmor + bonusArmor = armor', () => {
    const w = makeWorld();
    const h = createHero(w, 'axe', Team.Dire, false);
    const baseArmor = h.stats.baseArmor;
    expect(baseArmor).toBeCloseTo(h.base.armor + h.stats.agi * w.balance.hero.armorPerAgi);
    expect(h.stats.bonusArmor).toBe(0);
    addModifier(w, h, { id: 'minus', stats: { armor: -6 } });
    expect(h.stats.bonusArmor).toBe(-6);
    expect(h.stats.armor).toBeCloseTo(baseArmor - 6);

    const a = spawnDummy(w, { pos: { x: 1500, y: 5000 } });
    const hit = (o: Partial<DamageInfo>): number => {
      const before = h.hp;
      applyDamage(w, { source: a, target: h, amount: 100, type: 'physical', isAttack: false, ...o });
      return before - h.hp;
    };
    expect(hit({})).toBeCloseTo(100 * armorMultiplier(baseArmor - 6));
    expect(hit({ ignoreBaseArmor: true })).toBeCloseTo(100 * armorMultiplier(-6));
    expect(hit({ ignoreArmor: true })).toBeCloseTo(100);

    // 攻击的 ignoreBaseArmor 透传到伤害
    const t = spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 5100 }, base: { armor: 10 } });
    resolveAttack(w, a, t, newAttackInfo({ ignoreBaseArmor: true }));
    expect(t.hp).toBe(950);
  });
});

describe('cleave', () => {
  it('cleave hits enemies inside the trapezoid only, ignores their armor, and skips buildings, allies and the main target', () => {
    const w = makeWorld();
    const shape = { startWidth: 150, endWidth: 360, length: 700 };
    const a = spawnDummy(w, { kind: 'hero', pos: { x: 1500, y: 5000 } });
    const main = spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 4900 } });
    const near = spawnDummy(w, { team: Team.Dire, pos: { x: 1580, y: 4950 }, base: { armor: 20 } });
    const far = spawnDummy(w, { team: Team.Dire, pos: { x: 1650, y: 4350 } });
    const tooWide = spawnDummy(w, { team: Team.Dire, pos: { x: 1800, y: 4600 } });
    const tooLong = spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 4250 } });
    const behind = spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 5100 } });
    const ally = spawnDummy(w, { team: Team.Radiant, pos: { x: 1520, y: 4800 } });
    const building = spawnDummy(w, { kind: 'building', team: Team.Dire, pos: { x: 1450, y: 4700 } });
    const ids = cleaveTargets(w, a, main, shape).map((u) => u.id).sort((x, y) => x - y);
    expect(ids).toEqual([near.id, far.id].sort((x, y) => x - y));
    void tooWide; void tooLong; void behind;

    w.events.drain();
    applyCleave(w, a, main, 80, shape, 'sven_great_cleave');
    expect(near.hp).toBe(920);
    expect(far.hp).toBe(920);
    expect(main.hp).toBe(1000);
    expect(ally.hp).toBe(1000);
    expect(building.hp).toBe(1000);
    const ev = w.events.drain();
    const fx = ev.find((e) => e.type === 'fx');
    expect(fx).toMatchObject({ kind: 'cleave', radius: 700 });
    if (fx?.type === 'fx') {
      expect(fx.dir!.x).toBeCloseTo(0);
      expect(fx.dir!.y).toBeCloseTo(-1);
    }
    const dmg = ev.filter((e) => e.type === 'damage');
    expect(dmg.every((e) => e.type === 'damage' && !e.isAttack)).toBe(true);
  });

  it('cleave damage is not amplified by spell amp and does not spell-lifesteal', () => {
    const w = makeWorld();
    const a = spawnDummy(w, { kind: 'hero', pos: { x: 1500, y: 5000 } });
    addModifier(w, a, { id: 'amp', stats: { spellAmp: 0.5, spellLifesteal: 0.5 } });
    a.hp = 500;
    const main = spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 4900 } });
    const other = spawnDummy(w, { team: Team.Dire, pos: { x: 1550, y: 4850 } });
    applyCleave(w, a, main, 100, { startWidth: 150, endWidth: 300, length: 500 }, 'sven_great_cleave');
    expect(other.hp).toBe(900);
    expect(a.hp).toBe(500);
  });
});

describe('PRD', () => {
  it('computes the Dota constants', () => {
    expect(prdC(0.2)).toBeCloseTo(0.055704, 5);
    expect(prdC(0.25)).toBeCloseTo(0.084744, 5);
    expect(prdC(0.3)).toBeCloseTo(0.118949, 5);
    expect(prdC(0.17)).toBeCloseTo(0.04092, 4);
    expect(prdC(0.35)).toBeCloseTo(0.15798, 4);
    expect(prdC(0.17)).toBe(prdC(0.17));
  });

  it('PRD: frequency over 20000 rolls is within 1% of p and the longest miss streak is shorter than with independent rolls', () => {
    for (const p of [0.17, 0.35]) {
      const w = makeWorld(7);
      const state: Record<string, number> = {};
      let hits = 0, streak = 0, longest = 0;
      for (let i = 0; i < 20000; i++) {
        if (prdRoll(w, state, 'crit', p)) { hits++; streak = 0; } else longest = Math.max(longest, ++streak);
      }
      expect(Math.abs(hits / 20000 - p)).toBeLessThan(0.01);
      const rng = new Rng(7);
      let s2 = 0, longest2 = 0;
      for (let i = 0; i < 20000; i++) {
        if (rng.chance(p)) s2 = 0; else longest2 = Math.max(longest2, ++s2);
      }
      expect(longest).toBeLessThan(longest2);
      expect(longest).toBeLessThan(Math.ceil(1 / prdC(p)));
    }
  });

  it('keys are independent and reset after a proc', () => {
    const w = makeWorld();
    const state: Record<string, number> = {};
    prdRoll(w, state, 'a', 0);
    prdRoll(w, state, 'a', 0);
    expect(state.a).toBe(2);
    expect(state.b).toBeUndefined();
    expect(prdRoll(w, state, 'b', 1)).toBe(true);
    expect(state.b).toBe(0);
    expect(prdRoll(w, state, 'c', 0)).toBe(false);
  });
});

describe('shields', () => {
  it('shields absorb only their damage types, stack independently, are consumed oldest first and expire', () => {
    const w = makeWorld();
    const u = spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 4900 } });
    const s1 = addShield(w, u, { id: 'magic_shield', amount: 100, duration: 5, types: ['magical'] });
    const s2 = addShield(w, u, { id: 'any_shield', amount: 50, duration: 2 });
    const s3 = addShield(w, u, { id: 'any_shield', amount: 30, duration: 10 });
    expect(s1 && s2 && s3).toBeTruthy();
    expect(shieldTotal(u)).toBe(180);
    expect(shieldTotal(u, 'magical')).toBe(180);
    expect(shieldTotal(u, 'physical')).toBe(80);

    // 物理：魔法盾不吸收，先扣 s2
    applyDamage(w, { source: null, target: u, amount: 40, type: 'physical', isAttack: false });
    expect(u.hp).toBe(1000);
    expect(s2!.data.remaining).toBe(10);
    // 魔法 150：s1 先吸收 100，再 s2 的 10，再 s3 的 30，剩 10 扣血
    applyDamage(w, { source: null, target: u, amount: 150, type: 'magical', isAttack: false });
    expect(u.hp).toBe(990);
    expect(shieldTotal(u)).toBe(0);
    expect(u.modifiers.length).toBe(0);

    // 到期移除
    addShield(w, u, { id: 'any_shield', amount: 50, duration: 1 });
    runFor(w, 0.9);
    expect(shieldTotal(u)).toBe(50);
    runFor(w, 0.2);
    expect(shieldTotal(u)).toBe(0);
  });

  it('shields absorb mitigated damage', () => {
    const w = makeWorld();
    const u = spawnDummy(w, { team: Team.Dire, base: { armor: 10 } });
    const s = addShield(w, u, { id: 'sh', amount: 100, duration: 5 });
    applyDamage(w, { source: null, target: u, amount: 100, type: 'physical', isAttack: false });
    expect(s!.data.remaining).toBeCloseTo(100 - 100 * armorMultiplier(10));
    expect(u.hp).toBe(1000);
  });
});

describe('damage hooks and stats', () => {
  it('onBeforeDealDamage runs before mitigation and sees the target\'s hp before the hit; preMitigation is recorded', () => {
    const w = makeWorld();
    const zeus = spawnDummy(w, { kind: 'hero', pos: { x: 1500, y: 5000 } });
    addModifier(w, zeus, { id: 'amp', stats: { spellAmp: 0.1 } });
    const t = spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 4900 }, base: { magicResist: 0.5 } });
    const seenHp: number[] = [];
    const seenPre: number[] = [];
    const staticField: ModifierDef = {
      id: 'static',
      onBeforeDealDamage: (_m, owner, target, world, info) => {
        if (info.abilityId === 'static') return;
        seenHp.push(target.hp);
        seenPre.push(info.preMitigation ?? -1);
        applyDamage(world, { source: owner, target, amount: target.hp * 0.1, type: 'magical', isAttack: false, abilityId: 'static', noSpellAmp: true });
      },
    };
    addModifier(w, zeus, staticField);
    const info: DamageInfo = { source: zeus, target: t, amount: 100, type: 'magical', isAttack: false, abilityId: 'arc' };
    const dealt = applyDamage(w, info);
    expect(seenHp).toEqual([1000]);
    expect(seenPre[0]).toBeCloseTo(110);
    expect(info.preMitigation).toBeCloseTo(110);
    expect(dealt).toBeCloseTo(55);
    // 静电场：1000 × 10% × 0.5 = 50；本体 110 × 0.5 = 55
    expect(t.hp).toBeCloseTo(1000 - 50 - 55);
    const order = w.events.drain().filter((e) => e.type === 'damage').map((e) => (e.type === 'damage' ? Math.round(e.amount) : 0));
    expect(order).toEqual([50, 55]);
  });

  it('onBeforeDealDamage that kills the target makes the hit deal nothing', () => {
    const w = makeWorld();
    const src = spawnDummy(w, { kind: 'hero' });
    const t = spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 4900 } });
    addModifier(w, src, {
      id: 'k',
      onBeforeDealDamage: (_m, owner, target, world, info) => {
        if (info.abilityId !== 'k') applyDamage(world, { source: owner, target, amount: 5000, type: 'pure', isAttack: false, abilityId: 'k' });
      },
    });
    expect(applyDamage(w, { source: src, target: t, amount: 100, type: 'physical', isAttack: false })).toBe(0);
    expect(t.alive).toBe(false);
  });

  it('preMitigation of attacks includes the attack-type multiplier', () => {
    const w = makeWorld();
    const a = spawnDummy(w, { attackClass: 'pierce' });
    const t = spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 4900 }, base: { armor: 5 } });
    const info: DamageInfo = { source: a, target: t, amount: 100, type: 'physical', isAttack: true };
    applyDamage(w, info);
    expect(info.preMitigation).toBeCloseTo(50);
  });

  it('finalStats can add bonus damage from computed strength', () => {
    const w = makeWorld();
    const h = createHero(w, 'axe', Team.Radiant, false);
    const before = h.stats.bonusDamage;
    addModifier(w, h, { id: 'str_dmg', stats: { str: 10 }, finalStats: (_m, _o, _w, s) => { s.bonusDamage += s.str * 0.5; } });
    expect(h.stats.bonusDamage).toBeCloseTo(before + h.stats.str * 0.5);
  });

  it('damageDealt accumulates per hero by target kind', () => {
    const w = makeWorld();
    const h = createHero(w, 'axe', Team.Radiant, false);
    const enemyHero = spawnDummy(w, { kind: 'hero', team: Team.Dire, pos: { x: 1500, y: 4900 } });
    const creep = asCreep(spawnDummy(w, { team: Team.Dire, pos: { x: 1600, y: 4900 } }));
    const summon = spawnDummy(w, { kind: 'summon', team: Team.Dire, pos: { x: 1400, y: 4900 } });
    const tower = spawnDummy(w, { kind: 'building', team: Team.Dire, pos: { x: 1500, y: 4500 } });
    const ally = spawnDummy(w, { team: Team.Radiant, pos: { x: 1500, y: 5200 } });
    const pure = (t: Unit, amount: number) => applyDamage(w, { source: h, target: t, amount, type: 'pure', isAttack: false });
    pure(enemyHero, 100);
    pure(enemyHero, 50);
    pure(creep, 30);
    pure(summon, 20);
    pure(tower, 40);
    pure(ally, 999);
    // 溢出伤害只按实际扣掉的生命计
    creep.hp = 10;
    pure(creep, 500);
    expect(h.hero!.damageDealt).toEqual({ heroes: 150, creeps: 60, buildings: 40 });
  });
});
