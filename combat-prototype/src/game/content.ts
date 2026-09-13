import type { Enchant, EnemyDef, Perk, PlayerAction, Sides } from './engine'

export const PLAYER = {
  name: 'Cleric',
  sprite: 'cleric.png',
  hp: 30,
  handSize: 4,
  bag: [6, 6, 6, 6, 6, 6, 20, 20] as Sides[],
  trinket: { name: 'Rosary Beads', sprite: 'rosary-beads.png', text: 'Whenever you roll a total of 7, heal 5 HP' },
}
export const ROSARY = { total: 7, heal: 5 }

export const ACTION_TEXT: Record<PlayerAction, string> = {
  mace: 'Roll the selected dice and deal the total as damage to the target. Its Block absorbs damage first.',
  shield: 'Roll the selected dice and add the total to your Block. Block absorbs damage and expires at the start of your next turn.',
  miracle: 'Roll the selected dice and heal half the total, rounded down. Cannot exceed max HP.',
  skip: 'Discard the selected dice without rolling. Nothing happens.',
}

export const ENCHANT_TEXT: Record<Enchant, string> = {
  heavy: 'Heavy: +2 damage when this die is used with the Mace.',
  sturdy: 'Sturdy: Block from this die goes into a separate pool that never expires. Normal Block is spent first.',
  holy: 'Holy: Miracle heals the full roll of this die instead of half.',
  lucky: 'Lucky: if this die rolls a 1, it is rerolled once.',
  piercing: 'Piercing: this die\'s Mace damage ignores the target\'s Block.',
  echo: 'Echo: after using this die, draw one die from your bag into your hand.',
}

export const OFFER_TEXT = {
  upgrade: 'Pick a die in your bag and step it up one size: d4 → d6 → d8 → d10 → d12 → d20. Its enchantment is kept.',
  add: 'A new die joins your bag for the rest of the run. More dice means each single die is drawn less often.',
  remove: 'Pick a die and take it out of your bag for good. Fewer dice means your best dice show up more often.',
  handSize: 'Draw one more die every turn, for the rest of the run. Maximum hand size is 6.',
}

export const PERK_TEXT: Record<Perk, string> = {
  steadyHands: 'Steady hands: every fight opens with your two largest dice in hand.',
  overkill: 'Overkill: when the Mace kills, damage beyond the kill hits the next living enemy, through its Block.',
}

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
