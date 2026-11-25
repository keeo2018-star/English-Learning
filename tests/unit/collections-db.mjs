import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { rateItem, reviewState } from '../../src/lib/review.ts';

const A = '11111111-1111-4111-8111-111111111111';
const B = '33333333-3333-4333-8333-333333333333';
const E = '22222222-2222-4222-8222-222222222222';
const F = '44444444-4444-4444-8444-444444444444';
const read = p => fs.readFile(new URL('../../' + p, import.meta.url), 'utf8');

test('Collections additive migration preserves English vocabulary/history and enforces ownership', async t => {
  const db = new PGlite();
  const asUser = async id => db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false)`);
  try {
    await db.exec(`
      create role anon;create role authenticated;create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to anon,authenticated;
      grant execute on function auth.uid() to anon,authenticated;
      create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean not null default false,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,metadata jsonb);
      alter table storage.objects enable row level security;
      grant usage on schema storage to anon,authenticated;
      grant all on storage.objects to anon,authenticated;
    `);
    await db.exec(await read('supabase/schema.sql'));
    await db.exec(`grant all on words to authenticated;insert into auth.users values('${A}'),('${B}');create publication supabase_realtime;`);
    for (const name of ['20261104_learning_activity', '20261107_discover', '20261108_continuous_discover', '20261110_expression_voice_notes', '20261125_offline_review']) {
      await db.exec(await read('supabase/migrations/' + name + '.sql'));
    }
    const state = { version: 1, review_count: 7, sure_count: 4, unsure_count: 3, last_rating: 'sure', last_reviewed_at: '2026-01-01T10:00:00Z' };
    await db.query(`insert into words(id,user_id,word,meaning,example,item_type,review_state,interval_days) values($1,$2,'chat','私人释义','My own context.','expression',$3,14)`, [E, A, JSON.stringify(state)]);
    await db.exec(`
      insert into expression_voice_files(id,user_id,item_id,storage_path,duration_seconds,mime_type,byte_size,state)
      values('${F}','${A}','${E}','${A}/${E}/${F}',2.5,'audio/webm',1000,'active');
      insert into storage.objects(bucket_id,name,metadata) values('noted-voice-notes','${A}/${E}/${F}','{"size":1000,"mimetype":"audio/webm"}');
      insert into review_events values(gen_random_uuid(),'${A}','${E}','2026-01-01T10:00:00Z','sure');
    `);
    await asUser(A);
    await db.query("select discover_action('skip','{}','Europe/London')");
    await db.exec("reset role;select set_config('request.jwt.claim.sub','',false)");
    const before = (await db.query('select * from words')).rows;
    const policies = (await db.query('select * from pg_policies order by schemaname,tablename,policyname')).rows;
    const historic = {};
    for (const table of ['auth.users', 'storage.objects', 'storage.buckets', 'public.learning_activity_start', 'public.review_events', 'public.learning_add_events', 'public.discover_profiles', 'public.discover_assessments', 'public.discover_daily_sets', 'public.discover_batches', 'public.discover_known', 'public.expression_voice_files']) {
      historic[table] = (await db.query('select to_jsonb(t) data from ' + table + ' t order by to_jsonb(t)::text')).rows.map(r => r.data);
    }
    const audit = async () => (await db.exec(await read('supabase/collections_data_audit.sql'))).find(result => result.rows?.length)?.rows;
    const beforeAudit = await audit();
    const sql = await read('supabase/migrations/20261125_collections_foundation.sql');
    await db.exec(sql);
    await db.exec(sql);

    await t.test('idempotent backfill changes only relationships; every original audit hash is identical', async () => {
      assert.deepEqual(await audit(), beforeAudit);
      assert.deepEqual((await db.query('select * from words')).rows.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'collection_id'))), before);
      assert.equal((await db.query('select count(*)::int n from learning_collections')).rows[0].n, 2);
      const old = (await db.query('select * from pg_policies order by schemaname,tablename,policyname')).rows.filter(p => !['learning_collections', 'learning_languages'].includes(p.tablename));
      assert.deepEqual(old, policies);
      for (const [table, original] of Object.entries(historic)) {
        const after = (await db.query("select to_jsonb(t)-'collection_id' data from " + table + " t order by (to_jsonb(t)-'collection_id')::text")).rows.map(r => r.data);
        assert.deepEqual(after, original, table);
      }
      const verification = (await db.exec(await read('supabase/collections_verify.sql'))).find(result => result.rows?.length).rows[0].noted_collections_verification;
      assert.equal(verification.marker, 'noted-collections-v1');
      for (const key of ['missing_english_defaults', 'unassigned_words', 'wrong_word_owners', 'unassigned_reviews', 'unassigned_additions']) assert.equal(verification[key], 0, key);
      assert.ok(verification.collection_links.every(link => link.unassigned === 0 && link.wrong_owner === 0));
      assert.equal(verification.mismatched_voice_items, 0);
      assert.equal(verification.exposed_private_helpers, 0);
      assert.equal(verification.anonymous_can_call, false);
      assert.equal(verification.authenticated_can_call, true);
      assert.ok(verification.rls.every(table => table.enabled));
    });

    await asUser(A);
    const en = (await db.query('select * from learning_collections')).rows[0];
    await t.test('RLS hides another account and prevents ownership reassignment', async () => {
      assert.equal((await db.query('select * from learning_collections')).rows.length, 1);
      await assert.rejects(db.query(`insert into learning_collections(user_id,target_language,explanation_language) values($1,'fr','zh-CN')`, [B]), /row-level security/);
      await assert.rejects(db.query("update learning_collections set target_language='fr'"), /permission denied/);
      const snapshot = (await db.query('select noted_collections_snapshot() data')).rows[0].data;
      assert.equal(snapshot.multilingual_enabled, false);
      assert.equal(snapshot.collections.length, 1);
      assert.equal(snapshot.collections[0].id, en.id);
      assert.equal((await db.query('select voice_notes_list(array[$1]::uuid[]) data', [E])).rows[0].data.files[0].storage_path, `${A}/${E}/${F}`);
    });
    let fr;
    await t.test('same spelling is valid across Collections; duplicates and foreign ownership fail', async () => {
      fr = (await db.query(`insert into learning_collections(user_id,target_language,explanation_language,proficiency_level) values($1,'fr','zh-CN','A1') returning *`, [A])).rows[0];
      await db.query(`insert into words(user_id,collection_id,word,meaning) values($1,$2,'chat','猫')`, [A, fr.id]);
      await assert.rejects(db.query(`insert into words(user_id,collection_id,word,meaning) values($1,$2,' CHAT ','重复')`, [A, fr.id]), /already in your Library/);
      await assert.rejects(db.query(`update words set collection_id=$1 where id=$2`, [fr.id, E]), /Moving/);
      await asUser(B);
      await assert.rejects(db.query(`insert into words(user_id,collection_id,word,meaning) values($1,$2,'chat','猫')`, [B, fr.id]), /Collection does not belong/);
      await asUser(A);
    });
    await t.test('legacy Add, Discover and offline review RPCs remain compatible and idempotent', async () => {
      const row = (await db.query(`insert into words(user_id,word,meaning) values($1,'legacy client','保留') returning *`, [A])).rows[0];
      assert.equal(row.collection_id, en.id);
      const french = (await db.query('select * from words where collection_id=$1', [fr.id])).rows[0];
      const at = Date.now() - 1000, event = crypto.randomUUID(), next = rateItem(french, 'sure', at);
      const args = [event, french.id, 'sure', reviewState(french)?.review_count || 0, next.due_at, next.interval_days, next.review_state, new Date(at).toISOString()];
      await db.query('select record_offline_learning_review($1,$2,$3,$4,$5,$6,$7,$8)', args);
      await db.query('select record_offline_learning_review($1,$2,$3,$4,$5,$6,$7,$8)', args);
      const events = (await db.query('select * from review_events where id=$1', [event])).rows;
      assert.equal(events.length, 1);
      assert.equal(events[0].collection_id, fr.id);
      assert.equal((await db.query('select collection_id from learning_add_events where learning_item_id=$1', [french.id])).rows[0].collection_id, fr.id);
      assert.equal((await db.query("select discover_action('get','{}','Europe/London') data")).rows[0].data.discover_version, 2);
      await assert.rejects(db.query(`insert into learning_collections(user_id,target_language,explanation_language,proficiency_level) values($1,'zh-CN','en','A1')`, [A]), /Choose Beginner/);
    });
    await t.test('Phase 2 installation stays disabled until separately approved activation; full fingerprints match', async () => {
      await db.exec("reset role;select set_config('request.jwt.claim.sub','',false)");
      const fingerprint = async () => (await db.exec(await read('supabase/collections_learning_fingerprint.sql'))).find(r=>r.rows?.length).rows;
      const preflight = (await db.exec(await read('supabase/collections_learning_preflight.sql'))).find(r=>r.rows?.length).rows[0].noted_collections_learning_preflight;
      assert.equal(preflight.foundation_marker,'noted-collections-v1');
      assert.ok(preflight.column_checks.every(c=>c.compatible));
      assert.ok(Object.values(preflight.patch_anchors).every(Boolean));
      assert.equal(preflight.enabled_in_snapshot,false);
      // Attempting activation without installation is rejected atomically.
      const activation=await read('supabase/collections_learning_activate.sql');
      await assert.rejects(db.exec(activation), /Phase 2 dependencies failed/);
      await db.exec('rollback');
      const beforeActivation=await audit(),fullBefore=await fingerprint();
      const upgrade=await read('supabase/migrations/20261125_collections_learning.sql');
      await db.exec('create index words_collection_capture_lookup on words(word)');
      await assert.rejects(db.exec(upgrade),/Unexpected words_collection_capture_lookup index/);await db.exec('rollback');
      assert.deepEqual(await fingerprint(),fullBefore);
      await db.exec('drop index words_collection_capture_lookup');
      await db.exec(upgrade);await db.exec(upgrade);
      assert.deepEqual(await audit(),beforeActivation);
      assert.deepEqual(await fingerprint(),fullBefore);
      const verified=(await db.exec(await read('supabase/collections_learning_verify.sql'))).find(r=>r.rows?.length).rows[0].noted_collections_learning_verification;
      assert.equal(verified.marker,'noted-collections-learning-v1');
      assert.equal(verified.dependencies_ready,true,JSON.stringify(verified));
      assert.equal(verified.enabled_in_snapshot,false);
      assert.equal(verified.learning_ready_in_snapshot,false);
      await asUser(A);
      assert.equal((await db.query('select noted_collections_snapshot() data')).rows[0].data.multilingual_enabled,false);
      await db.exec("reset role;select set_config('request.jwt.claim.sub','',false)");
      // A broken ACL must block activation rather than exposing a partial rollout.
      await db.exec('grant execute on function learning_collection_calendar(date,text,uuid) to anon');
      await assert.rejects(db.exec(activation),/Phase 2 dependencies failed/);await db.exec('rollback');
      assert.equal((await db.exec(await read('supabase/collections_learning_verify.sql'))).find(r=>r.rows?.length).rows[0].noted_collections_learning_verification.enabled_in_snapshot,false);
      await db.exec('revoke execute on function learning_collection_calendar(date,text,uuid) from anon');
      await db.exec('alter table words disable trigger noted_collection_duplicate_edit');
      await assert.rejects(db.exec(activation),/Phase 2 dependencies failed/);await db.exec('rollback');
      await assert.rejects(db.exec(upgrade),/Unexpected duplicate edit trigger/);await db.exec('rollback');
      await db.exec('alter table words enable trigger noted_collection_duplicate_edit');
      // Local fixture approval only: no production database is contacted by this test.
      await db.exec(activation);await db.exec(activation);
      assert.deepEqual(await fingerprint(),fullBefore);
      const active=(await db.exec(await read('supabase/collections_learning_verify.sql'))).find(r=>r.rows?.length).rows[0].noted_collections_learning_verification;
      assert.equal(active.dependencies_ready,true);assert.equal(active.enabled_in_snapshot,true);assert.equal(active.learning_ready_in_snapshot,true);
      await asUser(A);
      assert.equal((await db.query('select noted_collections_snapshot() data')).rows[0].data.multilingual_enabled,true);
      const state=(await db.query("select discover_action('get','{}','Europe/London') data")).rows[0].data;
      const pick=state.daily.items[0];
      const french=(await db.query('insert into words(user_id,collection_id,word,meaning) values($1,$2,$3,$4) returning *',[A,fr.id,pick.word,'A French personal meaning'])).rows[0];
      const saved=(await db.query("select discover_action('daily_response',$1,'Europe/London') data",[JSON.stringify({set_id:state.daily.id,item_id:pick.id,response:'save'})])).rows[0].data;
      const englishId=saved.daily.responses[String(pick.id)].library_id;
      assert.notEqual(englishId,french.id);
      assert.equal((await db.query('select collection_id from words where id=$1',[englishId])).rows[0].collection_id,en.id);
      await db.exec("reset role");
      const unseen=(await db.query('select * from discover_unseen_vocabulary($1) limit 1',[A])).rows[0];
      await asUser(A);
      await db.query('insert into words(user_id,collection_id,word,meaning) values($1,$2,$3,$4)',[A,fr.id,unseen.word,'French does not exclude English']);
      await db.exec('reset role');
      assert.equal((await db.query('select id from discover_unseen_vocabulary($1) where id=$2',[A,unseen.id])).rows.length,1);
      await asUser(A);
    });
    await t.test('duplicate protection matches Unicode punctuation on Add and edits without rejecting an unchanged title',async()=>{
      const row=(await db.query('insert into words(user_id,collection_id,word,meaning) values($1,$2,$3,$4) returning *',[A,fr.id,'l’esprit','精神'])).rows[0];
      await assert.rejects(db.query('insert into words(user_id,collection_id,word,meaning) values($1,$2,$3,$4)',[A,fr.id," L'ESPRIT ",'重复']),/already in your Library/);
      await db.query('update words set word=$1 where id=$2',['l’esprit',row.id]);
      await assert.rejects(db.query('update words set word=$1 where id=$2',['chat',row.id]),/already in your Library/);
    });
    await t.test('Calendar filtering counts unique items per local day and enforces owner access', async()=>{
      const french=(await db.query('select id from words where collection_id=$1 order by created_at limit 1',[fr.id])).rows[0];
      await db.exec("reset role;select set_config('request.jwt.claim.sub','',false)");
      await db.query("insert into review_events(id,user_id,learning_item_id,reviewed_at,familiarity_rating,collection_id) values(gen_random_uuid(),$1,$2,'2026-11-25T00:30:00Z','sure',$3),(gen_random_uuid(),$1,$2,'2026-11-25T00:35:00Z','not_sure',$3)",[A,french.id,fr.id]);
      await asUser(A);
      const calendar=(await db.query("select learning_collection_calendar('2026-11-01','America/Los_Angeles',$1) data",[fr.id])).rows[0].data;
      assert.equal(calendar.days.find(day=>day.date==='2026-11-24').reviewed,1);
      await asUser(B);
      await assert.rejects(db.query("select learning_collection_calendar('2026-11-01','Europe/London',$1)",[fr.id]),/Collection unavailable/);
      await assert.rejects(db.query('select noted_reorder_collections($1)',[[en.id,fr.id]]),/Language list changed/);
      await asUser(A);
    });
    await t.test('Reordering is atomic and levels adjust only the English Discover recommendation',async()=>{
      await db.query('select noted_reorder_collections($1)',[[fr.id,en.id]]);
      assert.equal((await db.query('select id from learning_collections order by display_order')).rows[0].id,fr.id);
      const before=(await db.query('select * from discover_profiles')).rows[0];
      await db.query("update learning_collections set proficiency_level='C1' where id=$1",[en.id]);
      const after=(await db.query('select * from discover_profiles')).rows[0];
      assert.equal(after.recommendation_level,'5');assert.equal(after.starting_level,before.starting_level);assert.equal(after.assessment_status,before.assessment_status);
      await db.query("update learning_collections set proficiency_level='A2' where id=$1",[fr.id]);
      assert.equal((await db.query('select recommendation_level from discover_profiles')).rows[0].recommendation_level,'5');
    });
    await t.test('unmarked function collision aborts atomically rather than being overwritten', async () => {
      await db.exec("reset role;comment on function public.noted_guard_duplicate_word() is null");
      await assert.rejects(db.exec(sql), /Unexpected duplicate guard/);
      await db.exec('rollback');
      assert.equal((await db.query('select count(*)::int n from learning_collections')).rows[0].n, 3);
      assert.equal((await db.query('select count(*)::int n from storage.objects')).rows[0].n, 1);
    });
  } finally { await db.close(); }
});
