import * as XLSX from "xlsx";
import { createPlanTemplate, parseXlsxV1, calculatePlanDiff, commitPlanImport } from "../src/lib/plan-import";
import { businessTransaction } from "../src/lib/business-transaction";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { getPayload } from "payload";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import config from "../src/payload.config";
import { parseDailyPlanningText } from "../src/lib/importers";
import { ContentBody, contentBodyToHtml, contentBodyToPlainText } from "../src/lib/content-body";
import { filterPublicationTaskGroups, groupPublicationTasks, publicationGroupStatus } from "../src/lib/publication-groups";
import { parseHTML } from "linkedom";
import { businessDate, businessDayRange } from "../src/lib/business-date";

if (!process.env.TEST_BASE_URL || !process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.startsWith("/geo_regression_")) {
  throw new Error("业务回归只允许独立临时数据库，请运行 pnpm test:isolated");
}
const baseUrl = process.env.TEST_BASE_URL;
if (!process.env.SEED_PASSWORD) throw new Error("业务回归需要独立测试密码，请运行 pnpm test:isolated");
const password = process.env.SEED_PASSWORD;
let cookie = "";
let userId: number | string;
let projectId: number | string;
let planId: number | string;
let assetId: number | string;
let temporaryAssetId: number | string;
let reviewPlanId: number | string;
let reviewAssetId: number | string;
let primaryTaskIds: Array<number | string> = [];
const projectIds: Array<number | string> = [];
const planIds: Array<number | string> = [];
const assetIds: Array<number | string> = [];

function dateInBusinessTimezone(offset: number) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date(Date.now() + offset * 24 * 60 * 60 * 1000));
}

function body(text: string) {
  return { root: { type: "root", version: 1, format: "" as const, indent: 0, direction: "ltr" as const, children: [{ type: "paragraph", version: 1, format: "", indent: 0, direction: "ltr", children: [{ type: "text", version: 1, text, mode: "normal", style: "", detail: 0, format: 0 }] }] } };
}

function relationId(value: unknown) {
  return value && typeof value === "object" && "id" in value ? String(value.id) : value == null ? "" : String(value);
}

async function request(path: string, init: RequestInit = {}, authenticated = true) {
  const headers = new Headers(init.headers);
  headers.set("connection", "close");
  if (authenticated && cookie) headers.set("cookie", cookie);
  const response = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(120000), ...init, headers });
  const text = await response.text();
  let data: unknown = text;
  try { data = text ? JSON.parse(text) : {}; } catch { /* keep text */ }
  return { response, data };
}

async function json(path: string, value: unknown, method = "POST") {
  return request(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(value) });
}

function documentOf(data: unknown) {
  if (!data || typeof data !== "object" || !("doc" in data)) throw new Error(`响应缺少 doc：${JSON.stringify(data)}`);
  return (data as { doc: { id: number | string; [key: string]: unknown } }).doc;
}

async function tasksFor(asset: number | string) {
  const result = await request(`/api/publication-tasks?where[contentAsset][equals]=${asset}&limit=20&depth=0`);
  assert.equal(result.response.status, 200);
  assert.equal(typeof result.data, "object");
  return (result.data as { docs: Array<{ id: number | string; platform: string; status: string; platformUrl?: string | null }> }).docs;
}

async function createAsset(title: string, contentPlan?: number | string, targetPlatforms = ["toutiao"]) {
  const result = await json("/api/content-assets", { project: projectId, contentPlan, title, contentType: "article", targetPlatforms, body: body(title), status: "draft", sourceType: "manual" });
  assert.equal(result.response.status, 201);
  const doc = documentOf(result.data);
  assetIds.push(doc.id);
  return doc;
}

before(async () => {
  const result = await fetch(`${baseUrl}/api/users/login`, { method: "POST", headers: { "content-type": "application/json", connection: "close" }, body: JSON.stringify({ username: "admin", password }) });
  assert.equal(result.status, 200, "独立测试服务登录失败");
  const setCookie = result.headers.get("set-cookie");
  assert.ok(setCookie, "登录响应缺少认证 Cookie");
  cookie = setCookie.split(",")[0].split(";")[0];
  const data = await result.json() as { user: { id: number | string } };
  userId = data.user.id;
});

test("AC-01 内容创建", { concurrency: false }, async () => {
  const project = await json("/api/projects", { name: `P0 项目 ${Date.now()}`, startDate: dateInBusinessTimezone(-1), endDate: dateInBusinessTimezone(30), owner: userId, goal: "验证内容交付闭环", description: "P0 自动化回归数据" });
  assert.equal(project.response.status, 201);
  projectId = documentOf(project.data).id;
  projectIds.push(projectId);

  const plan = await json("/api/content-plans", { project: projectId, planDate: dateInBusinessTimezone(3), topic: "P0 主题", title: "P0 规划标题", platforms: ["toutiao", "zhihu", "sohu"], status: "uncreated" });
  assert.equal(plan.response.status, 201);
  planId = documentOf(plan.data).id;
  planIds.push(planId);

  const asset = await createAsset("P0 内容母稿", planId, ["toutiao", "zhihu", "sohu"]);
  assetId = asset.id;
  assert.equal(asset.status, "draft");
  const tasks = await tasksFor(assetId);
  primaryTaskIds = tasks.map((task) => task.id);
  assert.equal(tasks.length, 3);
  assert.ok(tasks.every((task) => task.status === "blocked"));
});

test("AC-02 临时内容", { concurrency: false }, async () => {
  const asset = await createAsset("P0 临时内容");
  temporaryAssetId = asset.id;
  assert.ok(!asset.contentPlan);
  assert.equal(relationId(asset.project), String(projectId));
});

test("AC-03 提交审核", { concurrency: false }, async () => {
  const result = await json(`/api/content-assets/${assetId}/workflow/submit`, {});
  assert.equal(result.response.status, 200);
  assert.equal(documentOf(result.data).status, "reviewing");
});

test("AC-04 审核通过", { concurrency: false }, async () => {
  const result = await json(`/api/content-assets/${assetId}/workflow/approve`, {});
  assert.equal(result.response.status, 200);
  assert.equal(documentOf(result.data).status, "approved");
  const tasks = await tasksFor(assetId);
  assert.ok(tasks.every((task) => task.status === "pending"));
});

test("AC-05 审核驳回可不填写意见", { concurrency: false }, async () => {
  const plan = await json("/api/content-plans", { project: projectId, planDate: dateInBusinessTimezone(4), topic: "驳回主题", title: "驳回规划", platforms: ["toutiao"], status: "uncreated" });
  assert.equal(plan.response.status, 201);
  reviewPlanId = documentOf(plan.data).id;
  planIds.push(reviewPlanId);
  const asset = await createAsset("P0 待驳回内容", reviewPlanId);
  reviewAssetId = asset.id;
  const submitted = await json(`/api/content-assets/${reviewAssetId}/workflow/submit`, {});
  assert.equal(submitted.response.status, 200);
  const rejected = await json(`/api/content-assets/${reviewAssetId}/workflow/reject`, {});
  assert.equal(rejected.response.status, 200);
  assert.equal(documentOf(rejected.data).status, "draft");
});

test("AC-06 已审核且未发布时编辑回草稿", { concurrency: false }, async () => {
  const result = await json(`/api/content-assets/${assetId}`, { title: "P0 内容母稿已修改", body: body("已审核内容被修改") }, "PATCH");
  assert.equal(result.response.status, 200);
  assert.equal(documentOf(result.data).status, "draft");
  const tasks = await tasksFor(assetId);
  assert.ok(tasks.every((task) => task.status === "blocked"));
  assert.equal((await json(`/api/content-assets/${assetId}/workflow/submit`, {})).response.status, 200);
  assert.equal((await json(`/api/content-assets/${assetId}/workflow/approve`, {})).response.status, 200);
});

test("AC-07 已发布后锁定母稿", { concurrency: false }, async () => {
  const asset = await createAsset("P0 已发布锁稿", undefined, ["meipian"]);
  const lockedId = asset.id;
  assert.equal((await json(`/api/content-assets/${lockedId}/workflow/submit`, {})).response.status, 200);
  assert.equal((await json(`/api/content-assets/${lockedId}/workflow/approve`, {})).response.status, 200);
  const task = (await tasksFor(lockedId))[0];
  assert.equal((await json(`/api/publication-tasks/${task.id}/confirm`, { publishedUrl: "https://example.com/p0-locked" })).response.status, 200);
  const edited = await json(`/api/content-assets/${lockedId}`, { title: "不应被保存" }, "PATCH");
  assert.notEqual(edited.response.status, 200);
});

test("AC-08 去发布不改变任务状态", { concurrency: false }, async () => {
  const tasks = await tasksFor(assetId);
  const pending = tasks.find((task) => task.status === "pending");
  assert.ok(pending);
  assert.ok(pending.platformUrl?.startsWith("http"));
  const result = await request(`/api/publication-tasks/${pending.id}`);
  assert.equal(result.response.status, 200);
  assert.equal((result.data as { status: string }).status, "pending");
});

test("AC-09 标记已发布记录服务器时间", { concurrency: false }, async () => {
  const task = (await tasksFor(assetId)).find((item) => item.status === "pending");
  assert.ok(task);
  const result = await json(`/api/publication-tasks/${task.id}/confirm`, { publishedUrl: "https://example.com/p0-primary-1" });
  assert.equal(result.response.status, 200);
  const published = documentOf(result.data);
  assert.equal(published.status, "published");
  assert.ok(published.publishedAt);
});

test("AC-10 多平台独立进度", { concurrency: false }, async () => {
  const tasks = await tasksFor(assetId);
  assert.equal(tasks.filter((task) => task.status === "published").length, 1);
  assert.equal(tasks.filter((task) => task.status === "pending").length, 2);
});

test("AC-10b 发布任务按文章分组且筛选保留整组", { concurrency: false }, () => {
  const tasks = [
    { id: 1, contentAsset: { id: 88, title: "太空舱与温泉房", articleCategory: "enterprise", plannedPublishDate: "2026-09-01" }, platform: "toutiao", status: "published" },
    { id: 2, contentAsset: { id: 88, title: "太空舱与温泉房", articleCategory: "enterprise", plannedPublishDate: "2026-09-01" }, platform: "baijiahao", status: "pending" },
    { id: 3, contentAsset: { id: 88, title: "太空舱与温泉房", articleCategory: "enterprise", plannedPublishDate: "2026-09-01" }, platform: "zhihu", status: "pending" },
  ];
  const groups = groupPublicationTasks(tasks);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].tasks.length, 3);
  assert.equal(groups[0].asset?.title, "太空舱与温泉房");
  assert.equal(publicationGroupStatus(groups[0].tasks), "publishing");
  assert.equal(groups[0].tasks.filter((task) => task.status === "published").length, 1);
  assert.equal(filterPublicationTaskGroups(groups, "温泉房", "pending").length, 1);
  assert.equal(filterPublicationTaskGroups(groups, "不存在", "all").length, 0);
});

test("AC-10c 正文兼容 Markdown 和真实 Lexical 节点且不执行 HTML", { concurrency: false }, () => {
  const markdownBody = { root: { children: [
    { type: "paragraph", children: [{ type: "text", text: "# 首行标题" }] },
    { type: "paragraph", children: [] },
    { type: "paragraph", children: [{ type: "text", text: "## 常见问题" }] },
    { type: "paragraph", children: [{ type: "text", text: "**加粗** 和 *斜体*" }] },
    { type: "paragraph", children: [{ type: "text", text: "- 第一项" }] },
    { type: "paragraph", children: [{ type: "text", text: "- 第二项" }] },
    { type: "paragraph", children: [{ type: "text", text: "<script>alert(1)</script>" }] },
  ] } };
  const markdownMarkup = renderToStaticMarkup(createElement(ContentBody, { body: markdownBody }));
  assert.match(markdownMarkup, /<h1>首行标题<\/h1>/);
  assert.match(markdownMarkup, /<h2>常见问题<\/h2>/);
  assert.match(markdownMarkup, /<strong>加粗<\/strong>/);
  assert.match(markdownMarkup, /<em>斜体<\/em>/);
  assert.match(markdownMarkup, /<ul><li>第一项<\/li><li>第二项<\/li><\/ul>/);
  assert.doesNotMatch(markdownMarkup, /<script>/);
  assert.match(markdownMarkup, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  const plainText = contentBodyToPlainText(markdownBody);
  assert.match(plainText, /首行标题/);
  assert.match(plainText, /第一项/);
  assert.doesNotMatch(plainText, /\*\*|^#/m);

  const lexicalBody = { root: { children: [
    { type: "heading", tag: "h3", children: [{ type: "text", text: "真实 Lexical 标题" }] },
    { type: "list", listType: "bullet", children: [{ type: "listitem", children: [{ type: "text", text: "真实 Lexical 列表" }] }] },
    { type: "quote", children: [{ type: "text", text: "真实引用" }] },
    { type: "paragraph", children: [{ type: "text", text: "真实加粗", format: 1 }] },
    { type: "paragraph", children: [{ type: "link", url: "https://example.com", children: [{ type: "text", text: "安全链接" }] }] },
  ] } };
  const lexicalMarkup = renderToStaticMarkup(createElement(ContentBody, { body: lexicalBody }));
  assert.match(lexicalMarkup, /<h3>真实 Lexical 标题<\/h3>/);
  assert.match(lexicalMarkup, /<ul><li>真实 Lexical 列表<\/li><\/ul>/);
  assert.match(lexicalMarkup, /<blockquote>真实引用<\/blockquote>/);
  assert.match(lexicalMarkup, /<strong>真实加粗<\/strong>/);
  assert.match(lexicalMarkup, /href="https:\/\/example.com"/);
});

test("AC-10d 发布任务文章级操作只显示一次并使用正文富文本", { concurrency: false }, async () => {
  const bodyValue = { root: { children: [
    { type: "paragraph", children: [{ type: "text", text: "## 正文首行" }] },
    { type: "paragraph", children: [{ type: "text", text: "**正文加粗**" }] },
    { type: "paragraph", children: [{ type: "text", text: "- 正文列表" }] },
  ] } };
  const result = await request(`/publications?asset=${assetId}`);
  assert.equal(result.response.status, 200);
  const {document} = parseHTML(String(result.data));
  const buttons = Array.from(document.querySelectorAll("button"));
  assert.equal(buttons.filter(b=>b.textContent === "复制标题").length, 1);
  assert.equal(buttons.filter(b=>b.textContent === "复制正文").length, 1);
  assert.equal(document.querySelectorAll(`a[href="/content-management/detail/${assetId}"]`).length, 1);

  const html = contentBodyToHtml(bodyValue);
  assert.match(html, /<h2>正文首行<\/h2>/);
  assert.match(html, /<strong>正文加粗<\/strong>/);
  assert.match(html, /<ul><li>正文列表<\/li><\/ul>/);
  assert.doesNotMatch(html, /##|\*\*|^- /m);
});

test("AC-11 无发布记录的内容可软删除", { concurrency: false }, async () => {
  const result = await request(`/api/content-assets/${temporaryAssetId}/soft-delete`, { method: "POST" });
  assert.equal(result.response.status, 200);
  const list = await request(`/api/content-assets?where[id][equals]=${temporaryAssetId}`);
  assert.equal(list.response.status, 200);
  assert.equal((list.data as { totalDocs: number }).totalDocs, 0);
});

test("AC-11b 发布任务页隐藏已软删除内容的幽灵任务", { concurrency: false }, async () => {
  const page = await request("/publications");
  assert.equal(page.response.status, 200);
  assert.doesNotMatch(String(page.data), /P0 临时内容/);
});

test("AC-12 有发布记录的内容禁止删除", { concurrency: false }, async () => {
  const result = await request(`/api/content-assets/${assetId}/soft-delete`, { method: "POST" });
  assert.equal(result.response.status, 409);
  const asset = await request(`/api/content-assets/${assetId}`);
  assert.equal(asset.response.status, 200);
});

test("AC-13 内容导入先解析预览", { concurrency: false }, async () => {
  const source = `# P0 导入标题\n\n这是导入正文。\n\n${"这是超过预览窗口的完整正文尾部。".repeat(500)}`;
  const form = new FormData();
  form.append("file", new File([source], "p0-content.md", { type: "text/markdown" }));
  const result = await request("/api/import/content/preview", { method: "POST", body: form });
  assert.equal(result.response.status, 200);
  const data = result.data as { title: string; text: string };
  assert.equal(data.title, "P0 导入标题");
  assert.equal(data.text, source);
  assert.ok(data.text.length > 2000);
});

test("AC-14 单文件只生成一个内容资产", { concurrency: false }, async () => {
  const form = new FormData();
  form.append("file", new File(["# P0 单文件资产\n\n章节一\n\n章节二"], "p0-single.md", { type: "text/markdown" }));
  const preview = await request("/api/import/content/preview", { method: "POST", body: form });
  assert.equal(preview.response.status, 200);
  const data = preview.data as { filename: string; title: string; text: string };
  const result = await json("/api/import/content/confirm", { project: projectId, title: data.title, sourceFilename: data.filename, text: data.text, targetPlatforms: ["toutiao"], plannedPublishDate: "2026-09-15" });
  assert.equal(result.response.status, 201);
  const imported = documentOf(result.data);
  assetIds.push(imported.id);
  assert.equal(imported.sourceType, "import");
  assert.equal(businessDate(String(imported.plannedPublishDate)), "2026-09-15");
  const list = await request(`/api/content-assets?where[id][equals]=${imported.id}`);
  assert.equal(list.response.status, 200);
  assert.equal((list.data as { totalDocs: number }).totalDocs, 1);
});

test("AC-14b 内容导入拒绝失效项目并返回明确错误", { concurrency: false }, async () => {
  const result = await json("/api/import/content/confirm", { project: "999999", sourceFilename: "invalid-project.md", text: "正文", targetPlatforms: ["toutiao"] });
  assert.equal(result.response.status, 400);
  assert.match(String((result.data as { message?: string }).message), /项目不存在或无权访问/);
});

test("AC-15 解析失败可提示并重试", { concurrency: false }, async () => {
  const form = new FormData();
  form.append("file", new File(["not supported"], "p0.txt", { type: "text/plain" }));
  const result = await request("/api/import/content/preview", { method: "POST", body: form });
  assert.equal(result.response.status, 400);
});

test("AC-16 历史日期规划不可编辑", { concurrency: false }, async () => {
  const future = await json("/api/content-plans", { project: projectId, planDate: dateInBusinessTimezone(5), topic: "历史规划测试", title: "历史规划测试", platforms: ["toutiao"], status: "uncreated" });
  assert.equal(future.response.status, 201);
  const historical = documentOf(future.data).id;
  planIds.push(historical);
  const result = await json(`/api/content-plans/${historical}`, { planDate: dateInBusinessTimezone(-1), title: "不应修改" }, "PATCH");
  assert.notEqual(result.response.status, 200);
});

test("AC-17 今天及未来且未创建内容的规划可编辑", { concurrency: false }, async () => {
  const created = await json("/api/content-plans", { project: projectId, planDate: dateInBusinessTimezone(6), topic: "可编辑主题", title: "可编辑规划", platforms: ["toutiao"], status: "uncreated" });
  assert.equal(created.response.status, 201);
  const id = documentOf(created.data).id;
  planIds.push(id);
  const updated = await json(`/api/content-plans/${id}`, { topic: "已编辑主题" }, "PATCH");
  assert.equal(updated.response.status, 200);
  assert.equal(documentOf(updated.data).topic, "已编辑主题");
});

test("AC-18 已创建内容的规划锁定核心字段", { concurrency: false }, async () => {
  const result = await json(`/api/content-plans/${planId}`, { title: "不应修改" }, "PATCH");
  assert.notEqual(result.response.status, 200);
});

test("AC-19 从规划创建内容会建立关联", { concurrency: false }, async () => {
  const plan = await json("/api/content-plans", { project: projectId, planDate: dateInBusinessTimezone(7), topic: "关联创建主题", title: "关联创建规划", platforms: ["zhihu"] });
  assert.equal(plan.response.status, 201);
  const id = documentOf(plan.data).id;
  planIds.push(id);
  const asset = await createAsset("从规划创建的内容", id, ["zhihu"]);
  assert.equal(relationId(asset.contentPlan), String(id));
});

test("AC-20 关联草稿或审核中内容的规划为待审核", { concurrency: false }, async () => {
  const result = await request(`/api/content-plans/${reviewPlanId}`);
  assert.equal(result.response.status, 200);
  assert.equal((result.data as { status: string }).status, "pending_review");
});

test("AC-21 部分平台已发布时规划为发布中", { concurrency: false }, async () => {
  const result = await request(`/api/content-plans/${planId}`);
  assert.equal(result.response.status, 200);
  assert.equal((result.data as { status: string }).status, "publishing");
});

test("AC-22 空项目允许删除", { concurrency: false }, async () => {
  const created = await json("/api/projects", { name: `P0 空项目 ${Date.now()}`, startDate: dateInBusinessTimezone(0), endDate: dateInBusinessTimezone(10), owner: userId, goal: "空项目删除", description: "用于验证空项目删除规则" });
  assert.equal(created.response.status, 201);
  const id = documentOf(created.data).id;
  projectIds.push(id);
  const deleted = await request(`/api/projects/${id}`, { method: "DELETE" });
  assert.equal(deleted.response.status, 200);
});

test("AC-23 有内容资产的项目禁止删除", { concurrency: false }, async () => {
  const result = await request(`/api/projects/${projectId}`, { method: "DELETE" });
  assert.notEqual(result.response.status, 200);
});

test("AC-24 规划导入解析并确认新增", { concurrency: false }, async () => {
  const form = new FormData();
  form.append("project", String(projectId));
  form.append("file", new File([`| 日期 | 主题 | 标题 |\n| --- | --- | --- |\n| ${dateInBusinessTimezone(8)} | 导入主题 | 导入规划一 |\n| ${dateInBusinessTimezone(9)} | 导入主题 | 导入规划二 |`], "p0-plans.md", { type: "text/markdown" }));
  const preview = await request("/api/import/plans/preview", { method: "POST", body: form });
  assert.equal(preview.response.status, 200);
  const rows = (preview.data as { rows: Array<unknown> }).rows;
  assert.equal(rows.length, 2);
  const result = await json("/api/import/plans/confirm", { project: projectId, previewToken: (preview.data as { previewToken: string }).previewToken });
  assert.equal(result.response.status, 201);
  const docs = (result.data as { docs: Array<{ id: number | string }> }).docs;
  assert.equal(docs.length, 2);
  planIds.push(...docs.map((doc) => doc.id));
});

test("AC-25 重复规划导入复用同一天规划", { concurrency: false }, async () => {
  const form = new FormData(); form.append("project", String(projectId));
  form.append("file", new File([`| 日期 | 主题 | 标题 |\n| --- | --- | --- |\n| ${dateInBusinessTimezone(10)} | 重复主题 | 重复标题 |`], "repeat.md"));
  const preview = await request("/api/import/plans/preview", { method: "POST", body: form });
  assert.equal(preview.response.status, 200);
  const token = (preview.data as { previewToken: string }).previewToken;
  const first = await json("/api/import/plans/confirm", { project: projectId, previewToken: token });
  const second = await json("/api/import/plans/confirm", { project: projectId, previewToken: token });
  assert.equal(first.response.status, 201, JSON.stringify(first.data));
  assert.equal(second.response.status, 201, JSON.stringify(second.data));
  const firstDocs = (first.data as { docs: Array<{ id: number | string }> }).docs;
  planIds.push(firstDocs[0].id);
  assert.equal((second.data as { summary: { unchanged: number; create: number } }).summary.unchanged, 1);
  assert.equal((second.data as { summary: { create: number } }).summary.create, 0);
});

test("AC-27 同一天三篇文章独立审核和发布任务", { concurrency: false }, async () => {
  const createdPlan = await json("/api/content-plans", { project: projectId, planDate: dateInBusinessTimezone(11), topic: "三类内容日", dailyTheme: "三类内容日", title: "三类内容日", platforms: ["toutiao", "wechat", "ctrip"] });
  assert.equal(createdPlan.response.status, 201);
  const multiPlanId = documentOf(createdPlan.data).id;
  planIds.push(multiPlanId);
  const categories = ["enterprise", "general", "vertical"];
  const multiAssets = [];
  for (const [index, category] of categories.entries()) {
    const result = await json("/api/content-assets", { project: projectId, contentPlan: multiPlanId, articleCategory: category, title: `三类文章 ${category}`, contentType: "article", targetPlatforms: ["toutiao"], body: body(`三类文章 ${index}`), status: "draft", sourceType: "manual" });
    assert.equal(result.response.status, 201);
    const asset = documentOf(result.data);
    assetIds.push(asset.id);
    multiAssets.push(asset);
  }
  const linked = await request(`/api/content-assets?where[contentPlan][equals]=${multiPlanId}&limit=10&depth=0`);
  assert.equal(linked.response.status, 200);
  assert.equal((linked.data as { totalDocs: number }).totalDocs, 3);
  assert.deepEqual(new Set((linked.data as { docs: Array<{ articleCategory: string }> }).docs.map((asset) => asset.articleCategory)), new Set(categories));
  const taskIds = [];
  for (const asset of multiAssets) {
    const tasks = await tasksFor(asset.id);
    assert.equal(tasks.length, 1);
    taskIds.push(tasks[0].id);
  }
  assert.equal(new Set(taskIds.map(String)).size, 3);
  assert.equal((await json(`/api/content-assets/${multiAssets[0].id}/workflow/submit`, {})).response.status, 200);
  assert.equal((await json(`/api/content-assets/${multiAssets[0].id}/workflow/approve`, {})).response.status, 200);
  assert.equal((await request(`/api/content-assets/${multiAssets[1].id}`)).response.status, 200);
  assert.equal(((await request(`/api/content-assets/${multiAssets[1].id}`)).data as { status: string }).status, "draft");
  assert.equal(((await request(`/api/content-plans/${multiPlanId}`)).data as { status: string }).status, "pending_review");
  for (const asset of multiAssets.slice(1)) {
    assert.equal((await json(`/api/content-assets/${asset.id}/workflow/submit`, {})).response.status, 200);
    assert.equal((await json(`/api/content-assets/${asset.id}/workflow/approve`, {})).response.status, 200);
  }
  assert.equal(((await request(`/api/content-plans/${multiPlanId}`)).data as { status: string }).status, "pending_publish");
  assert.equal((await json(`/api/publication-tasks/${taskIds[0]}/confirm`, { publishedUrl: "https://example.com/p0-multi-1" })).response.status, 200);
  assert.equal(((await request(`/api/content-plans/${multiPlanId}`)).data as { status: string }).status, "publishing");
  for (const [index, taskId] of taskIds.slice(1).entries()) assert.equal((await json(`/api/publication-tasks/${taskId}/confirm`, { publishedUrl: `https://example.com/p0-multi-${index + 2}` })).response.status, 200);
  assert.equal(((await request(`/api/content-plans/${multiPlanId}`)).data as { status: string }).status, "done");
});

test("AC-28 每日规划导入按日期保存 7 规划 21 规划项且不创建内容资产", { concurrency: false }, async () => {
  const source = Array.from({ length: 7 }, (_, index) => {
    const date = dateInBusinessTimezone(12 + index);
    const [, , month, day] = date.match(/^(\d{4})-(\d{2})-(\d{2})$/)!;
    return `${Number(month)}月${Number(day)}日 周一｜每日主题 ${index + 1}\nA类（企业号）：问题：A问题${index + 1}？标题：《A标题${index + 1}》。重点：A重点${index + 1}\nB类（综合）：问题：B问题${index + 1}？标题：《B标题${index + 1}》。重点：B重点${index + 1}\nC类（垂直）：问题：C问题${index + 1}？标题：《C标题${index + 1}》。重点：C重点${index + 1}\n官网动作：动作${index + 1}`;
  }).join("\n\n");
  const parsed = parseDailyPlanningText(`每日发布规划（2026年）\n${source}`);
  assert.equal(parsed?.length, 7);
  assert.ok(parsed?.every((plan) => plan.articles.length === 3));
  assert.ok(parsed?.every((plan) => plan.articles.every((article) => !("contentFocus" in article))));
  const form = new FormData();
  form.append("project", String(projectId));
  form.append("file", new File([`每日发布规划（${new Date().getFullYear()}年）\n${source}`], "p0-daily.md", { type: "text/markdown" }));
  const preview = await request("/api/import/plans/preview", { method: "POST", body: form });
  assert.equal(preview.response.status, 200);
  const previewData = preview.data as { plans: unknown[]; rows: unknown[]; previewToken: string };
  assert.equal(previewData.plans.length, 7);
  assert.equal(previewData.rows.length, 21);
  const confirmed = await json("/api/import/plans/confirm", { project: projectId, previewToken: previewData.previewToken });
  assert.equal(confirmed.response.status, 201, JSON.stringify(confirmed.data));
  const result = confirmed.data as { summary: { create: number }; docs: Array<{ id: number | string }>; items: Array<{ id: number | string; contentPlan: number | string; articleCategory: string }> };
  assert.equal(result.docs.length, 7);
  assert.equal(result.summary.create, 21);
  planIds.push(...result.docs.map((plan) => plan.id));
  assert.equal(result.items.length, 21);
  assert.deepEqual(new Set(result.items.map((item) => item.articleCategory)), new Set(["enterprise", "general", "vertical"]));
  const planIdSet = new Set(result.docs.map((plan) => String(plan.id)));
  assert.ok(result.items.every((item) => planIdSet.has(relationId(item.contentPlan))));
  const importedAssets = await request(`/api/content-assets?where[project][equals]=${projectId}&limit=1000`);
  assert.equal(importedAssets.response.status, 200);
  const importedAssetData = importedAssets.data as { docs: Array<{ sourceFilename?: string }> };
  assert.equal(importedAssetData.docs.filter((asset) => asset.sourceFilename === "p0-daily.md").length, 0);
});

test("AC-28b 每日规划空标题使用待补充标题且仍可导入", { concurrency: false }, () => {
  const parsed = parseDailyPlanningText(`每日发布规划（2026年）
9月1日 周二｜太空舱与温泉房对比
A类（企业号）：问题：太空舱和普通温泉房有什么区别？标题：《 》。重点：说明房型差异
B类（综合）：问题：龙门度假住哪种房？标题：《龙门度假房型选择》。重点：给出选择建议
C类（垂直）：问题：第一次住太空舱注意什么？标题：《第一次住太空舱》。重点：列出入住提醒`);
  assert.equal(parsed?.length, 1);
  assert.equal(parsed?.[0].articles.length, 3);
  assert.equal(parsed?.[0].articles[0].title, "待补充标题：太空舱和普通温泉房有什么区别？");
  assert.equal(parsed?.[0].articles[0].category, "enterprise");
});

test("AC-28c Markdown 日期标题和无预设标题可解析", { concurrency: false }, () => {
  const parsed = parseDailyPlanningText(`每日发布规划（2026年）
### 9月7日 周一｜房态、消费与拍照场景
A类（企业号，提示词5）：问题：本周惠州龙门星空私汤民宿有空房吗？重点：说明房态查询方式
B类（综合，提示词2）：问题：龙门带私汤入户的高端民宿人均消费多少？重点：说明消费构成
C类（垂直，提示词6+携程风）：问题：惠州龙门山林民宿拍照出片机位怎么选？重点：说明拍照机位`);
  assert.equal(parsed?.length, 1);
  assert.deepEqual(parsed?.[0].articles.map((article) => article.category), ["enterprise", "general", "vertical"]);
  assert.equal(parsed?.[0].articles[0].title, "待补充标题：本周惠州龙门星空私汤民宿有空房吗？");
  assert.deepEqual(parsed?.[0].articles[1].targetPlatforms, ["toutiao", "wechat", "zhihu"]);
  assert.deepEqual(parsed?.[0].articles[2].targetPlatforms, ["ctrip", "meipian"]);
});

test("AC-29 旧规划反向单值关系仍可聚合读取", { concurrency: false }, async () => {
  const createdPlan = await json("/api/content-plans", { project: projectId, planDate: dateInBusinessTimezone(20), topic: "旧关系规划", title: "旧关系规划", platforms: ["toutiao"] });
  assert.equal(createdPlan.response.status, 201);
  const legacyPlanId = documentOf(createdPlan.data).id;
  planIds.push(legacyPlanId);
  const asset = await createAsset("旧关系文章");
  const payload = await getPayload({ config });
  await payload.update({ collection: "content-plans", id: Number(legacyPlanId), data: { contentAsset: Number(asset.id) }, overrideAccess: true, context: { businessAction: "system" } });
  const { refreshContentPlanStatus } = await import("../src/lib/content-workflow");
  await refreshContentPlanStatus(payload, legacyPlanId);
  const result = await request(`/api/content-plans/${legacyPlanId}`);
  assert.equal(result.response.status, 200);
  assert.equal((result.data as { status: string }).status, "pending_review");
});

test("AC-26 看板聚合基于数据库状态", { concurrency: false }, async () => {
  const dashboard = await request("/");
  assert.equal(dashboard.response.status, 200);
  assert.match(String(dashboard.data), /今日待发布/);
  assert.match(String(dashboard.data), /近 7 天发布趋势/);
  const stats = await request("/stats");
  assert.equal(stats.response.status, 200);
  assert.match(String(stats.data), /平台发布任务/);
});

test("AC-30 规划日期倒序且看板同日多项目分别展示", { concurrency: false }, async () => {
  const fixtures: Array<{ project: number | string; plan: number | string; articles: number; item?: number | string }> = [];
  for (let index = 0; index < 7; index += 1) {
    const createdProject = await json("/api/projects", { name: `P0 同日项目 ${Date.now()}-${index}`, startDate: dateInBusinessTimezone(0), endDate: dateInBusinessTimezone(30), owner: userId, goal: "验证同日多项目规划", description: "看板分组回归数据" });
    assert.equal(createdProject.response.status, 201);
    const project = documentOf(createdProject.data).id;
    projectIds.push(project);
    const createdPlan = await json("/api/content-plans", { project, planDate: dateInBusinessTimezone(0), topic: `同日主题 ${index}`, title: `同日规划 ${index}`, platforms: ["toutiao"] });
    assert.equal(createdPlan.response.status, 201);
    const plan = documentOf(createdPlan.data).id;
    planIds.push(plan);
    let firstItem: number | string | undefined;
    for (let item = 0; item <= index; item += 1) {
      const createdItem = await json("/api/content-plan-items", { contentPlan: plan, articleCategory: "enterprise", question: `项目 ${index} 问题 ${item}`, title: `项目 ${index} 文章 ${item}`, targetPlatforms: ["toutiao"], sortOrder: item });
      assert.equal(createdItem.response.status, 201);
      if (item === 0) firstItem = documentOf(createdItem.data).id;
    }
    fixtures.push({ project, plan, articles: index + 1, item: firstItem });
  }
  const first = fixtures[0];
  const draft = await json("/api/content-assets", { project: first.project, contentPlan: first.plan, contentPlanItem: first.item, title: "同日项目独立草稿", contentType: "article", targetPlatforms: ["toutiao"], body: body("独立项目文章"), status: "draft", sourceType: "manual" });
  assert.equal(draft.response.status, 201);
  assetIds.push(documentOf(draft.data).id);
  for (let offset = 1; offset <= 8; offset += 1) {
    const created = await json("/api/content-plans", { project: first.project, planDate: dateInBusinessTimezone(offset), topic: `倒序日期 ${offset}`, title: `倒序规划 ${offset}`, platforms: ["toutiao"] });
    assert.equal(created.response.status, 201);
    planIds.push(documentOf(created.data).id);
  }

  const dashboard = await request("/dashboard");
  assert.equal(dashboard.response.status, 200);
  const weeklyTable = String(dashboard.data).replace(/<!--.*?-->/g, "").split("本周项目规划")[1]?.split("</table>")[0] || "";
  const weeklyRows = weeklyTable.match(/<tr[^>]*>.*?<\/tr>/g) || [];
  for (const fixture of fixtures) {
    const href = `/project-management/detail/${fixture.project}/plan/${fixture.plan}`;
    const matches = weeklyRows.filter((row) => row.includes(`href="${href}"`));
    assert.equal(matches.length, 1, `项目 ${fixture.project} 的同日规划应单独显示`);
    assert.ok(matches[0].includes(`<td>${fixture.articles} 篇</td>`), "文章数量不能跨项目合并");
    assert.ok(matches[0].includes(fixture === first ? "待审核" : "未创建"), "内容状态不能跨项目合并");
    assert.ok(matches[0].includes(fixture === first ? "0/1" : "0/0"), "发布进度不能跨项目合并");
  }
  const weeklyDates = weeklyRows.flatMap((row) => Array.from(row.matchAll(/<td>(\d{2}\/\d{2})<\/td>/g), (match) => match[1]));
  assert.deepEqual(weeklyDates, [...weeklyDates].sort().reverse());
  for (const [query, expectedCount] of [["", 8], ["?plans=all", 9]] as const) {
    const detail = await request(`/project-management/detail/${first.project}${query}`);
    assert.equal(detail.response.status, 200);
    const table = String(detail.data).split('id="daily-plans"')[1]?.split("</table>")[0] || "";
    const dates = Array.from(table.matchAll(/<td>(\d{4}-\d{2}-\d{2})<\/td>/g), (match) => match[1]);
    assert.equal(dates.length, expectedCount);
    assert.equal(dates[0], dateInBusinessTimezone(8));
    assert.deepEqual(dates, [...dates].sort().reverse());
  }
});

after(async () => {
  const payload = await getPayload({ config });
  for (const project of projectIds) {
    const assets = await payload.find({ collection: "content-assets", where: { project: { equals: project } }, limit: 1000, overrideAccess: true });
    for (const asset of assets.docs) {
      const tasks = await payload.find({ collection: "publication-tasks", where: { contentAsset: { equals: asset.id } }, limit: 100, overrideAccess: true });
      for (const task of tasks.docs) await payload.delete({ collection: "publication-tasks", id: task.id, overrideAccess: true });
      const audits = await payload.find({ collection: "audit-records", where: { contentAsset: { equals: asset.id } }, limit: 100, overrideAccess: true });
      for (const audit of audits.docs) await payload.delete({ collection: "audit-records", id: audit.id, overrideAccess: true });
      await payload.delete({ collection: "content-assets", id: asset.id, overrideAccess: true });
    }
    const plans = await payload.find({ collection: "content-plans", where: { project: { equals: project } }, limit: 1000, overrideAccess: true });
    const items = await payload.find({ collection: "content-plan-items", where: { contentPlan: { in: plans.docs.map((plan) => plan.id) } }, limit: 5000, overrideAccess: true });
    for (const item of items.docs) await payload.delete({ collection: "content-plan-items", id: item.id, overrideAccess: true });
    for (const plan of plans.docs) await payload.delete({ collection: "content-plans", id: plan.id, overrideAccess: true });
    const batches = await payload.find({ collection: "plan-import-batches", where: { project: { equals: project } }, pagination: false, overrideAccess: true });
    for (const batch of batches.docs) await payload.delete({ collection: "plan-import-batches", id: batch.id, overrideAccess: true });
    const existing = await payload.find({ collection: "projects", where: { id: { equals: project } }, limit: 1, overrideAccess: true });
    if (existing.totalDocs > 0) await payload.delete({ collection: "projects", id: project, overrideAccess: true });
  }
  await payload.destroy();
  const adapter = payload.db as unknown as { pool?: { _clients?: Array<{ release: () => void }>; _idle?: Array<{ client: { release: () => void } }>; end: () => Promise<void> } };
  if (adapter.pool) {
    const idleClients = new Set((adapter.pool._idle || []).map((item) => item.client));
    for (const client of adapter.pool._clients || []) if (!idleClients.has(client)) client.release();
    await adapter.pool.end();
  }
  const activeHandles = (process as unknown as { _getActiveHandles: () => unknown[] })._getActiveHandles();
  for (const handle of activeHandles) {
    const socket = handle as { remotePort?: number; destroy?: () => void };
    if (socket.remotePort === Number(new URL(baseUrl).port)) socket.destroy?.();
  }
});

test("AC-31 规划项逐条建稿、拒绝重复和同步撤销的平台任务", {concurrency:false}, async()=>{
 const plan=documentOf((await json('/api/content-plans',{project:projectId,planDate:dateInBusinessTimezone(40),topic:'逐条交付',title:'逐条交付',platforms:['toutiao','baijiahao']})).data);planIds.push(plan.id);
 const first=documentOf((await json('/api/content-plan-items',{contentPlan:plan.id,articleCategory:'general',question:'第一条问题',title:'第一条',targetPlatforms:['toutiao','baijiahao']})).data);
 const second=documentOf((await json('/api/content-plan-items',{contentPlan:plan.id,articleCategory:'vertical',question:'第二条问题',title:'第二条',targetPlatforms:['ctrip']})).data);
 const fields={project:projectId,contentPlan:plan.id,contentPlanItem:first.id,title:'第一条',articleCategory:'general',question:'第一条问题',targetPlatforms:['toutiao','baijiahao'],body:body('完整正文')};
 const created=await json('/api/content-assets',fields);assert.equal(created.response.status,201);const asset=documentOf(created.data);assetIds.push(asset.id);
 const planResult=(await request(`/api/content-plans/${plan.id}`)).data as {status:string};assert.equal(planResult.status,'creating');
 const detail=await request(`/project-management/detail/${projectId}/plan/${plan.id}`);assert.equal(detail.response.status,200);assert.match(String(detail.data),/第二条问题/);assert.match(String(detail.data),new RegExp(`item=${second.id}`));
 const duplicate=await json('/api/content-assets',fields);assert.equal(duplicate.response.status,409);
 const changed=await json(`/api/content-assets/${asset.id}`,{targetPlatforms:['toutiao']},'PATCH');assert.equal(changed.response.status,200);
 const tasks=await request(`/api/publication-tasks?where[contentAsset][equals]=${asset.id}&depth=0`);const docs=(tasks.data as {docs:Array<{platform:string}>}).docs;assert.deepEqual(docs.map(t=>t.platform),['toutiao']);
 const restored=await json(`/api/content-assets/${asset.id}`,{targetPlatforms:['toutiao','baijiahao']},'PATCH');assert.equal(restored.response.status,200);
 const tasks2=await request(`/api/publication-tasks?where[contentAsset][equals]=${asset.id}&depth=0`);assert.equal((tasks2.data as {docs:unknown[]}).docs.length,2);
});

test("AC-32 规划导入跳过后续冲突并保存有效记录", {concurrency:false}, async()=>{
 const date=dateInBusinessTimezone(29);
 const form=new FormData();form.append('project',String(projectId));form.append('file',new File([`| 日期 | 主题 | 标题 |\n| --- | --- | --- |\n| ${date} | 应回滚 | 应回滚 |\n| ${dateInBusinessTimezone(3)} | 已有内容冲突 | 已有内容冲突 |`],'conflict.md'));
 const preview=await request('/api/import/plans/preview',{method:'POST',body:form});assert.equal(preview.response.status,200);
 const result=await json('/api/import/plans/confirm',{project:projectId,previewToken:(preview.data as {previewToken:string}).previewToken});assert.equal(result.response.status,201);assert.equal((result.data as {summary:{conflict:number}}).summary.conflict,1);
 const read=await request(`/api/content-plans?where[project][equals]=${projectId}&where[title][equals]=应回滚&depth=0`);const valid=(read.data as {totalDocs:number;docs:Array<{id:number}>});assert.equal(valid.totalDocs,1);planIds.push(valid.docs[0].id);
});

test("AC-33 审核记录保存内容快照且已发布确认不可重复覆盖", {concurrency:false}, async()=>{
 const audits=await request(`/api/audit-records?where[contentAsset][equals]=${assetId}&depth=0`);const docs=(audits.data as {docs:Array<{contentSnapshot?:{title?:string;body?:unknown}}>}).docs;assert.ok(docs.some(a=>a.contentSnapshot?.title && a.contentSnapshot.body));
 const published=(await request(`/api/publication-tasks?where[contentAsset][equals]=${assetId}&where[status][equals]=published&depth=0`)).data as {docs:Array<{id:number}>};
 const result=await json(`/api/publication-tasks/${published.docs[0].id}/confirm`,{publishedUrl:'https://example.com/changed'});assert.equal(result.response.status,409);
});

test("AC-34 回收站可恢复内容且重新出现有效任务",{concurrency:false},async()=>{
 const result=await request(`/api/content-assets/${temporaryAssetId}/restore`,{method:'POST'});assert.equal(result.response.status,200);
 const read=await request(`/api/content-assets/${temporaryAssetId}`);assert.equal(read.response.status,200);assert.equal((read.data as {deletedAt?:string|null}).deletedAt,null);
});

test("AC-35 超过100个平台任务仍按完整文章分页且筛选不丢组",{concurrency:false},async()=>{
 const payload=await getPayload({config});const prefix=`分页验收${Date.now()}`;
 const platforms=['toutiao','baijiahao','zhihu','sohu','wechat','ctrip','meipian'] as const;
 for(let index=0;index<16;index++){const asset=await payload.create({collection:'content-assets',data:{project:Number(projectId),title:`${prefix}-${index}`,contentType:'article',status:'draft',sourceType:'manual',targetPlatforms:[...platforms],body:body('分页测试正文')}});assetIds.push(asset.id);}
 const first=await request(`/publications?query=${prefix}`);assert.equal(first.response.status,200);const {document:firstDoc}=parseHTML(String(first.data));
 const second=await request(`/publications?query=${prefix}&page=2`);assert.equal(second.response.status,200);const {document:secondDoc}=parseHTML(String(second.data));
 const firstCards=Array.from(firstDoc.querySelectorAll('.publication-article-card'));const secondCards=Array.from(secondDoc.querySelectorAll('.publication-article-card'));
 assert.equal(firstCards.length,10);assert.equal(secondCards.length,6);
 assert.ok([...firstCards,...secondCards].every(c=>c.textContent?.includes('7 个平台')));
 const ids=[...firstCards,...secondCards].map(c=>c.querySelector('a')?.getAttribute('href'));assert.equal(new Set(ids).size,16);
});


test("XLSX 下载、预览、确认、重复和更新完整链路", {concurrency:false}, async()=>{
 const created=await json('/api/projects',{name:'Excel验收项目',startDate:dateInBusinessTimezone(0),endDate:dateInBusinessTimezone(90),owner:userId,goal:'独立验收',description:'独立测试数据库'});assert.equal(created.response.status,201);const id=documentOf(created.data).id;projectIds.push(id);
 const response=await fetch(`${baseUrl}/api/import/plans/template?project=${id}`,{headers:{cookie}});assert.equal(response.status,200);
 const book=XLSX.read(Buffer.from(await response.arrayBuffer()),{type:'buffer'});
 const headers=['规划日期','每日主题','itemKey','文章分类','问题','文章标题','目标平台','文章执行备注','每日备注'];
 const rows=[['A','enterprise'],['B','general'],['C','vertical']].map(([key,category])=>[dateInBusinessTimezone(1),'Excel主题',key,category,`${key}问题`,`${key}标题`,'今日头条',`${key}执行备注`,'初始备注']);
 const preview=async()=>{book.Sheets['规划数据']=XLSX.utils.aoa_to_sheet([headers,...rows]);const form=new FormData();form.append('project',String(id));form.append('file',new File([new Uint8Array(XLSX.write(book,{type:'buffer',bookType:'xlsx'}))],'test.xlsx'));return request('/api/import/plans/preview',{method:'POST',body:form});};
 let pre=await preview();assert.equal(pre.response.status,200);assert.equal((pre.data as {summary:{create:number}}).summary.create,3);
 const save=await json('/api/import/plans/confirm',{project:id,previewToken:(pre.data as {previewToken:string}).previewToken});assert.equal(save.response.status,201,JSON.stringify(save.data));
 const repeat=await json('/api/import/plans/confirm',{project:id,previewToken:(pre.data as {previewToken:string}).previewToken});assert.equal(repeat.response.status,201);assert.equal((repeat.data as {summary:{unchanged:number}}).summary.unchanged,3);
 rows[0][4]='A修改问题';rows[0][5]='A修改标题';pre=await preview();assert.equal((pre.data as {summary:{update:number}}).summary.update,1);
 const change=await json('/api/import/plans/confirm',{project:id,previewToken:(pre.data as {previewToken:string}).previewToken});assert.equal(change.response.status,201,JSON.stringify(change.data));
 rows.forEach(row=>{row[8]='';});pre=await preview();
 const clear=await json('/api/import/plans/confirm',{project:id,previewToken:(pre.data as {previewToken:string}).previewToken});assert.equal(clear.response.status,201);
 const plan=(save.data as {docs:Array<{id:number}>}).docs[0];planIds.push(plan.id);
 const cleared=await request(`/api/content-plans/${plan.id}`);assert.equal((cleared.data as {note?:string}).note,'初始备注');
 const items=await request(`/api/content-plan-items?where[contentPlan][equals]=${plan.id}&depth=0`);assert.equal((items.data as {totalDocs:number}).totalDocs,3);
 const forged=await json('/api/import/plans/confirm',{project:projectId,previewToken:(pre.data as {previewToken:string}).previewToken});assert.equal(forged.response.status,400);
 const raw=await json('/api/import/plans/confirm',{project:id,rows:[{planDate:dateInBusinessTimezone(2),title:'不能直接写入'}]});assert.equal(raw.response.status,400);
 const batches=await request(`/api/plan-import-batches?where[project][equals]=${id}&depth=0`);assert.equal((batches.data as {totalDocs:number}).totalDocs,4);
});

test("规划项中途写入失败，规划与批次均回滚", {concurrency:false}, async()=>{
 const payload=await getPayload({config});const user=await payload.findByID({collection:'users',id:userId,overrideAccess:true});
 const book=XLSX.read(createPlanTemplate(),{type:'buffer'});book.Sheets['规划数据']=XLSX.utils.aoa_to_sheet([['规划日期','每日主题','itemKey','文章分类','问题','文章标题','目标平台','文章执行备注','每日备注'],[dateInBusinessTimezone(25),'中途回滚','A','enterprise','问题A','标题A','今日头条',''],[dateInBusinessTimezone(25),'中途回滚','B','general','问题B','标题B','今日头条','']]);
 const draft=parseXlsxV1(Buffer.from(XLSX.write(book,{type:'buffer',bookType:'xlsx'})),'rollback.xlsx','b'.repeat(64));
 const hooks=payload.collections['content-plan-items'].config.hooks!;const original=hooks.beforeChange || [];hooks.beforeChange=[...original,({data})=>{if(data.question==='问题B')throw new Error('验收中途失败');return data;}];
 try{await assert.rejects(()=>businessTransaction(payload,user,async req=>{req.context={businessAction:'daily-import'};const diff=await calculatePlanDiff(payload,projectId,draft,req);return commitPlanImport(payload,req,projectId,draft,diff,user);}),/验收中途失败/);}finally{hooks.beforeChange=original;}
 const read=await payload.count({collection:'content-plans',where:{and:[{project:{equals:projectId}},{title:{equals:'中途回滚'}}]},overrideAccess:true});assert.equal(read.totalDocs,0);
 const batches=await payload.count({collection:'plan-import-batches',where:{sourceFilename:{equals:'rollback.xlsx'}},overrideAccess:true});assert.equal(batches.totalDocs,0);
});

test('开放分类规划：A—F、同类多篇、独立备注、重复导入及创建 D 类内容', {concurrency:false},async()=>{
 const created=await json('/api/projects',{name:'开放分类验收项目',startDate:dateInBusinessTimezone(0),endDate:dateInBusinessTimezone(90),owner:userId,goal:'独立验收',description:'扩展规划'});
 assert.equal(created.response.status,201);const id=documentOf(created.data).id;projectIds.push(id);
 const response=await fetch(`${baseUrl}/api/import/plans/template?project=${id}`,{headers:{cookie}});assert.equal(response.status,200);
 const book=XLSX.read(Buffer.from(await response.arrayBuffer()),{type:'buffer'});
 const categories=['A','B','C','D','E','F','A'];
 const date=dateInBusinessTimezone(3);
 const rows=categories.map((c,index)=>[date,'开放分类每日主题',`${c}${index+1}`,c,`${c}${index}问题`,`${c}${index}标题`,'今日头条',`${c}${index}独立执行备注`,index===0?'每日共用备注':'']);
 book.Sheets['规划数据']=XLSX.utils.aoa_to_sheet([['规划日期','每日主题','itemKey','文章分类','问题','文章标题','目标平台','文章执行备注','每日备注'],...rows]);
 const preview=async()=>{const form=new FormData();form.append('project',String(id));form.append('file',new File([new Uint8Array(XLSX.write(book,{type:'buffer',bookType:'xlsx'}))],'extensible.xlsx'));return request('/api/import/plans/preview',{method:'POST',body:form});};
 let pre=await preview();assert.equal(pre.response.status,200);assert.equal((pre.data as {summary:{create:number}}).summary.create,7);
 const saved=await json('/api/import/plans/confirm',{project:id,previewToken:(pre.data as {previewToken:string}).previewToken});assert.equal(saved.response.status,201,JSON.stringify(saved.data));
 const plan=(saved.data as {docs:Array<{id:number}>}).docs[0];planIds.push(plan.id);
 const read=await request(`/api/content-plan-items?where[contentPlan][equals]=${plan.id}&depth=0`);const items=(read.data as {docs:Array<{id:number,itemKey:string,articleCategory:string,itemNote:string}>}).docs;
 assert.equal(items.length,7);for(let index=0;index<7;index++){const item=items.find(i=>i.itemKey===rows[index][2]);assert.equal(item?.itemNote,rows[index][7]);}
 pre=await preview();assert.equal((pre.data as {summary:{unchanged:number}}).summary.unchanged,7);
 const daily=await request(`/project-management/detail/${id}/plan/${plan.id}`);assert.equal(daily.response.status,200);const {document}=parseHTML(String(daily.data));const sections=Array.from(document.querySelectorAll('.daily-category'));assert.equal(sections.length,6);assert.ok(sections.some(s=>s.textContent?.includes('D类')&&s.textContent.includes('D3独立执行备注')));
 const item=items.find(i=>i.articleCategory==='D')!;
 const asset=await json('/api/content-assets',{project:id,contentPlan:plan.id,contentPlanItem:item.id,articleCategory:'D',question:'D3问题',title:'D类资产',contentType:'article',status:'draft',sourceType:'manual',targetPlatforms:['toutiao'],plannedPublishDate:date,body:body('D 类独立正文')});assert.equal(asset.response.status,201,JSON.stringify(asset.data));assetIds.push(documentOf(asset.data).id);
 pre=await preview();assert.equal((pre.data as {summary:{unchanged:number}}).summary.unchanged,7);
 // Updating a note after content creation must remain protected.
 rows[3][7]='不应覆盖已有内容的备注';book.Sheets['规划数据']=XLSX.utils.aoa_to_sheet([['规划日期','每日主题','itemKey','文章分类','问题','文章标题','目标平台','文章执行备注','每日备注'],...rows]);pre=await preview();assert.ok((pre.data as {summary:{conflict:number}}).summary.conflict>0);
 const blocked=await json('/api/import/plans/confirm',{project:id,previewToken:(pre.data as {previewToken:string}).previewToken});assert.equal(blocked.response.status,201);assert.equal((blocked.data as {summary:{conflict:number;unchanged:number}}).summary.conflict,1);assert.equal((blocked.data as {summary:{unchanged:number}}).summary.unchanged,6);
 const unchanged=await request(`/api/content-plan-items/${item.id}`);assert.equal((unchanged.data as {itemNote:string}).itemNote,'D3独立执行备注');
});


test('部分导入：已关联 A 跳过，B 可新增，错误行跳过且不影响平台汇总', {concurrency:false},async()=>{
 const created=await json('/api/projects',{name:'部分导入验收',startDate:dateInBusinessTimezone(0),endDate:dateInBusinessTimezone(90),owner:userId,goal:'回归',description:'独立库'});const id=documentOf(created.data).id;projectIds.push(id);
 const book=XLSX.read(Buffer.from(await (await fetch(`${baseUrl}/api/import/plans/template?project=${id}`,{headers:{cookie}})).arrayBuffer()),{type:'buffer'});
 const headers=['规划日期','每日主题','itemKey','文章分类','问题','文章标题','目标平台','文章执行备注','每日备注'];
 let rows=[ [dateInBusinessTimezone(2),'部分导入主题','A','A','A问题','A标题','今日头条','A安排','原每日备注'] ];
 const preview=async()=>{book.Sheets['规划数据']=XLSX.utils.aoa_to_sheet([headers,...rows]);const form=new FormData();form.append('project',String(id));form.append('file',new File([new Uint8Array(XLSX.write(book,{type:'buffer',bookType:'xlsx'}))],'partial.xlsx'));return request('/api/import/plans/preview',{method:'POST',body:form});};
 let pre=await preview(),saved=await json('/api/import/plans/confirm',{project:id,previewToken:(pre.data as {previewToken:string}).previewToken});assert.equal(saved.response.status,201);
 const plan=(saved.data as {docs:Array<{id:number}>}).docs[0];planIds.push(plan.id);const item=(saved.data as {items:Array<{id:number}>}).items[0];
 const asset=await json('/api/content-assets',{project:id,contentPlan:plan.id,contentPlanItem:item.id,articleCategory:'enterprise',question:'A问题',title:'A正文',targetPlatforms:['toutiao'],body:body('真实正文')});assert.equal(asset.response.status,201);assetIds.push(documentOf(asset.data).id);
 rows=[[dateInBusinessTimezone(2),'部分导入主题','A','A','A问题','覆盖A标题','公众号','',''],[dateInBusinessTimezone(2),'部分导入主题','B','B','B问题','B标题','知乎','B安排',''],[dateInBusinessTimezone(2),'部分导入主题','F','F','','错误标题','百家号','',''],['缺少年份','无效日期主题','D','D','D问题','D标题','携程','','']];
 pre=await preview();const summary=(pre.data as {summary:{create:number;conflict:number;error:number}}).summary;assert.equal(summary.create,1);assert.equal(summary.conflict,1);assert.equal(summary.error,2);
 saved=await json('/api/import/plans/confirm',{project:id,previewToken:(pre.data as {previewToken:string}).previewToken});assert.equal(saved.response.status,201,JSON.stringify(saved.data));assert.equal((saved.data as {skipped:unknown[]}).skipped.length,3);
 const original=await request(`/api/content-plan-items/${item.id}`);assert.equal((original.data as {title:string;itemNote:string}).title,'A标题');assert.equal((original.data as {itemNote:string}).itemNote,'A安排');
 const after=await request(`/api/content-plans/${plan.id}`);assert.equal((after.data as {note:string}).note,'原每日备注');assert.deepEqual(new Set((after.data as {platforms:string[]}).platforms),new Set(['toutiao','zhihu']));
 const items=await request(`/api/content-plan-items?where[contentPlan][equals]=${plan.id}&depth=0`);assert.equal((items.data as {totalDocs:number}).totalDocs,2);
});

test("短视频脚本：混合规划、表格导入、审核快照、发布保护与修订", { concurrency: false }, async () => {
  const planned = documentOf((await json("/api/content-plans", { project: projectId, planDate: dateInBusinessTimezone(30), dailyTheme: "混合内容", topic: "混合内容", title: "混合内容", platforms: ["toutiao", "douyin", "wechat_channels"] })).data);
  planIds.push(planned.id);
  const articleItem = documentOf((await json("/api/content-plan-items", { contentPlan: planned.id, itemKey: "A1", articleCategory: "enterprise", question: "如何入住", title: "入住文章", targetPlatforms: ["toutiao"], sortOrder: 1 })).data);
  assert.equal(articleItem.contentType, "article");
  const scriptItem = documentOf((await json("/api/content-plan-items", { contentPlan: planned.id, itemKey: "A_VIDEO1", contentType: "video_script", articleCategory: "enterprise", question: "如何入住", title: "入住脚本", targetPlatforms: ["douyin", "wechat_channels"], sortOrder: 2 })).data);
  const mismatch = await json("/api/content-assets", { project: projectId, contentPlan: planned.id, contentPlanItem: scriptItem.id, contentType: "article", title: "错误关联", targetPlatforms: ["douyin"], body: body("错误关联") });
  assert.ok(mismatch.response.status >= 400);
  const article = documentOf((await json("/api/content-assets", { project: projectId, contentPlan: planned.id, contentPlanItem: articleItem.id, title: "入住文章", targetPlatforms: ["toutiao"], body: body("文章正文") })).data);
  assetIds.push(article.id);
  const form = new FormData();
  form.set("file", new Blob(["# 入住脚本\n\n| 秒数 | 画面 | 口播 |\n|---|---|---|\n| 0–5 | 院落全景 | 欢迎来到示例民宿 |\n"]), "入住脚本.md");
  const preview = await request("/api/import/content/preview", { method: "POST", body: form });
  assert.equal(preview.response.status, 200);
  const parsed = preview.data as { text: string; body: unknown };
  const imported = await json("/api/import/content/confirm", { project: projectId, contentPlan: planned.id, contentPlanItem: scriptItem.id, contentType: "video_script", articleCategory: "enterprise", question: "如何入住", title: "入住脚本", targetPlatforms: ["douyin", "wechat_channels"], sourceFilename: "入住脚本.md", text: parsed.text, body: parsed.body });
  assert.equal(imported.response.status, 201);
  const script = documentOf(imported.data); assetIds.push(script.id);
  assert.equal(script.contentType, "video_script");
  assert.ok(contentBodyToHtml(script.body).includes("<table"));
  assert.deepEqual((await tasksFor(script.id)).map(t=>t.platform).sort(), ["douyin", "wechat_channels"]);
  assert.ok((await tasksFor(script.id)).every(t=>t.status === "blocked"));
  const duplicate = await json("/api/import/content/confirm", { project: projectId, contentPlan: planned.id, contentPlanItem: scriptItem.id, contentType: "video_script", title: "重复", targetPlatforms: ["douyin"], sourceFilename: "重复.md", text: "重复" });
  assert.ok(duplicate.response.status >= 400);
  assert.equal((await json(`/api/content-assets/${script.id}/workflow/submit`, {})).response.status, 200);
  assert.equal((await json(`/api/content-assets/${script.id}/workflow/approve`, {})).response.status, 200);
  const audits = await request(`/api/audit-records?where[contentAsset][equals]=${script.id}&depth=0`);
  assert.ok((audits.data as { docs: Array<{ contentSnapshot: { contentType: string } }> }).docs.every(a=>a.contentSnapshot.contentType === "video_script"));
  const updated = await json(`/api/content-assets/${script.id}`, { title: "入住脚本修正" }, "PATCH");
  assert.equal(documentOf(updated.data).status, "draft");
  assert.equal((await json(`/api/content-assets/${script.id}/workflow/submit`, {})).response.status, 200);
  assert.equal((await json(`/api/content-assets/${script.id}/workflow/approve`, {})).response.status, 200);
  const task = (await tasksFor(script.id)).find(t=>t.platform === "douyin")!;
  assert.equal((await json(`/api/publication-tasks/${task.id}/confirm`, { publishedUrl: "https://www.douyin.com/video/123456789" })).response.status, 200);
  assert.ok((await json(`/api/content-assets/${script.id}`, { title: "已发布不可覆盖" }, "PATCH")).response.status >= 400);
  const revision = await json("/api/content-assets", { project: projectId, revisionOf: script.id, contentType: "video_script", title: "脚本修订", body: parsed.body, targetPlatforms: ["douyin"] });
  assert.equal(revision.response.status, 201); const revisionDoc=documentOf(revision.data); assetIds.push(revisionDoc.id);
  assert.equal(revisionDoc.status,"draft"); assert.equal(relationId(revisionDoc.revisionOf),String(script.id));
  const listing = await request("/content-management?type=video_script");
  assert.equal(listing.response.status,200); assert.ok(String(listing.data).includes("短视频脚本"));
  const invalid = await json("/api/import/content/confirm", { project: projectId, contentType: "bad", title: "非法类型", targetPlatforms: ["douyin"], sourceFilename: "bad.md", text: "正文" });
  assert.equal(invalid.response.status,400);
});

test("小红书：表格规划、图文/脚本导入、覆盖、审核与独立发布任务", async () => {
  const createdProject = await json('/api/projects',{name:'小红书独立验收',startDate:dateInBusinessTimezone(-1),endDate:dateInBusinessTimezone(30),owner:userId,goal:'验证小红书内容闭环',description:'独立临时数据库验收'});
  assert.equal(createdProject.response.status,201);
  const xiaohongshuProjectId = documentOf(createdProject.data).id;projectIds.push(xiaohongshuProjectId);
  const configs = (await request('/api/platform-configs?where[key][equals]=xiaohongshu')).data as { docs: Array<{id:number;enabled:boolean;publishUrl:string}> };
  assert.equal(configs.docs.length, 1);
  const platform = configs.docs[0];
  assert.equal(platform.publishUrl, 'https://creator.xiaohongshu.com/');
  const workbook = XLSX.read(createPlanTemplate(), {type:'buffer'});
  const headers = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets['规划数据'], {header:1})[0];
  workbook.Sheets['规划数据'] = XLSX.utils.aoa_to_sheet([headers,
    [dateInBusinessTimezone(29),'小红书入住参考','XHS_A','C','带娃如何安排','亲子图文','小红书,今日头条','','','文章'],
    [dateInBusinessTimezone(29),'小红书入住参考','XHS_V','C','带娃如何安排','亲子脚本','xiaohongshu','','','短视频脚本']]);
  const form = new FormData(); form.set('project',String(xiaohongshuProjectId));
  form.set('file',new Blob([XLSX.write(workbook,{type:'buffer',bookType:'xlsx'})]),'小红书规划.xlsx');
  const preview = await request('/api/import/plans/preview',{method:'POST',body:form});
  assert.equal(preview.response.status,200,JSON.stringify(preview.data));
  const parsed = preview.data as {previewToken:string;summary:{create:number;error:number}};
  assert.equal(parsed.summary.create,2);assert.equal(parsed.summary.error,0);
  const committed = await json('/api/import/plans/confirm',{project:xiaohongshuProjectId,previewToken:parsed.previewToken});
  assert.equal(committed.response.status,201,JSON.stringify(committed.data));
  const day = businessDayRange(dateInBusinessTimezone(29));
  const query = new URLSearchParams({ 'where[project][equals]': String(xiaohongshuProjectId), 'where[planDate][greater_than_equal]': day.greater_than_equal, 'where[planDate][less_than]': day.less_than, depth: '0' });
  const plans = (await request(`/api/content-plans?${query}`)).data as {docs:Array<{id:number;platforms:string[]}>};
  const planned = plans.docs.find(p=>p.platforms.includes('xiaohongshu'))!;assert.ok(planned);
  const items = (await request(`/api/content-plan-items?where[contentPlan][equals]=${planned.id}&depth=0`)).data as {docs:Array<{id:number;contentType:string;targetPlatforms:string[]}>};
  assert.equal(items.docs.length,2);
  for (const item of items.docs) {
    const article = item.contentType === 'article';
    const text = article ? '# 带娃入住参考\n\n先核对房型与入住规则。\n\n#亲子游 #示例民宿' : '# 亲子脚本\n\n| 秒数 | 画面 | 口播 |\n|---|---|---|\n| 0–5 | 院落 | 带娃先核对入住安排 |';
    const contentForm = new FormData();contentForm.set('file',new Blob([text]),'小红书.md');
    const extracted = (await request('/api/import/content/preview',{method:'POST',body:contentForm})).data as {body:unknown;text:string};
    const imported = await json('/api/import/content/confirm',{project:xiaohongshuProjectId,contentPlan:planned.id,contentPlanItem:item.id,contentType:item.contentType,title:article?'亲子图文':'亲子脚本',targetPlatforms:item.targetPlatforms,sourceFilename:'小红书.md',text:extracted.text,body:extracted.body});
    assert.equal(imported.response.status,201,JSON.stringify(imported.data));
    const doc = documentOf(imported.data);assetIds.push(doc.id);
    assert.deepEqual(doc.body,extracted.body);
    if(article)assert.ok(contentBodyToPlainText(doc.body).includes('#亲子游'));
    else assert.ok(contentBodyToHtml(doc.body).includes('<table'));
    const tasks = await tasksFor(doc.id); const task = tasks.find(t=>t.platform==='xiaohongshu')!;
    assert.ok(task);assert.equal(task.platformUrl,platform.publishUrl);assert.equal(task.status,'blocked');
    const changed = documentOf((await json(`/api/content-assets/${doc.id}`,{title:'修正'+doc.title},'PATCH')).data);
    assert.equal(changed.id,doc.id);assert.equal(relationId(changed.contentPlanItem),String(item.id));
    assert.deepEqual((await tasksFor(doc.id)).map(t=>t.id),tasks.map(t=>t.id));
    assert.ok((await json(`/api/publication-tasks/${task.id}/confirm`,{publishedUrl:'https://www.xiaohongshu.com/explore/test'})).response.status>=400);
    assert.equal((await json(`/api/content-assets/${doc.id}/workflow/submit`,{})).response.status,200);
    assert.equal((await json(`/api/content-assets/${doc.id}/workflow/approve`,{})).response.status,200);
    assert.equal((await json(`/api/publication-tasks/${task.id}/confirm`,{publishedUrl:'https://www.xiaohongshu.com/explore/test'})).response.status,200);
    if(article)assert.equal((await tasksFor(doc.id)).find(t=>t.platform==='toutiao')?.status,'pending');
  }
  for(const path of ['/settings','/content-management?platform=xiaohongshu','/publications?platform=xiaohongshu']) {
    const page = await request(path);assert.equal(page.response.status,200);assert.ok(String(page.data).includes('小红书'));
  }
  try {
    assert.equal((await json(`/api/platform-configs/${platform.id}`,{enabled:false},'PATCH')).response.status,200);
    const createPage = await request('/content-management/create');
    assert.ok(!Array.from(parseHTML(String(createPage.data)).document.querySelectorAll('.platform-check')).some(button=>button.textContent?.includes('小红书')));
    assert.ok((await json('/api/content-assets',{project:xiaohongshuProjectId,title:'停用平台不可新增',targetPlatforms:['xiaohongshu'],body:body('正文')})).response.status>=400);
  } finally { await json(`/api/platform-configs/${platform.id}`,{enabled:platform.enabled},'PATCH'); }
});
