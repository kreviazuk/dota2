import { groundHeight } from '../coords';
import { registerFx, registerModifierVisual, registerProjectileStyle } from './registry';

/**
 * 卓尔游侠的 3D 特效：三种普攻箭（普通的白箭、带霜雾拖尾的蓝色霜冻之箭、金色发光的射手天赋穿甲箭）、
 * 狂风的淡青色风刃新月（贴地推进、雪花和风痕拖尾）、数箭齐发的细小蓝箭、
 * 射手天赋生效时弓上淡淡的绿白色微光、精准光环在友方英雄脚下的小光圈。
 * 白色 / 浅色的东西在浅色沙地上会看不见：箭都带深一点的饱和色拖尾，粒子大多用普通混合，只有很小的亮芯用叠加。
 */
const FROST = 0x6cc8f4;
const FROST_DEEP = 0x2f8fd0;
const FROST_LIGHT = 0xc8ecff;
const GOLD = 0xffc83a;
const GOLD_DEEP = 0xe08a10;
const GOLD_CORE = 0xfff4c0;
const WIND = 0x5fd0ec;
const WIND_DEEP = 0x2a9ccc;
const WIND_LIGHT = 0xd8f8ff;

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

// ---------- 普攻 ----------
/** 普通箭：浅色的箭身，拖一道细细的深蓝灰色轨迹（浅色地面上也看得见） */
registerProjectileStyle('hero:drow_ranger', {
  mesh: 'arrow', color: 0xe8eef6, size: 20,
  trail: { color: 0x4a6a8e, every: 0.006, size: 7, additive: false },
});

/** 霜冻之箭：冰蓝色的箭 + 蓝色光晕，一路拖出普通混合的霜雾（淡蓝、深蓝两层）和少量亮白冰晶 */
registerProjectileStyle('drow_frost_arrow', {
  mesh: 'arrow', color: 0x7fd4ff, size: 22, halo: 34,
  trail: { color: FROST_DEEP, every: 0.006, size: 9, additive: false },
  emitter: (c) => {
    if (Math.random() < c.dt * 45) {
      c.fx.emit(c.x + rnd(-5, 5), c.h + rnd(-5, 5), c.y + rnd(-5, 5), rnd(-12, 12), rnd(-8, 12), rnd(-12, 12),
        Math.random() < 0.5 ? FROST_LIGHT : FROST, rnd(9, 13), 0.45, false, 22, 0.75);
    }
    if (Math.random() < c.dt * 14) c.fx.emit(c.x, c.h, c.y, 0, 0, 0, 0xffffff, 5, 0.22, true, -8);
  },
});

/** 射手天赋的穿甲箭：金色、更大的光晕，拖出橙金色的普通混合轨迹和叠加的亮金火星 */
registerProjectileStyle('drow_marksman_arrow', {
  mesh: 'arrow', color: GOLD, size: 25, halo: 64,
  trail: { color: GOLD_DEEP, every: 0.006, size: 10, additive: false },
  emitter: (c) => {
    if (Math.random() < c.dt * 40) {
      c.fx.emit(c.x + rnd(-4, 4), c.h + rnd(-4, 4), c.y + rnd(-4, 4), rnd(-20, 20), rnd(-10, 20), rnd(-20, 20), GOLD_CORE, rnd(6, 9), 0.3, true, -10);
    }
  },
});

// ---------- W 狂风 ----------
/**
 * 风刃：淡青色的新月贴地推进（宽度跟随碰撞半径）。叠加混合的新月网格在浅色沙地上几乎看不见，所以主体靠
 * 每帧沿新月画的普通混合弧线（深青粗线 + 白色细线，0.25 秒内淡出，在后面留下一串渐淡的弧）、
 * 整个宽度上吹出的深青 / 青色风团和飘落的雪花。
 */
registerProjectileStyle('drow_gust', {
  mesh: 'wave', color: 0x9ae8ff, size: 28, halo: 90, height: 34, scaleWithWidth: true,
  emitter: (c) => {
    const px = -c.dir.y, py = c.dir.x;
    if (Math.random() < c.dt * 45) {
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const u = i / 4 - 1;
        const bulge = (1 - u * u) * 34;
        pts.push({ x: c.x + px * u * c.width + c.dir.x * bulge, y: c.y + py * u * c.width + c.dir.y * bulge, h: c.gy + 28 + 16 * (1 - u * u) });
      }
      c.fx.line(pts, WIND_DEEP, 16, 0.26, { normal: true });
      c.fx.line(pts, WIND_LIGHT, 6, 0.18, { normal: true });
    }
    const n = Math.ceil(c.dt * 420);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1;
      const off = u * c.width * 1.05;
      const back = rnd(-40, 6);
      const x = c.x + px * off + c.dir.x * back;
      const y = c.y + py * off + c.dir.y * back;
      const r = Math.random();
      if (r < 0.6) {
        // 风团：向前、略向外吹的深青 / 青色雾团
        c.fx.emit(x, c.gy + rnd(8, 70), y, c.dir.x * 260 + px * u * 70, rnd(10, 50), c.dir.y * 260 + py * u * 70,
          Math.abs(u) > 0.6 || Math.random() < 0.35 ? WIND_DEEP : WIND, rnd(20, 30), rnd(0.3, 0.5), false, 16, 0.8);
      } else if (r < 0.92) {
        // 雪花：慢慢飘落
        c.fx.emit(x, c.gy + rnd(20, 90), y, c.dir.x * 120, rnd(-30, 20), c.dir.y * 120, WIND_LIGHT, rnd(6, 9), rnd(0.5, 0.8), false, 0, 0.95);
      } else {
        c.fx.emit(x, c.gy + rnd(15, 60), y, c.dir.x * 300, rnd(20, 60), c.dir.y * 300, 0xffffff, rnd(6, 9), 0.2, true, -8);
      }
    }
  },
});

/** 出手：卓尔身前一阵向前吹散的青色风团和雪花 */
registerFx('drow_gust', (e, c) => {
  const u = c.world.getUnit(e.unitId);
  const d = e.dir ?? { x: 0, y: -1 };
  const p = u?.pos ?? e.pos;
  const x = p.x + d.x * 50, y = p.y + d.y * 50;
  const gy = groundHeight(x, y);
  for (let i = 0; i < 26; i++) {
    const a = Math.atan2(d.y, d.x) + rnd(-0.9, 0.9);
    const sp = rnd(180, 420);
    c.fx.emit(x, gy + rnd(30, 110), y, Math.cos(a) * sp, rnd(-10, 40), Math.sin(a) * sp, Math.random() < 0.5 ? WIND : WIND_DEEP, rnd(12, 20), rnd(0.3, 0.45), false, 18, 0.75);
  }
  c.fx.burst(x, y, gy + 80, 14, WIND_LIGHT, 260, 6, 0.6, false, { up: 40, grav: 60 });
  c.fx.ring(p.x, p.y, 20, 120, WIND, 0.3, 10);
});

// ---------- E 数箭齐发 ----------
/** 细小的蓝箭（带深蓝拖尾） */
registerProjectileStyle('drow_multishot', {
  mesh: 'arrow', color: 0x6ab8f0, size: 18, halo: 26,
  trail: { color: FROST_DEEP, every: 0.007, size: 8, additive: false },
});

/** 开始引导：弓前一圈蓝色冰晶闪光 + 地面上朝射击方向的扇形（锥形两条边和中线上的一串贴地冰晶 + 两条淡出的边线） */
registerFx('drow_multishot', (e, c) => {
  const u = c.world.getUnit(e.unitId);
  const d = e.dir ?? { x: 0, y: -1 };
  const p = u?.pos ?? e.pos;
  const x = p.x + d.x * 45, y = p.y + d.y * 45;
  const gy = groundHeight(x, y);
  c.fx.burst(x, y, gy + 115, 18, FROST, 260, 9, 0.4, false, { up: 20 });
  c.fx.burst(x, y, gy + 115, 6, 0xffffff, 140, 6, 0.25, true);
  const a0 = Math.atan2(d.y, d.x);
  const half = (25 * Math.PI) / 180;
  for (const da of [-half, 0, half]) {
    const ax = Math.cos(a0 + da), ay = Math.sin(a0 + da);
    for (let i = 1; i <= 7; i++) {
      const r = 60 + i * 50;
      const qx = p.x + ax * r, qy = p.y + ay * r;
      c.fx.emit(qx, groundHeight(qx, qy) + 6, qy, ax * 80, rnd(10, 30), ay * 80, i % 2 ? FROST : FROST_DEEP, 15 - i, 0.45, false, 8, 0.85);
    }
    if (da !== 0) {
      const q0 = { x: p.x + ax * 60, y: p.y + ay * 60 }, q1 = { x: p.x + ax * 420, y: p.y + ay * 420 };
      c.fx.line([{ ...q0, h: groundHeight(q0.x, q0.y) + 5 }, { ...q1, h: groundHeight(q1.x, q1.y) + 5 }], FROST_DEEP, 7, 0.35, { normal: true });
    }
  }
});

// ---------- R 射手天赋 ----------
/** 生效时（附近没有敌方英雄、没被破坏）弓上淡淡的绿白色微光；失效时熄灭 */
registerModifierVisual('drow_marksmanship', (c) => {
  const u = c.u;
  if (!u.alive || c.dt <= 0 || c.m.data.off || u.hasState('breakPassives')) return;
  if (Math.random() > c.dt * 12) return;
  const f = { x: Math.cos(u.facing), y: Math.sin(u.facing) };
  // 左手边（sim 坐标 y 向下：朝向逆时针转 90° 是左手边）稍靠前，弓竖在那里
  const left = { x: f.y, y: -f.x };
  const k = rnd(0.25, 0.8);
  c.fx.emit(c.x + left.x * 18 + f.x * 14, c.gy + c.lift + c.height * k, c.y + left.y * 18 + f.y * 14, 0, rnd(10, 25), 0,
    Math.random() < 0.5 ? 0xd8ffe8 : 0x9af0c0, rnd(5, 8), 0.5, true, -4);
});

// ---------- 先天 精准光环 ----------
/** 友方远程英雄脚下一个很淡的冰蓝小光圈 */
registerModifierVisual('drow_precision_aura_buff', (c) => {
  if (!c.u.alive) return;
  const r = Math.max(30, c.u.radius * 1.5);
  c.decal('drow_precision').set(c.x, c.gy + 2, c.y, r, { color: 0x8fd0ee, opacity: 0.35 + 0.08 * Math.sin(c.time * 2.5), width: 3.5, soft: 2 });
});
