"use client";

import { FormEvent, useState } from "react";

type Project = { id: number | string; name: string };
type Plan = { id: number | string; project: number | string | { id: number | string }; planDate: string; dailyTheme?: string | null; topic: string; title: string; platforms: string[]; status: string; note?: string | null; contentAsset?: number | string | { id: number | string } | null };
type Platform = { key: string; name: string };

const statusNames: Record<string, string> = { uncreated: "未创建", pending_review: "待审核", pending_publish: "待发布", publishing: "发布中", done: "已完成" };

function businessToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
}

export default function PlansClient({ initialProjects, initialPlans, platforms }: { initialProjects: Project[]; initialPlans: Plan[]; platforms: Platform[] }) {
  const [plans, setPlans] = useState(initialPlans);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function togglePlatform(key: string) {
    setSelectedPlatforms((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }

  async function createPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (selectedPlatforms.length === 0) {
      setError("至少选择一个发布平台");
      return;
    }
    setSaving(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(editing ? `/api/content-plans/${editing.id}` : "/api/content-plans", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project: form.get("project"), planDate: form.get("planDate"), dailyTheme: form.get("topic"), topic: form.get("topic"), title: form.get("title"), platforms: selectedPlatforms, note: form.get("note") || undefined }),
      });
      const result = await response.json().catch(() => ({})) as { message?: string; errors?: Array<{ message?: string }>; doc?: Plan };
      if (!response.ok || !result.doc) throw new Error(result.errors?.[0]?.message || result.message || "规划创建失败");
      setPlans((current) => editing ? current.map((plan) => plan.id === editing.id ? result.doc! : plan) : [result.doc!, ...current]);
      setEditing(null);
      setSelectedPlatforms([]);
      event.currentTarget.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "规划创建失败");
    } finally { setSaving(false); }
  }

  async function deletePlan(plan: Plan) {
    if (!window.confirm(`确定删除规划“${plan.title}”吗？`)) return;
    const response = await fetch(`/api/content-plans/${plan.id}`, { method: "DELETE" });
    if (!response.ok) {
      const result = await response.json();
      setError(result.errors?.[0]?.message || result.message || "规划删除失败");
      return;
    }
    setPlans((current) => current.filter((item) => item.id !== plan.id));
    if (editing?.id === plan.id) setEditing(null);
  }

  function relationId(value: Plan["project"]) {
    return typeof value === "object" ? value.id : value;
  }

  const projectName = new Map(initialProjects.map((project) => [String(project.id), project.name]));

  return (
    <div className="business-shell">
      <header className="business-header">
        <div><a className="back-link" href="/">← 工作看板</a><h1>项目规划</h1><p>只创建未来规划；规划一旦关联内容资产，核心信息不可修改。</p></div>
        <a className="secondary-button" href="/projects">项目管理</a>
      </header>
      <div className="business-grid">
        <section className="card">
          <h2>{editing ? "编辑规划" : "新建规划"}</h2>
          {initialProjects.length === 0 ? <p className="empty-state">请先创建项目。</p> : <form className="business-form" onSubmit={createPlan}>
            <label>所属项目<select name="project" required key={editing?.id ?? "new"} defaultValue={editing ? String(relationId(editing.project)) : ""}><option value="" disabled>选择项目</option>{initialProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
            <label>规划日期<input name="planDate" type="date" defaultValue={editing?.planDate.slice(0, 10)} required /></label>
            <label>主题<input name="topic" defaultValue={editing?.topic} required /></label>
            <label>标题<input name="title" defaultValue={editing?.title} required /></label>
            <fieldset><legend>目标平台</legend><div className="platform-options">{platforms.map((platform) => <label className="check-option" key={platform.key}><input type="checkbox" checked={selectedPlatforms.includes(platform.key)} onChange={() => togglePlatform(platform.key)} />{platform.name}</label>)}</div></fieldset>
            <label>备注<textarea name="note" defaultValue={editing?.note ?? ""} rows={3} /></label>
            {error && <p className="error">{error}</p>}
            <div className="form-actions"><button className="primary-button" disabled={saving}>{saving ? "保存中…" : editing ? "保存修改" : "创建规划"}</button>{editing && <button className="secondary-button" type="button" onClick={() => { setEditing(null); setSelectedPlatforms([]); setError(""); }}>取消</button>}</div>
          </form>}
        </section>
        <section className="card">
          <div className="section-heading"><h2>规划列表</h2><span>{plans.length} 条规划</span></div>
          {plans.length === 0 ? <p className="empty-state">还没有规划。</p> : <div className="record-list">{plans.map((plan) => { const readOnly = plan.planDate.slice(0, 10) < businessToday(); return <article className="record" key={plan.id}><div><h3>{plan.title}</h3><p>{plan.planDate.slice(0, 10)} · {projectName.get(String(relationId(plan.project))) || "项目"} · {plan.dailyTheme || plan.topic}</p></div><div className="record-actions"><span className="status-pill">{statusNames[plan.status] || plan.status}</span>{!readOnly && <><button className="text-button" type="button" onClick={() => { setEditing(plan); setSelectedPlatforms(plan.platforms); setError(""); }}>编辑</button><button className="text-button danger-button" type="button" onClick={() => deletePlan(plan)}>删除</button></>}</div></article>; })}</div>}
        </section>
      </div>
    </div>
  );
}
