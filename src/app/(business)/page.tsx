import { headers as getHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { getPayload } from "payload";
import config from "@payload-config";
import { businessDate, addBusinessDays, businessWeekStart } from "@/lib/business-date";
import AppShell from "./components/app-shell";
import {publicationTaskDate} from "@/lib/publication-date";
import { Donut, MetricCard, PlatformBadges, Progress, StatusBadge } from "./components/business";
import { Icon } from "./components/icons";
import { aggregateContentPlanStatus, relationId } from "@/lib/content-plan-utils";

export const dynamic = "force-dynamic";

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00+08:00`);
  value.setTime(value.getTime() + days * 24 * 60 * 60 * 1000);
  return value.toISOString();
}

function shortDate(date: string) { return businessDate(date).slice(5, 10).replace("-", "/"); }

export default async function DashboardPage() {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await getHeaders() });
  if (!user) redirect("/admin/login?redirect=/dashboard");

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
  const todayStart = new Date(`${today}T00:00:00+08:00`).toISOString();
  const todayEnd = addDays(today, 1);
  const localDate = new Date(`${today}T00:00:00Z`);
  const weekday = localDate.getUTCDay();
  const weekStart = new Date(localDate);
  weekStart.setUTCDate(localDate.getUTCDate() - (weekday === 0 ? 6 : weekday - 1));
  const weekStartDate = weekStart.toISOString().slice(0, 10);
  const [projects, assets, reviewing, allTasks, todayPlans, weekPlans, planItems] = await Promise.all([
    payload.find({ collection: "projects", pagination: false, depth: 0, overrideAccess: false, user }),
    payload.find({ collection: "content-assets", select: {project:true,contentPlan:true,contentPlanItem:true,articleCategory:true,question:true,title:true,status:true,targetPlatforms:true,plannedPublishDate:true,deletedAt:true}, pagination: false, depth: 0, overrideAccess: false, user }),
    payload.find({ collection: "content-assets", where: { status: { equals: "reviewing" } }, limit: 1, overrideAccess: false, user }),
    payload.find({ collection: "publication-tasks", pagination: false, depth: 0, overrideAccess: false, user }),
    payload.find({ collection: "content-plans", where: { and: [{ planDate: { greater_than_equal: todayStart } }, { planDate: { less_than: todayEnd } }] }, sort: "-planDate", pagination: false, depth: 0, overrideAccess: false, user }),
    payload.find({ collection: "content-plans", where: { and: [{ planDate: { greater_than_equal: new Date(`${weekStartDate}T00:00:00+08:00`).toISOString() } }, { planDate: { less_than: addDays(weekStartDate, 7) } }] }, sort: "-planDate", pagination: false, depth: 0, overrideAccess: false, user }),
    payload.find({ collection: "content-plan-items", pagination: false, depth: 0, overrideAccess: false, user }),
  ]);
  const weeklyGroups = new Map<string, { plan: typeof weekPlans.docs[number]; plans: typeof weekPlans.docs }>();
  for (const plan of weekPlans.docs) {
    const key = `${businessDate(plan.planDate)}:${relationId(plan.project)}`;
    const group = weeklyGroups.get(key);
    if (group) group.plans.push(plan);
    else weeklyGroups.set(key, { plan, plans: [plan] });
  }
  const projectNames = new Map(projects.docs.map((project) => [String(project.id), project.name]));
  const activeAssets = assets.docs.filter((asset) => !asset.deletedAt);
  const assetMap = new Map(activeAssets.map((asset) => [String(asset.id), asset]));
  const assetsByPlan = new Map<string, typeof activeAssets>();
  for (const asset of activeAssets) { const planId = relationId(asset.contentPlan); if (planId) assetsByPlan.set(String(planId), [...(assetsByPlan.get(String(planId)) || []), asset]); }
  for (const plan of [...todayPlans.docs, ...weekPlans.docs]) { const legacyId = relationId(plan.contentAsset); const legacy = legacyId ? assetMap.get(String(legacyId)) : undefined; if (legacy && !assetsByPlan.get(String(plan.id))?.some((asset) => String(asset.id) === String(legacy.id))) assetsByPlan.set(String(plan.id), [...(assetsByPlan.get(String(plan.id)) || []), legacy]); }
  const itemsByPlan = new Map<string, typeof planItems.docs>();
  for (const item of planItems.docs) { const planId = relationId(item.contentPlan); if (planId) itemsByPlan.set(planId, [...(itemsByPlan.get(planId) || []), item]); }
  const tasksByAsset = new Map<string, typeof allTasks.docs>();
  const activeIds=new Set(activeAssets.map(a=>String(a.id)));
  const validTasks=allTasks.docs.filter(t=>activeIds.has(relationId(t.contentAsset)));
  for (const task of validTasks) {
    const key = relationId(task.contentAsset);
    tasksByAsset.set(key, [...(tasksByAsset.get(key) || []), task]);
  }
  const planDates = new Map([...todayPlans.docs, ...weekPlans.docs].map((p) => [String(p.id), businessDate(p.planDate)]));
  const todayRows = activeAssets.filter(a => (tasksByAsset.get(String(a.id)) || []).some(t=>publicationTaskDate(t,a)===today) || (!a.plannedPublishDate && planDates.get(relationId(a.contentPlan))===today)).map((asset) => ({ asset, plan: todayPlans.docs.find((p) => String(p.id) === relationId(asset.contentPlan)), tasks: tasksByAsset.get(String(asset.id)) || [] }));
  /* legacy plan grouping is handled by assetsByPlan above */
  const publishedAssetIds = new Set(activeAssets.filter(a=>{const tasks=tasksByAsset.get(String(a.id))||[];return tasks.length>0 && tasks.every(t=>t.status==="published");}).map(a=>String(a.id)));
  const assetValues = [
    activeAssets.filter((asset) => asset.status === "draft" && !publishedAssetIds.has(String(asset.id))).length,
    activeAssets.filter((asset) => asset.status === "reviewing").length,
    activeAssets.filter((asset) => asset.status === "approved" && !publishedAssetIds.has(String(asset.id))).length,
    publishedAssetIds.size,
  ];
  const publishedToday = validTasks.filter((task) => task.status === "published" && task.publishedAt && task.publishedAt >= todayStart && task.publishedAt < todayEnd).length;
  const approvedWaiting = activeAssets.filter((asset) => asset.status === "approved" && (tasksByAsset.get(String(asset.id)) || []).some((task) => task.status === "pending")).length;
  const todayPending = todayRows.reduce((sum, row) => sum + row.tasks.filter((task) => task.status === "pending" && publicationTaskDate(task,row.asset) === today).length, 0);
  const trend = Array.from({ length: 7 }, (_, index) => {
    const date = addBusinessDays(today, index - 6);
    return { date, count: validTasks.filter((task) => task.status === "published" && task.publishedAt && businessDate(task.publishedAt) === date).length };
  });
  const maxTrend = Math.max(...trend.map((item) => item.count), 1);

  return <AppShell userName={user.displayName} breadcrumbs={["首页", "工作看板"]}>
    <div className="page-content">
      <div className="page-heading"><div><h1 className="page-title">工作看板</h1><p className="page-subtitle">提高每日内容交付效率</p></div><a className="secondary-button" href="/publications?scope=overdue">查看逾期待办</a></div>
      <section className="metric-grid"><MetricCard label="今日待发布任务" value={todayPending} color="blue" icon="send" trend="down" /><MetricCard label="审核中文章" value={reviewing.totalDocs} color="orange" icon="clock" trend="up" /><MetricCard label="已审核待发布文章" value={approvedWaiting} color="green" icon="check" trend="up" /><MetricCard label="今日已发布任务" value={publishedToday} color="purple" icon="send" trend="up" /></section>
      <div className="dashboard-grid">
        <div className="dashboard-stack">
          <section className="panel"><div className="panel-heading"><h2 className="with-icon"><Icon name="content" size={18} />今日发布任务</h2><a className="text-button" href="/publications?scope=today">查看更多任务 <Icon name="chevron-right" size={14} /></a></div><div className="data-table-wrap"><table className="data-table"><thead><tr><th>文章标题</th><th>所属项目</th><th>发布平台</th><th>发布进度</th><th>操作</th></tr></thead><tbody>{todayRows.length === 0 ? <tr><td colSpan={5}><div className="empty-state">今天暂无发布规划</div></td></tr> : todayRows.slice(0, 5).map(({ plan, asset, tasks }) => { const published = tasks.filter((task) => task.status === "published").length; const platforms = asset?.targetPlatforms || plan?.platforms || []; return <tr key={`${plan?.id || "none"}-${asset?.id || "empty"}`}><td className="primary-cell">{asset?.title || plan?.title || "未命名内容"}</td><td>{projectNames.get(relationId(asset?.project || plan?.project)) || "—"}</td><td><PlatformBadges platforms={platforms} /></td><td><Progress done={published} total={tasks.length || platforms.length} /></td><td><a className="text-button" href={asset ? `/content-management/detail/${asset.id}` : "/planning-management"}>查看详情</a></td></tr>; })}</tbody></table></div></section>
          <section className="panel"><div className="panel-heading"><h2>本周项目规划</h2><a className="text-button" href="/content-schedule">查看更多规划 <Icon name="chevron-right" size={14} /></a></div><div className="data-table-wrap"><table className="data-table"><thead><tr><th>日期</th><th>项目</th><th>每日主题</th><th>文章数量</th><th>内容状态</th><th>发布进度</th><th>操作</th></tr></thead><tbody>{weekPlans.docs.length === 0 ? <tr><td colSpan={7}><div className="empty-state">本周暂无项目规划</div></td></tr> : Array.from(weeklyGroups.entries()).map(([key, { plan, plans: dayPlans }]) => { const dayAssets = Array.from(new Map(dayPlans.flatMap((item) => assetsByPlan.get(String(item.id)) || []).map((asset) => [String(asset.id), asset])).values()); const dayItems = Array.from(new Map(dayPlans.flatMap((item) => itemsByPlan.get(String(item.id)) || []).map((item) => [String(item.id), item])).values()); const dayTasks = dayAssets.flatMap((asset) => tasksByAsset.get(String(asset.id)) || []); const dayStatus = aggregateContentPlanStatus(dayAssets, dayTasks, dayItems); const published = dayTasks.filter((task) => task.status === "published").length; const articleCount = Math.max(dayAssets.length, dayItems.length); return <tr key={key}><td>{shortDate(plan.planDate)}</td><td>{projectNames.get(relationId(plan.project)) || "—"}</td><td className="primary-cell">{plan.dailyTheme || plan.topic}</td><td>{articleCount} 篇</td><td><StatusBadge status={dayStatus} /></td><td><Progress done={published} total={dayTasks.length} green={published > 0 && published === dayTasks.length} /></td><td><a className="text-button" href={`/project-management/detail/${relationId(plan.project)}/plan/${plan.id}`}>查看详情</a></td></tr>; })}</tbody></table></div></section>
        </div>
        <div className="dashboard-stack"><section className="panel"><div className="panel-heading"><h2>内容资产状态分布</h2></div><Donut total={activeAssets.length} values={assetValues} labels={[{ label: "草稿", color: "#4b8df8" }, { label: "审核中", color: "#f7a51a" }, { label: "已审核", color: "#36b985" }, { label: "已发布", color: "#8662df" }]} /></section><section className="panel"><div className="panel-heading"><h2>近 7 天发布趋势</h2></div><div className="chart-area"><div className="chart-y"><span>{maxTrend}</span><span>{Math.ceil(maxTrend * .66)}</span><span>{Math.ceil(maxTrend * .33)}</span><span>0</span></div><div className="bar-chart">{trend.map((item, index) => <div className="bar-group" key={item.date}><span className="bar-value">{item.count || ""}</span><i className={`bar${index === trend.length - 1 ? " current" : ""}`} style={{ height: `${Math.max(item.count / maxTrend * 72, 4)}%` }} /><span className="bar-label">{shortDate(item.date)}</span></div>)}</div></div></section></div>
      </div>
    </div>
  </AppShell>;
}
