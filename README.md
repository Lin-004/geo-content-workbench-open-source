# GEO 内容交付工作台

管理 GEO 内容项目、每日规划、文章与短视频脚本、审核记录和多平台发布进度的自托管工作台。

使用 Next.js、React、TypeScript、Payload CMS 与 PostgreSQL。采用单人工作台审核模式；平台发布由人工完成，工作台登记真实发布链接，不自动向内容平台发稿。

## 功能

- 项目与每日规划、周/日内容排期、开放文章分类及同类多篇规划。
- XLSX 规划模板、导入预览和差异确认；Markdown、DOCX、PDF 正文导入。
- 文章、短视频文字脚本、正文表格与图片、审核快照及修订稿。
- 每篇内容独立审核，每个平台独立确认发布，支持回收站恢复。
- Agent 客户端通过业务 API 查询和操作工作台。

支持搜狐号、今日头条、百家号、知乎、微信公众号、携程、抖音、视频号、小红书等平台的发布任务管理。平台链接与配置以系统设置为准。

## 本地运行

需要 Node.js 22+、pnpm 10.11+、PostgreSQL 16。以下示例通过 Docker 启动本地数据库：

```bash
pnpm install --frozen-lockfile
pnpm setup:env
docker compose up -d postgres
pnpm generate:types
pnpm generate:importmap
# 仅对新建空库执行，已有业务库不要执行 seed 或 push。
PAYLOAD_DB_PUSH=true pnpm db:seed
pnpm db:migrate
pnpm db:check
pnpm dev
```

打开 <http://localhost:3001/admin>，用户名为 `admin`，初始随机密码保存在本机 `.env.local` 的 `SEED_PASSWORD` 中。登录后可在账号管理中修改密码。

`setup:env` 自动生成随机密钥和密码，不输出其内容，也不覆盖已有文件。已有配置时手工补齐缺少的变量。`PAYLOAD_SECRET` 至少 32 字符，不接受示例占位值。初始化会跳过已存在的管理员账号，不重设其密码。

Docker 示例的数据库凭据仅用于本地开发，数据库只映射到本机回环地址。使用外部数据库时修改 `DATABASE_URL`。

## 验证

```bash
pnpm typecheck
pnpm test:security
pnpm test:workflow
pnpm test:body
node --import tsx/esm --test tests/plan-import.test.ts
node --test agent-skills/geo-workbench/scripts/workbench.test.mjs
pnpm test:isolated
pnpm check:public
```

`test:isolated` 使用独立临时数据库与源码副本，默认端口 3002，完成后清理。运行它的本地数据库账号需要创建和删除临时数据库的权限，不要使用生产连接。

## 部署与升级

部署配置示例见 [部署说明](deploy/README.md)。已有数据库升级前先备份，再运行 `pnpm db:migrate` 和 `pnpm db:check`；禁止通过 seed、自动 push 或清空业务表升级。保持原有有效密钥与上传目录，源码回滚不会恢复业务数据。

业务规则见 [产品说明](docs/产品说明.md)，维护方式见 [开发与维护](docs/开发与维护.md)，Agent 使用见 [API 与 Agent](docs/API与Agent.md)。

## 许可证

[MIT](LICENSE)。依赖软件及平台商标适用各自的许可证与使用条款。
