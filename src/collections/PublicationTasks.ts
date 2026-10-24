import type { CollectionAfterChangeHook, CollectionBeforeChangeHook, CollectionConfig } from "payload";
import { authenticated } from "./access";
import { PLATFORM_OPTIONS } from "@/lib/platforms";
import { refreshPlansForAsset } from "@/lib/content-workflow";
import { businessError } from "@/lib/business-error";

const guardTaskChange: CollectionBeforeChangeHook = async ({ data, originalDoc, operation, req }) => {
  const action = req.context?.businessAction;
  if (operation === "create" && action !== "system") throw businessError("发布任务由内容资产自动生成");
  if (operation === "update" && action !== "system" && action !== "publication-confirmation") {
    for (const field of ["status", "contentAsset", "cancelledAt", "platform", "platformUrl", "publishedAt", "publishedBy", "publishedUrl"]) {
      if (data[field] !== undefined && data[field] !== originalDoc?.[field]) throw businessError("发布任务必须通过业务动作变更");
    }
  }
  return data;
};

const refreshPlanAfterTaskChange: CollectionAfterChangeHook = async ({ doc, req }) => {
  const asset = await req.payload.findByID({ collection: "content-assets", id: typeof doc.contentAsset === "object" ? doc.contentAsset.id : doc.contentAsset, depth: 0, overrideAccess: true, req });
  await refreshPlansForAsset(req.payload, asset.id, asset.contentPlan, req);
};

export const PublicationTasks: CollectionConfig = {
  slug: "publication-tasks",
  defaultSort: "-updatedAt",
  admin: {
    useAsTitle: "platform",
  },
  access: {
    admin: authenticated,
    create: () => false,
    read: ({ req }) => req.user ? { cancelledAt: { exists: false } } : false,
    update: authenticated,
    delete: () => false,
  },
  hooks: { beforeChange: [guardTaskChange], afterChange: [refreshPlanAfterTaskChange] },
  fields: [
    { name: "cancelledAt", type: "date", admin: { hidden: true, readOnly: true } },
    { name: "contentAsset", type: "relationship", relationTo: "content-assets", required: true },
    { name: "platform", type: "select", options: PLATFORM_OPTIONS, required: true, admin: { readOnly: true } },
    { name: "status", type: "select", options: [{ label: "不可发布", value: "blocked" }, { label: "待发布", value: "pending" }, { label: "已发布", value: "published" }], defaultValue: "blocked", required: true, admin: { readOnly: true } },
    { name: "platformUrl", type: "text", admin: { readOnly: true } },
    { name: "plannedPublishAt", type: "date" },
    { name: "publishedAt", type: "date", admin: { readOnly: true } },
    { name: "publishedBy", type: "relationship", relationTo: "users", admin: { readOnly: true } },
    { name: "publishedUrl", type: "text" },
  ],
};
