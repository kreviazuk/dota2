import type { Vec2 } from './core/vec2';
import { normalize } from './core/vec2';
import type { AbilitySlot } from './core/types';
import type { CastTarget } from './heroes/types';
import type { Unit } from './entities/unit';
import type { World } from './world';
import { canAttack, smartAttackTarget, lastHitTarget, buildingTarget } from './query';

export type Command =
  | { type: 'move'; dir: Vec2 | null }
  | { type: 'moveTo'; point: Vec2 }
  | { type: 'stop' }
  | { type: 'attack'; mode: 'smart' | 'lastHit' | 'building'; targetId?: number }
  | { type: 'cast'; slot: AbilitySlot; target?: CastTarget }
  | { type: 'toggle'; slot: AbilitySlot }
  | { type: 'useItem'; index: number; target?: CastTarget }
  | { type: 'learn'; slot: AbilitySlot }
  | { type: 'pickTalent'; tier: 0 | 1 | 2 | 3; side: 0 | 1 }
  | { type: 'buy'; itemId: string }
  | { type: 'sell'; index: number }
  | { type: 'recall' };

/** 被嘲讽或恐惧时，移动/攻击/施法类指令无效 */
export const isCommandLocked = (u: Unit): boolean => u.stats.tauntedBy !== null || u.stats.fearedBy !== null;

export function applyCommand(world: World, u: Unit, cmd: Command): void {
  switch (cmd.type) {
    case 'move': {
      if (!u.alive || isCommandLocked(u)) return;
      if (!cmd.dir) {
        if (u.order.kind === 'moveDir') u.order = { kind: 'idle' };
        return;
      }
      const dir = normalize(cmd.dir);
      if (dir.x === 0 && dir.y === 0) return;
      u.order = { kind: 'moveDir', dir };
      u.attack.windup = -1;
      return;
    }
    case 'moveTo':
      if (!u.alive || isCommandLocked(u)) return;
      u.order = { kind: 'moveTo', point: { x: cmd.point.x, y: cmd.point.y } };
      u.attack.windup = -1;
      return;
    case 'stop':
      if (!u.alive) return;
      u.order = { kind: 'idle' };
      u.attack.windup = -1;
      return;
    case 'attack': {
      if (!u.alive || isCommandLocked(u)) return;
      let t = cmd.targetId !== undefined ? world.getUnit(cmd.targetId) ?? null : null;
      if (t && !canAttack(u, t)) t = null;
      if (!t && cmd.targetId === undefined)
        t = cmd.mode === 'lastHit' ? lastHitTarget(world, u) : cmd.mode === 'building' ? buildingTarget(world, u) : smartAttackTarget(world, u);
      if (!t) return;
      u.order = { kind: 'attack', targetId: t.id, persistent: true };
      return;
    }
    default:
      // 其余指令在后续任务中实现
      return;
  }
}
