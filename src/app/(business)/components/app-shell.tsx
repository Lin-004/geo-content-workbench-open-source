"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon, type IconName } from "./icons";

const primaryNav: { href: string; label: string; icon: IconName }[] = [
  { href: "/dashboard", label: "工作看板", icon: "grid" },
  { href: "/content-management", label: "内容资产管理", icon: "content" },
  { href: "/publications", label: "发布任务", icon: "send" },
  { href: "/content-schedule", label: "内容排期", icon: "calendar" },
  { href: "/planning-management", label: "项目管理", icon: "planning" },
];

function dateLabel() {
  const date = new Date();
  const weekday = new Intl.DateTimeFormat("zh-CN", { weekday: "short", timeZone: "Asia/Shanghai" }).format(date);
  const value = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(date);
  return `${value}（${weekday}）`;
}

export default function AppShell({ userName, breadcrumbs, children }: { userName: string; breadcrumbs: string[]; children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [search, setSearch] = useState("");
  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`) || (href === "/planning-management" && ["/projects", "/project-management", "/project-plan"].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)));
  function submitSearch() {
    const value = search.trim();
    if (value) window.location.assign(`/content-management?query=${encodeURIComponent(value)}`);
  }
  return (
    <div className={`app-shell${collapsed ? " sidebar-collapsed" : ""}${mobileNavOpen ? " mobile-nav-open" : ""}`}>
      <aside className="app-sidebar">
        <a className="app-brand" href="/dashboard"><span className="logo-mark">G</span><span>GEO内容交付工作台</span></a>
        <nav className="app-nav" aria-label="主导航">
          {primaryNav.map((item) => <a key={item.href} className={`app-nav-item${active(item.href) ? " active" : ""}`} href={item.href}><Icon name={item.icon} size={20} /><span>{item.label}</span></a>)}
        </nav>
        <div className="app-sidebar-bottom">
          <a className={`app-nav-item${active("/settings") ? " active" : ""}`} href="/settings"><Icon name="settings" size={20} /><span>系统设置</span></a>
          <a className={`app-nav-item${active("/help") ? " active" : ""}`} href="/help"><Icon name="help" size={20} /><span>帮助中心</span></a>
          <div className="sidebar-divider" />
          <button className="collapse-button" type="button" aria-label={collapsed ? "展开侧栏" : "收起侧栏"} onClick={() => setCollapsed((value) => !value)}><Icon name="chevron-left" size={18} /><span>{collapsed ? "展开侧栏" : "收起侧栏"}</span></button>
        </div>
      </aside>
      <main className="app-main">
        <header className="app-topbar">
          <div className="breadcrumb"><button className="menu-button" type="button" aria-label="打开导航" aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen((value) => !value)}><Icon name="menu" size={23} /></button>{breadcrumbs.map((item, index) => <span key={`${item}-${index}`} className={index === breadcrumbs.length - 1 ? "current" : ""}>{index > 0 && <b>/</b>}{item}</span>)}</div>
          <div className="topbar-tools"><div className="date-control" aria-label="当前日期"><Icon name="calendar" size={17} /><span>{dateLabel()}</span></div><label className="global-search"><Icon name="search" size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") submitSearch(); }} placeholder="搜索文章标题" /></label><div className="profile"><span className="avatar">{userName.slice(0, 1)}</span><span>{userName}</span><Icon name="chevron-down" size={15} /></div></div>
        </header>
        {children}
      </main>
    </div>
  );
}
