import type { World } from '../sim/world';
import { Team } from '../sim/core/types';
import type { Unit } from '../sim/entities/unit';
import { getItemIconCanvas } from '../render/itemIcons';
import { portraitCanvas } from './hud';
import { findModifier } from '../sim/modifiers';

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export class ScoreboardModal {
  readonly root: HTMLDivElement;
  readonly backdrop: HTMLDivElement;
  readonly closeBtn: HTMLDivElement;
  readonly content: HTMLDivElement;
  readonly radScoreEl: HTMLSpanElement;
  readonly direScoreEl: HTMLSpanElement;
  readonly timeEl: HTMLSpanElement;
  private isOpen = false;
  private playerUnitId: number | null = null;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'scoreboard-modal';

    this.backdrop = document.createElement('div');
    this.backdrop.className = 'sb-backdrop';
    this.root.appendChild(this.backdrop);

    const dialog = document.createElement('div');
    dialog.className = 'sb-dialog';

    const header = document.createElement('div');
    header.className = 'sb-header';

    const titleEl = document.createElement('div');
    titleEl.className = 'sb-title';
    titleEl.textContent = '⚔️ 实时对局战况';

    const clockScore = document.createElement('div');
    clockScore.className = 'sb-clock-score';

    this.radScoreEl = document.createElement('span');
    this.radScoreEl.className = 'sb-rad-score';
    this.radScoreEl.textContent = '0';

    this.timeEl = document.createElement('span');
    this.timeEl.className = 'sb-time';
    this.timeEl.textContent = '00:00';

    this.direScoreEl = document.createElement('span');
    this.direScoreEl.className = 'sb-dire-score';
    this.direScoreEl.textContent = '0';

    clockScore.appendChild(this.radScoreEl);
    clockScore.appendChild(this.timeEl);
    clockScore.appendChild(this.direScoreEl);

    this.closeBtn = document.createElement('div');
    this.closeBtn.className = 'sb-close';
    this.closeBtn.title = '关闭 (点击任意空白处也可关闭)';
    this.closeBtn.textContent = '✕';

    header.appendChild(titleEl);
    header.appendChild(clockScore);
    header.appendChild(this.closeBtn);

    this.content = document.createElement('div');
    this.content.className = 'sb-content';

    dialog.appendChild(header);
    dialog.appendChild(this.content);
    this.root.appendChild(dialog);
    parent.appendChild(this.root);

    const close = () => this.hide();
    this.backdrop.addEventListener('click', close);
    this.closeBtn.addEventListener('click', close);
  }

  get visible(): boolean {
    return this.isOpen;
  }

  toggle(world: World, playerUnitId: number | null): void {
    if (this.isOpen) {
      this.hide();
    } else {
      this.show(world, playerUnitId);
    }
  }

  show(world: World, playerUnitId: number | null): void {
    this.isOpen = true;
    this.playerUnitId = playerUnitId;
    this.root.classList.add('open');
    this.update(world);
  }

  hide(): void {
    this.isOpen = false;
    this.root.classList.remove('open');
  }

  update(world: World): void {
    if (!this.isOpen) return;

    // 更新顶部比分与时钟
    const isDay = Math.floor(world.time / 300) % 2 === 0;
    const timeIcon = isDay ? '☀️' : '🌙';
    const m = Math.floor(world.time / 60);
    const s = Math.floor(world.time % 60);
    const timeStr = `${timeIcon} ${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

    this.radScoreEl.textContent = String(world.teams[Team.Radiant].kills);
    this.direScoreEl.textContent = String(world.teams[Team.Dire].kills);
    this.timeEl.textContent = timeStr;

    // 渲染天辉与夜魇两队
    const radHeroes = world.heroes(Team.Radiant);
    const direHeroes = world.heroes(Team.Dire);

    let html = `
      <div class="sb-teams">
        ${this.renderTeamSection('天辉方 (Radiant)', Team.Radiant, radHeroes)}
        ${this.renderTeamSection('夜魇方 (Dire)', Team.Dire, direHeroes)}
      </div>
    `;
    this.content.innerHTML = html;

    // 为每个英雄头像和装备槽填入 Canvas 图标
    this.populateIcons(radHeroes.concat(direHeroes));
  }

  private renderTeamSection(title: string, team: Team, heroes: Unit[]): string {
    const isRad = team === Team.Radiant;
    const totalGold = Math.floor(heroes.reduce((sum, h) => sum + (h.hero?.gold ?? 0), 0));

    return `
      <div class="sb-team-section ${isRad ? 'rad' : 'dire'}">
        <div class="sb-team-header">
          <span class="sb-team-title">${title}</span>
          <span class="sb-team-gold">团队经济: 💰 ${totalGold.toLocaleString()}</span>
        </div>
        <table class="sb-table">
          <thead>
            <tr>
              <th class="col-hero">英雄</th>
              <th class="col-kda">K / D / A</th>
              <th class="col-gold">金币</th>
              <th class="col-items">当前出装 (6格)</th>
              <th class="col-status">状态</th>
            </tr>
          </thead>
          <tbody>
            ${heroes.map((h) => this.renderHeroRow(h)).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  private renderHeroRow(h: Unit): string {
    const hero = h.hero!;
    const isPlayer = h.id === this.playerUnitId;
    const hasShard = !!hero.hasShard;
    const hasAegis = findModifier(h, 'mod_aegis') !== undefined;

    return `
      <tr class="sb-hero-row ${isPlayer ? 'is-me' : ''} ${h.alive ? '' : 'is-dead'}" data-unit-id="${h.id}">
        <td class="col-hero">
          <div class="sb-hero-cell">
            <div class="sb-portrait-wrap" data-hero-id="${h.defId}" data-team="${h.team}">
              <span class="sb-level">Lv.${hero.level}</span>
            </div>
            <div class="sb-hero-meta">
              <span class="sb-hero-name">${esc(h.name)}</span>
              ${isPlayer ? '<span class="sb-tag-player">👑 玩家</span>' : ''}
            </div>
          </div>
        </td>
        <td class="col-kda">
          <span class="sb-kda-num">${hero.kills}</span> /
          <span class="sb-kda-death">${hero.deaths}</span> /
          <span class="sb-kda-num">${hero.assists}</span>
        </td>
        <td class="col-gold">
          <span class="sb-gold-val">💰 ${Math.floor(hero.gold).toLocaleString()}</span>
        </td>
        <td class="col-items">
          <div class="sb-items-grid" data-unit-id="${h.id}">
            ${[0, 1, 2, 3, 4, 5]
              .map((slotIdx) => {
                const it = h.inventory?.[slotIdx];
                return `<div class="sb-item-slot${it ? '' : ' empty'}" data-slot="${slotIdx}" data-item-id="${it ? it.id : ''}"></div>`;
              })
              .join('')}
            <div class="sb-special-badges">
              <span class="sb-spec-badge shard${hasShard ? ' active' : ''}" title="${hasShard ? '已激活阿哈利姆魔晶' : '未拥有魔晶'}">💎</span>
              <span class="sb-spec-badge aegis${hasAegis ? ' active' : ''}" title="${hasAegis ? '携带不朽之守护' : '未携带不朽盾'}">🛡️</span>
            </div>
          </div>
        </td>
        <td class="col-status">
          ${h.alive ? '<span class="sb-status alive">存活</span>' : `<span class="sb-status dead">💀 ${Math.ceil(hero.respawnTimer)}s</span>`}
        </td>
      </tr>
    `;
  }

  private populateIcons(heroes: Unit[]): void {
    // 1. 头像
    for (const h of heroes) {
      const wrap = this.content.querySelector<HTMLDivElement>(`.sb-portrait-wrap[data-hero-id="${h.defId}"][data-team="${h.team}"]`);
      if (wrap && !wrap.querySelector('canvas')) {
        wrap.prepend(portraitCanvas(h.defId, 38, h.team));
      }
    }

    // 2. 物品
    for (const h of heroes) {
      const grid = this.content.querySelector<HTMLDivElement>(`.sb-items-grid[data-unit-id="${h.id}"]`);
      if (!grid) continue;
      const slots = grid.querySelectorAll<HTMLDivElement>('.sb-item-slot');
      slots.forEach((slotEl) => {
        const itemId = slotEl.dataset.itemId;
        if (itemId && !slotEl.querySelector('canvas')) {
          slotEl.appendChild(getItemIconCanvas(itemId, 30));
        }
      });
    }
  }
}
