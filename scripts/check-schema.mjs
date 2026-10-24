import { platformEnums } from "./xiaohongshu-schema.mjs";
import dotenv from 'dotenv';
import {createRequire} from 'node:module';
dotenv.config({path:'.env.local'});
const require=createRequire(import.meta.url), {Client}=createRequire(require.resolve('@payloadcms/db-postgres'))('pg');
const db=new Client({connectionString:process.env.DATABASE_URL});
await db.connect();
try{
 const required={content_assets:['content_plan_item_id','revision_of_id'],content_plan_items:['item_key','item_note','content_type'],publication_tasks:['cancelled_at'],audit_records:['content_snapshot'],plan_import_batches:['project_id','source_hash','details','operator_id']};
 const columns=(await db.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public'")).rows;
 for (const table of ['content_assets','content_plan_items']) {
  const result=await db.query("SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name='article_category'",[table]);
  if(result.rows[0]?.data_type!=='character varying')throw new Error(`${table}.article_category 需要迁移为开放分类字段，请执行 pnpm db:migrate`);
 }
 const indexes=(await db.query("SELECT indexname FROM pg_indexes WHERE schemaname='public'")).rows.map(i=>i.indexname);
 const missing=Object.entries(required).flatMap(([table,names])=>names.filter(name=>!columns.some(c=>c.table_name===table && c.column_name===name)).map(name=>`${table}.${name}`));
 for(const index of ['contentplan_itemkey_idx','project_plandate_idx','active_asset_platform_idx','active_asset_plan_item_idx'])if(!indexes.includes(index))missing.push(index);
 if(missing.length)throw new Error(`数据库需要增量迁移：${missing.join('、')}。请执行 pnpm db:migrate`);
 const labels=(await db.query("SELECT t.typname,e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid")).rows;
 for(const [name,value] of [['enum_content_assets_content_type','video_script'],['enum_content_plan_items_content_type','video_script'],['enum_platform_configs_key','douyin'],['enum_platform_configs_key','wechat_channels']])if(!labels.some(r=>r.typname===name && r.enumlabel===value))throw new Error('短视频脚本结构缺失，请执行 pnpm db:migrate');
 for(const name of platformEnums)if(!labels.some(r=>r.typname===name && r.enumlabel==='xiaohongshu'))throw new Error('小红书平台结构缺失，请执行 pnpm db:migrate');
 console.log('源码对应的数据库字段和唯一约束检查通过。');
}finally{await db.end();}
