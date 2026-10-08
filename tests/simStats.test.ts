import { describe, it, expect } from 'vitest';
import {
  heroTable, recordsFromWorld, summarizeHeroes, unusedAbilities, winRateOutliers,
  type HeroGameRecord, type HeroSummary,
} from '../src/game/simStats';
import { Match } from '../src/game/match';
import { Team } from '../src/sim/core/types';
import { heroAt, makeWorld, runFor } from './helpers';

const rec = (heroId: string, team: 'radiant' | 'dire', judgedWon: boolean, o: Partial<HeroGameRecord> = {}): HeroGameRecord => ({
  heroId, team, won: judgedWon, judgedWon, kills: 0, deaths: 0, assists: 0, lastHits: 0,
  heroDamage: 0, buildingDamage: 0, level: 1, netWorth: 0, casts: {}, ...o,
});

const sum = (heroId: string, games: number, judgedWinRate: number, castsPerGame: Record<string, number> = {}): HeroSummary => ({
  heroId, games, wins: Math.round(games * judgedWinRate), winRate: judgedWinRate, judgedWinRate,
  kills: 0, deaths: 0, assists: 0, heroDamage: 0, buildingDamage: 0, lastHits: 0, level: 1, castsPerGame,
});

describe('simStats', () => {
  it('summarizeHeroes aggregates per hero across games and teams', () => {
    const records = [
      rec('axe', 'radiant', true, { kills: 4, deaths: 2, assists: 6, lastHits: 100, heroDamage: 9000, buildingDamage: 3000, level: 20, casts: { axe_berserkers_call: 10 } }),
      rec('axe', 'dire', false, { won: null, kills: 2, deaths: 4, assists: 2, lastHits: 50, heroDamage: 3000, buildingDamage: 1000, level: 18, casts: { axe_berserkers_call: 4, axe_culling_blade: 2 } }),
      rec('axe', 'dire', true, { won: null, kills: 0, deaths: 0, assists: 1, lastHits: 30, level: 16 }),
      rec('lina', 'radiant', false, { kills: 1, casts: { lina_dragon_slave: 7 } }),
    ];
    const sums = summarizeHeroes(records);
    expect(sums.map((s) => s.heroId)).toEqual(['axe', 'lina']);
    const axe = sums[0];
    expect(axe.games).toBe(3);
    // 推倒遗迹才算 wins（超时局 won = null）
    expect(axe.wins).toBe(1);
    expect(axe.winRate).toBeCloseTo(1 / 3);
    expect(axe.judgedWinRate).toBeCloseTo(2 / 3);
    expect(axe.kills).toBeCloseTo(2);
    expect(axe.deaths).toBeCloseTo(2);
    expect(axe.assists).toBeCloseTo(3);
    expect(axe.lastHits).toBeCloseTo(60);
    expect(axe.heroDamage).toBeCloseTo(4000);
    expect(axe.buildingDamage).toBeCloseTo(4000 / 3);
    expect(axe.level).toBeCloseTo(18);
    expect(axe.castsPerGame.axe_berserkers_call).toBeCloseTo(14 / 3);
    expect(axe.castsPerGame.axe_culling_blade).toBeCloseTo(2 / 3);
    expect(sums[1].judgedWinRate).toBe(0);
    expect(sums[1].castsPerGame.lina_dragon_slave).toBe(7);
  });

  it('recordsFromWorld reads every hero and initialises active abilities to 0 casts', () => {
    const m = new Match({ seed: 1, radiantHeroes: ['axe', 'lina', 'pudge'], direHeroes: ['zeus', 'sven', 'drow_ranger'], playerSlot: null, difficulty: 'normal' });
    for (let i = 0; i < 30 * 60; i++) m.step();
    const rs = recordsFromWorld(m.world, Team.Dire);
    expect(rs.map((r) => r.heroId)).toEqual(['axe', 'lina', 'pudge', 'zeus', 'sven', 'drow_ranger']);
    expect(rs.every((r) => r.won === null)).toBe(true);
    expect(rs.filter((r) => r.judgedWon).map((r) => r.team)).toEqual(['dire', 'dire', 'dire']);
    const axe = rs[0];
    expect(Object.keys(axe.casts).sort()).toEqual(['axe_battle_hunger', 'axe_berserkers_call', 'axe_culling_blade']);
    expect(rs.every((r) => r.level >= 1 && Number.isFinite(r.netWorth))).toBe(true);
  }, 60_000);

  it('abilityCasts counts casts and instant casts, and toggles only when switched on', () => {
    const w = makeWorld();
    const pudge = heroAt(w, 'pudge', { x: 1500, y: 5000 }, { levels: { Q: 4, W: 4, E: 4, R: 3 } });
    w.issue(pudge.id, { type: 'toggle', slot: 'W' });
    w.step();
    w.issue(pudge.id, { type: 'toggle', slot: 'W' });
    w.step();
    w.issue(pudge.id, { type: 'toggle', slot: 'W' });
    w.issue(pudge.id, { type: 'cast', slot: 'E' });
    w.issue(pudge.id, { type: 'cast', slot: 'Q', target: { dir: { x: 0, y: -1 } } });
    runFor(w, 1);
    expect(pudge.hero!.abilityCasts).toEqual({ pudge_rot: 2, pudge_meat_shield: 1, pudge_meat_hook: 1 });
  });

  it('winRateOutliers needs enough games and a deviation above the threshold', () => {
    const sums = [sum('axe', 40, 0.6), sum('sven', 40, 0.58), sum('lina', 10, 0.9), sum('pudge', 30, 0.3)];
    expect(winRateOutliers(sums)).toEqual(['axe', 'pudge']);
    expect(winRateOutliers(sums, { minGames: 5 })).toEqual(['axe', 'lina', 'pudge']);
    expect(winRateOutliers(sums, { threshold: 0.15 })).toEqual(['pudge']);
  });

  it('unusedAbilities lists active abilities cast less than 0.5 times per game', () => {
    const sums = [
      sum('axe', 10, 0.5, { axe_berserkers_call: 3, axe_battle_hunger: 0.4, axe_culling_blade: 0.5 }),
      // 帕吉的肢解没有记录（一次都没放过）也要列出；腐肉堆积是被动，不列
      sum('pudge', 10, 0.5, { pudge_meat_hook: 2, pudge_rot: 1, pudge_meat_shield: 1 }),
    ];
    expect(unusedAbilities(sums)).toEqual(['axe:axe_battle_hunger', 'pudge:pudge_dismember']);
  });

  it('heroTable renders one row per hero with flagged rows marked', () => {
    const sums = [sum('axe', 40, 0.6), sum('lina', 40, 0.5), sum('zeus', 40, 0.4)];
    const plain = heroTable(sums, new Set(['axe', 'zeus']), false);
    const rows = plain.split('\n').filter((l) => l.startsWith('|'));
    // 表头 + 分隔行 + 每个英雄一行
    expect(rows).toHaveLength(2 + sums.length);
    expect(rows[2]).toContain('斧王');
    expect(rows[2]).toContain('偏离');
    expect(rows[3]).toContain('莉娜');
    expect(rows[3]).not.toContain('偏离');
    expect(rows[4]).toContain('偏离');
    expect(plain).not.toContain('\x1b[');
    const colored = heroTable(sums, new Set(['axe']), true);
    const crow = colored.split('\n').filter((l) => l.includes('斧王'));
    expect(crow[0]).toContain('\x1b[31m');
    expect(colored.split('\n').find((l) => l.includes('莉娜'))).not.toContain('\x1b[31m');
  });
});
