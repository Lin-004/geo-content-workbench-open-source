# API 与操作脚本

Node.js >=22，无额外依赖。GEO_WORKBENCH_URL 默认 http://127.0.0.1:3000。GEO_WORKBENCH_COOKIE 是完整 Cookie 请求头；或提供 GEO_WORKBENCH_USERNAME/GEO_WORKBENCH_PASSWORD，脚本 POST /api/users/login，每次调用的会话只在内存中。由调用环境注入凭证，不写进技能或业务文件。

下列 WB 代表 `node <skill-dir>/scripts/workbench.mjs`：

```text
WB help
WB <resource> list [--project ID] [--plan ID] [--asset ID] [--status VALUE] [--name TEXT] [--from YYYY-MM-DD --to YYYY-MM-DD]
WB <resource> show --id ID
WB <resource> create --data FILE.json
WB <resource> update --id ID --data FILE.json
WB plans preview-import --file FILE.md
WB plans confirm-import --data FILE.json
WB content preview-import --file FILE.docx
WB content confirm-import --data FILE.json
WB content soft-delete --id ID
WB media upload --file FILE.png [--alt TEXT]
WB review submit|approve|reject --id ASSET_ID [--comment TEXT]
WB publications confirm --id TASK_ID --url HTTPS_URL
WB report --project ID --from YYYY-MM-DD --to YYYY-MM-DD
```

资源：projects、plans、items、content、publications、audits、users、platforms、media。create/update 只允许 projects/plans/items/content。没有硬删除或任意 HTTP 请求入口。

list 自动分页，每页 100，depth=0。关联字段为数值 ID。project 过滤适用 plans/content；plan 适用 items/content；asset 适用 publications/audits；status 适用 plans/content/publications；name 适用 projects；from/to 适用 plans/content/publications/audits，分别对应 planDate/plannedPublishDate/plannedPublishAt/createdAt。不支持组合报错，不默默忽略。日期是上海自然日，包含首尾。

| 写入资源 | 字段 |
| --- | --- |
| projects | name、startDate、endDate、owner、goal、description |
| plans | project、planDate、dailyTheme、topic、title、platforms、note |
| items | contentPlan、contentType、articleCategory、question、title、targetPlatforms、sortOrder、sourceType、sourceFilename |
| content | project、contentPlan、contentPlanItem、articleCategory、question、title、contentType、targetPlatforms、images、body、sourceType、sourceFilename、plannedPublishDate |

content 可传便利字段 bodyText 转为 Lexical，不可同时传 body。已有富文本局部改动保留原节点，不整篇降为纯文本。草稿可无正文。

现有资产不支持迁移 project/contentPlan，规划项不支持迁移 contentPlan；当前业务 hooks 未覆盖这些关系迁移的全部同步语义。写入后会独立读取并比对关键字段，不符合预期标记 verificationFailed，并保留已写入 ID。

平台：toutiao、baijiahao、zhihu、sohu、wechat、ctrip、meipian、douyin（抖音）、wechat_channels（视频号）、xiaohongshu（小红书）。分类 enterprise=A 企业号、general=B 综合自媒体、vertical=C 垂直生活类；枚举不代表外部账号可用。

HTTP：GET/POST/PATCH /api/projects、/api/content-plans、/api/content-plan-items、/api/content-assets；GET /api/publication-tasks、/api/audit-records、/api/users、/api/platform-configs、/api/media；单项追加 /{id}。用户返回字段经脚本过滤为 id、username、displayName。

业务动作均 POST：/api/content-assets/{id}/workflow/{submit|approve|reject}（comment 可选）、/api/content-assets/{id}/soft-delete、/api/publication-tasks/{id}/confirm（publishedUrl）。禁止直接 PATCH 状态。

导入 POST /api/import/{plans|content}/{preview|confirm}：preview multipart file，最多10MB；plans 支持 md/markdown/docx，content 额外支持 pdf；confirm JSON。媒体上传 multipart file + _payload={"alt":"..."}，只支持 jpeg/png/webp。

401 会话无效，409 状态冲突，其余业务错误按消息查字段和现状。无自动写入重试；传输失败标记 outcomeUnknown。错误输出过滤凭证；错误消息包含已创建资产 ID 时继续修复该记录，不重新导入。

## 维护验证

修改脚本后运行 `node --test <skill-dir>/scripts/workbench.test.mjs`。测试使用本地临时 HTTP 模拟服务，不触及工作台数据；覆盖分页、业务状态锁、导入元数据修复、结果回读和失败对账。运行中的工作台联调需要目标服务可达及有效认证，不能由模拟通过推断生产接口已经验收。

内容类型：article（文章，默认）、video_script（短视频脚本）。`content list --type video_script --project ID` 可筛选脚本。confirm-import 支持完整预览 body 和 contentPlanItem；一次保存类型、分类及问题。
