import type { Unit } from '../sim/entities/unit';
import { DT } from '../sim/core/constants';
import { abilityCastPoint } from '../sim/systems/abilities';

/**
 * 动画状态选择和计时（纯逻辑，不依赖 Three）。每个单位的外观对象持有一个 AnimTracker，
 * 每帧从 Unit 读出 AnimInput 更新它；模型再按 tracker 的状态和进度摆姿势。
 */
export type AnimState = 'idle' | 'run' | 'attack' | 'cast' | 'release' | 'channel' | 'stunned' | 'dead';

export interface AnimInput {
  alive: boolean;
  /** 实际移动速度（世界单位 / 秒，按上一逻辑帧的位移算） */
  speed: number;
  /** 普攻前摇剩余时间（-1 = 不在前摇） */
  windup: number;
  attackPoint: number;
  /** 正在前摇的技能 id */
  castAbility: string | null;
  /** 技能前摇进度 0..1 */
  castProgress: number;
  channel: boolean;
  stunned: boolean;
  taunted: boolean;
}

/** 两次普攻之间的收招时间上限（秒） */
export const BACKSWING = 0.32;
/** 状态切换时的姿势过渡时间（秒） */
export const BLEND_TIME = 0.14;
/** 速度超过这个值才算在跑 */
export const RUN_SPEED = 40;
/** 跑步时一个完整步态周期走过的距离（世界单位，乘以模型缩放） */
export const STRIDE = 150;

/** 从 Unit 读动画输入（只读） */
export function animInput(u: Unit): AnimInput {
  const dx = u.pos.x - u.prevPos.x;
  const dy = u.pos.y - u.prevPos.y;
  const c = u.cast;
  // 含施法速度（例如影魔 25 级天赋），与 sim 的前摇计时一致
  const castPoint = c ? abilityCastPoint(u, c.ability) : 0;
  return {
    alive: u.alive,
    speed: Math.hypot(dx, dy) / DT,
    windup: u.attack.windup,
    attackPoint: u.stats.attackPoint,
    castAbility: c && c.phase === 'point' ? c.ability.def.id : null,
    castProgress: c && c.phase === 'point' && castPoint > 0 ? Math.max(0, Math.min(1, 1 - c.timer / castPoint)) : 0,
    channel: c?.phase === 'channel' || u.order.kind === 'recall',
    stunned: u.hasState('stunned'),
    taunted: u.stats.tauntedBy !== null,
  };
}

/**
 * 普攻前摇进度 0..1（1 = 出手的那一刻）。windup 每个逻辑帧减少 DT，用插值系数 alpha 估计两帧之间的值，动作更平滑。
 */
export function windupProgress(windup: number, attackPoint: number, alpha: number): number {
  if (windup < 0 || attackPoint <= 0) return -1;
  return Math.max(0, Math.min(1, 1 - (windup - alpha * DT) / attackPoint));
}

/** 状态优先级：死亡 > 眩晕 > 技能收招 > 技能前摇 > 引导 > 普攻（前摇或收招） > 跑 > 站立 */
export function selectState(i: AnimInput, attacking: boolean, releasing: boolean): AnimState {
  if (!i.alive) return 'dead';
  if (i.stunned) return 'stunned';
  if (releasing) return 'release';
  if (i.castAbility) return 'cast';
  if (i.channel) return 'channel';
  if (attacking) return 'attack';
  if (i.speed > RUN_SPEED) return 'run';
  return 'idle';
}

export const smooth01 = (t: number): number => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};

export class AnimTracker {
  state: AnimState = 'idle';
  /** 进入当前状态后经过的时间 */
  stateTime = 0;
  /** 状态过渡进度 0..1（1 = 完全是新状态的姿势） */
  blend = 1;
  /** 跑步相位（弧度） */
  runPhase = 0;
  /** 平滑后的移动速度 */
  speed = 0;
  /** 普攻前摇进度 0..1（-1 = 不在前摇） */
  swing = -1;
  /** 收招剩余时间 */
  backswing = 0;
  /** 收招的总时长（随攻速变化） */
  backswingTotal = BACKSWING;
  /** 技能收招 / 反击螺旋等一次性动作 */
  release: { kind: string; t: number; dur: number } | null = null;
  castAbility: string | null = null;
  castProgress = 0;
  taunted = false;
  /** 死亡后经过的时间（-1 = 活着） */
  deadTime = -1;
  /** 受击闪光（1 → 0） */
  flash = 0;
  /** 复活 / 出生的弹出动画（1 → 0） */
  pop = 0;
  private prevWindup = -1;

  /** 一次性动作：技能释放（kind = 技能 id）、反击螺旋（'helix'） */
  trigger(kind: string, dur: number): void {
    this.release = { kind, t: 0, dur };
  }

  hit(): void {
    this.flash = 1;
  }

  /**
   * 每个渲染帧调用。dt：真实帧时间（暂停时为 0）；alpha：逻辑帧插值系数；stride：步态周期长度（世界单位）。
   * 普攻出手的判定：上一帧还在前摇、而且剩余时间已经不到两个逻辑帧，这一帧前摇结束 → 进入收招。
   */
  update(i: AnimInput, dt: number, alpha: number, stride = STRIDE): void {
    if (dt <= 0) return;
    this.speed += (i.speed - this.speed) * (1 - Math.exp(-dt * 12));
    if (this.speed > 5) this.runPhase = (this.runPhase + (this.speed * dt * Math.PI * 2) / stride) % (Math.PI * 2);
    this.swing = windupProgress(i.windup, i.attackPoint, alpha);
    if (this.prevWindup >= 0 && i.windup < 0 && this.prevWindup <= DT * 2 + 1e-6 && i.alive) {
      this.backswingTotal = Math.min(BACKSWING, Math.max(0.15, i.attackPoint * 0.8));
      this.backswing = this.backswingTotal;
    }
    // 前摇被打断（走开、目标消失）时不播收招
    if (i.windup >= 0) this.backswing = 0;
    this.prevWindup = i.windup;
    this.backswing = Math.max(0, this.backswing - dt);
    if (this.release) {
      this.release.t += dt;
      if (this.release.t >= this.release.dur) this.release = null;
    }
    if (!i.alive) this.release = null;
    this.castAbility = i.castAbility;
    this.castProgress = i.castProgress;
    this.taunted = i.taunted;
    this.flash = Math.max(0, this.flash - dt * 6);
    this.pop = Math.max(0, this.pop - dt * 2.5);
    if (i.alive) this.deadTime = -1;
    else this.deadTime = this.deadTime < 0 ? 0 : this.deadTime + dt;

    const attacking = this.swing >= 0 || this.backswing > 0;
    const next = selectState(i, attacking, !!this.release);
    if (next !== this.state) {
      this.state = next;
      this.stateTime = 0;
      this.blend = 0;
    } else {
      this.stateTime += dt;
    }
    this.blend = Math.min(1, this.blend + dt / BLEND_TIME);
  }

  /** 收招进度 1 → 0（1 = 刚出手） */
  get backswingK(): number {
    return this.backswingTotal > 0 ? this.backswing / this.backswingTotal : 0;
  }

  /** 一次性动作的进度 0..1 */
  get releaseK(): number {
    return this.release ? Math.min(1, this.release.t / this.release.dur) : 1;
  }
}

/** 姿势：骨骼名 → 旋转（弧度）/ 位移，未列出的通道为 0 */
export type Pose = Record<string, number>;

/** 两个姿势按 t 线性混合（缺失的通道当作 0），结果写入 out */
export function blendPose(a: Pose, b: Pose, t: number, out: Pose = {}): Pose {
  for (const k in out) out[k] = 0;
  for (const k in a) out[k] = a[k] * (1 - t);
  for (const k in b) out[k] = (out[k] ?? 0) + b[k] * t;
  return out;
}

/** 朝向的平滑转身：沿最短方向转，rate = 弧度 / 秒 */
export function turnToward(cur: number, target: number, rate: number, dt: number): number {
  let d = target - cur;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  const step = rate * dt;
  return Math.abs(d) <= step ? target : cur + Math.sign(d) * step;
}
