import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ContentBody, contentBodyToBlocks, contentBodyToHtml, contentBodyToMarkdown, contentBodyToPlainText, editedContentBody, markdownToContentBody, rowsToMarkdownTable } from "../src/lib/content-body";

const source = "## 出行建议\n\n| 你是谁 | 建议 |\n| --- | --- |\n| 情侣 | **庭院私汤** |\n| 四位好友 | 四床房 |\n\n表格后的正文";

test("Markdown 表格保留标题、行列、强调和前后正文", () => {
  const body = markdownToContentBody(source);
  const blocks = contentBodyToBlocks(body);
  const table = blocks.find((block) => block.type === "table");
  assert.equal(table?.rows.length, 3);
  assert.equal(table?.rows[0].length, 2);
  const html = contentBodyToHtml(body);
  assert.match(html, /<table><tbody><tr><th/);
  assert.match(html, /<strong>庭院私汤<\/strong>/);
  assert.match(html, /表格后的正文/);
  assert.equal(contentBodyToMarkdown(body), source);
  assert.match(contentBodyToPlainText(body), /情侣\t庭院私汤/);
  const rendered = renderToStaticMarkup(createElement(ContentBody, { body }));
  assert.match(rendered, /content-table-scroll/);
  assert.match(rendered, /<table>/);
});

test("表格单元格的竖线、空白、中文和危险内容安全处理", () => {
  const source = rowsToMarkdownTable([["项目", "说明"], ["A|B", ""], ["<script>alert(1)</script>", "[链接](javascript:alert(1))"]]);
  const body = markdownToContentBody(source);
  const table = contentBodyToBlocks(body).find((block) => block.type === "table");
  assert.equal(table?.rows.length, 3);
  assert.equal(table?.rows[1][0].children[0].type, "text");
  assert.match(contentBodyToHtml(body), /A\|B/);
  assert.doesNotMatch(contentBodyToHtml(body), /<script>|href="javascript:/);
});

test("代码块内的表格语法不变成表格", () => {
  const blocks = contentBodyToBlocks(markdownToContentBody(`\`\`\`\n${source}\n\`\`\``));
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, "code");
});

function paragraph(text: string, format = 0) {
  return { type: "paragraph", version: 1, children: [{ type: "text", version: 1, text, format }] };
}
const lexical = { root: { type: "root", version: 1, children: [
  { type: "heading", tag: "h2", children: paragraph("对照表").children },
  { type: "table", version: 1, children: [
    { type: "tablerow", children: [{ type: "tablecell", headerState: 1, colSpan: 2, rowSpan: 1, children: [paragraph("建议", 1)] }] },
    { type: "tablerow", children: [{ type: "tablecell", headerState: 0, children: [paragraph("情侣")] }, { type: "tablecell", children: [paragraph("庭院私汤"), paragraph("独立院落")] }] },
  ] },
] } };

test("Lexical 表格保留合并单元格、表头、多段落与文字格式", () => {
  const html = contentBodyToHtml(lexical);
  assert.match(html, /<th colspan="2" rowspan="1"><strong>建议<\/strong>/);
  assert.match(html, /庭院私汤<br \/>独立院落/);
  assert.match(renderToStaticMarkup(createElement(ContentBody, { body: lexical })), /colSpan="2"/i);
  assert.match(contentBodyToMarkdown(lexical), /\| \*\*建议\*\* \|/);
});

test("未修改正文时保存原始对象，修改后表格仍可重开和渲染", () => {
  const markdown = contentBodyToMarkdown(lexical);
  assert.equal(editedContentBody(lexical, markdown), lexical);
  const changed = editedContentBody(lexical, markdown.replace("情侣", "两人出行"));
  const html = contentBodyToHtml(changed);
  assert.match(html, /<table>/);
  assert.match(html, /两人出行/);
  assert.equal(contentBodyToMarkdown(changed), markdown.replace("情侣", "两人出行"));
});
