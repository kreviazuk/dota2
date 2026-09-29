import type { Vec2 } from './vec2';
import type { DamageType, Team } from './types';

export type SimEvent =
  | { type: 'damage'; sourceId: number | null; targetId: number; amount: number; damageType: DamageType; crit: boolean; isAttack: boolean }
  | { type: 'heal'; targetId: number; amount: number }
  | { type: 'death'; unitId: number; killerId: number | null }
  | { type: 'attackStart'; attackerId: number; targetId: number }
  | { type: 'miss'; attackerId: number; targetId: number }
  | { type: 'cast'; unitId: number; abilityId: string }
  | { type: 'levelUp'; unitId: number; level: number }
  | { type: 'gold'; unitId: number; amount: number }
  | { type: 'respawn'; unitId: number }
  | { type: 'buildingDestroyed'; unitId: number; team: Team }
  | { type: 'wave'; team: Team; index: number }
  | { type: 'fx'; kind: string; pos: Vec2; radius?: number; dir?: Vec2; duration?: number; unitId?: number; targetId?: number }
  | { type: 'victory'; winner: Team };

export class EventBus {
  private queue: SimEvent[] = [];
  constructor(public enabled: boolean) {}
  emit(e: SimEvent): void {
    if (this.enabled) this.queue.push(e);
  }
  drain(): SimEvent[] {
    const q = this.queue;
    this.queue = [];
    return q;
  }
}
