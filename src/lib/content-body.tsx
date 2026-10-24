import { Fragment, type ElementType, type ReactNode } from "react";

export type ContentBodyInline =
  | { type: "text"; text: string }
  | { type: "bold" | "italic" | "strike" | "underline" | "code"; children: ContentBodyInline[] }
  | { type: "link"; href: string; children: ContentBodyInline[] }
  | { type: "image"; src: string; alt: string }
  | { type: "break" };

export type TableCell = { children: ContentBodyInline[]; header?: boolean; colSpan?: number; rowSpan?: number };

export type ContentBodyBlock =
  | { type: "heading"; level: number; children: ContentBodyInline[] }
  | { type: "paragraph"; children: ContentBodyInline[] }
  | { type: "list"; ordered: boolean; items: ContentBodyInline[][] }
  | { type: "quote"; children: ContentBodyInline[] }
  | { type: "code"; language?: string; text: string }
  | { type: "image"; src: string; alt: string }
  | { type: "rule" }
  | { type: "spacer" }
  | { type: "table"; rows: TableCell[][] };

type UnknownNode = { [key: string]: unknown; type?: string; children?: unknown[]; text?: string; format?: number; url?: string; src?: string; alt?: string; altText?: string };

function node(value: unknown): UnknownNode | null {
  return value && typeof value === "object" ? value as UnknownNode : null;
}

function childrenOf(value: unknown) {
  const current = node(value)?.children;
  return Array.isArray(current) ? current : [];
}

export function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
}

function safeUrl(value: unknown, image = false) {
  if (typeof value !== "string") return null;
  const url = value.trim();
  if (/^(https?:\/\/|\/(?!\/)|#|mailto:)/i.test(url)) return image && /^mailto:/i.test(url) ? null : url;
  if (image && /^data:image\/(gif|jpe?g|png|webp);base64,/i.test(url)) return url;
  return null;
}

function imageInfo(value: UnknownNode) {
  const candidates = [value.src, value.url, node(value.value)?.url, node(value.value)?.src, node(value.fields)?.url, node(value.fields)?.src];
  const src = candidates.map((item) => safeUrl(item, true)).find(Boolean);
  if (!src) return null;
  const alt = value.alt || value.altText || node(value.value)?.alt || node(value.value)?.altText || "正文图片";
  return { src, alt: String(alt) };
}

function textFromNode(value: unknown): string {
  const current = node(value);
  if (!current) return "";
  if (typeof current.text === "string") return current.text;
  return childrenOf(current).map(textFromNode).join("");
}

function hasLexicalMarks(value: unknown) {
  return childrenOf(value).some((child) => {
    const current = node(child);
    return Boolean(current && (current.type !== "text" || (typeof current.text === "string" && (Number(current.format) || current.style))));
  });
}

function lexicalInline(value: unknown): ContentBodyInline[] {
  const current = node(value);
  if (!current) return [];
  if (current.type === "linebreak") return [{ type: "break" }];
  if (current.type === "link" || current.type === "autolink") {
    const href = safeUrl(current.url || node(current.fields)?.url);
    const children = childrenOf(current).flatMap(lexicalInline);
    return href ? [{ type: "link", href, children }] : children;
  }
  if (current.type === "upload" || current.type === "image") {
    const image = imageInfo(current);
    return image ? [{ type: "image", ...image }] : [];
  }
  if (typeof current.text !== "string") return childrenOf(current).flatMap(lexicalInline);
  let result: ContentBodyInline[] = [{ type: "text", text: current.text }];
  const format = Number(current.format) || 0;
  if (format & 16) result = [{ type: "code", children: result }];
  if (format & 8) result = [{ type: "underline", children: result }];
  if (format & 4) result = [{ type: "strike", children: result }];
  if (format & 2) result = [{ type: "italic", children: result }];
  if (format & 1) result = [{ type: "bold", children: result }];
  return result;
}

function hasMarkdown(value: string) {
  return /(^|\n)\s{0,3}(#{1,6})\s+|(^|\n)\s*([-*+]\s+|\d+[.)]\s+|>\s+|```)|\*\*|__|~~|`|\[[^\]]+\]\([^\)]+\)/.test(value);
}

function markdownInline(value: string): ContentBodyInline[] {
  const result: ContentBodyInline[] = [];
  let rest = value;
  const pattern = /(!?\[[^\]]*\]\([^\)]+\)|\*\*([^*]+)\*\*|__([^_]+)__|~~([^~]+)~~|`([^`]+)`|\*([^*]+)\*|_([^_]+)_)/;
  while (rest) {
    const match = rest.match(pattern);
    if (!match || match.index === undefined) {
      result.push({ type: "text", text: rest });
      break;
    }
    if (match.index > 0) result.push({ type: "text", text: rest.slice(0, match.index) });
    const token = match[0];
    const image = token.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (image) {
      const src = safeUrl(image[2], true);
      if (src) result.push({ type: "image", src, alt: image[1] || "正文图片" });
      else result.push({ type: "text", text: token });
    } else if (link) {
      const href = safeUrl(link[2]);
      result.push(href ? { type: "link", href, children: markdownInline(link[1]) } : { type: "text", text: link[1] });
    } else if (match[2] || match[3]) result.push({ type: "bold", children: markdownInline(match[2] || match[3] || "") });
    else if (match[4]) result.push({ type: "strike", children: markdownInline(match[4]) });
    else if (match[5]) result.push({ type: "code", children: [{ type: "text", text: match[5] }] });
    else if (match[6] || match[7]) result.push({ type: "italic", children: markdownInline(match[6] || match[7] || "") });
    rest = rest.slice(match.index + token.length);
  }
  return result;
}

function tableRow(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/(?<!\\)\|$/, "").split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

function markdownBlocks(lines: string[]): ContentBodyBlock[] {
  const blocks: ContentBodyBlock[] = [];
  let index = 0;
  let paragraph: string[] = [];
  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ type: "paragraph", children: markdownInline(paragraph.join("\n")) });
      paragraph = [];
    }
  };
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      flushParagraph();
      if (blocks.length && blocks[blocks.length - 1].type !== "spacer") blocks.push({ type: "spacer" });
      index += 1;
      continue;
    }
    const headerCells = tableRow(line);
    const separators = index + 1 < lines.length ? tableRow(lines[index + 1]) : [];
    if (line.includes("|") && headerCells.length > 1 && separators.length === headerCells.length && separators.every((cell) => /^:?-{3,}:?$/.test(cell))) {
      flushParagraph();
      const rows: TableCell[][] = [headerCells.map((cell) => ({ header: true, children: markdownInline(cell) }))];
      index += 2;
      while (index < lines.length && lines[index].trim() && lines[index].includes("|")) {
        const cells = tableRow(lines[index]);
        if (cells.length !== headerCells.length) break;
        rows.push(cells.map((cell) => ({ children: markdownInline(cell) })));
        index += 1;
      }
      blocks.push({ type: "table", rows });
      continue;
    }
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      flushParagraph();
      blocks.push({ type: "heading", level: heading[1].length, children: markdownInline(heading[2]) });
      index += 1;
      continue;
    }
    if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      flushParagraph();
      blocks.push({ type: "rule" });
      index += 1;
      continue;
    }
    const fence = line.match(/^\s*(```+|~~~+)\s*(.*)$/);
    if (fence) {
      flushParagraph();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^\s*(```+|~~~+)\s*$/.test(lines[index])) code.push(lines[index++]);
      if (index < lines.length) index += 1;
      blocks.push({ type: "code", language: fence[2] || undefined, text: code.join("\n") });
      continue;
    }
    if (/^\s*>/.test(line)) {
      flushParagraph();
      const quote: string[] = [];
      while (index < lines.length && /^\s*>/.test(lines[index])) quote.push(lines[index++].replace(/^\s*>\s?/, ""));
      blocks.push({ type: "quote", children: markdownInline(quote.join("\n")) });
      continue;
    }
    const list = line.match(/^\s*([-*+]\s+|\d+[.)]\s+)(.+)$/);
    if (list) {
      flushParagraph();
      const ordered = /^\d/.test(list[1]);
      const items: ContentBodyInline[][] = [];
      while (index < lines.length) {
        const item = lines[index].match(/^\s*([-*+]\s+|\d+[.)]\s+)(.+)$/);
        if (!item || /^\d/.test(item[1]) !== ordered) break;
        items.push(markdownInline(item[2]));
        index += 1;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }
    paragraph.push(line);
    index += 1;
  }
  flushParagraph();
  return blocks;
}

function lexicalBlock(value: unknown): ContentBodyBlock[] {
  const current = node(value);
  if (!current) return [];
  if (current.type === "table") {
    const rows = childrenOf(current).filter((row) => node(row)?.type === "tablerow").map((row) => childrenOf(row).map((cell): TableCell => {
      const value = node(cell)!;
      const paragraphs = childrenOf(value);
      const children: ContentBodyInline[] = paragraphs.flatMap((paragraph, index) => [...(index ? [{ type: "break" as const }] : []), ...lexicalInline(paragraph)]);
      return { children, header: Boolean(Number(value.headerState)), colSpan: Math.max(1, Number(value.colSpan) || 1), rowSpan: Math.max(1, Number(value.rowSpan) || 1) };
    }));
    return [{ type: "table", rows }];
  }
  if (current.type === "heading") return [{ type: "heading", level: Math.min(Math.max(Number(current.tag?.toString().replace("h", "")) || 2, 1), 6), children: childrenOf(current).flatMap(lexicalInline) }];
  if (current.type === "quote") return [{ type: "quote", children: childrenOf(current).flatMap(lexicalInline) }];
  if (current.type === "list") {
    const items = childrenOf(current).map((item) => childrenOf(item).flatMap(lexicalInline));
    return [{ type: "list", ordered: current.listType === "number" || current.listType === "ordered", items }];
  }
  if (current.type === "code") return [{ type: "code", language: typeof current.language === "string" ? current.language : undefined, text: textFromNode(current) }];
  if (current.type === "upload" || current.type === "image") {
    const image = imageInfo(current);
    return image ? [{ type: "image", ...image }] : [];
  }
  return [];
}

function rootChildren(body: unknown) {
  const root = node(body)?.root;
  return childrenOf(root);
}

export function contentBodyToBlocks(body: unknown): ContentBodyBlock[] {
  const blocks: ContentBodyBlock[] = [];
  let markdownRun: string[] = [];
  const flushMarkdown = () => {
    if (markdownRun.length) blocks.push(...markdownBlocks(markdownRun));
    markdownRun = [];
  };
  for (const value of rootChildren(body)) {
    const current = node(value);
    if (!current) continue;
    if (current.type === "paragraph") {
      const text = textFromNode(current);
      if (!text && !hasLexicalMarks(current)) {
        markdownRun.push("");
      } else if (!hasLexicalMarks(current) || hasMarkdown(text)) {
        markdownRun.push(text);
      } else {
        flushMarkdown();
        blocks.push({ type: "paragraph", children: childrenOf(current).flatMap(lexicalInline) });
      }
      continue;
    }
    flushMarkdown();
    blocks.push(...lexicalBlock(current));
  }
  flushMarkdown();
  return blocks;
}

function renderInline(items: ContentBodyInline[]): ReactNode[] {
  return items.map((item, index) => {
    if (item.type === "text") return <Fragment key={index}>{item.text}</Fragment>;
    if (item.type === "break") return <br key={index} />;
    if (item.type === "image") return <img key={index} src={item.src} alt={item.alt} loading="lazy" />;
    if (item.type === "link") return <a key={index} href={item.href} target="_blank" rel="noreferrer">{renderInline(item.children)}</a>;
    if (item.type === "bold") return <strong key={index}>{renderInline(item.children)}</strong>;
    if (item.type === "italic") return <em key={index}>{renderInline(item.children)}</em>;
    if (item.type === "strike") return <del key={index}>{renderInline(item.children)}</del>;
    if (item.type === "underline") return <u key={index}>{renderInline(item.children)}</u>;
    return <code key={index}>{renderInline(item.children)}</code>;
  });
}

export function ContentBody({ body }: { body: unknown }) {
  const blocks = contentBodyToBlocks(body);
  return <div className="content-body-rendered">{blocks.map((block, index) => {
    if (block.type === "spacer") return <div className="content-body-spacer" aria-hidden="true" key={index} />;
    if (block.type === "heading") { const Tag = `h${block.level}` as ElementType; return <Tag key={index}>{renderInline(block.children)}</Tag>; }
    if (block.type === "paragraph") return <p key={index}>{renderInline(block.children)}</p>;
    if (block.type === "quote") return <blockquote key={index}>{renderInline(block.children)}</blockquote>;
    if (block.type === "code") return <pre key={index} data-language={block.language}><code>{block.text}</code></pre>;
    if (block.type === "image") return <figure key={index}><img src={block.src} alt={block.alt} loading="lazy" /></figure>;
    if (block.type === "rule") return <hr key={index} />;
    if (block.type === "table") return <div className="content-table-scroll" key={index}><table><tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => { const Tag = cell.header ? "th" : "td"; return <Tag key={cellIndex} colSpan={cell.colSpan} rowSpan={cell.rowSpan}>{renderInline(cell.children)}</Tag>; })}</tr>)}</tbody></table></div>;
    const List = block.ordered ? "ol" : "ul";
    return <List key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item)}</li>)}</List>;
  })}</div>;
}

function inlineHtml(items: ContentBodyInline[]): string {
  return items.map((item) => {
    if (item.type === "text") return escapeHtml(item.text).replace(/\n/g, "<br />");
    if (item.type === "break") return "<br />";
    if (item.type === "image") return `<img src="${escapeHtml(item.src)}" alt="${escapeHtml(item.alt)}" />`;
    if (item.type === "link") return `<a href="${escapeHtml(item.href)}" target="_blank" rel="noreferrer">${inlineHtml(item.children)}</a>`;
    if (item.type === "bold") return `<strong>${inlineHtml(item.children)}</strong>`;
    if (item.type === "italic") return `<em>${inlineHtml(item.children)}</em>`;
    if (item.type === "strike") return `<del>${inlineHtml(item.children)}</del>`;
    if (item.type === "underline") return `<u>${inlineHtml(item.children)}</u>`;
    return `<code>${inlineHtml(item.children)}</code>`;
  }).join("");
}

export function contentBodyToHtml(body: unknown) {
  return contentBodyToBlocks(body).map((block) => {
    if (block.type === "spacer") return "<p><br /></p>";
    if (block.type === "heading") return `<h${block.level}>${inlineHtml(block.children)}</h${block.level}>`;
    if (block.type === "paragraph") return `<p>${inlineHtml(block.children)}</p>`;
    if (block.type === "quote") return `<blockquote>${inlineHtml(block.children)}</blockquote>`;
    if (block.type === "code") return `<pre><code>${escapeHtml(block.text)}</code></pre>`;
    if (block.type === "image") return `<figure><img src="${escapeHtml(block.src)}" alt="${escapeHtml(block.alt)}" /></figure>`;
    if (block.type === "rule") return "<hr />";
    if (block.type === "table") return `<table><tbody>${block.rows.map((row) => `<tr>${row.map((cell) => { const tag = cell.header ? "th" : "td"; return `<${tag} colspan="${cell.colSpan || 1}" rowspan="${cell.rowSpan || 1}">${inlineHtml(cell.children)}</${tag}>`; }).join("")}</tr>`).join("")}</tbody></table>`;
    const tag = block.ordered ? "ol" : "ul";
    return `<${tag}>${block.items.map((item) => `<li>${inlineHtml(item)}</li>`).join("")}</${tag}>`;
  }).join("");
}

function inlineText(items: ContentBodyInline[]): string {
  return items.map((item) => item.type === "text" ? item.text : item.type === "break" ? "\n" : item.type === "image" ? `[${item.alt}]` : inlineText("children" in item ? item.children : [])).join("");
}

export function contentBodyToPlainText(body: unknown) {
  return contentBodyToBlocks(body).map((block) => {
    if (block.type === "heading" || block.type === "paragraph" || block.type === "quote") return inlineText(block.children);
    if (block.type === "table") return block.rows.map((row) => row.map((cell) => inlineText(cell.children)).join("\t")).join("\n");
    if (block.type === "list") return block.items.map(inlineText).join("\n");
    if (block.type === "code") return block.text;
    if (block.type === "image") return `[${block.alt}]`;
    return "";
  }).filter((line) => line !== "").join("\n\n");
}

function inlineMarkdown(items: ContentBodyInline[]): string {
  return items.map((item): string => {
    if (item.type === "text") return item.text;
    if (item.type === "break") return "\n";
    if (item.type === "image") return `![${item.alt}](${item.src})`;
    const text = inlineMarkdown(item.children);
    if (item.type === "link") return `[${text}](${item.href})`;
    if (item.type === "bold") return `**${text}**`;
    if (item.type === "italic") return `*${text}*`;
    if (item.type === "strike") return `~~${text}~~`;
    if (item.type === "code") return `\`${text}\``;
    return text;
  }).join("");
}

export function rowsToMarkdownTable(rows: string[][]): string {
  if (!rows.length) return "";
  const width = Math.max(...rows.map((row) => row.length));
  const line = (row: string[]) => `| ${Array.from({ length: width }, (_, index) => (row[index] || "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ")).join(" | ")} |`;
  return [line(rows[0]), line(Array(width).fill("---")), ...rows.slice(1).map(line)].join("\n");
}

export function contentBodyToMarkdown(body: unknown): string {
  // Plain paragraph runs already contain Markdown; preserve their source exactly.
  const raw = rootChildren(body);
  if (raw.every((value) => node(value)?.type === "paragraph" && !hasLexicalMarks(value))) return raw.map(textFromNode).join("\n");
  return contentBodyToBlocks(body).map((block): string => {
    if (block.type === "spacer") return "";
    if (block.type === "table") return rowsToMarkdownTable(block.rows.map((row) => row.map((cell) => inlineMarkdown(cell.children))));
    if (block.type === "heading") return `${"#".repeat(block.level)} ${inlineMarkdown(block.children)}`;
    if (block.type === "paragraph") return inlineMarkdown(block.children);
    if (block.type === "quote") return inlineMarkdown(block.children).split("\n").map((line) => `> ${line}`).join("\n");
    if (block.type === "list") return block.items.map((item, index) => `${block.ordered ? `${index + 1}.` : "-"} ${inlineMarkdown(item)}`).join("\n");
    if (block.type === "code") return `\`\`\`${block.language || ""}\n${block.text}\n\`\`\``;
    if (block.type === "image") return `![${block.alt}](${block.src})`;
    return "---";
  }).join("\n\n");
}

export function markdownToContentBody(text: string) {
  return { root: { type: "root", version: 1, format: "", indent: 0, direction: "ltr", children: text.split("\n").map((line) => ({ type: "paragraph", version: 1, format: "", indent: 0, direction: "ltr", children: line ? [{ type: "text", version: 1, text: line, mode: "normal", style: "", detail: 0, format: 0 }] : [] })) } };
}

export function editedContentBody(initialBody: unknown, source: string) {
  return initialBody && contentBodyToMarkdown(initialBody) === source ? initialBody : markdownToContentBody(source);
}
