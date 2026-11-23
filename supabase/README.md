# Pedram Transportation Supabase setup

## Resolve the duplicate migration version on an existing project

Employees keeps version `202611120001`. Vehicle weights moves to `202611120006`. The vehicle migration can run again without changing existing weights.

1. Run [check_fleet_migration_status.sql](check_fleet_migration_status.sql) in the target project's SQL Editor. It reports installed schema and migration history without reading staff or customer records.
2. Compare the result with the current schema and take backups of the database and Storage before deployment. If employees already exists, do not run its original CREATE TABLE migration again. If history is missing or disagrees with the installed schema, reconcile it with the schema before using CLI deployment. In particular, an old `202611120001` entry alone cannot establish that both updates ran.
3. If `relevant_migration_history` is null, the CLI history table is absent. For this SQL Editor workflow, apply only the migration files the schema check shows are pending. If the employee and weight checks are all true,  both earlier updates are already installed. Before switching to `supabase db push`, reconcile the full migration history with the installed schema.
4. For a linked project with verified history, preview the plan with `supabase db push --dry-run` before applying pending migrations. If vehicle weights is already installed under the old version and `202611120006` appears as pending, the renamed SQL can run safely and records the unique version.

## Deploy Fleet identifier privacy

Prepare the matching frontend build before applying `202611230005_fleet_identifier_privacy.sql`. Apply the migration and publish the build during the same release window. Then reload open Fleet and Booking tabs, as older builds requested whole rows and PostgreSQL now restricts those requests. No Edge Function redeployment is required.

Run [check_fleet_migration_status.sql](check_fleet_migration_status.sql) again after applying the privacy migration. Both `fleet_identifier_rpc_present` and `fleet_identifiers_protected` should be true. Test with designated accounts after publishing the web app. Branch managers can select shared drivers and owners in Fleet and Bookings, the President can view Fleet Tazkira and driver licence numbers, and drivers can still see their own licence number in their portal.

For the updated vehicle weights and owner picker, apply `202611120006_vehicle_weights.sql` after the preceding migrations and before deploying the frontend. `save_vehicle_record` stores gross permitted weight and empty vehicle weight in kilograms, derives cargo capacity in tons for the existing booking checks, and preserves legacy capacities if no weights are entered. The vehicle owner picker reuses `save_owner_record` and the same Fleet owner form, including its uploads. No Edge Function redeployment is needed. Run `tests/vehicle-weights-database.mjs` with `PEDRAM_PGLITE_PATH` for disposable database verification.

For the revised branch form, apply `202611110001_branch_form_details.sql` after all preceding migrations, then redeploy `create-branch-with-manager` using its current standalone `index.ts`. This saves branch codes, separate manager names, and province/district/village home addresses. It adds named manager uploads (photo, Tazkira, CV, educational documents, contract, extra documents). Existing branch phone numbers, national ID values, free-text addresses, and generic document uploads are preserved. Deploy the frontend after the database and function update.

For the revised vehicle form, apply `202611110002_vehicle_form_details.sql` after the branch-form migration and before deploying the frontend. Vehicle owners become optional for registration, editing, branch assignment and bookings. Selected owners still require valid branch access and active status. The migration adds vehicle province and model fields while retaining stored VIN, model-year, permit and document data. No Edge Function redeployment is needed for this vehicle change. The disposable check is `tests/vehicle-form-database.mjs` with `PEDRAM_PGLITE_PATH` set to a local PGlite `dist/index.js`.

For the revised driver form, apply `202611110003_driver_form_details.sql` after the vehicle migration and before deploying the frontend. It saves separate names, a second mobile contact and province/district/village, and adds the driver's Other Document category to the existing protected upload API. Photo/Tazkira, License/Passport and Health Card/Other Document uploads stay paired on mobile. Previous national ID, license number, employment information and all existing uploads are preserved. No Edge Function redeployment is required. Test locally with `tests/driver-form-database.mjs` and `PEDRAM_PGLITE_PATH`.

For the revised owner form, apply `202611110004_owner_form_details.sql` after the driver migration and before deploying the frontend. It adds separate owner names and district/village, and exposes `save_owner_record` through the existing authorized Fleet save. The mobile form pairs name/surname, father name/mobile, and person photo/Tazkira; the address is a three-field row. Notes, historical national ID numbers, old free-text addresses, existing ownership links and uploads remain stored. The existing protected document API supports both owner upload types. No Edge Function redeployment is needed. Verify using `tests/owner-form-database.mjs` with `PEDRAM_PGLITE_PATH`.

Apply `202611030001_vehicle_model_year.sql` after the migrations below for unrestricted digit-only vehicle model years. It preserves existing values, removes the 1950–2100 range, stores year labels as text to preserve leading zeroes/precision, and updates only the model-year conversion in the installed Fleet save function. The script is safe to rerun. No Edge Function changes are required.

The current release requires `202611020002_simple_record_workflows.sql` after
the existing ordered migrations, including `202611020001_revert_noman_operations.sql`.
The earlier forward and rollback files remain historical steps. The latest
migration adds simple lifecycle APIs and account controls, preserving business
records. Use the current frontend and deploy the account Edge Functions listed below.

Apply `202611020003_combined_trader_accounts.sql` afterwards for the combined Traders profile/account screen and optional trader links in cashbook entries. This adds trader fare records and account statements; receipts remain in the existing cashbook without duplication. Removed menu pages do not delete their historical data. No Edge Function change is needed for this additional migration......
.
Apply `202611020004_branch_portal.sql` next to enable branch Fleet, Bookings and Traders workflows alongside Cashbook. Branch users can edit their own branch records and select shared head-office directory profiles in bookings. Private head-office documents, other branches' records and financial data, and account administration remain restricted. Trader charges and statements are now branch-scoped. The President retains the all-branch view. No additional Edge Function deployment is needed for this migration.

Apply `202611020005_driver_portal.sql` next for the driver's icon-led Jobs screen. It adds `driver_accepted_at` and `driver_delivered_at` to bookings, plus `get_driver_portal` and `driver_booking_action`. Only the driver linked to that assignment can accept/report delivery; the branch or President still confirms completion. Operational assignment edits clear the reports, requiring fresh acceptance. The read API exposes only required job, vehicle, contact and licence fields. There is no financial or document-scan access through this API. No Edge Function redeployment is needed for this migration.

For the new branch Password key button, also deploy **`manage-branch-account`**. It reads the registered manager's sign-in name and lets only an enabled President assign a new password through Supabase Auth. This feature needs no new SQL migration. It does not enable disabled accounts or change the manager/branch assignment.

Driver password management uses **create-driver-account**. Apply `202611230001_driver_password_vault.sql` if pending, then deploy the full `functions/create-driver-account/index.ts`. An older deployment can change the Auth password without saving a copy. Set a different new password after deploying to enable reveal in **Fleet → Drivers → key icon**.

Trader password management uses **manage-trader-account**. Apply `202611230004_verify_trader_password_vault.sql` after `202611090006_trader_password_vault.sql`, then deploy `functions/manage-trader-account/index.ts` and the frontend. Open **Traders → key icon** to show, hide or change a password. Passwords from the earlier trader vault need one reset when you want to reveal them. Existing logins continue to work until changed.

If the browser reports a failed CORS preflight, check whether this exact function exists in the project used by the frontend. A `404 NOT_FOUND / Requested function was not found` response to OPTIONS means the function is absent at that endpoint. In Dashboard → Edge Functions, create **manage-branch-account**, paste its complete standalone `index.ts`, and deploy. Running a test invocation or deploying a differently named function does not create this endpoint. Refresh the app and reopen the key dialog afterwards.

The driver portal SQL is separate: apply `202611020005_driver_portal.sql` after `202611020004_branch_portal.sql`. Local file edits do not execute hosted SQL. The updated driver portal script is safe to rerun: it keeps existing columns and report values, replaces its functions and reinstalls its trigger. If an older copy reports that `driver_accepted_at` already exists, replace the entire SQL Editor content with the current complete file and run it again. Do not rerun the older copy or remove existing booking columns.

1. Apply every migration in filename order, or run `supabase db push` from a linked Supabase CLI project.
2. Deploy the current branch creation function after applying migrations:
   `supabase functions deploy create-branch-with-manager --project-ref YOUR_PROJECT_REF --use-api`
   and the driver account function:
   `supabase functions deploy create-driver-account --project-ref YOUR_PROJECT_REF --use-api`
   and the branch password function:
   `supabase functions deploy manage-branch-account --project-ref YOUR_PROJECT_REF --use-api`
   and the trader account function:
   `supabase functions deploy manage-trader-account --project-ref YOUR_PROJECT_REF --use-api`
3. Create the initial President in Supabase Authentication. A profile is created automatically for every new user.
4. New profiles default to the least-privileged `driver` role. Assign the initial President role from a trusted admin SQL session. Branch Manager accounts are created by the deployed Edge Function.
5. Keep `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the app's `.env` file.

## Deploy through the Dashboard editor

The four account function `index.ts` files are self-contained for single-file Dashboard deployment. For each function, replace the editor's entire `index.ts` with the corresponding local file, then select **Deploy updates**:

- `functions/create-branch-with-manager/index.ts`
- `functions/create-driver-account/index.ts`
- `functions/manage-branch-account/index.ts`
- `functions/manage-trader-account/index.ts`

Do not paste the old two-line wrapper that imports `../_shared/provision.ts`. That wrapper needs the shared file in its deployment bundle and fails if pasted alone into the Dashboard. The current entrypoints contain their provisioning logic directly; `_shared/provision.ts` remains a reference for keeping the two copies consistent, not a runtime dependency of either entrypoint.

Run `node --test tests/edge-function-entrypoints.test.js` from the project root (Node.js 24) to check the standalone entrypoints and shared-logic consistency. This does not deploy to Supabase or test live Auth credentials.

Run `node --test tests/branch-account-function.test.js` to check the branch password function's President-only access, target-manager validation, password validation, login lookup and Auth update requests using a stubbed Auth service. For Dashboard deployment, create the new function named exactly **manage-branch-account**, paste its full file and deploy. Never put the service-role key in the browser.

Whenever the branch schema or `create-branch-with-manager` source changes, apply the new migration first and redeploy the function. A 400 response after a form change usually means the deployed function and database schema are on different versions.

Profile reads follow database policies: users can read their own profile, and the President can read profiles for branch management. Keep the service-role key on a server or Edge Function and never put it in Vite-exposed environment variables.

The current cashbook requires both `202611010001_branch_cashbooks.sql` and `202611010002_simplify_cashbook.sql`, in that order. The second migration replaces the transfer/setup API with simple Money In / آمد and Money Out / رفت recording for admin and branch accounts. Existing records are preserved. No cash/bank setup is required in the current UI.

See the [project README](../README.md) for current feature status, booking and fleet workflows, and local development; see [cashbook notes](CASHBOOK.md) for ledger behavior.
