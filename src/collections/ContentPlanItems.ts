import { CONTENT_TYPE_OPTIONS } from "@/lib/content-types";
import { normalizeArticleCategory } from "@/lib/article-categories";
import type { CollectionConfig } from "payload";
import { authenticated } from "./access";
import { PLATFORM_OPTIONS } from "@/lib/platforms";
import { businessDate } from "@/lib/business-date";
import { businessError } from "@/lib/business-error";
import { relationId } from "@/lib/content-plan-utils";
import { createHash } from "node:crypto";

export const ContentPlanItems: CollectionConfig = {
  slug: "content-plan-items",
  indexes: [{ unique: true, fields: ["contentPlan", "itemKey"] }],
  hooks: { beforeValidate: [({ data, originalDoc }) => {
    if (data && !data.itemKey) data.itemKey = originalDoc?.itemKey || `${data.articleCategory}:${createHash("sha256").update(String(data.question || "").trim()).digest("hex").slice(0, 20)}`;
    return data;
  }], beforeChange: [async ({data,originalDoc,req}) => {
    const configs=await req.payload.find({collection:"platform-configs",pagination:false,depth:0,overrideAccess:true,req});
    const added=(data.targetPlatforms || []).filter((p:string)=>!(originalDoc?.targetPlatforms || []).includes(p));
    if(added.some((p:string)=>!configs.docs.some(c=>c.key===p && c.enabled)))throw businessError("文章规划项包含停用平台，请选择启用的平台");
    const planId=relationId(data.contentPlan ?? originalDoc?.contentPlan);
    if(planId){
      const plan=await req.payload.findByID({collection:"content-plans",id:planId,depth:0,overrideAccess:true,req});
      if (req.context?.businessAction === "daily-import") {
        const assets = await req.payload.find({ collection: "content-assets", where: { and: [{ contentPlan: { equals: planId } }, { deletedAt: { exists: false } }] }, pagination: false, depth: 0, overrideAccess: true, req });
        const linked = originalDoc && assets.docs.some(asset => {
          const itemId = relationId(asset.contentPlanItem);
          return itemId ? String(itemId) === String(originalDoc.id) : !asset.articleCategory || !asset.question || (asset.articleCategory === originalDoc.articleCategory && asset.question === originalDoc.question);
        });
        if (linked || plan.contentAsset) throw businessError("该规划项已有内容，不能覆盖文章规划项");
      } else {
        const assets=await req.payload.count({collection:"content-assets",where:{and:[{contentPlan:{equals:planId}},{deletedAt:{exists:false}}]},overrideAccess:true,req});
        if(assets.totalDocs || plan.contentAsset)throw businessError("该规划已有内容，不能覆盖文章规划项");
      }
      if(businessDate(plan.planDate)<businessDate())throw businessError("历史文章规划项仅支持查看");
    }
    return data;
  }], beforeDelete: [async ({id,req})=> {
    const item=await req.payload.findByID({collection:"content-plan-items",id,depth:0,overrideAccess:true,req});
    const assets=await req.payload.count({collection:"content-assets",where:{and:[{contentPlan:{equals:relationId(item.contentPlan)}},{deletedAt:{exists:false}}]},overrideAccess:true,req});
    const plan=await req.payload.findByID({collection:"content-plans",id:relationId(item.contentPlan),depth:0,overrideAccess:true,req});
    if(assets.totalDocs || plan.contentAsset || businessDate(plan.planDate)<businessDate())throw businessError("已有内容或历史规划的文章项不能删除");
  }] },
  admin: {
    hidden: true,
    useAsTitle: "title",
  },
  access: {
    admin: authenticated,
    create: authenticated,
    read: authenticated,
    update: authenticated,
    delete: authenticated,
  },
  fields: [
    { name: "itemKey", type: "text", required: true, admin: { readOnly: true } },
    { name: "contentPlan", type: "relationship", relationTo: "content-plans", required: true, admin: { readOnly: true } },
    { name: "articleCategory", type: "text", validate: (value: unknown) => !value || normalizeArticleCategory(value) ? true : "请输入有效分类编码（如 A、B、D）", hooks: { beforeValidate: [({ value }) => normalizeArticleCategory(value) || value] }, required: true },
    { name: "contentType", label: "内容类型", type: "select", options: [...CONTENT_TYPE_OPTIONS], defaultValue: "article", required: true },
    { name: "itemNote", label: "文章执行备注", type: "textarea" },
    { name: "question", type: "text", required: true },
    { name: "title", type: "text" },
    { name: "targetPlatforms", type: "select", hasMany: true, options: PLATFORM_OPTIONS, required: true },
    { name: "sortOrder", type: "number", required: true, defaultValue: 0, admin: { hidden: true } },
    { name: "sourceType", type: "select", options: [{ label: "文件导入", value: "import" }, { label: "手动创建", value: "manual" }], defaultValue: "import", admin: { readOnly: true } },
    { name: "sourceFilename", type: "text", admin: { readOnly: true } },
  ],
};
