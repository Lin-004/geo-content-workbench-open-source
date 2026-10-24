import { Icon, type IconName } from "./icons";

const platformMeta: Record<string, { name: string; mark: string; className: string }> = {
  xiaohongshu: { name: "小红书", mark: "小", className: "platform-toutiao" },
  douyin: { name: "抖音", mark: "抖", className: "platform-toutiao" },
  wechat_channels: { name: "视频号", mark: "视", className: "platform-wechat" },
  zhihu: { name: "知乎", mark: "知", className: "platform-zhihu" },
  baijiahao: { name: "百家号", mark: "百", className: "platform-baidu" },
  wechat: { name: "公众号", mark: "微", className: "platform-wechat" },
  ctrip: { name: "携程", mark: "携", className: "platform-xiecheng" },
  meipian: { name: "美篇", mark: "美", className: "platform-meituan" },
  toutiao: { name: "今日头条", mark: "头", className: "platform-toutiao" },
  sohu: { name: "搜狐号", mark: "狐", className: "platform-souhu" },
};

export function platformName(key: string) { return platformMeta[key]?.name || key; }

export function PlatformBadge({ platform }: { platform: string }) {
  const meta = platformMeta[platform] || { name: platform, mark: platform.slice(0, 1), className: "" };
  return <span className={`platform-badge ${meta.className}`} data-mark={meta.mark}>{meta.name}</span>;
}

export function PlatformBadges({ platforms }: { platforms?: string[] | null }) {
  return <div className="platforms">{(platforms || []).map((platform) => <PlatformBadge key={platform} platform={platform} />)}</div>;
}

const statusText: Record<string, string> = {
  not_started: "未开始", active: "进行中", ended: "已结束", draft: "草稿", reviewing: "审核中", approved: "已审核", blocked: "不可发布", pending: "待发布", published: "已发布",
  uncreated: "未创建", creating: "创建中", pending_review: "待审核", pending_publish: "待发布", publishing: "发布中", done: "已完成",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`status-pill status-${status}`}>{statusText[status] || status}</span>;
}

export function Progress({ done, total, green = false }: { done: number; total: number; green?: boolean }) {
  const percentage = total ? Math.round((done / total) * 100) : 0;
  return <div className="progress-cell"><div className="progress-label"><span>{done}/{total}</span><span>{total ? `${percentage}%` : "未开始"}</span></div><div className="progress-track"><div className={`progress-fill${green ? " green" : ""}`} style={{ width: `${percentage}%` }} /></div></div>;
}

export function MetricCard({ label, value, meta, color, icon, trend = "" }: { label: string; value: number | string; meta?: string; color: "blue" | "orange" | "green" | "purple"; icon: IconName; trend?: "up" | "down" | "" }) {
  return <div className={`metric-card metric-${color}`}><div className="metric-top"><div><div className="metric-label">{label}</div><div className="metric-value">{value}</div></div><span className="metric-icon"><Icon name={icon} size={21} /></span></div>{meta && <div className={`metric-meta ${trend}`}>{trend === "up" ? "↑" : trend === "down" ? "↓" : ""}{meta}</div>}</div>;
}

export function Donut({ total, values, labels }: { total: number; values: number[]; labels: { label: string; color: string }[] }) {
  const safeTotal = values.reduce((sum, value) => sum + value, 0) || total || 1;
  let start = 0;
  const stops = values.map((value, index) => { const end = start + (value / safeTotal) * 100; const color = labels[index]?.color || "#d0d5dd"; const stop = `${color} ${start}% ${end}%`; start = end; return stop; });
  return <div className="donut-layout"><div className="donut" style={{ background: `conic-gradient(${stops.length ? stops.join(", ") : "#e5eaf1 0 100%"})` }}><div className="donut-center"><strong>{total}</strong><span>篇内容</span></div></div><div className="legend">{labels.map((item, index) => <div className="legend-row" key={item.label}><i className="legend-dot" style={{ background: item.color }} /><span>{item.label}</span><span className="legend-value">{values[index] || 0}　({safeTotal ? Math.round(((values[index] || 0) / safeTotal) * 100) : 0}%)</span></div>)}</div></div>;
}
