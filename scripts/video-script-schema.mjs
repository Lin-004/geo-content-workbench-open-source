/** Incremental content-type/platform migration. Enum labels commit before use. */
export async function prepareVideoScriptEnums(db) {
  const enums=(await db.query("SELECT DISTINCT t.typname FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND (t.typname='enum_content_assets_content_type' OR t.typname IN ('enum_content_plans_platforms','enum_content_plan_items_target_platforms','enum_content_assets_target_platforms','enum_publication_tasks_platform') OR t.typname='enum_platform_configs_key')")).rows;
  for(const {typname} of enums){
    const labels=typname==='enum_content_assets_content_type'?['video_script']:['douyin','wechat_channels'];
    for(const value of labels) await db.query(`ALTER TYPE "${typname.replaceAll('"','""')}" ADD VALUE IF NOT EXISTS '${value}'`);
  }
  await db.query("DO $$ BEGIN CREATE TYPE enum_content_plan_items_content_type AS ENUM ('article','video_script'); EXCEPTION WHEN duplicate_object THEN NULL; END $$");
}
export async function migrateVideoScripts(db) {
  await db.query("ALTER TABLE content_plan_items ADD COLUMN IF NOT EXISTS content_type enum_content_plan_items_content_type DEFAULT 'article' NOT NULL");
  // Only add missing platform configuration; preserve existing enablement and custom URLs.
  for(const [key,name,url] of [['douyin','抖音','https://creator.douyin.com/'],['wechat_channels','视频号','https://channels.weixin.qq.com/']]){
    await db.query('INSERT INTO platform_configs(key,name,publish_url,enabled,created_at,updated_at) SELECT $1,$2,$3,true,now(),now() WHERE NOT EXISTS(SELECT 1 FROM platform_configs WHERE key=$1)',[key,name,url]);
  }
  await db.query("INSERT INTO workbench_schema_versions(version) VALUES('20261012-video-script') ON CONFLICT DO NOTHING");
}
