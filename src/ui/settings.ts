/**
 * 玩家偏好（localStorage）。读写都包 try/catch：隐私模式、存储被禁用或数据损坏时用默认值，界面照常工作。
 */
export interface Prefs {
  /** 自动加点（技能按 AI 的加点顺序，天赋按 AI 的预设） */
  autoLevel: boolean;
  /** 站立时自动攻击附近的敌人 */
  autoAttack: boolean;
}

const PREFS_KEY = 'dota-lane.prefs';
const LAST_HERO_KEY = 'dota-lane.lastHero';

export const DEFAULT_PREFS: Readonly<Prefs> = { autoLevel: false, autoAttack: true };

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    const p = raw ? (JSON.parse(raw) as Partial<Prefs>) : {};
    return {
      autoLevel: typeof p.autoLevel === 'boolean' ? p.autoLevel : DEFAULT_PREFS.autoLevel,
      autoAttack: typeof p.autoAttack === 'boolean' ? p.autoAttack : DEFAULT_PREFS.autoAttack,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(p: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ autoLevel: p.autoLevel, autoAttack: p.autoAttack }));
  } catch {
    // 存不了就只在本次会话里生效
  }
}

/** 上次选的英雄（选英雄界面默认选中它） */
export function loadLastHero(): string | null {
  try {
    return localStorage.getItem(LAST_HERO_KEY);
  } catch {
    return null;
  }
}

export function saveLastHero(id: string): void {
  try {
    localStorage.setItem(LAST_HERO_KEY, id);
  } catch {
    // 忽略
  }
}
