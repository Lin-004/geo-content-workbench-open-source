import { contentTypeLabel } from "@/lib/content-types";
import { articleCategoryLabel } from "@/lib/article-categories";
import { headers as getHeaders } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getPayload } from "payload";
import config from "@payload-config";
import { matchPlanArticles } from "@/lib/plan-articles";
import { businessDate, businessDayRange } from "@/lib/business-date";
import AppShell from "../../../../../components/app-shell";
import { PlatformBadges, Progress, StatusBadge } from "../../../../../components/business";
import { Icon } from "../../../../../components/icons";
import { aggregateContentPlanStatus, relationId } from "@/lib/content-plan-utils";

export const dynamic = "force-dynamic";

function dateOnly(value: string) {
  return businessDate(value);
}

export default async function DailyPlanDetailPage({
  params,
}: {
  params: Promise<{ id: string; planId: string }>;
}) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await getHeaders() });
  if (!user) redirect("/admin/login?redirect=/project-management/detail");

  const { id, planId } = await params;
  const plan = await payload
    .findByID({ collection: "content-plans", id: planId, depth: 0, overrideAccess: false, user })
    .catch(() => null);
  if (!plan || relationId(plan.project) !== id) notFound();

  const project = await payload
    .findByID({ collection: "projects", id, depth: 0, overrideAccess: false, user })
    .catch(() => null);
  if (!project) notFound();

  const dayRange = businessDayRange(businessDate(plan.planDate));
  const [sameDayPlans, allAssets, allPlanItems, tasksResult] = await Promise.all([
    payload.find({
      collection: "content-plans",
      where: {
        and: [
          { project: { equals: id } },
          { planDate: dayRange },
        ],
      },
      pagination: false,
      depth: 0,
      overrideAccess: false,
      user,
    }),
    payload.find({
      collection: "content-assets",
      where: { project: { equals: id } },
      pagination: false,
      depth: 0,
      overrideAccess: false,
      user,
    }),
    payload.find({
      collection: "content-plan-items",
      pagination: false,
      depth: 0,
      overrideAccess: false,
      user,
    }),
    payload.find({
      collection: "publication-tasks",
      pagination: false,
      depth: 0,
      overrideAccess: false,
      user,
    }),
  ]);

  const planIds = new Set(sameDayPlans.docs.map((item) => String(item.id)));
  const assets = allAssets.docs.filter(
    (asset) =>
      !asset.deletedAt &&
      (planIds.has(String(relationId(asset.contentPlan))) ||
        sameDayPlans.docs.some((item) => String(relationId(item.contentAsset)) === String(asset.id))),
  );
  const planItems = allPlanItems.docs
    .filter((item) => planIds.has(String(relationId(item.contentPlan))))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.itemKey.localeCompare(b.itemKey, "en", { numeric: true }));
  const assetIds = new Set(assets.map((asset) => String(asset.id)));
  const tasks = tasksResult.docs.filter((task) => assetIds.has(String(relationId(task.contentAsset))));

  const tasksByAsset = new Map<string, typeof tasks>();
  for (const task of tasks) {
    const key = String(relationId(task.contentAsset));
    tasksByAsset.set(key, [...(tasksByAsset.get(key) || []), task]);
  }

  const status = aggregateContentPlanStatus(assets, tasks, planItems);
  const byCategory = new Map<string, typeof assets>();
  for (const asset of assets) {
    const category = asset.articleCategory || "general";
    byCategory.set(category, [...(byCategory.get(category) || []), asset]);
  }
  const planItemsByCategory = new Map<string, typeof planItems>();
  for (const item of planItems) {
    planItemsByCategory.set(item.articleCategory, [
      ...(planItemsByCategory.get(item.articleCategory) || []),
      item,
    ]);
  }

  const categoryOrder = [...new Set([...planItems.map(item => item.articleCategory), ...assets.map(asset => asset.articleCategory || "general")])];
  const hasContentAssets = assets.length > 0;
  const matchedIds = new Set(matchPlanArticles(planItems, assets).flatMap(row => row.asset ? [String(row.asset.id)] : []));
  const articleCount = planItems.length + assets.filter(asset => !matchedIds.has(String(asset.id))).length;
  const publishedTaskCount = tasks.filter((task) => task.status === "published").length;
  const pageSubtitle = hasContentAssets
    ? `${dateOnly(plan.planDate)} · 计划 ${articleCount} 篇 · 已创建 ${assets.length} 篇 · 独立审核和发布`
    : `${dateOnly(plan.planDate)} · ${articleCount} 个文章规划项 · 尚未创建内容资产`;

  return (
    <AppShell userName={user.displayName} breadcrumbs={["项目管理", project.name, "每日规划详情"]}>
      <div className="page-content daily-plan-page">
        <div className="page-heading">
          <div>
            <div className="crumb-link">
              <a href={`/project-management/detail/${project.id}`}>{project.name}</a>
              <span>/</span>
              <span>{dateOnly(plan.planDate)} 每日规划</span>
            </div>
            <h1 className="page-title">{plan.dailyTheme || plan.topic}</h1>
            <p className="page-subtitle">{pageSubtitle}</p>
          </div>
          <div className="heading-actions">
            <a className="secondary-button" href={`/project-management/detail/${project.id}`}>
              返回项目
            </a>
            <a className="primary-button" href={`/content-management/create?plan=${plan.id}&category=enterprise`}>
              <Icon name="plus" size={16} />
              新增额外文章
            </a>
          </div>
        </div>

        <section className="panel project-overview daily-plan-overview">
          <div className="daily-plan-overview-lead">
            <span className="daily-plan-eyebrow">DAILY PLAN</span>
            <div className="daily-plan-status-line">
              <strong>{dateOnly(plan.planDate)}</strong>
              <StatusBadge status={status} />
            </div>
            <span className="daily-plan-overview-note">
              {hasContentAssets
                ? `已创建 ${assets.length} / ${articleCount} 篇 · 已生成平台任务 ${publishedTaskCount} / ${tasks.length} 已完成`
                : `${articleCount} 个文章规划项 · 尚未创建内容资产`}
            </span>
          </div>
          <div className="daily-plan-stat">
            <span>每日主题</span>
            <strong>{plan.dailyTheme || plan.topic}</strong>
          </div>
          <div className="daily-plan-stat">
            <span>文章数量</span>
            <strong>{articleCount} 篇</strong>
          </div>
          <div className="daily-plan-stat">
            <span>发布任务</span>
            <strong>{hasContentAssets ? `${publishedTaskCount} / ${tasks.length}` : "—"}</strong>
          </div>
          <div className="daily-plan-stat">
            <span>每日备注</span>
            <strong>{plan.note || "—"}</strong>
          </div>
        </section>

        <section className="panel daily-articles-panel">
          <div className="panel-heading daily-articles-heading">
            <div>
              <h2>{hasContentAssets ? "当天文章" : "当天文章规划"}</h2>
              <span className="hint">
                {hasContentAssets
                  ? "每篇文章独立创建、审核和发布，不限定分类数量"
                  : "规划导入只保存文章规划项，创建内容资产后再独立编辑、审核和发布"}
              </span>
            </div>
          </div>

          {categoryOrder.map((category) => {
            const categoryAssets = byCategory.get(category) || [];
            const categoryItems = planItemsByCategory.get(category) || [];
            const pairs = matchPlanArticles(categoryItems, categoryAssets);
            const matched = new Set(pairs.flatMap((r) => r.asset ? [r.asset.id] : []));
            const rows = [...pairs, ...categoryAssets.filter((a) => !matched.has(a.id)).map((asset) => ({ item: undefined, asset }))];
            return <section className="daily-category" key={category}>
              <div className="panel-heading"><h3>{articleCategoryLabel(category)}</h3><span className="hint">计划 {categoryItems.length} 篇 · 已创建 {categoryAssets.length} 篇</span></div>
              <div className="data-table-wrap"><table className="data-table"><thead><tr><th>文章标题 / 规划问题</th><th>内容状态</th><th>目标平台</th><th>发布进度</th><th>操作</th></tr></thead><tbody>
                {!rows.length && <tr><td colSpan={5}><div className="empty-state">暂无{articleCategoryLabel(category)}文章规划</div></td></tr>}
                {rows.map(({ item, asset }) => { const assetTasks = asset ? tasksByAsset.get(String(asset.id)) || [] : []; const done = assetTasks.filter((t) => t.status === "published").length; return <tr key={item ? `item-${item.id}` : `asset-${asset!.id}`}>
                  <td className="primary-cell">{asset?.title || item?.title || "待补充标题"}<span className="status-pill">{contentTypeLabel(asset?.contentType || item?.contentType)}</span><div className="secondary-cell">问题：{asset?.question || item?.question || "—"}</div>{item?.itemNote && <details><summary>文章执行备注</summary><p style={{ whiteSpace: "pre-wrap" }}>{item.itemNote}</p></details>}</td>
                  <td><StatusBadge status={asset?.status || "uncreated"} /></td>
                  <td><PlatformBadges platforms={asset?.targetPlatforms || item?.targetPlatforms} /></td>
                  <td>{asset ? <Progress done={done} total={assetTasks.length} green={done > 0 && done === assetTasks.length} /> : <span className="hint">尚未创建内容</span>}</td>
                  <td><div className="row-actions">{asset ? <>{asset.status !== "reviewing" && done === 0 && <a className="text-button" href={`/content-management/create?id=${asset.id}`}>编辑</a>}<a className="text-button" href={`/content-management/detail/${asset.id}`}>{asset.status === "draft" ? "查看/提交审核" : "查看"}</a></> : <a className="text-button" href={`/content-management/create?item=${item!.id}&plan=${plan.id}&category=${encodeURIComponent(category)}`}>创建内容</a>}</div></td>
                </tr>; })}
              </tbody></table></div>
            </section>;
          })}
        </section>

        <p className="notice">
          <Icon name="info" size={15} />
          每日规划先核对每条文章规划是否已创建，再聚合审核与平台任务状态；规划导入本身不会创建内容资产，需在文章规划项上按篇创建后再审核和发布。
        </p>
      </div>
    </AppShell>
  );
}
