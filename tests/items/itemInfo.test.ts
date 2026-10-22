import { describe, it, expect } from 'vitest';
import {
  ITEM_EN_NAMES,
  CATEGORY_LABELS,
  TARGET_TYPE_LABELS,
  getItemEnName,
  getBuildsInto,
  formatItemStats,
} from '../../src/sim/items/itemInfo';
import { ITEM_DEFINITIONS, getItemDef } from '../../src/sim/items/definitions';

describe('Item Info & Dota 2 Metadata', () => {
  it('every defined item has a non-empty English name', () => {
    for (const id of Object.keys(ITEM_DEFINITIONS)) {
      const en = getItemEnName(id);
      expect(en).toBeDefined();
      expect(en.length).toBeGreaterThan(0);
    }
  });

  it('correctly maps iconic Dota 2 items to their official English names', () => {
    expect(getItemEnName('black_king_bar')).toBe('Black King Bar');
    expect(getItemEnName('blink_dagger')).toBe('Blink Dagger');
    expect(getItemEnName('power_treads')).toBe('Power Treads');
    expect(getItemEnName('aghanims_scepter')).toBe("Aghanim's Scepter");
    expect(getItemEnName('aghanims_shard')).toBe("Aghanim's Shard");
    expect(getItemEnName('daedalus')).toBe('Daedalus');
    expect(getItemEnName('battle_fury')).toBe('Battle Fury');
    expect(getItemEnName('desolator')).toBe('Desolator');
    expect(getItemEnName('heart_of_tarrasque')).toBe('Heart of Tarrasque');
  });

  it('correctly identifies items that a component builds into', () => {
    // boots_of_speed should build into power_treads, phase_boots, tranquil_boots, arcane_boots
    const bootsUpgrades = getBuildsInto('boots_of_speed').map((it) => it.id);
    expect(bootsUpgrades).toContain('power_treads');
    expect(bootsUpgrades).toContain('phase_boots');
    expect(bootsUpgrades).toContain('tranquil_boots');
    expect(bootsUpgrades).toContain('arcane_boots');

    // ogre_axe builds into BKB, Sange, Aghanim Scepter
    const axeUpgrades = getBuildsInto('ogre_axe').map((it) => it.id);
    expect(axeUpgrades).toContain('black_king_bar');
    expect(axeUpgrades).toContain('sange');
    expect(axeUpgrades).toContain('aghanims_scepter');

    // Finished ultimate items don't build into anything
    expect(getBuildsInto('radiance')).toHaveLength(0);
  });

  it('formats stats with accurate classifications', () => {
    const pt = getItemDef('power_treads')!;
    const stats = formatItemStats(pt);
    expect(stats.length).toBeGreaterThan(0);
    expect(stats.some((s) => s.type === 'combat' && s.text.includes('攻击速度'))).toBe(true);

    const bkb = getItemDef('black_king_bar')!;
    const bkbStats = formatItemStats(bkb);
    expect(bkbStats.some((s) => s.type === 'str' && s.text.includes('力量'))).toBe(true);
    expect(bkbStats.some((s) => s.type === 'combat' && s.text.includes('攻击力'))).toBe(true);
  });

  it('provides category and target type labels', () => {
    expect(CATEGORY_LABELS['weapons']).toBe('武器输出');
    expect(CATEGORY_LABELS['defense']).toBe('防御大件');
    expect(TARGET_TYPE_LABELS['unit']).toContain('单位目标');
    expect(TARGET_TYPE_LABELS['point']).toContain('点目标');
    expect(TARGET_TYPE_LABELS['none']).toContain('无目标');
    expect(Object.keys(ITEM_EN_NAMES).length).toBeGreaterThan(50);
  });
});
