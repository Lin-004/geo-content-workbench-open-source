import { headers as getHeaders } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getPayload } from "payload";
import config from "@payload-config";
import { PLATFORMS } from "@/lib/platforms";
import ContentFormClient from "./content-form-client";
import { relationId } from "@/lib/content-plan-utils";
import { businessDate } from "@/lib/business-date";
import AppShell from "../../components/app-shell";

export const dynamic = "force-dynamic";

export default async function ContentCreatePage({ searchParams }: { searchParams: Promise<{ id?: string; plan?: string; category?: string; item?: string; copy?: string }> }) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await getHeaders() });
  if (!user) redirect("/admin/login?redirect=/content-management/create");
  const { id, plan, category, item, copy } = await searchParams;
  const [projects, plans, initialAsset, configs, copyAsset, initialItem] = await Promise.all([
    payload.find({ collection: "projects", where: { deletedAt: { exists: false } }, sort: "name", pagination: false, depth: 0, overrideAccess: false, user }),
    payload.find({ collection: "content-plans", sort: "-planDate", pagination: false, depth: 0, overrideAccess: false, user }),
    id ? payload.findByID({ collection: "content-assets", id, depth: 1, overrideAccess: false, user }).catch(() => null) : Promise.resolve(null),
    payload.find({ collection: "platform-configs", pagination: false, depth: 0, overrideAccess: false, user }),
    copy ? payload.findByID({ collection: "content-assets", id: copy, depth: 1, overrideAccess: false, user }).catch(() => null) : Promise.resolve(null),
    item ? payload.findByID({ collection: "content-plan-items", id: item, depth: 0, overrideAccess: false, user }).catch(() => null) : Promise.resolve(null),
  ]);
  if ((copy && !copyAsset) || (id && !initialAsset) || (item && !initialItem)) notFound();
  if (initialAsset) {
    const published = await payload.find({ collection: "publication-tasks", where: { and: [{ contentAsset: { equals: initialAsset.id } }, { status: { equals: "published" } }] }, limit: 1, overrideAccess: false, user });
    if (initialAsset.status === "reviewing" || published.totalDocs) redirect(`/content-management/detail/${initialAsset.id}`);
  }
  if (initialItem) {
    const existing = await payload.find({ collection: "content-assets", where: { contentPlanItem: { equals: initialItem.id } }, limit: 1, overrideAccess: false, user });
    if (existing.totalDocs) redirect(`/content-management/detail/${existing.docs[0].id}`);
  }
  const planId = initialItem ? relationId(initialItem.contentPlan) : plan;
  const selectedPlan = plans.docs.find((p) => String(p.id) === planId);
  const selectedProject = selectedPlan?.project && typeof selectedPlan.project === "object" ? String(selectedPlan.project.id) : selectedPlan?.project ? String(selectedPlan.project) : undefined;
  return <AppShell userName={user.displayName} breadcrumbs={["首页", "内容资产管理", initialAsset ? "编辑内容" : "新增内容"]}><ContentFormClient projects={projects.docs} plans={plans.docs} platforms={PLATFORMS.filter((p) => configs.docs.some((c) => c.key === p.key && c.enabled) || initialAsset?.targetPlatforms.includes(p.key)).map(({ key, name }) => ({ key, name }))} initialAsset={initialAsset || (copyAsset ? { ...copyAsset, status: "draft", contentPlan: null, contentPlanItem: null, title: `${copyAsset.title}（修订稿）` } : undefined)} isCopy={Boolean(copyAsset)} initialPlan={planId} initialItem={initialItem || undefined} initialPlanDate={selectedPlan ? businessDate(selectedPlan.planDate) : undefined} initialProject={selectedProject} initialCategory={category} /></AppShell>;
}
