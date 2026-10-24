/** Preserve legacy ABC values while removing the closed category enum. */
export async function migrateArticlePlans(db) {
  await db.query('ALTER TABLE content_plan_items ADD COLUMN IF NOT EXISTS item_note varchar');
  for (const table of ['content_plan_items', 'content_assets']) {
    const column = (await db.query("SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name='article_category'", [table])).rows[0];
    if (column?.data_type === 'USER-DEFINED') await db.query(`ALTER TABLE ${table} ALTER COLUMN article_category TYPE varchar USING article_category::text`);
  }
  await db.query("INSERT INTO workbench_schema_versions(version) VALUES('20261009-extensible-article-plans') ON CONFLICT DO NOTHING");
}
