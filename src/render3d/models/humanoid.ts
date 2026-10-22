import { BufferGeometry, Float32BufferAttribute, Matrix3, Uint16BufferAttribute, Vector3, type Bone } from 'three';
import { type AnimTracker, type Pose, smooth01 } from '../anim';
import type { BoneDef, PartDef } from './heroModel';

/**
 * 共用人形骨骼：标准骨骼表、姿势通道 → 骨骼的映射、蒙皮网格合并，以及各英雄可以直接用的通用姿势。
 * 约定（与斧王一致）：模型面朝本地 +Z，本地 +X 是角色的左手边；手臂和腿默认竖直向下，绕 X 轴负方向转 = 向前摆。
 */

/** 人形比例（模型单位，缩放前）。全部有缺省值（斧王的比例） */
export interface Proportions {
  /** 骨盆离地高度 */
  hipY: number;
  /** 躯干骨骼在骨盆上方的高度 */
  waist: number;
  /** 躯干长度（躯干骨骼 → 脖子根） */
  torsoLen: number;
  /** 脖子长度（头骨骼 = 躯干骨骼上方 torsoLen + neck） */
  neck: number;
  /** 头骨骼的前后偏移 */
  headZ: number;
  shoulderX: number;
  /** 肩关节在躯干骨骼上方的高度 */
  shoulderY: number;
  upperArm: number;
  forearm: number;
  thighX: number;
  /** 大腿根在骨盆下方的偏移（负数） */
  thighY: number;
  thigh: number;
  shin: number;
}

export const DEFAULT_PROPORTIONS: Proportions = {
  hipY: 56, waist: 10, torsoLen: 50, neck: 8, headZ: 2, shoulderX: 35, shoulderY: 46, upperArm: 27, forearm: 25,
  thighX: 12, thighY: -6, thigh: 26, shin: 26,
};

/** 标准骨骼名（applyHumanoid 按固定通道驱动它们，其余骨骼按 `<名字>X/Y/Z` 通道） */
export const HUMANOID_BONES = [
  'body', 'pelvis', 'torso', 'head', 'shL', 'elL', 'handL', 'shR', 'elR', 'handR', 'thighL', 'shinL', 'thighR', 'shinR',
] as const;
const STANDARD = new Set<string>(HUMANOID_BONES);

/** 标准骨骼：body、pelvis、torso、head、shL、elL、handL、shR、elR、handR、thighL、shinL、thighR、shinR，再加 extra（武器、披风、翅膀、头发……） */
export function humanoidBones(p: Partial<Proportions> = {}, extra: BoneDef[] = []): BoneDef[] {
  const q = { ...DEFAULT_PROPORTIONS, ...p };
  return [
    ['body', null, [0, 0, 0]],
    ['pelvis', 'body', [0, q.hipY, 0]],
    ['torso', 'pelvis', [0, q.waist, 0]],
    ['head', 'torso', [0, q.torsoLen + q.neck, q.headZ]],
    ['shL', 'torso', [q.shoulderX, q.shoulderY, 0]],
    ['elL', 'shL', [0, -q.upperArm, 0]],
    ['handL', 'elL', [0, -q.forearm, 0]],
    ['shR', 'torso', [-q.shoulderX, q.shoulderY, 0]],
    ['elR', 'shR', [0, -q.upperArm, 0]],
    ['handR', 'elR', [0, -q.forearm, 0]],
    ['thighL', 'pelvis', [q.thighX, q.thighY, 0]],
    ['shinL', 'thighL', [0, -q.thigh, 0]],
    ['thighR', 'pelvis', [-q.thighX, q.thighY, 0]],
    ['shinR', 'thighR', [0, -q.thigh, 0]],
    ...extra,
  ];
}

/**
 * 标准通道：bodyY bodyZ bodyX bodyRoll sink pelvisY torsoX/Y/Z headX/Y/Z shLX/Y/Z elL handLX shRX/Y/Z elR handRX hipL/hipLZ kneeL hipR/hipRZ kneeR，
 * 以及 extra 骨骼的 `<骨骼名>X/Y/Z` 通道（自动按名字映射，叠加在 bindRotations 之上）。缺少的骨骼（例如斧王没有手骨骼）跳过。
 * body 的位置总是 (0, bodyY − sink, bodyZ)；body 的 Y 旋转留给 spin（不在这里设置）。
 */
export function applyHumanoid(b: Record<string, Bone>, p: Pose, bind?: Record<string, [number, number, number]>): void {
  const g = (k: string) => p[k] ?? 0;
  const set = (name: string, x: number, y: number, z: number) => {
    const bn = b[name];
    if (!bn) return;
    const r = bind?.[name];
    if (r) bn.rotation.set(r[0] + x, r[1] + y, r[2] + z);
    else bn.rotation.set(x, y, z);
  };
  const body = b.body;
  if (body) {
    body.position.set(0, g('bodyY') - g('sink'), g('bodyZ'));
    body.rotation.x = g('bodyX');
    body.rotation.z = g('bodyRoll');
  }
  set('pelvis', 0, g('pelvisY'), 0);
  set('torso', g('torsoX'), g('torsoY'), g('torsoZ'));
  set('head', g('headX'), g('headY'), g('headZ'));
  set('shL', g('shLX'), g('shLY'), g('shLZ'));
  set('elL', g('elL'), 0, 0);
  set('handL', g('handLX'), 0, 0);
  set('shR', g('shRX'), g('shRY'), g('shRZ'));
  set('elR', g('elR'), 0, 0);
  set('handR', g('handRX'), 0, 0);
  set('thighL', g('hipL'), 0, g('hipLZ'));
  set('shinL', g('kneeL'), 0, 0);
  set('thighR', g('hipR'), 0, g('hipRZ'));
  set('shinR', g('kneeR'), 0, 0);
  for (const name in b) {
    if (STANDARD.has(name)) continue;
    set(name, g(`${name}X`), g(`${name}Y`), g(`${name}Z`));
  }
}

/**
 * 把挂在各骨骼上的部件按绑定姿势（调用前已摆好、已更新世界矩阵）变换到模型空间并合并，
 * 每个顶点写入 skinIndex = 所属骨骼、skinWeight = 1（刚性绑定）。
 */
export function buildSkinnedGeometry(bones: Record<string, Bone>, list: Bone[], parts: PartDef[]): BufferGeometry {
  const pos: number[] = [], nrm: number[] = [], col: number[] = [], si: number[] = [], sw: number[] = [];
  const v = new Vector3();
  const n = new Vector3();
  const nm = new Matrix3();
  for (const [name, build] of parts) {
    const bone = bones[name];
    if (!bone) throw new Error(`部件挂在不存在的骨骼上: ${name}`);
    const g = build();
    const m = bone.matrixWorld;
    nm.getNormalMatrix(m);
    const idx = list.indexOf(bone);
    const pa = g.attributes.position, na = g.attributes.normal, ca = g.attributes.color;
    for (let i = 0; i < pa.count; i++) {
      v.fromBufferAttribute(pa, i).applyMatrix4(m);
      n.fromBufferAttribute(na, i).applyMatrix3(nm).normalize();
      pos.push(v.x, v.y, v.z);
      nrm.push(n.x, n.y, n.z);
      col.push(ca.getX(i), ca.getY(i), ca.getZ(i));
      si.push(idx, 0, 0, 0);
      sw.push(1, 0, 0, 0);
    }
    g.dispose();
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new Float32BufferAttribute(nrm, 3));
  geo.setAttribute('color', new Float32BufferAttribute(col, 3));
  geo.setAttribute('skinIndex', new Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new Float32BufferAttribute(sw, 4));
  geo.computeBoundingSphere();
  return geo;
}

// ---------- 通用姿势 ----------

/** 体态：武器在哪只手、驼背程度、手臂张开程度、笨重程度（0 轻盈 … 1 笨重） */
export interface Stance {
  weaponHand: 'R' | 'L' | 'both' | 'none';
  hunch: number;
  armSpread: number;
  heavy: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** 手臂的"持握"基础姿势：拿武器的手前伸弯肘，空手自然下垂 */
function armRest(s: Stance, br: number): Pose {
  const spread = 0.12 + 0.3 * s.armSpread;
  const hold = { X: -0.3, el: -1.15 };
  const free = { X: 0.06, el: -0.3 - 0.2 * s.heavy };
  const l = s.weaponHand === 'L' || s.weaponHand === 'both' ? hold : free;
  const r = s.weaponHand === 'R' || s.weaponHand === 'both' ? hold : free;
  return {
    shLX: l.X + (s.weaponHand === 'both' ? -0.1 : 0), shLZ: spread + br * 0.03, elL: l.el,
    shRX: r.X + (s.weaponHand === 'both' ? -0.1 : 0), shRZ: -spread - br * 0.03, elR: r.el,
  };
}

/** 站立：呼吸起伏（笨重的角色呼吸更慢、蹲得更低） */
export function idlePose(t: number, s: Stance): Pose {
  const br = Math.sin(t * (2.4 - 0.6 * s.heavy));
  return {
    bodyY: -1 - 2 * s.heavy + br * (0.6 + 0.4 * s.heavy),
    torsoX: 0.04 + 0.3 * s.hunch + br * 0.025,
    headX: -0.04 - 0.2 * s.hunch - br * 0.02,
    ...armRest(s, br),
    hipLZ: 0.06 + 0.08 * s.heavy, hipRZ: -0.06 - 0.08 * s.heavy, hipL: -0.06, hipR: 0.06,
    kneeL: 0.1 + 0.12 * s.heavy, kneeR: 0.12 + 0.12 * s.heavy,
  };
}

/** 跑步：步态相位 ph（弧度）；笨重的角色左右摇摆、步子小，轻盈的角色前倾更多 */
export function runPose(ph: number, s: Stance): Pose {
  const sn = Math.sin(ph);
  const c = Math.cos(ph);
  const swing = 1 - 0.35 * s.heavy;
  const wl = s.weaponHand === 'L' || s.weaponHand === 'both';
  const wr = s.weaponHand === 'R' || s.weaponHand === 'both';
  return {
    bodyY: Math.abs(c) * (4 - 2 * s.heavy) - 3,
    bodyRoll: 0.12 * s.heavy * sn,
    torsoX: 0.22 + 0.15 * s.hunch + 0.1 * (1 - s.heavy), torsoY: 0.14 * sn * swing, pelvisY: -0.12 * sn * swing,
    headX: -0.12 - 0.15 * s.hunch,
    shLX: wl ? -0.4 + 0.3 * sn : 0.65 * sn * swing, shLZ: 0.15 + 0.2 * s.armSpread, elL: wl ? -1.1 : -0.75,
    shRX: wr ? -0.4 - 0.3 * sn : -0.65 * sn * swing, shRZ: -0.15 - 0.2 * s.armSpread, elR: wr ? -1.1 : -0.75,
    hipL: -0.8 * sn * swing, kneeL: 0.3 + 0.75 * Math.max(0, c) * swing,
    hipR: 0.8 * sn * swing, kneeR: 0.3 + 0.75 * Math.max(0, -c) * swing,
    hipLZ: 0.05 + 0.08 * s.heavy, hipRZ: -0.05 - 0.08 * s.heavy,
  };
}

/** 眩晕：弯腰低头摇晃 */
export function stunnedPose(t: number): Pose {
  return {
    bodyY: -6, torsoX: 0.32 + 0.05 * Math.sin(t * 5), torsoZ: 0.14 * Math.sin(t * 3),
    headX: 0.5, headZ: 0.15 * Math.sin(t * 3 + 1),
    shLX: 0.15, shLZ: 0.15, elL: -0.2, shRX: 0.05, shRZ: -0.15, elR: -0.6,
    kneeL: 0.4, kneeR: 0.4, hipL: -0.2, hipR: -0.2,
  };
}

/** 引导 / 回城：双手前伸、掌心向前，身体轻微起伏 */
export function channelPose(t: number, s: Stance): Pose {
  const br = Math.sin(t * 3);
  return {
    bodyY: -3 - 2 * s.heavy + br, torsoX: 0.12 + 0.2 * s.hunch, headX: -0.1,
    shLX: -1.15 + br * 0.05, shLZ: 0.25 + 0.2 * s.armSpread, elL: -0.45,
    shRX: -1.15 - br * 0.05, shRZ: -0.25 - 0.2 * s.armSpread, elR: -0.45,
    hipL: -0.25, kneeL: 0.35, hipR: 0.2, kneeR: 0.3, hipLZ: 0.12, hipRZ: -0.12,
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

/** 没有专门动作的技能前摇：蓄力后双手前推（p = 进度 0..1） */
export function castGenericPose(p: number, s: Stance): Pose {
  const e = smooth01(p);
  return {
    bodyY: -3 * e, torsoX: lerp(0.04 + 0.3 * s.hunch, 0.25, e), headX: -0.1 * e,
    shLX: lerp(0.06, -1.35, e), shLZ: 0.2 + 0.2 * s.armSpread, elL: lerp(-0.3, -0.25, e),
    shRX: lerp(0.06, -1.35, e), shRZ: -0.2 - 0.2 * s.armSpread, elR: lerp(-0.3, -0.25, e),
    hipL: -0.3 * e, kneeL: 0.3 * e, hipR: 0.25 * e, kneeR: 0.35 * e, hipLZ: 0.1, hipRZ: -0.1,
  };
}

/** 没有专门动作的技能释放：保持前推，然后收回（k = 进度 0..1） */
export function releaseGenericPose(k: number, s: Stance): Pose {
  const w = 1 - smooth01((k - 0.35) / 0.65);
  return blend2(idlePose(0, s), castGenericPose(1, s), w);
}

/** 被钩 / 被击退：浮空挣扎（在眩晕姿势上叠加身体后仰、四肢乱蹬） */
export function strugglePose(base: Pose, t: number): Pose {
  const p = { ...base };
  const add = (k: string, v: number) => (p[k] = (p[k] ?? 0) + v);
  add('bodyX', -0.38);
  add('torsoX', -0.25);
  add('headX', -0.45);
  add('shLX', -0.7 + 0.5 * Math.sin(t * 14));
  add('shLZ', 0.5);
  add('shRX', -0.7 + 0.5 * Math.sin(t * 14 + 2));
  add('shRZ', -0.5);
  add('hipL', -0.35 + 0.4 * Math.sin(t * 12));
  add('hipR', -0.35 + 0.4 * Math.sin(t * 12 + 2.5));
  add('kneeL', 0.3);
  add('kneeR', 0.3);
  return p;
}

function blend2(a: Pose, b: Pose, k: number): Pose {
  const out: Pose = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) out[key] = (a[key] ?? 0) * (1 - k) + (b[key] ?? 0) * k;
  return out;
}

/** 被嘲讽：怒气冲冲地摇晃（原地修改） */
export function addTauntShake(p: Pose, t: number): Pose {
  p.torsoZ = (p.torsoZ ?? 0) + 0.09 * Math.sin(t * 11);
  p.headZ = (p.headZ ?? 0) + 0.12 * Math.sin(t * 11 + 1);
  return p;
}

/** 英雄自己的动作函数（dispatchPose 用）；cast / release 返回 null 时用通用动作 */
export interface OwnPoses {
  attack(p: number): Pose;
  cast(id: string, p: number): Pose | null;
  release(kind: string, k: number): Pose | null;
  channel?(t: number): Pose;
}

/**
 * 通用的状态分派：dead / stunned（位移中 = 浮空挣扎）/ channel / run / idle 走上面的通用函数，attack / cast / release 交给英雄自己的函数。
 * 普攻收招时从命中姿势淡回站立（与斧王一致）。
 */
export function dispatchPose(tr: AnimTracker, t: number, s: Stance, own: OwnPoses): Pose {
  let p: Pose;
  switch (tr.state) {
    case 'dead':
      return deathPose(Math.max(0, tr.deadTime));
    case 'stunned':
      p = tr.motion ? strugglePose(stunnedPose(t), t) : stunnedPose(t);
      break;
    case 'release':
      p = own.release(tr.release!.kind, tr.releaseK) ?? releaseGenericPose(tr.releaseK, s);
      break;
    case 'cast':
      p = own.cast(tr.castAbility ?? '', tr.castProgress) ?? castGenericPose(tr.castProgress, s);
      break;
    case 'channel':
      p = own.channel ? own.channel(t) : channelPose(t, s);
      break;
    case 'attack':
      p = tr.swing >= 0 ? own.attack(tr.swing) : blend2(idlePose(t, s), own.attack(1), tr.backswingK);
      break;
    case 'run':
      p = runPose(tr.runPhase, s);
      break;
    default:
      p = idlePose(t, s);
  }
  if (tr.taunted) addTauntShake(p, t);
  return p;
}
