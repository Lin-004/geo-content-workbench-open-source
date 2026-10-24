import { headers as getHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { getPayload } from "payload";
import config from "@payload-config";
import AppShell from "../components/app-shell";
import { Icon } from "../components/icons";

export const dynamic = "force-dynamic";

export default async function HelpPage() {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await getHeaders() });
  if (!user) redirect("/admin/login?redirect=/help");
  return <AppShell userName={user.displayName} breadcrumbs={["首页", "帮助中心"]}><div className="page-content"><div className="page-heading"><div><h1 className="page-title">帮助中心</h1><p className="page-subtitle">了解内容交付工作台的核心流程和操作方式</p></div></div><div className="help-grid"><section className="help-card"><span className="help-icon"><Icon name="content" size={22} /></span><h3>内容资产管理</h3><p>创建或导入内容资产，编辑正文与图片，选择目标发布平台并提交审核。</p></section><section className="help-card"><span className="help-icon"><Icon name="planning" size={22} /></span><h3>项目管理</h3><p>先创建项目，再按日期录入内容规划。历史规划只读，已创建内容的规划核心字段不可修改。</p></section><section className="help-card"><span className="help-icon"><Icon name="send" size={22} /></span><h3>人工发布确认</h3><p>审核通过后打开平台后台完成发布，再粘贴最终文章链接确认发布状态。</p></section></div><section className="panel help-faq"><div className="panel-heading"><h2>常见问题</h2></div><div className="faq-list"><div className="faq-item"><strong>为什么审核通过后不能直接自动发布？</strong><p>MVP 只保留人工发布流程，不接入 Playwright 或第三方自动发布平台；这样可以让每个平台的发布结果由操作人员确认。</p></div><div className="faq-item"><strong>为什么历史规划不能编辑？</strong><p>历史规划的主题和文章规划项只读，执行补发、审核和真实发布记录仍可更新。</p></div><div className="faq-item"><strong>删除内容后还能恢复吗？</strong><p>内容采用软删除策略，可在内容资产管理的“回收站”恢复；已有发布记录的内容不能删除。</p></div></div></section></div></AppShell>;
}
