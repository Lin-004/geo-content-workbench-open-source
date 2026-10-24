import { headers as getHeaders } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getPayload } from "payload";
import config from "@payload-config";
import ContentDetailClient from "./detail-client";
import AppShell from "../../../components/app-shell";

export const dynamic = "force-dynamic";

export default async function ContentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await getHeaders() });
  if (!user) redirect("/admin/login?redirect=/content-management");
  const { id } = await params;
  const asset = await payload.findByID({ collection: "content-assets", id, depth: 1, overrideAccess: false, user }).catch(() => null);
  if (!asset) notFound();
  const [tasks, audits] = await Promise.all([
    payload.find({ collection: "publication-tasks", where: { contentAsset: { equals: id } }, pagination: false, depth: 1, overrideAccess: false, user }),
    payload.find({ collection: "audit-records", where: { contentAsset: { equals: id } }, sort: "createdAt", pagination: false, depth: 1, overrideAccess: false, user }),
  ]);
  return <AppShell userName={user.displayName} breadcrumbs={["首页", "内容资产管理", "内容详情"]}><ContentDetailClient asset={asset} tasks={tasks.docs} audits={audits.docs} projectName={typeof asset.project === "object" ? asset.project.name : "—"} /></AppShell>;
}
