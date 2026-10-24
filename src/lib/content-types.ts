export const CONTENT_TYPE_OPTIONS = [{ label: "文章", value: "article" }, { label: "短视频脚本", value: "video_script" }] as const;
export type ContentType = typeof CONTENT_TYPE_OPTIONS[number]["value"];
/** Omitted types in old documents remain articles; explicit unknown values are invalid. */
export function normalizeContentType(value: unknown): ContentType | undefined {
  if (value === undefined || value === null || value === "" || value === "文章") return "article";
  if (value === "短视频脚本" || value === "video_script") return "video_script";
  return value === "article" ? "article" : undefined;
}
export function contentTypeLabel(value: unknown): string { return normalizeContentType(value) === "video_script" ? "短视频脚本" : "文章"; }
