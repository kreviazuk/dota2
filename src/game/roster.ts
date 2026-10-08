import { hasHero } from '../sim/heroes/index';

export interface RosterEntry { id: string; name: string }

/** 全部 10 名英雄（含还没实现的），设计文档 §1.2 的顺序 */
export const HERO_ROSTER: readonly RosterEntry[] = [
  { id: 'axe', name: '斧王' },
  { id: 'sven', name: '斯温' },
  { id: 'pudge', name: '帕吉' },
  { id: 'juggernaut', name: '主宰' },
  { id: 'phantom_assassin', name: '幻影刺客' },
  { id: 'drow_ranger', name: '卓尔游侠' },
  { id: 'shadow_fiend', name: '影魔' },
  { id: 'lina', name: '莉娜' },
  { id: 'zeus', name: '宙斯' },
  { id: 'crystal_maiden', name: '水晶室女' },
];

/** 已实现（已注册）的英雄，按 roster 顺序 */
export const availableHeroes = (): string[] => HERO_ROSTER.filter((e) => hasHero(e.id)).map((e) => e.id);
