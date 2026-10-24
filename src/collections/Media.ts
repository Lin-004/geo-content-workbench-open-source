import path from "node:path";
import type { CollectionConfig } from "payload";
import { authenticated } from "./access";

export const Media: CollectionConfig = {
  slug: "media",
  access: {
    create: authenticated,
    read: authenticated,
    update: authenticated,
    delete: authenticated,
  },
  upload: {
    staticDir: process.env.UPLOAD_DIR || path.resolve(process.cwd(), "media"),
    mimeTypes: ["image/jpeg", "image/png", "image/webp"],
  },
  fields: [
    {
      name: "alt",
      type: "text",
      required: true,
    },
  ],
};
