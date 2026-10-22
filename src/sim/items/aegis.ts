import type { World } from '../world';
import type { Unit } from '../entities/unit';
import { addModifier, findModifier, removeModifier, type ModifierDef } from '../modifiers';
import { cancelCast } from '../systems/abilities';
import { endMotion } from '../systems/motion';
import { grantItem } from './inventory';

/** 不朽之守护重生等待状态：5秒内无敌、不可选中、不能行动 */
export const MOD_AEGIS_REINCARNATING: ModifierDef = {
  id: 'mod_aegis_reincarnating',
  name: '重生中',
  hidden: false,
  dispel: 'none',
  states: ['invulnerable', 'untargetable', 'stunned', 'busy'],
};

/** 不朽之守护 Buff（持续 5 分钟，过期化为治疗药膏） */
export const MOD_AEGIS: ModifierDef = {
  id: 'mod_aegis',
  name: '不朽之守护',
  hidden: false,
  persistOnDeath: true,
  dispel: 'none',
  onRemove: (m, unit, world) => {
    // 若非死亡重生消耗，5分钟到期化为治疗药膏
    if (!m.data.consumed && unit.kind === 'hero' && unit.alive) {
      grantItem(world, unit, 'healing_salve');
      world.events.emit({
        type: 'fx',
        kind: 'aegis_expire',
        pos: { ...unit.pos },
        unitId: unit.id,
      });
    }
  },
};

/** 授予英雄不朽之守护 */
export function grantAegis(world: World, hero: Unit): void {
  if (hero.kind !== 'hero') return;
  addModifier(world, hero, MOD_AEGIS, { duration: 300 });
  world.events.emit({
    type: 'fx',
    kind: 'aegis_pickup',
    pos: { ...hero.pos },
    unitId: hero.id,
  });
}

/**
 * 拦截致命伤害：若持有不朽之守护，进入 5 秒原地复活流程，返回 true；否则返回 false
 */
export function triggerAegis(world: World, unit: Unit): boolean {
  if (unit.kind !== 'hero' || !unit.alive) return false;
  const aegisMod = findModifier(unit, MOD_AEGIS.id);
  if (!aegisMod) return false;

  // 标记为已重生消耗并移除不朽之守护
  aegisMod.data.consumed = 1;
  removeModifier(world, unit, aegisMod);

  // 打断施法与强制位移
  if (unit.cast) cancelCast(world, unit, true);
  if (unit.motion) endMotion(world, unit, true);
  unit.order = { kind: 'idle' };
  unit.attack.targetId = null;
  unit.attack.windup = -1;

  // 进入 5 秒无敌不可选中复活期，暂时保留 1 点生命防逻辑清理
  unit.hp = 1;
  const stasis = addModifier(world, unit, MOD_AEGIS_REINCARNATING, { duration: 5.0 });

  // 驱散所有可驱散的减益
  for (const m of unit.modifiers.slice()) {
    if (m.def.debuff && m.def.dispel !== 'none') {
      removeModifier(world, unit, m);
    }
  }

  world.events.emit({
    type: 'fx',
    kind: 'aegis_reincarnate',
    pos: { ...unit.pos },
    unitId: unit.id,
  });

  world.after(5.0, (w) => {
    if (!unit.alive || unit.removed) return;
    if (stasis) removeModifier(w, unit, stasis);
    unit.hp = unit.stats.maxHp;
    unit.mana = unit.stats.maxMana;
    w.events.emit({ type: 'respawn', unitId: unit.id });
  });

  return true;
}
