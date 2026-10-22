import type { World } from '../sim/world';
import type { Unit } from '../sim/entities/unit';
import type { ItemCategory } from '../sim/items/types';
import { ITEM_DEFINITIONS, getItemDef } from '../sim/items/definitions';
import { getItemIconCanvas } from '../render/itemIcons';
import {
  getItemEnName,
  CATEGORY_LABELS,
  TARGET_TYPE_LABELS,
  getBuildsInto,
  formatItemStats,
} from '../sim/items/itemInfo';
import type { Command } from '../sim/commands';

export type ShopCategory = 'all' | ItemCategory;

const CATEGORY_NAMES: { id: ShopCategory; name: string }[] = [
  { id: 'all', name: '全部' },
  { id: 'consumables', name: '消耗品' },
  { id: 'attributes', name: '属性基础' },
  { id: 'armaments', name: '军械配件' },
  { id: 'boots', name: '鞋类装备' },
  { id: 'early', name: '前期小件' },
  { id: 'defense', name: '防御大件' },
  { id: 'weapons', name: '武器输出' },
  { id: 'utility', name: '功能法术' },
  { id: 'special', name: '神杖魔晶' },
];

export class ShopModal {
  readonly root: HTMLDivElement;
  private currentCategory: ShopCategory = 'all';
  private selectedItemId: string = 'boots_of_speed';
  private isOpen = false;
  private onCommand: (cmd: Command) => void;

  private goldEl: HTMLSpanElement;
  private itemsGridEl: HTMLDivElement;
  private detailEl: HTMLDivElement;
  private navListEl: HTMLDivElement;

  constructor(parent: HTMLElement, onCommand: (cmd: Command) => void) {
    this.onCommand = onCommand;

    this.root = document.createElement('div');
    this.root.className = 'shop-modal';
    this.root.innerHTML = `
      <div class="shop-backdrop"></div>
      <div class="shop-dialog">
        <div class="shop-header">
          <div class="shop-title">🏛️ 装备商店 · DOTA 2 军械库</div>
          <div class="shop-gold"><span class="coin">●</span><span class="shop-gold-val">0</span></div>
          <div class="shop-close" title="关闭 (Esc)">✕</div>
        </div>
        <div class="shop-body">
          <div class="shop-nav"></div>
          <div class="shop-items-scroll">
            <div class="shop-items-grid"></div>
          </div>
          <div class="shop-detail"></div>
        </div>
      </div>
    `;
    parent.appendChild(this.root);

    this.goldEl = this.root.querySelector('.shop-gold-val')!;
    this.itemsGridEl = this.root.querySelector('.shop-items-grid')!;
    this.detailEl = this.root.querySelector('.shop-detail')!;
    this.navListEl = this.root.querySelector('.shop-nav')!;

    // 绑定关闭按钮和背景点击
    this.root.querySelector('.shop-close')!.addEventListener('click', () => this.close());
    this.root.querySelector('.shop-backdrop')!.addEventListener('click', () => this.close());

    // 阻止商店内的触摸/鼠标事件穿透到下层画布
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.root.addEventListener('pointermove', (e) => e.stopPropagation());
    this.root.addEventListener('pointerup', (e) => e.stopPropagation());

    this.buildNav();
    this.renderCategoryItems();
    this.renderDetail(null);
  }

  private buildNav(): void {
    this.navListEl.innerHTML = '';
    for (const cat of CATEGORY_NAMES) {
      const btn = document.createElement('div');
      btn.className = `shop-nav-btn${cat.id === this.currentCategory ? ' active' : ''}`;
      btn.textContent = cat.name;
      btn.addEventListener('click', () => {
        this.currentCategory = cat.id;
        this.navListEl.querySelectorAll('.shop-nav-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.renderCategoryItems();
      });
      this.navListEl.appendChild(btn);
    }
  }

  private renderCategoryItems(): void {
    this.itemsGridEl.innerHTML = '';
    const items = Object.values(ITEM_DEFINITIONS).filter((item) => {
      if (this.currentCategory === 'all') return true;
      return item.category === this.currentCategory;
    });

    for (const item of items) {
      const card = document.createElement('div');
      card.className = `shop-item-card${item.id === this.selectedItemId ? ' selected' : ''}`;
      card.dataset.itemId = item.id;

      const iconWrap = document.createElement('div');
      iconWrap.className = 'card-icon-wrap';
      iconWrap.appendChild(getItemIconCanvas(item.id, 46));
      card.appendChild(iconWrap);

      const enName = getItemEnName(item.id);
      const info = document.createElement('div');
      info.className = 'card-info';
      info.innerHTML = `
        <div class="card-name" title="${item.name}">${item.name}</div>
        <div class="card-en-name" title="${enName}">${enName}</div>
        <div class="card-bottom">
          <span class="card-cost"><span class="coin">●</span>${item.cost.toLocaleString()}</span>
          ${item.active ? '<span class="card-tag active">主动</span>' : ''}
          ${item.passive ? '<span class="card-tag passive">被动</span>' : ''}
        </div>
      `;
      card.appendChild(info);

      card.addEventListener('click', () => {
        this.selectItem(item.id);
      });

      card.addEventListener('dblclick', () => {
        this.onCommand({ type: 'buy', itemId: item.id });
      });

      this.itemsGridEl.appendChild(card);
    }
  }

  selectItem(itemId: string): void {
    this.selectedItemId = itemId;
    this.itemsGridEl.querySelectorAll('.shop-item-card').forEach((c) => {
      c.classList.toggle('selected', (c as HTMLElement).dataset.itemId === itemId);
    });
    this.renderDetail();
  }

  private renderDetail(unit?: Unit | null): void {
    const item = getItemDef(this.selectedItemId);
    if (!item) {
      this.detailEl.innerHTML = '<div class="no-selection">请选择一件装备查看详情</div>';
      return;
    }

    const u = unit ?? null;
    const playerGold = u?.hero?.gold ?? 0;
    const canAfford = playerGold >= item.cost;
    const enName = getItemEnName(item.id);
    const categoryName = CATEGORY_LABELS[item.category] ?? '装备';
    const tierTag = item.components && item.components.length > 0 ? '进阶合成' : '基础配件';

    // 检查背包中是否拥有该物品或其配件
    const invItemIndex = u ? u.inventory.findIndex((it) => it && it.id === item.id) : -1;
    const ownedInstance = invItemIndex >= 0 ? u!.inventory[invItemIndex] : null;

    // 格式化属性加成
    const formattedStats = formatItemStats(item);

    // 配方树组件 (带有已拥有组件识别与差价计算)
    let remainingCost = item.cost;
    const isComposite = item.components && item.components.length > 0;
    const possessedComps = u
      ? [...u.inventory.filter((it): it is NonNullable<typeof it> => it !== null).map((it) => it.id)]
      : [];

    const compData: { id: string; name: string; cost: number; owned: boolean; isRecipe?: boolean }[] = [];

    if (isComposite && item.components) {
      for (const cId of item.components) {
        const cDef = getItemDef(cId);
        if (!cDef) continue;
        const idx = possessedComps.indexOf(cId);
        const owned = idx >= 0;
        if (owned) {
          possessedComps.splice(idx, 1);
          remainingCost -= cDef.cost;
        }
        compData.push({ id: cId, name: cDef.name, cost: cDef.cost, owned });
      }
      if ((item.recipeCost ?? 0) > 0) {
        compData.push({ id: 'recipe', name: '合成卷轴', cost: item.recipeCost!, owned: false, isRecipe: true });
      }
    }

    // 查询该物品可以合成的高级进阶装备 (Builds Into)
    const buildsInto = getBuildsInto(item.id);

    this.detailEl.innerHTML = `
      <div class="detail-header">
        <div class="detail-icon-wrap"></div>
        <div class="detail-title-info">
          <div class="detail-name">${item.name}</div>
          <div class="detail-en-name">${enName}</div>
          <div class="detail-tags-row">
            <span class="detail-category-badge">${categoryName} · ${tierTag}</span>
          </div>
          <div class="detail-cost-row">
            <span class="detail-cost-val"><span class="coin">●</span> ${item.cost.toLocaleString()} 金币</span>
            <span class="detail-sell-val">出售返还: 💰 ${Math.floor(item.cost / 2).toLocaleString()}</span>
          </div>
        </div>
      </div>

      ${
        formattedStats.length > 0
          ? `<div class="detail-stats-box">
              <div class="detail-sec-title">属性加成</div>
              <div class="detail-stats-grid">
                ${formattedStats.map((s) => `<div class="stat-line stat-${s.type}">${s.text}</div>`).join('')}
              </div>
            </div>`
          : ''
      }

      ${
        item.active
          ? `<div class="detail-ability active">
              <div class="ability-head-row">
                <span class="ability-tag active">⚡ 主动</span>
                <span class="ability-name">${item.active.name}</span>
              </div>
              <div class="ability-meta-strip">
                <span class="ability-meta mana ${item.active.manaCost ? '' : 'free'}">🔷 ${item.active.manaCost ? `${item.active.manaCost} 魔法` : '无魔法消耗'}</span>
                ${item.active.cooldown ? `<span class="ability-meta cd">⏱️ ${item.active.cooldown}秒 冷却</span>` : '<span class="ability-meta cd free">⏱️ 无冷却</span>'}
                ${item.active.castRange ? `<span class="ability-meta range">🎯 施法距离 ${item.active.castRange}</span>` : ''}
                <span class="ability-meta target">🎯 ${TARGET_TYPE_LABELS[item.active.targetType] ?? item.active.targetType}</span>
              </div>
              <div class="ability-desc">${item.active.description}</div>
            </div>`
          : ''
      }

      ${
        item.passive
          ? `<div class="detail-ability passive">
              <div class="ability-head-row">
                <span class="ability-tag passive">🛡️ 被动</span>
                <span class="ability-name">${item.passive.name}</span>
              </div>
              <div class="ability-desc">${item.passive.description}</div>
            </div>`
          : ''
      }

      ${
        isComposite
          ? `<div class="detail-recipe-section">
              <div class="recipe-title">
                <span>合成配件 (共 ${compData.length} 件)</span>
                <span class="recipe-diff">还需补齐: 💰 ${Math.max(0, remainingCost).toLocaleString()}</span>
              </div>
              <div class="recipe-grid"></div>
            </div>`
          : ''
      }

      ${
        buildsInto.length > 0
          ? `<div class="detail-builds-into">
              <div class="builds-title">可进阶合成 (${buildsInto.length})：点击直接切换</div>
              <div class="builds-chips"></div>
            </div>`
          : ''
      }

      <div class="detail-actions">
        <button class="btn-buy${canAfford ? ' enabled' : ' disabled'}">
          ${isComposite && remainingCost < item.cost ? `补齐配件 (${remainingCost})` : `购买 (${item.cost})`}
        </button>
        ${
          ownedInstance
            ? `<button class="btn-sell">
                ${ownedInstance.costPaid === item.cost ? '原价退款 (100%)' : `出售 (${Math.floor(item.cost / 2)})`}
              </button>`
            : ''
        }
      </div>
    `;

    // 填入大图标
    const iconContainer = this.detailEl.querySelector('.detail-icon-wrap')!;
    iconContainer.appendChild(getItemIconCanvas(item.id, 60));

    // 填入合成配件 Canvas 图标（避免使用脆弱的 outerHTML）
    if (isComposite) {
      const recipeGrid = this.detailEl.querySelector('.recipe-grid')!;
      for (const comp of compData) {
        const compBox = document.createElement('div');
        compBox.className = `comp-item${comp.owned ? ' owned' : ''}${comp.isRecipe ? ' recipe' : ''}`;
        compBox.title = comp.name;

        const compIconWrap = document.createElement('div');
        compIconWrap.className = 'comp-icon';
        if (comp.isRecipe) {
          compIconWrap.innerHTML = '<span class="recipe-icon">📜</span>';
        } else {
          compIconWrap.appendChild(getItemIconCanvas(comp.id, 32));
        }
        compBox.appendChild(compIconWrap);

        const compName = document.createElement('div');
        compName.className = 'comp-name';
        compName.textContent = comp.name;
        compBox.appendChild(compName);

        const compCost = document.createElement('div');
        compCost.className = 'comp-cost';
        compCost.textContent = `${comp.cost}`;
        compBox.appendChild(compCost);

        if (comp.owned) {
          const check = document.createElement('div');
          check.className = 'comp-check';
          check.textContent = '✓';
          compBox.appendChild(check);
        }

        if (!comp.isRecipe) {
          compBox.style.cursor = 'pointer';
          compBox.addEventListener('click', () => this.selectItem(comp.id));
        }
        recipeGrid.appendChild(compBox);
      }
    }

    // 填入可进阶合成的 Chips
    if (buildsInto.length > 0) {
      const chipsWrap = this.detailEl.querySelector('.builds-chips')!;
      for (const targetItem of buildsInto) {
        const chip = document.createElement('div');
        chip.className = 'build-chip';
        chip.title = `${targetItem.name} (${targetItem.cost} 金币)`;
        chip.appendChild(getItemIconCanvas(targetItem.id, 24));
        const nameSpan = document.createElement('span');
        nameSpan.className = 'build-chip-name';
        nameSpan.textContent = targetItem.name;
        chip.appendChild(nameSpan);
        chip.addEventListener('click', () => this.selectItem(targetItem.id));
        chipsWrap.appendChild(chip);
      }
    }

    // 绑定购买按钮
    const buyBtn = this.detailEl.querySelector('.btn-buy');
    if (buyBtn && canAfford) {
      buyBtn.addEventListener('click', () => {
        this.onCommand({ type: 'buy', itemId: item.id });
      });
    }

    // 绑定出售/退款按钮
    const sellBtn = this.detailEl.querySelector('.btn-sell');
    if (sellBtn && invItemIndex >= 0) {
      sellBtn.addEventListener('click', () => {
        this.onCommand({ type: 'sell', index: invItemIndex });
      });
    }
  }

  update(world: World, unit: Unit | null): void {
    if (!this.isOpen || !unit?.hero) return;

    // 更新金币显示
    const gold = Math.floor(unit.hero.gold);
    if (this.goldEl.textContent !== String(gold)) {
      this.goldEl.textContent = String(gold);
    }

    // 更新商品列表的可负担状态
    const cards = this.itemsGridEl.querySelectorAll<HTMLDivElement>('.shop-item-card');
    cards.forEach((card) => {
      const itemId = card.dataset.itemId;
      if (!itemId) return;
      const def = getItemDef(itemId);
      if (def) {
        const canBuy = gold >= def.cost;
        card.classList.toggle('can-afford', canBuy);
      }
    });

    // 刷新详情面板状态
    this.renderDetail(unit);
  }

  toggle(unit?: Unit | null): void {
    if (this.isOpen) this.close();
    else this.open(unit);
  }

  open(unit?: Unit | null): void {
    this.isOpen = true;
    this.root.classList.add('open');
    this.renderDetail(unit);
  }

  close(): void {
    this.isOpen = false;
    this.root.classList.remove('open');
  }

  get visible(): boolean {
    return this.isOpen;
  }

  destroy(): void {
    this.root.remove();
  }
}
