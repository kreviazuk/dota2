import type { StatBonus } from '../modifiers';
import type { TargetType, TargetTeam } from '../heroes/types';

export type ItemCategory =
  | 'consumables'    // 消耗品
  | 'attributes'     // 基础属性
  | 'armaments'      // 基础配件与军械
  | 'boots'          // 鞋类
  | 'early'          // 前期合成件
  | 'defense'        // 防御大件
  | 'weapons'        // 武器输出大件
  | 'utility'        // 功能/法术大件
  | 'special';       // 神杖与魔晶

export interface ItemActiveDef {
  name: string;
  description: string;
  targetType: TargetType;
  targetTeam?: TargetTeam;
  castRange?: number;
  cooldown: number;
  manaCost?: number;
  instant?: boolean;
  canTargetSelf?: boolean;
}

export interface ItemPassiveDef {
  name: string;
  description: string;
}

export interface ItemDef {
  id: string;
  name: string;
  category: ItemCategory;
  cost: number;
  recipeCost?: number;
  components?: string[];
  stats?: StatBonus;
  stackable?: boolean;
  initialCharges?: number;
  maxCharges?: number;
  active?: ItemActiveDef;
  passive?: ItemPassiveDef;
}

export interface ItemInstance {
  id: string;
  buyTime: number;
  costPaid: number;
  charges?: number;
  cooldownRemaining?: number;
  toggled?: boolean;
  selectedStat?: 'str' | 'agi' | 'int';
}
