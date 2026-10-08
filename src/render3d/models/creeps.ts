import { Group, type BufferGeometry, type Object3D } from 'three';
import type { CreepType } from '../../sim/entities/unit';
import { GeoBuilder } from '../geo';
import { PAL, teamColor, teamDark, teamLight } from '../materials';
import { type AnimTracker, smooth01 } from '../anim';
import { bone, cachedGeo } from './rig';

/**
 * 小兵模型。为了让一波兵只花很少的绘制调用，小兵不在场景里挂网格：
 * 每个小兵只有一棵骨骼树（Object3D，不加入场景），每帧摆好姿势后把各部件骨骼的世界矩阵
 * 写进按"类型 + 阵营 + 部件"共享的 InstancedMesh（见 CreepInstances）。
 */
export interface CreepPart {
  bone: Object3D;
  /** 几何体缓存 key（同时也是实例化网格的 key） */
  key: string;
  geo: () => BufferGeometry;
  /** 发光部件（法球）用不受光照的材质 */
  glow?: boolean;
}

export type CreepKind = Exclude<CreepType, never> | 'elite';

const SKIN_R = 0xd9a77a;
const SKIN_D = 0x8a6a5a;

const isSuperType = (t: string) => t === 'superMelee' || t === 'superRanged';

export function creepScale(type: string): number {
  return isSuperType(type) ? 1.2 : type === 'siege' ? 1.05 : 1;
}

/** 血条锚点（头顶）高度 */
export function creepHeadHeight(type: string): number {
  return (type === 'siege' ? 95 : type === 'ranged' || type === 'superRanged' ? 112 : 110) * creepScale(type);
}

// ---------- 近战兵：剑盾步兵 ----------
function meleeTorso(team: number, sup: boolean): BufferGeometry {
  const b = new GeoBuilder(201 + team);
  const radiant = team === 0;
  const armor = radiant ? 0xb8bcc4 : 0x4a4448;
  b.box(22, 12, 16, teamDark(team), { p: [0, 0, 0] });
  b.box(27, 26, 19, armor, { p: [0, 18, 0], top: radiant ? 0xd8dce4 : 0x5e565a });
  b.box(16, 26, 2, teamColor(team), { p: [0, 10, 10], top: teamDark(team), jitter: 0.04 });
  b.box(30, 7, 20, radiant ? 0x8a8e98 : 0x2e2a2c, { p: [0, 30, 0] });
  b.box(15, 15, 15, radiant ? SKIN_R : SKIN_D, { p: [0, 41, 1] });
  if (radiant) {
    b.sphere(10, 7, 4, 0xc8ccd4, { p: [0, 44, 0], s: [1, 0.9, 1.1] }, Math.PI * 2, Math.PI / 2);
    b.box(3, 9, 18, teamColor(team), { p: [0, 52, -1] });
    b.box(16, 3, 3, 0x30343a, { p: [0, 42, 8] });
  } else {
    b.cone(10, 16, 6, 0x2a2628, { p: [0, 52, 0] });
    for (const s of [1, -1]) b.cone(3, 12, 5, 0xd8ccb0, { p: [s * 10, 50, 0], r: [0, 0, -s * 0.9] });
    b.box(4, 2, 2, 0xff5a2a, { p: [3.5, 42, 8], jitter: 0 });
    b.box(4, 2, 2, 0xff5a2a, { p: [-3.5, 42, 8], jitter: 0 });
  }
  if (sup) {
    b.box(31, 3, 21, PAL.gold, { p: [0, 34, 0] });
    b.box(24, 3, 18, PAL.gold, { p: [0, 6, 0] });
  }
  return b.build();
}

function meleeLeg(team: number): BufferGeometry {
  const b = new GeoBuilder(211);
  b.cyl(5.5, 5, 22, 6, team === 0 ? 0x5a4632 : 0x2e2622, { p: [0, -11, 0] });
  b.box(10, 9, 15, 0x3a2a1c, { p: [0, -26, 3] });
  return b.build();
}

function swordArm(team: number, sup: boolean): BufferGeometry {
  const b = new GeoBuilder(221 + team);
  b.sphere(7, 6, 4, team === 0 ? 0xb8bcc4 : 0x4a4448, { p: [0, -1, 0] });
  b.cyl(4.5, 4, 22, 6, team === 0 ? SKIN_R : SKIN_D, { p: [0, -12, 0] });
  b.box(8, 8, 8, 0x5a3a22, { p: [0, -24, 0] });
  // 剑：握点在拳头，剑身朝前
  b.box(3, 3, 9, 0x5a3a22, { p: [0, -24, 2] });
  b.box(12, 3, 3, sup ? PAL.gold : 0x8a7a5a, { p: [0, -24, 7] });
  b.box(4, 2, 34, team === 0 ? 0xe0e4ec : 0x9a9aa0, { p: [0, -24, 25] });
  b.cone(2.5, 6, 4, team === 0 ? 0xe0e4ec : 0x9a9aa0, { p: [0, -24, 45], r: [Math.PI / 2, 0, 0] });
  return b.build();
}

function shieldArm(team: number, sup: boolean): BufferGeometry {
  const b = new GeoBuilder(231 + team);
  b.sphere(7, 6, 4, team === 0 ? 0xb8bcc4 : 0x4a4448, { p: [0, -1, 0] });
  b.cyl(4.5, 4, 22, 6, team === 0 ? SKIN_R : SKIN_D, { p: [0, -12, 0] });
  // 盾挂在前臂外侧，盾面朝前
  if (team === 0) {
    b.cyl(14, 14, 3, 10, teamColor(team), { p: [4, -16, 8], r: [Math.PI / 2, 0, 0], jitter: 0.05 });
    b.torus(14, 1.8, 3, 10, sup ? PAL.gold : 0xb8bcc4, { p: [4, -16, 9.5] });
    b.sphere(4, 6, 3, 0xd8dce4, { p: [4, -16, 10] });
  } else {
    b.cyl(14, 16, 3, 6, 0x3a3034, { p: [4, -16, 8], r: [Math.PI / 2, 0, 0] });
    b.cyl(9, 9, 3.5, 6, teamColor(team), { p: [4, -16, 9] , r: [Math.PI / 2, 0, 0]});
    b.cone(3, 10, 4, sup ? PAL.gold : 0xc8c0b0, { p: [4, -16, 14], r: [Math.PI / 2, 0, 0] });
  }
  return b.build();
}

// ---------- 远程兵：法师 ----------
function casterRobe(team: number, sup: boolean): BufferGeometry {
  const b = new GeoBuilder(241 + team);
  const radiant = team === 0;
  b.cyl(9, 21, 40, 8, teamDark(team), { p: [0, -16, 0], top: teamColor(team), jitter: 0.06 });
  b.box(22, 20, 16, radiant ? 0x3a6a8a : 0x3a2a3a, { p: [0, 12, 0] });
  b.box(9, 30, 2, radiant ? 0xe8e0c8 : 0x8a2a20, { p: [0, -2, 9] });
  // 兜帽 + 脸
  b.cone(12, 24, 7, teamColor(team), { p: [0, 34, -1], top: teamLight(team) });
  b.box(11, 10, 6, radiant ? SKIN_R : 0x5a4a4a, { p: [0, 28, 6] });
  b.box(3, 2, 1.5, radiant ? 0x60e0ff : 0xff6a2a, { p: [2.5, 29, 9.2], jitter: 0 });
  b.box(3, 2, 1.5, radiant ? 0x60e0ff : 0xff6a2a, { p: [-2.5, 29, 9.2], jitter: 0 });
  if (sup) {
    b.torus(20, 2, 3, 10, PAL.gold, { p: [0, -34, 0], r: [Math.PI / 2, 0, 0] });
    b.box(24, 3, 18, PAL.gold, { p: [0, 21, 0] });
  }
  return b.build();
}

function casterArm(team: number, staff: boolean, sup: boolean): BufferGeometry {
  const b = new GeoBuilder(251 + team + (staff ? 10 : 0));
  b.cyl(5, 4, 20, 6, teamColor(team), { p: [0, -10, 0] });
  b.box(6, 6, 6, team === 0 ? SKIN_R : 0x5a4a4a, { p: [0, -21, 0] });
  if (staff) {
    // 法杖：握在手里竖直向上，顶端是法球托
    b.cyl(2, 2, 76, 5, PAL.wood, { p: [0, -6, 4] });
    b.cone(5, 10, 4, sup ? PAL.gold : 0x8a7a5a, { p: [0, 34, 4] , r: [Math.PI, 0, 0]});
  }
  return b.build();
}

function orbGeo(team: number): BufferGeometry {
  const b = new GeoBuilder(261);
  b.ico(6.5, 1, teamLight(team), { jitter: 0 });
  return b.build();
}

// ---------- 攻城车：投石车 ----------
function cartGeo(team: number): BufferGeometry {
  const b = new GeoBuilder(271 + team);
  const wood = team === 0 ? 0x8a6038 : 0x4a3428;
  b.box(46, 10, 72, wood, { p: [0, 20, 0] });
  b.box(50, 6, 76, 0x5a3a22, { p: [0, 14, 0] });
  for (const s of [1, -1]) {
    b.box(5, 34, 6, wood, { p: [s * 15, 40, -12], r: [0.25, 0, 0] });
    b.box(4, 4, 62, 0x6a4a2a, { p: [s * 23, 27, 0] });
  }
  b.box(36, 5, 5, 0x6a4a2a, { p: [0, 54, -8] });
  // 阵营旗
  b.cyl(1.5, 1.5, 56, 4, 0x3a2a1a, { p: [-18, 48, 28] });
  b.box(2, 18, 24, teamColor(team), { p: [-18, 66, 18], top: teamLight(team), jitter: 0.04 });
  // 车头的金属护板
  b.box(40, 16, 4, team === 0 ? 0x9aa0aa : 0x3a3034, { p: [0, 24, 37] });
  if (team === 1) for (const s of [1, -1]) b.cone(3, 12, 4, 0xc8c0b0, { p: [s * 12, 24, 42], r: [Math.PI / 2, 0, 0] });
  return b.build();
}

function wheelGeo(): BufferGeometry {
  const b = new GeoBuilder(281);
  b.cyl(14, 14, 6, 10, 0x4a3220, { r: [0, 0, Math.PI / 2] });
  b.cyl(5, 5, 8, 6, 0x8a8e96, { r: [0, 0, Math.PI / 2] });
  b.box(7, 26, 3, 0x6a4a2a, { p: [0, 0, 0] });
  b.box(7, 3, 26, 0x6a4a2a, { p: [0, 0, 0] });
  return b.build();
}

/** 投石臂：转轴在原点，臂沿本地 +Y 伸出，末端是装着石头的勺 */
function armGeo(): BufferGeometry {
  const b = new GeoBuilder(291);
  b.box(6, 56, 6, 0x6a4a2a, { p: [0, 26, 0] });
  b.box(16, 5, 16, 0x5a3a22, { p: [0, 54, 0] });
  b.dodeca(8, 0x7a7068, { p: [0, 62, 0] });
  return b.build();
}

export interface CreepRig {
  root: Group;
  body: Group;
  parts: CreepPart[];
  bones: Record<string, Group>;
  type: string;
}

export function buildCreepRig(type: string, team: number): CreepRig {
  const root = new Group();
  root.scale.setScalar(creepScale(type));
  const body = bone(root, 'body');
  const bones: Record<string, Group> = { body };
  const parts: CreepPart[] = [];
  const sup = isSuperType(type);
  const tag = `${type}:${team}`;
  if (type === 'siege') {
    const cart = bone(body, 'cart');
    parts.push({ bone: cart, key: `siege:cart:${team}`, geo: () => cartGeo(team) });
    for (const [i, [x, z]] of ([[25, 22], [-25, 22], [25, -22], [-25, -22]] as const).entries()) {
      const w = bone(body, `wheel${i}`, [x, 14, z]);
      bones[`wheel${i}`] = w;
      parts.push({ bone: w, key: 'siege:wheel', geo: wheelGeo });
    }
    const arm = bone(body, 'arm', [0, 30, -18]);
    bones.arm = arm;
    parts.push({ bone: arm, key: 'siege:arm', geo: armGeo });
  } else if (type === 'ranged' || type === 'superRanged') {
    const hips = bone(body, 'hips', [0, 40, 0]);
    const shR = bone(hips, 'shR', [-13, 18, 0]);
    const shL = bone(hips, 'shL', [13, 18, 0]);
    const orb = bone(shR, 'orb', [0, 45, 4]);
    Object.assign(bones, { hips, shR, shL, orb });
    parts.push({ bone: hips, key: `${tag}:robe`, geo: () => casterRobe(team, sup) });
    parts.push({ bone: shR, key: `${tag}:staff`, geo: () => casterArm(team, true, sup) });
    parts.push({ bone: shL, key: `ranged:arm:${team}`, geo: () => casterArm(team, false, false) });
    parts.push({ bone: orb, key: `ranged:orb:${team}`, geo: () => orbGeo(team), glow: true });
  } else {
    const hips = bone(body, 'hips', [0, 36, 0]);
    const legL = bone(hips, 'legL', [7, -3, 0]);
    const legR = bone(hips, 'legR', [-7, -3, 0]);
    const shL = bone(hips, 'shL', [17, 28, 0]);
    const shR = bone(hips, 'shR', [-17, 28, 0]);
    Object.assign(bones, { hips, legL, legR, shL, shR });
    parts.push({ bone: hips, key: `${tag}:torso`, geo: () => meleeTorso(team, sup) });
    parts.push({ bone: legL, key: `melee:leg:${team}`, geo: () => meleeLeg(team) });
    parts.push({ bone: legR, key: `melee:leg:${team}`, geo: () => meleeLeg(team) });
    parts.push({ bone: shL, key: `${tag}:shield`, geo: () => shieldArm(team, sup) });
    parts.push({ bone: shR, key: `${tag}:sword`, geo: () => swordArm(team, sup) });
  }
  for (const p of parts) cachedGeo(p.key, p.geo);
  return { root, body, parts, bones, type };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** 小兵的姿势（直接写骨骼旋转；比英雄简单，没有状态混合） */
export function poseCreep(rig: CreepRig, tr: AnimTracker, t: number, wheelDist: number): void {
  const b = rig.bones;
  const run = tr.state === 'run' ? Math.min(1, tr.speed / 250) : 0;
  const s = Math.sin(tr.runPhase);
  const c = Math.cos(tr.runPhase);
  // 出手：前摇 0→1 抬起、收招时从命中姿势回落
  const swing = tr.swing >= 0 ? tr.swing : tr.backswing > 0 ? 1 + (1 - tr.backswingK) : -1;
  const raise = swing < 0 ? 0 : swing <= 1 ? (swing < 0.7 ? smooth01(swing / 0.7) : 1 - smooth01((swing - 0.7) / 0.3) * 1.25) : -0.25 * (2 - swing);
  const dead = tr.deadTime >= 0;
  const breathe = Math.sin(t * 2.4);

  b.body.position.set(0, 0, 0);
  b.body.rotation.set(0, 0, 0);
  if (rig.type === 'siege') {
    for (let i = 0; i < 4; i++) b[`wheel${i}`].rotation.x = wheelDist / 14;
    b.body.position.y = run * Math.abs(s) * 1.5;
    // 投石臂：静止时后仰，前摇时继续往后拉，出手时甩到前方
    const arm = swing < 0 ? -0.55 : swing <= 1 ? (swing < 0.85 ? lerp(-0.55, -1.15, smooth01(swing / 0.85)) : lerp(-1.15, 0.7, (swing - 0.85) / 0.15)) : lerp(0.7, -0.55, smooth01(swing - 1));
    b.arm.rotation.x = arm;
  } else if (b.legL) {
    // 近战兵
    b.body.position.y = run * (Math.abs(c) * 3 - 1.5) + breathe * 0.5 * (1 - run);
    b.hips.rotation.set(0.12 * run + 0.15 * Math.max(0, raise), 0.1 * s * run, 0);
    b.legL.rotation.x = -0.75 * s * run;
    b.legR.rotation.x = 0.75 * s * run;
    b.shL.rotation.set(-0.5 + 0.3 * s * run, 0, 0.15);
    b.shR.rotation.set(lerp(0.2 - 0.4 * s * run, -2.5, Math.max(0, raise)) + 0.6 * Math.min(0, raise), 0, -0.2);
  } else {
    // 法师：飘行，法杖在出手时向前指
    b.body.position.y = 3 + Math.sin(t * 3 + rig.root.id) * 2 + run * Math.abs(c) * 2;
    b.hips.rotation.set(0.12 * run + 0.1 * Math.max(0, raise), 0.08 * s * run, 0);
    b.shL.rotation.set(-0.3 + 0.35 * s * run, 0, 0.25);
    b.shR.rotation.set(lerp(-0.25, -1.6, Math.max(0, raise)) + 0.5 * Math.min(0, raise), 0, -0.15);
    b.orb.scale.setScalar(1 + 0.15 * Math.sin(t * 6 + rig.root.id) + 0.5 * Math.max(0, raise));
  }
  if (tr.taunted && !dead) b.body.rotation.z = 0.08 * Math.sin(t * 11);
  if (dead) {
    // 侧身倒下，随后沉入地面
    const f = smooth01(tr.deadTime / 0.35);
    b.body.rotation.z = (rig.root.id % 2 ? 1 : -1) * 1.45 * f;
    b.body.position.y = 8 * f - Math.max(0, tr.deadTime - 0.7) * 60;
  }
}
