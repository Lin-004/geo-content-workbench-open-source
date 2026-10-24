import { headers as getHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { getPayload } from "payload";
import config from "@payload-config";
import { PLATFORMS } from "@/lib/platforms";
import ProjectFormClient from "./project-form-client";
import AppShell from "../../components/app-shell";

export const dynamic = "force-dynamic";

export default async function ProjectCreatePage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await getHeaders() });
  if (!user) redirect("/admin/login?redirect=/project-management/create");
  const { id } = await searchParams;
  const project = id ? await payload.findByID({ collection: "projects", id, depth: 0, overrideAccess: false, user }).catch(() => null) : null;
  return <AppShell userName={user.displayName} breadcrumbs={["首页", "项目管理", id ? "编辑项目" : "新增项目"]}><ProjectFormClient ownerId={user.id} initialProject={project || undefined} platforms={PLATFORMS.map(({ key, name }) => ({ key, name }))} /></AppShell>;
}
