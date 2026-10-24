"use client";

import { useState } from "react";
import { Icon } from "../components/icons";

type Config = { id: number | string; key: string; name: string; publishUrl: string; enabled: boolean };

function validPublishUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return ["http:", "https:"].includes(url.protocol) && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export default function SettingsClient({ initialConfigs }: { initialConfigs: Config[] }) {
  const [configs, setConfigs] = useState(initialConfigs);
  const [message, setMessage] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  async function toggle(config: Config) { const enabled = !config.enabled; setSavingId(String(config.id)); setConfigs((current) => current.map((item) => item.id === config.id ? { ...item, enabled } : item)); try { const response = await fetch(`/api/platform-configs/${config.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }) }); if (!response.ok) throw new Error("平台配置保存失败"); setMessage("平台配置已保存"); } catch (caught) { setConfigs((current) => current.map((item) => item.id === config.id ? { ...item, enabled: config.enabled } : item)); setMessage(caught instanceof Error ? caught.message : "平台配置保存失败"); } finally { setSavingId(null); } }
  async function saveUrl(config: Config, publishUrl: string) { if (!validPublishUrl(publishUrl)) { setMessage("平台地址必须是有效的 http 或 https 地址"); return; } setSavingId(String(config.id)); try { const response = await fetch(`/api/platform-configs/${config.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publishUrl: publishUrl.trim() }) }); if (!response.ok) throw new Error("平台地址保存失败"); setConfigs((current) => current.map((item) => item.id === config.id ? { ...item, publishUrl: publishUrl.trim() } : item)); setMessage("平台地址已保存"); } catch (caught) { setMessage(caught instanceof Error ? caught.message : "平台地址保存失败"); } finally { setSavingId(null); } }
  return <div className="page-content"><div className="page-heading"><div><h1 className="page-title">系统设置</h1><p className="page-subtitle">管理发布平台和工作台账号</p></div><div className="heading-actions"><a className="secondary-button" href="/admin/collections/users?system=1"><Icon name="settings" size={16} />后台管理</a></div></div>{message && <p className="success page-error">{message}</p>}<div className="settings-grid"><section className="panel" id="platform"><div className="panel-heading"><div><h2>发布平台配置</h2><span className="hint">人工发布时将从这里打开对应平台后台</span></div><span className="status-pill status-approved">{configs.filter((item) => item.enabled).length} 个已启用</span></div><div>{configs.map((config) => <div className="setting-row" key={config.id}><span className="platform-logo">{config.name.slice(0, 1)}</span><div><strong>{config.name}</strong><small>{config.key}</small></div><label className="setting-url"><span className="form-label">发布地址</span><input className="input-control" defaultValue={config.publishUrl} disabled={savingId === String(config.id)} onBlur={(event) => saveUrl(config, event.target.value)} /></label><span className="setting-enabled">{config.enabled ? "启用" : "停用"}</span><button className={`toggle${config.enabled ? " on" : ""}`} type="button" disabled={savingId === String(config.id)} aria-label={`${config.name}${config.enabled ? "停用" : "启用"}`} onClick={() => toggle(config)} /></div>)}</div></section><aside className="detail-side"><section className="panel"><h2>工作台设置</h2><div className="settings-menu"><a className="settings-menu-item active" href="#platform"><Icon name="settings" size={17} /><span>发布平台</span><Icon name="chevron-right" size={15} /></a><a className="settings-menu-item" href="/admin/collections/users?system=1"><Icon name="user" size={17} /><span>账号管理</span><Icon name="chevron-right" size={15} /></a></div></section><section className="panel"><h2>使用说明</h2><p className="muted-copy">当前为单人审核模式，账号之间未划分审批职责。平台配置保存平台名称、后台地址和启用状态，不保存第三方账号密码。实际发布仍由操作人员在平台后台手动完成。</p></section></aside></div></div>;
}
