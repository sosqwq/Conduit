# 项目一：Conduit 博客平台 — 规格与 AI 提示词

> **用法**：把本文件保存为仓库里的 `docs/SPEC.md`，然后把"提示词 1"发给 AI 编程工具。第 1 到 6 节是给 AI 的规格；第 7 节起是给你自己看的提示词、检查清单和学习方法。
>
> 本项目不加任何 AI 功能，目的是打好全栈基础。

## 1. 项目概览与技术栈

做一个遵循 RealWorld 规范的博客平台 Conduit：后端 Spring Boot，前端 React + TypeScript，数据库 PostgreSQL。前端除博客本身外，还内置一个教程板块，逐章讲解本项目的代码和用到的技术。

选它是因为规范公开且固定：官方仓库 [realworld-apps/realworld](https://github.com/realworld-apps/realworld) 自带 API 规范、API 测试套件和统一的前端样式，写完后有客观标准验收，也有上百份别人的实现可以对照。

| 层 | 选型 | 备注 |
| --- | --- | --- |
| 语言 | Java 25（LTS） | Spring Boot 4 最低要求 Java 17 |
| 后端 | Spring Boot 4.x：Web MVC、Security、Data JPA、Validation | 在 start.spring.io 选默认的稳定版 |
| 数据库 | PostgreSQL + Flyway | 表结构全部写成迁移脚本，关闭 Hibernate 自动建表 |
| 鉴权 | JWT + BCrypt | 无状态，不用 Session |
| 后端测试 | JUnit 5、Spring Boot Test、Testcontainers | 集成测试连真实 PostgreSQL，不用 H2 |
| 前端 | React、TypeScript、Vite、React Router、TanStack Query、react-markdown | 样式直接用官方仓库的 `assets/theme/styles.css` |
| 前端测试 | Vitest、React Testing Library、Playwright | Playwright 运行官方 E2E 测试集 |
| 工程 | Maven、Docker Compose、GitHub Actions | 每次 push 自动跑全部测试 |

仓库用单仓结构：

```
conduit/
├── backend/             Spring Boot 应用
├── frontend/            React 应用；教程章节在 src/tutorial/chapters/
├── docs/                SPEC.md、DESIGN.md
├── docker-compose.yml   本地 PostgreSQL
└── .github/workflows/   CI
```

后端按功能分包（`user`、`profile`、`article`、`comment`、`tag`），每个包内是 controller → service → repository 三层。鉴权和统一错误处理放在 `common` 包。

## 2. 功能范围

Conduit 是一个类 Medium 的多用户博客，博客部分的功能边界由 RealWorld 规范固定，不要自行增减；教程板块是本项目额外加的，见第 5 节。

| 模块 | 必须做的功能 |
| --- | --- |
| 账号 | 注册、登录、查看和修改当前用户；JWT 鉴权 |
| 个人主页 | 查看任意用户的资料；关注、取消关注 |
| 文章 | 创建、查看、修改、删除；由标题生成 slug；每篇可带多个标签 |
| 文章列表 | 全站列表按标签、作者、收藏者过滤并分页；"我的关注"信息流 |
| 评论 | 发表、列出、删除自己的评论 |
| 收藏 | 收藏、取消收藏文章；显示收藏数 |
| 标签 | 列出全部标签 |

前端共 9 个页面：首页（全站 / 我的关注 / 按标签）、登录、注册、设置、文章编辑器、文章详情、个人主页，以及教程目录页和教程章节页。

明确不做，留给后面的项目：邮箱验证和找回密码、第三方登录、图片上传（头像只存 URL）、富文本编辑器（正文存 Markdown 文本）、缓存和消息队列、微服务拆分。

## 3. 数据模型

共 7 张表：4 张实体表加 3 张多对多关联表。实体表用自增 `bigint` 主键，并带 `created_at` 和 `updated_at`。

| 表 | 主要字段 | 约束与关系 |
| --- | --- | --- |
| `users` | `email`、`username`、`password_hash`、`bio`、`image` | `email` 和 `username` 各自唯一 |
| `articles` | `slug`、`title`、`description`、`body`、`author_id` | `slug` 唯一；`author_id` 外键到 `users`；`created_at` 建索引 |
| `comments` | `body`、`author_id`、`article_id` | 外键到 `users` 和 `articles`；删文章时级联删评论 |
| `tags` | `name` | `name` 唯一 |
| `follows` | `follower_id`、`followee_id` | 联合主键；用户对用户的多对多 |
| `favorites` | `user_id`、`article_id` | 联合主键；用户对文章的多对多 |
| `article_tags` | `article_id`、`tag_id` | 联合主键；文章对标签的多对多 |

这个模型里有 3 个值得让 AI 解释取舍的设计点，面试也常问：

1. `favoritesCount` 是每次实时 `COUNT`，还是在 `articles` 上存一个冗余计数列。
2. 文章列表要同时返回作者、标签、"我是否已收藏"，怎样避免 N+1 查询。
3. 改标题时 slug 要跟着变，标题重名时 slug 怎么保证唯一。

## 4. API 列表

共 19 个接口，字段和返回格式以[官方接口规范](https://docs.realworld.show/specifications/backend/endpoints/)为准。需要登录的接口带请求头 `Authorization: Token <jwt>`。

| # | 方法 | 路径 | 登录 | 作用 |
| --- | --- | --- | --- | --- |
| 1 | POST | `/api/users/login` | 否 | 登录 |
| 2 | POST | `/api/users` | 否 | 注册 |
| 3 | GET | `/api/user` | 是 | 获取当前用户 |
| 4 | PUT | `/api/user` | 是 | 修改当前用户 |
| 5 | GET | `/api/profiles/:username` | 可选 | 查看用户资料 |
| 6 | POST | `/api/profiles/:username/follow` | 是 | 关注 |
| 7 | DELETE | `/api/profiles/:username/follow` | 是 | 取消关注 |
| 8 | GET | `/api/articles` | 可选 | 文章列表，新的在前；可按 `tag`、`author`、`favorited` 过滤；`limit` 默认 20，`offset` 默认 0 |
| 9 | GET | `/api/articles/feed` | 是 | 我关注的作者的文章；同样的 `limit` 和 `offset` |
| 10 | GET | `/api/articles/:slug` | 否 | 单篇文章 |
| 11 | POST | `/api/articles` | 是 | 创建文章；`title`、`description`、`body` 必填，`tagList` 可选 |
| 12 | PUT | `/api/articles/:slug` | 是 | 修改文章；标题变则 slug 跟着变 |
| 13 | DELETE | `/api/articles/:slug` | 是 | 删除文章 |
| 14 | POST | `/api/articles/:slug/comments` | 是 | 发表评论 |
| 15 | GET | `/api/articles/:slug/comments` | 可选 | 评论列表 |
| 16 | DELETE | `/api/articles/:slug/comments/:id` | 是 | 删除评论 |
| 17 | POST | `/api/articles/:slug/favorite` | 是 | 收藏 |
| 18 | DELETE | `/api/articles/:slug/favorite` | 是 | 取消收藏 |
| 19 | GET | `/api/tags` | 否 | 标签列表 |

错误处理按[官方规范](https://docs.realworld.show/specifications/backend/error-handling/)：未登录返回 401，无权限 403，资源不存在 404，校验失败 422。422 的响应体按字段列出错误：

```json
{ "errors": { "email": ["is invalid"] } }
```

后端的验收标准是官方 [Hurl 测试集](https://docs.realworld.show/specifications/backend/hurl/)全部通过。测试文件在官方仓库的 `specs/api/hurl`，用 `specs/api/run-api-tests-hurl.sh` 运行。

## 5. 教程页面

前端内置一个教程板块，逐章详细讲解本项目的代码和用到的技术，这是你学习这个项目的主要材料。它不需要登录，导航栏上有固定入口。

| 路由 | 页面 | 内容 |
| --- | --- | --- |
| `/tutorial` | 教程目录 | 按后端、前端、工程分组列出全部章节，每章一句话简介 |
| `/tutorial/:chapter` | 教程章节 | 侧边章节目录、正文、代码高亮、上一章和下一章 |

章节用 Markdown 编写，放在 `frontend/src/tutorial/chapters/`，构建时打包进前端，不经过后端和数据库。教程和代码在同一个仓库里，代码改了，对应章节在同一个 commit 里更新。仓库里有一个检查脚本，逐个核对教程中的代码片段是否与所标注的源文件一致，并纳入 CI。

每一章固定包含六个部分：

1. **本章做了什么。** 实现的功能，对应哪些接口或页面。
2. **用到的技术。** 本章新出现的每项技术是什么、解决什么问题、不用它要怎么手写。
3. **代码走读。** 沿一次请求的完整路径讲，配仓库里的真实代码片段，并标注文件路径。
4. **设计取舍。** 为什么这样写，放弃了哪些看起来更简单的写法。
5. **常见错误。** 最容易写错的地方，报错长什么样，怎么排查。
6. **自测与练习。** 五道自测题和一个动手练习，答案单独放在章末。

写法要求：读者会 Java、了解数据结构，但第一次接触 Spring Boot 和 React。章节用中文写，术语第一次出现时用一两句话解释，详细到读者不看源码也能复述这部分是怎么工作的。

章节与里程碑一一对应，共 10 章：

| 章 | 标题 | 里程碑 | 重点技术 |
| --- | --- | --- | --- |
| 00 | 项目总览与开发环境 | M0 | 系统架构、Maven、Docker Compose、Flyway、GitHub Actions |
| 01 | 注册与登录 | M1 | Spring MVC、参数校验、Spring Security 过滤器链、JWT、BCrypt |
| 02 | 资料与关注 | M2 | JPA 实体与关联、多对多自关联、可选登录 |
| 03 | 文章增删改查 | M3 | 事务、DTO 映射、slug、权限校验 |
| 04 | 文章列表与信息流 | M4 | 动态查询、分页、N+1 问题及其解法 |
| 05 | 评论与收藏 | M5 | 级联删除、幂等接口、用 Hurl 做接口验收 |
| 06 | 前端骨架与鉴权 | M6 | Vite、React 组件与 Hooks、React Router、登录态管理、教程页面自身的实现 |
| 07 | 首页与文章 | M7 | TanStack Query、表单、Markdown 渲染 |
| 08 | 个人主页与互动 | M8 | 乐观更新、缓存失效 |
| 09 | 部署上线 | M9 | Dockerfile、环境变量与生产配置、CORS |

M0 到 M5 期间前端还不存在，这几章先以 Markdown 文件写好，到 M6 教程页面建成后一并呈现。

## 6. 里程碑与自动验收

项目拆成 10 个里程碑，由 AI 按顺序一口气做完，不需要你逐个检查：每个里程碑通过下面的自动验收后直接进入下一个，并同时交付对应的一章教程。10 个里程碑全部完成、项目完整可用之后，你再按教程逐章学习。

| # | 里程碑 | 内容 | 完成标准 |
| --- | --- | --- | --- |
| M0 | 项目骨架 | 单仓目录、Docker Compose 起 PostgreSQL、Flyway 首个迁移、健康检查接口、CI、教程代码片段检查脚本 | 本地一条命令跑通测试；CI 通过 |
| M1 | 注册与登录 | 接口 1–4；BCrypt、JWT 签发与校验、Security 过滤器、统一错误格式 | 接口 1–4 的集成测试通过 |
| M2 | 资料与关注 | 接口 5–7；用户自关联多对多 | 接口 5–7 的集成测试通过 |
| M3 | 文章增删改查 | 接口 10–13、19；slug 生成、标签、只有作者能改和删 | 对应集成测试通过 |
| M4 | 文章列表与信息流 | 接口 8–9；过滤、分页、消除 N+1 查询 | 测试通过；列表接口的 SQL 条数不随文章数增长 |
| M5 | 评论与收藏 | 接口 14–18 | 官方 Hurl 测试集全部通过 |
| M6 | 前端骨架与鉴权 | Vite 项目、路由、API 客户端、登录页、注册页、设置页、教程页面框架 | 能注册和登录；刷新页面后仍保持登录；教程页面能读到已写好的各章 |
| M7 | 首页与文章 | 首页三种列表和分页、文章详情、编辑器、评论区 | 能发文、改文、删文、评论 |
| M8 | 个人主页与互动 | 个人主页、收藏列表、关注和收藏按钮 | [前端路由规范](https://docs.realworld.show/specifications/frontend/routing/)的全部路由可用；官方 Playwright E2E 测试集全部通过 |
| M9 | 上线 | 后端 Dockerfile、生产配置、部署、README | 公网地址可访问；README 写明本地运行方法 |

按每周 10–15 小时估算，生成加学习合计约需 5–7 周。这是粗略估计，其中生成只占一小部分，大部分时间应花在学习和重写上。

### 自动验收

你不需要审查代码，质量由下面 6 项自动检查把关。AI 在每个里程碑结束时运行当时适用的全部检查，全部通过才能继续。

| 检查 | 通过标准 | 适用范围 |
| --- | --- | --- |
| 后端测试 | 单元测试和集成测试全部通过 | M0 起 |
| 官方接口测试 | 官方 Hurl 测试集对本地后端运行；已完成接口对应的部分通过，M5 起全部通过 | M1 起 |
| 前端检查 | 类型检查、Lint、前端测试全部通过，生产构建成功 | M6 起 |
| 官方端到端测试 | 官方 [Playwright E2E 测试集](https://docs.realworld.show/specifications/frontend/tests/)（`specs/e2e`）对本地前后端运行；已完成页面对应的部分通过，M8 起全部通过 | M6 起 |
| 教程片段检查 | 脚本逐个核对教程里的代码片段，确认与所标注的源文件一致 | M0 起 |
| CI | 以上各项在 GitHub Actions 上全部通过 | M0 起 |

为了让官方 E2E 测试能运行，前端的表单字段名、CSS 类名、按钮文字和路由必须遵守官方仓库的 `specs/e2e/SELECTORS.md`。博客部分的界面文字以该文件为准，教程章节用中文写。

两条硬规则：不许为了通过检查而删除、跳过或弱化测试；不许修改官方测试集。

---

## 7. 给 AI 的提示词

共 5 条提示词，需要一个能直接读写仓库、并能自己执行命令（跑测试、启动 Docker）的 AI 编程工具，例如 Claude Code。提示词 1 到 3 用来建成项目，全程不需要你检查代码。提示词 4 和 5 是你之后学习时用的。

### 提示词 1：一口气完成整个项目

只用一次。AI 会从设计开始，连续做完 10 个里程碑和 10 章教程，中途不向你提问。

```text
你要独立完成整个项目，中途不需要我检查或确认。先完整阅读 docs/SPEC.md、RealWorld 官方规范（https://docs.realworld.show）和官方仓库（https://github.com/realworld-apps/realworld）。如果无法访问这些网址，先告诉我。

我的情况：会 Java，了解数据结构，做过一个很小的全栈项目，第一次接触 Spring Boot 和 React，还没有能力审查大量代码。所以质量必须靠自动检查保证，不能靠我看。

开始前，把下面"工作方式"的全文原样保存为 docs/WORKFLOW.md。

工作方式：
1. 先写 docs/DESIGN.md：后端包结构和各层职责、完整建表 SQL、JWT 鉴权流程、教程板块的实现方案。favoritesCount 的计算方式、文章列表如何避免 N+1、slug 如何保证唯一，这三个设计点各写出两种方案、利弊和你的选择。
2. 在 M0 中把官方仓库的 specs/api 和 specs/e2e 测试集接入本项目，并写好一键运行全部检查的脚本。
3. 按 M0 到 M9 的顺序逐个完成里程碑。每个里程碑内的步骤固定：
   a. 先写测试，再写实现。后端用集成测试覆盖每个接口：成功路径、未登录、无权限、校验失败。
   b. 小步提交：每个 commit 只做一件事，commit message 写明做了什么、为什么。
   c. 运行 SPEC.md"自动验收"小节中适用于本里程碑的全部检查，全部通过才算完成。
   d. 按 SPEC.md"教程页面"一节写本里程碑对应的教程章节。代码片段从仓库当前代码复制，并标注文件路径。
   e. 打 git 标签（m0 到 m9），并在 docs/PROGRESS.md 记录：各项检查的结果、本里程碑做出的重要决定。
   f. 直接开始下一个里程碑，不要等我确认。
4. SPEC.md 没说清楚的地方不要停下来问我：以 RealWorld 规范为准；规范也没说的，选最常规的做法，把决定和理由记进 docs/DESIGN.md 的"决定记录"。
5. 不引入 SPEC.md 技术栈之外的依赖，除非没有它就无法完成；引入时同样记进"决定记录"。
6. 不许为了让检查通过而删除、跳过或弱化测试，不许修改官方测试集。
7. 某项检查连续修复三次仍不通过时停下来，在 docs/PROGRESS.md 写明卡在哪里、试过什么、你的判断，然后结束本次工作。
8. 全部完成后从零验收一遍：清空数据库，重新构建，运行全部检查，把命令和结果写进 docs/ACCEPTANCE.md。最后给我一份简短总结，以及在本地启动和查看项目的步骤。
```

如果你已经用过 Spring Boot 或 React，把"我的情况"那一段改成实际情况。

### 提示词 2：中断后继续

长时间运行可能中途停下，例如会话过长或网络中断。这时新开一个会话，用这一条接着做，可以重复使用。

```text
继续完成这个项目。先读 docs/WORKFLOW.md、docs/SPEC.md、docs/DESIGN.md 和 docs/PROGRESS.md，再运行现有的全部检查，确认当前状态。然后从第一个未完成的里程碑接着做，严格按 docs/WORKFLOW.md 的工作方式，直到 M9 完成并写出 docs/ACCEPTANCE.md。
```

### 提示词 3：独立验收

项目完成后，新开一个会话用一次。它代替你做代码审查：让一个没有参与开发的 AI 重新验证全部结论，并核对教程有没有讲错。

```text
你是独立验收人，没有参与这个项目的开发。不要相信 docs/PROGRESS.md 和 docs/ACCEPTANCE.md 里的结论，全部自己重新验证。

1. 按 README 从零启动项目，运行 docs/SPEC.md"自动验收"小节的全部检查，记录每一项的实际结果。
2. 对照 RealWorld 规范逐个核对 19 个接口和全部前端路由，找出不符合规范的地方。
3. 检查测试本身：有没有被跳过、被弱化，或者断言空洞的测试。
4. 逐章检查教程：代码片段是否与仓库一致；讲解是否与代码的实际行为一致；有没有讲错或含糊带过的技术点。
5. 把问题按严重程度写进 docs/REVIEW.md，每个问题给出位置和证据。
6. 然后修复这些问题。每个修复都要有对应的测试或检查，修完重新运行全部检查。无法确定怎么修的，留在 REVIEW.md 里并标明"待定"。
```

### 你要亲自做的检查

下面 4 件事不需要读懂代码，每件的结果只有"是"或"否"：

1. `docs/PROGRESS.md` 里 10 个里程碑都标记为完成，`docs/ACCEPTANCE.md` 里每项检查都是通过。
2. GitHub 上最新一次 CI 是绿色。
3. 按 README 在本地启动项目，亲手走一遍：注册、发文章、评论、收藏、关注，再把教程页面的 10 章逐章点开。
4. 提示词 3 生成的 `docs/REVIEW.md` 里没有未解决的严重问题。

### 提示词 4：重写时的陪练

你自己重写时用。它的作用是防止 AI 直接把答案给你。

```text
我要自己重写里程碑 M{N} 的实现。测试保留，实现代码我已经删掉。

你的角色是陪练，规则：
1. 不要给我完整代码。我卡住时，先问我一个引导性的问题；我仍然卡住，再给一句提示；最多给到三行以内的代码片段。
2. 我贴报错时，先让我说出自己的猜测，再告诉我对不对。
3. 不要替我修改任何文件。
```

### 提示词 5：审查你的重写

重写通过测试后用。

```text
我重写了里程碑 M{N}，代码在分支 rewrite/M{N} 上。请对比标签 m{N} 上你原来的实现，做一次严格的代码审查：
1. 正确性问题和遗漏的边界情况，按严重程度排序。
2. 我的写法和你的写法有哪些实质差别，各自的利弊。我的写法更好的地方请直说。
3. 不要直接改代码，只指出问题和方向。
4. 最后给出三个面试官可能就这段代码追问的问题。
```

## 8. 你的学习循环

项目全部完成后，按教程的章节顺序学习，每章走一遍下面 5 步。应用里的教程页面是主要学习材料，第 3 步"删掉重写"用来检验是否真的学会。

1. **阅读。** 在应用的教程页面读这一章，同时对照该里程碑的 commit 看 diff。读完先自己答章末的五道自测题。
2. **画图。** 合上教程和代码，手画这一章的请求流程和涉及的表。画不出来就回到第 1 步。
3. **重写。** 从标签 `m{N}` 新建分支 `rewrite/M{N}`，保留测试，删掉这个里程碑的实现代码，自己写到测试通过。期间只用提示词 4。
4. **对照。** 用提示词 5 让 AI 审查，再自己用 `git diff m{N}` 逐处看差异。
5. **加料。** 不让 AI 写代码，自己加一个规范之外的小功能，并为它写测试。

每个里程碑完成时都打了标签，所以第 3 步可以回到当时的代码状态，不受后面里程碑的影响。后端按功能分包，删实现也很干净：例如重写 M2 时，从标签 `m2` 切出分支，删掉 `src/main` 下的 `profile` 包，保留 `src/test` 下对应的测试。

第 5 步可以加的功能举例：M1 加"修改密码需要验证旧密码"，M3 加文章草稿状态，M4 加按标题关键字搜索，M5 加评论分页。

根据重写时的感受调整节奏：

- 重写时几乎不用回看原实现：后面同类的章节可以跳过第 3 步，直接做第 5 步。
- 重写时一半以上要回看：说明第 1、2 步做得不够，下一章放慢。

## 9. 参考仓库与资料

规范和测试以官方仓库为准；其余仓库只用来对照写法，不要照抄。

| 资料 | 用途 | 备注 |
| --- | --- | --- |
| [realworld-apps/realworld](https://github.com/realworld-apps/realworld) | API 规范和测试集（`specs/api`）、端到端测试集（`specs/e2e`）、前端样式（`assets/theme/styles.css`） | 验收以它为准 |
| [RealWorld 文档](https://docs.realworld.show/introduction) | 接口、错误格式、前端路由和页面模板的说明 | 提示词 1 会让 AI 读它 |
| [raeperd/realworld-springboot-java](https://github.com/raeperd/realworld-springboot-java) | Spring Security + Spring Data JPA 的后端实现 | 用 Gradle；分 domain、infrastructure、application 三层，与本项目的按功能分包不同，适合对比 |
| [yurisldk/realworld-react-fsd](https://github.com/yurisldk/realworld-react-fsd) | React 19 + TypeScript + React Router + TanStack Query 的前端实现 | 打包用 Webpack，不是 Vite |
| [alan2207/bulletproof-react](https://github.com/alan2207/bulletproof-react) | React 项目目录组织的参考 | 不是 RealWorld 实现 |
| [CodebaseShow](https://codebase.show/projects/realworld) | 浏览其他语言和框架的 RealWorld 实现 | |
