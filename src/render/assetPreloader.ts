import { HERO_ROSTER } from '../game/roster';
import { ITEM_DEFINITIONS } from '../sim/items/definitions';

/**
 * 预加载所有英雄头像与装备图标
 * 确保界面在首次展示时无闪烁、无延迟直接呈现官方高清美术资源
 */
export function preloadAssets(): void {
  if (typeof Image === 'undefined') return;

  // 1. 预加载 10 位英雄头像
  for (const hero of HERO_ROSTER) {
    const img = new Image();
    img.src = `/assets/heroes/${hero.id}.png`;
  }

  // 2. 预加载 107 件物品图标
  for (const itemId of Object.keys(ITEM_DEFINITIONS)) {
    const img = new Image();
    img.src = `/assets/items/${itemId}.png`;
  }
}
