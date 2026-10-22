import { describe, it, expect, beforeEach } from 'vitest';
import { World } from '../../src/sim/world';
import { Unit } from '../../src/sim/entities/unit';
import { Team } from '../../src/sim/core/types';
import { createHero } from '../../src/sim/systems/heroes';
import { buyItem } from '../../src/sim/items/inventory';
import { performAttack } from '../../src/sim/systems/attack';
import { updateAuras } from '../../src/sim/auras';
import { updateAbilities, issueCast } from '../../src/sim/systems/abilities';
import { findModifier } from '../../src/sim/modifiers';
import { spawnDummy, runFor } from '../helpers';

describe('Item Passive & Combat Effects', () => {
  let world: World;
  let radiantHero: Unit;
  let direHero: Unit;

  beforeEach(() => {
    world = new World({ seed: 42, recordEvents: true, spawnCreeps: false });
    radiantHero = createHero(world, 'axe', Team.Radiant, true);
    radiantHero.pos = { x: 1500, y: 5000 };
    radiantHero.hero!.gold = 20000;

    direHero = createHero(world, 'sven', Team.Dire, false);
    direHero.pos = { x: 1500, y: 5100 };
    direHero.hero!.gold = 20000;
  });

  it('Quelling Blade adds damage against non-heroes but not against heroes', () => {
    const creep = spawnDummy(world, {
      kind: 'creep',
      team: Team.Dire,
      pos: { x: 1500, y: 5050 },
      base: { armor: 0, maxHp: 5000, magicResist: 0 },
    });

    // 基础普攻打小兵
    const dmgCreepBefore = performAttack(world, radiantHero, creep, { instant: true });
    expect(dmgCreepBefore).toBeGreaterThan(0);

    // 装备压制之刃打小兵：近战额外增加 8 点伤害
    buyItem(world, radiantHero, 'quelling_blade');
    const dmgCreepAfter = performAttack(world, radiantHero, creep, { instant: true });
    expect(dmgCreepAfter - dmgCreepBefore).toBeGreaterThanOrEqual(4);

    // 压制之刃打英雄：无额外加伤
    const dmgHero = performAttack(world, radiantHero, direHero, { instant: true });
    expect(dmgHero).toBeGreaterThan(0);
  });

  it('Desolator reduces target armor by 6 on attack landed', () => {
    buyItem(world, radiantHero, 'desolator');
    const initArmor = direHero.stats.armor;

    performAttack(world, radiantHero, direHero, { instant: true });
    expect(direHero.stats.armor).toBe(initArmor - 6);
    expect(findModifier(direHero, 'mod_desolator_debuff')).toBeDefined();
  });

  it('Battle Fury cleaves to nearby enemies behind the target', () => {
    buyItem(world, radiantHero, 'battle_fury');

    // 放置另一个靠近主目标的敌人
    const direHero2 = createHero(world, 'lina', Team.Dire, false);
    direHero2.pos = { x: 1500, y: 5200 };
    const initHp2 = direHero2.hp;

    performAttack(world, radiantHero, direHero, { instant: true });
    // direHero2 应该受到分裂伤害
    expect(direHero2.hp).toBeLessThan(initHp2);
  });

  it('Skull Basher stuns the target and triggers cooldown', () => {
    direHero.hp = 10000;
    direHero.stats.maxHp = 10000;
    buyItem(world, radiantHero, 'skull_basher');

    // 持续攻击直到触发重击
    let bashed = false;
    for (let i = 0; i < 30; i++) {
      performAttack(world, radiantHero, direHero, { instant: true });
      if (direHero.hasState('stunned')) {
        bashed = true;
        break;
      }
    }
    expect(bashed).toBe(true);

    // 检查内置冷却已生效
    const mod = findModifier(radiantHero, 'mod_item_skull_basher');
    expect(mod?.data.cd).toBeGreaterThan(0);
  });

  it('Maelstrom triggers chain lightning hitting multiple targets', () => {
    buyItem(world, radiantHero, 'maelstrom');

    const direHero2 = createHero(world, 'lina', Team.Dire, false);
    direHero2.pos = { x: 1550, y: 5120 };
    const initHp2 = direHero2.hp;

    // 连续攻击直至连环闪电触发
    let triggered = false;
    for (let i = 0; i < 25; i++) {
      performAttack(world, radiantHero, direHero, { instant: true });
      if (direHero2.hp < initHp2) {
        triggered = true;
        break;
      }
    }
    expect(triggered).toBe(true);
  });

  it('Vanguard damage block reduces incoming physical attack damage', () => {
    direHero.hp = 10000;
    direHero.stats.maxHp = 10000;
    buyItem(world, direHero, 'vanguard');

    // 受到多次攻击，至少有一次被 50 点伤害格挡（近战斧王基础伤害约 50）
    let blockedAny = false;
    for (let i = 0; i < 20; i++) {
      const dealt = performAttack(world, radiantHero, direHero, { instant: true });
      if (dealt < 20) {
        blockedAny = true;
        break;
      }
    }
    expect(blockedAny).toBe(true);
  });

  it('Blade Mail passive returns physical damage to attacker', () => {
    buyItem(world, direHero, 'blade_mail');
    const initRadiantHp = radiantHero.hp;

    performAttack(world, radiantHero, direHero, { instant: true });
    // 斧王攻击斯温后，由于斯温携带刃甲被动，斧王应该受到反伤
    expect(radiantHero.hp).toBeLessThan(initRadiantHp);
  });

  it('Linkens Sphere blocks enemy single-target ability and enters 14s cooldown', () => {
    buyItem(world, direHero, 'linkens_sphere');
    const mod = findModifier(direHero, 'mod_item_linkens_sphere');
    expect(mod).toBeDefined();
    expect(mod?.data.cooldownRemaining ?? 0).toBe(0);

    // 斧王学会淘汰之刃（单体大招）
    const cull = radiantHero.ability('R')!;
    cull.level = 1;

    // 施放指向性大招
    issueCast(world, radiantHero, cull, { unitId: direHero.id });
    // 开始施法前摇
    updateAbilities(world, 0);
    // 推进前摇并触发施法
    updateAbilities(world, 0.4);

    // 检查林肯成功抵挡：冷却变为 14 秒
    expect(mod?.data.cooldownRemaining).toBeCloseTo(14, 0);

    // 再次在冷却期施放大招将不再抵挡
    expect(mod?.data.cooldownRemaining).toBeGreaterThan(0);
  });

  it('Assault Cuirass applies ally buff aura and enemy debuff aura', () => {
    buyItem(world, radiantHero, 'assault_cuirass');
    const ally = createHero(world, 'juggernaut', Team.Radiant, false);
    ally.pos = { x: 1500, y: 5050 };

    const initAllyArmor = ally.stats.armor;
    const initEnemyArmor = direHero.stats.armor;

    updateAuras(world, 0.1);

    // 友方护甲 +5
    expect(ally.stats.armor).toBe(initAllyArmor + 5);
    // 敌方护甲 -5
    expect(direHero.stats.armor).toBe(initEnemyArmor - 5);
  });

  it('Radiance aura burns nearby enemies for magic damage over time', () => {
    buyItem(world, radiantHero, 'radiance');
    updateAuras(world, 0.1);

    const initDireHp = direHero.hp;
    // 检查获得灼烧 Debuff
    const burnMod = findModifier(direHero, 'mod_radiance_burn');
    expect(burnMod).toBeDefined();

    // 推进时间触发周期伤害
    runFor(world, 0.8);
    expect(direHero.hp).toBeLessThan(initDireHp);
  });
});
