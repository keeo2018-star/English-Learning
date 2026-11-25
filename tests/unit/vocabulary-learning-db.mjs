import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(new URL('../../supabase/migrations/20261125215422_vocabulary_learning_details.sql', import.meta.url), 'utf8');

test('additive learning details retain legacy text and stay owner-scoped', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create table words (id int primary key, user_id text, word text, meaning text, example text, collection_id text);
      alter table words enable row level security;
      grant select, insert, update on words to authenticated;
      create policy owners on words to authenticated using (user_id=current_setting('test.actor',true))
        with check (user_id=current_setting('test.actor',true));
      insert into words values (1,'owner','legacy','旧词','Unclassified context','english');
    `);
    const before = await db.query('select policyname,qual,with_check from pg_policies where tablename=$1', ['words']);
    await db.exec(migration);
    const old = (await db.query('select * from words where id=1')).rows[0];
    assert.equal(old.example, 'Unclassified context');
    assert.equal(old.personal_note, null);
    assert.equal(old.learning_details, null);
    assert.deepEqual((await db.query('select policyname,qual,with_check from pg_policies where tablename=$1', ['words'])).rows, before.rows);
    await db.exec("set role authenticated; set test.actor='owner';");
    const metadata = { originalInput: '菊花', exampleTranslation: '她种菊花。', highlight: 'chrysanthemums', exampleSource: 'ai' };
    await db.query('insert into words values ($1,$2,$3,$4,$5,$6,$7,$8)', [
      2, 'owner', 'chrysanthemum', '菊花', 'She grows chrysanthemums.', 'english', 'A note', metadata,
    ]);
    const saved = (await db.query('select * from words where id=2')).rows[0];
    assert.deepEqual(saved.learning_details, metadata);
    assert.equal(saved.personal_note, 'A note');
    assert.equal(saved.example, 'She grows chrysanthemums.');
    assert.equal(saved.collection_id, 'english');
    await db.exec("set test.actor='other';");
    assert.equal((await db.query('select * from words')).rows.length, 0);
    assert.equal((await db.query("update words set personal_note='changed' returning id")).rows.length, 0);
    await db.exec("set test.actor='owner'; update words set example='An edited context' where id=2;");
    const edited = (await db.query('select personal_note,learning_details from words where id=2')).rows[0];
    assert.deepEqual(edited.learning_details, { originalInput: '菊花' });
    assert.equal(edited.personal_note, 'A note');
    await assert.rejects(db.query("update words set learning_details='[]'::jsonb where id=2"), /words_learning_details_shape/);
  } finally {
    await db.close();
  }
});
