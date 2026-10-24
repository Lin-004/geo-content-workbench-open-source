"use client";
import { contentTypeLabel } from "@/lib/content-types";

import { articleCategoryLabel } from "@/lib/article-categories";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useQueryState } from "@/lib/use-query-state";
import { businessDate, businessDateTime } from "@/lib/business-date";
import { useRouter } from "next/navigation";
import { MetricCard, PlatformBadge, StatusBadge, platformName } from "../components/business";
import { Icon } from "../components/icons";
import { contentBodyToHtml, contentBodyToPlainText, escapeHtml } from "@/lib/content-body";
import { filterPublicationTaskGroups, groupPublicationTasks, publicationGroupStatus, type PublicationGroupAsset, type PublicationGroupTask } from "@/lib/publication-groups";

type Task = PublicationGroupTask & { contentAsset: number | string | PublicationGroupAsset; platform: string; platformUrl?: string | null; publishedUrl?: string | null; plannedPublishAt?: string | null; publishedAt?: string | null };
type Platform = { key: string; name: string };


function assetTitle(group: ReturnType<typeof groupPublicationTasks<Task>>[number]) {
  return group.asset?.title || `内容 #${group.key}`;
}

function formatDateTime(value?: string | null) {
  return businessDateTime(value);
}

function formatDate(value?: string | null) {
  return value ? businessDate(value) : "—";
}

function ArticleStatus({ status }: { status: string }) {
  return status === "partial" ? <span className="status-pill status-partial">部分完成</span> : <StatusBadge status={status} />;
}

export default function PublicationsClient({ initialTasks, platforms, metrics, totalArticles, totalTasks, page, pageCount }: { initialTasks: Task[]; platforms: Platform[]; metrics: {pendingArticles:number;publishedArticles:number;pendingTasks:number;completedTasks:number;blockedTasks:number}; totalArticles:number;totalTasks:number;page:number;pageCount:number }) {
  const router = useRouter();
  const [,setPage] = useQueryState("page","1",true);
  const [scope,setScope] = useQueryState("scope","all",true);
  const [assetFilter,setAssetFilter] = useQueryState("asset","",true);
  useEffect(()=>setTasks(initialTasks),[initialTasks]);
  const [tasks, setTasks] = useState(initialTasks);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [query, setQuery] = useQueryState("query","",true);
  const [filter, setFilter] = useQueryState("filter","all",true);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [copyFeedback, setCopyFeedback] = useState<{ key: string; message: string; error?: boolean } | null>(null);
  const groups = useMemo(() => groupPublicationTasks(tasks), [tasks]);
  const filteredGroups = useMemo(() => filterPublicationTaskGroups(groups, query, filter), [filter, groups, query]);
  const filteredTasks = filteredGroups.flatMap((group) => group.tasks);

  async function confirmPublished(event: FormEvent<HTMLFormElement>, task: Task) {
    event.preventDefault();
    setError("");
    setConfirming(String(task.id));
    try {
      const response = await fetch(`/api/publication-tasks/${task.id}/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publishedUrl: urls[String(task.id)] || "" }) });
      const result = await response.json().catch(() => ({})) as { message?: string; doc?: Task };
      if (!response.ok || !result.doc) throw new Error(result.message || "发布确认失败");
      setTasks((current) => current.map((item) => item.id === task.id ? { ...item, ...result.doc, contentAsset: result.doc?.contentAsset || item.contentAsset } : item));
      router.refresh();
      setUrls((current) => ({ ...current, [String(task.id)]: "" }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "发布确认失败");
    } finally {
      setConfirming(null);
    }
  }

  async function writeClipboard(text: string, html: string) {
    if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
      await navigator.clipboard.write([new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([text], { type: "text/plain" }),
      })]);
      return;
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    throw new Error("当前浏览器不支持剪贴板操作");
  }

  function showCopyFeedback(key: string, message: string, isError = false) {
    setCopyFeedback({ key, message, error: isError });
    window.setTimeout(() => setCopyFeedback((current) => current?.key === key ? null : current), 1800);
  }

  async function copyTitle(group: ReturnType<typeof groupPublicationTasks<Task>>[number]) {
    const key = `${group.key}:title`;
    try {
      const title = assetTitle(group);
      await writeClipboard(title, `<p>${escapeHtml(title)}</p>`);
      showCopyFeedback(key, "已复制标题");
    } catch (caught) {
      showCopyFeedback(key, `复制标题失败：${caught instanceof Error ? caught.message : "请重试"}`, true);
    }
  }

  async function copyBody(group: ReturnType<typeof groupPublicationTasks<Task>>[number]) {
    const key = `${group.key}:body`;
    try {
      if (!group.asset?.body) throw new Error("这篇文章暂无正文");
      const text = contentBodyToPlainText(group.asset.body);
      if (!text.trim()) throw new Error("这篇文章暂无可复制正文");
      await writeClipboard(text, contentBodyToHtml(group.asset.body));
      showCopyFeedback(key, "已复制正文");
    } catch (caught) {
      showCopyFeedback(key, `复制正文失败：${caught instanceof Error ? caught.message : "请重试"}`, true);
    }
  }

  const pendingArticles = metrics.pendingArticles;
  const publishedArticles = metrics.publishedArticles;
  const pendingTasks = metrics.pendingTasks;
  const completedTasks = metrics.completedTasks;
  const blockedTasks = metrics.blockedTasks;

  return <div className="page-content">
    <div className="page-heading"><div><h1 className="page-title">发布任务</h1><p className="page-subtitle">按文章查看发布进度，平台作为文章下的独立发布任务</p></div><div className="heading-actions"><a className="secondary-button" href="/content-management"><Icon name="content" size={16} />内容资产</a></div></div>
    <section className="metric-grid publication-metrics">
      <MetricCard label="待发布文章" value={pendingArticles} meta="文章分组" color="orange" icon="content" />
      <MetricCard label="已发布文章" value={publishedArticles} meta="全部平台完成" color="green" icon="check" />
      <MetricCard label="待发布平台任务" value={pendingTasks} meta="平台级任务" color="orange" icon="clock" />
      <MetricCard label="已完成平台任务" value={completedTasks} meta="平台级任务" color="green" icon="check" />
      <MetricCard label="不可发布任务" value={blockedTasks} meta="等待审核" color="blue" icon="lock" />
      <MetricCard label="平台任务总数" value={pendingTasks+completedTasks+blockedTasks} meta="不等同于文章数" color="purple" icon="send" />
    </section>
    {error && <p className="error page-error">{error}</p>}
    <section className="panel">
      <div className="filter-bar"><select className="select-control" aria-label="安排范围" value={scope} onChange={e=>setScope(e.target.value)}><option value="all">全部安排</option><option value="overdue">逾期待处理</option><option value="today">今日安排</option><option value="future">未来安排</option><option value="unscheduled">未排期</option></select>{assetFilter && <button className="secondary-button" type="button" onClick={()=>setAssetFilter("")}>清除当前文章限定</button>}<label className="input-with-icon"><Icon name="search" size={17} /><input placeholder="搜索文章标题" value={query} onChange={(event) => setQuery(event.target.value)} /></label><span className="filter-label">任务状态</span><select className="select-control" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">全部状态</option><option value="pending">待发布</option><option value="published">已发布</option><option value="blocked">不可发布</option></select></div>
      <div className="publication-list">
        {filteredGroups.length === 0 ? <div className="empty-state">暂无发布任务</div> : filteredGroups.map((group) => {
          const status = publicationGroupStatus(group.tasks);
          const publishedCount = group.tasks.filter((task) => task.status === "published").length;
          const isExpanded = expanded[group.key] ?? status !== "published";
          const category = group.asset?.articleCategory ? articleCategoryLabel(group.asset.articleCategory) : "未分类";
          const plannedDate = group.asset?.plannedPublishDate || group.tasks.map((task) => task.plannedPublishAt).find(Boolean);
          const feedback = copyFeedback?.key.startsWith(`${group.key}:`) ? copyFeedback : null;
          return <article className={`publication-article-card${isExpanded ? " is-expanded" : ""}`} key={group.key}>
            <header className="publication-article-header">
              <div className="publication-article-heading"><div className="publication-article-title-row"><h2>{assetTitle(group)}</h2><ArticleStatus status={status} /></div><div className="publication-article-action-row"><a className="secondary-button" href={`/content-management/detail/${group.key}`}><Icon name="content" size={14} />查看内容</a><button className="secondary-button" type="button" onClick={() => { void copyTitle(group); }}>复制标题</button><button className="primary-button" type="button" onClick={() => { void copyBody(group); }}>{group.asset?.contentType === "video_script" ? "复制脚本" : "复制正文"}</button></div>{feedback && <p className={`publication-copy-feedback${feedback.error ? " error" : ""}`} role="status">{feedback.message}</p>}<div className="publication-article-meta"><span>{contentTypeLabel(group.asset?.contentType)}</span><span>{category}</span>{group.asset?.contentType === "video_script" && <span>成片实际发布后再登记链接</span>}<span>计划日期：{formatDate(plannedDate)}</span><span>{group.tasks.length} 个平台</span></div></div>
              <div className="publication-article-summary"><strong>{publishedCount}/{group.tasks.length}</strong><span>个平台已发布</span><div className="progress-track"><div className={`progress-fill${status === "published" ? " green" : ""}`} style={{ width: `${group.tasks.length ? publishedCount / group.tasks.length * 100 : 0}%` }} /></div></div>
              <button className="publication-toggle" type="button" aria-expanded={isExpanded} aria-label={`${isExpanded ? "收起" : "展开"}${assetTitle(group)}`} onClick={() => setExpanded((current) => ({ ...current, [group.key]: !isExpanded }))}><span>{isExpanded ? "收起" : "展开"}</span><Icon name="chevron-down" size={16} /></button>
            </header>
            {isExpanded && <div className="publication-subtasks">{group.tasks.map((task) => {
              const taskKey = String(task.id);
              const name = platforms.find((platform) => platform.key === task.platform)?.name || platformName(task.platform);
              return <div className={`publication-subtask publication-subtask-${task.status}`} key={task.id}>
                <div className="publication-subtask-platform"><PlatformBadge platform={task.platform} /></div>
                <div className="publication-subtask-time"><span>计划发布时间</span><strong>{task.plannedPublishAt ? formatDateTime(task.plannedPublishAt) : formatDate(group.asset?.plannedPublishDate)}</strong></div>
                <div className="publication-subtask-actions">
                  {task.status === "pending" && <><a className={`text-button${task.platformUrl ? "" : " muted-button"}`} href={task.platformUrl || "#"} target={task.platformUrl ? "_blank" : undefined} rel="noreferrer" aria-disabled={!task.platformUrl} onClick={(event) => { if (!task.platformUrl) event.preventDefault(); }}><Icon name="external" size={14} />打开平台</a><form onSubmit={(event) => confirmPublished(event, task)}><input className="input-control" aria-label={`${name}已发布文章链接`} placeholder="粘贴发布链接" value={urls[taskKey] || ""} onChange={(event) => setUrls((current) => ({ ...current, [taskKey]: event.target.value }))} required /><button className="primary-button" type="submit" disabled={confirming === taskKey}>{confirming === taskKey ? "确认中…" : "确认已发布"}</button></form></>}
                  {task.status === "published" && task.publishedUrl && <a className="text-button" href={task.publishedUrl} target="_blank" rel="noreferrer"><Icon name="external" size={14} />查看文章</a>}
                  {task.status === "published" && !task.publishedUrl && <span className="secondary-cell">已发布</span>}
                  {task.status === "blocked" && <span className="secondary-cell">审核通过后可发布</span>}
                  {task.status !== "pending" && task.status !== "published" && task.status !== "blocked" && <span className="secondary-cell">{task.status}</span>}
                </div>
              </div>;
            })}</div>}
          </article>;
        })}
      </div>
      <div className="table-footer"><span>当前筛选：{totalArticles} 篇文章 · {totalTasks} 个平台任务</span><div className="pagination"><span>每页 10 篇完整文章</span><button className="page-arrow" type="button" disabled={page<=1} onClick={()=>setPage(String(page-1))}><Icon name="chevron-left" size={15} /></button><span>{page} / {pageCount}</span><button className="page-arrow" type="button" disabled={page>=pageCount} onClick={()=>setPage(String(page+1))}><Icon name="chevron-right" size={15} /></button></div></div>
    </section>
  </div>;
}
