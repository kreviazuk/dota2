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
  /** parallel 充能：每层正在恢复的剩余时间 */
  chargeTimers: number[];
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

/** AI 能力参数（随难度变化）；技能使用规则在 src/ai/usage/<英雄>.ts */
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
  /** 充能恢复方式：sequential（缺省，一次恢复一层）/ parallel（每层独立计时，影魔毁灭阴影） */
  chargeMode?: 'sequential' | 'parallel';
  /** 先天主动技能（幻刺魅影无形放在 X1）：从 1 级起就是 1 级，不能加点、不占技能点 */
  innate?: boolean;
  /** 不打断当前动作（施法前摇、引导、普攻前摇）立即生效；只允许 targetType 'none'，castPoint 视为 0 */
  instant?: boolean;
  /** 地点技能：落点到施法者的距离吸附到最近的一档（影魔 200/450/700） */
  pointSnap?: number[];
  /** 开关技能第一次学会时自动开启（霜冻之箭） */
  defaultToggled?: boolean;
  channelTime?: number[];
  channelAllowsMove?: boolean;
  /** 被缠绕时不能施放（自己位移的技能：神圣一跳） */
  blockedByRoot?: boolean;
  ignoresDebuffImmune?: boolean;
  /** 技能的效果是打出一次普攻（窒碍短匕、无敌斩）：可以选只受普攻影响的单位（治疗守卫，D17） */
  attackBased?: boolean;
  values: Record<string, number[]>;
  /** 学会后常驻的被动 Modifier */
  passive?: ModifierDef;
  onCast?(ctx: CastContext): void;
  onChannelTick?(ctx: CastContext, dt: number): void;
  onChannelEnd?(ctx: CastContext, interrupted: boolean): void;
  onToggle?(ctx: CastContext, on: boolean): void;
  smartTarget?(world: World, caster: Unit, ability: AbilityInstance): ResolvedTarget | null;
  /** 瞄准指示器的尺寸（缺省读 castRange / values.distance / values.width / values.radius） */
  aimShape?(caster: Unit, ab: AbilityInstance): { length?: number; width?: number; radius?: number };
  /** HUD 角标（层数、灵魂数……）；null = 不显示 */
  counter?(u: Unit, ab: AbilityInstance): number | null;
  /** 先天技能角标在头像旁的标签（缺省 = 技能名；影魔支配死灵显示"灵魂"） */
  counterLabel?: string;
  /** 被动暂时失效（例如射手天赋附近有敌方英雄）时 HUD 变灰 */
  inactive?(u: Unit, ab: AbilityInstance): boolean;
}

export interface TalentValueMod {
  abilityId: string;
  /** values 里的键，或 'cooldown' | 'manaCost' | 'castRange' | 'channelTime' | 'charges' */
  key: string;
  add?: number;
  mult?: number;
}

export interface TalentDef {
  id: string;
  /** 中文，界面直接显示 */
  name: string;
  valueBonus?: TalentValueMod | TalentValueMod[];
  /** 选择后挂一个永久、隐藏、不可驱散的 Modifier */
  stats?: StatBonus;
  /** 自定义效果（必须 persistOnDeath: true） */
  modifier?: ModifierDef;
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
