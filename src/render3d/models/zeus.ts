import { CylinderGeometry, type BufferGeometry } from 'three';
import { GeoBuilder } from '../geo';
import { teamColor, teamDark } from '../materials';
import { type AnimTracker, type Pose, smooth01 } from '../anim';
import type { Unit } from '../../sim/entities/unit';
import type { HeroModelSpec, PartDef } from './heroModel';
import { addTauntShake, dispatchPose, humanoidBones, idlePose as hIdle, runPose as hRun, type OwnPoses, type Proportions, type Stance } from './humanoid';
import { registerHeroModel } from './registry';

/**
 * 宙斯：健壮的老年天神。锃亮的光头、脑后一圈白发、浓密上挑的白眉，又长又蓬的白胡子（挂在下巴的 beard1–beard2 链式骨骼，随动作摆动）；
 * 象牙白长袍斜搭左肩（金边），露出右臂和右胸的肌肉；蓝色腰带和护腕，阵营色的斜挎肩带；凉鞋。
 * 没有武器，双手掌心发着淡蓝色的电光（电弧粒子在 fx/zeus.ts）。
 * 模型面朝本地 +Z，本地 +X 是角色的左手边。
 */
const ROBE = 0xf2ead0;
const ROBE_SHADE = 0xd8cfae;
const GOLD = 0xe2b04a;
const BLUE = 0x3f8fe0;
const BLUE_LIGHT = 0x58a4f0;
// 古铜色的皮肤：和象牙白长袍、白胡子、浅色沙地都拉开明暗（2D 头像仍用浅肤色 #e8cfae）
const SKIN = 0xc9875a;
const SKIN_DARK = 0xa4653e;
const SKIN_LIGHT = 0xdc9d6e;
const BEARD = 0xf6f6f2;
const BEARD_SHADE = 0xd6dbe2;
const SANDAL = 0x7a4e2a;
const ELECTRIC = 0x8fd4ff;
const ELECTRIC_CORE = 0xe8f8ff;

export const ZEUS_SCALE = 1.25;

const PROPS: Partial<Proportions> = {
  hipY: 58, waist: 10, torsoLen: 46, neck: 8, headZ: 2, shoulderX: 29, shoulderY: 41, upperArm: 26, forearm: 23,
  thighX: 10.5, thighY: -6, thigh: 27, shin: 27,
};

export const ZEUS_STANCE: Stance = { weaponHand: 'none', hunch: 0.15, armSpread: 0.2, heavy: 0.35 };

/** 正面开衩的圆台（袍子下摆）：gap = 正前方开口的半角 */
function openCone(rt: number, rb: number, h: number, seg: number, gap: number): CylinderGeometry {
  return new CylinderGeometry(rt, rb, h, seg, 1, true, gap, Math.PI * 2 - gap * 2);
}

function torsoGeo(team: number): BufferGeometry {
  const b = new GeoBuilder(501 + team);
  // 赤裸的健壮躯干：腰腹 → 宽阔的胸膛
  b.cyl(19, 17.5, 16, 10, SKIN_DARK, { p: [0, 7, 0], s: [1, 1, 0.78], top: SKIN });
  b.cyl(25, 19, 26, 10, SKIN, { p: [0, 28, 0], s: [1, 1, 0.74], top: SKIN_LIGHT });
  // 右胸的胸肌和腹肌（左胸被长袍盖住）
  b.sphere(10, 8, 6, SKIN_LIGHT, { p: [-9.5, 33, 11.5], s: [1.1, 0.75, 0.55] });
  b.sphere(9, 8, 6, SKIN, { p: [8.5, 33, 11], s: [1.1, 0.75, 0.5] });
  for (const [x, y] of [[-4, 21], [4, 21], [-4, 14], [4, 14]] as const) b.box(6.5, 5.5, 3, SKIN_DARK, { p: [x, y, 13.2], jitter: 0.04 });
  // 斜方肌（俯视时肩颈之间的肉）
  b.box(30, 9, 20, SKIN, { p: [0, 43, -2], top: SKIN_LIGHT });
  // 长袍：从左肩斜搭到右腰，盖住左半边胸背（半圈开口的圆筒，向右下倾斜）
  b.add(new CylinderGeometry(26.5, 21, 44, 12, 1, true, -0.25, Math.PI + 0.5), ROBE_SHADE, {
    p: [1.5, 24, 0], r: [0, 0, -0.42], s: [1, 1, 0.8], top: ROBE,
  });
  // 左肩上披着的一大块袍子（俯视时最显眼的象牙白）+ 金边
  b.sphere(14, 10, 6, ROBE, { p: [17, 41, -1], s: [1.15, 0.75, 1.15] }, Math.PI * 2, Math.PI / 2 + 0.35);
  b.torus(14.5, 1.4, 4, 12, GOLD, { p: [17, 38.5, -1], r: [Math.PI / 2, 0, 0], s: [1.15, 1.15, 1] });
  // 袍子斜边：金边 + 阵营色的斜挎肩带（前后各一条）
  for (const z of [1, -1]) {
    b.box(5.5, 54, 2.2, teamColor(team), { p: [-1, 25, z * 18.6], r: [0, 0, -0.62], top: teamDark(team) });
    b.box(1.6, 54, 2.4, GOLD, { p: [-4.4, 26.5, z * 18.8], r: [0, 0, -0.62] });
    b.box(1.6, 54, 2.4, GOLD, { p: [2.4, 23.5, z * 18.8], r: [0, 0, -0.62] });
  }
  // 肩带在左肩上的金色圆扣（带一颗发蓝光的宝石）
  b.cyl(5, 5, 2.4, 10, GOLD, { p: [15, 44, 10], r: [Math.PI / 2 - 0.4, 0, 0], top: 0xf4cc6a });
  b.octa(2.2, ELECTRIC, { p: [15, 44.6, 11.6], glow: 1.8, jitter: 0 });
  return b.build();
}

function pelvisGeo(team: number): BufferGeometry {
  const b = new GeoBuilder(511 + team);
  // 蓝色宽腰带 + 金扣 + 发光的蓝宝石
  b.cyl(20.5, 21, 9, 12, BLUE, { p: [0, 3, 0], s: [1, 1, 0.8], top: BLUE_LIGHT });
  b.torus(20.6, 1.2, 3, 14, GOLD, { p: [0, 7.5, 0], r: [Math.PI / 2, 0, 0], s: [1, 0.8, 1] });
  b.torus(21, 1.2, 3, 14, GOLD, { p: [0, -1.5, 0], r: [Math.PI / 2, 0, 0], s: [1, 0.8, 1] });
  b.box(10, 10, 2.5, GOLD, { p: [0, 3, 17.2] });
  b.octa(3, ELECTRIC, { p: [0, 3, 18.8], glow: 2, jitter: 0 });
  // 腰带上垂下的一条阵营色短饰带
  b.box(4, 15, 1.5, teamColor(team), { p: [-7, -7, 16.4], r: [0.12, 0, 0.08], top: teamDark(team) });
  // 象牙白长袍下摆（正面开衩方便迈步）+ 金色下沿
  b.add(openCone(19.5, 26, 38, 12, 0.32), ROBE, { p: [0, -16, 0], s: [1, 1, 0.82], top: ROBE });
  b.add(new CylinderGeometry(26.2, 26.6, 3, 12, 1, true, 0.32, Math.PI * 2 - 0.64), GOLD, { p: [0, -34.5, 0], s: [1, 1, 0.82] });
  // 下摆的几道褶
  for (const a of [0.9, 1.9, 2.8, -0.9, -1.9, -2.8]) {
    b.box(1.4, 30, 1.2, ROBE_SHADE, { p: [Math.sin(a) * 23.6, -18, Math.cos(a) * 19.3], r: [0, a, 0], jitter: 0.02 });
  }
  return b.build();
}

function headGeo(): BufferGeometry {
  const b = new GeoBuilder(521);
  // 粗脖子
  b.cyl(7, 8, 9, 8, SKIN_DARK, { p: [0, 2, 0], top: SKIN });
  // 光头：方下巴的脸 + 锃亮的头顶
  b.sphere(12.8, 12, 9, SKIN, { p: [0, 13.5, 0.5], s: [0.95, 1.08, 1] });
  b.sphere(12.3, 12, 6, SKIN_LIGHT, { p: [0, 15, 0], s: [0.97, 1.04, 1.02] }, Math.PI * 2, Math.PI / 2);
  // 光头顶上的一点高光
  b.sphere(3.6, 6, 4, 0xf0c49a, { p: [-3.5, 27.2, 2], s: [1.4, 0.4, 1], glow: 1.2, jitter: 0 });
  // 耳朵、鼻子
  for (const s of [1, -1]) b.box(2.4, 6, 4.5, SKIN_DARK, { p: [s * 11.8, 13, -0.5] });
  b.box(3.6, 6, 4, SKIN_DARK, { p: [0, 12.5, 12], r: [-0.25, 0, 0] });
  // 发蓝光的眼睛
  for (const s of [1, -1]) b.box(3.4, 1.8, 1.2, ELECTRIC_CORE, { p: [s * 4.4, 15.4, 11.2], glow: 2, jitter: 0 });
  // 浓密上挑的白眉
  for (const s of [1, -1]) {
    b.box(9.5, 4.2, 5, BEARD, { p: [s * 5, 18.6, 11.2], r: [-0.2, 0, s * 0.28], top: 0xffffff });
    b.cone(2.8, 9, 4, BEARD, { p: [s * 11.5, 21, 9.5], r: [0, 0, -s * 1.1] });
  }
  // 脑后和两鬓的一圈白发（光头的轮廓，从背后看也认得出）
  b.torus(10.8, 3.6, 5, 14, BEARD, { p: [0, 11, -2], r: [Math.PI / 2 + 0.25, 0, 0], s: [1.05, 1.02, 1], top: BEARD_SHADE }, Math.PI * 1.3);
  b.sphere(7, 8, 6, BEARD, { p: [0, 10, -10.5], s: [1.5, 1.1, 0.7], top: BEARD_SHADE });
  // 两颊的络腮胡 + 上唇的大八字胡（和下面的胡子骨骼接上）
  for (const s of [1, -1]) {
    b.sphere(5.2, 7, 5, BEARD, { p: [s * 9, 7, 6.5], s: [0.9, 1.3, 1], top: BEARD_SHADE });
    b.cone(3, 11, 5, BEARD, { p: [s * 6, 8.5, 12.2], r: [0, 0, s * 1.9], s: [1, 1, 0.8] });
  }
  b.sphere(6.5, 8, 6, BEARD, { p: [0, 5.5, 9.5], s: [1.5, 1, 1] });
  return b.build();
}

/** 胡子的一节：从骨骼原点向下（−Y）长 len 的一团蓬松白毛；tip = 最后一节（收成尖） */
function beardGeo(seed: number, len: number, w0: number, w1: number, tip: boolean): () => BufferGeometry {
  return () => {
    const b = new GeoBuilder(seed);
    if (tip) {
      b.cone(w0, len + 4, 8, BEARD_SHADE, { p: [0, -(len + 4) / 2, 0], r: [Math.PI, 0, 0], s: [1, 1, 0.6], top: BEARD });
      for (const s of [1, -1]) b.cone(w0 * 0.45, len * 0.7, 5, BEARD, { p: [s * w0 * 0.55, -len * 0.45, 0.5], r: [Math.PI, 0, s * 0.3], s: [1, 1, 0.7] });
    } else {
      b.cyl(w0, w1, len + 3, 9, BEARD_SHADE, { p: [0, -len / 2, 0], s: [1, 1, 0.62], top: BEARD });
      // 蓬松的毛团（两侧和正面鼓起）
      for (const [x, y, z, r] of [[w0 * 0.6, -len * 0.3, 1, w0 * 0.55], [-w0 * 0.6, -len * 0.3, 1, w0 * 0.55], [0, -len * 0.55, 3, w0 * 0.6], [w1 * 0.7, -len * 0.8, 0.5, w1 * 0.5], [-w1 * 0.7, -len * 0.8, 0.5, w1 * 0.5]] as const) {
        b.ico(r, 0, BEARD, { p: [x, y, z], s: [1, 1.1, 0.75], jitter: 0.1 });
      }
    }
    return b.build();
  };
}

/** 右上臂：赤裸、隆起的三角肌和二头肌 */
function upperArmRGeo(): BufferGeometry {
  const b = new GeoBuilder(531);
  b.sphere(9.5, 9, 7, SKIN, { p: [0, -2, 0], top: SKIN_LIGHT });
  b.cyl(8, 6.6, 25, 9, SKIN, { p: [0, -13, 0] });
  b.sphere(5.5, 7, 5, SKIN_LIGHT, { p: [0, -11, 4.5], s: [1, 1.5, 0.8] });
  return b.build();
}

/** 左上臂：长袍的宽袖子（金边） */
function upperArmLGeo(): BufferGeometry {
  const b = new GeoBuilder(532);
  b.sphere(9.5, 9, 7, ROBE, { p: [0, -2, 0] });
  b.cyl(8.6, 9.6, 23, 9, ROBE_SHADE, { p: [0, -12, 0], top: ROBE });
  b.torus(9.6, 1.1, 3, 10, GOLD, { p: [0, -23, 0], r: [Math.PI / 2, 0, 0] });
  return b.build();
}

/** 小臂 + 蓝色护腕（金边） */
function forearmGeo(): BufferGeometry {
  const b = new GeoBuilder(541);
  b.cyl(6.4, 5.2, 21, 8, SKIN, { p: [0, -10, 0] });
  b.cyl(7.6, 7, 13, 8, BLUE, { p: [0, -14.5, 0], top: BLUE_LIGHT });
  for (const y of [-8.2, -20.8]) b.torus(7.4, 1.2, 3, 10, GOLD, { p: [0, y, 0], r: [Math.PI / 2, 0, 0] });
  b.octa(2, ELECTRIC, { p: [0, -14.5, 7.4], glow: 2, jitter: 0 });
  return b.build();
}

/** 大手 + 掌心的淡蓝色电光 */
function handGeo(): BufferGeometry {
  const b = new GeoBuilder(545);
  b.box(8, 9, 5.5, SKIN, { p: [0, -4.5, 0.5], jitter: 0.05 });
  b.box(3, 5.5, 3, SKIN, { p: [4.4, -3, 2.6], r: [0, 0, 0.4] });
  b.ico(4.6, 1, 0x4aa8ff, { p: [0, -6.5, 4.6], glow: 2.1, jitter: 0 });
  b.ico(2.4, 0, ELECTRIC_CORE, { p: [0, -6.5, 5.6], glow: 2.5, jitter: 0 });
  return b.build();
}

function thighGeo(): BufferGeometry {
  const b = new GeoBuilder(551);
  b.cyl(8.6, 7, 27, 8, SKIN, { p: [0, -13.5, 0] });
  return b.build();
}

/** 小腿 + 凉鞋（交叉的皮带、鞋底在 −27 = 地面） */
function shinGeo(): BufferGeometry {
  const b = new GeoBuilder(561);
  b.cyl(6.8, 5, 24, 8, SKIN, { p: [0, -12, 0] });
  for (const y of [-12, -17, -22]) b.torus(5.8 - (y + 12) * 0.05, 0.8, 3, 10, SANDAL, { p: [0, y, 0], r: [Math.PI / 2 + 0.2, 0, 0] });
  b.box(8.5, 4, 14, SKIN, { p: [0, -24.5, 3.5] });
  b.box(9.5, 2, 16, SANDAL, { p: [0, -26.5, 3.5] });
  b.box(9.6, 1.4, 2, SANDAL, { p: [0, -23.6, 6], jitter: 0 });
  return b.build();
}

const BONES = humanoidBones(PROPS, [
  ['beard1', 'head', [0, 4.5, 11]],
  ['beard2', 'beard1', [0, -17, 0.5]],
]);

function parts(team: number): PartDef[] {
  return [
    ['pelvis', () => pelvisGeo(team)],
    ['torso', () => torsoGeo(team)],
    ['head', headGeo],
    ['shL', upperArmLGeo],
    ['shR', upperArmRGeo],
    ['elL', forearmGeo],
    ['elR', forearmGeo],
    ['handL', handGeo],
    ['handR', handGeo],
    ['thighL', thighGeo],
    ['thighR', thighGeo],
    ['shinL', shinGeo],
    ['shinR', shinGeo],
    ['beard1', beardGeo(571, 17, 11.5, 9.5, false)],
    ['beard2', beardGeo(572, 15, 9, 4, true)],
  ];
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function blend(a: Pose, b: Pose, k: number): Pose {
  const out: Pose = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) out[key] = lerp(a[key] ?? 0, b[key] ?? 0, k);
  return out;
}

/**
 * 胡子：大体保持竖直下垂（抵消一部分躯干和头的前后倾），轻轻摆动；跑动 / 施法时摆得更厉害。
 * 正的 X 旋转 = 胡梢向后（贴向胸口），绑定姿势已经向前翘 0.25。
 */
function addBeard(p: Pose, t: number, run: number, amp = 0): Pose {
  const lean = (p.torsoX ?? 0) + (p.headX ?? 0) + (p.bodyX ?? 0);
  const w = 2 + 6 * run;
  const a = 0.04 + 0.08 * run + 0.1 * amp;
  p.beard1X = -0.75 * lean + 0.12 * run + a * Math.sin(t * w);
  p.beard2X = -0.15 * lean + 0.1 * run + a * 1.4 * Math.sin(t * w - 1);
  p.beard1Z = 0.05 * Math.sin(t * 1.4) + 0.06 * run * Math.sin(t * 6) - 0.4 * (p.headZ ?? 0);
  p.beard2Z = 0.08 * Math.sin(t * 1.4 - 0.8) + 0.08 * run * Math.sin(t * 6 - 1);
  return p;
}

/** 站立：挺胸，双臂微张、小臂略抬，掌心冒着电光 */
export function idlePose(t: number): Pose {
  const p = hIdle(t, ZEUS_STANCE);
  return {
    ...p,
    shLX: -0.12, elL: -0.75, handLX: 0.2,
    shRX: -0.12, elR: -0.75, handRX: 0.2,
  };
}

/** 跑步：通用跑姿（稍沉重） */
export function runPose(ph: number): Pose {
  return hRun(ph, ZEUS_STANCE);
}

/**
 * 普攻：p = 前摇进度 0..1。0–0.6 右手收到右肩前、掌心朝前聚集电光（身体右转），0.6–1 向前推掌，1 = 电球出手。
 */
export function attackPose(p: number): Pose {
  const w = smooth01(p / 0.6);
  const f = smooth01(Math.max(0, (p - 0.6) / 0.4));
  return {
    bodyY: -1.5 - 2 * f,
    torsoX: lerp(0.1, 0.2, f), torsoY: lerp(-0.4 * w, 0.3, f), headY: lerp(0.3 * w, -0.15, f),
    shRX: lerp(lerp(-0.12, 0.25, w), -1.5, f), shRZ: lerp(-0.25, -0.12, f),
    elR: lerp(lerp(-0.75, -2.1, w), -0.08, f), handRX: lerp(lerp(0.2, 0.8, w), 1.15, f),
    shLX: lerp(-0.12, 0.25, w) * (1 - f) + 0.35 * f, shLZ: lerp(0.25, 0.4, f), elL: lerp(-0.75, -0.5, f),
    hipL: -0.32, kneeL: 0.28, hipR: 0.24, kneeR: 0.24, hipLZ: 0.08, hipRZ: -0.08,
  };
}

/** 弧形闪电：右手食指指向目标，左臂向后张开 */
const ARC_POINT: Pose = {
  bodyY: -2, torsoX: 0.12, torsoY: 0.25, headY: -0.05,
  shRX: -1.55, shRZ: -0.06, elR: -0.04, handRX: 0.1,
  shLX: 0.3, shLZ: 0.4, elL: -0.5,
  hipL: -0.3, kneeL: 0.3, hipR: 0.22, kneeR: 0.25, hipLZ: 0.1, hipRZ: -0.1,
};
/** 雷击前摇：右臂高举向天，仰头 */
const BOLT_RAISE: Pose = {
  bodyY: -1, torsoX: -0.12, headX: -0.32,
  shRX: -2.95, shRZ: -0.18, elR: -0.12, handRX: 0,
  shLX: 0.1, shLZ: 0.45, elL: -0.6,
  hipL: -0.12, kneeL: 0.12, hipR: 0.12, kneeR: 0.12, hipLZ: 0.08, hipRZ: -0.08,
};
/** 雷击释放：右臂向前下方一挥，弯腰 */
const BOLT_SWEEP: Pose = {
  bodyY: -6, torsoX: 0.38, headX: 0.1, torsoY: 0.2,
  shRX: -0.75, shRZ: -0.15, elR: -0.08, handRX: 0.3,
  shLX: 0.35, shLZ: 0.45, elL: -0.6,
  hipL: -0.45, kneeL: 0.5, hipR: 0.25, kneeR: 0.45, hipLZ: 0.1, hipRZ: -0.1,
};
/** 神圣一跳起跳前的下蹲：屈膝、双臂后摆 */
const JUMP_CROUCH: Pose = {
  bodyY: -13, torsoX: 0.5, headX: -0.2,
  shLX: 0.8, shLZ: 0.3, elL: -0.3, shRX: 0.8, shRZ: -0.3, elR: -0.3,
  hipL: -1.0, kneeL: 1.45, hipR: -1.0, kneeR: 1.45, hipLZ: 0.1, hipRZ: -0.1,
};
/** 腾空：收腿、双臂后摆、身体前倾 */
const JUMP_TUCK: Pose = {
  bodyY: 4, torsoX: 0.25, headX: -0.2,
  shLX: 0.8, shLZ: 0.85, elL: -0.3, shRX: 0.8, shRZ: -0.85, elR: -0.3,
  hipL: -1.35, kneeL: 1.8, hipR: -1.1, kneeR: 1.6, hipLZ: 0.12, hipRZ: -0.12,
};
/** 雷神之怒：双臂高举、抬头望天 */
const WRATH_SKY: Pose = {
  bodyY: -1, torsoX: -0.2, headX: -0.55,
  shLX: -2.85, shLZ: 0.42, elL: -0.2, handLX: -0.3,
  shRX: -2.85, shRZ: -0.42, elR: -0.2, handRX: -0.3,
  hipL: -0.12, kneeL: 0.15, hipR: 0.12, kneeR: 0.15, hipLZ: 0.12, hipRZ: -0.12,
};

/** 神圣一跳的全过程（k = 位移进度 0..1）：0–0.15 从下蹲蹬直，0.15–0.75 收腿腾空，0.75–1 伸腿落地 */
export function jumpPose(k: number): Pose {
  const up = smooth01(k / 0.15);
  const tuck = smooth01((k - 0.1) / 0.2);
  const land = smooth01((k - 0.75) / 0.25);
  const extended: Pose = { ...JUMP_TUCK, bodyY: 2, hipL: -0.2, kneeL: 0.15, hipR: 0.1, kneeR: 0.1, torsoX: 0.1, shLX: 0.6, shRX: 0.6 };
  const air = blend(blend(JUMP_CROUCH, extended, up), JUMP_TUCK, tuck);
  return blend(air, { ...JUMP_CROUCH, bodyY: -6, torsoX: 0.3, hipL: -0.55, kneeL: 0.8, hipR: -0.55, kneeR: 0.8 }, land);
}

/** 技能前摇：p = 进度 0..1 */
export function castPose(id: string, p: number): Pose | null {
  const e = smooth01(p);
  const rest = idlePose(0);
  switch (id) {
    case 'zeus_arc_lightning':
      return blend(rest, ARC_POINT, e);
    case 'zeus_lightning_bolt':
      return blend(rest, BOLT_RAISE, e);
    case 'zeus_heavenly_jump':
      // 对局里没有前摇（castPoint 0），只有选人预览会播放
      return blend(rest, JUMP_CROUCH, e);
    case 'zeus_thundergods_wrath':
      return blend(rest, WRATH_SKY, e);
    default:
      return null;
  }
}

/** 技能释放后的动作：k = 进度 0..1 */
export function releasePose(kind: string, k: number): Pose | null {
  const rest = idlePose(0);
  switch (kind) {
    case 'zeus_arc_lightning': {
      // 指尖放电时手臂向上一抖，保持一下再收回
      const kick = Math.sin(Math.min(1, k / 0.35) * Math.PI);
      const p = blend(ARC_POINT, rest, smooth01((k - 0.45) / 0.55));
      p.shRX = (p.shRX ?? 0) - 0.18 * kick;
      p.torsoX = (p.torsoX ?? 0) - 0.05 * kick;
      return p;
    }
    case 'zeus_lightning_bolt': {
      const sweep = smooth01(k / 0.25);
      const back = smooth01((k - 0.55) / 0.45);
      return blend(blend(BOLT_RAISE, BOLT_SWEEP, sweep), rest, back);
    }
    case 'zeus_heavenly_jump':
      return jumpPose(k);
    case 'zeus_thundergods_wrath': {
      // 双臂张得更开、身体后仰发抖，保持到 0.6 再放下
      const arch = smooth01(k / 0.15) * (1 - smooth01((k - 0.6) / 0.4));
      const shake = Math.sin(k * 90) * 0.05 * arch;
      const p = blend(WRATH_SKY, rest, smooth01((k - 0.6) / 0.4));
      return {
        ...p,
        torsoX: (p.torsoX ?? 0) - 0.12 * arch + shake, headX: (p.headX ?? 0) - 0.1 * arch,
        shLZ: (p.shLZ ?? 0) + 0.25 * arch + shake, shRZ: (p.shRZ ?? 0) - 0.25 * arch - shake,
        bodyY: (p.bodyY ?? 0) + 2 * arch,
      };
    }
    default:
      return null;
  }
}

const OWN: OwnPoses = { attack: attackPose, cast: castPose, release: releasePose };

/** 神圣一跳位移的进度（预览里没有单位：按进入状态后的时间估算） */
function leapProgress(tr: AnimTracker, u: Unit | null): number {
  const m = u?.motion;
  if (m && m.kind === 'leap' && m.duration > 0) return Math.min(1, m.elapsed / m.duration);
  return Math.min(1, tr.stateTime / 0.5);
}

/** 按动画状态选姿势：站立和跑用宙斯自己的；神圣一跳位移中用跳跃姿势；其余用 dispatchPose。胡子在所有状态下都摆动 */
export function zeusPose(tr: AnimTracker, t: number, u: Unit | null): Pose {
  if (tr.state === 'idle') return addBeard(tr.taunted ? addTauntShake(idlePose(t), t) : idlePose(t), t, 0);
  if (tr.state === 'run') return addBeard(tr.taunted ? addTauntShake(runPose(tr.runPhase), t) : runPose(tr.runPhase), t, 1);
  if (tr.state === 'stunned' && tr.motion === 'leap') return addBeard(jumpPose(leapProgress(tr, u)), t, 1);
  const p = dispatchPose(tr, t, ZEUS_STANCE, OWN);
  if (tr.state === 'dead') return { ...p, beard1X: 0.2, beard2X: 0.1 };
  const amp = tr.state === 'cast' || tr.state === 'release' ? 1 : tr.state === 'attack' ? 0.5 : 0;
  return addBeard(p, t, 0, amp);
}

export const ZEUS_RELEASE_DUR: Record<string, number> = {
  zeus_arc_lightning: 0.3, zeus_lightning_bolt: 0.4, zeus_heavenly_jump: 0.5, zeus_thundergods_wrath: 0.8,
};

export const ZEUS_SPEC: HeroModelSpec = {
  id: 'zeus',
  scale: ZEUS_SCALE,
  headHeight: 178,
  muzzleHeight: 110,
  bones: BONES,
  parts,
  bindRotations: { beard1: [-0.25, 0, 0] },
  pose: (tr, t, u) => zeusPose(tr, t, u),
  releaseDur: ZEUS_RELEASE_DUR,
  previewMoves: ['zeus_arc_lightning', 'zeus_lightning_bolt', 'zeus_heavenly_jump', 'zeus_thundergods_wrath'],
};

registerHeroModel(ZEUS_SPEC);
