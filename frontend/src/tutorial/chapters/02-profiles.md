# 02 资料与关注

## 本章做了什么

小林与小周打开的是同一个人的主页。两人都看见同一份简介，但小林刚点过“关注”，小周还没点过。服务端怎样在同一个 URL 下返回不同的 `following`？要拼出这份资料，后端既要认出地址中的目标用户，也要知道是谁在看。

| 拿到或改变什么 | 请求 | 谁能调用 | 成功响应 |
| --- | --- | --- | --- |
| 查看公开资料 | `GET /api/profiles/:username` | 游客或已登录用户 | `profile` 中有 `username`、`bio`、`image`、`following` |
| 建立关注关系 | `POST /api/profiles/:username/follow` | 已登录用户 | HTTP 200，并返回更新后的资料 |
| 解除关注关系 | `DELETE /api/profiles/:username/follow` | 已登录用户 | HTTP 200，并返回更新后的资料 |

对比上一章的 `GET /api/user`：账户设置需要知道自己的邮箱，公开主页只需展示公开资料。两种响应使用不同字段集；读者的令牌和作者的邮箱都不会进入公开资料。

## 用到的技术

**JPA 实体。** Jakarta Persistence（JPA）规定 Java 对象如何映射到数据库记录。Hibernate 是本项目使用的 JPA 实现。`User` 上的 `@Entity` 说明它有可持久化的身份，`@Table` 说明对应的表，`@Id` 指定主键；`GenerationType.IDENTITY` 让数据库分配主键。若完全使用 JDBC，就要在每个需要用户对象的查询里处理结果集和字段映射。用户名用于公开 URL，主键用于内部关联，因此修改账号名不会移动关注记录。

来源：`backend/src/main/java/dev/conduit/user/User.java`

```java
@Entity
@Table(name = "users")
public class User {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
```

**多对多自关联。** 数据结构中可以用一条有向边表示“A 关注 B”。数据库里两端都是用户，因此称为自关联；一个人可以关注多人，也能同时被多人关注，因此是多对多。用中间表的一行存一条边，可以按任一端查找。若把关注者串成字符串放在用户记录中，每次增删都要解析、修改和重写整串，也难用外键约束每个成员。

**可选登录。** 一个 GET 请求可以缺少凭证。没有令牌时，服务端仍按用户名返回公开字段，并把 `following` 设为假。带有效令牌时，则能结合查看者的 ID 查关系。客户端必须明确选择匿名请求或使用有效令牌；若发送了无法验证的令牌，过滤器会返回 401。

**幂等。** 这里指重复请求同一操作后，关注关系保持同一个最终状态。比如网络超时后，客户端无法判断第一次关注是否成功，再点一次也只应留下同一条关系。如果接口写成“当前有就删、没有就加”，相同请求重发两次反而会把关系翻回原状态。

## 代码走读

**先把两端区分开。** 假设小林的主键为 17，作者的主键为 42。小林关注作者后应产生 `(17, 42)`，作者回关小林才产生 `(42, 17)`。迁移脚本给这两列取了不同的名字，数字对的顺序有实际意义。

来源：`backend/src/main/resources/db/migration/V1__create_conduit.sql`

```sql
CREATE TABLE follows (
    follower_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    followee_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (follower_id, followee_id),
    CHECK (follower_id <> followee_id)
);
```

联合主键约束一整对 ID 的唯一性，允许同一个关注者出现在多行中，也允许同一作者被多人关注。`CHECK` 在写入时拒绝两端相同的行；`ON DELETE CASCADE` 表示删除某一端的用户行时，数据库一起清掉失去该端的边。

**阅读一次 GET。** 路径中的 `username` 指向被查看的用户。当前读者的身份来自 Security 过滤器放入的上下文；匿名访客没有通过验证的数字主体。下面的方法保留这个差异，返回可空的 `Long`。在业务代码中，匿名态因此无需用某个“特殊数字”冒充真实的用户 ID。

来源：`backend/src/main/java/dev/conduit/common/CurrentUser.java`

```java
    public static Long optionalId() {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        return authentication != null && authentication.getPrincipal() instanceof Long id ? id : null;
    }
```

控制器把路径变量与查看者 ID 传给服务。服务先用用户名读用户表，找不到就返回 404。下面的 `&&` 是 Java 的短路运算：左边为假，右边的方法不会执行。所以匿名请求只需取用户资料。已登录请求再调用 `isFollowing`，查询这一对 ID 是否存在于关系表。最后 `ProfileView.of` 从用户对象中挑出用户名、简介和头像，再加上刚刚算出的布尔值，由控制器包进 `profile`。

来源：`backend/src/main/java/dev/conduit/profile/ProfileService.java`

```java
    @Transactional(readOnly = true)
    public ProfileView read(String username, Long viewerId) {
        User target = findUser(username);
        boolean following = viewerId != null && follows.isFollowing(viewerId, target.getId());
        return ProfileView.of(target, following);
    }
```

`User.followedUsers` 是一个 `Set<User>` 关联。它的 `@JoinTable` 注解把拥有集合的用户映射到 `follower_id`，把集合成员映射到 `followee_id`。仓储的 `isFollowing` 用 JPQL 编写。JPQL 是面向实体和属性的查询语言；Hibernate 依据上述映射把对 `viewer.followedUsers` 的连接和两端 ID 的条件翻译成数据库查询，最终只取回布尔结果。

**点一次关注，再重试一次。** 在 `POST` 中，控制器改用 `requiredId()` 获取当前用户。服务先确认目标存在，自我关注返回 422；其余请求进入下面的写入方法。`@NativeQuery` 表示直接交给 PostgreSQL 的是 SQL，`@Modifying` 声明这是一条改变数据的语句。第一次插入后，第二次插入遇到同一联合键，数据库按冲突子句保留已有记录。即使两个相同请求同时到达，仍由数据库裁定该键只保留一份。

来源：`backend/src/main/java/dev/conduit/profile/ProfileRepository.java`

```java
    @Modifying
    @NativeQuery("""
            INSERT INTO follows (follower_id, followee_id) VALUES (:viewerId, :targetId)
            ON CONFLICT (follower_id, followee_id) DO NOTHING
            """)
    void follow(long viewerId, long targetId);
```

取消时仓储只删除两个 ID 都匹配的行。对已经取消的关系，再执行同一个 DELETE 影响零行，最终状态同样是未关注。目标用户仍然必须存在。两种写操作都在服务层事务里执行，返回的资料带有这次成功操作后的状态。

**用第三个请求验证方向。** 一次点击的响应只能说明服务端这次返回了真。`ProfileApiTest` 还在独立 GET 中分别使用关注者、被关注者以及游客身份。第二个断言专门检查反方向。即使有人误把关注做成双向关系，第一个断言仍会通过，第二个就能指出问题。

来源：`backend/src/test/java/dev/conduit/ProfileApiTest.java`

```java
        assertThat(request("GET", path, viewerToken, null, 200).at("/profile/following").booleanValue()).isTrue();
        assertThat(request("GET", "/profiles/" + viewer, targetToken, null, 200).at("/profile/following").booleanValue()).isFalse();
        assertThat(request("GET", path, null, null, 200).at("/profile/following").booleanValue()).isFalse();
```

## 设计取舍

将关注关系建模为独立记录，可以只读取所关心的那一对用户。另一种写法是在用户类上暴露一个集合，把全部关注对象加载到内存再检查是否包含目标。那种写法在练习数据很少时直观，关注列表很长时却会读入许多无关记录；这个接口只需要回答一个布尔问题。

同一个作者对应许多可能的查看者，因此 `following` 在生成响应时计算。若把它存为作者行上的单个布尔值，则小林关注后，小周也会看到“已关注”。关系表保存共享的事实，响应只组合本次查看者需要的事实。这也说明以后缓存主页数据时，把所有人的个性化字段混在一起会导致错误。

## 常见错误

| 现象 | 从哪里定位 |
| --- | --- |
| A 关注 B 后，B 看 A 时显示已关注 | 用两个不同账号发 GET。比对 `follower_id` 与 `followee_id`，检查是否把查看者与目标的顺序颠倒。 |
| 浏览器匿名能读主页，登录后同一请求返回 401 | 看请求实际带的 `Authorization` 头部，排查过期令牌或错误前缀；直接去掉头部可单独验证匿名读取。 |
| 以为资料不存在会得 404，实际收到 401 | 先区分操作。匿名 GET 查找资料可以得到 404，写入关注关系需要先通过认证。对未知用户名匿名 POST 的官方断言就是 401；有身份后才会进入目标存在性检查。 |
| 界面提示取消成功，刷新又成了已关注 | 单独发送带同一个令牌的 GET。检查 DELETE 的目标用户名、实际受影响的 ID 对，再区分后端关系仍存在还是前端画面过期。 |

## 自测与练习

1. 为什么同一个用户名能对应 `following` 不同的两份正确响应？
2. 若 A 关注 B、B 也关注 A，`follows` 表应有几行？列里各自是什么？
3. 重复发送两次“关注”请求，关系表和两次响应的布尔值应是什么？
4. 一位未登录的游客先后向未知用户名发 GET 资料和 POST 关注，这两个请求的状态码应分别是多少？为什么顺序有意义？
5. A 改了用户名，为什么它以前建立的关注关系不需要逐行更新？

**动手练习。** 在本地注册 A、B 两个临时账号并分别保存令牌。让 A 连续两次关注 B；随后分别以 A、B 和游客三种身份读取 B 的资料。最后由 A 连续两次取消关注，再以 A 的身份读取 B。每一次都记下状态码和 `profile.following`。如果能访问测试数据库，再按 A、B 的实际 ID 查看 `follows` 的记录。

### 参考答案

1. 用户名确定的是作者；`following` 还取决于本次请求的查看者。两个读者与作者之间可以有不同的关系。
2. 两行。第一行的关注者是 A、被关注者是 B，第二行两端对调；这两个复合键不同。
3. 两次成功后只有一条关系，两次响应均为真。成功请求多于一次，状态也能保持一致。
4. GET 是 404，POST 是 401。公开查询可以直接查找目标，保护写入的安全规则先检查凭证，匿名写入不会执行后续资料查找。
5. `follows` 两个外键保存的是稳定的用户主键。修改公开名字只影响今后通过用户名定位该账户时使用的地址。

练习预期：两次 POST 都是 200。随后按 A、B、游客顺序读取 B，均为 200，布尔值依次为真、假、假。两次 DELETE 返回 200 和假；A 最后的 GET 仍为假。若另外让 B 关注 A，则只会增加一条方向相反的边。
