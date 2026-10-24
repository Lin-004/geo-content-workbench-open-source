import dotenv from 'dotenv';
import {createRequire} from 'node:module';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,copyFile,symlink,writeFile,rm,readdir} from 'node:fs/promises';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
dotenv.config({path:'.env.local'});
const root=process.cwd(), require=createRequire(import.meta.url);
const {Client}=createRequire(require.resolve('@payloadcms/db-postgres'))('pg');
const admin=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000});
const name=`geo_regression_${Date.now()}`;
const url=new URL(process.env.DATABASE_URL);url.pathname='/'+name;
const tmp=await mkdtemp(path.join(path.dirname(root),'.geo-regression-'));
const port=Number(process.env.TEST_PORT || 3002);
const env={...process.env,DATABASE_URL:url.href,PAYLOAD_SECRET:randomBytes(32).toString('hex'),SEED_PASSWORD:randomBytes(24).toString('base64url'),PAYLOAD_DB_PUSH:'false',TEST_BASE_URL:`http://127.0.0.1:${port}`};
let server; let logTimer; let serverLog = ''; let connected = false; let databaseCreated = false;
function run(cmd,args,options={}){return new Promise((resolve,reject)=>{const p=spawn(cmd,args,{cwd:tmp,env,stdio:'inherit',...options});p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(new Error(`检查失败：${code}`)));});}
try {
 await admin.connect();connected = true;await admin.query(`CREATE DATABASE "${name}"`);databaseCreated = true;
 const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
 for(const f of files){const target=path.join(tmp,f);await mkdir(path.dirname(target),{recursive:true});await copyFile(path.join(root,f),target);}
 await mkdir(path.join(tmp,'node_modules'));
 const linked=new Set();
 for(const base of [path.join(root,'node_modules'),path.join(root,'node_modules/.pnpm/node_modules')]) {
  for(const entry of await readdir(base)){ if(entry==='.bin')continue;
   if(entry.startsWith('@')){await mkdir(path.join(tmp,'node_modules',entry),{recursive:true});for(const child of await readdir(path.join(base,entry))){const key=entry+'/'+child;if(!linked.has(key)){await symlink(path.join(base,key),path.join(tmp,'node_modules',key));linked.add(key);}}}
   else if(!linked.has(entry)){await symlink(path.join(base,entry),path.join(tmp,'node_modules',entry));linked.add(entry);}
  }
 }
 await run(process.execPath,['--import','tsx/esm','scripts/seed.ts'],{env:{...env,PAYLOAD_DB_PUSH:'true'}});
 // Login checks below still use the original password: a second seed must not reset it.
 await run(process.execPath,['--import','tsx/esm','scripts/seed.ts'],{env:{...env,SEED_PASSWORD:randomBytes(24).toString('base64url')}});
 await run(process.execPath,['scripts/migrate-workbench.mjs']);
 await run(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'build','--webpack']);
 server=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'start','--port',String(port)],{cwd:tmp,env,detached:true,stdio:['ignore','pipe','pipe']});
 server.stdout.on('data',d=>{serverLog+=d.toString();});server.stderr.on('data',d=>{serverLog+=d.toString();});
 await mkdir(path.join(root,'.backups'),{recursive:true});
 const logPath=path.join(root,'.backups','regression-running.log');
 logTimer=setInterval(()=>{writeFile(logPath,serverLog,{mode:0o600}).catch(()=>{});},3000);
 let ready=false;for(let i=0;i<90;i++){try{const r=await fetch(env.TEST_BASE_URL+'/admin/login',{signal:AbortSignal.timeout(10000)});if(r.status===200){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,1000));}
 if(!ready)throw new Error('独立预览服务未启动');
 await run(process.execPath,['--import','tsx/esm','--test','tests/p0-regression.test.ts','tests/plan-import.test.ts']);
 clearInterval(logTimer);await rm(logPath,{force:true});
 console.log('独立数据库回归通过。');
}catch(error){ await mkdir(path.join(root,'.backups'),{recursive:true});await writeFile(path.join(root,'.backups','regression-last-error.log'),serverLog,{mode:0o600});console.error(serverLog.slice(-2500)); throw error; }finally{
 clearInterval(logTimer);
 if(server?.pid)try{process.kill(-server.pid,'SIGTERM');}catch{}
 try{if(databaseCreated)await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);}catch(error){ await mkdir(path.join(root,'.backups'),{recursive:true});await writeFile(path.join(root,'.backups','regression-last-error.log'),serverLog,{mode:0o600});console.error(serverLog.slice(-2500)); throw error; }finally{if(connected)await admin.end();await rm(tmp,{recursive:true,force:true,maxRetries:10,retryDelay:200});}
}
