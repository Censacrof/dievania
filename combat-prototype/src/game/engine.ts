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

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

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
      const intent = currentIntent(e)
      const attack = sum(intent.attack.map(s => roll(s, rng)))
      const shield = sum(intent.shield.map(s => roll(s, rng)))
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
    const drained = currentIntent(e).lifesteal ? Math.min(e.maxHp - e.hp, taken) : 0
    if (drained > 0) log.push(`${e.name} drains ${drained} HP`)
    return { ...e, hp: e.hp + drained, step: e.step + 1 }
  })

  const next: GameState = { ...state, hp, enemies, log, discard: [...state.discard, ...state.hand], hand: [] }
  if (hp <= 0) return { ...next, hp: 0, status: 'lost', log: [...log, 'You died.'] }
  if (enemies.every(e => !alive(e))) {
    if (state.encounter + 1 >= ENCOUNTERS.length) {
      return { ...next, status: 'won', log: [...log, 'The castle falls silent. You win.'] }
    }
    return drawHand(loadEncounter(next, state.encounter + 1), rng)
  }
  return drawHand(next, rng)
}
