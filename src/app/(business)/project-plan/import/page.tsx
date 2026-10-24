import { headers as getHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { getPayload } from "payload";
import config from "@payload-config";
import { PLATFORMS } from "@/lib/platforms";
import PlanImportClient from "./plan-import-client";
import AppShell from "../../components/app-shell";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ project?: string | string[] }>;

export default async function PlanImportPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const projectParam = Array.isArray(params.project) ? params.project[0] : params.project;
  const redirectPath = projectParam ? `/project-plan/import?project=${encodeURIComponent(projectParam)}` : "/project-plan/import";
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await getHeaders() });
  if (!user) redirect(`/admin/login?redirect=${encodeURIComponent(redirectPath)}`);
  if (!projectParam) redirect("/planning-management");
  const project = await payload.findByID({ collection: "projects", id: projectParam, depth: 0, overrideAccess: false, user }).catch(() => null);
  if (!project || project.deletedAt) redirect("/planning-management");
  const configs = await payload.find({ collection: "platform-configs", pagination: false, overrideAccess: false, user });
  return <AppShell userName={user.displayName} breadcrumbs={["首页", "项目管理", project.name, "导入每日规划"]}><PlanImportClient project={{ id: project.id, name: project.name }} platforms={PLATFORMS.filter(p=>configs.docs.some(c=>c.key===p.key && c.enabled)).map(({ key, name }) => ({ key, name }))} /></AppShell>;
}
