import { getItemDef } from '../sim/items/definitions';
import { getItemIconCanvas } from '../render/itemIcons';
import {
  getItemEnName,
  CATEGORY_LABELS,
  TARGET_TYPE_LABELS,
  formatItemStats,
} from '../sim/items/itemInfo';

export class ItemTooltipModal {
  readonly root: HTMLDivElement;
  private readonly backdrop: HTMLDivElement;
  private readonly dialog: HTMLDivElement;
  private isOpen = false;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'item-tooltip-modal';

    this.backdrop = document.createElement('div');
    this.backdrop.className = 'it-backdrop';
    this.root.appendChild(this.backdrop);

    this.dialog = document.createElement('div');
    this.dialog.className = 'it-dialog';
    this.root.appendChild(this.dialog);

    parent.appendChild(this.root);

    const close = () => this.hide();
    this.backdrop.addEventListener('click', close);
  }

  get visible(): boolean {
    return this.isOpen;
  }

  show(itemId: string): void {
    const item = getItemDef(itemId);
    if (!item) return;

    this.isOpen = true;
    this.root.classList.add('open');

    const enName = getItemEnName(item.id);
    const categoryName = CATEGORY_LABELS[item.category] ?? '装备';
    const tierTag = item.components && item.components.length > 0 ? '进阶合成' : '基础配件';
    const formattedStats = formatItemStats(item);

    this.dialog.innerHTML = `
      <div class="it-header">
        <div class="it-icon-wrap"></div>
        <div class="it-title-meta">
          <div class="it-name">${item.name}</div>
          <div class="it-en-name">${enName}</div>
          <div class="it-tier-row">
            <span class="it-tag-tier">${categoryName} · ${tierTag}</span>
            <span class="it-cost"><span class="coin">●</span> ${item.cost.toLocaleString()} 金币</span>
          </div>
        </div>
        <div class="it-close" title="关闭">✕</div>
      </div>

      <div class="it-body">
        ${
          formattedStats.length > 0
            ? `<div class="it-stats-box">
                <div class="it-sec-title">属性加成</div>
                <div class="it-stats-grid">
                  ${formattedStats.map((s) => `<div class="it-stat-line stat-${s.type}">${s.text}</div>`).join('')}
                </div>
              </div>`
            : ''
        }

        ${
          item.active
            ? `<div class="it-ability active">
                <div class="it-ability-head">
                  <span class="it-ab-tag active">⚡ 主动</span>
                  <span class="it-ab-name">${item.active.name}</span>
                </div>
                <div class="it-ab-meta-strip">
                  <span class="it-ab-meta mana ${item.active.manaCost ? '' : 'free'}">🔷 ${item.active.manaCost ? `${item.active.manaCost} 魔法` : '0 魔法消耗'}</span>
                  ${item.active.cooldown ? `<span class="it-ab-meta cd">⏱️ ${item.active.cooldown}秒 冷却</span>` : '<span class="it-ab-meta cd free">⏱️ 无冷却</span>'}
                  ${item.active.castRange ? `<span class="it-ab-meta range">🎯 距离 ${item.active.castRange}</span>` : ''}
                  <span class="it-ab-meta target">🎯 ${TARGET_TYPE_LABELS[item.active.targetType] ?? item.active.targetType}</span>
                </div>
                <div class="it-ab-desc">${item.active.description}</div>
              </div>`
            : ''
        }

        ${
          item.passive
            ? `<div class="it-ability passive">
                <div class="it-ability-head">
                  <span class="it-ab-tag passive">🛡️ 被动</span>
                  <span class="it-ab-name">${item.passive.name}</span>
                </div>
                <div class="it-ab-desc">${item.passive.description}</div>
              </div>`
            : ''
        }
      </div>
    `;

    const iconWrap = this.dialog.querySelector('.it-icon-wrap')!;
    iconWrap.appendChild(getItemIconCanvas(item.id, 52));

    this.dialog.querySelector('.it-close')!.addEventListener('click', () => this.hide());
  }

  hide(): void {
    this.isOpen = false;
    this.root.classList.remove('open');
  }

  toggle(itemId: string): void {
    if (this.isOpen) {
      this.hide();
    } else {
      this.show(itemId);
    }
  }
}
