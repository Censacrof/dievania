import { useState } from 'react'
import { type Allocation, type Die, type Enemy, type Slot, alive, enemyAllocation, newGame, resolveTurn } from './game/engine'
import './App.css'

const SLOTS: Slot[] = ['mace', 'shield', 'miracle']
const nextSlot = (slot?: Slot): Slot => (slot ? SLOTS[(SLOTS.indexOf(slot) + 1) % SLOTS.length] : SLOTS[0])
const list = (dice: Die[]) => (dice.length ? dice.map(d => `d${d.sides}`).join(' ') : '—')

function Intent({ enemy }: { enemy: Enemy }) {
  const a = enemyAllocation(enemy)
  const move = enemy.moves[enemy.move]
  return (
    <div className="intent">
      <strong>{enemy.move}</strong>
      {a.attack.length > 0 && <span className="atk">{list(a.attack)} → Attack</span>}
      {a.shield.length > 0 && <span className="shd">{list(a.shield)} → Shield</span>}
      {move.lifesteal && <span className="drain">drains damage dealt</span>}
    </div>
  )
}

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
        <span>Encounter {game.encounter + 1}/3</span>
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
            {alive(e) && <Intent enemy={e} />}
            <small>Bag: {list(e.bag)} · Discard: {list(e.discard)}</small>
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
      <small>Bag: {list(game.bag)} · Discard: {list(game.discard)}</small>

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
