#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

const resources = { projects:'projects', plans:'content-plans', items:'content-plan-items', content:'content-assets', publications:'publication-tasks', audits:'audit-records', users:'users', platforms:'platform-configs', media:'media' };
const fields = {
  projects:['name','startDate','endDate','owner','goal','description'],
  plans:['project','planDate','dailyTheme','topic','title','platforms','note'],
  items:['contentPlan','contentType','articleCategory','question','title','targetPlatforms','sortOrder','sourceType','sourceFilename'],
  content:['project','contentPlan','contentPlanItem','articleCategory','question','title','contentType','targetPlatforms','images','body','bodyText','sourceType','sourceFilename','plannedPublishDate'],
};
const platforms = new Set(['toutiao','baijiahao','zhihu','sohu','wechat','ctrip','meipian','douyin','wechat_channels','xiaohongshu']);
const categories = new Set(['enterprise','general','vertical']);
const idOf = v => v && typeof v === 'object' ? String(v.id ?? '') : String(v ?? '');
const fail = (message, details={}) => { throw Object.assign(new Error(message), details); };
const need = (v, name) => { if (v === undefined || v === null || v === '') fail(`缺少 ${name}`); return v; };
const numericId = v => { if (!/^[1-9]\d*$/.test(String(v)) || !Number.isSafeInteger(Number(v))) fail('ID 必须为正整数'); return Number(v); };
export function validDate(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) fail('日期必须为 YYYY-MM-DD');
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0,10) !== v) fail(`无效日期：${v}`);
  return v;
}
const dayOf = v => v ? new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date(v.length===10 ? `${v}T00:00:00+08:00` : v)) : '';
const today = () => dayOf(new Date().toISOString());
const range = (from,to) => {
  validDate(from); validDate(to); if (from > to) fail('开始日期不能晚于结束日期');
  return {greater_than_equal:new Date(`${from}T00:00:00+08:00`).toISOString(), less_than:new Date(new Date(`${to}T00:00:00+08:00`).getTime()+86400000).toISOString()};
};
export function textToBody(text) {
  if (typeof text !== 'string') fail('bodyText 必须为字符串');
  return {root:{type:'root',version:1,format:'',indent:0,direction:'ltr',children:text.split('\n').map(text=>({type:'paragraph',version:1,format:'',indent:0,direction:'ltr',children:text?[{type:'text',version:1,text,mode:'normal',style:'',detail:0,format:0}]:[]}))}};
}
const bodyText = node => typeof node?.text === 'string' ? node.text : (node?.children || []).map(bodyText).join('\n');
const checkPlatforms = v => { if (!Array.isArray(v) || !v.length || v.some(p=>!platforms.has(p)) || new Set(v).size !== v.length) fail('目标平台不能为空、重复或包含未知值'); };
const checkKeys = (obj,allowed) => { if (!obj || typeof obj!=='object' || Array.isArray(obj)) fail('输入必须为 JSON 对象'); for (const k of Object.keys(obj)) if (!allowed.includes(k)) fail(`不支持字段 ${k}`); };
const help = `GEO 工作台（Node.js >=22）
连接：GEO_WORKBENCH_URL；认证：GEO_WORKBENCH_COOKIE 或 GEO_WORKBENCH_USERNAME/GEO_WORKBENCH_PASSWORD
node workbench.mjs <resource> list [--project ID --plan ID --asset ID --status VALUE --name TEXT --type article|video_script --from DATE --to DATE]
node workbench.mjs <resource> show --id ID
node workbench.mjs projects|plans|items|content create --data FILE.json
node workbench.mjs projects|plans|items|content update --id ID --data FILE.json
node workbench.mjs plans|content preview-import --file FILE
node workbench.mjs plans|content confirm-import --data FILE.json
node workbench.mjs content soft-delete --id ID
node workbench.mjs media upload --file FILE [--alt TEXT]
node workbench.mjs review submit|approve|reject --id ID [--comment TEXT]
node workbench.mjs publications confirm --id ID --url URL
node workbench.mjs report --project ID --from DATE --to DATE
资源：projects plans items content publications audits users platforms media
写入不自动重试；业务详情见 skill references/。`;

export class Workbench {
  constructor(env=process.env) {
    this.env=env; this.base=new URL(env.GEO_WORKBENCH_URL || 'http://127.0.0.1:3001');
    if (!['http:','https:'].includes(this.base.protocol) || this.base.username || this.base.password || this.base.pathname !== '/' || this.base.search || this.base.hash) fail('服务地址必须为无凭证、路径或查询参数的 http(s) 根地址');
    this.cookie=env.GEO_WORKBENCH_COOKIE;
  }
  redact(value) {
    let message=String(value);
    for (const secret of [this.env.GEO_WORKBENCH_PASSWORD,this.env.GEO_WORKBENCH_COOKIE,this.cookie]) if (secret) message=message.split(secret).join('[redacted]');
    return message;
  }
  async request(path,{method='GET',data,form,auth=true}={}) {
    const headers={origin:this.base.origin}; if(auth) { if(!this.cookie) await this.login(); headers.cookie=this.cookie; }
    if(data!==undefined) headers['content-type']='application/json';
    let response;
    try { response=await fetch(new URL(path,this.base),{method,headers,body:form ?? (data!==undefined?JSON.stringify(data):undefined),redirect:'error',signal:AbortSignal.timeout(30000)}); }
    catch { fail('请求传输失败；写入结果可能未知，请先查询对账，不直接重试', {outcomeUnknown:method!=='GET',method,path}); }
    let value;
    try { value=await response.json(); } catch { fail('服务响应不是 JSON，请核对服务地址和实际写入结果',{status:response.status,outcomeUnknown:method!=='GET',method,path}); }
    if(!response.ok) fail(this.redact(value.errors?.[0]?.message || value.message || `HTTP ${response.status}`),{status:response.status,method,path});
    return {value,response};
  }
  async login() {
    const username=need(this.env.GEO_WORKBENCH_USERNAME,'GEO_WORKBENCH_USERNAME 或 GEO_WORKBENCH_COOKIE');
    const password=need(this.env.GEO_WORKBENCH_PASSWORD,'GEO_WORKBENCH_PASSWORD');
    const {response}=await this.request('/api/users/login',{method:'POST',data:{username,password},auth:false});
    const cookies=response.headers.getSetCookie();
    this.cookie=cookies.map(c=>c.split(';')[0]).join('; '); if(!this.cookie) fail('登录响应没有 Cookie');
  }
  path(resource,id) { return `/api/${resources[resource]}${id!==undefined?`/${numericId(id)}`:''}`; }
  async get(resource,id) { return (await this.request(this.path(resource,id))).value; }
  async list(resource,where={}) {
    const docs=[]; let page=1;
    for (;;) {
      const q=new URLSearchParams({limit:'100',depth:'0',page:String(page),sort:'id'});
      const append=(obj,prefix)=>{ for(const [k,v] of Object.entries(obj)) if(v!==null && typeof v==='object') append(v,`${prefix}[${k}]`); else q.set(`${prefix}[${k}]`,String(v)); }; append(where,'where');
      const {value}=await this.request(`${this.path(resource)}?${q}`);
      if(!Array.isArray(value.docs) || typeof value.hasNextPage!=='boolean') fail('分页响应与契约不符');
      if(value.docs.some(d=>docs.some(old=>String(old.id)===String(d.id)))) fail('分页含重复记录，可能正在并发变更，请重新读取');
      docs.push(...value.docs);
      if(!value.hasNextPage) break;
      if(value.nextPage !== page+1 || !value.docs.length || page>=10000) fail('分页未推进，不能生成完整结果');
      page=value.nextPage;
    }
    return docs;
  }
  link(resource,id) {
    const path= resource==='content'?`/content-management/detail/${id}`:resource==='projects'?`/project-management/detail/${id}`:resource==='publications'?'/publications':`/admin/collections/${resources[resource]}/${id}`;
    return new URL(path,this.base).href;
  }
  async write(resource,id,data) {
    const {value}=await this.request(this.path(resource,id),{method:id===undefined?'POST':'PATCH',data});
    if(!value.doc?.id) fail('写入响应缺少 doc.id',{outcomeUnknown:true});
    try { const doc=await this.get(resource,value.doc.id); this.verify(doc,data); return {doc,url:this.link(resource,doc.id)}; }
    catch(e) { e.writtenRecordId=value.doc.id; e.verificationFailed=true; throw e; }
  }
  verify(doc,data) {
    for(const [key,expected] of Object.entries(data)) {
      if(expected===undefined) continue;
      const actual=doc[key]; let same;
      if(['project','contentPlan','contentPlanItem','owner'].includes(key)) same=idOf(actual)===idOf(expected);
      else if(['planDate','plannedPublishDate','startDate','endDate'].includes(key)) same=dayOf(actual)===dayOf(expected);
      else if(key==='body') same=bodyText(actual?.root)===bodyText(expected?.root);
      else if(['images','platforms','targetPlatforms'].includes(key)) same=Array.isArray(actual) && JSON.stringify(actual.map(idOf).sort())===JSON.stringify(expected.map(idOf).sort());
      else same=JSON.stringify(actual)===JSON.stringify(expected);
      if(!same) fail(`写入后字段不符合预期：${key}`,{verificationFailed:true});
    }
  }
  async activeProject(id) { const doc=await this.get('projects',id); if(doc.deletedAt) fail('项目已删除'); return doc; }
  async sameDay(project,date) { return this.list('plans',{and:[{project:{equals:numericId(project)}},{planDate:range(date,date)}]}); }
  async planAssets(plan) {
    const docs=await this.list('content',{contentPlan:{equals:numericId(plan.id)}});
    const legacy=idOf(plan.contentAsset);
    if(legacy && !docs.some(a=>idOf(a.id)===legacy)) { const a=await this.get('content',legacy); if(!a.deletedAt) docs.push(a); }
    return docs.filter(a=>!a.deletedAt);
  }
  async editablePlan(plan) {
    if(dayOf(plan.planDate)<today()) fail('历史规划仅支持查看');
    if((await this.planAssets(plan)).length) fail('规划已有内容资产，不允许修改核心字段');
  }
  async editableAsset(asset) {
    if(asset.deletedAt || asset.status==='reviewing') fail('内容已删除或审核中，不允许修改');
    const tasks=await this.list('publications',{contentAsset:{equals:asset.id}});
    if(tasks.some(t=>t.status==='published')) fail('已有平台发布记录，不允许修改或删除母稿');
  }
  async prepare(resource,input,id) {
    checkKeys(input,fields[resource]); const data={...input}; const old=id!==undefined?await this.get(resource,id):undefined;
    if(data.contentType!==undefined && !['article','video_script'].includes(data.contentType)) fail('未知内容类型');
    if(data.articleCategory!==undefined && !categories.has(data.articleCategory)) fail('未知文章分类');
    for(const field of ['platforms','targetPlatforms']) if(data[field]!==undefined) checkPlatforms(data[field]);
    for(const field of ['planDate','plannedPublishDate','startDate','endDate']) if(data[field]) validDate(data[field]);
    for(const field of ['project','contentPlan','owner']) if(data[field]!==undefined && data[field]!==null) data[field]=numericId(data[field]);
    if(resource==='projects') {
      const full={...old,...data}; for(const k of fields.projects) need(full[k],k);
      if(full.startDate.slice(0,10)>full.endDate.slice(0,10)) fail('项目开始日期不能晚于结束日期');
    }
    if(resource==='plans') {
      const full={...old,...data}; await this.activeProject(full.project); validDate(dayOf(full.planDate));
      if(dayOf(full.planDate)<today()) fail('不能新增或修改历史规划');
      if(old) await this.editablePlan(old);
      const matches=await this.sameDay(full.project,dayOf(full.planDate));
      if(matches.some(p=>idOf(p.id)!==idOf(id))) fail('同项目同日已存在规划，请使用明确 ID 更新');
      for(const k of ['topic','title','platforms']) need(full[k],k);
    }
    if(resource==='items') {
      if(old && data.contentPlan!==undefined && idOf(data.contentPlan)!==idOf(old.contentPlan)) fail('不支持迁移规划项到其他规划');
      const full={...old,...data}; const plan=await this.get('plans',need(full.contentPlan,'contentPlan')); await this.editablePlan(plan);
      const matches=await this.list('items',{contentPlan:{equals:plan.id}});
      for(const k of ['articleCategory','question','targetPlatforms']) need(full[k],k);
      if(matches.some(a=>(a.contentType || 'article')===(full.contentType || 'article') && a.articleCategory===full.articleCategory && a.question===full.question && idOf(a.id)!==idOf(id))) fail('同规划同分类同问题已存在规划项');
    }
    if(resource==='content') {
      if(old) await this.editableAsset(old);
      if(old) for(const k of ['project','contentPlan']) if(k in data && idOf(data[k])!==idOf(old[k])) fail('不支持迁移现有资产的项目或规划关系');
      if('bodyText' in data) { if('body' in data) fail('body 与 bodyText 不能同时传入'); data.body=textToBody(data.bodyText); delete data.bodyText; }
      const full={...old,...data}; await this.activeProject(need(full.project,'project'));
      if(full.contentPlanItem) { const item=await this.get('items',full.contentPlanItem); if(idOf(item.contentPlan)!==idOf(full.contentPlan)) fail('规划项与每日规划不一致'); if((item.contentType || 'article')!==(full.contentType || 'article')) fail('内容类型与规划项不一致'); }
      if(full.contentPlan) { const plan=await this.get('plans',full.contentPlan); if(idOf(plan.project)!==idOf(full.project)) fail('资产与规划所属项目不一致'); }
      for(const k of ['title','targetPlatforms']) need(full[k],k);
      if(!old && full.contentPlan && full.articleCategory && full.question) {
        const matches=await this.list('content',{contentPlan:{equals:numericId(full.contentPlan)}});
        if(matches.some(a=>!a.deletedAt && (a.contentType || 'article')===(full.contentType || 'article') && a.articleCategory===full.articleCategory && a.question===full.question)) fail('已有相同规划/分类/问题资产，请先核对，禁止重复创建');
      }
      if(!old) { data.contentType ??= 'article'; data.sourceType ??= 'manual'; }
    }
    return data;
  }
  async upload(file,kind,alt) {
    const name=basename(file),ext=extname(name).toLowerCase();
    const mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'};
    if(kind==='media'?!mime[ext]:!['.md','.markdown','.docx',...(kind==='content'?['.pdf']:[])].includes(ext)) fail('不支持的文件格式');
    const bytes=await readFile(file); if(kind!=='media' && bytes.length>10*1024*1024) fail('文件不能超过10MB');
    const form=new FormData(); form.set('file',new Blob([bytes],{type:mime[ext]||'application/octet-stream'}),name);
    if(kind==='media') form.set('_payload',JSON.stringify({alt:alt||name}));
    const {value}=await this.request(kind==='media'?'/api/media':`/api/import/${kind}/preview`,{method:'POST',form});
    if(kind==='media') { if(!value.doc?.id) fail('媒体上传缺少 doc.id',{outcomeUnknown:true}); return {doc:await this.get('media',value.doc.id)}; }
    return value;
  }
  async contentImport(input) {
    checkKeys(input,['project','contentPlan','contentPlanItem','contentType','articleCategory','question','title','targetPlatforms','sourceFilename','text','body','plannedPublishDate']);
    need(input.sourceFilename,'sourceFilename'); if(typeof input.text!=='string'||!input.text.trim()) fail('空正文骨架请使用 content create');
    const data={...input,contentType:input.contentType || 'article'};
    const check={...data,body:input.body?.root ? input.body : textToBody(input.text),sourceType:'import'}; delete check.text;
    await this.prepare('content',check);
    if(input.contentPlanItem) {
      const found=await this.list('content',{contentPlanItem:{equals:numericId(input.contentPlanItem)}});
      if(found.some(a=>!a.deletedAt))fail('规划项已有文章或脚本，请更新原记录，不重复导入');
    }
    const {value}=await this.request('/api/import/content/confirm',{method:'POST',data});
    const id=value.doc?.id; if(!id) fail('导入响应缺少 doc.id',{outcomeUnknown:true});
    try {
      const doc=await this.get('content',id);
      this.verify(doc,check);
      return {doc,url:this.link('content',id),tasks:await this.list('publications',{contentAsset:{equals:id}})};
    } catch(e) { e.createdAssetId=id; throw e; }
  }
  async planImport(input) {
    checkKeys(input,['project','sourceFilename','dailyPlans']); await this.activeProject(need(input.project,'project'));
    if(!Array.isArray(input.dailyPlans)||!input.dailyPlans.length) fail('仅支持非空 dailyPlans，旧 rows 导入会重复新增');
    const dates=new Set(),submit=[],unchanged=[],known=[];
    for(const d of input.dailyPlans) {
      checkKeys(d,['planDate','topic','title','note','articles']); validDate(d.planDate); need(d.title,'每日标题');
      if(dates.has(d.planDate)) fail('输入中日期重复'); dates.add(d.planDate);
      if(!Array.isArray(d.articles)||!d.articles.length) fail('每日 articles 不能为空');
      const keys=new Set();
      for(const a of d.articles) {
        checkKeys(a,['line','category','categoryLabel','question','title','targetPlatforms']);
        if(!categories.has(a.category)) fail('未知分类'); need(a.question,'问题'); need(a.title,'文章标题'); checkPlatforms(a.targetPlatforms);
        const key=JSON.stringify([a.category,a.question]); if(keys.has(key)) fail('同日同分类同问题重复'); keys.add(key);
      }
      const matches=await this.sameDay(input.project,d.planDate); if(matches.length>1) fail(`同日有多个规划：${d.planDate}`);
      const plan=matches[0]; let same=false;
      if(plan) {
        known.push(plan.id); const items=await this.list('items',{contentPlan:{equals:plan.id}});
        if(items.some(item=>!keys.has(JSON.stringify([item.articleCategory,item.question])))) fail('输入遗漏或更改了现有规划项；当前导入不支持删除，请按明确 ID 维护');
        const desiredPlatforms=[...new Set(d.articles.flatMap(a=>a.targetPlatforms))].sort();
        same=plan.title===d.title && (plan.dailyTheme||'')===(d.topic||d.title) && plan.topic===(d.topic||d.title) && (plan.note||'')===(d.note||'') && JSON.stringify([...(plan.platforms||[])].sort())===JSON.stringify(desiredPlatforms) && items.length===d.articles.length;
        for(const [i,a] of d.articles.entries()) {
          const exact=items.filter(v=>v.articleCategory===a.category&&v.question===a.question);
          if(exact.length>1) fail('现有规划项重复，需人工定位');
          if(!exact.length && items.some(v=>v.articleCategory===a.category)) fail('同分类存在不同问题，请用明确规划项 ID 更新');
          const v=exact[0]; same=same && Boolean(v) && v.title===a.title && v.sortOrder===i && JSON.stringify([...(v.targetPlatforms||[])].sort())===JSON.stringify([...a.targetPlatforms].sort());
        }
        if(same) { unchanged.push(plan); continue; }
        await this.editablePlan(plan);
      }
      if(d.planDate<today()) fail('历史规划不允许通过导入新建或修改');
      submit.push(d);
    }
    try {
      if(submit.length) await this.request('/api/import/plans/confirm',{method:'POST',data:{...input,project:numericId(input.project),dailyPlans:submit}});
      const plans=[],items=[];
      for(const d of input.dailyPlans) {
        const matches=await this.sameDay(input.project,d.planDate); if(matches.length!==1) fail('导入后每日规划数量不符合预期');
        const actual=await this.list('items',{contentPlan:{equals:matches[0].id}});
        this.verify(matches[0],{title:d.title,topic:d.topic||d.title,dailyTheme:d.topic||d.title,platforms:[...new Set(d.articles.flatMap(a=>a.targetPlatforms))]});
        if(actual.length!==d.articles.length) fail('导入后规划项数量不符合预期',{verificationFailed:true});
        for(const [index,a] of d.articles.entries()) {
          const candidates=actual.filter(v=>v.articleCategory===a.category && v.question===a.question);
          if(candidates.length!==1) fail('导入后规划项匹配不唯一',{verificationFailed:true});
          this.verify(candidates[0],{title:a.title,targetPlatforms:a.targetPlatforms,sortOrder:index});
        }
        plans.push({...matches[0],url:this.link('plans',matches[0].id)});items.push(...actual);
      }
      return {submittedDays:submit.length,unchangedDays:unchanged.length,plans,items};
    } catch(e) { e.knownPlanIds=known; e.reconcile={project:input.project,dates:[...dates]}; throw e; }
  }
  async review(action,id,comment) {
    const old=await this.get('content',id); const from={submit:'draft',approve:'reviewing',reject:'reviewing'};
    if(old.deletedAt || old.status!==from[action]) fail(`当前状态不能执行 ${action}`);
    if(action==='submit' && !bodyText(old.body?.root).trim()) fail('提交审核前需要有效正文');
    await this.request(`/api/content-assets/${numericId(id)}/workflow/${action}`,{method:'POST',data:{comment}});
    const doc=await this.get('content',id); this.verify(doc,{status:{submit:'reviewing',approve:'approved',reject:'draft'}[action]});
    const audits=await this.list('audits',{contentAsset:{equals:numericId(id)}});
    if(!audits.some(record=>record.action===action)) fail('回读未发现对应审核记录',{writtenRecordId:numericId(id),verificationFailed:true});
    return {doc,audits,tasks:await this.list('publications',{contentAsset:{equals:numericId(id)}}),url:this.link('content',id)};
  }
  async confirm(id,url) {
    const parsed=new URL(url); if(!['http:','https:'].includes(parsed.protocol) || parsed.username || parsed.password) fail('请提供无内嵌凭证的真实 http(s) 发布链接');
    const task=await this.get('publications',id); const asset=await this.get('content',idOf(task.contentAsset));
    if(task.status==='published') { if(task.publishedUrl===url) return {doc:task,alreadyConfirmed:true}; fail('任务已发布且链接不同，不覆盖'); }
    if(task.status!=='pending'||asset.status!=='approved'||asset.deletedAt) fail('任务或母稿不处于可发布状态');
    await this.request(`/api/publication-tasks/${numericId(id)}/confirm`,{method:'POST',data:{publishedUrl:url}});
    const doc=await this.get('publications',id);this.verify(doc,{status:'published',publishedUrl:url});
    return {doc,tasks:await this.list('publications',{contentAsset:{equals:asset.id}}),url:this.link('content',asset.id)};
  }
  async report(project,from,to) {
    await this.activeProject(project); const bounds=range(from,to);
    const plans=await this.list('plans',{and:[{project:{equals:numericId(project)}},{planDate:bounds}]});
    const projectAssets=await this.list('content',{project:{equals:numericId(project)}});
    const selected=new Map(); const planIds=new Set(plans.map(p=>idOf(p.id)));
    for(const a of projectAssets) if(!a.deletedAt && (planIds.has(idOf(a.contentPlan)) || (!a.contentPlan && a.plannedPublishDate && dayOf(a.plannedPublishDate)>=from && dayOf(a.plannedPublishDate)<=to))) selected.set(idOf(a.id),a);
    const days=[],allItems=[];
    for(const plan of plans) {
      const assets=await this.planAssets(plan); for(const a of assets) selected.set(idOf(a.id),a);
      const items=await this.list('items',{contentPlan:{equals:plan.id}}); allItems.push(...items);
      const coverage=items.map(item=>{ const matches=assets.filter(a=>a.articleCategory===item.articleCategory && a.question===item.question); return {itemId:item.id,category:item.articleCategory,question:item.question,title:item.title,assetIds:matches.map(a=>a.id),status:matches.length===1?'matched':matches.length?'ambiguous':'unmatched'}; });
      const counts=new Map(); for(const c of coverage) for(const id of c.assetIds) counts.set(idOf(id),(counts.get(idOf(id))||0)+1);
      for(const c of coverage) if(c.assetIds.some(id=>counts.get(idOf(id))>1)) c.status='ambiguous';
      days.push({id:plan.id,date:dayOf(plan.planDate),title:plan.title,status:plan.status,url:this.link('plans',plan.id),coverage,assetIds:assets.map(a=>a.id)});
    }
    const assets=[...selected.values()].map(a=>({...a,url:this.link('content',a.id)})),tasks=[];
    for(const a of assets) tasks.push(...await this.list('publications',{contentAsset:{equals:a.id}}));
    const count=docs=>docs.reduce((acc,d)=>{acc[d.status]=(acc[d.status]||0)+1;return acc;},{});
    return {project:numericId(project),from,to,timezone:'Asia/Shanghai',summary:{plans:plans.length,items:allItems.length,assets:assets.length,assetStatuses:count(assets),tasks:tasks.length,taskStatuses:count(tasks),publishedTaskRate:tasks.length?tasks.filter(t=>t.status==='published').length/tasks.length:null},days,assets,tasks,limitations:['规划项与资产按分类和问题推断匹配，无唯一关系','查询不是事务快照；无规划且无日期的资产未计入']};
  }
}

function parse(argv) {
  const positional=[],options={};
  for(let i=0;i<argv.length;i++) if(argv[i].startsWith('--')) {const k=argv[i].slice(2);if(k in options) fail(`参数重复 ${k}`);const v=argv[++i];if(!v||v.startsWith('--')) fail(`参数缺少值 ${k}`);options[k]=v;} else positional.push(argv[i]);
  return {positional,options};
}
function filter(resource,o) {
  const w={}; const mapping={project:{plans:'project',content:'project'},plan:{items:'contentPlan',content:'contentPlan'},asset:{publications:'contentAsset',audits:'contentAsset'},status:{plans:'status',content:'status',publications:'status'},name:{projects:'name'},type:{content:'contentType',items:'contentType'}};
  for(const k of Object.keys(o)) if(!['from','to'].includes(k)) {const field=mapping[k]?.[resource];if(!field) fail(`资源 ${resource} 不支持筛选 ${k}`); w[field]={[k==='name'?'contains':'equals']:['project','plan','asset'].includes(k)?numericId(o[k]):o[k]};}
  if(o.from||o.to) {const f={plans:'planDate',content:'plannedPublishDate',publications:'plannedPublishAt',audits:'createdAt'}[resource];if(!f) fail('此资源不支持日期筛选');w[f]=range(need(o.from,'from'),need(o.to,'to'));}
  return w;
}
export async function run(argv,env=process.env) {
  const {positional:[resource,action,...extra],options:o}=parse(argv); if(extra.length) fail('位置参数过多');
  if(!resource||resource==='help') return {help};
  if(resource==='report' && action!==undefined) fail('report 不接受额外位置参数');
  const allowed=resource==='report'?['project','from','to']:action==='list'?['project','plan','asset','status','name','type','from','to']:action==='show'||action==='soft-delete'?['id']:action==='create'||action==='confirm-import'?['data']:action==='update'?['id','data']:action==='preview-import'?['file']:action==='upload'?['file','alt']:resource==='review'?['id','comment']:action==='confirm'?['id','url']:[];
  for(const k of Object.keys(o)) if(!allowed.includes(k)) fail(`不支持参数 --${k}`);
  const client=new Workbench(env); const json=async()=>JSON.parse(await readFile(need(o.data,'data'),'utf8'));
  if(resource==='report') return client.report(need(o.project,'project'),need(o.from,'from'),need(o.to,'to'));
  if(resource==='review' && ['submit','approve','reject'].includes(action)) return client.review(action,need(o.id,'id'),o.comment);
  if(!resources[resource]) fail('未知资源，执行 help 查看命令');
  if(action==='list') { const docs=await client.list(resource,filter(resource,o)); return {docs:resource==='users'?docs.map(({id,username,displayName})=>({id,username,displayName})):docs,total:docs.length}; }
  if(action==='show') {const doc=await client.get(resource,need(o.id,'id'));return resource==='users'?{doc:{id:doc.id,username:doc.username,displayName:doc.displayName}}:{doc,url:client.link(resource,doc.id)};}
  if(['create','update'].includes(action)&&fields[resource]) {const id=action==='update'?need(o.id,'id'):undefined;return client.write(resource,id,await client.prepare(resource,await json(),id));}
  if(action==='preview-import'&&['plans','content'].includes(resource)) return client.upload(need(o.file,'file'),resource);
  if(action==='confirm-import'&&['plans','content'].includes(resource)) return resource==='plans'?client.planImport(await json()):client.contentImport(await json());
  if(resource==='media'&&action==='upload') return client.upload(need(o.file,'file'),'media',o.alt);
  if(resource==='publications'&&action==='confirm') return client.confirm(need(o.id,'id'),need(o.url,'url'));
  if(resource==='content'&&action==='soft-delete') {
    const id=need(o.id,'id'),old=await client.get('content',id);if(old.deletedAt)return {doc:old,alreadyDeleted:true};await client.editableAsset(old);
    const {value}=await client.request(`/api/content-assets/${numericId(id)}/soft-delete`,{method:'POST'});if(!value.doc?.deletedAt)fail('软删除响应未标记 deletedAt',{outcomeUnknown:true});
    if((await client.list('content',{id:{equals:numericId(id)}})).length)fail('软删除后正常查询仍返回资产',{writtenRecordId:numericId(id),verificationFailed:true});
    return {doc:value.doc,url:client.link('content',id)};
  }
  fail('不支持此操作，请执行 help');
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await run(process.argv.slice(2)),null,2)); }
  catch(e) { const output={ok:false,message:e.message};for(const k of ['status','outcomeUnknown','method','path','writtenRecordId','verificationFailed','createdAssetId','knownPlanIds','reconcile'])if(e[k]!==undefined)output[k]=e[k];console.error(JSON.stringify(output,null,2));process.exitCode=1; }
}
