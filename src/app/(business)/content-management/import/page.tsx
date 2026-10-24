import { headers as getHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { getPayload } from "payload";
import config from "@payload-config";
import { PLATFORMS } from "@/lib/platforms";
import ContentImportClient from "./content-import-client";
import AppShell from "../../components/app-shell";

export const dynamic = "force-dynamic";

export default async function ContentImportPage() {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await getHeaders() });
  if (!user) redirect("/admin/login?redirect=/content-management/import");
  const [projects, plans, items, configs] = await Promise.all([
    payload.find({ collection: "projects", where: { deletedAt: { exists: false } }, sort: "name", pagination: false, depth: 0, overrideAccess: false, user }),
    payload.find({ collection: "content-plans", sort: "-planDate", pagination: false, depth: 0, overrideAccess: false, user }),
    payload.find({ collection: "content-plan-items", pagination: false, depth: 0, overrideAccess: false, user }),
    payload.find({ collection: "platform-configs", pagination: false, depth: 0, overrideAccess: false, user }),
  ]);
  return <AppShell userName={user.displayName} breadcrumbs={["首页", "内容资产管理", "导入内容"]}><ContentImportClient projects={projects.docs} plans={plans.docs} items={items.docs} platforms={PLATFORMS.filter(p => configs.docs.some(c => c.key === p.key && c.enabled)).map(({ key, name }) => ({ key, name }))} /></AppShell>;
}
