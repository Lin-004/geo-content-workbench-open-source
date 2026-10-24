import { headers as getHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { getPayload } from "payload";
import config from "@payload-config";
import { PLATFORMS } from "@/lib/platforms";
import { relationId } from "@/lib/content-plan-utils";
import {publicationTaskDate} from "@/lib/publication-date";
import { businessDate } from "@/lib/business-date";
import PublicationsClient from "./publications-client";
import AppShell from "../components/app-shell";

export const dynamic = "force-dynamic";
export default async function PublicationsPage({searchParams}: {searchParams: Promise<Record<string,string | undefined>>}) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await getHeaders() });
  if (!user) redirect("/admin/login?redirect=/publications");
  const params = await searchParams;
  const [assets, tasks] = await Promise.all([
    payload.find({ collection: "content-assets", select: { title:true, plannedPublishDate:true, articleCategory:true }, pagination:false, sort:"-updatedAt", depth:0, overrideAccess:false, user }),
    payload.find({ collection:"publication-tasks", pagination:false, depth:0, overrideAccess:false, user }),
  ]);
  const activeIds = new Set(assets.docs.map(a=>String(a.id)));
  const activeTasks = tasks.docs.filter(t=>activeIds.has(relationId(t.contentAsset)));
  const today = businessDate();
  const filtered = assets.docs.filter(a=> {
    const group = activeTasks.filter(t=>relationId(t.contentAsset)===String(a.id));
    if(!group.length || (params.asset && String(a.id)!==params.asset) || (params.query && !a.title.toLowerCase().includes(params.query.toLowerCase())) || (params.filter && params.filter!=="all" && !group.some(t=>t.status===params.filter)))return false;
    const dates = group.map(t=>({date:publicationTaskDate(t,a),status:t.status}));
    return !params.scope || params.scope==="all" || (params.scope==="today" ? dates.some(t=>t.date===today) : params.scope==="overdue" ? dates.some(t=>t.date && t.date<today && t.status!=="published") : params.scope==="future" ? dates.some(t=>t.date>today) : params.scope==="unscheduled" ? dates.some(t=>!t.date) : true);
  });
  const pageCount = Math.max(1,Math.ceil(filtered.length/10));
  const page = Math.min(pageCount,Math.max(1,Number(params.page)||1));
  const ids = filtered.slice((page-1)*10,page*10).map(a=>a.id);
  const pageAssets = ids.length ? await payload.find({collection:"content-assets",where:{id:{in:ids}},pagination:false,depth:1,overrideAccess:false,user}) : {docs:[]};
  const map = new Map(pageAssets.docs.map(a=>[String(a.id),a]));
  const visibleTasks = activeTasks.filter(t=>map.has(relationId(t.contentAsset))).map(t=>({...t,contentAsset:map.get(relationId(t.contentAsset))!}));
  const groups = assets.docs.map(a=>activeTasks.filter(t=>relationId(t.contentAsset)===String(a.id))).filter(g=>g.length);
  const metrics = { pendingArticles:groups.filter(g=>g.some(t=>t.status==="pending")).length, publishedArticles:groups.filter(g=>g.every(t=>t.status==="published")).length, pendingTasks:activeTasks.filter(t=>t.status==="pending").length, completedTasks:activeTasks.filter(t=>t.status==="published").length, blockedTasks:activeTasks.filter(t=>t.status==="blocked").length };
  const totalTasks = activeTasks.filter(t=>filtered.some(a=>String(a.id)===relationId(t.contentAsset))).length;
  return <AppShell userName={user.displayName} breadcrumbs={["首页","发布任务"]}><PublicationsClient initialTasks={visibleTasks} metrics={metrics} totalArticles={filtered.length} totalTasks={totalTasks} page={page} pageCount={pageCount} platforms={PLATFORMS.map(({key,name})=>({key,name}))} /></AppShell>;
}
