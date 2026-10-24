import type { CollectionConfig } from "payload";
import { authenticated } from "./access";

export const PlanImportBatches: CollectionConfig = {
  slug: "plan-import-batches",
  defaultSort: "-createdAt",
  admin: { useAsTitle: "sourceFilename" },
  access: {
    admin: authenticated,
    create: () => false,
    read: authenticated,
    update: () => false,
    delete: () => false,
  },
  fields: [
    { name: "project", type: "relationship", relationTo: "projects", required: true },
    { name: "sourceFilename", type: "text", required: true },
    { name: "sourceHash", type: "text", required: true },
    { name: "sourceFormat", type: "select", options: [{ label: "XLSX", value: "xlsx" }, { label: "DOCX", value: "docx" }, { label: "Markdown", value: "md" }], required: true },
    { name: "templateId", type: "text", required: true },
    { name: "templateVersion", type: "number", required: true },
    { name: "mode", type: "select", options: [{ label: "XLSX v1", value: "xlsx" }, { label: "旧格式兼容", value: "legacy" }], required: true },
    { name: "status", type: "select", options: [{ label: "已提交", value: "committed" }, { label: "失败", value: "failed" }], required: true },
    {
      name: "summary",
      type: "group",
      fields: [
        { name: "create", type: "number", required: true },
        { name: "update", type: "number", required: true },
        { name: "unchanged", type: "number", required: true },
        { name: "conflict", type: "number", required: true },
        { name: "error", type: "number", required: true },
      ],
    },
    { name: "details", type: "json", required: true },
    { name: "operator", type: "relationship", relationTo: "users", required: true },
  ],
};
