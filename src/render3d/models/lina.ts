import { CylinderGeometry, type BufferGeometry } from 'three';
import { GeoBuilder } from '../geo';
import { teamColor, teamDark } from '../materials';
import { type AnimTracker, type Pose, smooth01 } from '../anim';
import type { Unit } from '../../sim/entities/unit';
import type { HeroModelSpec, PartDef } from './heroModel';
import { addTauntShake, dispatchPose, humanoidBones, idlePose as hIdle, runPose as hRun, type OwnPoses, type Proportions, type Stance } from './humanoid';
import { registerHeroModel } from './registry';

/**
 * 莉娜：纤细的女法师。长长飘动的火红色马尾（头后 3 节链式骨骼 hair1–hair3，发梢发光），
 * 深红与橙色的分层长袍（金边）、阵营色腰带、金色护腕、额头的小火焰头饰；没有武器，双手掌心各有一团发光的橙色小球。
 * 模型面朝本地 +Z，本地 +X 是角色的左手边。
 */
const ROBE = 0xc8281e;
const ROBE_DARK = 0x8e1a14;
const ROBE_LIGHT = 0xe04428;
const ORANGE = 0xff8a3a;
const ORANGE_DEEP = 0xe8642a;
const GOLD = 0xe2b04a;
const SKIN = 0xf0c8a8;
const SKIN_DARK = 0xd8a888;
const HAIR = 0xc4221a;
const HAIR_DARK = 0x8a1610;
const HAIR_TIP = 0xff7a22;
const FLAME = 0xffa83a;
const LEGGING = 0x5a1612;
const BOOT = 0x46201a;

export const LINA_SCALE = 1.15;

const PROPS: Partial<Proportions> = {
  hipY: 54, waist: 9, torsoLen: 42, neck: 9, headZ: 1, shoulderX: 21, shoulderY: 37, upperArm: 24, forearm: 22,
  thighX: 8.5, thighY: -5, thigh: 26, shin: 23,
};

export const LINA_STANCE: Stance = { weaponHand: 'none', hunch: 0, armSpread: 0.15, heavy: 0.1 };

/** 前面开衩的圆台（长袍下摆）：gap = 正前方开口的半角 */
function openCone(rt: number, rb: number, h: number, seg: number, gap: number): CylinderGeometry {
  return new CylinderGeometry(rt, rb, h, seg, 1, true, gap, Math.PI * 2 - gap * 2);
}

function torsoGeo(team: number): BufferGeometry {
  const b = new GeoBuilder(301 + team);
  // 收腰的胸衣：腰部深红，胸口渐亮
  b.cyl(11.5, 10.5, 14, 10, ROBE_DARK, { p: [0, 5, 0], s: [1, 1, 0.76] });
  b.cyl(14.5, 11.8, 22, 10, ROBE, { p: [0, 21, 0], s: [1, 1, 0.72], top: ROBE_LIGHT });
  b.sphere(10, 10, 6, ROBE_LIGHT, { p: [0, 24, 4.5], s: [1.25, 0.72, 0.62] });
  // 斜挎的橙色饰带 + 胸口的金扣
  b.box(5, 34, 2.2, ORANGE, { p: [0, 20, 9.2], r: [0.12, 0, 0.55], top: ORANGE_DEEP });
  b.octa(2.8, GOLD, { p: [-3, 25, 10.8] });
  // 金色领口和翻起的高领（外红内橙）
  b.torus(9.5, 1.4, 4, 12, GOLD, { p: [0, 33, 0.5], r: [Math.PI / 2, 0, 0], s: [1, 0.76, 1] });
  b.add(openCone(13, 9, 9, 10, 0.9), ROBE_DARK, { p: [0, 38, -1.5], s: [1, 1, 0.8], top: ROBE });
  b.add(openCone(12.2, 8.4, 8.5, 10, 0.95), ORANGE, { p: [0, 38, -1.2], s: [0.94, 1, 0.76] });
  // 小小的圆肩 + 金边
  for (const s of [1, -1]) {
    b.sphere(7.5, 8, 5, ROBE, { p: [s * 19, 34, 0], s: [1.15, 0.8, 1] }, Math.PI * 2, Math.PI / 2 + 0.3);
    b.torus(7.6, 1, 3, 10, GOLD, { p: [s * 19, 32.5, 0], r: [Math.PI / 2, 0, 0], s: [1.15, 1, 1] });
  }
  return b.build();
}

function pelvisGeo(team: number): BufferGeometry {
  const b = new GeoBuilder(311 + team);
  // 阵营色腰带 + 金扣 + 垂下的两条短饰带
  b.cyl(12.6, 12.8, 5.5, 10, teamColor(team), { p: [0, 3, 0], s: [1, 1, 0.8], top: teamDark(team) });
  b.box(7, 6.5, 2.5, GOLD, { p: [0, 3, 10.4] });
  for (const s of [1, -1]) b.box(3.4, 16, 1.6, teamColor(team), { p: [s * 3.5, -6, 11.2], r: [0.15, 0, s * 0.12], top: teamDark(team) });
  // 长袍下摆：外层深红（前面开衩）、内层橙色前片、金色下沿
  b.add(openCone(13.4, 24, 36, 12, 0.5), ROBE, { p: [0, -16, 0], s: [1, 1, 0.84], top: ROBE_DARK });
  b.add(new CylinderGeometry(12.6, 21, 30, 6, 1, true, -0.7, 1.4), ORANGE, { p: [0, -13, 0], s: [1, 1, 0.8], top: ORANGE_DEEP });
  b.add(new CylinderGeometry(24.2, 24.6, 2.6, 12, 1, true, 0.5, Math.PI * 2 - 1), GOLD, { p: [0, -33.4, 0], s: [1, 1, 0.84] });
  b.add(new CylinderGeometry(21.2, 21.4, 2.2, 6, 1, true, -0.7, 1.4), GOLD, { p: [0, -27.6, 0], s: [1, 1, 0.8] });
  return b.build();
}

function headGeo(): BufferGeometry {
  const b = new GeoBuilder(321);
  // 脖子和脸
  b.cyl(4.5, 5, 9, 8, SKIN_DARK, { p: [0, 2, 0] });
  b.sphere(11.2, 10, 8, SKIN, { p: [0, 12.5, 1], s: [0.92, 1.05, 0.98] });
  b.box(6, 4, 4, SKIN, { p: [0, 4.5, 6.5], r: [0.4, 0, 0] });
  // 眼睛（深色）和金色的眼影光
  for (const s of [1, -1]) {
    b.box(3.2, 2.2, 1.2, 0x2a1210, { p: [s * 4, 12.5, 10.6], jitter: 0 });
    b.box(3.6, 0.9, 1, 0xffb060, { p: [s * 4, 14.2, 10.4], glow: 1.4, jitter: 0 });
  }
  b.box(3, 0.9, 1, 0xa8443a, { p: [0, 6.8, 10.2], jitter: 0 });
  // 头发：头顶和后脑的发团（不盖住脸）
  b.sphere(13.2, 10, 6, HAIR, { p: [0, 13, -0.5], s: [1.06, 1.08, 1.06], top: 0xd8361e }, Math.PI * 2, Math.PI / 2 + 0.2);
  b.sphere(12.5, 10, 8, HAIR_DARK, { p: [0, 10.5, -4.5], s: [1.05, 1.05, 0.95], top: HAIR });
  // 两侧垂到脸颊的鬓发
  for (const s of [1, -1]) b.box(4.2, 19, 5.5, HAIR, { p: [s * 11, 7, 3.5], r: [0.1, 0, s * 0.08], top: 0xd8361e });
  // 齐眉的刘海：一整片压在额头上（几缕向下的发尖）
  b.box(21, 6.5, 5.5, HAIR, { p: [0, 20.5, 9], r: [-0.35, 0, 0], top: 0xd8361e });
  for (const [x, rz] of [[-6.5, -0.25], [0, 0], [6.5, 0.25]] as const) b.cone(3.4, 6, 4, HAIR, { p: [x, 16.2, 10.6], r: [Math.PI - 0.3, 0, rz] });
  // 头顶向后上方翘起的火焰状发尖，发梢发光
  const spikes: [number, number, number, number, number][] = [[0, 27, -4, -0.55, 0], [6.5, 25, -3, -0.45, -0.35], [-6.5, 25, -3, -0.45, 0.35]];
  for (const [x, y, z, rx, rz] of spikes) {
    b.cone(5.6, 17, 6, HAIR, { p: [x, y, z], r: [rx, 0, rz], top: HAIR_TIP });
    b.cone(2.4, 6, 5, FLAME, { p: [x, y + 7.5, z - 4.5], r: [rx, 0, rz], glow: 1.9, jitter: 0 });
  }
  // 压在刘海上的金色头饰：细箍 + 红宝石 + 一小簇火焰
  b.box(16, 2.2, 2, GOLD, { p: [0, 22.6, 11.6], r: [-0.35, 0, 0] });
  b.octa(2.4, 0xff3a20, { p: [0, 23, 13], glow: 1.6, jitter: 0 });
  b.cone(3, 9, 5, FLAME, { p: [0, 28, 12.4], r: [-0.3, 0, 0], glow: 2.2, jitter: 0 });
  b.cone(1.6, 6, 4, 0xfff0b0, { p: [0, 27, 13], r: [-0.3, 0, 0], glow: 2.4, jitter: 0 });
  return b.build();
}

/** 马尾的一节：扁平的发片，从骨骼原点向下（−Y）长 len，宽度 w0 → w1，两侧翘起火苗状的发尖；tip = 最后一节（尖、发光） */
function hairGeo(seed: number, len: number, w0: number, w1: number, c0: number, c1: number, tip: boolean): () => BufferGeometry {
  return () => {
    const b = new GeoBuilder(seed);
    if (tip) {
      b.cone(w0, len + 6, 7, c0, { p: [0, -(len + 6) / 2, 0], r: [Math.PI, 0, 0], s: [1, 1, 0.45], top: c1 });
      b.cone(w0 * 0.6, len * 0.55, 6, FLAME, { p: [0, -len + 2, 0], r: [Math.PI, 0, 0], s: [1, 1, 0.6], glow: 2.3, jitter: 0 });
    } else {
      b.cyl(w0, w1, len + 4, 8, c0, { p: [0, -len / 2, 0], s: [1, 1, 0.45], top: c1 });
    }
    // 两侧向外翘起的发尖（火苗的轮廓），末端带一点发光
    for (const s of [1, -1]) {
      b.cone(w1 * 0.6, len * 0.75, 5, c1, { p: [s * w1 * 0.95, -len * 0.62, 0], r: [Math.PI - s * 0.75, 0, 0], s: [1, 1, 0.5] });
      b.cone(w1 * 0.3, len * 0.3, 4, FLAME, { p: [s * w1 * 1.55, -len * 0.92, 0], r: [Math.PI - s * 0.75, 0, 0], glow: 1.8, jitter: 0 });
    }
    return b.build();
  };
}

function upperArmGeo(): BufferGeometry {
  const b = new GeoBuilder(331);
  b.sphere(6.5, 8, 6, ROBE, { p: [0, -2, 0] });
  b.cyl(5.4, 4.6, 23, 8, ROBE, { p: [0, -12, 0], top: ROBE_LIGHT });
  // 袖口的橙色翻边
  b.cyl(5.6, 6.2, 4, 8, ORANGE, { p: [0, -22, 0] });
  return b.build();
}

/** 露出的小臂 + 金色护腕 */
function forearmGeo(): BufferGeometry {
  const b = new GeoBuilder(341);
  b.cyl(4.3, 3.7, 21, 8, SKIN, { p: [0, -10, 0] });
  b.cyl(5, 5.4, 10, 8, GOLD, { p: [0, -15, 0], top: 0xf4cc6a });
  b.torus(5.3, 0.9, 3, 10, 0xb8862e, { p: [0, -10.4, 0], r: [Math.PI / 2, 0, 0] });
  b.octa(1.8, 0xff3a20, { p: [0, -15, 5.2], glow: 1.5, jitter: 0 });
  return b.build();
}

/** 手 + 掌心前的发光火球 */
function handGeo(): BufferGeometry {
  const b = new GeoBuilder(345);
  b.box(6.5, 8, 5, SKIN, { p: [0, -4, 0.5], jitter: 0.05 });
  b.box(2.6, 5, 2.6, SKIN, { p: [3.4, -3, 2.6], r: [0, 0, 0.35] });
  b.ico(4.6, 1, FLAME, { p: [0, -8.5, 4.6], glow: 2.4, jitter: 0 });
  b.ico(2.6, 0, 0xfff0b0, { p: [0, -8.5, 5.4], glow: 2.6, jitter: 0 });
  return b.build();
}

function thighGeo(): BufferGeometry {
  const b = new GeoBuilder(351);
  b.cyl(6.4, 5.2, 26, 8, LEGGING, { p: [0, -13, 0] });
  return b.build();
}

/** 小腿 + 金边短靴（靴底在 −23 = 地面） */
function shinGeo(): BufferGeometry {
  const b = new GeoBuilder(361);
  b.cyl(5.2, 4.4, 14, 8, LEGGING, { p: [0, -7, 0] });
  b.cyl(5.8, 5.4, 11, 8, BOOT, { p: [0, -15.5, 0], top: 0x6a2c20 });
  b.torus(5.8, 0.9, 3, 10, GOLD, { p: [0, -10.5, 0], r: [Math.PI / 2, 0, 0] });
  b.box(8.5, 5, 14, BOOT, { p: [0, -20.5, 3.2] });
  b.cone(3.6, 6, 5, BOOT, { p: [0, -20.8, 11.5], r: [Math.PI / 2, 0, 0], s: [1.2, 1, 0.7] });
  return b.build();
}

const BONES = humanoidBones(PROPS, [
  ['hair1', 'head', [0, 24, -8]],
  ['hair2', 'hair1', [0, -20, 0]],
  ['hair3', 'hair2', [0, -22, 0]],
]);

function parts(team: number): PartDef[] {
  return [
    ['pelvis', () => pelvisGeo(team)],
    ['torso', () => torsoGeo(team)],
    ['head', headGeo],
    ['shL', upperArmGeo],
    ['shR', upperArmGeo],
    ['elL', forearmGeo],
    ['elR', forearmGeo],
    ['handL', handGeo],
    ['handR', handGeo],
    ['thighL', thighGeo],
    ['thighR', thighGeo],
    ['shinL', shinGeo],
    ['shinR', shinGeo],
    ['hair1', hairGeo(371, 20, 12, 11, HAIR_DARK, HAIR, false)],
    ['hair2', hairGeo(372, 22, 11, 9, HAIR, 0xe0461e, false)],
    ['hair3', hairGeo(373, 22, 9, 5, 0xe0461e, HAIR_TIP, true)],
  ];
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * 马尾：高高扎起、向后扫出的火焰状马尾（从俯视镜头也看得见），末端自然下垂、轻轻摆动；
 * 跑动时整条向后飘平并抖动；施法时（amp）甩得更厉害。正的 X 旋转 = 向后飘（绑定姿势已经向后倾 1.0）。
 */
function hairPose(t: number, run: number, amp = 0): Pose {
  const w = 2.2 + 5 * run;
  const f = Math.sin(t * w), g = Math.sin(t * w - 0.9), h = Math.sin(t * w - 1.8);
  const a = 0.05 + 0.08 * run + 0.12 * amp;
  return {
    hair1X: lerp(0.22, 0.36, run) + 0.08 * amp + a * f,
    hair2X: lerp(-0.45, -0.22, run) + a * g,
    hair3X: lerp(-0.35, -0.12, run) + a * 1.3 * h,
    hair1Z: 0.06 * Math.sin(t * 1.3) + 0.08 * run * Math.sin(t * 5.5),
    hair2Z: 0.08 * Math.sin(t * 1.3 - 0.8) + 0.1 * run * Math.sin(t * 5.5 - 0.9),
    hair3Z: 0.1 * Math.sin(t * 1.3 - 1.6) + 0.12 * run * Math.sin(t * 5.5 - 1.8),
  };
}

/** 站立：轻盈的站姿，右手叉在腰侧附近，掌心火球托在身前 */
export function idlePose(t: number): Pose {
  const p = hIdle(t, LINA_STANCE);
  const br = Math.sin(t * 2.3);
  return {
    ...p,
    pelvisY: 0.12, torsoY: -0.1, headY: 0.08,
    shLX: -0.35 + br * 0.03, shLZ: 0.2, elL: -1.05,
    shRX: 0.05, shRZ: -0.32, elR: -0.7, handRX: -0.3,
    hipL: -0.08, hipR: 0.1, hipLZ: 0.04, hipRZ: -0.08,
    ...hairPose(t, 0),
  };
}

/** 跑步：通用的轻盈跑姿，马尾向后飘 */
export function runPose(ph: number, t: number): Pose {
  return { ...hRun(ph, LINA_STANCE), ...hairPose(t, 1) };
}

/**
 * 普攻：p = 前摇进度 0..1。0–0.7 右手收到腰侧后方、身体右转蓄力（掌心火光变亮由特效负责），
 * 0.7–1 向前一甩，1 = 火球出手。
 */
export function attackPose(p: number): Pose {
  const w = smooth01(p / 0.7);
  const f = smooth01(Math.max(0, (p - 0.7) / 0.3));
  return {
    bodyY: -1.5 - 1.5 * f,
    torsoX: lerp(0.06, 0.18, f), torsoY: lerp(-0.42 * w, 0.32, f), headY: lerp(0.3 * w, -0.2, f),
    shRX: lerp(lerp(0.05, 0.75, w), -1.45, f), shRY: lerp(0, -0.2, f), shRZ: lerp(-0.32, -0.12, f),
    elR: lerp(lerp(-0.7, -1.35, w), -0.12, f), handRX: lerp(-0.5, 0.2, f),
    shLX: lerp(-0.35, -0.75, w) * (1 - f) + 0.1 * f, shLZ: lerp(0.2, 0.45, f), elL: lerp(-1.05, -0.6, f),
    hipL: -0.3, kneeL: 0.25, hipR: 0.22, kneeR: 0.22, hipLZ: 0.06, hipRZ: -0.06,
  };
}

/** 龙破斩前摇的终点：双手收到右腰后方，身体右转 */
const DS_GATHER: Pose = {
  bodyY: -4, torsoX: 0.05, torsoY: -0.6, headY: 0.4,
  shRX: 0.55, shRZ: -0.3, elR: -1.25, handRX: -0.4,
  shLX: -0.55, shLY: -0.5, shLZ: -0.2, elL: -1.55,
  hipL: -0.25, kneeL: 0.35, hipR: 0.3, kneeR: 0.4, hipLZ: 0.1, hipRZ: -0.1,
};
/** 龙破斩释放：双手向前平推，前弓步 */
const DS_PUSH: Pose = {
  bodyY: -6, torsoX: 0.25, torsoY: 0.15, headY: -0.05,
  shRX: -1.45, shRY: -0.2, shRZ: -0.08, elR: -0.12, handRX: 0.5,
  shLX: -1.45, shLY: 0.2, shLZ: 0.08, elL: -0.12, handLX: 0.5,
  hipL: -0.55, kneeL: 0.45, hipR: 0.45, kneeR: 0.3, hipLZ: 0.1, hipRZ: -0.1,
};
/** 光击阵前摇的终点：左手高举，仰头 */
const LSA_RAISE: Pose = {
  bodyY: -1, torsoX: -0.12, headX: -0.35,
  shLX: -2.85, shLZ: 0.25, elL: -0.3, handLX: -0.4,
  shRX: 0.15, shRZ: -0.55, elR: -0.5,
  hipL: -0.12, kneeL: 0.1, hipR: 0.12, kneeR: 0.12, hipLZ: 0.06, hipRZ: -0.06,
};
/** 光击阵释放：左手向下一压，弯腰 */
const LSA_SLAM: Pose = {
  bodyY: -7, torsoX: 0.4, headX: 0.1,
  shLX: -0.85, shLZ: 0.3, elL: -0.15, handLX: 0.6,
  shRX: 0.35, shRZ: -0.6, elR: -0.5,
  hipL: -0.4, kneeL: 0.55, hipR: 0.2, kneeR: 0.5, hipLZ: 0.1, hipRZ: -0.1,
};
/** 神灭斩前摇：双臂前伸、掌心向前 */
const LAGUNA_AIM: Pose = {
  bodyY: -3, torsoX: 0.1, headX: -0.05,
  shLX: -1.5, shLZ: 0.22, elL: -0.06, handLX: 1.2,
  shRX: -1.5, shRZ: -0.22, elR: -0.06, handRX: 1.2,
  hipL: -0.35, kneeL: 0.35, hipR: 0.3, kneeR: 0.3, hipLZ: 0.12, hipRZ: -0.12,
};

function blend(a: Pose, b: Pose, k: number): Pose {
  const out: Pose = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) out[key] = lerp(a[key] ?? 0, b[key] ?? 0, k);
  return out;
}

/** 技能前摇：p = 进度 0..1 */
export function castPose(id: string, p: number): Pose | null {
  const e = smooth01(p);
  const rest = idlePose(0);
  switch (id) {
    case 'lina_dragon_slave':
      return blend(rest, DS_GATHER, e);
    case 'lina_light_strike_array':
      return blend(rest, LSA_RAISE, e);
    case 'lina_laguna_blade':
      return blend(rest, LAGUNA_AIM, e);
    default:
      return null;
  }
}

/** 技能释放后的动作：k = 进度 0..1 */
export function releasePose(kind: string, k: number): Pose | null {
  const rest = idlePose(0);
  switch (kind) {
    case 'lina_dragon_slave': {
      // 0–0.2 向前推出，保持到 0.55，再收回
      const push = smooth01(k / 0.2);
      const back = smooth01((k - 0.55) / 0.45);
      return blend(blend(DS_GATHER, DS_PUSH, push), rest, back);
    }
    case 'lina_light_strike_array': {
      const slam = smooth01(k / 0.25);
      const back = smooth01((k - 0.5) / 0.5);
      return blend(blend(LSA_RAISE, LSA_SLAM, slam), rest, back);
    }
    case 'lina_laguna_blade': {
      // 双臂保持前伸，身体后仰颤抖，最后收回
      const lean = smooth01(k / 0.15) * (1 - smooth01((k - 0.65) / 0.35));
      const shake = Math.sin(k * 95) * 0.06 * lean;
      const p = blend(LAGUNA_AIM, rest, smooth01((k - 0.65) / 0.35));
      return {
        ...p,
        bodyZ: -4 * lean, torsoX: (p.torsoX ?? 0) - 0.4 * lean + shake, headX: (p.headX ?? 0) - 0.25 * lean,
        shLX: (p.shLX ?? 0) + 0.25 * lean + shake, shRX: (p.shRX ?? 0) + 0.25 * lean - shake,
        hipL: (p.hipL ?? 0) - 0.2 * lean, hipR: (p.hipR ?? 0) + 0.3 * lean, kneeR: (p.kneeR ?? 0) + 0.2 * lean,
      };
    }
    default:
      return null;
  }
}

const OWN: OwnPoses = { attack: attackPose, cast: castPose, release: releasePose };

/** 按动画状态选姿势：站立和跑用莉娜自己的；其余用 dispatchPose。马尾在所有状态下都叠加摆动 */
export function linaPose(tr: AnimTracker, t: number): Pose {
  if (tr.state === 'idle') return tr.taunted ? addTauntShake(idlePose(t), t) : idlePose(t);
  if (tr.state === 'run') return tr.taunted ? addTauntShake(runPose(tr.runPhase, t), t) : runPose(tr.runPhase, t);
  const p = dispatchPose(tr, t, LINA_STANCE, OWN);
  if (tr.state === 'dead') return { ...p, hair1X: 0.3, hair2X: 0.1, hair3X: 0.1 };
  const amp = tr.state === 'cast' || tr.state === 'release' ? 1 : tr.state === 'attack' ? 0.5 : 0;
  return { ...p, ...hairPose(t, 0, amp) };
}

export const LINA_RELEASE_DUR: Record<string, number> = { lina_dragon_slave: 0.5, lina_light_strike_array: 0.4, lina_laguna_blade: 0.6 };

export const LINA_SPEC: HeroModelSpec = {
  id: 'lina',
  scale: LINA_SCALE,
  headHeight: 162,
  muzzleHeight: 110,
  bones: BONES,
  parts,
  bindRotations: { hair1: [1.0, 0, 0] },
  pose: (tr, t, _u: Unit | null) => linaPose(tr, t),
  releaseDur: LINA_RELEASE_DUR,
  previewMoves: ['lina_dragon_slave', 'lina_light_strike_array', 'lina_laguna_blade'],
};

registerHeroModel(LINA_SPEC);
