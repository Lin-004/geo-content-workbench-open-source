/** Add the platform label before the migration transaction uses it. */
export const platformEnums = [
  'enum_content_plans_platforms',
  'enum_content_plan_items_target_platforms',
  'enum_content_assets_target_platforms',
  'enum_publication_tasks_platform',
  'enum_platform_configs_key',
];

export async function prepareXiaohongshuEnum(db) {
  for (const name of platformEnums) {
    await db.query(`ALTER TYPE "${name}" ADD VALUE IF NOT EXISTS 'xiaohongshu'`);
  }
}

export async function migrateXiaohongshu(db) {
  await db.query(`INSERT INTO platform_configs(key,name,publish_url,enabled,created_at,updated_at)
    SELECT 'xiaohongshu','小红书','https://creator.xiaohongshu.com/',true,now(),now()
    WHERE NOT EXISTS(SELECT 1 FROM platform_configs WHERE key='xiaohongshu')`);
  await db.query("INSERT INTO workbench_schema_versions(version) VALUES('20261015-xiaohongshu') ON CONFLICT DO NOTHING");
}
