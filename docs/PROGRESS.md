# 里程碑进度

## M0 · 项目骨架

本地验收日期为 2026-11-20。使用 JDK 25、Spring Boot 4.2.0、JUnit Jupiter 5.14.4、Maven 3.9.11 和全新初始化的 PostgreSQL 17.12 实例。CI 默认通过 Testcontainers 提供 PostgreSQL。当前本地环境没有 Docker 服务，采用专用测试库执行相同的测试代码。

| 项目 | 实际执行 | 结果 |
| --- | --- | --- |
| 一键检查 | 从全新 Git 检出运行 `./scripts/check.sh` | 退出码 0，Maven verify 返回 BUILD SUCCESS |
| 后端集成 | 真实 HTTP 请求、Flyway 七表及历史、删除文章后清理评论/收藏/标签关联 | 3 项通过，0 失败、0 错误、0 跳过 |
| 教程 | 校验器单测；逐段核对第 00 章 | 6 项测试通过，5 段代码匹配 |
| 上游完整性 | 核对固定提交的完整 API 和 E2E 目录、官方样式/头像和许可证 | 204 个文件与上游 Git blob 一致 |
| 打包启动 | 在另一空库上以 `java -jar` 启动产物，再 GET /api/health | HTTP 200，响应为 `{"status":"UP"}` |
| GitHub Actions | 工作流使用同一检查入口，等待远程运行记录 | 待远程验证 |

应用还处于骨架阶段。官方接口断言从 M1 开始执行，官方浏览器用例从 M6 开始执行。M1–M9 尚未验收。阶段标签在通过该阶段所要求的检查后创建。
