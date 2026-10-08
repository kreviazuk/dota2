import { MAP, walkableHalfWidthAt } from '../sim/data/map';
import { Rng } from '../sim/core/rng';

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

/** 静态地面图块的边长（世界单位） */
export const MAP_TILE = 512;
/** 树丛精灵最大半边长（r 最大 66 × 1.1）+ 余量：画图块时要包含邻近图块里伸进来的树 */
const TREE_REACH = 80;
/** 复用的空闲图块画布数量上限 */
const TILE_POOL = 8;

export interface TileRange { ix0: number; ix1: number; iy0: number; iy1: number }

/**
 * 覆盖整个画布（设备像素 [0,w)×[0,h)）需要的图块下标范围（含两端）。
 * k：设备像素 / 世界单位；tx、ty：世界原点在画布上的设备像素坐标（即 camera.apply 设置的变换）。
 */
export function visibleTiles(k: number, tx: number, ty: number, w: number, h: number): TileRange {
  return {
    ix0: Math.floor(-tx / k / MAP_TILE),
    ix1: Math.floor((w - tx) / k / MAP_TILE),
    iy0: Math.floor(-ty / k / MAP_TILE),
    iy1: Math.floor((h - ty) / k / MAP_TILE),
  };
}

/** 图块在画布上的设备像素矩形：起点取整，宽高由相邻图块的取整起点相减得到，保证图块之间不重叠也没有缝 */
export function tileRect(ix: number, iy: number, k: number, tx: number, ty: number): { x: number; y: number; w: number; h: number } {
  const x = Math.round(ix * MAP_TILE * k + tx);
  const y = Math.round(iy * MAP_TILE * k + ty);
  return { x, y, w: Math.round((ix + 1) * MAP_TILE * k + tx) - x, h: Math.round((iy + 1) * MAP_TILE * k + ty) - y };
}

/** 最近最少使用缓存（Map 保持插入顺序：访问时移到末尾，淘汰时从头部删除） */
export class LruCache<K, V> {
  private readonly map = new Map<K, V>();

  get size(): number {
    return this.map.size;
  }

  get(key: K): V | undefined {
    const v = this.map.get(key);
    if (v !== undefined) {
      this.map.delete(key);
      this.map.set(key, v);
    }
    return v;
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  set(key: K, v: V): void {
    this.map.delete(key);
    this.map.set(key, v);
  }

  /** 淘汰最久未使用的条目直到不超过 max，返回被淘汰的值 */
  trim(max: number): V[] {
    const out: V[] = [];
    for (const [k, v] of this.map) {
      if (this.map.size <= max) break;
      this.map.delete(k);
      out.push(v);
    }
    return out;
  }

  clear(): V[] {
    const out = [...this.map.values()];
    this.map.clear();
    return out;
  }
}

const tileKey = (ix: number, iy: number): number => ix * 65536 + iy;

/**
 * 地图层。地面、道路、树林、装饰和河道底色都是静态的：按 MAP_TILE 切成图块，第一次用到时按当前分辨率
 * 预渲染到离屏 Canvas 并缓存（设计文档 §10.4），每帧只需要把可见图块按设备像素对齐贴上去，
 * 再画会动的河面波纹。手机上每帧的绘制调用从几百次（每棵树一次）降到几十次，填充像素量也从约 5 倍屏幕降到 1 倍多。
 */
export class MapLayer {
  private trees: Tree[] = [];
  private decos: Deco[] = [];
  private sprites: HTMLCanvasElement[][] = [[], []];
  private pat: { forest: CanvasPattern; lane: CanvasPattern; baseR: CanvasPattern; baseD: CanvasPattern } | null = null;
  private readonly tiles = new LruCache<number, HTMLCanvasElement>();
  private pool: HTMLCanvasElement[] = [];
  /** 缓存图块对应的分辨率（设备像素 / 世界单位）；窗口尺寸或 DPR 变化后整体失效 */
  private tileK = 0;

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

  draw(ctx: CanvasRenderingContext2D, time: number): void {
    // 读 camera.apply 设置的变换：k = 设备像素 / 世界单位，(tx, ty) = 世界原点的设备像素坐标（含镜头震动）
    const m = ctx.getTransform();
    const k = m.a;
    const tx = m.e;
    const ty = m.f;
    if (k !== this.tileK) {
      this.release(this.tiles.clear());
      this.tileK = k;
    }
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    const vis = visibleTiles(k, tx, ty, W, H);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (let iy = vis.iy0; iy <= vis.iy1; iy++) {
      for (let ix = vis.ix0; ix <= vis.ix1; ix++) {
        const tile = this.tile(ix, iy, k);
        const r = tileRect(ix, iy, k, tx, ty);
        ctx.drawImage(tile, 0, 0, r.w, r.h, r.x, r.y, r.w, r.h);
      }
    }
    ctx.restore();
    // 预取：可见范围外一圈里还没缓存的图块，每帧最多补一个，避免镜头移动到新的一行时一帧里生成一整行
    prefetch: for (let iy = vis.iy0 - 1; iy <= vis.iy1 + 1; iy++) {
      for (let ix = vis.ix0 - 1; ix <= vis.ix1 + 1; ix++) {
        if (!this.tiles.has(tileKey(ix, iy))) {
          this.tile(ix, iy, k);
          break prefetch;
        }
      }
    }
    // 缓存上限 = 可见范围加外圈一层（预取的范围）再留一点余量
    this.release(this.tiles.trim((vis.ix1 - vis.ix0 + 3) * (vis.iy1 - vis.iy0 + 3) + 4));

    // 河面波纹（唯一会动的部分）
    const x0 = -tx / k - 40;
    const x1 = (W - tx) / k + 40;
    const y0 = -ty / k;
    const y1 = (H - ty) / k;
    const ry0 = MAP.riverY - MAP.riverHalf;
    if (ry0 + MAP.riverHalf * 2 > y0 && ry0 < y1) {
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
  }

  private release(canvases: HTMLCanvasElement[]): void {
    for (const c of canvases) {
      if (this.pool.length < TILE_POOL && c.width === Math.ceil(MAP_TILE * this.tileK) + 2) this.pool.push(c);
      else c.width = c.height = 0; // 立即释放显存（Safari 不会及时回收）
    }
  }

  private tile(ix: number, iy: number, k: number): HTMLCanvasElement {
    const key = tileKey(ix, iy);
    const hit = this.tiles.get(key);
    if (hit) return hit;
    // 多留 2 像素：tileRect 取整后的宽高最多比 MAP_TILE*k 大 1
    const px = Math.ceil(MAP_TILE * k) + 2;
    const c = this.pool.pop() ?? document.createElement('canvas');
    if (c.width !== px) c.width = px;
    if (c.height !== px) c.height = px;
    const g = c.getContext('2d', { alpha: false })!;
    g.setTransform(k, 0, 0, k, -ix * MAP_TILE * k, -iy * MAP_TILE * k);
    const x0 = ix * MAP_TILE;
    const y0 = iy * MAP_TILE;
    this.drawStatic(g, x0, y0, x0 + px / k, y0 + px / k);
    this.tiles.set(key, c);
    return c;
  }

  /** 画世界矩形 [x0,x1)×[y0,y1) 内的静态地面（顺序与原先逐帧绘制时相同） */
  private drawStatic(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
    const p = this.patterns(ctx);
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

    const ry0 = MAP.riverY - MAP.riverHalf;
    if (ry0 + MAP.riverHalf * 2 > y0 && ry0 < y1) {
      const g = ctx.createLinearGradient(0, ry0, 0, ry0 + MAP.riverHalf * 2);
      g.addColorStop(0, '#1d4a5c');
      g.addColorStop(0.5, '#2a6f86');
      g.addColorStop(1, '#1d4a5c');
      ctx.fillStyle = g;
      ctx.fillRect(x0, ry0, x1 - x0, MAP.riverHalf * 2);
    }

    for (const d of this.decos) {
      if (d.y < y0 - 25 || d.y > y1 + 25 || d.x < x0 - 25 || d.x > x1 + 25) continue;
      ctx.fillStyle = d.kind === 0 ? '#5b5a52' : d.kind === 1 ? '#2f5a2c' : '#7a6a4a';
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const t of this.trees) {
      if (t.y < y0 - TREE_REACH || t.y > y1 + TREE_REACH || t.x < x0 - TREE_REACH || t.x > x1 + TREE_REACH) continue;
      const spr = this.sprites[t.dire ? 1 : 0][t.v];
      ctx.drawImage(spr, t.x - t.r * 1.1, t.y - t.r * 1.1, t.r * 2.2, t.r * 2.2);
    }
  }
}
