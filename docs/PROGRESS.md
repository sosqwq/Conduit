# 里程碑进度

## M0 · 项目骨架（已通过）

本地验收日期为 2026-11-20。使用 JDK 25、Spring Boot 4.2.0、JUnit Jupiter 5.14.4、Maven 3.9.11 和全新初始化的 PostgreSQL 17.12 实例。CI 默认通过 Testcontainers 提供 PostgreSQL。当前本地环境没有 Docker 服务，采用专用测试库执行相同的测试代码。

| 项目 | 实际执行 | 结果 |
| --- | --- | --- |
| 一键检查 | 从全新 Git 检出运行 `./scripts/check.sh` | 退出码 0，Maven verify 返回 BUILD SUCCESS |
| 后端集成 | 真实 HTTP 请求、Flyway 七表及历史、删除文章后清理评论/收藏/标签关联 | 3 项通过，0 失败、0 错误、0 跳过 |
| 教程 | 校验器单测；逐段核对第 00 章 | 6 项测试通过，5 段代码匹配 |
| 上游完整性 | 核对固定提交的完整 API 和 E2E 目录、官方样式/头像和许可证 | 204 个文件与上游 Git blob 一致 |
| 官方套件发现 | 以 Hurl 8.1.0 解析 13 份用例，以 Playwright 1.62.1 执行 `./scripts/official.sh e2e --list` | 13 份 Hurl 均可解析，识别到 12 个浏览器测试文件、140 项用例。此处只验证加载 |
| 打包启动 | 在另一空库上以 `java -jar` 启动产物，再 GET /api/health | HTTP 200，响应为 `{"status":"UP"}` |
| GitHub Actions | [运行 44814454544](https://github.com/sosqwq/Conduit/actions/runs/44814454544)，verify 和 milestone 作业均成功 | 已通过，[m0](https://github.com/sosqwq/Conduit/tree/m0) 指向 51e316f |

官方接口断言从 M1 开始执行，官方浏览器用例从 M6 开始执行。阶段标签由通过检查的 GitHub Actions 作业创建。

## M1 · 注册与登录（已通过）

在新的 PostgreSQL 17.12 测试库中执行注册、登录、读取和更新用户。采用 BCrypt 保存密码，JWT 中的数字 ID 在改名后仍能定位用户。测试以真实 HTTP 覆盖账户冲突、字段校验、匿名请求、无效身份以及更新字段的保留与清空。

| 检查 | 结果 |
| --- | --- |
| JUnit 与 Maven | `clean verify` 打包成功，12 项通过，0 项跳过 |
| 官方 Hurl | `auth.hurl` 20 个请求、`errors_auth.hurl` 23 个请求，全部通过 |
| 教程及上游完整性 | 6 项校验器测试通过，第 00–01 章共 11 段代码匹配，204 个上游文件一致 |
| CI 与阶段标签 | [运行 44815407940](https://github.com/sosqwq/Conduit/actions/runs/44815407940) 成功，正式标签 [m1](https://github.com/sosqwq/Conduit/tree/m1) 指向 a9c7a41 |

## M2 · 资料与关注（已通过）

匿名读者可查看个人资料。登录后的 following 针对当前读者计算，重复关注和重复取消都能收敛到目标状态。公开资料的四个字段由 ProfileView 定义，关注方向由 follows 联合主键确定。

| 检查 | 结果 |
| --- | --- |
| 独立检出与空库 | `./scripts/check.sh` 退出 0，Maven clean verify 成功，15 项测试通过、0 跳过 |
| 官方接口 | 四份 Hurl 文件共 56 个请求，全部通过 |
| 教程和官方文件 | 6 项校验器自测通过，17 个教学代码片段匹配，204 个上游文件一致 |
| 阶段标记 | [运行 44816108957](https://github.com/sosqwq/Conduit/actions/runs/44816108957) 成功，[m2](https://github.com/sosqwq/Conduit/tree/m2) 指向 83b30f1 |
