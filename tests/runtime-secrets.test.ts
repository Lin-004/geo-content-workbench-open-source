import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { getPayloadSecret, requireInitialPassword } from "../src/lib/runtime-secrets";
import { ensureInitialAdmin } from "../scripts/initial-admin";

test("missing and placeholder secrets fail closed; generated secrets work", () => {
  for (const value of [undefined, "", "short", "replace-with-a-long-random-value", "development-only-secret-change-me", "a".repeat(64)]) {
    assert.throws(() => getPayloadSecret({ PAYLOAD_SECRET: value }), /PAYLOAD_SECRET/);
  }
  const secret = randomBytes(32).toString("hex");
  assert.equal(getPayloadSecret({ PAYLOAD_SECRET: secret }), secret);
  for (const value of [undefined, "", "change-me", "password123456"]) assert.throws(() => requireInitialPassword(value), /SEED_PASSWORD/);
});

test("initialization preserves existing accounts and requires an explicit password for new accounts", async () => {
  const writes: unknown[] = [];
  const payload = {
    find: async () => ({ totalDocs: 1 }),
    create: async (value: unknown) => { writes.push(value); },
  };
  assert.equal(await ensureInitialAdmin(payload as never, "other@example.com", "different-password-123"), false);
  assert.deepEqual(writes, []);
  payload.find = async () => ({ totalDocs: 0 });
  await assert.rejects(ensureInitialAdmin(payload as never, "admin@example.com", undefined), /SEED_PASSWORD/);
  assert.deepEqual(writes, []);
  const password = randomBytes(24).toString("hex");
  assert.equal(await ensureInitialAdmin(payload as never, "admin@example.com", password), true);
  assert.equal(writes.length, 1);
  assert.equal((writes[0] as { data: { password: string } }).data.password, password);
});
