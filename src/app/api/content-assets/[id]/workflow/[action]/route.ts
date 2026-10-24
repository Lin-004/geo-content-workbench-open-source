import { headers as getHeaders } from "next/headers";
import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@payload-config";
import { transitionAsset } from "@/lib/content-workflow";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; action: string }> }) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await getHeaders() });
  if (!user) return NextResponse.json({ message: "未登录" }, { status: 401 });

  const { id, action } = await params;
  if (!(["submit", "approve", "reject"] as string[]).includes(action)) return NextResponse.json({ message: "不支持的审核动作" }, { status: 400 });
  const body = await request.json().catch(() => ({}));
  try {
    const doc = await transitionAsset(payload, id, action as "submit" | "approve" | "reject", user, body.comment);
    return NextResponse.json({ doc });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "审核动作失败" }, { status: 409 });
  }
}
