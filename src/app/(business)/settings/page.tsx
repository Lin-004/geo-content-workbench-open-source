import { headers as getHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { getPayload } from "payload";
import config from "@payload-config";
import AppShell from "../components/app-shell";
import SettingsClient from "./settings-client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await getHeaders() });
  if (!user) redirect("/admin/login?redirect=/settings");
  const configs = await payload.find({ collection: "platform-configs", sort: "createdAt", limit: 100, depth: 0, overrideAccess: false, user });
  return <AppShell userName={user.displayName} breadcrumbs={["首页", "系统设置"]}><SettingsClient initialConfigs={configs.docs.map((item) => ({ id: item.id, key: item.key, name: item.name, publishUrl: item.publishUrl, enabled: Boolean(item.enabled) }))} /></AppShell>;
}
