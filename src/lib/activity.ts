export type ActivityDay = { date: string; reviewed: number; added: number };
export type ActivityMonth = { tracking_since: string | null; days: ActivityDay[] };
export function localDateKey(value: Date, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  const get = (type: string) => parts.find(p => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
type ActivityMetric = 'reviewed' | 'added';
const activityBands = {
 reviewed: [{min:0,label:'0'},{min:1,label:'1–19'},{min:20,label:'20–49'},{min:50,label:'50–99'},{min:100,label:'100+'}],
 added: [{min:0,label:'0'},{min:1,label:'1–4'},{min:5,label:'5–14'},{min:15,label:'15–29'},{min:30,label:'30+'}],
};
export function activityScale(metric:ActivityMetric) { return activityBands[metric].map(band=>band.label); }
export function activityLevel(count:number,metric:ActivityMetric='added') {
 const bands=activityBands[metric];
 for(let i=bands.length-1;i>0;i--)if(count>=bands[i].min)return i;
 return 0;
}
export function reviewCoverage(date: string, since: string | null, timezone: string) {
  if (!since) return 'unknown';
  const start = localDateKey(new Date(since), timezone);
  return date < start ? 'unknown' : date === start ? 'partial' : 'complete';
}
