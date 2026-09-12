import { describe, expect, it } from 'vitest'
import {
  type Allocation, type GameState, type Rng, type Slot,
  draw, enemyAllocation, loadEncounter, newGame, pickWeighted, resolveTurn,
} from './engine'
import { ENCOUNTERS } from './content'

/** rng value that makes `roll(sides)` return exactly `face` */
const f = (face: number, sides: number) => (face - 0.5) / sides
/** rng that returns the queued values, then 0 forever (0 ⇒ first die in the bag, first move with weight > 0) */
const q = (...vals: number[]): Rng => { let i = 0; return () => (i < vals.length ? vals[i++] : 0) }
const zero: Rng = () => 0
const allTo = (state: GameState, slot: Slot): Allocation => Object.fromEntries(state.hand.map(d => [d.id, slot]))
const sides = (dice: { sides: number }[]) => dice.map(d => d.sides)
const atEncounter = (index: number) => newGame(zero, index)

describe('newGame', () => {
  it('starts with 30 HP, 4 dice in hand, 4 in the bag, facing the Slime', () => {
    const s = newGame(zero)
    expect(s.hp).toBe(30)
    expect(s.maxHp).toBe(30)
    expect(s.hand).toHaveLength(4)
    expect(s.bag).toHaveLength(4)
    expect(s.discard).toHaveLength(0)
    expect(s.enemies.map(e => [e.name, e.hp])).toEqual([['Slime', 20]])
    expect(s.status).toBe('playing')
  })

  it('draws deterministically in bag order when rng is 0', () => {
    const s = newGame(zero)
    expect(s.hand.map(d => d.id)).toEqual([0, 1, 2, 3])
    expect(sides(s.bag)).toEqual([6, 6, 20, 20])
  })

  it('the Slime opens with its first move and a drawn hand of 2', () => {
    const slime = newGame(zero).enemies[0]
    expect(slime.move).toBe('Ooze')
    expect(sides(slime.hand)).toEqual([8, 8])
    expect(sides(slime.bag)).toEqual([6, 6])
    expect(slime.discard).toHaveLength(0)
  })
})

describe('draw', () => {
  it('reshuffles the discard pile into the bag when the bag runs out', () => {
    let p = { bag: [{ id: 0, sides: 6 as const }, { id: 1, sides: 8 as const }], discard: [{ id: 2, sides: 4 as const }], hand: [] }
    p = draw(p, 2, zero)
    expect(p.hand.map(d => d.id)).toEqual([0, 1])
    expect(p.bag).toHaveLength(0)
    p = draw({ ...p, discard: [...p.discard, ...p.hand], hand: [] }, 2, zero)
    expect(p.hand.map(d => d.id)).toEqual([2, 0])
    expect(p.bag.map(d => d.id)).toEqual([1])
    expect(p.discard).toHaveLength(0)
  })
})

describe('pickWeighted', () => {
  it('skips zero weights and picks proportionally', () => {
    const w = { a: 0, b: 2, c: 2 }
    expect(pickWeighted(w, zero)).toBe('b')
    expect(pickWeighted(w, () => 0.49)).toBe('b')
    expect(pickWeighted(w, () => 0.5)).toBe('c')
  })
})

describe('enemyAllocation', () => {
  it('sends the n largest dice to Shield and the rest to Attack', () => {
    const slime = { ...newGame(zero).enemies[0], hand: [{ id: 0, sides: 6 as const }, { id: 1, sides: 8 as const }], move: 'Ooze' }
    const a = enemyAllocation(slime)
    expect(sides(a.shield)).toEqual([8])
    expect(sides(a.attack)).toEqual([6])
    expect(sides(enemyAllocation({ ...slime, move: 'Harden' }).shield)).toEqual([8, 6])
    expect(sides(enemyAllocation({ ...slime, move: 'Splash' }).attack)).toEqual([6, 8])
  })
})

describe('Markov transitions', () => {
  const slime = ENCOUNTERS[0][0]
  const knight = ENCOUNTERS[2][0]
  it('the Slime hardens only when wounded', () => {
    expect(slime.moves.Ooze.next({ self: 1, player: 1 }).Harden).toBe(0)
    expect(slime.moves.Ooze.next({ self: 0.4, player: 1 }).Harden).toBeGreaterThan(0)
  })
  it('the Vampire Knight bites more when the player is weak or he is wounded', () => {
    expect(knight.moves.Guard.next({ self: 1, player: 0.3 }).Bite).toBeGreaterThan(knight.moves.Guard.next({ self: 1, player: 1 }).Bite)
    expect(knight.moves.Lunge.next({ self: 0.3, player: 1 }).Bite).toBeGreaterThan(knight.moves.Lunge.next({ self: 1, player: 1 }).Bite)
  })
})

// Slime opening: Ooze with hand [d8, d8] → attack d8 (rolled first), shield d8.
describe('resolveTurn vs Slime', () => {
  it('Mace minus enemy Shield; the Slime attacks back minus player Shield', () => {
    const s = newGame(zero) // hand: 4×d6
    const next = resolveTurn(s, allTo(s, 'mace'), 0, q(f(1, 6), f(1, 6), f(1, 6), f(1, 6), f(3, 8), f(2, 8)))
    expect(next.enemies[0].hp).toBe(18)
    expect(next.hp).toBe(27)
    expect(next.hand).toHaveLength(4)
    expect(next.discard.map(d => d.id)).toEqual([0, 1, 2, 3])
  })

  it('at the end of the turn the enemy picks a move and draws a new hand', () => {
    const s = newGame(zero)
    const next = resolveTurn(s, allTo(s, 'shield'), 0, zero)
    const slime = next.enemies[0]
    expect(slime.move).toBe('Ooze') // rng 0 → first weighted move
    expect(sides(slime.hand)).toEqual([6, 6])
    expect(sides(slime.discard)).toEqual([8, 8])
    expect(slime.bag).toHaveLength(0)
  })

  it('a killed enemy does not attack (player acts first)', () => {
    const base = newGame(zero)
    const s = { ...base, enemies: [{ ...base.enemies[0], hp: 2 }] }
    const next = resolveTurn(s, allTo(s, 'mace'), 0, q(f(6, 6), f(6, 6), f(6, 6), f(6, 6), f(8, 8), f(1, 8)))
    expect(next.hp).toBe(30)
    expect(next.log).toContain('Slime dies')
    expect(next.encounter).toBe(1)
  })

  it('Shield blocks incoming damage, floored at 0', () => {
    const s = newGame(zero)
    const low = resolveTurn(s, allTo(s, 'shield'), 0, q(f(1, 6), f(1, 6), f(1, 6), f(1, 6), f(8, 8)))
    expect(low.hp).toBe(26)
    const high = resolveTurn(s, allTo(s, 'shield'), 0, q(f(6, 6), f(6, 6), f(6, 6), f(6, 6), f(8, 8)))
    expect(high.hp).toBe(30)
  })

  it('Miracle heals floor(sum/2), applied before the enemy attack', () => {
    const s = { ...newGame(zero), hp: 10 }
    const next = resolveTurn(s, allTo(s, 'miracle'), 0, q(f(5, 6), f(5, 6), f(5, 6), f(5, 6), f(1, 8)))
    expect(next.hp).toBe(19) // 10 + floor(20/2) − 1
  })

  it('Miracle never exceeds max HP', () => {
    const s = { ...newGame(zero), hp: 29 }
    const next = resolveTurn(s, allTo(s, 'miracle'), 0, q(f(5, 6), f(5, 6), f(5, 6), f(5, 6), f(1, 8)))
    expect(next.hp).toBe(29)
  })

  it('throws when a die is unassigned or the target is invalid', () => {
    const s = newGame(zero)
    const partial = { ...allTo(s, 'mace'), 3: undefined }
    expect(() => resolveTurn(s, partial, 0, zero)).toThrow(/no slot/)
    expect(() => resolveTurn(s, allTo(s, 'mace'), 7, zero)).toThrow(/target/i)
  })

  it('the player loses at 0 HP', () => {
    const s = { ...newGame(zero), hp: 1 }
    const next = resolveTurn(s, allTo(s, 'shield'), 0, q(f(1, 6), f(1, 6), f(1, 6), f(1, 6), f(8, 8)))
    expect(next.hp).toBe(0)
    expect(next.status).toBe('lost')
    expect(resolveTurn(next, {}, 0, zero)).toBe(next)
  })
})

describe('encounter flow', () => {
  it('killing the Slime loads the two Bats, each with a hand, and a fresh player bag', () => {
    const base = newGame(zero)
    const s = { ...base, enemies: [{ ...base.enemies[0], hp: 1 }] }
    const next = resolveTurn(s, allTo(s, 'mace'), 0, q(f(6, 6), f(6, 6), f(6, 6), f(6, 6), f(1, 8), f(1, 8)))
    expect(next.encounter).toBe(1)
    expect(next.enemies.map(e => e.name)).toEqual(['Bat', 'Bat'])
    expect(next.enemies.map(e => e.move)).toEqual(['Swoop', 'Swoop'])
    expect(next.enemies.map(e => sides(e.hand))).toEqual([[4, 8], [4, 8]])
    expect(next.hand).toHaveLength(4)
    expect(next.bag).toHaveLength(4)
    expect(next.discard).toHaveLength(0)
  })

  it('Bats attack independently and a dead Bat does not attack', () => {
    const s = atEncounter(1) // both Swoop with [d4, d8] → all attack
    // player 4×6 on bat 0; bat 0 rolls 1+1, bat 1 rolls 2+3
    const next = resolveTurn(s, allTo(s, 'mace'), 0, q(f(6, 6), f(6, 6), f(6, 6), f(6, 6), f(1, 4), f(1, 8), f(2, 4), f(3, 8)))
    expect(next.enemies.map(e => e.hp)).toEqual([0, 8])
    expect(next.hp).toBe(25)
    expect(next.encounter).toBe(1)
  })

  it("Vampire Knight's Guard puts his biggest die in Shield", () => {
    const s = atEncounter(2)
    const knight = s.enemies[0]
    expect(knight.move).toBe('Guard')
    expect(sides(knight.hand)).toEqual([6, 6, 8])
    expect(sides(enemyAllocation(knight).shield)).toEqual([8])
    // player 4×6 = 24; knight attack 1+1, shield 8
    const next = resolveTurn(s, allTo(s, 'mace'), 0, q(f(6, 6), f(6, 6), f(6, 6), f(6, 6), f(1, 6), f(1, 6), f(8, 8)))
    expect(next.enemies[0].hp).toBe(40 - 16)
    expect(next.hp).toBe(28)
  })

  it('Bite drains the damage actually taken, capped at max HP', () => {
    const base = atEncounter(2)
    const bite = { ...base.enemies[0], hp: 10, move: 'Bite', hand: [{ id: 4, sides: 20 as const }, { id: 5, sides: 20 as const }, { id: 0, sides: 6 as const }] }
    const s = { ...base, enemies: [bite] }
    // player shield 4×1 = 4; bite 10 + 10 + 1 = 21 → taken 17
    const next = resolveTurn(s, allTo(s, 'shield'), 0, q(f(1, 6), f(1, 6), f(1, 6), f(1, 6), f(10, 20), f(10, 20), f(1, 6)))
    expect(next.hp).toBe(13)
    expect(next.enemies[0].hp).toBe(27)
    expect(next.log).toContain('Vampire Knight drains 17 HP')

    const nearFull = { ...s, enemies: [{ ...bite, hp: 30 }] }
    const capped = resolveTurn(nearFull, allTo(nearFull, 'shield'), 0, q(f(1, 6), f(1, 6), f(1, 6), f(1, 6), f(10, 20), f(10, 20), f(1, 6)))
    expect(capped.enemies[0].hp).toBe(40)
  })

  it('killing the Vampire Knight wins the game', () => {
    const base = atEncounter(2)
    const s = { ...base, enemies: [{ ...base.enemies[0], hp: 1, move: 'Lunge' }] }
    const next = resolveTurn(s, allTo(s, 'mace'), 0, zero)
    expect(next.status).toBe('won')
    expect(next.hp).toBe(30)
  })

  it('loadEncounter resets the player bag and gives every enemy an opening move and hand', () => {
    const s = loadEncounter({ ...newGame(zero), discard: [{ id: 9, sides: 6 }] }, 1, zero)
    expect(s.bag).toHaveLength(8)
    expect(s.discard).toHaveLength(0)
    expect(s.hand).toHaveLength(0)
    expect(s.enemies.map(e => e.id)).toEqual([0, 1])
    expect(s.enemies.every(e => e.hand.length === 2 && e.move === 'Swoop')).toBe(true)
  })
})
