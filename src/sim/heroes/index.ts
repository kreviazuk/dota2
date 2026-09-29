import type { HeroDef } from './types';
import { AXE } from './axe';

const REGISTRY = new Map<string, HeroDef>();

export function registerHero(def: HeroDef): void {
  REGISTRY.set(def.id, def);
}

export function getHeroDef(id: string): HeroDef {
  const d = REGISTRY.get(id);
  if (!d) throw new Error(`未知英雄: ${id}`);
  return d;
}

export const allHeroIds = (): string[] => [...REGISTRY.keys()];

registerHero(AXE);
