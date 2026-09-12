# Combat Prototype — Design Spec

Date: 2026-09-13
Project: `combat-prototype/` (React 19 + TypeScript + Vite)

## Goal

Answer one question: **is allocating dice to actions before rolling them fun?**
Everything not needed to answer that is out of scope.

## Rules

### Player (Cleric)

- 30 HP, does not regenerate between encounters.
- Dice bag: 6×d6 + 2×d20.
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

### Turn

1. Draw 4 dice. Every enemy shows its intent for this turn as dice
   (e.g. "2d6 Attack, 1d20 Shield").
2. Player assigns each die to a slot. If more than one enemy is alive the
   player picks one target for all Mace dice.
3. All dice roll (player and enemies).
4. **Player phase**: Mace damage hits the target; Miracle heals. Enemies at
   0 HP die immediately and do not act this turn.
5. **Enemy phase**: surviving enemies attack. Damage taken =
   max(0, total enemy attack − player Shield).
6. Enemy pattern index advances. If all enemies are dead, the next encounter
   starts; if it was the last one, the player wins. If player HP ≤ 0, the
   player loses.

Overkill damage is lost (no spill-over to other enemies).

### Encounters (fixed sequence)

| # | Enemy | HP | Intent pattern |
|---|---|---|---|
| 1 | Slime | 12 | alternates `1d6 Attack` / `2d6 Attack` |
| 2 | Bat ×2 | 6 each | `1d6 Attack` every turn |
| 3 | Vampire Knight | 35 | 3-turn cycle, fully visible: |

Vampire Knight cycle:

1. **Guard** — 1d6 Attack + 1d20 Shield
2. **Lunge** — 2d6 Attack
3. **Bite** — 2d20 Attack; heals himself for the damage actually dealt to the
   player (after Shield).

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
  - `newGame(rng)` → initial state with first encounter loaded and first hand
    drawn.
  - `resolveTurn(state, allocation, targetId, rng)` → new state after steps
    3–6 above, including drawing the next hand. `allocation` maps die id →
    slot. Throws if a die is unassigned or the target is invalid.
  - `currentIntent(enemy)` → the intent the enemy will use this turn.
- Every resolved turn appends human-readable lines to `state.log` (what was
  rolled, damage dealt/taken, heals, deaths).

State is an immutable value; functions return new objects.

### UI (`src/App.tsx`, `src/App.css`)

Single component, `useState<GameState>`. English only.

- Player panel: HP, bag/discard counts.
- Enemy cards: name, HP, current intent text (boss also shows the full cycle
  with the current step highlighted). Click selects target; auto-selected when
  only one enemy is alive.
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
- Slime alternation, bats as two independent attackers, Vampire cycle and
  Bite lifesteal
- encounter transition, win, lose

### Out of scope (first experiments after playtest)

Dice reward between encounters, Focus action (hold dice), rerolls,
threshold-based hits instead of sums, multi-target Mace, skeleton enemy.
