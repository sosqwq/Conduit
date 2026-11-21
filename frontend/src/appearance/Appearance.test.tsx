import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { Appearance } from './Appearance'

const root = document.documentElement

afterEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
})

it('restores a saved skin, previews keyboard selections immediately, and returns focus on Escape', async () => {
  localStorage.setItem('conduit.skin', 'dusk')
  const user = userEvent.setup()
  render(<Appearance />)
  const trigger = screen.getByRole('button', { name: 'Appearance' })
  await user.click(trigger)
  const selected = screen.getByRole('radio', { name: '午夜星图' })
  expect(selected).toBeChecked()
  expect(selected).toHaveFocus()
  await user.keyboard('{ArrowDown}')
  expect(screen.getByRole('radio', { name: '赤陶沙丘' })).toBeChecked()
  expect(root.dataset.skin).toBe('dune')
  expect(localStorage.getItem('conduit.skin')).toBe('dune')
  await user.keyboard('{Escape}')
  expect(trigger).toHaveFocus()
  expect(trigger).toHaveAttribute('aria-expanded', 'false')
})

it('keeps in-page controls and changes from another tab in sync, including storage clearing', async () => {
  const user = userEvent.setup()
  render(<><Appearance /><Appearance /></>)
  const [first, second] = screen.getAllByRole('button', { name: 'Appearance' })
  await user.click(first)
  await user.click(screen.getByRole('radio', { name: '赤陶沙丘' }))
  await user.click(second)
  expect(first).toHaveAttribute('aria-expanded', 'false')
  expect(screen.getByRole('radio', { name: '赤陶沙丘' })).toBeChecked()
  localStorage.setItem('conduit.skin', 'dusk')
  act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'conduit.skin', newValue: 'dusk' })) })
  expect(screen.getByRole('radio', { name: '午夜星图' })).toBeChecked()
  localStorage.clear()
  act(() => { window.dispatchEvent(new StorageEvent('storage', { key: null })) })
  expect(screen.getByRole('radio', { name: '山野手记' })).toBeChecked()
  expect(root.dataset.skin).toBe('grove')
})

it('tracks the OS preference without overwriting the reader’s reduced motion setting', async () => {
  const media = Object.assign(new EventTarget(), { matches: false })
  vi.stubGlobal('matchMedia', () => media)
  const user = userEvent.setup()
  render(<Appearance />)
  await user.click(screen.getByRole('button', { name: 'Appearance' }))
  const toggle = screen.getByRole('checkbox', { name: 'Reduce motion' })
  await user.click(toggle)
  expect(root.dataset.motion).toBe('reduced')
  expect(localStorage.getItem('conduit.reduceMotion')).toBe('true')
  await user.click(toggle)
  expect(root.dataset.motion).toBe('full')
  media.matches = true
  act(() => { media.dispatchEvent(new Event('change')) })
  expect(toggle).toBeChecked()
  expect(toggle).toBeDisabled()
  expect(root.dataset.motion).toBe('reduced')
  media.matches = false
  act(() => { media.dispatchEvent(new Event('change')) })
  expect(toggle).not.toBeChecked()
  expect(toggle).toBeEnabled()
  expect(root.dataset.motion).toBe('full')
})
