import { useEffect, useRef, type ComponentProps } from 'react'
import { Link, useParams } from 'react-router-dom'
import Markdown from 'react-markdown'
import type { ExtraProps } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { chapters, groups } from './catalog'
import { TutorialCode } from './TutorialCode'
import './tutorial.css'

function Paragraph({ node, children }: ComponentProps<'p'> & ExtraProps) {
  const first = node?.children[0]
  const source = first?.type === 'text' && first.value.trim() === '来源：'
  return <p className={source ? 'tutorial-source' : undefined}>{children}</p>
}

export function TutorialIndex() {
  return (
    <main className="tutorial-page tutorial-index" lang="zh-CN">
      <header className="tutorial-intro">
        <h1>项目教程</h1>
        <p>第一次阅读可以从第 00 章开始，或按技术方向选择章节。</p>
      </header>
      {groups.map((group) => {
        const entries = chapters.filter((item) => item.group === group)
        if (entries.length === 0) return null
        return (
          <section className="tutorial-group" key={group}>
            <h2>{group}</h2>
            <ul>
              {entries.map((item) => (
                <li key={item.id}>
                  <Link to={`/tutorial/${item.id}`}>{item.id} {item.title}</Link>
                  <p>{item.summary}</p>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </main>
  )
}

export function TutorialChapter() {
  const { chapter: id } = useParams()
  const index = chapters.findIndex((item) => item.id === id)
  const current = chapters[index]
  const previous = chapters[index - 1]
  const next = index >= 0 ? chapters[index + 1] : undefined
  const article = useRef<HTMLElement>(null)
  const lastId = useRef(id)

  useEffect(() => {
    if (lastId.current !== id) {
      article.current?.focus({ preventScroll: true })
      document.documentElement.scrollTop = 0
      lastId.current = id
    }
  }, [id])

  if (!current) {
    return (
      <main className="tutorial-page" lang="zh-CN">
        <h1>未找到章节</h1>
        <Link to="/tutorial">返回教程目录</Link>
      </main>
    )
  }

  return (
    <main className="tutorial-page tutorial-reader" lang="zh-CN">
      <nav className="tutorial-side" aria-label="章节目录">
        <Link className="tutorial-index-link" to="/tutorial">教程目录</Link>
        <ol>
          {chapters.map((item) => (
            <li key={item.id}>
              <Link to={`/tutorial/${item.id}`} aria-current={item.id === id ? 'page' : undefined}>
                {item.id} {item.title}
              </Link>
            </li>
          ))}
        </ol>
      </nav>
      <div className="tutorial-body">
        <article className="tutorial-prose" ref={article} tabIndex={-1}>
          <Markdown remarkPlugins={[remarkGfm]} components={{ code: TutorialCode, p: Paragraph }}>
            {current.markdown}
          </Markdown>
        </article>
        <nav className="tutorial-pager" aria-label="相邻章节">
          {previous && <Link to={`/tutorial/${previous.id}`}>上一章 · {previous.title}</Link>}
          {next && <Link to={`/tutorial/${next.id}`}>下一章 · {next.title}</Link>}
        </nav>
      </div>
    </main>
  )
}
