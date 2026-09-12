import { ENCOUNTERS, PLAYER } from './content'

export type Sides = 4 | 6 | 8 | 10 | 12 | 20
export type PlayerAction = 'mace' | 'shield' | 'miracle' | 'skip'
export type EnemyAction = 'attack' | 'shield' | 'bite'
export type Rng = () => number
export type Weights<K extends string = EnemyAction> = Partial<Record<K, number>>

export interface Die { id: number; sides: Sides }
export interface Pool { bag: Die[]; discard: Die[]; hand: Die[] }

/** What a Markov transition may look at: HP fractions (0..1) and the enemy's own current Block */
export interface Ctx { self: number; player: number; block: number }
export interface EnemyDef {
  name: string
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
  hp: number
  maxHp: number
  block: number
  handSize: number
  chain: EnemyDef['chain']
  /** the action it will perform with the first die in hand */
  nextAction: EnemyAction
}

export interface GameState extends Pool {
  hp: number
  maxHp: number
  block: number
  enemies: Enemy[]
  encounter: number
  phase: 'player' | 'enemy'
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

const ctxOf = (e: Enemy, state: GameState): Ctx => ({ self: e.hp / e.maxHp, player: state.hp / state.maxHp, block: e.block })

export function loadEncounter(state: GameState, encounter: number, rng: Rng): GameState {
  const enemies = ENCOUNTERS[encounter].map((def, id): Enemy => ({
    id, name: def.name, hp: def.hp, maxHp: def.hp, block: 0, handSize: def.handSize, chain: def.chain,
    nextAction: pickWeighted(def.opening, rng),
    ...draw({ bag: def.dice.map((sides, i) => ({ id: i, sides })), discard: [], hand: [] }, def.handSize, rng),
  }))
  const log = [...state.log, `--- Encounter ${encounter + 1}: ${enemies.map(e => e.name).join(', ')} ---`]
  const player = draw({ bag: PLAYER.bag.map((sides, id) => ({ id, sides })), discard: [], hand: [] }, PLAYER.handSize, rng)
  return { ...state, ...player, encounter, enemies, block: 0, phase: 'player', log }
}

export function newGame(rng: Rng, encounter = 0): GameState {
  const empty: GameState = {
    hp: PLAYER.hp, maxHp: PLAYER.hp, block: 0, bag: [], discard: [], hand: [],
    enemies: [], encounter: 0, phase: 'player', log: [], status: 'playing',
  }
  return loadEncounter(empty, encounter, rng)
}

export function playerAction(state: GameState, action: PlayerAction, dieId: number, targetId: number, rng: Rng): GameState {
  if (state.status !== 'playing' || state.phase !== 'player') throw new Error('Not the player phase')
  const die = state.hand.find(d => d.id === dieId)
  if (!die) throw new Error(`Die ${dieId} is not in hand`)
  const target = state.enemies.find(e => e.id === targetId && alive(e))
  if (action === 'mace' && !target) throw new Error('Invalid target')

  let next = spend(state, die)
  const log = [...state.log]
  const face = action === 'skip' ? 0 : roll(die.sides, rng)

  if (action === 'mace') {
    const { through, blockLeft } = absorb(face, target!.block)
    const hit = { ...target!, hp: Math.max(0, target!.hp - through), block: blockLeft }
    next = { ...next, enemies: next.enemies.map(e => (e.id === hit.id ? hit : e)) }
    log.push(`You swing the Mace with d${die.sides}: ${face} → ${hit.name} takes ${through}` + (face - through ? ` (${face - through} blocked)` : ''))
    if (!alive(hit)) log.push(`${hit.name} dies`)
  } else if (action === 'shield') {
    next = { ...next, block: next.block + face }
    log.push(`You raise the Shield with d${die.sides}: ${face} → Block ${next.block}`)
  } else if (action === 'miracle') {
    const heal = Math.min(state.maxHp - state.hp, Math.floor(face / 2))
    next = { ...next, hp: next.hp + heal }
    log.push(`Miracle with d${die.sides}: ${face} → you heal ${heal}`)
  } else {
    log.push(`You skip d${die.sides}`)
  }
  next = { ...next, log }

  if (next.enemies.every(e => !alive(e))) {
    if (state.encounter + 1 >= ENCOUNTERS.length) return { ...next, status: 'won', log: [...log, 'The castle falls silent. You win.'] }
    return loadEncounter(next, state.encounter + 1, rng)
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
    const enemies = state.enemies.map(e => (alive(e) ? { ...e, ...draw({ ...e, discard: [...e.discard, ...e.hand], hand: [] }, e.handSize, rng) } : e))
    return { ...state, enemies, block: 0, phase: 'player', ...draw(state, PLAYER.handSize, rng) }
  }

  const die = actor.hand[0]
  const face = roll(die.sides, rng)
  const log = [...state.log]
  let hp = state.hp
  let block = state.block
  let acted: Enemy = spend(actor, die)

  if (acted.nextAction === 'shield') {
    acted = { ...acted, block: acted.block + face }
    log.push(`${actor.name} shields with d${die.sides}: ${face} → Block ${acted.block}`)
  } else {
    const { through, blockLeft } = absorb(face, block)
    hp -= through
    block = blockLeft
    const blocked = face - through ? ` (${face - through} blocked)` : ''
    if (acted.nextAction === 'bite') {
      const drained = Math.min(acted.maxHp - acted.hp, through)
      acted = { ...acted, hp: acted.hp + drained }
      log.push(`${actor.name} bites with d${die.sides}: ${face} → you take ${through}${blocked}, it drains ${drained}`)
    } else {
      log.push(`${actor.name} attacks with d${die.sides}: ${face} → you take ${through}${blocked}`)
    }
  }

  const next: GameState = { ...state, hp: Math.max(0, hp), block, log }
  acted = { ...acted, nextAction: pickWeighted(acted.chain[actor.nextAction](ctxOf(acted, next)), rng) }
  const result = { ...next, enemies: next.enemies.map(e => (e.id === acted.id ? acted : e)) }
  if (hp <= 0) return { ...result, status: 'lost', log: [...log, 'You died.'] }
  return result
}
