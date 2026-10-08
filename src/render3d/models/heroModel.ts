import { Bone, Group, Skeleton, SkinnedMesh, type BufferGeometry, type Material, type Object3D } from 'three';
import type { Unit } from '../../sim/entities/unit';
import { type AnimTracker, type Pose, smooth01 } from '../anim';
import { applyHumanoid, buildSkinnedGeometry } from './humanoid';
import { cachedGeo } from './rig';

/** 骨骼表的一行：名字、父骨骼、相对父骨骼的位置（模型单位，缩放前） */
export type BoneDef = [name: string, parent: string | null, pos: [number, number, number]];
/** 部件：挂在哪根骨骼上 + 生成几何体（骨骼局部坐标） */
export type PartDef = [bone: string, build: () => BufferGeometry];

/**
 * 英雄模型的描述：骨骼、部件、姿势和动作表。每个英雄一个 spec（`models/<id>.ts`），在 registry 注册，
 * 渲染器按 `u.defId` 找到它，用 SkinnedHeroModel 搭成一个蒙皮网格（一个英雄 1 次绘制）。
 */
export interface HeroModelSpec {
  /** = 英雄 id */
  id: string;
  /** 模型整体缩放（斧王 1.3） */
  scale: number;
  /** 未缩放的头顶高度（血条锚点 = headHeight × scale） */
  headHeight: number;
  /** 普攻 / 技能弹道的出手高度（世界单位） */
  muzzleHeight: number;
  bones: BoneDef[];
  parts(team: number): PartDef[];
  /** 合并网格前写入骨骼的旋转（武器握持角度），键 = 骨骼名，值 = [x, y, z] */
  bindRotations?: Record<string, [number, number, number]>;
  /** 按动画状态返回姿势（u 用来读 Modifier，例如剑刃风暴、模糊）；预览里 u 为 null */
  pose(tr: AnimTracker, t: number, u: Unit | null): Pose;
  /** 姿势通道 → 骨骼；缺省 applyHumanoid */
  apply?(b: Record<string, Bone>, p: Pose): void;
  /** 技能 cast 事件 → 一次性释放动作的时长（秒），key = 技能 id */
  releaseDur: Record<string, number>;
  /** fx 事件 → 一次性动作（斧王 'axe_helix' → { kind: 'helix', dur: 0.38 }） */
  fxTriggers?: Record<string, { kind: string; dur: number }>;
  /** 不参与混合的整体旋转（反击螺旋、剑刃风暴），弧度 */
  spin?(tr: AnimTracker, t: number, u: Unit | null): number;
  /** 选人预览里循环播放的动作：技能 id（前摇 + 释放）或 fxTriggers 的键（一次性动作）；缺省 releaseDur 的键 */
  previewMoves?: string[];
}

/**
 * 按 spec 搭建的蒙皮英雄模型：所有部件按绑定姿势合并成一个刚性蒙皮网格（每个顶点 100% 绑定到所属骨骼）。
 * 几何体按"英雄 + 阵营"缓存共享；material 由调用方提供（每个英雄一份，用来做受击闪光 / 半透明）。
 * root（朝向、缩放）→ 蒙皮网格 → body（整体起伏 / 倒地 / 旋转）→ …
 */
export class SkinnedHeroModel {
  readonly root = new Group();
  readonly mesh: SkinnedMesh;
  private readonly b: Record<string, Bone> = {};
  private readonly body: Bone;
  private last: Pose = {};
  private from: Pose = {};

  constructor(readonly spec: HeroModelSpec, team: number, mat: Material) {
    const list: Bone[] = [];
    for (const [name, parent, p] of spec.bones) {
      const bn = new Bone();
      bn.name = name;
      bn.position.set(p[0], p[1], p[2]);
      if (parent) this.b[parent].add(bn);
      this.b[name] = bn;
      list.push(bn);
    }
    const rootBone = list.find((bn) => !bn.parent);
    if (!rootBone) throw new Error(`模型 ${spec.id} 没有根骨骼`);
    this.body = this.b.body ?? rootBone;
    // 绑定姿势：骨骼旋转全为 0，武器等按 bindRotations（与 apply 的基准一致）
    for (const [name, r] of Object.entries(spec.bindRotations ?? {})) this.b[name]?.rotation.set(r[0], r[1], r[2]);
    rootBone.updateMatrixWorld(true);
    const geo = cachedGeo(`${spec.id}:skinned:${team}`, () => buildSkinnedGeometry(this.b, list, spec.parts(team)));
    this.mesh = new SkinnedMesh(geo, mat);
    this.mesh.add(rootBone);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.root.add(this.mesh);
    this.root.updateMatrixWorld(true);
    this.mesh.bind(new Skeleton(list));
    this.root.scale.setScalar(spec.scale);
  }

  /** 按动画状态摆姿势。time：动画时间；idPhase：每个单位不同的相位偏移；状态切换时从上一帧的姿势过渡到新姿势 */
  pose(tr: AnimTracker, time: number, idPhase: number, u: Unit | null): void {
    const target = this.spec.pose(tr, time + idPhase, u);
    if (tr.blend < 1) {
      if (tr.stateTime === 0) this.from = { ...this.last };
      const k = smooth01(tr.blend);
      for (const key of new Set([...Object.keys(this.from), ...Object.keys(target)])) {
        target[key] = (this.from[key] ?? 0) * (1 - k) + (target[key] ?? 0) * k;
      }
    }
    this.last = target;
    if (this.spec.apply) this.spec.apply(this.b, target);
    else applyHumanoid(this.b, target, this.spec.bindRotations);
    // 整体旋转不参与混合（否则结束时会倒转回去）
    this.body.rotation.y = this.spec.spin?.(tr, time + idPhase, u) ?? 0;
  }

  /** 头顶（血条锚点）离地高度（世界单位，不含弹出动画） */
  get headHeightWorld(): number {
    return this.spec.headHeight * this.spec.scale;
  }

  /** 所有骨骼（调试 / 测试 / 特效挂点） */
  get bones(): Readonly<Record<string, Object3D>> {
    return this.b;
  }

  dispose(): void {
    this.mesh.skeleton.dispose();
  }
}
