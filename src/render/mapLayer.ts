import { MAP } from '../sim/data/map';
import { Rng } from '../sim/core/rng';
import { groundHeight } from '../render3d/coords';

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

  set(key: K, val: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, val);
  }

  delete(key: K): boolean {
    return this.map.delete(key);
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

  keys(): IterableIterator<K> {
    return this.map.keys();
  }

  /**
   * 当缓存项超过 maxCount 时，淘汰最久未访问的条目（即 map 的最前项）。
   * onEvict 回调被淘汰的值（例如放入对象池复用）。
   */
  evictOldest(maxCount: number, onEvict?: (val: V, key: K) => void): void {
    while (this.map.size > maxCount) {
      const it = this.map.entries().next();
      if (it.done) break;
      const [k, v] = it.value;
      this.map.delete(k);
      onEvict?.(v, k);
    }
  }
}

export class MapLayer {
  private pat: { forest: CanvasPattern; lane: CanvasPattern; baseR: CanvasPattern; baseD: CanvasPattern } | null = null;
  private readonly trees: Tree[] = [];
  private readonly decos: Deco[] = [];
  private readonly sprites: [HTMLCanvasElement[], HTMLCanvasElement[]] = [[], []];

  /** 已渲染图块的缓存：key 为 `${ix},${iy}` */
  private readonly tiles = new LruCache<string, HTMLCanvasElement>();
  /** 淘汰后放进空闲池的离屏画布，避免反复 document.createElement */
  private readonly freeCanvases: HTMLCanvasElement[] = [];
  /** 缓存图块对应的分辨率（设备像素 / 世界单位）；窗口尺寸或 DPR 变化后整体失效 */
  private tileK = 0;

  constructor() {
    const r = new Rng(2026);
    for (let i = 0; i < 6; i++) {
      this.sprites[0].push(treeSprite(100 + i, false));
      this.sprites[1].push(treeSprite(200 + i, true));
    }
    // 在全地图丛林/高地区域合理生成树木
    for (let y = 100; y <= MAP.height - 100; y += 180) {
      for (let x = 100; x <= MAP.width - 100; x += 180) {
        if (Math.abs(y - MAP.riverY) < MAP.riverHalf + 60) continue;
        if (groundHeight(x, y) > 4) {
          this.trees.push({
            x: x + r.range(-40, 40),
            y: y + r.range(-40, 40),
            r: r.range(42, 66),
            v: r.int(0, 5),
            dire: y + r.range(-500, 500) < MAP.height / 2,
          });
        }
      }
    }
    this.trees.sort((a, b) => a.y - b.y);
    for (let i = 0; i < 600; i++) {
      const x = r.range(MAP.minX, MAP.maxX);
      const y = r.range(MAP.minY, MAP.maxY);
      if (groundHeight(x, y) <= 4) {
        this.decos.push({ x, y, r: r.range(6, 20), kind: r.int(0, 2) });
      }
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
    const transform = ctx.getTransform();
    const k = transform.a;
    const tx = transform.e;
    const ty = transform.f;
    const canvas = ctx.canvas;
    const viewW = canvas.width;
    const viewH = canvas.height;

    if (Math.abs(this.tileK - k) > 1e-4) {
      this.tiles.clear();
      this.tileK = k;
    }

    const { ix0, ix1, iy0, iy1 } = visibleTiles(k, tx, ty, viewW, viewH);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    for (let iy = iy0; iy <= iy1; iy++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        const tile = this.getTile(ix, iy, k);
        const r = tileRect(ix, iy, k, tx, ty);
        ctx.drawImage(tile, 0, 0, tile.width, tile.height, r.x, r.y, r.w, r.h);
      }
    }
    ctx.restore();

    this.tiles.evictOldest(64, (c) => {
      if (this.freeCanvases.length < TILE_POOL) this.freeCanvases.push(c);
    });

    // 动态河水波纹：只在视野内的河道矩形里画几道高光正弦波
    const ry0 = MAP.riverY - MAP.riverHalf;
    const ry1 = MAP.riverY + MAP.riverHalf;
    const x0 = -tx / k;
    const x1 = (viewW - tx) / k;
    const y0 = -ty / k;
    const y1 = (viewH - ty) / k;
    if (ry1 > y0 && ry0 < y1) {
      ctx.save();
      ctx.fillStyle = 'rgba(180,225,245,0.14)';
      for (let i = 0; i < 4; i++) {
        const cy = MAP.riverY + (i - 1.5) * 80 + Math.sin(time * 1.5 + i) * 16;
        if (cy < y0 - 30 || cy > y1 + 30) continue;
        ctx.beginPath();
        ctx.moveTo(x0 - 50, cy);
        for (let x = x0 - 50; x <= x1 + 50; x += 80) {
          ctx.lineTo(x, cy + Math.sin(x * 0.008 + time * 2.2 + i * 1.3) * 12);
        }
        ctx.lineTo(x1 + 50, cy + 22);
        ctx.lineTo(x0 - 50, cy + 22);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private getTile(ix: number, iy: number, k: number): HTMLCanvasElement {
    const key = `${ix},${iy}`;
    const cached = this.tiles.get(key);
    if (cached) return cached;

    const px = Math.ceil(MAP_TILE * k);
    const c = this.freeCanvases.pop() ?? document.createElement('canvas');
    if (c.width !== px || c.height !== px) {
      c.width = px;
      c.height = px;
    }
    const g = c.getContext('2d')!;
    g.setTransform(k, 0, 0, k, -ix * MAP_TILE * k, -iy * MAP_TILE * k);

    const x0 = ix * MAP_TILE;
    const y0 = iy * MAP_TILE;
    this.drawStatic(g, x0, y0, x0 + px / k, y0 + px / k);
    this.tiles.set(key, c);
    return c;
  }

  /** 画世界矩形 [x0,x1)×[y0,y1) 内的静态地面 */
  private drawStatic(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
    const p = this.patterns(ctx);
    ctx.fillStyle = p.forest;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);

    const drawRoad = (pts: readonly { x: number; y: number }[], width: number, stroke: string | CanvasPattern) => {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    };

    const topPath = [{ x: 1500, y: 8500 }, { x: 1500, y: 1500 }, { x: 8500, y: 1500 }];
    const midPath = [{ x: 1500, y: 8500 }, { x: 8500, y: 1500 }];
    const botPath = [{ x: 1500, y: 8500 }, { x: 8500, y: 8500 }, { x: 8500, y: 1500 }];
    const allPaths = [topPath, midPath, botPath];

    // 基地底盘
    ctx.fillStyle = p.baseR;
    ctx.beginPath();
    ctx.arc(1500, 8500, MAP.baseHalfWidth, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = p.baseD;
    ctx.beginPath();
    ctx.arc(8500, 1500, MAP.baseHalfWidth, 0, Math.PI * 2);
    ctx.fill();

    // 道路边缘深色悬崖带
    for (const path of allPaths) {
      drawRoad(path, MAP.laneHalfWidth * 2 + 40, 'rgba(25,16,8,0.7)');
    }
    // 道路路面
    for (const path of allPaths) {
      drawRoad(path, MAP.laneHalfWidth * 2, p.lane);
    }
    // 道路中心微光带
    for (const path of allPaths) {
      drawRoad(path, 140, 'rgba(255,235,190,0.06)');
    }

    // 阵营色调：夜魇半场偏暗红，天辉半场偏绿
    const tint = ctx.createLinearGradient(0, MAP.height / 2 - 2000, 0, MAP.height / 2 + 2000);
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
