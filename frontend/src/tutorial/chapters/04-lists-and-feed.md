# 04 文章列表与信息流

## 本章做了什么

小周想找小林写的、带 `java` 标签的文章，每次只读一篇摘要。第一篇读完后，页面还得知道有没有下一篇。另一个页面“我的关注”使用同一种摘要，却只允许返回小周所关注的作者。两页都需要作者资料、标签顺序和收藏数，列表要能一次把它们取齐。

| 页面需要的结果 | 请求 | 范围 |
| --- | --- | --- |
| 全站或筛选列表 | `GET /api/articles` | 可匿名，`tag`、`author`、`favorited` 能组合使用 |
| 关注信息流 | `GET /api/articles/feed` | 需要令牌，只看当前用户关注的作者 |

两个接口默认 `limit=20`、`offset=0`。响应里的 `articles` 是当前页的摘要数组，`articlesCount` 是满足条件的总篇数。摘要有九个字段，正文留给读单篇文章时获取。

## 用到的技术

**动态查询。** 后端根据本次请求拼装需要的筛选条件。作者条件比较文章作者的用户名；标签条件检查文章是否关联这个标签；收藏者条件检查指定用户名是否与该文章存在收藏关系。多个条件同时给出时取交集。只允许仓储中预先写好的 SQL 片段组成查询，实际的标签和用户名作为 SQL 参数传入。若为每一种组合写一套独立接口和查询，随着新条件增加，组合会迅速增多。

**分页与排序。** `LIMIT` 限制返回多少行，`OFFSET` 表示从排好序的结果前跳过多少行。假设时间从新到旧是丙、乙、甲，`limit=1&offset=1` 就是只取乙，总篇数仍是三。两篇创建时间相同可能并列，增加按 ID 降序的第二排序键后，同一数据快照的顺序可以重现。数据库也为两个排序键和按作者排序建了索引，查询规划器可依数据分布选择使用。

来源：`backend/src/main/resources/db/migration/V1__create_conduit.sql`

```sql
CREATE INDEX articles_newest_idx ON articles (created_at DESC, id DESC);
CREATE INDEX articles_author_newest_idx ON articles (author_id, created_at DESC, id DESC);
```

**关联存在性与投影。** SQL 的 `EXISTS` 回答“是否至少存在一条符合条件的记录”，适合判断某篇文章与指定对象之间是否有关系。投影指查询只取本次视图会读取的列。对于列表，摘要与作者资料可以一次取回，无须传输大段正文；应用再把每行组装成输出 DTO。

**N+1 查询。** 第一次 SELECT 拿到 N 篇文章；循环渲染时，每篇文章又发一条 SELECT 取标签，于是共发出 1+N 条语句。若作者和收藏状态也逐篇查询，往返还会更多。把多个 ID 交给同一条查询，可以把网络往返限制在固定次数。语句条数保持恒定不代表每页任意大小耗时都相同，具体还受数据库扫描、结果行数和返回的数据量影响。

## 代码走读

**先明确本次请求的三个角色。** 查询参数 `author=lin` 指定作者，`favorited=mei` 指定收藏者，令牌可能属于第三个人 `zhou`。上面两个参数控制哪些文章能进入结果，`article.favorited` 却仍应表示查看者 zhou 是否收藏过；同理，`article.author.following` 表示 zhou 是否关注作者。把收藏者参数当成当前用户，就会给同一页所有文章画上错误的状态。

两条路由共用 `ArticleListService.page`。全站列表把三个筛选参数放进 `Filters`，另外传入可空的查看者 ID。信息流控制器则用 `CurrentUser.requiredId()` 得到查看者 ID，既作为关系筛选的来源，也用于计算这次响应的个性化字段。仓储把非空条件用 AND 连接。这段筛选决定了谁有资格进入信息流：

来源：`backend/src/main/java/dev/conduit/article/ArticleListRepository.java`

```java
            if (filters.feedViewer() != null) {
                terms.add("EXISTS (SELECT FROM follows f WHERE f.followee_id = u.id AND f.follower_id = :feedViewer)");
                params.put("feedViewer", filters.feedViewer());
            }
```

**把过滤与分页拆开看。** 官方例子先用同一个作者发布两篇文章，然后用 `limit=1` 分页。下面这段访问第二页。它同时断言数组只有一项、总数仍是二、slug 对应先发布的那篇；只检查数组长度会掩盖总数算错的问题。

来源：`scripts/official-specs/specs/api/hurl/pagination.hurl`

```hurl
# List with limit=1&offset=1 (second page, so slug1)
GET {{host}}/api/articles?author=page_{{uid}}&limit=1&offset=1
HTTP 200
[Asserts]
jsonpath "$.articles" count == 1
jsonpath "$.articlesCount" == 2
jsonpath "$.articles[0].slug" == "{{slug1}}"
```

筛选结果有两篇时，若访问 `offset=2`，数据库已经跳过两篇，当前页就是空数组，但总数仍为二。若换成没有任何文章用过的标签，总数才是零。使用同一个筛选条件统计总数并取页，可以让客户端区分“这一页越界”和“没有搜索结果”。

继续追踪服务器如何实现这条断言。`Selection.matching` 把筛选条件和绑定值封在同一对象中。`articles.count(matches)` 计算所有匹配文章数量；若 offset 已超出当前集合，直接带着正确总数返回。否则，`articles.page` 对同样的条件加上排序、LIMIT 和 OFFSET，一次取回本页 ID 与摘要所需列。服务的只读事务使用可重复读隔离级别，总数、本页和标签基于同一数据库快照；就算另一位作者在这些查询之间发布文章，这次响应也不会一半使用旧数据、一半使用新数据。

来源：`backend/src/main/java/dev/conduit/article/ArticleListService.java`

```java
        var matches = ArticleListRepository.Selection.matching(filters);
        long total = articles.count(matches);
        if (offset >= total) return new Page(List.of(), total);
        var rows = articles.page(matches, viewer, limit, offset);
        var tagLists = tags.forArticles(rows.stream().map(ArticleListRepository.Row::id).toList());
        var summaries = rows.stream().map(row -> row.withTags(tagLists.getOrDefault(row.id(), List.of()))).toList();
        return new Page(summaries, total);
```

![作者 lin 有四篇匹配文章。跳过第一篇、取两篇时，本页包含 ID 84 和 73，它们的标签通过一次查询取回，总篇数仍为四。](./figures/04-feed.svg)

**按查看者组装摘要。** 页查询选取的是作者公开字段与文章标量，显式省略正文。下面三个表达式一次返回“查看者关注作者吗”“查看者收藏了本文吗”和“共有几人收藏本文”。匿名时查看者参数为 SQL NULL，与之相等的关系不存在，因此两个 `EXISTS` 都得到假，公开收藏数仍可读取。它们是同一条 SQL 的子查询，数据库可以在内部为多行执行相应操作，但 Java 程序无需为每篇文章单独发请求。

来源：`backend/src/main/java/dev/conduit/article/ArticleListRepository.java`

```sql
                   EXISTS (SELECT FROM follows f WHERE f.followee_id = u.id AND f.follower_id = :viewer) AS following,
                   EXISTS (SELECT FROM favorites f WHERE f.article_id = a.id AND f.user_id = :viewer) AS favorited,
                   (SELECT count(*) FROM favorites f WHERE f.article_id = a.id) AS favorites_count
```

**一次取回本页标签。** `forArticles` 接收本页所有文章 ID。下列 SQL 将 ID 数组当作筛选范围，先按文章 ID、再按该文的标签位置排序。仓储遍历结果，以 ID 为键把标签逐个追加到各自列表。由于文章流本身仍按时间遍历，最终返回时既能保持文章时间顺序，也能保存每篇的标签顺序。没有标签的文章在映射中找不到键，服务用空列表补齐。

来源：`backend/src/main/java/dev/conduit/tag/TagRepository.java`

```sql
                SELECT a.article_id, t.name FROM article_tags a JOIN tags t ON t.id = a.tag_id
                WHERE a.article_id = ANY(CAST(:ids AS bigint[])) ORDER BY a.article_id, a.position
```

**怎样知道没有把 N+1 藏进 ORM？** `ArticleQueryCountTest` 先创建八位不同作者，各发一篇带两个标签的文章，让同一查看者关注他们并收藏这些文章。然后用 HTTP 分别读取一篇和八篇，检查实际页长、收藏数、查看者状态和标签内容。测试专用的 `JdbcExecutionCounter` 装饰应用共用的 `DataSource`，在 JDBC 的 Statement 执行时计数。Hibernate 与直接使用 `JdbcClient` 的读取都经过这一层；只开启 Hibernate 的 SQL 日志会漏掉直接执行的 JDBC 查询。

来源：`backend/src/test/java/dev/conduit/ArticleQueryCountTest.java`

```java
        long before = counter.total();
        var result = request("GET", path + "limit=" + width, token, null, 200);
        long queries = counter.total() - before;
        assertThat(result.get("articlesCount").intValue()).isEqualTo(8);
        assertThat(result.get("articles").size()).isEqualTo(width);
```

同一路径、同一身份的两次计数必须相等，还必须落在各自的预算内。这样即使错误实现始终发出许多冗余 SQL，也不会因为两次“碰巧一样多”就通过。读取八个不同作者还防止同一作者对象被缓存后掩盖逐篇补取作者的问题。

## 设计取舍

把文章、标签、收藏记录一次全部连接，看起来只需一次 SQL；可是两标签、三条收藏可能把同一文章展开成六行。如果再把 `LIMIT`、`OFFSET` 用到展开后的行，实际就会对关系记录分页，甚至出现某篇文章的标签被截断。用 `EXISTS` 筛选、按文章分页，再对当前页的 ID 一起取标签，保留了“每一行是一篇文章”的含义。

直接从当前页条数猜总数，读第一页时可能错，读到空页时更无法判断。单独统计需要让数据库再做一次筛选，却能对任何 offset 独立给出总篇数。Offset 分页还允许直接跳到某页，符合本项目 API。频繁发布新文章时，两次分开的网页请求可能看见不同数据，固定排序只消除同一数据集的并列顺序不确定性。

## 常见错误

| 现象 | 排查方法 |
| --- | --- |
| 每次请求一篇，页面永远显示只有一篇 | 在响应里分别记录 `articles.length` 和 `articlesCount`；确认计数查询复用过滤条件但没有带上 limit 和 offset。 |
| 使用 `favorited` 筛选后，匿名访问也显示自己收藏了所有文章 | 分开跟踪筛选参数里的收藏者与安全上下文里的查看者。匿名用户的个性化收藏、关注标记都应是假。 |
| 读取 `/api/articles/feed` 得到 401 | 该列表按当前登录人筛选，检查请求是否发送了自己的有效令牌。刚注册且未关注任何人时应获得 200 和空数组。 |
| 分页时同一篇反复出现，或某篇少一个标签 | 查看关系连接是否在分页前把文章展开为多行，并检查排序有无同时间下的次级排序键。 |
| 一篇文章时响应很快，一页二十篇时 SQL 日志陡增 | 比较两种页大小下执行过的语句条数，关注循环内取标签、作者和收藏状态的语句；耗时还可能受数据量和索引影响。 |

## 自测与练习

1. 有 23 篇文章匹配查询，`limit=10&offset=20` 时，数组长度与总数各是多少？若 offset 改为 30 呢？
2. 为什么 `favorited=mei` 与摘要中的 `favorited` 可以分别表示不同的人？
3. 一篇文章有三个标签、五条收藏。若直接把两个集合都连接到文章，最多会得到多少个组合？这会怎样影响分页？
4. 对每篇再做一次标签查询，一页 1 篇与一页 20 篇时语句条数会相差多少？怎样验证批量版本避免了这种增长？
5. 同一时刻写入两篇文章，`ORDER BY created_at DESC` 有什么不足？增加第二排序键能否保证明天翻页的结果仍与今天相同？

**动手练习。** 注册 A、B，让 A 关注 B。以 B 的身份先后发布三篇带同一个新标签的文章，分别保存 slug。以 A 的身份请求 `/api/articles/feed?limit=1&offset=1`，再用新标签查询全站列表，从 `offset=0` 翻到 3。观察每一页摘要中有无正文、标签顺序、四次总数与最后一个数组的长度。换成从未使用的标签再执行一次。

### 参考答案

1. offset 为 20 时本页有 3 项、总数 23；offset 为 30 时为空数组、总数仍是 23。
2. 查询参数选出 mei 收藏的文章。响应布尔值来自本次请求查看者与每篇文章之间的关系，未登录时也可能查到 mei 的收藏，自己的标记仍为假。
3. 三乘五产生十五种组合。若把数据库行数直接当文章数量或分页单位，计数会偏大，一页能展示的文章数也不正确。
4. 多 19 次单篇查询。对相同数据和查看者分别调用两次列表请求，除页大小外保持其他条件相同；独立比较请求期间执行的 SQL 语句总数，且确认两次实际返回的文章数量不同。
5. 只给一个时间键时，同一时间的记录没有规定彼此先后；再加 ID 可以稳定同一批记录的相对次序。明天如有新发布或删除，offset 所指的数据可能已经移动。

练习预期：若 A 只关注 B 且 B 仅发布了这三篇，信息流第二页是第二篇，总数三。全站列表用该独有标签筛选时，前三页各返回一篇，第四页为空，总数四次均是三。换成从未使用的标签时，列表为空且总数为零；每个非空页都只返回摘要。
