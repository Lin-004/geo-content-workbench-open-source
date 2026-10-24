# 内容资产与短视频脚本

内容类型为 article（文章，默认）或 video_script（短视频脚本）；与 articleCategory 的 A/B/C 或开放分类互相独立。目标平台包括既有七个平台及 douyin（抖音）、wechat_channels（视频号，与公众号 wechat 分开）、xiaohongshu（小红书）。小红书图文使用 article，口播与分镜使用 video_script；话题标签保存在正文，平台不决定资产类型。

文件导入先 content preview-import，确认时传 project、contentType、title、targetPlatforms、sourceFilename、text、body（完整预览富文本），可选 contentPlan、contentPlanItem、articleCategory、question、plannedPublishDate。当前确认接口一次保存正文及元数据，始终创建草稿。不能再次导入已占用规划项；需要覆盖时先定位原 ID，用 content update 更新 title、body、sourceFilename，保留未要求变更的平台和规划关系。

脚本正文可包含口播、分镜表格、字幕、拍摄说明，使用原有富文本编辑器；不要求拆字段。MD/DOCX 保留表格，PDF 为文本提取。上传脚本文档不等于上传成片或实际对外发布。

reviewing 不能编辑；用户授权修改时按实际状态先通过 workflow reject 退回草稿。approved 未发布修改标题、正文、图片或类型会退回草稿；已有发布记录的母稿只读，创建 revisionOf 修订稿。关联规划项时类型必须一致。审核只证明脚本通过，实际成片发布后才登记真实平台链接。

更新后回读核对标题、正文、内容类型、状态、项目、规划及平台任务；回传 ID 和详情页链接。写入结果未知时先查询对账，不直接重试。
