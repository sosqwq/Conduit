# Conduit 独立验收

验收日期为 2026-11-20。下列结果来自新检出的源码、空 PostgreSQL、实际 HTTP 响应、Chromium 页面和 GitHub Actions。评判依据是 [项目规格](SPEC.md)、[RealWorld 接口](https://docs.realworld.show/specifications/backend/endpoints/)、[路由](https://docs.realworld.show/specifications/frontend/routing/)及固定的[上游提交](https://github.com/realworld-apps/realworld/tree/4248dbe042138a357578c15a655a38c12abba353)。

**结论。** 19 个接口、博客路由及 10 章教程均已核验。审查发现的三个当前版本问题已修复。未能从独立外网地址验证长期运行的全栈网站，M9 的公网可访问条件待定。

## 按严重程度排列的发现

| 程度与状态 | 位置与原始证据 | 修复或复查 |
| --- | --- | --- |
| 高 · 待定 | SPEC §6 M9 要求公网地址可访问。生产 Compose 只绑定主机回环地址。README 中的 localhost 和示例域名无法证明访问者能在公网使用本项目。 | 本地生产配置解析和 CI 的真实容器验证见下表。仍需一个可管理的持久化运行环境与真实入口，再从外网验证 HTTPS、教程、注册、发文、重启后读回。 |
| 中 · 已修复 | `UserForms.Registration` 接受无法用于资料路径的用户名。在独立空库注册 `Lin/Chen…` 或 `.` 得 201，紧接着按编码后的 `/api/profiles/:username` 读取均得 400。 | 现在注册和显式改名对无法寻址的名字返回 422，错误归属 username。回归验证了旧账号仍能登录改名，中文、空格与可寻址标点也能正常使用。见 `UserProfileNameTest` 与第 01 章。[修复 72aecff](https://github.com/sosqwq/Conduit/commit/72aecff)。 |
| 中 · 已修复 | `HomePage.tsx`、`ArticlePage.tsx` 直接把标签用于路径。文章保存 `.`、`..`、`100%2F` 后，从浏览器点击分别出现无页面、全站列表、错误的 `100/` 空列表。正常的 `C/C++` 可访问。 | 首页、详情和标签页签共用可逆地址。独立点路径段和百分号改用查询参数，旧百分号路径仅解码一次。新测试覆盖点击、分页与重载，独立 Chromium 复查通过。参见 [131ccf6](https://github.com/sosqwq/Conduit/commit/131ccf6)。 |
| 中 · 已修复 | 章节检查与教程 E2E 都从磁盘推导预期清单。在修复前的归档中删除 09，脚本照样退出 0，并报告 55 段通过。 | 源码检查器和浏览器验收均已固定 00–09 的期望清单。在独立归档中删掉 05，复制 06 以维持十个文件，检查退出 1 并显示重复与遗漏。真实浏览器也需见到全部十个编号。参见 [1b4034f](https://github.com/sosqwq/Conduit/commit/1b4034f)。 |
| 低 · 测试时序 | 固定上游的 `settings.spec.ts:258–263` 在第二次保存收到响应头后立即读取同步调试快照。有一次观察到第一次简介，原生重试通过。应用在 `api.ts` 读完响应正文后才向会话发布已确认用户。 | 官方原文件单跑 `settings.spec.ts:225 --repeat-each=10 --retries=0`，连续十次通过。修复版 CI 首次通过。另用 `./scripts/check-api.sh --e2e --retries=0 --reporter=line` 完整重跑，140/140 首次通过，零跳过。保留原断言与应用的保存确认顺序。 |
| 低 · 历史记录 | SPEC §5 要求在同一提交同步源码与教材。独立检出 `48828ff` 执行当时的片段检查，第 08 章第 54 行与 `social.ts` 不一致。 | 后续 `8a7d418` 同步了该段，第 08 章当前可读且通过逐行核对。已发布提交的先后顺序仍是一次流程偏差。 |

## 从零执行的检查

首轮源码树 `4e7332b7e50f` 与远端 `f899ed3` 相同。最后对功能树 `9b2e7e3d27f7` 新建检出，重建前端依赖、生产静态包与后端 JAR。原生 PostgreSQL 由独立的 `initdb` 初始化，未沿用开发数据、上轮文章或已有用户。另检出同一修复合入第 07 章补充说明后的公开提交 [131ccf6](https://github.com/sosqwq/Conduit/commit/131ccf612775206d3839b31b2159527fc7be58b0)（源码树 `823e246fe116`），单独重跑片段核验和前端生产构建。再用真实浏览器直达 00–09，逐页核对六节标题、当前侧栏项、前后章链接，并读到第 07 章新加入的百分号示例。两棵树只差第 07 章的一段说明。依赖下载缓存可复用。进入新检出后，依照 README 的无 Docker 分支设置 `CONDUIT_TEST_DB_URL`、`CONDUIT_TEST_DB_USERNAME` 和 `CONDUIT_TEST_DB_PASSWORD`，运行 `./scripts/check.sh`。本机无 Docker daemon，真实 Docker 路径单独在 GitHub 的 Ubuntu 运行器核对。

| 检查 | 观察到的结果 |
| --- | --- |
| 脚本与教材 | 9 项 Python 自测通过。10 章共 61 个片段均与标注文件中的连续完整行相同。 |
| 上游来源 | 从 GitHub Git Trees API 重新获取上游提交的完整递归目录树，确认未截断。将上游列出的路径、Git blob ID 与本地文件集合及 `git hash-object` 结果比较。179 个 API 文件、22 个 E2E 文件、许可证和两份视觉资源共 204 个文件全部一致。 |
| 后端 | `mvn -B -ntp -f backend/pom.xml clean verify` 跑过 45 项，失败 0，错误 0，跳过 0。实际连接 PostgreSQL。Flyway 从空模式建表，校验七张业务表、唯一约束及删除级联。 |
| 官方 API | 13/13 份原始 Hurl 文件，157 次 HTTP 请求全部通过。每份的捕获变量来自前序真实响应。另开一套空库，通过独立客户端以作者、读者和游客完成下表全部 19 项。 |
| 前端 | `npm ci`、TypeScript、ESLint、Vitest、Vite 生产构建成功。60 项组件和客户端测试通过。 |
| 官方浏览器 | Chromium 从真实生产静态包访问临时后端。默认配置的官方套件发现 140 项。139 项首次通过，1 项重试通过（Playwright 记作 flaky），零跳过。额外一轮明确禁用重试，140/140 首次通过。项目自有 4 项浏览器检查均通过。另以零重试重复验证的结果见下文。 |
| 查询次数 | 1 篇与 8 篇不同作者文章分别触发同样的 JDBC 执行次数。匿名筛选页为 3/3，登录筛选页与登录关注流均为 4/4。比较时还逐项断言作者关系、标签、收藏数和实际页长。 |
| 生产与 CI | README 的密钥初始化成功，Compose 配置可解析。修复版 GitHub Actions 第 6、7 步均成功，官方浏览器日志为 140 passed，自有为 4 passed。第 7 步构建真实镜像，检查页面、静态资源与同源 API。移除并重建三个容器后，以原有令牌、密码和文章 slug 复查持久化（22:27:25 UTC）。[修复版完整日志](https://github.com/sosqwq/Conduit/actions/runs/44828375382/job/136606696745#step:7:1)。[首轮容器日志](https://github.com/sosqwq/Conduit/actions/runs/44827225498/job/136602774549#step:7:1)。 |

前两次整轮运行均为 139 项通过、1 项外部健康检查失败。我的验收命令覆盖了本机工具链提供的出口代理，导致官方 `health.spec.ts` 对演示站 `/api/tags` 的真实只读请求遇到 DNS 错误。最后一轮保留 [官方测试运行说明](../scripts/official.md)中的 `CONDUIT_E2E_HEALTH_PROXY` 配置。测试文件、目标站点及断言均按上游原文执行。

## 逐项对照 19 个接口

所有路径以 `/api` 开头。表中操作通过 HTTP 执行，错误状态与字段格式同时对照官方 Hurl、相应的 JUnit 集成测试。以下按 SPEC 的编号排列。

| # | 方法与相对路径 | 核实的行为 |
| --- | --- | --- |
| 1 | POST `/users/login` | 正确邮箱和密码返回用户与令牌，可读取当前账号。错密码 401。 |
| 2 | POST `/users` | 新账号返回 201，个人资料和令牌齐全。字段不合法 422，重复用户名或邮箱按固定上游测试返回 409。 |
| 3 | GET `/user` | 含 Token 时读到本人邮箱、用户名等五个约定字段，匿名或坏令牌 401。 |
| 4 | PUT `/user` | 更新简介，之后公开资料可读。省略与显式清空字段分别保留和清除。 |
| 5 | GET `/profiles/:username` | 游客读资料时 following 为 false，作者公开字段不泄露邮箱，缺失用户 404。 |
| 6 | POST `/profiles/:username/follow` | 读者关注作者后 following 为 true，信息流随之包含作者文章。重复调用只留下一个关系。 |
| 7 | DELETE `/profiles/:username/follow` | 响应的 following 变为 false，再读关注流为空。匿名写入 401。 |
| 8 | GET `/articles` | 按 tag、author、favorited 过滤，可组合。时间倒序、分页总数、默认 20/0 和摘要中省略 body 与实现一致。 |
| 9 | GET `/articles/feed` | 登录后仅见所关注作者文章，支持翻页，游客 401。 |
| 10 | GET `/articles/:slug` | 游客能读完整正文、标签和公开作者。旧 slug 在改名后 404。 |
| 11 | POST `/articles` | 作者提交必填字段后收到 201 与独立 slug。允许重名，标签按提交顺序持久化。 |
| 12 | PUT `/articles/:slug` | 改标题得到新 slug。其他用户 403。未提交 tagList 保留，空数组清除，null 返回 422。 |
| 13 | DELETE `/articles/:slug` | 非作者 403，作者 204，随后 GET 404。数据库保留作者和共享标签。 |
| 14 | POST `/articles/:slug/comments` | 读者可在作者文章下留言，201 返回评论 ID，空正文 422，匿名 401。 |
| 15 | GET `/articles/:slug/comments` | 游客取得刚写入的评论和作者，存在且无评论时返回空数组，缺失文章 404。 |
| 16 | DELETE `/articles/:slug/comments/:id` | 文章作者删除他人的评论得 403，评论作者得 204。评论必须属于 URL 中的文章。 |
| 17 | POST `/articles/:slug/favorite` | 收藏后计数为 1，按该读者筛选可读回。并发重复请求仍只有一行关系。 |
| 18 | DELETE `/articles/:slug/favorite` | 取消收藏后计数回到 0、关系消失，重复请求保持最终状态。 |
| 19 | GET `/tags` | 游客读取公开标签数组，包含刚写入的唯一标签名。 |

## 浏览器路由

| 路由 | 检查 |
| --- | --- |
| `/`、`/?feed=following`、`/tag/:tag`、`/tag?tag=…`、`?page=N` | 全站流、仅关注的人、按标签筛选、分页和直达后刷新。匿名访问受保护的关注流转到登录。 |
| `/register`、`/login`、`/settings` | 注册和登录通过页面完成，刷新后能恢复身份，设置可改资料并退出。 |
| `/editor`、`/editor/:slug`、`/article/:slug` | 从表单发布、改名、回读 Markdown、提交和删除评论、删除文章。非作者无编辑控件。 |
| `/profile/:username`、`/profile/:username/favorites` | 公开资料、本人设置链接、作者与收藏列表，用两个浏览器身份完成关注与收藏再撤销。 |
| `/tutorial`、`/tutorial/:chapter` | 游客可经固定导航入口访问分组目录、00–09 全部章节、侧栏和相邻章节。窄屏直达、代码高亮、有专门的未知章节提示。 |

## 检查测试本身

上游文件还可以用以下命令复查。分别比较 API 与 E2E 的 Git 树，可以同时核对路径和内容。

```sh
git clone --quiet --no-checkout https://github.com/realworld-apps/realworld.git ../conduit-upstream-audit
upstream=4248dbe042138a357578c15a655a38c12abba353
for part in specs/api specs/e2e; do
  test "$(git -C ../conduit-upstream-audit rev-parse "$upstream:$part")" = "$(git rev-parse "HEAD:scripts/official-specs/$part")" || exit 1
done
```

最终入口 `check.sh → check-api.sh --milestone m9` 执行完整 Hurl。`e2e-cases.sh` 在 M9 返回空选择器，Playwright 发现上游目录中的全部 140 项。运行器显式使用 `TEST_MODE=spa`，上游按能力设置的条件跳过均未触发。扫描自有测试与配置未发现停用测试或把失败当通过的选项。TanStack 测试中的 `skipToken` 是控制缓存查询的 API。登录、权限、分页和数据库行为均有会因响应错误而失败的断言。

有三处需要正确解读测试范围。

- 上游 `health.spec.ts:17` 检查官方演示服务。项目本地健康查询由 `BootstrapTest`、Vite 同源请求以及生产容器检查另行验证。
- 上游 `error-handling.spec.ts` 和 `user-fetch-errors.spec.ts` 写死了拦截地址。项目 fixture 仅替换这两份文件的 `page.route` 匹配前缀，保留原 handler、取消、放行、响应和 expect。Hurl 与跨账号浏览器操作直接走本地真实后端。
- 上游 `comments.spec.ts:132` 等分支只在已有相应元素时检查。对此，项目 `ArticlePage.test.tsx` 使用固定他人评论并断言按钮归属，`CommentApiTest` 带两个身份验证 403 与存储结果。上游 `xss-security.spec.ts:199` 等也有依页面内容而定的分支，官方绿色结果不代表这些分支每次都进入。这项审查未把它计作全面安全审计。

## 逐章核对教材

逐篇检查六节内容、五道自测、一个练习和章末五条答案。把实质性讲解与列出的代码、SQL、浏览器或容器行为核对，源码片段另做精确行比对。

| 章 | 片段数 | 逐章核对的解释与代码 |
| --- | ---: | --- |
| 00 | 5 | `HealthController` 确实查询 PostgreSQL，`BootstrapTest` 另查迁移历史和七张表。`server.port=0` 使用实际分配的 HTTP 端口。 |
| 01 | 6 | `TokenFilter` 校验令牌及用户存在性，`TokenService` 以固定主键为主体并设七天有效期。BCrypt 密码与更新空值语义对应服务方法，修复后的用户名约束已写明。 |
| 02 | 6 | `User.followedUsers` 从 follower 指向 followee，联合主键和写入冲突处理让重复关注幂等。可选身份只改变当前查看者相关字段。 |
| 03 | 9 | `nextval` 先取号、`@PrePersist` 生成 slug。改标题检查归属并更新地址，标签关联按 position 恢复原顺序。 |
| 04 | 7 | 仓储按参数组合筛选，服务在同一读快照中取总数、摘要和本页标签。实测的 3/4 条 SQL 验证文中所述的往返次数。 |
| 05 | 6 | 评论删除同时核对文章、评论和作者。收藏使用关系表及实时聚合，删除文章由声明的外键级联。Hurl 的读回断言对应数据库可见状态。 |
| 06 | 4 | 登录表单、`api.ts`、会话恢复以及 Vite 打包的 Markdown 可沿同一条路径追踪。未登录仍可读教程。 |
| 07 | 6 | URL 页码换算 offset，编辑器按返回 slug 导航，正文由 react-markdown 渲染。评论提交失败保留草稿，成功后合并缓存。 |
| 08 | 6 | 乐观状态属于当前查看者及当前目标，失败只撤回本操作。确认后仅合并相关字段，并使相应列表重新取数，跨账号浏览器场景能读回后端状态。 |
| 09 | 6 | 构建阶段与运行镜像分开，Nginx 对前端深链接回退、对 API 同源代理。卷与签名密钥在替换容器后复用。章中区分主机探针与真正外网验收。 |
