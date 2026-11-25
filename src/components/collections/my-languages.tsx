'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { learningLanguages, parseCollections, type LearningCollection } from '@/lib/collections';

// The read-only foundation is safe before migration. Management waits for scoped flows.
export function MyLanguages({ owner }: { owner: string }) {
  const [rows, setRows] = useState<LearningCollection[]>([]);
  useEffect(() => {
    let active = true;
    if (supabase && navigator.onLine) {
      void Promise.resolve(supabase.rpc('noted_collections_snapshot')).then(({ data, error }) => {
        if (active && !error) setRows(parseCollections(data, owner));
      }).catch(() => { /* Missing schema/offline must not block Profile. */ });
    }
    return () => { active = false; };
  }, [owner]);
  if (!rows.length) return null;
  return <section aria-label="My Languages" className="my-languages">
    <h2>My Languages</h2>
    {rows.map(row => <p key={row.id}>
      {learningLanguages[row.target_language].label}
      {row.proficiency_level !== 'unspecified' && ` — ${row.proficiency_level}`}
      <span> — Explained in {row.explanation_language === 'en' ? 'English' : 'Chinese'}</span>
    </p>)}
  </section>;
}
