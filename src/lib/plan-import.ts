import { normalizeContentType } from "@/lib/content-types";
import { normalizeArticleCategory, articleCategoryCode } from "./article-categories";
import crypto from "node:crypto";
import * as XLSX from "xlsx";
import type { Payload, PayloadRequest, TypedUser } from "payload";
import type { PlatformKey } from "@/lib/platforms";
import { PLATFORMS } from "@/lib/platforms";
import { parseDailyPlanningText, parsePlanningText, type ArticleCategory, type DailyPlanning } from "@/lib/importers";
import { refreshContentPlanStatus } from "@/lib/content-workflow";
import { businessDate } from "@/lib/business-date";
import { getPayloadSecret } from "./runtime-secrets";

export const PLAN_TEMPLATE_ID = "geo-daily-plan";
export const PLAN_TEMPLATE_VERSION = 2;
export const PREVIEW_TOKEN_TTL_MS = 15 * 60 * 1000;

export type PlanImportFormat = "xlsx" | "docx" | "md";
export type ImportAction = "create" | "update" | "unchanged" | "conflict" | "error";

export type ImportPlanRow = {
  sourceLine: number;
  planDate: string;
  dailyTheme: string;
  itemKey: string;
  articleCategory: string;
  contentType?: "article" | "video_script";
  question: string;
  title: string;
  targetPlatforms: PlatformKey[];
  note: string;
  itemNote?: string;
  dailyNoteProvided?: boolean;
  warning?: string;
  error?: string;
};

export type ImportDraft = {
  templateId: string;
  templateVersion: number;
  sourceFormat: PlanImportFormat;
  sourceFilename: string;
  sourceHash: string;
  rows: ImportPlanRow[];
  warnings: string[];
  errors: string[];
  blockingErrors?: string[];
  projectId?: string;
  projectName?: string;
};

export type ImportSummary = Record<ImportAction, number>;

export type PlanDiffRow = ImportPlanRow & {
  action: ImportAction;
  reason: string;
  changes: string[];
  planAction: "create" | "update" | "unchanged" | "conflict" | "error";
  planId?: number | string;
  itemId?: number | string;
};

export type PlanDiff = {
  rows: PlanDiffRow[];
  summary: ImportSummary;
  plans: Array<{
    planDate: string;
    action: "create" | "update" | "unchanged" | "conflict" | "error";
    planId?: number | string;
    dailyTheme: string;
    title: string;
    note: string;
    platforms: PlatformKey[];
    reason: string;
  }>;
};

type NormalizableRow = Omit<Partial<ImportPlanRow>, "planDate"> & { planDate?: unknown };

const platformKeys = new Set(PLATFORMS.map(({ key }) => key));
const itemKeyByCategory: Record<string, string> = { enterprise: "A", general: "B", vertical: "C" };

function uniquePlatforms(values: unknown[]): PlatformKey[] {
  return Array.from(new Set(values.filter((value): value is PlatformKey => typeof value === "string" && platformKeys.has(value as PlatformKey))));
}

function splitPlatforms(value: unknown): { values: PlatformKey[]; unknown: string[] } {
  const values: PlatformKey[] = [];
  const unknown: string[] = [];
  for (const raw of String(value ?? "").split(/[\s,，、;；|/]+/).map((part) => part.trim()).filter(Boolean)) {
    const match = PLATFORMS.find((platform) => platform.key === raw || platform.name === raw);
    if (match) values.push(match.key);
    else unknown.push(raw);
  }
  return { values: uniquePlatforms(values), unknown };
}

export function normalizeTargetPlatforms(value: unknown): PlatformKey[] {
  return splitPlatforms(value).values;
}

function validDateParts(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function businessDateParts(value: Date): string | null {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return validDateParts(Number(parts.year), Number(parts.month), Number(parts.day));
}

export function normalizePlanDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return businessDateParts(value) || "";
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    return parsed ? validDateParts(parsed.y, parsed.m, parsed.d) || "" : "";
  }
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  return match ? validDateParts(Number(match[1]), Number(match[2]), Number(match[3])) || "" : "";
}

function sourceError(row: number, message: string) {
  return `第 ${row} 行：${message}`;
}

function normalizeRow(row: NormalizableRow, sourceLine: number, warnings: string[], errors: string[]): ImportPlanRow {
  const planDate = normalizePlanDate(row.planDate);
  const dailyTheme = String(row.dailyTheme ?? "").trim();
  const itemKey = String(row.itemKey ?? "").trim().toUpperCase();
  const articleCategory = normalizeArticleCategory(row.articleCategory);
  const contentType = normalizeContentType(row.contentType);
  const question = String(row.question ?? "").trim();
  let title = String(row.title ?? "").trim();
  const note = String(row.note ?? "").trim();
  const targetPlatforms = uniquePlatforms(Array.isArray(row.targetPlatforms) ? row.targetPlatforms : []);
  const rowWarnings: string[] = [];
  const rowErrors: string[] = [];
  if (!contentType) rowErrors.push("内容类型必须为文章或短视频脚本");
  if (!planDate) rowErrors.push("规划日期必须是有效的 YYYY-MM-DD 日期，且必须包含年份");
  if (!dailyTheme) rowErrors.push("每日主题不能为空");
  if (!itemKey) rowErrors.push("itemKey 不能为空");
  if (itemKey && !/^[A-Z][A-Z0-9_-]*$/.test(itemKey)) rowErrors.push("itemKey 只能包含大写字母、数字、下划线或连字符");
  if (!articleCategory) rowErrors.push("文章分类必须是 A/B/C、已有分类名称或自定义大写编码（如 D、E、F）");
  if (!question) rowErrors.push("问题不能为空");
  if (!title) {
    title = question ? `待补充标题：${question}` : "";
    if (title) rowWarnings.push("文章标题为空，已生成占位标题");
  }
  if (targetPlatforms.length === 0) rowErrors.push("目标平台不能为空");
  if (Array.isArray(row.targetPlatforms) && targetPlatforms.length !== row.targetPlatforms.length) rowErrors.push("目标平台包含不支持的值");

  const warning = [row.warning, ...rowWarnings].filter(Boolean).join("；") || undefined;
  const error = [row.error, ...rowErrors].filter(Boolean).join("；") || undefined;
  if (warning) warnings.push(sourceError(sourceLine, warning));
  if (error) errors.push(sourceError(sourceLine, error));
  return { sourceLine, planDate, dailyTheme, itemKey, contentType: contentType || "article", articleCategory: articleCategory || "general", question, title, targetPlatforms, note, itemNote: row.itemNote === undefined ? undefined : String(row.itemNote).trim(), dailyNoteProvided: row.dailyNoteProvided, warning, error };
}

const V1_HEADERS = ["规划日期", "每日主题", "itemKey", "文章分类", "问题", "文章标题", "目标平台", "官网动作/备注"];

const DATA_HEADERS = [...V1_HEADERS.slice(0, 7), "文章执行备注", "每日备注"];

export function createPlanTemplate(project?: { id: number | string; name: string }): Buffer {
  const workbook = XLSX.utils.book_new();
  const meta = XLSX.utils.aoa_to_sheet([
    ["key", "value"],
    ["template_id", PLAN_TEMPLATE_ID],
    ["template_version", PLAN_TEMPLATE_VERSION],
    ["generated_at", new Date().toISOString()],
    ...(project ? [["project_id", String(project.id)], ["project_name", project.name]] : []),
  ]);
  const guide = XLSX.utils.aoa_to_sheet([
    ["字段", "填写说明"],
    ["规划日期", "必填，YYYY-MM-DD，必须包含年份且是真实日期"],
    ["每日主题", "必填，同一日期的所有行必须一致"],
    ["itemKey", "必填，稳定键；每篇文章独立且稳定，例如 A1、A2、B1、D1；不限定分类数量"],
    ["文章分类", "必填，支持 A/B/C 或已有分类名称，也支持 D、E、F 等大写编码"],
    ["问题", "必填，文章要回答的问题"],
    ["文章标题", "可留空；确认预览时会生成待补充标题占位值并提示 warning"],
    ["目标平台", `必填，多个平台用逗号分隔；允许值：${PLATFORMS.map(({ name }) => name).join("、")}`],
    ["内容类型", "可选：文章或短视频脚本；留空默认文章；itemKey 每条内容独立，例如 A1、A_VIDEO1"],
    ["文章执行备注", "可选，每篇文章独立保存，可以不同"],
    ["每日备注", "可选，同一天共用；可只在一行填写，多个非空值必须一致"],
    ["重复导入", "同一项目和日期、同一 itemKey 会更新；完全相同的内容显示为无变化"],
  ]);
  const data = XLSX.utils.aoa_to_sheet([[...DATA_HEADERS, "内容类型"]]);
  XLSX.utils.book_append_sheet(workbook, meta, "_meta");
  XLSX.utils.book_append_sheet(workbook, guide, "填写说明");
  XLSX.utils.book_append_sheet(workbook, data, "规划数据");
  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
}

export function parseXlsxV1(buffer: Buffer, filename: string, sourceHash: string): ImportDraft {
  const warnings: string[] = [];
  const errors: string[] = [];
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, raw: false });
  } catch {
    throw new Error("XLSX 文件无法读取，请使用当前版本模板");
  }
  const metaSheet = workbook.Sheets._meta;
  const dataSheet = workbook.Sheets["规划数据"];
  if (!metaSheet || !dataSheet) throw new Error("XLSX 必须包含 _meta 和 规划数据 工作表");
  const metaRows = XLSX.utils.sheet_to_json<unknown[]>(metaSheet, { header: 1, defval: "", raw: false });
  const meta = new Map(metaRows.slice(1).map((row) => [String(row[0] ?? "").trim(), String(row[1] ?? "").trim()]));
  const templateId = meta.get("template_id") || "";
  const templateVersion = Number(meta.get("template_version"));
  if (templateId !== PLAN_TEMPLATE_ID) throw new Error(`不支持的模板 ID：${templateId || "空"}`);
  if (![1, PLAN_TEMPLATE_VERSION].includes(templateVersion)) throw new Error(`不支持的模板版本：${meta.get("template_version") || "空"}`);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(dataSheet, { header: 1, defval: "", raw: true });
  const headers = (rows[0] || []).map((value) => String(value).trim());
  const expectedHeaders = templateVersion === 1 ? V1_HEADERS : DATA_HEADERS;
  if (expectedHeaders.some((header, index) => headers[index] !== header)) throw new Error(`规划数据表头必须为：${expectedHeaders.join("、")}`);
  const draftRows = rows.slice(1).flatMap((values, index) => {
    if (values.every((value) => String(value ?? "").trim() === "")) return [];
    const platformResult = splitPlatforms(values[6]);
    const rowWarnings: string[] = [];
    const rowErrors: string[] = platformResult.unknown.length ? [`目标平台不支持：${platformResult.unknown.join("、")}`] : [];
    if (String(values[5] ?? "").trim() === String(values[4] ?? "").trim() && !String(values[5] ?? "").trim()) rowWarnings.push("文章标题为空");
    return [normalizeRow({ contentType: (headers.includes("内容类型") ? values[headers.indexOf("内容类型")] : undefined) as ImportPlanRow["contentType"], planDate: values[0], dailyTheme: String(values[1] ?? ""), itemKey: String(values[2] ?? ""), articleCategory: String(values[3] ?? "") as ArticleCategory, question: String(values[4] ?? ""), title: String(values[5] ?? ""), targetPlatforms: platformResult.values, note: String(values[templateVersion === 1 ? 7 : 8] ?? ""), itemNote: templateVersion === 1 ? undefined : String(values[7] ?? ""), warning: rowWarnings.join("；") || undefined, error: rowErrors.join("；") || undefined }, index + 2, warnings, errors)];
  });
  if (templateVersion === 1) {
    for (const date of new Set(draftRows.map(row => row.planDate))) {
      const dayRows = draftRows.filter(row => row.planDate === date);
      if (new Set(dayRows.map(row => row.note).filter(Boolean)).size > 1) {
        // V1 overloaded one column. Distinct notes belong to articles; preserve existing daily notes.
        for (const row of dayRows) { row.itemNote = row.note; row.note = ""; row.dailyNoteProvided = false; }
        warnings.push(`${date}：旧模板的不同备注已作为各篇文章执行备注保留；每日共用备注保留原值。建议使用 v2 模板`);
      }
    }
  }
  const draft: ImportDraft = { templateId, templateVersion, sourceFormat: "xlsx", sourceFilename: filename, sourceHash, rows: draftRows, warnings, errors, projectId: meta.get("project_id"), projectName: meta.get("project_name") };
  return validateDraft(draft);
}

function legacyRows(dailyPlans: DailyPlanning[]): Partial<ImportPlanRow>[] {
  return dailyPlans.flatMap((plan) => plan.articles.map((article) => ({ sourceLine: article.line, planDate: plan.planDate, dailyTheme: plan.topic, itemKey: itemKeyByCategory[article.category], articleCategory: article.category, question: article.question, title: article.title, targetPlatforms: article.targetPlatforms, note: plan.note || "" })));
}

export function parseLegacyPlanText(text: string, filename: string, format: "md" | "docx", sourceHash: string, fallbackPlatforms: PlatformKey[] = ["toutiao"]): ImportDraft {
  const warnings: string[] = ["旧格式：建议下载并使用当前版本 XLSX 模板"];
  const errors: string[] = [];
  const dailyPlans = parseDailyPlanningText(text);
  let rows: Partial<ImportPlanRow>[];
  if (dailyPlans) {
    rows = legacyRows(dailyPlans);
    if (!/20\d{2}年/.test(text)) {
      rows = rows.map((row) => ({ ...row, planDate: "", error: "旧格式日期缺少年份，不能使用服务器当前年份猜测" }));
    }
  } else {
    rows = parsePlanningText(text).map((row) => ({ sourceLine: row.line, planDate: row.planDate, dailyTheme: row.topic, itemKey: "B", articleCategory: "general", question: row.topic, title: row.title, targetPlatforms: fallbackPlatforms, note: "", error: row.error }));
    warnings.push("旧格式未提供 itemKey、分类或平台，已按 B 类和用户选择的平台转换");
  }
  const normalized = rows.map((row, index) => normalizeRow(row, Number(row.sourceLine) || index + 1, warnings, errors));
  return validateDraft({ templateId: PLAN_TEMPLATE_ID, templateVersion: PLAN_TEMPLATE_VERSION, sourceFormat: format, sourceFilename: filename, sourceHash, rows: normalized, warnings, errors });
}

export function validateDraft(draft: ImportDraft, project?: { id?: number | string; name?: string; startDate?: string; endDate?: string }): ImportDraft {
  const rows = draft.rows.map(row => ({ ...row }));
  const blockingErrors = [...new Set(draft.blockingErrors || draft.errors.filter(error => !/^第 \d+ 行：/.test(error)))];
  const warnings = [...draft.warnings];
  if (draft.projectId && project?.id && draft.projectId !== String(project.id)) blockingErrors.push(`模板属于「${draft.projectName || draft.projectId}」，与当前项目「${project.name || project.id}」不一致，请切换项目或下载当前项目模板`);
  const groups = new Map<string, ImportPlanRow[]>();
  for (const row of rows) {
    if (row.planDate) groups.set(row.planDate, [...(groups.get(row.planDate) || []), row]);
    if (project?.startDate && row.planDate && row.planDate < project.startDate.slice(0, 10)) row.error ||= "规划日期早于项目开始日期";
    if (project?.endDate && row.planDate > project.endDate.slice(0, 10)) row.error ||= "规划日期晚于项目结束日期";
  }
  for (const dayRows of groups.values()) {
    const themes = new Set(dayRows.map(row => row.dailyTheme).filter(Boolean));
    const notes = new Set(dayRows.map(row => row.note).filter(Boolean));
    if (themes.size > 1 || notes.size > 1) {
      for (const row of dayRows) row.error = "同一日期的每日主题或备注不一致，跳过当天全部记录";
    }
    const keys = new Map<string, ImportPlanRow[]>();
    for (const row of dayRows) if (row.itemKey) keys.set(row.itemKey, [...(keys.get(row.itemKey) || []), row]);
    for (const duplicates of keys.values()) if (duplicates.length > 1) for (const row of duplicates) row.error ||= `同一文件内重复 itemKey：${row.planDate} / ${row.itemKey}，跳过重复项`;
  }
  if (!rows.length) blockingErrors.push("规划数据表没有可导入的行");
  const errors = [...new Set([...blockingErrors, ...rows.filter(row => row.error).map(row => sourceError(row.sourceLine, row.error!))])];
  return { ...draft, rows, warnings, errors, blockingErrors: [...new Set(blockingErrors)] };
}

function sameValues(left: unknown, right: unknown): boolean {
  const a = Array.isArray(left) ? uniquePlatforms(left).sort() : left == null ? "" : String(left);
  const b = Array.isArray(right) ? uniquePlatforms(right).sort() : right == null ? "" : String(right);
  return JSON.stringify(a) === JSON.stringify(b);
}

function dateRange(date: string) {
  const start = new Date(`${date}T00:00:00+08:00`);
  return { greater_than_equal: start.toISOString(), less_than: new Date(start.getTime() + 24 * 60 * 60 * 1000).toISOString() };
}

function itemKeyForExisting(item: { itemKey?: string | null; articleCategory?: string | null }): string {
  // Recognize current checkout's generated legacy keys without rewriting business records.
  if (item.articleCategory && item.itemKey?.startsWith(`${item.articleCategory}:`)) return articleCategoryCode(item.articleCategory);
  return item.itemKey || (item.articleCategory ? articleCategoryCode(item.articleCategory) : "");
}

async function findPlans(payload: Payload, projectId: number | string, date: string, req?: PayloadRequest) {
  return payload.find({ collection: "content-plans", where: { and: [{ project: { equals: projectId } }, { planDate: dateRange(date) }] }, limit: 1000, depth: 0, overrideAccess: true, req });
}

async function findItems(payload: Payload, planId: number | string, req?: PayloadRequest) {
  return payload.find({ collection: "content-plan-items", where: { contentPlan: { equals: planId } }, pagination: false, depth: 0, overrideAccess: true, req });
}

export async function calculatePlanDiff(payload: Payload, projectId: number | string, draft: ImportDraft, req?: PayloadRequest): Promise<PlanDiff> {
  const normalized = validateDraft(draft);
  const resultRows: PlanDiffRow[] = [];
  const plans: PlanDiff["plans"] = [];
  const summary: ImportSummary = { create: 0, update: 0, unchanged: 0, conflict: 0, error: 0 };
  const dates = [...new Set(normalized.rows.map(row => row.planDate))];
  for (const date of dates) {
    const dayRows = normalized.rows.filter(row => row.planDate === date);
    const validRows = dayRows.filter(row => !row.error);
    // Invalid dates and rejected days never reach database date filters or create empty plans.
    if (!date || !normalizePlanDate(date) || !validRows.length) {
      for (const row of dayRows) resultRows.push({ ...row, action: "error", reason: row.error || "日期无效", changes: [], planAction: "error" });
      continue;
    }
    const found = await findPlans(payload, projectId, date, req);
    const existing = found.docs[0];
    const oldItems = existing ? (await findItems(payload, existing.id, req)).docs : [];
    const assets = existing ? await payload.find({ collection: "content-assets", where: { and: [{ contentPlan: { equals: existing.id } }, { deletedAt: { exists: false } }] }, pagination: false, depth: 0, overrideAccess: true, req }) : { docs: [] };
    const historical = date < businessDate();
    const dailyTheme = validRows[0].dailyTheme;
    // Blank notes preserve existing values. Clearing is an explicit edit, never omission in a file.
    const note = validRows.find(row => row.note)?.note || existing?.note || "";
    const dailyChanges: string[] = [];
    if (existing && !sameValues(existing.dailyTheme || existing.topic, dailyTheme)) dailyChanges.push("每日主题");
    if (existing && !sameValues(existing.title, dailyTheme)) dailyChanges.push("规划标题");
    if (existing && !sameValues(existing.note, note)) dailyChanges.push("每日备注");
    const dayConflict = found.docs.length > 1 ? "数据库存在同一项目同一天的多条每日规划" : existing && dailyChanges.length && (historical || existing.contentAsset || assets.docs.length) ? "历史规划或已有内容的每日共用信息不能覆盖，跳过当天全部记录" : "";
    const plan: PlanDiff["plans"][number] = { planDate: date, action: existing ? "unchanged" : "create", planId: existing?.id, dailyTheme, title: dailyTheme, note, platforms: [], reason: "每日规划字段无变化" };
    const effectiveItems = new Map(oldItems.map(item => [itemKeyForExisting(item), item.targetPlatforms || []]));
    const dayResults: PlanDiffRow[] = [];
    for (const row of dayRows) {
      let action: ImportAction = "error", reason = row.error || "输入行无效";
      const changes: string[] = [];
      const candidates = oldItems.filter(item => itemKeyForExisting(item) === row.itemKey);
      const item = candidates[0];
      if (!row.error) {
        if (dayConflict) { action = "conflict"; reason = dayConflict; }
        else if (candidates.length > 1) { action = "conflict"; reason = "数据库存在重复 itemKey，跳过该规划项"; }
        else if (!item) { action = historical ? "conflict" : "create"; reason = historical ? "历史日期不能新增规划项" : "未找到相同每日规划和 itemKey 的规划项"; }
        else {
          if (normalizeContentType(item.contentType) !== normalizeContentType(row.contentType)) changes.push("内容类型");
          if (!sameValues(item.articleCategory, row.articleCategory)) changes.push("文章分类");
          if (!sameValues(item.question, row.question)) changes.push("问题");
          if (!sameValues(item.title, row.title)) changes.push("文章标题");
          if (row.itemNote && !sameValues(item.itemNote, row.itemNote)) changes.push("文章执行备注");
          if (!sameValues(item.targetPlatforms, row.targetPlatforms)) changes.push("目标平台");
          const hasAsset = assets.docs.some(asset => {
            const linked = typeof asset.contentPlanItem === "object" ? asset.contentPlanItem?.id : asset.contentPlanItem;
            return linked ? String(linked) === String(item.id) : !asset.articleCategory || !asset.question || (asset.articleCategory === item.articleCategory && asset.question === item.question);
          }) || Boolean(existing?.contentAsset);
          if (changes.length && (historical || hasAsset)) { action = "conflict"; reason = historical ? "历史日期的规划项不能修改" : "该规划项已有内容资产，保留原记录"; }
          else { action = changes.length || dailyChanges.length ? "update" : "unchanged"; reason = changes.length ? `将更新：${changes.join("、")}` : dailyChanges.length ? `将更新：${dailyChanges.join("、")}` : "规划项和每日规划字段均无变化"; }
        }
      }
      if (action === "create" || action === "update") effectiveItems.set(row.itemKey, row.targetPlatforms);
      dayResults.push({ ...row, action, reason, changes, planAction: plan.action, planId: existing?.id, itemId: item?.id });
    }
    const eligible = dayResults.some(row => row.action === "create" || row.action === "update" || row.action === "unchanged");
    plan.platforms = uniquePlatforms([...effectiveItems.values()].flat());
    if (!eligible) { plan.action = dayConflict || dayResults.some(row => row.action === "conflict") ? "conflict" : "error"; plan.reason = dayConflict || "当天没有有效记录，保持原样"; }
    else if (existing) {
      // Summary changes are based on accepted rows plus all retained existing items.
      if (!sameValues(existing.platforms, plan.platforms) && dayResults.some(row => row.action === "create" || row.action === "update")) dailyChanges.push("目标平台汇总");
      else plan.platforms = existing.platforms || plan.platforms;
      plan.action = dailyChanges.length ? "update" : "unchanged";
      plan.reason = dailyChanges.length ? `将更新：${dailyChanges.join("、")}` : "每日规划字段无变化";
    } else plan.reason = "新增有效记录对应的每日规划";
    for (const row of dayResults) row.planAction = plan.action;
    plans.push(plan); resultRows.push(...dayResults);
  }
  resultRows.sort((a, b) => a.sourceLine - b.sourceLine);
  for (const row of resultRows) summary[row.action] += 1;
  return { rows: resultRows, summary, plans };
}

function encode(value: string) { return Buffer.from(value).toString("base64url"); }
function decode(value: string) { return Buffer.from(value, "base64url").toString("utf8"); }

export function createPreviewToken(draft: ImportDraft, userId: number | string, projectId: number | string, now = Date.now()): string {
  const payload = encode(JSON.stringify({ v: 1, userId: String(userId), projectId: String(projectId), exp: now + PREVIEW_TOKEN_TTL_MS, draft }));
  const signature = crypto.createHmac("sha256", getPayloadSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyPreviewToken(token: unknown, userId: number | string, projectId: number | string, now = Date.now()): ImportDraft {
  if (typeof token !== "string") throw new Error("缺少预览凭证");
  const parts = token.split(".");
  if (parts.length !== 2) throw new Error("预览凭证格式无效");
  const [payload, signature] = parts;
  if (!payload || !signature) throw new Error("预览凭证格式无效");
  const expected = crypto.createHmac("sha256", getPayloadSecret()).update(payload).digest("base64url");
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error("预览凭证无效");
  let value: { userId?: string; projectId?: string; exp?: number; draft?: ImportDraft };
  try { value = JSON.parse(decode(payload)); } catch { throw new Error("预览凭证无效"); }
  if (value.userId !== String(userId) || value.projectId !== String(projectId)) throw new Error("预览凭证与当前用户或项目不匹配");
  if (!value.exp || value.exp < now) throw new Error("预览凭证已过期，请重新上传并预览");
  if (!value.draft || !value.draft.sourceHash || !Array.isArray(value.draft.rows)) throw new Error("预览草稿无效");
  return value.draft;
}

export async function commitPlanImport(payload: Payload, req: PayloadRequest, projectId: number | string, draft: ImportDraft, diff: PlanDiff, operator: TypedUser) {
  if (validateDraft(draft).blockingErrors?.length) throw new Error("文件级校验失败，禁止导入");
  const changedPlanIds = new Map<string, number | string>();
  const docs: unknown[] = [];
  const items: unknown[] = [];
  for (const plan of diff.plans) {
    if (plan.action === "conflict" || plan.action === "error") continue;
    if (plan.action === "create") {
      const created = await payload.create({ collection: "content-plans", data: { project: Number(projectId), planDate: plan.planDate, dailyTheme: plan.dailyTheme, topic: plan.dailyTheme, title: plan.title, platforms: plan.platforms, status: "uncreated", note: plan.note || undefined }, overrideAccess: true, req, context: { businessAction: "daily-import" } });
      changedPlanIds.set(plan.planDate, created.id); docs.push(created);
    } else if (plan.planId) {
      changedPlanIds.set(plan.planDate, plan.planId);
      if (plan.action === "update") {
        const updated = await payload.update({ collection: "content-plans", id: plan.planId, data: { dailyTheme: plan.dailyTheme, topic: plan.dailyTheme, title: plan.title, platforms: plan.platforms, note: plan.note || null }, overrideAccess: true, req, context: { businessAction: "daily-import-summary" } });
        docs.push(updated);
      }
    }
  }
  for (const row of diff.rows) {
    if (row.action !== "create" && row.action !== "update") continue;
    const planId = row.planId || changedPlanIds.get(row.planDate);
    if (!planId) throw new Error(`第 ${row.sourceLine} 行无法找到每日规划`);
    if (row.action === "create") {
      const created = await payload.create({ collection: "content-plan-items", data: { contentPlan: Number(planId), itemKey: row.itemKey, contentType: normalizeContentType(row.contentType) || "article", articleCategory: row.articleCategory, question: row.question, title: row.title, targetPlatforms: row.targetPlatforms, itemNote: row.itemNote || undefined, sortOrder: row.itemKey.charCodeAt(0), sourceType: "import", sourceFilename: draft.sourceFilename }, overrideAccess: true, req, context: { businessAction: "daily-import" } });
      items.push(created);
    } else if (row.itemId) {
      const updated = await payload.update({ collection: "content-plan-items", id: Number(row.itemId), data: { contentType: normalizeContentType(row.contentType) || "article", articleCategory: row.articleCategory, question: row.question, title: row.title, targetPlatforms: row.targetPlatforms, ...(row.itemNote ? { itemNote: row.itemNote } : {}), sortOrder: row.itemKey.charCodeAt(0), sourceFilename: draft.sourceFilename }, overrideAccess: true, req, context: { businessAction: "daily-import" } });
      items.push(updated);
    }
  }
  for (const planId of new Set(changedPlanIds.values())) await refreshContentPlanStatus(payload, planId, req);
  const batch = await payload.create({ collection: "plan-import-batches", data: { project: Number(projectId), sourceFilename: draft.sourceFilename, sourceHash: draft.sourceHash, sourceFormat: draft.sourceFormat, templateId: draft.templateId, templateVersion: draft.templateVersion, mode: draft.sourceFormat === "xlsx" ? "xlsx" : "legacy", status: "committed", summary: diff.summary, details: diff.rows.map(({ sourceLine, planDate, itemKey, action, reason, changes }) => ({ sourceLine, planDate, itemKey, action, reason, changes })), operator: operator.id }, overrideAccess: true, req, context: { businessAction: "daily-import" } });
  return { batch, docs, items, summary: diff.summary, rows: diff.rows, skipped: diff.rows.filter(row => row.action === "conflict" || row.action === "error") };
}
