import { ENCOUNTERS, PLAYER, ROSARY } from './content'

export type Sides = 4 | 6 | 8 | 10 | 12 | 20
export type PlayerAction = 'mace' | 'shield' | 'miracle' | 'skip'
export type EnemyAction = 'attack' | 'shield' | 'bite'
export type Enchant = 'heavy' | 'sturdy' | 'holy' | 'lucky' | 'piercing' | 'echo'
export type Perk = 'steadyHands' | 'overkill'
export type Rng = () => number
export type Weights<K extends string = EnemyAction> = Partial<Record<K, number>>

export const SIDES: Sides[] = [4, 6, 8, 10, 12, 20]
export const ENCHANTS: Enchant[] = ['heavy', 'sturdy', 'holy', 'lucky', 'piercing', 'echo']
export const PERKS: Perk[] = ['steadyHands', 'overkill']
export const MAX_HAND = 6

export interface Die { id: number; sides: Sides; enchant?: Enchant }
export interface Pool { bag: Die[]; discard: Die[]; hand: Die[] }

export type Offer =
  | { kind: 'upgrade' }
  | { kind: 'add'; sides: Sides }
  | { kind: 'remove' }
  | { kind: 'enchant'; enchant: Enchant }
  | { kind: 'handSize' }
  | { kind: 'perk'; perk: Perk }

/** What a Markov transition may look at: HP fractions (0..1) and the enemy's own current Block */
export interface Ctx { self: number; player: number; block: number }
export interface EnemyDef {
  name: string
  /** image under public/ */
  sprite: string
  hp: number
  dice: Sides[]
  handSize: number
  opening: Weights
  /** chain[lastAction](ctx) → weights of the next action */
  chain: Record<EnemyAction, (c: Ctx) => Weights>
}
export interface Enemy extends Pool {
  id: number
  name: string
  sprite: string
  hp: number
  maxHp: number
  block: number
  handSize: number
  chain: EnemyDef['chain']
  /** the action it will perform next, with the first `nextCount` dice in hand */
  nextAction: EnemyAction
  nextCount: number
}

export interface GameState extends Pool {
  hp: number
  maxHp: number
  block: number
  /** Block from Sturdy dice: never expires, eaten after normal Block */
  sturdyBlock: number
  /** the player's whole dice collection; the bag is rebuilt from it every fight */
  dice: Die[]
  nextDieId: number
  handSize: number
  perks: Perk[]
  enemies: Enemy[]
  encounter: number
  phase: 'player' | 'enemy' | 'reward'
  offers: Offer[]
  log: string[]
  status: 'playing' | 'won' | 'lost'
}

export const roll = (sides: number, rng: Rng) => Math.floor(rng() * sides) + 1
export const alive = (e: Enemy) => e.hp > 0

export function pickWeighted<K extends string>(weights: Weights<K>, rng: Rng): K {
  const entries = (Object.entries(weights) as [K, number][]).filter(([, w]) => w > 0)
  let r = rng() * entries.reduce((a, [, w]) => a + w, 0)
  for (const [key, w] of entries) {
    if (r < w) return key
    r -= w
  }
  return entries[entries.length - 1][0]
}

/** Draw `n` dice into an empty hand, reshuffling the discard pile into the bag when needed */
export function draw(pool: Pool, n: number, rng: Rng): Pool {
  let bag = [...pool.bag]
  let discard = [...pool.discard]
  const hand: Die[] = []
  while (hand.length < n) {
    if (bag.length === 0) {
      if (discard.length === 0) break
      bag = discard
      discard = []
    }
    hand.push(...bag.splice(Math.floor(rng() * bag.length), 1))
  }
  return { bag, discard, hand }
}

/** Move a die from hand to discard */
const spend = <P extends Pool>(pool: P, die: Die): P => ({ ...pool, hand: pool.hand.filter(d => d !== die), discard: [...pool.discard, die] })

/** Damage against Block: returns what gets through and the Block left */
const absorb = (damage: number, block: number) => ({ through: Math.max(0, damage - block), blockLeft: Math.max(0, block - damage) })

// ponytail: enemies commit a uniformly random number of their remaining dice; make it chain-driven if telegraphs feel arbitrary
const pickCount = (hand: Die[], rng: Rng) => (hand.length ? 1 + Math.floor(rng() * hand.length) : 0)
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const plural = (dice: Die[], faces: number[], total: number) =>
  `${dice.map(d => `d${d.sides}${d.enchant ? ` [${d.enchant}]` : ''}`).join(' + ')}: ${faces.join(' + ')}${faces.length > 1 ? ` = ${total}` : ''}`

const ctxOf = (e: Enemy, state: GameState): Ctx => ({ self: e.hp / e.maxHp, player: state.hp / state.maxHp, block: e.block })

/** Opening hand of a fight; Steady hands guarantees the two largest dice */
function openingHand(state: GameState, rng: Rng): Pool {
  const fresh = { bag: state.dice, discard: [], hand: [] }
  if (!state.perks.includes('steadyHands')) return draw(fresh, state.handSize, rng)
  const top = [...state.dice].sort((a, b) => b.sides - a.sides).slice(0, 2)
  const rest = draw({ ...fresh, bag: state.dice.filter(d => !top.includes(d)) }, state.handSize - 2, rng)
  return { ...rest, hand: [...top, ...rest.hand] }
}

export function loadEncounter(state: GameState, encounter: number, rng: Rng): GameState {
  const enemies = ENCOUNTERS[encounter].map((def, id): Enemy => {
    const nextAction = pickWeighted(def.opening, rng)
    const pool = draw({ bag: def.dice.map((sides, i) => ({ id: i, sides })), discard: [], hand: [] }, def.handSize, rng)
    return {
      id, name: def.name, sprite: def.sprite, hp: def.hp, maxHp: def.hp, block: 0, handSize: def.handSize, chain: def.chain,
      nextAction, ...pool, nextCount: pickCount(pool.hand, rng),
    }
  })
  const log = [...state.log, `--- Encounter ${encounter + 1}: ${enemies.map(e => e.name).join(', ')} ---`]
  return { ...state, ...openingHand(state, rng), encounter, enemies, block: 0, phase: 'player', offers: [], log }
}

export function newGame(rng: Rng, encounter = 0): GameState {
  const dice = PLAYER.bag.map((sides, id) => ({ id, sides }))
  const empty: GameState = {
    hp: PLAYER.hp, maxHp: PLAYER.hp, block: 0, sturdyBlock: 0, bag: [], discard: [], hand: [],
    dice, nextDieId: dice.length, handSize: PLAYER.handSize, perks: [],
    enemies: [], encounter: 0, phase: 'player', offers: [], log: [], status: 'playing',
  }
  return loadEncounter(empty, encounter, rng)
}

// ---------------------------------------------------------------------------
// Rewards

const OFFER_WEIGHTS = { upgrade: 3, add: 3, remove: 2, enchant: 3, handSize: 0.5, perk: 0.25 }

export function rollOffers(state: GameState, rng: Rng): Offer[] {
  type Key = 'upgrade' | 'add' | 'remove' | 'enchant' | 'handSize' | Perk
  const pool: Weights<Key> = {}
  if (state.dice.some(d => d.sides < 20)) pool.upgrade = OFFER_WEIGHTS.upgrade
  pool.add = OFFER_WEIGHTS.add
  if (state.dice.length > state.handSize + 1) pool.remove = OFFER_WEIGHTS.remove
  if (state.dice.some(d => !d.enchant)) pool.enchant = OFFER_WEIGHTS.enchant
  if (state.handSize < MAX_HAND) pool.handSize = OFFER_WEIGHTS.handSize
  for (const perk of PERKS) if (!state.perks.includes(perk)) pool[perk] = OFFER_WEIGHTS.perk

  const offers: Offer[] = []
  while (offers.length < 3 && Object.keys(pool).length > 0) {
    const key = pickWeighted(pool, rng)
    delete pool[key]
    if (key === 'add') offers.push({ kind: 'add', sides: SIDES[Math.floor(rng() * SIDES.length)] })
    else if (key === 'enchant') offers.push({ kind: 'enchant', enchant: ENCHANTS[Math.floor(rng() * ENCHANTS.length)] })
    else if (key === 'upgrade' || key === 'remove' || key === 'handSize') offers.push({ kind: key })
    else offers.push({ kind: 'perk', perk: key })
  }
  return offers
}

export const describeOffer = (o: Offer): string => ({
  upgrade: 'Upgrade a die one size step',
  add: `Add a d${(o as { sides?: number }).sides} to your bag`,
  remove: 'Remove a die from your bag',
  enchant: `Enchant a die: ${(o as { enchant?: string }).enchant}`,
  handSize: 'Bigger hand: draw one more die each turn',
  perk: (o as { perk?: Perk }).perk === 'steadyHands' ? 'Steady hands: start every fight with your two largest dice' : 'Overkill: excess Mace damage hits the next enemy',
})[o.kind]

export const offerNeedsDie = (o: Offer) => o.kind === 'upgrade' || o.kind === 'remove' || o.kind === 'enchant'
export const offerAccepts = (o: Offer, d: Die) =>
  (o.kind === 'upgrade' && d.sides < 20) || o.kind === 'remove' || (o.kind === 'enchant' && !d.enchant)

/** Apply the chosen offer (null = skip), then load the next encounter */
export function chooseReward(state: GameState, index: number | null, dieId: number | undefined, rng: Rng): GameState {
  if (state.status !== 'playing' || state.phase !== 'reward') throw new Error('Not the reward phase')
  let next = state
  const log = [...state.log]
  if (index !== null) {
    const offer = state.offers[index]
    const die = state.dice.find(d => d.id === dieId)
    const replace = (patched: Die) => state.dice.map(d => (d.id === patched.id ? patched : d))
    if (offerNeedsDie(offer) && (!die || !offerAccepts(offer, die))) throw new Error(`Cannot ${offer.kind} that die`)
    if (offer.kind === 'upgrade') {
      const sides = SIDES[SIDES.indexOf(die!.sides) + 1]
      next = { ...state, dice: replace({ ...die!, sides }) }
      log.push(`Reward: d${die!.sides} → d${sides}`)
    } else if (offer.kind === 'add') {
      next = { ...state, dice: [...state.dice, { id: state.nextDieId, sides: offer.sides }], nextDieId: state.nextDieId + 1 }
      log.push(`Reward: a d${offer.sides} joins your bag`)
    } else if (offer.kind === 'remove') {
      if (state.dice.length <= state.handSize + 1) throw new Error('Cannot remove: the bag is too small')
      next = { ...state, dice: state.dice.filter(d => d !== die) }
      log.push(`Reward: d${die!.sides} removed from your bag`)
    } else if (offer.kind === 'enchant') {
      next = { ...state, dice: replace({ ...die!, enchant: offer.enchant }) }
      log.push(`Reward: d${die!.sides} is now ${offer.enchant}`)
    } else if (offer.kind === 'handSize') {
      next = { ...state, handSize: state.handSize + 1 }
      log.push(`Reward: hand size ${next.handSize}`)
    } else {
      next = { ...state, perks: [...state.perks, offer.perk] }
      log.push(`Reward: ${offer.perk}`)
    }
  } else {
    log.push('Reward skipped')
  }
  return loadEncounter({ ...next, log }, state.encounter + 1, rng)
}

// ---------------------------------------------------------------------------
// Combat

export function playerAction(state: GameState, action: PlayerAction, dieIds: number[], targetId: number, rng: Rng): GameState {
  if (state.status !== 'playing' || state.phase !== 'player') throw new Error('Not the player phase')
  if (dieIds.length === 0) throw new Error('Pick at least one die')
  const dice = dieIds.map(id => {
    const die = state.hand.find(d => d.id === id)
    if (!die) throw new Error(`Die ${id} is not in hand`)
    return die
  })
  const target = state.enemies.find(e => e.id === targetId && alive(e))
  if (action === 'mace' && !target) throw new Error('Invalid target')

  let next: GameState = dice.reduce((st, die) => spend(st, die), state)
  const log = [...state.log]

  // Roll every die; Lucky rerolls a 1 once
  let rerolled = false
  const faces = dice.map(die => {
    if (action === 'skip') return 0
    let face = roll(die.sides, rng)
    if (die.enchant === 'lucky' && face === 1) {
      face = roll(die.sides, rng)
      rerolled = true
    }
    return face
  })
  const total = sum(faces)
  const part = (enchant: Enchant) => sum(faces.filter((_, i) => dice[i].enchant === enchant))
  const count = (enchant: Enchant) => dice.filter(d => d.enchant === enchant).length
  const text = plural(dice, faces, total) + (rerolled ? ' (Lucky reroll)' : '')

  if (action === 'mace') {
    const heavy = 2 * count('heavy')
    const piercing = part('piercing')
    const { through: normal, blockLeft } = absorb(total - piercing + heavy, target!.block)
    const through = normal + piercing
    const blocked = total + heavy - through
    const hit = { ...target!, hp: Math.max(0, target!.hp - through), block: blockLeft }
    let enemies = next.enemies.map(e => (e.id === hit.id ? hit : e))
    log.push(`You swing the Mace with ${text}${heavy ? ` +${heavy} Heavy` : ''} → ${hit.name} takes ${through}` + (blocked ? ` (${blocked} blocked)` : ''))
    if (!alive(hit)) {
      log.push(`${hit.name} dies`)
      const excess = through - target!.hp
      const other = enemies.find(alive)
      if (state.perks.includes('overkill') && excess > 0 && other) {
        const r = absorb(excess, other.block)
        const spill = { ...other, hp: Math.max(0, other.hp - r.through), block: r.blockLeft }
        enemies = enemies.map(e => (e.id === spill.id ? spill : e))
        log.push(`Overkill: ${spill.name} takes ${r.through}`)
        if (!alive(spill)) log.push(`${spill.name} dies`)
      }
    }
    next = { ...next, enemies }
  } else if (action === 'shield') {
    const sturdy = part('sturdy')
    next = { ...next, block: next.block + total - sturdy, sturdyBlock: next.sturdyBlock + sturdy }
    log.push(`You raise the Shield with ${text} → Block ${next.block}` + (sturdy ? `, Sturdy Block ${next.sturdyBlock}` : ''))
  } else if (action === 'miracle') {
    const holy = part('holy')
    const heal = Math.min(state.maxHp - next.hp, holy + Math.floor((total - holy) / 2))
    next = { ...next, hp: next.hp + heal }
    log.push(`Miracle with ${text} → you heal ${heal}`)
  } else {
    log.push(`You skip ${dice.map(d => `d${d.sides}`).join(' + ')}`)
  }

  if (action !== 'skip' && total === ROSARY.total) {
    const heal = Math.min(state.maxHp - next.hp, ROSARY.heal)
    next = { ...next, hp: next.hp + heal }
    log.push(`${PLAYER.trinket.name}: you rolled ${ROSARY.total} and heal ${heal}`)
  }

  const echoes = count('echo')
  if (echoes) {
    const extra = draw({ bag: next.bag, discard: next.discard, hand: [] }, echoes, rng)
    next = { ...next, bag: extra.bag, discard: extra.discard, hand: [...next.hand, ...extra.hand] }
    if (extra.hand.length) log.push(`Echo: you draw ${extra.hand.map(d => `d${d.sides}`).join(' + ')}`)
  }
  next = { ...next, log }

  if (next.enemies.every(e => !alive(e))) {
    if (state.encounter + 1 >= ENCOUNTERS.length) return { ...next, status: 'won', log: [...log, 'The castle falls silent. You win.'] }
    return { ...next, phase: 'reward', offers: rollOffers(next, rng) }
  }
  if (next.hand.length === 0) {
    // Enemy turn begins: their Block from last turn expires
    return { ...next, phase: 'enemy', enemies: next.enemies.map(e => ({ ...e, block: 0 })) }
  }
  return next
}

/** One enemy action, or the upkeep that hands the turn back when every enemy hand is empty */
export function enemyStep(state: GameState, rng: Rng): GameState {
  if (state.status !== 'playing' || state.phase !== 'enemy') return state
  const actor = state.enemies.find(e => alive(e) && e.hand.length > 0)

  if (!actor) {
    const enemies = state.enemies.map(e => {
      if (!alive(e)) return e
      const pool = draw({ ...e, discard: [...e.discard, ...e.hand], hand: [] }, e.handSize, rng)
      return { ...e, ...pool, nextCount: pickCount(pool.hand, rng) }
    })
    return { ...state, enemies, block: 0, phase: 'player', ...draw(state, state.handSize, rng) }
  }

  const dice = actor.hand.slice(0, actor.nextCount)
  const faces = dice.map(d => roll(d.sides, rng))
  const total = sum(faces)
  const text = plural(dice, faces, total)
  const log = [...state.log]
  let hp = state.hp
  let block = state.block
  let sturdyBlock = state.sturdyBlock
  let acted: Enemy = dice.reduce((e, die) => spend(e, die), actor)

  if (acted.nextAction === 'shield') {
    acted = { ...acted, block: acted.block + total }
    log.push(`${actor.name} shields with ${text} → Block ${acted.block}`)
  } else {
    const first = absorb(total, block)
    const second = absorb(first.through, sturdyBlock)
    block = first.blockLeft
    sturdyBlock = second.blockLeft
    const through = second.through
    hp -= through
    const blocked = total - through ? ` (${total - through} blocked)` : ''
    if (acted.nextAction === 'bite') {
      const drained = Math.min(acted.maxHp - acted.hp, through)
      acted = { ...acted, hp: acted.hp + drained }
      log.push(`${actor.name} bites with ${text} → you take ${through}${blocked}, it drains ${drained}`)
    } else {
      log.push(`${actor.name} attacks with ${text} → you take ${through}${blocked}`)
    }
  }

  const next: GameState = { ...state, hp: Math.max(0, hp), block, sturdyBlock, log }
  const nextAction = pickWeighted(acted.chain[actor.nextAction](ctxOf(acted, next)), rng)
  acted = { ...acted, nextAction, nextCount: pickCount(acted.hand, rng) }
  const result = { ...next, enemies: next.enemies.map(e => (e.id === acted.id ? acted : e)) }
  if (hp <= 0) return { ...result, status: 'lost', log: [...log, 'You died.'] }
  return result
}
