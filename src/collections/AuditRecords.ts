import type { CollectionConfig } from "payload";
import { authenticated } from "./access";

export const AuditRecords: CollectionConfig = {
  slug: "audit-records",
  defaultSort: "-createdAt",
  admin: {
    useAsTitle: "action",
  },
  access: {
    admin: authenticated,
    create: () => false,
    read: authenticated,
    update: () => false,
    delete: () => false,
  },
  fields: [
    { name: "contentSnapshot", type: "json", admin: { readOnly: true } },
    { name: "contentAsset", type: "relationship", relationTo: "content-assets", required: true },
    { name: "action", type: "select", options: [{ label: "提交审核", value: "submit" }, { label: "审核通过", value: "approve" }, { label: "审核驳回", value: "reject" }], required: true },
    { name: "comment", type: "textarea" },
    { name: "operator", type: "relationship", relationTo: "users", required: true },
  ],
};
