import { describe, it, expect } from 'vitest';
import { makeWorld } from '../helpers';
import { createHero } from '../../src/sim/systems/heroes';
import { Team } from '../../src/sim/core/types';
import {
  Rune, pickupRune, updateRunes,
  MOD_RUNE_DD, MOD_RUNE_HASTE, MOD_RUNE_REGEN, MOD_RUNE_INVIS, MOD_RUNE_ARCANE,
} from '../../src/sim/entities/rune';
import { findModifier } from '../../src/sim/modifiers';
import { recomputeStats } from '../../src/sim/stats';
import { abilityCooldown, abilityManaCost } from '../../src/sim/systems/abilities';
import { applyDamage } from '../../src/sim/systems/damage';

describe('Rune System', () => {
  it('spawns power and bounty runes at 120s at defined river spots', () => {
    const w = makeWorld(1);
    w.time = 119;
    updateRunes(w, 1);
    expect(w.runes).toHaveLength(0);

    w.time = 120;
    updateRunes(w, 1);
    expect(w.runes).toHaveLength(2);

    const east = w.runes.find((r) => r.spotId === 'east_power');
    const west = w.runes.find((r) => r.spotId === 'west_bounty');
    expect(east).toBeDefined();
    expect(west).toBeDefined();
    expect(west!.type).toBe('bounty');
    expect(['double_damage', 'haste', 'regen', 'invis', 'arcane']).toContain(east!.type);
  });

  it('replaces unpicked runes at the next 2-minute interval', () => {
    const w = makeWorld(1);
    w.time = 120;
    updateRunes(w, 1);
    const firstRunes = [...w.runes];
    expect(firstRunes).toHaveLength(2);

    // 到达 240s (4:00) 刷新周期
    w.time = 240;
    updateRunes(w, 1);
    expect(w.runes).toHaveLength(2);
    // 旧神符被替换，具有新的 ID
    expect(w.runes.map((r) => r.id)).not.toEqual(firstRunes.map((r) => r.id));
  });

  it('auto-picks up rune when hero enters pickup radius', () => {
    const w = makeWorld(1);
    const hero = createHero(w, 'axe', Team.Radiant, true);
    hero.pos = { x: 1800, y: 5000 };

    const rune = new Rune(w.allocId(), 'haste', { x: 1810, y: 5000 }, 'east_power', w.time);
    w.runes.push(rune);

    updateRunes(w, 0.1);
    expect(w.runes).toHaveLength(0); // 拾取后从地图移除
    expect(findModifier(hero, MOD_RUNE_HASTE.id)).toBeDefined();
  });

  it('Double Damage rune doubles hero base damage', () => {
    const w = makeWorld(1);
    const hero = createHero(w, 'sven', Team.Radiant, true);
    recomputeStats(w, hero);
    const normalDmgMin = hero.stats.damageMin;

    const rune = new Rune(w.allocId(), 'double_damage', hero.pos, 'east_power', w.time);
    pickupRune(w, rune, hero);
    recomputeStats(w, hero);

    expect(findModifier(hero, MOD_RUNE_DD.id)).toBeDefined();
    expect(hero.stats.damageMin).toBeCloseTo(normalDmgMin * 2, 1);
  });

  it('Haste rune sets movespeed to 550 and slow resist to 1.0', () => {
    const w = makeWorld(1);
    const hero = createHero(w, 'axe', Team.Radiant, true);
    recomputeStats(w, hero);

    const rune = new Rune(w.allocId(), 'haste', hero.pos, 'east_power', w.time);
    pickupRune(w, rune, hero);
    recomputeStats(w, hero);

    expect(findModifier(hero, MOD_RUNE_HASTE.id)).toBeDefined();
    expect(hero.stats.moveSpeed).toBe(550);
    expect(hero.stats.slowResist).toBe(1.0);
  });

  it('Regen rune restores HP and Mana, and is cancelled on hero damage', () => {
    const w = makeWorld(1);
    const hero = createHero(w, 'axe', Team.Radiant, true);
    hero.hp = 200;
    hero.mana = 50;

    const rune = new Rune(w.allocId(), 'regen', hero.pos, 'east_power', w.time);
    pickupRune(w, rune, hero);

    const mod = findModifier(hero, MOD_RUNE_REGEN.id);
    expect(mod).toBeDefined();

    // 触发回复 interval
    MOD_RUNE_REGEN.onInterval!(mod!, hero, w);
    expect(hero.hp).toBeGreaterThan(200);
    expect(hero.mana).toBeGreaterThan(50);

    // 受到敌方英雄伤害打断
    const enemy = createHero(w, 'lina', Team.Dire, false);
    applyDamage(w, {
      source: enemy,
      target: hero,
      amount: 50,
      type: 'magical',
      isAttack: false,
    });

    expect(findModifier(hero, MOD_RUNE_REGEN.id)).toBeUndefined();
  });

  it('Invis rune grants hidden state, broken upon attack or spellcast', () => {
    const w = makeWorld(1);
    const hero = createHero(w, 'phantom_assassin', Team.Radiant, true);

    const rune = new Rune(w.allocId(), 'invis', hero.pos, 'east_power', w.time);
    pickupRune(w, rune, hero);
    recomputeStats(w, hero);

    expect(hero.hasState('hidden')).toBe(true);

    // 发起技能施放打破隐身
    const mod = findModifier(hero, MOD_RUNE_INVIS.id);
    expect(mod).toBeDefined();
    MOD_RUNE_INVIS.onAbilityCast!(mod!, hero, 'pa_dagger', w);
    recomputeStats(w, hero);

    expect(hero.hasState('hidden')).toBe(false);
  });

  it('Arcane rune reduces cooldown and mana cost by 30%', () => {
    const w = makeWorld(1);
    const hero = createHero(w, 'lina', Team.Radiant, true);
    const q = hero.ability('Q')!;
    q.level = 1;

    const normalCd = abilityCooldown(q, hero);
    const normalCost = abilityManaCost(q, hero);

    const rune = new Rune(w.allocId(), 'arcane', hero.pos, 'east_power', w.time);
    pickupRune(w, rune, hero);

    expect(findModifier(hero, MOD_RUNE_ARCANE.id)).toBeDefined();
    expect(abilityCooldown(q, hero)).toBeCloseTo(normalCd * 0.7, 1);
    expect(abilityManaCost(q, hero)).toBeCloseTo(normalCost * 0.7, 1);
  });

  it('Bounty rune awards gold and XP to hero and teammates', () => {
    const w = makeWorld(1);
    const p1 = createHero(w, 'axe', Team.Radiant, true);
    const p2 = createHero(w, 'sven', Team.Radiant, false);
    w.time = 300; // 5分钟

    const p1GoldBefore = p1.hero!.gold;
    const p2GoldBefore = p2.hero!.gold;

    const rune = new Rune(w.allocId(), 'bounty', p1.pos, 'west_bounty', w.time);
    pickupRune(w, rune, p1);

    expect(p1.hero!.gold).toBe(p1GoldBefore + 100 + 5 * 5); // 125
    expect(p2.hero!.gold).toBe(p2GoldBefore + 50 + 5 * 3);  // 65
  });
});
