"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
import {businessDateTime} from "@/lib/business-date";
export default function TrashClient({assets}:{assets:{id:number|string;title:string;deletedAt?:string|null}[]}){
 const router=useRouter();const [error,setError]=useState("");const [busy,setBusy]=useState<string|null>(null);
 async function restore(id:number|string){setBusy(String(id));setError("");try{const r=await fetch(`/api/content-assets/${id}/restore`,{method:"POST"});const result=await r.json();if(!r.ok)throw new Error(result.message||"恢复失败");router.refresh();}catch(e){setError(e instanceof Error?e.message:"恢复失败");}finally{setBusy(null);}}
 return <div className="page-content"><div className="page-heading"><div><h1 className="page-title">回收站</h1><p className="page-subtitle">恢复误删的内容资产，规划项已被其他文章占用时会提示冲突。</p></div><a className="secondary-button" href="/content-management">返回内容资产</a></div>{error&&<p className="error" role="alert">{error}</p>}<section className="panel"><table className="data-table"><thead><tr><th>内容标题</th><th>删除时间</th><th>操作</th></tr></thead><tbody>{assets.length?assets.map(a=><tr key={a.id}><td>{a.title}</td><td>{businessDateTime(a.deletedAt)}</td><td><button className="secondary-button" disabled={busy!==null} onClick={()=>restore(a.id)}>{busy===String(a.id)?"恢复中…":"恢复内容"}</button></td></tr>):<tr><td colSpan={3}><div className="empty-state">没有已删除的内容</div></td></tr>}</tbody></table></section></div>;
}
