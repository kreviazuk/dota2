import type { HeroDef } from './types';
import { AXE } from './axe';
import { SVEN } from './sven';
import { LINA } from './lina';
import { CRYSTAL_MAIDEN } from './crystal_maiden';
import { ZEUS } from './zeus';
import { DROW_RANGER } from './drow_ranger';

const REGISTRY = new Map<string, HeroDef>();

export function registerHero(def: HeroDef): void {
  REGISTRY.set(def.id, def);
}

export function getHeroDef(id: string): HeroDef {
  const d = REGISTRY.get(id);
  if (!d) throw new Error(`未知英雄: ${id}`);
  return d;
}

export const hasHero = (id: string): boolean => REGISTRY.has(id);

export const allHeroIds = (): string[] => [...REGISTRY.keys()];

registerHero(AXE);
registerHero(SVEN);
registerHero(LINA);
registerHero(CRYSTAL_MAIDEN);
registerHero(ZEUS);
registerHero(DROW_RANGER);
