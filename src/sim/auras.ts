import type { Unit } from './entities/unit';
import type { World } from './world';
import type { ModifierDef, ModifierInstance } from './modifiers';
import { addModifier } from './modifiers';
import { unitsInRadius } from './query';

/** ModifierDef.aura：带这个字段的 Modifier 每 tick 给范围内的单位挂上 child */
export interface AuraDef {
  /** 半径（从光环主人中心到目标边缘）；Infinity = 全图。m 是光环所在的 Modifier 实例 */
  radius: (owner: Unit, world: World, m: ModifierInstance) => number;
  team: 'enemy' | 'ally';
  /** team = 'ally' 时是否也作用于主人自己 */
  includeSelf?: boolean;
  includeBuildings?: boolean;
  filter?: (owner: Unit, u: Unit, world: World) => boolean;
  /**
   * 给范围内单位挂的子 Modifier。不要设 perSource：同一个 def 在一个单位身上只保留一个实例（同名光环不叠加），
   * 离开范围后残留 BALANCE.auras.linger 秒（不受状态抗性影响）。子 Modifier 的 sourceId = 光环主人，abilityLevel = m.abilityLevel
   */
  child: ModifierDef;
  /** 子 Modifier 的 data（例如按光环等级算出的数值），每 tick 重新计算 */
  childData?: (owner: Unit, world: World, m: ModifierInstance) => Record<string, number>;
  /** false 时不施加（开关未开）；主人被破坏（breakPassives）时也不施加 */
  active?: (owner: Unit, world: World, m: ModifierInstance) => boolean;
}

function auraTargets(world: World, owner: Unit, aura: AuraDef, radius: number): Unit[] {
  return unitsInRadius(world, owner.pos, radius, (u) => {
    if (aura.team === 'enemy' ? u.team === owner.team : u.team !== owner.team) return false;
    if (u === owner && !aura.includeSelf) return false;
    if (u.kind === 'building' && !aura.includeBuildings) return false;
    return !aura.filter || aura.filter(owner, u, world);
  });
}

/** 系统：每 tick（heroes 之后）刷新所有光环的子 Modifier */
export function updateAuras(world: World, dt: number): void {
  void dt;
  const linger = world.balance.auras.linger;
  for (const owner of world.units) {
    if (!owner.alive || owner.removed || owner.hasState('breakPassives')) continue;
    // 按下标遍历：includeSelf 时子 Modifier 可能追加到 owner.modifiers 末尾（它没有 aura，会被跳过）
    for (let i = 0; i < owner.modifiers.length; i++) {
      const m = owner.modifiers[i];
      const aura = m.def.aura;
      if (!aura) continue;
      if (aura.active && !aura.active(owner, world, m)) continue;
      const radius = aura.radius(owner, world, m);
      for (const u of auraTargets(world, owner, aura, radius)) {
        // 减益的持续时间会被状态抗性缩短；光环残留时间不应该受影响，所以预先放大
        const sr = aura.child.debuff ? u.stats.statusResist : 0;
        const duration = sr > 0 && sr < 0.99 ? linger / (1 - sr) : linger;
        addModifier(world, u, aura.child, {
          sourceId: owner.id, duration, abilityLevel: m.abilityLevel, data: aura.childData?.(owner, world, m),
        });
      }
    }
  }
}
