import { SphereGeometry, type BufferGeometry } from 'three';
import { GeoBuilder } from '../geo';
import { teamColor, teamDark } from '../materials';
import { type AnimTracker, type Pose, smooth01 } from '../anim';
import type { Unit } from '../../sim/entities/unit';
import type { HeroModelSpec, PartDef } from './heroModel';
import { addTauntShake, dispatchPose, humanoidBones, idlePose as hIdle, runPose as hRun, type OwnPoses, type Proportions, type Stance } from './humanoid';
import { registerHeroModel } from './registry';

/**
 * 水晶室女：苗条的女法师。浅蓝色带兜帽的长斗篷（白色毛边，兜帽后面有个尖角），里面是深一点的蓝色长裙，
 * 白金色的长辫从兜帽后面垂在斗篷上；右手拿冰晶法杖（细长木杖，顶端一簇发光的青色冰晶）；阵营色腰带和斗篷内衬。
 * 骨骼 = humanoidBones + staff（挂右手，杖身沿本地 +Y）+ cape（挂躯干，从背后垂下）。
 * 模型面朝本地 +Z，本地 +X 是角色的左手边。
 */
const CLOAK = 0x9ad4f5;
const CLOAK_DARK = 0x6fb4de;
const CAPE_DEEP = 0x4f93c8;
const HOOD_TOP = 0x7cbce8;
const CAPE_FOLD = 0x4a88bc;
const FUR = 0xe8f6ff;
const FUR_SHADE = 0xc8dcea;
const DRESS = 0x3a6fa8;
const DRESS_DARK = 0x2a5288;
const DRESS_LIGHT = 0x4f86c0;
const SKIN = 0xf0dcd0;
const SKIN_DARK = 0xd8beb0;
const HAIR = 0xf2e6c2;
const HAIR_DARK = 0xd8c898;
const WOOD = 0x8a6440;
const WOOD_DARK = 0x5e4228;
const SILVER = 0xc8d8e8;
const CRYSTAL = 0x6fe8ff;
const CRYSTAL_CORE = 0xd8fcff;
const EYE = 0x2a5a8a;

export const CM_SCALE = 1.15;

const PROPS: Partial<Proportions> = {
  hipY: 56, waist: 9, torsoLen: 40, neck: 9, headZ: 1, shoulderX: 19, shoulderY: 35, upperArm: 24, forearm: 22,
  thighX: 8, thighY: -5, thigh: 27, shin: 24,
};

export const CM_STANCE: Stance = { weaponHand: 'R', hunch: 0, armSpread: 0.15, heavy: 0.15 };

/** 杖身长度（握点以上）；握点以下 STAFF_BOTTOM */
const STAFF_TOP = 84;
const STAFF_BOTTOM = 40;

/** 前面留出开口的球壳（兜帽、披肩）：gap = 正前方开口的半角；thetaLen = 从顶部往下包到哪里 */
function openSphere(r: number, ws: number, hs: number, gap: number, thetaLen: number): SphereGeometry {
  return new SphereGeometry(r, ws, hs, Math.PI / 2 + gap, Math.PI * 2 - gap * 2, 0, thetaLen);
}

function torsoGeo(team: number): BufferGeometry {
  const b = new GeoBuilder(401 + team);
  // 收腰的深蓝色长裙上身
  b.cyl(10.5, 9.5, 14, 10, DRESS_DARK, { p: [0, 5, 0], s: [1, 1, 0.76] });
  b.cyl(13, 10.6, 22, 10, DRESS, { p: [0, 20, 0], s: [1, 1, 0.72], top: DRESS_LIGHT });
  b.sphere(9, 10, 6, DRESS_LIGHT, { p: [0, 23, 4.2], s: [1.25, 0.72, 0.6] });
  // 胸前的银色系带
  for (let i = 0; i < 3; i++) b.box(7 - i, 1.4, 1.2, SILVER, { p: [0, 12 + i * 6, 8.4 - i * 0.2], jitter: 0 });
  // 浅蓝色的披肩（盖住两肩和后背，前面敞开），内衬阵营色
  b.add(openSphere(17, 12, 6, 0.85, Math.PI * 0.52), CAPE_DEEP, { p: [0, 30, -1], s: [1.12, 0.9, 0.86], top: CLOAK });
  b.add(openSphere(16.2, 12, 6, 0.9, Math.PI * 0.5), teamColor(team), { p: [0, 29.6, -0.8], s: [1.1, 0.88, 0.84] });
  // 披肩前襟两条阵营色内衬窄边（从正面看得到）
  for (const s of [1, -1]) b.box(2.2, 14, 1.4, teamColor(team), { p: [s * 9.5, 26, 9.6], r: [0.15, 0, -s * 0.25], top: teamDark(team) });
  // 白色的毛领：围住脖子的一大圈蓬松毛边（俯视时最显眼的白色）
  b.torus(9.5, 4.2, 6, 14, FUR, { p: [0, 37, 0], r: [Math.PI / 2, 0, 0], s: [1.1, 0.86, 1], top: FUR_SHADE, jitter: 0.12 });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    b.sphere(3.2, 6, 4, FUR, { p: [Math.sin(a) * 12.5, 35.5, Math.cos(a) * 10.5], jitter: 0.12 });
  }
  return b.build();
}

function pelvisGeo(team: number): BufferGeometry {
  const b = new GeoBuilder(411 + team);
  // 阵营色腰带 + 银扣 + 垂下的一条短饰带
  b.cyl(11.6, 11.8, 5, 10, teamColor(team), { p: [0, 3, 0], s: [1, 1, 0.8], top: teamDark(team) });
  b.octa(3, SILVER, { p: [0, 3, 9.6], s: [1.2, 1, 0.6] });
  b.box(3, 15, 1.4, teamColor(team), { p: [-3.5, -6, 9.8], r: [0.12, 0, -0.1], top: teamDark(team) });
  // 长裙：上窄下宽、一直拖到脚面，下摆一圈白色毛边
  b.cyl(12, 25, 52, 12, DRESS, { p: [0, -24, 0], s: [1, 1, 0.84], top: DRESS_DARK }, true);
  b.cyl(11.6, 24.4, 50, 12, DRESS_DARK, { p: [0, -24, 0], s: [1, 1, 0.84] }, true);
  b.torus(24.6, 2.2, 4, 16, FUR, { p: [0, -49.5, 0], r: [Math.PI / 2, 0, 0], s: [1, 0.84, 1], jitter: 0.12 });
  // 正面一片浅一点的前襟
  b.box(10, 44, 1.2, DRESS_LIGHT, { p: [0, -24, 15.5], r: [-0.23, 0, 0], top: DRESS });
  return b.build();
}

function headGeo(): BufferGeometry {
  const b = new GeoBuilder(421);
  // 脖子和脸
  b.cyl(4.2, 4.8, 9, 8, SKIN_DARK, { p: [0, 2, 0] });
  b.sphere(10.5, 10, 8, SKIN, { p: [0, 12.5, 1], s: [0.92, 1.05, 0.98] });
  b.box(5.5, 4, 4, SKIN, { p: [0, 4.8, 6.2], r: [0.4, 0, 0] });
  // 蓝色的眼睛和淡淡的嘴
  for (const s of [1, -1]) {
    b.box(3, 2.2, 1.2, EYE, { p: [s * 3.8, 12.5, 10], jitter: 0 });
    b.box(1, 1, 0.6, 0xffffff, { p: [s * 3.4, 13, 10.6], jitter: 0 });
  }
  b.box(2.8, 0.8, 1, 0xc88a88, { p: [0, 7, 9.6], jitter: 0 });
  // 白金色的刘海：压在额头上，从兜帽里露出来；两侧垂下的鬓发
  b.sphere(11.2, 10, 6, HAIR, { p: [0, 14, 1.5], s: [1, 0.95, 1] }, Math.PI * 2, Math.PI / 2 - 0.1);
  b.box(18, 5, 4, HAIR, { p: [0, 19, 8.6], r: [-0.4, 0, 0], top: HAIR_DARK });
  for (const s of [1, -1]) b.box(3.6, 16, 4.5, HAIR, { p: [s * 9.6, 8, 5], r: [0.08, 0, s * 0.06], top: HAIR_DARK });
  // 兜帽：浅蓝色的厚球壳，前面露出脸；后脑向后上方翘起一个尖角（俯视时的轮廓）
  b.add(openSphere(14.8, 12, 9, 0.62, Math.PI * 0.7), CAPE_DEEP, { p: [0, 13.5, -1.2], s: [1, 1.08, 1.06], top: HOOD_TOP });
  b.add(openSphere(14, 12, 9, 0.66, Math.PI * 0.68), CLOAK_DARK, { p: [0, 13.5, -1], s: [0.98, 1.06, 1.04] });
  b.cone(8, 22, 7, HOOD_TOP, { p: [0, 24, -11], r: [-1.2, 0, 0], s: [1, 1, 0.75], top: CAPE_DEEP });
  // 兜帽口的白色毛边（框住脸）
  b.torus(11.6, 2.8, 5, 14, FUR, { p: [0, 12.5, 9.5], r: [-0.12, 0, 0], s: [0.95, 1.12, 1], jitter: 0.12, top: FUR_SHADE });
  // 额前的小冰晶头饰
  b.octa(2.3, CRYSTAL, { p: [0, 22.5, 11.2], s: [0.8, 1.4, 0.6], glow: 1.8, jitter: 0 });
  return b.build();
}

function upperArmGeo(): BufferGeometry {
  const b = new GeoBuilder(431);
  b.sphere(6, 8, 6, CLOAK, { p: [0, -2, 0] });
  b.cyl(5, 4.6, 23, 8, CLOAK, { p: [0, -12, 0], top: CAPE_DEEP });
  return b.build();
}

/** 小臂：喇叭形的浅蓝色袖子 + 白色毛边袖口 */
function forearmGeo(): BufferGeometry {
  const b = new GeoBuilder(441);
  b.cyl(4.6, 6.6, 18, 8, CLOAK, { p: [0, -9, 0], top: CLOAK_DARK });
  b.torus(6.4, 1.9, 4, 10, FUR, { p: [0, -18.5, 0], r: [Math.PI / 2, 0, 0], jitter: 0.12 });
  b.cyl(3.4, 3.2, 8, 6, SKIN, { p: [0, -19, 0] });
  return b.build();
}

function handGeo(): BufferGeometry {
  const b = new GeoBuilder(445);
  b.box(5.6, 7.5, 4.5, SKIN, { p: [0, -3.8, 0.5], jitter: 0.05 });
  b.box(2.3, 4.6, 2.3, SKIN, { p: [3, -3, 2.4], r: [0, 0, 0.35] });
  return b.build();
}

function thighGeo(): BufferGeometry {
  const b = new GeoBuilder(451);
  b.cyl(6, 5, 27, 8, DRESS_DARK, { p: [0, -13.5, 0] });
  return b.build();
}

/** 小腿 + 白色毛边的浅蓝色短靴（靴底在 −24 = 地面） */
function shinGeo(): BufferGeometry {
  const b = new GeoBuilder(461);
  b.cyl(5, 4.3, 14, 8, DRESS_DARK, { p: [0, -7, 0] });
  b.cyl(5.6, 5.2, 11, 8, CLOAK_DARK, { p: [0, -16.5, 0], top: CLOAK });
  b.torus(5.8, 1.5, 4, 10, FUR, { p: [0, -11.5, 0], r: [Math.PI / 2, 0, 0], jitter: 0.12 });
  b.box(8, 4.6, 13, CLOAK_DARK, { p: [0, -21.7, 3] });
  b.cone(3.4, 6, 5, CLOAK_DARK, { p: [0, -22, 11], r: [Math.PI / 2, 0, 0], s: [1.2, 1, 0.7] });
  return b.build();
}

/** 冰晶法杖：握点在原点，杖身沿本地 +Y。细长木杖，顶端木头分叉托着一簇发光的青色冰晶 */
function staffGeo(): BufferGeometry {
  const b = new GeoBuilder(471);
  const len = STAFF_TOP + STAFF_BOTTOM;
  b.cyl(1.7, 1.9, len, 6, WOOD, { p: [0, (STAFF_TOP - STAFF_BOTTOM) / 2, 0], top: WOOD_DARK });
  // 握把的缠绳 + 杖底的银箍
  for (let i = 0; i < 3; i++) b.torus(2.1, 0.6, 3, 6, SILVER, { p: [0, -5 + i * 5, 0], r: [Math.PI / 2, 0, 0.3] });
  b.cone(2.2, 5, 5, SILVER, { p: [0, -STAFF_BOTTOM - 2, 0], r: [Math.PI, 0, 0] });
  // 顶端的木头分叉（三根向外弯的枝杈）
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    b.cyl(1.1, 1.6, 14, 5, WOOD_DARK, { p: [Math.sin(a) * 3, STAFF_TOP + 4, Math.cos(a) * 3], r: [Math.cos(a) * 0.45, 0, -Math.sin(a) * 0.45] });
  }
  // 一簇冰晶：中间一根长的，四周几根斜着向外的短晶体，全部发光；中心一个亮白的芯
  b.octa(4.6, CRYSTAL, { p: [0, STAFF_TOP + 14, 0], s: [0.85, 2.6, 0.85], glow: 1.9, jitter: 0 });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    const tilt = 0.55 + (i % 2) * 0.2;
    b.octa(3, i % 2 ? CRYSTAL : 0x9ff4ff, {
      p: [Math.sin(a) * 4.5, STAFF_TOP + 9 + (i % 2) * 2, Math.cos(a) * 4.5], s: [0.7, 2.2, 0.7], r: [Math.cos(a) * tilt, 0, -Math.sin(a) * tilt],
      glow: 1.7, jitter: 0,
    });
  }
  b.ico(2.6, 0, CRYSTAL_CORE, { p: [0, STAFF_TOP + 11, 0], glow: 2.4, jitter: 0 });
  return b.build();
}

/**
 * 斗篷：从背后肩胛之间垂到脚边（沿本地 −Y），capeX 正 = 向后飘。外面浅蓝（下深上浅，两道深色褶皱），
 * 里面的阵营色内衬比外层宽一圈，从背后看是一道阵营色的包边；下沿白色毛边；白金色的长辫从兜帽后面垂在斗篷上。
 * 玩家英雄大多朝上走，镜头最常看到的就是背面。
 */
function capeGeo(team: number): BufferGeometry {
  const b = new GeoBuilder(481 + team);
  const outline: [number, number][] = [[-15, 0], [15, 0], [24, -40], [29, -84], [16, -90], [0, -86], [-16, -90], [-29, -84], [-24, -40]];
  const lining = outline.map(([x, y]) => [x * 1.1, y * 1.02 - 0.5] as [number, number]);
  b.extrude(lining, 1.4, teamColor(team), { p: [0, 0, 0.6], top: teamDark(team), jitter: 0.05 });
  b.extrude(outline, 2.4, CAPE_DEEP, { p: [0, 0, -1.4], top: HOOD_TOP, jitter: 0.05 });
  // 两道竖直的深色褶皱
  for (const s of [1, -1]) b.box(3, 70, 1, CAPE_FOLD, { p: [s * 9, -48, -2.8], r: [0, 0, s * 0.12], top: CLOAK_DARK, jitter: 0.05 });
  // 下沿毛边：几段白色的圆条
  const hem: [number, number][] = [[-29, -84], [-16, -90], [0, -86], [16, -90], [29, -84]];
  for (let i = 0; i + 1 < hem.length; i++) {
    const [x0, y0] = hem[i], [x1, y1] = hem[i + 1];
    const len = Math.hypot(x1 - x0, y1 - y0);
    b.cyl(2.4, 2.4, len + 3, 6, FUR, { p: [(x0 + x1) / 2, (y0 + y1) / 2, -1], r: [0, 0, Math.atan2(y1 - y0, x1 - x0) - Math.PI / 2], jitter: 0.12 });
  }
  // 垂在斗篷背面的白金色长辫（一节节变细，末端浅蓝色发绳和发梢）
  for (let i = 0; i < 8; i++) {
    const y = 2 - i * 6.2;
    b.sphere(3.8 - i * 0.22, 7, 5, i % 2 ? HAIR_DARK : HAIR, { p: [Math.sin(i * 1.3) * 0.6, y, -4.2], s: [1, 1.35, 0.8], jitter: 0.1 });
  }
  b.cyl(2.3, 2.5, 2.6, 6, CAPE_FOLD, { p: [0, -48.5, -4] });
  b.cone(2.6, 8, 6, HAIR, { p: [0, -54, -4], r: [Math.PI, 0, 0] });
  return b.build();
}

const BONES = humanoidBones(PROPS, [
  ['staff', 'handR', [0, -5, 2]],
  ['cape', 'torso', [0, 36, -9]],
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
    ['staff', staffGeo],
    ['cape', () => capeGeo(team)],
  ];
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function blend(a: Pose, b: Pose, k: number): Pose {
  const out: Pose = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) out[key] = lerp(a[key] ?? 0, b[key] ?? 0, k);
  return out;
}

/**
 * 让法杖相对躯干保持 tilt 的倾角（0 = 竖直向上，正 = 杖头向前倒）：
 * 抵消躯干、上臂、小臂、手的 X 旋转之和（手臂的左右张开很小，忽略）。
 */
export function holdStaff(p: Pose, tilt: number): Pose {
  p.staffX = tilt - ((p.torsoX ?? 0) + (p.shRX ?? 0) + (p.elR ?? 0) + (p.handRX ?? 0));
  return p;
}

/** 站立：右手竖握法杖，左手自然垂在身侧，斗篷轻轻摆动 */
export function idlePose(t: number): Pose {
  const p = hIdle(t, CM_STANCE);
  const br = Math.sin(t * 2.1);
  return holdStaff({
    ...p,
    pelvisY: -0.1, torsoY: 0.08, headY: -0.06,
    shRX: -0.32, shRZ: -0.3, elR: -1.2, handRX: 0.1,
    shLX: 0.04 + br * 0.02, shLZ: 0.22, elL: -0.45,
    capeX: 0.22 + 0.03 * Math.sin(t * 1.6), capeZ: 0.03 * Math.sin(t * 1.1),
  }, 0.05);
}

/** 跑步：通用的轻盈跑姿，法杖斜在身前，斗篷向后飘起 */
export function runPose(ph: number, t: number): Pose {
  const p = hRun(ph, CM_STANCE);
  return holdStaff({ ...p, capeX: 0.42 + 0.07 * Math.sin(ph * 2), capeZ: 0.05 * Math.sin(t * 3) }, 0.35);
}

/**
 * 普攻：p = 前摇进度 0..1。0–0.7 法杖微微后收、举高（杖头冰晶变亮由特效负责），
 * 0.7–1 杖头向前一戳，1 = 冰片出手。
 */
export function attackPose(p: number): Pose {
  const w = smooth01(p / 0.7);
  const f = smooth01(Math.max(0, (p - 0.7) / 0.3));
  const pose: Pose = {
    bodyY: -1 - 1.5 * f,
    torsoX: lerp(-0.04 * w, 0.16, f), torsoY: lerp(0.18 * w, -0.12, f), headX: lerp(-0.08 * w, 0.02, f),
    shRX: lerp(lerp(-0.32, -0.75, w), -1.25, f), shRZ: lerp(-0.3, -0.18, f), elR: lerp(lerp(-1.2, -1.45, w), -0.35, f), handRX: 0.1,
    shLX: lerp(0.04, -0.3, f), shLZ: lerp(0.22, 0.35, w), elL: lerp(-0.45, -0.7, f),
    hipL: -0.25 * f, kneeL: 0.12 + 0.2 * f, hipR: 0.18 * f, kneeR: 0.14 + 0.15 * f, hipLZ: 0.06, hipRZ: -0.06,
    capeX: 0.22 + 0.12 * f,
  };
  return holdStaff(pose, lerp(lerp(0.05, -0.18, w), 0.95, f));
}

/** 冰霜新星前摇的终点：双手把法杖举过头顶，仰头 */
const NOVA_RAISE: Pose = holdStaff({
  bodyY: 1, torsoX: -0.12, headX: -0.3,
  shRX: -2.75, shRZ: -0.12, elR: -0.35, handRX: 0,
  shLX: -2.8, shLZ: 0.05, elL: -0.55, handLX: 0,
  hipL: -0.08, kneeL: 0.05, hipR: 0.08, kneeR: 0.08, hipLZ: 0.05, hipRZ: -0.05,
  capeX: 0.35,
}, 0);
/** 冰霜新星释放：弯腰把杖尖向前下方砸向地面 */
const NOVA_SLAM: Pose = holdStaff({
  bodyY: -7, torsoX: 0.45, headX: 0.1,
  shRX: -1.05, shRZ: -0.05, elR: -0.3, handRX: 0,
  shLX: -1.0, shLZ: 0.0, elL: -0.55, handLX: 0,
  hipL: -0.45, kneeL: 0.55, hipR: 0.25, kneeR: 0.45, hipLZ: 0.1, hipRZ: -0.1,
  capeX: 0.6,
}, 2.15);
/** 冰封禁制：左手掌心指向目标，右手把法杖收在身侧 */
const FROST_AIM: Pose = holdStaff({
  bodyY: -2, torsoX: 0.08, torsoY: 0.25, headY: 0.15,
  shLX: -1.5, shLY: -0.15, shLZ: 0.12, elL: -0.08, handLX: 1.25,
  shRX: -0.15, shRZ: -0.35, elR: -1.1, handRX: 0.1,
  hipL: -0.3, kneeL: 0.3, hipR: 0.22, kneeR: 0.25, hipLZ: 0.1, hipRZ: -0.1,
  capeX: 0.3,
}, 0.1);

/** 技能前摇：p = 进度 0..1 */
export function castPose(id: string, p: number): Pose | null {
  const e = smooth01(p);
  const rest = idlePose(0);
  switch (id) {
    case 'cm_crystal_nova':
      return blend(rest, NOVA_RAISE, e);
    case 'cm_frostbite':
      return blend(rest, FROST_AIM, e);
    case 'cm_freezing_field':
      // 对局里没有前摇（castPoint 0），只有选人预览会播放
      return blend(rest, channelPose(0), e);
    default:
      return null;
  }
}

/** 技能释放后的动作：k = 进度 0..1 */
export function releasePose(kind: string, k: number): Pose | null {
  const rest = idlePose(0);
  switch (kind) {
    case 'cm_crystal_nova': {
      // 0–0.25 砸下，保持到 0.55，再收回
      const slam = smooth01(k / 0.25);
      const back = smooth01((k - 0.55) / 0.45);
      return blend(blend(NOVA_RAISE, NOVA_SLAM, slam), rest, back);
    }
    case 'cm_frostbite': {
      // 掌心向前一推（手腕后翘），再收回
      const push = Math.sin(Math.min(1, k / 0.4) * Math.PI);
      const p = blend(FROST_AIM, rest, smooth01((k - 0.45) / 0.55));
      p.shLX = (p.shLX ?? 0) - 0.12 * push;
      p.handLX = (p.handLX ?? 0) + 0.25 * push;
      p.torsoX = (p.torsoX ?? 0) + 0.06 * push;
      return p;
    }
    case 'cm_freezing_field':
      // 举起法杖进入引导（之后由 channel 状态接着播放同一个姿势）
      return channelPose(k * CM_RELEASE_DUR.cm_freezing_field);
    default:
      return null;
  }
}

/**
 * 极寒领域的引导：双手把法杖横举过头顶（杖身沿身体左右方向），身体缓慢上下浮动，斗篷飘起来。
 * 法杖横过来靠 staffZ = −π/2（杖身转到本地 +X，与手臂的 X 旋转无关）。
 */
export function channelPose(t: number): Pose {
  const bob = Math.sin(t * 1.6);
  return {
    bodyY: 2 + 3 * bob, torsoX: -0.08, headX: -0.25 + 0.04 * bob,
    shRX: -2.95, shRZ: -0.28, elR: -0.12, handRX: 0,
    shLX: -2.95, shLZ: 0.28, elL: -0.12, handLX: 0,
    staffX: 0, staffZ: -Math.PI / 2,
    hipL: -0.06, kneeL: 0.08 + 0.04 * bob, hipR: 0.06, kneeR: 0.1 + 0.04 * bob, hipLZ: 0.05, hipRZ: -0.05,
    capeX: 0.75 + 0.12 * Math.sin(t * 2.3), capeZ: 0.08 * Math.sin(t * 1.7),
  };
}

const OWN: OwnPoses = { attack: attackPose, cast: castPose, release: releasePose, channel: channelPose };

/** 按动画状态选姿势：站立和跑用水晶室女自己的；其余用 dispatchPose（眩晕 / 死亡时法杖也按手的方向扶正） */
export function cmPose(tr: AnimTracker, t: number): Pose {
  if (tr.state === 'idle') return tr.taunted ? addTauntShake(idlePose(t), t) : idlePose(t);
  if (tr.state === 'run') return tr.taunted ? addTauntShake(runPose(tr.runPhase, t), t) : runPose(tr.runPhase, t);
  const p = dispatchPose(tr, t, CM_STANCE, OWN);
  if (p.staffX === undefined) holdStaff(p, tr.state === 'dead' ? 0.6 : 0.2);
  if (p.capeX === undefined) p.capeX = tr.state === 'dead' ? 0 : 0.3;
  return p;
}

export const CM_RELEASE_DUR: Record<string, number> = { cm_crystal_nova: 0.5, cm_frostbite: 0.35, cm_freezing_field: 0.6 };

export const CM_SPEC: HeroModelSpec = {
  id: 'crystal_maiden',
  scale: CM_SCALE,
  headHeight: 168,
  muzzleHeight: 120,
  bones: BONES,
  parts,
  pose: (tr, t, _u: Unit | null) => cmPose(tr, t),
  releaseDur: CM_RELEASE_DUR,
  previewMoves: ['cm_crystal_nova', 'cm_frostbite', 'cm_freezing_field'],
};

registerHeroModel(CM_SPEC);
