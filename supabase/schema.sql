-- Run once in your Supabase SQL editor. No service-role key is needed by the app.
create table if not exists public.words (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 word text not null check (char_length(trim(word)) between 1 and 120),
 meaning text not null check (char_length(trim(meaning)) between 1 and 2000),
 example text not null default '' check (char_length(example) <= 3000),
 due_at timestamptz not null default now(),
 interval_days integer not null default 0 check (interval_days >= 0),
 created_at timestamptz not null default now()
);
alter table public.words enable row level security;
create policy "Owners read words" on public.words for select to authenticated using ((select auth.uid()) = user_id);
create policy "Owners add words" on public.words for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Owners update words" on public.words for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Owners delete words" on public.words for delete to authenticated using ((select auth.uid()) = user_id);
create index if not exists words_user_due_idx on public.words(user_id, due_at);
