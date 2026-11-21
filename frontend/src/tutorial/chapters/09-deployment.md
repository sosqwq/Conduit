# 09 部署上线

## 本章做了什么

本地开发时，三个进程可能分别由 Maven、Vite 和 Docker 启动。本章改为用 Compose 运行生产栈：入口服务提供 React 的静态文件，并代理 `/api`；Java 服务处理业务；PostgreSQL 保存数据。先从部署机器本地验证这条路径，再将你控制的域名和 HTTPS 入口接入。能否从公网使用，还需要从部署机器之外实际访问该域名。

![生产环境只发布 Web 入口。Nginx 在本地读取静态文件，把同源 API 请求转给 Spring，PostgreSQL 将数据写入命名卷。](./figures/09-deployment.svg)

| 从哪里看 | 访问什么 | 验证什么 |
| --- | --- | --- |
| 部署机器本地 | 网页入口、`/api/health` | 静态服务、反向代理、Java 与数据库是否相互连通 |
| 浏览器直接打开深链接 | `/tutorial/09`、文章详情地址 | 静态服务能否把前端路由交给 React |
| 部署机器以外 | 你的 HTTPS 域名和同源 `/api/health` | DNS、证书、外部访问规则与反向代理是否都生效 |
| 重新创建应用容器后 | 登录并重新读取刚才保存的文章 | 数据库卷和签名密钥是否持续有效 |

## 用到的技术

**镜像、容器与多阶段构建。** Dockerfile 描述怎样生成镜像。容器是用镜像启动的进程环境。多阶段 Dockerfile 先在包含编译工具的阶段构建，再用 `COPY --from` 把产品复制到运行阶段。后端需要可运行的 JAR，前端需要 Vite 输出的静态文件；运行网站时不需再在请求路径上调用编译器。[Docker 多阶段构建](https://docs.docker.com/build/building/multi-stage/)

**Compose、服务名与卷。** Compose 在同一个项目网络中启动多个服务，服务可以借助名称找到彼此。在 Web 容器里，`localhost` 是 Web 容器自己；它要通过服务名访问 API。数据库的命名卷把数据文件的寿命与具体容器分开，容器更新后可以接回同一卷。主机损坏仍可能丢失该卷，所以正式数据库还需要定期在另一存储位置留存并验证可恢复的备份。[Docker 卷](https://docs.docker.com/engine/storage/volumes/)

**运行时配置。** 数据库密码、签名密钥和允许访问的前端来源会随部署环境变化。把它们传给容器中的进程，镜像就可以在多个环境重复使用。Vite 构建出的客户端代码会被浏览器下载，因此后端密钥只应出现在服务器配置中。更换 JWT 密钥会影响现有令牌的验证，重建容器时应继续加载原来那份配置。

**同源、CORS 与 TLS。** 浏览器用协议、主机和端口共同确定“源”。浏览器从一个源调用另一个源时，服务端需要通过 CORS（跨源资源共享）明确允许，某些带自定义头部的请求还会先发 OPTIONS 预检。生产入口把网页和 API 放在同一个 HTTPS 源内，浏览器只看见一个站点。TLS 为网络连接提供加密与服务器身份认证，通常由外层反向代理或托管负载均衡器终止。[浏览器 CORS 指南](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)

## 代码走读

**第一步，在部署目录建立密钥。** 选择一台你有权限管理且已安装 Docker Engine、Compose 插件与 OpenSSL 的主机。检出要部署的 Git 版本，在仓库根目录执行 `./scripts/init-production-env.sh`。脚本以受限文件权限生成 `.env.production`，其中数据库密码与签名密钥分别随机生成。下次执行会保留已有文件，不会悄悄使数据库登录或所有浏览器令牌失效。

来源：`scripts/init-production-env.sh`

```bash
password=$(openssl rand -hex 32)
signing_key=$(openssl rand -base64 48)
```

后端在生产配置下读取 JDBC 地址、数据库用户名、密码和签名密钥。PostgreSQL 初始化只在空数据目录中创建账号；已有数据库即使收到一个新的初始化环境变量，其内置用户密码也不会随之更改。更新数据库密码时，需要协调数据库账号与 API 配置；轮换签名密钥要让运行中的实例采用一致配置。

**第二步，构建并启动三个服务。** 在同一目录运行 `docker compose --env-file .env.production -f compose.production.yml up -d --build --wait`。若 8080 已在使用，先在配置文件中设置 `CONDUIT_HTTP_PORT=8090`，后续访问也使用 8090。查看状态可以执行 `docker compose --env-file .env.production -f compose.production.yml ps`。需要定位问题时执行 `docker compose --env-file .env.production -f compose.production.yml logs --tail=100 api`，将末尾的服务名改成 `web` 或 `db` 就能分别查看另外两层。正常启动顺序是数据库就绪、API 的数据库探针就绪，最后 Web 的反向代理探针就绪。

Compose 为 API 指定了生产 profile，JDBC URL 中的主机是数据库服务名 `db`。数据库使用 `postgres-data` 命名卷。它与 API 都留在 Compose 网络内，对主机只发布 Web 的一个回环端口。这个绑定让外层反向代理能连接 Web，外部访客无需直接连接数据库或 Spring 的内部端口。

来源：`compose.production.yml`

```yaml
      SPRING_PROFILES_ACTIVE: prod
      DATABASE_URL: jdbc:postgresql://db:5432/conduit
      DATABASE_USERNAME: conduit
      DATABASE_PASSWORD: ${DATABASE_PASSWORD:?Set DATABASE_PASSWORD}
      CONDUIT_JWT_SECRET: ${CONDUIT_JWT_SECRET:?Set CONDUIT_JWT_SECRET}
      CONDUIT_ALLOWED_ORIGINS: ${CONDUIT_ALLOWED_ORIGINS:-}
```

**第三步，沿镜像边界读代码。** 后端的构建阶段用 Maven 和 JDK 25 编译，生成包含依赖的 Spring Boot JAR；运行阶段用 JRE，把构建输出取名为 `conduit.jar`，再以非 root 用户启动。数据库密码在容器启动时由 Compose 注入，构建 JAR 时不需要知道它。

来源：`backend/Dockerfile`

```dockerfile
COPY --from=build /build/target/*.jar /app/conduit.jar
USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/conduit.jar"]
```

前端先使用 Node 安装锁文件指定的依赖、执行构建，再把 `dist` 复制给非特权 Nginx。运行中的 Web 容器只需要静态文件、代理配置和 8080 端口，不会运行开发用的 Vite 服务器。

来源：`frontend/Dockerfile`

```dockerfile
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/ /srv/conduit/
EXPOSE 8080
```

**沿一次请求读 Nginx。** 若打开 `/tutorial/09`，文件系统中没有名为 09 的网页，Nginx 将请求交给 `index.html`，React Router 决定要展示第九章。若打开 `/assets/` 下不存在的脚本，则必须返回 404，否则浏览器可能把整页 HTML 当成 JavaScript。对于 `/api`，代理保留原始路径、查询字符串以及浏览器请求里的 Host（含显式端口），使用 Compose 网络中的 `api:8080` 做上游。代码里出现的 `127.0.0.11` 是容器内 Docker 的名称解析地址，可在 API 容器替换后重新解析服务名。

来源：`frontend/nginx.conf`

```nginx
    location ~ ^/api(?:/|$) {
        proxy_pass http://$conduit_api$request_uri;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $http_host;
```

**把本地健康检查读懂。** 入口的静态文件能加载，说明 Web 进程可用。访问入口的 `/api/health` 能检查更长一段路径：同源代理收到请求，转给 Java，Java 向 PostgreSQL 执行一次轻量查询，再返回 `{"status":"UP"}`。如果直接加载教程深链接能看到本章，而健康检查得到 502，就先看代理到 API 的网络与进程状态，不必把时间花在重新构建教程上。

**第四步，接入你实际控制的域名。** 默认端口下先在部署机执行 `curl -fsS http://127.0.0.1:8080/api/health`；再用浏览器直接打开 `http://127.0.0.1:8080/tutorial/09`。若需要从外网访问，请先将域名的 DNS 解析指向该主机，使公网 80、443 能到达负责证书和反向代理的服务。数据库和 API 的内部端口仍由 Compose 网络提供。

有两种常见入口。已有托管代理或负载均衡器时，给真实域名绑定证书，让代理转发所有路径到可达的 Web 服务。回环地址只对同一主机有效；位于另一台机器的代理需要通过受限私网连接 Web，或在应用主机上设置本地入口。若同一主机已安装 Caddy，可以在现有 Caddyfile 里增加这个站点：以实际域名和左花括号开头，下一行写 `reverse_proxy 127.0.0.1:8080`，再用右花括号结束。用 `caddy validate --config /etc/caddy/Caddyfile` 验证语法后，在采用 systemd 的主机上执行 `sudo systemctl reload caddy`。Caddy 会根据域名和公网可达性申请并续签证书。已有其他站点时，应保留它们的配置。[Caddy 自动 HTTPS](https://caddyserver.com/docs/automatic-https)

外层代理终止 TLS 时，浏览器实际来源是 HTTPS，而 Nginx 连接 Spring 时使用内部 HTTP。即使浏览器始终访问同一公网域名，带 `Origin` 的写请求也需要后端明确接受这个公网来源。在 `.env.production` 增加一行 `CONDUIT_ALLOWED_ORIGINS=https://blog.example.org`，把示例域名换成你自己的真实域名；有非默认端口时也要写入，不加末尾斜杠。再次执行 `docker compose --env-file .env.production -f compose.production.yml up -d --build --wait` 让 API 进程拿到新值。仅在本机用同源 HTTP 访问时，这项可以留空。

为了核对真实链路，可将你的实际域名赋给当前终端的 `CONDUIT_DOMAIN`，再从外部网络运行 `curl -fsS "https://${CONDUIT_DOMAIN}/api/health"`。直接打开该域名的 `/tutorial/09`，再完成注册、发文和刷新详情。每一步都通过后，才能把这个域名作为已验证的公开入口。

**第五步，确定何时允许跨源。** 默认允许来源为空。若另一个独立的前端来源确实需要调用 API，将 `CONDUIT_ALLOWED_ORIGINS` 设置成那个实际的 HTTP(S) Origin，多个值以逗号分隔；来源只含协议、主机、必要的端口，不含路径。重新运行上述 Compose 启动命令以应用设置。后端 CORS 规则覆盖 `/api/**`，允许指定请求头和方法。本项目在请求头中传令牌，不使用 Cookie 会话。

来源：`backend/src/main/java/dev/conduit/common/CorsConfig.java`

```java
        policy.setAllowedOrigins(parseOrigins(configuredOrigins));
        policy.setAllowedHeaders(List.of("Authorization", "Content-Type", "Accept"));
        policy.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        policy.setAllowCredentials(false);
```

**再用隔离环境演练一次升级。** 有 Docker 的开发机或 CI 运行器可从根目录运行 `./scripts/check-production.sh`。脚本使用随机 Compose 项目名和临时密钥，写入测试账户与文章，然后重新创建三个容器并检查原来的记录与令牌。它会清理自己的演练卷，实际部署需要长期保留的卷不参与这个项目。手工重启时可对生产命令使用 `up -d --force-recreate --wait api web`；保持同一个项目名、配置文件及数据库卷，用已知 slug 和原浏览器令牌验证结果。

## 设计取舍

单一公开域名使前端始终使用相对路径 `/api`。从开发切换到生产不必把服务器内网名称植入 JavaScript，也能少维护一套跨源权限。对通过外层 TLS 入口发来的公网 Origin，或经授权从不同源访问 API 的前端，应按准确的协议、主机与端口配置允许来源；浏览器跨源策略不能替代 JWT 认证，控制器仍要核验请求者身份。

外层 TLS 代理负责域名、证书和公网端口，应用栈可以在回环或私网地址上持续提供同一个 HTTP 入口。两个层次分开便于逐段定位：进程间健康、主机入口健康、域名解析、证书、外网访问分别可以验证。部署过程中向 TLS 服务申请证书和配置 DNS 都需要真实域名及其管理权限。

## 常见错误

| 现象 | 从哪里排查 |
| --- | --- |
| Compose 报缺少变量，API 无法启动 | 检查命令是否选择生产 Compose 文件并传入 `--env-file .env.production`，确认所需变量有值。不要将密钥贴在问题报告中。 |
| 网页能打开，API 返回 502 | 查看 web 与 api 容器日志和健康状态。代理应使用 Compose 服务名，容器里的 localhost 不会指向另一容器。 |
| 从首页点击文章正常，刷新详情却 404 | 检查 Nginx 是否对前端路由回退到 `index.html`，并保证 `/api/` 不走这个回退。 |
| 移机后看似“所有文章丢失” | 核对当前连接的 PostgreSQL 主机、库名、Compose 项目和实际挂载的命名卷。空卷会正常执行迁移，不能据此认定旧库真的没有数据。 |
| 浏览器报跨源错误，curl 却能读公开接口 | 查看网页和 API 的完整源，以及预检响应允许的 Origin、方法和请求头。curl 成功只能证明 HTTP 路径可以访问。 |
| 本机能读，外网域名未通 | 从另一网络检查 DNS 是否解析到正确主机、443 是否可达、证书是否匹配域名，再分别验证外层代理的上游地址和本地应用入口。 |

## 自测与练习

1. 前端静态构建里的变量与 Java 容器的运行时变量，在可见性上有什么差别？为什么不应把 JWT 密钥传给 Vite？
2. Web 容器中访问 `localhost:8080` 为什么可能连回自己？它怎样定位 API 服务？
3. 重建数据库容器而保留命名卷，与创建全新的空卷有什么区别？为什么两种情况下 Flyway 都可能成功？
4. 主站与 `/api` 同源时为何通常不需要浏览器 CORS 预检？如果另一个不同端口的站点发请求，又要看什么？
5. 主机上的健康接口返回 200 后，为何还要从另一网络实际访问 HTTPS 域名？

**动手练习。** 在本地独立的生产演练环境中启动栈，先打开教程深链接和健康检查，再注册临时账号并发布一条文章。记录 slug。只重新创建 Web 和 API 服务，保持数据库卷、Compose 项目名与密钥配置不变。刷新详情并以原浏览器会话打开设置页，检查数据与认证是否都保留。有自己可管的域名时，再按本章的 TLS 步骤用另一网络重复健康检查与深链接访问。

### 参考答案

1. 静态文件会交给浏览器，用户可读取其中内容；后端运行时变量由服务器进程读取。签名密钥必须留在服务器端。
2. 每个容器各有自己的网络语义。Compose 为同一项目网络中的服务名提供解析，Web 用 API 服务名和容器监听端口访问它。
3. 保留原卷可继续读取原有表和行；空卷会初始化一套新的数据库。Flyway 对旧库可验证历史并执行增量迁移，对新库也可从第一份迁移开始执行。
4. 主站和 API 共享协议、主机与端口，浏览器看到的是同一源。跨源访问才要检查允许来源和预检策略，并继续满足实际接口的认证要求。
5. 本机请求绕过了公共 DNS、TLS 和外网防火墙。真正从外部检查相同域名，才覆盖用户会走的链路。

练习预期：重新创建 Web 和 API 后，同一 slug 仍能打开，旧令牌仍能读取当前用户。若本机和公网两步表现不同，先记录失败发生在 DNS、TLS、外层代理、应用入口还是数据库这一层。
