import type { BufferGeometry } from 'three';
import { GeoBuilder } from '../geo';
import { PAL, teamColor, teamDark } from '../materials';
import { type AnimTracker, type Pose, smooth01 } from '../anim';
import type { BoneDef, HeroModelSpec, PartDef } from './heroModel';
import { strugglePose } from './humanoid';
import { registerHeroModel } from './registry';

/**
 * 斧王：由基本体拼成的低多边形野蛮人。骨骼层级：
 * root（朝向）→ 蒙皮网格 → body（整体起伏 / 倒地 / 旋转）→ pelvis →（thighL→shinL、thighR→shinR、torso →（head、shL→elL、shR→elR→axe））。
 * 模型面朝本地 +Z，本地 +X 是角色的左手边。手臂和腿默认竖直向下，绕 X 轴负方向转 = 向前摆。
 */
const SKIN = 0xa83420;
const SKIN_DARK = 0x7c2216;
const PANTS = 0x3a2416;
const FUR = 0x8a7c6c;
const HAIR = 0x1c1411;
const HORN = 0xe8dcbc;
const EYE = 0xffd84a;

/** 模型整体缩放（比小兵明显更高大） */
export const AXE_SCALE = 1.3;

function torsoGeo(team: number): BufferGeometry {
  const b = new GeoBuilder(101 + team);
  b.box(46, 24, 30, SKIN, { p: [0, 12, 0], top: SKIN });
  b.box(60, 30, 36, SKIN, { p: [0, 38, 0] });
  // 胸肌、腹肌
  b.box(24, 14, 6, SKIN_DARK, { p: [12.5, 40, 16], jitter: 0.04 });
  b.box(24, 14, 6, SKIN_DARK, { p: [-12.5, 40, 16], jitter: 0.04 });
  b.box(30, 16, 4, SKIN_DARK, { p: [0, 16, 15], jitter: 0.04 });
  // 斜挎皮带 + 金扣
  b.box(9, 70, 39, PAL.leather, { p: [0, 30, 0], r: [0, 0, 0.75] });
  b.box(10, 10, 4, PAL.gold, { p: [3, 33, 20] });
  // 斜方肌 / 驼背
  b.box(44, 14, 28, SKIN, { p: [0, 54, -4] });
  // 背后的阵营色披风
  b.box(48, 46, 4, teamDark(team), { p: [0, 30, -19], top: teamColor(team), jitter: 0.05 });
  return b.build();
}

function pelvisGeo(team: number): BufferGeometry {
  const b = new GeoBuilder(111 + team);
  b.box(44, 18, 30, PANTS, { p: [0, -2, 0] });
  b.cyl(25, 25, 10, 8, PAL.leather, { p: [0, 8, 0] });
  b.box(14, 12, 4, PAL.gold, { p: [0, 8, 17] });
  // 阵营色的腰布（前后各一片）
  b.box(20, 34, 4, teamColor(team), { p: [0, -14, 17], r: [0.12, 0, 0], top: teamDark(team) });
  b.box(28, 30, 4, teamDark(team), { p: [0, -12, -17], r: [-0.12, 0, 0] });
  return b.build();
}

function headGeo(team: number): BufferGeometry {
  const b = new GeoBuilder(121);
  b.cyl(10, 12, 12, 8, SKIN, { p: [0, 4, 0] });
  b.box(25, 25, 24, SKIN, { p: [0, 20, 2] });
  b.box(27, 6, 7, SKIN_DARK, { p: [0, 27, 12] });
  b.box(4.5, 3, 2, EYE, { p: [6, 22, 14.2], jitter: 0 });
  b.box(4.5, 3, 2, EYE, { p: [-6, 22, 14.2], jitter: 0 });
  // 胡子：上唇 + 下巴的尖胡须
  b.box(20, 5, 6, HAIR, { p: [0, 14, 14] });
  b.box(22, 12, 10, HAIR, { p: [0, 8, 10] });
  b.cone(9, 18, 5, HAIR, { p: [0, -2, 11], r: [Math.PI, 0, 0] });
  // 头盔 + 角
  b.sphere(15.5, 8, 4, PAL.darkSteel, { p: [0, 27, 1], s: [1, 0.85, 1.05], top: PAL.steel }, Math.PI * 2, Math.PI / 2);
  // 阵营色的头盔箍
  b.cyl(16.5, 16.5, 5, 8, teamColor(team), { p: [0, 27, 1], jitter: 0.03 });
  for (const s of [1, -1]) {
    b.cone(6.5, 26, 6, HORN, { p: [s * 19, 32, 2], r: [0, 0, -s * 1.05], top: 0xfff8e6 });
    b.cone(4, 18, 6, 0xfff8e6, { p: [s * 30, 45, 2], r: [0, 0, -s * 0.25] });
  }
  // 脑后的黑色发辫
  b.box(10, 18, 10, HAIR, { p: [0, 20, -12] });
  b.cone(6, 22, 5, HAIR, { p: [0, 4, -16], r: [Math.PI + 0.3, 0, 0] });
  return b.build();
}

function upperArmGeo(left: boolean, team: number): BufferGeometry {
  const b = new GeoBuilder(left ? 131 : 132);
  b.sphere(12.5, 7, 5, SKIN, { p: [0, -3, 0] });
  b.cyl(10, 9, 26, 7, SKIN, { p: [0, -15, 0] });
  if (left) {
    // 左肩的大钢肩甲 + 尖刺
    b.sphere(19, 8, 4, PAL.darkSteel, { p: [2, 1, 0], s: [1.05, 0.9, 1.1], top: PAL.steel }, Math.PI * 2, Math.PI / 2);
    b.torus(18, 3, 4, 10, teamColor(team), { p: [2, 1, 0], r: [Math.PI / 2, 0, 0], jitter: 0.03 });
    b.cone(4.5, 16, 5, PAL.steel, { p: [8, 18, 0], r: [0, 0, -0.5] });
  } else {
    // 右肩的毛皮
    b.ico(15, 0, FUR, { p: [-2, 1, 0], s: [1, 0.75, 1.05], jitter: 0.18 });
  }
  return b.build();
}

function forearmGeo(): BufferGeometry {
  const b = new GeoBuilder(141);
  b.cyl(9.5, 8, 20, 7, SKIN, { p: [0, -9, 0] });
  b.cyl(10.8, 10.8, 12, 7, PAL.leather, { p: [0, -14, 0] });
  b.torus(10.8, 1.6, 3, 8, PAL.gold, { p: [0, -9, 0], r: [Math.PI / 2, 0, 0] });
  b.box(13, 12, 13, SKIN_DARK, { p: [0, -25, 0] });
  return b.build();
}

function thighGeo(): BufferGeometry {
  const b = new GeoBuilder(151);
  b.cyl(11.5, 10, 26, 7, PANTS, { p: [0, -13, 0] });
  b.box(13, 8, 6, PAL.darkSteel, { p: [0, -25, 9] });
  return b.build();
}

function shinGeo(): BufferGeometry {
  const b = new GeoBuilder(161);
  b.ico(11.5, 0, FUR, { p: [0, -3, 0], s: [1, 0.7, 1], jitter: 0.18 });
  b.cyl(9.5, 9, 18, 7, PAL.darkLeather, { p: [0, -12, 0] });
  b.box(15, 8, 25, PAL.darkLeather, { p: [0, -20, 5] });
  return b.build();
}

/** 大斧：握点在原点，斧柄沿本地 +Y，斧刃朝本地 +Z */
function axeGeo(): BufferGeometry {
  const b = new GeoBuilder(171);
  b.cyl(3.2, 3.2, 132, 6, PAL.wood, { p: [0, 30, 0], top: 0x8a6040 });
  b.torus(4, 1.5, 3, 6, PAL.gold, { p: [0, -26, 0], r: [Math.PI / 2, 0, 0] });
  b.torus(4, 1.5, 3, 6, PAL.gold, { p: [0, 62, 0], r: [Math.PI / 2, 0, 0] });
  b.cone(4, 12, 5, PAL.darkSteel, { p: [0, -41, 0], r: [Math.PI, 0, 0] });
  // 斧刃：在 XY 平面画轮廓（X = 离开斧柄的方向），挤出后转到 +Z
  const blade: [number, number][] = [
    [0, 58], [12, 55], [26, 47], [42, 40], [55, 47], [63, 63], [65, 79], [62, 96], [53, 110], [40, 108], [24, 100], [10, 96], [0, 96],
  ];
  b.extrude(blade, 6, 0xb8bec8, { r: [0, -Math.PI / 2, 0], jitter: 0.1 });
  // 刃口的亮边
  const edge: [number, number][] = [[42, 40], [55, 47], [63, 63], [65, 79], [62, 96], [53, 110], [50, 104], [57, 94], [59, 79], [57, 64], [50, 51], [40, 45]];
  b.extrude(edge, 7, 0xeef2f8, { r: [0, -Math.PI / 2, 0], jitter: 0.03 });
  // 斧背的尖刺和金色加固
  b.extrude([[0, 66], [-24, 76], [0, 88]], 5, PAL.darkSteel, { r: [0, -Math.PI / 2, 0] });
  b.box(9, 42, 9, PAL.gold, { p: [0, 77, 0] });
  return b.build();
}

/** 骨骼表：名字、父骨骼、相对父骨骼的位置（模型单位，缩放前） */
const AXE_BONES: BoneDef[] = [
  ['body', null, [0, 0, 0]],
  ['pelvis', 'body', [0, 56, 0]],
  ['torso', 'pelvis', [0, 10, 0]],
  ['head', 'torso', [0, 58, 2]],
  ['shL', 'torso', [35, 46, 0]],
  ['elL', 'shL', [0, -27, 0]],
  ['shR', 'torso', [-35, 46, 0]],
  ['elR', 'shR', [0, -27, 0]],
  ['axe', 'elR', [0, -25, 1]],
  ['thighL', 'pelvis', [12, -6, 0]],
  ['shinL', 'thighL', [0, -26, 0]],
  ['thighR', 'pelvis', [-12, -6, 0]],
  ['shinR', 'thighR', [0, -26, 0]],
];

/** 每根骨骼挂的部件几何体（骨骼局部坐标） */
function axeParts(team: number): PartDef[] {
  return [
    ['pelvis', () => pelvisGeo(team)],
    ['torso', () => torsoGeo(team)],
    ['head', () => headGeo(team)],
    ['shL', () => upperArmGeo(true, team)],
    ['shR', () => upperArmGeo(false, team)],
    ['elL', forearmGeo],
    ['elR', forearmGeo],
    ['axe', axeGeo],
    ['thighL', thighGeo],
    ['thighR', thighGeo],
    ['shinL', shinGeo],
    ['shinR', shinGeo],
  ];
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** 站立：呼吸起伏，大斧竖着握在右手 */
export function idlePose(t: number): Pose {
  const br = Math.sin(t * 2.2);
  return {
    bodyY: -1 + br * 0.8,
    torsoX: 0.08 + br * 0.025,
    headX: -0.06 - br * 0.02,
    shLX: 0.08, shLZ: 0.22 + br * 0.03, elL: -0.4,
    shRX: -0.3, shRZ: -0.22, elR: -1.2, axeZ: 0.15, axeX: -0.1,
    hipLZ: 0.1, hipRZ: -0.1, hipL: -0.08, hipR: 0.08, kneeL: 0.12, kneeR: 0.14,
  };
}

/** 跑步：步态相位 ph（弧度） */
export function runPose(ph: number): Pose {
  const s = Math.sin(ph);
  const c = Math.cos(ph);
  return {
    bodyY: Math.abs(c) * 4 - 3,
    torsoX: 0.26, torsoY: 0.14 * s, pelvisY: -0.12 * s,
    headX: -0.16,
    shLX: 0.65 * s, shLZ: 0.22, elL: -0.75,
    shRX: -0.4 - 0.35 * s, shRZ: -0.26, elR: -1.1, axeX: -0.35, axeZ: 0.2,
    hipL: -0.8 * s, kneeL: 0.3 + 0.75 * Math.max(0, c),
    hipR: 0.8 * s, kneeR: 0.3 + 0.75 * Math.max(0, -c),
    hipLZ: 0.05, hipRZ: -0.05,
  };
}

/** 普攻：p = 前摇进度 0..1（0–0.6 举斧蓄力，0.6–1 劈下，1 = 命中），之后收招时保持命中姿势并淡出 */
export function attackPose(p: number): Pose {
  const raise = smooth01(p / 0.6);
  const f = Math.max(0, (p - 0.6) / 0.4);
  const strike = f * f;
  const shRX = p < 0.6 ? lerp(-0.3, -2.75, raise) : lerp(-2.75, -0.5, strike);
  const torsoY = p < 0.6 ? lerp(0, -0.5, raise) : lerp(-0.5, 0.4, strike);
  const torsoX = p < 0.6 ? lerp(0.08, -0.12, raise) : lerp(-0.12, 0.38, strike);
  return {
    bodyY: -4,
    torsoX, torsoY,
    headX: -0.05,
    shRX, shRZ: lerp(-0.22, -0.55, raise) * (1 - strike) - 0.25 * strike, elR: p < 0.6 ? lerp(-1.2, -0.6, raise) : lerp(-0.6, -0.3, f),
    axeX: lerp(-0.1, -0.3, raise),
    shLX: p < 0.6 ? lerp(0.08, -1.15, raise) : lerp(-1.15, -0.55, f), shLZ: 0.35, elL: -0.6,
    hipL: -0.35, kneeL: 0.35, hipR: 0.3, kneeR: 0.4, hipLZ: 0.16, hipRZ: -0.16,
  };
}

/** 技能前摇：p = 进度 0..1 */
export function castPose(id: string, p: number): Pose {
  const e = smooth01(p);
  switch (id) {
    case 'axe_berserkers_call':
      // 蓄力：弓身收臂
      return {
        bodyY: -7 * e, torsoX: 0.08 + 0.32 * e, headX: 0.1 * e,
        shLX: -0.5 * e, shLZ: 0.25, elL: -0.9 * e, shRX: -0.3 - 0.3 * e, shRZ: -0.2, elR: -1.2,
        hipLZ: 0.18, hipRZ: -0.18, kneeL: 0.5 * e, kneeR: 0.5 * e, hipL: -0.3 * e, hipR: -0.3 * e,
      };
    case 'axe_battle_hunger':
      // 左手指向目标
      return {
        torsoY: 0.3 * e, torsoX: 0.1, headX: -0.05,
        shLX: lerp(0.08, -1.5, e), shLZ: 0.12, elL: lerp(-0.4, -0.15, e),
        shRX: -0.3, shRZ: -0.22, elR: -1.2, hipLZ: 0.12, hipRZ: -0.12, kneeL: 0.15, kneeR: 0.15,
      };
    case 'axe_culling_blade':
      // 双手把斧举过头顶
      return {
        bodyY: 4 * e, torsoX: lerp(0.08, -0.3, e), headX: -0.25 * e,
        shRX: lerp(-0.3, -2.95, e), shRZ: -0.15, elR: lerp(-1.2, -0.35, e), axeX: -0.2 * e,
        shLX: lerp(0.08, -2.7, e), shLZ: 0.15, elL: lerp(-0.4, -0.5, e),
        hipL: -0.25, hipR: 0.2, kneeL: 0.25, kneeR: 0.3, hipLZ: 0.14, hipRZ: -0.14,
      };
    default:
      return { torsoX: 0.2 * e, shLX: -0.8 * e, shRX: -0.8 * e, elR: -1.2 };
  }
}

/** 技能释放后的动作：k = 进度 0..1 */
export function releasePose(kind: string, k: number): Pose {
  switch (kind) {
    case 'axe_berserkers_call': {
      // 怒吼：张开双臂、挺胸仰头，保持一会儿再收
      const w = smooth01(k * 5) * (1 - smooth01((k - 0.7) / 0.3));
      return {
        bodyY: 3 * w, torsoX: lerp(0.08, -0.38, w), headX: lerp(-0.05, -0.5, w),
        shLX: -0.35 * w, shLZ: lerp(0.22, 1.85, w), elL: -0.35,
        shRX: lerp(-0.3, -0.4, w), shRZ: lerp(-0.22, -1.85, w), elR: lerp(-1.2, -0.6, w),
        hipLZ: 0.1 + 0.14 * w, hipRZ: -0.1 - 0.14 * w, kneeL: 0.15, kneeR: 0.15,
      };
    }
    case 'axe_battle_hunger': {
      const w = 1 - smooth01((k - 0.4) / 0.6);
      return {
        torsoY: 0.35 * w, torsoX: 0.12,
        shLX: -1.6 * w, shLZ: 0.12, elL: -0.05 - 0.35 * (1 - w),
        shRX: -0.3, shRZ: -0.22, elR: -1.2, hipLZ: 0.12, hipRZ: -0.12, kneeL: 0.15, kneeR: 0.15,
      };
    }
    case 'axe_culling_blade': {
      // 劈下：0–0.2 极快劈到底，之后蹲着保持再起身
      const f = smooth01(k / 0.2);
      const up = smooth01((k - 0.6) / 0.4);
      return {
        bodyY: lerp(4, -12, f) * (1 - up), torsoX: lerp(-0.3, 0.6, f) * (1 - up) + 0.08 * up, headX: 0.1 * f,
        shRX: lerp(-2.95, -0.25, f) * (1 - up) - 0.3 * up, shRZ: -0.2, elR: lerp(-0.35, -0.2, f) * (1 - up) - 1.2 * up,
        shLX: lerp(-2.7, -0.4, f) * (1 - up), shLZ: 0.2, elL: -0.5,
        hipL: -0.55 * (1 - up), hipR: 0.35 * (1 - up), kneeL: 0.8 * (1 - up), kneeR: 0.7 * (1 - up), hipLZ: 0.15, hipRZ: -0.15,
      };
    }
    case 'helix':
      // 反击螺旋：双臂平伸、大斧横扫（旋转本身由 AXE_SPEC.spin 给出）
      return {
        bodyY: -5, torsoX: 0.18, headX: 0.05,
        shLX: -0.15, shLZ: 1.45, elL: -0.15,
        shRX: -0.1, shRZ: -1.5, elR: -0.12, axeX: 0.2,
        hipLZ: 0.22, hipRZ: -0.22, kneeL: 0.4, kneeR: 0.4,
      };
    default:
      return idlePose(0);
  }
}

export function stunnedPose(t: number): Pose {
  return {
    bodyY: -6, torsoX: 0.32 + 0.05 * Math.sin(t * 5), torsoZ: 0.14 * Math.sin(t * 3),
    headX: 0.5, headZ: 0.15 * Math.sin(t * 3 + 1),
    shLX: 0.15, shLZ: 0.15, elL: -0.2, shRX: 0.05, shRZ: -0.15, elR: -0.6,
    kneeL: 0.4, kneeR: 0.4, hipL: -0.2, hipR: -0.2,
  };
}

/** 回城 / 引导：单膝微蹲，斧头拄地 */
export function channelPose(t: number): Pose {
  const br = Math.sin(t * 3);
  return {
    bodyY: -8, torsoX: 0.22 + br * 0.02, headX: 0.25,
    shLX: -0.2, shLZ: 0.2, elL: -0.9,
    shRX: -0.5, shRZ: -0.3, elR: -0.8, axeX: 0.4,
    hipL: -0.6, kneeL: 0.9, hipR: 0.3, kneeR: 0.9,
  };
}

/** 死亡：向后倒地，之后沉入地面 */
export function deathPose(t: number): Pose {
  const f = smooth01(t / 0.6);
  return {
    bodyX: -1.42 * f * f, bodyY: 14 * f, bodyZ: -6 * f,
    torsoX: -0.2 * f, headX: -0.4 * f,
    shLX: -0.4 * f, shLZ: 0.22 + 1.1 * f, elL: -0.3,
    shRX: -0.3 - 0.5 * f, shRZ: -0.22 - 1.1 * f, elR: -1.2 + 0.8 * f,
    hipL: -0.4 * f, kneeL: 0.5 * f, hipR: -0.1 * f, kneeR: 0.2 * f, hipLZ: 0.2 * f, hipRZ: -0.2 * f,
    sink: Math.max(0, t - 1.8) * 45,
  };
}

/** 按动画状态选姿势 */
export function axePose(tr: AnimTracker, t: number): Pose {
  let p: Pose;
  switch (tr.state) {
    case 'dead':
      return deathPose(Math.max(0, tr.deadTime));
    case 'stunned':
      p = stunnedPose(t);
      break;
    case 'release':
      p = releasePose(tr.release!.kind, tr.releaseK);
      break;
    case 'cast':
      p = castPose(tr.castAbility ?? '', tr.castProgress);
      break;
    case 'channel':
      p = channelPose(t);
      break;
    case 'attack':
      p = tr.swing >= 0 ? attackPose(tr.swing) : blendTo(idlePose(t), attackPose(1), tr.backswingK);
      break;
    case 'run':
      p = runPose(tr.runPhase);
      break;
    default:
      p = idlePose(t);
  }
  if (tr.taunted) {
    // 被嘲讽：怒气冲冲地摇晃
    p.torsoZ = (p.torsoZ ?? 0) + 0.09 * Math.sin(t * 11);
    p.headZ = (p.headZ ?? 0) + 0.12 * Math.sin(t * 11 + 1);
  }
  return p;
}

function blendTo(a: Pose, b: Pose, k: number): Pose {
  const out: Pose = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) out[key] = (a[key] ?? 0) * (1 - k) + (b[key] ?? 0) * k;
  return out;
}

/** 技能释放后收招动作的时长 */
export const AXE_RELEASE_DUR: Record<string, number> = { axe_berserkers_call: 0.65, axe_battle_hunger: 0.45, axe_culling_blade: 0.6 };
/** 反击螺旋（fx 事件触发）的旋转时长 */
export const HELIX_DUR = 0.38;

/**
 * 斧王的模型描述（P1 的 AxeModel 原样迁移）：13 根骨骼（没有手骨骼，斧子直接挂在右前臂上），
 * 部件按绑定姿势合并成一个刚性蒙皮网格；斧子绑定时按握持方向旋转 (π/2, 0, 0)，`axeX/Y/Z` 通道叠加在它上面。
 */
export const AXE_SPEC: HeroModelSpec = {
  id: 'axe',
  scale: AXE_SCALE,
  headHeight: 175,
  muzzleHeight: 110,
  bones: AXE_BONES,
  parts: axeParts,
  bindRotations: { axe: [Math.PI / 2, 0, 0] },
  pose: (tr, t) => {
    const p = axePose(tr, t);
    // 被钩 / 被击退：浮空挣扎
    return tr.state === 'stunned' && tr.motion ? strugglePose(p, t) : p;
  },
  releaseDur: AXE_RELEASE_DUR,
  fxTriggers: { axe_helix: { kind: 'helix', dur: HELIX_DUR } },
  // 选人预览：吼 → 饥渴 → 反击螺旋（fx 触发的旋转）→ 淘汰之刃
  previewMoves: ['axe_berserkers_call', 'axe_battle_hunger', 'axe_helix', 'axe_culling_blade'],
  // 反击螺旋：整个身体转一圈
  spin: (tr) => (tr.release?.kind === 'helix' ? Math.PI * 2 * smooth01(tr.releaseK) : 0),
};

registerHeroModel(AXE_SPEC);
