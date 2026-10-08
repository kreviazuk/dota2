import { SphereGeometry, type BufferGeometry } from 'three';
import { GeoBuilder } from '../geo';
import { teamColor, teamDark } from '../materials';
import { type AnimTracker, type Pose, smooth01 } from '../anim';
import type { Unit } from '../../sim/entities/unit';
import type { HeroModelSpec, PartDef } from './heroModel';
import { addTauntShake, dispatchPose, humanoidBones, idlePose as hIdle, runPose as hRun, type OwnPoses, type Proportions, type Stance } from './humanoid';
import { registerHeroModel } from './registry';

/**
 * 幻影刺客：修长的女刺客。深紫色的兜帽斗篷和层层面纱（淡紫镶边），兜帽下是一顶光滑的银紫色头盔，正面一道黑色的一字形眼缝；
 * 修身的轻甲、长腿和尖头靴；右手一把细长的弯刃长剑，左手一把短匕；背后的斗篷分两节（cloak1–cloak2），随动作飘动；
 * 阵营色只用在腰带、垂下的饰带和斗篷内衬上。
 * 骨骼 = humanoidBones + blade（挂右手）+ dagger（挂左手）+ cloak1（挂躯干）+ cloak2（挂 cloak1）。
 * 两把刀的刃都沿本地 +Y，绑定时绕 X 转 90°：手臂自然下垂时刀尖朝前。模型面朝本地 +Z，本地 +X 是角色的左手边。
 */
const VEIL = 0x6b3a8f;
const VEIL_DARK = 0x4a2a6a;
const VEIL_DEEP = 0x341c4c;
const TRIM = 0xc9b0e6;
const TRIM_LIGHT = 0xe6daf6;
const HELM = 0x9d8fbe;
const HELM_LIGHT = 0xdcd2ee;
const HELM_DARK = 0x6a5c88;
const SLIT = 0x07040b;
const BODICE = 0x3a2252;
const LEGGING = 0x2a1a3a;
const GLOVE = 0x2a1c38;
const STEEL = 0xd8d0e8;
const STEEL_EDGE = 0xf6f2ff;
const STEEL_DARK = 0x8a80a6;
const GRIP = 0x2a1a24;
const GOLD = 0xc8a8e8;

export const PA_SCALE = 1.2;

const PROPS: Partial<Proportions> = {
  hipY: 60, waist: 9, torsoLen: 40, neck: 9, headZ: 1, shoulderX: 18, shoulderY: 34, upperArm: 25, forearm: 23,
  thighX: 7.5, thighY: -5, thigh: 29, shin: 26,
};

export const PA_STANCE: Stance = { weaponHand: 'both', hunch: 0.2, armSpread: 0.15, heavy: 0 };

/** 长剑刃长（握点到刀尖） */
export const BLADE_LEN = 100;

/** 后面留出开口的球壳（兜帽 / 面纱）：只盖住后半边，gap = 正前方开口的半角 */
function openSphere(r: number, ws: number, hs: number, gap: number, thetaLen: number): SphereGeometry {
  return new SphereGeometry(r, ws, hs, Math.PI / 2 + gap, Math.PI * 2 - gap * 2, 0, thetaLen);
}

function torsoGeo(): BufferGeometry {
  const b = new GeoBuilder(801);
  // 收腰的深紫色紧身衣，胸前一块淡紫色的轻甲护心
  b.cyl(9, 8.2, 14, 10, BODICE, { p: [0, 5, 0], s: [1, 1, 0.74] });
  b.cyl(11.6, 9.2, 22, 10, BODICE, { p: [0, 20, 0], s: [1, 1, 0.7], top: VEIL_DARK });
  b.sphere(8, 10, 6, HELM, { p: [0, 22, 4], s: [1.15, 0.8, 0.55], top: HELM_LIGHT });
  b.box(1.6, 22, 1.4, TRIM, { p: [0, 12, 7.4], r: [0.05, 0, 0], jitter: 0 });
  // 层层面纱：两层向下张开的披肩（外深内浅），淡紫镶边
  b.cyl(9, 17.5, 13, 12, VEIL_DARK, { p: [0, 29, -0.5], s: [1.05, 1, 0.82], top: VEIL }, true);
  b.torus(17.4, 1.1, 4, 16, TRIM, { p: [0, 22.6, -0.5], r: [Math.PI / 2, 0, 0], s: [1.05, 0.82, 1] });
  b.cyl(8, 14.5, 9, 12, VEIL, { p: [0, 34, -0.8], s: [1.05, 1, 0.84], top: 0x8a52b0 }, true);
  b.torus(14.4, 0.9, 4, 16, TRIM_LIGHT, { p: [0, 29.6, -0.8], r: [Math.PI / 2, 0, 0], s: [1.05, 0.84, 1] });
  // 垂在胸前的两片面纱尖角
  for (const s of [1, -1]) b.cone(5, 15, 4, VEIL, { p: [s * 6, 20, 8], r: [Math.PI - 0.12, 0, s * 0.18], s: [1, 1, 0.3], top: VEIL_DARK });
  // 领口
  b.cyl(6.4, 7.6, 6, 10, VEIL_DEEP, { p: [0, 38.5, 0] });
  return b.build();
}

function pelvisGeo(team: number): BufferGeometry {
  const b = new GeoBuilder(811 + team);
  // 阵营色的腰带 + 淡紫色扣 + 垂下的一条阵营色饰带
  b.cyl(9.8, 10.2, 5, 10, teamColor(team), { p: [0, 3, 0], s: [1, 1, 0.8], top: teamDark(team) });
  b.octa(2.6, TRIM, { p: [0, 3, 8.6], jitter: 0 });
  b.box(3, 18, 1.2, teamColor(team), { p: [3.5, -7, 8.8], r: [0.08, 0, 0.1], top: teamDark(team) });
  // 紧身裤的臀部
  b.cyl(10.4, 9.6, 10, 10, LEGGING, { p: [0, -3, 0], s: [1, 1, 0.8] });
  // 一层层垂下的紫色面纱裙片（前面开口露出长腿）
  for (let i = 0; i < 6; i++) {
    const a = Math.PI * 0.32 + (i / 5) * Math.PI * 1.36;
    const long = i === 2 || i === 3;
    b.box(8.5, long ? 30 : 20, 1.2, i % 2 ? VEIL : VEIL_DARK, {
      p: [Math.sin(a) * 10.2, long ? -13 : -8, Math.cos(a) * 8.4], r: [Math.cos(a) * 0.2, a, -Math.sin(a) * 0.08], top: i % 2 ? 0x8a52b0 : VEIL,
    });
  }
  return b.build();
}

function headGeo(): BufferGeometry {
  const b = new GeoBuilder(821);
  // 脖子
  b.cyl(3.6, 4.2, 9, 8, VEIL_DEEP, { p: [0, 2, 0] });
  // 光滑的银紫色头盔（略长的蛋形），头顶一道浅色的脊
  b.sphere(10.4, 14, 10, HELM_DARK, { p: [0, 13, 1], s: [0.9, 1.12, 1.05], top: HELM_LIGHT, jitter: 0.03 });
  b.box(1.8, 3, 20, HELM_LIGHT, { p: [0, 24.4, 0.5], r: [0.05, 0, 0], jitter: 0 });
  // 黑色的一字形眼缝（沿头盔弧面的三段）
  for (const [a, w] of [[0, 6], [0.42, 4.6], [-0.42, 4.6]] as const) {
    b.box(w, 2.3, 2, SLIT, { p: [Math.sin(a) * 9.5, 14.5, 1 + Math.cos(a) * 10.4], r: [0, a, 0], jitter: 0 });
  }
  // 头盔下沿遮住下半张脸的深紫色面罩
  b.cyl(8.4, 7.6, 7, 12, VEIL_DEEP, { p: [0, 6, 1.6], s: [0.95, 1, 1.05], top: VEIL_DARK });
  // 盖住头盔后半边的兜帽（深紫，淡紫镶边），后面垂到肩上
  b.add(openSphere(12.4, 12, 8, 1.25, Math.PI * 0.62), VEIL_DARK, { p: [0, 14, -1.6], s: [1, 1.08, 1.1], top: VEIL });
  b.torus(10.6, 1.1, 4, 14, TRIM, { p: [0, 15, -4.6], r: [0.25, 0, 0], s: [1.06, 1.06, 1], jitter: 0 }, Math.PI);
  b.sphere(9, 8, 6, VEIL_DARK, { p: [0, 5, -9], s: [1.3, 1.1, 0.8], top: VEIL });
  // 兜帽两侧垂下的面纱
  for (const s of [1, -1]) b.box(3, 16, 9, VEIL, { p: [s * 10.6, 6, -2], r: [0, 0, s * 0.12], top: VEIL_DARK });
  return b.build();
}

/** 上臂：淡紫色的小肩甲 + 深紫色袖子 */
function upperArmGeo(): BufferGeometry {
  const b = new GeoBuilder(831);
  b.sphere(6.2, 8, 5, HELM, { p: [0, -0.5, 0], s: [1.15, 0.9, 1.1], top: HELM_LIGHT }, Math.PI * 2, Math.PI / 2 + 0.3);
  b.cyl(4.8, 4.1, 24, 8, VEIL_DARK, { p: [0, -12, 0], top: VEIL });
  return b.build();
}

/** 小臂 + 淡紫镶边的护腕 */
function forearmGeo(): BufferGeometry {
  const b = new GeoBuilder(841);
  b.cyl(4.1, 3.5, 22, 8, GLOVE, { p: [0, -10.5, 0] });
  b.cyl(4.9, 4.3, 12, 8, HELM_DARK, { p: [0, -15, 0], top: HELM });
  b.torus(4.8, 0.8, 3, 10, TRIM, { p: [0, -9, 0], r: [Math.PI / 2, 0, 0] });
  return b.build();
}

function handGeo(): BufferGeometry {
  const b = new GeoBuilder(845);
  b.box(5.6, 7, 4.6, GLOVE, { p: [0, -3.4, 0.4], jitter: 0.05 });
  b.box(2.2, 4.4, 2.2, GLOVE, { p: [3, -2.6, 2.4], r: [0, 0, 0.35] });
  return b.build();
}

function thighGeo(): BufferGeometry {
  const b = new GeoBuilder(851);
  b.cyl(6.6, 5.1, 29, 8, LEGGING, { p: [0, -14.5, 0] });
  return b.build();
}

/** 小腿：淡紫色护胫 + 尖头靴（靴底在 −26 = 地面） */
function shinGeo(): BufferGeometry {
  const b = new GeoBuilder(861);
  b.cyl(5.4, 4.3, 24, 8, LEGGING, { p: [0, -12, 0] });
  b.box(6, 16, 3, HELM, { p: [0, -10, 4.2], r: [-0.05, 0, 0], top: HELM_LIGHT });
  b.sphere(4.4, 8, 5, HELM, { p: [0, -1, 2.4], s: [1, 0.8, 0.9] });
  b.box(6.4, 4.2, 12, VEIL_DEEP, { p: [0, -24, 3] });
  b.cone(3, 8, 5, VEIL_DEEP, { p: [0, -24.2, 12.4], r: [Math.PI / 2, 0, 0], s: [1.1, 1, 0.6] });
  return b.build();
}

/**
 * 细长的弯刃长剑：握点在原点，刃沿本地 +Y 向前弯（刀背在 −X、刃口在 +X，越往刀尖越弯向 +X），剑面在 XY 平面。
 */
function bladeGeo(): BufferGeometry {
  const b = new GeoBuilder(871);
  b.cyl(1.7, 1.7, 15, 6, GRIP, { p: [0, -1, 0] });
  for (let i = 0; i < 3; i++) b.torus(1.9, 0.6, 3, 6, STEEL_DARK, { p: [0, -5 + i * 4, 0], r: [Math.PI / 2, 0, 0.4] });
  b.octa(2.4, GOLD, { p: [0, -9.5, 0], s: [1, 1.4, 1] });
  // 圆形护手
  b.cyl(5, 5, 1.6, 10, TRIM, { p: [0, 7.5, 0], r: [0, 0, 0], top: TRIM_LIGHT });
  const L = BLADE_LEN;
  const y0 = 9;
  const n = 8;
  const back: [number, number][] = [];
  const edge: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    const y = y0 + (L - y0) * k;
    const cx = 9 * k * k;
    const w = 3.3 * (1 - k * k * 0.7);
    back.push([cx - w, y]);
    edge.push([cx + w * 0.9, y]);
  }
  const tip: [number, number] = [9 + 5, L + 8];
  const outline = [...back, tip, ...edge.slice().reverse()];
  b.extrude(outline, 1.5, STEEL, { jitter: 0.03 });
  // 刃口的亮边
  const edgeLine: [number, number][] = [...edge.map(([x, y]) => [x - 0.9, y] as [number, number]), tip, ...edge.slice().reverse().map(([x, y]) => [x + 0.5, y] as [number, number])];
  b.extrude(edgeLine, 1.1, STEEL_EDGE, { jitter: 0.02 });
  // 刀背一道深色的线（浅色地面上勾出轮廓）
  for (let i = 0; i < n; i++) {
    const [x0, ya] = back[i];
    const [x1, yb] = back[i + 1];
    const len = Math.hypot(x1 - x0, yb - ya);
    b.box(0.9, len + 0.4, 1.9, STEEL_DARK, { p: [(x0 + x1) / 2, (ya + yb) / 2, 0], r: [0, 0, -Math.atan2(x1 - x0, yb - ya)], jitter: 0 });
  }
  return b.build();
}

/** 左手的短匕：握点在原点，刃沿本地 +Y */
function daggerGeo(): BufferGeometry {
  const b = new GeoBuilder(881);
  b.cyl(1.5, 1.5, 9, 6, GRIP, { p: [0, 0, 0] });
  b.box(9, 1.6, 2.4, TRIM, { p: [0, 5, 0] });
  b.extrude([[-2.2, 6], [2.2, 6], [1.6, 22], [0, 28], [-1.6, 22]], 1.3, STEEL, { jitter: 0.03 });
  return b.build();
}

/**
 * 斗篷上半节：从两肩胛之间垂下（沿本地 −Y），外层深紫、内衬阵营色（比外层宽一圈，背后看是一道阵营色包边），两侧淡紫镶边。
 * cloak1X 正 = 向后飘。
 */
function cloak1Geo(team: number): BufferGeometry {
  const b = new GeoBuilder(891 + team);
  const outline: [number, number][] = [[-12, 0], [12, 0], [17, -20], [19, -41], [-19, -41], [-17, -20]];
  b.extrude(outline.map(([x, y]) => [x * 1.1, y * 1.01] as [number, number]), 1.3, teamColor(team), { p: [0, 0, 0.7], top: teamDark(team), jitter: 0.05 });
  // 内面（朝前）盖一层深紫，只留一圈阵营色的边：正面看不会一大片阵营色
  b.extrude(outline.map(([x, y]) => [x * 0.94, y * 0.97] as [number, number]), 0.8, VEIL_DEEP, { p: [0, 0, 1.9], jitter: 0.05 });
  b.extrude(outline, 2.2, VEIL, { p: [0, 0, -1.2], top: 0x8a52b0, jitter: 0.05 });
  for (const s of [1, -1]) {
    b.box(1.5, 22, 2.6, TRIM, { p: [s * 14.6, -10, -1.2], r: [0, 0, s * 0.24], jitter: 0 });
    b.box(1.5, 22, 2.6, TRIM, { p: [s * 18.2, -30.5, -1.2], r: [0, 0, s * 0.1], jitter: 0 });
  }
  return b.build();
}

/** 斗篷下半节：下摆裁成几道尖角 */
function cloak2Geo(team: number): BufferGeometry {
  const b = new GeoBuilder(895 + team);
  const outline: [number, number][] = [[-19, 1], [19, 1], [22, -30], [15, -24], [9, -38], [3, -27], [-3, -38], [-9, -27], [-15, -36], [-22, -26]];
  b.extrude(outline.map(([x, y]) => [x * 1.1, y * 1.03] as [number, number]), 1.3, teamColor(team), { p: [0, 0, 0.7], top: teamDark(team), jitter: 0.05 });
  b.extrude(outline.map(([x, y]) => [x * 0.94, y * 0.97 + 0.5] as [number, number]), 0.8, VEIL_DEEP, { p: [0, 0, 1.9], jitter: 0.05 });
  b.extrude(outline, 2.2, VEIL_DARK, { p: [0, 0, -1.2], top: VEIL, jitter: 0.06 });
  for (const s of [1, -1]) b.box(1.5, 31, 2.6, TRIM, { p: [s * 20.6, -14.5, -1.2], r: [0, 0, -s * 0.1], jitter: 0 });
  return b.build();
}

const BONES = humanoidBones(PROPS, [
  ['blade', 'handR', [0, -5.5, 1]],
  ['dagger', 'handL', [0, -5.5, 1]],
  ['cloak1', 'torso', [0, 33, -9.5]],
  ['cloak2', 'cloak1', [0, -41, 0]],
]);

export const PA_BONES = BONES;

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
    ['blade', bladeGeo],
    ['dagger', daggerGeo],
    ['cloak1', () => cloak1Geo(team)],
    ['cloak2', () => cloak2Geo(team)],
  ];
}

export const PA_BIND: Record<string, [number, number, number]> = { blade: [Math.PI / 2, 0, 0], dagger: [Math.PI / 2, 0, 0] };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function blend(a: Pose, b: Pose, k: number): Pose {
  const out: Pose = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) out[key] = lerp(a[key] ?? 0, b[key] ?? 0, k);
  return out;
}

/** 斗篷两节：lift = 向后飘起的程度（0 站立 … 1 奔跑 / 突进），带一点摆动 */
function cloakPose(t: number, lift: number, amp = 0): Pose {
  const w = 1.6 + 6 * lift;
  const a = 0.04 + 0.07 * lift + 0.08 * amp;
  return {
    cloak1X: lerp(0.1, 0.75, lift) + a * Math.sin(t * w),
    cloak2X: lerp(0.04, 0.35, lift) + a * 1.4 * Math.sin(t * w - 1.1),
    cloak1Z: 0.04 * Math.sin(t * 1.2) + 0.06 * lift * Math.sin(t * 5),
    cloak2Z: 0.06 * Math.sin(t * 1.2 - 0.8) + 0.08 * lift * Math.sin(t * 5 - 1),
  };
}

// ---------- 手臂和刀的关键帧（角度用数值求解：手的位置 + 刀身方向） ----------
/** 站立持剑：右手垂在身侧略向前，长剑斜指右前下方；左手反握短匕在腰前 */
const HOLD_R: Pose = { shRX: 0.42, shRY: 0.11, shRZ: -0.39, elR: -1.28, handRX: 0, bladeX: 1.31, bladeY: 0.27, bladeZ: 0.51 };
const HOLD_L: Pose = { shLX: 0.3, shLY: 0.2, shLZ: 0, elL: -1.47, handLX: 0, daggerX: 1.62, daggerY: 0.43, daggerZ: 0.06 };
/** 奔跑：长剑拖在身后右下方 */
const RUN_R: Pose = { shRX: 0.82, shRY: 0, shRZ: -0.26, elR: -1.01, handRX: 0, bladeX: 1.47, bladeY: -1.6, bladeZ: -0.91 };
/** 普攻蓄力：右臂收到右腰后，刀尖朝前；身体压低 */
const THRUST_WIND: Pose = { shRX: 1.2, shRY: -0.02, shRZ: 0.01, elR: -1.32, handRX: 0, bladeX: -0.28, bladeY: -0.23, bladeZ: 0.29 };
/** 普攻突刺：右臂向前伸直，长剑水平指向正前方 */
const THRUST_HIT: Pose = { shRX: -1.5, shRY: -0.54, shRZ: 0.43, elR: 0, handRX: 0, bladeX: 1.52, bladeY: -0.05, bladeZ: -0.01 };
/** 致命专注时的双刃蓄力：双臂交叉举过头顶 */
const CROSS_UP_R: Pose = { shRX: -2.75, shRY: 0.16, shRZ: 0.24, elR: -0.08, handRX: 0, bladeX: 1.1, bladeY: 1.03, bladeZ: -0.38 };
const CROSS_UP_L: Pose = { shLX: -2.81, shLY: -0.27, shLZ: -0.25, elL: -0.03, handLX: 0, daggerX: 0.61, daggerY: 0.88, daggerZ: 0.16 };
/** 交叉斩到身前（命中瞬间）：双臂交叉在胸前，刀刃斜指前下方 */
const CROSS_HIT_R: Pose = { shRX: -0.67, shRY: 0.44, shRZ: 0.87, elR: -1.7, handRX: 0, bladeX: 2.14, bladeY: -0.04, bladeZ: 0.2 };
const CROSS_HIT_L: Pose = { shLX: -0.58, shLY: -0.37, shLZ: -0.99, elL: -1.7, handLX: 0, daggerX: 2.15, daggerY: 0.28, daggerZ: -0.17 };
/** 交叉斩的收势：双臂向两侧下方挥开 */
const CROSS_OUT_R: Pose = { shRX: -0.04, shRY: -0.22, shRZ: -0.9, elR: -0.89, handRX: 0, bladeX: 1.42, bladeY: 0.03, bladeZ: 0.34 };
const CROSS_OUT_L: Pose = { shLX: 0.08, shLY: 0.13, shLZ: 0.96, elL: -0.89, handLX: 0, daggerX: 1.5, daggerY: 0.03, daggerZ: -0.42 };
/** 窒碍短匕：右手收到左肩前（蓄力），然后向右前方甩出 */
const FLICK_WIND: Pose = { shRX: -1.13, shRY: 0.75, shRZ: 0.24, elR: -1.95, handRX: 0, bladeX: 0.33, bladeY: -0.19, bladeZ: -0.36 };
const FLICK_OUT: Pose = { shRX: -1.5, shRY: 0.63, shRZ: -0.25, elR: 0, handRX: 0, bladeX: 1.5, bladeY: 0.34, bladeZ: 0.16 };
/** 魅影无形：左前臂横在脸前 */
const VEIL_FACE_L: Pose = { shLX: -1.8, shLY: 0.05, shLZ: -1, elL: -1.25, handLX: 0, daggerX: 0.49, daggerY: 0.06, daggerZ: 0.16 };

const ARM_R = ['shRX', 'shRY', 'shRZ', 'elR', 'handRX', 'bladeX', 'bladeY', 'bladeZ'];
const ARM_L = ['shLX', 'shLY', 'shLZ', 'elL', 'handLX', 'daggerX', 'daggerY', 'daggerZ'];
const pick = (p: Pose, keys: string[]): Pose => Object.fromEntries(keys.map((k) => [k, p[k] ?? 0]));

/** 站立：通用的轻盈站姿（略弓身），右手持长剑斜指右前下方，左手短匕 */
export function idlePose(t: number): Pose {
  const p = hIdle(t, PA_STANCE);
  const br = Math.sin(t * 2.2);
  return {
    ...p,
    pelvisY: 0.12, torsoY: -0.1, headY: 0.08,
    ...HOLD_R, shRX: (HOLD_R.shRX ?? 0) + br * 0.02,
    ...HOLD_L,
    hipL: -0.2, kneeL: 0.25, hipR: 0.12, kneeR: 0.2,
    ...cloakPose(t, 0),
  };
}

/** 跑步：前倾的快跑，长剑拖在身后，左手摆动；斗篷向后飘 */
export function runPose(ph: number, t: number): Pose {
  const p = hRun(ph, { ...PA_STANCE, weaponHand: 'none' });
  const s = Math.sin(ph);
  return {
    ...p,
    torsoX: (p.torsoX ?? 0) + 0.12,
    ...RUN_R, shRX: (RUN_R.shRX ?? 0) + 0.12 * s,
    ...HOLD_L, shLX: 0.5 * s - 0.2, elL: -0.9,
    ...cloakPose(t, 1),
  };
}

/** 普攻的下半身：e = 压低身体，f = 右腿向前弓步 */
function lungeLegs(e: number, f: number): Pose {
  return {
    bodyY: -6 * e - 3 * f, bodyZ: 10 * f,
    hipL: lerp(-0.35, 0.35, f), kneeL: lerp(0.6, 0.35, f), hipR: lerp(0.15, -0.95, f), kneeR: lerp(0.55, 0.8, f),
    hipLZ: 0.12, hipRZ: -0.12,
  };
}

/**
 * 普攻：p = 前摇进度 0..1。0–0.4 压低身体、右臂收到腰后，0.4–0.8 弓步前刺并保持，1 = 剑尖刺中（sim 出手的时刻）。
 * focus（身上有致命专注）：改成双刃交叉举过头顶再交叉斩下。
 */
export function attackPose(p: number, focus = false): Pose {
  // 动作在 0.8 就做完、保持到出手：高攻速时前摇很短，状态过渡（0.14 秒）还没走完，提早到位才看得出突刺
  const e = smooth01(p / 0.4);
  const f = smooth01((p - 0.4) / 0.4);
  if (focus) {
    const up = smooth01(p / 0.45);
    const down = Math.min(1, Math.max(0, (p - 0.45) / 0.4));
    const k = down * down;
    const rest = { ...HOLD_R, ...HOLD_L };
    const arms = p < 0.45
      ? blend(rest, { ...CROSS_UP_R, ...CROSS_UP_L }, up)
      : blend({ ...CROSS_UP_R, ...CROSS_UP_L }, { ...CROSS_HIT_R, ...CROSS_HIT_L }, k);
    return {
      ...lungeLegs(up, k),
      torsoX: p < 0.45 ? lerp(0.18, -0.25, up) : lerp(-0.25, 0.45, k), headX: p < 0.45 ? lerp(-0.1, -0.35, up) : lerp(-0.35, 0.1, k),
      ...arms,
      ...cloakPose(0, 0.25 + 0.5 * k),
    };
  }
  const arm = p < 0.4 ? blend(HOLD_R, THRUST_WIND, e) : blend(THRUST_WIND, THRUST_HIT, f);
  return {
    ...lungeLegs(e, f),
    torsoX: lerp(0.18, 0.4, e) - 0.1 * f, torsoY: lerp(0, 0.35, e) - 0.65 * f, headY: -0.3 * e + 0.5 * f,
    ...arm,
    ...HOLD_L, shLX: lerp(-0.25, 0.35, f), shLZ: lerp(0.22, 0.5, f),
    ...cloakPose(0, 0.15 + 0.35 * f),
  };
}

/** 技能前摇：p = 进度 0..1 */
export function castPose(id: string, p: number): Pose | null {
  const e = smooth01(p);
  const rest = idlePose(0);
  switch (id) {
    case 'pa_stifling_dagger':
      // 右手收到左肩前，身体左转蓄力
      return { ...blend(rest, { ...rest, ...FLICK_WIND, torsoY: 0.55, headY: -0.4, bodyY: -3 }, e) };
    case 'pa_phantom_strike':
      // 压低身体准备突进
      return blend(rest, { ...rest, bodyY: -9, torsoX: 0.55, headX: -0.3, hipL: -0.7, kneeL: 1.1, hipR: -0.3, kneeR: 0.9, ...RUN_R, ...cloakPose(0, 0.3) }, e);
    case 'pa_blur':
      // 抬起左前臂掩住面部
      return blend(rest, { ...rest, ...VEIL_FACE_L, torsoX: 0.3, headX: 0.2, bodyY: -3 }, e);
    default:
      return null;
  }
}

/** 释放：k = 进度 0..1 */
export function releasePose(kind: string, k: number, t = 0): Pose | null {
  const rest = idlePose(t);
  switch (kind) {
    case 'pa_stifling_dagger': {
      // 0–0.3 甩出，保持一下再收回
      const out = smooth01(k / 0.3);
      const back = smooth01((k - 0.55) / 0.45);
      const wind = { ...rest, ...FLICK_WIND, torsoY: 0.55, headY: -0.4, bodyY: -3 };
      return blend(blend(wind, { ...rest, ...FLICK_OUT, torsoY: -0.4, headY: 0.25, bodyY: -4 }, out), rest, back);
    }
    case 'pa_phantom_strike': {
      // 闪到目标身边：身体前倾，长剑前指
      const back = smooth01((k - 0.4) / 0.6);
      const lunge = { ...rest, bodyY: -6, bodyZ: 8, torsoX: 0.6, headX: -0.35, ...THRUST_HIT, hipL: 0.3, kneeL: 0.4, hipR: -0.9, kneeR: 0.8, ...cloakPose(t, 1) };
      return blend(lunge, rest, back);
    }
    case 'pa_blur': {
      // 掩面后双手向两侧一挥，身形散开
      const out = smooth01(k / 0.35);
      const back = smooth01((k - 0.6) / 0.4);
      const face = { ...rest, ...VEIL_FACE_L, torsoX: 0.3, headX: 0.2, bodyY: -3 };
      const spread = { ...rest, ...pick({ ...CROSS_OUT_R, ...CROSS_OUT_L }, [...ARM_R, ...ARM_L]), torsoX: -0.15, headX: -0.2, bodyY: 1, ...cloakPose(t, 0.8) };
      return blend(blend(face, spread, out), rest, back);
    }
    case 'crit': {
      // 交叉斩的收势：从胸前交叉向两侧下方挥开，保持一下再收回
      const out = smooth01(k / 0.4);
      const back = smooth01((k - 0.6) / 0.4);
      const hit = { ...lungeLegs(0, 1), torsoX: 0.45, headX: 0.1, ...CROSS_HIT_R, ...CROSS_HIT_L, ...cloakPose(t, 0.75) };
      const follow = { ...lungeLegs(0, 1), torsoX: 0.55, headX: 0.15, bodyY: -10, ...CROSS_OUT_R, ...CROSS_OUT_L, ...cloakPose(t, 0.6) };
      return blend(blend(hit, follow, out), rest, back);
    }
    default:
      return null;
  }
}

/** 身上有没有致命专注（下一刀必定暴击） */
const hasFocus = (u: Unit | null): boolean => !!u?.modifiers.some((m) => m.def.id === 'pa_deadly_focus');

/** 按动画状态选姿势：站立 / 跑 / 普攻用幻刺自己的；其余用 dispatchPose。刀、斗篷在所有状态下都补上 */
export function paPose(tr: AnimTracker, t: number, u: Unit | null): Pose {
  if (tr.state === 'idle') return tr.taunted ? addTauntShake(idlePose(t), t) : idlePose(t);
  if (tr.state === 'run') return tr.taunted ? addTauntShake(runPose(tr.runPhase, t), t) : runPose(tr.runPhase, t);
  // 暴击收势中又开始下一刀的前摇：前摇优先（出手时刻和 sim 一致）
  if (tr.state === 'release' && tr.release?.kind === 'crit' && tr.swing >= 0) return attackPose(tr.swing, hasFocus(u));
  const own: OwnPoses = {
    attack: (p) => attackPose(p, hasFocus(u)),
    cast: castPose,
    release: (kind, k) => releasePose(kind, k, t),
  };
  const p = dispatchPose(tr, t, PA_STANCE, own);
  if (p.bladeX === undefined) Object.assign(p, pick(HOLD_R, ['bladeX', 'bladeY', 'bladeZ']));
  if (p.daggerX === undefined) Object.assign(p, pick(HOLD_L, ['daggerX', 'daggerY', 'daggerZ']));
  if (p.cloak1X === undefined) Object.assign(p, tr.state === 'dead' ? { cloak1X: 0, cloak2X: 0 } : cloakPose(t, 0.2));
  return p;
}

export const PA_RELEASE_DUR: Record<string, number> = { pa_stifling_dagger: 0.3, pa_phantom_strike: 0.25, pa_blur: 0.4 };

export const PA_SPEC: HeroModelSpec = {
  id: 'phantom_assassin',
  scale: PA_SCALE,
  headHeight: 170,
  muzzleHeight: 110,
  bones: BONES,
  parts,
  bindRotations: PA_BIND,
  pose: (tr, t, u) => paPose(tr, t, u),
  releaseDur: PA_RELEASE_DUR,
  fxTriggers: { pa_crit: { kind: 'crit', dur: 0.4 } },
  previewMoves: ['pa_stifling_dagger', 'pa_phantom_strike', 'pa_crit', 'pa_blur'],
  // 深紫色的斗篷和面纱在俯视镜头下处在掠射角：缺省的奶白色边缘光会把它洗成灰紫，换成很弱的淡紫色
  rim: { color: 0xc9b0e6, strength: 0.12 },
};

registerHeroModel(PA_SPEC);
