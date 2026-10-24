import { headers as getHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { getPayload } from "payload";
import config from "@payload-config";
import { businessDate, businessWeekStart, addBusinessDays } from "@/lib/business-date";
import ProjectsClient from "./projects-client";
import AppShell from "../components/app-shell";

export const dynamic = "force-dynamic";

function relationId(value: unknown) { return value && typeof value === "object" && "id" in value ? String(value.id) : String(value ?? ""); }

export default async function ProjectsPage() {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await getHeaders() });
  if (!user) redirect("/admin/login?redirect=/planning-management");
  const [projects, plans, assets, tasks] = await Promise.all([
    payload.find({ collection: "projects", where: { deletedAt: { exists: false } }, sort: "-updatedAt", pagination: false, depth: 1, overrideAccess: false, user }),
    payload.find({ collection: "content-plans", pagination: false, depth: 0, overrideAccess: false, user }),
    payload.find({ collection: "content-assets", pagination: false, depth: 0, overrideAccess: false, user }),
    payload.find({ collection: "publication-tasks", pagination: false, depth: 0, overrideAccess: false, user }),
  ]);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
  const weekStart = `${businessWeekStart(today)}T00:00:00+08:00`;
  const weekEnd = `${addBusinessDays(businessWeekStart(today), 7)}T00:00:00+08:00`;
  const rows = projects.docs.map((project) => {
    const projectPlans = plans.docs.filter((plan) => relationId(plan.project) === String(project.id));
    const projectAssets = assets.docs.filter((asset) => relationId(asset.project) === String(project.id));
    const assetIds = new Set(projectAssets.map((asset) => String(asset.id)));
    const projectTasks = tasks.docs.filter((task) => assetIds.has(relationId(task.contentAsset)));
    const weekPlans = new Set(projectPlans.filter((plan) => { const date = new Date(plan.planDate); return date >= new Date(weekStart) && date < new Date(weekEnd); }).map((plan) => plan.planDate.slice(0, 10))).size;
    return { ...project, ownerName: typeof project.owner === "object" ? project.owner.displayName : user.displayName, contentCount: projectAssets.length, weekPlans, publishedCount: projectTasks.filter((task) => task.status === "published").length, weekPublishedCount: projectTasks.filter((task) => task.status === "published" && task.publishedAt && businessDate(task.publishedAt) >= businessDate(weekStart) && businessDate(task.publishedAt) < businessDate(weekEnd)).length };
  });
  return <AppShell userName={user.displayName} breadcrumbs={["首页", "项目管理"]}><ProjectsClient initialProjects={rows} stats={{ active: rows.filter((row) => businessDate(row.startDate) <= today && businessDate(row.endDate) >= today).length, weekPlans: rows.reduce((sum, row) => sum + row.weekPlans, 0), weekPublished: rows.reduce((sum, row) => sum + row.weekPublishedCount, 0) }} /></AppShell>;
}
