import {
  BoxGeometry, BufferAttribute, BufferGeometry, Color, ConeGeometry, CylinderGeometry, DodecahedronGeometry, Euler, ExtrudeGeometry,
  IcosahedronGeometry, Matrix4, OctahedronGeometry, Quaternion, Shape, SphereGeometry, TorusGeometry, Vector3,
} from 'three';
import { Rng } from '../sim/core/rng';

/**
 * 低多边形模型的"拼装器"：把若干基本体（盒子、圆柱、圆锥、球……）按位置 / 旋转 / 缩放摆好、各自上色，
 * 合并成一个带顶点色的几何体。一个骨骼（或一个静态物件）只需要一次绘制调用，所有模型共享同一种材质。
 * 每个三角面的颜色有轻微的随机明暗变化（种子固定），形成手绘感的低多边形质感。
 */
export type V3 = [number, number, number];

export interface PartOpts {
  /** 位置 */
  p?: V3;
  /** 旋转（弧度，XYZ 顺序） */
  r?: V3;
  /** 缩放 */
  s?: V3 | number;
  /** 每个三角面的明暗随机幅度（0–1），默认 0.08 */
  jitter?: number;
  /** 顶部颜色（做竖直渐变：从 color 到 top，按局部 y 插值） */
  top?: number;
}

const tmpColor = new Color();
const tmpTop = new Color();

export class GeoBuilder {
  private pos: number[] = [];
  private nrm: number[] = [];
  private col: number[] = [];
  private readonly rng: Rng;

  constructor(seed = 1) {
    this.rng = new Rng(seed);
  }

  /** 加入一个基本体（会被转换成非索引几何体，原对象随后释放） */
  add(g: BufferGeometry, color: number, o: PartOpts = {}): this {
    const geo = g.index ? g.toNonIndexed() : g;
    if (geo !== g) g.dispose();
    if (!geo.attributes.normal) geo.computeVertexNormals();
    const pa = geo.attributes.position as BufferAttribute;
    const na = geo.attributes.normal as BufferAttribute;
    // 竖直渐变用的局部 y 范围
    let ymin = Infinity, ymax = -Infinity;
    if (o.top !== undefined) {
      for (let i = 0; i < pa.count; i++) {
        ymin = Math.min(ymin, pa.getY(i));
        ymax = Math.max(ymax, pa.getY(i));
      }
    }
    const s = o.s === undefined ? [1, 1, 1] : typeof o.s === 'number' ? [o.s, o.s, o.s] : o.s;
    const m = new Matrix4().compose(
      new Vector3(...(o.p ?? [0, 0, 0])),
      new Quaternion().setFromEuler(new Euler(...(o.r ?? [0, 0, 0]))),
      new Vector3(s[0], s[1], s[2]),
    );
    const nm = new Matrix4().copy(m).invert().transpose();
    const v = new Vector3();
    const n = new Vector3();
    const base = tmpColor.setHex(color);
    const top = o.top !== undefined ? tmpTop.setHex(o.top) : null;
    const jitter = o.jitter ?? 0.08;
    for (let i = 0; i < pa.count; i++) {
      const ly = pa.getY(i);
      v.set(pa.getX(i), ly, pa.getZ(i)).applyMatrix4(m);
      n.set(na.getX(i), na.getY(i), na.getZ(i)).applyMatrix4(nm).normalize();
      this.pos.push(v.x, v.y, v.z);
      this.nrm.push(n.x, n.y, n.z);
    }
    for (let f = 0; f < pa.count; f += 3) {
      const k = 1 + (this.rng.next() * 2 - 1) * jitter;
      for (let j = 0; j < 3; j++) {
        let r = base.r, g2 = base.g, b = base.b;
        if (top) {
          const t = ymax > ymin ? (pa.getY(f + j) - ymin) / (ymax - ymin) : 0;
          r += (top.r - r) * t;
          g2 += (top.g - g2) * t;
          b += (top.b - b) * t;
        }
        this.col.push(r * k, g2 * k, b * k);
      }
    }
    geo.dispose();
    return this;
  }

  box(w: number, h: number, d: number, color: number, o?: PartOpts): this {
    return this.add(new BoxGeometry(w, h, d), color, o);
  }
  /** 圆柱：rt 顶半径、rb 底半径、h 高、seg 边数（中心在原点） */
  cyl(rt: number, rb: number, h: number, seg: number, color: number, o?: PartOpts, open = false): this {
    return this.add(new CylinderGeometry(rt, rb, h, seg, 1, open), color, o);
  }
  /** open = 不要底面（从上方看不到的部位，省三角形） */
  cone(r: number, h: number, seg: number, color: number, o?: PartOpts, open = false): this {
    return this.add(new ConeGeometry(r, h, seg, 1, open), color, o);
  }
  sphere(r: number, ws: number, hs: number, color: number, o?: PartOpts, phiLen = Math.PI * 2, thetaLen = Math.PI): this {
    return this.add(new SphereGeometry(r, ws, hs, 0, phiLen, 0, thetaLen), color, o);
  }
  ico(r: number, detail: number, color: number, o?: PartOpts): this {
    return this.add(new IcosahedronGeometry(r, detail), color, o);
  }
  dodeca(r: number, color: number, o?: PartOpts): this {
    return this.add(new DodecahedronGeometry(r, 0), color, o);
  }
  octa(r: number, color: number, o?: PartOpts): this {
    return this.add(new OctahedronGeometry(r, 0), color, o);
  }
  torus(r: number, tube: number, rs: number, ts: number, color: number, o?: PartOpts, arc = Math.PI * 2): this {
    return this.add(new TorusGeometry(r, tube, rs, ts, arc), color, o);
  }
  /** 把二维轮廓（XY 平面）沿 Z 挤出 depth（居中） */
  extrude(points: [number, number][], depth: number, color: number, o?: PartOpts): this {
    const sh = new Shape();
    sh.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) sh.lineTo(points[i][0], points[i][1]);
    sh.closePath();
    const g = new ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 1 });
    g.translate(0, 0, -depth / 2);
    g.deleteAttribute('uv');
    return this.add(g, color, o);
  }

  get empty(): boolean {
    return this.pos.length === 0;
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nrm), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}
