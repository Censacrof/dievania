# Combat Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A playable browser prototype of dice-allocation combat (Cleric vs Slime → 2 Bats → Vampire Knight) to test whether allocate-then-roll is fun.

**Architecture:** A pure TypeScript engine (`src/game/engine.ts`) holds all rules as functions over an immutable `GameState`, with randomness injected as `rng: () => number`. Enemy and player numbers live as data in `src/game/content.ts`. A single React component renders state and calls the engine.

**Tech Stack:** React 19, TypeScript, Vite 8, Vitest (added), oxlint (already present).

**Spec:** `docs/superpowers/specs/2026-09-13-combat-prototype-design.md`

## Global Constraints

- All code, comments, tests, log lines and UI copy in **English**.
- TDD: red → green → refactor for every engine behaviour. UI has no tests.
- Only new dependency allowed: `vitest` (devDependency).
- No animations, images, routing, persistence.
- All paths below are relative to `combat-prototype/`. Run all commands from that directory.
- `rng` consumption order in `resolveTurn` is fixed and tests depend on it: player hand dice in hand order → for each living enemy in order: its attack dice, then its shield dice → dice draws for the next hand (one `rng()` call per drawn die).

---

## File map

| File | Responsibility |
|---|---|
| `src/game/engine.ts` | Types, `roll`, `drawHand`, `loadEncounter`, `newGame`, `currentIntent`, `alive`, `resolveTurn`. |
| `src/game/content.ts` | Data: `PLAYER` (hp, handSize, bag) and `ENCOUNTERS` (Slime, Bat×2, Vampire Knight). |
| `src/game/engine.test.ts` | Vitest tests for the engine. |
| `src/App.tsx`, `src/App.css`, `src/index.css` | The UI shell. |
| `package.json` | add `vitest`, `test` script. |

Test helpers used throughout `engine.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { type Allocation, type GameState, type Rng, type Slot, currentIntent, drawHand, loadEncounter, newGame, resolveTurn } from './engine'

/** rng value that makes `roll(sides)` return exactly `face` */
const f = (face: number, sides: number) => (face - 0.5) / sides
/** rng that returns the queued values, then 0 forever (0 ⇒ draws take the first die in the bag) */
const q = (...vals: number[]): Rng => { let i = 0; return () => (i < vals.length ? vals[i++] : 0) }
const zero: Rng = () => 0
const allTo = (state: GameState, slot: Slot): Allocation => Object.fromEntries(state.hand.map(d => [d.id, slot]))
```

With `zero`, `newGame` draws dice ids 0,1,2,3 (four d6). The bag then holds ids 4,5 (d6) and 6,7 (d20).

---

### Task 1: Vitest setup, dice bag and new game

**Files:**
- Modify: `package.json`
- Create: `src/game/content.ts`, `src/game/engine.ts`, `src/game/engine.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Sides = 6 | 20
  export type Slot = 'mace' | 'shield' | 'miracle'
  export type Rng = () => number
  export type Allocation = Record<number, Slot | undefined>
  export interface Die { id: number; sides: Sides }
  export interface Intent { name: string; attack: Sides[]; shield: Sides[]; lifesteal?: boolean }
  export interface EnemyDef { name: string; hp: number; pattern: Intent[] }
  export interface Enemy extends EnemyDef { id: number; maxHp: number; step: number }
  export interface GameState { hp; maxHp; bag: Die[]; discard: Die[]; hand: Die[]; enemies: Enemy[]; encounter: number; log: string[]; status: 'playing' | 'won' | 'lost' }
  export const roll: (sides: number, rng: Rng) => number
  export const alive: (e: Enemy) => boolean
  export const currentIntent: (e: Enemy) => Intent
  export function drawHand(state: GameState, rng: Rng): GameState
  export function loadEncounter(state: GameState, encounter: number): GameState
  export function newGame(rng: Rng): GameState
  ```

- [ ] **Step 1: Install vitest and add the test script**

```bash
npm i -D vitest
npm pkg set scripts.test="vitest run"
```

- [ ] **Step 2: Write the failing tests**

`src/game/engine.test.ts` (with the helpers from the file map above):

```ts
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL, cannot resolve `./engine`.

- [ ] **Step 4: Write content and engine (bag part)**

`src/game/content.ts`:

```ts
import type { EnemyDef, Sides } from './engine'

export const PLAYER = { hp: 30, handSize: 4, bag: [6, 6, 6, 6, 6, 6, 20, 20] as Sides[] }

const SLIME: EnemyDef = {
  name: 'Slime',
  hp: 12,
  pattern: [
    { name: 'Ooze', attack: [6], shield: [] },
    { name: 'Splash', attack: [6, 6], shield: [] },
  ],
}

const BAT: EnemyDef = { name: 'Bat', hp: 6, pattern: [{ name: 'Swoop', attack: [6], shield: [] }] }

const VAMPIRE_KNIGHT: EnemyDef = {
  name: 'Vampire Knight',
  hp: 35,
  pattern: [
    { name: 'Guard', attack: [6], shield: [20] },
    { name: 'Lunge', attack: [6, 6], shield: [] },
    { name: 'Bite', attack: [20, 20], shield: [], lifesteal: true },
  ],
}

export const ENCOUNTERS: EnemyDef[][] = [[SLIME], [BAT, BAT], [VAMPIRE_KNIGHT]]
```

`src/game/engine.ts`:

```ts
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/game
git commit -m "Add dice bag engine with vitest"
```

---

### Task 2: resolveTurn — player and enemy phases against the Slime

**Files:**
- Modify: `src/game/engine.ts`, `src/game/engine.test.ts`

**Interfaces:**
- Consumes: everything from Task 1.
- Produces: `export function resolveTurn(state: GameState, allocation: Allocation, targetId: number, rng: Rng): GameState`

- [ ] **Step 1: Write the failing tests**

Append to `engine.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL, `resolveTurn` is not exported.

- [ ] **Step 3: Implement resolveTurn**

Append to `src/game/engine.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: 12 passed.

- [ ] **Step 5: Commit**

```bash
git add src/game
git commit -m "Add resolveTurn: mace, shield, miracle, enemy phase"
```

---

### Task 3: Encounter flow — Bats, Vampire Knight, win

**Files:**
- Modify: `src/game/engine.test.ts` (engine code from Task 2 should already satisfy these; fix the engine if any test fails)

- [ ] **Step 1: Write the failing tests**

Append to `engine.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: 17 passed. If any fails, fix `engine.ts` (not the test) until green.

- [ ] **Step 3: Commit**

```bash
git add src/game
git commit -m "Test encounter flow: bats, vampire knight, win"
```

---

### Task 4: UI shell

**Files:**
- Rewrite: `src/App.tsx`, `src/App.css`, `src/index.css`
- Modify: `index.html` (title)

**Interfaces:**
- Consumes: `newGame`, `resolveTurn`, `currentIntent`, `alive`, types `Allocation`, `GameState`, `Slot`, `Intent` from `./game/engine`.

- [ ] **Step 1: Write `src/App.tsx`**

```tsx
import { useState } from 'react'
import { type Allocation, type Intent, type Slot, alive, currentIntent, newGame, resolveTurn } from './game/engine'
import './App.css'

const SLOTS: Slot[] = ['mace', 'shield', 'miracle']
const nextSlot = (slot?: Slot): Slot => (slot ? SLOTS[(SLOTS.indexOf(slot) + 1) % SLOTS.length] : SLOTS[0])

// ponytail: assumes every die in an intent group has the same sides
const dice = (sides: number[]) => (sides.length ? `${sides.length}d${sides[0]}` : null)
const describe = (i: Intent) =>
  [dice(i.attack) && `${dice(i.attack)} Attack`, dice(i.shield) && `${dice(i.shield)} Shield`, i.lifesteal && 'Drain']
    .filter(Boolean)
    .join(' + ')

export default function App() {
  const [game, setGame] = useState(() => newGame(Math.random))
  const [allocation, setAllocation] = useState<Allocation>({})
  const [picked, setPicked] = useState<number | null>(null)

  const living = game.enemies.filter(alive)
  const targetId = living.length === 1 ? living[0].id : picked
  const ready = game.status === 'playing' && targetId !== null && game.hand.every(d => allocation[d.id])

  const reset = () => { setAllocation({}); setPicked(null) }
  const rollDice = () => { setGame(resolveTurn(game, allocation, targetId!, Math.random)); reset() }
  const restart = () => { setGame(newGame(Math.random)); reset() }

  return (
    <main>
      <header>
        <h1>Cleric · HP {game.hp}/{game.maxHp}</h1>
        <span>Bag {game.bag.length} · Discard {game.discard.length} · Encounter {game.encounter + 1}/3</span>
      </header>

      <section className="enemies">
        {game.enemies.map(e => (
          <button
            key={e.id}
            className={`enemy ${e.id === targetId ? 'target' : ''} ${alive(e) ? '' : 'dead'}`}
            disabled={!alive(e)}
            onClick={() => setPicked(e.id)}
          >
            <strong>{e.name}</strong>
            <span>HP {e.hp}/{e.maxHp}</span>
            <ol>
              {e.pattern.map((intent, i) => (
                <li key={i} className={intent === currentIntent(e) ? 'current' : ''}>
                  {intent.name}: {describe(intent)}
                </li>
              ))}
            </ol>
          </button>
        ))}
      </section>

      <section className="hand">
        {game.hand.map(d => (
          <button
            key={d.id}
            className={`die ${allocation[d.id] ?? ''}`}
            onClick={() => setAllocation({ ...allocation, [d.id]: nextSlot(allocation[d.id]) })}
          >
            <strong>d{d.sides}</strong>
            <span>{allocation[d.id] ?? 'assign'}</span>
          </button>
        ))}
        <button className="roll" disabled={!ready} onClick={rollDice}>Roll</button>
      </section>

      {game.status !== 'playing' && (
        <section className="banner">
          <h2>{game.status === 'won' ? 'You win' : 'You died'}</h2>
          <button onClick={restart}>Restart</button>
        </section>
      )}

      <section className="log">
        {game.log.map((line, i) => <p key={i}>{line}</p>).reverse()}
      </section>
    </main>
  )
}
```

- [ ] **Step 2: Write `src/App.css`**

```css
main { max-width: 900px; margin: 0 auto; padding: 1rem; display: grid; gap: 1rem; }
header { display: flex; justify-content: space-between; align-items: baseline; }
h1 { margin: 0; font-size: 1.4rem; }
button { font: inherit; color: inherit; cursor: pointer; }

.enemies { display: flex; gap: 1rem; flex-wrap: wrap; }
.enemy { flex: 1 1 200px; text-align: left; background: #1e1620; border: 2px solid #3a2a3d; border-radius: 8px; padding: .75rem; display: grid; gap: .25rem; }
.enemy.target { border-color: #d33; }
.enemy.dead { opacity: .35; text-decoration: line-through; }
.enemy ol { margin: .25rem 0 0; padding-left: 1.2rem; font-size: .85rem; color: #998; }
.enemy li.current { color: #fff; font-weight: bold; }

.hand { display: flex; gap: .75rem; flex-wrap: wrap; align-items: stretch; }
.die { width: 84px; height: 84px; border-radius: 10px; border: 2px solid #555; background: #222; display: grid; place-content: center; gap: .25rem; }
.die.mace { border-color: #d64; background: #3a1f18; }
.die.shield { border-color: #48c; background: #182a3a; }
.die.miracle { border-color: #dc6; background: #3a3218; }
.roll { margin-left: auto; padding: 0 2rem; border-radius: 10px; border: 2px solid #ccc; background: #333; font-size: 1.2rem; }
.roll:disabled { opacity: .3; cursor: not-allowed; }

.banner { text-align: center; padding: 1rem; background: #2a1a1a; border-radius: 8px; }

.log { height: 220px; overflow-y: auto; display: flex; flex-direction: column-reverse; background: #111; border-radius: 8px; padding: .5rem .75rem; font-family: monospace; font-size: .85rem; }
.log p { margin: .15rem 0; }
```

`display: flex; flex-direction: column-reverse` with the reversed array keeps the newest line at the bottom and the scroll pinned there without JavaScript.

- [ ] **Step 3: Replace `src/index.css`**

```css
:root { color-scheme: dark; background: #0d0a0f; color: #e8e2e8; font-family: system-ui, sans-serif; }
body { margin: 0; }
```

- [ ] **Step 4: Set the page title**

In `index.html`, change `<title>combat-prototype</title>` to `<title>Dievania — Combat Prototype</title>`.

- [ ] **Step 5: Verify build and lint**

Run: `npm run build && npm run lint && npm test`
Expected: build succeeds, lint reports 0 errors, 17 tests pass.

- [ ] **Step 6: Play one round manually**

Run: `npm run dev`, open the URL, click dice to assign slots, Roll, confirm the log describes the turn and HP changes. Kill the Slime and confirm the Bats appear with target selection required.

- [ ] **Step 7: Commit**

```bash
git add src index.html
git commit -m "Add combat prototype UI"
```
