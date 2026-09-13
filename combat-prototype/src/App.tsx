import { useEffect, useState } from 'react'
import { type Die, type PlayerAction, alive, enemyStep, newGame, playerAction } from './game/engine'
import { PLAYER } from './game/content'
import './App.css'

const ACTIONS: PlayerAction[] = ['mace', 'shield', 'miracle', 'skip']
const ENEMY_STEP_MS = 900
const list = (dice: Die[]) => (dice.length ? dice.map(d => `d${d.sides}`).join(' ') : '—')

export default function App() {
  const [game, setGame] = useState(() => newGame(Math.random))
  const [action, setAction] = useState<PlayerAction | null>(null)
  const [picked, setPicked] = useState<number | null>(null)

  const living = game.enemies.filter(alive)
  const targetId = living.some(e => e.id === picked) ? picked! : living[0]?.id
  const playing = game.status === 'playing' && game.phase === 'player'

  // Enemy turn plays back one action at a time
  useEffect(() => {
    if (game.status !== 'playing' || game.phase !== 'enemy') return
    const t = setTimeout(() => setGame(g => enemyStep(g, Math.random)), ENEMY_STEP_MS)
    return () => clearTimeout(t)
  }, [game])

  const spendDie = (dieId: number) => {
    if (!action) return
    setGame(playerAction(game, action, dieId, targetId, Math.random))
  }
  const restart = () => { setGame(newGame(Math.random)); setAction(null); setPicked(null) }

  return (
    <main>
      <header>
        <span>Encounter {game.encounter + 1}/3</span>
        <strong>{game.phase === 'player' ? 'Your turn' : 'Enemy turn'}</strong>
      </header>

      <section className="enemies">
        {game.enemies.map(e => (
          <button
            key={e.id}
            className={`enemy ${e.id === targetId ? 'target' : ''} ${alive(e) ? '' : 'dead'}`}
            disabled={!alive(e)}
            onClick={() => setPicked(e.id)}
          >
            <img src={e.sprite} alt="" />
            <strong>{e.name}</strong>
            <span>HP {e.hp}/{e.maxHp} · Block {e.block}</span>
            <span className="enemy-hand">
              {e.hand.map((d, i) => <em key={d.id} className={i === 0 ? 'next' : ''}>d{d.sides}</em>)}
            </span>
            {alive(e) && e.hand.length > 0 && <span className={`next-action ${e.nextAction}`}>Next: {e.nextAction} with d{e.hand[0].sides}</span>}
            <small>Bag: {list(e.bag)} · Discard: {list(e.discard)}</small>
          </button>
        ))}
      </section>

      <section className={`player ${playing ? 'active' : ''}`}>
        <img src={PLAYER.sprite} alt="" />
        <div className="player-info">
          <strong>{PLAYER.name}</strong>
          <span>HP {game.hp}/{game.maxHp} · Block {game.block}</span>
          <div className="hand">
            {game.hand.map(d => (
              <button key={d.id} className={`die ${action ?? ''}`} disabled={!playing || !action} onClick={() => spendDie(d.id)}>
                <strong>d{d.sides}</strong>
              </button>
            ))}
          </div>
          <div className="actions">
            {ACTIONS.map(a => (
              <button key={a} className={`action ${a} ${action === a ? 'selected' : ''}`} disabled={!playing} onClick={() => setAction(a)}>
                {a}
              </button>
            ))}
            <small>{!playing ? 'Wait for the enemies' : action ? `Pick a die to ${action}` : 'Pick an action, then a die'}</small>
          </div>
          <small>Bag: {list(game.bag)} · Discard: {list(game.discard)}</small>
        </div>
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
