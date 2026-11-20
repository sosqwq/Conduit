# 08 个人主页与互动

## 本章做了什么

小周打开小林的主页，先查看小林写过的文章，又切到小林收藏的文章。接着小周关注小林，并在文章摘要旁点了一次收藏。页面需要同时记住三个人的角色：主页的主人、文章作者，以及这次点击按钮的登录用户。即使三个角色碰巧都是同一人，代码仍要分别确定它们。

| 交互 | 浏览器地址或 API | 谁决定显示结果 |
| --- | --- | --- |
| 打开某人的主页 | `/profile/:username` | 地址决定主页主人；令牌决定“我关注此人吗” |
| 打开该用户的收藏页 | `/profile/:username/favorites` | `favorited` 筛选参数取主页主人，每篇的收藏标记取当前查看者 |
| 关注或取消关注 | `/api/profiles/:username/follow` | 当前登录用户与路径中的目标用户构成方向明确的关系 |
| 收藏或取消收藏 | `/api/articles/:slug/favorite` | 当前登录用户与路径中的目标文章构成收藏关系 |

## 用到的技术

**乐观更新。** 点击收藏后，界面先显示请求成功时应有的状态，再等待服务器确认。这段时间内画面代表客户端的预测，数据库才是最终结果。若服务器拒绝或网络中断，要撤回预测，保留错误信息，允许用户重新操作。如果只在成功响应后才改变按钮，代码较简单，读者会在整个网络往返期间看不到交互结果。

**查询缓存与失效。** TanStack Query 按键保存各页最近取得的数据。一个文章详情缓存可以直接写入服务端返回的文章；而“我收藏的文章有哪些”涉及成员资格、排序、分页与总数，只改某行的小图标无法回答整页应该再补入哪篇文章。使查询失效会将旧数据标为需要刷新，让相关视图重新向服务器核对。清除所有键虽然也能重查，却会让完全无关的数据丢失。

**并发与撤回。** 若 A 与 B 两篇文章分别发送收藏请求，一篇成功、一篇失败，那么撤回失败请求时只能移除失败的那次预测。若只保存一整份旧首页，待 A 失败就整页放回，B 已成功的结果也会被抹掉。另一个边界是同一按钮快速重复点击，页面要避免两个在途请求互相颠倒可见状态。

## 代码走读

**先确定查看者身份。** 路径参数选出主页的资料及列表，当前用户则由会话上下文提供。浏览自己的主页时，资料区显示编辑设置的入口；浏览其他作者时才有关注入口。未登录的读者能看到资料和列表，执行需要登录的动作时要进入登录流程。详情缓存本身也用查看者区分同一个 slug，因为两位读者对同一文章可能有不同的收藏状态。

来源：`frontend/src/lib/articles.ts`

```typescript
export function articleKey(slug: string, username: string | null) {
  return ['article', slug, username] as const
}
```

资料查询的键也包含两种身份。`username` 来自路由，确定向后端读取谁的公开资料；`user?.username` 来自已验证的会话，区分这份资料中的个性化标记。成功返回后，组件比较当前用户名与资料中的名字决定入口。标签页复用第 07 章的列表组件，并把作者和收藏者两个参数视作不同的筛选类型。

来源：`frontend/src/pages/ProfilePage.tsx`

```typescript
  const profile = useQuery({
    queryKey: ['profile', username, user?.username ?? null],
    queryFn: ({ signal }) => api<{ profile: Profile }>(`/profiles/${encodeURIComponent(username)}`, {
      signal, token: user ? token : null,
    }),
    enabled: status !== 'loading',
  })
```

**区分页面筛选与按钮状态。** 若地址是 `/profile/lin/favorites`，当前身份却是 zhou，则查询条件应为 `favorited=lin`。小周点击其中某篇的“收藏”，改变的是 zhou 与该文章之间的关系。此时计数会上升，但那篇文章能否继续列在小林的收藏页，仅由小林的关系决定。这个例子解释了为什么不能把路径用户名同时用于写入身份。

**一次点击如何变成预测。** `FavoriteButton` 使用 `useFavorite`，关注按钮使用 `useFollow`，二者共享 `useSocial`。它用 `['social', viewer, kind, target]` 标识一次特定关系，目标可以是文章 slug 或作者用户名。`useMutationState` 让同一关系的不同按钮都能观察最近一次写操作。尚在等待服务器且已拿到本次目标值时，组件显示 `next`。若操作变量暂时缺失，`?? current` 会回退到已经确认的数据；未在等待的按钮也显示 `current`。同一关系已有操作进行时，另一个按钮不会再发一次请求；另一篇文章有自己的键，仍可并行操作。

来源：`frontend/src/lib/social.ts`

```typescript
    active: pending ? latest.next ?? current : current,
    pending,
    toggle,
    errors: latest?.status === 'error' ? errorMessages(latest.error) : [],
```

**预测怎样撤回。** 以已有两次收藏、当前读者尚未收藏的文章为例：点一下后，预测为真，计数临时显示三。程序没有为此先把整个文章页查出的数组写成新值。若请求失败，该操作离开 pending 状态，按钮自然重新读取已确认数据，回到假和二，并显示本次错误。无需拿着旧的整页快照覆盖缓存。若服务器返回的真实总数是六，成功分支会保存服务端提供的六。

来源：`frontend/src/lib/social.ts`

```typescript
export function useFavorite(article: ArticleSummary) {
  const state = useSocial('favorite', article.slug, article.favorited)
  return { ...state, count: Math.max(0, article.favoritesCount + Number(state.active) - Number(article.favorited)) }
}
```

**把确认结果合入哪些位置？** 收藏成功只合并匹配文章的收藏标记和总数；关注成功只合并目标作者的关注标记。于是两个请求分别改变收藏和关注时，其中一个稍晚返回，也不会把另一个已经变更的字段覆盖掉。`applyConfirmation` 限定在本次查看者的查询，维护文章详情、列表和相关作者资料；对于关注还处理评论作者。然后把这个查看者的文章列表标为过期，活动列表可从服务端取回新的成员、总数及分页。写入期间若有较旧的详情读取仍在飞行，也会触发核对。成功回调还检查当前会话的 mutation 是否仍存在，保护已经退出或切换的账号。

来源：`frontend/src/lib/social.ts`

```typescript
    return { ...article, favorited: change.article.favorited, favoritesCount: change.article.favoritesCount }
  }
  if (change.kind === 'follow' && article.author.username === change.profile.username) {
    return { ...article, author: { ...article.author, following: change.profile.following } }
```

**用两个受控响应验证撤回。** 组件测试给两篇文章分别发一次收藏请求，先让第二篇成功，等按钮恢复可用，再让第一篇收到 403。这样测试顺序由代码决定，不依赖机器上哪条请求更快。测试检查两个按钮和缓存的数组，确保失败的那篇恢复原标记，另一篇的成功没有被覆盖。

来源：`frontend/src/lib/social.test.tsx`

```typescript
  finishOne(Response.json({ errors: { article: ['forbidden'] } }, { status: 403 }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'first' })).toHaveTextContent('off 2'))
  expect(screen.getByRole('button', { name: 'second' })).toHaveTextContent('on 3')
  expect(client.getQueryData<ArticleList>(listKey)?.articles.map(a => a.favorited)).toEqual([false, true])
```

## 设计取舍

先在界面预测标记和数字，可以让按钮及时反馈。预测有成本：需要处理服务端拒绝、同一记录从不同组件触发、账号切换，以及旧请求稍晚返回等情况。只针对已经知道的布尔标记与计数做确定的改变，再从服务端核对成员列表，能限制客户端必须复制的业务规则。例如取消收藏后，当前页末尾补进哪篇文章，交给服务端按时间和偏移量计算更可靠。

请求方法也参与了这项设计。关注与收藏各有“建立关系”的 POST 和“取消关系”的 DELETE。客户端在发请求前确定目标状态，后端基于唯一键保证相同操作重复执行仍保持最终状态，这让失败后重试更容易推理。不过请求完成前出现的预测并不能证明写入已经成功，最终仍要观察成功响应或后续读取。

## 常见错误

| 现象 | 怎样定位 |
| --- | --- |
| 看小林的收藏页，页面却显示我收藏过的文章 | 查看列表请求里的 `favorited` 参数。地址用户名决定筛选对象；令牌只描述当前查看者。 |
| 收藏后详情里的数字变了，回到主页又显示旧数字 | 对照各自使用的是详情键还是列表键，确认 mutation 成功后相关缓存收到了更新或失效通知。 |
| 请求失败后另一篇已收藏的文章也恢复原样 | 找出错误分支撤回的数据范围，检查它是否把其他并发操作之前的整个列表快照写了回去。 |
| 用户切换后看见上一个人的“已关注” | 查看查询键和会话切换时的清理逻辑，确认个性化缓存包含查看者维度。 |
| 按钮显示已收藏，刷新后却消失 | 查看 POST 的实际响应和错误展示。刷新重新读取持久状态，可帮助区分临时预测和最终保存结果。 |

## 自测与练习

1. 以 A 身份打开 B 的收藏页，列表筛选参数应是谁？点击某篇文章上的收藏按钮，修改的是谁的关系？
2. 模拟收藏后服务器返回错误，哪些呈现需要恢复？哪一个状态不能被当作已保存的证据？
3. 若同一页对文章甲、乙分别发出请求，为什么不能在甲失败时直接恢复整页旧快照？
4. 为什么更新文章详情缓存，还不足以保证“我的收藏”所有分页都正确？
5. B 取消关注 A 后，除了 B 正在看的 A 的资料，“我的关注”列表为什么也要重新核对？

**动手练习。** 用两个本地临时账号 A、B，先由 A 发布两篇文章。切到 B，打开 A 的主页并关注，从关注流确认这两篇可见。让 B 收藏其中一篇，打开 B 的收藏页，再打开 A 的收藏页，对比两页结果。最后在页面已经显示文章后，在浏览器开发者工具的请求阻止功能中临时只阻止目标文章的 favorite API 请求，点一次收藏或取消收藏。观察请求失败前后的按钮与计数，解除阻止后重试并刷新。记录哪一次界面变化对应数据库真正保存的结果。

### 参考答案

1. 列表按 B 的用户名筛选。收藏按钮作为 A 发起请求，修改 A 与该文章的关系。
2. 本次预测改变的收藏标记和计数应回到请求前的值，并展示失败、允许重试。按钮提前亮起只代表本地预测。
3. 旧快照中可能没有乙已经成功的新状态，整体覆盖会把合法变更抹掉。回滚范围应限制到甲这次改变的状态。
4. 添加或移除一个成员会影响多页的数量、排序及边界。仅更新详情无法知道补位的文章，也无法改变另一个查询的总数。
5. 关注流筛选条件对每位作者判断关系是否存在。取消关注后 A 写的文章应从 B 的关注流移除，结果总数也可能变化。

练习预期：B 的关注流能读到 A 的文章；B 收藏的那篇能出现在 B 的收藏页，A 的收藏列表不因 B 的操作而增加。写请求被阻止并返回错误后，界面最终恢复；重新联网并操作成功后，刷新还能看到已保存的状态。
