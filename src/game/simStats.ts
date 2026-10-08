import type { World } from '../sim/world';
import { Team } from '../sim/core/types';
import { netWorth } from '../sim/systems/progress';
import { getHeroDef, hasHero } from '../sim/heroes/index';
import type { AbilityDef } from '../sim/heroes/types';

/** 批量模拟里一个英雄在一局中的数据 */
export interface HeroGameRecord {
  heroId: string; team: 'radiant' | 'dire';
  /** 推倒遗迹的结果；超时局为 null */
  won: boolean | null;
  /** 含超时判定的结果 */
  judgedWon: boolean;
  kills: number; deaths: number; assists: number; lastHits: number;
  heroDamage: number; buildingDamage: number; level: number; netWorth: number;
  casts: Record<string, number>;
}

/** 一个英雄在全部对局里的汇总（K/D/A 等都是场均） */
export interface HeroSummary {
  heroId: string; games: number; wins: number; winRate: number; judgedWinRate: number;
  kills: number; deaths: number; assists: number;
  heroDamage: number; buildingDamage: number; lastHits: number; level: number;
  castsPerGame: Record<string, number>;
}

/** 主动技能（会发 cast 事件的）：非被动；开关也算 */
const isActive = (a: AbilityDef): boolean => a.targetType !== 'passive';

const activeAbilityIds = (heroId: string): string[] =>
  hasHero(heroId) ? getHeroDef(heroId).abilities.filter(isActive).map((a) => a.id) : [];

const sideOf = (t: Team): 'radiant' | 'dire' => (t === Team.Radiant ? 'radiant' : 'dire');

/**
 * 一局结束（或超时）时读出每个英雄的数据，按 world.heroes() 的顺序。
 * judged = 超时局按判定规则的胜方（推倒遗迹的局忽略它）。主动技能没放过的记 0 次。
 */
export function recordsFromWorld(world: World, judged: Team | null): HeroGameRecord[] {
  const winner = world.winner;
  const judgedWinner = winner ?? judged;
  return world.heroes().map((u) => {
    const h = u.hero!;
    const casts: Record<string, number> = {};
    for (const id of activeAbilityIds(h.heroId)) casts[id] = 0;
    for (const [id, n] of Object.entries(h.abilityCasts)) casts[id] = n;
    return {
      heroId: h.heroId,
      team: sideOf(u.team),
      won: winner === null ? null : winner === u.team,
      judgedWon: judgedWinner === u.team,
      kills: h.kills, deaths: h.deaths, assists: h.assists, lastHits: h.lastHits,
      heroDamage: h.damageDealt.heroes, buildingDamage: h.damageDealt.buildings,
      level: h.level, netWorth: netWorth(u),
      casts,
    };
  });
}

/** 按英雄汇总（同一局里出现两次的英雄算两场），按含判定胜率降序，相同时按英雄 id */
export function summarizeHeroes(records: readonly HeroGameRecord[]): HeroSummary[] {
  const groups = new Map<string, HeroGameRecord[]>();
  for (const r of records) {
    const g = groups.get(r.heroId);
    if (g) g.push(r);
    else groups.set(r.heroId, [r]);
  }
  const out: HeroSummary[] = [];
  for (const [heroId, rs] of groups) {
    const n = rs.length;
    const mean = (f: (r: HeroGameRecord) => number) => rs.reduce((s, r) => s + f(r), 0) / n;
    const castsPerGame: Record<string, number> = {};
    for (const r of rs) for (const [id, c] of Object.entries(r.casts)) castsPerGame[id] = (castsPerGame[id] ?? 0) + c;
    for (const id of Object.keys(castsPerGame)) castsPerGame[id] /= n;
    const wins = rs.filter((r) => r.won === true).length;
    out.push({
      heroId, games: n, wins, winRate: wins / n, judgedWinRate: rs.filter((r) => r.judgedWon).length / n,
      kills: mean((r) => r.kills), deaths: mean((r) => r.deaths), assists: mean((r) => r.assists),
      heroDamage: mean((r) => r.heroDamage), buildingDamage: mean((r) => r.buildingDamage),
      lastHits: mean((r) => r.lastHits), level: mean((r) => r.level),
      castsPerGame,
    });
  }
  return out.sort((a, b) => b.judgedWinRate - a.judgedWinRate || (a.heroId < b.heroId ? -1 : a.heroId > b.heroId ? 1 : 0));
}

/** 场次 ≥ minGames（缺省 20）且含判定胜率偏离 50% 超过 threshold（缺省 0.08，设计文档 §11.2）的英雄 */
export function winRateOutliers(sums: readonly HeroSummary[], o: { minGames?: number; threshold?: number } = {}): string[] {
  const minGames = o.minGames ?? 20;
  const threshold = o.threshold ?? 0.08;
  return sums.filter((s) => s.games >= minGames && Math.abs(s.judgedWinRate - 0.5) > threshold + 1e-9).map((s) => s.heroId);
}

/** 场均施放 < 0.5 次的主动技能（"AI 不会用"的信号），返回 'heroId:abilityId'，按 sums 和技能定义的顺序 */
export function unusedAbilities(sums: readonly HeroSummary[]): string[] {
  const out: string[] = [];
  for (const s of sums) {
    for (const id of activeAbilityIds(s.heroId)) if ((s.castsPerGame[id] ?? 0) < 0.5) out.push(`${s.heroId}:${id}`);
  }
  return out;
}

const heroName = (id: string): string => (hasHero(id) ? getHeroDef(id).name : id);
const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;

/** "各英雄出场胜率"表（终端 / Markdown 共用）；flagged 的行标"偏离"，color 时整行标红 */
export function heroTable(sums: readonly HeroSummary[], flagged: ReadonlySet<string>, color: boolean): string {
  const lines = [
    '| 英雄 | 场次 | 胜率 | 含判定胜率 | 场均 K/D/A | 对英雄伤害 | 对建筑伤害 | 补刀 | 结束等级 |',
    '|---|---|---|---|---|---|---|---|---|',
  ];
  for (const s of sums) {
    const bad = flagged.has(s.heroId);
    const row = [
      bad ? `${heroName(s.heroId)}（偏离）` : heroName(s.heroId),
      String(s.games), pct(s.winRate), pct(s.judgedWinRate),
      `${s.kills.toFixed(1)} / ${s.deaths.toFixed(1)} / ${s.assists.toFixed(1)}`,
      String(Math.round(s.heroDamage)), String(Math.round(s.buildingDamage)),
      s.lastHits.toFixed(0), s.level.toFixed(1),
    ];
    const line = `| ${row.join(' | ')} |`;
    lines.push(bad && color ? `\x1b[31m${line}\x1b[0m` : line);
  }
  return lines.join('\n');
}
