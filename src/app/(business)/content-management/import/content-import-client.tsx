"use client";
import { CONTENT_TYPE_OPTIONS, normalizeContentType } from "@/lib/content-types";

import { articleCategoryOptions, articleCategoryCode, normalizeArticleCategory } from "@/lib/article-categories";

import { FormEvent, useState } from "react";
import { ContentBody, contentBodyToMarkdown, editedContentBody } from "@/lib/content-body";
import { businessDate } from "@/lib/business-date";
import { Icon } from "../../components/icons";
import { PlatformBadge } from "../../components/business";

type Project = { id: number | string; name: string };
type Plan = { id: number | string; title: string; project?: number | { id: number }; contentAsset?: unknown };
type Platform = { key: string; name: string };
type Item = { contentType?: string | null; id: number | string; contentPlan: number | { id: number }; articleCategory: string; question: string; title?: string | null; targetPlatforms: string[] };
type Preview = { filename: string; title: string; text: string; preview: string; body?: unknown; warnings?: string[] };

export default function ContentImportClient({ projects, plans, platforms, items }: { projects: Project[]; plans: Plan[]; platforms: Platform[]; items: Item[] }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [project, setProject] = useState(projects.length === 1 ? String(projects[0].id) : "");
  const [item, setItem] = useState("");
  const [plan, setPlan] = useState("");
  const [contentType,setContentType] = useState("article");
  const [category,setCategory] = useState("");
  const [question,setQuestion] = useState("");
  const [selected, setSelected] = useState(platforms.slice(0, 3).map((item) => item.key));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  function toggle(key: string) { setSelected((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]); }
  async function parse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setMessage(""); setPreview(null);
    const picked = new FormData(event.currentTarget).get("file");
    if (!(picked instanceof File) || !picked.size) { setError("请选择要导入的文件"); return; }
    setFile(picked); setParsing(true);
    try {
      const upload = new FormData(); upload.append("file", picked);
      const response = await fetch("/api/import/content/preview", { method: "POST", body: upload });
      const result = await response.json().catch(() => ({})) as Partial<Preview> & { message?: string };
      if (!response.ok) throw new Error(result.message || "解析失败");
      if (!result.filename || !result.title || typeof result.text !== "string") throw new Error("解析结果不完整，请重试");
      setPreview(result as Preview);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "解析失败");
    } finally { setParsing(false); }
  }
  async function confirm() {
    if (!preview || !project || !selected.length) { setError("请先完成解析，并选择项目和发布平台"); return; }
    const plannedPublishDate = (document.querySelector(".import-preview-card input[type=date]") as HTMLInputElement | null)?.value || "";
    setError(""); setMessage(""); setSaving(true);
    try {
      const response = await fetch("/api/import/content/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project, contentType, title: preview.title, targetPlatforms: selected, sourceFilename: preview.filename, text: preview.text, body: preview.body, contentPlanItem: item || undefined, contentPlan: plan || undefined, articleCategory: category || undefined, question, plannedPublishDate }) });
      const result = await response.json().catch(() => ({})) as { message?: string; doc?: { title?: string } };
      if (!response.ok) throw new Error(result.message || "导入失败");
      window.location.assign("/content-management");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "导入失败");
    } finally { setSaving(false); }
  }
  return <div className="page-content"><div className="page-heading"><div><div className="crumb-link"><a href="/content-management">内容资产管理</a><span>/</span><span>导入内容</span></div><h1 className="page-title">导入内容资产</h1><p className="page-subtitle">上传文档，自动解析为结构化内容资产</p></div><div className="heading-actions"><a className="secondary-button" href="/content-management">取消</a></div></div><section className="panel"><div className="stepper"><div className="step active"><span className="step-number">1</span><span>上传文件</span></div><div className="step active"><span className="step-number">2</span><span>解析预览</span></div><div className="step"><span className="step-number">3</span><span>确认入库</span></div></div><div className="import-columns"><section className="import-side-card"><h3>上传文件</h3><form onSubmit={parse}><label className="file-drop"><Icon name="upload" size={35} /><div><strong>点击选择文件</strong><span>支持 md、docx、pdf</span></div><input hidden name="file" type="file" accept=".md,.markdown,.docx,.pdf" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label><p className="form-help">单个文件不超过 10MB</p><button className="primary-button full-button" type="submit" disabled={parsing}>{parsing ? "解析中…" : "解析预览"}</button></form>{file && <div className="uploaded-file"><span className="file-symbol"><Icon name="file" size={17} /></span><div><strong>{file.name}</strong><small>{(file.size / 1024 / 1024).toFixed(1)}MB</small></div><span className="success-mark"><Icon name="check" size={18} /></span></div>}</section><section className="import-preview-card"><h3>解析预览</h3>{preview ? <><div className="parse-alert"><Icon name="info" size={15} />以下为完整解析结果，请核对标题、正文与表格后保存。</div><div className="form-grid"><label className="form-field"><span className="form-label required">标题</span><input className="form-control" value={preview.title} onChange={(event) => setPreview({ ...preview, title: event.target.value })} /></label><label className="form-field"><span className="form-label required">所属项目</span><select className="form-control" value={project} onChange={(event) => { setProject(event.target.value); setPlan(""); setItem(""); }}><option value="">选择项目</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="form-field"><span className="form-label">每日规划</span><select className="form-control" value={plan} onChange={e=>{setPlan(e.target.value);setItem("");}}><option value="">不关联规划</option>{plans.filter(p=>!project || String(typeof p.project === "object" ? p.project.id : p.project)===project).map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label><label className="form-field"><span className="form-label">文章规划项</span><select className="form-control" value={item} onChange={e=>{setItem(e.target.value); const picked=items.find(i=>String(i.id)===e.target.value); if(picked){setContentType(normalizeContentType(picked.contentType) || "article");setCategory(picked.articleCategory);setQuestion(picked.question);setSelected(picked.targetPlatforms);}}}><option value="">不关联文章规划项</option>{items.filter(i=>String(typeof i.contentPlan === "object" ? i.contentPlan.id : i.contentPlan)===plan).map(i=><option key={i.id} value={i.id}>{i.title || i.question}</option>)}</select></label><label className="form-field"><span className="form-label">内容类型</span><select className="form-control" aria-label="内容类型" value={contentType} disabled={Boolean(item)} onChange={e=>{setContentType(e.target.value);setSelected(e.target.value === "video_script" ? platforms.filter(p=>["douyin","wechat_channels"].includes(p.key)).map(p=>p.key) : platforms.slice(0,3).map(p=>p.key));}}>{CONTENT_TYPE_OPTIONS.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}</select></label><label className="form-field"><span className="form-label">内容分类</span><input className="form-control" list="import-category-options" value={articleCategoryCode(category)} readOnly={Boolean(item)} onChange={e=>setCategory(e.target.value)} placeholder="已有分类或自定义编码，如 D" /><datalist id="import-category-options">{articleCategoryOptions(items.map(i=>i.articleCategory)).map(c=><option key={c.value} value={articleCategoryCode(c.value)}>{c.label}</option>)}</datalist></label><label className="form-field full"><span className="form-label">问题</span><input className="form-control" value={question} onChange={e=>setQuestion(e.target.value)} /></label><div className="form-field full"><span className="form-label required">发布平台</span><div className="platform-select">{platforms.map((item) => <button className={`platform-check${selected.includes(item.key) ? " selected" : ""}`} key={item.key} type="button" onClick={() => toggle(item.key)}>{selected.includes(item.key) ? "✓" : "＋"}{item.name}</button>)}</div></div><label className="form-field"><span className="form-label required">计划发布日期</span><input className="form-control" type="date" defaultValue={businessDate()} /></label></div><div className="parsed-content"><div className="panel-heading"><h4>结构化内容预览</h4><span className="hint">共 {preview.text.length} 字</span></div><ContentBody body={preview.body || editedContentBody(undefined, preview.text)} /><label className="form-field"><span className="form-label">调整正文（Markdown）</span><textarea className="form-control" rows={8} defaultValue={contentBodyToMarkdown(preview.body)} onChange={e=>setPreview({...preview,text:e.target.value,body:editedContentBody(preview.body,e.target.value)})} /></label>{preview.warnings?.map((w,i)=><p className="notice" key={i}>{w}</p>)}</div></> : <div className="empty-state">上传文件后显示解析结果</div>}</section><aside className="import-side-card"><h3>解析结果</h3><div className="result-list"><div className="result-item"><span className="result-icon"><Icon name="content" size={19} /></span><div><strong>字数</strong><span>{preview?.text.length || 0}</span></div></div><div className="result-item"><span className="result-icon"><Icon name="check" size={19} /></span><div><strong>提取标题</strong><span>{preview ? "成功" : "等待解析"}</span></div></div><div className="result-item"><span className="result-icon"><Icon name="file" size={19} /></span><div><strong>正文结构</strong><span>{preview ? "待人工核对" : "等待解析"}</span></div></div></div><p className="notice"><Icon name="info" size={14} />结果仅供参考，请在保存前确认内容准确性。</p></aside></div><div className="import-bottom-actions">{error && <span className="error">{error}</span>}{message && <span className="success">{message}</span>}<button className="secondary-button" type="button" onClick={() => { setPreview(null); setError(""); setMessage(""); }}>重新解析</button><a className="secondary-button" href="/content-management">取消</a><button className="primary-button" type="button" disabled={saving || parsing || !preview} onClick={confirm}>{saving ? "保存中…" : "保存为内容资产"}</button></div></section></div>;
}
