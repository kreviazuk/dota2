import { Group, Mesh, type BufferGeometry, type Material, type Object3D } from 'three';
import type { V3 } from '../geo';

/** 骨骼：只是一个带名字的 Group，几何体挂在它下面（英雄）或按它的世界矩阵写进实例化网格（小兵） */
export function bone(parent: Object3D, name: string, p: V3 = [0, 0, 0]): Group {
  const g = new Group();
  g.name = name;
  g.position.set(p[0], p[1], p[2]);
  parent.add(g);
  return g;
}

export function attach(b: Object3D, geo: BufferGeometry, mat: Material, shadow = true): Mesh {
  const m = new Mesh(geo, mat);
  m.castShadow = shadow;
  m.receiveShadow = false;
  b.add(m);
  return m;
}

/** 按 key 缓存的几何体（同一阵营同一部件的所有单位共用） */
const cache = new Map<string, BufferGeometry>();
export function cachedGeo(key: string, build: () => BufferGeometry): BufferGeometry {
  let g = cache.get(key);
  if (!g) cache.set(key, (g = build()));
  return g;
}
