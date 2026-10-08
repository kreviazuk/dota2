import type { Vec2 } from './core/vec2';
import { normalize } from './core/vec2';
import type { AbilitySlot } from './core/types';
import type { CastTarget } from './heroes/types';
import type { Unit } from './entities/unit';
import type { World } from './world';
import { cancelCast, canCast, issueCast, toggleAbility } from './systems/abilities';
import { learnAbility } from './systems/progress';
import { pickTalent } from './talents';
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

/** 被嘲讽、恐惧或自身技能占用（busy）时，移动/攻击/施法/回城类指令无效（加点、选天赋仍然有效） */
export const isCommandLocked = (u: Unit): boolean => u.stats.tauntedBy !== null || u.stats.fearedBy !== null || u.hasState('busy');

/** move/moveTo 打断施法，除非处于允许移动的引导中 */
const interruptsCast = (u: Unit): boolean =>
  !!u.cast && !(u.cast.phase === 'channel' && u.cast.ability.def.channelAllowsMove);

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
      if (interruptsCast(u)) cancelCast(world, u, true);
      u.order = { kind: 'moveDir', dir };
      u.attack.windup = -1;
      return;
    }
    case 'moveTo':
      if (!u.alive || isCommandLocked(u)) return;
      if (interruptsCast(u)) cancelCast(world, u, true);
      u.order = { kind: 'moveTo', point: { x: cmd.point.x, y: cmd.point.y } };
      u.attack.windup = -1;
      return;
    case 'stop':
      if (!u.alive || u.hasState('busy')) return;
      if (u.cast) cancelCast(world, u, true);
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
    case 'cast': {
      if (!u.alive || isCommandLocked(u)) return;
      const ab = u.ability(cmd.slot);
      if (ab) issueCast(world, u, ab, cmd.target);
      return;
    }
    case 'toggle': {
      const ab = u.ability(cmd.slot);
      if (ab && ab.def.targetType === 'toggle' && canCast(world, u, ab)) toggleAbility(world, u, ab);
      return;
    }
    case 'learn':
      learnAbility(world, u, cmd.slot);
      return;
    case 'pickTalent':
      // 死亡时也可以选
      pickTalent(world, u, cmd.tier, cmd.side);
      return;
    case 'recall':
      if (!u.alive || !u.hero || isCommandLocked(u)) return;
      if (u.cast) cancelCast(world, u, true);
      u.order = { kind: 'recall', remaining: world.balance.hero.recallTime, startedAt: world.time };
      u.attack.windup = -1;
      return;
    default:
      // 其余指令在后续任务中实现
      return;
  }
}
