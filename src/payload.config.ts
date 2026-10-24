import path from "node:path";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { buildConfig } from "payload";
import { AuditRecords } from "./collections/AuditRecords";
import { ContentAssets } from "./collections/ContentAssets";
import { ContentPlans } from "./collections/ContentPlans";
import { ContentPlanItems } from "./collections/ContentPlanItems";
import { Media } from "./collections/Media";
import { PlatformConfigs } from "./collections/PlatformConfigs";
import { Projects } from "./collections/Projects";
import { PublicationTasks } from "./collections/PublicationTasks";
import { Users } from "./collections/Users";
import { PlanImportBatches } from "./collections/PlanImportBatches";
import { PLATFORMS } from "./lib/platforms";
import { getPayloadSecret } from "./lib/runtime-secrets";

if (!process.env.DATABASE_URL) throw new Error("必须设置 DATABASE_URL");

export default buildConfig({
  serverURL: process.env.SERVER_URL,
  csrf: process.env.SERVER_URL ? [process.env.SERVER_URL] : [],
  admin: {
    user: Users.slug,
    importMap: { baseDir: path.resolve(process.cwd(), "src") },
  },
  collections: [Users, Media, PlatformConfigs, Projects, ContentPlans, ContentPlanItems, ContentAssets, PublicationTasks, AuditRecords, PlanImportBatches],
  editor: lexicalEditor(),
  secret: getPayloadSecret(),
  typescript: {
    outputFile: path.resolve(process.cwd(), "src/payload-types.ts"),
  },
  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URL },
    push: process.env.PAYLOAD_DB_PUSH === "true",
  }),
  upload: {
    limits: { fileSize: 10 * 1024 * 1024 },
  },
  onInit: async (payload) => {
    const existing = await payload.find({ collection: "platform-configs", limit: 1, overrideAccess: true });
    if (existing.totalDocs > 0) return;
    for (const platform of PLATFORMS) {
      await payload.create({
        collection: "platform-configs",
        data: { key: platform.key, name: platform.name, publishUrl: platform.url, enabled: true },
        overrideAccess: true,
      });
    }
  },
});
