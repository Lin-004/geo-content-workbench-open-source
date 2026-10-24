import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Workbench, run, textToBody, validDate } from './workbench.mjs';

const page = (docs,extra={}) => ({docs,hasNextPage:false,...extra});
const future = '2099-10-12';
async function fixture(handler,body) {
  const requests=[];
  const server=createServer(async(req,res)=>{
    let raw=''; for await(const chunk of req) raw+=chunk;
    const call={method:req.method,url:new URL(req.url,`http://${req.headers.host}`),body:raw&&req.headers['content-type']?.includes('application/json')?JSON.parse(raw):undefined,raw,origin:req.headers.origin,cookie:req.headers.cookie};requests.push(call);
    try { const result=await handler(call); res.writeHead(typeof result?.status==='number'?result.status:200,{'content-type':'application/json',...(result?.headers||{})});res.end(JSON.stringify(result?.value??result)); }
    catch(e) {res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({message:e.message}));}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const env={GEO_WORKBENCH_URL:`http://127.0.0.1:${server.address().port}`,GEO_WORKBENCH_COOKIE:'session=test'};
  try { await body(new Workbench(env),requests,env); }
  finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
const unexpected = call => {throw new Error(`Unexpected ${call.method} ${call.url.pathname}`);};

test('真实日期、上海日期边界和正文转换',async()=>{
  assert.throws(()=>validDate('2026-02-30'));assert.equal(validDate('2028-02-29'),'2028-02-29');
  assert.equal(textToBody('第一行\n\n第三行').root.children[2].children[0].text,'第三行');
  await fixture(call=>{assert.equal(call.url.searchParams.get('where[planDate][greater_than_equal]'),'2026-10-07T16:00:00.000Z');assert.equal(call.url.searchParams.get('where[planDate][less_than]'),'2026-10-08T16:00:00.000Z');return page([]);},async(c,r,env)=>{await run(['plans','list','--from','2026-10-08','--to','2026-10-08'],env);});
});

test('分页读全，异常分页不返回截断结果',async()=>{
  await fixture(call=>Number(call.url.searchParams.get('page'))===1?page([{id:1}],{hasNextPage:true,nextPage:2}):page([{id:2}]),async c=>assert.deepEqual((await c.list('projects')).map(d=>d.id),[1,2]));
  await fixture(()=>page([{id:1}],{hasNextPage:true,nextPage:1}),async c=>assert.rejects(c.list('projects'),/分页未推进/));
});

test('登录只发送给目标服务，API Cookie 正确附带',async()=>{
  await fixture(call=>{
    if(call.url.pathname==='/api/users/login'){assert.deepEqual(call.body,{username:'tester',password:'secret'});return {value:{user:{id:1}},headers:{'set-cookie':'payload-token=abc; HttpOnly; Path=/'}};}
    assert.equal(call.cookie,'payload-token=abc');assert.equal(call.origin,call.url.origin);return page([]);
  },async(c,r,env)=>{await run(['projects','list'],{...env,GEO_WORKBENCH_COOKIE:undefined,GEO_WORKBENCH_USERNAME:'tester',GEO_WORKBENCH_PASSWORD:'secret'});assert.equal(r.length,2);});
});

test('字段、命令和筛选错误在写入前被拒绝',async()=>{
  await fixture(unexpected,async(c,r,env)=>{
    await assert.rejects(c.prepare('content',{status:'approved'}),/不支持字段/);
    await assert.rejects(run(['projects','list','--asset','1'],env),/不支持筛选/);
    await assert.rejects(run(['content','update','--id','1','--danger','yes'],env),/不支持参数/);
    assert.equal(r.length,0);
  });
});

test('已发布母稿修改被阻止，审核中不能编辑',async()=>{
  await fixture(call=>call.url.pathname==='/api/content-assets/42'?{id:42,status:'approved'}:page([{id:57,status:'published'}]),async(c,r)=>{
    await assert.rejects(c.prepare('content',{title:'new'},42),/已有平台发布/);assert.ok(r.every(x=>x.method==='GET'));
    await assert.rejects(c.editableAsset({id:1,status:'reviewing'}),/审核中/);
  });
});

test('没有正文不能提交审核，不直接改状态',async()=>{
  await fixture(()=>({id:42,status:'draft',body:textToBody('')}),async(c,r)=>{await assert.rejects(c.review('submit',42),/有效正文/);assert.ok(r.every(x=>x.method==='GET'));});
});

test('审核动作调用业务入口并回读历史与任务',async()=>{
  let submitted=false;
  await fixture(call=>{
    if(call.url.pathname==='/api/content-assets/42/workflow/submit'){assert.equal(call.method,'POST');submitted=true;return {doc:{id:42,status:'reviewing'}};}
    if(call.url.pathname==='/api/content-assets/42')return {id:42,status:submitted?'reviewing':'draft',body:textToBody('真实正文')};
    if(call.url.pathname==='/api/audit-records')return page([{id:9,action:'submit'}]);
    if(call.url.pathname==='/api/publication-tasks')return page([{id:57,status:'blocked'}]);
    return unexpected(call);
  },async c=>{const result=await c.review('submit',42);assert.equal(result.doc.status,'reviewing');assert.equal(result.audits[0].action,'submit');assert.equal(result.tasks[0].status,'blocked');});
});

test('单平台确认保持其他平台不变，相同结果重复确认不写入',async()=>{
  let done=false;
  await fixture(call=>{
    if(call.url.pathname==='/api/publication-tasks/57/confirm'){assert.deepEqual(call.body,{publishedUrl:'https://example.com/article'});done=true;return {doc:{id:57}};}
    if(call.url.pathname==='/api/publication-tasks/57')return {id:57,contentAsset:42,status:done?'published':'pending',publishedUrl:done?'https://example.com/article':null};
    if(call.url.pathname==='/api/content-assets/42')return {id:42,status:'approved'};
    if(call.url.pathname==='/api/publication-tasks')return page([{id:57,status:'published'},{id:58,status:'pending'}]);
    return unexpected(call);
  },async(c,r)=>{const first=await c.confirm(57,'https://example.com/article');assert.equal(first.tasks[1].status,'pending');const second=await c.confirm(57,'https://example.com/article');assert.equal(second.alreadyConfirmed,true);assert.equal(r.filter(x=>x.method==='POST').length,1);await assert.rejects(c.confirm(57,'https://example.com/other'),/链接不同/);});
});

test('内容导入一次保存类型和富文本；回读失败保留资产 ID',async()=>{
  let doc,breakRead=false;
  await fixture(call=>{
    if(call.url.pathname==='/api/projects/1')return {id:1};
    if(call.url.pathname==='/api/import/content/confirm'){assert.equal(call.body.articleCategory,'general');assert.equal(call.body.contentType,'video_script');doc={id:42,...call.body,status:'draft',sourceType:'import',body:call.body.body};delete doc.text;return {doc};}
    if(call.url.pathname==='/api/content-assets/42'){if(breakRead)return {status:409,value:{message:'read failed'}};return doc;}
    if(call.url.pathname==='/api/publication-tasks')return page([]);
    return unexpected(call);
  },async(c,r)=>{
    const data={project:1,contentType:'video_script',articleCategory:'general',question:'真实问题',title:'标题',targetPlatforms:['douyin','wechat_channels','xiaohongshu'],sourceFilename:'a.md',text:'正文',body:textToBody('正文')};
    const result=await c.contentImport(data);assert.equal(result.doc.articleCategory,'general');assert.equal(result.doc.question,'真实问题');assert.deepEqual(result.doc.body,data.body);assert.equal(r.filter(x=>x.method==='PATCH').length,0);
    breakRead=true;await assert.rejects(c.contentImport(data),e=>e.createdAssetId===42&&e.status===409);
  });
});

test('旧 rows 和真实日期错误不产生写入',async()=>{
  await fixture(()=>({id:1}),async(c,r)=>{
    await assert.rejects(c.planImport({project:1,rows:[]}),/不支持字段/);
    await assert.rejects(c.planImport({project:1,dailyPlans:[{planDate:'2026-02-30',title:'主题',articles:[]}]}),/无效日期/);
    assert.ok(r.every(x=>x.method==='GET'));
  });
});

test('完全相同规划重复导入跳过写入',async()=>{
  const plan={id:8,project:1,planDate:future,title:'主题',dailyTheme:'主题',topic:'主题',platforms:['toutiao']};
  const item={id:9,contentPlan:8,articleCategory:'enterprise',question:'问题',title:'标题',targetPlatforms:['toutiao'],sortOrder:0};
  await fixture(call=>call.url.pathname==='/api/projects/1'?{id:1}:call.url.pathname==='/api/content-plans'?page([plan]):page([item]),async(c,r)=>{
    const result=await c.planImport({project:1,dailyPlans:[{planDate:future,title:'主题',articles:[{category:'enterprise',question:'问题',title:'标题',targetPlatforms:['toutiao']}]}]});
    assert.equal(result.unchangedDays,1);assert.equal(result.submittedDays,0);assert.ok(r.every(x=>x.method==='GET'));
  });
});

test('已创建资产的规划不能通过导入改写',async()=>{
  await fixture(call=>{
    if(call.url.pathname==='/api/projects/1')return {id:1};
    if(call.url.pathname==='/api/content-plans')return page([{id:8,project:1,planDate:future,title:'旧主题',topic:'旧主题',platforms:['toutiao']}]);
    if(call.url.pathname==='/api/content-plan-items')return page([]);
    if(call.url.pathname==='/api/content-assets')return page([{id:42,status:'draft'}]);
    return unexpected(call);
  },async(c,r)=>{await assert.rejects(c.planImport({project:1,dailyPlans:[{planDate:future,title:'新主题',articles:[{category:'enterprise',question:'问题',title:'标题',targetPlatforms:['toutiao']}]}]}),/已有内容资产/);assert.ok(r.every(x=>x.method==='GET'));});
});

test('报告在 done 规划中发现未匹配项，排除删除资产与外期临时资产',async()=>{
  await fixture(call=>{
    if(call.url.pathname==='/api/projects/1')return {id:1};
    if(call.url.pathname==='/api/content-plans')return page([{id:8,project:1,planDate:'2026-10-08',title:'主题',status:'done'}]);
    if(call.url.pathname==='/api/content-plan-items')return page([{id:1,articleCategory:'enterprise',question:'A'},{id:2,articleCategory:'general',question:'B'}]);
    if(call.url.pathname==='/api/content-assets'){const docs=[{id:42,project:1,contentPlan:8,articleCategory:'enterprise',question:'A',status:'approved'},{id:43,project:1,deletedAt:'2026-10-08',contentPlan:8},{id:44,project:1,status:'draft',plannedPublishDate:'2026-10-20'}];return page(call.url.searchParams.has('where[contentPlan][equals]')?docs.filter(d=>d.contentPlan===8):docs);}
    if(call.url.pathname==='/api/publication-tasks'){assert.equal(call.url.searchParams.get('where[contentAsset][equals]'),'42');return page([{id:57,contentAsset:42,status:'published'}]);}
    return unexpected(call);
  },async c=>{const result=await c.report(1,'2026-10-08','2026-10-08');assert.equal(result.days[0].status,'done');assert.equal(result.days[0].coverage[1].status,'unmatched');assert.equal(result.summary.assets,1);assert.equal(result.summary.tasks,1);});
});

test('传输失败不重试，服务错误不泄露密码',async()=>{
  const original=globalThis.fetch;let count=0;
  try {globalThis.fetch=async()=>{count++;throw new Error('connection reset');};const c=new Workbench({GEO_WORKBENCH_COOKIE:'session=secret'});await assert.rejects(c.request('/api/projects',{method:'POST',data:{name:'test'}}),e=>e.outcomeUnknown===true);assert.equal(count,1);}
  finally {globalThis.fetch=original;}
  await fixture(()=>({status:400,value:{message:'password secret rejected'}}),async(c,r,env)=>{const protectedClient=new Workbench({...env,GEO_WORKBENCH_PASSWORD:'secret'});await assert.rejects(protectedClient.get('projects',1),e=>!e.message.includes('secret')&&e.message.includes('[redacted]'));});
});

test('真实 JSON 文件写入后独立回读，用户字段过滤',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'geo-skill-test-'));
  try {
    const file=join(dir,'project.json');await writeFile(file,JSON.stringify({name:'项目',startDate:future,endDate:'2099-10-20',owner:1,goal:'目标',description:'描述'}));
    await fixture(call=>call.method==='POST'?{doc:{id:1}}:call.url.pathname==='/api/projects/1'?{id:1,name:'项目',startDate:future,endDate:'2099-10-20',owner:1,goal:'目标',description:'描述'}:page([{id:1,username:'agent',displayName:'Agent',resetPasswordToken:'must not print'}]),async(c,r,env)=>{
      assert.equal((await run(['projects','create','--data',file],env)).doc.name,'项目');assert.equal(r[1].method,'GET');
      const users=await run(['users','list'],env);assert.equal(users.docs[0].resetPasswordToken,undefined);
    });
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('服务忽略输入字段时写入回读不能报成功',async()=>{
  await fixture(call=>call.method==='POST'?{doc:{id:1}}:{id:1,name:'错误标题'},async c=>{await assert.rejects(c.write('projects',undefined,{name:'预期标题'}),e=>e.verificationFailed===true&&e.writtenRecordId===1);});
});

test('规划输入省略现有项不能假称完成',async()=>{
  await fixture(call=>call.url.pathname==='/api/projects/1'?{id:1}:call.url.pathname==='/api/content-plans'?page([{id:8,project:1,planDate:future}]):page([{id:9,articleCategory:'general',question:'旧问题'}]),async(c,r)=>{
    await assert.rejects(c.planImport({project:1,dailyPlans:[{planDate:future,title:'主题',articles:[{category:'enterprise',question:'新问题',title:'标题',targetPlatforms:['toutiao']}]}]}),/遗漏或更改/);assert.ok(r.every(x=>x.method==='GET'));
  });
});

test('导入预览上传原文件，预览不确认写库',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'geo-preview-test-'));
  try {
    const file=join(dir,'week.md');await writeFile(file,'2026年\n10月12日｜主题\nA类：问题：真实问题');
    await fixture(call=>{assert.equal(call.url.pathname,'/api/import/plans/preview');assert.ok(call.raw.includes('filename="week.md"'));return {mode:'daily',dailyPlans:[]};},async(c,r)=>{assert.equal((await c.upload(file,'plans')).mode,'daily');assert.equal(r.length,1);});
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('软删除回读正常列表确认隐藏资产',async()=>{
  let deleted=false;
  await fixture(call=>{
    if(call.url.pathname==='/api/content-assets/42')return {id:42,status:'draft'};
    if(call.url.pathname==='/api/publication-tasks')return page([]);
    if(call.url.pathname==='/api/content-assets/42/soft-delete'){deleted=true;return {doc:{id:42,deletedAt:'2026-10-08'}};}
    assert.equal(deleted,true);assert.equal(call.url.searchParams.get('where[id][equals]'),'42');return page([]);
  },async(c,r,env)=>{const result=await run(['content','soft-delete','--id','42'],env);assert.ok(result.doc.deletedAt);assert.equal(r.filter(x=>x.method==='POST').length,1);});
});
