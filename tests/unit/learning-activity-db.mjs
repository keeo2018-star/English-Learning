import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { rateItem, reviewState } from '../../src/lib/review.ts';
const a = '11111111-1111-4111-8111-111111111111';
const b = '33333333-3333-4333-8333-333333333333';
const itemId = '22222222-2222-4222-8222-222222222222';
const otherId = '44444444-4444-4444-8444-444444444444';
test('learning activity migration: real PostgreSQL transactions, RLS, timezone and history', async t => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;`);
    await db.exec(await fs.readFile(new URL('../../supabase/schema.sql', import.meta.url), 'utf8'));
    await db.exec(`grant all on public.words to authenticated, anon;
      insert into auth.users values ('${a}'), ('${b}');
      insert into public.words(id,user_id,word,meaning,created_at,review_state) values
        ('${itemId}','${a}','hello','greeting','2026-11-01T00:30:00Z','{"version":1,"review_count":7,"last_rating":"sure","last_reviewed_at":"2026-10-01T12:00:00Z"}'),
        ('${otherId}','${b}','private','private','2026-11-01T00:30:00Z',null);`);
    const originalItems = (await db.query('select * from words order by id')).rows;
    const originalPolicies = (await db.query("select policyname,cmd,qual,with_check from pg_policies where schemaname='public' and tablename='words' order by policyname")).rows;
    const originalGrants = (await db.query("select grantee,privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='words' order by grantee,privilege_type")).rows;
    await db.exec('create publication supabase_realtime;');
    const migration = await fs.readFile(new URL('../../supabase/migrations/20261104_learning_activity.sql', import.meta.url), 'utf8');
    await db.exec(migration); await db.exec(migration);
    const scalar = async sql => Object.values((await db.query(sql)).rows[0])[0];
    await t.test('safe rerun preserves old state and backfills additions, never review history', async () => {
      assert.equal(await scalar('select count(*)::int from review_events'), 0);
      assert.deepEqual((await db.query('select * from words order by id')).rows.map(row => { const copy = { ...row }; delete copy.item_type; return copy; }), originalItems);
      assert.equal(await scalar('select count(*)::int from auth.users'), 2);
      assert.deepEqual((await db.query("select policyname,cmd,qual,with_check from pg_policies where schemaname='public' and tablename='words' order by policyname")).rows, originalPolicies);
      assert.deepEqual((await db.query("select grantee,privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='words' order by grantee,privilege_type")).rows, originalGrants);
      assert.equal(await scalar('select count(*)::int from learning_add_events'), 2);
      assert.equal(await scalar("select count(*)::int from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='words'"), 1);
      assert.equal(await scalar(`select review_state->>'review_count' from words where id='${itemId}'`), '7');
    });
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${a}',false);`);
    const grade = async (eventId, rating = 'sure', id = itemId, previous) => {
      const item = previous || (await db.query('select * from public.words where id=$1', [id])).rows[0];
      const next = rateItem(item, rating);
      return (await db.query('select public.record_learning_review($1,$2,$3,$4,$5,$6,$7) as item', [eventId,id,rating==='sure'?'sure':'not_sure',reviewState(item)?.review_count||0,next.due_at,next.interval_days,next.review_state])).rows[0].item;
    };
    const event = crypto.randomUUID();
    let before, after;
    await t.test('atomic update creates exactly one event; retry cannot double grade', async () => {
      before = (await db.query('select * from words where id=$1',[itemId])).rows[0];
      after = await grade(event, 'sure', itemId, before);
      assert.equal(after.review_state.review_count, 8);
      assert.equal(await scalar('select count(*)::int from review_events'), 1);
      const retry = await grade(event, 'unsure', itemId, before);
      assert.equal(retry.review_state.review_count, 8);
      assert.equal(retry.review_state.last_rating, 'sure');
      assert.equal(await scalar('select count(*)::int from review_events'), 1);
    });
    await t.test('conflicting or failed save cannot insert an event or lose progress', async () => {
      await assert.rejects(grade(crypto.randomUUID(), 'sure', itemId, before), /another device/);
      assert.equal(await scalar('select count(*)::int from review_events'), 1);
      assert.equal(await scalar(`select review_state->>'review_count' from words where id='${itemId}'`), '8');
      const next = await grade(crypto.randomUUID(), 'unsure');
      assert.equal(next.review_state.review_count, 9);
      assert.equal(await scalar('select count(*)::int from review_events'), 2);
      assert.equal(await scalar("select count(*)::int from review_events where familiarity_rating='not_sure'"), 1);
    });
    await t.test('legacy clients still create real events; updates do not double log RPC', async () => {
      await db.exec(`update words set review_state=jsonb_set(review_state,'{review_count}','10') where id='${itemId}'`);
      assert.equal(await scalar('select count(*)::int from review_events'), 3);
    });
    await t.test('RLS and RPC ownership isolate accounts; direct event mutation is denied', async () => {
      assert.equal(await scalar(`select count(*)::int from words where user_id='${b}'`), 0);
      await assert.rejects(db.query('insert into review_events(id,user_id,learning_item_id,familiarity_rating) values($1,$2,$3,$4)', [crypto.randomUUID(),a,itemId,'sure']), /permission denied/);
      await assert.rejects(grade(crypto.randomUUID(), 'sure', otherId, before), /unavailable/);
      await db.exec(`select set_config('request.jwt.claim.sub','${b}',false);`);
      assert.equal(await scalar('select count(*)::int from review_events'), 0);
      assert.equal(await scalar('select count(*)::int from learning_add_events'), 1);
      const summary = await scalar("select public.learning_calendar('2026-11-01','UTC')");
      assert.equal(summary.days.reduce((n, d) => n + d.reviewed, 0), 0);
      await assert.rejects(grade(event, 'sure', otherId, {...before,id:otherId,review_state:null}), /already used/);
      await db.exec('set role anon;');
      await assert.rejects(db.query('select * from review_events'), /permission denied/);
      await assert.rejects(db.query("select public.learning_calendar('2026-11-01','UTC')"), /permission denied/);
      await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`);
      await assert.rejects(db.query("select public.learning_calendar('2026-11-01','UTC')"), /Sign in/);
    });
    await t.test('daily distinct counts and month boundaries follow IANA timezones, including DST', async () => {
      await db.exec('delete from review_events;');
      for (const date of ['2026-11-01T00:30:00Z','2026-11-01T01:30:00Z','2026-11-01T07:30:00Z']) {
        await db.query('insert into review_events values($1,$2,$3,$4,$5)',[crypto.randomUUID(),a,itemId,date,'sure']);
      }
      await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${a}',false);`);
      const utc = await scalar("select public.learning_calendar('2026-11-01','UTC')");
      assert.deepEqual(utc.days, [{date:'2026-11-01',reviewed:1,added:1}]);
      const la = await scalar("select public.learning_calendar('2026-10-01','America/Los_Angeles')");
      assert.deepEqual(la.days, [{date:'2026-10-31',reviewed:1,added:1}]);
      const nz = await scalar("select public.learning_calendar('2026-11-01','Pacific/Auckland')");
      assert.deepEqual(nz.days, [{date:'2026-11-01',reviewed:1,added:1}]);
      assert.ok(utc.tracking_since);
      await assert.rejects(db.query("select public.learning_calendar('2026-11-02','UTC')"), /Invalid month/);
      await assert.rejects(db.query("select public.learning_calendar('2026-11-01','Made/Up')"), /Invalid timezone/);
    });
    await t.test('malformed optional legacy progress cannot break a valid new review', async () => {
      await db.exec(`reset role; update words set review_state='{"version":1,"last_rating":"sure","last_reviewed_at":"2026-10-01T12:00:00Z","review_count":"broken"}' where id='${otherId}';
        set role authenticated; select set_config('request.jwt.claim.sub','${b}',false);`);
      const next = await grade(crypto.randomUUID(), 'sure', otherId);
      assert.equal(next.review_state.review_count, 1);
      await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${a}',false);`);
    });
    await t.test('read-only preflight reports types and policies without changing any rows', async () => {
      await db.exec('reset role;');
      const count = await scalar('select count(*)::int from review_events');
      const results = await db.exec(await fs.readFile(new URL('../../supabase/preflight_learning_activity.sql', import.meta.url), 'utf8'));
      const report = JSON.parse(results.find(r => r.rows[0]?.noted_schema_preflight)?.rows[0].noted_schema_preflight);
      assert.ok(report.columns.some(c => c.table === 'words' && c.column === 'id' && c.type === 'uuid'));
      assert.ok(report.policies.some(p => p.table === 'words' && p.name === 'Owners read words'));
      assert.equal(await scalar('select count(*)::int from review_events'), count);
      await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${a}',false);`);
    });
    await t.test('deleting vocabulary retains actual past addition and review activity', async () => {
      await db.exec(`delete from words where id='${itemId}'`);
      assert.equal(await scalar('select count(*)::int from review_events'), 3);
      assert.equal(await scalar('select count(*)::int from learning_add_events'), 1);
    });
    await t.test('guard rejects type mismatch atomically before changing the schema', async () => {
      await db.exec('reset role; alter table words alter column word type varchar(120);');
      await assert.rejects(db.exec(migration), /expected text/);
      await db.exec('rollback;');
      assert.equal(await scalar("select format_type(atttypid,atttypmod) from pg_attribute where attrelid='words'::regclass and attname='word'"), 'character varying(120)');
      await db.exec('alter table words alter column word type text;');
    });
    await t.test('guard refuses to replace an unrelated table or function with a colliding name', async () => {
      await db.exec("comment on table review_events is null;");
      await assert.rejects(db.exec(migration), /not marked as a Noted activity table/);
      await db.exec("rollback; comment on table review_events is 'noted-learning-activity-v1'; comment on function learning_calendar(date,text) is null;");
      await assert.rejects(db.exec(migration), /will not be silently replaced/);
      await db.exec("rollback; comment on function learning_calendar(date,text) is 'noted-learning-activity-v1';");
      await db.exec(migration);
    });
  } finally { await db.close(); }
});
