# 07 首页与文章

## 本章做了什么

从标签 `Java API` 的第二页点开一篇文章，浏览器先显示文章摘要，再从详情接口加载整篇 Markdown。登录作者可以进入编辑器改标题；保存后，详情页要能用新地址打开。登录读者还可以在同一页发表评论，并删除自己的留言。这条路径把前几章的 API 连成了真实界面。

| 用户动作 | 浏览器地址 | 关键的数据变化 |
| --- | --- | --- |
| 浏览全站列表 | `/` 或 `/?page=2` | 按页取得文章摘要与总数 |
| 切换到关注流或标签 | `/?feed=following`、`/tag/Java%20API` | 换查询范围，切换标签后从第一页开始 |
| 阅读和评论 | `/article/:slug` | 独立读取文章详情和评论列表 |
| 新建文章 | `/editor` | 提交 POST，成功后导航到服务器返回的 slug |
| 编辑已有文章 | `/editor/:slug` | 先取得现有正文，使用旧 slug 提交 PUT；之后使用响应中的地址 |

## 用到的技术

**URL 状态。** 页号、当前标签、信息流类型属于地址的一部分。浏览器后退、前进和刷新都会恢复同一个地址。如果只把页号放在按钮组件的局部变量里，复制链接给别人时就丢掉了位置。URL 中读到的是字符串，客户端仍要校验页号，并换算为后端认识的 offset 和 limit。

**TanStack Query。** 它管理来自服务器的数据：一条查询有代表内容的键（query key）和获取数据的函数（query function）。组件声明自己对哪个键感兴趣，库会订阅结果、记录加载或失败状态，并在相同键之间复用缓存。若为每个组件手写 fetch，需要自行协调乱序响应、重试、缓存以及数据变更后的刷新。

**表单草稿与提交。** 编辑器中的文字暂时只属于当前页面，服务器上的文章才是已保存的版本。提交前，前端读取标题、摘要、正文和有序标签；失败时让输入继续留在表单中，成功时再把响应写入查询缓存并导航。若只依赖每次服务器读取的数据填表，一个正在编辑的草稿可能被后续读取结果覆盖。

**Markdown。** 文章正文是一段带有排版标记的文本，例如 `**重点**`。保存时仍发送原文，详情页读取后才生成加粗、标题和列表等界面元素。使用 Markdown 组件可把语法转换为 React 节点，同时避免把作者输入当作可执行的页面代码。

## 代码走读

**先算出要向服务器读取哪一页。** `/tag/Java%20API?page=2` 里的标签经过路径解码得到 `Java API`，页号为 2，页面每次取 10 篇。后端从 0 计数，所以对应 `offset=(2-1)×10=10`。下面的组件测试把浏览器请求解析为 URL，再检查参数；测试不依赖查询字符串中参数的排列顺序。

来源：`frontend/src/pages/HomePage.test.tsx`

```typescript
  expect(calls[0].searchParams.get('tag')).toBe('Java API')
  expect(calls[0].searchParams.get('offset')).toBe('10')
  expect(calls[0].searchParams.get('limit')).toBe('10')
```

列表组件把查看者、筛选对象以及页号都写进查询键。TanStack Query 可以区分“全站第 2 页”“同一用户关注流第 2 页”和“游客打开同一标签第 1 页”。`queryFn` 用当前页生成 API 地址，再将库传入的取消信号交给 fetch。`enabled` 让列表先等浏览器恢复身份，再用这次访问对应的查询键读取文章，避免先展示匿名卡片、随后又清空列表。账户验证因服务中断而失败时，访客仍能浏览公开列表；关注流则需要已登录的用户。

来源：`frontend/src/components/ArticleList.tsx`

```typescript
  const articles = useQuery({
    queryKey: ['articles', user?.username ?? null, filter, page],
    queryFn: ({ signal }) => api<ArticleListResponse>(articlesPath(filter, page), { signal, token: user ? token : null }),
    enabled: status !== 'loading' && (filter.kind !== 'following' || !!user),
  })
```

当总数为 23 时，分页控件可从 `Math.ceil(23/10)` 得到三页。切换到全站列表会改变地址并重置分页，按浏览器后退又回到原来的标签第二页。在首页渲染每篇摘要时不需要正文；点击文章链接后，由详情页请求带 `body` 的完整文章。只有查询成功并且结果为空时，才应告诉读者“没有文章”。网络失败时应显示可重试的错误。

**编辑器决定写入哪个资源。** 新建模式没有旧 slug，点击发布需要 POST。编辑模式的 slug 是读取和提交时定位当前文章的地址。标签输入框按 Enter 时完成一个标签，去掉首尾空格和重复项，保留输入顺序；这个回车不能顺便触发整份文章表单提交。把现有标签全部移除后，明确提交空数组，才能传达清除关联的意图。

下面是编辑器处理回车的地方。`isComposing` 表示输入法还在组合候选文字，此时程序先让输入法处理键盘事件，避免中文标签刚选到一半就被加进列表。其余回车才阻止默认提交，清理文本并追加到标签数组；数组状态更新后，React 重新显示标签及其移除按钮。

来源：`frontend/src/pages/EditorPage.tsx`

```typescript
  function addTag(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
    event.preventDefault()
    const name = tagInput.trim()
    if (name && !tags.includes(name)) setTags([...tags, name])
    setTagInput('')
  }
```

**保存后跟随服务端的地址。** 文章标题变化可能使 slug 改变。下面的测试用事先设置好的响应确认界面最终停在新地址，PUT 却确实发往旧文章。它还检查删除旧地址的详情缓存、保存新详情缓存。这样浏览器不会继续拿原来的链接作为编辑成功后的目标。

来源：`frontend/src/pages/EditorPage.test.tsx`

```typescript
  expect(await screen.findByText('/article/new-1')).toBeVisible()
  const [url, options] = network.mock.calls[1]
  expect(String(url)).toBe('/api/articles/old-1')
  expect(options?.method).toBe('PUT')
  expect(JSON.parse(String(options?.body)).article.tagList).toEqual([])
  expect(client.getQueryData(['article', 'old-1', 'writer'])).toBeUndefined()
  expect(client.getQueryData(['article', 'new-1', 'writer'])).toEqual(revised)
```

**阅读与评论。** 当前文章的作者信息决定是否展示改文或删文入口。评论则比较每条评论自己的作者，与文章作者分开。访问者可以直接阅读，登录用户发送 `POST /api/articles/:slug/comments`，正文包装为 `comment.body`。删除一条评论需带上文章 slug 与评论 ID。每条评论都是数据库记录，列表重新渲染时要用稳定的 ID 标识元素，否则删除中间那条可能让其他评论复用到错误的界面状态。

文章详情组件用 `react-markdown`、`remarkGfm` 和 `skipHtml` 渲染正文，最后才挂载 `Comments`。评论组件把 slug、查看者与评论数据绑定到一个查询键。评论提交成功后，先取消这个键上的未完成读取，阻止较旧的列表覆盖新结果；再将服务器返回的评论放到数组开头，按 ID 消除重复。最后才清空草稿。若请求失败，没有执行这些成功分支，读者可以保留文字并重试。

来源：`frontend/src/pages/Comments.tsx`

```typescript
    post.mutate(draft, { onSuccess: async ({ comment }) => {
      await client.cancelQueries({ queryKey: key, exact: true })
      client.setQueryData<Comment[]>(key, previous => [comment, ...(previous ?? []).filter(item => item.id !== comment.id)])
      setDraft('')
    } })
```

再看详情页的组件测试。它给客户端一篇同时含有加粗 Markdown 和嵌入 HTML 的文章，验证普通 Markdown 可以产生加粗节点，而 HTML 标签没有成为页面中的原始元素。测试也核对图片回退、资料链接和标签链接，这些都属于读者进入其他页面的真实入口。

来源：`frontend/src/pages/ArticlePage.test.tsx`

```typescript
    expect(screen.getByText('Markdown').tagName).toBe('STRONG')
    expect(container.querySelector('.article-content b')).toBeNull()
    expect(screen.getByRole('link', { name: 'notes' })).toHaveAttribute('href', '/tag/notes')
```

## 设计取舍

以 URL 为筛选条件的来源，分页就能支持深链接与浏览器历史，不必另存一份“当前活动标签”。以查看者身份作为缓存维度，则能隔离同一篇文章对不同用户展示的收藏和关注状态。完整令牌是凭证，缓存键只需能区分查看者，不需要复制令牌内容。

摘要与详情采用不同的数据形状。若把首页的摘要直接当作完整文章发送给编辑器，正文会是空白，用户保存时甚至可能覆盖真实内容。编辑页必须等待完整数据，再区分“文章不存在”“读取失败”和“稿件尚未保存”。改名或删文后，还需要让受影响的列表重新获取服务器状态。

## 常见错误

| 现象 | 从哪里排查 |
| --- | --- |
| 第二页又显示第一批文章 | 核对浏览器的页号，以及实际 GET 请求里的 offset 是否等于 `(page-1)×10`；再看查询键是否包含页码。 |
| 标签中的空格或其他字符让路由出错 | 打开网络面板检查解码后的标签参数；组装路径时需要编码用户提供的片段，不能直接拼入任意字符。 |
| 编辑已有文章时表单为空 | 确认编辑路由能读到 slug，其 GET 响应含有正文。列表摘要只提供标题和摘要。 |
| 改标题成功却到达旧文章的 404 | 对比 PUT 请求的旧地址与响应的 `article.slug`。成功导航应采用服务器返回的值。 |
| 发文失败后显示成功页面，或标签还没加完就提交 | 检查成功导航时机以及标签输入框回车的默认行为；失败提示和输入中的草稿应留在表单。 |

## 自测与练习

1. 地址是 `/tag/java?page=3`，页面每次取十篇。应向后端发送哪个标签、limit 和 offset？
2. 为什么两个不同登录用户浏览同一项查询，查询缓存仍应区分查看者？
3. 首页列表项没有正文，编辑器能不能把它当作完整的初始文章？应从哪个地址取数据？
4. 改标题时，为什么提交地址与成功后导航的地址需要取自不同来源？
5. 发表或删除评论后，只凭按钮状态变化能否确认服务器保存了结果？怎样独立核对？

**动手练习。** 登录后创建一篇文章，正文里写一段加粗文字，按顺序添加两个标签并发布。从详情页进入编辑器，改成另一个标题、移除一个标签，再保存。随后发一条评论，刷新页面确认该评论存在并尝试删除。这次特意保留浏览器网络记录，区分创建请求、更新请求、详情读取与评论写入，核对每次操作后的地址和响应。

### 参考答案

1. `tag=java`、`limit=10`、`offset=20`。第三页从排序结果中的第 21 篇开始，用从零开始的偏移量表达。
2. `favorited`、作者的 `following` 以及个人信息流都依赖查看者。复用另一个账号的缓存会把个性化结果显示给错误的人。
3. 不能。通过 `GET /api/articles/:slug` 读取完整文章，待成功后再初始化表单的正文和标签。
4. 提交必须定位仍然存在的旧资源，成功响应才包含服务端最终分配的新 slug。前端自行推导会遗漏重名、归一化与后缀规则。
5. 按钮恢复只能说明提交过程结束。应使用同一个文章 slug 发 GET 评论列表，核对新评论 ID 是否存在或被删除，再区分服务端状态与本地缓存。

练习预期：首次提交是 POST，第二次提交是发往旧 slug 的 PUT，之后详情页使用响应中的新地址。Markdown 正文在编辑器中保留原始标记，在详情中呈现出加粗效果。刷新后只剩一个标签，评论按照自己的 ID 创建并可删除。
