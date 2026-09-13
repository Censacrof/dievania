import type { EnemyDef, Sides } from './engine'

export const PLAYER = {
  name: 'Cleric',
  sprite: 'cleric.png',
  hp: 30,
  handSize: 4,
  bag: [6, 6, 6, 6, 6, 6, 20, 20] as Sides[],
  trinket: { name: 'Rosary Beads', sprite: 'rosary-beads.png', text: 'Whenever you roll a total of 7, heal 5 HP' },
}
export const ROSARY = { total: 7, heal: 5 }

const SLIME: EnemyDef = {
  name: 'Slime',
  sprite: 'slime.png',
  hp: 26,
  dice: [8, 8, 6, 6],
  handSize: 2,
  opening: { attack: 1, shield: 1 },
  chain: {
    attack: c => ({ attack: 2, shield: c.self < 0.5 ? 3 : 1 }),
    shield: c => ({ attack: 3, shield: c.self < 0.5 && c.block < 6 ? 1 : 0 }),
    bite: () => ({ attack: 1 }),
  },
}

const BAT: EnemyDef = {
  name: 'Bat',
  sprite: 'bat.png',
  hp: 10,
  dice: [4, 8, 8],
  handSize: 2,
  opening: { attack: 1 },
  chain: {
    attack: c => ({ attack: c.player < 0.5 ? 4 : 2, shield: 1 }),
    shield: () => ({ attack: 1 }),
    bite: () => ({ attack: 1 }),
  },
}

const VAMPIRE_KNIGHT: EnemyDef = {
  name: 'Vampire Knight',
  sprite: 'vampire-knight.png',
  hp: 40,
  dice: [6, 6, 8, 12, 20, 20],
  handSize: 3,
  opening: { attack: 1 },
  chain: {
    attack: c => ({ attack: 2, shield: c.block > 0 ? 0 : 1, bite: c.self < 0.5 || c.player < 0.5 ? 3 : 1 }),
    shield: c => ({ attack: 2, bite: c.player < 0.5 ? 2 : 1 }),
    bite: c => ({ attack: 1, shield: 1, bite: c.self < 0.5 ? 2 : 0 }),
  },
}

export const ENCOUNTERS: EnemyDef[][] = [[SLIME], [SLIME, SLIME], [BAT, BAT, SLIME], [VAMPIRE_KNIGHT]]
