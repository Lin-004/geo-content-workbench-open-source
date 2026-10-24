"use client";

import { FormEvent, useState } from "react";

type Project = { id: number | string; name: string };
type Plan = { id: number | string; title: string; planDate?: string; dailyTheme?: string | null; contentAsset?: unknown };
type Platform = { key: string; name: string };
type ContentPreview = { filename: string; title: string; text: string; preview: string };
type PlanRow = { line: number; planDate: string; topic: string; title: string; error?: string };

export default function ImportsClient({ projects, plans, platforms }: { projects: Project[]; plans: Plan[]; platforms: Platform[] }) {
  const [contentPreview, setContentPreview] = useState<ContentPreview | null>(null);
  const [planPreview, setPlanPreview] = useState<{ filename: string; rows: PlanRow[] } | null>(null);
  const [contentProject, setContentProject] = useState("");
  const [planProject, setPlanProject] = useState("");
  const [contentPlan, setContentPlan] = useState("");
  const [contentPlatforms, setContentPlatforms] = useState<string[]>([]);
  const [planPlatforms, setPlanPlatforms] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function toggle(current: string[], key: string, setter: (value: string[]) => void) { setter(current.includes(key) ? current.filter((item) => item !== key) : [...current, key]); }
  async function preview(event: FormEvent<HTMLFormElement>, endpoint: string, kind: "content" | "plans") {
    event.preventDefault(); setError(""); setMessage("");
    const file = new FormData(event.currentTarget).get("file");
    const form = new FormData(); if (file instanceof File) form.append("file", file); else { setError("请选择文件"); return; }
    const response = await fetch(endpoint, { method: "POST", body: form }); const result = await response.json();
    if (!response.ok) { setError(result.message || "预览失败"); return; }
    if (kind === "content") setContentPreview(result); else setPlanPreview(result);
  }
  async function confirmContent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setMessage(""); if (!contentPreview || !contentProject || contentPlatforms.length === 0) { setError("请先预览文件，并选择项目和平台"); return; }
    const form = new FormData(event.currentTarget); const response = await fetch("/api/import/content/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project: contentProject, contentPlan: contentPlan || undefined, title: form.get("title"), targetPlatforms: contentPlatforms, sourceFilename: contentPreview.filename, text: contentPreview.text }) }); const result = await response.json();
    if (!response.ok) { setError(result.message || "内容导入失败"); return; } setMessage("内容导入成功"); setContentPreview(null);
  }
  async function confirmPlans() {
    setError(""); setMessage(""); if (!planPreview || !planProject || planPlatforms.length === 0) { setError("请先预览文件，并选择项目和平台"); return; }
    if (planPreview.rows.some((row) => row.error)) { setError("预览中有无效行，不能确认导入"); return; }
    const response = await fetch("/api/import/plans/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project: planProject, platforms: planPlatforms, rows: planPreview.rows }) }); const result = await response.json();
    if (!response.ok) { setError(result.message || "规划导入失败"); return; } setMessage(`规划导入成功，共 ${result.docs.length} 条`); setPlanPreview(null);
  }
  return <div className="business-shell"><header className="business-header"><div><a className="back-link" href="/">← 工作看板</a><h1>文件导入</h1><p>先预览解析结果，再确认写入；规划导入只追加，不覆盖已有规划。</p></div><div className="header-actions"><a className="secondary-button" href="/assets">内容资产</a><a className="secondary-button" href="/plans">项目规划</a></div></header>{(error || message) && <p className={error ? "error page-error" : "success page-error"}>{error || message}</p>}<div className="import-grid"><section className="card"><h2>导入内容</h2><form className="business-form" onSubmit={(event) => preview(event, "/api/import/content/preview", "content")}><label>文件（MD / DOCX / PDF）<input name="file" type="file" accept=".md,.markdown,.docx,.pdf" required /></label><button className="secondary-button" type="submit">解析预览</button></form>{contentPreview && <form className="business-form import-confirm" onSubmit={confirmContent}><p className="preview-box">文件：{contentPreview.filename}<br />预览：{contentPreview.preview}</p><label>项目<select value={contentProject} onChange={(event) => setContentProject(event.target.value)} required><option value="">选择项目</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label>关联规划<select value={contentPlan} onChange={(event) => setContentPlan(event.target.value)}><option value="">不关联</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.planDate?.slice(0, 10)} {plan.dailyTheme || plan.title}</option>)}</select></label><label>标题<input name="title" defaultValue={contentPreview.title} required /></label><fieldset><legend>目标平台</legend><div className="platform-options">{platforms.map((platform) => <label className="check-option" key={platform.key}><input type="checkbox" checked={contentPlatforms.includes(platform.key)} onChange={() => toggle(contentPlatforms, platform.key, setContentPlatforms)} />{platform.name}</label>)}</div></fieldset><button className="primary-button" type="submit">确认导入内容</button></form>}</section><section className="card"><h2>导入规划</h2><form className="business-form" onSubmit={(event) => preview(event, "/api/import/plans/preview", "plans")}><label>文件（MD / DOCX）<input name="file" type="file" accept=".md,.markdown,.docx" required /></label><button className="secondary-button" type="submit">解析预览</button></form>{planPreview && <div className="import-confirm"><p className="preview-box">文件：{planPreview.filename}</p><div className="preview-table"><div className="preview-row preview-head"><span>行</span><span>日期</span><span>主题</span><span>标题 / 错误</span></div>{planPreview.rows.map((row) => <div className="preview-row" key={row.line}><span>{row.line}</span><span>{row.planDate}</span><span>{row.topic}</span><span className={row.error ? "row-error" : ""}>{row.error || row.title}</span></div>)}</div><label>项目<select value={planProject} onChange={(event) => setPlanProject(event.target.value)} required><option value="">选择项目</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><fieldset><legend>目标平台</legend><div className="platform-options">{platforms.map((platform) => <label className="check-option" key={platform.key}><input type="checkbox" checked={planPlatforms.includes(platform.key)} onChange={() => toggle(planPlatforms, platform.key, setPlanPlatforms)} />{platform.name}</label>)}</div></fieldset><button className="primary-button" type="button" onClick={confirmPlans}>确认追加规划</button></div>}</section></div></div>;
}
