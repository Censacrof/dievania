import { describe, expect, it } from 'vitest'
import { type Die, type GameState, type Pool, type Rng, chooseReward, draw, enemyStep, loadEncounter, newGame, pickWeighted, playerAction, rollOffers } from './engine'
import { ENCOUNTERS } from './content'

/** rng value that makes `roll(sides)` return exactly `face` */
const f = (face: number, sides: number) => (face - 0.5) / sides
/** rng that returns the queued values, then 0 forever (0 ⇒ first die in the bag, first weighted action) */
const q = (...vals: number[]): Rng => { let i = 0; return () => (i < vals.length ? vals[i++] : 0) }
const zero: Rng = () => 0
const sides = (dice: Die[]) => dice.map(d => d.sides)
const d = (id: number, s: Die['sides']): Die => ({ id, sides: s })

/** Play the whole player hand with one action, rolling `face` on each die */
const playAll = (s: GameState, action: 'mace' | 'shield' | 'miracle' | 'skip', face: number) =>
  s.hand.reduce((st, die) => playerAction(st, action, die.id, 0, q(f(face, die.sides))), s)

describe('newGame', () => {
  it('starts in the player phase with 30 HP, no Block, 4 dice in hand, facing the Slime', () => {
    const s = newGame(zero)
    expect(s.phase).toBe('player')
    expect([s.hp, s.maxHp, s.block]).toEqual([30, 30, 0])
    expect(s.hand.map(x => x.id)).toEqual([0, 1, 2, 3])
    expect(sides(s.bag)).toEqual([6, 6, 20, 20])
    expect(s.enemies.map(e => [e.name, e.hp, e.block])).toEqual([['Slime', 26, 0]])
    expect(s.enemies[0].sprite).toBe('slime.png')
    expect(s.status).toBe('playing')
    expect(s.dice).toHaveLength(8)
    expect([s.handSize, s.sturdyBlock, s.perks, s.offers]).toEqual([4, 0, [], []])
  })

  it('the Slime has a drawn hand and a telegraphed first action', () => {
    const slime = newGame(zero).enemies[0]
    expect(sides(slime.hand)).toEqual([8, 8])
    expect(sides(slime.bag)).toEqual([6, 6])
    expect(slime.nextAction).toBe('attack')
  })
})

describe('draw', () => {
  it('reshuffles the discard pile into the bag when the bag runs out', () => {
    let p: Pool = { bag: [d(0, 6), d(1, 8)], discard: [d(2, 4)], hand: [] }
    p = draw(p, 2, zero)
    expect(p.hand.map(x => x.id)).toEqual([0, 1])
    p = draw({ ...p, discard: [...p.discard, ...p.hand], hand: [] }, 2, zero)
    expect(p.hand.map(x => x.id)).toEqual([2, 0])
    expect(p.bag.map(x => x.id)).toEqual([1])
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

describe('playerAction', () => {
  it('Mace rolls one die and damages the target immediately; the die goes to discard', () => {
    const s = newGame(zero)
    const next = playerAction(s, 'mace', 0, 0, q(f(4, 6)))
    expect(next.enemies[0].hp).toBe(22)
    expect(next.hand.map(x => x.id)).toEqual([1, 2, 3])
    expect(next.discard.map(x => x.id)).toEqual([0])
    expect(next.phase).toBe('player')
    expect(next.log.at(-1)).toBe('You swing the Mace with d6: 4 → Slime takes 4')
  })

  it("Mace is absorbed by the target's Block, which is consumed", () => {
    const base = newGame(zero)
    const s = { ...base, enemies: [{ ...base.enemies[0], block: 3 }] }
    const partial = playerAction(s, 'mace', 0, 0, q(f(4, 6)))
    expect(partial.enemies[0].hp).toBe(25)
    expect(partial.enemies[0].block).toBe(0)
    const blocked = playerAction(s, 'mace', 0, 0, q(f(2, 6)))
    expect(blocked.enemies[0].hp).toBe(26)
    expect(blocked.enemies[0].block).toBe(1)
  })

  it('Shield adds the roll to Block', () => {
    const s = newGame(zero)
    const a = playerAction(s, 'shield', 0, 0, q(f(5, 6)))
    expect(a.block).toBe(5)
    expect(playerAction(a, 'shield', 1, 0, q(f(2, 6))).block).toBe(7)
  })

  it('Miracle heals floor(roll/2), capped at max HP', () => {
    const s = { ...newGame(zero), hp: 10 }
    expect(playerAction(s, 'miracle', 0, 0, q(f(5, 6))).hp).toBe(12)
    expect(playerAction({ ...s, hp: 29 }, 'miracle', 0, 0, q(f(6, 6))).hp).toBe(30)
  })

  it('Skip discards the die and does nothing else', () => {
    const s = newGame(zero)
    const next = playerAction(s, 'skip', 2, 0, zero)
    expect(next.hand.map(x => x.id)).toEqual([0, 1, 3])
    expect(next.discard.map(x => x.id)).toEqual([2])
    expect([next.hp, next.block, next.enemies[0].hp]).toEqual([30, 0, 26])
  })

  it('rejects a die not in hand, an invalid Mace target, and acting out of phase', () => {
    const s = newGame(zero)
    expect(() => playerAction(s, 'mace', 9, 0, zero)).toThrow(/hand/)
    expect(() => playerAction(s, 'mace', 0, 7, zero)).toThrow(/target/i)
    expect(() => playerAction({ ...s, phase: 'enemy' }, 'shield', 0, 0, zero)).toThrow(/phase/)
  })

  it('using the last die ends the player turn and resets enemy Block', () => {
    const base = newGame(zero)
    const s = { ...base, enemies: [{ ...base.enemies[0], block: 4 }] }
    const next = playAll(s, 'shield', 1)
    expect(next.hand).toHaveLength(0)
    expect(next.phase).toBe('enemy')
    expect(next.block).toBe(4)
    expect(next.enemies[0].block).toBe(0)
  })

  it('killing the last enemy of a normal fight opens the reward phase with three offers', () => {
    const base = newGame(zero)
    const s = { ...base, enemies: [{ ...base.enemies[0], hp: 3 }] }
    const next = playerAction(s, 'mace', 0, 0, q(f(3, 6)))
    expect(next.log).toContain('Slime dies')
    expect(next.phase).toBe('reward')
    expect(next.encounter).toBe(0)
    expect(next.offers).toHaveLength(3)
    expect(() => playerAction(next, 'skip', 1, 0, zero)).toThrow(/phase/)
  })

  it('killing the Vampire Knight wins the game', () => {
    const base = newGame(zero, 3)
    const s = { ...base, enemies: [{ ...base.enemies[0], hp: 1 }] }
    expect(playerAction(s, 'mace', 0, 0, zero).status).toBe('won')
  })
})

describe('enemyStep', () => {
  const enemyPhase = (s: GameState = newGame(zero)) => playAll(s, 'skip', 1)

  it('does nothing outside the enemy phase', () => {
    const s = newGame(zero)
    expect(enemyStep(s, zero)).toBe(s)
  })

  it('the acting enemy performs its telegraphed action with the first die in hand, then picks the next action', () => {
    const s = { ...enemyPhase(), block: 2 }
    const next = enemyStep(s, q(f(5, 8), 0.99))
    expect(next.hp).toBe(27)
    expect(next.block).toBe(0)
    const slime = next.enemies[0]
    expect(sides(slime.hand)).toEqual([8])
    expect(sides(slime.discard)).toEqual([8])
    expect(slime.nextAction).toBe('shield') // rng 0.99 → last weighted action
    expect(next.log.at(-1)).toBe('Slime attacks with d8: 5 → you take 3 (2 blocked)')
    expect(next.phase).toBe('enemy')
  })

  it('an enemy Shield adds to its Block', () => {
    const s = enemyPhase()
    const shielding = { ...s, enemies: [{ ...s.enemies[0], nextAction: 'shield' as const }] }
    expect(enemyStep(shielding, q(f(6, 8))).enemies[0].block).toBe(6)
  })

  it('Bite heals the enemy for the damage dealt, capped at max HP', () => {
    const base = newGame(zero, 3)
    const s = enemyPhase({ ...base, enemies: [{ ...base.enemies[0], hp: 30, nextAction: 'bite' as const, hand: [d(9, 20)], block: 0 }] })
    const next = enemyStep(s, q(f(15, 20)))
    expect(next.hp).toBe(15)
    expect(next.enemies[0].hp).toBe(40)
    expect(next.log.at(-1)).toBe('Vampire Knight bites with d20: 15 → you take 15, it drains 10')
  })

  it('the player loses when HP reaches 0', () => {
    const s = { ...enemyPhase(), hp: 3 }
    const next = enemyStep(s, q(f(8, 8)))
    expect(next.hp).toBe(0)
    expect(next.status).toBe('lost')
    expect(enemyStep(next, zero)).toBe(next)
  })

  it('enemies act one after another; the first one finishes its hand before the second starts', () => {
    let s = enemyPhase(newGame(zero, 2))
    s = enemyStep(s, q(f(1, 4), 0))
    expect(s.enemies.map(e => e.hand.length)).toEqual([1, 2, 2])
    s = enemyStep(s, q(f(1, 8), 0))
    expect(s.enemies.map(e => e.hand.length)).toEqual([0, 2, 2])
    s = enemyStep(s, q(f(1, 4), 0))
    expect(s.enemies.map(e => e.hand.length)).toEqual([0, 1, 2])
  })

  it('when every enemy hand is empty, upkeep draws for everyone, clears player Block and returns to the player phase', () => {
    let s = { ...enemyPhase(), block: 5 }
    s = enemyStep(s, zero)
    s = enemyStep(s, zero)
    expect(s.enemies[0].hand).toHaveLength(0)
    expect(s.phase).toBe('enemy')
    const next = enemyStep(s, zero)
    expect(next.phase).toBe('player')
    expect(next.block).toBe(0)
    expect(next.hand.map(x => x.id)).toEqual([4, 5, 6, 7])
    const slime = next.enemies[0]
    expect(sides(slime.hand)).toEqual([6, 6])
    expect(sides(slime.discard)).toEqual([8, 8])
    expect(slime.nextAction).toBeDefined()
  })

  it('a dead enemy never acts', () => {
    const base = newGame(zero, 2)
    const s = enemyPhase({ ...base, enemies: [{ ...base.enemies[0], hp: 0 }, base.enemies[1], base.enemies[2]] })
    const next = enemyStep(s, q(f(1, 4)))
    expect(next.enemies[0].hand).toHaveLength(2)
    expect(next.enemies[1].hand).toHaveLength(1)
  })
})

describe('encounters', () => {
  it('runs Slime, two Slimes, two Bats with a Slime, then the Vampire Knight', () => {
    expect(ENCOUNTERS.map(e => e.map(d => d.name))).toEqual([
      ['Slime'], ['Slime', 'Slime'], ['Bat', 'Bat', 'Slime'], ['Vampire Knight'],
    ])
  })
})

describe('Markov chains', () => {
  const [slime, knight] = [ENCOUNTERS[0][0], ENCOUNTERS[3][0]]
  it('the Slime shields more when wounded', () => {
    expect(slime.chain.attack({ self: 0.4, player: 1, block: 0 }).shield!).toBeGreaterThan(slime.chain.attack({ self: 1, player: 1, block: 0 }).shield!)
  })
  it('the Vampire Knight bites more when he or the player is weak', () => {
    const calm = knight.chain.attack({ self: 1, player: 1, block: 0 }).bite!
    expect(knight.chain.attack({ self: 0.4, player: 1, block: 0 }).bite!).toBeGreaterThan(calm)
    expect(knight.chain.attack({ self: 1, player: 0.4, block: 0 }).bite!).toBeGreaterThan(calm)
  })
})

describe('loadEncounter', () => {
  it('resets the player bag and gives every enemy a hand and a first action', () => {
    const s = loadEncounter({ ...newGame(zero), discard: [d(9, 6)] }, 2, zero)
    expect(s.bag).toHaveLength(4)
    expect(s.hand).toHaveLength(4)
    expect(s.discard).toHaveLength(0)
    expect(s.enemies).toHaveLength(3)
    expect(s.enemies.every(e => e.hand.length === 2 && e.nextAction === 'attack')).toBe(true)
  })
})

describe('rewards', () => {
  const cleared = (): GameState => {
    const base = newGame(zero)
    return playerAction({ ...base, enemies: [{ ...base.enemies[0], hp: 1 }] }, 'mace', 0, 0, q(f(1, 6)))
  }

  it('rollOffers draws three distinct offers; rng 0 walks the pool in order', () => {
    const offers = rollOffers(newGame(zero), zero)
    expect(offers).toEqual([{ kind: 'upgrade' }, { kind: 'add', sides: 4 }, { kind: 'remove' }])
  })

  it('rollOffers keeps bag-wide upgrades at the tail and only while available', () => {
    const s = newGame(zero)
    expect(rollOffers(s, () => 0.999)).toEqual([{ kind: 'perk', perk: 'overkill' }, { kind: 'perk', perk: 'steadyHands' }, { kind: 'handSize' }])
    const maxed = { ...s, handSize: 6, perks: ['overkill' as const, 'steadyHands' as const] }
    expect(rollOffers(maxed, () => 0.999).map(o => o.kind)).toEqual(['enchant', 'remove', 'add'])
  })

  it('rollOffers skips Remove when the bag is barely bigger than the hand', () => {
    const s = { ...newGame(zero), handSize: 7 }
    expect(rollOffers(s, zero).map(o => o.kind)).toEqual(['upgrade', 'add', 'enchant'])
  })

  it('Upgrade steps one die up and keeps its enchantment, then loads the next encounter', () => {
    const s = cleared()
    const enchanted = { ...s, dice: s.dice.map(d => (d.id === 0 ? { ...d, enchant: 'heavy' as const } : d)) }
    const next = chooseReward({ ...enchanted, offers: [{ kind: 'upgrade' }] }, 0, 0, zero)
    expect(next.dice.find(d => d.id === 0)).toEqual({ id: 0, sides: 8, enchant: 'heavy' })
    expect(next.encounter).toBe(1)
    expect(next.phase).toBe('player')
    expect(next.offers).toEqual([])
    expect(next.enemies.map(e => e.name)).toEqual(['Slime', 'Slime'])
    expect(next.bag.length + next.hand.length).toBe(8)
  })

  it('Upgrade refuses a d20', () => {
    const s = cleared()
    expect(() => chooseReward({ ...s, offers: [{ kind: 'upgrade' }] }, 0, 6, zero)).toThrow(/upgrade/i)
  })

  it('Add puts a new die with a fresh id in the collection', () => {
    const next = chooseReward({ ...cleared(), offers: [{ kind: 'add', sides: 12 }] }, 0, undefined, zero)
    expect(next.dice).toHaveLength(9)
    expect(next.dice.at(-1)).toEqual({ id: 8, sides: 12 })
    expect(next.nextDieId).toBe(9)
  })

  it('Remove drops a die, but never below hand size + 1', () => {
    const s = { ...cleared(), offers: [{ kind: 'remove' as const }] }
    expect(chooseReward(s, 0, 3, zero).dice.map(d => d.id)).toEqual([0, 1, 2, 4, 5, 6, 7])
    expect(() => chooseReward({ ...s, handSize: 7 }, 0, 3, zero)).toThrow(/remove/i)
  })

  it('Enchant tags an unenchanted die only', () => {
    const s = { ...cleared(), offers: [{ kind: 'enchant' as const, enchant: 'holy' as const }] }
    const next = chooseReward(s, 0, 2, zero)
    expect(next.dice.find(d => d.id === 2)?.enchant).toBe('holy')
    expect(() => chooseReward({ ...next, phase: 'reward', offers: s.offers }, 0, 2, zero)).toThrow(/enchant/i)
  })

  it('Bigger hand raises hand size and the next fight draws that many', () => {
    const next = chooseReward({ ...cleared(), offers: [{ kind: 'handSize' }] }, 0, undefined, zero)
    expect(next.handSize).toBe(5)
    expect(next.hand).toHaveLength(5)
  })

  it('Perk is recorded once', () => {
    const next = chooseReward({ ...cleared(), offers: [{ kind: 'perk', perk: 'overkill' }] }, 0, undefined, zero)
    expect(next.perks).toEqual(['overkill'])
  })

  it('Skip changes nothing and loads the next encounter', () => {
    const s = cleared()
    const next = chooseReward(s, null, undefined, zero)
    expect(next.dice).toEqual(s.dice)
    expect(next.encounter).toBe(1)
    expect(next.phase).toBe('player')
  })

  it('chooseReward only works in the reward phase', () => {
    expect(() => chooseReward(newGame(zero), null, undefined, zero)).toThrow(/phase/)
  })
})

describe('enchantments', () => {
  const withEnchant = (enchant: Die['enchant'], s = newGame(zero)): GameState =>
    ({ ...s, hand: s.hand.map((d, i) => (i === 0 ? { ...d, enchant } : d)) })

  it('Heavy adds 2 to Mace', () => {
    const next = playerAction(withEnchant('heavy'), 'mace', 0, 0, q(f(4, 6)))
    expect(next.enemies[0].hp).toBe(20)
    expect(next.log.at(-1)).toContain('Heavy')
  })

  it('Piercing ignores the target Block', () => {
    const base = withEnchant('piercing')
    const s = { ...base, enemies: [{ ...base.enemies[0], block: 3 }] }
    const next = playerAction(s, 'mace', 0, 0, q(f(4, 6)))
    expect(next.enemies[0].hp).toBe(22)
    expect(next.enemies[0].block).toBe(3)
  })

  it('Holy heals the full roll', () => {
    expect(playerAction({ ...withEnchant('holy'), hp: 10 }, 'miracle', 0, 0, q(f(5, 6))).hp).toBe(15)
  })

  it('Lucky rerolls a 1 once', () => {
    const next = playerAction(withEnchant('lucky'), 'mace', 0, 0, q(f(1, 6), f(5, 6)))
    expect(next.enemies[0].hp).toBe(21)
    const unlucky = playerAction(withEnchant('lucky'), 'mace', 0, 0, q(f(1, 6), f(1, 6)))
    expect(unlucky.enemies[0].hp).toBe(25)
  })

  it('Echo draws a die after use', () => {
    const next = playerAction(withEnchant('echo'), 'skip', 0, 0, zero)
    expect(next.hand.map(d => d.id)).toEqual([1, 2, 3, 4])
    expect(next.bag).toHaveLength(3)
  })

  it('Sturdy Block survives upkeep and is eaten after normal Block', () => {
    let s = playerAction(withEnchant('sturdy'), 'shield', 0, 0, q(f(5, 6)))
    expect([s.block, s.sturdyBlock]).toEqual([0, 5])
    s = playerAction(s, 'shield', 1, 0, q(f(2, 6)))
    expect([s.block, s.sturdyBlock]).toEqual([2, 5])
    s = playerAction(s, 'skip', 2, 0, zero)
    s = playerAction(s, 'skip', 3, 0, zero)
    s = enemyStep(s, q(f(4, 8)))
    expect([s.hp, s.block, s.sturdyBlock]).toEqual([30, 0, 3])
    s = enemyStep(s, q(f(1, 8)))
    s = enemyStep(s, zero)
    expect([s.phase, s.block, s.sturdyBlock]).toEqual(['player', 0, 2])
  })
})

describe('perks', () => {
  it('Steady hands puts the two largest dice in the opening hand', () => {
    const s = loadEncounter({ ...newGame(zero), perks: ['steadyHands'] }, 1, zero)
    expect(sides(s.hand)).toEqual([20, 20, 6, 6])
  })

  it('Overkill carries excess Mace damage to the next living enemy', () => {
    const base = newGame(zero, 2)
    const s = { ...base, perks: ['overkill' as const], enemies: [{ ...base.enemies[0], hp: 2 }, { ...base.enemies[1], block: 1 }, base.enemies[2]] }
    const next = playerAction(s, 'mace', 0, 0, q(f(6, 6)))
    expect(next.enemies.map(e => [e.hp, e.block])).toEqual([[0, 0], [7, 0], [26, 0]])
    expect(next.log.at(-1)).toContain('Overkill')
  })
})
