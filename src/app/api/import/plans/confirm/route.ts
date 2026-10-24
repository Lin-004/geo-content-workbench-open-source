import { headers as getHeaders } from "next/headers";
import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@payload-config";
import { businessTransaction } from "@/lib/business-transaction";
import { calculatePlanDiff, commitPlanImport, validateDraft, verifyPreviewToken } from "@/lib/plan-import";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await getHeaders() });
  if (!user) return NextResponse.json({ message: "未登录" }, { status: 401 });
  const data = await request.json().catch(() => ({}));
  const projectId = Number(data.project);
  if (!Number.isSafeInteger(projectId) || projectId <= 0) return NextResponse.json({ message: "项目不能为空" }, { status: 400 });
  try {
    const result = await businessTransaction(payload, user, async (req) => {
      req.context = { ...req.context, businessAction: "daily-import" };
      const project = await payload.findByID({ collection: "projects", id: projectId, depth: 0, overrideAccess: false, user, req });
      if (project.deletedAt) throw new Error("所选项目已删除，请重新选择项目");
      const draft = validateDraft(verifyPreviewToken(data.previewToken, user.id, projectId), project);
      const diff = await calculatePlanDiff(payload, projectId, draft, req);
      if (draft.blockingErrors?.length || diff.summary.create + diff.summary.update + diff.summary.unchanged === 0) return { conflict: true as const, blockingErrors: draft.blockingErrors, rows: diff.rows, plans: diff.plans, summary: diff.summary };
      return { conflict: false as const, ...await commitPlanImport(payload, req, projectId, draft, diff, user) };
    });
    if (result.conflict) return NextResponse.json({ ...result, message: result.blockingErrors?.length ? result.blockingErrors.join("；") : "没有可导入的有效记录，全部记录已跳过" }, { status: 409 });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "导入失败，本批次未保存" }, { status: 400 });
  }
}
