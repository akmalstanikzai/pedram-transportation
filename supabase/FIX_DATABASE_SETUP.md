# Fix the fleet, booking and notification setup error

The frontend needs matching database changes in the Supabase project. Initial
read-only checks on November 2, 2026 found these missing schema markers:

- `vehicles.archived_at` (`42703`).
- `bookings.status` (`42703`).
- `workspace_alerts` in the Data API (`PGRST202`).

If these updates have since been applied, skip them. Use `CHECK_SETUP.sql` below
to check the current database state before running any migration.

These errors prevent records from loading; they do not mean the records were
deleted. Editing `.env` or reinstalling dependencies will not add database columns.
The local `.env` public key cannot apply schema changes. This workspace has no
authenticated Supabase admin connection, so the database step needs your access.

## Apply the missing updates in Supabase

1. Open your project in the Supabase Dashboard. Confirm its **Project URL** matches
   `VITE_SUPABASE_URL` in your local `.env` without sharing any keys.
2. Open **SQL Editor → New query**. Paste the contents of
   [CHECK_SETUP.sql](CHECK_SETUP.sql) and click **Run**. This check is read-only.
3. For each row marked **Missing**, open the matching file in this repository,
   copy its entire contents into a new SQL Editor query, and click **Run**.
   Run them in this exact order, skipping rows marked **Ready**:

   1. [202611010001_branch_cashbooks.sql](migrations/202611010001_branch_cashbooks.sql)
   2. [202611010002_simplify_cashbook.sql](migrations/202611010002_simplify_cashbook.sql)
   3. [202611010003_operations_security.sql](migrations/202611010003_operations_security.sql)
   4. [202611010004_workspace_tools.sql](migrations/202611010004_workspace_tools.sql)

   These updates preserve business records. The operations update also changes
   permissions and write APIs, so collaborators using the older frontend must
   move to the matching version. Do not reset the database or rerun the full
   migration history. If a row is **Partial**, or any query fails, stop and share
   the error text before continuing. A `DUPLICATE_PLATES_REVIEW_REQUIRED` error
   means conflicting existing plates need review; do not delete records to bypass it.
4. Run `CHECK_SETUP.sql` again. All four rows should say **Ready**. Then run:

   ```sql
   NOTIFY pgrst, 'reload schema';
   ```

5. Reload `http://localhost:5173` and retry Fleet, Bookings, and Notifications.
   Use Refresh in the notification panel if it was already open. If any page
   still fails, share the exact error text and the four setup-check results.

For **branch creation or manager changes**, the matching Edge Function also needs
deployment. That is separate from fixing these three read errors. From a Supabase
CLI authenticated to your project, deploy the local function:

```powershell
npx supabase functions deploy create-branch-with-manager --project-ref YOUR_PROJECT_REF --use-api
```

The project reference is available in your project's settings. Never put a
service-role key or database password in `VITE_` variables.

References: [Supabase database migrations](https://supabase.com/docs/guides/deployment/database-migrations)
and [refreshing the Data API schema](https://supabase.com/kb/troubleshooting/refresh-postgrest-schema).
