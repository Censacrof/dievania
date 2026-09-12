import type { EnemyDef, Sides } from './engine'

export const PLAYER = { hp: 30, handSize: 4, bag: [6, 6, 6, 6, 6, 6, 20, 20] as Sides[] }

const SLIME: EnemyDef = {
  name: 'Slime',
  hp: 12,
  pattern: [
    { name: 'Ooze', attack: [6], shield: [] },
    { name: 'Splash', attack: [6, 6], shield: [] },
  ],
}

const BAT: EnemyDef = { name: 'Bat', hp: 6, pattern: [{ name: 'Swoop', attack: [6], shield: [] }] }

const VAMPIRE_KNIGHT: EnemyDef = {
  name: 'Vampire Knight',
  hp: 35,
  pattern: [
    { name: 'Guard', attack: [6], shield: [20] },
    { name: 'Lunge', attack: [6, 6], shield: [] },
    { name: 'Bite', attack: [20, 20], shield: [], lifesteal: true },
  ],
}

export const ENCOUNTERS: EnemyDef[][] = [[SLIME], [BAT, BAT], [VAMPIRE_KNIGHT]]
