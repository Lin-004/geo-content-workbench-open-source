import { headers as getHeaders } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getPayload } from "payload";
import config from "@payload-config";
import { matchPlanArticles } from "@/lib/plan-articles";
import { businessDate } from "@/lib/business-date";
import AppShell from "../../../components/app-shell";
import { PlatformBadges, Progress, StatusBadge } from "../../../components/business";
import { Icon } from "../../../components/icons";
import { aggregateContentPlanStatus, relationId } from "@/lib/content-plan-utils";

export const dynamic = "force-dynamic";

function dateOnly(value: string) { return businessDate(value); }

export default async function ProjectDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ plans?: string | string[] }> }) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await getHeaders() });
  if (!user) redirect("/admin/login?redirect=/project-management/detail");
  const { id } = await params;
  const showAllPlans = (await searchParams).plans === "all";
  const project = await payload.findByID({ collection: "projects", id, depth: 1, overrideAccess: false, user }).catch(() => null);
  if (!project) notFound();
  const [plans, assets, tasks, planItems] = await Promise.all([
    payload.find({ collection: "content-plans", where: { project: { equals: id } }, sort: "-planDate", pagination: false, depth: 1, overrideAccess: false, user }),
    payload.find({ collection: "content-assets", where: { project: { equals: id } }, pagination: false, depth: 0, overrideAccess: false, user }),
    payload.find({ collection: "publication-tasks", pagination: false, depth: 0, overrideAccess: false, user }),
    payload.find({ collection: "content-plan-items", pagination: false, depth: 0, overrideAccess: false, user }),
  ]);
  const activeAssets = assets.docs.filter((asset) => !asset.deletedAt);
  const assetMap = new Map(activeAssets.map((asset) => [String(asset.id), asset]));
  const assetsByPlan = new Map<string, typeof activeAssets>();
  for (const asset of activeAssets) {
    const planId = relationId(asset.contentPlan);
    if (planId) assetsByPlan.set(String(planId), [...(assetsByPlan.get(String(planId)) || []), asset]);
  }
  for (const plan of plans.docs) {
    const legacyId = relationId(plan.contentAsset);
    const legacyAsset = legacyId ? assetMap.get(String(legacyId)) : undefined;
    if (legacyAsset && !assetsByPlan.get(String(plan.id))?.some((asset) => String(asset.id) === String(legacyAsset.id))) assetsByPlan.set(String(plan.id), [...(assetsByPlan.get(String(plan.id)) || []), legacyAsset]);
  }
  const itemsByPlan = new Map<string, typeof planItems.docs>();
  for (const item of planItems.docs) {
    const planId = relationId(item.contentPlan);
    if (planId) itemsByPlan.set(planId, [...(itemsByPlan.get(planId) || []), item]);
  }
  const tasksForAsset = new Map<string, typeof tasks.docs>();
  for (const task of tasks.docs) { const key = String(relationId(task.contentAsset)); tasksForAsset.set(key, [...(tasksForAsset.get(key) || []), task]); }
  const groups = new Map<string, { date: string; topic: string; plan: typeof plans.docs[number]; assets: typeof activeAssets; items: typeof planItems.docs }>();
  for (const plan of plans.docs) {
    const date = dateOnly(plan.planDate);
    const planAssets = assetsByPlan.get(String(plan.id)) || [];
    const planItemsForDate = itemsByPlan.get(String(plan.id)) || [];
    const group = groups.get(date);
    if (group) {
      const mergedAssets = new Map([...group.assets, ...planAssets].map((asset) => [String(asset.id), asset]));
      const mergedItems = new Map([...group.items, ...planItemsForDate].map((item) => [String(item.id), item]));
      group.assets = Array.from(mergedAssets.values());
      group.items = Array.from(mergedItems.values());
    } else groups.set(date, { date, topic: plan.dailyTheme || plan.topic, plan, assets: planAssets, items: planItemsForDate });
  }
  const dailyGroups = Array.from(groups.values());
  const visibleDailyGroups = showAllPlans ? dailyGroups : dailyGroups.slice(0, 8);
  const projectAssetIds = new Set(activeAssets.map((asset) => String(asset.id)));
  const projectTasks = tasks.docs.filter((task) => projectAssetIds.has(String(relationId(task.contentAsset))));
  const published = projectTasks.filter((task) => task.status === "published").length;
  const totalTasks = projectTasks.length;
  const percent = totalTasks ? Math.round(published / totalTasks * 100) : 0;
  const plannedArticleCount = dailyGroups.reduce((sum, group) => sum + Math.max(group.assets.length, group.items.length), 0);
  const uncreatedArticleCount = dailyGroups.reduce((sum, group) => sum + matchPlanArticles(group.items, group.assets).filter((row) => !row.asset).length, 0);
  const platformCounts = new Map<string, number>();
  for (const group of dailyGroups) {
    const platforms = [...group.assets.flatMap(asset=>asset.targetPlatforms), ...matchPlanArticles(group.items,group.assets).filter(row=>!row.asset).flatMap(row=>row.item.targetPlatforms)];
    for (const platform of platforms) platformCounts.set(platform, (platformCounts.get(platform) || 0) + 1);
  }
  const ownerName = typeof project.owner === "object" ? project.owner.displayName : user.displayName;
  return <AppShell userName={user.displayName} breadcrumbs={["项目管理", project.name, "项目详情"]}>
    <div className="page-content">
      <div className="page-heading"><div><div className="crumb-link"><a href="/planning-management">项目管理</a><span>/</span><span>{project.name}</span></div><h1 className="page-title">{project.name}</h1><p className="page-subtitle">按日期管理每日内容规划与发布进度</p></div><div className="heading-actions"><a className="secondary-button" href={`/project-management/create?id=${project.id}`}><Icon name="edit" size={16} />编辑项目</a><a className="secondary-button" href={`/project-plan/import?project=${project.id}`}><Icon name="upload" size={16} />导入每日规划</a><a className="primary-button" href={`/project-management/detail/${project.id}/new-plan`}><Icon name="plus" size={16} />新增每日规划</a></div></div>
      <section className="panel project-overview"><div><span>项目周期</span><strong>{dateOnly(project.startDate)} ～ {dateOnly(project.endDate)}</strong></div><div><span>负责人</span><strong><span className="owner-cell"><span className="avatar small-avatar">{ownerName.slice(0, 1)}</span>{ownerName}</span></strong></div><div><span>项目状态</span><strong><StatusBadge status={businessDate(project.startDate) > businessDate() ? "not_started" : businessDate(project.endDate) >= businessDate() ? "active" : "ended"} /></strong></div><div><span>每日规划数</span><strong>{dailyGroups.length}</strong></div><div><span>已发布任务</span><strong className="green-text">{published}</strong></div><div><span>已生成任务完成率</span><strong className="primary-text">{percent}%</strong></div><div className="overview-progress"><div className="progress-track"><div className="progress-fill" style={{ width: `${percent}%` }} /></div></div></section>
      <div className="split-layout project-detail-layout">
        <section className="panel" id="daily-plans"><div className="panel-heading"><div><h2>每日内容规划</h2><span className="hint">每个日期是一条规划，文章规划项与内容资产分开管理</span></div></div><div className="data-table-wrap"><table className="data-table"><thead><tr><th>日期</th><th>每日主题</th><th>文章数量</th><th>内容状态</th><th>平台概况</th><th>发布进度</th><th>操作</th></tr></thead><tbody>{dailyGroups.length === 0 ? <tr><td colSpan={7}><div className="empty-state">暂无每日内容规划</div></td></tr> : visibleDailyGroups.map((group) => { const groupTasks = group.assets.flatMap((asset) => tasksForAsset.get(String(asset.id)) || []); const done = groupTasks.filter((task) => task.status === "published").length; const status = aggregateContentPlanStatus(group.assets, groupTasks, group.items); const platforms = Array.from(new Set([...group.assets.flatMap(asset=>asset.targetPlatforms),...group.items.flatMap(item=>item.targetPlatforms)])); const articleCount = Math.max(group.assets.length, group.items.length); return <tr key={group.date}><td>{group.date}</td><td className="primary-cell">{group.topic}</td><td>{articleCount} 篇</td><td><StatusBadge status={status} /></td><td><PlatformBadges platforms={platforms} /></td><td><Progress done={done} total={groupTasks.length} green={done > 0 && done === groupTasks.length} /></td><td><a className="text-button" href={`/project-management/detail/${project.id}/plan/${group.plan.id}`}>查看详情</a></td></tr>; })}</tbody></table></div><div className="table-footer"><span>共 {dailyGroups.length} 条每日规划</span>{dailyGroups.length > 8 && <a className="text-button" href={`/project-management/detail/${project.id}${showAllPlans ? "" : "?plans=all"}#daily-plans`}>{showAllPlans ? "收起规划" : "查看全部规划"} <Icon name="chevron-right" size={14} /></a>}</div></section>
        <aside className="detail-side"><section className="panel"><h2>项目概览</h2><div className="side-stat-grid"><div className="side-stat"><span>每日规划数</span><strong>{dailyGroups.length}</strong></div><div className="side-stat"><span>文章/规划项</span><strong>{plannedArticleCount}</strong></div><div className="side-stat"><span>待发布任务</span><strong>{projectTasks.filter(t=>t.status === "pending").length}</strong></div><div className="side-stat"><span>未创建文章</span><strong>{uncreatedArticleCount}</strong></div></div><div className="mini-progress"><span>已生成任务完成率</span><b>{percent}%</b><div className="progress-track"><div className="progress-fill" style={{ width: `${percent}%` }} /></div></div></section><section className="panel"><h2>平台分布</h2><div className="platform-distribution">{Array.from(platformCounts.entries()).map(([platform, count]) => <div className="platform-dist-row" key={platform}><span><span className="legend-dot blue-dot" />{platform}</span><strong>{count}</strong></div>)}</div>{platformCounts.size === 0 && <p className="empty-state">暂无平台数据</p>}</section></aside>
      </div>
      <p className="notice"><Icon name="info" size={15} />规划导入只保存每日规划和文章规划项，不自动创建内容资产；需要发布时可在每日规划详情中按篇创建内容。</p>
    </div>
  </AppShell>;
}
