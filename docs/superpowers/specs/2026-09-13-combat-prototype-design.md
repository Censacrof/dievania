# Combat Prototype — Design Spec

Date: 2026-09-13
Project: `combat-prototype/` (React 19 + TypeScript + Vite)

## Goal

Answer one question: **is allocating dice to actions before rolling them fun?**
Everything not needed to answer that is out of scope.

## Rules

### Player (Cleric)

- 30 HP, does not regenerate between encounters.
- Dice bag: 6×d6 + 2×d20. Dice sides in the game: d4, d6, d8, d10, d12, d20.
- Each turn draw 4 dice from the bag. Used dice go to a discard pile. When the
  bag is empty, the discard pile is shuffled back into the bag.
- At the start of every encounter the bag is fully reassembled (all 8 dice,
  discard emptied).

### Actions

Every drawn die must be assigned to exactly one slot before rolling:

| Slot | Effect |
|---|---|
| **Mace** | Sum of dice = damage to the chosen target, reduced by that enemy's Shield for the turn (min 0). |
| **Shield** | Sum of dice = damage blocked this turn, against the combined attack of all enemies. |
| **Miracle** | floor(sum / 2) = HP healed, capped at 30. Excess is lost. |

### Enemies

Enemies mirror the player: each has a **dice bag, a discard pile and a hand**
of fixed size, drawn and reshuffled with the same rules. Every enemy has a set
of named **moves**. A move is an allocation rule over the drawn hand: the
`shield` largest dice go to Shield, the rest to Attack. A move may add an
effect (currently only `lifesteal`: the enemy heals for the damage the player
actually takes this turn, capped at its max HP).

Moves form a **Markov chain**: every move declares the weights of the next
move as a function of `{ self, player }`, the HP fractions (0..1) of the enemy
and of the player. Each enemy definition also has `opening` weights for its
first move. Only the **next** move is ever visible.

### Turn

1. Player draws 4 dice. Every living enemy already shows its move, its drawn
   hand and which die goes to Attack or Shield (e.g. "Bite: d20 d20 d6 →
   Attack, drains"). Bags and discard piles of everyone are visible.
2. Player assigns each die to a slot. If more than one enemy is alive the
   player picks one target for all Mace dice.
3. All dice roll (player and enemies).
4. **Player phase**: Mace damage minus the target's Shield roll hits the
   target; Miracle heals. Enemies at 0 HP die immediately and do not act.
5. **Enemy phase**: surviving enemies attack. Damage taken =
   max(0, total enemy attack − player Shield). Lifesteal applies.
6. **Upkeep**: each survivor discards its hand, picks its next move from the
   current move's weights, and draws a new hand. If all enemies are dead, the
   next encounter starts (player bag reassembled); if it was the last one,
   the player wins. If player HP ≤ 0, the player loses.

Overkill damage is lost (no spill-over to other enemies).

### Encounters (fixed sequence)

| # | Enemy | HP | Bag | Hand | Moves (shield dice) |
|---|---|---|---|---|---|
| 1 | Slime | 26 | 2d8 + 2d6 | 2 | Ooze (1), Splash (0), Harden (2) |
| 2 | Bat ×2 | 10 each | d4 + 2d8 | 2 | Swoop (0), Flutter (2) |
| 3 | Vampire Knight | 40 | 2d6 + d8 + d12 + 2d20 | 3 | Guard (1), Lunge (0), Bite (0, lifesteal) |

Transition tendencies (exact weights live in `content.ts`):

- Slime hardens only below half HP.
- Bats swoop more when the player is below half HP.
- Vampire Knight bites more when the player is below half HP (after Guard)
  or when he is below half HP (after Lunge); after Bite he mostly Guards.

### End states

- Win: Vampire Knight dies.
- Lose: player HP reaches 0.
- A "Restart" button starts a fresh game.

## Implementation

### Engine (`src/game/`)

Pure TypeScript, no React imports. All randomness goes through an injected
`rng: () => number` (Math.random signature) so tests are deterministic.

- `content.ts` — data only: player starting bag/HP, enemy definitions and
  encounter list.
- `engine.ts` — types and functions:
  - `newGame(rng, encounter = 0)` → initial state with the encounter loaded,
    enemies given opening moves and hands, first player hand drawn.
  - `resolveTurn(state, allocation, targetId, rng)` → new state after steps
    3–6 above. `allocation` maps die id → slot. Throws if a die is
    unassigned or the target is invalid.
  - `enemyAllocation(enemy)` → which hand dice go to Attack and Shield.
  - `draw(pool, n, rng)`, `pickWeighted(weights, rng)` → shared helpers.
  - rng consumption order: player hand dice → per living enemy: attack dice
    then shield dice → per survivor: next move, then its draws → player draws.
- Every resolved turn appends human-readable lines to `state.log` (what was
  rolled, damage dealt/taken, heals, deaths).

State is an immutable value; functions return new objects.

### UI (`src/App.tsx`, `src/App.css`)

Single component, `useState<GameState>`. English only.

- Player panel: HP, encounter number; bag and discard contents listed under
  the hand.
- Enemy cards: name, HP, next move with hand allocation, bag and discard
  contents. Click selects target; auto-selected when only one enemy is alive.
- Hand: one button per die showing `d6`/`d20` and its slot. Click cycles
  slot: unassigned → Mace → Shield → Miracle → Mace…
- "Roll" button, enabled only when every die has a slot and a target exists.
  After rolling, the dice show their face values next to the slot totals.
- Log panel, newest at bottom.
- Win/lose banner with Restart.

No animations, no images, no routing, no persistence.

### Testing

Vitest, engine only. TDD red → green → refactor. Test cases cover at least:

- bag draw of 4, discard, reshuffle when bag is empty, reset per encounter
- Mace sum minus enemy shield, floor at 0
- Shield vs combined enemy attacks
- Miracle heals floor(sum/2), capped at max HP
- player-first ordering: a killed enemy does not attack
- enemy draw and upkeep, weighted move picking, allocation by largest dice,
  Markov weights reacting to HP, bats as two independent attackers, Bite
  lifesteal
- encounter transition, win, lose

### Out of scope (first experiments after playtest)

Dice reward between encounters, Focus action (hold dice), rerolls,
threshold-based hits instead of sums, multi-target Mace, skeleton enemy.
