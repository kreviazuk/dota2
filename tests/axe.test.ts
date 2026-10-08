import { describe, it, expect } from 'vitest';
import { makeWorld, spawnDummy, runFor } from './helpers';
import { createHero } from '../src/sim/systems/heroes';
import { addModifier, findModifier, removeModifier } from '../src/sim/modifiers';
import { applyDamage, killUnit } from '../src/sim/systems/damage';
import { abilityValue, resolveTarget, syncPassives } from '../src/sim/systems/abilities';
import { pickTalent } from '../src/sim/talents';
import { Team } from '../src/sim/core/types';
import type { World } from '../src/sim/world';
import type { Unit } from '../src/sim/entities/unit';

function axeAt(w: World, x: number, y: number, levels: Partial<Record<'Q' | 'W' | 'E' | 'R', number>> = {}): Unit {
  const a = createHero(w, 'axe', Team.Radiant, false);
  a.pos = { x, y };
  for (const [slot, lv] of Object.entries(levels)) a.ability(slot as 'Q')!.level = lv!;
  syncPassives(w, a);
  a.hero!.level = 18;
  a.autoAttack = false;
  w.step();
  a.mana = a.stats.maxMana;
  return a;
}

describe('Axe', () => {
  it('has 7.41f base stats and One Man Army strength when alone', () => {
    const w = makeWorld();
    const a = createHero(w, 'axe', Team.Radiant, false);
    w.step();
    expect(a.stats.armor).toBeCloseTo(3);
    expect(a.stats.str).toBeCloseTo(25 + 1.5);
    const ally = createHero(w, 'axe', Team.Radiant, false);
    ally.pos = { x: a.pos.x + 100, y: a.pos.y };
    // 友方英雄进入范围后，加成在 3 秒内线性消失
    runFor(w, 1.5);
    expect(a.stats.str).toBeCloseTo(25 + 0.75, 1);
    runFor(w, 1.6);
    expect(a.stats.str).toBeCloseTo(25);
    expect(a.stats.maxHp).toBeCloseTo(670);
    // 友方离开 350 范围后立即恢复
    ally.pos = { x: a.pos.x + 800, y: a.pos.y };
    w.step();
    expect(a.stats.str).toBeCloseTo(26.5);
  });
  it("Berserker's Call taunts nearby enemies and grants armor", () => {
    const w = makeWorld();
    const a = axeAt(w, 1500, 5000, { Q: 4 });
    const enemy = spawnDummy(w, { kind: 'hero', team: Team.Dire, pos: { x: 1500, y: 4800 } });
    const farEnemy = spawnDummy(w, { kind: 'hero', team: Team.Dire, pos: { x: 1500, y: 4400 } });
    const armorBefore = a.stats.armor;
    w.issue(a.id, { type: 'cast', slot: 'Q' });
    runFor(w, 0.4);
    expect(findModifier(enemy, 'axe_berserkers_call_taunt')).toBeDefined();
    expect(findModifier(farEnemy, 'axe_berserkers_call_taunt')).toBeUndefined();
    expect(enemy.stats.tauntedBy).toBe(a.id);
    expect(a.stats.armor).toBeCloseTo(armorBefore + 15);
    runFor(w, 1);
    expect(a.hp).toBeLessThan(a.stats.maxHp);
  });
  it("Berserker's Call taunt pierces debuff immunity, ignores protected creeps and ends when Axe dies", () => {
    const w = makeWorld();
    const a = axeAt(w, 1500, 5000, { Q: 1 });
    const immune = createHero(w, 'axe', Team.Dire, false);
    immune.pos = { x: 1500, y: 4800 };
    addModifier(w, immune, { id: 'test_bkb', states: ['debuffImmune'] });
    const creep = spawnDummy(w, { team: Team.Dire, pos: { x: 1600, y: 4900 } });
    creep.creep = { type: 'melee', laneOffset: 0, aggroTargetId: null, aggroUntil: 0, protectedUntilContact: true };
    w.issue(a.id, { type: 'cast', slot: 'Q' });
    runFor(w, 0.4);
    expect(immune.stats.tauntedBy).toBe(a.id);
    expect(findModifier(creep, 'axe_berserkers_call_taunt')).toBeUndefined();
    killUnit(w, a, null);
    w.step();
    expect(findModifier(immune, 'axe_berserkers_call_taunt')).toBeUndefined();
    expect(immune.stats.tauntedBy).toBeNull();
  });
  it('Battle Hunger deals pure damage over time and ends when the target kills something', () => {
    const w = makeWorld();
    const a = axeAt(w, 1500, 5000, { W: 1 });
    const enemy = spawnDummy(w, { kind: 'hero', team: Team.Dire, pos: { x: 1500, y: 4600 }, base: { damageMin: 0, damageMax: 0 } });
    w.issue(a.id, { type: 'cast', slot: 'W', target: { unitId: enemy.id } });
    runFor(w, 2.4);
    expect(enemy.hp).toBeCloseTo(1000 - 12 * 2, 0);
    const victim = spawnDummy(w, { team: Team.Radiant, pos: { x: 1500, y: 4500 } });
    applyDamage(w, { source: enemy, target: victim, amount: 99999, type: 'pure', isAttack: false });
    expect(findModifier(enemy, 'axe_battle_hunger')).toBeUndefined();
  });
  it('Battle Hunger slows targets facing away from Axe', () => {
    const w = makeWorld();
    const a = axeAt(w, 1500, 5000, { W: 4 });
    const enemy = spawnDummy(w, { kind: 'hero', team: Team.Dire, pos: { x: 1500, y: 4600 }, base: { damageMin: 0, damageMax: 0 } });
    w.issue(a.id, { type: 'cast', slot: 'W', target: { unitId: enemy.id } });
    runFor(w, 0.4);
    enemy.facing = -Math.PI / 2;
    w.step();
    expect(enemy.stats.moveSpeed).toBeCloseTo(300 * 0.7);
    enemy.facing = Math.PI / 2;
    w.step();
    expect(enemy.stats.moveSpeed).toBeCloseTo(300);
  });
  it('Counter Helix triggers after N attacks and deals pure damage around Axe', () => {
    const w = makeWorld();
    const a = axeAt(w, 1500, 5000, { E: 1 });
    a.hero!.level = 1;
    const attacker = spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 4900 }, base: { damageMin: 1, damageMax: 1, bat: 0.2, attackPoint: 0.05 } });
    const bystander = spawnDummy(w, { team: Team.Dire, pos: { x: 1600, y: 5000 }, base: { damageMin: 0, damageMax: 0 } });
    attacker.order = { kind: 'attack', targetId: a.id, persistent: true };
    runFor(w, 1.5);
    expect(bystander.hp).toBeCloseTo(900);
  });
  it('Counter Helix is disabled by Break and its counter resets on death', () => {
    const w = makeWorld();
    const a = axeAt(w, 1500, 5000, { E: 4 });
    const bystander = spawnDummy(w, { team: Team.Dire, pos: { x: 1600, y: 5000 }, base: { damageMin: 0, damageMax: 0 } });
    const hit = (n: number): void => {
      for (let i = 0; i < n; i++) {
        w.time += 1;
        const helix = findModifier(a, 'axe_counter_helix')!;
        helix.def.onAttacked!(helix, a, bystander, w, { source: bystander, target: a, amount: 0, type: 'physical', isAttack: true });
      }
    };
    const brk = addModifier(w, a, { id: 'test_break', states: ['breakPassives'] })!;
    hit(4);
    expect(bystander.hp).toBe(1000);
    removeModifier(w, a, brk);
    hit(3);
    killUnit(w, a, null);
    a.alive = true;
    a.hp = a.stats.maxHp;
    hit(1);
    expect(bystander.hp).toBe(1000);
    hit(3);
    expect(bystander.hp).toBeCloseTo(1000 - 160);
  });
  it('Culling Blade kills below the threshold and damages above it', () => {
    const w = makeWorld();
    const a = axeAt(w, 1500, 5000, { R: 1 });
    const low = spawnDummy(w, { kind: 'hero', team: Team.Dire, pos: { x: 1500, y: 4870 }, base: { damageMin: 0, damageMax: 0 } });
    low.hp = 250;
    const armorBefore = a.stats.armor;
    w.issue(a.id, { type: 'cast', slot: 'R', target: { unitId: low.id } });
    runFor(w, 0.5);
    expect(low.alive).toBe(false);
    const r = a.ability('R')!;
    expect(r.cooldown).toBe(0);
    expect(findModifier(a, 'axe_culling_blade_stacks')?.stacks).toBe(1);
    expect(findModifier(a, 'axe_culling_blade_buff')).toBeDefined();
    expect(a.stats.armor).toBeCloseTo(armorBefore + 10 + 1);
    const high = spawnDummy(w, { kind: 'hero', team: Team.Dire, pos: { x: 1500, y: 4870 }, base: { damageMin: 0, damageMax: 0 } });
    w.issue(a.id, { type: 'cast', slot: 'R', target: { unitId: high.id } });
    runFor(w, 0.5);
    expect(high.hp).toBeCloseTo(1000 - 275);
    expect(r.cooldown).toBeGreaterThan(70);
  });
  it('Culling Blade can target and kill debuff-immune heroes; creep kills do not reset cooldown', () => {
    const w = makeWorld();
    const a = axeAt(w, 1500, 5000, { R: 1 });
    const immune = spawnDummy(w, { kind: 'hero', team: Team.Dire, pos: { x: 1500, y: 4870 }, base: { damageMin: 0, damageMax: 0 } });
    addModifier(w, immune, { id: 'test_bkb', states: ['debuffImmune'] });
    w.issue(a.id, { type: 'cast', slot: 'R', target: { unitId: immune.id } });
    runFor(w, 0.5);
    expect(immune.hp).toBeCloseTo(1000 - 275);
    const r = a.ability('R')!;
    r.cooldown = 0;
    const creep = spawnDummy(w, { team: Team.Dire, pos: { x: 1600, y: 4900 }, base: { damageMin: 0, damageMax: 0 } });
    creep.hp = 100;
    w.issue(a.id, { type: 'cast', slot: 'R', target: { unitId: creep.id } });
    runFor(w, 0.5);
    expect(creep.alive).toBe(false);
    expect(r.cooldown).toBeGreaterThan(70);
    expect(findModifier(a, 'axe_culling_blade_stacks')).toBeUndefined();
  });
  it('Culling Blade smart-targets a killable hero first', () => {
    const w = makeWorld();
    const a = axeAt(w, 1500, 5000, { R: 1 });
    spawnDummy(w, { kind: 'hero', team: Team.Dire, pos: { x: 1500, y: 4900 } });
    const weak = spawnDummy(w, { kind: 'hero', team: Team.Dire, pos: { x: 1650, y: 4800 } });
    weak.hp = 200;
    expect(resolveTarget(w, a, a.ability('R')!)?.unit).toBe(weak);
  });
});

describe('Axe talents', () => {
  it('talent 10a: +8% move speed per active Battle Hunger', () => {
    const w = makeWorld();
    const a = axeAt(w, 1500, 5000, { W: 4 });
    const e1 = spawnDummy(w, { kind: 'hero', team: Team.Dire, pos: { x: 1500, y: 4700 }, base: { damageMin: 0, damageMax: 0 } });
    const e2 = spawnDummy(w, { kind: 'hero', team: Team.Dire, pos: { x: 1700, y: 4800 }, base: { damageMin: 0, damageMax: 0 } });
    const base = a.stats.moveSpeed;
    expect(pickTalent(w, a, 0, 0)).toBe(true);
    w.step();
    expect(a.stats.moveSpeed).toBeCloseTo(base);
    w.issue(a.id, { type: 'cast', slot: 'W', target: { unitId: e1.id } });
    runFor(w, 0.4);
    a.ability('W')!.cooldown = 0;
    w.issue(a.id, { type: 'cast', slot: 'W', target: { unitId: e2.id } });
    runFor(w, 0.4);
    expect(findModifier(e1, 'axe_battle_hunger', a.id)).toBeDefined();
    expect(findModifier(e2, 'axe_battle_hunger', a.id)).toBeDefined();
    expect(a.stats.moveSpeed).toBeCloseTo(base * 1.16);
    removeModifier(w, e1, findModifier(e1, 'axe_battle_hunger')!);
    w.step();
    expect(a.stats.moveSpeed).toBeCloseTo(base * 1.08);
    // 斧王自己的增益在死亡后保留
    expect(findModifier(a, 'axe_t10a')?.def.persistOnDeath).toBe(true);
  });

  it('every Axe talent changes the documented value', () => {
    const cases: { tier: 0 | 1 | 2 | 3; side: 0 | 1; slot: 'Q' | 'W' | 'E' | 'R'; key: string; expected: number }[] = [
      { tier: 0, side: 1, slot: 'R', key: 'buffDuration', expected: 9 },
      { tier: 1, side: 0, slot: 'Q', key: 'armor', expected: 25 },
      { tier: 1, side: 1, slot: 'W', key: 'dps', expected: 32 },
      { tier: 2, side: 0, slot: 'E', key: 'damage', expected: 200 },
      { tier: 3, side: 0, slot: 'R', key: 'damage', expected: 625 },
      { tier: 3, side: 1, slot: 'Q', key: 'radius', expected: 400 },
    ];
    for (const c of cases) {
      const w = makeWorld();
      const a = axeAt(w, 1500, 5000, { Q: 4, W: 4, E: 4, R: 3 });
      a.hero!.level = 25;
      expect(pickTalent(w, a, c.tier, c.side)).toBe(true);
      expect(abilityValue(a, a.ability(c.slot)!, c.key)).toBe(c.expected);
    }
    const w = makeWorld();
    const a = axeAt(w, 1500, 5000);
    a.hero!.level = 20;
    w.step();
    const str = a.stats.str;
    expect(pickTalent(w, a, 2, 1)).toBe(true);
    expect(a.stats.str).toBeCloseTo(str + 15);
  });
});
