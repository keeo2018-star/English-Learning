'use client';

import { learningLanguages, type LearningCollection } from '@/lib/collections';
import { SelectableButton } from '@/components/ui/selection';

// Mount only when Add, Library, Review, pronunciation and offline data are scoped.
export function CollectionSwitcher({ collections, active, onSelect, allowAll = false, all = false }: {
  collections: LearningCollection[];
  active: string;
  onSelect: (id: string | null) => void;
  allowAll?: boolean;
  all?: boolean;
}) {
  if (collections.length < 2) return null;
  return <nav className="collection-switcher" aria-label="Learning language">
    {collections.map(c => <SelectableButton key={c.id} selected={!all && c.id === active}
      className="secondary" onClick={() => onSelect(c.id)}>
      {learningLanguages[c.target_language].label}
      {collections.some(other => other.id !== c.id && other.target_language === c.target_language) &&
        ` · ${c.explanation_language === 'en' ? 'English' : 'Chinese'} explanations`}
    </SelectableButton>)}
    {allowAll && <SelectableButton selected={all} className="secondary"
      onClick={() => onSelect(null)}>All Languages</SelectableButton>}
  </nav>;
}
