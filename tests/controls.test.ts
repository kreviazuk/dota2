import { describe, it, expect } from 'vitest';
import { joystickVector, dirChanged, dragToAim } from '../src/input/aimMath';
import { aimAbility, pointCastTarget } from '../src/input/aim';
import { castCommandFor, heldMoveCommand } from '../src/input/controls';
import { makeWorld, spawnDummy } from './helpers';
import { createHero } from '../src/sim/systems/heroes';
import { newAbilityInstance } from '../src/sim/systems/abilities';
import type { AbilityDef } from '../src/sim/heroes/types';
import { Team } from '../src/sim/core/types';

describe('joystick math', () => {
  it('clamps the knob to the radius and normalizes direction', () => {
    const r = joystickVector(120, 0, 60);
    expect(r.knob).toEqual({ x: 60, y: 0 });
    expect(r.dir).toEqual({ x: 1, y: 0 });
  });
  it('has a dead zone', () => {
    expect(joystickVector(3, 2, 60).dir).toBeNull();
  });
  it('detects meaningful direction changes', () => {
    expect(dirChanged({ x: 1, y: 0 }, { x: 1, y: 0.01 }, 0.1)).toBe(false);
    expect(dirChanged({ x: 1, y: 0 }, { x: 0, y: 1 }, 0.1)).toBe(true);
    expect(dirChanged(null, { x: 0, y: 1 }, 0.1)).toBe(true);
  });
});

describe('aim drag', () => {
  it('maps drag distance to a 0..1 ratio', () => {
    const a = dragToAim(60, 0, 120);
    expect(a.ratio).toBeCloseTo(0.5); expect(a.dir).toEqual({ x: 1, y: 0 });
    expect(dragToAim(0, 500, 120).ratio).toBe(1);
    expect(dragToAim(0, 0, 120).dir).toBeNull();
  });
});

const POINT_SKILL: AbilityDef = {
  id: 'test_point', name: '测试落点', description: '', slot: 'Q', maxLevel: 4, targetType: 'point',
  castRange: [600], values: { radius: [200] },
};

describe('manual aiming', () => {
  const setup = () => {
    const w = makeWorld();
    const axe = createHero(w, 'axe', Team.Radiant, true);
    axe.pos = { x: 1500, y: 5000 };
    w.step();
    return { w, axe };
  };

  it('no-target skills show their radius around the hero and cast without a target', () => {
    const { w, axe } = setup();
    const q = axe.ability('Q')!;
    q.level = 1;
    const r = aimAbility(w, axe, q, { x: 1, y: 0 }, 1, false);
    expect(r.indicator.kind).toBe('none');
    expect(r.indicator.range).toBe(315);
    expect(r.indicator.origin).toEqual({ x: 1500, y: 5000 });
    expect(r.target).toBeUndefined();
    axe.hero!.talentValueBonus['axe_berserkers_call.radius'] = 85;
    expect(aimAbility(w, axe, q, null, 0, true).indicator).toMatchObject({ range: 400, cancel: true });
  });

  it('unit skills lock the valid enemy closest to the aimed point', () => {
    const { w, axe } = setup();
    const wAb = axe.ability('W')!;
    wAb.level = 1; // 施法距离 600
    const near = spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 4800 } });
    const far = spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 4450 } });
    spawnDummy(w, { team: Team.Radiant, pos: { x: 1500, y: 4400 } }); // 友军不能选
    spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 3800 } }); // 超出 施法距离 + 300
    const up = { x: 0, y: -1 };
    expect(aimAbility(w, axe, wAb, up, 0.1, false).target).toEqual({ unitId: near.id });
    const full = aimAbility(w, axe, wAb, up, 1, false);
    expect(full.target).toEqual({ unitId: far.id });
    expect(full.indicator).toMatchObject({ kind: 'unit', range: 600, targetId: far.id });
    far.alive = false;
    near.alive = false;
    const none = aimAbility(w, axe, wAb, up, 1, false);
    expect(none.target).toBeUndefined();
    expect(none.indicator.targetId).toBeUndefined();
  });

  it('point skills land along the drag direction scaled by the drag ratio', () => {
    const { w, axe } = setup();
    const ab = newAbilityInstance(POINT_SKILL);
    ab.level = 1;
    const r = aimAbility(w, axe, ab, { x: 1, y: 0 }, 0.5, false);
    expect(r.target).toEqual({ point: { x: 1800, y: 5000 } });
    expect(r.indicator).toMatchObject({ kind: 'point', range: 600, point: { x: 1800, y: 5000 }, radius: 200 });
    // 没有拖动方向时沿英雄朝向（天辉出生朝上）
    const f = aimAbility(w, axe, ab, null, 1, false);
    expect(f.target?.point?.x).toBeCloseTo(1500);
    expect(f.target?.point?.y).toBeCloseTo(4400);
  });

  it('keyboard casts target the unit under the mouse or the mouse point', () => {
    const { w, axe } = setup();
    const wAb = axe.ability('W')!;
    wAb.level = 1;
    const e = spawnDummy(w, { team: Team.Dire, pos: { x: 1700, y: 4700 } });
    expect(pointCastTarget(w, axe, wAb, { x: 1650, y: 4650 })).toEqual({ unitId: e.id });
    expect(pointCastTarget(w, axe, wAb, { x: 1200, y: 4200 })).toBeUndefined();
    const pt = newAbilityInstance(POINT_SKILL);
    pt.level = 1;
    expect(pointCastTarget(w, axe, pt, { x: 1600, y: 4900 })).toEqual({ point: { x: 1600, y: 4900 } });
    expect(pointCastTarget(w, axe, axe.ability('Q')!, { x: 1600, y: 4900 })).toBeUndefined();
  });
});

describe('cast commands', () => {
  it('none abilities carry the held movement direction', () => {
    const w = makeWorld();
    const axe = createHero(w, 'axe', Team.Radiant, true);
    const q = axe.ability('Q')!;
    expect(castCommandFor(axe, q, null)).toBeNull(); // 没学会
    q.level = 1;
    expect(castCommandFor(axe, q, null)).toEqual({ type: 'cast', slot: 'Q' });
    expect(castCommandFor(axe, q, { x: 0, y: -1 })).toEqual({ type: 'cast', slot: 'Q', target: { dir: { x: 0, y: -1 } } });
    // 单位技能不带方向（智能施法）
    const wAb = axe.ability('W')!;
    wAb.level = 1;
    expect(castCommandFor(axe, wAb, { x: 1, y: 0 })).toEqual({ type: 'cast', slot: 'W' });
    // 被动没有指令；开关技能 → toggle
    const e = axe.ability('E')!;
    e.level = 1;
    expect(castCommandFor(axe, e, { x: 1, y: 0 })).toBeNull();
    const tog = newAbilityInstance({ id: 'test_toggle', name: '开关', description: '', slot: 'X2', maxLevel: 1, targetType: 'toggle', values: {} });
    tog.level = 1;
    expect(castCommandFor(axe, tog, { x: 1, y: 0 })).toEqual({ type: 'toggle', slot: 'X2' });
  });
});

describe('held joystick', () => {
  it('resumes walking in the held direction once a cast has finished', () => {
    const w = makeWorld();
    const axe = createHero(w, 'axe', Team.Radiant, true);
    axe.pos = { x: 1500, y: 5000 };
    axe.ability('Q')!.level = 1;
    axe.mana = axe.stats.maxMana;
    const up = { x: 0, y: -1 };
    w.issue(axe.id, { type: 'move', dir: up });
    w.step();
    expect(heldMoveCommand(axe, up)).toBeNull(); // 正在按摇杆走：不重复发
    w.issue(axe.id, { type: 'cast', slot: 'Q' });
    w.step();
    expect(axe.cast).not.toBeNull();
    expect(heldMoveCommand(axe, up)).toBeNull(); // 前摇中不发（不打断施法）
    for (let i = 0; i < 30 && axe.cast; i++) w.step();
    expect(axe.cast).toBeNull();
    expect(axe.order.kind).toBe('idle');
    expect(heldMoveCommand(axe, up)).toEqual({ type: 'move', dir: up });
    expect(heldMoveCommand(axe, null)).toBeNull(); // 松开摇杆后不动
  });
});
