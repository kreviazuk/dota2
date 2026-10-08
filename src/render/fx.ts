import type { SimEvent } from '../sim/core/events';
import type { World } from '../sim/world';
import type { ViewCamera } from './view';
import { lookupFx2D } from './fx2d';

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; drag: number; add: boolean }
interface FloatText { x: number; y: number; vy: number; life: number; max: number; text: string; color: string; size: number }
/** color 是不带 alpha 的前缀，例如 'rgba(255,60,40,' */
interface Ring { x: number; y: number; r0: number; r1: number; life: number; max: number; color: string; width: number }
interface Slash { x: number; y: number; angle: number; life: number; max: number; color: string; size: number }
/** 扇形弧（分裂斩痕）：从 angle − half 到 angle + half，半径从 0.4r 扩到 r */
interface Arc { x: number; y: number; angle: number; half: number; r: number; life: number; max: number; color: string; width: number }
/** 折线闪电（宙斯）：生成时就定好折点；color 是完整颜色 */
interface Bolt { pts: { x: number; y: number }[]; life: number; max: number; color: string; width: number }

const MAX_PARTICLES = 700;
const MAX_TEXTS = 70;

/** 粒子、飘字、冲击环、斩击。只消费 sim 事件，不修改 World。 */
export class FxSystem {
  private particles: Particle[] = [];
  private texts: FloatText[] = [];
  private rings: Ring[] = [];
  private slashes: Slash[] = [];
  private arcs: Arc[] = [];
  private bolts: Bolt[] = [];
  /** 全屏闪光（雷神之怒）；pulses > 0 时淡出过程中快速闪烁 */
  private flash = { color: '255,255,255', life: 0, max: 1, pulses: 0 };

  clear(): void {
    this.bolts = [];
    this.flash.life = 0;
    this.particles = [];
    this.texts = [];
    this.rings = [];
    this.slashes = [];
    this.arcs = [];
  }

  burst(x: number, y: number, n: number, color: string, speed: number, size: number, life = 0.6, add = true): void {
    for (let i = 0; i < n && this.particles.length < MAX_PARTICLES; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, size: size * (0.5 + Math.random()), color, drag: 3, add });
    }
  }

  ring(x: number, y: number, r0: number, r1: number, color: string, life = 0.5, width = 8): void {
    this.rings.push({ x, y, r0, r1, life, max: life, color, width });
  }

  /** 扇形弧（color 是不带 alpha 的前缀，例如 'rgba(255,200,140,'） */
  arc(x: number, y: number, angle: number, half: number, r: number, color: string, life = 0.3, width = 12): void {
    this.arcs.push({ x, y, angle, half, r, life, max: life, color, width });
  }

  /** 直线斩击（color 是完整颜色） */
  slash(x: number, y: number, angle: number, size: number, color: string, life = 0.4): void {
    this.slashes.push({ x, y, angle, life, max: life, color, size });
  }

  /** 两点之间的折线闪电：中间插 segs 个随机折点（振幅 jag） */
  bolt(x1: number, y1: number, x2: number, y2: number, color: string, width: number, life = 0.25, jag = 18, segs = 6): void {
    const pts = [{ x: x1, y: y1 }];
    for (let i = 1; i < segs; i++) {
      const k = i / segs;
      pts.push({ x: x1 + (x2 - x1) * k + (Math.random() - 0.5) * 2 * jag, y: y1 + (y2 - y1) * k + (Math.random() - 0.5) * 2 * jag });
    }
    pts.push({ x: x2, y: y2 });
    this.bolts.push({ pts, life, max: life, color, width });
  }

  /** 全屏闪光：color = 'r,g,b'，最亮 0.35，pulses 次快速明暗 */
  screenFlash(color: string, life: number, pulses = 0): void {
    this.flash = { color, life, max: life, pulses };
  }

  /** 当前全屏闪光的不透明度（0 = 没有） */
  flashAlpha(): number {
    const f = this.flash;
    if (f.life <= 0 || f.max <= 0) return 0;
    const k = f.life / f.max;
    const pulse = f.pulses > 0 ? 0.3 + 0.7 * (0.5 + 0.5 * Math.cos(2 * Math.PI * f.pulses * (1 - k))) : 1;
    return 0.35 * k * pulse;
  }

  /** 在屏幕坐标下画全屏闪光（调用前 ctx 已经是单位变换） */
  drawFlash(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const a = this.flashAlpha();
    if (a <= 0) return;
    ctx.fillStyle = `rgba(${this.flash.color},${a})`;
    ctx.fillRect(0, 0, w, h);
  }

  text(x: number, y: number, text: string, color: string, size = 26): void {
    if (this.texts.length >= MAX_TEXTS) this.texts.shift();
    this.texts.push({ x: x + (Math.random() - 0.5) * 30, y, vy: -90, life: 0.9, max: 0.9, text, color, size });
  }

  consume(events: SimEvent[], world: World, playerId: number | null, cam: ViewCamera): void {
    const player = world.getUnit(playerId);
    for (const e of events) {
      switch (e.type) {
        case 'damage': {
          const t = world.getUnit(e.targetId);
          if (!t || !cam.visible(t.pos)) break;
          const involvesPlayer = playerId !== null && (e.sourceId === playerId || e.targetId === playerId);
          if (involvesPlayer || t.kind === 'hero' || e.crit || e.amount >= 100) {
            // 物理白、魔法蓝、纯粹金；暴击放大红字
            const color = e.crit ? '#ff4d3d' : e.damageType === 'magical' ? '#7cc4ff' : e.damageType === 'pure' ? '#ffd54a' : '#ffffff';
            const size = e.crit ? 40 : involvesPlayer ? 28 : 22;
            // 同一时刻打在同一个目标上的几个数字（静电场 + 技能本体）往上叠
            let n = 0;
            for (const tt of this.texts) if (tt.max - tt.life < 0.08 && Math.abs(tt.x - t.pos.x) < 40 && tt.y <= t.pos.y - 59 && tt.y > t.pos.y - 400) n++;
            this.text(t.pos.x, t.pos.y - 60 - n * size * 2, `${Math.round(e.amount)}${e.crit ? '!' : ''}`, color, size);
          }
          if (e.isAttack) this.burst(t.pos.x, t.pos.y, 4, 'rgba(255,80,60,0.9)', 160, 5, 0.3, false);
          break;
        }
        case 'heal': {
          const t = world.getUnit(e.targetId);
          if (t && t.kind === 'hero' && e.amount >= 25 && cam.visible(t.pos)) this.text(t.pos.x, t.pos.y - 60, `+${Math.round(e.amount)}`, '#6dff7a', 22);
          break;
        }
        case 'miss': {
          const t = world.getUnit(e.targetId);
          if (t && cam.visible(t.pos)) this.text(t.pos.x, t.pos.y - 60, '未命中', '#bbbbbb', 20);
          break;
        }
        case 'death': {
          const u = world.getUnit(e.unitId);
          if (!u || !cam.visible(u.pos)) break;
          if (u.kind === 'hero') {
            this.burst(u.pos.x, u.pos.y, 40, 'rgba(200,30,30,0.9)', 300, 9, 0.9, false);
            this.ring(u.pos.x, u.pos.y, 20, 180, 'rgba(255,60,40,', 0.6, 10);
          } else if (u.kind !== 'building') {
            this.burst(u.pos.x, u.pos.y, 12, 'rgba(160,30,30,0.85)', 180, 6, 0.5, false);
          }
          break;
        }
        case 'buildingDestroyed': {
          const u = world.getUnit(e.unitId);
          if (!u) break;
          this.burst(u.pos.x, u.pos.y - 40, 80, 'rgba(255,170,60,0.95)', 420, 12, 1.2);
          this.burst(u.pos.x, u.pos.y, 40, 'rgba(90,85,80,0.9)', 250, 14, 1.4, false);
          this.ring(u.pos.x, u.pos.y, 40, 420, 'rgba(255,190,90,', 0.8, 14);
          if (cam.visible(u.pos)) cam.shake(28);
          break;
        }
        case 'gold': {
          if (e.unitId === playerId && player && e.amount >= 5) this.text(player.pos.x + 40, player.pos.y - 90, `+${e.amount}`, '#ffcc33', 22);
          break;
        }
        case 'levelUp': {
          const u = world.getUnit(e.unitId);
          if (!u || !cam.visible(u.pos)) break;
          this.ring(u.pos.x, u.pos.y, 10, 160, 'rgba(255,215,90,', 0.8, 10);
          this.burst(u.pos.x, u.pos.y, 30, 'rgba(255,220,120,0.95)', 260, 6, 0.8);
          if (u.id === playerId) this.text(u.pos.x, u.pos.y - 110, '升级！', '#ffe070', 34);
          break;
        }
        case 'respawn': {
          const u = world.getUnit(e.unitId);
          if (u) this.ring(u.pos.x, u.pos.y, 10, 140, 'rgba(160,220,255,', 0.7, 8);
          break;
        }
        case 'fx':
          this.fxEvent(e, world, cam);
          break;
        default:
          break;
      }
    }
  }

  private fxEvent(e: Extract<SimEvent, { type: 'fx' }>, world: World, cam: ViewCamera): void {
    // 先查注册表（fx2d.ts），没有再走内置分支
    const h = lookupFx2D(e.kind);
    if (h) {
      h(this, e, world, cam);
      return;
    }
    const { x, y } = e.pos;
    switch (e.kind) {
      case 'axe_call':
        this.ring(x, y, 20, e.radius ?? 315, 'rgba(255,60,40,', 0.45, 16);
        this.burst(x, y, 30, 'rgba(255,90,60,0.95)', 380, 7, 0.5);
        if (cam.visible(e.pos)) cam.shake(8);
        break;
      case 'axe_helix': {
        const r = e.radius ?? 275;
        this.ring(x, y, r * 0.5, r, 'rgba(255,40,30,', 0.35, 22);
        for (let i = 0; i < 24 && this.particles.length < MAX_PARTICLES; i++) {
          const a = (i / 24) * Math.PI * 2;
          this.particles.push({ x: x + Math.cos(a) * r * 0.6, y: y + Math.sin(a) * r * 0.6, vx: -Math.sin(a) * 500, vy: Math.cos(a) * 500, life: 0.35, max: 0.35, size: 7, color: 'rgba(255,120,90,0.95)', drag: 4, add: true });
        }
        break;
      }
      case 'axe_hunger': {
        const t = world.getUnit(e.targetId);
        const p = t?.pos ?? e.pos;
        this.burst(p.x, p.y, 16, 'rgba(255,40,40,0.9)', 160, 6, 0.6);
        break;
      }
      case 'axe_cull':
      case 'axe_cull_kill': {
        const kill = e.kind === 'axe_cull_kill';
        this.slashes.push({ x, y, angle: -0.6, life: 0.4, max: 0.4, color: kill ? '#ff2a1a' : '#ff9a60', size: kill ? 260 : 180 });
        this.burst(x, y, kill ? 60 : 25, 'rgba(255,50,30,0.95)', kill ? 480 : 300, 9, 0.7);
        if (kill) this.text(x, y - 120, '淘汰！', '#ff3b2f', 44);
        // 大招命中时轻微震屏
        if (cam.visible(e.pos)) cam.shake(kill ? 22 : 10);
        break;
      }
      case 'recall':
        this.ring(x, y, 10, 150, 'rgba(120,190,255,', 0.6, 8);
        this.burst(x, y, 20, 'rgba(150,210,255,0.9)', 200, 6, 0.6);
        break;
      default:
        this.ring(x, y, 10, e.radius ?? 120, 'rgba(255,255,255,', 0.4, 6);
    }
  }

  update(dt: number): void {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vy *= k;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const t of this.texts) {
      t.life -= dt;
      t.y += t.vy * dt;
      t.vy *= Math.exp(-2.5 * dt);
    }
    this.texts = this.texts.filter((t) => t.life > 0);
    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter((r) => r.life > 0);
    for (const s of this.slashes) s.life -= dt;
    this.slashes = this.slashes.filter((s) => s.life > 0);
    for (const a of this.arcs) a.life -= dt;
    this.arcs = this.arcs.filter((a) => a.life > 0);
    for (const b of this.bolts) b.life -= dt;
    this.bolts = this.bolts.filter((b) => b.life > 0);
    this.flash.life = Math.max(0, this.flash.life - dt);
  }

  drawWorld(ctx: CanvasRenderingContext2D): void {
    for (const r of this.rings) {
      const k = 1 - r.life / r.max;
      ctx.strokeStyle = `${r.color}${(1 - k).toFixed(3)})`;
      ctx.lineWidth = r.width * (1 - k * 0.6);
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * (1 - (1 - k) * (1 - k)), 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const a of this.arcs) {
      const k = 1 - a.life / a.max;
      ctx.strokeStyle = `${a.color}${(1 - k).toFixed(3)})`;
      ctx.lineWidth = a.width * (1 - k * 0.5);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(a.x, a.y, a.r * (0.4 + 0.6 * (1 - (1 - k) * (1 - k))), a.angle - a.half, a.angle + a.half);
      ctx.stroke();
    }
    for (const b of this.bolts) {
      ctx.strokeStyle = b.color;
      ctx.globalAlpha = Math.max(0, Math.min(1, (b.life / b.max) * 1.5));
      ctx.lineWidth = b.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      b.pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.save();
    for (const p of this.particles) {
      ctx.globalCompositeOperation = p.add ? 'lighter' : 'source-over';
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    for (const s of this.slashes) {
      const k = 1 - s.life / s.max;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      ctx.strokeStyle = s.color;
      ctx.globalAlpha = 1 - k;
      ctx.lineWidth = 18 * (1 - k);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-s.size / 2, 0);
      ctx.lineTo(-s.size / 2 + s.size * Math.min(1, k * 3), 0);
      ctx.stroke();
      ctx.restore();
    }
  }

  /** uiScale：界面元素放大倍数（Camera.uiScale），手机横屏时放大飘字 */
  drawTexts(ctx: CanvasRenderingContext2D, uiScale = 1): void {
    for (const t of this.texts) drawFloatText(ctx, t.text, t.color, t.size, t.life / t.max, t.x, t.y, uiScale);
    ctx.globalAlpha = 1;
  }
}

/**
 * 画一条飘字（2D 渲染器和 3D 渲染器的界面层共用）。k = 剩余寿命比例 1→0：出现时略微放大再回落，最后淡出。
 * 调用后 ctx.globalAlpha 可能不是 1。
 */
export function drawFloatText(ctx: CanvasRenderingContext2D, text: string, color: string, size: number, k: number, x: number, y: number, uiScale: number): void {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = Math.min(1, k * 2);
  ctx.font = `bold ${Math.round(size * uiScale * (1 + 0.25 * Math.max(0, k - 0.8) * 5))}px sans-serif`;
  ctx.lineWidth = 5 * uiScale;
  ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}
