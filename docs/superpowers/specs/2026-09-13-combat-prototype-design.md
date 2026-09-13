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

Every action uses **one or more dice**: pick the action, select any number of
dice from the hand, confirm. All selected dice roll, their faces are summed,
and the effect applies immediately. The next choice is made knowing the
result. Damage against **Block** is absorbed and consumes the Block.

With several dice, per-die enchantments apply to their own die: Heavy adds 2
per Heavy die, only a Piercing die's roll ignores Block, only a Holy die's
roll heals in full, only a Sturdy die's roll goes to sturdy Block, Lucky
rerolls its own 1, and Echo draws one die per Echo die used.

**Trinket — Rosary Beads** (always equipped): whenever an action's total is
exactly 7, heal 5 HP. Skip never rolls, so it never triggers it.

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
action at encounter start. An action spends the **first N dice in hand
order**, where N is picked uniformly from 1 to the dice left in hand, right
after the action is chosen (and again after every draw). Only the **next**
action and the dice it will use are visible.

### Turn

1. **Player turn.** Hand of 4. Target is a sticky selection on the enemy
   cards, defaulting to the first living enemy. Repeat until the hand is
   empty: pick an action, select dice, confirm, resolve. Enemies at 0 HP die
   immediately. When the last die is spent the enemy turn begins and every
   enemy's Block resets to 0.
2. **Enemy turn.** Living enemies act one after another, N dice per
   action, each action revealed step by step (the UI waits ~0.9 s between
   actions). After each action the chain picks the next one.
3. **Upkeep.** Every survivor discards its hand and draws a new one; the
   player's Block resets to 0 and a new hand of 4 is drawn. Back to 1.

If all enemies are dead the reward phase starts (see Rewards); after the
boss the player wins. If player HP reaches 0 the
player loses. Overkill damage is lost.

### Rewards

After clearing a fight that is not the boss the game enters the **reward
phase**: three offers plus Skip. Offers that need a target die highlight the
player's dice collection; clicking a die applies the reward. Then the next
encounter loads. The boss ends the run, no reward.

The player's dice are a persistent **collection**; the bag is rebuilt from it
at every fight. Each die may carry **one enchantment**, kept on size steps.

Offer pool, three distinct draws (weights in `engine.ts`):

| Offer | Weight | Target | Condition |
|---|---|---|---|
| Upgrade a die one step (d4 → d6 → d8 → d10 → d12 → d20) | 3 | die with sides < 20 | any such die |
| Add a die (random size) | 3 | — | always |
| Remove a die | 2 | any die | collection > hand size + 1 |
| Enchant a die (random tag) | 3 | unenchanted die | any such die |
| Bigger hand (+1, max 6) | 0.5 | — | hand size < 6 |
| Steady hands / Overkill | 0.25 each | — | not owned |

Enchantments:

| Tag | Rule |
|---|---|
| Heavy | Mace roll +2 |
| Piercing | Mace ignores the target's Block |
| Holy | Miracle heals the full roll |
| Lucky | a roll of 1 is rerolled once, any action |
| Echo | after the die is used, draw one die into the hand |
| Sturdy | Shield goes into a separate Block pool that never expires; damage eats normal Block first |

Bag-wide upgrades: **Bigger hand** raises the hand size for every draw.
**Steady hands** puts the two largest dice in the opening hand of each fight.
**Overkill** carries Mace damage beyond a kill to the next living enemy,
through its Block.

### Encounters (fixed sequence)

| # | Encounter |
|---|---|
| 1 | Slime |
| 2 | Slime ×2 |
| 3 | Bat ×2 + Slime |
| 4 | Vampire Knight |

| Enemy | HP | Bag | Hand | Actions |
|---|---|---|---|---|
| Slime | 26 | 2d8 + 2d6 | 2 | Attack, Shield |
| Bat | 10 | d4 + 2d8 | 2 | Attack, Shield |
| Vampire Knight | 40 | 2d6 + d8 + d12 + 2d20 | 3 | Attack, Shield, Bite |

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
  - `playerAction(state, action, dieIds, targetId, rng)` → resolves one
    player action with the given dice. Throws out of phase, for an empty
    selection, for a die not in hand, or for an invalid Mace target. Handles enemy death, encounter transition, win, and
    the hand-off to phase `enemy`.
  - `enemyStep(state, rng)` → one enemy action (the first living enemy with
    dice left acts with its first `nextCount` dice), or the upkeep that returns to phase
    `player` when every hand is empty. No-op outside phase `enemy`.
  - `rollOffers(state, rng)` → three offers, stored in `state.offers` when a
    fight is cleared (`phase: 'reward'`).
  - `chooseReward(state, index | null, dieId, rng)` → applies the offer (null
    skips), then loads the next encounter. Throws out of phase or for an
    ineligible die.
  - `draw(pool, n, rng)`, `pickWeighted(weights, rng)` → shared helpers.
  - rng order: one call per roll, one per draw, one per chain pick, in the
    order the text above describes.
- Every action appends one human-readable line to `state.log`.

State is an immutable value; functions return new objects.

### UI (`src/App.tsx`, `src/App.css`)

Single component, `useState<GameState>`. English only.

- Header: encounter number and whose turn it is. The player card carries
  sprite, name, HP with a health bar, Block, hand, actions, bag, trinket,
  hand size and perks.
- Enemy cards: sprite, name, HP with a health bar, Block, hand (the dice
  about to be used highlighted), "Next: attack with d8 + d6", bag and
  discard contents. Click selects target.
- Hand: one button per die, enabled only while an action is selected in the
  player phase; clicking toggles selection. A Confirm button resolves the
  action with the selected dice.
- Trinket row: Rosary Beads icon, name and rule text.
- Action row: Mace, Shield, Miracle, Skip, with the equipment icons
  (`mace.png`, `shield.png`, `reliq.png`). The selected action stays
  selected until changed, so repeated actions need one click per die.
- Enemy phase: a `setTimeout` per step calls `enemyStep` every ~0.9 s.
- Reward phase: offer cards replace the enemy cards; the player card shows
  the dice collection instead of the hand, clickable when an offer that needs
  a die is selected. Die buttons and bag listings show the enchant tag.
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
- offer rolling and conditions, every reward kind, every enchantment, both
  perks

### Out of scope (first experiments after playtest)

Focus action (hold dice), stackable enchantments, threshold-based hits
instead of sums, skeleton enemy.
