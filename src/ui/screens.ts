import type { Match } from '../game/match';
import type { Difficulty } from '../sim/core/types';
import { Team } from '../sim/core/types';
import { netWorth } from '../sim/systems/progress';
import { DIFFICULTY_NAMES } from '../ai/difficulty';

const el = (parent: HTMLElement, html: string): HTMLDivElement => {
  const d = document.createElement('div');
  d.className = 'screen';
  d.innerHTML = html;
  parent.appendChild(d);
  return d;
};

export function showStartScreen(parent: HTMLElement, onStart: (d: Difficulty) => void): HTMLDivElement {
  let diff: Difficulty = 'normal';
  const s = el(parent, `
    <div class="title">中路风云</div>
    <div class="subtitle">3v3 · 单路对决 · 先推倒对方遗迹者获胜</div>
    <div class="btn-row diff">
      ${(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => `<div class="btn secondary${d === 'normal' ? ' selected' : ''}" data-d="${d}">${DIFFICULTY_NAMES[d]}</div>`).join('')}
    </div>
    <div class="btn start">开始游戏（斧王）</div>
    <div class="subtitle">左侧摇杆移动 · 右侧技能 · 拖动技能键瞄准</div>
    <div class="kb-hint">键盘：方向键 / A S D 移动 · Q W E R 施法（朝鼠标） · Shift+QWER 加点 · 空格 攻击 · T 回城 · Esc 暂停</div>`);
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

export function showPauseMenu(parent: HTMLElement, onResume: () => void, onQuit: () => void): HTMLDivElement {
  const s = el(parent, `<div class="title" style="font-size:8rem">已暂停</div><div class="btn-row"><div class="btn resume">继续</div><div class="btn secondary quit">退出对局</div></div>`);
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
      return `<tr class="${cls}"><td>${h.team === Team.Radiant ? '天辉' : '夜魇'} · ${h.name}${isMe ? '（你）' : ''}</td><td>${s.level}</td><td>${s.kills}/${s.deaths}/${s.assists}</td><td>${s.lastHits}</td><td>${Math.round(netWorth(h))}</td></tr>`;
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
