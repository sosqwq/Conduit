# 00 项目总览与开发环境

## 本章做了什么

打开博客首页时，浏览器需要文章标题、作者和标签。它向后端发出 HTTP 请求，后端查询 PostgreSQL，再把结果编码成 JSON 发回浏览器。浏览器负责展示和交互；只有后端持有数据库连接。教程正文还有一条更短的路径：章节以 Markdown 保存在前端目录，随前端一起构建，阅读本章不需要博客账号。

在学习文章查询之前，先观察一次简单的请求。访问 `GET /api/health` 会得到 HTTP 状态码和一段 JSON。它能帮助你区分三个问题：应用进程是否在监听端口，请求是否进入了正确的处理方法，以及后端是否能与数据库通信。本章还会在测试数据库里找出创建这七张业务表的记录。

## 用到的技术

| 名称 | 在这个项目里做什么 | 如果自己动手，需要处理什么 |
| --- | --- | --- |
| Maven | 读取后端的 `pom.xml`，解析依赖及其版本，按顺序编译、测试和打包 Java 程序。 | 下载每个 JAR，计算编译与测试各自的类路径，再分别调用编译器和测试运行器。 |
| Spring Boot 与 Spring MVC | Boot 依据依赖和配置创建组件，启动内嵌 HTTP 服务器。MVC 把 HTTP 方法和路径映射到 Java 方法，并把返回值序列化成 JSON。 | 创建服务器，解析请求，选择处理方法，设置响应头，编码返回值。 |
| Docker Compose | 用一份 YAML 描述开发用的 PostgreSQL 服务。Docker 容器提供独立的进程环境，数据卷能在容器重新创建后保留数据库文件。 | 安装指定版本的 PostgreSQL，创建数据库与账号，维护端口和数据目录。 |
| Flyway | 按版本执行 SQL 迁移，并在数据库里记录执行结果和校验值。第二次启动时，它会核对历史，再执行尚未执行的版本。 | 为每个环境记录已执行的脚本，排序，处理失败，检查历史脚本是否被误改。 |
| JUnit 与 Testcontainers | JUnit 5 的 Jupiter 引擎运行带断言的测试方法。Testcontainers 能为测试启动真正的 PostgreSQL，并把运行时分配的连接地址交给 Spring。 | 自己协调数据库启动时间、端口、账号和测试进程的生命周期。 |
| GitHub Actions | GitHub 按仓库里的工作流启动一台运行器，执行检出、安装工具和测试等步骤，把退出状态附在提交上。 | 在独立机器上手动重建环境，逐步执行检查，再把结果与提交对应。 |

## 代码走读

**第一步，跟踪应用启动。** 在仓库根目录按 README 启动开发数据库和后端。Java 程序先找到数据源配置，用 JDBC 连接 PostgreSQL。JDBC 是 Java 与数据库驱动之间的接口；驱动负责与 PostgreSQL 交换实际的网络消息。Spring Boot 启动时调用 Flyway 应用迁移，然后才有一套可用的表来处理请求。四张实体表存用户、文章、评论和标签，三张关联表存关注、收藏和文章标签。Flyway 自己写在 `flyway_schema_history` 里的记录单独计数。

本机上的数据库保存在哪里？Compose 的这几行给出了两个不同的入口。宿主机通过回环地址和映射端口访问数据库；PostgreSQL 进程把文件写入名为 `conduit-postgres` 的数据卷。改宿主机端口时，还要把后端 JDBC 地址指向新的端口。

来源：`docker-compose.yml`

```yaml
    ports:
      - "127.0.0.1:${POSTGRES_PORT:-5432}:5432"
    volumes:
      - conduit-postgres:/var/lib/postgresql/data
```

**第二步，发起请求。** 对运行中的后端执行 `curl -i http://localhost:8080/api/health`，同时看状态行、响应头和正文。测试类也需要一个服务器。`PostgresIntegrationTest` 的 `@BeforeAll` 方法会在这个测试类的第一项测试前运行，先确定专用测试库的连接信息，再用 SpringApplicationBuilder 启动应用。`server.port=0` 让操作系统挑选空闲端口。服务器启动完成后，测试从 Spring 的环境属性中读取实际端口并保存在字段中。

来源：`backend/src/test/java/dev/conduit/PostgresIntegrationTest.java`

```java
        context = new SpringApplicationBuilder(ConduitApplication.class)
                .initializers(c -> {
                    database.and("server.port=0").applyTo(c.getEnvironment());
                    customize(c);
                })
                .run();
        port = context.getEnvironment().getRequiredProperty("local.server.port", Integer.class);
```

接着，测试用该端口组成 URL，向启动的真实服务器发送与手工检查相同的 GET 请求。

来源：`backend/src/test/java/dev/conduit/BootstrapTest.java`

```java
        var endpoint = URI.create("http://localhost:" + port + "/api/health");
        var response = HttpClient.newHttpClient().send(
                HttpRequest.newBuilder(endpoint).GET().build(), HttpResponse.BodyHandlers.ofString());
```

**第三步，跟踪服务端和返回路径。** Spring 按 HTTP 方法和路径找到健康检查方法。它向数据库发送一次轻量查询，得到结果后返回状态。MVC 把这个 Java 返回值写入 HTTP 响应。测试端的 `BodyHandlers.ofString()` 才负责把响应正文读成 Java 字符串。因此，收到一个字符串只说明通信已经结束；还要断言状态码和返回格式，才能确认服务履行了接口约定。

来源：`backend/src/main/java/dev/conduit/common/HealthController.java`

```java
    @GetMapping("/api/health")
    public ResponseEntity<Map<String, String>> health() {
        try {
            jdbc.sql("SELECT 1").query(Integer.class).single();
            return ResponseEntity.ok(Map.of("status", "UP"));
        } catch (DataAccessException unavailable) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(Map.of("status", "DOWN"));
        }
    }
```

`@GetMapping` 声明 GET 请求的入口。构造方法接收的 `JdbcClient` 负责向数据源发送 SQL，`single()` 在这里读出唯一一行的整数。若已启动的服务此时失去数据库连接，数据库访问异常会走到 `catch` 分支，客户端得到 HTTP 503。若数据库在应用首次启动时就不可用，则应用还可能在 Flyway 阶段退出，客户端会观察到连接失败。

**第四步，核对数据库初始化。** 健康接口有能力查询数据库，还需要独立验证业务表是否齐全。下面是测试直接访问 PostgreSQL 系统目录的地方。系统目录 `pg_tables` 描述已经建好的表；`current_schema()` 限定本次连接使用的模式。模式是同一个数据库中组织表等对象的命名空间。

来源：`backend/src/test/java/dev/conduit/BootstrapTest.java`

```java
        var tables = jdbc.sql("""
                SELECT tablename FROM pg_tables
                WHERE schemaname = current_schema() AND tablename <> 'flyway_schema_history'
                """).query(String.class).list();
        assertThat(tables).containsExactlyInAnyOrder(
                "users", "articles", "comments", "tags", "follows", "favorites", "article_tags");
```

`containsExactlyInAnyOrder` 允许数据库以不同顺序列出表，却要求结果集合完全一致。漏建一张关联表或意外多建一张业务表都会触发失败。测试还单独检查版本 1 的迁移是否成功。比较这两个断言：一个检查数据库现在的结构，另一个检查记录下来的迁移历史。

**第五步，把相同的检查交给 CI。** CI 是“持续集成”，即把可重复的检查绑定到代码提交。这份工作流在推送和拉取请求时自动运行，也支持手工触发。运行器检出仓库、配置 JDK 25，再执行 `./scripts/check.sh`。在本章的里程碑，这条命令依次运行校验器自测、核对教材片段和官方测试文件、执行 Maven 验证。官方 Hurl 与 Playwright 业务场景在相应接口和页面的里程碑接入执行。教程本身也可以测试。每段围栏代码前的“来源”行记录仓库路径；校验器比较完整且连续的源文件行，保留缩进。以本章为例，若测试里给响应多加了一个断言，且它改变了某个引用片段，要同时更新该片段与讲解。可从仓库根目录单独运行 `python3 scripts/check_snippets.py` 定位错误。

## 设计取舍

为什么先学健康接口？完整的文章接口同时涉及登录状态、数据过滤和渲染。观察一次小请求，能把网络故障与数据不符合预期分开。收到健康响应后，应继续用文章或迁移测试验证具体业务约束；一条轻量查询能够成功，不足以证明所有业务表和索引都建对了。

数据库版本由迁移文件管理。靠开发者的本地数据库“刚好能跑”，无法告诉下一台机器该执行哪些变更。把建表 SQL 随代码提交后，空库可以从头执行，已有环境可以按顺序升级。发布过的版本保留原文，新的结构变化写进后续版本，便于比较两个版本之间发生的改变。

测试使用真实 PostgreSQL，因此需要容器或专用测试库，第一次启动比纯内存测试更慢。这个成本换来的是实际的 PostgreSQL 方言、外键和事务行为。健康检查走真实 HTTP 端口，也能覆盖路由、序列化和服务器配置；只调用一个 Java 方法无法覆盖这些边界。

## 常见错误

| 看见的现象 | 沿哪条路径排查 |
| --- | --- |
| Maven 报 `release version 25 not supported` | 执行 `mvn -version` 查看它实际使用的 JDK 路径和版本。安装 JDK 25 后也要让当前终端的 `JAVA_HOME` 指向该 JDK。 |
| 健康请求报 `Connection refused` | 先查看后端启动日志和监听端口。如果应用在初始化数据源时退出，浏览器的错误只反映“没有进程接收请求”。接着用 `docker compose ps` 与 `docker compose logs` 查看数据库。 |
| PostgreSQL 报 `password authentication failed` | 核对应用使用的数据库地址、账号及密码。已有数据卷会保留创建时设定的账号，改 Compose 文件后重新启动并不会自动改掉数据库内的密码。 |
| Flyway 报 `Migration checksum mismatch` | 比较工作区与已发布版本中的同一迁移。恢复已应用脚本的原文，把新变更写入下一个版本；保留当前数据库的历史记录供核对。 |
| Testcontainers 报 `Could not find a valid Docker environment` | 在运行 Maven 的同一终端执行 `docker info`，确认可以访问 Docker 服务。若使用专用 PostgreSQL 测试库，按后端测试配置传入该库的 JDBC 地址和账号。 |

## 自测与练习

1. 浏览器请求文章时，哪一个进程持有数据库密码？教程页面的 Markdown 又从哪里获得？
2. 假设版本 1 的建表脚本在同一数据库上已经成功执行过，第二次启动时 Flyway 怎样知道该做什么？
3. 健康接口返回 200 后，为什么测试还要查询 `pg_tables`？
4. 用随机端口启动测试服务器有什么好处？测试代码怎样得到最终地址？
5. 如果教程把源文件的一行缩短成半行，为什么即使文字能在原文件里搜索到，片段校验也应失败？

**动手练习。** 找到本章引用 `BootstrapTest.java` 创建 `endpoint` 的一行，只删掉该行开头的一个空格，保留源文件原样，运行 `python3 scripts/check_snippets.py`。记下报错中的章节行号和源文件路径，再恢复该空格并重新运行。解释两次结果为何不同。这个练习只需 Python，无需启动数据库。

### 参考答案

1. 后端持有连接数据库所需的配置。教程章节来自构建进前端的 Markdown，阅读时无需查询文章表。
2. Flyway 从数据库自己的模式历史表读取已成功执行的版本及校验值，再与仓库中的迁移进行比对。历史一致时，只有新增的迁移需要执行。
3. 能连上数据库并完成一次简单查询，与七张业务表是否存在是两个可分别验证的事实。后者需要查询系统目录或实际操作相应的数据表。
4. 随机端口可避免与另一个测试进程抢占固定端口。测试以 `server.port=0` 启动应用，从 Spring 环境的 `local.server.port` 属性读取实际端口，再用它构造请求的完整 URL。
5. 作者标注的是源文件中的连续代码行。允许任意子串会让漏掉条件或参数的教程继续通过，也使它无法可靠展示原代码的缩进和结构。

练习的第一次运行应定位到引用 `BootstrapTest.java` 构造 HTTP 请求的代码块；恢复空格后，该段和源文件重新逐行一致。退出码也从非零变为零，GitHub Actions 依靠同一信号判断步骤是否通过。
