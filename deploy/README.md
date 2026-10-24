# 自托管部署示例

以下使用通用域名 `workbench.example.com`，默认应用只监听 `127.0.0.1:3200`。所有域名、目录、运行用户和数据库配置应按你的环境调整。

## 目录与运行配置

建议将代码放在 `/srv/geo-workbench/releases/<version>`，`current` 指向运行版本。持久化环境文件、媒体与备份放在 `shared/`，不要随源码覆盖。

在独立运行环境配置 `DATABASE_URL`、`PAYLOAD_SECRET`、`SERVER_URL=https://workbench.example.com`、`UPLOAD_DIR=/srv/geo-workbench/shared/media`。密钥用随机生成的至少 32 字符值。环境文件由运行用户读取，限制其他用户访问。

`geo-workbench.service` 是 systemd 参考配置，使用专用 `geo-workbench` 用户，要求事先安装 Node.js、PostgreSQL，创建可访问的目录，并将运行配置放在 `shared/runtime.env`。

## 首次安装

1. 创建独立空数据库及数据库用户，安装锁文件对应依赖。
2. 在项目目录运行 `pnpm setup:env`，修改数据库连接、管理员邮箱及运行地址；初始密码保存在 `.env.local`。
3. 仅对空库运行 `PAYLOAD_DB_PUSH=true pnpm db:seed`，再运行 `pnpm db:migrate`、`pnpm db:check`。
4. 将运行配置安全地迁移至 `shared/runtime.env`，移除仅初始化需要的 `SEED_PASSWORD`，不要开启 `PAYLOAD_DB_PUSH`。
5. 在加载该运行配置的环境中运行 `pnpm build --webpack`；内存受限时可设 `GEO_BUILD_WORKERS=1`。
6. 按实际路径安装 systemd 服务、配置 Nginx，并取得你的域名 TLS 证书后启动服务。

Nginx 示例中的证书路径需与实际证书一致。域名证书的续期由你的证书工具管理。

## 升级与恢复

已有业务库升级前备份数据库和媒体。加载运行环境，先运行 `pnpm db:migrate` 和 `pnpm db:check`，构建成功后切换 `current` 并重启应用。保持原有有效密钥、数据库和上传目录。

备份脚本、验证脚本及定时器是 Linux/PostgreSQL 本机部署示例，使用 `geo_workbench` 数据库名及默认示例目录；安装前核对这些参数与数据库账号权限。备份验证会创建独立临时数据库，不恢复覆盖业务库。建议将备份另外复制到独立存储，并定期验证恢复。

代码回滚只切换源码版本；业务数据恢复需要另行选择备份并确认恢复范围。
