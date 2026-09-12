import type { EnemyDef, Sides } from './engine'

export const PLAYER = { hp: 30, handSize: 4, bag: [6, 6, 6, 6, 6, 6, 20, 20] as Sides[] }

const SLIME: EnemyDef = {
  name: 'Slime',
  hp: 26,
  dice: [8, 8, 6, 6],
  handSize: 2,
  opening: { Ooze: 1, Splash: 1 },
  moves: {
    Ooze: { shield: 1, next: c => ({ Ooze: 1, Splash: 2, Harden: c.self < 0.5 ? 2 : 0 }) },
    Splash: { shield: 0, next: c => ({ Ooze: 2, Splash: 1, Harden: c.self < 0.5 ? 3 : 0 }) },
    Harden: { shield: 2, next: () => ({ Ooze: 1, Splash: 2 }) },
  },
}

const BAT: EnemyDef = {
  name: 'Bat',
  hp: 10,
  dice: [4, 8, 8],
  handSize: 2,
  opening: { Swoop: 1 },
  moves: {
    Swoop: { shield: 0, next: c => ({ Swoop: c.player < 0.5 ? 3 : 1, Flutter: 1 }) },
    Flutter: { shield: 2, next: () => ({ Swoop: 1 }) },
  },
}

const VAMPIRE_KNIGHT: EnemyDef = {
  name: 'Vampire Knight',
  hp: 40,
  dice: [6, 6, 8, 12, 20, 20],
  handSize: 3,
  opening: { Guard: 1 },
  moves: {
    Guard: { shield: 1, next: c => ({ Guard: 1, Lunge: 2, Bite: c.player < 0.5 ? 3 : 1 }) },
    Lunge: { shield: 0, next: c => ({ Guard: 2, Lunge: 1, Bite: c.self < 0.5 ? 4 : 1 }) },
    Bite: { shield: 0, lifesteal: true, next: () => ({ Guard: 3, Lunge: 1 }) },
  },
}

export const ENCOUNTERS: EnemyDef[][] = [[SLIME], [BAT, BAT], [VAMPIRE_KNIGHT]]
