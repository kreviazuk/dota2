import type { World } from '../sim/world';
import type { Unit } from '../sim/entities/unit';
import type { Vec2 } from '../sim/core/vec2';
import type { SimEvent } from '../sim/core/events';
import type { AimIndicator, GameRenderer } from './view';
import { Team } from '../sim/core/types';
import { Camera } from './camera';
import { MapLayer } from './mapLayer';
import { FxSystem } from './fx';
import { drawHero } from './heroVisuals';
import {
  drawAreaEffect, drawBars, drawBuilding, drawCreep, drawProjectile, drawShadow, drawStatusGround2D, drawStatusIcons2D, drawSummon, killMarkerFor,
} from './unitDraw';
import { motionHeight } from '../sim/systems/motion';
import { cameraCalm, CALM_FOLLOW_RATE } from './cameraHints';
import { lookupProjectile2D } from './fx2d';

export type { AimIndicator } from './view';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * 2D 渲染总控（俯视 Canvas 2D；WebGL 不可用时的后备渲染器）：只读取 World 的状态（加上 FxSystem 消费的事件），从不修改 World。
 * 所有绘制都在世界坐标里进行，由 camera.apply 设置变换。
 */
export class Renderer implements GameRenderer {
  readonly kind = '2d' as const;
  readonly camera = new Camera();
  readonly fx = new FxSystem();
  private readonly ctx: CanvasRenderingContext2D;
  private readonly map = new MapLayer();
  private time = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.resize();
  }

  resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.camera.resize(w, h, dpr);
  }

  /** 切换对局 / 跟随对象时：镜头立即到位并清空残留特效 */
  snapTo(world: World, followId: number | null): void {
    const u = world.getUnit(followId);
    if (u) this.camera.follow(u.pos, u.team, 0, true);
    this.fx.clear();
  }

  consume(events: SimEvent[], world: World, followId: number | null): void {
    this.fx.consume(events, world, followId, this.camera);
  }

  private ipos(u: { pos: Vec2; prevPos: Vec2 }, alpha: number): Vec2 {
    return { x: lerp(u.prevPos.x, u.pos.x, alpha), y: lerp(u.prevPos.y, u.pos.y, alpha) };
  }

  /** alpha：两次逻辑帧之间的插值系数 0..1；dt：距上一帧的真实秒数（暂停时传 0） */
  render(world: World | null, alpha: number, followId: number | null, dt: number, aim: AimIndicator | null): void {
    this.time += dt;
    const ctx = this.ctx;
    const cam = this.camera;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#0b0f0a';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (!world) return;
    const focus = world.getUnit(followId);
    if (focus) cam.follow(this.ipos(focus, alpha), focus.team, dt, false, cameraCalm(focus) ? CALM_FOLLOW_RATE : undefined);
    const viewerTeam = focus?.team ?? Team.Radiant;
    cam.apply(ctx);
    this.map.draw(ctx, this.time);

    for (const e of world.effects) if (cam.visible(e.pos, e.radius)) drawAreaEffect(ctx, e, this.time);
    if (aim) this.drawAim(ctx, world, aim);

    // 隐藏状态的敌方单位不画；死亡的英雄不画（建筑死亡后画废墟）
    const visible = world.units.filter(
      (u) => !u.removed && (u.alive || u.kind === 'building') && !(u.team !== viewerTeam && u.hasState('hidden')) && cam.visible(u.pos, 300),
    );
    visible.sort((a, b) => a.pos.y - b.pos.y);
    const positions = new Map<number, Vec2>();
    for (const u of visible) positions.set(u.id, u.kind === 'building' ? u.pos : this.ipos(u, alpha));

    // 贴地的东西（泉水池、建筑废墟、阴影、引导圈）先画，不参与按 y 排序的遮挡
    const flat = (u: Unit) => u.kind === 'building' && (!u.alive || u.building?.type === 'fountain');
    for (const u of visible) {
      const p = positions.get(u.id)!;
      if (flat(u)) drawBuilding(ctx, u, p.x, p.y, this.time);
      if (u.kind === 'building') continue;
      drawShadow(ctx, p.x, p.y, u.radius * 1.3, u.radius * 0.8);
      this.drawChannel(ctx, world, u, p);
      drawStatusGround2D(ctx, u, p.x, p.y, this.time);
    }
    for (const u of visible) {
      if (flat(u)) continue;
      const p = positions.get(u.id)!;
      const ghost = u.hasState('hidden');
      if (ghost) ctx.globalAlpha = 0.5;
      // 被击退 / 跳跃时向上偏移（世界单位的一半）
      const lift = motionHeight(u.motion) * 0.5;
      if (u.kind === 'building') drawBuilding(ctx, u, p.x, p.y, this.time);
      else if (u.kind === 'hero') drawHero(ctx, u, p.x, p.y, this.time, this.swing(u), u.id === followId && !!u.hero?.playerControlled, motionHeight(u.motion));
      else if (u.kind === 'summon') drawSummon(ctx, u, p.x, p.y - lift, this.time);
      else drawCreep(ctx, u, p.x, p.y - lift, this.time);
      if (ghost) ctx.globalAlpha = 1;
    }
    for (const pr of world.projectiles) {
      const p = this.ipos(pr, alpha);
      // 带链子的弹道（肉钩）：链子从施法者连到弹道
      const src = lookupProjectile2D(pr.visual)?.chain ? world.getUnit(pr.sourceId) : undefined;
      const from = src && src.alive ? this.ipos(src, alpha) : undefined;
      if (cam.visible(p) || (from && cam.visible(from))) drawProjectile(ctx, pr, p.x, p.y, this.time, from);
    }
    this.fx.update(dt);
    this.fx.drawWorld(ctx);
    const barOpts = { killMarker: killMarkerFor(world, focus), time: this.time, uiScale: cam.uiScale };
    for (const u of visible) {
      const p = positions.get(u.id)!;
      const y = p.y - motionHeight(u.motion) * 0.5;
      // 召唤物的血条画在图腾顶上
      if (u.kind === 'summon') drawBars(ctx, u, p.x, y, u.id === followId, viewerTeam, { ...barOpts, top: y - Math.max(14, u.radius * 1.1) * 3.5 - 10 });
      else drawBars(ctx, u, p.x, y, u.id === followId, viewerTeam, barOpts);
      if (u.kind !== 'building') {
        const s = u.kind === 'hero' ? cam.uiScale : 1 + (cam.uiScale - 1) * 0.5;
        drawStatusIcons2D(ctx, u, p.x, y - u.radius * 1.3 - (u.kind === 'hero' ? 50 : 24) * s, this.time, s);
      }
    }
    this.fx.drawTexts(ctx, cam.uiScale);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    this.fx.drawFlash(ctx, this.canvas.width, this.canvas.height);
  }

  private swing(u: Unit): number {
    if (u.attack.windup < 0 || u.stats.attackPoint <= 0) return 0;
    return Math.max(0, Math.min(1, 1 - u.attack.windup / u.stats.attackPoint));
  }

  /** 回城 / 引导技能的进度圈（画在脚下） */
  private drawChannel(ctx: CanvasRenderingContext2D, world: World, u: Unit, p: Vec2): void {
    let prog = -1;
    let color = 'rgba(255,220,120,';
    if (u.order.kind === 'recall') {
      prog = 1 - u.order.remaining / Math.max(0.001, world.balance.hero.recallTime);
      color = 'rgba(120,190,255,';
    } else if (u.cast?.phase === 'channel' && u.cast.channelTotal > 0) {
      prog = 1 - u.cast.timer / u.cast.channelTotal;
    }
    if (prog < 0) return;
    prog = Math.max(0, Math.min(1, prog));
    const r = u.radius * 2.3;
    ctx.lineWidth = 6;
    ctx.strokeStyle = `${color}0.25)`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = `${color}0.95)`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([10, 14]);
    ctx.lineDashOffset = -this.time * 60;
    ctx.lineWidth = 3;
    ctx.strokeStyle = `${color}0.6)`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 0.75, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private drawAim(ctx: CanvasRenderingContext2D, world: World, aim: AimIndicator): void {
    const color = aim.cancel ? 'rgba(255,80,80,' : 'rgba(120,200,255,';
    ctx.strokeStyle = `${color}0.35)`;
    ctx.lineWidth = 4;
    ctx.setLineDash([16, 10]);
    ctx.beginPath();
    ctx.arc(aim.origin.x, aim.origin.y, aim.range, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    if (aim.kind === 'direction' && aim.dir) {
      const w = aim.width ?? 100;
      ctx.save();
      ctx.translate(aim.origin.x, aim.origin.y);
      ctx.rotate(Math.atan2(aim.dir.y, aim.dir.x));
      ctx.fillStyle = `${color}0.25)`;
      ctx.fillRect(0, -w / 2, aim.range, w);
      ctx.strokeStyle = `${color}0.8)`;
      ctx.strokeRect(0, -w / 2, aim.range, w);
      ctx.restore();
    }
    if (aim.kind === 'point' && aim.point) {
      ctx.fillStyle = `${color}0.25)`;
      ctx.strokeStyle = `${color}0.85)`;
      ctx.beginPath();
      ctx.arc(aim.point.x, aim.point.y, aim.radius ?? 150, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    if (aim.kind === 'unit' && aim.targetId !== undefined) {
      const t = world.getUnit(aim.targetId);
      if (t) {
        ctx.strokeStyle = `${color}0.95)`;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(t.pos.x, t.pos.y, t.radius * 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(aim.origin.x, aim.origin.y);
        ctx.lineTo(t.pos.x, t.pos.y);
        ctx.stroke();
      }
    }
  }
}
