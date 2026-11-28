'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Disclosure } from '@/components/ui/disclosure';
import { supabase } from '@/lib/supabase';

export function AiQuotaRedemption() {
  const [limit, setLimit] = useState<5 | 50 | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const requestInFlight = useRef(false);

  useEffect(() => {
    let active = true;
    void supabase?.rpc('noted_ai_daily_limit').then(({ data, error }) => {
      if (active && !error && (data === 5 || data === 50)) setLimit(data);
    });
    return () => { active = false; };
  }, []);

  async function redeem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || requestInFlight.current) return;
    const form = event.currentTarget;
    const code = String(new FormData(form).get('code') ?? '').trim();
    if (!/^(?:[0-9]{6}|[A-Za-z0-9_-]{43})$/.test(code)) {
      setMessage('Enter a valid internal code.');
      return;
    }
    requestInFlight.current = true;
    setBusy(true);
    setMessage('');
    try {
      const { data, error } = await supabase.rpc('noted_ai_redeem_code', { p_code: code });
      if (error) throw error;
      if (data !== true) {
        setMessage('This code is invalid or has already been used.');
        return;
      }
      form.reset();
      setLimit(50);
    } catch {
      setMessage('Could not redeem the code. Please try again.');
    } finally {
      requestInFlight.current = false;
      setBusy(false);
    }
  }

  if (limit === null) return null;
  if (limit === 50) return <p role="status">AI daily limit: 50 requests.</p>;
  return <Disclosure label="Redeem an internal AI code">
    <form method="post" onSubmit={redeem} className="ai-quota-form">
      <label>Internal code<input name="code" type="password" autoComplete="off" spellCheck={false} required maxLength={70} readOnly={busy}/></label>
      <Button type="submit" variant="secondary" size="medium" disabled={busy}>{busy ? 'Redeeming…' : 'Redeem code'}</Button>
      {message && <p role="status">{message}</p>}
    </form>
  </Disclosure>;
}
