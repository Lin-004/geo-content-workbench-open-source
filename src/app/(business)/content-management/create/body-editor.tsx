"use client";

import { useRef, useState, type ClipboardEvent } from "react";
import { escapeHtml, ContentBody, contentBodyToHtml, contentBodyToMarkdown, editedContentBody, rowsToMarkdownTable } from "@/lib/content-body";
import { documentToContentBody } from "@/lib/html-body";

export default function BodyEditor({ initialBody }: { initialBody: unknown }) {
  const [imageUrl,setImageUrl] = useState("");
  const [error,setError] = useState("");
  const [uploading,setUploading] = useState(false);
  const [body, setBody] = useState(initialBody);
  const [mode, setMode] = useState<"visual" | "markdown" | "preview">("visual");
  const [source, setSource] = useState(() => contentBodyToMarkdown(initialBody));
  const editor = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);
  const rendered = useRef(contentBodyToHtml(initialBody));
  function remember() {
    const selection = window.getSelection();
    if (selection?.rangeCount && editor.current?.contains(selection.anchorNode)) savedRange.current = selection.getRangeAt(0).cloneRange();
  }
  function sync() {
    if (!editor.current) return;
    const next = documentToContentBody(new DOMParser().parseFromString(editor.current.innerHTML, "text/html"));
    setBody(next); setSource(contentBodyToMarkdown(next));
    editor.current.dispatchEvent(new Event("change", {bubbles: true}));
    remember();
  }
  function range() {
    const root = editor.current;
    if (!root) return null;
    root.focus();
    const selection = window.getSelection();
    const current = savedRange.current;
    const next = current && root.contains(current.commonAncestorContainer) ? current : document.createRange();
    if (next !== current) { next.selectNodeContents(root); next.collapse(false); }
    selection?.removeAllRanges(); selection?.addRange(next);
    return next;
  }
  function insert(html: string) {
    const selection = range();
    if (!selection) return;
    selection.deleteContents();
    const fragment = selection.createContextualFragment(html);
    const last = fragment.lastChild;
    selection.insertNode(fragment);
    if (last) { selection.setStartAfter(last); selection.collapse(true); }
    savedRange.current = selection.cloneRange(); sync();
  }
  function format(tag: string) {
    const selection = range();
    if (!selection || selection.collapsed) return;
    const wrapper = document.createElement(tag);
    wrapper.append(selection.extractContents()); selection.insertNode(wrapper); sync();
  }
  function table(action: "row" | "column" | "remove-row" | "remove-column" | "remove") {
    const selection = range();
    const node = selection?.startContainer;
    const element = node instanceof Element ? node : node?.parentElement;
    const cell = element?.closest("td,th") as HTMLTableCellElement | null;
    const target = cell?.closest("table") as HTMLTableElement | null;
    if (!cell || !target || !editor.current?.contains(target)) return;
    const column = cell.cellIndex;
    const row = cell.parentElement as HTMLTableRowElement;
    if (action === "row") { const next = target.insertRow(row.rowIndex + 1); for (let i = 0; i < row.cells.length; i++) next.insertCell().textContent = ""; }
    if (action === "column") Array.from(target.rows).forEach(r => r.insertCell(Math.min(cell.cellIndex + 1, r.cells.length)));
    if (action === "remove-row") row.remove();
    if (action === "remove-column") Array.from(target.rows).forEach(r => r.cells[column]?.remove());
    if (action === "remove" || !target.rows.length || !target.rows[0].cells.length) target.remove();
    sync();
  }
  async function uploadImage(file: File | undefined) {
    if(!file)return;
    setError("");setUploading(true);
    try {const form=new FormData();form.append("file",file);form.append("_payload",JSON.stringify({alt:file.name}));const response=await fetch("/api/media",{method:"POST",body:form});const result=await response.json();if(!response.ok || !result.doc?.url)throw new Error(result.message || "图片上传失败");insert(`<p><img src="${escapeHtml(result.doc.url)}" alt="${escapeHtml(file.name)}"></p><p><br></p>`);}
    catch(error){setError(error instanceof Error?error.message:"图片上传失败");}finally{setUploading(false);}
  }
  function paste(event: ClipboardEvent<HTMLDivElement>) {
    event.preventDefault(); remember();
    const html = event.clipboardData.getData("text/html");
    const text = event.clipboardData.getData("text/plain");
    const rows = text.trim().split(/\r?\n/).map(r => r.split("\t"));
    const next = html ? documentToContentBody(new DOMParser().parseFromString(html, "text/html")) : editedContentBody(undefined, rows.length > 1 && rows[0].length > 1 ? rowsToMarkdownTable(rows) : text);
    insert(contentBodyToHtml(next));
  }
  function switchMode(next: typeof mode) {
    if (mode === "visual") sync();
    rendered.current = contentBodyToHtml(body);
    setMode(next);
  }
  return <section className="form-card editor-card">
    <div className="panel-heading body-editor-heading"><h2>正文内容</h2><div className="heading-actions">{(["visual", "markdown", "preview"] as const).map(m => <button className="text-button" type="button" key={m} aria-pressed={mode === m} onClick={() => switchMode(m)}>{{visual:"可视化编辑",markdown:"Markdown",preview:"预览"}[m]}</button>)}</div></div>
    <input type="hidden" name="bodyRich" value={JSON.stringify(body || null)} />
    <input type="hidden" name="body" value={source} />
    {mode === "visual" && <><div className="editor-toolbar" onMouseDown={e => e.preventDefault()}>
      <button type="button" onClick={() => format("h2")}>标题</button><button type="button" onClick={() => format("strong")}>加粗</button><button type="button" onClick={() => format("em")}>斜体</button><button type="button" onClick={() => format("blockquote")}>引用</button>
      <button type="button" onClick={() => insert("<ul><li>列表项</li></ul><p><br></p>")}>列表</button>
      <button type="button" onClick={() => insert("<table><thead><tr><th>项目</th><th>说明</th></tr></thead><tbody><tr><td>项目一</td><td>填写内容</td></tr><tr><td>项目二</td><td>填写内容</td></tr></tbody></table><p><br></p>")}>插入表格</button>
      <button type="button" onClick={() => table("row")}>增加行</button><button type="button" onClick={() => table("column")}>增加列</button><button type="button" onClick={() => table("remove-row")}>删除行</button><button type="button" onClick={() => table("remove-column")}>删除列</button><button type="button" onClick={() => table("remove")}>删除表格</button>
    </div><div className="editor-toolbar"><label className="secondary-button">{uploading ? "上传中…" : "插入正文图片"}<input hidden type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={e=>{remember();void uploadImage(e.target.files?.[0]);e.target.value="";}} /></label><input className="form-control" aria-label="正文图片网址" placeholder="或粘贴图片网址" value={imageUrl} onChange={e=>setImageUrl(e.target.value)} /><button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>{if(!/^https?:\/\//i.test(imageUrl) && !/^\/(?!\/)/.test(imageUrl)){setError("请填写完整图片网址");return;}insert(`<p><img src="${escapeHtml(imageUrl)}" alt="正文图片"></p><p><br></p>`);setImageUrl("");setError("");}}>插入图片</button></div>{error&&<p className="error" role="alert">{error}</p>}<div key={mode} ref={editor} className="editor-content content-body visual-body-editor" contentEditable suppressContentEditableWarning role="textbox" aria-label="正文可视化编辑" aria-multiline="true" onInput={sync} onMouseUp={remember} onKeyUp={remember} onPaste={paste} dangerouslySetInnerHTML={{__html: rendered.current}} /></>}
    {mode === "markdown" && <textarea className="editor-content" aria-label="正文 Markdown 编辑" value={source} onChange={e => { setSource(e.target.value); const next = editedContentBody(body, e.target.value); setBody(next); rendered.current = contentBodyToHtml(next); }} />}
    {mode === "preview" && <div className="body-editor-preview"><ContentBody body={body} /></div>}
    <p className="form-help body-editor-help">支持直接编辑和粘贴网页、Excel 表格。将光标放入单元格后可增删行列；Markdown 转换会简化合并单元格。</p>
  </section>;
}
