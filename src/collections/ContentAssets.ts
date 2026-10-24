import { CONTENT_TYPE_OPTIONS, normalizeContentType } from "@/lib/content-types";
import { normalizeArticleCategory } from "@/lib/article-categories";
import type { CollectionAfterChangeHook, CollectionBeforeChangeHook, CollectionConfig, PayloadRequest } from "payload";
import { authenticated } from "./access";
import { PLATFORM_OPTIONS } from "@/lib/platforms";
import { refreshPlansForAsset } from "@/lib/content-workflow";
import { businessError } from "@/lib/business-error";
import { hasMeaningfulBody, relationId } from "@/lib/content-plan-utils";

async function hasPublishedTask(req: Parameters<CollectionBeforeChangeHook>[0]["req"], id: string) {
  const result = await req.payload.find({
    collection: "publication-tasks",
    where: {
      and: [
        { contentAsset: { equals: id } },
        { status: { equals: "published" } },
      ],
    },
    limit: 1,
    req,
    overrideAccess: true,
  });
  return result.totalDocs > 0;
}

const guardContentChange: CollectionBeforeChangeHook = async ({ data, originalDoc, operation, req }) => {
  const configs = await req.payload.find({ collection: "platform-configs", pagination: false, depth: 0, overrideAccess: true, req });
  const enabled = new Set(configs.docs.filter((p) => p.enabled).map((p) => p.key));
  const added = (data.targetPlatforms || []).filter((p: string) => !(originalDoc?.targetPlatforms || []).includes(p));
  if (added.some((p: string) => !enabled.has(p as never))) throw businessError("所选平台已停用，请选择启用的平台");
  if (operation === "create" && data.status !== undefined && data.status !== "draft" && req.context?.businessAction !== "transition") {
    throw businessError("内容必须从草稿开始");
  }
  const planId = relationId(data.contentPlan !== undefined ? data.contentPlan : originalDoc?.contentPlan);
  const itemId = relationId(data.contentPlanItem !== undefined ? data.contentPlanItem : originalDoc?.contentPlanItem);
  if (itemId) {
    const item = await req.payload.findByID({ collection: "content-plan-items", id: itemId, depth: 0, overrideAccess: true, req });
    if (normalizeContentType(data.contentType ?? originalDoc?.contentType) !== normalizeContentType(item.contentType)) throw businessError("内容类型必须与所选规划项一致");
    if (planId !== relationId(item.contentPlan)) throw businessError("文章规划项必须属于所选每日规划");
    const existing = await req.payload.find({ collection: "content-assets", where: { and: [{ contentPlanItem: { equals: itemId } }, { deletedAt: { exists: false } }, ...(originalDoc?.id ? [{ id: { not_equals: originalDoc.id } }] : [])] }, limit: 1, overrideAccess: true, req });
    if (existing.totalDocs) throw businessError("这条文章规划已创建内容，请打开已有文章", 409);
  }
  if (planId) {
    const plan = await req.payload.findByID({ collection: "content-plans", id: planId, depth: 0, req, overrideAccess: true });
    const projectId = relationId(data.project ?? originalDoc?.project);
    if (projectId && String(projectId) !== String(relationId(plan.project))) throw businessError("内容所属项目必须与每日规划一致");
    if (data.plannedPublishDate === undefined && !originalDoc?.plannedPublishDate) data.plannedPublishDate = plan.planDate;
  }
  if (operation !== "update" || !originalDoc) return data;
  const isTransition = req.context?.businessAction === "transition";
  if (isTransition && data.status === "reviewing" && originalDoc.status === "draft" && !hasMeaningfulBody(originalDoc.body)) {
    throw businessError("请先补充正文后再提交审核");
  }
  if (data.status !== undefined && data.status !== originalDoc.status && !isTransition) {
    throw businessError("内容状态必须通过审核动作变更");
  }
  if (originalDoc.status === "reviewing" && !isTransition) throw businessError("内容正在审核中，如需修改请先驳回审核");
  if (await hasPublishedTask(req, String(originalDoc.id))) throw businessError("该内容已有平台发布记录，请创建修订稿");

  const typeChanged = data.contentType !== undefined && data.contentType !== originalDoc.contentType;
  const imagesChanged = data.images !== undefined && JSON.stringify(data.images) !== JSON.stringify(originalDoc.images);
  const titleChanged = data.title !== undefined && data.title !== originalDoc.title;
  const bodyChanged = data.body !== undefined && JSON.stringify(data.body) !== JSON.stringify(originalDoc.body);
  if (originalDoc.status === "approved" && (titleChanged || bodyChanged || imagesChanged || typeChanged)) data.status = "draft";
  return data;
};

const syncPublicationTasks: CollectionAfterChangeHook = async ({ doc, previousDoc, req }) => {
  const platforms = Array.isArray(doc.targetPlatforms) ? doc.targetPlatforms : [];
  const existing = await req.payload.find({ collection: "publication-tasks", where: { contentAsset: { equals: doc.id } }, pagination: false, req, overrideAccess: true });
  const existingByPlatform = new Map(existing.docs.filter((t) => !t.cancelledAt).map((task) => [task.platform, task]));

  const platformConfigs = await req.payload.find({ collection: "platform-configs", pagination: false, req, overrideAccess: true });
  const platformUrls = new Map(platformConfigs.docs.map((platform) => [platform.key, platform.publishUrl]));

  for (const platform of platforms) {
    if (!existingByPlatform.has(platform)) {
      await req.payload.create({
        collection: "publication-tasks",
        data: { contentAsset: doc.id, platform, platformUrl: platformUrls.get(platform) || undefined, status: doc.status === "approved" ? "pending" : "blocked" },
        overrideAccess: true,
        req,
        context: { businessAction: "system" },
      });
    }
  }

  for (const task of existing.docs) {
    if (!platforms.includes(task.platform) && task.status !== "published" && !task.cancelledAt) {
      await req.payload.update({ collection: "publication-tasks", id: task.id, data: { cancelledAt: new Date().toISOString() }, overrideAccess: true, req, context: { businessAction: "system" } });
      continue;
    }
    if (task.cancelledAt) continue;
    if (task.status === "published") continue;
    const nextStatus = doc.status === "approved" ? "pending" : "blocked";
    if (task.status !== nextStatus || task.platformUrl !== platformUrls.get(task.platform)) {
      await req.payload.update({ collection: "publication-tasks", id: task.id, data: { status: nextStatus, platformUrl: platformUrls.get(task.platform) || undefined }, overrideAccess: true, req, context: { businessAction: "system" } });
    }
  }

  await refreshPlansForAsset(req.payload, doc.id, doc.contentPlan, req);
  if (previousDoc?.contentPlan && relationId(previousDoc.contentPlan) !== relationId(doc.contentPlan)) {
    const { refreshContentPlanStatus } = await import("@/lib/content-workflow");
    await refreshContentPlanStatus(req.payload, relationId(previousDoc.contentPlan), req);
  }
};

const activeContentAsset = ({ req }: { req: PayloadRequest }) => req.user ? { deletedAt: { exists: false } } : false;

export const ContentAssets: CollectionConfig = {
  slug: "content-assets",
  defaultSort: "-updatedAt",
  admin: {
    useAsTitle: "title",
  },
  access: {
    admin: authenticated,
    create: authenticated,
    read: activeContentAsset,
    update: activeContentAsset,
    delete: () => false,
  },
  hooks: {
    beforeChange: [guardContentChange],
    afterChange: [syncPublicationTasks],
  },
  fields: [
    { name: "revisionOf", type: "relationship", relationTo: "content-assets", admin: { readOnly: true } },
    { name: "contentPlanItem", type: "relationship", relationTo: "content-plan-items", admin: { readOnly: true } },
    { name: "project", type: "relationship", relationTo: "projects", required: true },
    { name: "contentPlan", type: "relationship", relationTo: "content-plans", admin: { readOnly: true } },
    { name: "articleCategory", type: "text", validate: (value: unknown) => !value || normalizeArticleCategory(value) ? true : "请输入有效分类编码（如 A、B、D）", hooks: { beforeValidate: [({ value }) => normalizeArticleCategory(value) || value] } },
    { name: "question", type: "text" },
    { name: "title", type: "text", required: true },
    { name: "contentType", type: "select", options: [...CONTENT_TYPE_OPTIONS], defaultValue: "article", required: true },
    { name: "targetPlatforms", type: "select", hasMany: true, options: PLATFORM_OPTIONS, required: true },
    { name: "images", type: "upload", relationTo: "media", hasMany: true },
    { name: "body", type: "richText" },
    { name: "status", type: "select", options: [{ label: "草稿", value: "draft" }, { label: "审核中", value: "reviewing" }, { label: "已审核", value: "approved" }], defaultValue: "draft", required: true, admin: { readOnly: true } },
    { name: "sourceType", type: "select", options: [{ label: "手动创建", value: "manual" }, { label: "导入", value: "import" }], defaultValue: "manual", required: true, admin: { readOnly: true } },
    { name: "sourceFilename", type: "text", admin: { readOnly: true } },
    { name: "plannedPublishDate", type: "date" },
    { name: "deletedAt", type: "date", admin: { hidden: true, readOnly: true } },
  ],
};
