import type { Match } from '../game/match';
import type { Camera } from '../render/camera';
import type { AbilitySlot } from '../sim/core/types';
import { Team } from '../sim/core/types';
import { MAP } from '../sim/data/map';
import { xpToReach } from '../sim/data/xpTable';
import { abilityCooldown, abilityManaCost } from '../sim/systems/abilities';
import { canLearn } from '../sim/systems/progress';
import { heroLook } from '../render/heroVisuals';

export const SKILL_SLOTS: AbilitySlot[] = ['Q', 'W', 'E', 'R'];

export interface SkillButton {
  slot: AbilitySlot;
  root: HTMLDivElement;
  cd: HTMLDivElement;
  cdText: HTMLSpanElement;
  learn: HTMLDivElement;
  pips: HTMLDivElement;
  name: HTMLSpanElement;
}

interface BarEls {
  fill: HTMLDivElement;
  txt: HTMLSpanElement | null;
}

interface MiniEls {
  id: number;
  root: HTMLDivElement;
  dead: HTMLDivElement;
}

/** HUD 刷新频率（次/秒） */
const HUD_RATE = 15;
/** 小地图参考宽度：点的大小按这个宽度设计，画布更大时等比放大 */
const MINIMAP_REF_W = 110;

export const formatClock = (s: number): string =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * 血量 / 魔法文字"当前 / 上限"。上限四舍五入；当前值不超过显示的上限，
 * roundUp 时向上取整（剩 0.3 血显示 1，不会让活着的英雄显示 0）。
 */
export const vitalText = (cur: number, max: number, roundUp: boolean): string => {
  const m = Math.round(max);
  const c = cur >= max - 1e-6 ? m : Math.min(m, Math.max(0, roundUp ? Math.ceil(cur) : Math.floor(cur)));
  return `${c} / ${m}`;
};

/** 内容变化时才写 DOM，避免每次刷新都触发重排 */
const setText = (el: Element, text: string): void => {
  if (el.textContent !== text) el.textContent = text;
};

export class Hud {
  readonly root: HTMLDivElement;
  readonly joyZone: HTMLDivElement;
  readonly joyBase: HTMLDivElement;
  readonly joyKnob: HTMLDivElement;
  readonly attackBtn: HTMLDivElement;
  readonly lastHitBtn: HTMLDivElement;
  readonly pushBtn: HTMLDivElement;
  readonly recallBtn: HTMLDivElement;
  readonly pauseBtn: HTMLDivElement;
  readonly cancelZone: HTMLDivElement;
  readonly skills: SkillButton[] = [];
  private acc = 1;
  private readonly minimap: HTMLCanvasElement;
  private readonly minis: MiniEls[] = [];
  private readonly els: {
    clock: HTMLSpanElement; kRad: HTMLSpanElement; kDire: HTMLSpanElement; level: HTMLSpanElement; gold: HTMLSpanElement;
    hp: BarEls; mp: BarEls; xp: BarEls; death: HTMLDivElement; deathTimer: HTMLDivElement;
  };
  private q = <T extends Element>(sel: string): T => this.root.querySelector(sel) as T;

  constructor(parent: HTMLElement, private readonly match: Match, private readonly camera: Camera) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="joy-zone"><div class="joy-base"><div class="joy-knob"></div></div></div>
      <div class="hud-tl">
        <div class="portrait"><span class="portrait-initial"></span><span class="portrait-level">1</span></div>
        <div class="vitals">
          <div class="bar hp"><div class="fill"></div><span class="txt"></span></div>
          <div class="bar mp"><div class="fill"></div><span class="txt"></span></div>
          <div class="bar xp"><div class="fill"></div></div>
        </div>
        <div class="gold"><span class="coin">●</span><span class="gold-val">0</span></div>
      </div>
      <div class="hud-top">
        <div class="score"><span class="k-rad">0</span><span class="clock">00:00</span><span class="k-dire">0</span></div>
        <div class="roster"><div class="side rad"></div><div class="side dire"></div></div>
      </div>
      <div class="hud-tr"><canvas class="minimap" width="110" height="320"></canvas><div class="btn-pause">❚❚</div></div>
      <div class="actions">
        <div class="cancel-zone">取消</div>
        <div class="btn-attack">攻击</div>
        <div class="btn-small btn-lasthit">补刀</div>
        <div class="btn-small btn-push">推塔</div>
        <div class="btn-recall">回城</div>
        ${SKILL_SLOTS.map((s) => `<div class="skill" data-slot="${s}"><span class="skill-key">${s}</span><span class="skill-name"></span><div class="cd"></div><span class="cd-text"></span><div class="pips"></div><div class="learn">+</div></div>`).join('')}
      </div>
      <div class="death-overlay"><div class="death-text">你已阵亡</div><div class="death-timer"></div></div>`;
    parent.appendChild(this.root);
    this.joyZone = this.q('.joy-zone');
    this.joyBase = this.q('.joy-base');
    this.joyKnob = this.q('.joy-knob');
    this.attackBtn = this.q('.btn-attack');
    this.lastHitBtn = this.q('.btn-lasthit');
    this.pushBtn = this.q('.btn-push');
    this.recallBtn = this.q('.btn-recall');
    this.pauseBtn = this.q('.btn-pause');
    this.cancelZone = this.q('.cancel-zone');
    this.minimap = this.q('.minimap');
    const bar = (sel: string): BarEls => {
      const b = this.q<HTMLDivElement>(sel);
      return { fill: b.querySelector('.fill') as HTMLDivElement, txt: b.querySelector('.txt') };
    };
    this.els = {
      clock: this.q('.clock'), kRad: this.q('.k-rad'), kDire: this.q('.k-dire'), level: this.q('.portrait-level'), gold: this.q('.gold-val'),
      hp: bar('.bar.hp'), mp: bar('.bar.mp'), xp: bar('.bar.xp'), death: this.q('.death-overlay'), deathTimer: this.q('.death-timer'),
    };
    for (const slot of SKILL_SLOTS) {
      const root = this.q<HTMLDivElement>(`.skill[data-slot="${slot}"]`);
      this.skills.push({
        slot, root, cd: root.querySelector('.cd')!, cdText: root.querySelector('.cd-text')!, learn: root.querySelector('.learn')!,
        pips: root.querySelector('.pips')!, name: root.querySelector('.skill-name')!,
      });
    }
    this.buildRoster();
    const me = match.world.getUnit(match.playerUnitId);
    if (me) {
      const look = heroLook(me.defId);
      this.q<HTMLDivElement>('.portrait').style.background = look.body;
      this.q<HTMLSpanElement>('.portrait-initial').textContent = look.initial;
      for (const b of this.skills) {
        const ab = me.ability(b.slot);
        b.name.textContent = ab ? ab.def.name.slice(0, 2) : '';
        if (ab) b.root.title = ab.def.name;
        if (ab?.def.targetType === 'passive') b.root.classList.add('passive');
        b.pips.innerHTML = ab ? Array.from({ length: ab.def.maxLevel }, () => '<i></i>').join('') : '';
      }
    }
  }

  private buildRoster(): void {
    const w = this.match.world;
    for (const team of [Team.Radiant, Team.Dire]) {
      const side = this.q<HTMLDivElement>(team === Team.Radiant ? '.roster .rad' : '.roster .dire');
      side.innerHTML = w
        .heroes(team)
        .map((h) => {
          const look = heroLook(h.defId);
          const me = h.id === this.match.playerUnitId ? ' me' : '';
          return `<div class="mini ${team === Team.Radiant ? 'rad' : 'dire'}${me}" data-id="${h.id}" style="background:${look.body}">${look.initial}<div class="dead"></div></div>`;
        })
        .join('');
    }
    for (const root of this.root.querySelectorAll<HTMLDivElement>('.mini')) {
      this.minis.push({ id: Number(root.dataset.id), root, dead: root.querySelector('.dead') as HTMLDivElement });
    }
  }

  update(dt: number): void {
    this.acc += dt;
    if (this.acc < 1 / HUD_RATE) return;
    this.acc = 0;
    // 先画小地图：它会读取画布的显示尺寸，放在写 DOM 之前可以避免强制同步重排
    this.drawMinimap();
    const w = this.match.world;
    const els = this.els;
    setText(els.clock, formatClock(w.time));
    setText(els.kRad, String(w.teams[Team.Radiant].kills));
    setText(els.kDire, String(w.teams[Team.Dire].kills));
    for (const m of this.minis) {
      const h = w.getUnit(m.id);
      if (!h?.hero) continue;
      m.root.classList.toggle('is-dead', !h.alive);
      setText(m.dead, h.alive ? '' : String(Math.ceil(h.hero.respawnTimer)));
    }
    const me = w.getUnit(this.match.playerUnitId);
    if (!me?.hero) return;
    const h = me.hero;
    const e = w.balance.economy;
    setText(els.level, String(h.level));
    const setBar = (b: BarEls, pct: number, txt?: string) => {
      b.fill.style.width = `${(Math.max(0, Math.min(1, pct)) * 100).toFixed(1)}%`;
      if (b.txt && txt !== undefined) setText(b.txt, txt);
    };
    setBar(els.hp, me.hp / Math.max(1, me.stats.maxHp), vitalText(me.hp, me.stats.maxHp, true));
    setBar(els.mp, me.mana / Math.max(1, me.stats.maxMana), vitalText(me.mana, me.stats.maxMana, false));
    const cur = xpToReach(h.level, e.xpTableMult);
    const next = xpToReach(h.level + 1, e.xpTableMult);
    setBar(els.xp, h.level >= e.levelCap ? 1 : (h.xp - cur) / Math.max(1, next - cur));
    setText(els.gold, String(Math.floor(h.gold)));
    for (const b of this.skills) {
      const ab = me.ability(b.slot);
      if (!ab) continue;
      const learned = ab.level > 0;
      const cd = ab.cooldown;
      const total = abilityCooldown(ab, me);
      b.cd.style.setProperty('--cd', learned && cd > 0 && total > 0 ? (cd / total).toFixed(3) : '0');
      setText(b.cdText, learned && cd > 0 ? (cd >= 1 ? String(Math.ceil(cd)) : cd.toFixed(1)) : '');
      b.root.classList.toggle('on-cd', learned && cd > 0);
      b.root.classList.toggle('unlearned', !learned);
      b.root.classList.toggle('no-mana', learned && ab.def.targetType !== 'passive' && me.mana + 1e-6 < abilityManaCost(ab, me));
      b.root.classList.toggle('toggled', ab.toggled);
      b.root.classList.toggle('can-learn', h.skillPoints > 0 && canLearn(h.level, ab));
      b.pips.querySelectorAll('i').forEach((pip, i) => pip.classList.toggle('on', i < ab.level));
    }
    els.death.classList.toggle('show', !me.alive);
    if (!me.alive) setText(els.deathTimer, String(Math.ceil(h.respawnTimer)));
  }

  private drawMinimap(): void {
    const c = this.minimap;
    // 画布分辨率跟随显示尺寸（高 DPR 屏幕上不模糊）
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.round(c.clientWidth * dpr);
    const ch = Math.round(c.clientHeight * dpr);
    if (cw > 0 && ch > 0 && (c.width !== cw || c.height !== ch)) {
      c.width = cw;
      c.height = ch;
    }
    const g = c.getContext('2d')!;
    const W = c.width, H = c.height;
    const sx = W / MAP.width, sy = H / MAP.height;
    const k = W / MINIMAP_REF_W;
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#1b2a1c';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#6b5a3e';
    g.fillRect((MAP.laneX - MAP.laneHalfWidth) * sx, 0, MAP.laneHalfWidth * 2 * sx, H);
    g.fillStyle = '#2a6f86';
    g.fillRect(0, (MAP.riverY - MAP.riverHalf) * sy, W, MAP.riverHalf * 2 * sy);
    const w = this.match.world;
    for (const u of w.units) {
      if (u.removed) continue;
      const x = u.pos.x * sx, y = u.pos.y * sy;
      const col = u.team === Team.Radiant ? '#5fe05a' : '#ff5a4a';
      if (u.kind === 'building') {
        if (u.building?.type === 'fountain') continue;
        g.fillStyle = u.alive ? col : '#555';
        const s = (u.building?.type === 'ancient' ? 12 : 8) * k;
        g.fillRect(x - s / 2, y - s / 2, s, s);
      } else if (u.kind === 'hero') {
        if (!u.alive) continue;
        g.fillStyle = col;
        g.beginPath();
        g.arc(x, y, 5 * k, 0, Math.PI * 2);
        g.fill();
        if (u.id === this.match.playerUnitId) {
          g.strokeStyle = '#fff';
          g.lineWidth = 2 * k;
          g.stroke();
        }
      } else if (u.alive) {
        g.fillStyle = col;
        g.fillRect(x - 1.5 * k, y - 1.5 * k, 3 * k, 3 * k);
      }
    }
    const cam = this.camera;
    g.strokeStyle = 'rgba(255,255,255,0.7)';
    g.lineWidth = k;
    g.strokeRect((cam.x - cam.worldW / 2) * sx, (cam.y - cam.worldH / 2) * sy, cam.worldW * sx, cam.worldH * sy);
  }

  destroy(): void {
    this.root.remove();
  }
}
