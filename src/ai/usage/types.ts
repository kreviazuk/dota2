import type { World } from '../../sim/world';
import type { Unit } from '../../sim/entities/unit';
import type { AbilityInstance, AiSkill, CastTarget } from '../../sim/heroes/types';

/** 规则做决定时看到的局面（每个技能一份，ab 不同，其余字段共用） */
export interface AiCtx {
  world: World;
  me: Unit;
  ab: AbilityInstance;
  skill: AiSkill;
  /** 1500 内、可以被我攻击的敌方英雄（不含隐藏） */
  enemyHeroes: Unit[];
  /** 1500 内的友方英雄（不含自己） */
  allyHeroes: Unit[];
  hpPct: number;
  manaPct: number;
  retreating: boolean;
}

/** 规则只返回意图，不直接改 World：施法（目标可省略 = 智能施法）、切换开关，或什么都不做 */
export type AiDecision = { cast: CastTarget } | { toggle: true } | null;

export interface AiRule {
  decide(c: AiCtx): AiDecision;
  /** 撤退时也会被考虑（逃跑 / 保命技能） */
  escape?: boolean;
  /** 越大越先考虑；缺省：R 30、X1/X2 20、其他 10 */
  priority?: number;
  /** 自己正在施法 / 引导时也会被考虑（只用于 instant 技能，例如帕吉肢解中开肉盾） */
  whileCasting?: boolean;
}

/** key = 技能 id */
export type HeroAiRules = Record<string, AiRule>;
