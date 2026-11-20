# Conduit 博客平台

按 RealWorld 规范构建的 Java 25 / Spring Boot / PostgreSQL / React 教学项目。当前快照提供 M0 后端骨架、数据库迁移、真实 HTTP 健康检查，以及第 00 章中文教程。账户、文章 API 和 React 页面由后续里程碑交付。

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

## 运行 M0 的全部检查

要求 Python 3.9+、JDK 25、Maven 和可用的 Docker 服务。测试默认通过 Testcontainers 启动单独的 PostgreSQL 实例。无需先启动开发服务器。下载依赖和数据库镜像需要网络。

```sh
./scripts/check.sh
```

没有 Docker 时，可以在上述命令所在的终端设置 `CONDUIT_TEST_DB_URL`、`CONDUIT_TEST_DB_USERNAME` 和 `CONDUIT_TEST_DB_PASSWORD`，指向一个空的、可写的专用 PostgreSQL 测试库。测试会在其中运行迁移和写入断言。脚本依次运行教程校验器测试、教程代码片段核对、官方文件完整性核对以及 Maven 的测试和打包。每次 push 和 pull request 使用同一入口。

## 阅读与验收

- [规格](docs/SPEC.md)、[工作方式](docs/WORKFLOW.md)、[系统设计与完整建表 SQL](docs/DESIGN.md)
- [里程碑进度与已执行的检查](docs/PROGRESS.md)
- [第 00 章：项目总览与开发环境](frontend/src/tutorial/chapters/00-environment.md)
- [官方 Hurl 和 Playwright 测试的版本、运行方法与前置条件](scripts/official.md)
