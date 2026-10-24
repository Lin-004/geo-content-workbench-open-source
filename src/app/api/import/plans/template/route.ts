import { NextResponse } from "next/server";
import { createPlanTemplate } from "@/lib/plan-import";
import { headers } from "next/headers";
import { getPayload } from "payload";
import config from "@payload-config";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await headers() });
  if (!user) return NextResponse.json({ message: "未登录" }, { status: 401 });
  const id = Number(new URL(request.url).searchParams.get("project"));
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ message: "请选择项目后下载模板" }, { status: 400 });
  const project = await payload.findByID({ collection: "projects", id, depth: 0, overrideAccess: false, user }).catch(() => null);
  if (!project || project.deletedAt) return NextResponse.json({ message: "项目不存在或已删除" }, { status: 400 });
  const buffer = createPlanTemplate(project);
  return new NextResponse(buffer as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="geo-daily-plan-v2.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
