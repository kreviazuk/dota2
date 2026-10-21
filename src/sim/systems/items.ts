import type { World } from '../world';

/**
 * 物品系统每 tick 更新：
 * 推进所有存活单位背包中物品的冷却时间。
 */
export function updateItems(world: World, dt: number): void {
  for (const u of world.units) {
    if (!u.alive) continue;
    for (const it of u.inventory) {
      if (it && it.cooldownRemaining && it.cooldownRemaining > 0) {
        it.cooldownRemaining = Math.max(0, it.cooldownRemaining - dt);
      }
    }
  }
}
