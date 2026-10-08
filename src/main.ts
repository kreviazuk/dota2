/// <reference types="vite/client" />
import './ui/styles.css';
import { Match } from './game/match';
import { createRenderer } from './render/createRenderer';
import type { GameRenderer } from './render/view';
import { Hud } from './ui/hud';
import { Controls } from './input/controls';
import { showPauseMenu, showResultScreen, showStartScreen } from './ui/screens';
import { DT } from './sim/core/constants';
import type { Difficulty } from './sim/core/types';
import { applyControl, applyFear, applySlow } from './sim/status';
import { blinkTo, knockback } from './sim/systems/motion';
import { addShield } from './sim/shields';
import { Rng } from './sim/core/rng';
import { draftTeams } from './game/draft';
import { availableHeroes } from './game/roster';
import { refreshHero, setHeroLevel } from './game/debug';
import { showHeroSelect, type HeroSelectScreen } from './ui/heroSelect';
import { loadLastHero, loadPrefs, saveLastHero, savePrefs, type Prefs } from './ui/settings';
import type { AbilitySlot } from './sim/core/types';
import type { CastTarget } from './sim/heroes/types';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui') as HTMLDivElement;
const hint = document.createElement('div');
hint.className = 'rotate-hint';
hint.textContent = '请将手机横屏游玩';
document.body.appendChild(hint);

/** 渲染器在启动时异步选择（3D 优先，WebGL 不可用时退回 2D），见 boot() */
let renderer!: GameRenderer;

/** 对局结束后停留多久再弹出结算界面（毫秒），让玩家看到遗迹爆炸 */
const RESULT_DELAY_MS = 1800;
/** 单帧最多追赶的真实时间（秒），防止切回页面后一次跑太多逻辑帧 */
const MAX_FRAME_DT = 0.25;

interface Session {
  match: Match;
  hud: Hud | null;
  controls: Controls | null;
  followId: number | null;
  /** 主菜单背景里的 AI 演示局 */
  demo: boolean;
  /** 结算界面背景：停在对局结束的那一刻，不再推进 */
  frozen: boolean;
}

let session: Session | null = null;
let paused = false;
let pauseMenu: HTMLDivElement | null = null;
let resultTimer: number | null = null;
let lastDifficulty: Difficulty = 'normal';
/** 上次选的英雄（"再来一局"沿用；选英雄界面默认选中） */
let lastHero: string | null = loadLastHero();
/** 自动加点 / 站立自动攻击（暂停菜单里的开关，HUD 和 Controls 共用同一个对象） */
const prefs: Prefs = loadPrefs();
let heroSelect: HeroSelectScreen | null = null;
let acc = 0;
let last = performance.now();
/** 时间倍率（只有开发钩子会改它，用于自动化测试慢放截图；正式游戏恒为 1） */
let timeScale = 1;

const newSeed = (): number => Date.now() & 0x7fffffff;

function teardown(): void {
  if (resultTimer !== null) window.clearTimeout(resultTimer);
  resultTimer = null;
  session?.controls?.destroy();
  session?.hud?.destroy();
  session = null;
  acc = 0;
}

function closePause(): void {
  pauseMenu?.remove();
  pauseMenu = null;
  paused = false;
}

function closeHeroSelect(): void {
  heroSelect?.close();
  heroSelect = null;
  last = performance.now();
}

/** 主菜单背景：全 AI 演示对局，镜头跟随天辉第一个英雄 */
function startDemoMatch(): void {
  teardown();
  const seed = newSeed();
  // 随机阵容（电脑补位规则，见 game/draft.ts）
  const d = draftTeams(new Rng(seed), availableHeroes());
  const match = new Match({ seed, radiantHeroes: d.radiant, direHeroes: d.dire, playerSlot: null, difficulty: 'normal', recordEvents: true });
  const followId = match.world.heroes()[0]?.id ?? null;
  session = { match, hud: null, controls: null, followId, demo: true, frozen: false };
  renderer.snapTo(match.world, followId);
}

function showMenu(): void {
  closePause();
  closeHeroSelect();
  uiRoot.innerHTML = '';
  startDemoMatch();
  showTitle();
}

/** 开始界面（背景是演示局）：选难度 → 选英雄 */
function showTitle(): void {
  showStartScreen(uiRoot, lastDifficulty, openHeroSelect);
}

function openHeroSelect(difficulty: Difficulty): void {
  lastDifficulty = difficulty;
  closeHeroSelect();
  heroSelect = showHeroSelect(
    uiRoot,
    { difficulty, initialHero: lastHero, preview: renderer.kind === '3d' ? 'webgl' : '2d' },
    (heroId) => {
      heroSelect = null;
      lastHero = heroId;
      saveLastHero(heroId);
      startGame(difficulty, heroId);
    },
    () => {
      heroSelect = null;
      last = performance.now();
      showTitle();
    },
  );
}

/** 开局：玩家英雄放天辉 0 号位，其余由电脑补位；lineup 给开发钩子指定队友（最多 2 名）和敌人（3 名） */
function startGame(difficulty: Difficulty, heroId: string, lineup: { radiant?: string[]; dire?: string[] } = {}): void {
  teardown();
  closePause();
  closeHeroSelect();
  lastDifficulty = difficulty;
  lastHero = heroId;
  uiRoot.innerHTML = '';
  const seed = newSeed();
  const d = draftTeams(new Rng(seed), availableHeroes(), heroId);
  const radiant = lineup.radiant ? [heroId, ...lineup.radiant, ...d.radiant.slice(1)].slice(0, 3) : d.radiant;
  const dire = lineup.dire ? [...lineup.dire, ...d.dire].slice(0, 3) : d.dire;
  const match = new Match({ seed, radiantHeroes: radiant, direHeroes: dire, playerSlot: 0, difficulty, recordEvents: true });
  const me = match.world.getUnit(match.playerUnitId);
  if (me) me.autoAttack = prefs.autoAttack;
  const hud = new Hud(uiRoot, match, renderer.camera, prefs);
  const controls = new Controls(hud, match, renderer.camera, prefs);
  hud.pauseBtn.addEventListener('click', pause);
  session = { match, hud, controls, followId: match.playerUnitId, demo: false, frozen: false };
  renderer.snapTo(match.world, match.playerUnitId);
}

function onPrefsChange(p: Prefs): void {
  savePrefs(p);
  const s = session;
  const me = s && !s.demo ? s.match.world.getUnit(s.match.playerUnitId) : undefined;
  if (me) me.autoAttack = p.autoAttack;
}

function pause(): void {
  const s = session;
  if (!s || s.demo || s.frozen || paused || s.match.over) return;
  paused = true;
  s.controls?.reset();
  // 暂停菜单有自己的天赋树：收起 HUD 的天赋弹窗（否则半透明遮罩下会透出来、压在开关上）
  s.hud?.root.classList.add('paused');
  pauseMenu = showPauseMenu(uiRoot, { match: s.match, prefs, onPrefsChange }, resume, showMenu);
}

function resume(): void {
  closePause();
  session?.hud?.root.classList.remove('paused');
  session?.controls?.reset();
  last = performance.now();
}

function showResult(s: Session): void {
  resultTimer = null;
  if (session !== s) return;
  s.controls?.destroy();
  s.hud?.destroy();
  session = { ...s, hud: null, controls: null, demo: true, frozen: true };
  const hero = lastHero ?? availableHeroes()[0];
  showResultScreen(uiRoot, s.match, () => startGame(lastDifficulty, hero), showMenu);
}

function frame(now: number): void {
  const dt = Math.min(MAX_FRAME_DT, (now - last) / 1000) * timeScale;
  last = now;
  const s = session;
  // 选英雄界面几乎不透明：背景演示局停住不画，省下 GPU 给 3D 预览
  const bgHidden = heroSelect !== null;
  if (s && !paused && !s.frozen && !bgHidden) {
    acc += dt;
    while (acc >= DT && !s.match.over) {
      s.match.step(s.controls?.drain() ?? []);
      acc -= DT;
    }
    renderer.consume(s.match.world.events.drain(), s.match.world, s.followId);
    s.hud?.update(dt);
    if (s.match.over) {
      if (s.demo) startDemoMatch();
      else if (resultTimer === null) resultTimer = window.setTimeout(() => showResult(s), RESULT_DELAY_MS);
    }
  }
  const cur = session;
  const alpha = !cur || cur.match.over ? 1 : Math.min(1, acc / DT);
  if (!bgHidden) renderer.render(cur?.match.world ?? null, alpha, cur?.followId ?? null, paused ? 0 : dt, cur?.controls?.aim ?? null);
  requestAnimationFrame(frame);
}

window.addEventListener('keydown', (e) => {
  if (e.code !== 'Escape' || e.repeat) return;
  if (heroSelect) {
    closeHeroSelect();
    showTitle();
  } else if (paused) resume();
  else pause();
});
window.addEventListener('resize', () => renderer?.resize());
// 长按不弹出系统菜单
window.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
  last = performance.now();
});
// 转成竖屏时会被"请横屏"提示挡住，自动暂停
window.matchMedia('(orientation: portrait)').addEventListener('change', (e) => {
  if (e.matches) pause();
});

/** 开发钩子 __game.debug：缺省作用于玩家英雄，all = true 时作用于全部英雄 */
function devDebug() {
  const cur = () => {
    const s = session;
    if (!s) throw new Error('没有进行中的对局');
    return s;
  };
  const targets = (all?: boolean) => {
    const s = cur();
    const w = s.match.world;
    return all ? w.heroes() : w.heroes().filter((h) => h.id === s.match.playerUnitId);
  };
  return {
    // 升级：玩家英雄只给技能点、不选天赋（留给 HUD 的加点和天赋弹窗）；其他英雄按 AI 的加点和天赋预设
    level(n: number, all?: boolean) {
      const s = cur();
      for (const u of targets(all)) {
        const me = u.id === s.match.playerUnitId;
        setHeroLevel(s.match.world, u, n, me ? { learn: 'none', talents: false } : {});
      }
    },
    refresh(all?: boolean) {
      for (const u of targets(all)) refreshHero(cur().match.world, u);
    },
    lineup() {
      const s = cur();
      return s.match.world.heroes().map((h) => ({ id: h.id, hero: h.defId, team: h.team, level: h.hero?.level ?? 0, player: h.id === s.match.playerUnitId, alive: h.alive }));
    },
    freezeAI(on: boolean) {
      cur().match.aiPaused = on;
    },
    place(unitId: number, x: number, y: number) {
      const u = cur().match.world.getUnit(unitId);
      if (!u) return;
      u.pos = { x, y };
      u.prevPos = { x, y };
    },
    cast(slot: AbilitySlot, target?: CastTarget) {
      const s = cur();
      if (s.match.playerUnitId !== null) s.match.world.issue(s.match.playerUnitId, { type: 'cast', slot, target });
    },
    // 底层工具（参数和 game/debug.ts 一样）
    setHeroLevel,
    refreshHero,
  };
}

async function boot(): Promise<void> {
  renderer = await createRenderer(canvas);
  if (import.meta.env.DEV) {
    // 仅开发服务器：供浏览器自动化测试读取和驱动对局（生产构建会整段删除）
    Object.assign(window, {
      __game: {
        get session() { return session; },
        renderer,
        get timeScale() { return timeScale; },
        set timeScale(v: number) { timeScale = v; },
        // 直接调用 sim 的状态 / 位移 / 护盾函数（截图脚本用来制造各种状态；参数和 sim 里一样，world 取 session.match.world）
        sim: { applyControl, applySlow, applyFear, knockback, blinkTo, addShield },
        // 跳过界面直接开一局：__game.start({ hero: 'axe', radiant?: [队友], dire?: [敌人], difficulty? })
        start: (o: { hero: string; radiant?: string[]; dire?: string[]; difficulty?: Difficulty }) =>
          startGame(o.difficulty ?? lastDifficulty, o.hero, { radiant: o.radiant, dire: o.dire }),
        debug: devDebug(),
      },
    });
  }
  showMenu();
  last = performance.now();
  requestAnimationFrame(frame);
}

void boot();
