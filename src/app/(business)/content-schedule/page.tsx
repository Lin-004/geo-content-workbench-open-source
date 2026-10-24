import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getPayload, type Where } from "payload";
import config from "@payload-config";
import { aggregateContentPlanStatus, relationId } from "@/lib/content-plan-utils";
import {businessDate, businessWeekStart, addBusinessDays, isBusinessDate} from "@/lib/business-date";
import AppShell from "../components/app-shell";
import ScheduleClient, { type ScheduleRow } from "./schedule-client";

export const dynamic = "force-dynamic";

export default async function SchedulePage({searchParams}: {searchParams:Promise<Record<string,string|undefined>>}) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await headers() });
  if (!user) redirect("/admin/login?redirect=/content-schedule");
  const params = await searchParams;
  const date = isBusinessDate(params.date) ? params.date : businessDate();
  const week = businessWeekStart(date);
  let where: Where | undefined;
  if(params.view === "day")where={planDate:{greater_than_equal:`${date}T00:00:00+08:00`,less_than:`${addBusinessDays(date,1)}T00:00:00+08:00`}};
  else if(params.view !== "list" || !params.range || params.range === "week")where={planDate:{greater_than_equal:`${week}T00:00:00+08:00`,less_than:`${addBusinessDays(week,7)}T00:00:00+08:00`}};
  else if(params.range === "custom")where={and:[...(isBusinessDate(params.start)?[{planDate:{greater_than_equal:`${params.start}T00:00:00+08:00`}}]:[]),...(isBusinessDate(params.end)?[{planDate:{less_than:`${addBusinessDays(params.end,1)}T00:00:00+08:00`}}]:[])]};
  const [projects, plans] = await Promise.all([
    payload.find({collection:"projects",pagination:false,depth:0,overrideAccess:false,user}),
    payload.find({collection:"content-plans",where,pagination:false,sort:"-planDate",depth:0,overrideAccess:false,user}),
  ]);
  const ids=plans.docs.map(p=>p.id), legacyIds=plans.docs.map(p=>relationId(p.contentAsset)).filter(Boolean);
  const [items,assets] = await Promise.all([
    ids.length ? payload.find({collection:"content-plan-items",where:{contentPlan:{in:ids}},pagination:false,sort:"sortOrder",depth:0,overrideAccess:false,user}) : Promise.resolve({docs:[]}),
    ids.length ? payload.find({collection:"content-assets",where:{or:[{contentPlan:{in:ids}},...(legacyIds.length?[{id:{in:legacyIds}}]:[])]},select:{contentPlan:true,contentPlanItem:true,articleCategory:true,question:true,title:true,status:true,targetPlatforms:true},pagination:false,depth:0,overrideAccess:false,user}) : Promise.resolve({docs:[]}),
  ]);
  const tasks=assets.docs.length ? await payload.find({collection:"publication-tasks",where:{contentAsset:{in:assets.docs.map(a=>a.id)}},pagination:false,depth:0,overrideAccess:false,user}) : {docs:[]};
  const groups = new Map<string, typeof plans.docs>();
  for (const plan of plans.docs) {
    const key = `${relationId(plan.project)}:${businessDate(plan.planDate)}`;
    groups.set(key, [...(groups.get(key) || []), plan]);
  }
  const rows: ScheduleRow[] = Array.from(groups, ([key, group]) => {
    const plan = group[0];
    const ids = new Set(group.map((p) => String(p.id)));
    const dayAssets = assets.docs.filter((a) => (ids.has(relationId(a.contentPlan)) || group.some((p) => relationId(p.contentAsset) === String(a.id))));
    const assetIds = new Set(dayAssets.map((a) => String(a.id)));
    const dayTasks = tasks.docs.filter((t) => assetIds.has(relationId(t.contentAsset)));
    const dayItems = items.docs.filter((i) => ids.has(relationId(i.contentPlan)));
    return {
      key, id: String(plan.id), projectId: relationId(plan.project), date: businessDate(plan.planDate),
      theme: Array.from(new Set(group.map((p) => p.dailyTheme || p.topic))).join(" / "),
      status: aggregateContentPlanStatus(dayAssets, dayTasks, dayItems), planned: Math.max(dayItems.length, dayAssets.length), created: dayAssets.length,
      published: dayTasks.filter((t) => t.status === "published").length, total: dayTasks.length,
      platforms: Array.from(new Set([...group.flatMap((p) => p.platforms), ...dayItems.flatMap((i) => i.targetPlatforms), ...dayAssets.flatMap((a) => a.targetPlatforms)])),
      articles: dayItems.map((i) => ({ category: i.articleCategory, title: i.title || i.question, question: i.question, itemNote: i.itemNote })),
      assets: dayAssets.map((a) => ({ id: String(a.id), title: a.title, status: a.status })),
    };
  });
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
  return <AppShell userName={user.displayName} breadcrumbs={["内容排期"]}><ScheduleClient today={today} projects={projects.docs.map((p) => ({ id: String(p.id), name: p.name }))} rows={rows} /></AppShell>;
}
