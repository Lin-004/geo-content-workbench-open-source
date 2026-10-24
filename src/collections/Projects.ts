import type { CollectionConfig } from "payload";
import { authenticated } from "./access";
import { businessError } from "@/lib/business-error";

export const Projects: CollectionConfig = {
  slug: "projects",
  defaultSort: "-updatedAt",
  admin: {
    useAsTitle: "name",
  },
  access: {
    admin: authenticated,
    create: authenticated,
    read: authenticated,
    update: authenticated,
    delete: authenticated,
  },
  hooks: {
    beforeDelete: [
      async ({ id, req }) => {
        const result = await req.payload.find({
          collection: "content-assets",
          where: {
            project: { equals: id },
          },
          limit: 1,
          overrideAccess: true,
        });
        const plans=await req.payload.count({collection:"content-plans",where:{project:{equals:id}},overrideAccess:true,req});
        if(plans.totalDocs)throw businessError("当前项目已有每日规划，不能删除；请保留交付记录");
        if (result.totalDocs > 0) throw businessError("当前项目已存在内容资产，暂不支持删除");
      },
    ],
  },
  fields: [
    { name: "name", type: "text", required: true },
    { name: "startDate", type: "date", required: true },
    { name: "endDate", type: "date", required: true },
    { name: "owner", type: "relationship", relationTo: "users", required: true },
    { name: "goal", type: "text", required: true },
    { name: "description", type: "textarea", required: true },
    { name: "deletedAt", type: "date", admin: { hidden: true, readOnly: true } },
  ],
};
