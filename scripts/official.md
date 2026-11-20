# RealWorld 官方验收

固定版本为 [realworld-apps/realworld 的提交 4248dbe](https://github.com/realworld-apps/realworld/tree/4248dbe042138a357578c15a655a38c12abba353)。`official-specs` 内含该提交的完整 `specs/api`、`specs/e2e` 和上游 MIT 许可证。前端使用同一提交的 `assets/theme/styles.css` 和 `assets/media/default-avatar.svg`，保存在 `frontend/src/official`。

在仓库根目录运行 `./scripts/official.sh prepare`。检查器读取 GitHub 提供的 blob ID，核对每个文件的内容，也报告缺失或新增的文件。此步骤可以离线运行。

后端启动后，执行 `HOST=http://127.0.0.1:8080 ./scripts/official.sh api`。需要安装支持 JSONPath 计数表达式的 Hurl。测试文件自己在路径中添加 `/api`。默认会运行全部 13 个 Hurl 文件。开发单个里程碑时，亦可在命令后附上游测试文件路径。

前后端启动后，安装前端依赖和对应的 Playwright Chromium，执行 `API_BASE=http://127.0.0.1:8080/api UI_BASE=http://127.0.0.1:5173 ./scripts/official.sh e2e`。套件使用浏览器直接访问接口的 SPA 模式，保留上游的断言、浏览器、重试和所有测试。运行时请使用单独的测试数据库。官方社交用例假设已有名为 `johndoe` 的作者及其文章，部分用例要求全站至少有两位作者的文章。

固定版本的 E2E 存在地址限制。`health.spec.ts` 直接访问 `https://api.realworld.show/api/tags`。`error-handling.spec.ts` 和 `user-fetch-errors.spec.ts` 拦截的也是这个演示域名上的请求。设置 `API_BASE` 只会改变读取该变量的测试辅助函数。在本机以相对路径访问 `/api` 时，上述拦截无法模拟指定的错误。请在 M8 验收记录中报告这些用例的实际结果。官方选择器、路由、调试接口及头像约定见 [SELECTORS.md](official-specs/specs/e2e/SELECTORS.md)。
