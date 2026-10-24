import { businessDate } from "./business-date";
/** A platform-specific time takes precedence; otherwise use the article's publish date. */
export function publicationTaskDate(task: {plannedPublishAt?:string|null}, asset?: {plannedPublishDate?:string|null}) {
 const value=task.plannedPublishAt || asset?.plannedPublishDate;
 return value ? businessDate(value) : "";
}
