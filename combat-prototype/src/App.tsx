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
