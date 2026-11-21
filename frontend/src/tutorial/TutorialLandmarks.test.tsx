import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { App } from '../App'
import { SessionProvider } from '../auth/session'

afterEach(cleanup)

it.each([
  ['/tutorial', '项目教程'],
  ['/tutorial/00', '00 项目总览与开发环境'],
  ['/tutorial/missing', '未找到章节'],
])('has one main landmark at %s', async (path, title) => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <SessionProvider><App /></SessionProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  // The application lazy-loads the tutorial route before rendering its landmarks.
  await act(() => vi.dynamicImportSettled())
  await screen.findByRole('heading', { name: title, level: 1 })
  const landmarks = screen.getAllByRole('main')
  expect(landmarks).toHaveLength(1)
  expect(within(landmarks[0]).getByRole('heading', { name: title, level: 1 })).toBeVisible()
})
