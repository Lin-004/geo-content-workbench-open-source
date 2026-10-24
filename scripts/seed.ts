import dotenv from "dotenv";
import { getPayload } from "payload";
import { PLATFORMS } from "../src/lib/platforms";
import { ensureInitialAdmin } from "./initial-admin";

dotenv.config({ path: [".env.local", ".env"] });
const { default: config } = await import("../src/payload.config");
const payload = await getPayload({ config });
const email = process.env.SEED_EMAIL ?? "admin@example.com";
const created = await ensureInitialAdmin(payload, email, process.env.SEED_PASSWORD);

for (const platform of PLATFORMS) {
  const result = await payload.find({
    collection: "platform-configs",
    where: { key: { equals: platform.key } },
    limit: 1,
    overrideAccess: true,
  });
  if (result.totalDocs === 0) {
    await payload.create({ collection: "platform-configs", data: { key: platform.key, name: platform.name, publishUrl: platform.url, enabled: true }, overrideAccess: true });
  } else {
    await payload.update({ collection: "platform-configs", id: result.docs[0].id, data: { name: platform.name, publishUrl: platform.url, enabled: true }, overrideAccess: true });
  }
}

console.log(`seeded ${PLATFORMS.length} platforms; admin ${created ? "created" : "preserved"}`);
process.exit(0);
