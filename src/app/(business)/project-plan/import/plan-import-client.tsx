"use client";
import { contentTypeLabel } from "@/lib/content-types";

import { articleCategoryLabel } from "@/lib/article-categories";

import { FormEvent, useMemo, useState } from "react";
import { Icon } from "../../components/icons";
import { PlatformBadge } from "../../components/business";

type Project = { id: number | string; name: string };
type Platform = { key: string; name: string };
type Action = "create" | "update" | "unchanged" | "conflict" | "error";
type PreviewRow = { contentType?: string; sourceLine: number; planDate: string; dailyTheme: string; itemKey: string; articleCategory: string; question: string; title: string; targetPlatforms: string[]; note: string; itemNote?: string; action: Action; reason: string; changes: string[]; planAction: Action };
type Preview = { templateVersion: number; filename: string; format: string; legacy: boolean; warnings: string[]; errors: string[]; blockingErrors?: string[]; rows: PreviewRow[]; plans: Array<{ planDate: string }>; summary: Record<Action, number>; previewToken: string; expiresAt: string };

const actionNames: Record<Action, string> = { create: "新增", update: "更新", unchanged: "无变化", conflict: "冲突", error: "错误" };

export default function PlanImportClient({ project, platforms }: { project: Project; platforms: Platform[] }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [selectedLegacyPlatforms, setSelectedLegacyPlatforms] = useState(platforms.slice(0, 1).map((item) => item.key));
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const period = useMemo(() => {
    const dates = preview?.rows.map((row) => row.planDate).filter(Boolean).sort() || [];
    return dates.length ? `${dates[0]} ～ ${dates[dates.length - 1]}` : "—";
  }, [preview]);
  const importable = preview ? preview.summary.create + preview.summary.update + preview.summary.unchanged : 0;
  const skipped = preview ? preview.summary.conflict + preview.summary.error : 0;
  const blockingErrors = preview?.blockingErrors || preview?.errors.filter(error => !/^第 \d+ 行：/.test(error)) || [];
  const canConfirm = Boolean(preview && !blockingErrors.length && importable > 0 && !message);

  async function parse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setMessage(""); setPreview(null);
    const picked = new FormData(event.currentTarget).get("file");
    if (!(picked instanceof File) || !picked.size) { setError("请选择要导入的文件"); return; }
    setFile(picked); setParsing(true);
    try {
      const form = new FormData(); form.append("file", picked); form.append("project", String(project.id)); form.append("legacyPlatforms", selectedLegacyPlatforms.join(","));
      const response = await fetch("/api/import/plans/preview", { method: "POST", body: form });
      const result = await response.json().catch(() => ({})) as Partial<Preview> & { message?: string };
      if (!response.ok) throw new Error(result.message || "解析失败");
      setPreview(result as Preview);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "解析失败"); }
    finally { setParsing(false); }
  }

  async function confirm() {
    if (!preview || !canConfirm) { setError("文件校验失败或没有有效记录，不能确认导入"); return; }
    setError(""); setMessage(""); setSaving(true);
    try {
      const response = await fetch("/api/import/plans/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project: String(project.id), previewToken: preview.previewToken }) });
      const result = await response.json().catch(() => ({})) as { message?: string; summary?: Record<Action, number>; rows?: PreviewRow[] };
      if (!response.ok) throw new Error(result.message || "导入失败");
      setMessage(`已完成导入，新增 ${result.summary?.create || 0} 条，更新 ${result.summary?.update || 0} 条，无变化 ${result.summary?.unchanged || 0} 条，已跳过 ${(result.summary?.conflict || 0) + (result.summary?.error || 0)} 条`);
      setPreview((current) => current ? { ...current, summary: result.summary || current.summary, rows: result.rows || current.rows } : current);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "导入失败"); }
    finally { setSaving(false); }
  }

  function toggleLegacyPlatform(key: string) { setSelectedLegacyPlatforms((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]); }

  return <div className="page-content">
    <div className="page-heading"><div><div className="crumb-link"><a href={`/project-management/detail/${project.id}`}>{project.name}</a><span>/</span><span>导入每日规划</span></div><h1 className="page-title">导入每日规划</h1><p className="page-subtitle">下载当前版本 XLSX 模板，上传后先校验差异，再确认写入</p></div><div className="heading-actions"><a className="secondary-button" href={`/api/import/plans/template?project=${project.id}`}><Icon name="download" size={16} />下载最新 XLSX 模板</a><a className="secondary-button" href={`/project-management/detail/${project.id}`}>取消</a></div></div>
    <p className="notice">当前导入项目：<strong>{project.name}</strong>。请核对文件属于该项目；下载的模板已绑定当前项目。</p><section className="panel">
      <div className="stepper"><div className="step active"><span className="step-number">1</span><span>下载 / 上传</span></div><div className={`step${preview ? " active" : ""}`}><span className="step-number">2</span><span>校验和差异预览</span></div><div className={`step${message ? " active" : ""}`}><span className="step-number">3</span><span>确认写入</span></div></div>
      <div className="import-columns">
        <section className="import-side-card"><h3>上传文件</h3><form onSubmit={parse}><label className="file-drop"><Icon name="upload" size={35} /><div><strong>点击选择文件</strong><span>支持 XLSX、MD、DOCX</span></div><input hidden name="file" type="file" accept=".xlsx,.md,.markdown,.docx" onChange={(event) => { setFile(event.target.files?.[0] || null); setPreview(null); setMessage(""); setError(""); }} /></label><p className="form-help">单个文件不超过 10MB；旧格式预览会明确标记</p>{selectedLegacyPlatforms.length === 0 && <p className="error">旧格式缺少平台时请选择至少一个平台</p>}<div className="inline-platforms">{platforms.map((item) => <button className={`platform-choice${selectedLegacyPlatforms.includes(item.key) ? " selected" : ""}`} type="button" key={item.key} onClick={() => toggleLegacyPlatform(item.key)}><PlatformBadge platform={item.key} /></button>)}</div><button className="primary-button full-button" type="submit" disabled={parsing}>{parsing ? "解析中…" : "解析并预览"}</button></form>{file && <div className="uploaded-file"><span className="file-symbol"><Icon name="file" size={17} /></span><div><strong>{file.name}</strong><small>{(file.size / 1024 / 1024).toFixed(1)}MB</small></div><span className="success-mark"><Icon name="check" size={18} /></span></div>}</section>
        <section className="import-preview-card"><h3>{preview?.legacy ? "旧格式兼容预览" : "XLSX 差异预览"}</h3>{preview ? <><div className="form-grid"><label className="form-field"><span className="form-label">当前项目</span><input className="form-control" value={project.name} readOnly /></label><div className="form-field"><span className="form-label">规划日期范围</span><input className="form-control" value={period} readOnly /></div><div className="form-field full"><span className="form-label">来源</span><div className={preview.legacy ? "notice" : "success notice"}>{preview.legacy ? "旧格式已解析；请核对当前项目及每条选题，建议下次使用 XLSX" : `${project.name} · XLSX 模板 v${preview.templateVersion} · 预览有效期 15 分钟`}</div></div></div><div className="result-list import-summary">{(["create", "update", "unchanged", "conflict", "error"] as Action[]).map((action) => <div className="result-item" key={action}><span className={`status-pill status-${action}`}>{actionNames[action]}</span><div><strong>{actionNames[action]}</strong><span>{preview.summary[action] || 0} 条</span></div></div>)}</div>{preview.warnings.length > 0 && <div className="notice">提示：{preview.warnings.join("；")}</div>}{preview.errors.length > 0 && <div className="notice error" role="alert">{preview.errors.join("；")}</div>}<div className="data-table-wrap"><table className="data-table"><thead><tr><th>来源行</th><th>日期 / 主题</th><th>itemKey / 分类</th><th>问题 / 标题</th><th>平台</th><th>备注</th><th>操作和原因</th></tr></thead><tbody>{preview.rows.map((row) => <tr key={`${row.sourceLine}-${row.planDate}-${row.itemKey}`}><td>{row.sourceLine}</td><td>{row.planDate}<div className="secondary-cell">{row.dailyTheme}</div></td><td>{row.itemKey}<div className="secondary-cell">{articleCategoryLabel(row.articleCategory)} · {contentTypeLabel(row.contentType)}</div></td><td className={row.action === "error" || row.action === "conflict" ? "error" : "primary-cell"}>{row.question}<div className="secondary-cell">{row.title}</div></td><td><div className="inline-platforms">{row.targetPlatforms.map((key) => <PlatformBadge key={key} platform={key} />)}</div></td><td>{row.itemNote && <details><summary>文章执行备注</summary><p style={{ whiteSpace: "pre-wrap" }}>{row.itemNote}</p></details>}{row.note && <details><summary>每日备注</summary><p style={{ whiteSpace: "pre-wrap" }}>{row.note}</p></details>}</td><td><span className={`status-pill status-${row.action}`}>{actionNames[row.action]}</span><div className="secondary-cell">{row.reason}</div>{row.changes.length > 0 && <div className="secondary-cell">变更：{row.changes.join("、")}</div>}</td></tr>)}</tbody></table></div></> : <div className="empty-state">上传文件后显示真实差异预览</div>}</section>
        <aside className="import-side-card"><h3>确认规则</h3><div className="result-list"><div className="result-item"><span className="result-icon"><Icon name="calendar" size={19} /></span><div><strong>每日规划</strong><span>{preview?.plans.length || 0} 条</span></div></div><div className="result-item"><span className="result-icon"><Icon name="planning" size={19} /></span><div><strong>规划项</strong><span>{preview?.rows.length || 0} 条</span></div></div></div><p className="notice"><Icon name="info" size={14} />有效记录可以导入，冲突和单行错误会跳过并保留原记录；同一天主题或备注不一致时跳过当天。项目或文件校验失败时禁止整批导入。未出现在文件中的记录保持原样，空备注不清空原值。</p></aside>
      </div>
      {preview && <div className={blockingErrors.length || !importable ? "notice error" : "notice"} role="status" aria-live="polite">{blockingErrors.length ? `文件校验失败：${blockingErrors.join("；")}` : message ? message : importable ? `可导入 ${importable} 条，跳过 ${skipped} 条。跳过的记录保持原样。` : "没有可导入的有效记录，全部记录将跳过，请检查上方原因。"}</div>}
      <div className="import-bottom-actions">{error && <span className="error" role="alert">{error}</span>}{message && <span className="success">{message}</span>}<button className="secondary-button" type="button" onClick={() => { setPreview(null); setFile(null); setError(""); setMessage(""); }}>重新上传</button><button className="primary-button" type="button" disabled={saving || parsing || !canConfirm} onClick={confirm}>{saving ? "写入中…" : message ? "导入已完成" : preview && canConfirm ? `导入有效的 ${importable} 条` : "确认写入"}</button></div>
    </section>
  </div>;
}
