# RealWorld 官方验收

固定版本为 [realworld-apps/realworld 的提交 4248dbe](https://github.com/realworld-apps/realworld/tree/4248dbe042138a357578c15a655a38c12abba353)。`official-specs` 内含该提交的完整 `specs/api`、`specs/e2e` 和上游 MIT 许可证。前端使用同一提交的 `assets/theme/styles.css` 和 `assets/media/default-avatar.svg`，保存在 `frontend/src/official`。

在仓库根目录运行 `./scripts/official.sh prepare`。检查器读取 GitHub 提供的 blob ID，核对每个文件的内容，也报告缺失或新增的文件。此步骤可以离线运行。

从 M1 开始，一条命令 `./scripts/check.sh` 依次运行片段检查、Maven 集成测试和当前里程碑的官方 Hurl 用例。请安装 JDK 25、Maven 3.9+、Python 3、Bash、curl、OpenSSL、Docker 和 Hurl 8.1.0。CI 将固定版本的 Hurl 发布包下载到临时目录并校验 SHA-256。标准流程中，JUnit 使用 Testcontainers；Hurl 脚本另外启动并清理一个 PostgreSQL 17 容器，用 Maven 刚构建的 jar 监听随机本机端口。应用退出、超时、数据库启动失败和 Hurl 断言失败都会使检查失败。

无 Docker 时可指定专供测试的 PostgreSQL。设置 `CONDUIT_TEST_DB_URL`（例如 `jdbc:postgresql://127.0.0.1:5433/conduit_test`）、`CONDUIT_TEST_DB_USERNAME`、`CONDUIT_TEST_DB_PASSWORD`，然后运行相同命令。该库会执行迁移并写入测试数据，建议每轮准备新库。验收脚本会生成临时 JWT 签名密钥。

打包后，运行 `./scripts/check-api.sh --milestone m3` 可重复当前里程碑的验收。M1 完整执行账户与账户错误用例，M2 增加两份资料用例，M3 增加完整标签用例。下表列出 M3 在跨里程碑文件里执行的请求序号，起止均包含。

| 官方文件 | M3 执行的请求 |
| --- | --- |
| articles | 1–2、9–17 |
| errors_articles | 1–4、8–14、17–20 |
| errors_authorization | 1–5、9 |
| pagination | 1–3、6–7 |
| feed | 1–2、4–6、10–12 |
| comments | 1–2、13 |
| errors_comments | 3–4、10 |
| favorites | 1–2、9 |

Hurl 的 `--from-entry` 和 `--to-entry` 直接执行官方源文件。每段都核对实际执行的请求序号；上一段从真实响应捕获的 token、slug、时间戳供同一文件的下一段使用。M4 将 articles、pagination 和 feed 三份文件改为完整执行，并增加 errors_articles 中的未登录信息流检查。M5 起使用上游命令自动发现并完整执行全部 Hurl 文件。

不带参数的 `./scripts/check-api.sh` 随时可运行整套测试。后面列文件名（例如 `auth errors_auth`）可单独重跑指定文件的全部断言。

后端启动后，执行 `HOST=http://127.0.0.1:8080 ./scripts/official.sh api`。需要安装支持 JSONPath 计数表达式的 Hurl。测试文件自己在路径中添加 `/api`。默认会运行全部 13 个 Hurl 文件。开发单个里程碑时，亦可在命令后附上游测试文件路径。

## 浏览器验收

从 M6 开始，`./scripts/check.sh` 使用 Node.js 24，根据 `frontend/package-lock.json` 安装依赖，依次运行 TypeScript 类型检查、ESLint、Vitest 和生产构建。首次使用时会安装对应的 Playwright Chromium。在 Linux 上，若系统还缺少浏览器依赖，可以在 `frontend` 目录运行 `npx playwright install --with-deps --only-shell chromium`。GitHub Actions 会安装这些系统依赖。

脚本在完整 Hurl 验收后复用刚启动的后端和专用测试库。种子脚本通过该应用的回环地址注册或登录 `johndoe` 与第二位作者，各创建一篇带标签的文章。随后启动 Vite 对真实生产构建的预览，浏览器从预览地址发出的 `/api` 请求转发给本轮 Spring Boot 进程。两个服务都只在本机随机端口监听。

M6 运行鉴权、设置、导航及其错误处理等适用的 44 项官方测试。M7 加入已实现的文章页面，累计 109 项。M8 和 M9 不传选择器，由官方配置发现全部 140 项。阶段文件与行号清单见 [e2e-cases.sh](e2e-cases.sh)。每次阶段验收还单独运行教程的浏览器测试，检查匿名访问当时已收录的所有章节以及窄屏深链接。

对刚完成的构建，可用 `./scripts/check-api.sh --e2e auth.spec.ts` 快速重试一个文件，或用 `./scripts/check-api.sh --e2e settings.spec.ts:20 --reporter=line` 定位一个用例。这两个命令独立启动测试数据库、后端、生产预览，只运行所选官方浏览器测试。不传文件名则运行完整官方套件。若服务已由自己启动且已有测试数据，可直接用 `API_BASE=http://127.0.0.1:8080/api UI_BASE=http://127.0.0.1:5173 ./scripts/official.sh e2e`。请确保前端把同源 `/api` 转发到这个专用后端。

### 两份上游用例中的固定地址

上游 `error-handling.spec.ts` 和 `user-fetch-errors.spec.ts` 使用 `page.route` 在浏览器测试中模拟接口错误。它们将匹配地址写为 `https://api.realworld.show/api/…`。本项目仅对这两个文件的字符串路由匹配器，将上述前缀映射为本地预览地址的 `/api/`。Playwright 原生的匹配机制、处理函数、`fulfill`、`abort`、`continue` 与断言照常执行。`continue` 后的请求仍交给本地后端。适配代码见 [official-fixtures.ts](official-fixtures.ts)；上游文件在执行前逐个核验 Git blob ID。

唯一固定的外部健康检查是 `health.spec.ts` 对 `https://api.realworld.show/api/tags` 的只读 GET。该检查保留真实上游响应。在需要显式 HTTPS 出口代理的环境，可以将 `CONDUIT_E2E_HEALTH_PROXY` 设为本机允许的代理 URL，只有这份用例的独立 HTTP 客户端会使用它。官方选择器和路由约定见 [SELECTORS.md](official-specs/specs/e2e/SELECTORS.md)。
