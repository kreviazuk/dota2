import { describe, it, expect, beforeEach } from 'vitest';
import { World } from '../../src/sim/world';
import { Unit } from '../../src/sim/entities/unit';
import { Team } from '../../src/sim/core/types';
import { createHero } from '../../src/sim/systems/heroes';
import { buyItem } from '../../src/sim/items/inventory';
import { useItem } from '../../src/sim/items/actives';
import { performAttack } from '../../src/sim/systems/attack';
import { applyDamage } from '../../src/sim/systems/damage';
import { addModifier, findModifier } from '../../src/sim/modifiers';
import { issueCast, updateAbilities } from '../../src/sim/systems/abilities';
import { runFor } from '../helpers';

describe('Active Items & UseItem Command', () => {
  let world: World;
  let radiantHero: Unit;
  let direHero: Unit;

  beforeEach(() => {
    world = new World({ seed: 42, recordEvents: true, spawnCreeps: false });
    radiantHero = createHero(world, 'axe', Team.Radiant, true);
    radiantHero.pos = { x: 1500, y: 5000 };
    radiantHero.hero!.gold = 50000;

    direHero = createHero(world, 'sven', Team.Dire, false);
    direHero.pos = { x: 1500, y: 5100 };
    direHero.hero!.gold = 50000;
  });

  it('Black King Bar grants debuff immunity, dispels debuffs, and scales duration', () => {
    buyItem(world, radiantHero, 'black_king_bar');
    const slot = radiantHero.findItemSlot('black_king_bar');
    expect(slot).toBeGreaterThanOrEqual(0);

    // 先施加一个可弱驱散的减益
    addModifier(world, radiantHero, {
      id: 'test_slow',
      name: '减速测试',
      debuff: true,
      dispel: 'weak',
      stats: { moveSpeedPct: -0.5 },
    });
    expect(findModifier(radiantHero, 'test_slow')).toBeDefined();

    // 首次开启 BKB：弱驱散生效，获得减益免疫，持续 9 秒
    const used1 = useItem(world, radiantHero, slot);
    expect(used1).toBe(true);
    expect(findModifier(radiantHero, 'test_slow')).toBeUndefined();
    expect(radiantHero.hasState('debuffImmune')).toBe(true);

    const mod = findModifier(radiantHero, 'mod_item_bkb_active');
    expect(mod).toBeDefined();
    expect(mod?.duration).toBeCloseTo(9, 0);

    // 冷却完毕后第 2 次开启持续 8 秒
    radiantHero.inventory[slot]!.cooldownRemaining = 0;
    useItem(world, radiantHero, slot);
    expect(findModifier(radiantHero, 'mod_item_bkb_active')?.duration).toBeCloseTo(8, 0);

    // 第 3 次开启持续 7 秒
    radiantHero.inventory[slot]!.cooldownRemaining = 0;
    useItem(world, radiantHero, slot);
    expect(findModifier(radiantHero, 'mod_item_bkb_active')?.duration).toBeCloseTo(7, 0);
  });

  it('Blink Dagger teleports unit and enters 3s cooldown when damaged by enemy hero', () => {
    buyItem(world, radiantHero, 'blink_dagger');
    const slot = radiantHero.findItemSlot('blink_dagger');
    expect(slot).toBeGreaterThanOrEqual(0);

    // 瞬移到目标点 (1500, 5600)
    const success = useItem(world, radiantHero, slot, { point: { x: 1500, y: 5600 } });
    expect(success).toBe(true);
    expect(radiantHero.pos.y).toBeCloseTo(5600, 0);

    // 刷新冷却以测试受击禁用
    radiantHero.inventory[slot]!.cooldownRemaining = 0;

    // 受到敌方英雄伤害
    applyDamage(world, {
      source: direHero,
      target: radiantHero,
      amount: 50,
      type: 'physical',
      isAttack: true,
    });

    // 跳刀应当进入至少 3 秒冷却
    expect(radiantHero.inventory[slot]!.cooldownRemaining).toBeGreaterThanOrEqual(3.0);

    // 处于冷却中时无法使用
    const failedUse = useItem(world, radiantHero, slot, { point: { x: 1500, y: 5000 } });
    expect(failedUse).toBe(false);
  });

  it('Blade Mail active reflects 100% damage back to attacker', () => {
    buyItem(world, radiantHero, 'blade_mail');
    const slot = radiantHero.findItemSlot('blade_mail');
    useItem(world, radiantHero, slot);

    const initDireHp = direHero.hp;
    // 敌方攻击开启了刃甲的斧王
    performAttack(world, direHero, radiantHero, { instant: true });

    // 斯温应该受到全额伤害反弹
    expect(direHero.hp).toBeLessThan(initDireHp);
  });

  it('Force Staff pushes target 600 units along facing direction', () => {
    buyItem(world, radiantHero, 'force_staff');
    const slot = radiantHero.findItemSlot('force_staff');

    radiantHero.facing = Math.PI / 2; // 朝向正 Y 方向（沿兵线）
    const initY = radiantHero.pos.y;

    useItem(world, radiantHero, slot, { unitId: radiantHero.id });
    expect(radiantHero.motion?.kind).toBe('force_staff');

    // 推进 0.45 秒完成位移
    runFor(world, 0.45);
    expect(radiantHero.pos.y).toBeCloseTo(initY + 600, -1);
  });

  it('Euls Scepter lifts unit into invulnerable cyclone and damages enemies on land', () => {
    buyItem(world, radiantHero, 'euls_scepter');
    const slot = radiantHero.findItemSlot('euls_scepter');

    const initHp = direHero.hp;
    // 对敌方施放风杖
    useItem(world, radiantHero, slot, { unitId: direHero.id });

    // 处于旋风中：无敌
    expect(direHero.hasState('invulnerable')).toBe(true);

    // 推进 2.6 秒落地
    runFor(world, 2.6);
    expect(direHero.hasState('invulnerable')).toBe(false);
    // 落地受到 50 点魔法伤害（扣除基础魔抗后仍掉血）
    expect(direHero.hp).toBeLessThan(initHp);
  });

  it('Phase Boots grants 20% move speed and phased state', () => {
    buyItem(world, radiantHero, 'phase_boots');
    const slot = radiantHero.findItemSlot('phase_boots');
    const initMs = radiantHero.stats.moveSpeed;

    useItem(world, radiantHero, slot);
    expect(radiantHero.hasState('phased')).toBe(true);
    expect(radiantHero.stats.moveSpeed).toBeGreaterThan(initMs);
  });

  it('Power Treads toggles attributes instantly with no cooldown', () => {
    buyItem(world, direHero, 'power_treads');
    const slot = direHero.findItemSlot('power_treads');

    const baseAgi = direHero.stats.agi;
    const baseInt = direHero.stats.int;

    // 初始力量脚：敏捷与智力为基准值
    // 切换到敏捷：敏捷 +10
    useItem(world, direHero, slot);
    expect(direHero.inventory[slot]?.selectedStat).toBe('agi');
    expect(direHero.stats.agi).toBe(baseAgi + 10);

    // 切换到智力：智力 +10
    useItem(world, direHero, slot);
    expect(direHero.inventory[slot]?.selectedStat).toBe('int');
    expect(direHero.stats.int).toBe(baseInt + 10);
    expect(direHero.stats.agi).toBe(baseAgi);

    // 切换回力量
    useItem(world, direHero, slot);
    expect(direHero.inventory[slot]?.selectedStat).toBe('str');
    expect(direHero.stats.int).toBe(baseInt);
  });

  it('Mekansm and Arcane Boots restore HP and mana to nearby allies', () => {
    buyItem(world, radiantHero, 'mekansm');
    buyItem(world, radiantHero, 'arcane_boots');

    const mekSlot = radiantHero.findItemSlot('mekansm');
    const arcaneSlot = radiantHero.findItemSlot('arcane_boots');

    // 创造一个血蓝不满的友方英雄
    const ally = createHero(world, 'juggernaut', Team.Radiant, false);
    ally.pos = { x: 1550, y: 5050 };
    ally.hp = 200;
    ally.mana = 50;

    useItem(world, radiantHero, mekSlot);
    expect(ally.hp).toBe(450); // +250 hp
    expect(findModifier(ally, 'mod_item_mekansm_armor')).toBeDefined();

    useItem(world, radiantHero, arcaneSlot);
    expect(ally.mana).toBe(225); // +175 mana
  });

  it('Heaven Halberd disarms target and Abyssal Blade stuns target', () => {
    buyItem(world, radiantHero, 'heaven_halberd');
    buyItem(world, radiantHero, 'abyssal_blade');

    const halberdSlot = radiantHero.findItemSlot('heaven_halberd');
    const abyssalSlot = radiantHero.findItemSlot('abyssal_blade');

    useItem(world, radiantHero, halberdSlot, { unitId: direHero.id });
    expect(direHero.hasState('disarmed')).toBe(true);

    useItem(world, radiantHero, abyssalSlot, { unitId: direHero.id });
    expect(direHero.hasState('stunned')).toBe(true);
  });

  it('Armlet of Mordiggian toggles on (+stats, non-lethal drain) and off', () => {
    buyItem(world, radiantHero, 'armlet_of_mordiggian');
    const slot = radiantHero.findItemSlot('armlet_of_mordiggian');

    const initDmg = radiantHero.stats.damageMax;
    // 开启臂章
    useItem(world, radiantHero, slot);
    expect(findModifier(radiantHero, 'mod_item_armlet_active')).toBeDefined();
    expect(radiantHero.stats.damageMax).toBeGreaterThan(initDmg);

    // 推进一段时间，血量应持续衰减但不致死
    const prevHp = radiantHero.hp;
    runFor(world, 1.0);
    expect(radiantHero.hp).toBeLessThan(prevHp);
    expect(radiantHero.hp).toBeGreaterThanOrEqual(1);

    // 关闭臂章
    useItem(world, radiantHero, slot);
    expect(findModifier(radiantHero, 'mod_item_armlet_active')).toBeUndefined();
  });

  it('Magic Wand gains charges when nearby enemy casts abilities and restores HP/mana', () => {
    buyItem(world, radiantHero, 'magic_wand');
    const slot = radiantHero.findItemSlot('magic_wand');
    expect(radiantHero.inventory[slot]?.charges ?? 0).toBe(0);

    // 敌方斯温学会风暴之拳并施放
    const bolt = direHero.ability('Q')!;
    bolt.level = 1;
    issueCast(world, direHero, bolt, { unitId: radiantHero.id });
    updateAbilities(world, 0);
    updateAbilities(world, 0.4);

    // 斧王的魔杖应获得 1 层充能
    expect(radiantHero.inventory[slot]?.charges).toBe(1);

    // 消耗充能回复
    radiantHero.hp = 300;
    radiantHero.mana = 50;
    useItem(world, radiantHero, slot);

    expect(radiantHero.inventory[slot]?.charges).toBe(0);
    expect(radiantHero.hp).toBe(315);
    expect(radiantHero.mana).toBe(65);
  });

  it('Consumables restore HP/mana and are removed when empty', () => {
    buyItem(world, radiantHero, 'enchanted_mango');
    buyItem(world, radiantHero, 'faerie_fire');

    const mangoSlot = radiantHero.findItemSlot('enchanted_mango');
    expect(mangoSlot).toBeGreaterThanOrEqual(0);

    radiantHero.mana = 20;
    useItem(world, radiantHero, mangoSlot);

    // 魔法增加 100，并且物品用尽被移除
    expect(radiantHero.mana).toBe(120);
    expect(radiantHero.inventory[mangoSlot]).toBeNull();

    const ffSlot = radiantHero.findItemSlot('faerie_fire');
    expect(ffSlot).toBeGreaterThanOrEqual(0);

    radiantHero.hp = 200;
    useItem(world, radiantHero, ffSlot);

    expect(radiantHero.hp).toBe(285);
    expect(radiantHero.inventory[ffSlot]).toBeNull();
  });
});
