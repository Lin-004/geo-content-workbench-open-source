# 发布记录

默认只查询、准备材料、登记真实结果；外部发布由人或另有授权的工具执行。

```text
WB publications list --asset 42
WB publications confirm --id 57 --url https://example.com/real-article
```

区分 asset ID 与 task ID。按文章分组列平台；blocked 不可发布，pending 可准备，published 有真实链接。内部内容详情是母稿，publishedUrl 是外部文章，platformUrl 是后台；打开后台不等于成功。

登记前核对链接属于指定文章及平台，来源必须为用户或真实发布结果。接口仅检查 http(s)，脚本不证明文章真实性。缺少真实链接保持 pending，不能造 URL。

确认要求 pending、asset approved、未删除。已发布且同 URL 返回 alreadyConfirmed，不同链接不覆盖。回读确认任务并核对同文章其他任务。publishedAt 是服务器登记时间，不能当实际外部发布时间。

平台减少后可能残留任务，不直接 PATCH/DELETE 清理。外部发布需要读取适用发布技能并遵守用户授权，不是此脚本内置能力。
