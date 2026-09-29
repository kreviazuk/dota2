export enum Team {
  Radiant = 0,
  Dire = 1,
}
export const enemyTeam = (t: Team): Team => (t === Team.Radiant ? Team.Dire : Team.Radiant);
export const TEAMS: readonly Team[] = [Team.Radiant, Team.Dire];

export type DamageType = 'physical' | 'magical' | 'pure';
export type UnitKind = 'hero' | 'creep' | 'elite' | 'building' | 'summon';
export type AttackClass = 'hero' | 'basic' | 'pierce' | 'siege' | 'tower' | 'elite';
export type ArmorClass = 'hero' | 'basic' | 'reinforced';
export type AbilitySlot = 'Q' | 'W' | 'E' | 'R' | 'X1' | 'X2';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type Attribute = 'str' | 'agi' | 'int';
