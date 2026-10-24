import type { Payload } from "payload";
import { requireInitialPassword } from "../src/lib/runtime-secrets";

export async function ensureInitialAdmin(payload: Pick<Payload, "find" | "create">, email: string, password: string | undefined) {
  const users = await payload.find({
    collection: "users",
    where: { username: { equals: "admin" } },
    limit: 1,
    overrideAccess: true,
  });
  if (users.totalDocs > 0) return false;
  await payload.create({
    collection: "users",
    data: { username: "admin", email, password: requireInitialPassword(password), displayName: "管理员" },
    overrideAccess: true,
  });
  return true;
}
