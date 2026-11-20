# 01 注册与登录

## 本章做了什么

假设你刚刚注册了一个账号。服务器从注册请求中收到密码，只把密码验证所需的数据写入 PostgreSQL，再返回一个登录令牌。下一次打开设置页，浏览器带着这个令牌取回最新资料。下面四个接口承担这段流程。

| 操作 | 方法与地址 | 成功时可观察到什么 |
| --- | --- | --- |
| 注册 | `POST /api/users` | HTTP 201，`user` 中有用户名、邮箱、个人简介、头像和令牌。 |
| 登录 | `POST /api/users/login` | HTTP 200，返回该账号的用户资料和令牌。 |
| 取当前用户 | `GET /api/user` | HTTP 200，服务器按请求头里的身份读取账号。 |
| 修改当前用户 | `PUT /api/user` | HTTP 200，返回更新后的账号；下一次 GET 可验证更新已保存。 |

这里有三个名字容易混淆。`username` 是公开展示的名字，`email` 是登录时提交的账号，而数据库里的 `id` 由服务器分配。用户改名或改邮箱时，这个 ID 继续指向原来那一行。

## 用到的技术

- **Spring MVC 与数据传输对象（DTO）。** 控制器用注解声明某个路径应由哪个方法处理。框架把请求中的 JSON 读入 Java 对象，再把返回值写成 JSON。DTO 封装一次接口调用需要交换的字段。自己实现这层逻辑，需要逐个判断 HTTP 方法、路径和 JSON 字段，写完返回值还要设置状态与格式。
- **参数校验。** “JSON 能解析”和“数据可以注册”是两步。把一个空串放进 `email` 是合法 JSON，业务层仍然需要拒绝。字段约束与统一错误处理让浏览器拿到可以定位到输入框的错误，例如 `errors.email[0]`。逐个控制器拼装错误容易出现不同格式。
- **BCrypt 与盐。** BCrypt 是专为保存密码设计的单向哈希。编码器会生成随机盐并把工作因子、盐和散列结果一同编码；工作因子决定计算一次需要多少工作。验证时把用户提交的密码和上次保存的编码交给 `matches`。如果每次重新编码再比较两串字符，随机盐会使结果不同。[Spring Security 密码存储文档](https://docs.spring.io/spring-security/reference/features/authentication/password-storage.html)
- **JWT（JSON Web Token）。** 本项目的令牌把身份声明与签名编码成可以放进 HTTP 头部的文本。签名允许接收方校验令牌是否由持有密钥的一方签发、内容是否完整；过期时间限定能使用多久。签名令牌中的声明可以读到，密码和密码哈希都不应成为声明。[JWT 标准](https://www.rfc-editor.org/rfc/rfc7519)
- **Spring Security 过滤器链。** 过滤器在控制器前依次运行，可处理凭证、设置本次请求的身份，也可以直接发送错误响应。安全上下文保存本次请求已验证的身份，业务代码因此能获取同一用户。每个控制器各自解析头部、重复校验签名，会让身份规则分散在各处。[Spring Security 过滤器架构](https://docs.spring.io/spring-security/reference/servlet/architecture.html)

## 代码走读

**注册。** 打开官方 Hurl 文件看接口原貌。`{{uid}}` 是每轮验收注入的唯一后缀，让重复运行的测试各自创建独立账号。`user` 是 JSON 对象的外层名称，注册和登录走不同地址。

来源：`scripts/official-specs/specs/api/hurl/auth.hurl`

```hurl
POST {{host}}/api/users
{
  "user": {
    "username": "auth_{{uid}}",
    "email": "auth_{{uid}}@test.com",
    "password": "password123"
  }
}
HTTP 201
```

进入 MVC 后，`UserController` 的类级路径 `/api` 与方法级路径 `/users` 组合成注册地址。`@RequestBody` 把请求体读为 `RegisterRequest`，`@Valid` 触发字段校验；请求对象也对嵌套的 `user` 开启了校验。因此邮箱格式错误会在进入下面的业务方法前返回 422。`Registration` 的构造方法去掉用户名、邮箱首尾空白，并把邮箱转成小写；密码保持用户提交的字符。

用户名也用于个人主页和关注接口的路径。独立的 `.`、`..`、包含斜杠、反斜杠、分号或百分号的名称在现有 HTTP 路径上无法稳定定位用户。注册和显式改名会拒绝这些值、纯空白名以及保留在名称里的控制字符，并返回 `errors.username` 和 422。中文、带重音的字母、内部普通空格、连字符和夹在字母间的点都能用于用户名。旧账号仍可以邮箱登录，到设置页选择新名字。

来源：`backend/src/main/java/dev/conduit/user/UserService.java`

```java
    @Transactional
    public Envelope register(Registration input) {
        String hash = encodePassword(input.password());
        User user = users.saveAndFlush(new User(input.username(), input.email(), hash));
        return response(user);
    }
```

事务把这次业务写入划定为一个整体。`encodePassword` 核对密码至少八个 Unicode 码点且 UTF-8 编码不超过 72 字节，再调用 BCrypt。`saveAndFlush` 把用户实体的写入同步到数据库，这时唯一约束就可以发现重复。`response` 根据数据库分配的 ID 签发令牌，将允许返回的五个字段组成 `Envelope`。事务成功提交后，客户端才能收到成功响应。

**登录并取当前账户。** 客户端向登录地址提交邮箱和密码，成功后从 `user.token` 取出令牌。Hurl 的 `[Captures]` 会把响应里取出的值保存在变量中，后续请求与浏览器一样发送 `Authorization` 头部。两处请求分别验证“这次密码正确”和“这个令牌能证明请求者的身份”。

登录服务先按归一化的邮箱查询用户。若查无账号，下面的 `dummyHash` 是服务启动时生成的占位编码，可让常规长度密码仍经过一次 BCrypt 比较。它不对应任何可登录的用户。`valid` 与账号存在性共同决定结果。验证失败抛出的异常由统一处理器转换成带 `errors.credentials` 的 401，成功时复用注册时的响应组装逻辑。

来源：`backend/src/main/java/dev/conduit/user/UserService.java`

```java
        User user = users.findByEmail(input.email()).orElse(null);
        boolean valid = input.password().getBytes(StandardCharsets.UTF_8).length <= 72
                && passwords.matches(input.password(), user == null ? dummyHash : user.passwordHash);
        if (!valid || user == null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "credentials", "invalid");
        }
        return response(user);
```

来源：`scripts/official-specs/specs/api/hurl/auth.hurl`

```hurl
[Captures]
token: jsonpath "$.user.token"

# Get current user
GET {{host}}/api/user
Authorization: Token {{token}}
HTTP 200
```

**从令牌到 Java 用户 ID。** 先看签发端。`issuer` 是签发方，值为 `conduit`；`subject` 是主体，值为数据库主键的十进制文本；`issuedAt` 与 `expiresAt` 分别记录签发和到期时刻。有效期为七天。HS256 表示发送方和验证方用同一密钥计算或核对消息认证码。编码器负责生成符合标准的令牌文本。

来源：`backend/src/main/java/dev/conduit/common/TokenService.java`

```java
        var claims = JwtClaimsSet.builder()
                .issuer(ISSUER).subject(Long.toString(userId))
                .issuedAt(now).expiresAt(now.plus(LIFETIME)).build();
        var header = JwsHeader.with(MacAlgorithm.HS256).build();
        return encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
```

再看接收端。带头部的请求先进入 `TokenFilter`，它确认前缀是 `Token `，再取出余下的文本。`verify` 使用配置的算法和密钥检查签名、签发方和时间，要求令牌有到期时刻，并把主体解析成正数 ID。随后还需要查库确认账号存在。下面最后三行建立本次请求的安全上下文；此时身份对象里的 principal（主体）就是这个 ID。

来源：`backend/src/main/java/dev/conduit/common/TokenFilter.java`

```java
                long id = tokens.verify(header.substring(6));
                if (!users.existsById(id)) {
                    reject(response, false);
                    return;
                }
                var context = SecurityContextHolder.createEmptyContext();
                context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(id, null, List.of()));
                SecurityContextHolder.setContext(context);
```

请求通过过滤器后，Spring Security 再根据路径决定是否要求身份：匿名请求可以注册或登录，读取当前用户则需要身份。到达业务代码时，`CurrentUser.requiredId()` 从安全上下文获取已验证 ID。客户端即使向请求体增加一个自己填写的 ID，也无法借此选择他人的账号。

**修改。** 当请求的地址是 `PUT /api/user`，目标账号由当前身份确定。用户只提交要改的字段。省略 `bio` 应保留旧简介，显式提交 `"bio": null` 或空串会清除简介；`image` 同理。邮箱与用户名是必填属性，显式清空会返回 422。保存之后再发 GET，读到新值才说明刚才的写入跨过了数据库边界。实现接收保留 JSON 字段信息的 `JsonNode`，先用 `has` 判断键是否出现，再看字段值是否为 null。若直接把这两种情况都绑定为一个可空的 Java 字段，就会丢失用户的意图。

## 设计取舍

将登录身份记录为数据库的数字主键，可以在用户修改邮箱后继续查到同一个人。若用邮箱定位用户，则更换邮箱会改变定位条件，已经签发的令牌也要跟着处理。响应 DTO 可以独立选择允许发送的五个字段，数据库里的主键、哈希无需交给浏览器；数据库增列也不会改变公开协议。

用会话存登录状态时，浏览器通常持有一个会话标识，服务器要为它保存和查找对应的会话。这个项目采用无状态认证：每次请求都重新验证携带的令牌。它省去会话存储，却要求每个接收请求的服务实例使用兼容的验证配置。本地未设置密钥时，每次启动会临时生成一把密钥；因此重启服务可能导致刚才使用的令牌失效。生产环境要求通过 `CONDUIT_JWT_SECRET` 配置密钥。

唯一性校验有一个时间差。两个注册请求可能几乎同时发现邮箱还没人使用，只有数据库的唯一约束能在写入时完成最终裁决。重复邮箱或用户名会得到 409；格式错误或字段为空则是 422。这两类错误都带字段名，界面可以在相应输入框旁显示信息。

## 常见错误

| 现象 | 怎么查 |
| --- | --- |
| 注册返回 422，`errors.email` 提示 `is invalid` | 打开请求正文，检查实际发送的邮箱，并确认 JSON 按 `user` 包装。先看服务端点名的字段，再检查前端表单怎样取值。 |
| 注册返回 409，`errors.username` 提示 `has already been taken` | 换一个未使用的用户名，或者登录先前创建的账号。重跑手工测试时也需考虑上次使用的邮箱。 |
| 登录返回 401，`errors.credentials` 提示 `invalid` | 对照当前使用的测试账号和密码。账号或密码不匹配时，响应都使用同一个错误字段。 |
| 已拿到令牌，读 `/api/user` 仍然返回 401 | 核对路径的单数 `user`，并在实际发出的请求里核对头部名称、`Token` 前缀、空格和令牌值。已过期的令牌需要重新登录。 |

## 自测与练习

1. 为什么数据库中的密码编码不能靠“再次编码新输入，比较两个字符串”来验证？
2. 已经知道能从 JWT 文本里读出用户 ID，服务器还要核对哪些条件？
3. 下列三种请求分别得到什么状态：缺少请求头读取当前用户、注册时填错邮箱格式、注册时邮箱已被占用？
4. 同时收到两次使用同一邮箱的注册请求，为什么应用先做一次查询仍然不足以保证唯一？
5. 设置页面只改了头像。为了保留原简介，请求 JSON 中应该怎样处理 `bio`？如果要明确清空它又怎么办？

**动手练习。** 在本地开发库创建一个临时账号，登录并保存响应里的令牌。带上令牌修改个人简介，再用同一令牌单独读当前用户，记录返回的简介。接着清空简介，再次读取；最后从一次 GET 请求中去掉整个 `Authorization` 头部。预测这三次 GET 的状态码和响应字段，再与实际结果核对。可以参照本章引用的 Hurl 文件依次构造请求。

### 参考答案

1. BCrypt 编码包含随机盐。让 `matches` 从之前保存的编码中取得盐和工作因子，再对本次明文输入计算并核对结果。
2. 要用约定的算法和密钥校验签名，核对签发方、有效期及正整数主体，才能把令牌所指的身份用于授权；还需能找到对应的用户行。
3. 依次是 401（缺少凭证）、422（字段校验失败）、409（唯一值冲突）。`errors` 下的字段可进一步区分失败原因。
4. 两次查询可能先后都看到空结果。如果写入之间没有排他约束，两个请求都会以为自己可以创建。数据库的唯一约束在最终写入时裁决冲突。
5. 保留简介时省略 `bio`。清除简介时显式提交 `null` 或空串，随后读取时 `user.bio` 应为 `null`。

练习参考结果：第一次 GET 返回 200 和新简介，第二次返回 200 且 `user.bio` 为 `null`，最后一次返回 401 且 `errors.token[0]` 为 `is missing`。这三次读取验证的是持久化的资料、清空操作的语义，以及无凭证请求的边界。
