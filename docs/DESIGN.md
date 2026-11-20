# Conduit 设计

本文描述 M0 的数据库以及 M1–M9 的实现计划。实际验收进度记在 [PROGRESS.md](PROGRESS.md)。

## 一次请求由谁处理

浏览器按地址交给 React Router 选择页面。博客页面通过一个 API 客户端发送 JSON，请求路径统一以 `/api` 开头。Spring MVC 将 URL 映射到 controller。controller 负责参数校验、状态码和响应包装，例如 `{"article": …}`。service 代表一次业务操作，在事务内组合读取、权限判断和写入。repository 只访问 PostgreSQL。DTO（数据传输对象）明确列出可返回的字段，避免序列化实体时泄露密码哈希或意外访问关联表。

| 包（位于 dev.conduit） | 职责 |
| --- | --- |
| common | 健康探针；后续加入 Spring Security、JWT 以及统一异常映射 |
| user | 注册、登录和账户设置；管理密码哈希和公开标识 |
| profile | 按用户名查资料、操作关注关系，将当前查看者纳入 following 计算 |
| article | 文章、slug、分页和收藏；按场景返回详情或摘要 |
| comment | 依据文章和评论两个标识定位评论，核对作者身份 |
| tag | 标签去重以及公共标签列表 |

## 数据库与并发

把所有表变更追加为 Flyway 迁移。Hibernate 只校验已映射的实体，业务写入在 service 事务内完成。关系表用联合主键约束重复请求。删除文章时数据库级联清理评论、文章标签关联和收藏记录。标签关联另存零起始位置，以恢复用户提交的标签顺序。

### 收藏数

方案一在文章表存计数，读取只取一列，但并发收藏、取消以及修复历史数据都需要维护两处状态。方案二按 favorites 表实时计数，写入只维护一处事实，成本是读时统计。采用方案二。单篇按 article_id 索引计数；列表可在一条集合查询里对本页标识统计，收藏者过滤则检索用户与文章的配对。

### 列表与 N+1

逐条访问每篇文章的延迟加载关联容易实现，但每加一篇可能多发若干条 SQL。集合查询可先计算符合筛选条件的总数，再对文章分页、投影作者及收藏/关注状态，最后按本页文章标识一次性取标签。采用后一方案。筛选用 EXISTS 避免多个关联把同一文章放大为多行，排序由 created_at 和 id 共同决定。空页也必须返回过滤后总数。M4 将比较同一查询在每页 1 篇和多篇时的 SQL 条数。

### 标题与 slug

原始标题归一化为可读的地址段。可以从无后缀开始尝试，遇到重复再加序号，代价是热门标题出现并发冲突时要重试。也可以把数据库分配的唯一文章 ID 作为固定后缀，读者仍能看出标题，多个同名请求也能独立完成。计划采用固定后缀，在事务内从 identity 的序列取得 ID，使用该值写入主键和 slug；标题不含可用字符时以 article 为前缀。改标题只重算前缀，保留该文章的 ID；仅改正文时保留完整 slug。数据库唯一索引承担最终校验。

## JWT 与用户身份

注册时校验输入、归一化邮箱，在数据库唯一约束下创建用户。BCrypt 带盐哈希只用于验证密码。登录成功后签发带用户 ID、签发时间与到期时间的 JWT，签名密钥由部署环境提供。客户端保存 token，API 客户端按规范发送 `Authorization: Token <jwt>`。Security 过滤器验证签名、有效期和用户存在性，再把身份放入本次请求的安全上下文。服务器不使用会话。公开读取可匿名执行，此时 following 和 favorited 为 false。服务层将已验证的用户 ID 与资源的作者 ID 比对，区分 401、403 与 404。字段校验统一返回 422 和 errors 对象。唯一约束冲突依固定版本的官方测试返回 409。

## 教程与前端

十个独立 Markdown 章节随 Vite 构建打包。章节索引包含稳定的路由键、分组、标题及摘要。目录与侧边栏共享顺序，上一章、下一章按同一索引计算。章节页用 react-markdown 渲染，代码块按语言高亮。博客正文同样作为不可信 Markdown 处理。教程不调用数据库。每个示例前的来源标记指向仓库文件，检查脚本校验整段代码逐行连续匹配。修改实现时可在同一提交刷新示例。

博客查询键应包含当前账户、过滤条件与页码，登出时清理用户相关状态。详情与列表使用不同响应类型，摘要省略 body。编辑器以 slug 定位旧文章，并在保存后跳转到服务端返回的新 slug。

## 决定记录

- M0 固定 PostgreSQL 17 主版本，本地 Compose 与 CI Testcontainers 使用同系列镜像。没有 Docker 的开发环境也可显式指定隔离的真实 PostgreSQL 测试库；同一套断言在两种配置下运行。
- M0 选用 Spring Initializr 提供的稳定版 Spring Boot 4.2.0，目标 JDK 25。使用 Boot 的 Web MVC、Data JPA 和 Flyway starter，PostgreSQL 驱动及 Flyway 的 PostgreSQL 模块各司其职。
- 测试固定 JUnit Jupiter 5.14.4。JUnit 的生命周期方法启动真正的 Spring 应用，Spring Boot Test 的 TestPropertyValues 注入测试数据源和随机端口，客户端通过 HTTP 检验结果。这样保留了规格指定的 JUnit 5，且能使用 Spring Boot 4。
- 后端和前端验收依据固定提交的官方用例。接口 409、摘要省略正文、tagList 顺序和默认头像等细节均以对应断言为准。官方参考地址见 [SPEC.md](SPEC.md)。
- 开发数据库只绑定本机回环地址，测试库与开发库分开。部署计划由静态前端提供单页路由回退，通过同源 /api 访问应用；分域部署时由环境变量限定允许的前端来源。
- 各里程碑仅在对应检查通过后打标签。远程仓库及托管平台需由项目所有者指定或授权；状态记录区分本地检查、GitHub Actions 和公网验收。

### M1 账户与认证

签名采用 Spring Security OAuth2 JOSE 的 HS256 编解码器。令牌的 sub 保存稳定用户 ID，签发方固定为 conduit，有效期为七天。过滤器在校验签名和时间声明后还检查用户是否存在。生产配置需要至少 32 字节的随机密钥，多个实例共享同一密钥。应用依赖 Spring Security 的 BCrypt 编码器；新密码至少 8 个 Unicode 码点，UTF-8 编码最长 72 字节。注册或设置密码时超长输入会得到字段校验错误。

更新接口按字段是否出现区分保留与清空。更新用户行时使用行锁，数据库唯一约束负责判定同时写入的用户名或邮箱冲突。接口只暴露 username、email、bio、image、token 五个字段。

### M2–M3 关系写入与文章地址

关注关系在 JPA 中映射为 User 的有向多对多自关联。写入使用 PostgreSQL 的 ON CONFLICT DO NOTHING，删除按两个用户 ID 匹配，因此重复操作不会产生重复行。禁止自己关注自己，返回字段 profile 的 422 错误。

文章从实际绑定到 articles.id 的 identity 序列取号，先取得唯一 ID，再生成标题地址。两个不同标题可能只在大小写或标点上有区别。如果新地址恰好等于旧地址，会在 ID 前加入 edit，从而使本次操作前的 URL 失效。纯中文或标点标题使用 article 前缀。标签名称按固定顺序写入以减少并发事务的锁顺序冲突，关联表的 position 保存文章输入顺序。

### M4 分页一致性

列表读事务采用 PostgreSQL REPEATABLE READ 隔离级别。同一次请求中的总数、当前页与标签来自同一个数据库快照。匿名非空页执行三条查询；已登录请求还会检查令牌中的用户是否存在。偏移量超出结果时直接返回空列表和真实总数。查询只拼接固定条件片段，标签名、作者、收藏者和分页参数均绑定为参数。

### M6 前端与浏览器验收

后端 JSON 和静态页面通过同源 /api 连接。Vite 的开发和预览服务器可代理到不同后端端口。教程用 Vite 的 import.meta.glob 在构建时收集章节。react-markdown 默认处理的 Markdown 语法无法渲染章节中的 GFM 表格，因此加入 remark-gfm；highlight.js 按语言对源码着色。

浏览器验收在本机运行生产前端和真实后端。上游两份测试把模拟请求匹配地址写死在演示域名上。项目自己的 Playwright fixture 只在两份文件注册这些匹配规则时替换地址前缀，使它们指向当前预览的本机 /api。用例、原始处理函数、响应状态及断言保持原样，正常写请求全部进入临时 PostgreSQL。上游单独检查官方演示 API 是否在线的只读 GET 仍然访问官方域名。

### M7 首页、详情与编辑器

首页每次读取 10 篇摘要。列表类别和页码由路由决定，`/tag/java?page=2` 对应标签 java、limit=10 和 offset=10。分享链接、刷新、浏览器前进和后退都能还原同一个筛选。列表缓存键同时包含筛选、页码和访问者，详情缓存键以 `article`、slug、访问者区分。文章数据中的 `favorited` 和 `author.following` 取决于查看者。

编辑器按 Enter 将去空白且不重复的标签放入有序列表。发布失败时保留正文和标签，显示服务器返回的字段错误。创建或改名成功后使用服务器实际分配的 slug 导航。改名会清理旧地址关联的前端详情和评论缓存，数据库中的评论通过稳定的文章主键保留。文章正文按 Markdown 渲染，作者输入的 HTML 不会成为可执行的页面元素。

### M8 个人主页与互动

个人主页的文章页签请求 `author`，收藏页签请求 `favorited`。两者都复用首页的分页列表，已登录读者可以关注作者，或从列表卡片和文章页收藏文章。访问自己的资料时显示设置入口。

同一查看者对同一篇文章或同一作者的待处理请求保存在 TanStack Query 的 mutation cache 中。相关按钮从同一条记录读取临时状态并阻止重复提交。操作失败时按钮从缓存的服务器数据重新计算显示值，另一个目标的并发写入不受影响。成功后只合并这次操作确认的字段，并使当前查看者的文章列表失效，让数据库重新决定要显示哪些文章和总数。退出或切换账号会清除操作记录；迟到的响应必须匹配原记录才能更新缓存。

### M9 生产运行

开发模式分别运行 Vite 与 Java。生产 Compose 的 web 镜像包含 Nginx 和构建后的静态网站，`/api` 由 Nginx 转发到无宿主端口的 api 服务；数据库也仅在容器网络内可达。Nginx 保留浏览器请求的 Host，防止动态端口或内网服务名造成错误的跨域判断。TLS 在外部反向代理终止时使用实际 HTTPS 前端来源配置精确允许列表。nginx 和 Java 均以非 root 用户运行。数据库使用命名卷，JWT 密钥独立于容器生命周期。

两个 Dockerfile 分离构建工具与运行时，基础镜像固定到清单摘要。持续集成在临时 Compose 项目中构建真实镜像、经 web 入口注册并发表文章，替换容器后，再以原令牌、原密码和原文章核实持久性。每次测试采用独立项目名，清理时只移除本次测试生成的卷。

## 首版完整建表 SQL

来源为 `backend/src/main/resources/db/migration/V1__create_conduit.sql`。

```sql
CREATE TABLE users (
    id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    email varchar(254) NOT NULL UNIQUE,
    username varchar(100) NOT NULL UNIQUE,
    password_hash varchar(255) NOT NULL,
    bio text,
    image text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE articles (
    id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    author_id bigint NOT NULL REFERENCES users(id),
    slug varchar(320) NOT NULL UNIQUE,
    title varchar(255) NOT NULL,
    description text NOT NULL,
    body text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX articles_newest_idx ON articles (created_at DESC, id DESC);
CREATE INDEX articles_author_newest_idx ON articles (author_id, created_at DESC, id DESC);

CREATE TABLE comments (
    id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    author_id bigint NOT NULL REFERENCES users(id),
    article_id bigint NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    body text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX comments_article_idx ON comments (article_id, created_at DESC, id DESC);

CREATE TABLE tags (
    id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    name varchar(100) NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE follows (
    follower_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    followee_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (follower_id, followee_id),
    CHECK (follower_id <> followee_id)
);

CREATE INDEX follows_followee_idx ON follows (followee_id);

CREATE TABLE favorites (
    user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    article_id bigint NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, article_id)
);

CREATE INDEX favorites_article_idx ON favorites (article_id);

CREATE TABLE article_tags (
    article_id bigint NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    tag_id bigint NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    position integer NOT NULL CHECK (position >= 0),
    PRIMARY KEY (article_id, tag_id),
    UNIQUE (article_id, position)
);

CREATE INDEX article_tags_tag_idx ON article_tags (tag_id, article_id);
```
