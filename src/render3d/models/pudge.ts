import type { Bone, BufferGeometry } from 'three';
import { GeoBuilder } from '../geo';
import { teamColor, teamDark } from '../materials';
import { type AnimTracker, type Pose, smooth01 } from '../anim';
import type { Unit } from '../../sim/entities/unit';
import type { HeroModelSpec, PartDef } from './heroModel';
import { addTauntShake, applyHumanoid, channelPose, dispatchPose, humanoidBones, idlePose as hIdle, runPose as hRun, type OwnPoses, type Proportions, type Stance } from './humanoid';
import { registerHeroModel } from './registry';

/**
 * 帕吉：巨胖的屠夫。灰粉色、到处是缝合线的皮肤，巨大的圆肚子（belly 骨骼随步伐抖动），小脑袋陷在隆起的肩膀里、
 * 戴皮质面罩带；屠夫皮围裙（污渍斑块）、生锈的铁链腰带、肩上缠几圈铁链；左手大切肉刀（cleaver），右手大肉钩（hook）；
 * 粗短的腿。阵营色只用在围裙系带和护腕上。
 * 骨骼 = humanoidBones（肩膀加宽、腿缩短）+ cleaver（handL）+ hook（handR）+ belly（torso）。
 * 武器沿本地 +Y，绑定时绕 X 转 90°：武器方向角 θ = 武器骨骼 X 通道 + 手臂 X 旋转之和（0 = 朝前，+π/2 = 朝下，−π/2 = 朝上）。
 * 模型面朝本地 +Z，本地 +X 是角色的左手边。
 */
const SKIN = 0xc98a8a;
const SKIN_LIGHT = 0xdaa29e;
const SKIN_DARK = 0xa86c6c;
const STITCH = 0x8e5a5a;
const STITCH_DARK = 0x5e3434;
const APRON = 0x6b4a2a;
const APRON_DARK = 0x4a3018;
const STAIN = 0x5a2418;
const LEATHER = 0x4a2e1c;
const LEATHER_LIGHT = 0x6a4428;
const RUST = 0x7a5238;
const IRON = 0x6c6a68;
const IRON_DARK = 0x45403c;
const STEEL = 0xc4c8cc;
const STEEL_DARK = 0x6a7078;
const EDGE = 0xf2f4f6;
const CLEAVER = 0x8e969e;
const CLEAVER_LIGHT = 0xaab2ba;
const WOOD = 0x5a3a20;
const WRAP = 0xb8a888;
const WRAP_DARK = 0x8a7a5e;
const BOOT = 0x3e2e22;
const EYE = 0xffd060;
const TOOTH = 0xece2c4;

export const PUDGE_SCALE = 1.5;

const PROPS: Partial<Proportions> = {
  hipY: 50, waist: 10, torsoLen: 58, neck: 7, headZ: 11, shoulderX: 38, shoulderY: 50, upperArm: 28, forearm: 26,
  thighX: 15, thighY: -4, thigh: 23, shin: 23,
};

export const PUDGE_STANCE: Stance = { weaponHand: 'both', hunch: 0.35, armSpread: 0.35, heavy: 1.0 };

/** 一串铁链：沿折线 pts 每隔 step 放一个小环，相邻的环互相垂直 */
function chainLinks(b: GeoBuilder, pts: [number, number, number][], step: number, color: number, size = 2.6): void {
  let k = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay, az] = pts[i];
    const [bx, by, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, by - ay, bz - az);
    const n = Math.max(1, Math.round(len / step));
    // 链节沿线段方向拉长：先绕 X 让环平面朝向线段，再按奇偶转 90°
    const yaw = Math.atan2(bx - ax, bz - az);
    const pitch = -Math.atan2(by - ay, Math.hypot(bx - ax, bz - az));
    for (let j = 0; j < n; j++) {
      const t = (j + 0.5) / n;
      b.torus(size, size * 0.34, 3, 6, color, {
        p: [ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t],
        r: [pitch, yaw, k++ % 2 ? Math.PI / 2 : 0], s: [0.75, 1.25, 1], jitter: 0.12,
      });
    }
  }
}

/** 缝合线：从 a 到 b 的一道深色线 + 一排横跨的短针脚 */
function stitches(b: GeoBuilder, a: [number, number, number], c: [number, number, number], n: number, o: { w?: number; rz?: number; rx?: number; ry?: number } = {}): void {
  const len = Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
  const mid: [number, number, number] = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2];
  const rz = o.rz ?? -Math.atan2(c[0] - a[0], c[1] - a[1]);
  b.box(0.9, len, 0.9, STITCH_DARK, { p: mid, r: [o.rx ?? 0, o.ry ?? 0, rz], jitter: 0 });
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    b.box(o.w ?? 4, 0.8, 0.8, STITCH, { p: [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t], r: [o.rx ?? 0, o.ry ?? 0, rz], jitter: 0 });
  }
}

function torsoGeo(): BufferGeometry {
  const b = new GeoBuilder(1601);
  // 桶形的身躯（下宽上更宽），胸口向前鼓
  b.cyl(27, 25, 26, 12, SKIN, { p: [0, 12, 0], s: [1, 1, 0.86], top: SKIN_LIGHT });
  b.cyl(32, 28, 28, 12, SKIN, { p: [0, 36, -1], s: [1, 1, 0.82], top: SKIN_LIGHT });
  // 隆起的肩背肉峰：小脑袋陷在里面
  b.sphere(22, 12, 8, SKIN, { p: [0, 47, -9], s: [1.5, 0.72, 1.0], top: SKIN_LIGHT });
  for (const s of [1, -1]) b.sphere(15, 10, 7, SKIN, { p: [s * 34, 49, -1], s: [1, 0.95, 1.05], top: SKIN_LIGHT });
  // 背上的缝合线（俯视和背面能看到）
  stitches(b, [12, 58, -22], [-10, 24, -26], 6, { rx: 0.2 });
  stitches(b, [-24, 52, -14], [-30, 30, -18], 4, { rx: 0.15 });
  stitches(b, [26, 46, 12], [14, 36, 22], 3, { rx: -0.3 });
  // 胸口一块深色的旧伤疤
  b.box(10, 6, 2, SKIN_DARK, { p: [-14, 42, 23], r: [-0.25, 0, 0.3], jitter: 0.05 });
  // 一串铁链从右肩斜挂到背后（右上臂上还缠着几圈，见 upperArmRGeo）
  chainLinks(b, [[-30, 58, 6], [-6, 62, -10], [16, 52, -24], [26, 32, -26], [24, 12, -24]], 5.5, IRON);
  // 背后两根围裙背带交叉成 X（从背后 / 俯视也认得出是屠夫）
  for (const s of [1, -1]) b.box(6, 60, 2, LEATHER, { p: [0, 30, -27.6], r: [0.16, 0, s * 0.62], top: LEATHER_LIGHT });
  b.cyl(4.6, 4.6, 2.4, 8, IRON, { p: [0, 30, -28.6], r: [Math.PI / 2 + 0.16, 0, 0], jitter: 0 });
  return b.build();
}

/** 肚子的半径和缩放（从背后看两侧也鼓出来） */
const BR = 31;
const BSX = 1.38;
const BSZ = 1.2;

/** 巨大的圆肚子（belly 骨骼的轴心在肚子上沿后方，转动时整个肚子前后左右晃） */
function bellyGeo(): BufferGeometry {
  const b = new GeoBuilder(1611);
  b.sphere(BR, 16, 12, SKIN, { p: [0, -10, 14], s: [BSX, 1.05, BSZ], top: SKIN_LIGHT, jitter: 0.04 });
  // 肚脐
  b.sphere(2.4, 6, 4, STITCH_DARK, { p: [0, -14, 14 + BR * BSZ * 0.99], jitter: 0 });
  // 一道竖着的大缝合痕（从胸口到肚脐下）+ 横跨的针脚
  const front = (y: number, x = 0): [number, number, number] => {
    const dy = (y + 10) / (BR * 1.05);
    const dx = x / (BR * BSX);
    const z = 14 + BR * BSZ * Math.sqrt(Math.max(0, 1 - dy * dy - dx * dx)) + 0.3;
    return [x, y, z];
  };
  for (let i = 0; i < 7; i++) {
    const y0 = 14 - i * 5.2;
    const y1 = y0 - 5.2;
    const a = front(y0, 6 - i * 0.6);
    const c = front(y1, 6 - (i + 1) * 0.6);
    const tilt = Math.atan2(c[2] - a[2], a[1] - c[1]);
    b.box(1, 5.6, 1, STITCH_DARK, { p: [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2], r: [tilt, 0, 0.1], jitter: 0 });
    const m = front((y0 + y1) / 2, 6 - (i + 0.5) * 0.6);
    b.box(6, 1, 1, STITCH, { p: m, r: [tilt, 0, 0], jitter: 0 });
  }
  // 横着的第二道缝合痕（左侧，俯视可见）
  for (let i = 0; i < 5; i++) {
    const x0 = 10 + i * 4.6;
    const a = front(4 - i * 1.5, x0);
    b.box(4.8, 1, 1, STITCH_DARK, { p: a, r: [0, 0.3 + i * 0.12, -0.25], jitter: 0 });
    b.box(1, 4.5, 1, STITCH, { p: a, r: [0, 0.3 + i * 0.12, -0.25], jitter: 0 });
  }
  // 几块深色的淤青斑（低多边形的明暗）
  b.sphere(6, 6, 4, SKIN_DARK, { p: front(-20, -18), s: [1, 0.7, 0.3], jitter: 0 });
  b.sphere(4.5, 6, 4, SKIN_DARK, { p: front(-4, 21), s: [1, 0.7, 0.3], jitter: 0 });
  return b.build();
}

function pelvisGeo(team: number): BufferGeometry {
  const b = new GeoBuilder(1621 + team);
  b.cyl(27, 23, 18, 12, SKIN_DARK, { p: [0, 0, 0], s: [1, 1, 0.85] });
  // 生锈的铁链腰带：一圈粗环 + 一圈链节
  b.torus(28, 2.6, 4, 18, RUST, { p: [0, 7, 1], r: [Math.PI / 2, 0, 0], s: [1, 0.88, 1], jitter: 0.15 });
  const ring: [number, number, number][] = [];
  for (let i = 0; i <= 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    ring.push([Math.sin(a) * 29.5, 3 + Math.sin(a * 3) * 0.6, 1 + Math.cos(a) * 29.5 * 0.88]);
  }
  chainLinks(b, ring, 5.2, IRON, 2.3);
  // 屠夫皮围裙：从腰带垂到膝盖下，正面带污渍
  b.box(42, 46, 2.4, APRON, { p: [0, -18, 26], r: [0.14, 0, 0], top: APRON_DARK, jitter: 0.06 });
  b.box(42, 3, 2.8, APRON_DARK, { p: [0, -40, 29.3], r: [0.14, 0, 0], jitter: 0 });
  for (const [x, y, w, h] of [[-9, -12, 11, 8], [10, -26, 8, 12], [-4, -33, 14, 6], [13, -8, 6, 5]] as const) {
    b.box(w, h, 1, STAIN, { p: [x, y, 27.6 - y * 0.14], r: [0.14, 0, 0.3], jitter: 0.1 });
  }
  // 阵营色的围裙系带（两侧打结、垂下两条）
  for (const s of [1, -1]) {
    b.octa(3.6, teamColor(team), { p: [s * 24, 4, 16], s: [1, 1, 0.7], jitter: 0 });
    b.box(3, 16, 1.2, teamColor(team), { p: [s * 25, -5, 17], r: [0.1, 0, s * 0.12], top: teamDark(team) });
  }
  // 背后一片短皮裙
  b.box(40, 22, 2.4, LEATHER, { p: [0, -10, -23], r: [-0.12, 0, 0], top: LEATHER_LIGHT });
  return b.build();
}

function headGeo(): BufferGeometry {
  const b = new GeoBuilder(1631);
  // 粗短的脖子 + 圆圆的小光头（下巴宽、头顶窄）
  b.cyl(9, 11, 8, 10, SKIN, { p: [0, 1, 0] });
  b.sphere(14.5, 12, 9, SKIN, { p: [0, 11, 2], s: [1.05, 0.95, 1.05], top: SKIN_LIGHT });
  b.sphere(12, 10, 6, SKIN, { p: [0, 4.5, 6.5], s: [1.15, 0.7, 1] });
  // 皮质面罩带：一圈绕过眼睛的宽皮带（俯视时是头上的一个棕色圈）
  b.torus(14.8, 2.8, 5, 16, LEATHER, { p: [0, 13, 2], r: [Math.PI / 2, 0, 0], s: [1.02, 1.04, 1.4] });
  // 铆钉
  for (const a of [-0.8, 0, 0.8]) b.sphere(1.3, 4, 3, IRON, { p: [Math.sin(a) * 16.6, 13, 2 + Math.cos(a) * 17.2], jitter: 0 });
  // 一只发黄光的眼睛露在面罩的洞里，另一只被缝死
  b.box(3.8, 2.6, 1.2, EYE, { p: [5, 13, 18.1], jitter: 0, glow: 1.6 });
  stitches(b, [-7.5, 14, 17.8], [-2.8, 12, 18.1], 3, { w: 2.4 });
  // 宽嘴 + 两颗向上的獠牙
  b.box(11, 2.4, 2, STITCH_DARK, { p: [0, 4, 15.6], jitter: 0 });
  for (const s of [1, -1]) b.cone(1.6, 5, 4, TOOTH, { p: [s * 4.2, 6.2, 15.8], r: [-0.2, 0, 0] });
  // 后脑勺一块缝上去的补丁（俯视可见的一个 X）
  for (const s of [1, -1]) b.box(9, 1, 1, STITCH_DARK, { p: [0, 21, -9], r: [-0.75, 0, s * 0.7], jitter: 0 });
  // 小耳朵
  for (const s of [1, -1]) b.sphere(3.2, 5, 4, SKIN_DARK, { p: [s * 15, 10, 0], s: [0.5, 1, 0.8] });
  return b.build();
}

function upperArmGeo(): BufferGeometry {
  const b = new GeoBuilder(1641);
  b.sphere(11.5, 10, 7, SKIN, { p: [0, -1, 0], top: SKIN_LIGHT });
  b.cyl(11, 9.2, 28, 10, SKIN, { p: [0, -14, 0], top: SKIN_LIGHT });
  stitches(b, [0, -6, 10.6], [0, -22, 9.4], 4, { w: 3 });
  return b.build();
}

/** 右上臂：肩头缠着几圈铁链（环绕手臂的水平环，俯视时是一圈圈的环） */
function upperArmRGeo(): BufferGeometry {
  const b = new GeoBuilder(1642);
  b.sphere(11.5, 10, 7, SKIN, { p: [0, -1, 0], top: SKIN_LIGHT });
  b.cyl(11, 9.2, 28, 10, SKIN, { p: [0, -14, 0], top: SKIN_LIGHT });
  for (let i = 0; i < 3; i++) {
    b.torus(12.6 - i * 0.5, 2.2, 4, 14, i % 2 ? IRON : RUST, { p: [0, 1 - i * 4.6, 0], r: [Math.PI / 2 + 0.12 * (i - 1), 0, 0.1 * (1 - i)], jitter: 0.15 });
  }
  return b.build();
}

function forearmGeo(team: number): BufferGeometry {
  const b = new GeoBuilder(1651 + team);
  b.sphere(9.4, 8, 6, SKIN, { p: [0, 0, 0] });
  b.cyl(9.2, 8, 26, 10, SKIN, { p: [0, -12, 0], top: SKIN_LIGHT });
  // 阵营色护腕 + 皮扣
  b.cyl(9.6, 9.2, 9, 10, teamColor(team), { p: [0, -19.5, 0], top: teamDark(team) });
  b.cyl(9.9, 9.9, 1.6, 10, LEATHER, { p: [0, -15.2, 0] });
  return b.build();
}

function handGeo(): BufferGeometry {
  const b = new GeoBuilder(1661);
  b.box(10, 10, 9, SKIN, { p: [0, -4.5, 0.6], top: SKIN_DARK, jitter: 0.06 });
  b.box(3.6, 6, 3.6, SKIN_DARK, { p: [4.8, -3.5, 3.4], r: [0, 0, 0.4] });
  return b.build();
}

/** 大腿：粗短、带缝合线（大部分被围裙挡住） */
function thighGeo(): BufferGeometry {
  const b = new GeoBuilder(1671);
  b.cyl(12.5, 10.5, 24, 10, SKIN, { p: [0, -11, 0], top: SKIN_LIGHT });
  b.cyl(11.4, 11.4, 2, 10, STITCH_DARK, { p: [0, -8, 0] });
  return b.build();
}

/** 小腿：裹着脏布条，脚是一团包着皮的大脚（脚底在 −23 = 地面） */
function shinGeo(): BufferGeometry {
  const b = new GeoBuilder(1681);
  b.cyl(10.5, 9, 18, 10, WRAP, { p: [0, -8, 0], top: WRAP_DARK });
  for (let i = 0; i < 3; i++) b.cyl(10.8 - i * 0.5, 10.6 - i * 0.5, 1.4, 10, WRAP_DARK, { p: [0, -3 - i * 5, 0], r: [0.12, 0, 0.08 * (i - 1)] });
  b.box(14, 6.5, 19, BOOT, { p: [0, -19.8, 3.5], top: LEATHER_LIGHT, jitter: 0.06 });
  return b.build();
}

/**
 * 切肉刀：握点在原点，刀身沿本地 +Y、刀面在 XY 平面（绑定后是水平面，俯视能看到整块刀面），刀刃朝 +X（左手外侧）。
 * 长方形宽刃：深色刀背、亮色刀刃、一个挂孔和几块血迹。
 */
function cleaverGeo(): BufferGeometry {
  const b = new GeoBuilder(1691);
  b.cyl(2.4, 2.6, 16, 6, WOOD, { p: [0, 0, 0] });
  b.cyl(3, 3, 2.4, 6, IRON_DARK, { p: [0, -8.6, 0] });
  b.box(5, 2.4, 3.4, IRON_DARK, { p: [0, 8.6, 0] });
  const L = 40;
  const W = 25;
  b.box(W, L, 2.2, CLEAVER, { p: [W / 2 - 3, 10 + L / 2, 0], top: CLEAVER_LIGHT, jitter: 0.05 });
  // 刀背（深色）、刀刃（亮边）
  b.box(2.4, L + 1, 3.2, STEEL_DARK, { p: [-3.4, 10 + L / 2, 0], jitter: 0 });
  b.box(1.6, L, 1.4, EDGE, { p: [W - 3.4, 10 + L / 2, 0], jitter: 0 });
  b.box(W, 1.6, 2.6, STEEL_DARK, { p: [W / 2 - 3, 10 + L, 0], jitter: 0 });
  // 挂孔
  b.cyl(2.4, 2.4, 2.6, 8, IRON_DARK, { p: [3, 10 + L - 5, 0], r: [Math.PI / 2, 0, 0], jitter: 0 });
  // 刀刃附近一道暗红的血迹
  b.box(4, 22, 2.5, STAIN, { p: [W - 7.5, 10 + L * 0.45, 0], r: [0, 0, 0.05], jitter: 0.15 });
  return b.build();
}

/**
 * 肉钩：握点在原点，钩身沿本地 +Y，钩弯在 XY 平面里朝 −X（右手外侧）弯回来，尖端带倒刺；柄尾挂一小段铁链。
 */
export const HOOK_R = 15;
function hookGeo(): BufferGeometry {
  const b = new GeoBuilder(1701);
  b.cyl(2.6, 2.8, 14, 6, WOOD, { p: [0, 0, 0] });
  b.torus(3.4, 1.2, 3, 6, IRON_DARK, { p: [0, -8.6, 0], r: [0, Math.PI / 2, 0] });
  b.cyl(2.4, 2.6, 18, 6, STEEL, { p: [0, 16, 0], top: STEEL_DARK });
  const cx = -HOOK_R;
  const cy = 25;
  b.torus(HOOK_R, 3.2, 5, 14, STEEL, { p: [cx, cy, 0], jitter: 0.06 }, Math.PI * 1.32);
  // 钩弯外侧一道锈色
  b.torus(HOOK_R + 2.6, 0.9, 3, 12, RUST, { p: [cx, cy, 0], jitter: 0.1 }, Math.PI * 1.1);
  // 尖端：沿钩弯的切线方向
  const end = Math.PI * 1.32;
  const ex = cx + HOOK_R * Math.cos(end);
  const ey = cy + HOOK_R * Math.sin(end);
  const tx = -Math.sin(end);
  const ty = Math.cos(end);
  b.cone(3.6, 11, 5, EDGE, { p: [ex + tx * 5, ey + ty * 5, 0], r: [0, 0, -Math.atan2(tx, ty)] });
  // 倒刺
  b.cone(2, 6, 4, STEEL, { p: [ex + tx * 2 + 2.5, ey + ty * 2 + 1.5, 0], r: [0, 0, -Math.atan2(tx, ty) + 1.9] });
  return b.build();
}

const BONES = humanoidBones(PROPS, [
  ['cleaver', 'handL', [0, -5, 1]],
  ['hook', 'handR', [0, -5, 1]],
  ['belly', 'torso', [0, 26, 6]],
]);

export const PUDGE_BONES = BONES;

function parts(team: number): PartDef[] {
  return [
    ['pelvis', () => pelvisGeo(team)],
    ['torso', torsoGeo],
    ['belly', bellyGeo],
    ['head', headGeo],
    ['shL', upperArmGeo],
    ['shR', upperArmRGeo],
    ['elL', () => forearmGeo(team)],
    ['elR', () => forearmGeo(team)],
    ['handL', handGeo],
    ['handR', handGeo],
    ['thighL', thighGeo],
    ['thighR', thighGeo],
    ['shinL', shinGeo],
    ['shinR', shinGeo],
    ['cleaver', cleaverGeo],
    ['hook', hookGeo],
  ];
}

export const PUDGE_BIND: Record<string, [number, number, number]> = { cleaver: [Math.PI / 2, 0, 0], hook: [Math.PI / 2, 0, 0] };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function blend(a: Pose, b: Pose, k: number): Pose {
  const out: Pose = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) out[key] = lerp(a[key] ?? 0, b[key] ?? 0, k);
  return out;
}

/** 武器骨骼的 X 通道：让武器方向角 = theta（手臂 X 旋转之和 = armX） */
const aimWeapon = (armX: number, theta: number): number => theta - armX;

/** 两只手的站立姿势：手臂粗重地垂在身侧略向外，切肉刀和肉钩斜指前下方 */
function armsRest(br: number): Pose {
  const l = { shLX: 0.08 + br * 0.02, shLZ: 0.36, elL: -0.62 };
  const r = { shRX: 0.04 - br * 0.02, shRZ: -0.36, elR: -0.66 };
  return { ...l, ...r, cleaverX: aimWeapon(l.shLX + l.elL, 0.55), hookX: aimWeapon(r.shRX + r.elR, 0.5), cleaverZ: -0.2, hookZ: 0.25 };
}

/** 站立：沉重地呼吸，驼背，肚子随呼吸起伏 */
export function idlePose(t: number): Pose {
  const p = hIdle(t, PUDGE_STANCE);
  const br = Math.sin(t * 1.6);
  return {
    ...p,
    ...armsRest(br),
    hipLZ: 0.2, hipRZ: -0.2, kneeL: 0.18, kneeR: 0.18,
    bellyX: 0.03 * br, bellyZ: 0.015 * Math.sin(t * 0.8),
  };
}

/** 跑步：左右摇摆的蹒跚步，手臂粗重地前后摆，肚子一颠一颠 */
export function runPose(ph: number, t: number): Pose {
  const p = hRun(ph, { ...PUDGE_STANCE, weaponHand: 'none' });
  const s = Math.sin(ph);
  const c = Math.cos(ph);
  const l = { shLX: 0.32 * s, shLZ: 0.42, elL: -0.55 };
  const r = { shRX: -0.32 * s, shRZ: -0.42, elR: -0.55 };
  void t;
  return {
    ...p,
    bodyRoll: 0.16 * s,
    torsoX: (p.torsoX ?? 0) + 0.06, torsoZ: -0.06 * s,
    ...l, ...r,
    hipLZ: 0.2, hipRZ: -0.2,
    cleaverX: aimWeapon(l.shLX + l.elL, 0.6), hookX: aimWeapon(r.shRX + r.elR, 0.55), cleaverZ: -0.2, hookZ: 0.25,
    bellyX: -0.09 * Math.abs(c) + 0.04, bellyZ: 0.07 * s,
  };
}

/** 切肉刀高举（普攻 0.6 时）：左臂举过头顶、肘部弯曲，刀刃朝后上方 */
const CHOP_UP = { shLX: -2.75, shLY: 0.15, shLZ: 0.32, elL: -0.95, handLX: 0 };
/** 劈下（命中瞬间）：左臂前伸向下，刀刃朝前下方 */
const CHOP_DOWN = { shLX: -0.95, shLY: 0, shLZ: 0.12, elL: -0.2, handLX: 0 };

/**
 * 普攻：左手切肉刀高举后劈下。p = 前摇进度 0..1：0–0.6 举起（身体后仰、往右拧），0.6–1 劈下（越来越快），1 = 命中（sim 出手的时刻）。
 */
export function attackPose(p: number): Pose {
  const rest = armsRest(0);
  const e = smooth01(p / 0.6);
  const f = Math.max(0, Math.min(1, (p - 0.6) / 0.4));
  const k = f * f;
  const up = blend({ shLX: rest.shLX, shLY: 0, shLZ: rest.shLZ, elL: rest.elL, handLX: 0 }, CHOP_UP, e);
  const arm = p < 0.6 ? up : blend(CHOP_UP, CHOP_DOWN, k);
  const armX = arm.shLX + arm.elL;
  return {
    bodyY: -2 - 2 * e + 4 * k - 6 * k, bodyZ: 6 * k,
    torsoX: lerp(0.35, 0.12, e) + 0.55 * k, torsoY: lerp(0, -0.35, e) + 0.6 * k, headX: lerp(-0.25, -0.4, e) + 0.2 * k,
    ...arm,
    cleaverX: aimWeapon(armX, lerp(0.55, -2.3, e) * (1 - k) + 0.35 * k), cleaverZ: -0.2,
    shRX: 0.15 - 0.3 * e + 0.5 * k, shRZ: -0.45, elR: -0.8, hookX: aimWeapon(0.15 - 0.3 * e + 0.5 * k - 0.8, 0.5), hookZ: 0.25,
    hipL: -0.3 - 0.2 * k, kneeL: 0.3 + 0.2 * k, hipR: 0.25, kneeR: 0.25, hipLZ: 0.2, hipRZ: -0.2,
    bellyX: -0.05 * e + 0.12 * k, bellyZ: 0.04 * k,
  };
}

/** 肉钩出手（前摇 0.6）：右臂后摆，身体向右拧 */
const HOOK_BACK = { shRX: 1.05, shRY: -0.2, shRZ: -0.55, elR: -0.6 };
/** 过肩甩出后（前摇结束 = 出钩）：右臂向前上方伸直 */
const HOOK_THROW = { shRX: -1.75, shRY: 0.05, shRZ: -0.12, elR: -0.12 };
/** 钩子在外面时：右臂向前平伸，拉着铁链 */
const HOOK_HOLD = { shRX: -1.42, shRY: 0.05, shRZ: -0.1, elR: -0.1 };

/** 肢解：前倾、双手向前抓住目标往回拽，头部 2 Hz 啃咬（t = 动画时间） */
export function dismemberPose(t: number): Pose {
  const bite = Math.max(0, Math.sin(t * Math.PI * 4));
  const tug = Math.sin(t * Math.PI * 2);
  const l = { shLX: -1.25 + 0.12 * tug, shLZ: 0.32, elL: -1.0 - 0.15 * tug };
  const r = { shRX: -1.25 - 0.12 * tug, shRZ: -0.32, elR: -1.0 + 0.15 * tug };
  return {
    bodyY: -7, bodyZ: 4,
    torsoX: 0.72 + 0.04 * tug, torsoY: 0.05 * tug,
    headX: -0.35 + 0.55 * bite, headZ: 0.06 * Math.sin(t * 5),
    ...l, ...r,
    cleaverX: aimWeapon(l.shLX + l.elL, -1.1), hookX: aimWeapon(r.shRX + r.elR, -1.1), cleaverZ: -0.6, hookZ: 0.6,
    hipL: -0.55, kneeL: 0.7, hipR: 0.05, kneeR: 0.5, hipLZ: 0.24, hipRZ: -0.24,
    bellyX: 0.06 * bite,
  };
}

/** 技能前摇：p = 进度 0..1 */
export function castPose(id: string, p: number): Pose | null {
  const rest = idlePose(0);
  const e = smooth01(p);
  switch (id) {
    case 'pudge_meat_hook': {
      // 0–0.6 右臂后摆、身体右拧；0.6–1 过肩甩出
      const a = smooth01(p / 0.6);
      const f = Math.max(0, Math.min(1, (p - 0.6) / 0.4));
      const arm = p < 0.6 ? blend({ shRX: rest.shRX, shRY: 0, shRZ: rest.shRZ, elR: rest.elR }, HOOK_BACK, a) : blend(HOOK_BACK, HOOK_THROW, f * f);
      return {
        ...rest,
        ...arm,
        hookX: aimWeapon(arm.shRX + arm.elR, p < 0.6 ? lerp(0.5, 1.6, a) : lerp(1.6, -0.2, f)),
        torsoY: lerp(0, -0.55, a) + 0.95 * f * f, torsoX: 0.35 - 0.1 * a + 0.3 * f,
        bodyRoll: -0.05 * a + 0.08 * f,
        shLX: -0.3 * a, shLZ: 0.5,
        hipL: -0.3 * f, kneeL: 0.25 + 0.2 * f, hipR: 0.2 * a, kneeR: 0.25,
      };
    }
    case 'pudge_dismember': {
      // 前扑：张开双臂向前抓
      const lunge = { ...dismemberPose(0), bodyZ: 10, torsoX: 0.65, shLZ: 0.6, shRZ: -0.6, elL: -0.5, elR: -0.5, headX: -0.5 };
      return blend(rest, lunge, e);
    }
    default:
      return null;
  }
}

/** 释放（一次性动作）：k = 进度 0..1 */
export function releasePose(kind: string, k: number, t = 0): Pose | null {
  const rest = idlePose(t);
  switch (kind) {
    case 'pudge_meat_hook': {
      // 甩出后右臂停在前方（钩子在外面时由 hookHold 接管）
      const back = smooth01((k - 0.7) / 0.3);
      const hold = { ...rest, ...HOOK_HOLD, hookX: aimWeapon(HOOK_HOLD.shRX + HOOK_HOLD.elR, 0), torsoY: 0.3, torsoX: 0.45 };
      return blend(blend({ ...rest, ...HOOK_THROW, torsoY: 0.4, torsoX: 0.65 }, hold, smooth01(k / 0.4)), rest, back * 0.3);
    }
    case 'pudge_rot': {
      // 弓背打个寒颤，双臂向两侧张开，毒雾从身上冒出来
      const e = Math.sin(Math.min(1, k) * Math.PI);
      return blend(rest, {
        ...rest, bodyY: -7, torsoX: 0.75, headX: 0.45, shLZ: 0.95, shRZ: -0.95, shLX: -0.4, shRX: -0.4, elL: -0.9, elR: -0.9,
        torsoZ: 0.06 * Math.sin(k * 40), bellyX: 0.1,
      }, e);
    }
    case 'pudge_meat_shield': {
      // 双臂弯起、挺胸（亮出一身肥肉）
      const e = Math.sin(Math.min(1, k) * Math.PI);
      return blend(rest, {
        ...rest, bodyY: -3, torsoX: -0.12, headX: -0.3, shLX: -0.35, shLZ: 1.35, elL: -1.9, shRX: -0.35, shRZ: -1.35, elR: -1.9,
        cleaverX: aimWeapon(-2.25, -1.4), hookX: aimWeapon(-2.25, -1.4), bellyX: -0.12,
      }, e);
    }
    case 'pudge_dismember':
      return blend(castPose('pudge_dismember', 1)!, dismemberPose(t), smooth01(k));
    default:
      return null;
  }
}

const hasMod = (u: Unit | null, id: string): boolean => !!u?.modifiers.some((m) => m.def.id === id);
/** 帕吉的肉钩正在外面（sim 的 hookOut 计数） */
const hookOut = (u: Unit | null): boolean => (u?.ability('Q')?.data.hookOut ?? 0) > 0;

/** 按动画状态选姿势：站立 / 跑 / 普攻 / 引导用帕吉自己的；钩子在外面时右臂前伸、手里的钩子隐藏 */
export function pudgePose(tr: AnimTracker, t: number, u: Unit | null): Pose {
  let p: Pose;
  if (tr.state === 'idle') p = idlePose(t);
  else if (tr.state === 'run') p = runPose(tr.runPhase, t);
  else {
    // 引导：肢解啃咬；回城等其他引导用通用姿势（预览里没有 Unit，按肢解）
    const channel = (tt: number): Pose => (u && u.cast?.ability.def.id !== 'pudge_dismember' ? channelPose(tt, PUDGE_STANCE) : dismemberPose(tt));
    const own: OwnPoses = { attack: attackPose, cast: castPose, release: (kind, k) => releasePose(kind, k, t), channel };
    p = dispatchPose(tr, t, PUDGE_STANCE, own);
  }
  if (tr.taunted && (tr.state === 'idle' || tr.state === 'run')) addTauntShake(p, t);
  const alive = tr.state !== 'dead';
  const out = alive && hookOut(u);
  // 出钩后（busy）和钩子收回途中：右臂前伸拉着铁链
  if (out && tr.state !== 'stunned' && tr.state !== 'cast' && !(tr.state === 'release' && tr.release?.kind !== 'pudge_meat_hook')) {
    const pull = hasMod(u, 'pudge_hook_busy') ? 0 : 0.15 * Math.sin(t * 9);
    Object.assign(p, HOOK_HOLD, { shRX: HOOK_HOLD.shRX + pull, elR: HOOK_HOLD.elR - Math.abs(pull) });
  }
  p.hookHide = out ? 1 : 0;
  if (p.cleaverX === undefined) {
    const armL = (p.shLX ?? 0) + (p.elL ?? 0) + (p.handLX ?? 0);
    p.cleaverX = aimWeapon(armL, 0.55);
    p.cleaverZ = -0.2;
  }
  if (p.hookX === undefined) {
    const armR = (p.shRX ?? 0) + (p.elR ?? 0) + (p.handRX ?? 0);
    p.hookX = aimWeapon(armR, 0.5);
    p.hookZ = 0.25;
  }
  if (p.bellyX === undefined) p.bellyX = alive ? 0.03 * Math.sin(t * 1.6) : 0;
  return p;
}

export const PUDGE_RELEASE_DUR: Record<string, number> = { pudge_meat_hook: 0.45, pudge_rot: 0.5, pudge_meat_shield: 0.45, pudge_dismember: 0.25 };

export const PUDGE_SPEC: HeroModelSpec = {
  id: 'pudge',
  scale: PUDGE_SCALE,
  headHeight: 160,
  muzzleHeight: 110,
  bones: BONES,
  parts,
  bindRotations: PUDGE_BIND,
  pose: (tr, t, u) => pudgePose(tr, t, u),
  // 手里的钩子在肉钩飞出去时缩到看不见（bone 缩放作用于蒙皮顶点）
  apply: (b: Record<string, Bone>, p: Pose) => {
    applyHumanoid(b, p, PUDGE_BIND);
    const hide = Math.max(0, Math.min(1, p.hookHide ?? 0));
    b.hook?.scale.setScalar(1 - 0.999 * hide);
  },
  releaseDur: PUDGE_RELEASE_DUR,
  previewMoves: ['pudge_meat_hook', 'pudge_rot', 'pudge_meat_shield', 'pudge_dismember'],
  // 灰粉色的皮肤在缺省的奶白色边缘光下发白，换成很弱的暖粉色
  rim: { color: 0xffc8b8, strength: 0.14 },
};

registerHeroModel(PUDGE_SPEC);
