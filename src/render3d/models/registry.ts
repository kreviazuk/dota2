import type { Object3D } from 'three';
import type { Unit } from '../../sim/entities/unit';
import type { HeroModelSpec } from './heroModel';

/**
 * 英雄模型 / 召唤物模型注册表。各英雄的 `models/<id>.ts` 在模块加载时注册自己（`fx/index.ts` 统一导入），
 * 渲染器只按 id 查表，不再认识具体的英雄。
 */
const HEROES = new Map<string, HeroModelSpec>();

export function registerHeroModel(spec: HeroModelSpec): void {
  HEROES.set(spec.id, spec);
}

/** 未注册时退回斧王（斧王总是注册的） */
export function heroModelSpec(heroId: string): HeroModelSpec {
  const s = HEROES.get(heroId) ?? HEROES.get('axe');
  if (!s) throw new Error('没有注册任何英雄模型（缺少 import "./fx/index"？）');
  return s;
}

export const heroModelIds = (): string[] => [...HEROES.keys()];

/** 召唤物模型：build 一次（每个召唤物一个实例），height = 头顶高度（血条锚点），update 每帧调用（动画） */
export interface SummonModelSpec {
  build(team: number): Object3D;
  height: number;
  update?(obj: Object3D, u: Unit, time: number): void;
}

const SUMMONS = new Map<string, SummonModelSpec>();

export function registerSummonModel(defId: string, spec: SummonModelSpec): void {
  SUMMONS.set(defId, spec);
}

/** 未注册时返回 undefined（渲染器画通用的小图腾） */
export const summonModelSpec = (defId: string): SummonModelSpec | undefined => SUMMONS.get(defId);
