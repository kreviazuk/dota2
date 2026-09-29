import type { Difficulty } from '../sim/core/types';
import type { AiSkill } from '../sim/heroes/types';

export interface DifficultyParams {
  skill: AiSkill;
  eliteMult: number;
  econMult: number;
}

export const DIFFICULTY: Record<Difficulty, DifficultyParams> = {
  easy: { skill: { reaction: 0.6, prediction: 0, lastHitSkill: 0.5, focus: 0, retreatHp: 0.2 }, eliteMult: 0.8, econMult: 0.9 },
  normal: { skill: { reaction: 0.35, prediction: 0.5, lastHitSkill: 0.75, focus: 0.5, retreatHp: 0.3 }, eliteMult: 1, econMult: 1 },
  hard: { skill: { reaction: 0.15, prediction: 1, lastHitSkill: 0.95, focus: 1, retreatHp: 0.3 }, eliteMult: 1.25, econMult: 1.15 },
};

export const DIFFICULTY_NAMES: Record<Difficulty, string> = { easy: '简单', normal: '普通', hard: '困难' };
