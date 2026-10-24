# 审核

draft → submit → reviewing → approve → approved；reviewing → reject → draft。

```text
WB review submit --id 42
WB review approve --id 42 --comment "按用户标准核对通过"
WB review reject --id 42 --comment "交通信息缺来源"
WB audits list --asset 42
```

检查质量只返回意见；要求提交才 submit；要求按明确标准审核才 approve/reject。不额外加自动审批要求，也不把检查扩大为状态变更。事实判断依赖来源，工作台字段不证明真实；不自带品牌知识库或 GEO 评分。

动作前读状态和正文，使用业务接口，不 PATCH status。脚本回读资产、审核记录与平台任务。审核历史只读。当前无作者/审核员角色隔离。

批量逐篇执行，保留成功和失败记录；已变更状态不重复动作。pending 只代表可发布。
