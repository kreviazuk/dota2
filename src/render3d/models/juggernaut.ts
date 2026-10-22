import { Group, Mesh, SphereGeometry, type BufferGeometry, type Material, type Object3D } from 'three';
import { GeoBuilder } from '../geo';
import { makeGlow, makeToon, teamColor, teamDark } from '../materials';
import { type AnimTracker, type Pose, smooth01 } from '../anim';
import type { Unit } from '../../sim/entities/unit';
import type { HeroModelSpec, PartDef } from './heroModel';
import { addTauntShake, dispatchPose, humanoidBones, idlePose as hIdle, runPose as hRun, type OwnPoses, type Proportions, type Stance } from './humanoid';
import { registerHeroModel, registerSummonModel } from './registry';
import { cachedGeo } from './rig';

/**
 * 主宰：戴着高大橙色木制部落面具的剑士。面具（黑白条纹彩绘、眼缝透出淡淡的光）占据整个头部轮廓，后面一蓬草黄色的乱发；
 * 赤裸的棕褐色上身缠着白布，橙色腰带上系着阵营色的结，红橙色宽松长裤外是一圈草编短裙（skirt 骨骼随动作摆动）；
 * 右手一把细长的武士刀（红色缠柄）。阵营色只用在腰带的结 / 饰带和护腕上。
 * 骨骼 = humanoidBones + sword（挂右手）+ skirt（挂骨盆）。刀刃沿本地 +Y，绑定时绕 X 转 90°：手臂自然下垂时刀尖朝前。
 * 模型面朝本地 +Z，本地 +X 是角色的左手边。
 */
const MASK = 0xd9772b;
const MASK_LIGHT = 0xf3a052;
const MASK_DARK = 0x9a4c18;
const PAINT_BLACK = 0x17100c;
const PAINT_WHITE = 0xf6f0e2;
const EYE = 0xffe9a8;
const HAIR = 0xc9a24a;
const HAIR_LIGHT = 0xe2c46a;
const HAIR_DARK = 0x8f7230;
const SKIN = 0xb27546;
const SKIN_LIGHT = 0xc68a58;
const SKIN_DARK = 0x86542e;
const CLOTH = 0xf0eadc;
const CLOTH_SHADE = 0xc9bfa8;
const BELT = 0xe8801e;
const BELT_DARK = 0xb05a10;
const PANTS = 0xc7472a;
const PANTS_DARK = 0x8a2a18;
const STRAW = 0xd9b65a;
const STRAW_DARK = 0xa4842f;
const BLADE = 0xe8eef4;
const BLADE_EDGE = 0xffffff;
const BLADE_DARK = 0x7d8894;
const GRIP = 0xb81e18;
const GRIP_DARK = 0x5a0c0a;
const TSUBA = 0xc89a3a;

export const JUGG_SCALE = 1.25;

const PROPS: Partial<Proportions> = {
  hipY: 58, waist: 9, torsoLen: 42, neck: 8, headZ: 1, shoulderX: 19, shoulderY: 36, upperArm: 26, forearm: 24,
  thighX: 8.5, thighY: -5, thigh: 27, shin: 26,
};

export const JUGG_STANCE: Stance = { weaponHand: 'R', hunch: 0.1, armSpread: 0.2, heavy: 0.2 };

/** 武士刀刃长（握点到刀尖） */
export const KATANA_LEN = 90;

function torsoGeo(): BufferGeometry {
  const b = new GeoBuilder(1401);
  // 精瘦的赤裸上身：收窄的腹部 + 倒三角的胸膛，胸肌和肩头
  b.cyl(8.6, 8, 14, 10, SKIN, { p: [0, 5, 0], s: [1, 1, 0.74], top: SKIN_LIGHT });
  b.cyl(12.6, 9.2, 22, 10, SKIN, { p: [0, 20, 0], s: [1, 1, 0.7], top: SKIN_LIGHT });
  for (const s of [1, -1]) {
    b.sphere(6, 8, 6, SKIN_LIGHT, { p: [s * 5.2, 25, 5.6], s: [1, 0.75, 0.5] });
    b.sphere(6.4, 8, 6, SKIN, { p: [s * 15.5, 33, 0], s: [1, 0.9, 1], top: SKIN_LIGHT });
  }
  // 腹肌的阴影
  for (let i = 0; i < 3; i++) b.box(7, 0.8, 1, SKIN_DARK, { p: [0, 4 + i * 4.5, 6.4], jitter: 0 });
  // 白布：从左肩斜挎到右腰（前后两片），腰间缠几圈
  b.box(5.5, 38, 1.4, CLOTH, { p: [0.5, 19, 8.2], r: [0.06, 0, 0.62], top: CLOTH_SHADE });
  b.box(5.5, 38, 1.4, CLOTH, { p: [0.5, 19, -8.3], r: [-0.06, 0, -0.62], top: CLOTH_SHADE });
  b.cyl(9.4, 9.2, 5, 10, CLOTH, { p: [0, 1, 0], s: [1, 1, 0.78], top: CLOTH_SHADE });
  // 脖子根
  b.cyl(5.6, 7.4, 6, 10, SKIN, { p: [0, 40, 0] });
  return b.build();
}

function pelvisGeo(team: number): BufferGeometry {
  const b = new GeoBuilder(1411 + team);
  // 橙色宽腰带，正面系一个阵营色的结和两条垂下的饰带
  b.cyl(10.4, 10.8, 6, 10, BELT, { p: [0, 3, 0], s: [1, 1, 0.8], top: BELT_DARK });
  b.octa(3.4, teamColor(team), { p: [-4, 3, 8.8], s: [1.2, 1, 0.7], jitter: 0 });
  b.box(3.2, 16, 1.2, teamColor(team), { p: [-2.5, -6, 9.2], r: [0.06, 0, 0.12], top: teamDark(team) });
  b.box(3.2, 13, 1.2, teamColor(team), { p: [-6.5, -4.5, 8.8], r: [0.06, 0, -0.18], top: teamDark(team) });
  // 宽松长裤的臀部
  b.cyl(10.8, 11, 11, 10, PANTS, { p: [0, -4, 0], s: [1, 1, 0.82], top: PANTS_DARK });
  return b.build();
}

/** 草编短裙：一圈向外张开的草束（skirt 骨骼，挂在骨盆下） */
function skirtGeo(): BufferGeometry {
  const b = new GeoBuilder(1421);
  b.torus(10.6, 1.6, 4, 16, STRAW_DARK, { p: [0, 0, 0], r: [Math.PI / 2, 0, 0], s: [1.04, 0.84, 1] });
  const n = 18;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const front = Math.cos(a) > 0.6;
    const len = front ? 13 : 19 + (i % 3) * 2;
    const r = 10.8;
    b.box(4.2, len, 1.1, i % 2 ? STRAW : STRAW_DARK, {
      p: [Math.sin(a) * r * 1.05, -len / 2 + 0.5, Math.cos(a) * r * 0.86], r: [Math.cos(a) * 0.32, a, -Math.sin(a) * 0.32], top: i % 2 ? STRAW_DARK : STRAW,
    });
  }
  return b.build();
}

/** 球面上一条经线方向的彩绘条纹（从头顶往下 thetaLen） */
function stripe(b: GeoBuilder, r: number, s: [number, number, number], p: [number, number, number], az: number, w: number, thetaLen: number, color: number): void {
  // three 的球面 phi = 0 在 −X 方向；切片中心转到方位角 az（0 = 正前方 +Z，正值偏向 +X）
  b.sphere(r, 2, 8, color, { p, s, r: [0, az + Math.PI / 2 - w / 2, 0], jitter: 0 }, w, thetaLen);
}

function headGeo(): BufferGeometry {
  const b = new GeoBuilder(1431);
  // 脖子
  b.cyl(4.4, 5, 9, 8, SKIN, { p: [0, 2, 0] });
  // 面具后面一蓬草黄色的乱发：从脑后向下、向两侧披散到肩上（俯视时只在面具后沿露出一圈，不盖过面具）
  const tufts: [number, number, number, number, number][] = [
    // [方位角（0 = 正后方）, 仰角（负 = 向下）, 长度, 半径, 根部高度]
    [0, -0.55, 20, 6.5, 12], [0.45, -0.6, 18, 6, 12], [-0.45, -0.6, 18, 6, 12], [0.9, -0.7, 15, 5, 11], [-0.9, -0.7, 15, 5, 11],
    [0.22, -0.25, 16, 5.5, 22], [-0.22, -0.25, 16, 5.5, 22], [0.7, -0.35, 13, 4.5, 21], [-0.7, -0.35, 13, 4.5, 21],
  ];
  for (const [az, el, len, r, h] of tufts) {
    const dx = Math.sin(az) * Math.cos(el);
    const dz = -Math.cos(az) * Math.cos(el);
    const dy = Math.sin(el);
    const base = 14;
    // 圆锥沿 +Y：先绕 Z 倒向 +X、抬起仰角 el，再绕 Y 转到方位角 az（Euler XYZ：先 Z 后 Y）
    b.cone(r, len, 5, HAIR, {
      p: [Math.sin(az) * base + dx * len * 0.5, h + dy * len * 0.5, -Math.cos(az) * base + dz * len * 0.5],
      r: [0, Math.PI / 2 - az, -(Math.PI / 2 - el)], top: HAIR_LIGHT, jitter: 0.12,
    });
  }
  b.sphere(12, 10, 7, HAIR_DARK, { p: [0, 10, -7], s: [1.15, 1, 0.9], top: HAIR });
  // 高大的木制部落面具：一整个橙色的穹顶罩住头部（俯视时占满头部轮廓），正面一块高高的面板
  const DOME_S: [number, number, number] = [1.28, 1.52, 1.28];
  const DOME_P: [number, number, number] = [0, 15, 1.5];
  b.sphere(14, 14, 10, MASK, { p: DOME_P, s: DOME_S, top: MASK_LIGHT, jitter: 0.04 });
  // 头顶的黑白条纹（俯视最显眼）：正中一道黑、两侧各一道白、再外一道黑，从额头翻过头顶到脑后
  for (const az of [0, Math.PI]) stripe(b, 14.25, DOME_S, DOME_P, az, 0.3, Math.PI * 0.55, PAINT_BLACK);
  for (const az of [0.5, -0.5, Math.PI + 0.5, Math.PI - 0.5]) stripe(b, 14.2, DOME_S, DOME_P, az, 0.2, Math.PI * 0.5, PAINT_WHITE);
  for (const az of [1.0, -1.0, Math.PI + 1.0, Math.PI - 1.0]) stripe(b, 14.18, DOME_S, DOME_P, az, 0.16, Math.PI * 0.42, PAINT_BLACK);
  // 头顶一道木脊（侧面剪影更高）
  b.box(4, 5, 26, MASK_DARK, { p: [0, 36, 0], r: [0.05, 0, 0], top: MASK, jitter: 0 });
  // 正面的高面板（盾形，顶部向后仰贴着穹顶），彩绘：额头黑横带、中间白竖带、两侧黑竖带
  const PY = 2, PZ = 19, TILT = -0.22;
  /** 面板上 (x, ly) 处、离板面 dz 的点（跟着面板一起后仰） */
  const onPlate = (x: number, ly: number, dz: number): [number, number, number] =>
    [x, PY + ly * Math.cos(TILT) - dz * Math.sin(TILT), PZ + ly * Math.sin(TILT) + dz * Math.cos(TILT)];
  const plate: [number, number][] = [[-12, -9], [12, -9], [15, 5], [14.5, 19], [9, 28], [0, 32], [-9, 28], [-14.5, 19], [-15, 5]];
  b.extrude(plate, 4, MASK, { p: [0, PY, PZ], r: [TILT, 0, 0], top: MASK_LIGHT, jitter: 0.04 });
  const paint = (w: number, h: number, x: number, ly: number, color: number, o: { rz?: number; glow?: number } = {}) =>
    b.box(w, h, 1, color, { p: onPlate(x, ly, 2.3), r: [TILT, 0, o.rz ?? 0], jitter: 0, glow: o.glow });
  paint(3.6, 34, 0, 12, PAINT_WHITE);
  for (const sx of [1, -1]) paint(2.6, 26, sx * 9, 9, PAINT_BLACK);
  paint(27, 5.5, 0, 16, PAINT_BLACK);
  // 眼缝透出淡淡的光
  for (const sx of [1, -1]) paint(6.6, 2.1, sx * 5.4, 16.2, EYE, { rz: sx * -0.12, glow: 1.6 });
  // 嘴部：黑色的格栅和一排白色竖纹
  paint(12, 6, 0, 0.5, PAINT_BLACK);
  for (let i = -2; i <= 2; i++) b.box(1, 5, 1.2, PAINT_WHITE, { p: onPlate(i * 2.4, 0.5, 2.9), r: [TILT, 0, 0], jitter: 0 });
  // 面具两侧的耳状护片
  for (const s of [1, -1]) b.box(4, 15, 10, MASK_DARK, { p: [s * 17.6, 12, 2], r: [0, 0, s * 0.1], top: MASK });
  return b.build();
}

/** 上臂：赤裸的手臂 */
function upperArmGeo(): BufferGeometry {
  const b = new GeoBuilder(1441);
  b.sphere(5.6, 8, 5, SKIN, { p: [0, -0.5, 0], s: [1.05, 0.9, 1.05], top: SKIN_LIGHT });
  b.cyl(4.7, 4, 25, 8, SKIN, { p: [0, -12, 0], top: SKIN_LIGHT });
  b.cyl(5, 5, 3, 8, CLOTH, { p: [0, -6, 0] });
  return b.build();
}

/** 小臂：缠白布 + 阵营色护腕 */
function forearmGeo(team: number): BufferGeometry {
  const b = new GeoBuilder(1451 + team);
  b.cyl(4, 3.4, 23, 8, SKIN, { p: [0, -11, 0] });
  b.cyl(4.4, 4.1, 8, 8, CLOTH, { p: [0, -8, 0], top: CLOTH_SHADE });
  b.cyl(4.6, 4.3, 8, 8, teamColor(team), { p: [0, -18, 0], top: teamDark(team) });
  return b.build();
}

function handGeo(): BufferGeometry {
  const b = new GeoBuilder(1461);
  b.box(5.4, 7, 4.6, SKIN, { p: [0, -3.4, 0.4], jitter: 0.05 });
  b.box(2.2, 4.4, 2.2, SKIN_DARK, { p: [3, -2.6, 2.4], r: [0, 0, 0.35] });
  return b.build();
}

/** 大腿：宽松的红橙色长裤 */
function thighGeo(): BufferGeometry {
  const b = new GeoBuilder(1471);
  b.cyl(7.6, 6.6, 28, 8, PANTS, { p: [0, -13.5, 0], top: PANTS_DARK });
  return b.build();
}

/** 小腿：裤腿收在白布绑腿里，赤足（脚底在 −26 = 地面） */
function shinGeo(): BufferGeometry {
  const b = new GeoBuilder(1481);
  b.cyl(6.6, 5.6, 16, 8, PANTS, { p: [0, -7, 0] });
  b.cyl(5, 4.2, 9, 8, CLOTH, { p: [0, -18.5, 0], top: CLOTH_SHADE });
  b.box(6, 3.6, 11, SKIN, { p: [0, -24.2, 2.6], top: SKIN_LIGHT });
  b.box(6.2, 1, 11.4, CLOTH_SHADE, { p: [0, -25.6, 2.6], jitter: 0 });
  return b.build();
}

/**
 * 武士刀：握点在原点，刃沿本地 +Y，刀身略向 +X 弯（刀背在 −X），刀面在 XY 平面。红色缠柄（菱形缠绳）、金色圆镡。
 */
function katanaGeo(): BufferGeometry {
  const b = new GeoBuilder(1491);
  b.cyl(1.7, 1.7, 18, 6, GRIP, { p: [0, 0, 0] });
  for (let i = 0; i < 4; i++) b.octa(1.6, GRIP_DARK, { p: [0, -6 + i * 4, 0], s: [1.2, 1.4, 1.2], jitter: 0 });
  b.cyl(1.9, 1.9, 2, 6, TSUBA, { p: [0, -9.6, 0] });
  b.cyl(4.6, 4.6, 1.4, 10, TSUBA, { p: [0, 9.8, 0], top: 0xe8c060 });
  b.cyl(1.9, 2.1, 2.4, 6, TSUBA, { p: [0, 11.6, 0] });
  const L = KATANA_LEN;
  const y0 = 12.5;
  const n = 8;
  const back: [number, number][] = [];
  const edge: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    const y = y0 + (L - 6 - y0) * k;
    const cx = 5 * k * k;
    const w = 1.5;
    back.push([cx - w, y]);
    edge.push([cx + w * 0.9, y]);
  }
  const tip: [number, number] = [5 + 0.6, L];
  b.extrude([...back, tip, ...edge.slice().reverse()], 1.2, BLADE, { jitter: 0.03 });
  // 刃口的亮边
  b.extrude([...edge.map(([x, y]) => [x - 0.7, y] as [number, number]), tip, ...edge.slice().reverse().map(([x, y]) => [x + 0.4, y] as [number, number])], 0.9, BLADE_EDGE, { jitter: 0.02 });
  // 刀背一道深色的线（浅色地面上勾出轮廓）
  for (let i = 0; i < n; i++) {
    const [x0, ya] = back[i];
    const [x1, yb] = back[i + 1];
    const len = Math.hypot(x1 - x0, yb - ya);
    b.box(0.8, len + 0.4, 1.6, BLADE_DARK, { p: [(x0 + x1) / 2, (ya + yb) / 2, 0], r: [0, 0, -Math.atan2(x1 - x0, yb - ya)], jitter: 0 });
  }
  return b.build();
}

const BONES = humanoidBones(PROPS, [
  ['sword', 'handR', [0, -5.5, 1]],
  ['skirt', 'pelvis', [0, -2, 0]],
]);

export const JUGG_BONES = BONES;

function parts(team: number): PartDef[] {
  return [
    ['pelvis', () => pelvisGeo(team)],
    ['skirt', skirtGeo],
    ['torso', torsoGeo],
    ['head', headGeo],
    ['shL', upperArmGeo],
    ['shR', upperArmGeo],
    ['elL', () => forearmGeo(team)],
    ['elR', () => forearmGeo(team)],
    ['handL', handGeo],
    ['handR', handGeo],
    ['thighL', thighGeo],
    ['thighR', thighGeo],
    ['shinL', shinGeo],
    ['shinR', shinGeo],
    ['sword', katanaGeo],
  ];
}

export const JUGG_BIND: Record<string, [number, number, number]> = { sword: [Math.PI / 2, 0, 0] };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function blend(a: Pose, b: Pose, k: number): Pose {
  const out: Pose = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) out[key] = lerp(a[key] ?? 0, b[key] ?? 0, k);
  return out;
}

/** 草裙：lift = 向外飘起的程度（0 站立 … 1 奔跑 / 旋转），带一点摆动 */
function skirtPose(t: number, lift: number): Pose {
  return { skirtX: 0.04 + 0.12 * lift * Math.sin(t * 9), skirtZ: 0.05 * Math.sin(t * 1.5) + 0.1 * lift * Math.sin(t * 7 + 1) };
}

// ---------- 右臂和刀的关键帧（角度用数值求解：手的位置 + 刀身方向） ----------
/** 站立：右手垂在身侧略向前，刀尖指向右前下方 */
const HOLD_R: Pose = { shRX: 0.55, shRY: -0.18, shRZ: -0.03, elR: -1.47, handRX: 0, swordX: 1.41, swordY: 0, swordZ: 0.12 };
/** 奔跑：刀拖在身后右下方 */
const RUN_R: Pose = { shRX: 1.19, shRY: -0.18, shRZ: 0.02, elR: -1.66, handRX: 0, swordX: 1.74, swordY: 1.34, swordZ: 1.45 };
/** 居合收刀：右手收到左腰，刀身向后下方（像插在鞘里） */
const IAI_WIND: Pose = { shRX: 0.14, shRY: 1.2, shRZ: -0.33, elR: -1.32, handRX: 0, swordX: 1.41, swordY: -0.08, swordZ: -1.52 };
/** 居合斩出（命中瞬间）：右臂向右上方伸出，刀尖指向右上前方 */
const IAI_HIT: Pose = { shRX: -1.28, shRY: -0.2, shRZ: -0.77, elR: -1.26, handRX: 0, swordX: 1.8, swordY: 0, swordZ: 0.06 };
/** 剑刃风暴：双臂平伸，刀横持向外 */
const FURY_R: Pose = { shRX: 0.39, shRY: -0.23, shRZ: -1.6, elR: -0.53, handRX: 0, swordX: 1.8, swordY: 0, swordZ: -0.01 };
const FURY_L: Pose = { shLX: 0.39, shLY: 0.23, shLZ: 1.6, elL: -0.53, handLX: 0 };
/** 无敌斩冲刺：刀向正前方刺出 */
const THRUST_R: Pose = { shRX: -0.65, shRY: -0.06, shRZ: 0.28, elR: -1.33, handRX: 0, swordX: 1.8, swordY: 0.1, swordZ: 0.12 };
/** 无敌斩前摇：刀收在右腰后，刀尖朝前 */
const COCK_R: Pose = { shRX: 1.3, shRY: -0.47, shRZ: -0.03, elR: -2.13, handRX: 0, swordX: 0.59, swordY: 0, swordZ: -0.07 };

const SWORD = ['swordX', 'swordY', 'swordZ'];
const pick = (p: Pose, keys: string[]): Pose => Object.fromEntries(keys.map((k) => [k, p[k] ?? 0]));

/** 站立：略弓身、重心放低的剑士站姿，右手持刀斜指右前下方，左手放松 */
export function idlePose(t: number): Pose {
  const p = hIdle(t, JUGG_STANCE);
  const br = Math.sin(t * 2.1);
  return {
    ...p,
    ...HOLD_R, shRX: (HOLD_R.shRX ?? 0) + br * 0.02,
    shLX: 0.15, shLZ: 0.28, elL: -0.55,
    hipL: -0.22, kneeL: 0.32, hipR: 0.14, kneeR: 0.26, hipLZ: 0.14, hipRZ: -0.14,
    ...skirtPose(t, 0),
  };
}

/** 跑步：前倾的快跑，刀拖在身后，左手摆动 */
export function runPose(ph: number, t: number): Pose {
  const p = hRun(ph, { ...JUGG_STANCE, weaponHand: 'none' });
  const s = Math.sin(ph);
  return {
    ...p,
    torsoX: (p.torsoX ?? 0) + 0.1,
    ...RUN_R, shRX: (RUN_R.shRX ?? 0) + 0.1 * s,
    ...skirtPose(t, 1),
  };
}

/**
 * 普攻（居合式斜斩）：p = 前摇进度 0..1。0–0.4 右手收到左腰、身体左拧下蹲；0.4–1 向右上方斩出（越来越快），1 = 命中（sim 出手的时刻）。
 */
export function attackPose(p: number): Pose {
  const e = smooth01(p / 0.4);
  const f = Math.max(0, Math.min(1, (p - 0.4) / 0.6));
  const k = f * f * (3 - 2 * f) * 0.4 + f * f * 0.6;
  const arm = p < 0.4 ? blend(HOLD_R, IAI_WIND, e) : blend(IAI_WIND, IAI_HIT, k);
  return {
    bodyY: -5 * e + 3 * k, bodyZ: 6 * k,
    torsoX: lerp(0.14, 0.32, e) - 0.25 * k, torsoY: lerp(0, 0.5, e) - 0.95 * k, headY: -0.35 * e + 0.6 * k,
    ...arm,
    shLX: lerp(0.15, -0.2, e) + 0.55 * k, shLZ: lerp(0.28, 0.15, e) + 0.35 * k, elL: lerp(-0.55, -1.3, e) + 0.7 * k,
    hipL: lerp(-0.22, -0.55, e) + 0.3 * k, kneeL: lerp(0.32, 0.6, e) - 0.2 * k, hipR: lerp(0.14, 0.3, e) - 0.55 * k, kneeR: lerp(0.26, 0.45, e) + 0.1 * k,
    hipLZ: 0.16, hipRZ: -0.16,
    ...skirtPose(p * 3, 0.3 + 0.5 * k),
  };
}

/** 剑刃风暴：双臂平伸、刀横持；腿在跑就跑、不跑就稳稳扎开（旋转本身由 spin 给出） */
export function furyPose(t: number, moving: boolean, ph: number): Pose {
  const legs = moving ? pick(hRun(ph, JUGG_STANCE), ['bodyY', 'hipL', 'kneeL', 'hipR', 'kneeR', 'hipLZ', 'hipRZ'])
    : { bodyY: -6 + Math.sin(t * 14) * 0.8, hipL: -0.3, kneeL: 0.5, hipR: -0.3, kneeR: 0.5, hipLZ: 0.32, hipRZ: -0.32 };
  return {
    ...legs,
    torsoX: 0.12, headX: 0.05,
    ...FURY_R, ...FURY_L,
    ...skirtPose(t * 2, 1), skirtX: 0.3, skirtZ: 0.04 * Math.sin(t * 20),
  };
}

/** 无敌斩：刀前伸的冲刺姿态（身体前倾、弓步），带一点抖动 */
export function omnislashPose(t: number): Pose {
  const j = Math.sin(t * 23) * 0.04;
  return {
    bodyY: -8, bodyZ: 6,
    torsoX: 0.5 + j, torsoY: 0.15, headX: -0.35, headY: -0.1,
    ...THRUST_R,
    shLX: 0.9, shLZ: 0.45, elL: -0.4,
    hipL: 0.45, kneeL: 0.35, hipR: -1.0, kneeR: 0.9, hipLZ: 0.12, hipRZ: -0.12,
    ...skirtPose(t, 1), skirtX: -0.25,
  };
}

/** 治疗守卫的半蹲：左手向前下方放下守卫 */
const WARD_POSE = (rest: Pose): Pose => ({
  ...rest,
  bodyY: -14, torsoX: 0.55, headX: -0.25,
  shLX: -0.95, shLZ: 0.12, elL: -0.35, handLX: -0.2,
  hipL: -0.85, kneeL: 1.25, hipR: -0.2, kneeR: 1.0,
});

/** 技能前摇：p = 进度 0..1 */
export function castPose(id: string, p: number): Pose | null {
  const e = smooth01(p);
  const rest = idlePose(0);
  switch (id) {
    case 'jugg_healing_ward':
      return blend(rest, WARD_POSE(rest), e);
    case 'jugg_omnislash':
      // 收刀在右腰后、压低身体准备冲刺
      return blend(rest, { ...rest, ...COCK_R, bodyY: -9, torsoX: 0.45, torsoY: 0.3, headX: -0.3, hipL: -0.75, kneeL: 1.0, hipR: -0.1, kneeR: 0.8, shLX: -0.6, shLZ: 0.3, elL: -0.6 }, e);
    case 'jugg_blade_fury':
      return blend(rest, furyPose(0, false, 0), e);
    default:
      return null;
  }
}

/** 释放：k = 进度 0..1 */
export function releasePose(kind: string, k: number, t = 0): Pose | null {
  const rest = idlePose(t);
  switch (kind) {
    case 'jugg_healing_ward': {
      // 放下守卫后保持一下再站起
      const back = smooth01((k - 0.45) / 0.55);
      return blend(WARD_POSE(rest), rest, back);
    }
    case 'jugg_omnislash': {
      // 向前冲出、刀前刺（之后由无敌斩 Modifier 的姿势接管）
      const out = smooth01(k / 0.4);
      const cock = { ...rest, ...COCK_R, bodyY: -9, torsoX: 0.45, torsoY: 0.3, headX: -0.3, hipL: -0.75, kneeL: 1.0, hipR: -0.1, kneeR: 0.8 };
      return blend(cock, omnislashPose(t), out);
    }
    case 'jugg_blade_fury':
      return furyPose(t, false, 0);
    default:
      return null;
  }
}

const hasMod = (u: Unit | null, id: string): boolean => !!u?.modifiers.some((m) => m.def.id === id);

/** 按动画状态选姿势：剑刃风暴 / 无敌斩中整体换成专门的姿势；站立 / 跑 / 普攻用主宰自己的，其余用 dispatchPose */
export function juggPose(tr: AnimTracker, t: number, u: Unit | null): Pose {
  if (tr.state !== 'dead' && tr.state !== 'stunned') {
    if (hasMod(u, 'jugg_omnislash')) return omnislashPose(t);
    if (hasMod(u, 'jugg_blade_fury') && tr.state !== 'cast' && !(tr.state === 'release' && tr.release?.kind === 'jugg_healing_ward')) {
      return furyPose(t, tr.state === 'run', tr.runPhase);
    }
  }
  if (tr.state === 'idle') return tr.taunted ? addTauntShake(idlePose(t), t) : idlePose(t);
  if (tr.state === 'run') return tr.taunted ? addTauntShake(runPose(tr.runPhase, t), t) : runPose(tr.runPhase, t);
  const own: OwnPoses = { attack: attackPose, cast: castPose, release: (kind, k) => releasePose(kind, k, t) };
  const p = dispatchPose(tr, t, JUGG_STANCE, own);
  if (p.swordX === undefined) Object.assign(p, pick(HOLD_R, SWORD));
  if (p.skirtX === undefined) Object.assign(p, tr.state === 'dead' ? { skirtX: 0, skirtZ: 0 } : skirtPose(t, 0.2));
  return p;
}

export const JUGG_RELEASE_DUR: Record<string, number> = { jugg_blade_fury: 0.9, jugg_healing_ward: 0.4, jugg_omnislash: 0.3 };

/** 剑刃风暴的转速（弧度 / 秒） */
export const FURY_SPIN = 14;

export const JUGG_SPEC: HeroModelSpec = {
  id: 'juggernaut',
  scale: JUGG_SCALE,
  headHeight: 150,
  muzzleHeight: 100,
  bones: BONES,
  parts,
  bindRotations: JUGG_BIND,
  pose: (tr, t, u) => juggPose(tr, t, u),
  releaseDur: JUGG_RELEASE_DUR,
  previewMoves: ['jugg_blade_fury', 'jugg_healing_ward', 'jugg_omnislash'],
  // 橙色面具和棕褐色皮肤在缺省的奶白色边缘光下发白，换成很弱的暖橙色
  rim: { color: 0xffc080, strength: 0.14 },
  // 剑刃风暴：带着 Modifier 时一直按时间转（对局）；选人预览没有 Modifier，按释放动作转
  spin: (tr, t, u) => {
    if (u) return hasMod(u, 'jugg_blade_fury') && tr.state !== 'dead' ? t * FURY_SPIN : 0;
    return tr.state === 'release' && tr.release?.kind === 'jugg_blade_fury' ? tr.releaseK * JUGG_RELEASE_DUR.jugg_blade_fury * FURY_SPIN : 0;
  },
};

registerHeroModel(JUGG_SPEC);

// ---------- 召唤物：治疗守卫 ----------
const WARD_WOOD = 0x8a5a2a;
const WARD_WOOD_LIGHT = 0xb07a40;
const WARD_WOOD_DARK = 0x5a3818;
const WARD_GREEN = 0x3ad04a;
const WARD_GREEN_DEEP = 0x13801e;

/** 守卫模型的整体放大 */
const WARD_SCALE = 1.35;
/** 守卫头顶高度（血条锚点）：火焰顶端 ≈ 116 × 放大 */
export const WARD_HEIGHT = Math.round(118 * WARD_SCALE);

/** 木制图腾柱：石座、几段叠起的圆柱和雕刻的脸，顶上一个托火焰的碗 */
function wardGeo(): BufferGeometry {
  const b = new GeoBuilder(1501);
  b.cyl(15, 18, 7, 8, 0x6a6258, { p: [0, 3.5, 0], top: 0x8a8278 });
  b.cyl(9, 10.5, 18, 8, WARD_WOOD, { p: [0, 16, 0], top: WARD_WOOD_LIGHT });
  b.cyl(10.5, 9, 4, 8, WARD_WOOD_DARK, { p: [0, 26.5, 0] });
  // 中段雕刻的脸：深色的眼窝、绿色发光的眼睛、獠牙
  b.cyl(9.5, 9.5, 20, 8, WARD_WOOD, { p: [0, 38, 0], top: WARD_WOOD_LIGHT });
  for (const s of [1, -1]) {
    b.box(4.2, 3, 2, WARD_WOOD_DARK, { p: [s * 3.6, 42, 8.6], jitter: 0 });
    b.box(2.4, 1.6, 1.2, WARD_GREEN, { p: [s * 3.6, 42, 9.5], jitter: 0, glow: 1.8 });
    b.cone(1.4, 5, 4, 0xece0c0, { p: [s * 3, 32.5, 8.8], r: [Math.PI, 0, 0] });
  }
  b.box(9, 2.4, 2, WARD_WOOD_DARK, { p: [0, 35, 8.8], jitter: 0 });
  b.cyl(10.5, 9.5, 4, 8, WARD_WOOD_DARK, { p: [0, 50, 0] });
  // 上段：较细的一段 + 两侧翘起的木翼
  b.cyl(8, 9, 14, 8, WARD_WOOD, { p: [0, 59, 0], top: WARD_WOOD_LIGHT });
  for (const s of [1, -1]) b.box(12, 3.6, 4, WARD_WOOD_LIGHT, { p: [s * 11, 62, 0], r: [0, 0, s * 0.45], top: WARD_WOOD });
  // 托火焰的碗
  b.cyl(11, 6, 7, 8, WARD_WOOD_DARK, { p: [0, 69.5, 0], top: WARD_WOOD });
  return b.build();
}

/** 绿色火焰：几层普通混合的饱和绿色锥体（外深内浅）+ 很小的亮芯 */
function flameGroup(): Group {
  const g = new Group();
  g.name = 'flame';
  const layers: [number, number, number, number, boolean][] = [
    // [半径, 高, 颜色, 不透明度, 叠加]
    [14, 42, WARD_GREEN_DEEP, 0.9, false],
    [10.5, 36, WARD_GREEN, 0.95, false],
    [6.5, 25, 0xa8ff9a, 0.95, false],
    [3.6, 14, 0xf0fff0, 0.9, true],
  ];
  for (const [r, h, c, o, add] of layers) {
    const geo = cachedGeo(`jugg_ward_flame:${r}`, () => new GeoBuilder(1511).cone(r, h, 7, 0xffffff, { p: [0, h / 2, 0], jitter: 0 }).sphere(r, 7, 4, 0xffffff, { p: [0, 0, 0], s: [1, 0.6, 1], jitter: 0 }).build());
    const m = new Mesh(geo, flameMat(c, add, o));
    g.add(m);
  }
  return g;
}

let wardMat: Material | null = null;
const flameMats = new Map<string, Material>();
const flameMat = (c: number, add: boolean, o: number): Material => {
  const k = `${c}:${add}:${o}`;
  let m = flameMats.get(k);
  if (!m) flameMats.set(k, (m = makeGlow(c, add, o)));
  return m;
};

registerSummonModel('jugg_healing_ward', {
  height: WARD_HEIGHT,
  build: () => {
    const root = new Group();
    // 内层整体放大（手机上守卫太小看不清）；渲染器淡出时改的是 root 的缩放，不受影响
    const inner = new Group();
    inner.scale.setScalar(WARD_SCALE);
    root.add(inner);
    wardMat ??= makeToon({ rim: 0xd8ffd0, rimStrength: 0.25, key: 'ward' });
    const body = new Mesh(cachedGeo('jugg_ward_totem', wardGeo), wardMat);
    body.castShadow = true;
    inner.add(body);
    const flame = flameGroup();
    flame.position.y = 74;
    inner.add(flame);
    // 火焰底下一圈绿色的光（普通混合的扁球，不洗白）
    const glow = new Mesh(cachedGeo('jugg_ward_glow', () => new SphereGeometry(17, 10, 6)), flameMat(WARD_GREEN, false, 0.35));
    glow.scale.set(1, 0.45, 1);
    glow.position.y = 76;
    glow.name = 'glow';
    inner.add(glow);
    return root;
  },
  // 火焰闪烁跳动（每层不同的相位），整根图腾轻轻浮动
  update: (obj: Object3D, u: Unit, time: number) => {
    const flame = obj.getObjectByName('flame');
    if (flame) {
      flame.children.forEach((c, i) => {
        const ph = time * (9 + i * 2.3) + u.id + i * 1.7;
        c.scale.set(1 + 0.08 * Math.sin(ph * 1.3), 1 + 0.22 * Math.sin(ph) + 0.08 * Math.sin(ph * 2.7), 1 + 0.08 * Math.cos(ph * 1.1));
        c.rotation.y = 0.3 * Math.sin(ph * 0.4);
      });
      flame.position.y = 74 + 1.5 * Math.sin(time * 3 + u.id);
    }
    const glow = obj.getObjectByName('glow');
    if (glow) glow.scale.set(1 + 0.1 * Math.sin(time * 7 + u.id), 0.45, 1 + 0.1 * Math.sin(time * 7 + u.id));
  },
});
