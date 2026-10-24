import crypto from "node:crypto";
import { headers as getHeaders } from "next/headers";
import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@payload-config";
import { detectImportFormat, extractImportText } from "@/lib/importers";
import { calculatePlanDiff, createPreviewToken, normalizeTargetPlatforms, parseLegacyPlanText, parseXlsxV1, validateDraft, type PlanImportFormat } from "@/lib/plan-import";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await getHeaders() });
  if (!user) return NextResponse.json({ message: "未登录" }, { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  const projectValue = String(form.get("project") || "").trim();
  const projectId = Number(projectValue);
  if (!(file instanceof File)) return NextResponse.json({ message: "请选择文件" }, { status: 400 });
  if (!Number.isSafeInteger(projectId) || projectId <= 0) return NextResponse.json({ message: "请先选择项目" }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ message: "文件不能超过 10MB" }, { status: 400 });
  const extension = file.name.toLowerCase().split(".").pop() || "";
  const detected = detectImportFormat(file.name);
  const sourceFormat: PlanImportFormat | null = extension === "xlsx" ? "xlsx" : detected === "docx" ? "docx" : detected === "md" ? "md" : null;
  if (!sourceFormat) return NextResponse.json({ message: "规划导入只支持当前版本 XLSX、Markdown 或 DOCX" }, { status: 400 });
  let project;
  try {
    project = await payload.findByID({ collection: "projects", id: projectId, depth: 0, overrideAccess: false, user });
  } catch {
    return NextResponse.json({ message: "所选项目不存在或无权访问，请刷新页面后重新选择项目" }, { status: 400 });
  }
  if (project.deletedAt) return NextResponse.json({ message: "所选项目已删除，请刷新页面后重新选择项目" }, { status: 400 });
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const sourceHash = crypto.createHash("sha256").update(buffer).digest("hex");
    const fallbackPlatforms = normalizeTargetPlatforms(form.get("legacyPlatforms"));
    let draft;
    if (sourceFormat === "xlsx") draft = parseXlsxV1(buffer, file.name, sourceHash);
    else {
      const { text } = await extractImportText(file.name, buffer);
      draft = parseLegacyPlanText(text, file.name, sourceFormat, sourceHash, fallbackPlatforms.length ? fallbackPlatforms : ["toutiao"]);
    }
    draft = validateDraft(draft, project);
    const diff = await calculatePlanDiff(payload, projectId, draft);
    const previewToken = createPreviewToken(draft, user.id, projectId);
    return NextResponse.json({ filename: file.name, format: sourceFormat, legacy: sourceFormat !== "xlsx", templateId: draft.templateId, templateVersion: draft.templateVersion, sourceHash, warnings: draft.warnings, errors: draft.errors, blockingErrors: draft.blockingErrors, rows: diff.rows, plans: diff.plans, summary: diff.summary, previewToken, expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString() });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "文件解析失败" }, { status: 400 });
  }
}
