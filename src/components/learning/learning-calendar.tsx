"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { activityLevel, activityScale, localDateKey, reviewCoverage, type ActivityMonth } from '@/lib/activity';
import { SelectableButton } from '@/components/ui/selection';
import type { LearningItem } from '@/lib/learning';
export const DEMO_EVENTS_KEY = 'noted-demo-review-events-v1';
const EMPTY_WORDS: LearningItem[] = [];
export function LearningCalendar({ account, revision = 0, words = EMPTY_WORDS, initiallyOpen = false }: { account: string; revision?: number; words?: LearningItem[]; initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const [month, setMonth] = useState('');
  const [today, setToday] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [metric, setMetric] = useState<'reviewed' | 'added'>('reviewed');
  const [selected, setSelected] = useState('');
  const [result, setResult] = useState<{ key: string; data?: ActivityMonth; error?: string } | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const update = () => {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const date = localDateKey(new Date(), zone);
      setTimezone(zone); setToday(date);
      setMonth(current => current || date.slice(0, 7));
      setSelected(current => current || date);
    };
    update();
    window.addEventListener('focus', update);
    return () => window.removeEventListener('focus', update);
  }, []);
  useEffect(() => {
    if (!open) return;
    const refresh = () => { if (document.visibilityState === 'visible') setRetry(value => value + 1); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    const timer = window.setInterval(refresh, 30000);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [open, account]);
  const requestKey = `${account}/${month}/${timezone}/${revision}/${retry}`;
  useEffect(() => {
    if (!open || !month) return;
    let cancelled = false;
    const run = async () => {
      try {
        let data: ActivityMonth;
        if (supabase) {
          const response = await supabase.rpc('learning_calendar', { p_month: month + '-01', p_timezone: timezone });
          if (response.error) throw response.error;
          if (!response.data || !Array.isArray(response.data.days)) throw new Error('Invalid activity response.');
          data = response.data;
        } else {
          const events: { learning_item_id: string; reviewed_at: string }[] = JSON.parse(localStorage.getItem(DEMO_EVENTS_KEY) || '[]');
          const days = new Map<string, { reviewed: Set<string>; added: number }>();
          const day = (date: string) => { if (!days.has(date)) days.set(date, { reviewed: new Set(), added: 0 }); return days.get(date)!; };
          for (const e of events) day(localDateKey(new Date(e.reviewed_at), timezone)).reviewed.add(e.learning_item_id);
          for (const word of words) if (word.created_at) day(localDateKey(new Date(word.created_at), timezone)).added++;
          const sinceKey = 'noted-demo-activity-since';
          const since = localStorage.getItem(sinceKey) || new Date().toISOString();
          localStorage.setItem(sinceKey, since);
          data = { tracking_since: since, days: [...days].filter(([date]) => date.startsWith(month)).map(([date, values]) => ({ date, reviewed: values.reviewed.size, added: values.added })) };
        }
        if (!cancelled) setResult({ key: requestKey, data });
      } catch (error) {
        const code = typeof error === 'object' && error && 'code' in error ? error.code : '';
        if (!cancelled) setResult({ key: requestKey, error: code === 'PGRST202' || code === 'PGRST205'
          ? 'Learning activity isn’t available yet. Your saved items are safe.'
          : 'Activity could not be loaded. Check your connection and try again.' });
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [open, month, timezone, account, revision, retry, requestKey, words]);
  function move(delta: number) {
    const [year, number] = month.split('-').map(Number);
    const date = new Date(year, number - 1 + delta, 1, 12);
    const next = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    setMonth(next); setSelected(next === today.slice(0, 7) ? today : next + '-01');
  }
  const data = result?.key === requestKey ? result.data : undefined;
  const error = result?.key === requestKey ? result.error : undefined;
  const [year, number] = month.split('-').map(Number);
  const first = month ? new Date(year, number - 1, 1, 12) : null;
  const days = first ? new Date(year, number, 0).getDate() : 0;
  const offset = first ? (first.getDay() + 6) % 7 : 0;
  const selectedData = data?.days.find(day => day.date === selected);
  const coverage = data ? reviewCoverage(selected, data.tracking_since, timezone) : 'unknown';
  return <details data-metric={metric} className="learning-calendar wb-ui-text" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>Learning calendar</summary>
    {open && month && <div className="learning-calendar-content">
      <div className="calendar-metrics" role="group" aria-label="Calendar activity">
        <SelectableButton className="secondary" selected={metric === 'reviewed'} onClick={() => setMetric('reviewed')}>Reviewed</SelectableButton>
        <SelectableButton className="secondary" selected={metric === 'added'} onClick={() => setMetric('added')}>Added</SelectableButton>
      </div>
      <div className="calendar-month">
        <button type="button" className="secondary" aria-label="Previous month" disabled={month <= '1970-01'} onClick={() => move(-1)}>←</button>
        <h2>{first!.toLocaleDateString('en', { month: 'long', year: 'numeric' })}</h2>
        <button type="button" className="secondary" aria-label="Next month" disabled={month >= today.slice(0, 7)} onClick={() => move(1)}>→</button>
      </div>
      {!data && !error && <p role="status">Loading activity…</p>}
      {error && <div role="status"><p>{error}</p><button type="button" className="secondary" onClick={() => setRetry(n => n + 1)}>Try again</button></div>}
      {data && <>
        <div className="calendar-grid" role="group" aria-label={`${first!.toLocaleDateString('en', { month: 'long', year: 'numeric' })} learning activity`}>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <span className="calendar-weekday" key={day}>{day}</span>)}
          {Array.from({ length: offset }, (_, i) => <span key={`empty-${i}`} />)}
          {Array.from({ length: days }, (_, i) => {
            const date = `${month}-${String(i + 1).padStart(2, '0')}`;
            const value = data.days.find(day => day.date === date)?.[metric] || 0;
            const unknown = metric === 'reviewed' && reviewCoverage(date, data.tracking_since, timezone) === 'unknown';
            const label = `${new Date(year, number - 1, i + 1, 12).toLocaleDateString('en', { month: 'long', day: 'numeric' })}: ${unknown ? 'review history unavailable' : `${value} ${metric}`}`;
            return <button key={date} type="button" className="calendar-day" data-level={unknown ? 'unknown' : activityLevel(value,metric)}
              aria-label={label} aria-pressed={selected === date} aria-current={date === today ? 'date' : undefined}
              disabled={date > today} onClick={() => setSelected(date)}>{i + 1}</button>;
          })}
        </div>
        <div className="calendar-legend" aria-label={`${metric==='added'?'Added':'Reviewed'} activity scale`}>{activityScale(metric).map((label,index)=><span key={label}><span className="calendar-swatch" data-level={index} aria-hidden="true"/>{label}</span>)}</div>
        <div className="calendar-day-summary" aria-live="polite" aria-atomic="true">
          <strong>{new Date(selected + 'T12:00:00').toLocaleDateString('en', { month: 'long', day: 'numeric' })}</strong>
          <span>Reviewed: {coverage === 'unknown' ? 'Unavailable' : `${selectedData?.reviewed ?? 0}${coverage === 'partial' ? ' · partial day' : ''}`}</span>
          <span>Added: {selectedData?.added ?? 0}</span>
        </div>
        <p className="calendar-note">{metric === 'reviewed' ? 'Unique items per day. Earlier review history is unavailable; the first tracking day may be partial.' : 'Original save dates. Before tracking began, only items still in your Library are known.'} Dates use {timezone}.</p>
      </>}
    </div>}
  </details>;
}
