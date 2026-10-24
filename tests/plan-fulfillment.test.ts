import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aggregateContentPlanStatus } from '../src/lib/content-plan-utils';
import { businessDate, addBusinessDays, businessWeekStart } from '../src/lib/business-date';
import { ContentPlans } from '../src/collections/ContentPlans';
import { matchPlanArticles } from '../src/lib/plan-articles';
const items = [{id:1,articleCategory:'enterprise',question:'A'},{id:2,articleCategory:'general',question:'B'},{id:3,articleCategory:'vertical',question:'C'}];
test('计划三篇只创建两篇，即使全部平台已发布也不能完成',()=>{
 const assets=[{id:11,contentPlanItem:1,status:'approved'},{id:12,contentPlanItem:2,status:'approved'}];
 const tasks=[{contentAsset:11,status:'published'},{contentAsset:12,status:'published'}];
 assert.equal(aggregateContentPlanStatus(assets,tasks,items),'creating');
 assert.equal(aggregateContentPlanStatus([...assets,{id:13,contentPlanItem:3,status:'approved'}],[...tasks,{contentAsset:13,status:'published'}],items),'done');
 assert.equal(aggregateContentPlanStatus([],[],items),'uncreated');
});
test('关联到具体规划项，已创建与未创建项同时保留',()=>{
 const rows=matchPlanArticles(items,[{id:11,contentPlanItem:1}]);
 assert.equal(rows.length,3); assert.equal(rows.filter(r=>!r.asset).length,2);
 assert.equal(rows[0].asset?.id,11);
});
test('相同分类不等于同一规划项，不推断缺少证据的旧关系',()=>{
 assert.equal(matchPlanArticles([{id:1,articleCategory:'general',question:'Q1'},{id:2,articleCategory:'general',question:'Q2'}],[{id:11,articleCategory:'general'}]).filter(r=>r.asset).length,0);
});
test('上海凌晨发布归当天，日期加减不会偏移一天',()=>{
 assert.equal(businessDate('2026-10-08T17:00:00Z'),'2026-10-09');
 assert.equal(addBusinessDays('2026-10-09',0),'2026-10-09');
 assert.equal(addBusinessDays('2026-10-09',-6),'2026-10-03');
 assert.equal(businessWeekStart('2026-10-11'),'2026-10-05');
});
test('系统可刷新历史执行状态，人工仍不能修改历史核心信息',async()=>{
 const hook=ContentPlans.hooks!.beforeChange![0];
 const args={operation:'update',data:{status:'done'},originalDoc:{id:1,planDate:'2020-01-01',status:'publishing'},req:{context:{businessAction:'system'}}};
 assert.equal((await hook(args as never)).status,'done');
 await assert.rejects(()=>hook({...args,req:{context:{},payload:{find:async()=>({totalDocs:0})}}} as never),/规划状态由系统/);
});

test('HTML结构转换保留表格、合并单元格与文字格式，过滤可执行内容',async()=>{
 const {parseHTML}=await import('linkedom');
 const {documentToContentBody}=await import('../src/lib/html-body');
 const {contentBodyToHtml,contentBodyToPlainText}=await import('../src/lib/content-body');
 const {document}=parseHTML('<html><body><h2>安排</h2><table><tr><th colspan="2">项目</th></tr><tr><td><strong>情侣</strong></td><td>庭院私汤</td></tr></table><script>alert(1)</script><p><a href="javascript:alert(1)">链接</a></p></body></html>');
 const body=documentToContentBody(document as unknown as Document);
 const html=contentBodyToHtml(body);
 assert.match(html,/colspan="2"/);assert.match(html,/<strong>情侣<\/strong>/);assert.match(html,/<h2>安排<\/h2>/);assert.match(contentBodyToPlainText(body),/情侣\t庭院私汤/);assert.doesNotMatch(html,/script|javascript:|alert\(1\)/);
});

test('某篇缺少目标平台任务时不能提前完成',()=>{
 const assets=[{id:1,status:'approved',targetPlatforms:['toutiao','wechat']},{id:2,status:'approved',targetPlatforms:['ctrip']}];
 assert.equal(aggregateContentPlanStatus(assets,[{contentAsset:1,platform:'toutiao',status:'published'},{contentAsset:2,platform:'ctrip',status:'published'}]),'publishing');
 assert.equal(aggregateContentPlanStatus(assets,[{contentAsset:1,platform:'toutiao',status:'published'},{contentAsset:1,platform:'wechat',status:'published'},{contentAsset:2,platform:'ctrip',status:'published'}]),'done');
});

test('真实 DOCX 导入保留表格和合并单元格',async()=>{
 const {createRequire}=await import('node:module');
 const require=createRequire(import.meta.url);
 const JSZip=createRequire(require.resolve('mammoth'))('jszip');
 const zip=new JSZip();
 zip.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
 zip.file('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
 zip.file('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:tbl><w:tblGrid><w:gridCol/><w:gridCol/></w:tblGrid><w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr><w:p><w:r><w:t>出行安排</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>情侣</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>庭院私汤</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>');
 const {extractContentBody}=await import('../src/lib/importers');
 const {contentBodyToHtml}=await import('../src/lib/content-body');
 const result=await extractContentBody('table.docx',await zip.generateAsync({type:'nodebuffer'}));
 const html=contentBodyToHtml(result.body);
 assert.match(html,/<table/); assert.match(html,/colspan="2"/); assert.match(html,/情侣/);assert.match(result.text,/情侣\t庭院私汤/);
});
