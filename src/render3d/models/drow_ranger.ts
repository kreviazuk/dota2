import { SphereGeometry, type BufferGeometry } from 'three';
import { GeoBuilder } from '../geo';
import { teamColor, teamDark } from '../materials';
import { type AnimTracker, type Pose, smooth01, RUN_SPEED } from '../anim';
import type { Unit } from '../../sim/entities/unit';
import { abilityValue } from '../../sim/systems/abilities';
import type { HeroModelSpec, PartDef } from './heroModel';
import { addTauntShake, dispatchPose, humanoidBones, idlePose as hIdle, runPose as hRun, type OwnPoses, type Proportions, type Stance } from './humanoid';
import { registerHeroModel } from './registry';

/**
 * 卓尔游侠：苗条的游侠。冰蓝色皮肤，深海军蓝的兜帽斗篷（冰蓝镶边、尖尖的帽檐）和遮住下半张脸的围巾，
 * 兜帽后面甩出一条白色长马尾（hairTail1–hairTail2 两节链式骨骼）；皮革束身衣、露出的冰蓝手臂和皮护腕、深色紧身裤和长靴。
 * 左手拿一把银色长弓（弓臂弯曲、弓梢有发光的小冰晶），背后斜挎箭袋（羽毛从右肩后露出来）；斗篷下摆撕成一条条的，内衬是阵营色。
 * 骨骼 = humanoidBones + bow（挂左手，弓臂沿本地 ±Y，弓背朝本地 +Z）+ cape（挂躯干）+ quiver（挂躯干）+ hairTail1/2。
 * 模型面朝本地 +Z，本地 +X 是角色的左手边。
 */
const SKIN = 0xa8c8e0;
const SKIN_DARK = 0x86a8c4;
const SKIN_LIGHT = 0xc4dcee;
const HAIR = 0xf6f9fc;
const HAIR_SHADE = 0xcfd9e4;
const CLOAK = 0x24365a;
const CLOAK_DARK = 0x18243e;
const CLOAK_LIGHT = 0x34507e;
const TRIM = 0x5fb0d8;
const TRIM_LIGHT = 0x8fd0ee;
const LEATHER = 0x5a4434;
const LEATHER_DARK = 0x35281f;
const LEATHER_LIGHT = 0x7a5e48;
const LEGGING = 0x2a3248;
const SILVER = 0xc4d2e2;
const SILVER_DARK = 0x8796ac;
const SILVER_LIGHT = 0xf0f5fb;
const ICE = 0x7fdcff;
const ICE_CORE = 0xe0faff;
const SHAFT = 0x8a7a66;
const FLETCH = 0xeef4f8;

export const DROW_SCALE = 1.2;

const PROPS: Partial<Proportions> = {
  hipY: 56, waist: 9, torsoLen: 40, neck: 9, headZ: 1, shoulderX: 18, shoulderY: 34, upperArm: 24, forearm: 22,
  thighX: 7.5, thighY: -5, thigh: 27, shin: 24,
};

export const DROW_STANCE: Stance = { weaponHand: 'L', hunch: 0, armSpread: 0.1, heavy: 0 };

/** 弓的半长（握点到弓梢的竖直距离） */
const BOW_HALF = 57;

/** 前面留出开口的球壳（兜帽、披肩）：gap = 正前方开口的半角；thetaLen = 从顶部往下包到哪里 */
function openSphere(r: number, ws: number, hs: number, gap: number, thetaLen: number): SphereGeometry {
  return new SphereGeometry(r, ws, hs, Math.PI / 2 + gap, Math.PI * 2 - gap * 2, 0, thetaLen);
}

function torsoGeo(team: number): BufferGeometry {
  const b = new GeoBuilder(601 + team);
  // 收腰的皮革束身衣（深棕，胸口渐亮），正面两道交叉的系带
  b.cyl(9.5, 8.6, 14, 10, LEATHER_DARK, { p: [0, 5, 0], s: [1, 1, 0.75] });
  b.cyl(12.2, 9.8, 22, 10, LEATHER, { p: [0, 20, 0], s: [1, 1, 0.72], top: LEATHER_LIGHT });
  b.sphere(8.6, 10, 6, LEATHER_LIGHT, { p: [0, 23, 4], s: [1.2, 0.7, 0.6] });
  for (const s of [1, -1]) b.box(1.4, 18, 1, TRIM, { p: [s * 2.5, 12, 7.6], r: [0.05, 0, s * 0.35], jitter: 0 });
  // 斜挎箭袋的皮带：右肩 → 左腰（前后各一段）
  b.box(3.2, 34, 1.8, LEATHER_DARK, { p: [1, 20, 8.4], r: [0.1, 0, 0.55] });
  b.box(3.2, 34, 1.8, LEATHER_DARK, { p: [1, 20, -8.6], r: [-0.1, 0, 0.55] });
  b.octa(1.8, SILVER, { p: [2, 20, 9.6], jitter: 0 });
  // 深海军蓝的披肩（盖住两肩和后背，前面敞开）+ 冰蓝镶边
  b.add(openSphere(15.5, 12, 6, 0.8, Math.PI * 0.52), CLOAK_DARK, { p: [0, 30, -1], s: [1.18, 0.86, 0.88], top: CLOAK });
  b.torus(15.6, 1.2, 4, 16, TRIM, { p: [0, 29.4, -1], r: [Math.PI / 2, 0, 0], s: [1.18, 0.88, 1] });
  // 绕在脖子上的厚围巾（和脸上的面罩连在一起）
  b.torus(7.4, 3.4, 6, 12, CLOAK, { p: [0, 37.5, 0.5], r: [Math.PI / 2, 0, 0], s: [1.1, 0.9, 1], top: CLOAK_LIGHT });
  return b.build();
}

function pelvisGeo(team: number): BufferGeometry {
  const b = new GeoBuilder(611 + team);
  // 深色皮腰带 + 银扣 + 垂下的一条阵营色短饰带
  b.cyl(10.4, 10.8, 5, 10, LEATHER_DARK, { p: [0, 3, 0], s: [1, 1, 0.8], top: LEATHER });
  b.box(5, 4.4, 1.6, SILVER, { p: [0, 3, 8.9] });
  b.box(2.6, 13, 1.2, teamColor(team), { p: [-4, -5, 9], r: [0.1, 0, -0.08], top: teamDark(team) });
  // 紧身裤的臀部
  b.cyl(10, 9, 10, 10, LEGGING, { p: [0, -3, 0], s: [1, 1, 0.82] });
  // 四片短皮甲裙（前后左右），露出腿
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    b.box(9, 12, 1.4, i % 2 ? LEATHER : LEATHER_DARK, {
      p: [Math.sin(a) * 10.2, -5, Math.cos(a) * 8.6], r: [Math.cos(a) * 0.22, a, -Math.sin(a) * 0.05], top: LEATHER_LIGHT,
    });
  }
  return b.build();
}

function headGeo(): BufferGeometry {
  const b = new GeoBuilder(621);
  // 脖子和冰蓝色的脸
  b.cyl(3.8, 4.4, 9, 8, SKIN_DARK, { p: [0, 2, 0] });
  b.sphere(9.4, 10, 8, SKIN, { p: [0, 12, 1], s: [0.9, 1.06, 0.98], top: SKIN_LIGHT });
  // 发出淡光的眼睛（深色眼眶衬托）
  for (const s of [1, -1]) {
    b.box(3.6, 2, 1, 0x223a56, { p: [s * 3.4, 13, 9.1], jitter: 0 });
    b.box(2.4, 1.1, 1, ICE_CORE, { p: [s * 3.4, 13, 9.6], glow: 1.8, jitter: 0 });
  }
  // 遮住鼻子以下的海军蓝面罩 + 冰蓝镶边
  b.cyl(9.2, 9.8, 8, 12, CLOAK, { p: [0, 6.5, 1.4], s: [0.95, 1, 1.02], top: CLOAK_LIGHT });
  b.torus(9.1, 0.9, 3, 14, TRIM, { p: [0, 10.4, 1.4], r: [Math.PI / 2, 0, 0], s: [0.95, 1.02, 1] });
  // 兜帽下露出的白色刘海和两鬓的长发
  b.box(15, 4, 3.5, HAIR, { p: [0, 18, 8.4], r: [-0.45, 0, 0], top: HAIR_SHADE });
  for (const s of [1, -1]) b.box(3, 14, 3.6, HAIR, { p: [s * 8.6, 9, 5.6], r: [0.06, 0, s * 0.08], top: HAIR_SHADE });
  // 深兜帽：海军蓝厚球壳，前面露出脸；里层更深
  b.add(openSphere(13.6, 12, 9, 0.6, Math.PI * 0.72), CLOAK_DARK, { p: [0, 13, -1.2], s: [1, 1.12, 1.12], top: CLOAK });
  b.add(openSphere(12.8, 12, 9, 0.64, Math.PI * 0.7), 0x0e1628, { p: [0, 13, -1], s: [0.98, 1.1, 1.1] });
  // 向前探出的尖帽檐（俯视时兜帽的轮廓是个向前的尖）
  b.cone(6.5, 13, 6, CLOAK, { p: [0, 25, 6.5], r: [1.05, 0, 0], s: [1.2, 1, 0.7], top: CLOAK_LIGHT });
  // 兜帽口的冰蓝镶边（框住脸）
  b.torus(10.4, 1.2, 4, 14, TRIM, { p: [0, 13, 9.6], r: [-0.12, 0, 0], s: [0.92, 1.18, 1], jitter: 0 });
  // 兜帽后垂到肩上的部分
  b.sphere(9, 8, 6, CLOAK_DARK, { p: [0, 5, -9], s: [1.25, 1, 0.8], top: CLOAK });
  // 马尾从兜帽后面伸出来的根部（发圈）
  b.cyl(3.6, 4, 4, 8, HAIR, { p: [0, 9, -13.5], r: [-1.1, 0, 0] });
  return b.build();
}

/** 马尾的一节：白色的扁发束，从骨骼原点向下（−Y）长 len，宽度 w0 → w1；tip = 最后一节（收成尖） */
function tailGeo(seed: number, len: number, w0: number, w1: number, tip: boolean): () => BufferGeometry {
  return () => {
    const b = new GeoBuilder(seed);
    if (tip) {
      b.cone(w0, len + 4, 7, HAIR_SHADE, { p: [0, -(len + 4) / 2, 0], r: [Math.PI, 0, 0], s: [1, 1, 0.55], top: HAIR });
      // 发梢分成两三缕
      for (const s of [1, -1]) b.cone(w0 * 0.45, len * 0.55, 5, HAIR, { p: [s * w0 * 0.5, -len * 0.7, 0], r: [Math.PI, 0, s * 0.25], s: [1, 1, 0.6] });
    } else {
      b.cyl(w0, w1, len + 3, 8, HAIR_SHADE, { p: [0, -len / 2, 0], s: [1, 1, 0.55], top: HAIR });
      // 冰蓝色的发绳
      b.cyl(w0 + 0.6, w0 + 0.6, 3, 8, TRIM, { p: [0, -2, 0], s: [1, 1, 0.6] });
    }
    return b.build();
  };
}

/** 上臂：肩头盖着披肩，下面露出冰蓝色的手臂 */
function upperArmGeo(): BufferGeometry {
  const b = new GeoBuilder(631);
  b.sphere(5.8, 8, 6, CLOAK_DARK, { p: [0, -1.5, 0], top: CLOAK });
  b.cyl(4.4, 3.8, 23, 8, SKIN, { p: [0, -12, 0], top: SKIN_LIGHT });
  b.torus(4.3, 0.9, 3, 10, LEATHER_DARK, { p: [0, -7, 0], r: [Math.PI / 2, 0, 0] });
  return b.build();
}

/** 小臂 + 皮护腕（冰蓝镶边） */
function forearmGeo(): BufferGeometry {
  const b = new GeoBuilder(641);
  b.cyl(3.9, 3.3, 21, 8, SKIN, { p: [0, -10, 0] });
  b.cyl(4.6, 4.1, 12, 8, LEATHER_DARK, { p: [0, -14.5, 0], top: LEATHER });
  b.torus(4.5, 0.8, 3, 10, TRIM, { p: [0, -8.6, 0], r: [Math.PI / 2, 0, 0] });
  return b.build();
}

/** 戴露指皮手套的手 */
function handGeo(): BufferGeometry {
  const b = new GeoBuilder(645);
  b.box(6, 7.5, 4.6, LEATHER_DARK, { p: [0, -3.6, 0.4], jitter: 0.05 });
  b.box(5.4, 2.6, 4, SKIN, { p: [0, -8, 0.6] });
  b.box(2.4, 4.6, 2.4, LEATHER_DARK, { p: [3.2, -2.8, 2.4], r: [0, 0, 0.35] });
  return b.build();
}

function thighGeo(): BufferGeometry {
  const b = new GeoBuilder(651);
  b.cyl(5.8, 4.6, 27, 8, LEGGING, { p: [0, -13.5, 0] });
  return b.build();
}

/** 小腿 + 过膝的长靴（翻边、靴底在 −24 = 地面） */
function shinGeo(): BufferGeometry {
  const b = new GeoBuilder(661);
  b.cyl(5.2, 4.3, 22, 8, LEATHER_DARK, { p: [0, -11, 0], top: LEATHER });
  b.cyl(6, 5.4, 4, 8, LEATHER_LIGHT, { p: [0, -0.5, 0] });
  b.box(7.2, 4.4, 13, LEATHER_DARK, { p: [0, -21.8, 3] });
  b.cone(3.2, 6, 5, LEATHER_DARK, { p: [0, -22, 11.2], r: [Math.PI / 2, 0, 0], s: [1.15, 1, 0.65] });
  return b.build();
}

/**
 * 银色长弓：握点在原点，弓臂沿本地 ±Y，弓背朝本地 +Z（射击方向），弓弦在 −Z 一侧。
 * 每条弓臂从握把向外先微微前凸、再向后弯，弓梢反曲；弓梢各有一簇发光的小冰晶。
 */
function bowGeo(): BufferGeometry {
  const b = new GeoBuilder(671);
  // [y, z] 从握把到弓梢
  const limb: [number, number][] = [[7, 0.6], [18, -1.2], [30, -4.4], [42, -8], [51, -9.4], [BOW_HALF, -7]];
  for (const sy of [1, -1]) {
    let prev: [number, number] = [0, 0.8];
    limb.forEach(([y, z], i) => {
      const dy = (y - prev[0]) * sy, dz = z - prev[1];
      const len = Math.hypot(dy, dz);
      const k = i / (limb.length - 1);
      const w = 2.6 - 1.4 * k;
      b.cyl(w, w, len + 1.2, 6, k < 0.5 ? SILVER : SILVER_LIGHT, {
        p: [0, (prev[0] * sy + y * sy) / 2, (prev[1] + z) / 2], r: [Math.atan2(dz, dy), 0, 0], s: [1.5, 1, 1], top: k < 0.5 ? SILVER_LIGHT : SILVER,
      });
      // 弓臂背面一道深色的脊，浅色地面上也勾得出轮廓
      b.box(1.2, len + 0.6, 1.2, SILVER_DARK, { p: [0, (prev[0] * sy + y * sy) / 2, (prev[1] + z) / 2 + w * 0.9], r: [Math.atan2(dz, dy), 0, 0], jitter: 0 });
      prev = [y, z];
    });
    // 弓梢的冰晶（发光），朝外指
    b.octa(2.8, ICE, { p: [0, sy * (BOW_HALF + 3), -6], s: [0.7, 1.9, 0.7], r: [sy * 0.35, 0, 0], glow: 1.9, jitter: 0 });
    b.octa(1.6, ICE_CORE, { p: [0, sy * (BOW_HALF - 1), -4.5], s: [0.7, 1.4, 0.7], glow: 2.2, jitter: 0 });
  }
  // 缠皮革的握把 + 握把前面的一颗冰蓝宝石
  b.cyl(2.9, 2.9, 14, 7, LEATHER_DARK, { p: [0, 0, 0.6], top: LEATHER });
  b.octa(2.2, ICE, { p: [0, 0, 3.6], glow: 1.7, jitter: 0 });
  // 弓弦（白色细线）
  b.cyl(0.45, 0.45, BOW_HALF * 2, 4, 0xf4f8ff, { p: [0, 0, -7], jitter: 0 });
  return b.build();
}

/** 箭袋：沿本地 +Y，开口朝上；露出几支箭的箭尾（白色和冰蓝色的羽毛） */
function quiverGeo(): BufferGeometry {
  const b = new GeoBuilder(681);
  b.cyl(4.6, 3.8, 32, 8, LEATHER_DARK, { p: [0, 0, 0], top: LEATHER });
  b.torus(4.6, 0.9, 3, 10, TRIM, { p: [0, 15.5, 0], r: [Math.PI / 2, 0, 0] });
  b.torus(4, 0.8, 3, 10, SILVER_DARK, { p: [0, -13, 0], r: [Math.PI / 2, 0, 0] });
  const arrows: [number, number, number][] = [[1.6, 1, 0.12], [-1.8, 0.6, -0.1], [0.2, -1.8, 0.05], [-0.6, 2, -0.2], [2, -1.2, 0.2]];
  arrows.forEach(([x, z, tilt], i) => {
    const h = 13 + (i % 3) * 1.6;
    b.cyl(0.6, 0.6, h, 4, SHAFT, { p: [x, 16 + h / 2 - 2, z], r: [0, 0, tilt], jitter: 0 });
    const col = i % 2 ? TRIM_LIGHT : FLETCH;
    const fy = 16 + h - 4;
    b.box(0.5, 6.5, 3.6, col, { p: [x - tilt * 12, fy, z], r: [0, 0, tilt], jitter: 0 });
    b.box(3.6, 6.5, 0.5, col, { p: [x - tilt * 12, fy, z], r: [0, 0, tilt], jitter: 0 });
  });
  return b.build();
}

/**
 * 斗篷：从背后肩胛之间垂到小腿（沿本地 −Y），capeX 正 = 向后飘。外层海军蓝（下深上浅），下摆撕成一条条的；
 * 里面的阵营色内衬比外层宽一圈，从背后看是一道阵营色包边；两侧冰蓝镶边。
 */
function capeGeo(team: number): BufferGeometry {
  const b = new GeoBuilder(691 + team);
  const outline: [number, number][] = [
    [-13, 0], [13, 0], [21, -36], [25, -74], [19, -66], [13, -80], [6, -68], [0, -82], [-6, -68], [-13, -80], [-19, -66], [-25, -74], [-21, -36],
  ];
  const lining = outline.map(([x, y]) => [x * 1.1, y * 1.03 - 0.5] as [number, number]);
  b.extrude(lining, 1.4, teamColor(team), { p: [0, 0, 0.6], top: teamDark(team), jitter: 0.05 });
  b.extrude(outline, 2.4, CLOAK_DARK, { p: [0, 0, -1.4], top: CLOAK_LIGHT, jitter: 0.06 });
  // 两侧的冰蓝镶边
  for (const s of [1, -1]) {
    const [x0, y0] = [s * 13, 0];
    const [x1, y1] = [s * 21, -36];
    const [x2, y2] = [s * 25, -74];
    for (const [ax, ay, bx, by] of [[x0, y0, x1, y1], [x1, y1, x2, y2]] as const) {
      const len = Math.hypot(bx - ax, by - ay);
      b.box(1.6, len + 1, 2.8, TRIM, { p: [(ax + bx) / 2, (ay + by) / 2, -1.4], r: [0, 0, Math.atan2(by - ay, bx - ax) - Math.PI / 2], jitter: 0 });
    }
  }
  return b.build();
}

const BONES = humanoidBones(PROPS, [
  ['bow', 'handL', [0, -5, 1.5]],
  ['cape', 'torso', [0, 35, -10]],
  ['quiver', 'torso', [-3, 22, -16]],
  ['hairTail1', 'head', [0, 9, -15]],
  ['hairTail2', 'hairTail1', [0, -24, 0]],
]);

export const DROW_BONES = BONES;

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
    ['bow', bowGeo],
    ['cape', () => capeGeo(team)],
    ['quiver', quiverGeo],
    ['hairTail1', tailGeo(701, 24, 5, 4.2, false)],
    ['hairTail2', tailGeo(702, 26, 4.4, 1.5, true)],
  ];
}

export const DROW_BIND: Record<string, [number, number, number]> = { quiver: [-0.12, 0, 0.5], hairTail1: [0.75, 0, 0] };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function blend(a: Pose, b: Pose, k: number): Pose {
  const out: Pose = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) out[key] = lerp(a[key] ?? 0, b[key] ?? 0, k);
  return out;
}

/**
 * 让弓相对躯干保持 tilt 的倾角（0 = 竖直，正 = 上弓梢向前倒）：抵消躯干、左上臂、左小臂、左手的 X 旋转之和
 * （手臂左右张开很小时足够；拉弓的姿势另外给出求解好的 bowX / bowY / bowZ）。
 */
export function holdBow(p: Pose, tilt: number): Pose {
  p.bowX = tilt - ((p.torsoX ?? 0) + (p.shLX ?? 0) + (p.elL ?? 0) + (p.handLX ?? 0));
  return p;
}

/**
 * 马尾：从兜帽后面向后甩出、末端下垂、轻轻摆动；跑动时向后飘平并抖动；施法时（amp）甩得更厉害。
 * 正的 X 旋转 = 向后飘（绑定姿势已经向后倾 0.75）。
 */
function tailPose(t: number, run: number, amp = 0): Pose {
  const w = 2 + 5 * run;
  const a = 0.05 + 0.08 * run + 0.1 * amp;
  return {
    hairTail1X: lerp(0.0, 0.35, run) + 0.08 * amp + a * Math.sin(t * w),
    hairTail2X: lerp(-0.4, -0.15, run) + a * 1.3 * Math.sin(t * w - 1),
    hairTail1Z: 0.06 * Math.sin(t * 1.3) + 0.1 * run * Math.sin(t * 5.5),
    hairTail2Z: 0.09 * Math.sin(t * 1.3 - 0.9) + 0.12 * run * Math.sin(t * 5.5 - 1),
  };
}

// ---------- 拉弓的关键帧（左臂、右臂和弓的角度用数值求解：左手指向正前方，弓竖直、弓背朝前；右手的位置见注释） ----------
/** 拉弓时的身体：侧身（左肩朝前），头转回来看着目标 */
const ARCHER_BODY: Pose = {
  bodyY: -2, torsoX: 0.04, torsoY: -0.55, headY: 0.5, headX: -0.04,
  hipL: -0.28, kneeL: 0.22, hipR: 0.26, kneeR: 0.26, hipLZ: 0.16, hipRZ: -0.12, pelvisY: -0.25,
};
/** 左臂平举指向正前方（略高于肩），弓竖直、弓背朝前（求解得出） */
const BOW_ARM: Pose = { shLX: -1.89, shLY: 0.22, shLZ: 0.4, elL: -0.06, handLX: 0, bowX: 1.65, bowY: 0.43, bowZ: 0.36 };
/** 右手搭在弓弦上（手腕在握把后方约 33），肘部向右抬平 */
const NOCK: Pose = { shRX: -0.82, shRY: 1.95, shRZ: -1.31, elR: -1.03, handRX: 0 };
/** 满弓：右手拉到下巴右下方（手腕约在脸后 10），肘部抬到肩高、向后 */
const FULL_DRAW: Pose = { shRX: -1.44, shRY: 1.03, shRZ: -1.08, elR: -2.33, handRX: 0.1 };
/** 松弦：右手顺势向后弹开到耳后 */
const LOOSE: Pose = { shRX: -1.47, shRY: 0.21, shRZ: -1.27, elR: -2.37, handRX: 0.4 };

/** 拉弓循环的姿势：k = 0（右手在弦上）… 0.85（满弓）… 1（松弦后弹开） */
export function drawPose(k: number): Pose {
  const d = smooth01(k / 0.85);
  const r = smooth01((k - 0.85) / 0.15);
  const arm = blend(blend(NOCK, FULL_DRAW, d), LOOSE, r);
  return { ...ARCHER_BODY, ...BOW_ARM, ...arm, capeX: 0.18 + 0.1 * d };
}

/** 站立：左手握弓垂在身侧、弓斜向前，右手自然放松；斗篷轻轻摆动 */
export function idlePose(t: number): Pose {
  const p = hIdle(t, DROW_STANCE);
  const br = Math.sin(t * 2.2);
  return holdBow({
    ...p,
    pelvisY: 0.1, torsoY: -0.08, headY: 0.06,
    shLX: -0.28 + br * 0.02, shLZ: 0.2, elL: -0.75, handLX: 0,
    shRX: 0.05, shRZ: -0.2, elR: -0.35,
    capeX: 0.12 + 0.03 * Math.sin(t * 1.6), capeZ: 0.03 * Math.sin(t * 1.1),
    ...tailPose(t, 0),
  }, 0.4);
}

/** 跑步：通用的轻盈跑姿，左手握弓在身前，斗篷和马尾向后飘 */
export function runPose(ph: number, t: number): Pose {
  const p = hRun(ph, DROW_STANCE);
  return holdBow({ ...p, capeX: 0.45 + 0.07 * Math.sin(ph * 2), capeZ: 0.05 * Math.sin(t * 3), ...tailPose(t, 1) }, 0.75);
}

/**
 * 普攻：p = 前摇进度 0..1。举弓搭箭，0–0.85 把弦拉到脸颊，0.85–1 松弦，1 = 箭出手。
 */
export function attackPose(p: number): Pose {
  return drawPose(p);
}

/** 狂风前摇：右手收到左肩前（蓄力），身体左转 */
const GUST_WIND: Pose = {
  bodyY: -2, torsoX: 0.06, torsoY: 0.5, headY: -0.35,
  shRX: -1.94, shRY: 1, shRZ: 0.59, elR: -1.65, handRX: 0.2,
  shLX: 0.1, shLZ: 0.3, elL: -0.7,
  hipL: -0.2, kneeL: 0.2, hipR: 0.2, kneeR: 0.25, hipLZ: 0.1, hipRZ: -0.1,
};
/** 狂风释放：右手向右前方横扫推出（掌心朝前），身体右转 */
const GUST_SWEEP: Pose = {
  bodyY: -4, torsoX: 0.16, torsoY: -0.3, headY: 0.2,
  shRX: -1.85, shRY: 0.6, shRZ: -0.13, elR: -0.02, handRX: -0.9,
  shLX: 0.2, shLZ: 0.4, elL: -0.6,
  hipL: -0.45, kneeL: 0.35, hipR: 0.35, kneeR: 0.3, hipLZ: 0.12, hipRZ: -0.12,
};

/** 数箭齐发一波的周期（秒）：引导时间 / 波数（预览里没有单位时按 1.75 / 3） */
function wavePeriod(u: Unit | null): number {
  const ab = u?.ability('E');
  const c = u?.cast;
  if (!u || !ab || !c || c.ability !== ab) return 1.75 / 3;
  return c.channelTotal / Math.max(1, Math.round(abilityValue(u, ab, 'waves')));
}

/** 数箭齐发的进度：已引导时间对一波周期取余（0 = 刚放出一波）；没有单位时按状态时间估算 */
function multishotPhase(tr: AnimTracker, u: Unit | null): number {
  const period = wavePeriod(u);
  const c = u?.cast;
  const elapsed = c && c.phase === 'channel' ? c.channelTotal - c.timer : tr.stateTime + MULTISHOT_RELEASE;
  return (elapsed % period) / period;
}

/**
 * 数箭齐发的引导：连续的拉弓 / 放箭循环（每一波之后右手从弹开的位置回到弦上、再拉满），
 * k = 一波里的进度（0 = 刚放出一波）。0–0.15 松弦的余势，0.15–0.3 回到弦上，0.3–1 拉满。
 */
export function multishotPose(k: number): Pose {
  if (k < 0.15) return drawPose(1);
  if (k < 0.3) return blend(drawPose(1), drawPose(0), smooth01((k - 0.15) / 0.15));
  return drawPose(0.85 * smooth01((k - 0.3) / 0.7));
}

/** 技能前摇：p = 进度 0..1 */
export function castPose(id: string, p: number): Pose | null {
  const e = smooth01(p);
  const rest = idlePose(0);
  switch (id) {
    case 'drow_gust':
      return blend(rest, GUST_WIND, e);
    case 'drow_multishot':
      // 对局里没有前摇（castPoint 0），只有选人预览会播放
      return blend(rest, drawPose(0.85), e);
    default:
      return null;
  }
}

/** 释放：k = 进度 0..1 */
export function releasePose(kind: string, k: number): Pose | null {
  const rest = idlePose(0);
  switch (kind) {
    case 'drow_gust': {
      // 0–0.3 横扫推出，保持到 0.6，再收回
      const sweep = smooth01(k / 0.3);
      const back = smooth01((k - 0.6) / 0.4);
      return blend(blend(GUST_WIND, GUST_SWEEP, sweep), rest, back);
    }
    case 'drow_multishot':
      // 第一波立即放出：松弦的余势，之后由引导状态接着拉弓
      return drawPose(1);
    default:
      return null;
  }
}

const OWN: OwnPoses = { attack: attackPose, cast: castPose, release: releasePose };

/** 引导中边走边射：上半身用拉弓循环，腿用跑步姿势 */
function withRunLegs(p: Pose, tr: AnimTracker): Pose {
  if (tr.speed <= RUN_SPEED) return p;
  const r = hRun(tr.runPhase, DROW_STANCE);
  for (const k of ['hipL', 'kneeL', 'hipR', 'kneeR', 'hipLZ', 'hipRZ', 'bodyY']) p[k] = r[k] ?? 0;
  return p;
}

/** 按动画状态选姿势：站立 / 跑 / 引导用卓尔自己的；其余用 dispatchPose。弓、斗篷、马尾在所有状态下都补上 */
export function drowPose(tr: AnimTracker, t: number, u: Unit | null): Pose {
  if (tr.state === 'idle') return tr.taunted ? addTauntShake(idlePose(t), t) : idlePose(t);
  if (tr.state === 'run') return tr.taunted ? addTauntShake(runPose(tr.runPhase, t), t) : runPose(tr.runPhase, t);
  let p: Pose;
  if (tr.state === 'channel' && (u?.cast?.ability.def.id === 'drow_multishot' || (!u && tr.castAbility === null))) {
    p = withRunLegs(multishotPose(multishotPhase(tr, u)), tr);
  } else {
    p = dispatchPose(tr, t, DROW_STANCE, OWN);
  }
  if (p.bowX === undefined) holdBow(p, tr.state === 'dead' ? 1.2 : 0.4);
  if (p.capeX === undefined) p.capeX = tr.state === 'dead' ? 0 : 0.25;
  if (tr.state === 'dead') return { ...p, hairTail1X: 0.4, hairTail2X: 0.1 };
  const amp = tr.state === 'cast' || tr.state === 'release' || tr.state === 'channel' ? 1 : tr.state === 'attack' ? 0.5 : 0;
  return { ...p, ...tailPose(t, 0, amp) };
}

/** 数箭齐发的释放动作很短（随后进入引导状态） */
const MULTISHOT_RELEASE = 0.15;

export const DROW_RELEASE_DUR: Record<string, number> = { drow_gust: 0.4, drow_multishot: MULTISHOT_RELEASE };

export const DROW_SPEC: HeroModelSpec = {
  id: 'drow_ranger',
  scale: DROW_SCALE,
  headHeight: 172,
  muzzleHeight: 120,
  bones: BONES,
  parts,
  bindRotations: DROW_BIND,
  pose: (tr, t, u) => drowPose(tr, t, u),
  releaseDur: DROW_RELEASE_DUR,
  previewMoves: ['drow_gust', 'drow_multishot'],
  // 深海军蓝的斗篷在俯视镜头下处在掠射角，缺省的奶白色边缘光会把它洗成灰白：换成很弱的冰蓝色
  rim: { color: 0x8fd0ee, strength: 0.1 },
};

registerHeroModel(DROW_SPEC);
