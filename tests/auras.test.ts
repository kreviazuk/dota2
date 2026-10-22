import { describe, it, expect } from 'vitest';
import { makeWorld, spawnDummy, runFor } from './helpers';
import { addModifier, findModifier, type ModifierDef } from '../src/sim/modifiers';
import type { AuraDef } from '../src/sim/auras';
import { applyControl } from '../src/sim/status';
import { Team } from '../src/sim/core/types';

const ARMOR_DOWN: ModifierDef = { id: 'test_aura_armor_down', debuff: true, stats: { armor: -5 } };

const auraSource = (aura: AuraDef, id = 'test_aura_src'): ModifierDef => ({ id, aura });

const enemyAura = (radius: number, extra: Partial<AuraDef> = {}): AuraDef => ({
  radius: () => radius, team: 'enemy', child: ARMOR_DOWN, ...extra,
});

describe('auras', () => {
  it('an enemy aura applies to units entering the radius and lingers 0.5 s after they leave', () => {
    const w = makeWorld();
    const owner = spawnDummy(w, { pos: { x: 1500, y: 5000 } });
    addModifier(w, owner, auraSource(enemyAura(300)));
    const enemy = spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 4750 } });
    const far = spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 4000 } });
    const ally = spawnDummy(w, { pos: { x: 1500, y: 5200 } });
    runFor(w, 0.1);
    expect(findModifier(enemy, ARMOR_DOWN.id)?.sourceId).toBe(owner.id);
    expect(enemy.stats.armor).toBe(-5);
    expect(findModifier(far, ARMOR_DOWN.id)).toBeUndefined();
    expect(findModifier(ally, ARMOR_DOWN.id)).toBeUndefined();
    expect(findModifier(owner, ARMOR_DOWN.id)).toBeUndefined();
    // 离开范围：残留 0.5 秒
    enemy.pos = { x: 1500, y: 3000 };
    runFor(w, 0.4);
    expect(findModifier(enemy, ARMOR_DOWN.id)).toBeDefined();
    runFor(w, 0.2);
    expect(findModifier(enemy, ARMOR_DOWN.id)).toBeUndefined();
    expect(enemy.stats.armor).toBe(0);
    // 回到范围内重新获得
    enemy.pos = { x: 1500, y: 4800 };
    runFor(w, 0.05);
    expect(findModifier(enemy, ARMOR_DOWN.id)).toBeDefined();
  });

  it('the linger time is not shortened by status resistance', () => {
    const w = makeWorld();
    const owner = spawnDummy(w, { pos: { x: 1500, y: 5000 } });
    addModifier(w, owner, auraSource(enemyAura(300)));
    const enemy = spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 4800 } });
    addModifier(w, enemy, { id: 'sr', stats: { statusResist: 0.5 } });
    runFor(w, 0.1);
    expect(findModifier(enemy, ARMOR_DOWN.id)!.duration).toBeCloseTo(0.5, 5);
  });

  it('ally aura with filter (ranged heroes only) and a global radius', () => {
    const w = makeWorld();
    const aura: AuraDef = {
      radius: () => Infinity, team: 'ally', includeSelf: true,
      filter: (_o, u) => u.kind === 'hero' && u.base.attackRange >= 400,
      child: { id: 'test_aura_buff', stats: { bonusDamage: 10 } },
    };
    const owner = spawnDummy(w, { kind: 'hero', pos: { x: 1500, y: 5000 }, base: { attackRange: 600 } });
    addModifier(w, owner, auraSource(aura));
    const rangedFar = spawnDummy(w, { kind: 'hero', pos: { x: 1500, y: 9500 }, base: { attackRange: 625 } });
    const melee = spawnDummy(w, { kind: 'hero', pos: { x: 1500, y: 5100 }, base: { attackRange: 150 } });
    const rangedCreep = spawnDummy(w, { pos: { x: 1500, y: 5100 }, base: { attackRange: 500 } });
    const enemyRanged = spawnDummy(w, { kind: 'hero', team: Team.Dire, pos: { x: 1500, y: 5100 }, base: { attackRange: 600 } });
    runFor(w, 0.1);
    expect(findModifier(owner, 'test_aura_buff')).toBeDefined();
    expect(findModifier(rangedFar, 'test_aura_buff')).toBeDefined();
    expect(rangedFar.stats.bonusDamage).toBe(10);
    expect(findModifier(melee, 'test_aura_buff')).toBeUndefined();
    expect(findModifier(rangedCreep, 'test_aura_buff')).toBeUndefined();
    expect(findModifier(enemyRanged, 'test_aura_buff')).toBeUndefined();
  });

  it('without includeSelf an ally aura skips its owner', () => {
    const w = makeWorld();
    const owner = spawnDummy(w, { pos: { x: 1500, y: 5000 } });
    addModifier(w, owner, auraSource({ radius: () => 500, team: 'ally', child: { id: 'test_aura_buff', stats: { armor: 2 } } }));
    const ally = spawnDummy(w, { pos: { x: 1500, y: 5200 } });
    runFor(w, 0.1);
    expect(findModifier(owner, 'test_aura_buff')).toBeUndefined();
    expect(findModifier(ally, 'test_aura_buff')).toBeDefined();
  });

  it('the same aura from two sources does not stack; inactive or broken auras do nothing', () => {
    const w = makeWorld();
    const a = spawnDummy(w, { pos: { x: 1400, y: 5000 } });
    const b = spawnDummy(w, { pos: { x: 1600, y: 5000 } });
    addModifier(w, a, auraSource(enemyAura(400)));
    addModifier(w, b, auraSource(enemyAura(400)));
    const enemy = spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 4800 } });
    runFor(w, 0.1);
    expect(enemy.modifiers.filter((m) => m.def.id === ARMOR_DOWN.id)).toHaveLength(1);
    expect(enemy.stats.armor).toBe(-5);

    // 开关没开（active = false）
    const w2 = makeWorld();
    let on = false;
    const c = spawnDummy(w2, { pos: { x: 1500, y: 5000 } });
    addModifier(w2, c, auraSource(enemyAura(400, { active: () => on })));
    const e2 = spawnDummy(w2, { team: Team.Dire, pos: { x: 1500, y: 4800 } });
    runFor(w2, 0.2);
    expect(findModifier(e2, ARMOR_DOWN.id)).toBeUndefined();
    on = true;
    runFor(w2, 0.05);
    expect(findModifier(e2, ARMOR_DOWN.id)).toBeDefined();

    // 被破坏
    const w3 = makeWorld();
    const d = spawnDummy(w3, { pos: { x: 1500, y: 5000 } });
    addModifier(w3, d, auraSource(enemyAura(400)));
    applyControl(w3, d, 'break', { source: null, duration: 5 });
    const e3 = spawnDummy(w3, { team: Team.Dire, pos: { x: 1500, y: 4800 } });
    runFor(w3, 0.2);
    expect(findModifier(e3, ARMOR_DOWN.id)).toBeUndefined();

    // 死亡的单位不提供光环
    const w4 = makeWorld();
    const dead = spawnDummy(w4, { pos: { x: 1500, y: 5000 } });
    addModifier(w4, dead, { ...auraSource(enemyAura(400)), persistOnDeath: true });
    dead.alive = false;
    const e4 = spawnDummy(w4, { team: Team.Dire, pos: { x: 1500, y: 4800 } });
    runFor(w4, 0.2);
    expect(findModifier(e4, ARMOR_DOWN.id)).toBeUndefined();
  });

  it('a debuff aura does not affect debuff-immune units', () => {
    const w = makeWorld();
    const owner = spawnDummy(w, { pos: { x: 1500, y: 5000 } });
    addModifier(w, owner, auraSource(enemyAura(400)));
    const enemy = spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 4800 } });
    addModifier(w, enemy, { id: 'bkb', states: ['debuffImmune'] });
    runFor(w, 0.2);
    expect(findModifier(enemy, ARMOR_DOWN.id)).toBeUndefined();
  });

  it('includeBuildings lets an aura affect towers', () => {
    const w = makeWorld();
    const owner = spawnDummy(w, { pos: { x: 1500, y: 5000 } });
    addModifier(w, owner, auraSource(enemyAura(800)));
    const tower = spawnDummy(w, { kind: 'building', team: Team.Dire, pos: { x: 1500, y: 4500 }, radius: 90 });
    runFor(w, 0.1);
    expect(findModifier(tower, ARMOR_DOWN.id)).toBeUndefined();

    const w2 = makeWorld();
    const owner2 = spawnDummy(w2, { pos: { x: 1500, y: 5000 } });
    addModifier(w2, owner2, auraSource(enemyAura(800, { includeBuildings: true })));
    const tower2 = spawnDummy(w2, { kind: 'building', team: Team.Dire, pos: { x: 1500, y: 4500 }, radius: 90 });
    runFor(w2, 0.1);
    expect(findModifier(tower2, ARMOR_DOWN.id)).toBeDefined();
    expect(tower2.stats.armor).toBe(-5);
  });

  it('childData is passed to the child modifier', () => {
    const w = makeWorld();
    const child: ModifierDef = { id: 'test_aura_scaled', debuff: true, stats: (m) => ({ armor: -m.data.armor }) };
    const owner = spawnDummy(w, { pos: { x: 1500, y: 5000 } });
    addModifier(w, owner, auraSource({
      radius: () => 500, team: 'enemy', child,
      childData: (o, _w, m) => ({ armor: m.abilityLevel * 3 + (o.hp > 500 ? 0 : 10) }),
    }), { abilityLevel: 2 });
    const enemy = spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 4800 } });
    runFor(w, 0.1);
    const inst = findModifier(enemy, child.id)!;
    expect(inst.data.armor).toBe(6);
    expect(inst.abilityLevel).toBe(2);
    expect(enemy.stats.armor).toBe(-6);
    owner.hp = 400;
    runFor(w, 0.05);
    expect(enemy.stats.armor).toBe(-16);
  });

  it('the radius function is re-evaluated every tick', () => {
    const w = makeWorld();
    let r = 100;
    const owner = spawnDummy(w, { pos: { x: 1500, y: 5000 } });
    addModifier(w, owner, auraSource({ radius: () => r, team: 'enemy', child: ARMOR_DOWN }));
    const enemy = spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 4700 } });
    runFor(w, 0.1);
    expect(findModifier(enemy, ARMOR_DOWN.id)).toBeUndefined();
    r = 1200;
    runFor(w, 0.05);
    expect(findModifier(enemy, ARMOR_DOWN.id)).toBeDefined();
  });
});
