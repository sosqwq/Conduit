# Conduit 博客平台

按 RealWorld 规范构建的 Java 25 / Spring Boot / PostgreSQL / React 教学项目。后端提供 19 个 RealWorld 接口，支持账户、关注、文章与标签、评论、收藏，以及按作者、标签和收藏者组合筛选的分页列表。登录用户可阅读关注作者的信息流。React 前端支持注册、登录和账户设置，中文教程阅读器可匿名访问。

## 本地启动

准备 JDK 25、Maven 3.9、Docker Engine 及 Docker Compose v2。下面的命令在仓库根目录执行。

```sh
docker compose up -d --wait db
mvn -f backend/pom.xml spring-boot:run
```

在另一终端执行以下命令。正常时返回 HTTP 200，正文为 `{"status":"UP"}`。

```sh
curl -i http://localhost:8080/api/health
```

后端默认用本机端口 5432 上的 conduit 数据库，开发账号和密码均为 conduit。可用 `DATABASE_URL`（JDBC 格式）、`DATABASE_USERNAME`、`DATABASE_PASSWORD` 和 `PORT` 覆盖。若 Compose 使用自定义 `POSTGRES_PORT`，请同步调整 JDBC 地址。按 Ctrl+C 结束后端，使用 `docker compose stop db` 停止数据库并保留数据。

### 在浏览器中打开前端

保持后端运行，另开终端，在仓库根目录执行以下命令（Node.js 22.12+，推荐 Node 24）。

```sh
cd frontend
npm ci
npm run dev
```

打开 [本地首页](http://localhost:5173) 注册或登录，或直接阅读[中文教程](http://localhost:5173/tutorial)。Vite 默认将同源 `/api` 请求转发到 `http://127.0.0.1:8080`，自定义后端地址可用 `CONDUIT_API_TARGET`。教程内容已打包在前端，匿名阅读无需数据库。

## 试用账户接口

后端启动后，可发起以下注册请求。把返回的 `user.token` 放在 `Authorization: Token <jwt>` 头部即可访问 `GET /api/user` 和 `PUT /api/user`。再次登录用 `POST /api/users/login`，请求体为含 email 和 password 的 user 对象。

```sh
curl -sS http://localhost:8080/api/users -H 'Content-Type: application/json' \
  -d '{"user":{"username":"reader","email":"reader@example.test","password":"local-example-pass"}}'
```

开发时如需让登录令牌在后端重启后仍然有效，请将同一个 Base64 编码密钥放在环境变量 `CONDUIT_JWT_SECRET` 中，可用 `openssl rand -base64 48` 生成。未配置时，开发进程会产生临时密钥。

## 运行当前阶段的全部检查

要求 Node 22.12+（推荐 24）、Python 3.9+、JDK 25、Maven、Hurl 8.1.0、OpenSSL 和可用的 Docker 服务。测试默认通过 Testcontainers 启动单独的 PostgreSQL 实例。无需先启动开发服务器。下载依赖和数据库镜像需要网络。

```sh
./scripts/check.sh
```

没有 Docker 时，可以在上述命令所在的终端设置 `CONDUIT_TEST_DB_URL`、`CONDUIT_TEST_DB_USERNAME` 和 `CONDUIT_TEST_DB_PASSWORD`，指向一个空的、可写的专用 PostgreSQL 测试库。测试会在其中运行迁移和写入断言。脚本核对教程与上游文件，再安装前端锁定依赖，执行类型检查、Lint、组件测试和生产构建。随后从头打包后端，运行完整 Hurl 套件、当前阶段的官方 Playwright 用例，以及教程浏览器检查。首次执行需要下载 Chromium。每次 push 和 pull request 使用同一入口。

## 阅读与验收

- [规格](docs/SPEC.md)、[工作方式](docs/WORKFLOW.md)、[系统设计与完整建表 SQL](docs/DESIGN.md)
- [里程碑进度与已执行的检查](docs/PROGRESS.md)
- [第 00 章：项目总览与开发环境](frontend/src/tutorial/chapters/00-environment.md)
- [第 01 章：注册与登录](frontend/src/tutorial/chapters/01-authentication.md)
- [第 02 章：资料与关注](frontend/src/tutorial/chapters/02-profiles.md)
- [第 03 章：文章增删改查](frontend/src/tutorial/chapters/03-articles.md)
- [第 04 章：文章列表与信息流](frontend/src/tutorial/chapters/04-lists-and-feed.md)
- [第 05 章：评论与收藏](frontend/src/tutorial/chapters/05-comments-and-favorites.md)
- [第 06 章：前端骨架与鉴权](frontend/src/tutorial/chapters/06-frontend.md)
- [官方 Hurl 和 Playwright 测试的版本、运行方法与前置条件](scripts/official.md)
