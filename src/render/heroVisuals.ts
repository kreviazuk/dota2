import type { Unit } from '../sim/entities/unit';
import { Team } from '../sim/core/types';

export type HeroWeapon = 'axe' | 'greatsword' | 'hook' | 'katana' | 'blades' | 'bow' | 'claws' | 'flame' | 'lightning' | 'staff';

export interface HeroLook {
  body: string;
  trim: string;
  skin: string;
  /** 头像 / 小地图上显示的字 */
  initial: string;
  weapon: HeroWeapon;
  /** 2D 体型缩放（帕吉 1.25） */
  size?: number;
}

/** 10 名英雄的 2D 外观（颜色、首字、武器；数值来自 P2 计划的各英雄任务）。选人界面的头像也用它，所以未实现的英雄也有 */
export const HERO_LOOKS: Record<string, HeroLook> = {
  axe: { body: '#a3241c', trim: '#e2b04a', skin: '#b5543c', initial: '斧', weapon: 'axe' },
  sven: { body: '#2f4f8f', trim: '#c9d3e2', skin: '#8fa0b5', initial: '斯', weapon: 'greatsword' },
  lina: { body: '#e2401e', trim: '#ffb347', skin: '#f0c8a8', initial: '莉', weapon: 'flame' },
  crystal_maiden: { body: '#9ad4f5', trim: '#ffffff', skin: '#f0dcd0', initial: '冰', weapon: 'staff' },
  zeus: { body: '#f2ead0', trim: '#e2b04a', skin: '#e8cfae', initial: '宙', weapon: 'lightning' },
  drow_ranger: { body: '#5fb0d8', trim: '#e6f4ff', skin: '#a8c8e0', initial: '卓', weapon: 'bow' },
  phantom_assassin: { body: '#6b3a8f', trim: '#c9b0e6', skin: '#d8c8e8', initial: '幻', weapon: 'blades' },
  juggernaut: { body: '#d9772b', trim: '#e8d27a', skin: '#c08a5a', initial: '剑', weapon: 'katana' },
  pudge: { body: '#c98a8a', trim: '#6b4a2a', skin: '#d9a3a3', initial: '屠', weapon: 'hook', size: 1.25 },
  shadow_fiend: { body: '#2a1418', trim: '#c8282a', skin: '#4a1a1e', initial: '影', weapon: 'claws' },
};

const DEFAULT_LOOK: HeroLook = { body: '#6b6b7a', trim: '#cccccc', skin: '#c9a27e', initial: '英', weapon: 'greatsword' };

export const heroLook = (id: string): HeroLook => HERO_LOOKS[id] ?? DEFAULT_LOOK;

/** 副手武器（幻刺的短匕、帕吉的切肉刀、影魔的左爪） */
const OFFHAND: Partial<Record<HeroWeapon, true>> = { blades: true, hook: true, claws: true };

/**
 * 画武器：手的位置在原点，武器沿 +x 伸出（r = 英雄半径）。offhand：副手的小武器。t：动画时间（火焰、闪电闪烁）。
 */
function drawWeapon(ctx: CanvasRenderingContext2D, look: HeroLook, r: number, t: number, offhand = false): void {
  ctx.lineCap = 'round';
  // 斧王保持 P1 的斜接（miter）拐角，其他武器用圆角
  ctx.lineJoin = look.weapon === 'axe' ? 'miter' : 'round';
  const line = (color: string, w: number, x0: number, y0: number, x1: number, y1: number) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  };
  switch (look.weapon) {
    case 'axe': {
      line('#5a3a1e', r * 0.22, -r * 0.2, 0, r * 1.6, 0);
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
    case 'greatsword': {
      // 宽大的双手剑：缠绕的剑柄、十字护手、带血槽的宽剑身
      line('#4a3426', r * 0.2, -r * 0.3, 0, r * 0.35, 0);
      line('#b8c4d6', r * 0.16, r * 0.35, -r * 0.45, r * 0.35, r * 0.45);
      ctx.fillStyle = '#c9d3e2';
      ctx.strokeStyle = '#6d7888';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(r * 0.4, -r * 0.24);
      ctx.lineTo(r * 2.25, -r * 0.2);
      ctx.lineTo(r * 2.6, 0);
      ctx.lineTo(r * 2.25, r * 0.2);
      ctx.lineTo(r * 0.4, r * 0.24);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      line('#7a8698', r * 0.06, r * 0.5, 0, r * 2.1, 0);
      return;
    }
    case 'hook': {
      if (offhand) {
        // 切肉刀：长方形宽刃
        line('#5a3a1e', r * 0.16, -r * 0.1, 0, r * 0.45, 0);
        ctx.fillStyle = '#9aa0aa';
        ctx.fillRect(r * 0.45, -r * 0.42, r * 0.85, r * 0.62);
        ctx.strokeStyle = '#5b6069';
        ctx.lineWidth = 2;
        ctx.strokeRect(r * 0.45, -r * 0.42, r * 0.85, r * 0.62);
        return;
      }
      // 肉钩：链子 + 弯钩
      ctx.setLineDash([r * 0.18, r * 0.1]);
      line('#8a8a8a', r * 0.12, 0, 0, r * 1.3, 0);
      ctx.setLineDash([]);
      ctx.strokeStyle = '#b0b0b0';
      ctx.lineWidth = r * 0.16;
      ctx.beginPath();
      ctx.arc(r * 1.6, -r * 0.05, r * 0.32, Math.PI, Math.PI * 2.6);
      ctx.stroke();
      return;
    }
    case 'katana': {
      line('#b02a1e', r * 0.16, -r * 0.2, 0, r * 0.4, 0);
      line('#e8d27a', r * 0.12, r * 0.4, -r * 0.18, r * 0.4, r * 0.18);
      ctx.strokeStyle = '#e8eef4';
      ctx.lineWidth = r * 0.12;
      ctx.beginPath();
      ctx.moveTo(r * 0.45, 0);
      ctx.quadraticCurveTo(r * 1.4, -r * 0.12, r * 2.3, -r * 0.32);
      ctx.stroke();
      return;
    }
    case 'blades': {
      if (offhand) {
        // 短匕
        line('#3a2a4a', r * 0.12, 0, 0, r * 0.3, 0);
        line('#d8d0e8', r * 0.1, r * 0.3, 0, r * 0.95, 0);
        return;
      }
      line('#3a2a4a', r * 0.14, -r * 0.1, 0, r * 0.35, 0);
      ctx.strokeStyle = '#d8d0e8';
      ctx.lineWidth = r * 0.1;
      ctx.beginPath();
      ctx.moveTo(r * 0.35, 0);
      ctx.quadraticCurveTo(r * 1.3, r * 0.3, r * 2.2, -r * 0.1);
      ctx.stroke();
      return;
    }
    case 'bow': {
      // 弓横在手前：弓臂 + 弦
      ctx.strokeStyle = '#d8dde6';
      ctx.lineWidth = r * 0.14;
      ctx.beginPath();
      ctx.arc(r * 0.2, 0, r * 1.05, -1.1, 1.1);
      ctx.stroke();
      line('rgba(255,255,255,0.8)', 1.5, r * 0.2 + Math.cos(1.1) * r * 1.05, -Math.sin(1.1) * r * 1.05, r * 0.2 + Math.cos(1.1) * r * 1.05, Math.sin(1.1) * r * 1.05);
      ctx.fillStyle = '#bfe6ff';
      for (const s of [1, -1]) {
        ctx.beginPath();
        ctx.arc(r * 0.2 + Math.cos(1.1) * r * 1.05, s * Math.sin(1.1) * r * 1.05, r * 0.1, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }
    case 'claws': {
      for (const a of [-0.35, 0, 0.35]) line('#ff3a1a', r * 0.09, r * 0.1, 0, Math.cos(a) * r * (offhand ? 0.8 : 1.0), Math.sin(a) * r * 0.5);
      return;
    }
    case 'flame': {
      // 掌心的火球
      const k = 1 + 0.12 * Math.sin(t * 13);
      const g = ctx.createRadialGradient(r * 0.5, 0, 1, r * 0.5, 0, r * 0.6 * k);
      g.addColorStop(0, '#fff6c0');
      g.addColorStop(0.4, 'rgba(255,150,40,0.95)');
      g.addColorStop(1, 'rgba(255,60,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(r * 0.5, 0, r * 0.6 * k, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    case 'lightning': {
      // 手边的折线电弧
      ctx.strokeStyle = '#cfe8ff';
      ctx.lineWidth = r * 0.1;
      ctx.beginPath();
      const j = Math.sin(t * 31) * r * 0.08;
      ctx.moveTo(0, 0);
      ctx.lineTo(r * 0.45, -r * 0.25 + j);
      ctx.lineTo(r * 0.7, r * 0.15 - j);
      ctx.lineTo(r * 1.1, -r * 0.1 + j);
      ctx.stroke();
      return;
    }
    case 'staff': {
      line('#7a5232', r * 0.13, -r * 0.6, 0, r * 1.9, 0);
      ctx.fillStyle = '#9ae8ff';
      ctx.beginPath();
      ctx.moveTo(r * 1.85, 0);
      ctx.lineTo(r * 2.1, -r * 0.22);
      ctx.lineTo(r * 2.4, 0);
      ctx.lineTo(r * 2.1, r * 0.22);
      ctx.closePath();
      ctx.fill();
      return;
    }
  }
}

/** swing：攻击前摇进度 0..1；lift：位移抬高（世界单位，画面上按一半向上偏移） */
export function drawHero(ctx: CanvasRenderingContext2D, u: Unit, x: number, y: number, t: number, swing: number, isPlayer: boolean, lift = 0): void {
  const look = heroLook(u.defId);
  const r = u.radius * 1.25 * (look.size ?? 1);
  ctx.save();
  ctx.translate(x, y);
  // 阵营色底座圆环（贴地，不随位移抬高）
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
  if (lift > 0) ctx.translate(0, -lift * 0.5);
  ctx.rotate(u.facing);
  const bob = Math.sin(t * 6 + u.id) * 0.04 * r;
  ctx.save();
  ctx.translate(r * 0.1, r * 0.75);
  ctx.rotate(-1.1 + 2.0 * swing * swing);
  drawWeapon(ctx, look, r, t);
  ctx.restore();
  if (OFFHAND[look.weapon]) {
    ctx.save();
    ctx.translate(r * 0.1, -r * 0.75);
    ctx.rotate(0.6);
    drawWeapon(ctx, look, r, t, true);
    ctx.restore();
  }
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

/**
 * 头像（选人界面卡片、HUD）：画在 (0,0)–(size,size) 的正方形里。底色圆（英雄主色渐变）+ 武器标志物剪影 + 中文首字；
 * 给出 team 时外圈用阵营色，否则用英雄的镶边色。
 */
export function drawPortrait(ctx: CanvasRenderingContext2D, heroId: string, size: number, team?: Team): void {
  const look = heroLook(heroId);
  const c = size / 2;
  ctx.save();
  const g = ctx.createRadialGradient(c * 0.8, c * 0.7, size * 0.05, c, c, c);
  g.addColorStop(0, look.trim);
  g.addColorStop(0.35, look.body);
  g.addColorStop(1, '#0c0c10');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(c, c, c * 0.94, 0, Math.PI * 2);
  ctx.fill();
  // 武器剪影（半透明，斜放在背后）
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, c * 0.9, 0, Math.PI * 2);
  ctx.clip();
  ctx.globalAlpha = 0.55;
  const r = size * 0.2;
  ctx.translate(c - r * 1.15, c + r * 0.9);
  ctx.rotate(-0.85);
  drawWeapon(ctx, look, r, 0);
  ctx.restore();
  // 外圈
  ctx.strokeStyle = team === undefined ? look.trim : team === Team.Radiant ? '#6fe07a' : '#ff6a55';
  ctx.lineWidth = Math.max(1.5, size * 0.06);
  ctx.beginPath();
  ctx.arc(c, c, c * 0.94 - ctx.lineWidth / 2, 0, Math.PI * 2);
  ctx.stroke();
  // 首字
  ctx.font = `bold ${Math.round(size * 0.46)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, size * 0.07);
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.strokeText(look.initial, c, c + size * 0.03);
  ctx.fillStyle = '#fff';
  ctx.fillText(look.initial, c, c + size * 0.03);
  ctx.restore();
}
