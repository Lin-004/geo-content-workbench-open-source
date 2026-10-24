"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryState } from "@/lib/use-query-state";
import { businessDate, businessDateTime } from "@/lib/business-date";
import { Icon } from "../components/icons";
import { MetricCard } from "../components/business";

type Project = { id: number | string; name: string; startDate: string; endDate: string; goal: string; description: string; ownerName: string; contentCount: number; weekPlans: number; updatedAt: string; publishedCount: number };

export default function ProjectsClient({ initialProjects, stats }: { initialProjects: Project[]; stats: { active: number; weekPlans: number; weekPublished: number } }) {
  const router=useRouter();
  const [error,setError]=useState("");
  useEffect(()=>setProjects(initialProjects),[initialProjects]);
  const [projects, setProjects] = useState(initialProjects);
  const [query, setQuery] = useQueryState("query", "");
  const [status, setStatus] = useQueryState("status", "all");
  const filtered = useMemo(() => projects.filter((project) => {
    const matchesQuery = !query || `${project.name}${project.ownerName}`.toLowerCase().includes(query.toLowerCase());
    const matchesStatus = status === "all" || (status === "active" ? businessDate(project.startDate) <= businessDate() && businessDate(project.endDate) >= businessDate() : status === "not_started" ? businessDate(project.startDate) > businessDate() : businessDate(project.endDate) < businessDate());
    return matchesQuery && matchesStatus;
  }), [projects, query, status]);
  async function deleteProject(project: Project) {
    if (!window.confirm(`确定删除项目“${project.name}”吗？`)) return;
    const response = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
    if (response.ok) { setProjects((current) => current.filter((item) => item.id !== project.id)); router.refresh(); }
    else setError((await response.json()).message || "项目删除失败");
  }
  return <div className="page-content"><div className="page-heading"><div><h1 className="page-title">项目管理</h1><p className="page-subtitle">管理项目与规划发布节奏</p></div><div className="heading-actions"><a className="primary-button" href="/project-management/create"><Icon name="plus" size={17} />新增项目</a></div></div>{error && <p className="error" role="alert">{error}</p>}<section className="metric-grid"><MetricCard label="进行中项目" value={stats.active} color="blue" icon="folder" /><MetricCard label="本周已安排" value={stats.weekPlans} color="orange" icon="calendar" /><MetricCard label="本周已发布任务" value={stats.weekPublished} color="green" icon="send" /></section><section className="panel"><div className="filter-bar"><label className="input-with-icon"><Icon name="search" size={17} /><input placeholder="搜索项目名称、负责人" value={query} onChange={(event) => setQuery(event.target.value)} /></label><span className="filter-label">项目状态</span><select className="select-control" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">全部状态</option><option value="not_started">未开始</option><option value="active">进行中</option><option value="ended">已结束</option></select><button className="secondary-button" type="button" onClick={() => { setQuery(""); setStatus("all"); }}><Icon name="refresh" size={15} />重置</button></div><div className="data-table-wrap"><table className="data-table"><thead><tr><th>项目名称</th><th>项目周期</th><th>负责人</th><th>内容数量</th><th>本周计划</th><th>已发布</th><th>状态</th><th>更新时间</th><th>操作</th></tr></thead><tbody>{filtered.length === 0 ? <tr><td colSpan={9}><div className="empty-state">暂无项目</div></td></tr> : filtered.map((project) => <tr key={project.id}><td className="primary-cell">{project.name}<div className="secondary-cell">{project.goal}</div></td><td>{businessDate(project.startDate)} ～ {businessDate(project.endDate)}</td><td><span className="owner-cell"><span className="avatar small-avatar">{project.ownerName.slice(0, 1)}</span>{project.ownerName}</span></td><td>{project.contentCount} 篇</td><td>{project.weekPlans} 天</td><td className="green-text">{project.publishedCount} 个任务</td><td><span className={`status-pill ${businessDate(project.endDate) >= businessDate() ? "status-pending" : "status-draft"}`}>{businessDate(project.startDate) > businessDate() ? "未开始" : businessDate(project.endDate) >= businessDate() ? "进行中" : "已结束"}</span></td><td className="secondary-cell">{businessDateTime(project.updatedAt)}</td><td><div className="row-actions"><a className="text-button" href={`/project-management/detail/${project.id}`}>查看详情</a><a className="text-button" href={`/project-management/create?id=${project.id}`}>编辑</a><button className="text-button danger-button" type="button" onClick={() => deleteProject(project)}>删除</button></div></td></tr>)}</tbody></table></div><div className="table-footer"><span>共 {filtered.length} 条</span></div></section></div>;
}
