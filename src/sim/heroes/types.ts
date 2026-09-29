import type { Vec2 } from '../core/vec2';
import type { AbilitySlot, Attribute, DamageType } from '../core/types';
import type { Unit } from '../entities/unit';
import type { World } from '../world';
import type { ModifierDef, StatBonus } from '../modifiers';

export type TargetType = 'none' | 'unit' | 'point' | 'direction' | 'passive' | 'toggle';
export type TargetTeam = 'enemy' | 'ally' | 'any';

/** 指令里携带的目标（都可省略，省略时走智能施法） */
export interface CastTarget {
  unitId?: number;
  point?: Vec2;
  dir?: Vec2;
}
/** 解析后的目标 */
export interface ResolvedTarget {
  unit?: Unit;
  point?: Vec2;
  dir?: Vec2;
}

export interface AbilityInstance {
  def: AbilityDef;
  level: number;
  cooldown: number;
  charges: number;
  chargeTimer: number;
  toggled: boolean;
  data: Record<string, number>;
}

export interface CastState {
  ability: AbilityInstance;
  target: ResolvedTarget;
  phase: 'point' | 'channel';
  timer: number;
  channelTotal: number;
}

export interface CastContext {
  world: World;
  caster: Unit;
  ability: AbilityInstance;
  level: number;
  target: ResolvedTarget;
  /** 读取当前等级的技能数值（含天赋加成） */
  v(key: string): number;
}

/** AI 能力参数（随难度变化） */
export interface AiSkill {
  reaction: number;
  prediction: number;
  lastHitSkill: number;
  focus: number;
  retreatHp: number;
}

export interface AbilityDef {
  id: string;
  name: string;
  description: string;
  slot: AbilitySlot | 'innate';
  maxLevel: number;
  /** 学第 (当前等级+1) 级所需英雄等级，下标 = 当前等级。缺省：英雄等级 ≥ 2×当前等级+1 */
  requiredHeroLevels?: number[];
  targetType: TargetType;
  targetTeam?: TargetTeam;
  heroesOnly?: boolean;
  damageType?: DamageType;
  castRange?: number[];
  castPoint?: number;
  cooldown?: number[];
  manaCost?: number[];
  /** 充能次数上限；每次充能恢复时间 = cooldown */
  charges?: number;
  channelTime?: number[];
  channelAllowsMove?: boolean;
  ignoresDebuffImmune?: boolean;
  values: Record<string, number[]>;
  /** 学会后常驻的被动 Modifier */
  passive?: ModifierDef;
  onCast?(ctx: CastContext): void;
  onChannelTick?(ctx: CastContext, dt: number): void;
  onChannelEnd?(ctx: CastContext, interrupted: boolean): void;
  onToggle?(ctx: CastContext, on: boolean): void;
  smartTarget?(world: World, caster: Unit, ability: AbilityInstance): ResolvedTarget | null;
  aiCast?(world: World, caster: Unit, ability: AbilityInstance, skill: AiSkill): CastTarget | null;
}

export interface TalentDef {
  id: string;
  name: string;
  valueBonus?: { abilityId: string; key: string; add: number };
  stats?: StatBonus;
}

export interface HeroDef {
  id: string;
  name: string;
  title: string;
  primary: Attribute;
  str: [number, number];
  agi: [number, number];
  int: [number, number];
  baseDamage: [number, number];
  baseArmor: number;
  baseHpRegen: number;
  baseManaRegen: number;
  attackRange: number;
  bat: number;
  baseAttackSpeed: number;
  attackPoint: number;
  projectileSpeed: number;
  moveSpeed: number;
  roles: string[];
  abilities: AbilityDef[];
  talents: [TalentDef, TalentDef][];
}
