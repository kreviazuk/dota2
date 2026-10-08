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

const canvas = document.getElementById('game') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui') as HTMLDivElement;
const hint = document.createElement('div');
hint.className = 'rotate-hint';
hint.textContent = '请将手机横屏游玩';
document.body.appendChild(hint);

/** 渲染器在启动时异步选择（3D 优先，WebGL 不可用时退回 2D），见 boot() */
let renderer!: GameRenderer;

/** P1：3v3 全部是斧王 */
const TEAM_HEROES = ['axe', 'axe', 'axe'];
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

/** 主菜单背景：全 AI 演示对局，镜头跟随天辉第一个英雄 */
function startDemoMatch(): void {
  teardown();
  const match = new Match({ seed: newSeed(), radiantHeroes: TEAM_HEROES, direHeroes: TEAM_HEROES, playerSlot: null, difficulty: 'normal', recordEvents: true });
  const followId = match.world.heroes()[0]?.id ?? null;
  session = { match, hud: null, controls: null, followId, demo: true, frozen: false };
  renderer.snapTo(match.world, followId);
}

function showMenu(): void {
  closePause();
  uiRoot.innerHTML = '';
  startDemoMatch();
  showStartScreen(uiRoot, startGame);
}

function startGame(difficulty: Difficulty): void {
  teardown();
  closePause();
  lastDifficulty = difficulty;
  uiRoot.innerHTML = '';
  const match = new Match({ seed: newSeed(), radiantHeroes: TEAM_HEROES, direHeroes: TEAM_HEROES, playerSlot: 0, difficulty, recordEvents: true });
  const hud = new Hud(uiRoot, match, renderer.camera);
  const controls = new Controls(hud, match, renderer.camera);
  hud.pauseBtn.addEventListener('click', pause);
  session = { match, hud, controls, followId: match.playerUnitId, demo: false, frozen: false };
  renderer.snapTo(match.world, match.playerUnitId);
}

function pause(): void {
  const s = session;
  if (!s || s.demo || s.frozen || paused || s.match.over) return;
  paused = true;
  s.controls?.reset();
  pauseMenu = showPauseMenu(uiRoot, resume, showMenu);
}

function resume(): void {
  closePause();
  session?.controls?.reset();
  last = performance.now();
}

function showResult(s: Session): void {
  resultTimer = null;
  if (session !== s) return;
  s.controls?.destroy();
  s.hud?.destroy();
  session = { ...s, hud: null, controls: null, demo: true, frozen: true };
  showResultScreen(uiRoot, s.match, () => startGame(lastDifficulty), showMenu);
}

function frame(now: number): void {
  const dt = Math.min(MAX_FRAME_DT, (now - last) / 1000) * timeScale;
  last = now;
  const s = session;
  if (s && !paused && !s.frozen) {
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
  renderer.render(cur?.match.world ?? null, alpha, cur?.followId ?? null, paused ? 0 : dt, cur?.controls?.aim ?? null);
  requestAnimationFrame(frame);
}

window.addEventListener('keydown', (e) => {
  if (e.code !== 'Escape' || e.repeat) return;
  if (paused) resume();
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
      },
    });
  }
  showMenu();
  last = performance.now();
  requestAnimationFrame(frame);
}

void boot();
