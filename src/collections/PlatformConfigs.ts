import type { CollectionBeforeChangeHook, CollectionConfig } from "payload";
import { authenticated } from "./access";
import { PLATFORM_OPTIONS } from "@/lib/platforms";
import { businessError } from "@/lib/business-error";

const validatePublishUrl: CollectionBeforeChangeHook = ({ data }) => {
  if (data.publishUrl === undefined) return data;
  try {
    const url = new URL(String(data.publishUrl));
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname) throw new Error();
  } catch {
    throw businessError("发布地址必须是有效的 http 或 https 地址");
  }
  return data;
};

export const PlatformConfigs: CollectionConfig = {
  slug: "platform-configs",
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
  hooks: { beforeChange: [validatePublishUrl], afterChange: [async ({doc,previousDoc,req}) => {
    if (previousDoc?.publishUrl === doc.publishUrl) return;
    const tasks = await req.payload.find({ collection: "publication-tasks", where: { and: [{ platform: { equals: doc.key } }, { status: { not_equals: "published" } }, { cancelledAt: { exists: false } }] }, pagination: false, overrideAccess: true, req });
    for (const task of tasks.docs) await req.payload.update({ collection: "publication-tasks", id: task.id, data: { platformUrl: doc.publishUrl }, overrideAccess: true, req, context: {businessAction:"system"} });
  }] },
  fields: [
    {
      name: "key",
      type: "select",
      options: PLATFORM_OPTIONS,
      required: true,
      unique: true,
    },
    {
      name: "name",
      type: "text",
      required: true,
    },
    {
      name: "publishUrl",
      type: "text",
      required: true,
    },
    {
      name: "enabled",
      type: "checkbox",
      defaultValue: true,
    },
  ],
};
