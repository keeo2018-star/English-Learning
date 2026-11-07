import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
test('optional meaning migration preserves rows, guards unknown constraints, reruns safely', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create table words(id int primary key, meaning text not null check(char_length(trim(meaning)) between 1 and 2000), review_state jsonb); insert into words values(1,'原释义','{"review_count":7}');`);
    const before = (await db.query('select * from words')).rows;
    const sql = await fs.readFile(new URL('../../supabase/migrations/20261106_optional_meaning.sql', import.meta.url), 'utf8');
    await db.exec(sql); await db.exec(sql);
    assert.deepEqual((await db.query('select * from words')).rows, before);
    await db.exec("insert into words values(2,'',null)");
    await assert.rejects(db.exec("insert into words values(3,null,null)"));
    await assert.rejects(db.exec("insert into words values(3,repeat('x',2001),null)"));
    await db.exec('alter table words drop constraint words_meaning_check; alter table words add constraint words_meaning_check check(length(meaning)<100)');
    await assert.rejects(db.exec(sql), /Unexpected meaning constraint/);
    await db.exec('rollback');
    assert.equal((await db.query('select count(*)::int as n from words')).rows[0].n, 2);
  } finally { await db.close(); }
});
