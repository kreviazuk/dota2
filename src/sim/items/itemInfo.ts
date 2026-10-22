import { ITEM_DEFINITIONS } from './definitions';
import type { ItemDef, ItemCategory } from './types';

/** 物品英文官方名称映射表（Dota 2 官方标准对应） */
export const ITEM_EN_NAMES: Record<string, string> = {
  // 消耗品
  tango: 'Tango',
  healing_salve: 'Healing Salve',
  clarity: 'Clarity',
  faerie_fire: 'Faerie Fire',
  enchanted_mango: 'Enchanted Mango',

  // 基础属性
  iron_branch: 'Iron Branch',
  gauntlets_of_strength: 'Gauntlets of Strength',
  slippers_of_agility: 'Slippers of Agility',
  mantle_of_intelligence: 'Mantle of Intelligence',
  circlet: 'Circlet',
  belt_of_strength: 'Belt of Strength',
  band_of_elvenskin: 'Band of Elvenskin',
  robe_of_the_magi: 'Robe of the Magi',
  crown: 'Crown',
  ogre_axe: 'Ogre Axe',
  blade_of_alacrity: 'Blade of Alacrity',
  staff_of_wizardry: 'Staff of Wizardry',
  diadem: 'Diadem',
  reaver: 'Reaver',
  eaglesong: 'Eaglesong',
  mystic_staff: 'Mystic Staff',
  ultimate_orb: 'Ultimate Orb',

  // 基础军械 / 配件
  quelling_blade: 'Quelling Blade',
  blades_of_attack: 'Blades of Attack',
  gloves_of_haste: 'Gloves of Haste',
  orb_of_blight: 'Orb of Blight',
  orb_of_venom: 'Orb of Venom',
  orb_of_frost: 'Orb of Frost',
  morbid_mask: 'Morbid Mask',
  javelin: 'Javelin',
  broadsword: 'Broadsword',
  blitz_knuckles: 'Blitz Knuckles',
  claymore: 'Claymore',
  mithril_hammer: 'Mithril Hammer',
  hyperstone: 'Hyperstone',
  demon_edge: 'Demon Edge',
  sacred_relic: 'Sacred Relic',

  // 防御基础
  ring_of_protection: 'Ring of Protection',
  ring_of_regen: 'Ring of Regen',
  sages_mask: "Sage's Mask",
  wind_lace: 'Wind Lace',
  fluffy_hat: 'Fluffy Hat',
  wizard_hat: 'Wizard Hat',
  shawl: 'Shawl',
  chainmail: 'Chainmail',
  ring_of_health: 'Ring of Health',
  void_stone: 'Void Stone',
  energy_booster: 'Energy Booster',
  cloak: 'Cloak',
  chasm_stone: 'Chasm Stone',
  splintmail: 'Splintmail',
  helm_of_iron_will: 'Helm of Iron Will',
  vitality_booster: 'Vitality Booster',
  point_booster: 'Point Booster',
  talisman_of_evasion: 'Talisman of Evasion',
  platemail: 'Platemail',
  ring_of_tarrasque: 'Ring of Tarrasque',

  // 鞋类与合成小件
  magic_stick: 'Magic Stick',
  boots_of_speed: 'Boots of Speed',
  blink_dagger: 'Blink Dagger',
  tranquil_boots: 'Tranquil Boots',
  power_treads: 'Power Treads',
  phase_boots: 'Phase Boots',
  arcane_boots: 'Arcane Boots',
  magic_wand: 'Magic Wand',
  bracer: 'Bracer',
  wraith_band: 'Wraith Band',
  null_talisman: 'Null Talisman',
  buckler: 'Buckler',
  headdress: 'Headdress',
  ring_of_basilius: 'Ring of Basilius',
  soul_ring: 'Soul Ring',
  orb_of_corrosion: 'Orb of Corrosion',
  perseverance: 'Perseverance',

  // 防御大件
  vanguard: 'Vanguard',
  mekansm: 'Mekansm',
  blade_mail: 'Blade Mail',
  heaven_halberd: "Heaven's Halberd",
  crimson_guard: 'Crimson Guard',
  pipe_of_insight: 'Pipe of Insight',
  black_king_bar: 'Black King Bar',
  shivas_guard: "Shiva's Guard",
  linkens_sphere: "Linken's Sphere",
  assault_cuirass: 'Assault Cuirass',
  heart_of_tarrasque: 'Heart of Tarrasque',

  // 输出与武器大件
  mask_of_madness: 'Mask of Madness',
  crystalys: 'Crystalys',
  sange: 'Sange',
  yasha: 'Yasha',
  armlet_of_mordiggian: 'Armlet of Mordiggian',
  echo_sabre: 'Echo Sabre',
  skull_basher: 'Skull Basher',
  maelstrom: 'Maelstrom',
  desolator: 'Desolator',
  battle_fury: 'Battle Fury',
  sange_and_yasha: 'Sange and Yasha',
  radiance: 'Radiance',
  monkey_king_bar: 'Monkey King Bar',
  satanic: 'Satanic',
  daedalus: 'Daedalus',
  butterfly: 'Butterfly',
  mjollnir: 'Mjollnir',
  abyssal_blade: 'Abyssal Blade',

  // 辅助与法杖
  force_staff: 'Force Staff',
  euls_scepter: "Eul's Scepter of Divinity",

  // 特殊神杖与魔晶
  aghanims_scepter: "Aghanim's Scepter",
  aghanims_shard: "Aghanim's Shard",
};

/** 分类中文名称 */
export const CATEGORY_LABELS: Record<ItemCategory, string> = {
  consumables: '消耗品',
  attributes: '属性基础',
  armaments: '军械基础',
  boots: '鞋类装备',
  early: '前期小件',
  defense: '防御大件',
  weapons: '武器输出',
  utility: '功能法术',
  special: '神杖魔晶',
};

/** 施法目标模式中文描述 */
export const TARGET_TYPE_LABELS: Record<string, string> = {
  none: '无目标（即时生效）',
  unit: '单位目标',
  point: '点目标（地面范围）',
  toggle: '切换开关',
  passive: '被动技能',
};

/** 获取物品的英文名 */
export function getItemEnName(itemId: string): string {
  return ITEM_EN_NAMES[itemId] ?? itemId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * 查询一件物品可以进阶合成的所有高级装备（Builds Into）
 */
export function getBuildsInto(itemId: string): ItemDef[] {
  const list: ItemDef[] = [];
  for (const item of Object.values(ITEM_DEFINITIONS)) {
    if (item.components && item.components.includes(itemId)) {
      list.push(item);
    }
  }
  return list;
}

/** 格式化属性加成列表，区分颜色主题 */
export interface FormattedStat {
  text: string;
  type: 'str' | 'agi' | 'int' | 'all' | 'combat' | 'mana' | 'hp';
}

export function formatItemStats(item: ItemDef): FormattedStat[] {
  const result: FormattedStat[] = [];
  if (!item.stats) return result;
  const s = item.stats;

  if (s.str) result.push({ text: `+${s.str} 力量`, type: 'str' });
  if (s.agi) result.push({ text: `+${s.agi} 敏捷`, type: 'agi' });
  if (s.int) result.push({ text: `+${s.int} 智力`, type: 'int' });
  if (s.allStats) result.push({ text: `+${s.allStats} 全属性`, type: 'all' });

  if (s.bonusDamage) result.push({ text: `+${s.bonusDamage} 攻击力`, type: 'combat' });
  if (s.attackSpeed) result.push({ text: `+${s.attackSpeed} 攻击速度`, type: 'combat' });
  if (s.armor) result.push({ text: `+${s.armor} 护甲`, type: 'combat' });
  if (s.magicResist) result.push({ text: `+${Math.round(s.magicResist * 100)}% 魔法抗性`, type: 'combat' });
  if (s.evasion) result.push({ text: `+${Math.round(s.evasion * 100)}% 闪避`, type: 'combat' });
  if (s.lifesteal) result.push({ text: `+${Math.round(s.lifesteal * 100)}% 物理吸血`, type: 'combat' });

  if (s.moveSpeed) result.push({ text: `+${s.moveSpeed} 移动速度`, type: 'combat' });
  if (s.moveSpeedPct) result.push({ text: `+${Math.round(s.moveSpeedPct * 100)}% 移动速度`, type: 'combat' });

  if (s.maxHp) result.push({ text: `+${s.maxHp} 生命值`, type: 'hp' });
  if (s.hpRegen) result.push({ text: `+${s.hpRegen} 生命回复/秒`, type: 'hp' });
  if (s.maxMana) result.push({ text: `+${s.maxMana} 魔法值`, type: 'mana' });
  if (s.manaRegen) result.push({ text: `+${s.manaRegen} 魔法回复/秒`, type: 'mana' });

  return result;
}
