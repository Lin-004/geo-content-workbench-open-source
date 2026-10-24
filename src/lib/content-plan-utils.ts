export type PlanStatus = "uncreated" | "creating" | "pending_review" | "pending_publish" | "publishing" | "done";

export type PlanAssetLike = { id: number | string; status?: string | null; deletedAt?: string | null; contentPlanItem?: unknown; articleCategory?: string | null; question?: string | null; title?: string | null; targetPlatforms?: string[] | null };
export type PlanTaskLike = { contentAsset: number | string | { id: number | string }; status?: string | null; platform?: string | null; cancelledAt?: string | null };

export function relationId(value: unknown): string {
  if (typeof value === "number" || typeof value === "string") return String(value);
  if (value && typeof value === "object" && "id" in value) {
    const id = value.id;
    if (typeof id === "number" || typeof id === "string") return String(id);
  }
  return "";
}

export function activePlanAssets<T extends PlanAssetLike>(assets: T[]): T[] {
  return assets.filter((asset) => !asset.deletedAt);
}

export function aggregateContentPlanStatus(assets: PlanAssetLike[], tasks: PlanTaskLike[], items: Array<{ id: number | string; title?: string | null; question?: string | null; articleCategory?: string | null }> = []): PlanStatus {
  const activeAssets = activePlanAssets(assets);
  if (activeAssets.length === 0) return "uncreated";
  const covered = new Set(activeAssets.map((a) => relationId(a.contentPlanItem)).filter(Boolean));
  for (const item of items) {
    if (covered.has(String(item.id))) continue;
    const candidates = activeAssets.filter((a) => !a.contentPlanItem && a.articleCategory === item.articleCategory && ((a.question && a.question === item.question) || (a.title && a.title === item.title)));
    if (candidates.length === 1 && items.filter((i) => i.articleCategory === candidates[0].articleCategory && ((candidates[0].question && candidates[0].question === i.question) || (candidates[0].title && candidates[0].title === i.title))).length === 1) covered.add(String(item.id));
  }
  if (items.some((item) => !covered.has(String(item.id)))) return "creating";
  if (activeAssets.some((asset) => asset.status !== "approved")) return "pending_review";

  const assetIds = new Set(activeAssets.map((asset) => String(asset.id)));
  const planTasks = tasks.filter((task) => !task.cancelledAt && assetIds.has(String(relationId(task.contentAsset))));
  const published = planTasks.filter((task) => task.status === "published").length;
  const allCovered = activeAssets.every(asset => { const ownTasks = planTasks.filter(task => relationId(task.contentAsset) === String(asset.id)); return asset.targetPlatforms?.length ? asset.targetPlatforms.every(platform => ownTasks.some(task => task.platform === platform && task.status === "published")) : ownTasks.length > 0; });
  if (planTasks.length > 0 && published === planTasks.length && allCovered) return "done";
  if (published > 0) return "publishing";
  return "pending_publish";
}

export function lexicalBodyText(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const visit = (value: unknown): string => {
    if (!value || typeof value !== "object") return "";
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("children" in value && Array.isArray(value.children)) return value.children.map(visit).join("\n");
    return "";
  };
  return visit((body as { root?: unknown }).root || body).trim();
}

export function hasMeaningfulBody(body: unknown): boolean {
  return lexicalBodyText(body).length > 0;
}
