# Conduit 博客平台

Conduit 是一个可用来学习全栈开发的博客。作者可以发布 Markdown 文章并与读者讨论，读者可以关注作者、收藏文章，或按标签查找内容。后端使用 Java 25、Spring Boot 和 PostgreSQL，前端使用 React 和 TypeScript。公开的中文教程逐章对应本仓库实现。

## 用 Docker 本地启动完整网站

准备 Git、Docker Engine、支持 `--wait` 的 Docker Compose、Bash 和 OpenSSL，然后执行以下命令。首次构建会下载镜像和依赖。

```sh
git clone https://github.com/sosqwq/Conduit.git
cd Conduit
./scripts/init-production-env.sh
docker compose --env-file .env.production -f compose.production.yml up -d --build --wait
```

打开[本地博客](http://localhost:8080)或[中文教程](http://localhost:8080/tutorial)。从 **Sign up** 注册，使用 **New Article** 发文。在另一个浏览器的无痕窗口注册第二个账号，可以给第一篇文章写评论、收藏文章，并在作者主页点击 **Follow**。首页的 **Your Feed** 会显示这位作者的文章。教程无需登录。

本地完整站默认占用 8080。若端口已使用，可在 `.env.production` 增加 `CONDUIT_HTTP_PORT=8088`，重新执行同一条 Compose 命令，然后改用 8088。以下命令停止服务并保留数据库卷。重新执行上面的启动命令即可继续使用已有账号和文章。

```sh
docker compose --env-file .env.production -f compose.production.yml stop
```

## 分别运行后端和前端进行开发

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

## 部署到自己的服务器

在能运行 Docker Compose 的服务器上执行完整网站的启动命令。把域名指向服务器，在已有的 HTTPS 反向代理中将该站点转发到 `127.0.0.1:8080`，或转发到配置的 `CONDUIT_HTTP_PORT`。浏览器通过同一站点的 `/api` 访问 Spring Boot。PostgreSQL 数据放在命名卷中；请备份数据库和服务器上的 `.env.production`。保留同一个数据库密码与 JWT 签名密钥后可重建容器。

`./scripts/init-production-env.sh` 仅首次创建凭据，文件权限是 0600。本地同源 HTTP 访问可将 `CONDUIT_ALLOWED_ORIGINS` 留空。若公网 TLS 由反向代理终止，请在 `.env.production` 中把 `CONDUIT_ALLOWED_ORIGINS` 设为浏览器实际使用的 HTTPS 来源，例如 `https://blog.example.org`，并重新执行启动命令。前后端分开部署时也用该变量指定允许访问的前端来源。多个来源以逗号分隔，每项包含协议和主机名，非标准端口也需写入。部署完成后，用实际域名打开首页、`/tutorial/09` 与 `/api/health`，再从手机网络复验。当前公开部署状态见[里程碑进度](docs/PROGRESS.md)。

## 运行全部自动检查

要求 Node 22.12+（推荐 24）、Python 3.9+、JDK 25、Maven、Hurl 8.1.0、OpenSSL 和可用的 Docker 服务。测试默认通过 Testcontainers 启动单独的 PostgreSQL 实例。无需先启动开发服务器。下载依赖和数据库镜像需要网络。

```sh
./scripts/check.sh
```

没有 Docker 时，可以在上述命令所在的终端设置 `CONDUIT_TEST_DB_URL`、`CONDUIT_TEST_DB_USERNAME` 和 `CONDUIT_TEST_DB_PASSWORD`，指向一个空的、可写的专用 PostgreSQL 测试库。测试会在其中运行迁移和写入断言。脚本核对教程与上游文件，再安装前端锁定依赖，执行类型检查、Lint、组件测试和生产构建。随后从头打包后端，运行完整 Hurl 套件、全部官方 Playwright 用例，以及文章改名、双账号互动和教程导航的浏览器检查。首次执行需要下载 Chromium。每次 push 和 pull request 使用同一入口，并在有 Docker 的 GitHub 运行器上执行 `./scripts/check-production.sh` 验证生产镜像及数据库持久化。

## 阅读与验收

- [规格](docs/SPEC.md)、[工作方式](docs/WORKFLOW.md)、[系统设计与完整建表 SQL](docs/DESIGN.md)
- [里程碑进度](docs/PROGRESS.md)、[从空库开始的验收命令和结果](docs/ACCEPTANCE.md)、[独立审查与修复记录](docs/REVIEW.md)
- [第 00 章：项目总览与开发环境](frontend/src/tutorial/chapters/00-environment.md)
- [第 01 章：注册与登录](frontend/src/tutorial/chapters/01-authentication.md)
- [第 02 章：资料与关注](frontend/src/tutorial/chapters/02-profiles.md)
- [第 03 章：文章增删改查](frontend/src/tutorial/chapters/03-articles.md)
- [第 04 章：文章列表与信息流](frontend/src/tutorial/chapters/04-lists-and-feed.md)
- [第 05 章：评论与收藏](frontend/src/tutorial/chapters/05-comments-and-favorites.md)
- [第 06 章：前端骨架与鉴权](frontend/src/tutorial/chapters/06-frontend.md)
- [第 07 章：首页与文章](frontend/src/tutorial/chapters/07-home-and-articles.md)
- [第 08 章：个人主页与互动](frontend/src/tutorial/chapters/08-profile-interactions.md)
- [第 09 章：部署上线](frontend/src/tutorial/chapters/09-deployment.md)
- [官方 Hurl 和 Playwright 测试的版本、运行方法与前置条件](scripts/official.md)
