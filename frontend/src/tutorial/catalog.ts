export const groups = ['后端', '前端', '工程'] as const
type Group = (typeof groups)[number]

interface ChapterInfo {
  group: Group
  summary: string
}

const descriptions: Record<string, ChapterInfo> = {
  '00': { group: '工程', summary: '从一次健康检查认识开发环境、数据库迁移与持续集成。' },
  '01': { group: '后端', summary: '跟踪注册、密码验证、令牌签发和当前账户的读取。' },
  '02': { group: '后端', summary: '用两个用户的请求理解有方向的关注关系与可选登录。' },
  '03': { group: '后端', summary: '追踪文章从创建到删除的事务、地址变化和标签顺序。' },
  '04': { group: '后端', summary: '观察筛选、分页与信息流如何用固定次数的查询组成一页文章。' },
  '05': { group: '后端', summary: '核对评论归属、并发收藏和删除文章后的级联清理。' },
  '06': { group: '前端', summary: '从浏览器路由走到登录表单，理解会话恢复与教程页面。' },
  '07': { group: '前端', summary: '连接首页、文章详情与编辑器，追踪请求缓存和表单状态。' },
  '08': { group: '前端', summary: '在个人主页上串起关注、收藏、乐观更新与缓存失效。' },
  '09': { group: '工程', summary: '从容器构建到生产配置，检查公开入口与服务间连接。' },
}

export interface Chapter extends ChapterInfo {
  id: string
  title: string
  markdown: string
}

const sources = import.meta.glob<string>('./chapters/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
})

export const chapters: Chapter[] = Object.entries(sources).map(([path, markdown]) => {
  const heading = /^# (\d{2}) ([^\r\n]+)/.exec(markdown)
  if (!heading || !path.startsWith(`./chapters/${heading[1]}-`) || !descriptions[heading[1]]) {
    throw new Error(`无法识别教程章节 ${path}`)
  }
  const [, id, title] = heading
  return { id, title, markdown, ...descriptions[id] }
}).sort((a, b) => a.id.localeCompare(b.id))
