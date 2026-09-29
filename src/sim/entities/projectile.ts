import type { Vec2 } from '../core/vec2';
import { copy } from '../core/vec2';
import type { Team } from '../core/types';
import type { Unit } from './unit';
import type { World } from '../world';

export interface ProjectileInit {
  id: number;
  team: Team;
  sourceId: number;
  pos: Vec2;
  speed: number;
  kind: 'homing' | 'linear';
  targetId?: number;
  dir?: Vec2;
  maxDistance?: number;
  /** 直线弹道的碰撞半径 */
  width?: number;
  pierce?: boolean;
  /** 渲染层使用的外观 key */
  visual: string;
  hitFilter?: (world: World, u: Unit) => boolean;
  onHit: (world: World, target: Unit, p: Projectile) => void;
  onEnd?: (world: World, p: Projectile) => void;
  /** 自定义每帧更新；返回 true 表示已处理，跳过默认逻辑 */
  update?: (world: World, p: Projectile, dt: number) => boolean;
}

export class Projectile {
  readonly id: number;
  readonly team: Team;
  readonly sourceId: number;
  pos: Vec2;
  prevPos: Vec2;
  speed: number;
  kind: 'homing' | 'linear';
  targetId?: number;
  dir?: Vec2;
  maxDistance: number;
  width: number;
  pierce: boolean;
  visual: string;
  hitFilter?: ProjectileInit['hitFilter'];
  onHit: ProjectileInit['onHit'];
  onEnd?: ProjectileInit['onEnd'];
  update?: ProjectileInit['update'];
  traveled = 0;
  done = false;
  hit = new Set<number>();
  data: Record<string, number> = {};

  constructor(i: ProjectileInit) {
    this.id = i.id;
    this.team = i.team;
    this.sourceId = i.sourceId;
    this.pos = copy(i.pos);
    this.prevPos = copy(i.pos);
    this.speed = i.speed;
    this.kind = i.kind;
    this.targetId = i.targetId;
    this.dir = i.dir;
    this.maxDistance = i.maxDistance ?? Infinity;
    this.width = i.width ?? 0;
    this.pierce = i.pierce ?? false;
    this.visual = i.visual;
    this.hitFilter = i.hitFilter;
    this.onHit = i.onHit;
    this.onEnd = i.onEnd;
    this.update = i.update;
  }
}
