"use client";

import { FormEvent, useState } from "react";
import { Icon } from "../../components/icons";
import { PlatformBadge } from "../../components/business";

type Project = { id: number | string; name: string; startDate: string; endDate: string; goal: string; description: string };
type Platform = { key: string; name: string };
type PlanRow = { id: number; date: string; topic: string; title: string; platforms: string[] };

export default function ProjectFormClient({ ownerId, initialProject, platforms }: { ownerId: number | string; initialProject?: Project; platforms: Platform[] }) {
  const [rows, setRows] = useState<PlanRow[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [continueAfterSave, setContinueAfterSave] = useState(false);
  const addRow = () => setRows((current) => [...current, { id: Date.now(), date: "", topic: "", title: "", platforms: platforms.slice(0, 3).map((item) => item.key) }]);
  const updateRow = (id: number, patch: Partial<PlanRow>) => setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  const togglePlatform = (id: number, key: string) => setRows((current) => current.map((row) => row.id === id ? { ...row, platforms: row.platforms.includes(key) ? row.platforms.filter((item) => item !== key) : [...row.platforms, key] } : row));
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setMessage(""); setSaving(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(initialProject ? `/api/projects/${initialProject.id}` : "/api/projects", { method: initialProject ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: form.get("name"), startDate: form.get("startDate"), endDate: form.get("endDate"), owner: ownerId, goal: form.get("goal"), description: form.get("description") }) });
      const result = await response.json().catch(() => ({})) as { message?: string; errors?: Array<{ message?: string }>; doc?: { id: number | string } };
      if (!response.ok || !result.doc) throw new Error(result.errors?.[0]?.message || result.message || "项目保存失败");
      const projectId = result.doc.id;
      for (const row of rows.filter((item) => item.date && item.topic && item.title && item.platforms.length)) {
        const planResponse = await fetch("/api/content-plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project: projectId, planDate: row.date, dailyTheme: row.topic, topic: row.topic, title: row.title, platforms: row.platforms }) });
        const planResult = await planResponse.json().catch(() => ({})) as { message?: string; errors?: Array<{ message?: string }> };
        if (!planResponse.ok) throw new Error(planResult.errors?.[0]?.message || planResult.message || "初始规划保存失败");
      }
      const destination = continueAfterSave ? `/project-management/detail/${projectId}` : "/planning-management";
      setContinueAfterSave(false);
      window.location.href = destination;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "项目保存失败");
    } finally { setSaving(false); }
  }
  return <div className="page-content"><div className="page-heading"><div><h1 className="page-title">{initialProject ? "编辑项目" : "新增项目"}</h1><p className="page-subtitle">创建项目并录入基础规划信息</p></div><div className="heading-actions"><a className="secondary-button" href="/planning-management">取消</a><button className="secondary-button" type="submit" form="project-form">保存项目</button><button className="primary-button" type="submit" form="project-form" onClick={() => setContinueAfterSave(true)}>保存并继续规划</button></div></div>{error && <p className="error page-error">{error}</p>}<form id="project-form" className="split-layout" onSubmit={(event) => save(event)}><div className="detail-main"><section className="form-card"><h2>基础信息</h2><div className="form-grid"><label className="form-field full"><span className="form-label required">项目名称</span><input className="form-control" name="name" defaultValue={initialProject?.name} placeholder="请输入项目名称（如：东京自由行攻略二期）" required /><small className="form-help">0/50</small></label><div className="form-field"><span className="form-label required">项目周期</span><div className="date-range"><input className="form-control" name="startDate" type="date" defaultValue={initialProject?.startDate.slice(0, 10)} required /><span>～</span><input className="form-control" name="endDate" type="date" defaultValue={initialProject?.endDate.slice(0, 10)} required /></div></div><label className="form-field"><span className="form-label required">项目负责人</span><select className="form-control" name="owner" defaultValue={String(ownerId)} disabled><option value={String(ownerId)}>当前登录用户</option></select></label><label className="form-field full"><span className="form-label required">项目目标</span><input className="form-control" name="goal" defaultValue={initialProject?.goal} placeholder="请输入项目的主要目标（如：提升曝光与转化）" required /></label><label className="form-field full"><span className="form-label required">项目描述</span><textarea className="form-control" name="description" defaultValue={initialProject?.description} placeholder="请输入项目背景、范围、受众、关键里程碑等详细信息" required /></label></div></section><section className="form-card"><div className="panel-heading"><div><h2>初始内容规划</h2><span className="form-help">仅支持编辑当前及未来日期的规划</span></div><span className="hint">共 {rows.length} 条</span></div><div className="data-table-wrap"><table className="data-table plan-entry-table"><thead><tr><th>日期</th><th>主题</th><th>文章标题</th><th>发布平台</th><th>备注</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><input className="table-input" type="date" value={row.date} onChange={(event) => updateRow(row.id, { date: event.target.value })} /></td><td><input className="table-input" value={row.topic} onChange={(event) => updateRow(row.id, { topic: event.target.value })} placeholder="主题" /></td><td><input className="table-input" value={row.title} onChange={(event) => updateRow(row.id, { title: event.target.value })} placeholder="文章标题" /></td><td><div className="inline-platforms">{platforms.slice(0, 4).map((platform) => <button className={`platform-choice${row.platforms.includes(platform.key) ? " selected" : ""}`} key={platform.key} type="button" onClick={() => togglePlatform(row.id, platform.key)}><PlatformBadge platform={platform.key} /></button>)}</div></td><td><button className="text-button danger-button" type="button" onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}><Icon name="trash" size={16} /></button></td></tr>)}</tbody></table></div><button className="secondary-button add-plan-button" type="button" onClick={addRow}><Icon name="plus" size={16} />添加规划</button></section></div><aside className="detail-side"><section className="panel"><h2>填写说明</h2><ul className="instruction-list"><li>基础信息将用于项目管理与统计分析，请务必准确填写。</li><li>项目周期用于规划时间范围，后续可在项目内调整。</li><li>初始内容规划为项目启动时的内容草案，后续可随时新增或调整。</li><li>仅支持编辑当前及未来日期的规划。</li></ul></section><section className="panel"><h2>项目预览</h2><div className="preview-stat"><span>预计规划篇数</span><strong>{rows.length}</strong><span>篇</span></div><div className="preview-stat"><span>预计覆盖平台</span><div className="inline-platforms">{platforms.slice(0, 5).map((platform) => <PlatformBadge key={platform.key} platform={platform.key} />)}</div></div><div className="preview-stat"><span>项目状态</span><StatusPreview /></div></section></aside></form></div>;
}

function StatusPreview() { return <span className="status-pill status-uncreated">未开始</span>; }
