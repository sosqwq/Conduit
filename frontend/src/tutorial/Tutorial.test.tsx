import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { TutorialChapter, TutorialIndex } from './Tutorial'

afterEach(cleanup)

function visit(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/tutorial" element={<TutorialIndex />} />
        <Route path="/tutorial/:chapter" element={<TutorialChapter />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('项目教程', () => {
  it('groups the available chapters and links to their stable addresses', () => {
    visit('/tutorial')
    for (const group of ['后端', '前端', '工程']) {
      expect(screen.getByRole('heading', { name: group, level: 2 })).toBeTruthy()
    }
    expect(screen.getByRole('link', { name: /00 项目总览与开发环境/ }).getAttribute('href')).toBe('/tutorial/00')
    expect(screen.getByRole('link', { name: /06 前端骨架与鉴权/ }).getAttribute('href')).toBe('/tutorial/06')
  })

  it('renders the real Markdown, table headers, source paths and highlighted code', () => {
    visit('/tutorial/00')
    const article = screen.getByRole('article')
    expect(within(article).getByRole('heading', { level: 1 }).textContent).toMatch(/项目总览与开发环境/)
    expect(within(article).getByRole('columnheader', { name: '名称' })).toBeTruthy()
    expect(within(article).getByText('docker-compose.yml')).toBeTruthy()
    expect(article.querySelector('pre code.hljs .hljs-keyword')).toBeTruthy()
    expect(within(article).getByRole('heading', { name: '参考答案' })).toBeTruthy()
  })

  it('keeps the sidebar current and navigates to the adjacent chapter', () => {
    visit('/tutorial/00')
    const sidebar = screen.getByRole('navigation', { name: '章节目录' })
    expect(within(sidebar).getByRole('link', { current: 'page' }).textContent).toMatch(/项目总览/)
    const pager = screen.getByRole('navigation', { name: '相邻章节' })
    expect(within(pager).queryByRole('link', { name: /上一章/ })).toBeNull()
    fireEvent.click(within(pager).getByRole('link', { name: /下一章.*注册与登录/ }))
    expect(within(screen.getByRole('article')).getByRole('heading', { level: 1 }).textContent).toMatch(/01 注册与登录/)
    expect(within(sidebar).getByRole('link', { current: 'page' }).getAttribute('href')).toBe('/tutorial/01')
    expect(within(screen.getByRole('navigation', { name: '相邻章节' })).getByRole('link', { name: /上一章.*项目总览/ })).toBeTruthy()
  })

  it('lets the reader recover from an unknown chapter', () => {
    visit('/tutorial/unknown')
    expect(screen.getByRole('heading', { name: '未找到章节' })).toBeTruthy()
    fireEvent.click(screen.getByRole('link', { name: '返回教程目录' }))
    expect(screen.getByRole('heading', { name: '项目教程' })).toBeTruthy()
  })
})
