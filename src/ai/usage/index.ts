import type { AiRule, HeroAiRules } from './types';
import { AXE_RULES } from './axe';
import { SVEN_RULES } from './sven';
import { LINA_RULES } from './lina';
import { CM_RULES } from './crystal_maiden';
import { ZEUS_RULES } from './zeus';

export type { AiCtx, AiDecision, AiRule, HeroAiRules } from './types';

/** 所有英雄的技能使用规则（key = 技能 id）；新英雄在这里合并自己的 usage/<英雄>.ts */
export const AI_RULES: HeroAiRules = {
  ...AXE_RULES,
  ...SVEN_RULES,
  ...LINA_RULES,
  ...CM_RULES,
  ...ZEUS_RULES,
};

export const aiRuleFor = (abilityId: string): AiRule | undefined => AI_RULES[abilityId];
