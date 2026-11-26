'use client';
import {LanguagePicker} from '@/components/ui/language-picker';

import { useCallback, useRef, useState, type FormEvent } from 'react';
import { LanguageMark } from '@/components/ui/language-mark';
import { Select } from '@/components/ui/select';
import { SwitchControl } from '@/components/ui/selection';
import { Sheet } from '@/components/ui/sheet';
import { Toast } from '@/components/ui/toast';
import { supabase } from '@/lib/supabase';
import { Icon } from '@/components/ui/icon';
import type { useCollections } from '@/lib/use-collections';
import { learningLanguages, type LearningCollection, type TargetLanguage } from '@/lib/collections';

const general = ['unspecified', 'beginner', 'intermediate', 'advanced'];
const cefr = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

function levelOptions(language: TargetLanguage) {
  return [...general, ...(language === 'zh-CN' ? [] : cefr)].map(level =>
    <option value={level} key={level}>{levelLabel(level)}</option>);
}

function levelLabel(level: string) {
  return level === 'unspecified' ? 'Level not set' : level.charAt(0).toUpperCase() + level.slice(1);
}

export function MyLanguages({ owner, state }: { owner: string; state: ReturnType<typeof useCollections> }) {
 const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const opener=useRef<HTMLButtonElement|null>(null);
  const [panel, setPanel] = useState<string | null>(null);
  const [ordering, setOrdering] = useState(false);
  const [target, setTarget] = useState<TargetLanguage>('fr');
  const row = state.collections.find(item => item.id === panel);
  const dismissNotice = useCallback(() => setNotice(''), []);
  const close = () => { setPanel(null); setError(''); setNotice(''); };

  async function change(item: LearningCollection, changes: Record<string, unknown>) {
    if (!supabase || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await supabase.from('learning_collections').update(changes)
        .eq('id', item.id).eq('user_id', owner).select('id').single();
      if (result.error) throw result.error;
      state.refresh();
      setNotice('Language settings updated');
    } catch (failure) {
      setError((failure as { code?: string }).code === '23505'
        ? 'This language with these explanations is already in My Languages.'
        : 'Could not save language settings. Please try again.');
    } finally { setBusy(false); }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || busy) return;
    const fields = new FormData(event.currentTarget);
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await supabase.from('learning_collections').insert({
        user_id: owner, target_language: target, explanation_language: fields.get('explanation'),
        proficiency_level: fields.get('level'), display_order: Math.min(999, state.collections.length),
      }).select('*').single();
      if (result.error) throw result.error;
      state.select(result.data.id);
      state.refresh();
      close();
      setNotice('Language added');
    } catch (failure) {
      setError((failure as { code?: string }).code === '23505'
        ? 'This language with these explanations is already in My Languages.'
        : 'Could not create this language. Please try again.');
    } finally { setBusy(false); }
  }

  async function move(index: number) {
    if (!supabase || busy || index < 1) return;
    const ids = state.collections.map(item => item.id);
    [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
    setBusy(true); setError('');
    try {
      const result = await supabase.rpc('noted_reorder_collections', { p_ids: ids });
      if (result.error) throw result.error;
      state.refresh();
    } catch {
      setError('Could not change the order. Please try again.');
    } finally { setBusy(false); }
  }


  const active = row?.id === state.active?.id;
  const name = row && learningLanguages[row.target_language].label;

  return <section aria-label="My Languages" className="my-languages">
    <div className="wb-section-heading">
      <h2>My Languages</h2>
      {state.enabled && state.collections.length > 1 && <button type="button" className="text-button"
        aria-pressed={ordering} onClick={() => { setOrdering(!ordering); setError(''); }}>
        {ordering ? 'Done ordering' : 'Edit order'}
      </button>}
    </div>
    {!state.ready && <p role="status">Loading languages…</p>}
    {state.ready && !state.collections.length && <p>Language settings are unavailable. <button type="button" className="text-button" onClick={state.refresh}>Try again</button></p>}
    <ul className="wb-language-list">
      {state.collections.map((item, index) => {
        const label = learningLanguages[item.target_language].label;
        const contents = <>
          <LanguageMark language={item.target_language}/>
          <span className="wb-language-row-copy">
            <strong>{label}{item.id===state.active?.id&&<small>Active</small>}</strong>
            <small id={`language-details-${item.id}`}>{levelLabel(item.proficiency_level)} · {item.explanation_language === 'en' ? 'English' : 'Chinese'} explanations
              </small>
          </span>
        </>;
        return <li key={item.id}>
          {state.enabled && !ordering
            ? <button className="wb-language-row" type="button" aria-haspopup="dialog"
                aria-label={`Settings for ${label}`} aria-describedby={`language-details-${item.id}`} onClick={event => { opener.current=event.currentTarget; setError(''); setPanel(item.id); }}>
                {contents}<Icon name="chevronRight" size={16}/>
              </button>
            : <div className="wb-language-row">{contents}{ordering && index > 0 &&
                <button className="text-button" type="button" disabled={busy}
                  aria-label={`Move ${label} up`} onClick={() => void move(index)}>Move up</button>}</div>}
        </li>;
      })}
    </ul>
    {state.enabled && <button type="button" className="text-button" disabled={busy} aria-haspopup="dialog"
      onClick={event => { opener.current=event.currentTarget; setError(''); setTarget('fr'); setPanel('add'); }}><Icon name="add" size={16}/> Add a language</button>}

    {panel === 'add' && <Sheet title="Add a language" busy={busy} onClose={close} returnFocus={opener}>
      <form className="language-sheet-fields" onSubmit={create}>
        <label>Language to learn<Select aria-label="Language to learn" value={target} disabled={busy}
          onChange={event => setTarget(event.target.value as TargetLanguage)}>
          {Object.entries(learningLanguages).map(([code, lang]) => <option key={code} value={code}>{lang.label}</option>)}
        </Select></label>
        <label>Explanation language<Select aria-label="Explanation language" name="explanation" defaultValue="zh-CN" disabled={busy}>
          <option value="zh-CN">Chinese</option><option value="en">English</option>
        </Select></label>
        <label>Approximate level<Select aria-label="Approximate level" key={target} name="level" defaultValue="beginner" disabled={busy}>{levelOptions(target)}</Select></label>
        {error && <p role="alert">{error}</p>}
        <button disabled={busy}>{busy ? 'Adding…' : `Add ${learningLanguages[target].label}`}</button>
        <button className="text-button" type="button" disabled={busy} onClick={close}>Cancel</button>
      </form>
    </Sheet>}

    {row && <Sheet title="Language settings" busy={busy} onClose={close} returnFocus={opener}>
      <div className="language-sheet-fields">
        <p className="wb-sheet-identity"><LanguageMark language={row.target_language}/><strong>{name}</strong></p>
        <div className="wb-setting-field">Explanation language
          <LanguagePicker plain align="start" label={`Explanation language for ${name}`} value={row.explanation_language}
            disabled={busy||row.target_language==='en'} options={[{id:'zh-CN',label:'Chinese'},{id:'en',label:'English'}]}
            onSelect={value=>void change(row,{explanation_language:value})}/>
          <small>{row.target_language==='en'?'Choose an explanation language when adding an English collection.':'Changes future explanations. Saved meanings stay as written.'}</small>
        </div>
        <div className="wb-setting-field">Learning level
          <LanguagePicker plain align="start" label={`Level for ${name}`} value={row.proficiency_level} disabled={busy}
            options={levelOptions(row.target_language).map(option=>({id:String(option.props.value),label:String(option.props.children)}))}
            onSelect={value=>void change(row,{proficiency_level:value})}/>
        </div>
        <SwitchControl label="Auto pronunciation" disabled={busy} checked={row.preferences.auto_pronunciation !== false}
          onChange={event => void change(row, { preferences: { ...row.preferences, auto_pronunciation: event.target.checked } })}/>
        {row.target_language === 'en' && <label>Pronunciation<Select disabled={busy} value={row.preferences.accent === 'US' ? 'US' : 'UK'}
          onChange={event => void change(row, { preferences: { ...row.preferences, accent: event.target.value } })}>
          <option value="UK">UK</option><option value="US">US</option>
        </Select></label>}
        {active ? <p className="wb-supporting">Currently active</p> :
          <button type="button" className="secondary" disabled={busy} onClick={() => { state.select(row.id); setNotice('Active language updated'); }}>
            Set as active language
          </button>}
        {error && <p role="alert">{error}</p>}
        <button type="button" disabled={busy} onClick={close}>Done</button>
      </div>
    </Sheet>}
    {error && !panel && <p role="alert">{error}</p>}
    {notice && <Toast message={notice} onDismiss={dismissNotice}/>}
  </section>;
}
