import { describe, it, expect } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { facingToRotY, groundHeight, simToThree, threeToSim, RIVER_DEPTH, FOREST_RISE } from '../src/render3d/coords';
import { Camera3D, CAM3D, cameraDistance, rayPlaneY } from '../src/render3d/camera3d';
import { AnimTracker, BACKSWING, blendPose, selectState, turnToward, windupProgress, type AnimInput } from '../src/render3d/anim';
import { arcFor, homingProgress, projectileHeight } from '../src/render3d/projectileArc';
import { Bone, MeshBasicMaterial } from 'three';
import { AXE_SPEC, attackPose, axePose, deathPose, idlePose, releasePose, runPose } from '../src/render3d/models/axe';
import { SVEN_SPEC, attackPose as svenAttack } from '../src/render3d/models/sven';
import { LINA_SPEC, attackPose as linaAttack, runPose as linaRun, idlePose as linaIdle } from '../src/render3d/models/lina';
import { CM_SPEC } from '../src/render3d/models/crystal_maiden';
import { ZEUS_SPEC, attackPose as zeusAttack, jumpPose as zeusJump, runPose as zeusRun, idlePose as zeusIdle } from '../src/render3d/models/zeus';
import { DROW_SPEC, attackPose as drowAttack, multishotPose as drowMultishot, runPose as drowRun, idlePose as drowIdle } from '../src/render3d/models/drow_ranger';
import { Fx3D } from '../src/render3d/fx3d';
import { lookupAreaVisual as areaVisual, lookupFx as fxFor, lookupModifierVisual as modVisual, projectileStyle as projStyle } from '../src/render3d/fx/registry';
import { getHeroDef } from '../src/sim/heroes';
import '../src/render3d/fx/index';
import { heroModelIds, heroModelSpec } from '../src/render3d/models/registry';
import { SkinnedHeroModel } from '../src/render3d/models/heroModel';
import {
  applyHumanoid, castGenericPose, channelPose, dispatchPose, humanoidBones, deathPose as hDeath, idlePose as hIdle, runPose as hRun, stunnedPose as hStun,
  type Stance,
} from '../src/render3d/models/humanoid';
import { allHeroIds } from '../src/sim/heroes';
import { MAP } from '../src/sim/data/map';
import { Team } from '../src/sim/core/types';
import { DT } from '../src/sim/core/constants';

const DEG = Math.PI / 180;

describe('sim ↔ three coordinates', () => {
  it('maps x→x, y→z, height→y and back', () => {
    const v = simToThree(120, 4500, 33);
    expect(v).toEqual({ x: 120, y: 33, z: 4500 });
    expect(threeToSim(v)).toEqual({ x: 120, y: 4500 });
  });
  it('rotates +Z-facing models to the sim facing direction', () => {
    for (const f of [0, Math.PI / 2, -Math.PI / 2, 2.5, -3]) {
      const fwd = new Vector3(0, 0, 1).applyAxisAngle(new Vector3(0, 1, 0), facingToRotY(f));
      expect(fwd.x).toBeCloseTo(Math.cos(f));
      expect(fwd.z).toBeCloseTo(Math.sin(f));
    }
  });
  it('keeps the walkable lane flat, sinks the river and raises the forest', () => {
    expect(groundHeight(MAP.laneX, 3000)).toBe(0);
    expect(groundHeight(MAP.laneX + 450, 7000)).toBe(0);
    expect(groundHeight(MAP.laneX, MAP.riverY)).toBeCloseTo(-RIVER_DEPTH);
    expect(groundHeight(MAP.laneX + MAP.laneHalfWidth + 300, 3000)).toBeCloseTo(FOREST_RISE);
    // 基地比道路宽
    expect(groundHeight(MAP.laneX + 700, 500)).toBe(0);
  });
});

describe('3D camera', () => {
  const cam = new Camera3D();
  cam.resize(844, 390, 2);
  cam.follow({ x: MAP.laneX, y: 6000 }, Team.Radiant, 0, true);

  it('ray-plane intersection', () => {
    const hit = rayPlaneY(new Vector3(0, 100, 0), new Vector3(0, -1, 1).normalize(), 0)!;
    expect(hit.y).toBeCloseTo(0);
    expect(hit.z).toBeCloseTo(100);
    expect(rayPlaneY(new Vector3(0, 100, 0), new Vector3(0, 1, 0), 0)).toBeNull();
  });

  it('covers about VIEW_WORLD_HEIGHT of ground from the bottom to the top of the screen', () => {
    const top = cam.screenToWorld({ x: cam.viewW / 2, y: 0 });
    const bottom = cam.screenToWorld({ x: cam.viewW / 2, y: cam.viewH });
    expect(bottom.y - top.y).toBeCloseTo(CAM3D.span, 0);
    expect(cameraDistance(CAM3D.pitchDeg * DEG, CAM3D.fovDeg * DEG, CAM3D.span)).toBeGreaterThan(0);
  });

  it('looks up the lane toward the Dire base: screen up = smaller sim y, screen right = larger sim x', () => {
    const c = cam.screenToWorld({ x: cam.viewW / 2, y: cam.viewH / 2 });
    const up = cam.screenToWorld({ x: cam.viewW / 2, y: cam.viewH / 2 - 50 });
    const right = cam.screenToWorld({ x: cam.viewW / 2 + 50, y: cam.viewH / 2 });
    expect(up.y).toBeLessThan(c.y);
    expect(up.x).toBeCloseTo(c.x);
    expect(right.x).toBeGreaterThan(c.x);
    // 镜头中心在英雄前方（夜魇方向）
    expect(cam.y).toBeCloseTo(6000 - CAM3D.lookAhead);
    const hero = cam.worldToScreen({ x: MAP.laneX, y: 6000 });
    expect(hero.y).toBeGreaterThan(cam.viewH / 2);
  });

  it('screenToWorld inverts worldToScreen on the ground', () => {
    for (const p of [{ x: 1234, y: 5900 }, { x: 1700, y: 5500 }, { x: 1100, y: 6300 }]) {
      const w = cam.screenToWorld(cam.worldToScreen(p));
      expect(w.x).toBeCloseTo(p.x, 3);
      expect(w.y).toBeCloseTo(p.y, 3);
    }
  });

  it('ground footprint is a trapezoid wider at the top (far side)', () => {
    const [tl, tr, br, bl] = cam.footprint();
    expect(tr.x - tl.x).toBeGreaterThan(br.x - bl.x);
    expect(tl.y).toBeLessThan(bl.y);
    expect(cam.visible({ x: MAP.laneX, y: 6000 })).toBe(true);
    expect(cam.visible({ x: MAP.laneX, y: 2000 })).toBe(false);
    expect(cam.worldH).toBeCloseTo(CAM3D.span, 0);
  });

  it('enlarges UI elements on short screens like the 2D camera', () => {
    const c = new Camera3D();
    c.resize(1600, 800, 1);
    expect(c.uiScale).toBe(1);
    c.resize(844, 390, 2);
    expect(c.uiScale).toBeCloseTo(720 / 390);
  });

  it('follows smoothly and clamps to the map', () => {
    const c = new Camera3D();
    c.resize(844, 390, 1);
    c.follow({ x: MAP.laneX, y: 6000 }, Team.Radiant, 0, true);
    c.follow({ x: MAP.laneX, y: 7000 }, Team.Radiant, 1 / 60);
    expect(c.y).toBeGreaterThan(6000 - CAM3D.lookAhead);
    expect(c.y).toBeLessThan(7000 - CAM3D.lookAhead);
    c.follow({ x: 5000, y: -500 }, Team.Radiant, 0, true);
    expect(c.x).toBeLessThanOrEqual(MAP.laneX + CAM3D.xRange);
    expect(c.y).toBeGreaterThan(0);
  });
});

const input = (o: Partial<AnimInput> = {}): AnimInput => ({
  alive: true, speed: 0, windup: -1, attackPoint: 0.4, castAbility: null, castProgress: 0, channel: false, stunned: false, taunted: false, ...o,
});

describe('animation state selection and timing', () => {
  it('prioritises death > stun > release > cast > channel > attack > run > idle', () => {
    expect(selectState(input({ alive: false, stunned: true }), true, true)).toBe('dead');
    expect(selectState(input({ stunned: true, castAbility: 'x' }), true, true)).toBe('stunned');
    expect(selectState(input({ castAbility: 'x' }), true, true)).toBe('release');
    expect(selectState(input({ castAbility: 'x', channel: true }), true, false)).toBe('cast');
    expect(selectState(input({ channel: true, speed: 300 }), true, false)).toBe('channel');
    expect(selectState(input({ speed: 300 }), true, false)).toBe('attack');
    expect(selectState(input({ speed: 300 }), false, false)).toBe('run');
    expect(selectState(input({ speed: 10 }), false, false)).toBe('idle');
  });

  it('windup progress reaches 1 exactly when the sim launches the attack', () => {
    expect(windupProgress(-1, 0.4, 0.5)).toBe(-1);
    expect(windupProgress(0.4, 0.4, 0)).toBeCloseTo(0);
    expect(windupProgress(0.2, 0.4, 0)).toBeCloseTo(0.5);
    expect(windupProgress(DT, 0.4, 1)).toBeCloseTo(1);
  });

  it('starts a backswing only when a windup completes, not when it is interrupted', () => {
    const tr = new AnimTracker();
    let w = 0.4;
    while (w > 1e-6) {
      tr.update(input({ windup: w }), DT, 0);
      expect(tr.state).toBe('attack');
      w -= DT;
    }
    tr.update(input({ windup: -1 }), 1 / 60, 0);
    expect(tr.backswing).toBeGreaterThan(0);
    expect(tr.backswingTotal).toBeLessThanOrEqual(BACKSWING);
    expect(tr.state).toBe('attack');
    for (let i = 0; i < 40; i++) tr.update(input(), 1 / 60, 0);
    expect(tr.state).toBe('idle');

    const t2 = new AnimTracker();
    t2.update(input({ windup: 0.3 }), DT, 0);
    t2.update(input({ windup: -1, speed: 300 }), DT, 0);
    expect(t2.backswing).toBe(0);
    expect(t2.state).toBe('run');
  });

  it('advances the run cycle with distance travelled and blends between states', () => {
    const tr = new AnimTracker();
    for (let i = 0; i < 30; i++) tr.update(input({ speed: 300 }), 1 / 60, 0, 150);
    expect(tr.state).toBe('run');
    expect(tr.blend).toBe(1);
    const p0 = tr.runPhase;
    tr.update(input({ speed: 300 }), 0.1, 0, 150);
    // 300 单位/秒 × 0.1 秒 = 30 单位 = 步态周期 150 的 1/5
    expect((tr.runPhase - p0 + Math.PI * 2) % (Math.PI * 2)).toBeCloseTo((Math.PI * 2) / 5, 1);
    tr.update(input({ speed: 0 }), 1 / 60, 0);
    tr.update(input({ speed: 0 }), 1 / 60, 0);
    expect(tr.state).toBe('idle');
    expect(tr.blend).toBeLessThan(1);
  });

  it('tracks one-shot releases, death time, hit flash and ignores paused frames', () => {
    const tr = new AnimTracker();
    tr.trigger('axe_berserkers_call', 0.5);
    tr.update(input(), 0.1, 0);
    expect(tr.state).toBe('release');
    expect(tr.releaseK).toBeCloseTo(0.2);
    tr.update(input(), 0.5, 0);
    expect(tr.release).toBeNull();
    tr.hit();
    tr.update(input(), 0, 0);
    expect(tr.flash).toBe(1);
    tr.update(input({ alive: false }), 0.1, 0);
    tr.update(input({ alive: false }), 0.25, 0);
    expect(tr.state).toBe('dead');
    expect(tr.deadTime).toBeCloseTo(0.25);
    tr.update(input(), 0.1, 0);
    expect(tr.deadTime).toBe(-1);
  });

  it('blends poses and turns along the shortest arc', () => {
    expect(blendPose({ a: 1, b: 2 }, { a: 3, c: 4 }, 0.5)).toEqual({ a: 2, b: 1, c: 2 });
    expect(turnToward(3, -3, 1, 0.1)).toBeCloseTo(3.1);
    expect(turnToward(0, 0.05, 10, 0.1)).toBe(0.05);
  });
});

describe('Axe poses', () => {
  it('the Axe spec keeps the P1 poses', () => {
    const tr = new AnimTracker();
    tr.update(input(), 0.2, 0);
    expect(AXE_SPEC.pose(tr, 1.3, null)).toEqual(axePose(tr, 1.3));
    expect(AXE_SPEC.scale).toBe(1.3);
    expect(AXE_SPEC.headHeight * AXE_SPEC.scale).toBeCloseTo(227.5);
    expect(AXE_SPEC.releaseDur).toEqual({ axe_berserkers_call: 0.65, axe_battle_hunger: 0.45, axe_culling_blade: 0.6 });
    expect(AXE_SPEC.fxTriggers?.axe_helix).toEqual({ kind: 'helix', dur: 0.38 });
    tr.trigger('helix', 0.38);
    tr.update(input(), 0.19, 0);
    expect(AXE_SPEC.spin!(tr, 0, null)).toBeCloseTo(Math.PI);
  });
  const finite = (p: Record<string, number>) => Object.values(p).every(Number.isFinite);
  it('produces finite poses for every state', () => {
    for (const p of [idlePose(1), runPose(2), attackPose(0), attackPose(0.6), attackPose(1), deathPose(0.3), deathPose(3)]) expect(finite(p)).toBe(true);
    for (const id of ['axe_berserkers_call', 'axe_battle_hunger', 'axe_culling_blade', 'helix']) expect(finite(releasePose(id, 0.5))).toBe(true);
  });
  it('raises the axe during the windup and strikes down at the moment of impact', () => {
    expect(attackPose(0.6).shRX).toBeLessThan(attackPose(0).shRX - 2);
    expect(attackPose(1).shRX).toBeGreaterThan(attackPose(0.6).shRX + 1.5);
  });
  it('falls over and sinks after death', () => {
    expect(deathPose(1).bodyX).toBeLessThan(-1.3);
    expect(deathPose(3).sink).toBeGreaterThan(30);
    const tr = new AnimTracker();
    tr.update(input({ alive: false }), 0.1, 0);
    expect(axePose(tr, 0).bodyX).toBeLessThanOrEqual(0);
  });
});

describe('projectile flight height', () => {
  it('interpolates launch → target height with an arc that peaks mid-flight', () => {
    expect(projectileHeight(300, 100, 0, 50)).toBe(300);
    expect(projectileHeight(300, 100, 1, 50)).toBe(100);
    expect(projectileHeight(100, 100, 0.5, 50)).toBe(150);
    expect(homingProgress(1000, 250)).toBeCloseTo(0.75);
    expect(homingProgress(1000, 1500)).toBe(0);
    expect(homingProgress(0, 10)).toBe(1);
    expect(arcFor('siege', 690)).toBeGreaterThan(arcFor('creep', 500));
    expect(arcFor('tower', 700)).toBeLessThan(arcFor('creep', 500));
  });
});

const STANCES: Stance[] = [
  { weaponHand: 'R', hunch: 0, armSpread: 0, heavy: 0 },
  { weaponHand: 'L', hunch: 0.3, armSpread: 0.5, heavy: 1 },
  { weaponHand: 'both', hunch: 0.1, armSpread: 0.25, heavy: 0.7 },
  { weaponHand: 'none', hunch: 0.25, armSpread: 0.3, heavy: 0.2 },
];

describe('hero model registry and shared humanoid rig', () => {
  const finite = (p: Record<string, number>) => Object.values(p).every(Number.isFinite);

  it('every registered hero has a 3D model spec', () => {
    const ids = heroModelIds();
    for (const id of allHeroIds()) expect(ids).toContain(id);
    // 未注册的英雄退回斧王
    expect(heroModelSpec('not_a_hero').id).toBe('axe');
  });

  it('SkinnedHeroModel builds one skinned mesh bound to every bone of the spec', () => {
    for (const id of heroModelIds()) {
      const spec = heroModelSpec(id);
      for (const team of [0, 1]) {
        const m = new SkinnedHeroModel(spec, team, new MeshBasicMaterial());
        expect(m.mesh.skeleton.bones.length).toBe(spec.bones.length);
        const si = m.mesh.geometry.getAttribute('skinIndex');
        const sw = m.mesh.geometry.getAttribute('skinWeight');
        expect(si.count).toBeGreaterThan(100);
        // 逐顶点检查（先计数再断言一次：每个顶点调用 expect 太慢，英雄多了会超时）
        let bad = 0;
        for (let i = 0; i < si.count; i++) {
          const b = si.getX(i);
          if (b < 0 || b >= spec.bones.length || sw.getX(i) !== 1) bad++;
        }
        expect(bad).toBe(0);
        expect(m.headHeightWorld).toBeCloseTo(spec.headHeight * spec.scale);
        // 所有部件都挂在存在的骨骼上，名字一一对应
        for (const [name] of spec.bones) expect(m.bones[name]).toBeDefined();
        // 摆一次姿势不报错，骨骼矩阵有限
        const tr = new AnimTracker();
        tr.update(input({ speed: 300 }), 0.1, 0);
        m.pose(tr, 1, 0, null);
        m.root.updateMatrixWorld(true);
        for (const b of m.mesh.skeleton.bones) expect(b.matrixWorld.elements.every(Number.isFinite)).toBe(true);
        m.dispose();
      }
    }
  });

  it('humanoid base poses are finite for every AnimState and stance', () => {
    const own = { attack: (p: number) => ({ shRX: -p }), cast: () => null, release: () => null };
    const tr = new AnimTracker();
    const states: [Partial<AnimInput>, (t: AnimTracker) => void][] = [
      [{}, () => {}],
      [{ speed: 300 }, () => {}],
      [{ windup: 0.2 }, () => {}],
      [{ castAbility: 'x', castProgress: 0.5 }, () => {}],
      [{ channel: true }, () => {}],
      [{}, (t) => t.trigger('x', 0.5)],
      [{ stunned: true }, () => {}],
      [{ stunned: true, motion: 'knockback' }, () => {}],
      [{ alive: false }, () => {}],
    ];
    const seen = new Set<string>();
    for (const s of STANCES) {
      for (const p of [hIdle(1.3, s), hRun(2, s), channelPose(0.7, s), castGenericPose(0, s), castGenericPose(0.5, s), castGenericPose(1, s)]) expect(finite(p)).toBe(true);
      for (const [inp, prep] of states) {
        prep(tr);
        tr.update(input(inp), 0.05, 0.5);
        seen.add(tr.state);
        expect(finite(dispatchPose(tr, 2.1, s, own))).toBe(true);
      }
    }
    for (const p of [hStun(0.4), hDeath(0.3), hDeath(4)]) expect(finite(p)).toBe(true);
    expect([...seen].sort()).toEqual(['attack', 'cast', 'channel', 'dead', 'idle', 'release', 'run', 'stunned']);
    // 被击退时是浮空挣扎（身体后仰），普通眩晕不是
    tr.update(input({ stunned: true, motion: 'knockback' }), 0.05, 0);
    const struggling = dispatchPose(tr, 1, STANCES[0], own);
    tr.update(input({ stunned: true }), 0.05, 0);
    expect(struggling.bodyX).toBeLessThan((dispatchPose(tr, 1, STANCES[0], own).bodyX ?? 0) - 0.2);
  });

  it('applyHumanoid maps extra-bone channels onto their bones', () => {
    const defs = humanoidBones({ shoulderX: 40 }, [['sword', 'handR', [0, 0, 2]], ['cape', 'torso', [0, 40, -15]]]);
    expect(defs.find((d) => d[0] === 'shL')![2]).toEqual([40, 46, 0]);
    expect(defs.find((d) => d[0] === 'head')![2]).toEqual([0, 58, 2]);
    const b: Record<string, Bone> = {};
    for (const [name] of defs) b[name] = new Bone();
    applyHumanoid(b, { swordX: 0.5, swordZ: -0.2, capeX: 0.3, shLX: -1, elR: -0.4, handRX: 0.2, bodyY: 5, sink: 2 }, { sword: [Math.PI / 2, 0, 0] });
    expect(b.sword.rotation.x).toBeCloseTo(Math.PI / 2 + 0.5);
    expect(b.sword.rotation.z).toBeCloseTo(-0.2);
    expect(b.cape.rotation.x).toBeCloseTo(0.3);
    expect(b.shL.rotation.x).toBeCloseTo(-1);
    expect(b.elR.rotation.x).toBeCloseTo(-0.4);
    expect(b.handR.rotation.x).toBeCloseTo(0.2);
    expect(b.body.position.y).toBeCloseTo(3);
    // 斧王没有手骨骼：缺少的骨骼直接跳过
    const axe: Record<string, Bone> = {};
    for (const [name] of AXE_SPEC.bones) axe[name] = new Bone();
    applyHumanoid(axe, { handRX: 1, axeX: 0.1 }, AXE_SPEC.bindRotations);
    expect(axe.axe.rotation.x).toBeCloseTo(Math.PI / 2 + 0.1);
  });
});

describe('Sven model', () => {
  const finite = (p: Record<string, number>) => Object.values(p).every(Number.isFinite);
  it('sven poses are finite for every state and ability', () => {
    // 每个主动技能都有收招动作
    const actives = getHeroDef('sven').abilities.filter((a) => a.targetType !== 'passive').map((a) => a.id);
    expect(Object.keys(SVEN_SPEC.releaseDur).sort()).toEqual([...actives].sort());
    const states: Partial<AnimInput>[] = [{}, { speed: 320 }, { windup: 0.2 }, { channel: true }, { stunned: true }, { stunned: true, motion: 'hook' }, { alive: false }, { taunted: true }];
    for (const inp of states) {
      const tr = new AnimTracker();
      tr.update(input(inp), 0.05, 0.5);
      tr.update(input(inp), 0.3, 0.5);
      expect(finite(SVEN_SPEC.pose(tr, 1.7, null))).toBe(true);
    }
    for (const id of Object.keys(SVEN_SPEC.releaseDur)) {
      for (const cp of [0, 0.5, 1]) {
        const tr = new AnimTracker();
        tr.update(input({ castAbility: id, castProgress: cp }), 0.05, 0);
        expect(tr.state).toBe('cast');
        expect(finite(SVEN_SPEC.pose(tr, 0.4, null))).toBe(true);
      }
      for (const k of [0, 0.5, 1]) {
        const tr = new AnimTracker();
        const dur = SVEN_SPEC.releaseDur[id];
        tr.trigger(id, dur);
        tr.update(input(), Math.max(1e-3, k * dur * 0.999), 0);
        expect(tr.state).toBe('release');
        expect(finite(SVEN_SPEC.pose(tr, 0.4, null))).toBe(true);
      }
    }
    // 战吼是即时技能：普攻前摇中放战吼时，右臂仍然按普攻出剑
    const tr = new AnimTracker();
    tr.trigger('sven_warcry', SVEN_SPEC.releaseDur.sven_warcry);
    tr.update(input({ windup: 0.15 }), 0.1, 0);
    expect(tr.state).toBe('release');
    const p = SVEN_SPEC.pose(tr, 0.4, null);
    expect(p.shRX).toBeCloseTo(svenAttack(tr.swing).shRX!);
    expect(p.headX).toBeLessThan(svenAttack(tr.swing).headX! - 0.1);
  });

  it('swings the greatsword from behind the right shoulder across to the left', () => {
    expect(svenAttack(0.6).torsoY).toBeLessThan(-0.5);
    expect(svenAttack(1).torsoY).toBeGreaterThan(0.5);
    expect(svenAttack(0.6).shRX).toBeLessThan(svenAttack(0).shRX! - 1.5);
    expect(svenAttack(1).shRZ).toBeGreaterThan(svenAttack(0.6).shRZ! + 0.8);
    expect(SVEN_SPEC.bones.map((b) => b[0])).toEqual(expect.arrayContaining(['sword', 'cape', 'handR']));
  });

  it('registers its projectile, fx events and modifier visuals', () => {
    expect(projStyle('sven_hammer')?.mesh).toBe('hammer');
    for (const k of ['sven_storm_hammer', 'sven_hammer_hit', 'sven_warcry', 'sven_gods_strength']) expect(fxFor(k)).toBeTypeOf('function');
    for (const k of ['sven_warcry', 'sven_gods_strength']) expect(modVisual(k)).toBeDefined();
  });
});

describe('Lina model', () => {
  const finite = (p: Record<string, number>) => Object.values(p).every(Number.isFinite);
  it('lina poses are finite for every state and ability', () => {
    const actives = getHeroDef('lina').abilities.filter((a) => a.targetType !== 'passive').map((a) => a.id);
    expect(Object.keys(LINA_SPEC.releaseDur).sort()).toEqual([...actives].sort());
    const states: Partial<AnimInput>[] = [{}, { speed: 300 }, { windup: 0.4 }, { channel: true }, { stunned: true }, { stunned: true, motion: 'knockback' }, { alive: false }, { taunted: true }];
    for (const inp of states) {
      const tr = new AnimTracker();
      tr.update(input(inp), 0.05, 0.5);
      tr.update(input(inp), 0.3, 0.5);
      expect(finite(LINA_SPEC.pose(tr, 1.7, null))).toBe(true);
    }
    for (const id of Object.keys(LINA_SPEC.releaseDur)) {
      for (const cp of [0, 0.5, 1]) {
        const tr = new AnimTracker();
        tr.update(input({ castAbility: id, castProgress: cp }), 0.05, 0);
        expect(tr.state).toBe('cast');
        expect(finite(LINA_SPEC.pose(tr, 0.4, null))).toBe(true);
      }
      for (const k of [0, 0.5, 1]) {
        const tr = new AnimTracker();
        const dur = LINA_SPEC.releaseDur[id];
        tr.trigger(id, dur);
        tr.update(input(), Math.max(1e-3, k * dur * 0.999), 0);
        expect(tr.state).toBe('release');
        expect(finite(LINA_SPEC.pose(tr, 0.4, null))).toBe(true);
      }
    }
  });

  it('flings the right hand forward, and the ponytail streams back when running', () => {
    // 蓄力时右手收到身后，出手时向前平伸
    expect(linaAttack(0.7).shRX).toBeGreaterThan(0.5);
    expect(linaAttack(1).shRX).toBeLessThan(-1.3);
    // 跑动时整条马尾（三节角度之和）向后飘得更平
    const tail = (p: Record<string, number>) => p.hair1X + p.hair2X + p.hair3X;
    expect(tail(linaRun(1, 0))).toBeGreaterThan(tail(linaIdle(0)) + 0.35);
    expect(LINA_SPEC.bones.map((b) => b[0])).toEqual(expect.arrayContaining(['hair1', 'hair2', 'hair3', 'handL', 'handR']));
    // 头顶高度（血条锚点）在模型的头发尖之上
    expect(LINA_SPEC.headHeight * LINA_SPEC.scale).toBeGreaterThan(170);
  });

  it('registers its projectiles, fx events, area and modifier visuals', () => {
    expect(projStyle('hero:lina')?.mesh).toBe('orb');
    expect(projStyle('lina_dragon_slave')).toMatchObject({ mesh: 'wave', scaleWithWidth: true, height: 26 });
    expect(projStyle('lina_dragon_slave')?.emitter).toBeTypeOf('function');
    for (const k of ['lina_dragon_slave', 'lina_lsa', 'lina_laguna', 'lina_laguna_hit']) expect(fxFor(k)).toBeTypeOf('function');
    expect(areaVisual('lina_lsa')).toBeTypeOf('function');
    for (const k of ['lina_fiery_soul_stack', 'lina_slow_burn_dot']) expect(modVisual(k)).toBeDefined();
  });
});

describe('Crystal Maiden model', () => {
  const finite = (p: Record<string, number>) => Object.values(p).every(Number.isFinite);
  it('crystal_maiden poses are finite for every state and ability', () => {
    const actives = getHeroDef('crystal_maiden').abilities.filter((a) => a.targetType !== 'passive').map((a) => a.id);
    expect(Object.keys(CM_SPEC.releaseDur).sort()).toEqual([...actives].sort());
    const states: Partial<AnimInput>[] = [{}, { speed: 300 }, { windup: 0.4 }, { channel: true }, { stunned: true }, { stunned: true, motion: 'knockback' }, { alive: false }, { taunted: true }];
    for (const inp of states) {
      const tr = new AnimTracker();
      tr.update(input(inp), 0.05, 0.5);
      tr.update(input(inp), 0.3, 0.5);
      expect(finite(CM_SPEC.pose(tr, 1.7, null))).toBe(true);
    }
    for (const id of Object.keys(CM_SPEC.releaseDur)) {
      for (const cp of [0, 0.5, 1]) {
        const tr = new AnimTracker();
        tr.update(input({ castAbility: id, castProgress: cp }), 0.05, 0);
        expect(tr.state).toBe('cast');
        expect(finite(CM_SPEC.pose(tr, 0.4, null))).toBe(true);
      }
      for (const k of [0, 0.5, 1]) {
        const tr = new AnimTracker();
        const dur = CM_SPEC.releaseDur[id];
        tr.trigger(id, dur);
        tr.update(input(), Math.max(1e-3, k * dur * 0.999), 0);
        expect(tr.state).toBe('release');
        expect(finite(CM_SPEC.pose(tr, 0.4, null))).toBe(true);
      }
    }
  });

  /** 摆好姿势后，法杖（本地 +Y）在模型空间里的方向 */
  const staffDir = (inp: Partial<AnimInput>, t = 1): Vector3 => {
    const m = new SkinnedHeroModel(CM_SPEC, 0, new MeshBasicMaterial());
    const tr = new AnimTracker();
    for (let i = 0; i < 4; i++) tr.update(input(inp), 0.2, 0);
    m.pose(tr, t, 0, null);
    m.root.updateMatrixWorld(true);
    const q = new Quaternion();
    m.bones.staff.getWorldQuaternion(q);
    const rootQ = new Quaternion();
    m.root.getWorldQuaternion(rootQ);
    return new Vector3(0, 1, 0).applyQuaternion(rootQ.invert().multiply(q));
  };

  it('holds the staff upright, thrusts it forward to attack, and raises it across her head while channelling', () => {
    expect(staffDir({}).y).toBeGreaterThan(0.95);
    expect(staffDir({ speed: 300 }).y).toBeGreaterThan(0.8);
    // 普攻出手的瞬间：杖头向前倒
    const tr = new AnimTracker();
    expect(CM_SPEC.pose(tr, 0, null).staffX).toBeDefined();
    const thrust = staffDir({ windup: 0.001, attackPoint: 0.4 });
    expect(thrust.z).toBeGreaterThan(0.6);
    // 引导：杖身横在头顶（沿身体左右方向）
    const ch = staffDir({ channel: true });
    expect(Math.abs(ch.x)).toBeGreaterThan(0.85);
    expect(CM_SPEC.bones.map((b) => b[0])).toEqual(expect.arrayContaining(['staff', 'cape', 'handR']));
    expect(CM_SPEC.headHeight).toBeCloseTo(168, -1);
  });

  it('registers its projectile, fx events and modifier visuals', () => {
    expect(projStyle('hero:crystal_maiden')?.mesh).toBe('shard');
    for (const k of ['cm_nova', 'cm_frostbite', 'cm_freezing_field', 'cm_ff_blast']) expect(fxFor(k)).toBeTypeOf('function');
    expect(modVisual('cm_frostbite')?.replaces).toContain('root');
    expect(modVisual('cm_freezing_field')).toBeDefined();
  });
});

describe('Zeus model', () => {
  const finite = (p: Record<string, number>) => Object.values(p).every(Number.isFinite);
  it('zeus poses are finite for every state and ability', () => {
    const actives = getHeroDef('zeus').abilities.filter((a) => a.targetType !== 'passive').map((a) => a.id);
    expect(Object.keys(ZEUS_SPEC.releaseDur).sort()).toEqual([...actives].sort());
    const states: Partial<AnimInput>[] = [
      {}, { speed: 300 }, { windup: 0.4 }, { channel: true }, { stunned: true }, { stunned: true, motion: 'knockback' },
      { stunned: true, motion: 'leap' }, { alive: false }, { taunted: true },
    ];
    for (const inp of states) {
      const tr = new AnimTracker();
      tr.update(input(inp), 0.05, 0.5);
      tr.update(input(inp), 0.3, 0.5);
      expect(finite(ZEUS_SPEC.pose(tr, 1.7, null))).toBe(true);
    }
    for (const id of Object.keys(ZEUS_SPEC.releaseDur)) {
      for (const cp of [0, 0.5, 1]) {
        const tr = new AnimTracker();
        tr.update(input({ castAbility: id, castProgress: cp }), 0.05, 0);
        expect(tr.state).toBe('cast');
        expect(finite(ZEUS_SPEC.pose(tr, 0.4, null))).toBe(true);
      }
      for (const k of [0, 0.5, 1]) {
        const tr = new AnimTracker();
        const dur = ZEUS_SPEC.releaseDur[id];
        tr.trigger(id, dur);
        tr.update(input(), Math.max(1e-3, k * dur * 0.999), 0);
        expect(tr.state).toBe('release');
        expect(finite(ZEUS_SPEC.pose(tr, 0.4, null))).toBe(true);
      }
    }
  });

  it('pushes the right palm forward, tucks its legs mid-leap, and the beard swings with the body', () => {
    // 蓄力时右手收到肩前（小臂折起），出手时向前平推
    expect(zeusAttack(0.6).elR).toBeLessThan(-1.8);
    expect(zeusAttack(1).shRX).toBeLessThan(-1.3);
    expect(zeusAttack(1).elR).toBeGreaterThan(-0.3);
    // 跳跃：腾空时收腿，落地前伸腿
    expect(zeusJump(0.45).kneeL).toBeGreaterThan(1.4);
    expect(zeusJump(1).kneeL).toBeLessThan(1);
    // 位移中（tracker.motion = 'leap'）用跳跃姿势，而不是被击退的挣扎姿势
    const tr = new AnimTracker();
    tr.update(input({ stunned: true, motion: 'leap' }), 0.05, 0);
    tr.update(input({ stunned: true, motion: 'leap' }), 0.2, 0);
    expect(ZEUS_SPEC.pose(tr, 0, null).kneeL).toBeGreaterThan(1.2);
    // 胡子骨骼挂在头上，跑动时摆得更厉害
    expect(ZEUS_SPEC.bones.find((b) => b[0] === 'beard1')?.[1]).toBe('head');
    expect(ZEUS_SPEC.bones.find((b) => b[0] === 'beard2')?.[1]).toBe('beard1');
    const run = new AnimTracker();
    for (let i = 0; i < 3; i++) run.update(input({ speed: 300 }), 0.2, 0);
    expect(ZEUS_SPEC.pose(run, 1, null).beard1X).toBeDefined();
    expect(finite(zeusRun(1))).toBe(true);
    expect(finite(zeusIdle(0))).toBe(true);
    expect(ZEUS_SPEC.headHeight).toBeCloseTo(178, -1);
    expect(ZEUS_SPEC.scale).toBe(1.25);
  });

  it('registers its projectile, fx events and the hand-arc modifier visual', () => {
    expect(projStyle('hero:zeus')?.mesh).toBe('orb');
    expect(projStyle('hero:zeus')?.emitter).toBeTypeOf('function');
    for (const k of ['zeus_arc', 'zeus_bolt', 'zeus_jump', 'zeus_jump_shock', 'zeus_wrath', 'zeus_wrath_hit', 'zeus_static']) expect(fxFor(k)).toBeTypeOf('function');
    expect(modVisual('zeus_static_field')).toBeDefined();
  });

  it('screen flashes can pulse while fading', () => {
    const fx = new Fx3D();
    expect(fx.flashAlpha()).toBe(0);
    fx.screenFlash('255,255,255', 0.35, 2);
    expect(fx.flashAlpha()).toBeCloseTo(0.35);
    const seen: number[] = [];
    for (let i = 0; i < 35; i++) {
      fx.update(0.01, 720, 1);
      seen.push(fx.flashAlpha());
    }
    // 两次明暗：中途至少一次变暗后又变亮
    let rises = 0;
    for (let i = 1; i < seen.length; i++) if (seen[i] > seen[i - 1] + 1e-4) rises++;
    expect(rises).toBeGreaterThan(0);
    expect(seen[seen.length - 1]).toBeCloseTo(0);
    fx.screenFlash('255,40,30', 0.3);
    fx.update(0.15, 720, 1);
    expect(fx.flashAlpha()).toBeCloseTo(0.175);
  });
});

describe('Drow Ranger model', () => {
  const finite = (p: Record<string, number>) => Object.values(p).every(Number.isFinite);
  it('drow_ranger poses are finite for every state and ability', () => {
    const actives = getHeroDef('drow_ranger').abilities.filter((a) => a.targetType !== 'passive' && a.targetType !== 'toggle').map((a) => a.id);
    expect(Object.keys(DROW_SPEC.releaseDur).sort()).toEqual([...actives].sort());
    const states: Partial<AnimInput>[] = [
      {}, { speed: 300 }, { windup: 0.4 }, { channel: true }, { channel: true, speed: 200 }, { stunned: true }, { stunned: true, motion: 'knockback' },
      { alive: false }, { taunted: true },
    ];
    for (const inp of states) {
      const tr = new AnimTracker();
      tr.update(input(inp), 0.05, 0.5);
      tr.update(input(inp), 0.3, 0.5);
      expect(finite(DROW_SPEC.pose(tr, 1.7, null))).toBe(true);
    }
    for (const id of Object.keys(DROW_SPEC.releaseDur)) {
      for (const cp of [0, 0.5, 1]) {
        const tr = new AnimTracker();
        tr.update(input({ castAbility: id, castProgress: cp }), 0.05, 0);
        expect(tr.state).toBe('cast');
        expect(finite(DROW_SPEC.pose(tr, 0.4, null))).toBe(true);
      }
      for (const k of [0, 0.5, 1]) {
        const tr = new AnimTracker();
        const dur = DROW_SPEC.releaseDur[id];
        tr.trigger(id, dur);
        tr.update(input(), Math.max(1e-3, k * dur * 0.999), 0);
        expect(tr.state).toBe('release');
        expect(finite(DROW_SPEC.pose(tr, 0.4, null))).toBe(true);
      }
    }
    for (const k of [0, 0.1, 0.2, 0.5, 0.99]) expect(finite(drowMultishot(k))).toBe(true);
  });

  /** 摆好姿势后，弓的某个本地轴在模型空间里的方向 */
  const bowAxis = (inp: Partial<AnimInput>, axis: Vector3): Vector3 => {
    const m = new SkinnedHeroModel(DROW_SPEC, 0, new MeshBasicMaterial());
    const tr = new AnimTracker();
    for (let i = 0; i < 4; i++) tr.update(input(inp), 0.2, 0);
    m.pose(tr, 1, 0, null);
    m.root.updateMatrixWorld(true);
    const q = new Quaternion();
    m.bones.bow.getWorldQuaternion(q);
    const rootQ = new Quaternion();
    m.root.getWorldQuaternion(rootQ);
    return axis.clone().applyQuaternion(rootQ.invert().multiply(q));
  };

  it('holds the bow in the left hand, draws to the jaw with the bow upright, and the ponytail swings', () => {
    // 站立：弓大体竖着（上弓梢略向前倒）
    expect(bowAxis({}, new Vector3(0, 1, 0)).y).toBeGreaterThan(0.85);
    // 普攻出手前（满弓）：弓竖直、弓背朝前
    const draw = { windup: 0.04, attackPoint: 0.4 };
    expect(bowAxis(draw, new Vector3(0, 1, 0)).y).toBeGreaterThan(0.95);
    expect(bowAxis(draw, new Vector3(0, 0, 1)).z).toBeGreaterThan(0.9);
    // 拉弓：右手从弦上（小臂伸开）拉到脸旁（肘部折起）
    expect(drowAttack(0).elR).toBeGreaterThan(-1.2);
    expect(drowAttack(0.85).elR).toBeLessThan(-2.2);
    expect(DROW_SPEC.bones.find((b) => b[0] === 'bow')?.[1]).toBe('handL');
    expect(DROW_SPEC.bones.find((b) => b[0] === 'hairTail1')?.[1]).toBe('head');
    expect(DROW_SPEC.bones.find((b) => b[0] === 'hairTail2')?.[1]).toBe('hairTail1');
    expect(DROW_SPEC.bones.map((b) => b[0])).toEqual(expect.arrayContaining(['cape', 'quiver']));
    // 跑动时马尾向后飘得更平
    const tail = (p: Record<string, number>) => p.hairTail1X + p.hairTail2X;
    expect(tail(drowRun(1, 0))).toBeGreaterThan(tail(drowIdle(0)) + 0.3);
    expect(DROW_SPEC.headHeight).toBeCloseTo(172, -1);
    expect(DROW_SPEC.scale).toBe(1.2);
  });

  it('registers its arrows, Gust, fx events and modifier visuals', () => {
    for (const k of ['hero:drow_ranger', 'drow_frost_arrow', 'drow_marksman_arrow', 'drow_multishot']) expect(projStyle(k)?.mesh).toBe('arrow');
    expect(projStyle('drow_frost_arrow')?.emitter).toBeTypeOf('function');
    expect(projStyle('drow_marksman_arrow')!.halo!).toBeGreaterThan(projStyle('drow_frost_arrow')!.halo!);
    expect(projStyle('drow_gust')).toMatchObject({ mesh: 'wave', scaleWithWidth: true });
    for (const k of ['drow_gust', 'drow_multishot']) expect(fxFor(k)).toBeTypeOf('function');
    for (const k of ['drow_marksmanship', 'drow_precision_aura_buff']) expect(modVisual(k)).toBeDefined();
  });
});
