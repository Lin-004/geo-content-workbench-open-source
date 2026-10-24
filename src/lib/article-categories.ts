/** Categories are open codes; itemKey identifies an article, not its category. */
export const DEFAULT_ARTICLE_CATEGORIES = [
  { value: "enterprise", label: "A类·企业号", code: "A" },
  { value: "general", label: "B类·综合自媒体", code: "B" },
  { value: "vertical", label: "C类·垂直生活类", code: "C" },
];
export function normalizeArticleCategory(value: unknown): string | undefined {
  const raw = String(value ?? "").trim();
  const known = DEFAULT_ARTICLE_CATEGORIES.find(c => [c.value, c.label, c.code].includes(raw));
  if (known) return known.value;
  return /^[A-Z][A-Z0-9_-]{0,31}$/.test(raw) ? raw : undefined;
}
export function articleCategoryCode(value: string): string {
  return DEFAULT_ARTICLE_CATEGORIES.find(c => c.value === value)?.code || value;
}
export function articleCategoryLabel(value: string): string {
  return DEFAULT_ARTICLE_CATEGORIES.find(c => c.value === value)?.label || `${value}类`;
}
export function articleCategoryOptions(values: Array<string | null | undefined> = []) {
  return [...new Set([...DEFAULT_ARTICLE_CATEGORIES.map(c => c.value), ...values.filter((v): v is string => Boolean(v))])].map(value => ({value, label: articleCategoryLabel(value)}));
}
