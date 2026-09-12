import { describe, expect, it } from 'vitest'
import { type Allocation, type GameState, type Rng, type Slot, currentIntent, drawHand, loadEncounter, newGame, resolveTurn } from './engine'

/** rng value that makes `roll(sides)` return exactly `face` */
const f = (face: number, sides: number) => (face - 0.5) / sides
/** rng that returns the queued values, then 0 forever (0 ⇒ draws take the first die in the bag) */
const q = (...vals: number[]): Rng => { let i = 0; return () => (i < vals.length ? vals[i++] : 0) }
const zero: Rng = () => 0
const allTo = (state: GameState, slot: Slot): Allocation => Object.fromEntries(state.hand.map(d => [d.id, slot]))

describe('newGame', () => {
  it('starts with 30 HP, 4 dice in hand, 4 in the bag, facing the Slime', () => {
    const s = newGame(zero)
    expect(s.hp).toBe(30)
    expect(s.maxHp).toBe(30)
    expect(s.hand).toHaveLength(4)
    expect(s.bag).toHaveLength(4)
    expect(s.discard).toHaveLength(0)
    expect(s.enemies.map(e => [e.name, e.hp])).toEqual([['Slime', 12]])
    expect(s.status).toBe('playing')
  })

  it('draws deterministically in bag order when rng is 0', () => {
    const s = newGame(zero)
    expect(s.hand.map(d => d.id)).toEqual([0, 1, 2, 3])
    expect(s.hand.every(d => d.sides === 6)).toBe(true)
    expect(s.bag.map(d => d.sides)).toEqual([6, 6, 20, 20])
  })
})

describe('drawHand', () => {
  it('reshuffles the discard pile into the bag when the bag runs out', () => {
    let s = newGame(zero)
    s = drawHand({ ...s, discard: s.hand, hand: [] }, zero)
    expect(s.bag).toHaveLength(0)
    expect(s.hand).toHaveLength(4)
    s = drawHand({ ...s, discard: [...s.discard, ...s.hand], hand: [] }, zero)
    expect(s.hand).toHaveLength(4)
    expect(s.bag).toHaveLength(4)
    expect(s.discard).toHaveLength(0)
  })
})

describe('loadEncounter', () => {
  it('resets the bag to all 8 dice and empties discard and hand', () => {
    const s = loadEncounter({ ...newGame(zero), discard: [{ id: 9, sides: 6 }] }, 1)
    expect(s.bag).toHaveLength(8)
    expect(s.discard).toHaveLength(0)
    expect(s.hand).toHaveLength(0)
    expect(s.enemies.map(e => e.name)).toEqual(['Bat', 'Bat'])
    expect(s.enemies.map(e => e.id)).toEqual([0, 1])
  })
})
