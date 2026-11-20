# 从零验收

验收日期为 2026-11-20。验收从新的 Git 检出、空 PostgreSQL 数据目录和重新构建的前后端产物开始。账号、文章和互动数据由测试创建。另在 GitHub 托管运行器上新建了独立 Docker Compose 项目，验证打包后的对外入口及替换容器后的数据。

修复版源码可在 [131ccf6](https://github.com/sosqwq/Conduit/tree/131ccf612775206d3839b31b2159527fc7be58b0) 查看。

## 复现命令

准备 Git、JDK 25、Maven、Node 24、Python 3.9+、Hurl 8.1.0、OpenSSL 和支持 Docker Compose 的 Docker Engine，然后在新目录执行以下命令。

```sh
git clone https://github.com/sosqwq/Conduit.git
cd Conduit
./scripts/check.sh
./scripts/check-production.sh
```

第一条检查命令使用 Testcontainers 的专用 PostgreSQL 测试库、另一个 HTTP 验收库、打包的 Spring Boot JAR 和 Vite 生产产物。没有 Docker 的本地验收，在新的临时目录用 `initdb` 初始化 PostgreSQL 17.12，把 `CONDUIT_TEST_DB_URL`、`CONDUIT_TEST_DB_USERNAME`、`CONDUIT_TEST_DB_PASSWORD` 指向该空库，然后运行相同的 `./scripts/check.sh`。第二条检查命令需要真实 Docker。它生成独立项目名、端口、强密码与签名密钥，结束时清理该次测试使用的资源。

## 实际结果

| 检查 | 验收结果 |
| --- | --- |
| Java 与 PostgreSQL | `mvn clean verify` 成功，45 项集成及单元测试通过，无跳过。覆盖账号、资料、文章、评论、收藏、筛选分页、数据库查询次数、JWT、生产配置与 CORS |
| RealWorld API | 上游完整 Hurl 套件共 13 份文件、157 个请求全部成功；独立审查另以两个真实账号走通 19 个接口 |
| React | `npm ci`、TypeScript、ESLint、60 项 Vitest 以及 Vite 生产构建通过 |
| 官方浏览器 | 未提供用例筛选器，12 个文件、140 项全部执行。最终全新本地检出共有 138 项首试通过；上游演示站的只读健康请求和连续保存设置后立即读取资料各经一次上游配置的重试通过，0 跳过、0 最终失败。修复版 GitHub Actions 同一套 140 项全部首次通过（2.1 分钟），另外四项项目浏览器用例也首次通过 |
| 项目浏览器 | 四项 Chromium 测试验证文章改名与关联评论、双账号的关注及收藏、全部十章匿名阅读，以及手机宽度下的章节导航 |
| 教程与上游完整性 | 9 项工具测试、10 章、61 段源码核验通过；204 个上游文件逐一核对。删除一章并加入重复编号会使验收失败 |
| 生产容器 | GitHub Actions 通过真实 Compose 构建和启动，两阶段镜像通过 web 暴露站点。首页、深链、JS/CSS/头像、缺失资源 404、API 响应缓存头、同源注册登录与发文均正常。移除并重建容器后，旧令牌、原密码与原文章均可用 |
| 公网地址 | 待验收。当前没有可用的外部应用托管目标；在公网域名或服务器上完成部署并复验后，才能创建 `m9` 标签 |

[生产容器首次验收的原始作业](https://github.com/sosqwq/Conduit/actions/runs/44827225498/job/136602774549#step:7:1) · [审查修复版的完整 GitHub 作业及生产容器结果](https://github.com/sosqwq/Conduit/actions/runs/44828375382/job/136606696745) · [独立验收记录](REVIEW.md)

## 部署后的公网复验

将下列占位地址替换为真实站点，从服务器之外的网络执行。然后打开站点，注册、发文，用第二个账号发表评论、收藏文章、关注作者，并打开 `/tutorial/09`。公开流量需经过 HTTPS 入口转发到同一套已验收的服务。

```sh
python3 scripts/check-web-routing.py https://blog.example.org
curl --fail --show-error https://blog.example.org/api/articles
```
