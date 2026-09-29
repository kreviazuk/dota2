import type { Unit } from '../sim/entities/unit';
import { Team } from '../sim/core/types';

export interface HeroLook {
  body: string;
  trim: string;
  skin: string;
  /** 头像 / 小地图上显示的字 */
  initial: string;
  weapon: 'axe' | 'sword' | 'bow' | 'staff' | 'hook' | 'dagger';
}

export const HERO_LOOKS: Record<string, HeroLook> = {
  axe: { body: '#a3241c', trim: '#e2b04a', skin: '#b5543c', initial: '斧', weapon: 'axe' },
};

const DEFAULT_LOOK: HeroLook = { body: '#6b6b7a', trim: '#cccccc', skin: '#c9a27e', initial: '英', weapon: 'sword' };

export const heroLook = (id: string): HeroLook => HERO_LOOKS[id] ?? DEFAULT_LOOK;

function drawWeapon(ctx: CanvasRenderingContext2D, look: HeroLook, r: number): void {
  ctx.lineCap = 'round';
  if (look.weapon === 'axe') {
    ctx.strokeStyle = '#5a3a1e';
    ctx.lineWidth = r * 0.22;
    ctx.beginPath();
    ctx.moveTo(-r * 0.2, 0);
    ctx.lineTo(r * 1.6, 0);
    ctx.stroke();
    ctx.fillStyle = '#c9ccd4';
    ctx.strokeStyle = '#6d7078';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(r * 1.25, -r * 0.1);
    ctx.quadraticCurveTo(r * 1.35, -r * 0.95, r * 2.05, -r * 0.75);
    ctx.quadraticCurveTo(r * 1.75, 0, r * 2.05, r * 0.75);
    ctx.quadraticCurveTo(r * 1.35, r * 0.95, r * 1.25, r * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    return;
  }
  ctx.strokeStyle = '#d8dde6';
  ctx.lineWidth = r * 0.18;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(r * 1.8, 0);
  ctx.stroke();
}

/** swing：攻击前摇进度 0..1 */
export function drawHero(ctx: CanvasRenderingContext2D, u: Unit, x: number, y: number, t: number, swing: number, isPlayer: boolean): void {
  const look = heroLook(u.defId);
  const r = u.radius * 1.25;
  ctx.save();
  ctx.translate(x, y);
  // 阵营色底座圆环
  ctx.strokeStyle = u.team === Team.Radiant ? 'rgba(110,230,120,0.9)' : 'rgba(255,90,70,0.9)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(0, r * 0.35, r * 1.35, r * 0.9, 0, 0, Math.PI * 2);
  ctx.stroke();
  if (isPlayer) {
    ctx.strokeStyle = `rgba(255,255,255,${0.45 + 0.3 * Math.sin(t * 5)})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, r * 0.35, r * 1.6, r * 1.1, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.rotate(u.facing);
  const bob = Math.sin(t * 6 + u.id) * 0.04 * r;
  ctx.save();
  ctx.translate(r * 0.1, r * 0.75);
  ctx.rotate(-1.1 + 2.0 * swing * swing);
  drawWeapon(ctx, look, r);
  ctx.restore();
  ctx.fillStyle = look.body;
  ctx.beginPath();
  ctx.arc(0, 0, r + bob, 0, Math.PI * 2);
  ctx.fill();
  // 肩甲
  ctx.fillStyle = look.trim;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(-r * 0.05, s * r * 0.78, r * 0.38, 0, Math.PI * 2);
    ctx.fill();
  }
  // 头
  ctx.fillStyle = look.skin;
  ctx.beginPath();
  ctx.arc(r * 0.45, 0, r * 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
