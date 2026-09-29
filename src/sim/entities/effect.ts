import type { Vec2 } from '../core/vec2';
import { copy } from '../core/vec2';
import type { Team } from '../core/types';
import type { World } from '../world';

export interface AreaEffectInit {
  id: number;
  team: Team;
  sourceId: number;
  pos: Vec2;
  radius: number;
  duration: number;
  interval?: number;
  visual: string;
  data?: Record<string, number>;
  onStart?: (world: World, e: AreaEffect) => void;
  onInterval?: (world: World, e: AreaEffect) => void;
  onEnd?: (world: World, e: AreaEffect) => void;
}

export class AreaEffect {
  readonly id: number;
  readonly team: Team;
  readonly sourceId: number;
  pos: Vec2;
  radius: number;
  duration: number;
  interval: number;
  timer: number;
  elapsed = 0;
  started = false;
  done = false;
  visual: string;
  data: Record<string, number>;
  onStart?: AreaEffectInit['onStart'];
  onInterval?: AreaEffectInit['onInterval'];
  onEnd?: AreaEffectInit['onEnd'];

  constructor(i: AreaEffectInit) {
    this.id = i.id;
    this.team = i.team;
    this.sourceId = i.sourceId;
    this.pos = copy(i.pos);
    this.radius = i.radius;
    this.duration = i.duration;
    this.interval = i.interval ?? 0;
    this.timer = this.interval;
    this.visual = i.visual;
    this.data = { ...(i.data ?? {}) };
    this.onStart = i.onStart;
    this.onInterval = i.onInterval;
    this.onEnd = i.onEnd;
  }
}
