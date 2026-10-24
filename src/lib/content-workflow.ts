import { businessTransaction } from "./business-transaction";
import type { Payload, PayloadRequest, TypedUser } from "payload";
import { businessError } from "@/lib/business-error";
import { aggregateContentPlanStatus, hasMeaningfulBody, relationId } from "@/lib/content-plan-utils";

type AssetStatus = "draft" | "reviewing" | "approved";
type AuditAction = "submit" | "approve" | "reject";

export async function refreshContentPlanStatus(payload: Payload, planId: number | string, req?: PayloadRequest) {
  const plan = await payload.findByID({ collection: "content-plans", id: planId, depth: 0, overrideAccess: true, req });
  const assets = await payload.find({ collection: "content-assets", where: { and: [{ contentPlan: { equals: plan.id } }, { deletedAt: { exists: false } }] }, pagination: false, depth: 0, overrideAccess: true, req });
  const allAssets = [...assets.docs];
  const legacyAssetId = relationId(plan.contentAsset);
  if (legacyAssetId && !allAssets.some((asset) => String(asset.id) === String(legacyAssetId))) {
    const legacyAsset = await payload.findByID({ collection: "content-assets", id: legacyAssetId, depth: 0, overrideAccess: true, req }).catch(() => null);
    if (legacyAsset && !legacyAsset.deletedAt) allAssets.push(legacyAsset);
  }
  const assetIds = new Set(allAssets.map((asset) => String(asset.id)));
  const [tasks, items] = await Promise.all([
    assetIds.size ? payload.find({ collection: "publication-tasks", where: { and: [{ contentAsset: { in: [...assetIds] } }, { cancelledAt: { exists: false } }] }, pagination: false, overrideAccess: true, req }) : Promise.resolve({ docs: [] }),
    payload.find({ collection: "content-plan-items", where: { contentPlan: { equals: plan.id } }, pagination: false, depth: 0, overrideAccess: true, req }),
  ]);
  const status = aggregateContentPlanStatus(allAssets, tasks.docs, items.docs);

  if (plan.status !== status) {
    await payload.update({ collection: "content-plans", id: plan.id, data: { status }, overrideAccess: true, context: { businessAction: "system" }, req });
  }
  return status;
}

export async function refreshPlansForAsset(payload: Payload, assetId: number | string, contentPlan?: unknown, req?: PayloadRequest) {
  const planIds = new Set<string>();
  const directId = relationId(contentPlan);
  if (directId) planIds.add(String(directId));
  const legacyPlans = await payload.find({ collection: "content-plans", where: { contentAsset: { equals: assetId } }, pagination: false, depth: 0, overrideAccess: true, req });
  for (const plan of legacyPlans.docs) planIds.add(String(plan.id));
  for (const planId of planIds) await refreshContentPlanStatus(payload, planId, req);
}

export async function writeAudit(payload: Payload, contentAsset: number | string, action: AuditAction, operator: TypedUser, comment?: string, req?: PayloadRequest) {
  const asset = await payload.findByID({ collection: "content-assets", id: contentAsset, depth: 0, overrideAccess: true, req });
  return payload.create({
    collection: "audit-records",
    data: { contentSnapshot: { contentType: asset.contentType, title: asset.title, body: asset.body, images: asset.images, targetPlatforms: asset.targetPlatforms, articleCategory: asset.articleCategory, question: asset.question }, contentAsset: Number(contentAsset), action, operator: operator.id, comment: comment || undefined },
    overrideAccess: true, req,
    context: { businessAction: "system" },
  });
}

export async function transitionAsset(payload: Payload, id: number | string, action: AuditAction, operator: TypedUser, comment?: string) {
  return businessTransaction(payload, operator, async req => {
  const asset = await payload.findByID({ collection: "content-assets", id, depth: 0, overrideAccess: true, req });
  if (asset.deletedAt) throw businessError("已删除内容不能审核");

  const transitions: Record<AuditAction, { from: AssetStatus; to: AssetStatus }> = {
    submit: { from: "draft", to: "reviewing" },
    approve: { from: "reviewing", to: "approved" },
    reject: { from: "reviewing", to: "draft" },
  };
  const transition = transitions[action];
  if (asset.status !== transition.from) throw businessError(`当前状态为“${asset.status}”，不能执行该操作`);
  if (action === "submit" && !hasMeaningfulBody(asset.body)) throw businessError("请先补充正文后再提交审核");
  const doc = await payload.update({
    collection: "content-assets",
    id,
    data: { status: transition.to },
    overrideAccess: true,
    user: operator, req,
    context: { businessAction: "transition" },
  });
  await writeAudit(payload, id, action, operator, comment, req);
  await refreshPlansForAsset(payload, id, doc.contentPlan, req);
  return doc;
  });
}
