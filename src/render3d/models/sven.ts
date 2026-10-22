import type { BufferGeometry } from 'three';
import { GeoBuilder } from '../geo';
import { PAL, teamColor, teamDark } from '../materials';
import { type AnimTracker, type Pose, RUN_SPEED, smooth01 } from '../anim';
import type { Unit } from '../../sim/entities/unit';
import type { HeroModelSpec, PartDef } from './heroModel';
import { addTauntShake, dispatchPose, humanoidBones, idlePose as hIdle, runPose as hRun, type OwnPoses, type Proportions, type Stance } from './humanoid';
import { registerHeroModel } from './registry';

/**
 * 斯温：深蓝色全身板甲的骑士，封闭的桶形头盔（两只向后掠的短角、T 形面甲缝里透出蓝光），
 * 阵营色罩袍和披风，右肩扛着巨大的"流放之刃"双手大剑。骨骼 = humanoidBones + sword（挂右手）+ cape（挂躯干）。
 * 模型面朝本地 +Z，本地 +X 是角色的左手边。
 */
const ARMOR = 0x2f4f8f;
const ARMOR_DARK = 0x213a6c;
const ARMOR_LIGHT = 0x46689f;
const TRIM = 0xb8c4d6;
const TRIM_DARK = 0x7d889a;
const RIVET = 0xe2b04a;
const SKIN = 0x8fa0b5;
const SKIN_DARK = 0x6f7f95;
const VISOR = 0x7cc8ff;
const BLADE = 0xc9d3e2;
const BLADE_EDGE = 0xeef3fa;
const FULLER = 0x55627a;
const GRIP = 0x3a2a20;

export const SVEN_SCALE = 1.3;

const PROPS: Partial<Proportions> = {
  hipY: 58, waist: 10, torsoLen: 52, neck: 8, headZ: 1, shoulderX: 38, shoulderY: 46, upperArm: 27, forearm: 24,
  thighX: 13, thighY: -6, thigh: 27, shin: 27,
};

export const SVEN_STANCE: Stance = { weaponHand: 'both', hunch: 0.1, armSpread: 0.25, heavy: 0.7 };

/** 一圈金色铆钉 */
function rivets(b: GeoBuilder, n: number, r: number, y: number, z0: number, arc = Math.PI * 2, a0 = 0, size = 2.6): void {
  for (let i = 0; i < n; i++) {
    const a = a0 + (arc * (i + 0.5)) / n;
    b.box(size, size, size, RIVET, { p: [Math.sin(a) * r, y, Math.cos(a) * r + z0], r: [0, a, 0], jitter: 0.02 });
  }
}

function torsoGeo(team: number): BufferGeometry {
  const b = new GeoBuilder(201 + team);
  // 腹甲（分层的横甲片）
  b.cyl(21, 23, 12, 10, ARMOR_DARK, { p: [0, 6, 0], s: [1, 1, 0.78] });
  b.cyl(23, 22, 9, 10, ARMOR, { p: [0, 15, 1], s: [1, 1, 0.8] });
  // 桶形胸甲：上宽下窄，正面隆起的中脊
  b.cyl(31, 24, 30, 12, ARMOR, { p: [0, 34, 0], s: [1, 1, 0.74], top: ARMOR_LIGHT });
  b.sphere(26, 12, 6, ARMOR_LIGHT, { p: [0, 36, 7], s: [1, 0.72, 0.62] }, Math.PI * 2, Math.PI / 2 + 0.3);
  b.box(4.5, 30, 5, TRIM, { p: [0, 33, 19.5], r: [-0.12, 0, 0] });
  // 胸甲下沿和领口的钢色镶边 + 金铆钉
  b.torus(25, 2.2, 4, 14, TRIM, { p: [0, 20, 1], r: [Math.PI / 2, 0, 0], s: [1, 0.78, 1] });
  rivets(b, 7, 22, 25, 1, Math.PI * 0.9, -Math.PI * 0.45);
  // 护颈
  b.cyl(15, 21, 10, 10, TRIM_DARK, { p: [0, 51, 0], s: [1, 1, 0.85], top: TRIM });
  b.torus(17, 2, 4, 12, RIVET, { p: [0, 47, 0], r: [Math.PI / 2, 0, 0], s: [1, 0.85, 1] });
  // 阵营色罩袍的前片（胸甲中脊两侧压着的窄条）
  b.box(16, 18, 3, teamColor(team), { p: [0, 10, 18.5], r: [0.08, 0, 0], top: teamDark(team) });
  // 背后：披风的挂扣
  b.box(46, 7, 6, TRIM_DARK, { p: [0, 47, -17] });
  for (const s of [1, -1]) b.sphere(4.5, 6, 4, RIVET, { p: [s * 20, 47, -19] });
  return b.build();
}

function pelvisGeo(team: number): BufferGeometry {
  const b = new GeoBuilder(211 + team);
  // 腰带 + 金扣
  b.cyl(24, 24, 7, 10, PAL.darkLeather, { p: [0, 5, 0], s: [1, 1, 0.8] });
  b.box(11, 9, 4, RIVET, { p: [0, 5, 19.5] });
  // 裙甲：前后左右的甲片，向外张开
  b.cyl(24, 30, 18, 10, ARMOR_DARK, { p: [0, -6, 0], s: [1, 1, 0.8] }, true);
  for (const s of [1, -1]) {
    b.box(14, 22, 20, ARMOR, { p: [s * 23, -9, 0], r: [0, 0, s * 0.22], top: ARMOR_LIGHT });
    b.box(15, 3, 21, TRIM, { p: [s * 25.5, -19.5, 0], r: [0, 0, s * 0.22] });
  }
  // 阵营色的前垂片（罩袍下摆）
  b.box(18, 34, 3, teamColor(team), { p: [0, -16, 21], r: [0.12, 0, 0], top: teamDark(team), jitter: 0.05 });
  b.box(19, 3, 3.5, RIVET, { p: [0, -32, 23] });
  return b.build();
}

function headGeo(): BufferGeometry {
  const b = new GeoBuilder(221);
  // 脖子和露在头盔下沿的灰蓝色下颌
  b.cyl(8, 9, 10, 8, SKIN_DARK, { p: [0, 3, 0] });
  b.box(17, 9, 15, SKIN, { p: [0, 7, 4], jitter: 0.05 });
  b.box(11, 4, 6, SKIN_DARK, { p: [0, 4, 10] });
  // 桶形头盔
  b.cyl(16.5, 17.5, 30, 12, ARMOR, { p: [0, 26, 0], top: ARMOR_LIGHT });
  b.sphere(16.5, 12, 5, ARMOR_LIGHT, { p: [0, 41, 0], s: [1, 0.55, 1] }, Math.PI * 2, Math.PI / 2);
  // 上下两道钢箍 + 金铆钉
  b.cyl(18.2, 18.2, 4, 12, TRIM, { p: [0, 13, 0] });
  b.cyl(17.4, 17.4, 3.5, 12, TRIM, { p: [0, 39, 0] });
  rivets(b, 9, 18, 13, 0, Math.PI * 2, 0, 2.4);
  // T 形面甲：深色凹槽 + 里面透出的蓝光
  b.box(25, 6.5, 3, 0x0d1626, { p: [0, 28, 15.6] });
  b.box(6, 15, 3, 0x0d1626, { p: [0, 20, 15.6] });
  b.box(22, 3, 2, VISOR, { p: [0, 28, 16.8], glow: 2.6, jitter: 0 });
  b.box(2.6, 12, 2, VISOR, { p: [0, 20.5, 16.8], glow: 2.6, jitter: 0 });
  // 面甲中脊（T 的上方）
  b.box(3, 8, 3, TRIM, { p: [0, 35.5, 16] });
  // 两只向后掠的短角
  for (const s of [1, -1]) {
    b.cyl(4.5, 5.5, 6, 6, TRIM_DARK, { p: [s * 16.5, 31, -1], r: [0, 0, -s * 1.2] });
    b.cone(4.8, 24, 6, TRIM, { p: [s * 21, 37, -8], r: [-1.05, 0, -s * 0.55], top: 0xf4f7fb });
  }
  return b.build();
}

/** 肩甲：三层叠起的大圆甲片（左右对称，side = 1 左 / −1 右） */
function upperArmGeo(side: number): BufferGeometry {
  const b = new GeoBuilder(side > 0 ? 231 : 232);
  b.cyl(9.5, 8.5, 26, 8, ARMOR_DARK, { p: [0, -13, 0] });
  // 顶层圆甲 + 下沿钢边，下面两层渐小的甲片
  b.sphere(20, 10, 5, ARMOR, { p: [side * 3, 1, 0], s: [1.15, 0.9, 1.1], top: ARMOR_LIGHT }, Math.PI * 2, Math.PI / 2);
  b.cyl(23.4, 23.4, 3, 12, TRIM, { p: [side * 3, 0.5, 0], s: [1, 1, 0.95] });
  b.cyl(21.5, 22.5, 7, 12, ARMOR_DARK, { p: [side * 4, -4, 0], s: [1, 1, 0.92] });
  b.cyl(19, 20.5, 6, 12, ARMOR, { p: [side * 5, -10, 0], s: [1, 1, 0.9] });
  b.cyl(20.7, 20.7, 2.2, 12, TRIM, { p: [side * 5, -13, 0], s: [1, 1, 0.9] });
  rivets(b, 5, 22.6, 4, 0, Math.PI, side > 0 ? -Math.PI * 0.5 : Math.PI * 0.5, 2.8);
  return b.build();
}

function forearmGeo(): BufferGeometry {
  const b = new GeoBuilder(241);
  b.sphere(8.5, 7, 5, TRIM, { p: [0, -1, -2] });
  b.cyl(9.5, 8.2, 20, 8, ARMOR, { p: [0, -12, 0], top: ARMOR_LIGHT });
  b.torus(9.2, 1.5, 3, 10, TRIM, { p: [0, -21, 0], r: [Math.PI / 2, 0, 0] });
  b.box(4, 14, 4, RIVET, { p: [0, -11, 9.4] });
  return b.build();
}

/** 露出的灰蓝色手 + 钢护手的腕甲 */
function handGeo(): BufferGeometry {
  const b = new GeoBuilder(245);
  b.cyl(8.6, 8.2, 5, 8, TRIM_DARK, { p: [0, -1, 0] });
  b.box(12, 12, 12.5, SKIN, { p: [0, -8, 1], jitter: 0.06 });
  b.box(5, 8, 5, SKIN, { p: [5, -6, 5], r: [0, 0, 0.3] });
  return b.build();
}

function thighGeo(): BufferGeometry {
  const b = new GeoBuilder(251);
  b.cyl(12, 10.5, 27, 8, ARMOR, { p: [0, -13, 0], top: ARMOR_DARK });
  b.sphere(8, 7, 5, TRIM, { p: [0, -26, 6], s: [1, 1, 0.8] });
  b.box(3, 3, 3, RIVET, { p: [0, -26, 12.6] });
  return b.build();
}

function shinGeo(): BufferGeometry {
  const b = new GeoBuilder(261);
  b.cyl(10, 9, 22, 8, ARMOR, { p: [0, -11, 0], top: ARMOR_LIGHT });
  b.box(5, 18, 4, TRIM_DARK, { p: [0, -11, 8.5] });
  // 铁靴
  b.box(15, 7, 25, ARMOR_DARK, { p: [0, -21.5, 5] });
  b.box(14, 4, 7, TRIM, { p: [0, -20, 16] });
  return b.build();
}

/** 流放之刃：握点在原点，剑身沿本地 +Y，剑面在 XY 平面（宽度沿 X） */
function swordGeo(): BufferGeometry {
  const b = new GeoBuilder(271);
  // 缠绕的剑柄 + 剑首
  b.cyl(2.9, 2.9, 28, 6, GRIP, { p: [0, 0, 0] });
  for (let i = 0; i < 5; i++) b.torus(3.1, 0.9, 3, 6, 0x6a4a30, { p: [0, -10 + i * 5, 0], r: [Math.PI / 2, 0, 0.3] });
  b.octa(5.5, RIVET, { p: [0, -17, 0], s: [1, 1.3, 1] });
  // 十字护手（两端金色）
  b.box(44, 6, 8, TRIM_DARK, { p: [0, 16, 0], top: TRIM });
  for (const s of [1, -1]) b.box(7, 9, 9, RIVET, { p: [s * 23, 16.5, 0] });
  b.box(12, 10, 9, TRIM, { p: [0, 20, 0] });
  // 宽平的剑身（轮廓沿 +Y 挤出），两面深色血槽，刃口亮边
  const L = 196;
  const blade: [number, number][] = [[-13, 22], [13, 22], [14, L - 32], [8, L - 10], [0, L], [-8, L - 10], [-14, L - 32]];
  b.extrude(blade, 4.5, BLADE, { jitter: 0.05 });
  const edge = (s: number): [number, number][] => [[s * 13, 22], [s * 14.6, 22], [s * 15.6, L - 32], [s * 9, L - 9], [s * 8, L - 10], [s * 14, L - 32]];
  b.extrude(edge(1), 3, BLADE_EDGE, { jitter: 0.02 });
  b.extrude(edge(-1), 3, BLADE_EDGE, { jitter: 0.02 });
  for (const z of [2.4, -2.4]) b.box(4.5, L - 70, 0.8, FULLER, { p: [0, 22 + (L - 70) / 2 + 4, z], jitter: 0.03 });
  // 剑根的金色镶片
  b.box(20, 8, 5.4, RIVET, { p: [0, 27, 0] });
  return b.build();
}

/** 披风：挂在背后肩胛之间，从挂点向下垂（沿本地 −Y），capeX 正 = 向后飘 */
function capeGeo(team: number): BufferGeometry {
  const b = new GeoBuilder(281 + team);
  b.extrude([[-23, 0], [23, 0], [30, -80], [12, -84], [0, -79], [-12, -84], [-30, -80]], 3, teamDark(team), { top: teamColor(team), jitter: 0.06 });
  b.box(48, 5, 4.5, TRIM_DARK, { p: [0, -1.5, 0] });
  return b.build();
}

const BONES = humanoidBones(PROPS, [
  ['sword', 'handR', [0, -8, 1]],
  ['cape', 'torso', [0, 47, -19]],
]);

function parts(team: number): PartDef[] {
  return [
    ['pelvis', () => pelvisGeo(team)],
    ['torso', () => torsoGeo(team)],
    ['head', headGeo],
    ['shL', () => upperArmGeo(1)],
    ['shR', () => upperArmGeo(-1)],
    ['elL', forearmGeo],
    ['elR', forearmGeo],
    ['handL', handGeo],
    ['handR', handGeo],
    ['thighL', thighGeo],
    ['thighR', thighGeo],
    ['shinL', shinGeo],
    ['shinR', shinGeo],
    ['sword', swordGeo],
    ['cape', () => capeGeo(team)],
  ];
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** 右臂扛剑的姿势：剑身从右胸前的右手斜着搭过右肩，指向后上方（骨骼角度用数值求解得出） */
const SHOULDER_SWORD: Pose = { shRX: -0.48, shRY: 0.37, shRZ: -0.01, elR: -1.68, handRX: 0.2, swordX: -0.64, swordY: 0, swordZ: 0.05 };
/** 普攻的三个关键帧（右臂 + 剑）：举到右肩后上方 → 右前方横扫 → 左前下方（命中） */
const SWING_WIND: Pose = { shRX: -2.52, shRY: -0.04, shRZ: -0.12, elR: -1.65, swordX: 0.76, swordY: 0.57, swordZ: 1.45 };
const SWING_MID: Pose = { shRX: -0.65, shRY: -0.4, shRZ: 0.54, elR: -1.63, swordX: 1.62, swordZ: 0.56 };
const SWING_HIT: Pose = { shRX: -0.41, shRY: -0.69, shRZ: 0.96, elR: -0.13, swordX: 1.18, swordZ: 0.19 };
/** 战吼：剑高举过头顶、略向前倾（俯视镜头下也看得出剑身）；神之力量：右臂向外张开，剑斜指天空 */
const SWORD_UP: Pose = { shRX: -2.72, shRY: 0.73, shRZ: -0.01, elR: -0.14, swordX: 1.69, swordZ: 0.01 };
const SWORD_SPREAD: Pose = { shRX: -0.79, shRY: 0.28, shRZ: -1.78, elR: -0.51, swordX: 1.42, swordZ: 0.32 };
const ARM_KEYS = ['shRX', 'shRY', 'shRZ', 'elR', 'swordX', 'swordY', 'swordZ'] as const;

/** 右臂两个姿势之间插值 */
function armLerp(a: Pose, b: Pose, t: number): Pose {
  const out: Pose = { handRX: 0.2 };
  for (const k of ARM_KEYS) out[k] = lerp(a[k] ?? 0, b[k] ?? 0, t);
  return out;
}

/** 站立：通用的笨重站姿，右肩扛剑，披风轻摆 */
export function idlePose(t: number): Pose {
  const p = hIdle(t, SVEN_STANCE);
  const br = Math.sin(t * 2);
  return {
    ...p,
    shLX: 0.08, shLZ: 0.26 + br * 0.02, elL: -0.45,
    ...SHOULDER_SWORD,
    capeX: 0.1 + 0.03 * Math.sin(t * 1.7),
  };
}

/** 跑步：左臂摆动，右臂扛剑随步子起伏，披风向后飘 */
export function runPose(ph: number): Pose {
  const p = hRun(ph, { ...SVEN_STANCE, weaponHand: 'R' });
  const s = Math.sin(ph);
  return {
    ...p,
    ...SHOULDER_SWORD,
    shRX: SHOULDER_SWORD.shRX - 0.06 * s,
    capeX: 0.55 + 0.08 * Math.sin(ph * 2),
  };
}

/**
 * 普攻：p = 前摇进度 0..1。0–0.6 把剑从肩上举到右肩后上方（身体右转蓄力），0.6–1 斜向左下大幅横扫（身体左转），1 = 命中。
 */
export function attackPose(p: number): Pose {
  const raise = smooth01(p / 0.6);
  const f = Math.max(0, (p - 0.6) / 0.4);
  // 横扫越来越快：0.6–0.8 扫到右前方，0.8–1 扫到左前下方
  const k = f * f;
  const arm = p < 0.6 ? armLerp(SHOULDER_SWORD, SWING_WIND, raise) : k < 0.35 ? armLerp(SWING_WIND, SWING_MID, k / 0.35) : armLerp(SWING_MID, SWING_HIT, (k - 0.35) / 0.65);
  const wind = p < 0.6;
  return {
    bodyY: -4 - 3 * k,
    torsoX: wind ? lerp(0.12, -0.1, raise) : lerp(-0.1, 0.34, k),
    torsoY: wind ? lerp(0, -0.6, raise) : lerp(-0.6, 0.6, k),
    headX: -0.05, headY: wind ? lerp(0, 0.4, raise) : lerp(0.4, -0.35, k),
    ...arm,
    // 左手：蓄力时收到胸前，横扫时向左后方甩开保持平衡
    shLX: wind ? lerp(0.08, -1.2, raise) : lerp(-1.2, -0.3, k), shLZ: wind ? lerp(0.26, 0.1, raise) : lerp(0.1, 0.95, k),
    elL: wind ? lerp(-0.45, -1.6, raise) : lerp(-1.6, -0.5, k),
    hipL: -0.35, kneeL: 0.42, hipR: 0.3, kneeR: 0.45, hipLZ: 0.18, hipRZ: -0.18,
    capeX: 0.15 + 0.25 * k,
  };
}

/** 技能前摇：p = 进度 0..1 */
export function castPose(id: string, p: number): Pose | null {
  const e = smooth01(p);
  switch (id) {
    case 'sven_storm_hammer':
      // 左手过肩：向后举起准备投掷
      return {
        ...idlePose(0),
        bodyY: -3 * e, torsoX: lerp(0.08, -0.15, e), torsoY: lerp(0, 0.35, e), headX: -0.05,
        shLX: lerp(0.08, -2.75, e), shLZ: lerp(0.26, 0.35, e), elL: lerp(-0.45, -1.35, e),
        hipL: -0.3 * e, kneeL: 0.25 + 0.2 * e, hipR: 0.3 * e, kneeR: 0.3,
      };
    case 'sven_warcry':
      // 即时技能，对局里没有前摇；选人预览里的短暂蓄力：低头吸气
      return { ...idlePose(0), bodyY: -3 * e, torsoX: 0.08 + 0.12 * e, headX: 0.2 * e, elL: -0.45 - 0.5 * e };
    case 'sven_gods_strength':
      // 半蹲蓄力：弓身、双拳收在胸前
      return {
        bodyY: -11 * e, torsoX: lerp(0.08, 0.5, e), headX: lerp(-0.05, 0.25, e),
        shLX: lerp(0.08, -0.9, e), shLZ: 0.35, elL: lerp(-0.45, -2.1, e),
        ...SHOULDER_SWORD, shRX: lerp(-0.48, -0.44, e), shRY: lerp(0.37, 0.52, e), shRZ: lerp(-0.01, 0.17, e), elR: lerp(-1.68, -1.58, e), swordX: lerp(-0.64, -0.74, e),
        hipL: -0.6 * e, kneeL: 0.2 + 0.9 * e, hipR: -0.5 * e, kneeR: 0.2 + 0.85 * e, hipLZ: 0.2, hipRZ: -0.2,
        capeX: 0.1 + 0.15 * e,
      };
    default:
      return null;
  }
}

/** 战吼的上半身动作（w = 动作权重 0..1）：右手把剑竖直举起，左拳张开，仰头怒吼 */
function warcryUpper(w: number): Pose {
  return {
    torsoX: lerp(0.08, -0.3, w), headX: lerp(-0.05, -0.6, w),
    ...armLerp(SHOULDER_SWORD, SWORD_UP, w),
    shLX: lerp(0.08, -0.55, w), shLZ: lerp(0.26, 1.1, w), elL: lerp(-0.45, -1.2, w),
  };
}
const UPPER_KEYS = ['torsoX', 'torsoY', 'headX', 'headY', 'shRX', 'shRY', 'shRZ', 'elR', 'handRX', 'swordX', 'swordY', 'swordZ', 'shLX', 'shLZ', 'elL'];

/** 技能释放后的动作：k = 进度 0..1 */
export function releasePose(kind: string, k: number): Pose | null {
  switch (kind) {
    case 'sven_storm_hammer': {
      // 左臂向前甩出，身体前压，然后收回
      const f = smooth01(k / 0.3);
      const back = smooth01((k - 0.45) / 0.55);
      return {
        ...idlePose(0),
        bodyY: -4 * (1 - back), torsoX: lerp(-0.15, 0.32, f) * (1 - back) + 0.08 * back, torsoY: lerp(0.35, -0.3, f) * (1 - back),
        shLX: lerp(-2.75, -1.25, f) * (1 - back) + 0.08 * back, shLZ: 0.2 + 0.06 * back, elL: lerp(-1.35, -0.1, f) * (1 - back) - 0.45 * back,
        hipL: -0.4 * (1 - back), kneeL: 0.4, hipR: 0.35 * (1 - back), kneeR: 0.35,
      };
    }
    case 'sven_warcry': {
      const w = smooth01(k * 4) * (1 - smooth01((k - 0.7) / 0.3));
      return { ...idlePose(0), ...warcryUpper(w), bodyY: -2 + 2 * w };
    }
    case 'sven_gods_strength': {
      // 起身张开双臂仰天咆哮，保持一会儿再收
      const up = smooth01(k / 0.22);
      const w = up * (1 - smooth01((k - 0.75) / 0.25));
      return {
        bodyY: lerp(-11, 3, up) * (1 - smooth01((k - 0.75) / 0.25)), torsoX: lerp(0.5, -0.42, up) * (k < 0.75 ? 1 : 1 - smooth01((k - 0.75) / 0.25)),
        headX: lerp(0.25, -0.7, w),
        shLX: lerp(-0.9, -0.55, up), shLZ: lerp(0.35, 1.95, w), elL: lerp(-2.1, -0.4, up),
        ...armLerp({ ...SHOULDER_SWORD, shRY: 0.52, shRZ: 0.17, elR: -1.58, swordX: -0.74 }, SWORD_SPREAD, w),
        hipL: -0.3 * (1 - up), kneeL: 0.2 + 0.4 * (1 - up), hipR: -0.25 * (1 - up), kneeR: 0.2 + 0.4 * (1 - up),
        hipLZ: 0.12 + 0.12 * w, hipRZ: -0.12 - 0.12 * w,
        capeX: 0.2 + 0.25 * w,
      };
    }
    default:
      return null;
  }
}

const OWN: OwnPoses = {
  attack: attackPose,
  cast: castPose,
  release: releasePose,
};

/**
 * 按动画状态选姿势。站立和跑用斯温自己的（扛剑）；其余用 dispatchPose（眩晕、死亡、引导走通用姿势）。
 * 战吼是即时技能，不打断普攻和移动：只叠加上半身的怒吼，下半身照常跑 / 出剑。
 */
export function svenPose(tr: AnimTracker, t: number): Pose {
  if (tr.state === 'idle') return addTaunt(idlePose(t), tr, t);
  if (tr.state === 'run') return addTaunt(runPose(tr.runPhase), tr, t);
  if (tr.state === 'release' && tr.release?.kind === 'sven_warcry') {
    const k = tr.releaseK;
    const w = smooth01(k * 4) * (1 - smooth01((k - 0.7) / 0.3));
    const base = tr.swing >= 0 ? attackPose(tr.swing) : tr.speed > RUN_SPEED ? runPose(tr.runPhase) : idlePose(t);
    // 普攻前摇中：只抬头怒吼、左拳张开，右臂继续出剑（出手时刻和 sim 一致）
    const upper = warcryUpper(1);
    const keys = tr.swing >= 0 ? ['headX', 'shLX', 'shLZ', 'elL'] : UPPER_KEYS;
    const out: Pose = { ...base };
    for (const key of keys) out[key] = lerp(base[key] ?? 0, upper[key] ?? 0, w);
    return addTaunt(out, tr, t);
  }
  return dispatchPose(tr, t, SVEN_STANCE, OWN);
}

const addTaunt = (p: Pose, tr: AnimTracker, t: number): Pose => (tr.taunted ? addTauntShake(p, t) : p);

export const SVEN_RELEASE_DUR: Record<string, number> = { sven_storm_hammer: 0.35, sven_warcry: 0.6, sven_gods_strength: 0.8 };

export const SVEN_SPEC: HeroModelSpec = {
  id: 'sven',
  scale: SVEN_SCALE,
  headHeight: 182,
  muzzleHeight: 150,
  bones: BONES,
  parts,
  bindRotations: { sword: [Math.PI / 2, 0, 0] },
  pose: (tr, t, _u: Unit | null) => svenPose(tr, t),
  releaseDur: SVEN_RELEASE_DUR,
  previewMoves: ['sven_storm_hammer', 'sven_warcry', 'sven_gods_strength'],
};

registerHeroModel(SVEN_SPEC);
