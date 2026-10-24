# 项目与每日规划

项目名匹配多个候选时补问。创建必填 name、startDate、endDate、owner、goal、description；负责人是 users ID，不从名称猜。每日规划以项目和上海自然日识别，历史只读，有关联内容资产的规划不能修改核心字段。status 不手改。

## 导入

先 plans preview-import。脚本只确认 daily 格式；旧 rows 分支会重复新增，拒绝确认。来源可以保留语义转为可解析 Markdown，再预览：

```markdown
2026年
## 10月12日｜温泉住宿选择
A类·企业号：问题：如何选择温泉住宿？ 标题：《温泉住宿说明》
B类·综合自媒体：问题：周末行程怎么安排？ 标题：《周末温泉行程》
C类·垂直生活类：问题：亲子出行要准备什么？ 标题：《亲子住宿准备》
官网动作：核对交通说明
```

解析器内置 A=toutiao、B=toutiao,wechat,zhihu、C=ctrip,meipian。用户指定平台优先，核对预览并在确认 JSON 调整。缺少年份先补可靠年份，不使用解析器的当前年作为用户意图。

确认输入来自预览 dailyPlans：

```json
{"project":1,"sourceFilename":"week.md","dailyPlans":[{"planDate":"2026-10-12","topic":"温泉住宿","title":"温泉住宿","articles":[{"category":"enterprise","question":"如何选择住宿？","title":"住宿说明","targetPlatforms":["toutiao"]}]}]}
```

核对项目、日期、分类、问题、平台再执行授权导入。占位标题可保留并报告，不自动写未经请求的标题。

脚本预查已有同日规划和规划项：完全一致的整日跳过；歧义/重复报错；变更仅允许今天及未来且没有关联资产的规划。同分类存在不同问题时拒绝猜测更新，改用明确 items ID 的 update。普通 create 也预查重复，但无数据库唯一约束，不能保证并发。

导入只创建规划/规划项，不产生正文、资产、发布任务。非整批事务，报错后按项目和日期查询对账。后端 createdPlans 包含复用，不代表真正新增。脚本返回 submittedDays、unchangedDays 和回读结果。

items create/update 同样核对父规划锁和分类+问题重复；sortOrder 不是稳定键。已有规划项没有稳定资产关联，不能按同分类覆盖多篇文章。

完成返回每日规划和规划项数、页面链接、占位标题及失败项。XLSX、稳定键、批次审计和事务仍是后续设计。
