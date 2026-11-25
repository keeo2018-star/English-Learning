# Round 02 release

Production reference is `8a16660`. Its public AI status reported disabled and the production database lacked `noted_ai_entries`, `noted_ai_reserve` and `words.example_source` at inspection. A browser-level AI status check cannot distinguish a missing key, an unset free-tier flag, or a model mismatch. A Vercel project administrator can verify the server-scoped variable names and target environments without exporting their values. The public fallback response for 菊花 contained DAISY as its first candidate.

## Vocabulary schema

The required Round 02 migration is `supabase/migrations/20261125215422_vocabulary_learning_details.sql`. Existing `public.words.example` continues storing its existing text with no backfill or interpretation. New writes store the example in that field, independently store privately authored notes in nullable `personal_note`, and store the selected candidate's bounded learning metadata in nullable `learning_details`. Existing row IDs, foreign keys, permissions, schedules, history, audio associations and RLS policies are retained. The update trigger only invalidates metadata tied to edited content. Browsers can still read legacy rows and save plain entries before the migration. A save that needs new storage exits with a draft-preserving error when the columns are unavailable.

Run the existing read-only `supabase/collections_learning_fingerprint.sql` before and after the migration while ordinary writes are paused. The hash for `public.words` includes new columns, so compare the projection of the original rows separately. For example, run the following read-only query before and after and compare the count and digest. Retain the current production backup or restore point separately.

```sql
select count(*) as words,
       md5(coalesce(string_agg(md5((to_jsonb(w) - array['personal_note','learning_details'])::text),
                               '' order by w.id), '')) as original_row_fingerprint
from public.words w;
```

## Release order

1. Verify the production backup or restore point, baseline fingerprints and existing RLS. Confirm it is the intended project. Obtain explicit approval before any production database writes.
2. Apply only the reviewed vocabulary-details migration through the team's migration workflow. Recheck fingerprints, nullable columns, their constraints, the update trigger and unchanged policies. The transaction rolls back on failure or lock timeout.
3. With separate approval, review and apply the existing optional `20261124_ai_dictionary.sql` if Gemini is to be enabled. Use its matching preflight and verification tools. Confirm the project still meets the app's free-tier and billing conditions before setting its server-only Vercel variables. Verify an authenticated live translation and observe the provider status without logging input. The vocabulary migration works independently of Gemini.
4. Authorise the production application release after compatible storage is confirmed. In an isolated account, smoke-test Add, Library and Review with saved example, translation and note. Confirm voice attachment using a supported Expression.

If application rollback is needed, redeploy the prior application while keeping the nullable columns and trigger. Earlier builds use the original fields and can still read and write vocabulary. Preserve any new note/metadata values. Removing the columns would lose that information and requires a separate export, recovery plan and approval.
