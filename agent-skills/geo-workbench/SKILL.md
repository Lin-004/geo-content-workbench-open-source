---
name: geo-workbench
description: 操作 GEO 内容交付工作台，管理项目和每日规划、维护文章和短视频脚本独立内容资产、提交或执行审核、登记真实平台发布链接、查询交付进度。用户要求工作台入库、规划导入、审核、回填发布结果或查项目待办时使用；不用于修改工作台源码或从零进行 GEO 平台采样。
---

# GEO 工作台

将用户的业务指令转成工作台中可回读、可定位的结果。项目按上海自然日管理每日规划；规划项是文章骨架；每条内容独立审核，每个平台有自己的发布任务。

## 操作入口

使用 Node.js 22 或更新版本，无额外依赖。脚本相对本 skill 所在目录：

```text
node <skill-dir>/scripts/workbench.mjs help
node <skill-dir>/scripts/workbench.mjs projects list
node <skill-dir>/scripts/workbench.mjs report --project 1 --from 2026-10-08 --to 2026-10-14
```

首次连接读 [API 契约](references/api-contract.md)。工作台地址通过 GEO_WORKBENCH_URL 配置，认证使用 GEO_WORKBENCH_COOKIE，或 GEO_WORKBENCH_USERNAME 与 GEO_WORKBENCH_PASSWORD。不要猜账号、使用 README 中默认密码或输出认证值。脚本不读取项目 .env，不持久化会话。缺少认证时只能执行 help；实际操作需要可用会话。

## 按任务读取

- 项目、每日规划、规划项、规划文件导入：[planning.md](references/planning.md)。
- 文章、正文、图片、内容导入和软删除：[content.md](references/content.md)。
- 提交、通过、驳回和审核历史：[review.md](references/review.md)。
- 待发布任务与真实链接登记：[publications.md](references/publications.md)。
- 交付进度、缺项和统计范围：[reporting.md](references/reporting.md)。

按需读参考，不一次加载全部。需要字段或命令语法时读 API 契约相关部分。

## 执行与完成

1. 定位项目和目标记录。明确 ID 优先；名称匹配多个候选时补问，不自行选第一个。读取现有状态与关联信息。
2. 按用户授权完成任务。明确要求写入、提交、通过或登记时继续；仅要求检查、预览或写作时不擅自推进状态。
3. 使用脚本和 HTTP 业务入口，不直接操作数据库、Payload Local API 或自行创建平台任务。脚本限制不可靠的旧导入分支。
4. 回读核对字段、状态和关联记录。平台任务由内容资产自动生成；规划状态由系统聚合。
5. 返回结果、ID、页面链接及未完成项。批次失败可能部分完成，保留输出中的 ID 并查询对账，不整批盲目重试。

审核中不能编辑；已审核未发布的母稿改标题/正文会退回草稿；已有发布记录的母稿不能修改或删除。当前为单人审核模式；每条规划项只关联一条有效资产，数据库保护占用冲突。

外部发布不包含在默认操作中，只准备材料和登记真实结果。其他写作、规划和发布技能的输出可以作为输入，不自动扩大授权。

## 契约更新

基于 2026-10-08 工作区实现。目标服务与契约不符时报告具体差异，不换写入路径绕过限制。更新时核对项目 docs/产品说明.md、src/collections/、src/app/api/ 与业务测试。当前本地版本支持 XLSX v2 规划导入和可选内容类型列。短视频脚本是文字资产，审核通过不表示成片已发布。实际连接其他部署前需核对部署版本是否支持 video_script、douyin、wechat_channels、xiaohongshu。本地小红书平台已接入；上线前不假设生产也支持。
