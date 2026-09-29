import { MAP, walkableHalfWidthAt } from '../sim/data/map';
import { Rng } from '../sim/core/rng';
import type { Camera } from './camera';

interface Tree { x: number; y: number; r: number; v: number; dire: boolean }
interface Deco { x: number; y: number; r: number; kind: number }

/** 预渲染的噪声图块（做成 pattern 平铺，作为地面纹理） */
function noiseCanvas(size: number, base: string, dots: string[], seed: number, count: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  const r = new Rng(seed);
  for (let i = 0; i < count; i++) {
    g.fillStyle = r.pick(dots);
    g.globalAlpha = r.range(0.12, 0.45);
    const s = r.range(1, 5);
    g.beginPath();
    g.arc(r.range(0, size), r.range(0, size), s, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  return c;
}

/** 预渲染的树丛精灵：几层深浅不同的圆簇 */
function treeSprite(seed: number, dire: boolean): HTMLCanvasElement {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const r = new Rng(seed);
  const pal = dire ? ['#26191a', '#3a2320', '#552b22', '#6d3a25'] : ['#12291a', '#1b4023', '#28592d', '#3b7536'];
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath();
  g.ellipse(S / 2 + 8, S / 2 + 12, 50, 42, 0, 0, Math.PI * 2);
  g.fill();
  for (let layer = 0; layer < 4; layer++) {
    g.fillStyle = pal[layer];
    const rad = 40 - layer * 8;
    for (let i = 0; i < 5 - layer; i++) {
      const a = r.range(0, Math.PI * 2);
      const d = r.range(0, 14 - layer * 2);
      g.beginPath();
      g.arc(S / 2 + Math.cos(a) * d - layer * 3, S / 2 + Math.sin(a) * d - layer * 4, rad * r.range(0.7, 1), 0, Math.PI * 2);
      g.fill();
    }
  }
  return c;
}

export class MapLayer {
  private trees: Tree[] = [];
  private decos: Deco[] = [];
  private sprites: HTMLCanvasElement[][] = [[], []];
  private pat: { forest: CanvasPattern; lane: CanvasPattern; baseR: CanvasPattern; baseD: CanvasPattern } | null = null;

  constructor() {
    const r = new Rng(2026);
    for (let i = 0; i < 6; i++) {
      this.sprites[0].push(treeSprite(100 + i, false));
      this.sprites[1].push(treeSprite(200 + i, true));
    }
    for (let y = 0; y <= MAP.height; y += 75) {
      if (Math.abs(y - MAP.riverY) < MAP.riverHalf + 60) continue;
      const hw = walkableHalfWidthAt(y) + 45;
      for (const side of [-1, 1]) {
        const inner = MAP.laneX + side * hw;
        const outer = side < 0 ? -150 : MAP.width + 150;
        const n = Math.ceil(Math.abs(outer - inner) / 85);
        for (let k = 0; k < n; k++) {
          this.trees.push({
            x: inner + side * (k * 85 + r.range(0, 40)), y: y + r.range(-30, 30), r: r.range(42, 66), v: r.int(0, 5),
            dire: y + r.range(-500, 500) < MAP.height / 2,
          });
        }
      }
    }
    this.trees.sort((a, b) => a.y - b.y);
    for (let i = 0; i < 500; i++) {
      const y = r.range(0, MAP.height);
      const side = r.chance(0.5) ? -1 : 1;
      this.decos.push({ x: MAP.laneX + side * (walkableHalfWidthAt(y) - r.range(0, 80)), y, r: r.range(6, 20), kind: r.int(0, 2) });
    }
  }

  private patterns(ctx: CanvasRenderingContext2D) {
    if (!this.pat) {
      this.pat = {
        forest: ctx.createPattern(noiseCanvas(256, '#16241a', ['#0e1a12', '#223a26', '#2a2a1a'], 1, 900), 'repeat')!,
        lane: ctx.createPattern(noiseCanvas(256, '#6b5a3e', ['#5a4a32', '#7d6a4a', '#8a7856', '#4d3f2b'], 2, 1400), 'repeat')!,
        baseR: ctx.createPattern(noiseCanvas(256, '#5d6b58', ['#4f5c4a', '#73826c', '#8a9a80'], 3, 1200), 'repeat')!,
        baseD: ctx.createPattern(noiseCanvas(256, '#5a4440', ['#4a3632', '#6e524c', '#3a2a28'], 4, 1200), 'repeat')!,
      };
    }
    return this.pat;
  }

  draw(ctx: CanvasRenderingContext2D, cam: Camera, time: number): void {
    const p = this.patterns(ctx);
    const x0 = cam.x - cam.worldW / 2 - 150;
    const x1 = cam.x + cam.worldW / 2 + 150;
    const y0 = cam.y - cam.worldH / 2 - 200;
    const y1 = cam.y + cam.worldH / 2 + 200;
    ctx.fillStyle = p.forest;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);

    const band = (ya: number, yb: number, hw: number, fill: string | CanvasPattern) => {
      const a = Math.max(ya, y0);
      const b = Math.min(yb, y1);
      if (b <= a) return;
      ctx.fillStyle = fill;
      ctx.fillRect(MAP.laneX - hw, a, hw * 2, b - a);
    };
    const top = MAP.baseDepth;
    const bottom = MAP.height - MAP.baseDepth;
    // 道路边缘的深色"悬崖"带
    band(top, bottom, MAP.laneHalfWidth + 36, 'rgba(25,16,8,0.7)');
    band(0, top, MAP.baseHalfWidth + 36, 'rgba(25,16,8,0.7)');
    band(bottom, MAP.height, MAP.baseHalfWidth + 36, 'rgba(25,16,8,0.7)');
    band(top, bottom, MAP.laneHalfWidth, p.lane);
    band(0, top, MAP.baseHalfWidth, p.baseD);
    band(bottom, MAP.height, MAP.baseHalfWidth, p.baseR);
    band(top, bottom, 140, 'rgba(255,235,190,0.06)');

    // 阵营色调：夜魇半场偏暗红，天辉半场偏绿
    const tint = ctx.createLinearGradient(0, MAP.height / 2 - 1500, 0, MAP.height / 2 + 1500);
    tint.addColorStop(0, 'rgba(120,20,10,0.16)');
    tint.addColorStop(0.5, 'rgba(0,0,0,0)');
    tint.addColorStop(1, 'rgba(20,110,40,0.12)');
    ctx.fillStyle = tint;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);

    if (MAP.riverY + 400 > y0 && MAP.riverY - 400 < y1) {
      const ry0 = MAP.riverY - MAP.riverHalf;
      const g = ctx.createLinearGradient(0, ry0, 0, ry0 + MAP.riverHalf * 2);
      g.addColorStop(0, '#1d4a5c');
      g.addColorStop(0.5, '#2a6f86');
      g.addColorStop(1, '#1d4a5c');
      ctx.fillStyle = g;
      ctx.fillRect(x0, ry0, x1 - x0, MAP.riverHalf * 2);
      ctx.strokeStyle = 'rgba(190,240,255,0.25)';
      ctx.lineWidth = 4;
      for (let i = 0; i < 6; i++) {
        const yy = ry0 + 30 + i * 45;
        ctx.beginPath();
        for (let x = x0; x <= x1; x += 40) {
          const yv = yy + Math.sin(x * 0.012 + time * 1.6 + i) * 8;
          if (x === x0) ctx.moveTo(x, yv);
          else ctx.lineTo(x, yv);
        }
        ctx.stroke();
      }
    }

    for (const d of this.decos) {
      if (d.y < y0 || d.y > y1) continue;
      ctx.fillStyle = d.kind === 0 ? '#5b5a52' : d.kind === 1 ? '#2f5a2c' : '#7a6a4a';
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const t of this.trees) {
      if (t.y < y0 - 80 || t.y > y1 + 80 || t.x < x0 - 80 || t.x > x1 + 80) continue;
      const spr = this.sprites[t.dire ? 1 : 0][t.v];
      ctx.drawImage(spr, t.x - t.r * 1.1, t.y - t.r * 1.1, t.r * 2.2, t.r * 2.2);
    }
  }
}
