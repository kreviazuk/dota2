import type { Command } from '../sim/commands';
import type { Match } from '../game/match';
import type { ViewCamera } from '../render/view';
import type { AimIndicator } from '../render/view';
import type { Hud } from '../ui/hud';
import type { Vec2 } from '../sim/core/vec2';
import { dist } from '../sim/core/vec2';
import type { AbilitySlot } from '../sim/core/types';
import type { Unit } from '../sim/entities/unit';
import type { AbilityInstance } from '../sim/heroes/types';
import { canLearn } from '../sim/systems/progress';
import { pendingTalentTier } from '../sim/talents';
import { nextSkillToLearn, TALENT_BUILDS } from '../ai/builds';
import type { Prefs } from '../ui/settings';
import { dirChanged, dragToAim, joystickVector } from './aimMath';
import { aimAbility, pointCastTarget, type AimResult } from './aim';

/** 从按下点拖动超过这个距离（CSS 像素）才算手动瞄准，否则松手时智能施法 */
const DRAG_THRESHOLD = 16;
/** 拖满施法距离所需的拖动距离：屏高的 20%，限制在 60–130 像素 */
const aimMaxDrag = (): number => Math.max(60, Math.min(130, window.innerHeight * 0.2));
/** 摇杆方向变化超过这个角度（弧度）才发新的移动指令 */
const JOY_DIR_EPS = 0.08;
/** 按住普攻键时重新下智能攻击指令的间隔（游戏秒） */
const ATTACK_REPEAT = 0.5;

/**
 * 轻点技能键（或键盘施法）时下的指令：开关技能 → toggle；无目标技能在摇杆 / 方向键按着时带上当前方向
 * （神圣一跳朝移动方向跳）；其他技能走智能施法。被动或没学会返回 null。
 */
export function castCommandFor(u: Unit, ab: AbilityInstance, heldDir: Vec2 | null): Command | null {
  if (!u.alive) return null;
  if (ab.level <= 0 || ab.def.targetType === 'passive') return null;
  const slot = ab.def.slot;
  if (slot === 'innate') return null;
  if (ab.def.targetType === 'toggle') return { type: 'toggle', slot };
  if (ab.def.targetType === 'none' && heldDir && (heldDir.x || heldDir.y)) return { type: 'cast', slot, target: { dir: { x: heldDir.x, y: heldDir.y } } };
  return { type: 'cast', slot };
}

/**
 * 摇杆 / 方向键一直按着、英雄却停下来了（施法前摇结束后指令变回 idle、攻击目标死亡、回城结束……）时，
 * 重新按按住的方向走；否则拇指还推着摇杆，英雄却站着不动，要松开再推一次。施法中（含引导）、
 * 不接受指令（busy：无敌斩、肉钩出钩）时不发（否则每帧都推一个被丢弃的移动指令）。
 */
export function heldMoveCommand(u: Unit, heldDir: Vec2 | null): Command | null {
  if (!heldDir || (!heldDir.x && !heldDir.y) || !u.alive || u.cast || u.hasState('busy') || u.order.kind !== 'idle') return null;
  return { type: 'move', dir: { x: heldDir.x, y: heldDir.y } };
}

interface AimState {
  slot: AbilitySlot;
  pointerId: number;
  /** 按下的位置：拖动方向和距离都相对它计算 */
  start: Vec2;
  current: Vec2;
  dragging: boolean;
}

/**
 * 触屏（摇杆 + 按钮）和键鼠输入 → Command 队列。主循环每个逻辑帧调用一次 drain()。
 * 手动瞄准时 aim 是给渲染器画的指示器。
 */
export class Controls {
  aim: AimIndicator | null = null;
  private queue: Command[] = [];
  private joyPointer: number | null = null;
  private joyOrigin: Vec2 = { x: 0, y: 0 };
  private joyDir: Vec2 | null = null;
  private keyDir: Vec2 | null = null;
  private aimState: AimState | null = null;
  private keys = new Set<string>();
  private mouse: Vec2 | null = null;
  private attackHeldUntil = 0;
  private attackHeld = false;
  private offs: (() => void)[] = [];

  constructor(private readonly hud: Hud, private readonly match: Match, private readonly camera: ViewCamera, private readonly prefs: Prefs) {
    this.bindJoystick();
    this.bindButtons();
    this.bindSkills();
    this.bindTalents();
    this.bindKeyboard();
  }

  private on<K extends keyof WindowEventMap>(el: HTMLElement | Window, type: K, fn: (e: WindowEventMap[K]) => void): void {
    el.addEventListener(type, fn as EventListener);
    this.offs.push(() => el.removeEventListener(type, fn as EventListener));
  }

  private player() {
    return this.match.world.getUnit(this.match.playerUnitId);
  }

  private push(c: Command): void {
    this.queue.push(c);
  }

  /** 正在按着的移动方向（摇杆优先，其次方向键） */
  private heldDir(): Vec2 | null {
    return this.joyDir ?? this.keyDir;
  }

  /** 自动加点：有技能点就按 AI 的加点顺序学，有待选天赋就按 AI 的天赋预设选（每个逻辑帧最多各一条） */
  private autoLevel(u: Unit): void {
    const h = u.hero;
    if (!h) return;
    const slot = nextSkillToLearn(u);
    if (slot) this.push({ type: 'learn', slot });
    const tier = pendingTalentTier(this.match.world, u);
    if (tier !== null) this.push({ type: 'pickTalent', tier, side: TALENT_BUILDS[u.defId]?.[tier] ?? 0 });
  }

  drain(): Command[] {
    const u = this.player();
    if (u) {
      u.autoAttack = this.prefs.autoAttack;
      if (this.prefs.autoLevel) this.autoLevel(u);
      // 这一帧没有别的指令时才补发（同一帧刚点的技能不能被移动指令顶掉）
      const move = this.queue.length === 0 ? heldMoveCommand(u, this.heldDir()) : null;
      if (move) this.push(move);
    }
    if (this.attackHeld && this.match.world.time >= this.attackHeldUntil) {
      this.push({ type: 'attack', mode: 'smart' });
      this.attackHeldUntil = this.match.world.time + ATTACK_REPEAT;
    }
    const q = this.queue;
    this.queue = [];
    return q;
  }

  /**
   * 暂停 / 继续时调用：丢弃还没执行的指令和所有按住中的输入（摇杆、普攻键、瞄准、按键），
   * 并让英雄停止摇杆移动（松开摇杆的指令可能在暂停期间被丢弃）。
   */
  reset(): void {
    this.queue = [{ type: 'move', dir: null }];
    this.joyPointer = null;
    this.joyDir = null;
    this.keyDir = null;
    this.keys.clear();
    this.resetJoystickVisual();
    this.releaseAttack();
    this.endAim();
  }

  destroy(): void {
    for (const f of this.offs) f();
    this.offs = [];
  }

  // ---------- 摇杆 ----------
  private resetJoystickVisual(): void {
    this.hud.joyKnob.style.transform = '';
    this.hud.joyBase.style.left = '';
    this.hud.joyBase.style.top = '';
    this.hud.joyBase.classList.remove('active');
  }

  private bindJoystick(): void {
    const zone = this.hud.joyZone;
    const base = this.hud.joyBase;
    const radius = () => base.getBoundingClientRect().width / 2 || 60;
    const setKnob = (x: number, y: number) => {
      this.hud.joyKnob.style.transform = `translate(${x}px, ${y}px)`;
    };
    this.on(zone, 'pointerdown', (e) => {
      e.preventDefault();
      if (this.joyPointer !== null) return;
      this.joyPointer = e.pointerId;
      zone.setPointerCapture(e.pointerId);
      const r = zone.getBoundingClientRect();
      this.joyOrigin = { x: e.clientX, y: e.clientY };
      base.style.left = `${e.clientX - r.left}px`;
      base.style.top = `${e.clientY - r.top}px`;
      base.classList.add('active');
      setKnob(0, 0);
    });
    this.on(zone, 'pointermove', (e) => {
      if (e.pointerId !== this.joyPointer) return;
      const v = joystickVector(e.clientX - this.joyOrigin.x, e.clientY - this.joyOrigin.y, radius());
      setKnob(v.knob.x, v.knob.y);
      if (dirChanged(this.joyDir, v.dir, JOY_DIR_EPS)) {
        this.joyDir = v.dir;
        this.push({ type: 'move', dir: v.dir });
      }
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.joyPointer) return;
      this.joyPointer = null;
      this.joyDir = null;
      this.resetJoystickVisual();
      this.push({ type: 'move', dir: null });
    };
    this.on(zone, 'pointerup', end);
    this.on(zone, 'pointercancel', end);
  }

  // ---------- 普攻 / 补刀 / 推塔 / 回城 ----------
  private releaseAttack(): void {
    this.attackHeld = false;
    this.hud.attackBtn.classList.remove('held');
  }

  private bindButtons(): void {
    this.on(this.hud.attackBtn, 'pointerdown', (e) => {
      e.preventDefault();
      // 立即下一次指令（快速轻点时按下和松开可能落在同一个逻辑帧之间），按住期间每 0.5 秒重新选目标
      this.push({ type: 'attack', mode: 'smart' });
      this.attackHeld = true;
      this.attackHeldUntil = this.match.world.time + ATTACK_REPEAT;
      this.hud.attackBtn.classList.add('held');
    });
    const release = () => this.releaseAttack();
    this.on(this.hud.attackBtn, 'pointerup', release);
    this.on(this.hud.attackBtn, 'pointercancel', release);
    this.on(this.hud.attackBtn, 'pointerleave', release);
    const tap = (el: HTMLElement, cmd: Command) =>
      this.on(el, 'pointerdown', (e) => {
        e.preventDefault();
        this.push({ ...cmd });
      });
    tap(this.hud.lastHitBtn, { type: 'attack', mode: 'lastHit' });
    tap(this.hud.pushBtn, { type: 'attack', mode: 'building' });
    tap(this.hud.recallBtn, { type: 'recall' });
  }

  // ---------- 技能键：轻点智能施法，拖动瞄准，"+" 加点 ----------
  private bindSkills(): void {
    for (const b of this.hud.skills) {
      this.on(b.learn, 'pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.push({ type: 'learn', slot: b.slot });
      });
      this.on(b.root, 'pointerdown', (e) => {
        e.preventDefault();
        if (this.aimState) return;
        const u = this.player();
        const ab = u?.ability(b.slot);
        if (!u?.hero || !ab) return;
        if (ab.level === 0) {
          // 还没学的技能：整个按钮都当作"+"
          if (u.hero.skillPoints > 0 && canLearn(u.hero.level, ab)) this.push({ type: 'learn', slot: b.slot });
          return;
        }
        if (ab.def.targetType === 'passive') return;
        if (ab.def.targetType === 'toggle') {
          this.push({ type: 'toggle', slot: b.slot });
          return;
        }
        b.root.setPointerCapture(e.pointerId);
        const p = { x: e.clientX, y: e.clientY };
        this.aimState = { slot: b.slot, pointerId: e.pointerId, start: p, current: p, dragging: false };
        b.root.classList.add('aiming');
      });
      this.on(b.root, 'pointermove', (e) => {
        const st = this.aimState;
        if (!st || st.pointerId !== e.pointerId) return;
        st.current = { x: e.clientX, y: e.clientY };
        if (!st.dragging && dist(st.current, st.start) > DRAG_THRESHOLD) {
          st.dragging = true;
          this.hud.cancelZone.classList.add('show');
        }
        if (st.dragging) this.aim = this.computeAim(st)?.indicator ?? null;
      });
      const finish = (e: PointerEvent, cancelled: boolean) => {
        const st = this.aimState;
        if (!st || st.pointerId !== e.pointerId) return;
        const overCancel = this.overCancel(st.current);
        const aimed = st.dragging ? this.computeAim(st) : null;
        this.endAim();
        if (cancelled || overCancel) return;
        const u = this.player();
        const ab = u?.ability(st.slot);
        if (!u || !ab) return;
        // 轻点，或拖动瞄准的结果没有目标（无目标技能 / 没锁定到单位）：智能施法，无目标技能带上移动方向
        if (!st.dragging || !aimed?.target) {
          const cmd = castCommandFor(u, ab, this.heldDir());
          if (cmd) this.push(cmd);
          return;
        }
        this.push({ type: 'cast', slot: st.slot, target: aimed.target });
      };
      this.on(b.root, 'pointerup', (e) => finish(e, false));
      this.on(b.root, 'pointercancel', (e) => finish(e, true));
    }
  }

  // ---------- 天赋弹窗 ----------
  private bindTalents(): void {
    this.hud.talentOpts.forEach((el, side) => {
      this.on(el, 'click', (e) => {
        e.preventDefault();
        const tier = this.hud.shownTalentTier;
        if (tier < 0 || tier > 3 || !this.hud.talentTapAllowed()) return;
        this.push({ type: 'pickTalent', tier: tier as 0 | 1 | 2 | 3, side: side as 0 | 1 });
      });
    });
  }

  private endAim(): void {
    this.aimState = null;
    this.aim = null;
    this.hud.cancelZone.classList.remove('show');
    for (const b of this.hud.skills) b.root.classList.remove('aiming');
  }

  private overCancel(p: Vec2): boolean {
    const r = this.hud.cancelZone.getBoundingClientRect();
    return r.width > 0 && p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
  }

  private computeAim(st: AimState): AimResult | null {
    const u = this.player();
    const ab = u?.ability(st.slot);
    if (!u || !ab) return null;
    const { dir, ratio } = dragToAim(st.current.x - st.start.x, st.current.y - st.start.y, aimMaxDrag());
    return aimAbility(this.match.world, u, ab, dir, ratio, this.overCancel(st.current));
  }

  // ---------- 键盘鼠标（网页调试） ----------
  private bindKeyboard(): void {
    // F / G = X1 / X2（额外技能键）
    const slotKeys: Record<string, AbilitySlot> = { KeyQ: 'Q', KeyW: 'W', KeyE: 'E', KeyR: 'R', KeyF: 'X1', KeyG: 'X2' };
    // W 留给技能，所以向上只用方向键
    const moveKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD', 'KeyS'];
    const updateKeyDir = () => {
      let x = 0, y = 0;
      if (this.keys.has('ArrowUp')) y -= 1;
      if (this.keys.has('ArrowDown') || this.keys.has('KeyS')) y += 1;
      if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) x -= 1;
      if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) x += 1;
      const dir = x || y ? { x: x / Math.hypot(x, y), y: y / Math.hypot(x, y) } : null;
      if (dirChanged(this.keyDir, dir, 0.01)) {
        this.keyDir = dir;
        this.push({ type: 'move', dir });
      }
    };
    this.on(window, 'keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const code = e.code;
      if (moveKeys.includes(code)) {
        e.preventDefault();
        if (e.repeat) return;
        this.keys.add(code);
        updateKeyDir();
        return;
      }
      if (e.repeat) return;
      const slot = slotKeys[code];
      if (slot) {
        e.preventDefault();
        if (e.shiftKey) this.push({ type: 'learn', slot });
        else this.castAtMouse(slot);
        return;
      }
      if (code === 'Space') {
        e.preventDefault();
        this.push({ type: 'attack', mode: 'smart' });
      } else if (code === 'KeyT') this.push({ type: 'recall' });
    });
    this.on(window, 'keyup', (e) => {
      if (moveKeys.includes(e.code)) {
        this.keys.delete(e.code);
        updateKeyDir();
      }
    });
    // 切走窗口时收不到 keyup：清空按键，避免英雄一直走
    this.on(window, 'blur', () => {
      this.keys.clear();
      updateKeyDir();
    });
    // HUD 盖在画布上面，所以在 window 上跟踪鼠标
    this.on(window, 'mousemove', (e) => {
      this.mouse = { x: e.clientX, y: e.clientY };
    });
    this.on(document.documentElement, 'mouseleave', () => {
      this.mouse = null;
    });
  }

  private castAtMouse(slot: AbilitySlot): void {
    const u = this.player();
    const ab = u?.ability(slot);
    if (!u || !ab || ab.level === 0) return;
    if (ab.def.targetType === 'toggle' || ab.def.targetType === 'none' || ab.def.targetType === 'passive') {
      const cmd = castCommandFor(u, ab, this.heldDir());
      if (cmd) this.push(cmd);
      return;
    }
    const target = this.mouse ? pointCastTarget(this.match.world, u, ab, this.camera.screenToWorld(this.mouse)) : undefined;
    this.push(target ? { type: 'cast', slot, target } : { type: 'cast', slot });
  }
}
