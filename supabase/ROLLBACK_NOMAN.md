# Roll back the 2 November operations release

This release reverses Git commits `3d54d05` and `3d0931b`. The matching database
change is [202611020001_revert_noman_operations.sql](migrations/202611020001_revert_noman_operations.sql).
The matching Edge Function source is
[create-branch-with-manager/index.ts](functions/create-branch-with-manager/index.ts).

1. Confirm the Supabase project matches the `VITE_SUPABASE_URL` used by the app.
   Take a current database backup before the cutover. Keep the latest data:
   restoring a backup from before Noman's release would discard later records.
2. Coordinate a short cutover for the database, Edge Function, and frontend.
   The new frontend uses RPCs that this rollback removes; the old frontend needs
   direct write grants that the operations migration revoked.
3. Apply the rollback SQL exactly once. If `202611010003` and `202611010004` were
   deployed with Supabase CLI migrations, deploy this file with `supabase db push`
   from the rollback branch. If the prior SQL was run manually in SQL Editor,
   run this file there and keep migration tracking consistent with that manual
   workflow. The SQL stops before changes if the expected forward migrations are
   missing or partial. Do not run `db reset` against the live project.
4. Redeploy the earlier Edge Function source from this branch. With an
   authenticated Supabase CLI, run:

   ```sh
   supabase functions deploy create-branch-with-manager --project-ref YOUR_PROJECT_REF --use-api
   ```

   Alternatively, open the existing function in the Supabase Dashboard editor,
   replace its code with `functions/create-branch-with-manager/index.ts`, and
   deploy the update. Keep the function name unchanged.
5. Release the rollback frontend. Verify President login, a fleet save, a booking
   save, branch account creation, and Cashbook against the intended project.

The SQL restores the earlier browser permissions and booking RPC, removes Noman's
new policies and RPCs, and keeps business rows and added columns. It therefore
also restores the earlier access model: the President and Vice-president checks
no longer test `account_enabled`. Review disabled management accounts before
cutover if that matters to your users.
