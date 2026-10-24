import type { CollectionConfig, FieldHook } from "payload";
import { authenticated } from "./access";
import { PLATFORM_OPTIONS } from "@/lib/platforms";
import { businessError } from "@/lib/business-error";
import { businessDate, businessDayRange } from "@/lib/business-date";

function todayInBusinessTimezone() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
}

const validatePlanDate: FieldHook = ({ value, operation, req }) => {
  if (req.context?.businessAction === "system") return value;
  if (operation === "create" && req.context?.businessAction === "daily-import") return value;
  if (value && businessDate(String(value)) < todayInBusinessTimezone()) throw businessError("历史规划不能新建或修改");
  return value;
};

export const ContentPlans: CollectionConfig = {
  slug: "content-plans",
  defaultSort: "-planDate",
  admin: {
    useAsTitle: "title",
  },
  access: {
    admin: authenticated,
    create: authenticated,
    read: authenticated,
    update: authenticated,
    delete: authenticated,
  },
  hooks: {
    beforeDelete: [async ({id,req}) => {
      const plan=await req.payload.findByID({collection:"content-plans",id,depth:0,overrideAccess:true,req});
      const assets=await req.payload.count({collection:"content-assets",where:{contentPlan:{equals:id}},overrideAccess:true,req});
      if(plan.contentAsset || assets.totalDocs || businessDate(plan.planDate)<businessDate())throw businessError("历史或已创建内容的每日规划不能删除");
    }],
    beforeChange: [
      async ({ data, originalDoc, operation, req }) => {
        if (req.context?.businessAction === "system") return data;
        const configs=await req.payload.find({collection:"platform-configs",pagination:false,depth:0,overrideAccess:true,req});
        const added=(data.platforms || []).filter((p:string)=>!(originalDoc?.platforms || []).includes(p));
        if(added.some((p:string)=>!configs.docs.some(c=>c.key===p && c.enabled)))throw businessError("规划包含已停用的平台，请修改为启用平台");
        const date = data.planDate || originalDoc?.planDate;
        if (date && (operation === "create" || data.planDate || data.project)) {
          const duplicate = await req.payload.find({ collection: "content-plans", where: { and: [{ project: { equals: data.project || originalDoc?.project } }, { planDate: businessDayRange(businessDate(date)) }, ...(originalDoc?.id ? [{ id: { not_equals: originalDoc.id } }] : [])] }, limit: 1, depth: 0, overrideAccess: true, req });
          if (duplicate.totalDocs) throw businessError("该项目当天已有规划，请打开已有规划添加文章");
        }
        if (operation === "update" && data.status !== undefined && data.status !== originalDoc?.status && req.context?.businessAction !== "system") {
          throw businessError("规划状态由系统根据内容和发布任务计算");
        }
        const summaryOnly = req.context?.businessAction === "daily-import-summary" && originalDoc &&
          ["project", "planDate", "dailyTheme", "topic", "title", "note", "contentAsset", "status"].every(key => data[key] === undefined || String(data[key] ?? "") === String(originalDoc[key] ?? ""));
        if (summaryOnly && businessDate(originalDoc.planDate) >= todayInBusinessTimezone()) return data;
        if (operation === "update" && originalDoc?.contentAsset && req.context?.businessAction !== "system") {
          throw businessError("该规划已创建内容，不支持修改规划核心信息");
        }
        if (operation === "update" && originalDoc?.id && req.context?.businessAction !== "system") {
          const children = await req.payload.find({
            collection: "content-assets",
            where: { and: [{ contentPlan: { equals: originalDoc.id } }, { deletedAt: { exists: false } }] },
            limit: 1, req,
            overrideAccess: true,
          });
          if (children.totalDocs > 0) throw businessError("该规划已创建内容，不支持修改规划核心信息");
        }
        if (operation === "update" && originalDoc?.planDate && businessDate(originalDoc.planDate) < todayInBusinessTimezone()) {
          throw businessError("历史规划仅支持查看");
        }
        return data;
      },
    ],
  },
  fields: [
    { name: "project", type: "relationship", relationTo: "projects", required: true },
    { name: "planDate", type: "date", required: true, hooks: { beforeValidate: [validatePlanDate] } },
    { name: "dailyTheme", type: "text" },
    { name: "topic", type: "text", required: true },
    { name: "title", type: "text", required: true },
    { name: "platforms", type: "select", hasMany: true, options: PLATFORM_OPTIONS, required: true },
    { name: "contentAsset", type: "relationship", relationTo: "content-assets", admin: { readOnly: true } },
    { name: "status", type: "select", options: [{ label: "未创建", value: "uncreated" }, { label: "创建中", value: "creating" }, { label: "待审核", value: "pending_review" }, { label: "待发布", value: "pending_publish" }, { label: "发布中", value: "publishing" }, { label: "已完成", value: "done" }], defaultValue: "uncreated", required: true, admin: { readOnly: true } },
    { name: "note", type: "textarea" },
  ],
};
