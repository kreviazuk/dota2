import type { DamageType } from './core/types';
import type { Unit } from './entities/unit';
import type { World } from './world';
import { addModifier, removeModifier, type ModifierDef, type ModifierInstance } from './modifiers';

/**
 * 护盾：每次 addShield 都是一个独立的 Modifier 实例（data.remaining = 剩余吸收量，data.mask = 吸收的伤害类型）。
 * 在受伤者的 onIncomingDamage（护甲 / 魔抗减免之后）按加入顺序吸收：先加的先扣，吸收完或到期移除。
 */

const TYPE_BIT: Record<DamageType, number> = { physical: 1, magical: 2, pure: 4 };
const ALL_TYPES = 7;

const defs = new Map<string, ModifierDef>();
const shieldDefs = new WeakSet<ModifierDef>();

function shieldDef(id: string): ModifierDef {
  let d = defs.get(id);
  if (!d) {
    d = {
      id,
      stacking: 'independent',
      onIncomingDamage: (m, owner, world, info) => {
        if (info.amount <= 0 || !(m.data.mask & TYPE_BIT[info.type])) return;
        const absorbed = Math.min(m.data.remaining, info.amount);
        info.amount -= absorbed;
        m.data.remaining -= absorbed;
        if (m.data.remaining <= 1e-6) removeModifier(world, owner, m);
      },
    };
    defs.set(id, d);
    shieldDefs.add(d);
  }
  return d;
}

export const isShield = (m: ModifierInstance): boolean => shieldDefs.has(m.def);

/** 加一个护盾（types 缺省 = 全部伤害类型） */
export function addShield(
  world: World, u: Unit, o: { id: string; amount: number; duration: number; types?: DamageType[]; sourceId?: number },
): ModifierInstance | null {
  const mask = o.types ? o.types.reduce((acc, t) => acc | TYPE_BIT[t], 0) : ALL_TYPES;
  return addModifier(world, u, shieldDef(o.id), {
    sourceId: o.sourceId ?? null, duration: o.duration, data: { remaining: o.amount, mask },
  });
}

/** 剩余护盾总量；给出 type 时只算能吸收该类型的护盾 */
export function shieldTotal(u: Unit, type?: DamageType): number {
  let sum = 0;
  for (const m of u.modifiers) {
    if (!isShield(m)) continue;
    if (type && !(m.data.mask & TYPE_BIT[type])) continue;
    sum += m.data.remaining;
  }
  return sum;
}
