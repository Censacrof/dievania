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

Every action uses **one die**: pick the action, pick the die, the die rolls
and the effect applies immediately. The next choice is made knowing the
result. Damage against **Block** is absorbed and consumes the Block.

| Action | Effect |
|---|---|
| **Mace** | roll → damage to the selected target, minus its Block (which is reduced by what it absorbed) |
| **Shield** | roll → added to own Block |
| **Miracle** | floor(roll / 2) HP healed, capped at 30 |
| **Skip** | die discarded, nothing happens |

Block expires at the start of the owner's own turn: what you build during
your turn protects you during the enemy turn, and vice versa.

### Enemies

Enemies mirror the player: each has a **dice bag, a discard pile and a hand**
of fixed size, drawn and reshuffled with the same rules. Enemy actions are
**Attack** (like Mace), **Shield**, and **Bite** (Attack that also heals the
enemy for the damage that got through, capped at max HP).

Actions form a **Markov chain per action, not per turn**: after every action
the enemy picks its next one from `chain[lastAction](ctx)`, where `ctx` is
`{ self, player, block }`: HP fractions (0..1) of the enemy and the player,
plus the enemy's own current Block. `opening` weights pick the very first
action at encounter start. The enemy always uses the **first die in hand
order**. Only the **next** action and the die it will use are visible.

### Turn

1. **Player turn.** Hand of 4. Target is a sticky selection on the enemy
   cards, defaulting to the first living enemy. Repeat until the hand is
   empty: pick an action, pick a die, resolve. Enemies at 0 HP die
   immediately. When the last die is spent the enemy turn begins and every
   enemy's Block resets to 0.
2. **Enemy turn.** Living enemies act one after another, one die per
   action, each action revealed step by step (the UI waits ~0.9 s between
   actions). After each action the chain picks the next one.
3. **Upkeep.** Every survivor discards its hand and draws a new one; the
   player's Block resets to 0 and a new hand of 4 is drawn. Back to 1.

If all enemies are dead the next encounter starts (player bag reassembled,
fresh hand); after the last one the player wins. If player HP reaches 0 the
player loses. Overkill damage is lost.

### Encounters (fixed sequence)

| # | Enemy | HP | Bag | Hand | Actions |
|---|---|---|---|---|---|
| 1 | Slime | 26 | 2d8 + 2d6 | 2 | Attack, Shield |
| 2 | Bat ×2 | 10 each | d4 + 2d8 | 2 | Attack, Shield |
| 3 | Vampire Knight | 40 | 2d6 + d8 + d12 + 2d20 | 3 | Attack, Shield, Bite |

Transition tendencies (exact weights live in `content.ts`):

- Slime shields more below half HP, and stops shielding once it has Block.
- Bats attack more when the player is below half HP.
- Vampire Knight bites more when he or the player is below half HP, and
  does not shield again while he still has Block.

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
  - `newGame(rng, encounter = 0)` → encounter loaded, enemies given a first
    action and a hand, player hand drawn, phase `player`.
  - `playerAction(state, action, dieId, targetId, rng)` → resolves one
    player action. Throws out of phase, for a die not in hand, or for an
    invalid Mace target. Handles enemy death, encounter transition, win, and
    the hand-off to phase `enemy`.
  - `enemyStep(state, rng)` → one enemy action (the first living enemy with
    dice left acts with its first die), or the upkeep that returns to phase
    `player` when every hand is empty. No-op outside phase `enemy`.
  - `draw(pool, n, rng)`, `pickWeighted(weights, rng)` → shared helpers.
  - rng order: one call per roll, one per draw, one per chain pick, in the
    order the text above describes.
- Every action appends one human-readable line to `state.log`.

State is an immutable value; functions return new objects.

### UI (`src/App.tsx`, `src/App.css`)

Single component, `useState<GameState>`. English only.

- Header: HP, Block, encounter number, whose turn it is.
- Enemy cards: name, HP, Block, hand (first die highlighted), "Next: attack
  with d8", bag and discard contents. Click selects target.
- Hand: one button per die, enabled only while an action is selected in the
  player phase.
- Action row: Mace, Shield, Miracle, Skip. The selected action stays
  selected until changed, so repeated actions need one click per die.
- Enemy phase: a `setTimeout` per step calls `enemyStep` every ~0.9 s.
- Log panel, newest at bottom. Win/lose banner with Restart.

No animations beyond the timed playback, no images, no routing, no
persistence.

### Testing

Vitest, engine only. TDD red → green → refactor. Test cases cover at least:

- bag draw, discard, reshuffle; weighted picking
- each player action, Block absorption and consumption, die validation,
  phase validation, turn hand-off with enemy Block reset
- enemy attack, shield and bite; enemies acting in order; dead enemies
  skipped; upkeep; player death
- encounter transition, win, chain weights reacting to HP

### Out of scope (first experiments after playtest)

Dice reward between encounters, Focus action (hold dice), rerolls,
threshold-based hits instead of sums, multi-target Mace, skeleton enemy.
