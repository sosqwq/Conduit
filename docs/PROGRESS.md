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
