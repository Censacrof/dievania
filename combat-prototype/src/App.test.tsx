import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import App from './App'
import { type GameState, newGame } from './game/engine'
import { ENCHANT_TEXT, headerText } from './game/content'

const rewardState = (): GameState => ({
  ...newGame(() => 0),
  phase: 'reward',
  offers: [{ kind: 'enchant', enchant: 'sturdy' }, { kind: 'add', sides: 8 }],
})

describe('reward screen', () => {
  it('explains every offer inline on its card, with no hover popover on the card', () => {
    const html = renderToStaticMarkup(<App initial={rewardState()} />)
    expect(html).toContain(ENCHANT_TEXT.sturdy)
    expect(html).not.toMatch(/class="offer[^"]*"[^>]*data-tip=/)
  })

  it('the header tells the player to pick a die once an offer needs one', () => {
    expect(headerText('reward', { kind: 'enchant', enchant: 'sturdy' })).toBe('Pick a die to enchant')
    expect(headerText('reward', null)).toBe('Choose a reward')
    expect(headerText('player', null)).toBe('Your turn')
  })
})

describe('board strip', () => {
  it('renders 24 cells, each explaining itself, with the token on the current cell', () => {
    const html = renderToStaticMarkup(<App initial={{ ...newGame(() => 0), position: 6 }} />)
    expect(html.match(/class="cell /g)).toHaveLength(24)
    expect(html).toContain('Critical: Mace damage is doubled')
    expect(html).toContain('Blank: Nothing happens')
    expect(html).toMatch(/class="cell critical here"/)
  })
})
