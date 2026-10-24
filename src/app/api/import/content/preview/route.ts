import { headers as getHeaders } from "next/headers";
import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@payload-config";
import { detectImportFormat, extractContentBody, titleFromImport } from "@/lib/importers";

export async function POST(request: Request) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await getHeaders() });
  if (!user) return NextResponse.json({ message: "未登录" }, { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ message: "请选择文件" }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ message: "文件不能超过 10MB" }, { status: 400 });
  if (!detectImportFormat(file.name)) return NextResponse.json({ message: "只支持 Markdown、DOCX、PDF 文件" }, { status: 400 });
  try {
    const { format, text, body, warnings, title } = await extractContentBody(file.name, Buffer.from(await file.arrayBuffer()));
    if (!text) return NextResponse.json({ message: "文件没有可导入的正文" }, { status: 400 });
    return NextResponse.json({ filename: file.name, format, body, warnings, title: title || titleFromImport(file.name, text), text, preview: text.slice(0, 2000) });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "文件解析失败" }, { status: 400 });
  }
}
