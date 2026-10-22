import type { Difficulty } from '../sim/core/types';
import type { AiSkill } from '../sim/heroes/types';

export interface DifficultyParams {
  skill: AiSkill;
  eliteMult: number;
  econMult: number;
  comboChance: number;
}

export const DIFFICULTY: Record<Difficulty, DifficultyParams> = {
  easy: { skill: { reaction: 0.55, prediction: 0, lastHitSkill: 0.40, focus: 0, retreatHp: 0.2, comboChance: 0 }, eliteMult: 0.75, econMult: 0.82, comboChance: 0 },
  normal: { skill: { reaction: 0.35, prediction: 0.5, lastHitSkill: 0.75, focus: 0.5, retreatHp: 0.3, comboChance: 0.5 }, eliteMult: 1, econMult: 1, comboChance: 0.5 },
  hard: { skill: { reaction: 0.20, prediction: 1, lastHitSkill: 0.90, focus: 0.85, retreatHp: 0.3, comboChance: 0.8 }, eliteMult: 1.15, econMult: 1.08, comboChance: 0.8 },
};

export const DIFFICULTY_NAMES: Record<Difficulty, string> = { easy: '简单', normal: '普通', hard: '困难' };
