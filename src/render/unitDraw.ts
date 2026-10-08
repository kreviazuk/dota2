import type { Unit } from '../sim/entities/unit';
import type { Projectile } from '../sim/entities/projectile';
import type { AreaEffect } from '../sim/entities/effect';
import { Team } from '../sim/core/types';
import type { World } from '../sim/world';
import { abilityValue, canCast } from '../sim/systems/abilities';
import { shieldTotal } from '../sim/shields';
import { lookupModifier2D, lookupProjectile2D } from './fx2d';

export const TEAM_COLORS: Record<Team, { main: string; light: string; dark: string; rgb: string }> = {
  [Team.Radiant]: { main: '#4caf50', light: '#a8f0a0', dark: '#1f5e25', rgb: '120,255,140' },
  [Team.Dire]: { main: '#d9483b', light: '#ffa090', dark: '#6b1a14', rgb: '255,90,70' },
};

/** 斩杀线：观察者（玩家英雄）学会淘汰之刃后，敌方英雄血量低于 threshold 时血条上显示斧头标记 */
export interface KillMarker {
  threshold: number;
  /** 技能当前能否施放（冷却、魔法、存活、眩晕/沉默）；不能施放时标记变暗 */
  ready: boolean;
}

/** 渲染层用到的"斩杀类"技能：技能 id → 斩杀线数值的 key（P2 其他英雄在这里登记） */
const EXECUTE_ABILITIES: Record<string, string> = { axe_culling_blade: 'damage' };

export function killMarkerFor(world: World, viewer: Unit | undefined): KillMarker | null {
  if (!viewer) return null;
  for (const ab of viewer.abilities) {
    const key = EXECUTE_ABILITIES[ab.def.id];
    if (!key || ab.level <= 0) continue;
    return { threshold: abilityValue(viewer, ab, key), ready: canCast(world, viewer, ab) };
  }
  return null;
}

/** 目标当前是否处于斩杀线以下（只对敌方英雄显示） */
export const isKillable = (u: Unit, marker: KillMarker | null, viewerTeam: Team): boolean =>
  !!marker && u.alive && u.kind === 'hero' && u.team !== viewerTeam && !u.hasState('invulnerable') && !u.hasState('untargetable') &&
  u.hp <= marker.threshold;

export function drawShadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number): void {
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(x, y + ry * 0.4, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function drawCreep(ctx: CanvasRenderingContext2D, u: Unit, x: number, y: number, t: number): void {
  const c = TEAM_COLORS[u.team];
  const type = u.creep?.type ?? 'melee';
  const r = u.radius * 1.2;
  const isSuper = type === 'superMelee' || type === 'superRanged';
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(u.facing);
  if (type === 'siege') {
    ctx.fillStyle = '#5a4630';
    ctx.fillRect(-r * 1.2, -r * 0.9, r * 2.4, r * 1.8);
    ctx.fillStyle = '#2b2118';
    for (const sx of [-0.8, 0.8]) for (const sy of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(r * sx, r * sy, r * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = c.main;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-r * 0.6, 0);
    ctx.lineTo(r * 1.3, 0);
    ctx.stroke();
  } else if (type === 'ranged' || type === 'superRanged') {
    ctx.fillStyle = c.dark;
    ctx.beginPath();
    ctx.moveTo(r, 0); ctx.lineTo(0, r); ctx.lineTo(-r, 0); ctx.lineTo(0, -r);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = `rgba(${c.rgb},${0.6 + 0.3 * Math.sin(t * 6 + u.id)})`;
    ctx.beginPath();
    ctx.arc(r * 0.2, 0, r * 0.4, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = c.dark;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = c.main;
    ctx.beginPath();
    ctx.arc(r * 0.2, 0, r * 0.62, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#aaa';
    ctx.fillRect(r * 0.3, r * 0.45, r * 0.9, r * 0.18);
  }
  if (isSuper) {
    ctx.strokeStyle = '#f2c94c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.1, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawBuilding(ctx: CanvasRenderingContext2D, u: Unit, x: number, y: number, t: number): void {
  const c = TEAM_COLORS[u.team];
  const st = u.building!;
  const r = u.radius;
  if (!u.alive) {
    // 废墟
    ctx.fillStyle = '#3b3833';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + u.id;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.4, r * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }
  if (st.type === 'fountain') {
    ctx.fillStyle = '#3c3f46';
    ctx.beginPath();
    ctx.arc(x, y, 170, 0, Math.PI * 2);
    ctx.fill();
    const g = ctx.createRadialGradient(x, y, 10, x, y, 150);
    g.addColorStop(0, `rgba(${c.rgb},0.9)`);
    g.addColorStop(1, `rgba(${c.rgb},0.15)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, 150, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (st.type === 'ancient') {
    drawShadow(ctx, x, y, r * 1.3, r * 0.8);
    ctx.fillStyle = '#4a4540';
    ctx.beginPath();
    ctx.arc(x, y, r * 1.05, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + t * 0.3;
      ctx.fillStyle = i % 2 ? c.main : c.light;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r * 0.3, y + Math.sin(a) * r * 0.3 - 20);
      ctx.lineTo(x + Math.cos(a + 0.3) * r * 0.8, y + Math.sin(a + 0.3) * r * 0.5 - 60);
      ctx.lineTo(x + Math.cos(a - 0.3) * r * 0.8, y + Math.sin(a - 0.3) * r * 0.5 - 60);
      ctx.closePath();
      ctx.fill();
    }
    const g = ctx.createRadialGradient(x, y - 80, 5, x, y - 80, 90);
    g.addColorStop(0, `rgba(${c.rgb},0.9)`);
    g.addColorStop(1, `rgba(${c.rgb},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y - 80, 90, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // 防御塔：八边形底座 + 按高度偏移的塔身 + 顶部水晶（伪 3D）
    const h = 40 + st.tier * 12;
    drawShadow(ctx, x + 20, y, r * 1.1, r * 0.7);
    ctx.fillStyle = '#5e5850';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.8);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#7a7268';
    ctx.fillRect(x - r * 0.45, y - h, r * 0.9, h);
    ctx.fillStyle = '#8d857a';
    ctx.fillRect(x - r * 0.45, y - h, r * 0.25, h);
    const glow = 0.7 + 0.3 * Math.sin(t * 3 + u.id);
    const g = ctx.createRadialGradient(x, y - h - 18, 2, x, y - h - 18, 40);
    g.addColorStop(0, `rgba(${c.rgb},${glow})`);
    g.addColorStop(1, `rgba(${c.rgb},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y - h - 18, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = c.light;
    ctx.beginPath();
    ctx.moveTo(x, y - h - 42); ctx.lineTo(x + 14, y - h - 18); ctx.lineTo(x, y - h + 4); ctx.lineTo(x - 14, y - h - 18);
    ctx.closePath();
    ctx.fill();
  }
  if (u.hasState('invulnerable')) {
    // 无敌链保护中：半透明护盾
    ctx.strokeStyle = 'rgba(160,200,255,0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y - 30, r * 1.35, Math.PI, 0);
    ctx.stroke();
  }
}

/** 斧头小图标（斩杀标记），中心在 (x, y)，s = 大小 */
function drawAxeIcon(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, alpha: number): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(-0.6);
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.75, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#8a5a2e';
  ctx.lineWidth = s * 0.14;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-s * 0.5, 0);
  ctx.lineTo(s * 0.5, 0);
  ctx.stroke();
  ctx.fillStyle = '#ff3b2f';
  ctx.beginPath();
  ctx.moveTo(s * 0.15, -s * 0.05);
  ctx.quadraticCurveTo(s * 0.2, -s * 0.55, s * 0.6, -s * 0.45);
  ctx.quadraticCurveTo(s * 0.42, 0, s * 0.6, s * 0.45);
  ctx.quadraticCurveTo(s * 0.2, s * 0.55, s * 0.15, s * 0.05);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * 血条上的护盾段（比例 0..1）：从当前血量开始往右，长度 = 护盾 / 最大生命，超出血条的部分截断。
 * 没有护盾时 from === to。
 */
export function shieldSegment(hp: number, maxHp: number, shield: number): { from: number; to: number } {
  const m = Math.max(1, maxHp);
  const from = Math.max(0, Math.min(1, hp / m));
  const to = Math.max(from, Math.min(1, from + Math.max(0, shield) / m));
  return { from, to };
}

export interface BarOpts {
  /** 观察者的斩杀线（见 killMarkerFor） */
  killMarker?: KillMarker | null;
  /** 动画时间（秒） */
  time?: number;
  /** 界面元素放大倍数（Camera.uiScale）：英雄血条完整放大，小兵和建筑的血条放大一半 */
  uiScale?: number;
  /** 血条顶边的 y（同一坐标系）。缺省按单位半径放在 (x, y) 头顶；3D 渲染器传入投影后的头顶位置 */
  top?: number;
}

/**
 * 头顶血条（己方绿、敌方红；玩家自己亮绿）、蓝条和等级。
 * 观察者学会淘汰之刃后，敌方英雄血条上画出斩杀线刻度，血量低于斩杀线时在血条右侧显示斧头标记。
 */
export function drawBars(ctx: CanvasRenderingContext2D, u: Unit, x: number, y: number, isPlayer: boolean, viewerTeam: Team, opts: BarOpts = {}): void {
  if (!u.alive || u.building?.type === 'fountain') return;
  const ally = u.team === viewerTeam;
  const isHero = u.kind === 'hero';
  const isBuilding = u.kind === 'building';
  const ui = opts.uiScale ?? 1;
  const s = isHero ? ui : 1 + (ui - 1) * 0.5;
  const w = (isHero ? 110 : isBuilding ? 170 : 46) * s;
  const h = (isHero ? 13 : isBuilding ? 12 : 6) * s;
  const top = opts.top !== undefined ? opts.top : isBuilding ? y - (u.building!.type === 'ancient' ? 170 : 150) : y - u.radius * 1.3 - (isHero ? 44 : 20) * s;
  const maxHp = Math.max(1, u.stats.maxHp);
  const pct = Math.max(0, Math.min(1, u.hp / maxHp));
  const manaH = 5 * s;
  const pad = 2 * s;
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(x - w / 2 - pad, top - pad, w + pad * 2, h + pad * 2 + (isHero ? manaH + pad : 0));
  ctx.fillStyle = isPlayer ? '#5fe05a' : ally ? '#3fae4a' : '#d33b2f';
  ctx.fillRect(x - w / 2, top, w * pct, h);
  // 护盾：白色段接在当前血量后面
  const sh = shieldTotal(u);
  if (sh > 0) {
    const seg = shieldSegment(u.hp, maxHp, sh);
    ctx.fillStyle = 'rgba(240,248,255,0.92)';
    ctx.fillRect(x - w / 2 + w * seg.from, top, w * (seg.to - seg.from), h);
  }
  if (!isHero) return;
  // 每 250 血一格
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = s;
  const seg = 250;
  for (let v = seg; v < maxHp; v += seg) {
    const sx = x - w / 2 + (w * v) / maxHp;
    ctx.beginPath();
    ctx.moveTo(sx, top);
    ctx.lineTo(sx, top + h);
    ctx.stroke();
  }
  ctx.fillStyle = '#3b7bff';
  ctx.fillRect(x - w / 2, top + h + pad, w * Math.max(0, Math.min(1, u.mana / Math.max(1, u.stats.maxMana))), manaH);
  // 等级
  const lx = x - w / 2 - 16 * s;
  const ly = top + (h + manaH + pad) / 2;
  ctx.fillStyle = '#1b1b1b';
  ctx.beginPath();
  ctx.arc(lx, ly, 15 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffe28a';
  ctx.font = `bold ${Math.round(18 * s)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(u.hero?.level ?? 1), lx, ly + s);

  const marker = opts.killMarker;
  if (marker && !ally) {
    // 斩杀线刻度
    const kx = x - w / 2 + w * Math.min(1, marker.threshold / maxHp);
    ctx.strokeStyle = marker.ready ? 'rgba(255,230,120,0.95)' : 'rgba(255,230,120,0.45)';
    ctx.lineWidth = 3 * s;
    ctx.beginPath();
    ctx.moveTo(kx, top - 3 * s);
    ctx.lineTo(kx, top + h + 3 * s);
    ctx.stroke();
    if (isKillable(u, marker, viewerTeam)) {
      const pulse = marker.ready ? 1 + 0.12 * Math.sin((opts.time ?? 0) * 10) : 1;
      drawAxeIcon(ctx, x + w / 2 + 20 * s, ly, 30 * s * pulse, marker.ready ? 1 : 0.5);
    }
  }
}

export function drawProjectile(ctx: CanvasRenderingContext2D, p: Projectile, x: number, y: number, t: number): void {
  const st = lookupProjectile2D(p.visual);
  if (st) {
    drawStyledProjectile(ctx, p, x, y, t, st.color, st.size, st.shape ?? 'orb', st.tip);
    return;
  }
  const c = TEAM_COLORS[p.team];
  const big = p.visual === 'tower' || p.visual === 'fountain';
  const r = big ? 16 : p.visual === 'siege' ? 12 : 8;
  if (p.visual === 'siege') {
    ctx.fillStyle = '#6b5a45';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const g = ctx.createRadialGradient(x, y, 1, x, y, r * 2.2);
  g.addColorStop(0, '#fff');
  g.addColorStop(0.35, big ? `rgba(${c.rgb},0.95)` : 'rgba(255,220,120,0.9)');
  g.addColorStop(1, 'rgba(255,200,80,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.2 * (1 + 0.1 * Math.sin(t * 20)), 0, Math.PI * 2);
  ctx.fill();
}

export function drawAreaEffect(ctx: CanvasRenderingContext2D, e: AreaEffect, t: number): void {
  const c = TEAM_COLORS[e.team];
  const k = Math.max(0, 1 - e.elapsed / Math.max(0.001, e.duration));
  ctx.strokeStyle = `rgba(${c.rgb},${0.3 + 0.4 * k})`;
  ctx.lineWidth = 4;
  ctx.setLineDash([18, 12]);
  ctx.lineDashOffset = -t * 40;
  ctx.beginPath();
  ctx.arc(e.pos.x, e.pos.y, e.radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = `rgba(${c.rgb},${0.08 * k})`;
  ctx.fill();
}

/** 注册了 2D 外观的弹道：orb = 发光球，line = 沿飞行方向的短线，arrow = 箭头，wave = 宽度跟随碰撞半径的新月形波 */
function drawStyledProjectile(
  ctx: CanvasRenderingContext2D, p: Projectile, x: number, y: number, t: number, color: string, size: number, shape: 'orb' | 'line' | 'arrow' | 'wave', tip = '#fff3c0',
): void {
  const dx = p.dir?.x ?? p.pos.x - p.prevPos.x;
  const dy = p.dir?.y ?? p.pos.y - p.prevPos.y;
  const a = Math.atan2(dy, dx);
  if (shape === 'wave') {
    const half = Math.max(size, p.width);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    const g = ctx.createLinearGradient(-size * 1.5, 0, size * 0.6, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.6, color);
    g.addColorStop(1, tip);
    ctx.fillStyle = g;
    ctx.globalAlpha = 0.85 + 0.15 * Math.sin(t * 25);
    ctx.beginPath();
    ctx.moveTo(-size * 0.4, -half);
    ctx.quadraticCurveTo(size * 1.2, 0, -size * 0.4, half);
    ctx.quadraticCurveTo(-size * 0.2, 0, -size * 0.4, -half);
    ctx.fill();
    ctx.restore();
    return;
  }
  if (shape === 'orb') {
    const g = ctx.createRadialGradient(x, y, 1, x, y, size * 2.2);
    g.addColorStop(0, '#fff');
    g.addColorStop(0.35, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, size * 2.2 * (1 + 0.1 * Math.sin(t * 20)), 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(2, size * 0.35);
  ctx.beginPath();
  ctx.moveTo(-size * 2, 0);
  ctx.lineTo(size * (shape === 'arrow' ? 1 : 2), 0);
  ctx.stroke();
  if (shape === 'arrow') {
    ctx.beginPath();
    ctx.moveTo(size * 2, 0);
    ctx.lineTo(size * 0.8, -size * 0.7);
    ctx.lineTo(size * 0.8, size * 0.7);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** 召唤物（2D）：阵营色底圈 + 木柱 + 发光的宝石（小图腾） */
export function drawSummon(ctx: CanvasRenderingContext2D, u: Unit, x: number, y: number, t: number): void {
  const c = TEAM_COLORS[u.team];
  const r = Math.max(14, u.radius * 1.1);
  ctx.strokeStyle = c.main;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.3, r * 1.3, r * 0.85, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#6a5240';
  ctx.fillRect(x - r * 0.22, y - r * 1.6, r * 0.44, r * 1.9);
  ctx.fillStyle = '#9a6a3a';
  ctx.fillRect(x - r * 0.5, y - r * 2.1, r, r * 0.7);
  const glow = 0.7 + 0.3 * Math.sin(t * 4 + u.id);
  const g = ctx.createRadialGradient(x, y - r * 2.5, 1, x, y - r * 2.5, r * 1.1);
  g.addColorStop(0, `rgba(${c.rgb},${glow})`);
  g.addColorStop(1, `rgba(${c.rgb},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y - r * 2.5, r * 1.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = c.light;
  ctx.beginPath();
  ctx.moveTo(x, y - r * 3);
  ctx.lineTo(x + r * 0.3, y - r * 2.5);
  ctx.lineTo(x, y - r * 2.05);
  ctx.lineTo(x - r * 0.3, y - r * 2.5);
  ctx.closePath();
  ctx.fill();
}

/** 是否在减速中：applySlow 的减速（`slow_<key>`），或其他减益 Modifier 的静态属性里有负的百分比移速 / 攻速（3D 和 2D 共用） */
export function isSlowed(u: Unit): boolean {
  for (const m of u.modifiers) {
    if (!m.def.debuff) continue;
    if (m.def.id.startsWith('slow_')) {
      if ((m.data.ms ?? 0) > 0 || (m.data.as ?? 0) > 0) return true;
      continue;
    }
    const st = m.def.stats;
    if (st && typeof st !== 'function' && ((st.moveSpeedPct ?? 0) < 0 || (st.attackSpeed ?? 0) < 0)) return true;
  }
  return false;
}

/** 2D 状态标记的种类（按显示顺序） */
export type StatusIcon2D = 'stun' | 'silence' | 'disarm' | 'break' | 'fear';

/** 单位当前需要显示的头顶状态图标（纯函数，测试用） */
export function statusIcons2D(u: Unit): StatusIcon2D[] {
  const out: StatusIcon2D[] = [];
  if (u.hasState('stunned')) out.push('stun');
  if (u.hasState('silenced')) out.push('silence');
  if (u.hasState('disarmed')) out.push('disarm');
  if (u.hasState('breakPassives')) out.push('break');
  if (u.stats.fearedBy !== null) out.push('fear');
  return out;
}

const ICON_COLORS: Record<StatusIcon2D, string> = { stun: '#f2c94c', silence: '#9a5ae0', disarm: '#e07a3a', break: '#4ea86a', fear: '#7a2ab8' };

/** 2D 状态标记（贴地部分）：缠绕（绿色荆棘圈）、减速（淡蓝色虚线圈）和注册的 Modifier 外观，(x, y) 是单位位置 */
export function drawStatusGround2D(ctx: CanvasRenderingContext2D, u: Unit, x: number, y: number, t: number): void {
  if (!u.alive) return;
  const slowed = isSlowed(u);
  const r = u.radius * (u.kind === 'hero' ? 1.9 : 1.6);
  if (u.hasState('rooted')) {
    ctx.strokeStyle = 'rgba(90,150,50,0.95)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.2, r, r * 0.66, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#3e6a24';
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + t * 0.4;
      const px = x + Math.cos(a) * r, py = y + r * 0.2 + Math.sin(a) * r * 0.66;
      ctx.beginPath();
      ctx.moveTo(px - 4, py);
      ctx.lineTo(px, py - 12);
      ctx.lineTo(px + 4, py);
      ctx.closePath();
      ctx.fill();
    }
  }
  if (slowed) {
    ctx.strokeStyle = 'rgba(143,216,255,0.8)';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = -t * 20;
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.2, r * 1.15, r * 0.76, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // 各英雄注册的持续外观（战吼、神之力量……）
  for (const m of u.modifiers) lookupModifier2D(m.def.id)?.(ctx, u, m, x, y, t);
}

/**
 * 头顶一排状态图标（眩晕金星、沉默、缴械、破坏、恐惧），图标行的底边在 bottom。
 * 2D 渲染器和 3D 渲染器的界面层共用；scale = 界面放大倍数，skip = 不画的种类（被 Modifier 外观替换掉的）。
 */
export function drawStatusIcons2D(ctx: CanvasRenderingContext2D, u: Unit, x: number, bottom: number, t: number, scale = 1, skip?: ReadonlySet<string>): void {
  if (!u.alive) return;
  const icons = skip ? statusIcons2D(u).filter((k) => !skip.has(k)) : statusIcons2D(u);
  if (!icons.length) return;
  const s = (u.kind === 'hero' ? 13 : 9) * scale;
  const top = bottom;
  icons.forEach((k, i) => {
    const ix = x + (i - (icons.length - 1) / 2) * s * 2.3;
    const iy = top - s + Math.sin(t * 4 + i) * 1.5;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.arc(ix, iy, s + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ICON_COLORS[k];
    ctx.beginPath();
    ctx.arc(ix, iy, s, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2.5 * scale;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (k === 'stun') {
      // 旋转的五角星
      for (let j = 0; j <= 10; j++) {
        const a = t * 3 + (j * Math.PI) / 5 - Math.PI / 2;
        const rr = j % 2 ? s * 0.3 : s * 0.72;
        if (j === 0) ctx.moveTo(ix + Math.cos(a) * rr, iy + Math.sin(a) * rr);
        else ctx.lineTo(ix + Math.cos(a) * rr, iy + Math.sin(a) * rr);
      }
      ctx.fillStyle = '#fff';
      ctx.fill();
    } else if (k === 'silence') {
      ctx.ellipse(ix, iy, s * 0.5, s * 0.3, 0, 0, Math.PI * 2);
      ctx.moveTo(ix - s * 0.7, iy + s * 0.7);
      ctx.lineTo(ix + s * 0.7, iy - s * 0.7);
    } else if (k === 'disarm') {
      ctx.moveTo(ix - s * 0.6, iy + s * 0.6);
      ctx.lineTo(ix + s * 0.6, iy - s * 0.6);
      ctx.moveTo(ix + s * 0.6, iy + s * 0.6);
      ctx.lineTo(ix - s * 0.6, iy - s * 0.6);
    } else if (k === 'break') {
      ctx.moveTo(ix - s * 0.1, iy - s * 0.8);
      ctx.lineTo(ix - s * 0.35, iy - s * 0.1);
      ctx.lineTo(ix + s * 0.25, iy + s * 0.1);
      ctx.lineTo(ix - s * 0.1, iy + s * 0.8);
    } else {
      ctx.moveTo(ix, iy - s * 0.7);
      ctx.quadraticCurveTo(ix + s * 0.6, iy + s * 0.2, ix, iy + s * 0.55);
      ctx.quadraticCurveTo(ix - s * 0.6, iy + s * 0.2, ix, iy - s * 0.7);
    }
    ctx.stroke();
  });
}
