import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {PGlite}from '@electric-sql/pglite';
const A='11111111-1111-4111-8111-111111111111',B='33333333-3333-4333-8333-333333333333';
test('AI additive schema: owner cache, persistent caps, no learning data changes',async()=>{const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`);
 await db.exec(await fs.readFile(new URL('../../supabase/schema.sql',import.meta.url),'utf8'));await db.exec(`insert into auth.users values('${A}'),('${B}');insert into words(user_id,word,meaning,review_state) values('${A}','legacy','旧释义','{"review_count":9}');`);
 const before=(await db.query('select word,meaning,review_state from words')).rows;
 const sql=await fs.readFile(new URL('../../supabase/migrations/20261124_ai_dictionary.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);assert.deepEqual((await db.query('select word,meaning,review_state from words')).rows,before);
 const asUser=async user=>db.exec(`reset role;select set_config('request.jwt.claim.sub','${user||''}',false);set role ${user?'authenticated':'anon'};`);
 const reserve=async key=>(await db.query('select noted_ai_reserve($1) result',[key])).rows[0].result;
 const hash='a'.repeat(64);await asUser(A);const job=await reserve(hash);assert.equal(job.status,'reserved');assert.equal((await reserve(hash)).status,'pending');assert.equal((await db.query('select noted_ai_finish($1,$2,$3) result',[hash,job.lease,JSON.stringify({explanation:'AI test',alternatives:[]})])).rows[0].result,true);assert.equal((await reserve(hash)).status,'cached');
 await asUser(B);assert.equal((await db.query('select * from noted_ai_entries')).rows.length,0);await assert.rejects(db.query('select * from noted_ai_project_usage'),/permission/);await assert.rejects(db.query("update noted_ai_entries set payload='{}'"),/permission/);
 await asUser(null);await assert.rejects(reserve('b'.repeat(64)),/permission/);
 await db.exec('reset role');assert.equal((await db.query('select calls from noted_ai_project_usage')).rows[0].calls,1);
 for(let i=2;i<=5;i++){await db.exec('reset role');await db.exec(`update noted_ai_user_usage set last_at=null where user_id='${A}'`);await asUser(A);assert.equal((await reserve(String(i).padStart(64,'0'))).status,'reserved');}
 await db.exec('reset role');await db.exec('update noted_ai_project_usage set minute_at=null');await asUser(A);assert.equal((await reserve('f'.repeat(64))).status,'limited');
 await db.exec('reset role');await db.exec('update noted_ai_project_usage set calls=50');await asUser(B);assert.equal((await reserve('b'.repeat(64))).status,'limited');
 await db.exec('reset role');await db.exec(sql);assert.deepEqual((await db.query('select word,meaning,review_state from words')).rows,before);assert.equal((await db.query('select count(*)::int n from auth.users')).rows[0].n,2);
}finally{await db.close();}});
test('unknown new objects abort the optional migration instead of replacing them',async()=>{const db=new PGlite();try{await db.exec('create schema auth;create table auth.users(id uuid primary key);create table noted_ai_entries(id int);');const sql=await fs.readFile(new URL('../../supabase/migrations/20261124_ai_dictionary.sql',import.meta.url),'utf8');await assert.rejects(db.exec(sql),/Unknown existing/);await db.exec('rollback');assert.equal((await db.query("select column_name from information_schema.columns where table_name='noted_ai_entries'")).rows[0].column_name,'id');}finally{await db.close();}});

test('Single-use internal code raises only the owner limit to 50 without resetting usage', async () => {
  const db = new PGlite();
  const code = '654321';
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      insert into auth.users values('${A}'),('${B}');`);
    for (const file of ['schema.sql','migrations/20261124_ai_dictionary.sql','migrations/20261128104257_ai_quota_redemption.sql']) {
      await db.exec(await fs.readFile(new URL('../../supabase/'+file,import.meta.url),'utf8'));
    }
    const switchRole = async (user) => db.exec(`reset role; select set_config('request.jwt.claim.sub','${user||''}',false); set role ${user?'authenticated':'anon'};`);
    const limit = async () => (await db.query('select public.noted_ai_daily_limit() value')).rows[0].value;
    const redeem = async (value) => (await db.query('select public.noted_ai_redeem_code($1) value',[value])).rows[0].value;
    const reserve = async (key) => (await db.query('select noted_ai_reserve($1) value',[key])).rows[0].value.status;
    await db.query("insert into public.noted_ai_quota_codes(code_hash,eligible_user) values(sha256(convert_to($1,'UTF8')),$2)",[code,A]);
    await db.query("insert into public.noted_ai_quota_codes(code_hash) values(sha256(convert_to('111111','UTF8')))");
    await db.query("insert into public.noted_ai_user_usage(user_id,day,calls) values($1,(now() at time zone 'UTC')::date,5)",[A]);
    await switchRole(null);
    await assert.rejects(redeem(code),/permission/);
    await switchRole(B);
    assert.equal(await redeem(code),false);
    assert.equal(await limit(),5);
    await switchRole(A);
    assert.equal(await redeem('111111'),false);
    await assert.rejects(db.query('select * from public.noted_ai_quota_codes'),/permission/);
    assert.equal(await limit(),5);
    assert.equal(await reserve('a'.repeat(64)),'limited');
    assert.equal(await redeem('X'.repeat(43)),false);
    assert.equal(await redeem(code),true);
    assert.equal(await redeem(code),true);
    assert.equal(await limit(),50);
    assert.equal(await reserve('a'.repeat(64)),'reserved');
    await db.exec('reset role');
    assert.equal((await db.query('select calls from public.noted_ai_user_usage where user_id=$1',[A])).rows[0].calls,6);
    await db.query('update public.noted_ai_user_usage set calls=49,last_at=null where user_id=$1',[A]);
    await switchRole(A);
    assert.equal(await reserve('b'.repeat(64)),'reserved');
    assert.equal(await reserve('c'.repeat(64)),'limited');
    await switchRole(B);
    assert.equal(await limit(),5);
    assert.equal(await redeem(code),false);
    await db.exec('reset role');
    await db.exec('update public.noted_ai_project_usage set calls=50');
    await db.query('update public.noted_ai_user_usage set calls=49,last_at=null where user_id=$1',[A]);
    await switchRole(A);
    assert.equal(await reserve('d'.repeat(64)),'limited');
  } finally { await db.close(); }
});
