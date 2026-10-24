export type PublicationGroupAsset = { contentType?: string | null; id: number | string; title?: string; body?: unknown; articleCategory?: string | null; plannedPublishDate?: string | null };
export type PublicationGroupTask = { id: number | string; contentAsset: number | string | PublicationGroupAsset; status: string };
export type PublicationTaskGroup<T extends PublicationGroupTask = PublicationGroupTask> = { key: string; asset?: PublicationGroupAsset; tasks: T[] };

function relationId(value: PublicationGroupTask["contentAsset"]) {
  return typeof value === "object" ? value.id : value;
}

export function groupPublicationTasks<T extends PublicationGroupTask>(tasks: T[]) {
  const groups = new Map<string, PublicationTaskGroup<T>>();
  for (const task of tasks) {
    const key = String(relationId(task.contentAsset));
    const asset = typeof task.contentAsset === "object" ? task.contentAsset : undefined;
    const current = groups.get(key) || { key, asset, tasks: [] };
    if (!current.asset && asset) current.asset = asset;
    current.tasks.push(task);
    groups.set(key, current);
  }
  return [...groups.values()];
}

export function publicationGroupStatus(tasks: PublicationGroupTask[]) {
  if (tasks.every((task) => task.status === "published")) return "published";
  if (tasks.every((task) => task.status === "blocked")) return "blocked";
  if (tasks.every((task) => task.status === "pending")) return "pending";
  if (tasks.some((task) => task.status === "published")) return "publishing";
  return "partial";
}

export function filterPublicationTaskGroups<T extends PublicationGroupTask>(groups: PublicationTaskGroup<T>[], query = "", status = "all") {
  const normalizedQuery = query.trim().toLowerCase();
  return groups.filter((group) => {
    const title = (group.asset?.title || `内容 #${group.key}`).toLowerCase();
    return (!normalizedQuery || title.includes(normalizedQuery)) && (status === "all" || group.tasks.some((task) => task.status === status));
  });
}
