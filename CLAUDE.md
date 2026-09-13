# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Dievania: a first-person, turn-based roguelike "deckbuilder" where dice are the deck, set in Dracula's castle. Two things live here:

- **Repo root** — an empty Godot 4.7 project (`project.godot`, `main.tscn`). Nothing is built there yet. `combat-prototype/.gdignore` keeps Godot from importing the web prototype; if `*.import` files appear under `combat-prototype/`, delete them.
- **`combat-prototype/`** — a React 19 + TypeScript + Vite 8 web app used to answer one question: is allocating and rolling dice fun? All active development happens here.
- **`docs/superpowers/specs/2026-09-13-combat-prototype-design.md`** — the rules spec. It is kept in sync with the code and is the source of truth for game rules; update it when rules change. Implementation plans live in `docs/superpowers/plans/`.

Code, comments, tests, log lines and UI copy are all in English. The owner expects TDD (red → green → refactor) for engine changes, including number tweaks.

## Commands

Run from `combat-prototype/`:

```
npm run dev              # Vite dev server
npm test                 # vitest run (all tests)
npx vitest run src/game/engine.test.ts -t "Bite"   # one test file / name filter
npm run build            # tsc -b && vite build (type errors fail the build)
npm run lint             # oxlint
```

Node 22 is required by Vite 8. The GitHub Pages workflow (`.github/workflows/main.yml`) runs `npm ci`, `npm test`, `npm run build` from `combat-prototype/` on every push to `main` and deploys `dist/` to https://censacrof.github.io/dievania/. A failing test blocks the deploy.

## Architecture

The prototype is deliberately three files plus tests.

**`src/game/engine.ts` — pure rules, no React.** Every function takes a `GameState` and returns a new one; state is never mutated. All randomness goes through an injected `rng: () => number` (Math.random signature), which is what makes the tests deterministic. The state has three phases:

- `player` — `playerAction(state, action, dieIds, targetId, rng)`: one action (`mace | shield | miracle | skip`) with any number of dice, rolled and summed, resolved immediately. When the hand empties the phase becomes `enemy` and enemy Block resets.
- `enemy` — `enemyStep(state, rng)`: exactly one enemy action per call (the first living enemy with dice left spends its first `nextCount` dice on `nextAction`), or the upkeep that redraws everyone and returns to `player`. The UI calls it on a timer so enemy turns play back step by step.
- `reward` — entered when a non-final fight is cleared; `rollOffers` fills `state.offers`, `chooseReward(state, index | null, dieId, rng)` applies one and calls `loadEncounter` for the next fight.

The board (`state.board`, `state.position`) moves only on the player's rolling actions; cell effects are applied inside `playerAction` right after the roll, and the position is never reset between fights.

Key model facts that span files: the player's dice are a persistent `dice` collection rebuilt into the bag each fight; each `Die` may carry one `enchant` whose effect is per-die even in a multi-die action; `block` expires at the owner's turn start while `sturdyBlock` never does; enemies pick their next action through a Markov chain (`chain[lastAction](ctx)` → weights) and their dice count uniformly at random.

**`src/game/content.ts` — data only.** `PLAYER` (HP, bag, trinket), `ENCOUNTERS` (list of enemy groups), enemy definitions with their chains, and every UI text map (`ACTION_TEXT`, `ENCHANT_TEXT`, `PERK_TEXT`, `OFFER_TEXT`) plus small text helpers. Balance changes go here, not in the engine; the one exception is `OFFER_WEIGHTS` (reward draw odds), which sits in the engine next to `rollOffers`. Content imports only types from the engine, so the circular import is erased at compile time.

**`src/App.tsx` + `App.css` — one component.** Holds `GameState` in `useState`, plus UI-only state (selected action, selected dice, target, pending offer). It never computes rules; it only calls engine functions with `Math.random`. Popovers are CSS-only via `data-tip` attributes. Sprites and icons are served from `public/` by bare relative filename because Vite `base` is `./` (the site lives under `/dievania/`).

## Testing conventions

`src/game/engine.test.ts` uses three helpers you should reuse: `f(face, sides)` gives the rng value that rolls exactly `face`; `q(...values)` returns those rng values in order, then `0` forever; `zero` is `() => 0`. With `zero`, draws take the first die in the bag and weighted picks take the first non-zero option, so `newGame(zero)` is a fully predictable fixture. Tests therefore depend on the **rng consumption order** inside each engine function (player rolls in hand order → per living enemy: rolls, then action pick, then count pick → draws). If you reorder rng calls, expect tests to shift.

`src/App.test.tsx` renders `App` with `renderToStaticMarkup` and the optional `initial` prop — there is no jsdom or testing-library, so UI tests assert on markup and on pure text helpers, not on interaction.

## Gotchas

- oxlint's `rules-of-hooks` flags any function named `use*` called in a callback; don't name event handlers that way.
- Enemy definitions must provide a `chain` entry for every `EnemyAction` (`attack`, `shield`, `bite`) even if the enemy never uses one, because the type is a `Record`.
- Reward cards show their explanation inline, not as a popover: on phones the popover was the only visible feedback and the dice picker was below the fold. Keep it that way.
