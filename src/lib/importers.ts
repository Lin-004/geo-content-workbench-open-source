import { parseHTML } from "linkedom/worker";
import { documentToContentBody } from "./html-body";
import { contentBodyToPlainText, markdownToContentBody } from "./content-body";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import path from "node:path";
import type { PlatformKey } from "@/lib/platforms";

export type ImportFormat = "md" | "docx" | "pdf";
export type ArticleCategory = string;
export type PlanningRow = { line: number; planDate: string; topic: string; title: string; articleCategory?: ArticleCategory; question?: string; targetPlatforms?: string[]; error?: string };
export type DailyPlanningArticle = { line: number; category: ArticleCategory; categoryLabel: string; question: string; title: string; targetPlatforms: PlatformKey[] };
export type DailyPlanning = { planDate: string; topic: string; title: string; note?: string; articles: DailyPlanningArticle[] };

function extension(filename: string): string {
  return filename.toLowerCase().split(".").pop() || "";
}

export function detectImportFormat(filename: string): ImportFormat | null {
  const ext = extension(filename);
  return ext === "md" || ext === "markdown" ? "md" : ext === "docx" ? "docx" : ext === "pdf" ? "pdf" : null;
}

export async function extractImportText(filename: string, buffer: Buffer): Promise<{ format: ImportFormat; text: string }> {
  const format = detectImportFormat(filename);
  if (!format) throw new Error("只支持 Markdown、DOCX、PDF 文件");
  if (format === "md") return { format, text: buffer.toString("utf8").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim() };
  if (format === "docx") return { format, text: (await mammoth.extractRawText({ buffer })).value.trim() };

  PDFParse.setWorker(path.join(process.cwd(), "node_modules/pdf-parse/dist/worker/pdf.worker.mjs"));
  const parser = new PDFParse({ data: buffer });
  try {
    return { format, text: (await parser.getText({ lineEnforce: true })).text.trim() };
  } finally {
    await parser.destroy();
  }
}

export function titleFromImport(filename: string, text: string) {
  const heading = text.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading || filename.replace(/\.[^.]+$/, "");
}

function splitTableRow(line: string) {
  return line.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((cell) => cell.trim());
}

function headerIndex(headers: string[], keywords: string[]) {
  return headers.findIndex((header) => keywords.some((keyword) => header.includes(keyword)));
}

export function parsePlanningText(text: string): PlanningRow[] {
  const lines = text.split("\n").map((value, index) => ({ value: value.trim(), line: index + 1 })).filter(({ value }) => value);
  const tableLines = lines.filter(({ value }) => value.startsWith("|") && value.endsWith("|"));
  if (tableLines.length >= 2) {
    const headers = splitTableRow(tableLines[0].value);
    const dateAt = headerIndex(headers, ["日期", "date"]);
    const topicAt = headerIndex(headers, ["主题", "topic"]);
    const titleAt = headerIndex(headers, ["标题", "title"]);
    const rows: PlanningRow[] = [];
    for (const item of tableLines.slice(1)) {
      const cells = splitTableRow(item.value);
      if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
      const planDate = dateAt >= 0 ? cells[dateAt] || "" : cells.find((cell) => /^\d{4}-\d{1,2}-\d{1,2}$/.test(cell)) || "";
      const title = titleAt >= 0 ? cells[titleAt] || "" : cells.find((cell) => cell && cell !== planDate) || "";
      const topic = topicAt >= 0 ? cells[topicAt] || title : title;
      rows.push({ line: item.line, planDate, topic, title, error: !/^\d{4}-\d{1,2}-\d{1,2}$/.test(planDate) ? "日期必须是 YYYY-MM-DD" : !title ? "标题不能为空" : undefined });
    }
    return rows;
  }

  return lines.map(({ value, line }) => {
    const match = value.match(/^(\d{4}-\d{1,2}-\d{1,2})\s*[-|：:]?\s*(.+)$/);
    if (!match) return { line, planDate: "", topic: value, title: value, error: "未识别日期，格式示例：2026-09-01｜标题" };
    return { line, planDate: match[1], topic: match[2].trim(), title: match[2].trim(), error: undefined };
  });
}

const categoryInfo: Record<string, { category: ArticleCategory; label: string; targetPlatforms: PlatformKey[] }> = {
  A: { category: "enterprise", label: "A类·企业号", targetPlatforms: ["toutiao"] },
  B: { category: "general", label: "B类·综合自媒体", targetPlatforms: ["toutiao", "wechat", "zhihu"] },
  C: { category: "vertical", label: "C类·垂直生活类", targetPlatforms: ["ctrip", "meipian"] },
};

function normalizePlanningDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Parse the daily A/B/C planning format used by the weekly DOCX. */
export function parseDailyPlanningText(text: string): DailyPlanning[] | null {
  const year = Number(text.match(/(20\d{2})年/)?.[1] || new Date().getFullYear());
  const lines = text.split("\n").map((value, index) => ({ value: value.replace(/\u00a0/g, " ").trim(), line: index + 1 })).filter(({ value }) => value);
  const plans: DailyPlanning[] = [];
  let current: DailyPlanning | undefined;
  for (const item of lines) {
    const heading = item.value.match(/^(?:#{1,6}\s*)?(\d{1,2})月(\d{1,2})日(?:\s*周[一二三四五六日天])?\s*[｜|]\s*(.+)$/);
    if (heading) {
      current = { planDate: normalizePlanningDate(year, Number(heading[1]), Number(heading[2])), topic: heading[3].trim(), title: heading[3].trim(), articles: [] };
      plans.push(current);
      continue;
    }
    if (!current) continue;
    const article = item.value.match(/^([ABC])类[^：:]*[:：]\s*问题[:：]\s*(.+)$/);
    if (article) {
      const info = categoryInfo[article[1]];
      const body = article[2].trim();
      const focusIndex = body.search(/重点[:：]/);
      const questionAndTitle = (focusIndex >= 0 ? body.slice(0, focusIndex) : body).trim().replace(/[。．]\s*$/, "");
      const titleMatch = questionAndTitle.match(/标题[:：]\s*[《「](.*?)[》」]\s*$/);
      const title = titleMatch?.[1]?.trim() || `待补充标题：${questionAndTitle.replace(/\s*标题[:：].*$/, "").trim()}`;
      const question = questionAndTitle.replace(/\s*标题[:：].*$/, "").trim();
      if (!question) continue;
      current.articles.push({ line: item.line, category: info.category, categoryLabel: info.label, question, title, targetPlatforms: info.targetPlatforms });
      continue;
    }
    const note = item.value.match(/^官网动作[:：]\s*(.+)$/);
    if (note) current.note = note[1].trim();
  }
  if (plans.length === 0 || plans.some((plan) => plan.articles.length === 0)) return null;
  return plans;
}

export function textToLexicalBody(text: string) {
  return { root: { type: "root", version: 1, format: "" as const, indent: 0, direction: "ltr" as const, children: text.split("\n").map((line) => ({ type: "paragraph", version: 1, format: "" as const, indent: 0, direction: "ltr" as const, children: line ? [{ type: "text", version: 1, text: line, mode: "normal", style: "", detail: 0, format: 0 }] : [] })) } };
}

export async function extractContentBody(filename: string, buffer: Buffer) {
  if (detectImportFormat(filename) === "docx") {
    const result = await mammoth.convertToHtml({buffer});
    const {document} = parseHTML(`<html><body>${result.value}</body></html>`);
    const body = documentToContentBody(document as unknown as Document);
    return {format:"docx",title:document.querySelector("h1,h2")?.textContent?.trim() || undefined,body,text:contentBodyToPlainText(body),warnings:result.messages.map(m=>m.message)};
  }
  const extracted = await extractImportText(filename,buffer);
  return {...extracted,title:undefined,body:extracted.format === "md" ? markdownToContentBody(extracted.text) : textToLexicalBody(extracted.text),warnings:extracted.format === "pdf" ? ["PDF 按文本导入，请核对表格、图片及段落顺序。"] : []};
}
