export const BUSINESS_TIMEZONE = "Asia/Shanghai";
export function businessDate(value: string | Date = new Date()): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIMEZONE }).format(new Date(value));
}
export function addBusinessDays(date: string, days: number): string {
  const value = new Date(`${businessDate(date)}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function businessDayRange(date: string) {
  return { greater_than_equal: `${businessDate(date)}T00:00:00+08:00`, less_than: `${addBusinessDays(date, 1)}T00:00:00+08:00` };
}
export function businessWeekStart(date: string = businessDate()) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addBusinessDays(date, -(day === 0 ? 6 : day - 1));
}
export function businessDateTime(value?: string | null) {
  return value ? new Intl.DateTimeFormat("sv-SE", { timeZone: BUSINESS_TIMEZONE, dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
}

export function isBusinessDate(value: unknown): value is string {
  if(typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value;
}
