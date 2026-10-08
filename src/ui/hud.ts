import type { Match } from '../game/match';
import type { ViewCamera } from '../render/view';
import type { AbilitySlot } from '../sim/core/types';
import { Team } from '../sim/core/types';
import type { Unit } from '../sim/entities/unit';
import type { AbilityInstance } from '../sim/heroes/types';
import type { World } from '../sim/world';
import { MAP } from '../sim/data/map';
import { xpToReach } from '../sim/data/xpTable';
import { abilityCooldown, abilityManaCost, abilityMaxCharges } from '../sim/systems/abilities';
import { canLearn } from '../sim/systems/progress';
import { pendingTalentTier } from '../sim/talents';
import { getHeroDef } from '../sim/heroes/index';
import { drawPortrait } from '../render/heroVisuals';
import type { Prefs } from './settings';

export const SKILL_SLOTS: AbilitySlot[] = ['Q', 'W', 'E', 'R'];
/** 键盘调试键的显示（X1 = F、X2 = G） */
const KEY_LABELS: Record<AbilitySlot, string> = { Q: 'Q', W: 'W', E: 'E', R: 'R', X1: 'F', X2: 'G' };

/** 技能键：Q W E R，再加上英雄有的 X1、X2（先天主动 / 神杖技能） */
export function skillSlotsFor(u: Unit): AbilitySlot[] {
  const slots = [...SKILL_SLOTS];
  for (const s of ['X1', 'X2'] as const) if (u.ability(s)) slots.push(s);
  return slots;
}

/** 待选的最低一层天赋：层号、解锁等级、左右两个天赋的名字；没有待选的返回 null */
export function talentChoices(world: World, u: Unit): { tier: number; level: number; names: [string, string] } | null {
  const tier = pendingTalentTier(world, u);
  if (tier === null || !u.hero) return null;
  const pair = getHeroDef(u.hero.heroId).talents[tier];
  return { tier, level: world.balance.hero.talentLevels[tier], names: [pair[0].name, pair[1].name] };
}

/** 充能技能右下角的剩余层数；不是充能制（或还没学）时为 '' */
export function chargeBadge(u: Unit, ab: AbilityInstance): string {
  if (ab.level <= 0) return '';
  return abilityMaxCharges(u, ab) > 0 ? String(ab.charges) : '';
}

/**
 * 冷却遮罩：剩余比例 0..1 和剩余秒数。充能技能按"下一层恢复"的进度（并行充能取最快恢复的一层）。
 */
export function cooldownState(u: Unit, ab: AbilityInstance): { frac: number; remaining: number } {
  if (ab.level <= 0) return { frac: 0, remaining: 0 };
  const total = abilityCooldown(ab, u);
  const max = abilityMaxCharges(u, ab);
  let rem = ab.cooldown;
  if (max > 0 && ab.charges < max) {
    rem = ab.def.chargeMode === 'parallel' ? (ab.chargeTimers.length ? Math.min(...ab.chargeTimers) : 0) : ab.chargeTimer;
  } else if (max > 0) {
    rem = 0;
  }
  return { frac: rem > 0 && total > 0 ? Math.min(1, rem / total) : 0, remaining: Math.max(0, rem) };
}

/** 先天技能的计数（灵魂、腐肉堆积层数……），显示在头像旁边；没有时 null */
export function innateCounter(u: Unit): { label: string; value: number } | null {
  for (const ab of u.abilities) {
    if (ab.def.slot !== 'innate' || !ab.def.counter) continue;
    const v = ab.def.counter(u, ab);
    if (v !== null) return { label: ab.def.name, value: v };
  }
  return null;
}

export interface SkillButton {
  slot: AbilitySlot;
  root: HTMLDivElement;
  cd: HTMLDivElement;
  cdText: HTMLSpanElement;
  learn: HTMLDivElement;
  pips: HTMLDivElement;
  name: HTMLSpanElement;
  charges: HTMLSpanElement;
  counter: HTMLSpanElement;
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
/** 天赋弹窗出现后多久内忽略点击（毫秒），防止正在点别处的手指误选 */
const TALENT_TAP_GUARD_MS = 400;

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

/** 画布上画英雄头像（按设备像素比放大，显示尺寸由 CSS 决定） */
export function portraitCanvas(heroId: string, cssSize: number, team?: Team): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const px = Math.round(cssSize * Math.min(2, window.devicePixelRatio || 1));
  c.width = px;
  c.height = px;
  const g = c.getContext('2d');
  if (g) drawPortrait(g, heroId, px, team);
  return c;
}

const skillHtml = (slot: AbilitySlot): string =>
  `<div class="skill${slot.startsWith('X') ? ' skill-x' : ''}" data-slot="${slot}"><span class="skill-key">${KEY_LABELS[slot]}</span><span class="skill-name"></span>` +
  `<div class="cd"></div><span class="cd-text"></span><div class="pips"></div><span class="charges"></span><span class="counter"></span><div class="learn">+</div></div>`;

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
  /** 天赋弹窗的左右两个按钮（Controls 绑定点击 → pickTalent） */
  readonly talentOpts: HTMLDivElement[];
  private acc = 1;
  private readonly minimap: HTMLCanvasElement;
  private readonly minis: MiniEls[] = [];
  private readonly els: {
    clock: HTMLSpanElement; kRad: HTMLSpanElement; kDire: HTMLSpanElement; level: HTMLSpanElement; gold: HTMLSpanElement;
    hp: BarEls; mp: BarEls; xp: BarEls; death: HTMLDivElement; deathTimer: HTMLDivElement; innate: HTMLDivElement;
    talentPop: HTMLDivElement; talentTitle: HTMLSpanElement; talentPill: HTMLDivElement;
  };
  /** 玩家点了"稍后"：弹窗收成小按钮，直到点小按钮重新展开 */
  private talentCollapsed = false;
  /** 弹窗当前显示的层（-1 = 没有显示） */
  private talentTier = -1;
  private talentShownAt = 0;
  private q = <T extends Element>(sel: string): T => this.root.querySelector(sel) as T;

  constructor(parent: HTMLElement, private readonly match: Match, private readonly camera: ViewCamera, private readonly prefs: Prefs) {
    const me = match.world.getUnit(match.playerUnitId);
    const slots = me ? skillSlotsFor(me) : SKILL_SLOTS;
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="joy-zone"><div class="joy-base"><div class="joy-knob"></div></div></div>
      <div class="hud-tl">
        <div class="portrait"><span class="portrait-level">1</span></div>
        <div class="vitals">
          <div class="bar hp"><div class="fill"></div><span class="txt"></span></div>
          <div class="bar mp"><div class="fill"></div><span class="txt"></span></div>
          <div class="bar xp"><div class="fill"></div></div>
        </div>
        <div class="gold"><span class="coin">●</span><span class="gold-val">0</span></div>
        <div class="innate-tag"></div>
      </div>
      <div class="hud-top">
        <div class="score"><span class="k-rad">0</span><span class="clock">00:00</span><span class="k-dire">0</span></div>
        <div class="roster"><div class="side rad"></div><div class="side dire"></div></div>
      </div>
      <div class="hud-tr"><canvas class="minimap" width="110" height="320"></canvas><div class="btn-pause">❚❚</div></div>
      <div class="talent-pop">
        <div class="talent-head"><span class="talent-title"></span><span class="talent-later">稍后</span></div>
        <div class="talent-opts"><div class="talent-opt" data-side="0"></div><div class="talent-opt" data-side="1"></div></div>
      </div>
      <div class="talent-pill">天赋</div>
      <div class="actions">
        <div class="cancel-zone">取消</div>
        <div class="btn-attack">攻击</div>
        <div class="btn-small btn-lasthit">补刀</div>
        <div class="btn-small btn-push">推塔</div>
        <div class="btn-recall">回城</div>
        ${slots.map(skillHtml).join('')}
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
    this.talentOpts = [...this.root.querySelectorAll<HTMLDivElement>('.talent-opt')];
    const bar = (sel: string): BarEls => {
      const b = this.q<HTMLDivElement>(sel);
      return { fill: b.querySelector('.fill') as HTMLDivElement, txt: b.querySelector('.txt') };
    };
    this.els = {
      clock: this.q('.clock'), kRad: this.q('.k-rad'), kDire: this.q('.k-dire'), level: this.q('.portrait-level'), gold: this.q('.gold-val'),
      hp: bar('.bar.hp'), mp: bar('.bar.mp'), xp: bar('.bar.xp'), death: this.q('.death-overlay'), deathTimer: this.q('.death-timer'),
      innate: this.q('.innate-tag'), talentPop: this.q('.talent-pop'), talentTitle: this.q('.talent-title'), talentPill: this.q('.talent-pill'),
    };
    for (const slot of slots) {
      const root = this.q<HTMLDivElement>(`.skill[data-slot="${slot}"]`);
      this.skills.push({
        slot, root, cd: root.querySelector('.cd')!, cdText: root.querySelector('.cd-text')!, learn: root.querySelector('.learn')!,
        pips: root.querySelector('.pips')!, name: root.querySelector('.skill-name')!, charges: root.querySelector('.charges')!,
        counter: root.querySelector('.counter')!,
      });
    }
    // 稍后 / 重新展开：纯界面状态，不产生指令
    this.q<HTMLSpanElement>('.talent-later').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.talentCollapsed = true;
      this.refreshTalent();
    });
    this.els.talentPill.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.talentCollapsed = false;
      this.talentShownAt = performance.now();
      this.refreshTalent();
    });
    this.buildRoster();
    if (me) {
      this.q<HTMLDivElement>('.portrait').prepend(portraitCanvas(me.defId, 72, me.team));
      for (const b of this.skills) {
        const ab = me.ability(b.slot);
        b.name.textContent = ab ? ab.def.name.slice(0, 2) : '';
        if (ab) b.root.title = ab.def.name;
        if (ab?.def.targetType === 'passive') b.root.classList.add('passive');
        // 先天主动（X1）只有 1 级，不画等级格
        b.pips.innerHTML = ab && ab.def.maxLevel > 1 ? Array.from({ length: ab.def.maxLevel }, () => '<i></i>').join('') : '';
      }
    }
  }

  private buildRoster(): void {
    const w = this.match.world;
    for (const team of [Team.Radiant, Team.Dire]) {
      const side = this.q<HTMLDivElement>(team === Team.Radiant ? '.roster .rad' : '.roster .dire');
      for (const h of w.heroes(team)) {
        const mini = document.createElement('div');
        mini.className = `mini ${team === Team.Radiant ? 'rad' : 'dire'}${h.id === this.match.playerUnitId ? ' me' : ''}`;
        mini.title = h.name;
        mini.appendChild(portraitCanvas(h.defId, 24, team));
        const dead = document.createElement('div');
        dead.className = 'dead';
        mini.appendChild(dead);
        side.appendChild(mini);
        this.minis.push({ id: h.id, root: mini, dead });
      }
    }
  }

  /** 当前弹窗显示的天赋层（-1 = 没有；Controls 点击时读它，保证选的就是看到的那一层） */
  get shownTalentTier(): number {
    return this.talentTier;
  }

  /** 弹窗出现后的短暂保护期内不接受点击 */
  talentTapAllowed(): boolean {
    return performance.now() - this.talentShownAt >= TALENT_TAP_GUARD_MS;
  }

  private refreshTalent(): void {
    const w = this.match.world;
    const me = w.getUnit(this.match.playerUnitId);
    // 自动加点开启时由 Controls 自动选，不弹窗
    const ch = me?.hero && !this.prefs.autoLevel ? talentChoices(w, me) : null;
    if (!ch) {
      this.talentTier = -1;
      this.talentCollapsed = false;
      this.els.talentPop.classList.remove('show');
      this.els.talentPill.classList.remove('show');
      return;
    }
    if (ch.tier !== this.talentTier) {
      this.talentTier = ch.tier;
      this.talentShownAt = performance.now();
      setText(this.els.talentTitle, `${ch.level} 级天赋 · 二选一`);
      ch.names.forEach((n, i) => setText(this.talentOpts[i], n));
    }
    this.els.talentPop.classList.toggle('show', !this.talentCollapsed);
    this.els.talentPill.classList.toggle('show', this.talentCollapsed);
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
    this.refreshTalent();
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
    const inn = innateCounter(me);
    els.innate.classList.toggle('show', !!inn);
    if (inn) setText(els.innate, `${inn.label} ${inn.value}`);
    for (const b of this.skills) {
      const ab = me.ability(b.slot);
      if (!ab) continue;
      const learned = ab.level > 0;
      const charged = abilityMaxCharges(me, ab) > 0;
      const cd = cooldownState(me, ab);
      // 充能技能：还有层数时遮罩只做提示（半透明），层数用完才算冷却中
      const blocked = learned && cd.remaining > 0 && (!charged || ab.charges <= 0);
      b.cd.style.setProperty('--cd', cd.frac.toFixed(3));
      setText(b.cdText, blocked ? (cd.remaining >= 1 ? String(Math.ceil(cd.remaining)) : cd.remaining.toFixed(1)) : '');
      b.root.classList.toggle('on-cd', blocked);
      b.root.classList.toggle('restoring', learned && charged && !blocked && cd.frac > 0);
      b.root.classList.toggle('unlearned', !learned);
      b.root.classList.toggle('no-mana', learned && ab.def.targetType !== 'passive' && me.mana + 1e-6 < abilityManaCost(ab, me));
      b.root.classList.toggle('toggled', ab.toggled);
      b.root.classList.toggle('inactive', learned && !!ab.def.inactive?.(me, ab));
      b.root.classList.toggle('can-learn', h.skillPoints > 0 && canLearn(h.level, ab));
      setText(b.charges, chargeBadge(me, ab));
      const n = learned ? ab.def.counter?.(me, ab) ?? null : null;
      setText(b.counter, n === null ? '' : String(n));
      b.root.classList.toggle('has-counter', n !== null);
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
    const viewer = w.getUnit(this.match.playerUnitId)?.team ?? Team.Radiant;
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
        // 对玩家一方隐藏的敌方英雄（魅影无形）不画
        if (!u.alive || (u.team !== viewer && u.hasState('hidden'))) continue;
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
    // 视野框：屏幕四角投影到地面上的四边形（2D 镜头是矩形，3D 透视镜头是上宽下窄的梯形）
    g.strokeStyle = 'rgba(255,255,255,0.7)';
    g.lineWidth = k;
    g.beginPath();
    for (const p of this.camera.footprint()) g.lineTo(p.x * sx, p.y * sy);
    g.closePath();
    g.stroke();
  }

  destroy(): void {
    this.root.remove();
  }
}
