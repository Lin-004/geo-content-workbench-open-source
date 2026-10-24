import { headers as getHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { getPayload } from "payload";
import config from "@payload-config";
import { PLATFORMS } from "@/lib/platforms";
import PlanFormClient from "../../../../plans/plan-form-client";
import AppShell from "../../../../components/app-shell";

export const dynamic = "force-dynamic";

export default async function NewPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await getHeaders() });
  if (!user) redirect("/admin/login?redirect=/project-management/detail");
  const { id } = await params;
  const project = await payload.findByID({ collection: "projects", id, depth: 0, overrideAccess: false, user }).catch(() => null);
  if (!project) redirect("/planning-management");
  const configs=await payload.find({collection:"platform-configs",pagination:false,depth:0,overrideAccess:false,user});
  return <AppShell userName={user.displayName} breadcrumbs={["首页", "项目管理", "新增规划"]}><PlanFormClient project={project} platforms={PLATFORMS.filter(p=>configs.docs.some(c=>c.key===p.key && c.enabled)).map(({ key, name }) => ({ key, name }))} /></AppShell>;
}
