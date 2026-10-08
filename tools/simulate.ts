import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Match } from '../src/game/match';
import type { World } from '../src/sim/world';
import { netWorth } from '../src/sim/systems/progress';
import { Team, type Difficulty } from '../src/sim/core/types';
import { Rng } from '../src/sim/core/rng';
import { DIFFICULTY } from '../src/ai/difficulty';
import { getHeroDef } from '../src/sim/heroes/index';
import { availableHeroes } from '../src/game/roster';
import { draftTeams } from '../src/game/draft';
import {
  heroTable, recordsFromWorld, summarizeHeroes, unusedAbilities, winRateOutliers,
  type HeroGameRecord, type HeroSummary,
} from '../src/game/simStats';

/**
 * 批量模拟（设计文档 §11.2）：
 *   npm run sim -- --games 100 --seed 1 --difficulty normal [--lineup random|mirror] [--heroes axe,sven,…]
 *                  [--radiant a,b,c --dire d,e,f] [--workers 4] [--report out.md]
 * 没有给 --radiant / --dire 时每局随机抽阵容（random：draftTeams；mirror：两边相同）。
 * --workers N 用 worker_threads 把种子分给 N 个线程，输出与单线程完全一致（只有耗时行不同）。
 */

type Lineup = 'random' | 'mirror' | 'fixed';
interface Args {
  games: number; seed: number; difficulty: Difficulty; lineup: Lineup; pool: string[];
  radiant: string[]; dire: string[]; workers: number; report: string | null;
}

function parseArgs(argv: string[]): Args {
  const has = (k: string) => argv.includes(`--${k}`);
  const get = (k: string, d: string) => {
    const i = argv.indexOf(`--${k}`);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
  };
  const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
  const fixed = has('radiant') || has('dire');
  const lineup = (fixed ? 'fixed' : get('lineup', 'random')) as Lineup;
  const a: Args = {
    games: Number(get('games', '20')),
    seed: Number(get('seed', '1')),
    difficulty: get('difficulty', 'normal') as Difficulty,
    lineup,
    pool: has('heroes') ? list(get('heroes', '')) : availableHeroes(),
    radiant: list(get('radiant', 'axe,axe,axe')),
    dire: list(get('dire', 'axe,axe,axe')),
    workers: Number(get('workers', '1')),
    report: has('report') ? get('report', '') || null : null,
  };
  if (!Number.isInteger(a.games) || a.games < 1) throw new Error(`--games 必须是正整数：${get('games', '')}`);
  if (!Number.isInteger(a.seed)) throw new Error(`--seed 必须是整数：${get('seed', '')}`);
  if (!(a.difficulty in DIFFICULTY)) throw new Error(`--difficulty 只能是 ${Object.keys(DIFFICULTY).join(' / ')}：${a.difficulty}`);
  if (!['random', 'mirror', 'fixed'].includes(a.lineup) || (!fixed && a.lineup === 'fixed')) {
    throw new Error(`--lineup 只能是 random / mirror：${a.lineup}`);
  }
  if (!Number.isInteger(a.workers) || a.workers < 1) throw new Error(`--workers 必须是正整数：${get('workers', '')}`);
  if (has('report') && !a.report) throw new Error('--report 需要文件路径');
  if (!a.pool.length) throw new Error('--heroes 为空');
  for (const id of [...a.pool, ...a.radiant, ...a.dire]) getHeroDef(id);
  return a;
}

const CHECKPOINTS = [180, 360, 600, 840];
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const pct = (k: number, n: number) => `${((k / n) * 100).toFixed(1)}%`;
const TEAM_NAME = { radiant: '天辉', dire: '夜魇' } as const;
type Side = keyof typeof TEAM_NAME;
const side = (t: Team): Side => (t === Team.Radiant ? 'radiant' : 'dire');
const heroName = (id: string) => getHeroDef(id).name;

interface GameResult {
  seed: number;
  radiant: string[];
  dire: string[];
  winner: Side | 'timeout';
  /** 超时局按"建筑血量 + 净资产"判定的胜方 */
  judged: Side | null;
  duration: number;
  samples: Record<number, { level: number; netWorth: number }>;
  falls: Record<string, number>;
  heroes: HeroGameRecord[];
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

/** 这一局的阵容：固定、随机（draftTeams）或镜像（随机 3 人，两边相同）；只由种子决定 */
function lineupFor(a: Args, seed: number): { radiant: string[]; dire: string[] } {
  if (a.lineup === 'fixed') return { radiant: a.radiant, dire: a.dire };
  const d = draftTeams(new Rng(seed ^ 0x5eed), a.pool);
  return a.lineup === 'mirror' ? { radiant: d.radiant, dire: [...d.radiant] } : d;
}

function runGame(a: Args, seed: number): GameResult {
  const { radiant, dire } = lineupFor(a, seed);
  const m = new Match({ seed, radiantHeroes: radiant, direHeroes: dire, playerSlot: null, difficulty: a.difficulty });
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
  const judgedTeam = w.winner === null ? judgeTimeout(w) : null;
  return {
    seed, radiant, dire,
    winner: w.winner === null ? 'timeout' : side(w.winner),
    judged: judgedTeam === null ? null : side(judgedTeam),
    duration: w.time, samples, falls,
    heroes: recordsFromWorld(w, judgedTeam),
  };
}

// ---------------------------------------------------------------- worker 线程
interface WorkerInput { args: Args; seeds: number[] }

function workerMain(): void {
  const { args, seeds } = workerData as WorkerInput;
  for (const s of seeds) parentPort!.postMessage(runGame(args, s));
}

// ---------------------------------------------------------------- 主线程
/** 按种子顺序跑完所有对局；onResult 按种子顺序依次回调（多线程时先到的结果缓存到轮到它为止） */
async function runAll(a: Args, onResult: (r: GameResult, i: number) => void): Promise<GameResult[]> {
  const seeds = Array.from({ length: a.games }, (_, i) => a.seed + i);
  const results: (GameResult | undefined)[] = new Array(a.games);
  let next = 0;
  const accept = (r: GameResult) => {
    results[r.seed - a.seed] = r;
    while (next < a.games && results[next]) onResult(results[next]!, next++);
  };
  const n = Math.min(a.workers, a.games);
  if (n <= 1) {
    for (const s of seeds) accept(runGame(a, s));
    return results as GameResult[];
  }
  const file = fileURLToPath(import.meta.url);
  await Promise.all(
    Array.from({ length: n }, (_, k) => {
      const mine = seeds.filter((_, i) => i % n === k);
      return new Promise<void>((resolve, reject) => {
        const wk = new Worker(file, {
          argv: ['--worker'], execArgv: process.execArgv, workerData: { args: a, seeds: mine } satisfies WorkerInput,
        });
        wk.on('message', (r: GameResult) => accept(r));
        wk.on('error', reject);
        wk.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`模拟线程 ${k} 退出码 ${code}`))));
      });
    }),
  );
  return results as GameResult[];
}

const lineupText = (r: GameResult) => `${r.radiant.map(heroName).join(' ')} vs ${r.dire.map(heroName).join(' ')}`;
const gameLine = (r: GameResult, i: number, color: boolean) => {
  const red = (s: string) => (color ? `\x1b[31m${s}\x1b[0m` : s);
  const label = r.winner === 'timeout' ? red(`超时（判定${TEAM_NAME[r.judged!]}胜）`) : `${TEAM_NAME[r.winner]}胜`;
  return `第 ${i + 1} 局（种子 ${r.seed}）：${lineupText(r)}：${label}  ${fmtTime(r.duration)}`;
};

interface Section { title: string; lines: string[]; table?: boolean }

/** 汇总报告的各节（终端和 Markdown 共用）；color 只影响终端 */
function summarize(a: Args, results: GameResult[], color: boolean): { sections: Section[]; sums: HeroSummary[] } {
  const red = (s: string) => (color ? `\x1b[31m${s}\x1b[0m` : s);
  const n = results.length;
  const count = (s: Side) => results.filter((r) => r.winner === s).length;
  const timeouts = results.filter((r) => r.winner === 'timeout');
  const judged = (s: Side) => timeouts.filter((r) => r.judged === s).length;
  const durs = results.filter((r) => r.winner !== 'timeout').map((r) => r.duration).sort((x, y) => x - y);
  const inRange = durs.filter((d) => d >= 13 * 60 && d <= 22 * 60).length;
  const lineupName = a.lineup === 'fixed' ? `固定（${a.radiant.join(',')} vs ${a.dire.join(',')}）` : `${a.lineup === 'random' ? '随机' : '镜像'}（${a.pool.length} 名英雄）`;

  const overall: string[] = [
    `对局数 ${n}，难度 ${a.difficulty}，阵容 ${lineupName}`,
    `天辉胜率 ${pct(count('radiant'), n)}，夜魇胜率 ${pct(count('dire'), n)}，超时 ${timeouts.length} 局`,
  ];
  if (timeouts.length) {
    overall.push(red(`超时局按建筑血量 + 净资产判定：天辉 ${judged('radiant')} 局，夜魇 ${judged('dire')} 局`));
    overall.push(`含超时判定的天辉胜率 ${pct(count('radiant') + judged('radiant'), n)}`);
  }
  if (durs.length) {
    overall.push(`时长（不含超时）：平均 ${fmtTime(avg(durs))}，中位 ${fmtTime(durs[Math.floor(durs.length / 2)])}，最短 ${fmtTime(durs[0])}，最长 ${fmtTime(durs[durs.length - 1])}`);
  }
  overall.push(`13–22 分钟内结束：${pct(inRange, n)}（目标 ≥ 80%）`);

  const checkpoints = ['| 时间点 | 平均等级 | 平均净资产 |', '|---|---|---|'];
  for (const c of CHECKPOINTS) {
    const s = results.map((r) => r.samples[c]).filter(Boolean);
    if (s.length) checkpoints.push(`| ${fmtTime(c)} | ${avg(s.map((x) => x.level)).toFixed(1)} | ${Math.round(avg(s.map((x) => x.netWorth)))} |`);
  }

  const sections: Section[] = [{ title: '总体', lines: overall }, { title: '各时间点', lines: checkpoints, table: true }];
  const keys = [...new Set(results.flatMap((r) => Object.keys(r.falls)))].sort();
  if (keys.length) {
    const b = ['| 建筑 | 平均被摧毁时间 | 被摧毁局数 |', '|---|---|---|'];
    for (const k of keys) {
      const ts = results.map((r) => r.falls[k]).filter((x) => x !== undefined);
      b.push(`| ${k} | ${fmtTime(avg(ts))} | ${ts.length} |`);
    }
    sections.push({ title: '建筑', lines: b, table: true });
  }

  const sums = summarizeHeroes(results.flatMap((r) => r.heroes));
  const outliers = winRateOutliers(sums);
  const heroLines = heroTable(sums, new Set(outliers), color).split('\n');
  heroLines.push('');
  heroLines.push(outliers.length
    ? red(`含判定胜率偏离 50% 超过 8 个百分点（≥ 20 场）：${outliers.map(heroName).join('、')}`)
    : '没有含判定胜率偏离 50% 超过 8 个百分点（≥ 20 场）的英雄');
  sections.push({ title: '各英雄出场胜率', lines: heroLines, table: true });

  const casts = ['| 英雄 | 场均施放次数 |', '|---|---|'];
  for (const s of sums) {
    const def = getHeroDef(s.heroId);
    const parts = def.abilities.filter((ab) => ab.id in s.castsPerGame).map((ab) => `${ab.name} ${s.castsPerGame[ab.id].toFixed(1)}`);
    casts.push(`| ${heroName(s.heroId)} | ${parts.join('，')} |`);
  }
  sections.push({ title: '各英雄场均施放次数', lines: casts, table: true });

  const unused = unusedAbilities(sums);
  sections.push({
    title: '未使用的技能（场均 < 0.5 次）',
    lines: unused.length ? unused.map((k) => red(`- ${k}`)) : ['（无）'],
  });
  return { sections, sums };
}

function markdownReport(a: Args, argv: string[], results: GameResult[]): string {
  const { sections } = summarize(a, results, false);
  const out = [
    '# 批量模拟报告',
    '',
    `命令：\`npm run sim -- ${argv.join(' ')}\``,
    '',
    '## 每局结果',
    '',
    '```',
    ...results.map((r, i) => gameLine(r, i, false)),
    '```',
  ];
  for (const s of sections) {
    out.push('', `## ${s.title}`, '');
    // 非表格的行写成列表项（否则 Markdown 会把相邻的行合成一段）
    out.push(...(s.table ? s.lines : s.lines.map((l) => (l.startsWith('- ') || l.startsWith('（') ? l : `- ${l}`))));
  }
  return out.join('\n') + '\n';
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const a = parseArgs(argv);
  const color = !!process.stdout.isTTY;
  const t0 = Date.now();
  const results = await runAll(a, (r, i) => console.log(gameLine(r, i, color)));
  const { sections } = summarize(a, results, color);
  console.log('\n===== 平衡报告 =====');
  for (const s of sections) {
    console.log(`\n【${s.title}】`);
    for (const l of s.lines) console.log(l);
  }
  console.log(`\n耗时 ${((Date.now() - t0) / 1000).toFixed(1)} 秒（${Math.min(a.workers, a.games)} 个线程）`);
  if (a.report) {
    writeFileSync(a.report, markdownReport(a, argv, results));
    console.log(`报告已写入 ${a.report}`);
  }
}

if (!isMainThread && process.argv.includes('--worker')) {
  workerMain();
} else {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
