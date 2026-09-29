import { Match } from '../src/game/match';
import type { World } from '../src/sim/world';
import { netWorth } from '../src/sim/systems/progress';
import { Team, type Difficulty } from '../src/sim/core/types';
import { DIFFICULTY } from '../src/ai/difficulty';
import { getHeroDef } from '../src/sim/heroes/index';

interface Args { games: number; seed: number; difficulty: Difficulty; radiant: string[]; dire: string[] }

function parseArgs(argv: string[]): Args {
  const get = (k: string, d: string) => {
    const i = argv.indexOf(`--${k}`);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
  };
  const a: Args = {
    games: Number(get('games', '20')),
    seed: Number(get('seed', '1')),
    difficulty: get('difficulty', 'normal') as Difficulty,
    radiant: get('radiant', 'axe,axe,axe').split(','),
    dire: get('dire', 'axe,axe,axe').split(','),
  };
  if (!Number.isInteger(a.games) || a.games < 1) throw new Error(`--games 必须是正整数：${get('games', '')}`);
  if (!Number.isInteger(a.seed)) throw new Error(`--seed 必须是整数：${get('seed', '')}`);
  if (!(a.difficulty in DIFFICULTY)) throw new Error(`--difficulty 只能是 ${Object.keys(DIFFICULTY).join(' / ')}：${a.difficulty}`);
  for (const id of [...a.radiant, ...a.dire]) getHeroDef(id);
  return a;
}

const CHECKPOINTS = [180, 360, 600, 840];
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const pct = (k: number, n: number) => `${((k / n) * 100).toFixed(1)}%`;
const red = (s: string) => (process.stdout.isTTY ? `\x1b[31m${s}\x1b[0m` : s);
const TEAM_NAME = { radiant: '天辉', dire: '夜魇' } as const;
type Side = keyof typeof TEAM_NAME;
const side = (t: Team): Side => (t === Team.Radiant ? 'radiant' : 'dire');

interface GameResult {
  winner: Side | 'timeout';
  /** 超时局按"建筑血量 + 净资产"判定的胜方 */
  judged: Side | null;
  duration: number;
  samples: Record<number, { level: number; netWorth: number }>;
  falls: Record<string, number>;
}

/**
 * 超时判定（设计文档 §11.1 安全阀）：每座存活建筑（不含泉水）按剩余血量比例计 0–1 分，
 * 再加全队净资产占双方总和的比例（0–1 分），总分高的一方获胜。
 */
function judgeTimeout(w: World): Team {
  const buildings = (t: Team) =>
    w.units
      .filter((u) => u.kind === 'building' && u.team === t && u.alive && u.building?.type !== 'fountain')
      .reduce((s, u) => s + u.hp / u.stats.maxHp, 0);
  const nw = (t: Team) => w.heroes(t).reduce((s, h) => s + netWorth(h), 0);
  const total = nw(Team.Radiant) + nw(Team.Dire) || 1;
  const score = (t: Team) => buildings(t) + nw(t) / total;
  return score(Team.Radiant) >= score(Team.Dire) ? Team.Radiant : Team.Dire;
}

function runGame(a: Args, seed: number): GameResult {
  const m = new Match({ seed, radiantHeroes: a.radiant, direHeroes: a.dire, playerSlot: null, difficulty: a.difficulty });
  const w = m.world;
  const samples: GameResult['samples'] = {};
  const falls: Record<string, number> = {};
  w.killListeners.push((world, victim) => {
    if (victim.building) falls[`${TEAM_NAME[side(victim.team)]}${victim.building.key}`] = world.time;
  });
  let ci = 0;
  while (w.winner === null && w.time < w.balance.maxGameTime) {
    m.step();
    if (ci < CHECKPOINTS.length && w.time >= CHECKPOINTS[ci]) {
      const hs = w.heroes();
      samples[CHECKPOINTS[ci]] = { level: avg(hs.map((h) => h.hero!.level)), netWorth: avg(hs.map((h) => netWorth(h))) };
      ci++;
    }
  }
  const winner = w.winner === null ? 'timeout' : side(w.winner);
  return { winner, judged: w.winner === null ? side(judgeTimeout(w)) : null, duration: w.time, samples, falls };
}

function main(): void {
  const a = parseArgs(process.argv.slice(2));
  const results: GameResult[] = [];
  const t0 = Date.now();
  for (let i = 0; i < a.games; i++) {
    const r = runGame(a, a.seed + i);
    results.push(r);
    const label = r.winner === 'timeout' ? red(`超时（判定${TEAM_NAME[r.judged!]}胜）`) : `${TEAM_NAME[r.winner]}胜`;
    console.log(`第 ${i + 1} 局（种子 ${a.seed + i}）：${label}  ${fmtTime(r.duration)}`);
  }
  const n = results.length;
  const count = (s: Side) => results.filter((r) => r.winner === s).length;
  const timeouts = results.filter((r) => r.winner === 'timeout');
  const judged = (s: Side) => timeouts.filter((r) => r.judged === s).length;
  const durs = results.filter((r) => r.winner !== 'timeout').map((r) => r.duration).sort((x, y) => x - y);
  const inRange = durs.filter((d) => d >= 13 * 60 && d <= 22 * 60).length;
  console.log('\n===== 平衡报告 =====');
  console.log(`对局数 ${n}，难度 ${a.difficulty}，耗时 ${((Date.now() - t0) / 1000).toFixed(1)} 秒`);
  console.log(`天辉胜率 ${pct(count('radiant'), n)}，夜魇胜率 ${pct(count('dire'), n)}，超时 ${timeouts.length} 局`);
  if (timeouts.length) {
    console.log(red(`超时局按建筑血量 + 净资产判定：天辉 ${judged('radiant')} 局，夜魇 ${judged('dire')} 局`));
    console.log(`含超时判定的天辉胜率 ${pct(count('radiant') + judged('radiant'), n)}`);
  }
  if (durs.length) {
    console.log(`时长（不含超时）：平均 ${fmtTime(avg(durs))}，中位 ${fmtTime(durs[Math.floor(durs.length / 2)])}，最短 ${fmtTime(durs[0])}，最长 ${fmtTime(durs[durs.length - 1])}`);
  }
  console.log(`13–22 分钟内结束：${pct(inRange, n)}（目标 ≥ 80%）`);
  console.log('\n时间点 | 平均等级 | 平均净资产');
  for (const c of CHECKPOINTS) {
    const s = results.map((r) => r.samples[c]).filter(Boolean);
    if (s.length) console.log(`${fmtTime(c)} | ${avg(s.map((x) => x.level)).toFixed(1)} | ${Math.round(avg(s.map((x) => x.netWorth)))}`);
  }
  const keys = [...new Set(results.flatMap((r) => Object.keys(r.falls)))].sort();
  if (keys.length) {
    console.log('\n建筑 | 平均被摧毁时间 | 被摧毁局数');
    for (const k of keys) {
      const ts = results.map((r) => r.falls[k]).filter((x) => x !== undefined);
      console.log(`${k} | ${fmtTime(avg(ts))} | ${ts.length}`);
    }
  }
}

main();
