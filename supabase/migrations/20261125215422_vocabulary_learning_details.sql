-- Nullable extensions on the existing owner-scoped vocabulary relation.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $$
begin
  if not exists (select 1 from pg_class where oid = to_regclass('public.words') and relrowsecurity) then
    raise exception 'An existing RLS-enabled public.words table is required.';
  end if;
  if exists (
    select 1 from pg_attribute
    where attrelid = 'public.words'::regclass and not attisdropped
      and attname in ('personal_note', 'learning_details')
      and (attnotnull
        or atttypid <> (case attname when 'personal_note' then 'text' else 'jsonb' end)::regtype
        or col_description(attrelid, attnum) is distinct from 'noted-learning-details-v1')
  ) then
    raise exception 'A vocabulary detail column already exists with incompatible provenance.';
  end if;
end $$;

alter table public.words
  add column if not exists personal_note text
    constraint words_personal_note_length check (char_length(personal_note) <= 3000),
  add column if not exists learning_details jsonb
    constraint words_learning_details_shape check (
      jsonb_typeof(learning_details) = 'object' and octet_length(learning_details::text) <= 12000
    );

comment on column public.words.personal_note is 'noted-learning-details-v1';
comment on column public.words.learning_details is 'noted-learning-details-v1';

-- Editors and the legacy Voice Notes RPC can change the example independently.
-- Retain the previous text and note but never show translations/spans tied to another example.
create function public.noted_invalidate_learning_details() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.learning_details is null or new.learning_details is distinct from old.learning_details then
    return new;
  end if;
  if new.example is distinct from old.example then
    new.learning_details := new.learning_details - array['exampleTranslation','highlight','exampleSource'];
  end if;
  if new.word is distinct from old.word or new.meaning is distinct from old.meaning then
    new.learning_details := new.learning_details - array['lemma','partOfSpeech','usage','region','register','highlight','exampleTranslation'];
  end if;
  return new;
end $$;
revoke all on function public.noted_invalidate_learning_details() from public, anon, authenticated;
create trigger noted_invalidate_learning_details
before update of word, meaning, example on public.words
for each row execute function public.noted_invalidate_learning_details();

commit;
