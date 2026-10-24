import { headers as getHeaders } from "next/headers";
import { NextResponse } from "next/server";
import { getPayload } from "payload";
import { businessTransaction } from "@/lib/business-transaction";
import { businessError } from "@/lib/business-error";
import config from "@payload-config";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await getHeaders() });
  if (!user) return NextResponse.json({ message: "未登录" }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const publishedUrl = typeof body.publishedUrl === "string" ? body.publishedUrl.trim() : "";
  try { const url = new URL(publishedUrl); if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error(); }
  catch { return NextResponse.json({ message: "请填写完整的已发布文章 http(s) 链接" }, { status: 400 }); }
  try {
  const doc = await businessTransaction(payload, user, async req => {

  const task = await payload.findByID({ collection: "publication-tasks", id, depth: 0, overrideAccess: true, req });
  if (task.status !== "pending" || task.cancelledAt) throw businessError("只有有效的待发布任务可以确认");
  const asset = await payload.findByID({ collection: "content-assets", id: typeof task.contentAsset === "object" ? task.contentAsset.id : task.contentAsset, depth: 0, overrideAccess: true, req });
  if (asset.status !== "approved" || asset.deletedAt) throw businessError("内容未处于可发布状态");

  return payload.update({
    collection: "publication-tasks",
    id,
    data: { status: "published", publishedAt: new Date().toISOString(), publishedBy: user.id, publishedUrl },
    overrideAccess: true,
    user, req,
    context: { businessAction: "publication-confirmation" },
  });
  });
  return NextResponse.json({ doc });
  } catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : "发布确认失败，请刷新后重试" }, { status: 409 }); }
}
