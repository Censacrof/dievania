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

describe('resolveTurn vs Slime', () => {
  it('Mace damage is the sum of dice; the Slime attacks back minus Shield (none)', () => {
    const s = newGame(zero) // hand: 4×d6
    const next = resolveTurn(s, allTo(s, 'mace'), 0, q(f(1, 6), f(1, 6), f(1, 6), f(1, 6), f(3, 6)))
    expect(next.enemies[0].hp).toBe(8)
    expect(next.hp).toBe(27)
    expect(next.hand).toHaveLength(4)
    expect(next.discard.map(d => d.id)).toEqual([0, 1, 2, 3])
  })

  it('a killed enemy does not attack (player acts first)', () => {
    const s = newGame(zero)
    const next = resolveTurn(s, allTo(s, 'mace'), 0, q(f(4, 6), f(4, 6), f(4, 6), f(4, 6), f(6, 6)))
    expect(next.hp).toBe(30)
    expect(next.log).toContain('Slime dies')
  })

  it('Shield blocks incoming damage, floored at 0', () => {
    const s = newGame(zero)
    const low = resolveTurn(s, allTo(s, 'shield'), 0, q(f(1, 6), f(1, 6), f(1, 6), f(1, 6), f(6, 6)))
    expect(low.hp).toBe(28)
    const high = resolveTurn(s, allTo(s, 'shield'), 0, q(f(6, 6), f(6, 6), f(6, 6), f(6, 6), f(6, 6)))
    expect(high.hp).toBe(30)
  })

  it('Miracle heals floor(sum/2), applied before the enemy attack', () => {
    const s = { ...newGame(zero), hp: 10 }
    const next = resolveTurn(s, allTo(s, 'miracle'), 0, q(f(5, 6), f(5, 6), f(5, 6), f(5, 6), f(1, 6)))
    expect(next.hp).toBe(19) // 10 + floor(20/2) − 1
  })

  it('Miracle never exceeds max HP', () => {
    const s = { ...newGame(zero), hp: 29 }
    const next = resolveTurn(s, allTo(s, 'miracle'), 0, q(f(5, 6), f(5, 6), f(5, 6), f(5, 6), f(1, 6)))
    expect(next.hp).toBe(29) // capped at 30, then −1
  })

  it('the Slime alternates 1d6 and 2d6 attacks', () => {
    let s = newGame(zero)
    expect(currentIntent(s.enemies[0]).attack).toEqual([6])
    s = resolveTurn(s, allTo(s, 'shield'), 0, zero)
    expect(currentIntent(s.enemies[0]).attack).toEqual([6, 6])
    s = resolveTurn(s, allTo(s, 'shield'), 0, zero)
    expect(currentIntent(s.enemies[0]).attack).toEqual([6])
  })

  it('throws when a die is unassigned or the target is invalid', () => {
    const s = newGame(zero)
    const partial = { ...allTo(s, 'mace'), 3: undefined }
    expect(() => resolveTurn(s, partial, 0, zero)).toThrow(/no slot/)
    expect(() => resolveTurn(s, allTo(s, 'mace'), 7, zero)).toThrow(/target/i)
  })

  it('the player loses at 0 HP', () => {
    const s = { ...newGame(zero), hp: 1 }
    const next = resolveTurn(s, allTo(s, 'shield'), 0, q(f(1, 6), f(1, 6), f(1, 6), f(1, 6), f(6, 6)))
    expect(next.hp).toBe(0)
    expect(next.status).toBe('lost')
    expect(resolveTurn(next, {}, 0, zero)).toBe(next)
  })
})

const atEncounter = (index: number) => drawHand(loadEncounter(newGame(zero), index), zero)

describe('encounter flow', () => {
  it('killing the Slime loads the two Bats with a fresh bag', () => {
    const s = newGame(zero)
    const next = resolveTurn(s, allTo(s, 'mace'), 0, q(f(4, 6), f(4, 6), f(4, 6), f(4, 6), f(6, 6)))
    expect(next.encounter).toBe(1)
    expect(next.enemies.map(e => e.name)).toEqual(['Bat', 'Bat'])
    expect(next.hand).toHaveLength(4)
    expect(next.bag).toHaveLength(4)
    expect(next.discard).toHaveLength(0)
  })

  it('Bats attack independently and a dead Bat does not attack', () => {
    const s = atEncounter(1)
    // player 4×6 on bat 0; bat 0 rolls 3, bat 1 rolls 4
    const next = resolveTurn(s, allTo(s, 'mace'), 0, q(f(6, 6), f(6, 6), f(6, 6), f(6, 6), f(3, 6), f(4, 6)))
    expect(next.enemies.map(e => e.hp)).toEqual([0, 6])
    expect(next.hp).toBe(26)
    expect(next.encounter).toBe(1)
  })

  it("Vampire Knight's Guard shield reduces Mace damage", () => {
    const s = atEncounter(2)
    expect(currentIntent(s.enemies[0]).name).toBe('Guard')
    // player 4×6 = 24; knight attack 2, shield 10
    const next = resolveTurn(s, allTo(s, 'mace'), 0, q(f(6, 6), f(6, 6), f(6, 6), f(6, 6), f(2, 6), f(10, 20)))
    expect(next.enemies[0].hp).toBe(35 - 14)
    expect(next.hp).toBe(28)
    expect(currentIntent(next.enemies[0]).name).toBe('Lunge')
  })

  it('Bite drains the damage actually taken, capped at max HP, then the cycle wraps to Guard', () => {
    const base = atEncounter(2)
    const s = { ...base, enemies: [{ ...base.enemies[0], hp: 10, step: 2 }] }
    expect(currentIntent(s.enemies[0]).name).toBe('Bite')
    // player shield 4×1 = 4; bite 10 + 10 = 20 → taken 16
    const next = resolveTurn(s, allTo(s, 'shield'), 0, q(f(1, 6), f(1, 6), f(1, 6), f(1, 6), f(10, 20), f(10, 20)))
    expect(next.hp).toBe(14)
    expect(next.enemies[0].hp).toBe(26)
    expect(currentIntent(next.enemies[0]).name).toBe('Guard')

    const nearFull = { ...s, enemies: [{ ...s.enemies[0], hp: 30 }] }
    const capped = resolveTurn(nearFull, allTo(nearFull, 'shield'), 0, q(f(1, 6), f(1, 6), f(1, 6), f(1, 6), f(10, 20), f(10, 20)))
    expect(capped.enemies[0].hp).toBe(35)
  })

  it('killing the Vampire Knight wins the game', () => {
    const base = atEncounter(2)
    const s = { ...base, enemies: [{ ...base.enemies[0], hp: 1, step: 1 }] }
    const next = resolveTurn(s, allTo(s, 'mace'), 0, zero)
    expect(next.status).toBe('won')
    expect(next.hp).toBe(30)
  })
})
