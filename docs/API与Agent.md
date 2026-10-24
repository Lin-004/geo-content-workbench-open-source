# API 与 Agent

`agent-skills/geo-workbench/` 提供可安装的 Agent 技能和零依赖 Node.js 客户端，要求 Node.js 22+。

```bash
node agent-skills/geo-workbench/scripts/workbench.mjs help
```

工作台地址通过 `GEO_WORKBENCH_URL` 配置。认证可使用 `GEO_WORKBENCH_COOKIE`，或 `GEO_WORKBENCH_USERNAME` 与 `GEO_WORKBENCH_PASSWORD`。真实认证值只通过运行环境提供，不写到文档、问题报告或提交中。

首次使用阅读 [技能说明](../agent-skills/geo-workbench/SKILL.md) 与 [API 契约](../agent-skills/geo-workbench/references/api-contract.md)。具体执行前核对目标部署版本，旧部署可能尚不支持最新内容类型或平台。

客户端通过 HTTP 业务入口操作，不直接写数据库。规划导入预览不会写业务数据；审核、确认导入和登记发布结果会产生业务变更，需要明确的使用者指令。外部平台实际发布由用户或另行授权的工具完成。
