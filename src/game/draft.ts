import type { Rng } from '../sim/core/rng';

/** 力量英雄（设计文档 §9.3：每方尽量至少 1 名） */
export const STRENGTH_HEROES: readonly string[] = ['axe', 'sven', 'pudge'];
/** 带硬控的英雄（每方尽量至少 1 名） */
export const HARD_DISABLE_HEROES: readonly string[] = ['axe', 'sven', 'pudge', 'lina', 'crystal_maiden'];

export interface Draft { radiant: string[]; dire: string[] }

const TEAM_SIZE = 3;

/** 补齐一方：fixed 是已经确定的英雄（玩家），其余由电脑从 pool 里选 */
function fillTeam(rng: Rng, pool: readonly string[], fixed: readonly string[]): string[] {
  const team = [...fixed];
  const picks: string[] = [];
  const taken = (id: string) => team.includes(id) || picks.includes(id);
  // 优先选还没人用的；池子不够时退回允许重复
  const choose = (cands: readonly string[]): string | null => {
    const fresh = cands.filter((id) => !taken(id));
    if (fresh.length) return rng.pick(fresh);
    return null;
  };
  const need = (group: readonly string[]) => ![...team, ...picks].some((id) => group.includes(id));
  if (team.length + picks.length < TEAM_SIZE && need(STRENGTH_HEROES)) {
    const id = choose(pool.filter((h) => STRENGTH_HEROES.includes(h)));
    if (id) picks.push(id);
  }
  if (team.length + picks.length < TEAM_SIZE && need(HARD_DISABLE_HEROES)) {
    const id = choose(pool.filter((h) => HARD_DISABLE_HEROES.includes(h)));
    if (id) picks.push(id);
  }
  while (team.length + picks.length < TEAM_SIZE) picks.push(choose(pool) ?? rng.pick(pool));
  // 约束选出来的英雄不总在固定的位置
  return [...team, ...rng.shuffle(picks)];
}

/**
 * 电脑补位（设计文档 §9.3）：玩家英雄放天辉 0 号位；每方 3 人不重复（池子不足 3 人时允许重复），两方之间可以重复；
 * 每方尽量至少 1 名力量英雄和 1 名带硬控的英雄。只用 rng，同一个 rng 状态结果相同。
 */
export function draftTeams(rng: Rng, pool: readonly string[], playerHero?: string): Draft {
  const unique = [...new Set(pool)];
  if (!unique.length) throw new Error('选人池为空');
  const radiant = fillTeam(rng, unique, playerHero ? [playerHero] : []);
  const dire = fillTeam(rng, unique, []);
  return { radiant, dire };
}
