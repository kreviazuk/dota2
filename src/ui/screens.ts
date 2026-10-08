import type { Match } from '../game/match';
import type { Difficulty } from '../sim/core/types';
import { Team } from '../sim/core/types';
import type { Unit } from '../sim/entities/unit';
import type { World } from '../sim/world';
import { netWorth } from '../sim/systems/progress';
import { getHeroDef } from '../sim/heroes/index';
import { DIFFICULTY_NAMES } from '../ai/difficulty';
import type { Prefs } from './settings';

const el = (parent: HTMLElement, html: string, extra = ''): HTMLDivElement => {
  const d = document.createElement('div');
  d.className = `screen${extra ? ` ${extra}` : ''}`;
  d.innerHTML = html;
  parent.appendChild(d);
  return d;
};

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function showStartScreen(parent: HTMLElement, initial: Difficulty, onStart: (d: Difficulty) => void): HTMLDivElement {
  let diff: Difficulty = initial;
  const s = el(parent, `
    <div class="title">中路风云</div>
    <div class="subtitle">3v3 · 单路对决 · 先推倒对方遗迹者获胜</div>
    <div class="btn-row diff">
      ${(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => `<div class="btn secondary${d === diff ? ' selected' : ''}" data-d="${d}">${DIFFICULTY_NAMES[d]}</div>`).join('')}
    </div>
    <div class="btn start">选择英雄</div>
    <div class="subtitle">左侧摇杆移动 · 右侧技能 · 拖动技能键瞄准</div>
    <div class="kb-hint">键盘：方向键 / A S D 移动 · Q W E R 施法（朝鼠标） · F / G 额外技能 · Shift+技能键 加点 · 空格 攻击 · T 回城 · Esc 暂停</div>`);
  s.querySelectorAll<HTMLDivElement>('.diff .btn').forEach((b) =>
    b.addEventListener('click', () => {
      diff = b.dataset.d as Difficulty;
      s.querySelectorAll('.diff .btn').forEach((x) => x.classList.toggle('selected', x === b));
    }),
  );
  s.querySelector('.start')!.addEventListener('click', () => {
    s.remove();
    onStart(diff);
  });
  return s;
}

/** 只读的天赋树：4 行（25 级在上，和 Dota 一样）× 左右 2 个天赋；已选的高亮，未解锁的变暗 */
export function talentTreeHtml(world: World, u: Unit | undefined): string {
  if (!u?.hero) return '';
  let talents;
  try {
    talents = getHeroDef(u.hero.heroId).talents;
  } catch {
    return '';
  }
  const levels = world.balance.hero.talentLevels;
  const rows = talents
    .map((pair, tier) => {
      const picked = u.hero!.talents[tier];
      const unlocked = u.hero!.level >= (levels[tier] ?? Infinity);
      const opt = (side: 0 | 1) => {
        const cls = picked === side ? ' picked' : picked !== null && picked !== undefined ? ' other' : '';
        return `<div class="tt-opt${cls}">${esc(pair[side].name)}</div>`;
      };
      const state = picked !== null && picked !== undefined ? 'done' : unlocked ? 'open' : 'locked';
      return `<div class="tt-row ${state}"><div class="tt-lv">${levels[tier]}</div>${opt(0)}${opt(1)}</div>`;
    })
    .reverse()
    .join('');
  return `<div class="talent-tree"><div class="tt-title">天赋</div>${rows}</div>`;
}

export interface PauseOpts {
  match: Match;
  prefs: Prefs;
  /** 开关改变后调用（保存、应用到玩家单位） */
  onPrefsChange: (p: Prefs) => void;
}

export function showPauseMenu(parent: HTMLElement, o: PauseOpts, onResume: () => void, onQuit: () => void): HTMLDivElement {
  const w = o.match.world;
  const me = w.getUnit(o.match.playerUnitId);
  const toggle = (k: keyof Prefs, label: string) =>
    `<div class="pref${o.prefs[k] ? ' on' : ''}" data-k="${k}"><span class="sw"><i></i></span><span class="pref-label">${label}</span></div>`;
  const s = el(parent, `
    <div class="pause-panel">
      <div class="pause-title">已暂停</div>
      <div class="pause-body">
        ${talentTreeHtml(w, me)}
        <div class="pause-side">
          ${toggle('autoLevel', '自动加点（技能和天赋）')}
          ${toggle('autoAttack', '站立自动攻击')}
          <div class="btn resume">继续</div>
          <div class="btn secondary quit">退出对局</div>
        </div>
      </div>
    </div>`, 'pause');
  s.querySelectorAll<HTMLDivElement>('.pref').forEach((p) =>
    p.addEventListener('click', () => {
      const k = p.dataset.k as keyof Prefs;
      o.prefs[k] = !o.prefs[k];
      p.classList.toggle('on', o.prefs[k]);
      o.onPrefsChange(o.prefs);
    }),
  );
  s.querySelector('.resume')!.addEventListener('click', () => { s.remove(); onResume(); });
  s.querySelector('.quit')!.addEventListener('click', () => { s.remove(); onQuit(); });
  return s;
}

export function showResultScreen(parent: HTMLElement, match: Match, onRestart: () => void, onMenu: () => void): HTMLDivElement {
  const w = match.world;
  const me = w.getUnit(match.playerUnitId);
  const win = me ? w.winner === me.team : w.winner === Team.Radiant;
  const mins = `${Math.floor(w.time / 60)}分${Math.floor(w.time % 60)}秒`;
  const rows = w
    .heroes()
    .map((h) => {
      const s = h.hero!;
      const isMe = h.id === match.playerUnitId;
      const cls = `${h.team === Team.Radiant ? 'rad' : 'dire'}${isMe ? ' me' : ''}`;
      return `<tr class="${cls}"><td>${h.team === Team.Radiant ? '天辉' : '夜魇'} · ${esc(h.name)}${isMe ? '（你）' : ''}</td><td>${s.level}</td><td>${s.kills}/${s.deaths}/${s.assists}</td><td>${s.lastHits}</td><td>${Math.round(netWorth(h))}</td></tr>`;
    })
    .join('');
  const s = el(parent, `
    <div class="result-title ${win ? 'win' : 'lose'}">${win ? '胜利' : '失败'}</div>
    <div class="subtitle">对局时长 ${mins}</div>
    <table class="result-table"><tr><th>英雄</th><th>等级</th><th>击杀/死亡/助攻</th><th>补刀</th><th>净资产</th></tr>${rows}</table>
    <div class="btn-row"><div class="btn again">再来一局</div><div class="btn secondary menu">返回主菜单</div></div>`);
  s.querySelector('.again')!.addEventListener('click', () => { s.remove(); onRestart(); });
  s.querySelector('.menu')!.addEventListener('click', () => { s.remove(); onMenu(); });
  return s;
}
