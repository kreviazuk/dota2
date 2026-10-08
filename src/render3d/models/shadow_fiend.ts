import type { BufferGeometry } from 'three';
import { GeoBuilder, type V3 } from '../geo';
import { teamColor, teamDark } from '../materials';
import { type AnimTracker, type Pose, smooth01 } from '../anim';
import type { Unit } from '../../sim/entities/unit';
import type { HeroModelSpec, PartDef } from './heroModel';
import { addTauntShake, dispatchPose, humanoidBones, idlePose as hIdle, runPose as hRun, type OwnPoses, type Proportions, type Stance } from './humanoid';
import { registerHeroModel } from './registry';

/**
 * 影魔：瘦长的恶魔。炭黑色的身体，胸口、手臂和腿上有发光的红橙色裂纹符文；细长的手臂和利爪，反关节般弯曲的腿（脚是向前伸的爪）；
 * 头上向后掠的尖刺王冠和一对大角，发光的红眼；肩上骨刺；背后一对暗影巨翼（wingL / wingR 挂在躯干，每只翼 3 根细骨 + 暗红色翼膜），
 * 站立时收拢，魂之挽歌时完全展开。不拿武器，身体轻微悬浮起伏。阵营色只用在腰间的布条上。
 * 骨骼 = humanoidBones（瘦长）+ wingL + wingR。模型面朝本地 +Z，本地 +X 是角色的左手边。
 */
const BODY = 0x1e1214;
const BODY_LIGHT = 0x3a2428;
const BODY_DARK = 0x140b0d;
const RUNE = 0xff3a1a;
const RUNE_CORE = 0xffa060;
const HORN = 0x4a3034;
const HORN_TIP = 0x9a7a6c;
const BONE = 0x5a4044;
const CLAW = 0x8a7470;
const EYE = 0xff2a10;
const MEMBRANE = 0x2a0a10;
const MEMBRANE_EDGE = 0x5a121c;
const WING_BONE = 0x3a2226;

export const SF_SCALE = 1.3;

const PROPS: Partial<Proportions> = {
  hipY: 58, waist: 8, torsoLen: 44, neck: 9, headZ: 4, shoulderX: 22, shoulderY: 39, upperArm: 30, forearm: 29,
  thighX: 9, thighY: -4, thigh: 30, shin: 30,
};

export const SF_STANCE: Stance = { weaponHand: 'none', hunch: 0.25, armSpread: 0.3, heavy: 0.2 };

/** 从 a 到 b 的细长圆柱 / 圆锥（局部坐标）：r0 = a 端半径，r1 = b 端半径（0 = 尖） */
function seg(b: GeoBuilder, a: V3, c: V3, r0: number, r1: number, color: number, o: { top?: number; glow?: number; sides?: number } = {}): void {
  const d: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const len = Math.hypot(d[0], d[1], d[2]);
  if (len < 1e-6) return;
  const n: V3 = [d[0] / len, d[1] / len, d[2] / len];
  // 把 +Y 转到 n：先绕 Z 转 cz，再绕 X 转 ax（Euler XYZ = Rx·Ry·Rz）
  const cz = -Math.asin(Math.max(-1, Math.min(1, n[0])));
  const ax = Math.atan2(n[2], n[1]);
  const mid: V3 = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2];
  const opts = { p: mid, r: [ax, 0, cz] as V3, top: o.top, glow: o.glow, jitter: o.glow ? 0 : undefined };
  if (r1 <= 0) b.cone(r0, len, o.sides ?? 6, color, opts);
  else b.cyl(r1, r0, len, o.sides ?? 6, color, opts);
}

/** 沿折线 pts 画一条发光的裂纹（每段一根细方条） */
function crack(b: GeoBuilder, pts: V3[], w: number, color = RUNE, glow = 2.3): void {
  for (let i = 0; i + 1 < pts.length; i++) seg(b, pts[i], pts[i + 1], w, w * 0.8, color, { glow, sides: 4 });
}

function torsoGeo(): BufferGeometry {
  const b = new GeoBuilder(901);
  // 细腰、向上张开的胸廓
  b.cyl(9.5, 7.5, 14, 8, BODY_DARK, { p: [0, 5, 0], s: [1, 1, 0.72] });
  b.cyl(14, 9.5, 24, 8, BODY, { p: [0, 22, 0], s: [1, 1, 0.68], top: BODY_LIGHT });
  b.sphere(11, 8, 6, BODY, { p: [0, 30, 1.5], s: [1.3, 0.75, 0.7] });
  // 肋骨的棱（胸前两侧几道深色的弧）
  for (const s of [1, -1]) for (let i = 0; i < 3; i++) b.box(7, 1.6, 2, BODY_DARK, { p: [s * 6.5, 15 + i * 5, 7.6], r: [0, 0, s * (0.35 + i * 0.05)] });
  // 胸口的发光裂纹符文：中间一道竖的，向两肩和肋下分叉
  crack(b, [[0, 34, 8.6], [-1, 28, 9.2], [1, 22, 9.4], [0, 16, 8.8], [-1, 10, 7.6]], 1.15);
  crack(b, [[-1, 28, 9.2], [-6, 31, 8.4], [-11, 35, 6.6]], 0.9);
  crack(b, [[1, 25, 9.3], [6, 29, 8.6], [11, 33, 6.6]], 0.9);
  crack(b, [[1, 22, 9.4], [7, 18, 8.2]], 0.8);
  crack(b, [[0, 16, 8.8], [-6, 13, 7.6]], 0.8);
  b.octa(2.4, RUNE_CORE, { p: [0, 25, 9.8], glow: 2.6, jitter: 0 });
  // 背后的脊骨刺（一排向后上方的小尖刺）
  for (let i = 0; i < 4; i++) seg(b, [0, 12 + i * 7, -7], [0, 16 + i * 7, -13 - i * 0.6], 2.2, 0, BONE, { top: HORN_TIP });
  // 肩上的骨刺：每边三根向上、向外张开
  for (const s of [1, -1]) {
    b.sphere(6.5, 7, 5, BODY, { p: [s * 20, 37, 0], s: [1.2, 0.9, 1] });
    seg(b, [s * 20, 40, 0], [s * 28, 58, -4], 3.2, 0, BONE, { top: HORN_TIP });
    seg(b, [s * 23, 38, 2], [s * 34, 49, 2], 2.4, 0, BONE, { top: HORN_TIP });
    seg(b, [s * 17, 41, -3], [s * 20, 55, -10], 2.2, 0, BONE, { top: HORN_TIP });
    crack(b, [[s * 15, 36, 5.5], [s * 20, 40, 5.2], [s * 24, 37, 4.2]], 0.7);
  }
  // 脖子
  b.cyl(4.2, 5.5, 12, 6, BODY, { p: [0, 44, 1.5] });
  return b.build();
}

function pelvisGeo(team: number): BufferGeometry {
  const b = new GeoBuilder(911 + team);
  b.cyl(8.5, 9.5, 10, 8, BODY_DARK, { p: [0, -1, 0], s: [1, 1, 0.75] });
  // 腰间缠的阵营色布条：一圈 + 前后垂下的破布条
  b.cyl(10.2, 10.6, 3.6, 8, teamColor(team), { p: [0, 2, 0], s: [1, 1, 0.78], top: teamDark(team) });
  for (const [x, z, rx, len] of [[-3, 8.4, 0.12, 20], [3.5, 8.4, 0.18, 16], [-2, -8.2, -0.15, 22], [4, -8, -0.2, 17]] as const) {
    b.box(4.2, len, 1.2, teamColor(team), { p: [x, -len / 2 + 1, z], r: [rx, 0, x * 0.03], top: teamDark(team) });
  }
  return b.build();
}

function headGeo(): BufferGeometry {
  const b = new GeoBuilder(921);
  // 前伸的长颅骨 + 尖下巴
  b.sphere(9, 9, 7, BODY, { p: [0, 7, 1], s: [0.92, 1, 1.15], top: BODY_LIGHT });
  b.cone(5.5, 10, 6, BODY_DARK, { p: [0, 0, 6], r: [Math.PI + 0.55, 0, 0], s: [1, 1, 0.8] });
  // 一排细牙
  for (let i = -2; i <= 2; i++) b.cone(0.8, 3, 4, 0xd8c8b8, { p: [i * 1.6, 1.5, 9.4 - Math.abs(i) * 0.4], r: [Math.PI, 0, 0] });
  // 斜吊的发光红眼 + 眉骨
  for (const s of [1, -1]) {
    b.box(4.4, 1.6, 1.2, EYE, { p: [s * 3.6, 7.6, 10.2], r: [0, s * 0.25, s * -0.35], glow: 2.8, jitter: 0 });
    b.box(5.5, 2, 3, BODY_DARK, { p: [s * 3.8, 9.8, 9.2], r: [0, s * 0.25, s * -0.4] });
  }
  // 额头一道发光裂纹
  crack(b, [[0, 14, 7.5], [0.5, 11, 9.2], [-0.5, 9.5, 10]], 0.6);
  // 两根向后、向外、再向上弯的大角（三节由粗到细）
  for (const s of [1, -1]) {
    const p0: V3 = [s * 6, 11, 1];
    const p1: V3 = [s * 13, 15, -6];
    const p2: V3 = [s * 18, 22, -16];
    const p3: V3 = [s * 19, 33, -25];
    seg(b, p0, p1, 3.6, 3, HORN);
    seg(b, p1, p2, 3, 2.1, HORN, { top: 0x6a4c48 });
    seg(b, p2, p3, 2.1, 0, 0x6a4c48, { top: HORN_TIP });
  }
  // 头顶向后掠的尖刺王冠：五根，中间最长
  const crown: [number, number, number][] = [[0, 26, 1.1], [3.5, 20, 0.85], [-3.5, 20, 0.85], [6.5, 14, 0.7], [-6.5, 14, 0.7]];
  for (const [x, len, r] of crown) {
    const base: V3 = [x * 0.8, 14, 2];
    seg(b, base, [x * 1.5, 14 + len * 0.55, 2 - len * 0.85], 2.6 * r + 0.6, 0, HORN, { top: HORN_TIP });
  }
  return b.build();
}

/** 上臂：细长，肘后一根骨刺 */
function upperArmGeo(): BufferGeometry {
  const b = new GeoBuilder(931);
  b.sphere(4.6, 6, 5, BODY, { p: [0, -1, 0] });
  b.cyl(3.6, 3, 29, 6, BODY, { p: [0, -14.5, 0], top: BODY_LIGHT });
  crack(b, [[0, -6, 3.4], [0.6, -14, 3.1], [-0.4, -22, 2.8]], 0.55);
  seg(b, [0, -27, -2], [0, -24, -11], 1.8, 0, BONE, { top: HORN_TIP });
  return b.build();
}

/** 小臂：细长，带一道发光裂纹 */
function forearmGeo(): BufferGeometry {
  const b = new GeoBuilder(941);
  b.cyl(3, 2.4, 28, 6, BODY, { p: [0, -14, 0] });
  crack(b, [[0, -4, 2.8], [-0.6, -12, 2.6], [0.4, -20, 2.3], [0, -25, 2]], 0.5);
  // 小臂外侧的两根短骨刺
  seg(b, [2.5, -10, -1], [6, -6, -4], 1.3, 0, BONE);
  seg(b, [2.5, -18, -1], [6.5, -15, -4], 1.2, 0, BONE);
  return b.build();
}

/** 手：窄掌 + 四根向前弯的长爪 */
function handGeo(): BufferGeometry {
  const b = new GeoBuilder(945);
  b.box(5, 6, 3.2, BODY, { p: [0, -3, 0.5] });
  for (const [x, z] of [[-2.1, 1.2], [-0.7, 1.8], [0.7, 1.8], [2.1, 1.2]] as const) {
    seg(b, [x, -5.5, z], [x * 1.25, -12, z + 2.5], 1.1, 0.8, BODY_DARK);
    seg(b, [x * 1.25, -12, z + 2.5], [x * 1.4, -17.5, z + 6.5], 0.9, 0, CLAW, { top: 0xc8b8b0 });
  }
  // 拇指爪
  seg(b, [-2.6, -3, 2], [-4.5, -9, 6], 0.9, 0, CLAW);
  return b.build();
}

/** 大腿：细，膝盖前一个骨节 */
function thighGeo(): BufferGeometry {
  const b = new GeoBuilder(951);
  b.cyl(4.6, 3.4, 30, 6, BODY, { p: [0, -15, 0], top: BODY_LIGHT });
  b.sphere(3.6, 6, 5, BODY_DARK, { p: [0, -29, 1] });
  crack(b, [[0, -8, 4], [0.5, -16, 3.6], [-0.4, -24, 3]], 0.5);
  return b.build();
}

/** 小腿 + 前伸的爪脚（脚底在 −30 = 地面附近）；膝后向后的骨刺 */
function shinGeo(): BufferGeometry {
  const b = new GeoBuilder(961);
  b.cyl(3.2, 2.4, 28, 6, BODY, { p: [0, -14, 0] });
  seg(b, [0, -1, -2], [0, 3, -10], 1.8, 0, BONE, { top: HORN_TIP });
  // 爪脚：一段向前的跖骨 + 三根前趾爪 + 一根后趾
  b.box(4.4, 3, 9, BODY_DARK, { p: [0, -28.5, 3] });
  for (const x of [-1.8, 0, 1.8]) seg(b, [x, -29, 7], [x * 1.6, -29.5, 15], 1.1, 0, CLAW, { top: 0xc8b8b0 });
  seg(b, [0, -28.5, -1.5], [0, -29.5, -6.5], 1, 0, CLAW);
  return b.build();
}

/**
 * 一只暗影翼（左翼沿 +X 张开，side = −1 时镜像成右翼）：骨骼原点在肩胛，
 * 一根上臂骨到"腕"，从腕向外伸出 3 根细指骨；指骨之间是暗红色的翼膜（挤出的薄多边形，边缘扇贝形）。
 * 翼面在 XY 平面里（法线 ±Z），姿势用 wingX/Y/Z 收拢、包裹或展开。
 */
export const WING_SPAN = 82;
function wingGeo(side: 1 | -1): () => BufferGeometry {
  return () => {
    const b = new GeoBuilder(side > 0 ? 971 : 972);
    const m = (p: [number, number]): [number, number] => [p[0] * side, p[1]];
    const W: [number, number] = [30, 26];
    const tips: [number, number][] = [[WING_SPAN, 34], [76, -6], [50, -42]];
    // 翼膜：根部 → 腕 → 三个指尖之间向内凹的扇贝边 → 回到根部下方
    const outline: [number, number][] = [
      [0, 2], W, tips[0], [64, 14], tips[1], [52, -12], tips[2], [26, -30], [6, -14],
    ].map((p) => m(p as [number, number]));
    // 挤出的面朝 ±Z；镜像后绕向反了，顺序也反过来保证法线朝外
    b.extrude(side > 0 ? outline : [...outline].reverse(), 1.2, MEMBRANE, { jitter: 0.12 });
    // 翼膜上几道暗红的筋（略微凸出，正反两面都画）
    for (const z of [0.9, -0.9]) {
      for (const tip of tips) seg(b, [W[0] * side * 0.95, W[1] * 0.95, z], [tip[0] * side * 0.7 + W[0] * side * 0.3, tip[1] * 0.7 + W[1] * 0.3, z], 0.5, 0.3, MEMBRANE_EDGE, { sides: 4 });
    }
    // 骨：根部到腕（粗）、腕到三个指尖（细，指尖带一点发光的爪）
    seg(b, [0, 0, 0], [W[0] * side, W[1], 0], 2.4, 1.9, WING_BONE, { top: BONE });
    b.sphere(2.6, 6, 4, BONE, { p: [W[0] * side, W[1], 0] });
    seg(b, [W[0] * side, W[1], 0], [W[0] * side + 2 * side, W[1] + 9, -1], 1.8, 0, HORN_TIP);
    for (const tip of tips) {
      seg(b, [W[0] * side, W[1], 0], [tip[0] * side, tip[1], 0], 1.3, 0.7, WING_BONE, { top: BONE });
      seg(b, [tip[0] * side, tip[1], 0], [tip[0] * side * 1.06, tip[1] * 1.06 - 3, 0], 0.8, 0, RUNE, { glow: 1.8 });
    }
    return b.build();
  };
}

const BONES = humanoidBones(PROPS, [
  ['wingL', 'torso', [7, 35, -7.5]],
  ['wingR', 'torso', [-7, 35, -7.5]],
]);

export const SF_BONES = BONES;

function parts(team: number): PartDef[] {
  return [
    ['pelvis', () => pelvisGeo(team)],
    ['torso', torsoGeo],
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
    ['wingL', wingGeo(1)],
    ['wingR', wingGeo(-1)],
  ];
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function blend(a: Pose, b: Pose, k: number): Pose {
  const out: Pose = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) out[key] = lerp(a[key] ?? 0, b[key] ?? 0, k);
  return out;
}

/**
 * 翅膀姿势：open 0 = 收拢（翼尖朝下、向后贴着背，腕骨在肩后上方露出一个尖），1 = 完全展开（向两侧张开、上半部向后仰，俯视也看得见翼面），
 * wrap > 0 = 向前包裹身体（魂之挽歌蓄力）。flap = 轻微扇动。左右镜像（右翼的 Y / Z 取反）。
 */
export function wingPose(open: number, wrap = 0, flap = 0): Pose {
  const z = lerp(-0.85, 0.32, open) + 0.25 * wrap;
  const y = lerp(0.75, 0.15, open) - 2.05 * wrap;
  const x = lerp(-0.45, -0.62, open) + 0.45 * wrap + flap;
  return { wingLX: x, wingLY: y, wingLZ: z, wingRX: x, wingRY: -y, wingRZ: -z };
}

/** 悬浮起伏（整个身体） */
const hover = (t: number): number => 3 + 2.6 * Math.sin(t * 1.9);

/** 反关节般的腿：大腿前伸、膝盖向后折（叠加在通用姿势上） */
const LEGS: Pose = { hipL: -0.42, kneeL: 0.9, hipR: -0.36, kneeR: 0.82, hipLZ: 0.08, hipRZ: -0.08 };

/** 站立：悬浮起伏，驼背前倾，细长的手臂垂在两侧、爪子微张，翅膀收拢、随呼吸轻轻张合 */
export function idlePose(t: number): Pose {
  const p = hIdle(t, SF_STANCE);
  const br = Math.sin(t * 1.9);
  return {
    ...p,
    bodyY: hover(t) - 3,
    torsoX: 0.28 + br * 0.03, headX: -0.25 - br * 0.03, headY: 0.06 * Math.sin(t * 0.7),
    shLX: 0.12, shLZ: 0.32 + br * 0.03, elL: -0.45, handLX: -0.35,
    shRX: 0.08, shRZ: -0.32 - br * 0.03, elR: -0.5, handRX: -0.35,
    ...LEGS,
    ...wingPose(0.08 + 0.04 * br),
  };
}

/** 跑步：前倾滑行（腿步子小、离地），翅膀收拢并向后飘 */
export function runPose(ph: number, t: number): Pose {
  const p = hRun(ph, SF_STANCE);
  const s = Math.sin(ph);
  return {
    ...p,
    bodyY: hover(t) - 4 + Math.abs(Math.cos(ph)) * 1.5,
    torsoX: 0.45, headX: -0.32,
    shLX: 0.35 + 0.35 * s, shLZ: 0.3, elL: -0.55,
    shRX: 0.35 - 0.35 * s, shRZ: -0.3, elR: -0.55,
    hipL: (p.hipL ?? 0) * 0.6 - 0.35, kneeL: (p.kneeL ?? 0) * 0.6 + 0.75,
    hipR: (p.hipR ?? 0) * 0.6 - 0.35, kneeR: (p.kneeR ?? 0) * 0.6 + 0.75,
    ...wingPose(0.0, 0, 0.12 + 0.05 * s),
    wingLY: 1.1, wingRY: -1.1,
  };
}

/** 普攻右爪的蓄力位置（右臂向后上方抬起） */
const CLAW_BACK: Pose = {
  torsoX: 0.2, torsoY: -0.5, headY: 0.35, shRX: 0.6, shRY: 0.3, shRZ: -0.85, elR: -1.3, handRX: -0.6,
  shLX: -0.4, shLZ: 0.45, elL: -0.7,
};
/** 普攻出手：右爪向前下方甩出 */
const CLAW_HIT: Pose = {
  torsoX: 0.42, torsoY: 0.4, headY: -0.15, shRX: -1.35, shRY: -0.35, shRZ: -0.2, elR: -0.2, handRX: 0.3,
  shLX: 0.3, shLZ: 0.45, elL: -0.6,
};

/** 普攻：0–0.7 右爪向后上方蓄力（爪尖聚集红光由特效负责），0.7–1 向前一甩，1 = 魂弹出手 */
export function attackPose(p: number, t = 0): Pose {
  const w = smooth01(p / 0.7);
  const f = smooth01(Math.max(0, (p - 0.7) / 0.3));
  const rest = idlePose(t);
  return { ...blend(blend(rest, { ...rest, ...CLAW_BACK }, w), { ...rest, ...CLAW_HIT }, f), ...wingPose(0.1 + 0.1 * w) };
}

/** 毁灭阴影前摇终点：双臂高举过头、身体后仰 */
const RAZE_UP: Pose = {
  bodyY: 2, torsoX: -0.15, headX: -0.3,
  shLX: -2.7, shLZ: 0.35, elL: -0.4, handLX: -0.3,
  shRX: -2.7, shRZ: -0.35, elR: -0.4, handRX: -0.3,
};
/** 毁灭阴影释放：双臂由上而下朝前方低扫，弯腰 */
const RAZE_DOWN: Pose = {
  bodyY: -5, torsoX: 0.75, headX: -0.45,
  shLX: -0.85, shLZ: 0.3, elL: -0.15, handLX: 0.4,
  shRX: -0.85, shRZ: -0.3, elR: -0.15, handRX: 0.4,
};
/** 灵魂盛宴：仰头吸气，胸口挺起，双臂向两侧张开 */
const FEAST: Pose = {
  bodyY: 3, torsoX: -0.35, headX: -0.75,
  shLX: -0.3, shLZ: 1.05, elL: -0.5, handLX: -0.4,
  shRX: -0.3, shRZ: -1.05, elR: -0.5, handRX: -0.4,
};
/** 魂之挽歌蓄力终点：下蹲，双臂交叉在胸前，低头 */
const REQ_CROUCH: Pose = {
  bodyY: -14, torsoX: 0.55, headX: 0.35,
  shLX: -1.2, shLY: -0.6, shLZ: -0.25, elL: -1.9, handLX: 0.2,
  shRX: -1.2, shRY: 0.6, shRZ: 0.25, elR: -1.9, handRX: 0.2,
  hipL: -1.1, kneeL: 1.9, hipR: -1.0, kneeR: 1.85,
};
/** 魂之挽歌释放：双翼和双臂猛然张开，仰身 */
const REQ_BURST: Pose = {
  bodyY: 6, torsoX: -0.3, headX: -0.5,
  shLX: -0.55, shLZ: 1.5, elL: -0.15, handLX: -0.5,
  shRX: -0.55, shRZ: -1.5, elR: -0.15, handRX: -0.5,
  hipL: -0.25, kneeL: 0.5, hipR: -0.2, kneeR: 0.45, hipLZ: 0.2, hipRZ: -0.2,
};

/** 技能前摇：p = 进度 0..1 */
export function castPose(id: string, p: number, t = 0): Pose | null {
  const rest = idlePose(t);
  switch (id) {
    case 'sf_shadowraze':
      return { ...blend(rest, { ...rest, ...RAZE_UP }, smooth01(p / 0.8)), ...wingPose(0.25 * smooth01(p)) };
    case 'sf_requiem': {
      // 0–0.25 收翼下蹲，之后双翼越裹越紧、身体发抖
      const e = smooth01(p / 0.3);
      const shake = Math.sin(t * 40) * 0.035 * smooth01(p);
      const q = blend(rest, { ...rest, ...REQ_CROUCH }, e);
      return { ...q, torsoZ: shake, headZ: -shake, ...wingPose(0.15, smooth01(p / 0.45), -0.05 * Math.sin(t * 9) * p) };
    }
    case 'sf_feast_of_souls':
      return blend(rest, { ...rest, ...FEAST }, smooth01(p));
    default:
      return null;
  }
}

/** 技能释放后的动作：k = 进度 0..1 */
export function releasePose(kind: string, k: number, t = 0): Pose | null {
  const rest = idlePose(t);
  switch (kind) {
    case 'sf_shadowraze': {
      const sweep = smooth01(k / 0.3);
      const back = smooth01((k - 0.55) / 0.45);
      return { ...blend(blend({ ...rest, ...RAZE_UP }, { ...rest, ...RAZE_DOWN }, sweep), rest, back), ...wingPose(0.25 * (1 - back)) };
    }
    case 'sf_feast_of_souls': {
      // 0–0.35 仰头吸气，保持到 0.65，再收回
      const inhale = smooth01(k / 0.35);
      const back = smooth01((k - 0.65) / 0.35);
      return { ...blend(blend(rest, { ...rest, ...FEAST }, inhale), rest, back), ...wingPose(0.08 + 0.35 * inhale * (1 - back)) };
    }
    case 'sf_requiem': {
      // 0–0.15 猛然张开，保持到 0.6，再慢慢收回
      const burst = smooth01(k / 0.15);
      const back = smooth01((k - 0.6) / 0.4);
      const q = blend(blend({ ...rest, ...REQ_CROUCH }, { ...rest, ...REQ_BURST }, burst), rest, back);
      return { ...q, ...wingPose(lerp(0.15, 1, burst) * (1 - back) + 0.08 * back, (1 - burst) * (1 - back)) };
    }
    default:
      return null;
  }
}

/** 按动画状态选姿势：站立 / 跑用影魔自己的；其余用 dispatchPose，并补上翅膀和反关节腿 */
export function sfPose(tr: AnimTracker, t: number, _u: Unit | null): Pose {
  if (tr.state === 'idle') return tr.taunted ? addTauntShake(idlePose(t), t) : idlePose(t);
  if (tr.state === 'run') return tr.taunted ? addTauntShake(runPose(tr.runPhase, t), t) : runPose(tr.runPhase, t);
  const own: OwnPoses = {
    attack: (p) => attackPose(p, t),
    cast: (id, p) => castPose(id, p, t),
    release: (kind, k) => releasePose(kind, k, t),
  };
  const p = dispatchPose(tr, t, SF_STANCE, own);
  if (p.wingLX === undefined) Object.assign(p, tr.state === 'dead' ? wingPose(0.45) : wingPose(0.1));
  return p;
}

export const SF_RELEASE_DUR: Record<string, number> = { sf_shadowraze: 0.45, sf_feast_of_souls: 0.5, sf_requiem: 0.9 };

export const SF_SPEC: HeroModelSpec = {
  id: 'shadow_fiend',
  scale: SF_SCALE,
  headHeight: 142,
  muzzleHeight: 105,
  bones: BONES,
  parts,
  pose: (tr, t, u) => sfPose(tr, t, u),
  releaseDur: SF_RELEASE_DUR,
  previewMoves: ['sf_shadowraze', 'sf_feast_of_souls', 'sf_requiem'],
  // 炭黑色的身体：缺省的奶白色边缘光会把它洗成灰色，换成暗红色的轮廓光，深色剪影里透出一圈红边
  rim: { color: 0xc8301a, strength: 0.12 },
};

registerHeroModel(SF_SPEC);
