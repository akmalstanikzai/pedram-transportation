# Pedram Transportation Supabase setup

Apply `202611030001_vehicle_model_year.sql` after the migrations below for unrestricted digit-only vehicle model years. It preserves existing values, removes the 1950–2100 range, stores year labels as text to preserve leading zeroes/precision, and updates only the model-year conversion in the installed Fleet save function. The script is safe to rerun. No Edge Function changes are required.

The current release requires `202611020002_simple_record_workflows.sql` after
the existing ordered migrations, including `202611020001_revert_noman_operations.sql`.
The earlier forward and rollback files remain historical steps. The latest
migration adds simple lifecycle APIs and account controls, preserving business
records. Use the current frontend and deploy the account Edge Functions listed below.

Apply `202611020003_combined_trader_accounts.sql` afterwards for the combined Traders profile/account screen and optional trader links in cashbook entries. This adds trader fare records and account statements; receipts remain in the existing cashbook without duplication. Removed menu pages do not delete their historical data. No Edge Function change is needed for this additional migration...

Apply `202611020004_branch_portal.sql` next to enable branch Fleet, Bookings and Traders workflows alongside Cashbook. Branch users can edit their own branch records and select shared head-office directory profiles in bookings. Private head-office documents, other branches' records and financial data, and account administration remain restricted. Trader charges and statements are now branch-scoped. The President retains the all-branch view. No additional Edge Function deployment is needed for this migration.

Apply `202611020005_driver_portal.sql` next for the driver's icon-led Jobs screen. It adds `driver_accepted_at` and `driver_delivered_at` to bookings, plus `get_driver_portal` and `driver_booking_action`. Only the driver linked to that assignment can accept/report delivery; the branch or President still confirms completion. Operational assignment edits clear the reports, requiring fresh acceptance. The read API exposes only required job, vehicle, contact and licence fields. There is no financial or document-scan access through this API. No Edge Function redeployment is needed for this migration.

For the new branch Password key button, also deploy **`manage-branch-account`**. It reads the registered manager's sign-in name and lets only an enabled President assign a new password through Supabase Auth. This feature needs no new SQL migration. It does not enable disabled accounts or change the manager/branch assignment.

Driver password changes reuse **create-driver-account**. Redeploy its latest complete standalone `index.ts` to enable the new `details` and `password` actions for already linked driver records. The handler verifies the active President, the selected driver record's `user_id`, Driver role and matching branch before looking up or updating the Auth account. It never uses a client-supplied target user ID and does not change email, role or enabled state. No additional SQL migration or function name is needed. The shared source and both creation entrypoints remain synchronized; the branch creation behavior is unchanged.

If the browser reports a failed CORS preflight, check whether this exact function exists in the project used by the frontend. A `404 NOT_FOUND / Requested function was not found` response to OPTIONS means the function is absent at that endpoint. In Dashboard → Edge Functions, create **manage-branch-account**, paste its complete standalone `index.ts`, and deploy. Running a test invocation or deploying a differently named function does not create this endpoint. Refresh the app and reopen the key dialog afterwards.

The driver portal SQL is separate: apply `202611020005_driver_portal.sql` after `202611020004_branch_portal.sql`. Local file edits do not execute hosted SQL. The updated driver portal script is safe to rerun: it keeps existing columns and report values, replaces its functions and reinstalls its trigger. If an older copy reports that `driver_accepted_at` already exists, replace the entire SQL Editor content with the current complete file and run it again. Do not rerun the older copy or remove existing booking columns.

1. Apply every migration in filename order, or run `supabase db push` from a linked Supabase CLI project.
2. Deploy the current branch creation function after applying migrations:
   `supabase functions deploy create-branch-with-manager --project-ref YOUR_PROJECT_REF --use-api`
   and the driver account function:
   `supabase functions deploy create-driver-account --project-ref YOUR_PROJECT_REF --use-api`
   and the branch password function:
   `supabase functions deploy manage-branch-account --project-ref YOUR_PROJECT_REF --use-api`
3. Create the initial President in Supabase Authentication. A profile is created automatically for every new user.
4. New profiles default to the least-privileged `driver` role. Assign the initial President role from a trusted admin SQL session. Branch Manager accounts are created by the deployed Edge Function.
5. Keep `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the app's `.env` file.

## Deploy through the Dashboard editor

All three account function `index.ts` files are self-contained for single-file Dashboard deployment. For each function, replace the editor's entire `index.ts` with the corresponding local file, then deploy:

- `functions/create-branch-with-manager/index.ts`
- `functions/create-driver-account/index.ts`
- `functions/manage-branch-account/index.ts`

Do not paste the old two-line wrapper that imports `../_shared/provision.ts`. That wrapper needs the shared file in its deployment bundle and fails if pasted alone into the Dashboard. The current entrypoints contain their provisioning logic directly; `_shared/provision.ts` remains a reference for keeping the two copies consistent, not a runtime dependency of either entrypoint.

Run `node --test tests/edge-function-entrypoints.test.js` from the project root (Node.js 24) to check the standalone entrypoints and shared-logic consistency. This does not deploy to Supabase or test live Auth credentials.

Run `node --test tests/branch-account-function.test.js` to check the branch password function's President-only access, target-manager validation, password validation, login lookup and Auth update requests using a stubbed Auth service. For Dashboard deployment, create the new function named exactly **manage-branch-account**, paste its full file and deploy. Never put the service-role key in the browser.

Whenever the branch schema or `create-branch-with-manager` source changes, apply the new migration first and redeploy the function. A 400 response after a form change usually means the deployed function and database schema are on different versions.

Profile reads follow database policies: users can read their own profile, and the President can read profiles for branch management. Keep the service-role key on a server or Edge Function and never put it in Vite-exposed environment variables.

The current cashbook requires both `202611010001_branch_cashbooks.sql` and `202611010002_simplify_cashbook.sql`, in that order. The second migration replaces the transfer/setup API with simple Money In / آمد and Money Out / رفت recording for admin and branch accounts. Existing records are preserved. No cash/bank setup is required in the current UI.

See the [project README](../README.md) for current feature status, booking and fleet workflows, and local development; see [cashbook notes](CASHBOOK.md) for ledger behavior.
