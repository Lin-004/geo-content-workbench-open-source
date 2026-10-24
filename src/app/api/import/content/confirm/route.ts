import { normalizeContentType } from "@/lib/content-types";
import { normalizeArticleCategory } from "@/lib/article-categories";
import { headers as getHeaders } from "next/headers";
import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@payload-config";
import { PLATFORMS } from "@/lib/platforms";
import type { PlatformKey } from "@/lib/platforms";
import { textToLexicalBody } from "@/lib/importers";

const platformKeys = new Set(PLATFORMS.map(({ key }) => key));
const isPlatformKey = (key: unknown): key is PlatformKey => typeof key === "string" && platformKeys.has(key as PlatformKey);

export async function POST(request: Request) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await getHeaders() });
  if (!user) return NextResponse.json({ message: "未登录" }, { status: 401 });
  const data = await request.json().catch(() => ({}));
  const contentType = normalizeContentType(data.contentType);
  if (!contentType) return NextResponse.json({ message: "不支持的内容类型" }, { status: 400 });
  const projectId = typeof data.project === "string" || typeof data.project === "number" ? String(data.project).trim() : "";
  const projectRelation = Number(projectId);
  const platforms: PlatformKey[] = Array.isArray(data.targetPlatforms) ? data.targetPlatforms.filter(isPlatformKey) : [];
  if (!projectId || !Number.isSafeInteger(projectRelation) || projectRelation <= 0 || !data.sourceFilename || typeof data.text !== "string" || !data.text.trim() || platforms.length === 0) return NextResponse.json({ message: "项目、文件名、正文和目标平台不能为空" }, { status: 400 });
  let project;
  try {
    project = await payload.findByID({ collection: "projects", id: projectRelation, depth: 0, overrideAccess: false, user });
  } catch {
    return NextResponse.json({ message: "所选项目不存在或无权访问，请刷新页面后重新选择项目" }, { status: 400 });
  }
  if (project.deletedAt) return NextResponse.json({ message: "所选项目已删除，请刷新页面后重新选择项目" }, { status: 400 });
  try {
    const doc = await payload.create({
      collection: "content-assets",
      data: { project: projectRelation, contentPlan: data.contentPlan || undefined, contentPlanItem: data.contentPlanItem || undefined, articleCategory: normalizeArticleCategory(data.articleCategory), question: data.question || undefined, title: String(data.title || data.sourceFilename), contentType, targetPlatforms: platforms, body: data.body?.root ? data.body : textToLexicalBody(data.text), status: "draft", sourceType: "import", sourceFilename: String(data.sourceFilename), plannedPublishDate: typeof data.plannedPublishDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.plannedPublishDate) ? data.plannedPublishDate : undefined },
      user,
    });
    return NextResponse.json({ doc }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "内容资产保存失败，请检查项目和导入内容后重试" }, { status: 400 });
  }
}
