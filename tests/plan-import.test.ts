import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes } from "node:crypto";
import * as XLSX from "xlsx";
import { calculatePlanDiff, createPlanTemplate, createPreviewToken, parseLegacyPlanText, parseXlsxV1, verifyPreviewToken, validateDraft, commitPlanImport, type ImportDraft } from "../src/lib/plan-import";

const hash = "a".repeat(64);

function workbook(rows: unknown[][], meta: [string, string | number] = ["geo-daily-plan", 1]) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["key", "value"], ["template_id", meta[0]], ["template_version", meta[1]]]), "_meta");
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["规划日期", "每日主题", "itemKey", "文章分类", "问题", "文章标题", "目标平台", "官网动作/备注"], ...rows]), "规划数据");
  return Buffer.from(XLSX.write(book, { type: "buffer", bookType: "xlsx" }));
}

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return [overrides.date || "2026-10-01", overrides.theme || "主题", overrides.key || "A", overrides.category || "A类·企业号", overrides.question || "问题", overrides.title ?? "标题", overrides.platform || "今日头条", overrides.note || "备注"];
}

test("XLSX v2 模板可被原样识别", () => {
  const draft = parseXlsxV1(createPlanTemplate(), "template.xlsx", hash);
  assert.equal(draft.templateId, "geo-daily-plan");
  assert.equal(draft.templateVersion, 2);
  assert.equal(draft.rows.length, 0);
});

test("XLSX 真日期单元格和日期序列号按业务日期解析", () => {
  const draft = parseXlsxV1(workbook([
    row({ date: new Date(Date.UTC(2026, 9, 1)), key: "A", title: "真日期" }),
    row({ date: 46296, key: "B", category: "B类·综合自媒体", title: "序列号日期" }),
  ]), "dates.xlsx", hash);
  assert.deepEqual(draft.rows.map((item) => item.planDate), ["2026-10-01", "2026-10-01"]);
  assert.equal(draft.errors.length, 0);
});

test("XLSX 拒绝不支持的模板 ID 和版本", () => {
  assert.throws(() => parseXlsxV1(workbook([row()], ["other", 1]), "bad.xlsx", hash), /不支持的模板 ID/);
  assert.throws(() => parseXlsxV1(workbook([row()], ["geo-daily-plan", 3]), "bad.xlsx", hash), /不支持的模板版本/);
});

test("XLSX 校验缺少年份、无效日期、分类、平台、重复键和空标题", () => {
  const draft = parseXlsxV1(workbook([
    row({ date: "9月1日", title: "" }),
    row({ date: "2026-02-30", key: "A" }),
    row({ date: "2026-10-02", key: "A", category: "未知分类", platform: "未知平台" }),
    row({ date: "2026-10-02", key: "A" }),
  ]), "invalid.xlsx", hash);
  assert.ok(draft.errors.some((message) => message.includes("必须是有效的 YYYY-MM-DD")));
  assert.ok(draft.errors.some((message) => message.includes("文章分类")));
  assert.ok(draft.errors.some((message) => message.includes("目标平台")));
  assert.ok(draft.errors.some((message) => message.includes("重复 itemKey")));
  assert.ok(draft.warnings.some((message) => message.includes("占位标题")));
});

test("旧 Markdown 进入同一 ImportDraft 且缺少年份不猜当前年份", () => {
  const draft = parseLegacyPlanText("9月1日 周一｜主题\nA类（企业号）：问题：问题？标题：《标题》", "legacy.md", "md", hash);
  assert.equal(draft.sourceFormat, "md");
  assert.equal(draft.templateId, "geo-daily-plan");
  assert.ok(draft.errors.some((message) => message.includes("缺少年份")));
});

test("预览凭证绑定用户、项目和有效期，篡改即失效", () => {
  const previousSecret = process.env.PAYLOAD_SECRET;
  process.env.PAYLOAD_SECRET = randomBytes(32).toString("hex");
  try {
  const draft: ImportDraft = { templateId: "geo-daily-plan", templateVersion: 1, sourceFormat: "xlsx", sourceFilename: "a.xlsx", sourceHash: hash, rows: [], warnings: [], errors: [] };
  const token = createPreviewToken(draft, 1, 2, 1000);
  assert.deepEqual(verifyPreviewToken(token, 1, 2, 1000), draft);
  const [body, signature] = token.split(".");
  const tampered = `${body}.${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`;
  assert.throws(() => verifyPreviewToken(tampered, 1, 2, 1000), /无效/);
  assert.throws(() => verifyPreviewToken(token, 9, 2, 1000), /用户或项目/);
  assert.throws(() => verifyPreviewToken(token, 1, 2, 1000 + 15 * 60 * 1000 + 1), /过期/);
  } finally {
    if (previousSecret === undefined) delete process.env.PAYLOAD_SECRET;
    else process.env.PAYLOAD_SECRET = previousSecret;
  }
});

test("差异按稳定 itemKey 识别，文案变更为 update 而非 create", async () => {
  const draft: ImportDraft = { templateId: "geo-daily-plan", templateVersion: 1, sourceFormat: "xlsx", sourceFilename: "a.xlsx", sourceHash: hash, rows: [{ sourceLine: 2, planDate: "2099-10-01", dailyTheme: "主题", itemKey: "A", articleCategory: "enterprise", question: "新问题", title: "新标题", targetPlatforms: ["toutiao"], note: "" }], warnings: [], errors: [] };
  const fakePayload = {
    find: async ({ collection }: { collection: string }) => {
      if (collection === "content-plans") return { docs: [{ id: 7, project: 1, planDate: "2099-10-01", dailyTheme: "主题", topic: "主题", title: "主题", platforms: ["toutiao"], note: "" }], totalDocs: 1 };
      if (collection === "content-plan-items") return { docs: [{ id: 8, contentPlan: 7, itemKey: "A", articleCategory: "enterprise", question: "旧问题", title: "旧标题", targetPlatforms: ["toutiao"] }], totalDocs: 1 };
      return { docs: [], totalDocs: 0 };
    },
  } as never;
  const diff = await calculatePlanDiff(fakePayload, 1, draft);
  assert.equal(diff.summary.update, 1);
  assert.equal(diff.summary.create, 0);
  assert.equal(diff.rows[0].itemId, 8);
  assert.deepEqual(diff.rows[0].changes, ["问题", "文章标题"]);
});

test("已有内容资产时修改规划项必须冲突", async () => {
  const draft: ImportDraft = { templateId: "geo-daily-plan", templateVersion: 1, sourceFormat: "xlsx", sourceFilename: "a.xlsx", sourceHash: hash, rows: [{ sourceLine: 2, planDate: "2099-10-01", dailyTheme: "主题", itemKey: "A", articleCategory: "enterprise", question: "问题", title: "新标题", targetPlatforms: ["toutiao"], note: "" }], warnings: [], errors: [] };
  const fakePayload = {
    find: async ({ collection }: { collection: string }) => {
      if (collection === "content-plans") return { docs: [{ id: 7, project: 1, planDate: "2099-10-01", dailyTheme: "主题", topic: "主题", title: "主题", platforms: ["toutiao"], note: "" }], totalDocs: 1 };
      if (collection === "content-plan-items") return { docs: [{ id: 8, contentPlan: 7, itemKey: "A", articleCategory: "enterprise", question: "问题", title: "标题", targetPlatforms: ["toutiao"] }], totalDocs: 1 };
      if (collection === "content-assets") return { docs: [{ id: 9 }], totalDocs: 1 };
      return { docs: [], totalDocs: 0 };
    },
  } as never;
  const diff = await calculatePlanDiff(fakePayload, 1, draft);
  assert.equal(diff.summary.conflict, 1);
  assert.match(diff.rows[0].reason, /已有内容/);
});

test("项目模板绑定：其他项目不能导入", () => {
 const draft=parseXlsxV1(createPlanTemplate({id:33,name:'示例民宿'}),'bound.xlsx',hash);
 assert.equal(draft.projectId,'33');
 const checked=validateDraft({...draft,rows:[{sourceLine:2,planDate:'2099-10-01',dailyTheme:'主题',itemKey:'A',articleCategory:'enterprise',question:'问题',title:'标题',targetPlatforms:['toutiao'],note:''}],errors:[]},{id:94,name:'示例企业'});
 assert.ok(checked.errors.some(e=>e.includes('项目') && e.includes('不一致')));
});

test("当前版本旧哈希键匹配已有规划项，不重复新增", async()=>{
 const draft=parseXlsxV1(workbook([row({date:'2099-10-01'})]),'keys.xlsx',hash);
 const payload={find:async({collection}:{collection:string})=>collection==='content-plans'?{docs:[{id:7,planDate:'2099-10-01',dailyTheme:'主题',title:'主题',note:'备注',platforms:['toutiao']}],totalDocs:1}:collection==='content-plan-items'?{docs:[{id:8,itemKey:'enterprise:oldhash',articleCategory:'enterprise',question:'旧问题',title:'旧标题',targetPlatforms:['toutiao']}],totalDocs:1}:{docs:[],totalDocs:0}} as never;
 const diff=await calculatePlanDiff(payload,1,draft);assert.equal(diff.summary.create,0);assert.equal(diff.rows[0].itemId,8);assert.equal(diff.summary.update,1);
});

test("只上传一个规划项时保留其他规划项的平台", async()=>{
 const draft=parseXlsxV1(workbook([row({date:'2099-10-01',note:'备注'})]),'partial.xlsx',hash);
 const payload={find:async({collection}:{collection:string})=>collection==='content-plans'?{docs:[{id:7,planDate:'2099-10-01',dailyTheme:'主题',title:'主题',note:'备注',platforms:['toutiao','ctrip']}],totalDocs:1}:collection==='content-plan-items'?{docs:[{id:8,itemKey:'A',articleCategory:'enterprise',question:'问题',title:'标题',targetPlatforms:['toutiao']},{id:9,itemKey:'C',articleCategory:'vertical',question:'问题C',title:'标题C',targetPlatforms:['ctrip']}],totalDocs:2}:{docs:[],totalDocs:0}} as never;
 const diff=await calculatePlanDiff(payload,1,draft);assert.equal(diff.summary.unchanged,1);assert.deepEqual(new Set(diff.plans[0].platforms),new Set(['toutiao','ctrip']));
});

test("已有内容的完全相同规划可重复导入为无变化", async()=>{
 const draft=parseXlsxV1(workbook([row({date:'2099-10-01'})]),'same.xlsx',hash);
 const payload={find:async({collection}:{collection:string})=>collection==='content-plans'?{docs:[{id:7,planDate:'2099-10-01',dailyTheme:'主题',title:'主题',note:'备注',platforms:['toutiao']}],totalDocs:1}:collection==='content-plan-items'?{docs:[{id:8,itemKey:'A',articleCategory:'enterprise',question:'问题',title:'标题',targetPlatforms:['toutiao']}],totalDocs:1}:{docs:[{id:9}],totalDocs:1}} as never;
 const diff=await calculatePlanDiff(payload,1,draft);assert.equal(diff.summary.unchanged,1);assert.equal(diff.summary.conflict,0);
});

function workbookV2(rows: unknown[][]) {
 const book=XLSX.read(createPlanTemplate(),{type:'buffer'});
 book.Sheets['规划数据']=XLSX.utils.aoa_to_sheet([['规划日期','每日主题','itemKey','文章分类','问题','文章标题','目标平台','文章执行备注','每日备注'],...rows]);
 return Buffer.from(XLSX.write(book,{type:'buffer',bookType:'xlsx'}));
}

test('v2 支持六种分类和同类多篇，各篇执行备注互不覆盖',()=>{
 const rows=['A','B','C','D','E','F','A'].map((c,index)=>['2099-10-01','共同主题',`${c}${index+1}`,c,`问题${index}`,`标题${index}`,'今日头条',`执行安排${index}`,index===0?'每日共同安排':'']);
 const draft=parseXlsxV1(workbookV2(rows),'six.xlsx',hash);
 assert.equal(draft.errors.length,0);assert.equal(draft.rows.length,7);
 assert.deepEqual(draft.rows.map(r=>r.articleCategory),['enterprise','general','vertical','D','E','F','enterprise']);
 assert.deepEqual(draft.rows.map(r=>r.itemNote),rows.map(r=>r[7]));
 assert.equal(draft.rows[0].note,'每日共同安排');
});

test('旧 v1 不同文章备注自动保留到文章项，不改每日共用备注',()=>{
 const draft=parseXlsxV1(workbook([row({key:'A',note:'企业号动作'}),row({key:'B',category:'B',note:'个人号动作'})]),'old.xlsx',hash);
 assert.equal(draft.errors.length,0);
 assert.deepEqual(draft.rows.map(r=>r.itemNote),['企业号动作','个人号动作']);
 assert.ok(draft.rows.every(r=>r.dailyNoteProvided===false && r.note===''));
 assert.ok(draft.warnings.some(w=>w.includes('v2')));
});

test('每日共用备注仍校验一致，空行不能掩盖冲突',()=>{
 const draft=parseXlsxV1(workbookV2([
 ['2099-10-01','共同主题','A1','A','问题A','标题A','今日头条','A动作','共同备注一'],
 ['2099-10-01','共同主题','B1','B','问题B','标题B','今日头条','B动作',''],
 ['2099-10-01','共同主题','D1','D','问题D','标题D','今日头条','D动作','共同备注二']]),'conflict.xlsx',hash);
 assert.ok(draft.errors.some(e=>e.includes('第 4 行')&&e.includes('备注不一致')));
});

test('v1 分离文章备注时保留已有每日备注，重复导入不新增',async()=>{
 const draft=parseXlsxV1(workbook([row({date:'2099-10-01',note:'A动作'}),row({date:'2099-10-01',key:'D',category:'D',note:'D动作'})]),'legacy.xlsx',hash);
 const payload={find:async({collection}:{collection:string})=>collection==='content-plans'?{docs:[{id:7,planDate:'2099-10-01',dailyTheme:'主题',title:'主题',note:'原每日备注',platforms:['toutiao']}],totalDocs:1}:collection==='content-plan-items'?{docs:[{id:8,itemKey:'A',articleCategory:'enterprise',question:'问题',title:'标题',targetPlatforms:['toutiao'],itemNote:'A动作'},{id:9,itemKey:'D',articleCategory:'D',question:'问题',title:'标题',targetPlatforms:['toutiao'],itemNote:'D动作'}],totalDocs:2}:{docs:[],totalDocs:0}} as never;
 const diff=await calculatePlanDiff(payload,1,draft);
 assert.equal(diff.plans[0].note,'原每日备注');assert.equal(diff.summary.unchanged,2);assert.equal(diff.summary.create,0);
});

function partialFixture() {
 const plan={id:7,planDate:'2099-10-01',dailyTheme:'主题',title:'主题',topic:'主题',note:'原备注',platforms:['toutiao','ctrip']};
 const items=[{id:8,itemKey:'A',articleCategory:'enterprise',question:'问题A',title:'标题A',targetPlatforms:['toutiao'],itemNote:'保留A备注'}, {id:9,itemKey:'C',articleCategory:'vertical',question:'问题C',title:'标题C',targetPlatforms:['ctrip']}];
 const writes:Array<{collection:string;data:Record<string,unknown>}> = [];
 const payload={findByID:async()=>plan,find:async({collection}:{collection:string})=>collection==='content-plans'?{docs:[plan],totalDocs:1}:collection==='content-plan-items'?{docs:items,totalDocs:items.length}:collection==='content-assets'?{docs:[{id:10,contentPlanItem:8,articleCategory:'enterprise',question:'问题A'}],totalDocs:1}:{docs:[],totalDocs:0},update:async(args:{collection:string;data:Record<string,unknown>})=>{writes.push(args);return {id:7,...args.data};},create:async(args:{collection:string;data:Record<string,unknown>})=>{writes.push(args);return {id:11,...args.data};}};
 return {payload:payload as never,writes,plan,items};
}
function partialDraft():ImportDraft {
 return {templateId:'geo-daily-plan',templateVersion:2,sourceFormat:'xlsx',sourceFilename:'partial.xlsx',sourceHash:hash,warnings:[],errors:[],rows:[
 {sourceLine:2,planDate:'2099-10-01',dailyTheme:'主题',itemKey:'A',articleCategory:'enterprise',question:'问题A',title:'试图覆盖A',targetPlatforms:['wechat'],note:''},
 {sourceLine:3,planDate:'2099-10-01',dailyTheme:'主题',itemKey:'B',articleCategory:'general',question:'问题B',title:'标题B',targetPlatforms:['zhihu'],note:''},
 {sourceLine:4,planDate:'2099-10-01',dailyTheme:'主题',itemKey:'F',articleCategory:'F',question:'',title:'坏行',targetPlatforms:['baijiahao'],note:'',error:'问题不能为空'}]};
}

test('逐项跳过已关联 A 和错误 F，同一天 B 可新增且保留未出现 C 平台',async()=>{
 const {payload}=partialFixture(),draft=partialDraft();
 const diff=await calculatePlanDiff(payload,1,draft);
 assert.deepEqual(diff.summary,{create:1,update:0,unchanged:0,conflict:1,error:1});
 assert.deepEqual(new Set(diff.plans[0].platforms),new Set(['toutiao','ctrip','zhihu']));
 assert.equal(diff.plans[0].note,'原备注');assert.equal(diff.plans[0].action,'update');
 assert.equal(validateDraft(draft).blockingErrors?.length,0);
});

test('确认只保存有效 B 和有效平台汇总，跳过项写入清单',async()=>{
 const {payload,writes}=partialFixture(),draft=partialDraft(),diff=await calculatePlanDiff(payload,1,draft);
 const result=await commitPlanImport(payload,{} as never,1,draft,diff,{id:1} as never);
 const itemWrites=writes.filter(w=>w.collection==='content-plan-items');
 assert.equal(itemWrites.length,1);assert.equal(itemWrites[0].data.itemKey,'B');
 assert.equal(result.skipped.length,2);
 assert.ok(!writes.some(w=>w.collection==='content-plan-items'&&w.data.title==='试图覆盖A'));
});

test('当天每日主题不一致跳过全部行，不影响下一天；重复键全部跳过',()=>{
 const draft=partialDraft();draft.rows[1].dailyTheme='另一个主题';
 const checked=validateDraft(draft);assert.ok(checked.rows.every(r=>r.error));assert.equal(checked.blockingErrors?.length,0);
 const duplicate=validateDraft({...partialDraft(),rows:[partialDraft().rows[1],{...partialDraft().rows[1],sourceLine:5}]});assert.ok(duplicate.rows.every(r=>r.error?.includes('重复 itemKey')));
});

test('只有错误行不创建空每日规划，无效日期不执行数据库查询',async()=>{
 const {payload,writes}=partialFixture(),draft=partialDraft();draft.rows=[draft.rows[2]];
 const diff=await calculatePlanDiff(payload,1,draft);assert.equal(diff.plans.length,0);
 await commitPlanImport(payload,{} as never,1,draft,diff,{id:1} as never);
 assert.ok(!writes.some(w=>w.collection==='content-plans'||w.collection==='content-plan-items'));
 const invalid={...draft,rows:[{...draft.rows[0],planDate:''}]};
 await calculatePlanDiff({find:()=>{throw Error('不能查询');}} as never,1,invalid);
});

test('历史日期新增跳过，项目不匹配作为文件级错误禁止保存',async()=>{
 const draft=partialDraft();draft.rows=[{...draft.rows[1],planDate:'2000-01-01'}];
 const diff=await calculatePlanDiff({find:async()=>({docs:[],totalDocs:0})} as never,1,draft);
 assert.equal(diff.summary.conflict,1);assert.equal(diff.plans[0].action,'conflict');
 const invalid=validateDraft({...partialDraft(),projectId:'33'},{id:94,name:'示例企业'});
 assert.equal(invalid.blockingErrors?.length,1);
 await assert.rejects(commitPlanImport({} as never,{} as never,94,invalid,diff,{id:1} as never),/文件级校验失败/);
});

test("v2 可选内容类型列：文章/脚本独立规划且旧模板默认文章", () => {
  const workbook=XLSX.read(createPlanTemplate(),{type:"buffer"});
  const headers=XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets["规划数据"],{header:1})[0];
  assert.equal(headers.at(-1),"内容类型");
  workbook.Sheets["规划数据"]=XLSX.utils.aoa_to_sheet([headers,
    ["2099-01-01","入住","A1","A","如何入住","文章","今日头条","","",""],
    ["2099-01-01","入住","A_VIDEO1","A","如何入住","脚本","抖音,视频号","","","短视频脚本"],
    ["2099-01-01","入住","A_BAD","A","如何入住","非法类型","抖音","","","其他"]]);
  const parsed=parseXlsxV1(Buffer.from(XLSX.write(workbook,{type:"buffer",bookType:"xlsx"})),"混合.xlsx","hash");
  assert.equal(parsed.rows[0].contentType,"article");
  assert.equal(parsed.rows[1].contentType,"video_script");
  assert.deepEqual(parsed.rows[1].targetPlatforms,["douyin","wechat_channels"]);
  assert.ok(parsed.rows[2].error?.includes("内容类型"));
});
