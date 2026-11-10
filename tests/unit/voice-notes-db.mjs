import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const A='11111111-1111-4111-8111-111111111111',B='33333333-3333-4333-8333-333333333333';
const E='22222222-2222-4222-8222-222222222222',W='44444444-4444-4444-8444-444444444444',L='55555555-5555-4555-8555-555555555555';
test('Expression Voice Notes: private Storage, lifecycle, type changes and preservation',async t=>{
 const db=new PGlite(),read=name=>fs.readFile(new URL('../../'+name,import.meta.url),'utf8');
 const asUser=async id=>{await db.exec(`reset role;select set_config('request.jwt.claim.sub','${id||''}',false);set role ${id?'authenticated':'anon'}`)};
 const prepare=async(item=E,expected=null,opts={})=>{const id=crypto.randomUUID();const args=[item,id,opts.duration??5,opts.mime??'audio/webm',opts.size??1000,expected];return (await db.query('select voice_note_prepare($1,$2,$3,$4,$5,$6) f',args)).rows[0].f;};
 const store=async(file,metadata={size:1000,mimetype:'audio/webm'})=>db.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3) returning id',['noted-voice-notes',file.storage_path,JSON.stringify(metadata)]);
 const finish=async id=>(await db.query('select voice_note_finish($1) f',[id])).rows[0].f;
 const list=async id=>(await db.query('select voice_notes_list($1) f',[[id]])).rows[0].f.files;
 const remove=async file=>{await db.query("delete from storage.objects where bucket_id='noted-voice-notes' and name=$1",[file.storage_path]);await db.query('select voice_note_forget($1)',[file.id]);};
 let first,second,third,original,policies;
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
  create schema storage;create table storage.buckets(id text primary key,name text,public boolean not null default false,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,metadata jsonb);alter table storage.objects enable row level security;grant usage on schema storage to anon,authenticated;grant all on storage.objects to anon,authenticated;create policy other_app_broad_policy on storage.objects for all to anon,authenticated using(true) with check(true);insert into storage.buckets values('unrelated','unrelated',false,null,null);`);
  await db.exec(await read('supabase/schema.sql'));await db.exec('grant all on words to anon,authenticated');
  await db.exec(await read('supabase/migrations/20261104_learning_activity.sql'));
  await db.exec(await read('supabase/migrations/20261107_discover.sql'));
  await db.exec(`insert into auth.users values('${A}'),('${B}');insert into words(id,user_id,word,meaning,example,item_type,interval_days,review_state) values('${E}','${A}','I would not put it that way.','我不会那样说。','A natural conversation.','expression',14,'{"review_count":7}'),('${W}','${A}','hello','你好','','word',0,null),('${L}','${A}','take it easy','放轻松','',null,0,null);`);
  original=(await db.query('select * from words order by id')).rows;policies=(await db.query("select policyname,cmd,qual,with_check from pg_policies where schemaname='public' and tablename='words' order by policyname")).rows;
  const sql=await read('supabase/migrations/20261110_expression_voice_notes.sql');
  await t.test('additive reruns preserve all learning rows, review state, Words RLS and existing bucket policies',async()=>{
   await db.exec(sql);await db.exec(sql);assert.deepEqual((await db.query('select * from words order by id')).rows,original);assert.deepEqual((await db.query("select policyname,cmd,qual,with_check from pg_policies where schemaname='public' and tablename='words' order by policyname")).rows,policies);
   const bucket=(await db.query("select * from storage.buckets where id='noted-voice-notes'")).rows[0];assert.equal(bucket.public,false);assert.equal(Number(bucket.file_size_limit),8388608);assert.ok(bucket.allowed_mime_types.every(x=>x.startsWith('audio/')));
   assert.equal((await db.query("select count(*)::int n from pg_policies where policyname='other_app_broad_policy'")).rows[0].n,1);
  });
  await asUser(A);
  await t.test('Words cannot receive recordings; legacy Expressions can, with bounded duration/size/MIME',async()=>{
   await assert.rejects(prepare(W),/only for Expressions/);await assert.rejects(prepare(E,null,{duration:31}),/check constraint/);await assert.rejects(prepare(E,null,{size:8388609}),/check constraint/);await assert.rejects(prepare(E,null,{mime:'text/html'}),/check constraint/);
   const legacy=await prepare(L);assert.equal(legacy.item_id,L);await db.query('select voice_note_forget($1)',[legacy.id]);
   first=await prepare();assert.equal(first.storage_path,`${A}/${E}/${first.id}`);assert.equal(first.state,'pending');await assert.rejects(finish(first.id),/missing or invalid/);
  });
  await t.test('upload requires an owned reservation and immutable objects; finish/retry is idempotent',async()=>{
   await assert.rejects(db.query("insert into storage.objects(bucket_id,name,metadata) values('noted-voice-notes','unreserved','{}')"),/row-level security/);
   await store(first);const saved=await finish(first.id);assert.equal(saved.state,'active');assert.equal((await finish(first.id)).id,first.id);assert.equal((await list(E)).length,1);assert.equal((await list(E))[0].stored,true);
   assert.equal((await db.query("update storage.objects set metadata='{}' where name=$1 returning id",[first.storage_path])).rows.length,0);
   await assert.rejects(db.query('update expression_voice_files set duration_seconds=1'),/permission denied/);
  });
  await t.test('replacement commits only after a valid upload and rejects stale-device overwrites',async()=>{
   second=await prepare(E,first.id);third=await prepare(E,first.id);
   await store(second,{size:9,mimetype:'audio/webm'});await assert.rejects(finish(second.id),/missing or invalid/);assert.equal((await list(E)).find(x=>x.state==='active').id,first.id);
   await db.query('delete from storage.objects where name=$1',[second.storage_path]);await store(second);await store(third);await finish(second.id);await assert.rejects(finish(third.id),/Another device/);
   const files=await list(E);assert.equal(files.find(x=>x.id===first.id).state,'retired');assert.equal(files.find(x=>x.id===second.id).state,'active');assert.equal(files.find(x=>x.id===third.id).state,'pending');
  });
  await t.test('private recording access stays owner-only even alongside broad unrelated Storage policies',async()=>{
   await asUser(B);assert.equal((await list(E)).length,0);await assert.rejects(prepare(E),/Expression unavailable/);assert.equal((await db.query("select * from storage.objects where bucket_id='noted-voice-notes'")).rows.length,0);assert.equal((await db.query('select * from expression_voice_files')).rows.length,0);
   await assert.rejects(store(first),/row-level security/);assert.equal((await db.query('delete from storage.objects where name=$1 returning id',[first.storage_path])).rows.length,0);
   await db.query("insert into storage.objects(bucket_id,name,metadata) values('unrelated','other-app-file','{}')");assert.equal((await db.query("select * from storage.objects where bucket_id='unrelated'")).rows.length,1);
   await asUser(null);assert.equal((await db.query("select * from storage.objects where bucket_id='noted-voice-notes'")).rows.length,0);await assert.rejects(db.query('select * from expression_voice_files'),/permission denied/);await assert.rejects(list(E),/permission denied/);
  });
  await t.test('type changes require an explicit preserve/remove decision and restore recordings on Expression',async()=>{
   await asUser(A);await assert.rejects(db.query("update words set item_type='word' where id=$1",[E]),/preserve or remove/);
   const changes={word:'Natural delivery',meaning:'自定义释义',example:'Personal context',item_type:'word'};
   await assert.rejects(db.query('select voice_note_edit_item($1,$2,null)',[E,JSON.stringify(changes)]),/choose Preserve/);
   await db.query('select voice_note_edit_item($1,$2,true)',[E,JSON.stringify(changes)]);assert.equal((await list(E)).find(x=>x.id===second.id).preserved_for_word,true);await assert.rejects(prepare(E,second.id),/only for Expressions/);
   const word=(await db.query('select * from words where id=$1',[E])).rows[0];assert.equal(word.interval_days,14);assert.deepEqual(word.review_state,{review_count:7});assert.equal(word.meaning,'自定义释义');assert.equal((await db.query('select count(*)::int n from storage.objects where name=$1',[second.storage_path])).rows[0].n,1);
   await db.query("update words set item_type='expression' where id=$1",[E]);assert.equal((await list(E)).find(x=>x.id===second.id).preserved_for_word,false);
  });
  await t.test('file cleanup precedes metadata/item deletion; failures keep the Expression instead of orphaning files',async()=>{
   await assert.rejects(db.query('select voice_note_forget($1)',[second.id]),/Remove the private audio file/);await assert.rejects(db.query('delete from words where id=$1',[E]),/Remove attached recordings/);
   for(const file of await list(E))await remove(file);
   assert.equal((await list(E)).length,0);assert.equal((await db.query('select * from words where id=$1',[E])).rows.length,1);
   const pending=await prepare(E);await assert.rejects(db.query('delete from words where id=$1',[E]),/Remove attached recordings/);await db.query('select voice_note_forget($1)',[pending.id]);await db.query('delete from words where id=$1',[E]);assert.equal((await db.query('select * from words where id=$1',[E])).rows.length,0);
   assert.equal((await db.query("select count(*)::int n from storage.objects where bucket_id='noted-voice-notes'")).rows[0].n,0);
  });
  await t.test('preflight is read-only and unrelated name collisions abort the whole migration',async()=>{
   await db.exec('reset role');const rows=await db.exec(await read('supabase/voice_notes_preflight.sql'));assert.ok(rows.some(x=>x.rows.some(row=>'noted_voice_notes_preflight'in row)));
   const before=(await db.query('select * from words order by id')).rows;await db.exec('create function public.voice_note_unknown() returns integer language sql as $$select 1$$');await assert.rejects(db.exec(sql),/Unrecognised existing function/);await db.exec('rollback');assert.deepEqual((await db.query('select * from words order by id')).rows,before);
  });
 }finally{await db.close();}
});
