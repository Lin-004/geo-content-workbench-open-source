import { normalizeContentType } from "@/lib/content-types";
import { relationId } from "./content-plan-utils";
type Item = { id: number | string; contentType?: string | null; articleCategory?: string | null; question?: string | null; title?: string | null };
type Asset = Item & { contentPlanItem?: unknown; deletedAt?: string | null };
/** Read legacy records only when the correspondence is unambiguous. */
export function matchPlanArticles<I extends Item, A extends Asset>(items: I[], assets: A[]) {
  const active = assets.filter((a) => !a.deletedAt);
  const used = new Set<string>();
  return items.map((item) => {
    let asset = active.find((a) => relationId(a.contentPlanItem) === String(item.id));
    if (!asset) {
      const candidates = active.filter((a) => !a.contentPlanItem && !used.has(String(a.id)) && normalizeContentType(a.contentType) === normalizeContentType(item.contentType) && a.articleCategory === item.articleCategory && ((a.question && a.question === item.question) || (a.title && a.title === item.title)));
      if (candidates.length === 1 && items.filter(i => normalizeContentType(i.contentType) === normalizeContentType(candidates[0].contentType) && i.articleCategory === candidates[0].articleCategory && ((candidates[0].question && candidates[0].question === i.question) || (candidates[0].title && candidates[0].title === i.title))).length === 1) asset = candidates[0];
    }
    if (asset) used.add(String(asset.id));
    return { item, asset };
  });
}
