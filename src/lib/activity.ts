export type ActivityDay = { date: string; reviewed: number; added: number };
export type ActivityMonth = { tracking_since: string | null; days: ActivityDay[] };
export function localDateKey(value: Date, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  const get = (type: string) => parts.find(p => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function activityLevel(count: number) { return count <= 0 ? 0 : count < 5 ? 1 : count < 15 ? 2 : count < 30 ? 3 : 4; }
export function reviewCoverage(date: string, since: string | null, timezone: string) {
  if (!since) return 'unknown';
  const start = localDateKey(new Date(since), timezone);
  return date < start ? 'unknown' : date === start ? 'partial' : 'complete';
}
