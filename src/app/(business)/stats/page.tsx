import { headers as getHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { getPayload } from "payload";
import config from "@payload-config";
import AppShell from "../components/app-shell";
import { MetricCard, PlatformBadge } from "../components/business";
import { PLATFORMS } from "@/lib/platforms";

export const dynamic = "force-dynamic";

const assetStatusNames = { draft: "草稿", reviewing: "审核中", approved: "已审核" } as const;
const planStatusNames = { uncreated: "未创建", creating: "创建中", pending_review: "待审核", pending_publish: "待发布", publishing: "发布中", done: "已完成" } as const;

export default async function StatsPage() {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await getHeaders() });
  if (!user) redirect("/admin/login?redirect=/stats");

  const [assets, plans, tasks] = await Promise.all([
    payload.find({ collection: "content-assets", select: {status:true}, depth:0, pagination: false, overrideAccess: false, user }),
    payload.find({ collection: "content-plans", select: {status:true}, depth:0, pagination: false, overrideAccess: false, user }),
    payload.find({ collection: "publication-tasks", select: {contentAsset:true,platform:true,status:true}, depth:0, pagination: false, overrideAccess: false, user }),
  ]);
  const activeIds = new Set(assets.docs.map(a => String(a.id)));
  const visibleTasks = tasks.docs.filter(t => activeIds.has(String(typeof t.contentAsset === "object" ? t.contentAsset.id : t.contentAsset)));
  const taskCounts = new Map<string, { pending: number; published: number; blocked: number }>();
  for (const platform of PLATFORMS) taskCounts.set(platform.key, { pending: 0, published: 0, blocked: 0 });
  for (const task of visibleTasks) {
    const counts = taskCounts.get(task.platform);
    if (counts && task.status in counts) counts[task.status as keyof typeof counts] += 1;
  }
  const assetCounts = assets.docs.reduce<Record<string, number>>((counts, asset) => {
    counts[asset.status] = (counts[asset.status] || 0) + 1;
    return counts;
  }, {});
  const planCounts = plans.docs.reduce<Record<string, number>>((counts, plan) => {
    counts[plan.status] = (counts[plan.status] || 0) + 1;
    return counts;
  }, {});

  return <AppShell userName={user.displayName} breadcrumbs={["首页", "统计"]}>
    <div className="page-content">
      <div className="page-heading"><div><h1 className="page-title">统计</h1><p className="page-subtitle">按当前有效数据统计内容、规划和多平台发布任务</p></div><div className="heading-actions"><a className="secondary-button" href="/content-management">内容资产</a><a className="primary-button" href="/publications">发布任务</a></div></div>
      <section className="metric-grid"><MetricCard label="内容资产" value={assets.totalDocs} color="blue" icon="content" /><MetricCard label="规划" value={plans.totalDocs} color="orange" icon="calendar" /><MetricCard label="发布任务" value={visibleTasks.length} color="green" icon="send" /></section>
      <div className="two-column-grid"><section className="panel"><div className="panel-heading"><h2>内容状态</h2></div><div className="stat-list">{Object.entries(assetStatusNames).map(([key, label]) => <div className="stat-row" key={key}><span>{label}</span><strong>{assetCounts[key] || 0}</strong></div>)}</div></section><section className="panel"><div className="panel-heading"><h2>规划状态</h2></div><div className="stat-list">{Object.entries(planStatusNames).map(([key, label]) => <div className="stat-row" key={key}><span>{label}</span><strong>{planCounts[key] || 0}</strong></div>)}</div></section></div>
      <section className="panel"><div className="panel-heading"><h2>平台发布任务</h2><a className="text-button" href="/publications">查看任务明细</a></div><div className="data-table-wrap"><table className="data-table"><thead><tr><th>平台</th><th>待发布</th><th>已发布</th><th>不可发布</th></tr></thead><tbody>{PLATFORMS.map((platform) => { const counts = taskCounts.get(platform.key)!; return <tr key={platform.key}><td><PlatformBadge platform={platform.key} /></td><td>{counts.pending}</td><td className="green-text">{counts.published}</td><td>{counts.blocked}</td></tr>; })}</tbody></table></div></section>
    </div>
  </AppShell>;
}
