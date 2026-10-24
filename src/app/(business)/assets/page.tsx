import { headers as getHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { getPayload, type Where } from "payload";
import config from "@payload-config";
import { PLATFORMS } from "@/lib/platforms";
import { businessDate, businessDayRange } from "@/lib/business-date";
import AssetsClient from "./assets-client";
import AppShell from "../components/app-shell";

export const dynamic = "force-dynamic";

export default async function AssetsPage({ searchParams }: { searchParams?: Promise<Record<string,string | undefined>> }) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await getHeaders() });
  if (!user) redirect("/admin/login?redirect=/content-management");
  const params = (await searchParams) || {};
  const conditions: Where[] = [];
  if(params.query)conditions.push({title:{contains:params.query}});
  for(const key of ["project","plan","category","platform","status","type"]){const value=params[key];if(value && value!=="all")conditions.push({[{project:"project",plan:"contentPlan",category:"articleCategory",platform:"targetPlatforms",status:"status",type:"contentType"}[key]!]:{equals:value}});}
  if(params.date)conditions.push({plannedPublishDate:businessDayRange(params.date)});
  if(params.start)conditions.push({plannedPublishDate:{greater_than_equal:`${params.start}T00:00:00+08:00`}});
  if(params.end)conditions.push({plannedPublishDate:{less_than:businessDayRange(params.end).less_than}});
  const pageSize = [10,20,50].includes(Number(params.size)) ? Number(params.size) : 10;
  const [projects, plans, assets, allAssets, allTasks] = await Promise.all([
    payload.find({ collection:"projects",where:{deletedAt:{exists:false}},sort:"name",pagination:false,depth:0,overrideAccess:false,user }),
    payload.find({ collection:"content-plans",sort:"-planDate",pagination:false,depth:0,overrideAccess:false,user }),
    payload.find({ collection:"content-assets",where:conditions.length ? {and:conditions}:undefined,select:{project:true,contentPlan:true,articleCategory:true,contentType:true,title:true,targetPlatforms:true,status:true,sourceType:true,plannedPublishDate:true,updatedAt:true},sort:"-updatedAt",page:Math.max(1,Number(params.page)||1),limit:pageSize,depth:0,overrideAccess:false,user }),
    payload.find({ collection:"content-assets",select:{status:true,articleCategory:true},pagination:false,depth:0,overrideAccess:false,user }),
    payload.find({ collection:"publication-tasks",pagination:false,depth:0,overrideAccess:false,user }),
  ]);
  const activeIds = new Set(allAssets.docs.map(a=>String(a.id)));
  const tasks = allTasks.docs.filter(t=>activeIds.has(String(typeof t.contentAsset === "object" ? t.contentAsset.id : t.contentAsset)));
  const pageIds = new Set(assets.docs.map(a=>String(a.id)));
  const pageTasks=tasks.filter(t=>pageIds.has(String(typeof t.contentAsset === "object" ? t.contentAsset.id : t.contentAsset)));
  const pendingIds = new Set(tasks.filter(t=>t.status==="pending").map(t=>String(typeof t.contentAsset === "object" ? t.contentAsset.id : t.contentAsset)));
  const publishedToday=tasks.filter(t=>t.status==="published" && t.publishedAt && businessDate(t.publishedAt)===businessDate()).length;

  return <AppShell userName={user.displayName} breadcrumbs={["首页", "内容资产管理"]}><AssetsClient categoryValues={allAssets.docs.map(a => a.articleCategory).filter((c): c is string => Boolean(c))} initialProjects={projects.docs} initialPlans={plans.docs} initialAssets={assets.docs} initialTasks={pageTasks} totalDocs={assets.totalDocs} totalPages={assets.totalPages} platforms={PLATFORMS.map(({ key, name }) => ({ key, name }))} initialQuery={params.query || ""} metrics={{ total: allAssets.totalDocs, reviewing: allAssets.docs.filter(a=>a.status==="reviewing").length, approved: allAssets.docs.filter(a=>a.status==="approved" && pendingIds.has(String(a.id))).length, publishedToday }} /></AppShell>;
}
