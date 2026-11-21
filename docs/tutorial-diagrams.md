# 用十张图读懂 Conduit

第一次接触项目，可以先读第 00 章，跟着一条请求走到数据库。想弄清具体行为时，可以从下表直接打开对应章节，边看图边对照代码。站内教程可点击图或「查看原图」放大阅读。

| 章节 | 这张图回答什么问题？ | 查看图片 |
| --- | --- | --- |
| [00 项目总览与开发环境](../frontend/src/tutorial/chapters/00-environment.md) | 发出健康检查后，哪一步能看出数据库是否响应？ | [健康检查时序图](../frontend/src/tutorial/chapters/figures/00-request.svg) |
| [01 注册与登录](../frontend/src/tutorial/chapters/01-authentication.md) | 为什么登录时需要密码，之后读取账户只需令牌？ | [登录与验签时序图](../frontend/src/tutorial/chapters/figures/01-auth.svg) |
| [02 资料与关注](../frontend/src/tutorial/chapters/02-profiles.md) | 两位读者打开同一位作者的主页，为什么看到不同的关注状态？ | [关注关系图](../frontend/src/tutorial/chapters/figures/02-follow.svg) |
| [03 文章增删改查](../frontend/src/tutorial/chapters/03-articles.md) | 文章改名、网址改变后，原有评论为何还在？ | [文章标识关系图](../frontend/src/tutorial/chapters/figures/03-article.svg) |
| [04 文章列表与信息流](../frontend/src/tutorial/chapters/04-lists-and-feed.md) | 四篇文章只返回两篇时，总数和标签分别怎么查？ | [筛选与分页示意图](../frontend/src/tutorial/chapters/figures/04-feed.svg) |
| [05 评论与收藏](../frontend/src/tutorial/chapters/05-comments-and-favorites.md) | 删除一条评论和删除整篇文章分别会影响哪些数据？ | [评论与收藏关系图](../frontend/src/tutorial/chapters/figures/05-relations.svg) |
| [06 前端骨架与鉴权](../frontend/src/tutorial/chapters/06-frontend.md) | 刷新页面时，怎样区分已登录、令牌失效和网络暂时不可用？ | [会话恢复状态图](../frontend/src/tutorial/chapters/figures/06-session.svg) |
| [07 首页与文章](../frontend/src/tutorial/chapters/07-home-and-articles.md) | 编辑器用旧地址保存后，浏览器怎样打开新地址并更新缓存？ | [保存与跳转流程图](../frontend/src/tutorial/chapters/figures/07-editor.svg) |
| [08 个人主页与互动](../frontend/src/tutorial/chapters/08-profile-interactions.md) | 收藏数为何先加一，随后又可能变成另一个数？ | [收藏预测与回退图](../frontend/src/tutorial/chapters/figures/08-optimistic.svg) |
| [09 部署上线](../frontend/src/tutorial/chapters/09-deployment.md) | 同一入口如何提供网页和 API，数据又保存在哪里？ | [生产部署拓扑图](../frontend/src/tutorial/chapters/figures/09-deployment.svg) |

要把第 00 章的请求放回整套系统，可以对照下面的生产部署图，沿着 `/api` 找到 Spring，再沿着 JDBC 找到 PostgreSQL。

![生产部署中同源网页、API 请求与数据库存储的路径](../frontend/src/tutorial/chapters/figures/09-deployment.svg)
