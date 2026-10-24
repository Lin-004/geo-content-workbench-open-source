"use client";

import { FormEvent, useState } from "react";
import { businessDate } from "@/lib/business-date";
import { Icon } from "../components/icons";

type Project = { id: number | string; name: string; startDate: string; endDate: string };
type Platform = { key: string; name: string };

export default function PlanFormClient({ project, platforms }: { project: Project; platforms: Platform[] }) {
  const [selected, setSelected] = useState(platforms.slice(0, 3).map((platform) => platform.key));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (!selected.length) { setError("至少选择一个发布平台"); return; }
    setSaving(true); const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/content-plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project: project.id, planDate: form.get("planDate"), dailyTheme: form.get("topic"), topic: form.get("topic"), title: form.get("title"), platforms: selected, note: form.get("note") || undefined }) });
      const result = await response.json().catch(() => ({})) as { message?: string; errors?: Array<{ message?: string }> };
      if (!response.ok) throw new Error(result.errors?.[0]?.message || result.message || "规划创建失败");
      window.location.href = `/project-management/detail/${project.id}`;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "规划创建失败");
    } finally { setSaving(false); }
  }
  return <div className="page-content"><div className="page-heading"><div><div className="crumb-link"><a href={`/project-management/detail/${project.id}`}>{project.name}</a><span>/</span><span>新增每日规划</span></div><h1 className="page-title">新增每日规划</h1><p className="page-subtitle">先创建一个日期规划，再在详情页新增多篇 A/B/C 文章</p></div><div className="heading-actions"><a className="secondary-button" href={`/project-management/detail/${project.id}`}>取消</a><button className="primary-button" type="submit" form="plan-form"><Icon name="check" size={16} />保存规划</button></div></div><form id="plan-form" className="form-card plan-form-card" onSubmit={submit}><h2>每日规划信息</h2><div className="form-grid"><label className="form-field full"><span className="form-label">所属项目</span><input className="form-control" value={project.name} readOnly /></label><label className="form-field"><span className="form-label required">规划日期</span><input className="form-control" name="planDate" type="date" min={businessDate()} required /></label><label className="form-field"><span className="form-label required">每日主题</span><input className="form-control" name="topic" placeholder="例如：太空舱与普通温泉房的对比决策" required /></label><label className="form-field full"><span className="form-label required">每日规划标题</span><input className="form-control" name="title" placeholder="请输入每日规划标题" required /></label><div className="form-field full"><span className="form-label required">默认平台概况</span><div className="platform-select">{platforms.map((platform) => <button className={`platform-check${selected.includes(platform.key) ? " selected" : ""}`} key={platform.key} type="button" onClick={() => setSelected((current) => current.includes(platform.key) ? current.filter((item) => item !== platform.key) : [...current, platform.key])}>{selected.includes(platform.key) ? "✓" : "＋"}{platform.name}</button>)}</div></div><label className="form-field full"><span className="form-label">官网动作或执行备注</span><textarea className="form-control" name="note" placeholder="可填写官网动作、执行备注或当天说明" /></label></div>{error && <p className="error">{error}</p>}<div className="form-actions"><button className="primary-button" disabled={saving}>{saving ? "保存中…" : "保存规划"}</button></div></form></div>;
}
