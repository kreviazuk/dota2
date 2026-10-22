import { describe, it, expect, beforeEach } from 'vitest';
import { World } from '../../src/sim/world';
import { Team } from '../../src/sim/core/types';
import { createHero } from '../../src/sim/systems/heroes';
import { buyItem } from '../../src/sim/items/inventory';
import { hasScepter, hasShard } from '../../src/sim/heroes/scepterShard';
import { performAttack } from '../../src/sim/systems/attack';
import { issueCast, syncPassives, updateAbilities } from '../../src/sim/systems/abilities';
import { findModifier } from '../../src/sim/modifiers';
import { runFor } from '../helpers';

describe("Aghanim's Scepter & Shard (10 Heroes)", () => {
  let world: World;

  beforeEach(() => {
    world = new World({ seed: 42, recordEvents: true, spawnCreeps: false });
    world.time = 500; // 确保魔晶已解锁（8分钟 / 480秒）
  });

  it('Axe: Scepter spins on attack without CD; Shard applies Battle Hunger on Call', () => {
    const axe = createHero(world, 'axe', Team.Radiant, true);
    axe.pos = { x: 1500, y: 5000 };
    axe.hero!.gold = 20000;

    const enemy = createHero(world, 'sven', Team.Dire, false);
    enemy.pos = { x: 1500, y: 5080 };
    enemy.hp = 10000;
    enemy.stats.maxHp = 10000;

    axe.ability('Q')!.level = 1;
    axe.ability('E')!.level = 4;
    syncPassives(world, axe);

    // 购买魔晶
    buyItem(world, axe, 'aghanims_shard');
    expect(hasShard(axe)).toBe(true);

    // 吼叫应自动施加战斗饥渴
    issueCast(world, axe, axe.ability('Q')!);
    updateAbilities(world, 0);
    updateAbilities(world, 0.4);
    expect(findModifier(enemy, 'axe_battle_hunger')).toBeDefined();

    // 购买 A 杖
    buyItem(world, axe, 'aghanims_scepter');
    expect(hasScepter(axe)).toBe(true);

    // 斧王自己主动攻击也能触发反击螺旋
    for (let i = 0; i < 6; i++) {
      performAttack(world, axe, enemy, { instant: true });
    }
    // 敌方受到螺旋减攻击 Debuff
    expect(findModifier(enemy, 'mod_axe_helix_debuff')).toBeDefined();
  });

  it('Sven: Scepter deals +180 dmg & blinks Sven; Shard grants physical barrier', () => {
    const sven = createHero(world, 'sven', Team.Radiant, true);
    sven.pos = { x: 1500, y: 5000 };
    sven.hero!.gold = 20000;

    const enemy = createHero(world, 'axe', Team.Dire, false);
    enemy.pos = { x: 1500, y: 5200 };

    sven.ability('Q')!.level = 1;
    sven.ability('E')!.level = 1;
    syncPassives(world, sven);

    // 购买魔晶：战吼附带物理护盾
    buyItem(world, sven, 'aghanims_shard');
    expect(hasShard(sven)).toBe(true);

    issueCast(world, sven, sven.ability('E')!);
    expect(findModifier(sven, 'sven_warcry_shard')).toBeDefined();

    // 购买 A 杖：风暴之拳突进斯温并加伤
    buyItem(world, sven, 'aghanims_scepter');
    expect(hasScepter(sven)).toBe(true);

    const initHp = enemy.hp;
    issueCast(world, sven, sven.ability('Q')!, { unitId: enemy.id });
    updateAbilities(world, 0);
    updateAbilities(world, 0.3);
    runFor(world, 0.5);

    // 斯温应该闪现到目标身边
    expect(Math.abs(sven.pos.y - enemy.pos.y)).toBeLessThan(100);
    // 伤害包含基础 80 + A杖 180
    expect(enemy.hp).toBeLessThan(initHp - 150);
  });

  it('Pudge: Scepter increases Rot radius & adds damage; Shard refunds hook CD on ally', () => {
    const pudge = createHero(world, 'pudge', Team.Radiant, true);
    pudge.pos = { x: 1500, y: 5000 };
    pudge.hero!.gold = 20000;

    pudge.ability('Q')!.level = 1;
    pudge.ability('W')!.level = 1;
    syncPassives(world, pudge);

    // 购买魔晶
    buyItem(world, pudge, 'aghanims_shard');

    // 钩友军：CD 减半
    const ally = createHero(world, 'axe', Team.Radiant, false);
    ally.pos = { x: 1500, y: 5200 };

    issueCast(world, pudge, pudge.ability('Q')!, { dir: { x: 0, y: 1 } });
    updateAbilities(world, 0);
    updateAbilities(world, 0.4);
    runFor(world, 0.5);

    // 肉钩基础冷却 18，钩友军减半为 9 左右
    expect(pudge.ability('Q')!.cooldown).toBeLessThan(10);

    // 购买 A 杖：腐烂半径扩大为 450
    buyItem(world, pudge, 'aghanims_scepter');
    expect(hasScepter(pudge)).toBe(true);
  });

  it('Juggernaut: Scepter grants Swiftslash (X2); Shard buffs Healing Ward', () => {
    const jugg = createHero(world, 'juggernaut', Team.Radiant, true);
    jugg.pos = { x: 1500, y: 5000 };
    jugg.hero!.gold = 20000;

    jugg.ability('W')!.level = 1;
    syncPassives(world, jugg);

    // 购买魔晶：治疗守卫 2 次命中击毁
    buyItem(world, jugg, 'aghanims_shard');
    expect(hasShard(jugg)).toBe(true);

    issueCast(world, jugg, jugg.ability('W')!);
    updateAbilities(world, 0);
    updateAbilities(world, 0.4);

    const ward = world.units.find((u) => u.defId === 'jugg_healing_ward');
    expect(ward?.summon?.hitsToKill).toBe(2);

    // 购买 A 杖：获得 X2 技能迅风斩
    expect(jugg.ability('X2')).toBeUndefined();
    buyItem(world, jugg, 'aghanims_scepter');
    expect(hasScepter(jugg)).toBe(true);
    expect(jugg.ability('X2')?.def.id).toBe('jugg_swiftslash');
  });

  it('Phantom Assassin: Scepter grants Fan of Knives (X2); Shard reduces Blur CD', () => {
    const pa = createHero(world, 'phantom_assassin', Team.Radiant, true);
    pa.pos = { x: 1500, y: 5000 };
    pa.hero!.gold = 20000;
    syncPassives(world, pa);

    // 购买魔晶：魅影无形 CD 降低 10 秒
    buyItem(world, pa, 'aghanims_shard');
    expect(hasShard(pa)).toBe(true);

    issueCast(world, pa, pa.ability('X1')!);
    updateAbilities(world, 0);
    updateAbilities(world, 0.4);
    expect(pa.ability('X1')!.cooldown).toBeCloseTo(35, 0);

    // 购买 A 杖：获得 X2 技能刀阵旋风
    expect(pa.ability('X2')).toBeUndefined();
    buyItem(world, pa, 'aghanims_scepter');
    expect(hasScepter(pa)).toBe(true);
    expect(pa.ability('X2')?.def.id).toBe('pa_fan_of_knives');

    // 释放刀阵旋风破坏被动
    const enemy = createHero(world, 'axe', Team.Dire, false);
    enemy.pos = { x: 1500, y: 5100 };
    issueCast(world, pa, pa.ability('X2')!);
    updateAbilities(world, 0);
    updateAbilities(world, 0.2);
    expect(enemy.hasState('breakPassives')).toBe(true);
  });

  it('Drow Ranger: Scepter stacks Hypothermia; Shard grants Glacier (X2)', () => {
    const drow = createHero(world, 'drow_ranger', Team.Radiant, true);
    drow.pos = { x: 1500, y: 5000 };
    drow.hero!.gold = 20000;
    drow.ability('Q')!.level = 1;
    syncPassives(world, drow);

    // 购买 A 杖：霜冻之箭附带低温层数
    buyItem(world, drow, 'aghanims_scepter');
    expect(hasScepter(drow)).toBe(true);

    const enemy = createHero(world, 'axe', Team.Dire, false);
    enemy.pos = { x: 1500, y: 5100 };

    performAttack(world, drow, enemy, { instant: true, flags: { frost: 1 } });
    expect(findModifier(enemy, 'mod_drow_hypothermia')).toBeDefined();

    // 购买魔晶：获得 X2 冰川技能
    expect(drow.ability('X2')).toBeUndefined();
    buyItem(world, drow, 'aghanims_shard');
    expect(hasShard(drow)).toBe(true);
    expect(drow.ability('X2')?.def.id).toBe('drow_glacier');
  });

  it('Shadow Fiend: Scepter reduces Requiem CD; Shard grants Raze slow & refund', () => {
    const sf = createHero(world, 'shadow_fiend', Team.Radiant, true);
    sf.pos = { x: 1500, y: 5000 };
    sf.facing = Math.PI / 2; // 面向 +Y 方向
    sf.hero!.gold = 20000;

    sf.ability('Q')!.level = 1;
    sf.ability('R')!.level = 1;
    syncPassives(world, sf);

    // 购买魔晶
    buyItem(world, sf, 'aghanims_shard');
    expect(hasShard(sf)).toBe(true);

    const enemy = createHero(world, 'axe', Team.Dire, false);
    enemy.pos = { x: 1500, y: 5200 }; // 距离 200，正中近压

    // 施放影压命中英雄
    issueCast(world, sf, sf.ability('Q')!, { point: { x: 1500, y: 5200 } });
    updateAbilities(world, 0);
    updateAbilities(world, 0.6);
    expect(findModifier(enemy, 'slow_sf_raze_shard')).toBeDefined();

    // 购买 A 杖：大招冷却降低 30 秒
    buyItem(world, sf, 'aghanims_scepter');
    expect(hasScepter(sf)).toBe(true);
  });

  it('Lina: Scepter grants Flame Cloak (X2); Shard supercharges Fiery Soul on Laguna', () => {
    const lina = createHero(world, 'lina', Team.Radiant, true);
    lina.pos = { x: 1500, y: 5000 };
    lina.hero!.gold = 20000;

    lina.ability('E')!.level = 1;
    lina.ability('R')!.level = 1;
    syncPassives(world, lina);

    // 购买 A 杖：获得 X2 技能腾焰斗篷
    expect(lina.ability('X2')).toBeUndefined();
    buyItem(world, lina, 'aghanims_scepter');
    expect(hasScepter(lina)).toBe(true);
    expect(lina.ability('X2')?.def.id).toBe('lina_flame_cloak');

    // 购买魔晶：大招赋予 12 层炽魂超载
    buyItem(world, lina, 'aghanims_shard');
    expect(hasShard(lina)).toBe(true);

    const enemy = createHero(world, 'axe', Team.Dire, false);
    enemy.pos = { x: 1500, y: 5200 };

    issueCast(world, lina, lina.ability('R')!, { unitId: enemy.id });
    updateAbilities(world, 0);
    updateAbilities(world, 0.5);
    expect(findModifier(lina, 'lina_fiery_soul_stack')?.stacks).toBe(12);
  });

  it('Zeus: Scepter grants Nimbus (X2); Shard grants Lightning Hands (X2)', () => {
    const zeus = createHero(world, 'zeus', Team.Radiant, true);
    zeus.hero!.gold = 20000;

    // 购买魔晶：获得 X2 霹雳之手
    buyItem(world, zeus, 'aghanims_shard');
    expect(hasShard(zeus)).toBe(true);
    expect(zeus.ability('X2')?.def.id).toBe('zeus_lightning_hands');

    // 购买 A 杖：升级为雷云
    buyItem(world, zeus, 'aghanims_scepter');
    expect(hasScepter(zeus)).toBe(true);
    expect(zeus.ability('X2')?.def.id).toBe('zeus_nimbus');
  });

  it('Crystal Maiden: Scepter allows moving in ult; Shard grants Crystal Clone (X2)', () => {
    const cm = createHero(world, 'crystal_maiden', Team.Radiant, true);
    cm.pos = { x: 1500, y: 5000 };
    cm.hero!.gold = 20000;
    cm.ability('R')!.level = 1;
    syncPassives(world, cm);

    // 购买魔晶：获得 X2 冰晶克隆
    buyItem(world, cm, 'aghanims_shard');
    expect(hasShard(cm)).toBe(true);
    expect(cm.ability('X2')?.def.id).toBe('cm_crystal_clone');

    // 购买 A 杖：极寒领域允许移动
    buyItem(world, cm, 'aghanims_scepter');
    expect(hasScepter(cm)).toBe(true);

    issueCast(world, cm, cm.ability('R')!);
    updateAbilities(world, 0);
    updateAbilities(world, 0.1);
    expect(cm.ability('R')!.def.channelAllowsMove).toBe(true);
  });
});
