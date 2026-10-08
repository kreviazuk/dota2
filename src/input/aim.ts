import type { World } from '../sim/world';
import type { Unit } from '../sim/entities/unit';
import type { AbilityInstance, CastTarget } from '../sim/heroes/types';
import type { Vec2 } from '../sim/core/vec2';
import { dist, fromAngle } from '../sim/core/vec2';
import { abilityCastRange, abilityValue, isValidUnitTarget } from '../sim/systems/abilities';
import { nearestOf } from '../sim/query';
import type { AimIndicator } from '../render/view';

/** 拖动瞄准单位技能时，在施法距离之外再放宽多少搜索目标（超出施法距离的目标会先走过去） */
const UNIT_AIM_SLACK = 300;
/** 键盘施法：鼠标附近多远内的单位算"指着它" */
const MOUSE_PICK_RADIUS = 300;
const DEFAULT_DIRECTION_LENGTH = 900;
const DEFAULT_DIRECTION_WIDTH = 120;
const DEFAULT_POINT_RADIUS = 150;
const DEFAULT_NONE_RADIUS = 300;

export interface AimResult {
  indicator: AimIndicator;
  /** undefined = 松手时走智能施法 */
  target?: CastTarget;
}

const unitNear = (world: World, caster: Unit, ab: AbilityInstance, p: Vec2, pred: (t: Unit) => boolean): Unit | null =>
  nearestOf(p, world.units.filter((t) => isValidUnitTarget(caster, ab, t) && pred(t)));

/**
 * 手动瞄准（按住技能键拖动）：根据拖动方向 dir（屏幕方向 = 世界方向，y 向下）和拖动比例 ratio（0..1）
 * 算出画面上的指示器和松手时的施法目标。dir 为 null 时沿英雄朝向。
 */
export function aimAbility(world: World, caster: Unit, ab: AbilityInstance, dir: Vec2 | null, ratio: number, cancel: boolean): AimResult {
  const range = abilityCastRange(caster, ab);
  const d = dir ?? fromAngle(caster.facing);
  const origin = { x: caster.pos.x, y: caster.pos.y };
  const radius = abilityValue(caster, ab, 'radius');
  const along = (len: number): Vec2 => ({ x: origin.x + d.x * len, y: origin.y + d.y * len });
  switch (ab.def.targetType) {
    case 'direction': {
      const len = range || abilityValue(caster, ab, 'distance') || DEFAULT_DIRECTION_LENGTH;
      const width = abilityValue(caster, ab, 'width') || DEFAULT_DIRECTION_WIDTH;
      return { indicator: { kind: 'direction', origin, range: len, dir: d, width, cancel }, target: { dir: d } };
    }
    case 'point': {
      const p = along(range * ratio);
      return { indicator: { kind: 'point', origin, range, point: p, radius: radius || DEFAULT_POINT_RADIUS, cancel }, target: { point: p } };
    }
    case 'unit': {
      const p = along(range * ratio);
      const t = unitNear(world, caster, ab, p, (u) => dist(u.pos, caster.pos) <= range + UNIT_AIM_SLACK);
      return { indicator: { kind: 'unit', origin, range, targetId: t?.id, cancel }, target: t ? { unitId: t.id } : undefined };
    }
    default:
      return { indicator: { kind: 'none', origin, range: radius || DEFAULT_NONE_RADIUS, cancel } };
  }
}

/** 键盘施法（网页调试）：朝鼠标所指的世界坐标 p 施放；单位技能选鼠标附近的合法目标，没有则返回 undefined（智能施法） */
export function pointCastTarget(world: World, caster: Unit, ab: AbilityInstance, p: Vec2): CastTarget | undefined {
  switch (ab.def.targetType) {
    case 'unit': {
      const t = unitNear(world, caster, ab, p, (u) => dist(u.pos, p) <= MOUSE_PICK_RADIUS);
      return t ? { unitId: t.id } : undefined;
    }
    case 'point':
    case 'direction':
      return { point: { x: p.x, y: p.y } };
    default:
      return undefined;
  }
}
