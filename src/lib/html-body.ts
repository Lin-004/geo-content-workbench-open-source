/** Convert a parsed HTML document to the same structural body used by the editor and renderer. */
export function documentToContentBody(document: Document) {
  const common = {version:1,format:'',indent:0,direction:'ltr'};
  const ignored = new Set(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','INPUT','BUTTON','SVG','NOSCRIPT']);
  const marks: Record<string,number> = {STRONG:1,B:1,EM:2,I:2,S:4,DEL:4,U:8,CODE:16};
  const inline = (node: Node, format=0): any[] => {
    if (node.nodeType===3) return [{type:'text',version:1,text:node.textContent||'',format,mode:'normal',style:'',detail:0}];
    if (node.nodeType!==1) return [];
    const element=node as Element, tag=element.tagName.toUpperCase();
    if(ignored.has(tag)) return [];
    if(tag==='BR')return[{type:'linebreak',version:1}];
    if(tag==='IMG')return[{type:'image',version:1,src:element.getAttribute('src')||'',altText:element.getAttribute('alt')||'正文图片'}];
    const children=Array.from(element.childNodes).flatMap(n=>inline(n,format|(marks[tag]||0)));
    if(tag==='A')return[{...common,type:'link',url:element.getAttribute('href')||'',children}];
    return children;
  };
  const blocks = (node: Node): any[] => {
    if(node.nodeType===3)return node.textContent?.trim() ? [{...common,type:'paragraph',children:inline(node)}] : [];
    if(node.nodeType!==1)return[];
    const e=node as Element,tag=e.tagName.toUpperCase();
    if(ignored.has(tag))return[];
    if(tag==='TABLE')return[{...common,type:'table',children:Array.from(e.querySelectorAll('tr')).filter(r=>r.closest('table')===e).map(row=>({...common,type:'tablerow',children:Array.from(row.children).filter(c=>/^(TD|TH)$/.test(c.tagName)).map(c=>({...common,type:'tablecell',headerState:c.tagName==='TH'?1:0,colSpan:Math.max(1,Number(c.getAttribute('colspan'))||1),rowSpan:Math.max(1,Number(c.getAttribute('rowspan'))||1),children:Array.from(c.childNodes).flatMap(blocks)}))}))}];
    if(/^H[1-6]$/.test(tag))return[{...common,type:'heading',tag:tag.toLowerCase(),children:Array.from(e.childNodes).flatMap(n=>inline(n))}];
    if(tag==='UL'||tag==='OL')return[{...common,type:'list',listType:tag==='OL'?'number':'bullet',tag:tag.toLowerCase(),start:1,children:Array.from(e.children).filter(c=>c.tagName==='LI').map((c,i)=>({...common,type:'listitem',value:i+1,children:Array.from(c.childNodes).flatMap(n=>inline(n))}))}];
    if(tag==='P'||tag==='BLOCKQUOTE'||tag==='PRE')return[{...common,type:tag==='BLOCKQUOTE'?'quote':tag==='PRE'?'code':'paragraph',children:Array.from(e.childNodes).flatMap(n=>inline(n))}];
    if(tag==='IMG')return inline(e);
    if(Array.from(e.children).some(c=>/^(P|DIV|TABLE|H[1-6]|UL|OL|BLOCKQUOTE|PRE)$/.test(c.tagName)))return Array.from(e.childNodes).flatMap(blocks);
    return [{...common,type:'paragraph',children:inline(e)}];
  };
  return {root:{...common,type:'root',children:Array.from(document.body.childNodes).flatMap(blocks)}};
}
