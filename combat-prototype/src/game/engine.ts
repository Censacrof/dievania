import { ENCOUNTERS, PLAYER } from './content'

export type Sides = 6 | 20
export type Slot = 'mace' | 'shield' | 'miracle'
export type Rng = () => number
export type Allocation = Record<number, Slot | undefined>

export interface Die { id: number; sides: Sides }
export interface Intent { name: string; attack: Sides[]; shield: Sides[]; lifesteal?: boolean }
export interface EnemyDef { name: string; hp: number; pattern: Intent[] }
export interface Enemy extends EnemyDef { id: number; maxHp: number; step: number }

export interface GameState {
  hp: number
  maxHp: number
  bag: Die[]
  discard: Die[]
  hand: Die[]
  enemies: Enemy[]
  encounter: number
  log: string[]
  status: 'playing' | 'won' | 'lost'
}

export const roll = (sides: number, rng: Rng) => Math.floor(rng() * sides) + 1
export const alive = (e: Enemy) => e.hp > 0
export const currentIntent = (e: Enemy) => e.pattern[e.step % e.pattern.length]

export function drawHand(state: GameState, rng: Rng): GameState {
  let bag = [...state.bag]
  let discard = [...state.discard]
  const hand: Die[] = []
  while (hand.length < PLAYER.handSize) {
    if (bag.length === 0) {
      if (discard.length === 0) break
      bag = discard
      discard = []
    }
    hand.push(...bag.splice(Math.floor(rng() * bag.length), 1))
  }
  return { ...state, bag, discard, hand }
}

export function loadEncounter(state: GameState, encounter: number): GameState {
  const enemies = ENCOUNTERS[encounter].map((def, id) => ({ ...def, id, maxHp: def.hp, step: 0 }))
  const bag = PLAYER.bag.map((sides, id) => ({ id, sides }))
  const log = [...state.log, `--- Encounter ${encounter + 1}: ${enemies.map(e => e.name).join(', ')} ---`]
  return { ...state, encounter, enemies, bag, discard: [], hand: [], log }
}

export function newGame(rng: Rng): GameState {
  const empty: GameState = {
    hp: PLAYER.hp, maxHp: PLAYER.hp, bag: [], discard: [], hand: [],
    enemies: [], encounter: 0, log: [], status: 'playing',
  }
  return drawHand(loadEncounter(empty, 0), rng)
}

export function resolveTurn(state: GameState, _allocation: Allocation, _targetId: number, _rng: Rng): GameState {
  return state
}
