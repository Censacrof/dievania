import { useEffect, useState } from 'react'
import { type Die, type GameState, type PlayerAction, alive, chooseReward, describeOffer, enemyStep, newGame, offerAccepts, offerNeedsDie, playerAction } from './game/engine'
import { ACTION_TEXT, CELL_NAME, CELL_TEXT, ENCHANT_TEXT, ENCOUNTERS, PERK_TEXT, PLAYER, headerText, offerTip } from './game/content'
import './App.css'

const ACTIONS: PlayerAction[] = ['mace', 'shield', 'miracle', 'skip']
/** equipment icons under public/; Skip has none */
const ICONS: Partial<Record<PlayerAction, string>> = { mace: 'mace.png', shield: 'shield.png', miracle: 'reliq.png' }
const ENEMY_STEP_MS = 900
const label = (d: Die) => `d${d.sides}${d.enchant ? `·${d.enchant}` : ''}`
const list = (dice: Die[]) => (dice.length ? dice.map(label).join(' ') : '—')
const Bar = ({ value, max }: { value: number; max: number }) => (
  <span className="bar"><span style={{ width: `${(100 * value) / max}%` }} /></span>
)

export default function App({ initial }: { initial?: GameState } = {}) {
  const [game, setGame] = useState(() => initial ?? newGame(Math.random))
  const [action, setAction] = useState<PlayerAction | null>(null)
  const [picked, setPicked] = useState<number | null>(null)
  const [pendingOffer, setPendingOffer] = useState<number | null>(null)
  const [selected, setSelected] = useState<number[]>([])

  const living = game.enemies.filter(alive)
  const targetId = living.some(e => e.id === picked) ? picked! : living[0]?.id
  const playing = game.status === 'playing' && game.phase === 'player'
  const rewarding = game.status === 'playing' && game.phase === 'reward'
  const offer = pendingOffer !== null ? game.offers[pendingOffer] : null

  // An offer that needs a die: bring the dice picker into view (it sits below the fold on phones)
  useEffect(() => {
    if (pendingOffer !== null) document.querySelector('.hand')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [pendingOffer])

  // Enemy turn plays back one action at a time
  useEffect(() => {
    if (game.status !== 'playing' || game.phase !== 'enemy') return
    const t = setTimeout(() => setGame(g => enemyStep(g, Math.random)), ENEMY_STEP_MS)
    return () => clearTimeout(t)
  }, [game])

  const toggleDie = (dieId: number) => setSelected(sel => (sel.includes(dieId) ? sel.filter(id => id !== dieId) : [...sel, dieId]))
  const confirm = () => {
    if (!action || selected.length === 0) return
    setGame(playerAction(game, action, selected, targetId, Math.random))
    setSelected([])
  }
  const chooseAction = (a: PlayerAction) => { setAction(a); if (a !== action) setSelected([]) }
  const takeReward = (index: number | null, dieId?: number) => {
    setGame(chooseReward(game, index, dieId, Math.random))
    setPendingOffer(null)
  }
  const pickOffer = (index: number) => (offerNeedsDie(game.offers[index]) ? setPendingOffer(index) : takeReward(index))
  const restart = () => { setGame(newGame(Math.random)); setAction(null); setPicked(null); setPendingOffer(null); setSelected([]) }


  return (
    <main>
      <header>
        <span>Encounter {game.encounter + 1}/{ENCOUNTERS.length}</span>
        <strong>{headerText(game.phase, offer)}</strong>
      </header>

      {rewarding ? (
        <section className="rewards">
          {game.offers.map((o, i) => (
            <button key={i} className={`offer ${pendingOffer === i ? 'selected' : ''}`} onClick={() => pickOffer(i)}>
              <strong>{o.kind === 'perk' ? o.perk : o.kind}</strong>
              <span>{describeOffer(o)}</span>
              <small>{offerTip(o)}</small>
            </button>
          ))}
          <button className="offer skip" onClick={() => takeReward(null)}>
            <strong>Skip</strong>
            <span>Keep your bag as it is</span>
            <small>Take no reward. A small bag stays predictable.</small>
          </button>
        </section>
      ) : (
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
              <Bar value={e.hp} max={e.maxHp} />
              <span className="enemy-hand">
                {e.hand.map((d, i) => <em key={d.id} className={i < e.nextCount ? 'next' : ''}>d{d.sides}</em>)}
              </span>
              {alive(e) && e.hand.length > 0 && (
                <span className={`next-action ${e.nextAction}`}>
                  Next: {e.nextAction} with {e.hand.slice(0, e.nextCount).map(d => `d${d.sides}`).join(' + ')}
                </span>
              )}
              <small>Bag: {list(e.bag)} · Discard: {list(e.discard)}</small>
            </button>
          ))}
        </section>
      )}

      <section className={`player ${playing ? 'active' : ''}`}>
        <img src={PLAYER.sprite} alt="" />
        <div className="player-info">
          <strong>{PLAYER.name}</strong>
          <span>HP {game.hp}/{game.maxHp} · Block {game.block}{game.sturdyBlock ? ` (+${game.sturdyBlock} sturdy)` : ''}</span>
          <Bar value={game.hp} max={game.maxHp} />
          <div className="board">
            {game.board.map((cell, i) => (
              <span
                key={i}
                className={`cell ${cell}${i === game.position ? ' here' : ''}`}
                data-tip={`${i}. ${CELL_NAME[cell]}: ${CELL_TEXT[cell]}`}
                tabIndex={0}
              >
                {i === game.position ? <img src={PLAYER.sprite} alt="" /> : cell === 'blank' ? '' : CELL_NAME[cell][0]}
              </span>
            ))}
          </div>
          {rewarding ? (
            <>
              <div className="hand">
                {game.dice.map(d => (
                  <button
                    key={d.id}
                    className="die"
                    data-tip={d.enchant && ENCHANT_TEXT[d.enchant]}
                    disabled={!offer || !offerAccepts(offer, d)}
                    onClick={() => takeReward(pendingOffer, d.id)}
                  >
                    <strong>d{d.sides}</strong>
                    {d.enchant && <small>{d.enchant}</small>}
                  </button>
                ))}
              </div>
              <div className="actions">
                <small>{offer ? `Pick a die to ${offer.kind}` : 'Your dice collection'}</small>
                {offer && <button className="action" onClick={() => setPendingOffer(null)}>Cancel</button>}
              </div>
            </>
          ) : (
            <>
              <div className="hand">
                {game.hand.map(d => (
                  <button
                    key={d.id}
                    className={`die ${action ?? ''} ${selected.includes(d.id) ? 'selected' : ''}`}
                    data-tip={d.enchant && ENCHANT_TEXT[d.enchant]}
                    disabled={!playing || !action}
                    onClick={() => toggleDie(d.id)}
                  >
                    <strong>d{d.sides}</strong>
                    {d.enchant && <small>{d.enchant}</small>}
                  </button>
                ))}
                <button className="confirm" disabled={!playing || !action || selected.length === 0} onClick={confirm}>Confirm</button>
              </div>
              <div className="actions">
                {ACTIONS.map(a => (
                  <button key={a} className={`action ${a} ${action === a ? 'selected' : ''}`} data-tip={ACTION_TEXT[a]} disabled={!playing} onClick={() => chooseAction(a)}>
                    {ICONS[a] && <img src={ICONS[a]} alt="" />}
                    <span>{a}</span>
                  </button>
                ))}
                <small>{!playing ? 'Wait for the enemies' : action ? `Pick dice to ${action}, then confirm` : 'Pick an action, then your dice'}</small>
              </div>
              <small>Bag: {list(game.bag)} · Discard: {list(game.discard)}</small>
            </>
          )}
          <span className="trinket" data-tip={PLAYER.trinket.text} tabIndex={0}>
            <img src={PLAYER.trinket.sprite} alt="" />
            <strong>{PLAYER.trinket.name}</strong>
          </span>
          <small>
            Hand size {game.handSize}
            {game.perks.map(p => <span key={p} className="perk" data-tip={PERK_TEXT[p]} tabIndex={0}> · {p}</span>)}
          </small>
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
