# 03 文章增删改查

## 本章做了什么

作者发出一篇题为《第一周笔记》的文章，正文是 Markdown，还附了两个有顺序的标签。读者可以匿名打开文章；作者回来校对正文，后来又给文章换了标题。每次修改都在动同一篇文章，页面地址却可能发生变化。本章跟踪这个过程。

| 操作 | 请求 | 成功后的结果 |
| --- | --- | --- |
| 发布文章 | `POST /api/articles` | 201，返回含正文、作者和新 slug 的 `article` |
| 读取详情 | `GET /api/articles/:slug` | 200，返回完整文章，允许匿名 |
| 修改文章 | `PUT /api/articles/:slug` | 200，返回修改后的文章和最新 slug |
| 删除文章 | `DELETE /api/articles/:slug` | 204，无响应正文；再次访问该文章得到 404 |
| 读取标签 | `GET /api/tags` | 200，顶层 `tags` 是标签名称数组 |

## 用到的技术

**slug 与主键。** slug 是 URL 中方便人阅读的文章标识，公开在链接里。数据库主键是文章一生使用的身份，用来连接文章、标签与评论。一个标题允许出现多次，两个链接仍须指向不同文章；编辑标题也不能让原有标签和评论变成另一篇文章的附属记录。

**事务与行锁。** 事务把一组数据库变更作为一次业务操作提交；失败时回滚，即放弃尚未提交的变更。Spring 的 `@Transactional` 为服务方法建立这样的边界。行锁协调多个编辑者对同一篇文章的写入，防止两次操作同时按各自看到的旧状态拼接结果。若自己管理连接，则每次都要正确处理开始事务、提交、回滚和释放连接。

**DTO 映射。** 给客户端的文章详情是把数据库中多种信息组合成一个 Java 返回对象的结果。文章标量字段来自文章记录，公开作者资料要包含查看者是否关注作者，标签要按文章对应顺序返回，收藏也要返回总数和当前查看者的状态。若直接交给 JSON 工具遍历实体，内部主键、懒加载的关联和接口约定就会混在一起。

**授权。** 认证回答“是谁”，授权回答“这个人能不能对这篇文章执行这次操作”。带有有效令牌的读者可以阅读，改文、删文还要通过作者检查。仅在编辑页面隐藏按钮不足以保证这一点；真正改变数据库前，后端要独立做出判断。

## 代码走读

**创建。** 客户端向 `POST /api/articles` 提交顶层 `article` 对象，内含 `title`、`description` 和 `body`，以及任选的 `tagList`。注册或登录时取得的令牌标识当前用户。先看官方用例要求成功响应满足哪些条件。除了两个指定位置上的标签，它也检查作者字段和收藏初值；客户端把服务端返回的 slug 保存起来，供读取、编辑与删除使用。

来源：`scripts/official-specs/specs/api/hurl/articles.hurl`

```hurl
jsonpath "$.article.favorited" == false
jsonpath "$.article.favoritesCount" == 0
jsonpath "$.article.author.username" == "art_{{uid}}"
jsonpath "$[?count($.*) == 1]" exists
jsonpath "$.article.*" count == 10
jsonpath "$.article.author.*" count == 4
[Captures]
slug: jsonpath "$.article.slug"
```

控制器把请求中的文章对象与令牌对应的作者 ID 交给 `ArticleService.create`。`Changes.read` 检查必填字段和类型。随后用作者 ID 取得实体引用，构造文章，再将文章写入数据库。此时已经 flush（把待执行的变更同步到数据库），事务还在继续；后面的标签或响应组装出现导致回滚的异常，文章也不会独自提交成功。

来源：`backend/src/main/java/dev/conduit/article/ArticleService.java`

```java
    @Transactional
    public ArticleView create(JsonNode data, long authorId) {
        var changes = ArticleForms.Changes.read(data, null);
        var article = new Article(users.getReferenceById(authorId), changes.title(), changes.description(), changes.body());
        articles.saveAndFlush(article);
        if (changes.tagList() != null) tags.replace(article.id, changes.tagList());
        return view(article, authorId);
    }
```

再往下追：Hibernate 从 `articles_id_seq` 序列取号，然后调用带 `@PrePersist` 的方法准备插入。此时 ID 已可用于生成 slug。标题经标准化、转小写、去除组合音标，把非 ASCII 字母数字的连续字符改成连字符；没有可用前缀时使用 `article`。例如 `Café Companion` 的前缀是 `cafe-companion`，纯中文标题的前缀则是 `article`。创建和更新时间使用同一时刻，并截断到 PostgreSQL 可保存的微秒精度。

来源：`backend/src/main/java/dev/conduit/article/Article.java`

```java
    @PrePersist
    void initialize() {
        slug = stem(title) + "-" + id;
        createdAt = Instant.now().truncatedTo(ChronoUnit.MICROS);
        updatedAt = createdAt;
    }
```

**标签的顺序存在哪里？** 标签名只在 `tags` 表里保存一次。同一个标签可以排在甲文的第一个位置，也可以排在乙文的第二个位置，因此位置必须属于两者之间的关系。前面的文章接口返回的是每篇文章自己的标签顺序；全站标签接口则只返回标签名字。

来源：`backend/src/main/resources/db/migration/V1__create_conduit.sql`

```sql
CREATE TABLE article_tags (
    article_id bigint NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    tag_id bigint NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    position integer NOT NULL CHECK (position >= 0),
    PRIMARY KEY (article_id, tag_id),
    UNIQUE (article_id, position)
);
```

联合主键防止同一标签在一篇文章里占两个位置，另一个唯一约束防止两个标签抢同一篇文章中的同一位置。读取时要显式按 `position` 排序，插入顺序本身不保证查询结果顺序。

`TagService.replace` 先去掉名称首尾空白，再借助 `LinkedHashSet` 去重并保留第一次出现的位置。仓储按统一的名字顺序尝试向 `tags` 插入新词，遇到已有名字就复用，减少并发请求按相反顺序争用相同名字的机会。写入文章关联时要恢复读者提交的顺序：`unnest` 把数组展开成一行一个标签，`WITH ORDINALITY` 让每一行带上从 1 开始的原始序号，减 1 就得到存表的零起始位置。

来源：`backend/src/main/java/dev/conduit/tag/TagRepository.java`

```sql
                INSERT INTO article_tags(article_id, tag_id, position)
                SELECT :articleId, t.id, input.ordinal - 1
                FROM unnest(CAST(:names AS text[])) WITH ORDINALITY AS input(name, ordinal)
                JOIN tags t ON t.name = input.name
```

**读取与修改。** GET 控制器从路径获取 slug，允许查看者匿名。PUT 控制器还需要已验证的用户 ID。对于同一篇文章，更新正文时保留原 slug；换成另一个可读前缀的标题时，从成功响应中获取新 slug。省略 `tagList` 原样保留，提交空数组清除关联，显式提交 `null` 则是无效的字段值。下面这段用例把“省略”与“清空”区分开：请求中明确给出空数组，结果的标签数必须为零。

来源：`scripts/official-specs/specs/api/hurl/articles.hurl`

```hurl
# Update article: remove all tags with empty array
PUT {{host}}/api/articles/{{slug}}
Authorization: Token {{token}}
{
  "article": {
    "tagList": []
  }
}
HTTP 200
```

`createdAt` 保存最初发布时间，`updatedAt` 反映最近更新时间。在 `ArticleApiTest` 中，先取两篇同名文章，再只改第一篇的正文：下列连续断言同时验证地址、时间和标签。这是一次部分更新；客户端可以据此判断“保存正文”的行为是否意外覆盖了别的字段。

来源：`backend/src/test/java/dev/conduit/ArticleApiTest.java`

```java
        assertThat(edited.get("slug").stringValue()).isEqualTo(old);
        assertThat(edited.get("createdAt")).isEqualTo(first.get("createdAt"));
        assertThat(edited.get("updatedAt")).isNotEqualTo(first.get("updatedAt"));
        assertThat(edited.get("tagList")).isEqualTo(first.get("tagList"));
```

改名还有一个边界。把 `Field Guide` 改成 `FIELD GUIDE!`，可见标题变了，但两个前缀完全一样。`Article.revise` 先计算通常的候选 slug；如果它等于当前地址，则本次改用带 `-edit-` 的版本，以保证此次改名后地址真的发生变化。若只改正文，标题相等，整段换地址的逻辑都不会执行。

**删除。** 更新与删除共用 `owned`。`lockBySlug` 在事务内以写锁读取文章，找不到目标就返回 404。有目标后，再把作者主键与当前用户主键比较。即使两个浏览器同时编辑同一篇文章，它们也要先后取得这篇文章的锁。锁只负责并发顺序，身份比对才决定能否写入。

来源：`backend/src/main/java/dev/conduit/article/ArticleService.java`

```java
    private Article owned(String slug, long authorId) {
        var article = articles.lockBySlug(slug).orElseThrow(ArticleService::notFound);
        if (article.author.getId() != authorId) {
            throw new ApiException(HttpStatus.FORBIDDEN, "article", "forbidden");
        }
        return article;
    }
```

只有通过作者校验后才能删除文章。删除成功时没有响应正文，客户端可以回到列表；继续请求旧 slug 会得到 404。外键上的 `ON DELETE CASCADE` 让数据库清掉文章所拥有的关联和评论，避免残留引用。共享标签本身还有别的文章可能使用，因此把一篇文章与标签断开，只需要清理关联行。

## 设计取舍

从纯标题生成前缀，确实能让链接更短，但两个作者可以写出完全相同的标题。若先查是否存在再写入，两个并发请求仍可能都读到空结果。本项目把数据库分配的唯一 ID 放进 slug 后缀，再用唯一约束守住最终写入。代价是链接稍长，但同名文章不会互相抢占地址。关联表一直使用文章主键；修改链接不会触碰外键。

为什么要把文章和标签放进同一事务？假设文章数据已成功写入，最后一条标签关联违反约束。如果这些语句各自提交，重试前就能读到一篇缺少标签的新文章，或者读到被清空一半的旧标签列表。在一个事务中，抛出触发回滚的异常会撤销本次写入，原来可见的完整数据仍保持一致。数据库序列可以因失败而跳号，不能拿相邻文章的 ID 是否连续判断事务是否回滚。

## 常见错误

| 现象 | 排查方法 |
| --- | --- |
| 提交文章返回 422，某个字段提示 `can't be blank` | 确认请求体有 `article` 包装，查看出错的是标题、摘要还是正文，检查表单传入的实际字符串。 |
| 登录后改别人文章收到 403 | 用 GET 查看 `article.author.username`，再用同一令牌获取当前账号；不同作者会被授权检查拒绝。缺少令牌的写请求会先得到 401。 |
| 改标题后刷新编辑器得到 404 | 从刚才 PUT 的响应读取最新 slug，再发 GET。若改标题导致 slug 改变，客户端应将导航地址一起更新。 |
| 标签表中的名字都正确，界面却显示相反顺序 | 看该文章在 `article_tags` 中的 `position`，再核对读取时的排序条件。全站标签列表不能充当某一篇文章的顺序。 |
| 删文得到 204，客户端解析 JSON 失败 | 204 表示响应没有正文，客户端应在处理状态码后结束，不应继续把空字符串交给 JSON 解析器。 |

## 自测与练习

1. 两篇文章标题相同，为什么仍能拥有不同 slug？改标题时哪一个标识继续供外键使用？
2. 同一标签可以在甲文里排第一，在乙文里排第三，为什么 `position` 要放在 `article_tags`？
3. 只修改正文时省略 `tagList`、传 `[]` 与传 `null` 分别表示什么？
4. 第一条标签关联写入成功，随后同一事务失败，其他用户在事务结束后应看到什么状态？
5. 匿名删除存在的文章、使用其他作者的令牌删除、使用作者令牌成功删除，以及删除后的读请求，状态码分别是什么？

**动手练习。** 注册两个临时账号。以 A 的身份创建两篇同名文章，分别保存响应 slug；给第一篇按 `beta`、`alpha` 的顺序加标签。先修改这篇文章的正文并省略标签，再把标题改成另一个完全不同的词。观察每次响应中的 slug 与标签顺序。用 B 的令牌尝试删第一篇，再用 A 的令牌删除，最后确认第二篇仍可读取。

### 参考答案

1. 数据库分配的文章 ID 能区分同名文章，项目将它作为 slug 的唯一后缀。外键继续引用同一个数字 ID；改标题不需要重建评论或标签引用。
2. 位置是“一篇文章使用某个标签”这条关联的属性。把位置直接放在标签行会让所有文章共享一个位置。
3. 省略时保留原关联；空数组表示移除所有关联；显式 null 返回 422。验证实际保存的结果应在 PUT 后再发一次 GET。
4. 新文章创建失败时，其他用户看不到这篇文章及其未完成的标签。若是在替换旧文章的关联，失败后仍是原有数据；本次事务的部分结果不会留下。
5. 依次为 401、403、204、404。前两次均未删除文章，204 响应无正文，最后一次 GET 才验证目标确实消失。

练习中两篇同名文章的 slug 应各不相同。仅改正文时链接和标签不变；将标题改成不同前缀后，使用新 slug 读取第一篇，标签依次仍为 `beta`、`alpha`。B 的删除请求得到 403；A 删除第一篇后其新 slug 得到 404，第二篇自己的地址仍返回 200。
