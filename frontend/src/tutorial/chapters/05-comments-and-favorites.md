# 05 评论与收藏

## 本章做了什么

小林发布了一篇文章，小周在下面写了一条评论，并从两个浏览器标签页先后点击收藏。现在系统里应该有一条有正文、作者和创建时间的评论，以及一条“小周收藏此文”的关系。如果小周删除自己的评论，小林的文章仍在；如果小林删除整篇文章，文章下的互动也随之清理。

| 操作 | 请求 | 成功响应 |
| --- | --- | --- |
| 发评论 | `POST /api/articles/:slug/comments` | 201，返回 `comment` |
| 读评论 | `GET /api/articles/:slug/comments` | 200，返回 `comments` 数组，可匿名 |
| 删除自己的评论 | `DELETE /api/articles/:slug/comments/:id` | 204，无正文 |
| 收藏 | `POST /api/articles/:slug/favorite` | 200，返回收藏后的完整 `article` |
| 取消收藏 | `DELETE /api/articles/:slug/favorite` | 200，返回取消后的完整 `article` |

四个写操作都需要令牌。发表评论每次会创建一条新记录；收藏同一文章可以重试，多次相同请求只应留下一个最终关系。

## 用到的技术

**父资源与子资源。** 路径把文章放在评论前面。因此删除评论需要同时核对“评论存在于这篇文章下”以及“当前用户有权删除它”。单用评论 ID 定位会丢掉 URL 表达的上下文；单用文章 ID 则无法区分该文章下的多条评论。

**外键与级联删除。** 外键保证子记录中的 ID 指向真实的父记录。`ON DELETE CASCADE` 让数据库在删除父记录的同一操作中清理有关子记录。若改由应用手工清理，每个能删除文章的入口都需要知道所有子表，还要正确处理并发写入。这里级联方向从文章到评论或收藏；删一条互动不会影响文章。

**幂等写入与聚合。** 收藏关系的主键是用户与文章两个 ID。对同一组合重复请求时，要在数据库的唯一性规则下保持最终状态。展示计数时使用聚合，即把多条关系汇总为一个数值。若给文章另存一个可自增的数字，重试、取消和事务失败时就得同步协调两个地方的状态。

**Hurl。** Hurl 用文本文件表示一组 HTTP 请求、响应断言和变量提取。它通过实际网络接口观察应用，能够检查路由、认证、JSON 外形以及跨请求的效果。JUnit 集成测试还可以直接查看数据库行数、组织并发操作，两个角度回答不同的问题。

## 代码走读

**记录评论。** 客户端在 URL 中给出文章 slug，正文中的 `comment.body` 是要发表的内容。服务端从已验证的身份取评论者 ID，所以文章作者和评论作者可以是不同的人。新评论返回的整数 ID 用于后续删除。文章存在但还没有评论时，GET 得到空数组；不存在该文章时，GET 得到 404。两个结果要在找文章的那一步就区分开。

控制器以 `@NotBlank` 校验正文，再调用 `CommentService.create`。写事务先按 slug 确认文章仍存在，并用 `FOR SHARE` 在操作期间锁住该文章；仓储插入评论时通过 `RETURNING id` 取得数据库分配的评论 ID。随后将评论与评论作者的资料组合成返回对象。读列表也用同一种投影：作者信息只取公开字段，`following` 则结合本次查看者的 ID 计算。评论列表按创建时间倒序，同一时间按 ID 倒序，因此多条评论的呈现顺序可重现。

来源：`backend/src/main/java/dev/conduit/comment/CommentRepository.java`

```sql
            SELECT c.id, c.created_at, c.updated_at, c.body, u.username, u.bio, u.image,
                   EXISTS (SELECT FROM follows f WHERE f.follower_id = :viewer AND f.followee_id = u.id) AS following
            FROM comments c JOIN users u ON u.id = c.author_id
```

**只删除目标评论。** 假设同一用户在文章甲和乙都留言。把甲的评论 ID 填到乙的路径下，服务端应报告在乙下找不到这条评论。即使两个 ID 指向的记录各自都存在，两者不构成这个父子关系，也不能删除。反过来，如果路径和 ID 正确，使用其他用户的令牌仍会失败：一篇文章的作者并不会因此拥有别人留言的删除权。

下面的方法把三种失败的检查顺序写得很清楚。先定位文章，找不到就产生 `errors.article`；在该文章内找不到评论则产生 `errors.comment`；确定目标后才比较作者。仓储的 `lockAuthor` 用文章 ID 和评论 ID 共同查询，并以 `FOR UPDATE` 锁住该评论，授权检查和删除使用同一个事务。

来源：`backend/src/main/java/dev/conduit/comment/CommentService.java`

```java
    public void delete(String slug, long id, long viewerId) {
        long articleId = articleId(slug, true);
        long author = comments.lockAuthor(articleId, id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "comment", "not found"));
        if (author != viewerId) {
            throw new ApiException(HttpStatus.FORBIDDEN, "comment", "forbidden");
        }
        comments.delete(articleId, id);
    }
```

**收藏及取消。** 给出一篇文章，把每个收藏者作为一行保存下来。开发时可以用下表来推演某个值应如何改变。

| 当前操作 | 收藏关系的用户集合 | A 读取时的 `favorited` | 任意读者看到的 `favoritesCount` |
| --- | --- | --- | --- |
| 初始 | 空 | 假 | 0 |
| A 收藏两次 | A | 真 | 1 |
| B 也收藏 | A、B | 真 | 2 |
| A 取消两次 | B | 假 | 1 |

关系表的定义给出了这种行为的数据库依据。两个外键都带级联，一个收藏者和一篇文章最多组成一个联合主键；额外的按文章 ID 建立的索引支持针对单篇文章的统计。

来源：`backend/src/main/resources/db/migration/V1__create_conduit.sql`

```sql
CREATE TABLE favorites (
    user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    article_id bigint NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, article_id)
);

CREATE INDEX favorites_article_idx ON favorites (article_id);
```

`ArticleController` 对 POST 和 DELETE 分别传入期望的布尔值；两条路径进入同一个 `ArticleService.setFavorite`。服务在事务中先锁住目标文章，找不到则返回 404。写锁让同一文章的收藏变更依次完成，也能与删除该文章的操作协调。仓储在插入时再次利用联合主键处理重复请求；取消则按这两个 ID 删除，原本就没有关系时删除零行。服务最后复用读文章的映射生成响应。单纯收藏或取消没有修改文章正文及其更新时间。

来源：`backend/src/main/java/dev/conduit/article/ArticleRepository.java`

```sql
            INSERT INTO favorites (user_id, article_id) VALUES (:viewerId, :articleId)
            ON CONFLICT (user_id, article_id) DO NOTHING
```

`FavoriteApiTest.concurrentRetriesSetTheSameRelationshipOnce` 在三个虚拟线程中模拟同一个查看者同时发起请求。测试先令三个 POST 一起开始，再对每个响应的布尔值与总数做断言；接着对三个 DELETE 重复同一测试。这样的安排覆盖的是实际 HTTP 写入和数据库并发结果，而页面连续点击的手工练习只能保证先后发送。

收藏写入成功后响应中带整篇详情，其中有两个不同的结果。下面的查询只扫描目标文章的收藏关系：`count(*)` 给出所有人的总数；`bool_or` 将每个用户 ID 与当前查看者比较，只要一条为真就为真；`coalesce` 在没有确定布尔结果时补上假。因此匿名请求仍能看到真实总数，而个性化的收藏标记为假。

来源：`backend/src/main/java/dev/conduit/article/ArticleRepository.java`

```sql
            SELECT count(*) AS total, coalesce(bool_or(user_id = :viewerId), false) AS favorited
            FROM favorites WHERE article_id = :articleId
```

**用 Hurl 验证跨请求效果。** `comments.hurl` 注册一个临时账号并发布文章，从响应里提取其 slug。脚本发表两条评论，保存第一条的 ID，只删除第一条，再通过 GET 检查第二条是否幸存。如果实现一次删掉了整篇文章的评论，这条用例会在数组长度断言处失败；只看 DELETE 的 204 判断不出这个错误。

来源：`scripts/official-specs/specs/api/hurl/comments.hurl`

```hurl
# Verify only the second comment remains
GET {{host}}/api/articles/{{slug}}/comments
HTTP 200
[Asserts]
jsonpath "$.comments" count == 1
jsonpath "$.comments[0].body" == "Second comment"
```

在本地测试后端启动后，可从仓库根目录执行 `./scripts/official.sh api` 运行整套官方接口用例。入口先核对固定版本的文件完整性，再由官方脚本将各份 Hurl 文件交给 Hurl。请求中的 `{{host}}` 由 `HOST` 提供，默认指向本地 8080，测试路径已经带有 `/api`。查失败时先定位用例中的请求、状态码和 JSONPath 断言，再检查上一个步骤捕获的令牌、slug 或评论 ID。

## 设计取舍

为什么给收藏使用“确保已存在 / 确保已移除”两种操作？如果一个按钮简单地翻转当前状态，第一次请求成功但响应在网络中丢失，自动重试就会把收藏取消。让目标状态由 HTTP 请求明确表达，再让数据库处理重复关系，同一请求重放后的效果才可预期。两位用户收藏同一篇文章则有不同的联合键，应该各保留一行。

对比评论：正文完全相同也可能是两次不同发言。其身份由数据库分配的评论 ID 区分，因此不能仅凭相同用户、文章和文本去重。删除某条评论时，先确认目标和作者；之后其他评论依然存在。删除整篇文章时，数据库一次清理它的评论、收藏及文章标签关联，应用得以保持完整性。

## 常见错误

| 现象 | 排查方法 |
| --- | --- |
| 发布评论得到 422，`errors.body[0]` 为 `can't be blank` | 看 JSON 顶层是否有 `comment`，输入的 body 是否为空白。确认文章存在后再重试。 |
| 删除自己的评论却收到 404 | 核对两个标识：路径要使用这篇文章的当前 slug，末尾要使用这篇文章下那条评论的 ID。错误体的 `article` 或 `comment` 告诉你失败的位置。 |
| 作者能删文章，却不能删别人写的单条评论 | 单条评论的授权检查使用评论作者。若登录的是文章作者，删除其他用户的评论应得到 403。 |
| 一个用户点了两次收藏，总数却多了两次 | 查该用户与此文的关系是否只保留一行，再查服务是否用每次请求的次数更新了另一份计数。 |
| 官方用例请求了 `/api/api/articles` 并 404 | 核对 `HOST`。套件的请求自身包含 `/api`，传入的地址需与脚本生成 URL 的方式相匹配。 |

## 自测与练习

1. 用户 A 删自己在文章甲下的评论，为什么服务端仍要核对路径中的文章？
2. 若评论存在且属于别人，已登录用户会得到什么状态？若评论 ID 根本不属于路径中的文章呢？
3. A 对同一篇文章连续收藏三次，B 收藏一次，A 再连续取消两次，最终总数是多少？A、B 各自看到的收藏标记是什么？
4. 删除文章后为何不用逐条在 Java 循环中删除评论与收藏？如果只删除一条评论，文章本身会受到什么影响？
5. Hurl 已经断言 DELETE 返回 204，为什么还要再发 GET 看第二条评论？这个断言能发现哪一类错误？

**动手练习。** 用 A 发文，让 B 留两条不同正文的评论并收藏两次。记录 B 的两条评论 ID；让 A 尝试删除 B 的第一条评论，再由 B 删除同一条。匿名读取评论列表与文章详情，观察剩余正文、收藏总数和匿名查看者的收藏标记。最后由 A 删除文章并重新访问其评论地址。

### 参考答案

1. URL 定位的是“这篇文章下的这条评论”。核对父子关系能防止请求把另一篇文章的评论 ID 和当前路径拼错。
2. 在正确文章下识别出评论但作者不匹配时是 403；在指定文章下找不到评论时是 404。
3. 最后只剩 B 那一条关系，总数为 1；A 为假，B 为真。重复建立或取消同一关系不增加额外行。
4. 评论、收藏都通过带级联删除的外键引用文章。删除父行时 PostgreSQL 清理相关子行；单删评论仅移除该评论，文章继续存在。
5. 204 只证明服务器报告删除成功。后续 GET 可以发现它误删了同一文章下所有评论，或者根本没有删除指定的那一条。

练习中，A 删除 B 的评论应得 403；B 自己删除后得到 204。匿名列表只剩第二条评论，文章详情的总数是 1、`favorited` 为假。A 删除文章后再读评论地址会得到文章不存在的 404。
