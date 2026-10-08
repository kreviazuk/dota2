import type { AbilitySlot, Attribute } from '../sim/core/types';
import type { AbilityDef, HeroDef } from '../sim/heroes/types';
import type { Balance } from '../sim/data/balance';
import { attackInterval } from '../sim/formulas';

/**
 * 技能和英雄的说明文字（纯函数，不碰 DOM）：选英雄界面的技能列表、面板和 HUD 共用。
 */
export const PRIMARY_NAMES: Record<Attribute, string> = { str: '力量', agi: '敏捷', int: '智力' };
/** 主属性颜色（选人卡片的色条、详情的属性标签） */
export const PRIMARY_COLORS: Record<Attribute, string> = { str: '#d0463a', agi: '#4caf50', int: '#3f8fe0' };
export const SLOT_LABELS: Record<AbilitySlot | 'innate', string> = { Q: 'Q', W: 'W', E: 'E', R: 'R', X1: 'X1', X2: 'X2', innate: '先天' };

const DAMAGE_NAMES = { physical: '物理伤害', magical: '魔法伤害', pure: '纯粹伤害' } as const;

/** 数字的显示：最多两位小数，去掉末尾的 0 */
export const fmtNum = (n: number): string => String(Math.round(n * 100) / 100);

/** 每级数值 "18/16/14/12"；全级相同时只写一个数 */
export const perLevel = (arr: readonly number[]): string => (arr.every((v) => v === arr[0]) ? fmtNum(arr[0]) : arr.map(fmtNum).join('/'));

const nonZero = (arr: readonly number[] | undefined): arr is number[] => !!arr && arr.length > 0 && arr.some((v) => v !== 0);

/** 技能标签：目标类型、伤害类型、引导、充能。例：['指向单位', '魔法伤害'] / ['被动'] / ['开关'] / ['方向', '充能 ×3'] */
export function abilityTags(def: AbilityDef): string[] {
  const tags: string[] = [];
  switch (def.targetType) {
    case 'passive': tags.push('被动'); break;
    case 'toggle': tags.push('开关'); break;
    case 'unit': tags.push(def.targetTeam === 'ally' ? '指向友方' : '指向单位'); break;
    case 'point': tags.push('地点'); break;
    case 'direction': tags.push('方向'); break;
    default: tags.push(def.instant ? '即时' : '无目标');
  }
  if (def.damageType) tags.push(DAMAGE_NAMES[def.damageType]);
  if (nonZero(def.channelTime)) tags.push('引导');
  if (def.charges && def.charges > 0) tags.push(`充能 ×${def.charges}`);
  return tags;
}

/** 技能数值：冷却、魔耗、施法距离、引导时间；全级相同时只写一个数，没有的项不写 */
export function abilityNumbers(def: AbilityDef): string[] {
  const out: string[] = [];
  if (nonZero(def.cooldown)) out.push(`${def.charges ? '充能时间' : '冷却'} ${perLevel(def.cooldown)}`);
  if (nonZero(def.manaCost)) out.push(`魔耗 ${perLevel(def.manaCost)}`);
  if (nonZero(def.castRange)) out.push(`距离 ${perLevel(def.castRange)}`);
  if (nonZero(def.channelTime)) out.push(`引导 ${perLevel(def.channelTime)} 秒`);
  return out;
}

export interface HeroBaseLine {
  hp: number;
  mana: number;
  damage: [number, number];
  armor: number;
  moveSpeed: number;
  attackRange: number;
  attackInterval: number;
  primary: string;
}

/** 1 级面板（不含先天被动和天赋），按 BALANCE.hero 的属性换算 */
export function heroBaseLine(def: HeroDef, balance: Balance): HeroBaseLine {
  const hb = balance.hero;
  const str = def.str[0], agi = def.agi[0], int = def.int[0];
  const main = def.primary === 'str' ? str : def.primary === 'agi' ? agi : int;
  return {
    hp: hb.baseHp + str * hb.hpPerStr,
    mana: hb.baseMana + int * hb.manaPerInt,
    damage: [def.baseDamage[0] + main, def.baseDamage[1] + main],
    armor: def.baseArmor + agi * hb.armorPerAgi,
    moveSpeed: def.moveSpeed,
    attackRange: def.attackRange,
    attackInterval: attackInterval(def.bat, def.baseAttackSpeed + agi * hb.attackSpeedPerAgi),
    primary: PRIMARY_NAMES[def.primary],
  };
}

/** 选英雄界面的技能列表顺序：先天 → Q W E R → X1 X2 */
export function orderedAbilities(def: HeroDef): AbilityDef[] {
  const order: (AbilitySlot | 'innate')[] = ['innate', 'Q', 'W', 'E', 'R', 'X1', 'X2'];
  return [...def.abilities].sort((a, b) => order.indexOf(a.slot) - order.indexOf(b.slot));
}
