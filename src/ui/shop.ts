import type { World } from '../sim/world';
import type { Unit } from '../sim/entities/unit';
import type { ItemCategory } from '../sim/items/types';
import { ITEM_DEFINITIONS, getItemDef } from '../sim/items/definitions';
import { getItemIconCanvas } from '../render/itemIcons';
import type { Command } from '../sim/commands';

export type ShopCategory = 'all' | ItemCategory;

const CATEGORY_NAMES: { id: ShopCategory; name: string }[] = [
  { id: 'all', name: '全部' },
  { id: 'consumables', name: '消耗品' },
  { id: 'attributes', name: '属性' },
  { id: 'armaments', name: '军械' },
  { id: 'boots', name: '鞋类' },
  { id: 'early', name: '小件' },
  { id: 'defense', name: '防具' },
  { id: 'weapons', name: '武器' },
  { id: 'utility', name: '法术' },
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
          <div class="shop-title">商店</div>
          <div class="shop-gold"><span class="coin">●</span><span class="shop-gold-val">0</span></div>
          <div class="shop-close">✕</div>
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

      const icon = getItemIconCanvas(item.id, 40);
      card.appendChild(icon);

      const info = document.createElement('div');
      info.className = 'card-info';
      info.innerHTML = `
        <div class="card-name">${item.name}</div>
        <div class="card-cost"><span class="coin">●</span>${item.cost}</div>
      `;
      card.appendChild(info);

      card.addEventListener('click', () => {
        this.selectedItemId = item.id;
        this.itemsGridEl.querySelectorAll('.shop-item-card').forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
        this.renderDetail();
      });

      card.addEventListener('dblclick', () => {
        this.onCommand({ type: 'buy', itemId: item.id });
      });

      this.itemsGridEl.appendChild(card);
    }
  }

  private renderDetail(unit?: Unit | null): void {
    const item = getItemDef(this.selectedItemId);
    if (!item) {
      this.detailEl.innerHTML = '<div class="no-selection">请选择一件装备</div>';
      return;
    }

    const u = unit ?? null;
    const playerGold = u?.hero?.gold ?? 0;
    const canAfford = playerGold >= item.cost;

    // 检查背包中是否拥有该物品或其配件
    const invItemIndex = u ? u.inventory.findIndex((it) => it && it.id === item.id) : -1;
    const ownedInstance = invItemIndex >= 0 ? u!.inventory[invItemIndex] : null;

    // 格式化属性加成
    const statsLines: string[] = [];
    if (item.stats) {
      const s = item.stats;
      if (s.str) statsLines.push(`+${s.str} 力量`);
      if (s.agi) statsLines.push(`+${s.agi} 敏捷`);
      if (s.int) statsLines.push(`+${s.int} 智力`);
      if (s.allStats) statsLines.push(`+${s.allStats} 全属性`);
      if (s.bonusDamage) statsLines.push(`+${s.bonusDamage} 攻击力`);
      if (s.attackSpeed) statsLines.push(`+${s.attackSpeed} 攻击速度`);
      if (s.armor) statsLines.push(`+${s.armor} 护甲`);
      if (s.magicResist) statsLines.push(`+${Math.round(s.magicResist * 100)}% 魔法抗性`);
      if (s.maxHp) statsLines.push(`+${s.maxHp} 生命上限`);
      if (s.hpRegen) statsLines.push(`+${s.hpRegen} 生命回复/秒`);
      if (s.maxMana) statsLines.push(`+${s.maxMana} 魔法上限`);
      if (s.manaRegen) statsLines.push(`+${s.manaRegen} 魔法回复/秒`);
      if (s.moveSpeed) statsLines.push(`+${s.moveSpeed} 移动速度`);
      if (s.moveSpeedPct) statsLines.push(`+${Math.round(s.moveSpeedPct * 100)}% 移动速度`);
      if (s.evasion) statsLines.push(`+${Math.round(s.evasion * 100)}% 闪避`);
      if (s.lifesteal) statsLines.push(`+${Math.round(s.lifesteal * 100)}% 物理吸血`);
    }

    // 配方树组件
    let componentsHtml = '';
    let remainingCost = item.cost;
    if (item.components && item.components.length > 0) {
      const possessedComps = u ? [...u.inventory.filter((it): it is NonNullable<typeof it> => it !== null).map((it) => it.id)] : [];
      const compBoxes = item.components.map((cId) => {
        const cDef = getItemDef(cId);
        if (!cDef) return '';
        const idx = possessedComps.indexOf(cId);
        const owned = idx >= 0;
        if (owned) {
          possessedComps.splice(idx, 1);
          remainingCost -= cDef.cost;
        }
        return `
          <div class="comp-item${owned ? ' owned' : ''}">
            <div class="comp-icon">${getItemIconCanvas(cId, 32).outerHTML}</div>
            <div class="comp-name">${cDef.name}</div>
            <div class="comp-cost">${cDef.cost}</div>
            ${owned ? '<div class="comp-check">✓</div>' : ''}
          </div>
        `;
      });

      if ((item.recipeCost ?? 0) > 0) {
        compBoxes.push(`
          <div class="comp-item recipe">
            <div class="comp-icon"><div class="recipe-icon">📜</div></div>
            <div class="comp-name">卷轴</div>
            <div class="comp-cost">${item.recipeCost}</div>
          </div>
        `);
      }

      componentsHtml = `
        <div class="detail-recipe-section">
          <div class="recipe-title">合成配件 (所需差价: ${Math.max(0, remainingCost)})</div>
          <div class="recipe-grid">${compBoxes.join('')}</div>
        </div>
      `;
    }

    this.detailEl.innerHTML = `
      <div class="detail-header">
        <div class="detail-icon-wrap"></div>
        <div class="detail-title-info">
          <div class="detail-name">${item.name}</div>
          <div class="detail-category">${CATEGORY_NAMES.find((c) => c.id === item.category)?.name ?? ''}</div>
          <div class="detail-cost"><span class="coin">●</span>${item.cost} 金币</div>
        </div>
      </div>
      <div class="detail-stats">${statsLines.map((s) => `<div class="stat-line">${s}</div>`).join('')}</div>
      ${
        item.active
          ? `<div class="detail-ability active">
              <span class="ability-tag active">主动</span>
              <strong>${item.active.name}</strong>：${item.active.description}
              ${item.active.cooldown ? `<div class="ability-cd">冷却：${item.active.cooldown}秒</div>` : ''}
            </div>`
          : ''
      }
      ${
        item.passive
          ? `<div class="detail-ability passive">
              <span class="ability-tag passive">被动</span>
              <strong>${item.passive.name}</strong>：${item.passive.description}
            </div>`
          : ''
      }
      ${componentsHtml}
      <div class="detail-actions">
        <button class="btn-buy${canAfford ? ' enabled' : ' disabled'}">
          购买 (${item.cost})
        </button>
        ${
          ownedInstance
            ? `<button class="btn-sell">
                ${ownedInstance.costPaid === item.cost ? '原价退款 (100%)' : '出售 (50%)'}
              </button>`
            : ''
        }
      </div>
    `;

    // 填入大图标
    const iconContainer = this.detailEl.querySelector('.detail-icon-wrap')!;
    iconContainer.appendChild(getItemIconCanvas(item.id, 56));

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
