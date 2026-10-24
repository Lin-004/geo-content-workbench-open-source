import type { CollectionConfig } from "payload";
import { authenticated } from "./access";

export const Users: CollectionConfig = {
  slug: "users",
  auth: {
    cookies: { secure: process.env.SERVER_URL?.startsWith("https://") || false, sameSite: "Lax" },
    loginWithUsername: {
      allowEmailLogin: false,
      requireEmail: false,
    },
  },
  admin: {
    useAsTitle: "displayName",
  },
  access: {
    admin: authenticated,
    create: authenticated,
    read: authenticated,
    update: authenticated,
    delete: authenticated,
  },
  fields: [
    {
      name: "username",
      type: "text",
      required: true,
      unique: true,
    },
    {
      name: "displayName",
      type: "text",
      required: true,
    },
  ],
};
