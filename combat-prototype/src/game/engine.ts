import { ENCOUNTERS, PLAYER } from './content'

export type Sides = 4 | 6 | 8 | 10 | 12 | 20
export type Slot = 'mace' | 'shield' | 'miracle'
export type Rng = () => number
export type Allocation = Record<number, Slot | undefined>
export type Weights = Record<string, number>

export interface Die { id: number; sides: Sides }
export interface Pool { bag: Die[]; discard: Die[]; hand: Die[] }

/** HP fractions (0..1) the Markov transitions may look at */
export interface Ctx { self: number; player: number }
/** A move sends the `shield` largest dice of the hand to Shield, the rest to Attack */
export interface Move { shield: number; lifesteal?: boolean; next: (c: Ctx) => Weights }
export interface EnemyDef { name: string; hp: number; dice: Sides[]; handSize: number; opening: Weights; moves: Record<string, Move> }
export interface Enemy extends Pool { id: number; name: string; hp: number; maxHp: number; handSize: number; moves: Record<string, Move>; move: string }

export interface GameState extends Pool {
  hp: number
  maxHp: number
  enemies: Enemy[]
  encounter: number
  log: string[]
  status: 'playing' | 'won' | 'lost'
}

export const roll = (sides: number, rng: Rng) => Math.floor(rng() * sides) + 1
export const alive = (e: Enemy) => e.hp > 0
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

export function pickWeighted(weights: Weights, rng: Rng): string {
  const entries = Object.entries(weights).filter(([, w]) => w > 0)
  let r = rng() * sum(entries.map(([, w]) => w))
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

export function enemyAllocation(e: Enemy): { attack: Die[]; shield: Die[] } {
  const bySize = [...e.hand].sort((a, b) => b.sides - a.sides)
  const shield = bySize.slice(0, e.moves[e.move].shield)
  return { shield, attack: e.hand.filter(d => !shield.includes(d)) }
}

const ctxOf = (e: Enemy, state: { hp: number; maxHp: number }): Ctx => ({ self: e.hp / e.maxHp, player: state.hp / state.maxHp })

/** End-of-turn upkeep for one enemy: discard hand, pick next move, draw */
function refreshEnemy(e: Enemy, weights: Weights, rng: Rng): Enemy {
  const move = pickWeighted(weights, rng)
  return { ...e, move, ...draw({ bag: e.bag, discard: [...e.discard, ...e.hand], hand: [] }, e.handSize, rng) }
}

export function loadEncounter(state: GameState, encounter: number, rng: Rng): GameState {
  const enemies = ENCOUNTERS[encounter].map((def, id) => {
    const base: Enemy = {
      id, name: def.name, hp: def.hp, maxHp: def.hp, handSize: def.handSize, moves: def.moves, move: '',
      bag: def.dice.map((sides, i) => ({ id: i, sides })), discard: [], hand: [],
    }
    return refreshEnemy(base, def.opening, rng)
  })
  const bag = PLAYER.bag.map((sides, id) => ({ id, sides }))
  const log = [...state.log, `--- Encounter ${encounter + 1}: ${enemies.map(e => e.name).join(', ')} ---`]
  return { ...state, encounter, enemies, bag, discard: [], hand: [], log }
}

const drawPlayer = (state: GameState, rng: Rng): GameState => ({ ...state, ...draw(state, PLAYER.handSize, rng) })

export function newGame(rng: Rng, encounter = 0): GameState {
  const empty: GameState = {
    hp: PLAYER.hp, maxHp: PLAYER.hp, bag: [], discard: [], hand: [],
    enemies: [], encounter: 0, log: [], status: 'playing',
  }
  return drawPlayer(loadEncounter(empty, encounter, rng), rng)
}

export function resolveTurn(state: GameState, allocation: Allocation, targetId: number, rng: Rng): GameState {
  if (state.status !== 'playing') return state
  const unassigned = state.hand.find(d => !allocation[d.id])
  if (unassigned) throw new Error(`Die ${unassigned.id} has no slot`)
  const target = state.enemies.find(e => e.id === targetId && alive(e))
  if (!target) throw new Error('Invalid target')

  const log = [...state.log]

  // Player rolls
  const totals = { mace: 0, shield: 0, miracle: 0 }
  const faces: string[] = []
  for (const d of state.hand) {
    const slot = allocation[d.id]!
    const face = roll(d.sides, rng)
    totals[slot] += face
    faces.push(`d${d.sides}=${face} (${slot})`)
  }
  log.push(`You rolled ${faces.join(', ')} → Mace ${totals.mace}, Shield ${totals.shield}, Miracle ${totals.miracle}`)

  // Enemy rolls (attack dice, then shield dice, per living enemy in order)
  const rolls = new Map(
    state.enemies.filter(alive).map(e => {
      const a = enemyAllocation(e)
      const attack = sum(a.attack.map(d => roll(d.sides, rng)))
      const shield = sum(a.shield.map(d => roll(d.sides, rng)))
      log.push(`${e.name} (${e.move}) rolls Attack ${attack}, Shield ${shield}`)
      return [e.id, { attack, shield }]
    }),
  )

  // Player phase
  const targetShield = rolls.get(targetId)!.shield
  const damage = Math.max(0, totals.mace - targetShield)
  let enemies = state.enemies.map(e => (e.id === targetId ? { ...e, hp: Math.max(0, e.hp - damage) } : e))
  log.push(`Mace hits ${target.name} for ${damage}` + (targetShield ? ` (${targetShield} blocked)` : ''))
  if (!alive(enemies.find(e => e.id === targetId)!)) log.push(`${target.name} dies`)

  let hp = state.hp
  if (totals.miracle > 0) {
    const heal = Math.min(state.maxHp - hp, Math.floor(totals.miracle / 2))
    hp += heal
    log.push(`Miracle heals ${heal}`)
  }

  // Enemy phase
  const attackers = enemies.filter(alive)
  const incoming = sum(attackers.map(e => rolls.get(e.id)!.attack))
  const taken = Math.max(0, incoming - totals.shield)
  if (attackers.length > 0) {
    hp -= taken
    log.push(`${attackers.map(e => e.name).join(' and ')} attack for ${incoming}, Shield blocks ${Math.min(incoming, totals.shield)}, you take ${taken}`)
  }
  enemies = enemies.map(e => {
    if (!alive(e)) return e
    // ponytail: lifesteal heals the full damage taken; fine while the only lifestealer fights alone
    const drained = e.moves[e.move].lifesteal ? Math.min(e.maxHp - e.hp, taken) : 0
    if (drained > 0) log.push(`${e.name} drains ${drained} HP`)
    return { ...e, hp: e.hp + drained }
  })

  const next: GameState = { ...state, hp, enemies, log, discard: [...state.discard, ...state.hand], hand: [] }
  if (hp <= 0) return { ...next, hp: 0, status: 'lost', log: [...log, 'You died.'] }
  if (enemies.every(e => !alive(e))) {
    if (state.encounter + 1 >= ENCOUNTERS.length) {
      return { ...next, status: 'won', log: [...log, 'The castle falls silent. You win.'] }
    }
    return drawPlayer(loadEncounter(next, state.encounter + 1, rng), rng)
  }
  // Upkeep: survivors pick their next move and draw, then the player draws
  const upkept = enemies.map(e => (alive(e) ? refreshEnemy(e, e.moves[e.move].next(ctxOf(e, next)), rng) : e))
  return drawPlayer({ ...next, enemies: upkept }, rng)
}
