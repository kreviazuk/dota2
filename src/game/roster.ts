import type { Attribute } from '../sim/core/types';
import { hasHero } from '../sim/heroes/index';

export interface RosterEntry {
  id: string;
  name: string;
  /** 主属性（选人界面卡片的色条；还没实现的英雄也要显示） */
  primary: Attribute;
}

/** 全部 10 名英雄（含还没实现的），设计文档 §1.2 的顺序 */
export const HERO_ROSTER: readonly RosterEntry[] = [
  { id: 'axe', name: '斧王', primary: 'str' },
  { id: 'sven', name: '斯温', primary: 'str' },
  { id: 'pudge', name: '帕吉', primary: 'str' },
  { id: 'juggernaut', name: '主宰', primary: 'agi' },
  { id: 'phantom_assassin', name: '幻影刺客', primary: 'agi' },
  { id: 'drow_ranger', name: '卓尔游侠', primary: 'agi' },
  { id: 'shadow_fiend', name: '影魔', primary: 'agi' },
  { id: 'lina', name: '莉娜', primary: 'int' },
  { id: 'zeus', name: '宙斯', primary: 'int' },
  { id: 'crystal_maiden', name: '水晶室女', primary: 'int' },
];

/** 已实现（已注册）的英雄，按 roster 顺序 */
export const availableHeroes = (): string[] => HERO_ROSTER.filter((e) => hasHero(e.id)).map((e) => e.id);
