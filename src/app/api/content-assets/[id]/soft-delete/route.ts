import { headers as getHeaders } from "next/headers";
import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@payload-config";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await getHeaders() });
  if (!user) return NextResponse.json({ message: "未登录" }, { status: 401 });

  const { id } = await params;
  const asset = await payload.findByID({ collection: "content-assets", id, depth: 0, overrideAccess: true });
  const published = await payload.find({
    collection: "publication-tasks",
    where: { and: [{ contentAsset: { equals: id } }, { status: { equals: "published" } }] },
    limit: 1,
    overrideAccess: true,
  });
  if (published.totalDocs > 0) return NextResponse.json({ message: "该内容已有平台发布记录，不允许删除" }, { status: 409 });
  if (asset.deletedAt) return NextResponse.json({ doc: asset });

  const doc = await payload.update({
    collection: "content-assets",
    id,
    data: { deletedAt: new Date().toISOString() },
    overrideAccess: true,
    user,
  });
  return NextResponse.json({ doc });
}
