import { describe, it, expect, beforeEach } from 'vitest';
import { World } from '../../src/sim/world';
import { Unit } from '../../src/sim/entities/unit';
import { Team } from '../../src/sim/core/types';
import { buyItem, sellItem } from '../../src/sim/items/inventory';
import { applyCommand } from '../../src/sim/commands';
import { createHero } from '../../src/sim/systems/heroes';

describe('Inventory & Economy System', () => {
  let world: World;
  let hero: Unit;

  beforeEach(() => {
    world = new World({ seed: 1, recordEvents: true, spawnCreeps: false });
    hero = createHero(world, 'axe', Team.Radiant, true);
    hero.hero!.gold = 10000;
  });

  it('buys a simple basic item, deducts gold, and applies stats', () => {
    const initGold = hero.hero!.gold;
    const initStr = hero.stats.str;

    // 购买力量手套（只加 3 力量，不加敏捷因此不触发展一人之军的敏捷护甲换力量机制）
    const res = buyItem(world, hero, 'gauntlets_of_strength');
    expect(res.success).toBe(true);

    expect(hero.hero!.gold).toBe(initGold - 140);
    expect(hero.getItem(0)?.id).toBe('gauntlets_of_strength');
    expect(hero.stats.str).toBe(initStr + 3);
    expect(hero.hero!.itemValue).toBe(140);
  });

  it('stacks consumables in the same slot without using extra slots', () => {
    const initGold = hero.hero!.gold;

    const res1 = buyItem(world, hero, 'tango');
    expect(res1.success).toBe(true);
    expect(hero.getItem(0)?.id).toBe('tango');
    expect(hero.getItem(0)?.charges).toBe(3);
    expect(hero.getItem(1)).toBeNull();

    const res2 = buyItem(world, hero, 'tango');
    expect(res2.success).toBe(true);
    expect(hero.getItem(0)?.charges).toBe(6);
    expect(hero.getItem(1)).toBeNull(); // 依然只占 1 个槽位
    expect(hero.hero!.gold).toBe(initGold - 180);
  });

  it('buys a finished item directly and places it in one slot', () => {
    const initGold = hero.hero!.gold;
    const res = buyItem(world, hero, 'black_king_bar');
    expect(res.success).toBe(true);

    expect(hero.getItem(0)?.id).toBe('black_king_bar');
    expect(hero.hero!.gold).toBe(initGold - 4050);
    expect(hero.hero!.itemValue).toBe(4050);
    expect(hero.stats.str).toBeGreaterThan(0);
    expect(hero.stats.bonusDamage).toBe(24);
  });

  it('auto-combines existing components when buying finished item', () => {
    // 先买散件秘银锤 (1600)
    buyItem(world, hero, 'mithril_hammer');
    expect(hero.getItem(0)?.id).toBe('mithril_hammer');
    const goldAfterHammer = hero.hero!.gold;

    // 再买 BKB：应该只需支付 1000(斧)+1450(卷轴) = 2450 金
    const res = buyItem(world, hero, 'black_king_bar');
    expect(res.success).toBe(true);

    expect(hero.hero!.gold).toBe(goldAfterHammer - 2450);
    expect(hero.getItem(0)?.id).toBe('black_king_bar');
    expect(hero.getItem(1)).toBeNull();
  });

  it('auto-combines 0-recipeCost items automatically when all components are gathered', () => {
    // 动力鞋 = 假腿：草鞋(500) + 手套(450) + 力量腰带(450) = 1400，无卷轴
    buyItem(world, hero, 'boots_of_speed');
    buyItem(world, hero, 'gloves_of_haste');
    expect(hero.getItem(0)?.id).toBe('boots_of_speed');
    expect(hero.getItem(1)?.id).toBe('gloves_of_haste');

    // 买入最后一件
    buyItem(world, hero, 'belt_of_strength');

    // 应该自动合并成动力鞋并放在第 0 格，第 1、2 格清空
    expect(hero.getItem(0)?.id).toBe('power_treads');
    expect(hero.getItem(1)).toBeNull();
    expect(hero.getItem(2)).toBeNull();
  });

  it('supports 10-second full refund and 50% discount sell thereafter', () => {
    world.time = 100;
    buyItem(world, hero, 'broadsword'); // 1000 金
    expect(hero.hero!.gold).toBe(9000);

    // 5 秒后卖出 -> 100% 全额退款
    world.time = 105;
    const res1 = sellItem(world, hero, 0);
    expect(res1.success).toBe(true);
    expect(res1.refund).toBe(1000);
    expect(hero.hero!.gold).toBe(10000);
    expect(hero.getItem(0)).toBeNull();

    // 重新买入并在 15 秒后卖出 -> 50% 半价出售
    world.time = 120;
    buyItem(world, hero, 'broadsword');
    expect(hero.hero!.gold).toBe(9000);

    world.time = 140; // 过了 20 秒
    const res2 = sellItem(world, hero, 0);
    expect(res2.success).toBe(true);
    expect(res2.refund).toBe(500);
    expect(hero.hero!.gold).toBe(9500);
  });

  it('handles Aghanim Shard unlock time and consumption without inventory slot', () => {
    hero.hero!.gold = 2000;

    // 480秒前购买被锁
    world.time = 100;
    const resEarly = buyItem(world, hero, 'aghanims_shard');
    expect(resEarly.success).toBe(false);
    expect(resEarly.reason).toBe('shard_locked');

    // 480秒后购买成功
    world.time = 500;
    const resOk = buyItem(world, hero, 'aghanims_shard');
    expect(resOk.success).toBe(true);
    expect(hero.hero!.hasShard).toBe(true);
    expect(hero.hero!.gold).toBe(600);
    expect(hero.getItem(0)).toBeNull(); // 不占背包格子！

    // 不能重复购买
    const resDup = buyItem(world, hero, 'aghanims_shard');
    expect(resDup.success).toBe(false);
    expect(resDup.reason).toBe('already_have_shard');
  });

  it('rejects purchase when inventory is full and cannot combine', () => {
    // 填满 6 个格子
    for (let i = 0; i < 6; i++) {
      buyItem(world, hero, 'gauntlets_of_strength');
    }
    expect(hero.inventory.every((s) => s !== null)).toBe(true);

    // 尝试购买第 7 件基础件 -> 失败
    const res = buyItem(world, hero, 'slippers_of_agility');
    expect(res.success).toBe(false);
    expect(res.reason).toBe('inventory_full');
  });

  it('integrates with applyCommand for buy and sell', () => {
    const initGold = hero.hero!.gold;
    applyCommand(world, hero, { type: 'buy', itemId: 'circlet' });
    expect(hero.getItem(0)?.id).toBe('circlet');
    expect(hero.hero!.gold).toBe(initGold - 155);

    applyCommand(world, hero, { type: 'sell', index: 0 });
    expect(hero.getItem(0)).toBeNull();
    expect(hero.hero!.gold).toBe(initGold);
  });
});
