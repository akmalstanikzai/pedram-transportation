# Pedram Transportation Supabase setup

1. Apply every migration in filename order, or run `supabase db push` from a linked Supabase CLI project.
2. Deploy the current branch creation function after applying migrations:
   `supabase functions deploy create-branch-with-manager --project-ref YOUR_PROJECT_REF --use-api`
3. Create the initial President in Supabase Authentication. A profile is created automatically for every new user.
4. New profiles default to the least-privileged `driver` role. Assign the initial President role from a trusted admin SQL session. Branch Manager accounts are created by the deployed Edge Function.
5. Keep `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the app's `.env` file.

Whenever the branch schema or `create-branch-with-manager` source changes, apply the new migration first and redeploy the function. A 400 response after a form change usually means the deployed function and database schema are on different versions.

Profile reads follow database policies: users can read their own profile, and the President can read profiles for branch management. Keep the service-role key on a server or Edge Function and never put it in Vite-exposed environment variables.

The current cashbook requires both `202611010001_branch_cashbooks.sql` and `202611010002_simplify_cashbook.sql`, in that order. The second migration replaces the transfer/setup API with simple Money In / آمد and Money Out / رفت recording for admin and branch accounts. Existing records are preserved. No cash/bank setup is required in the current UI.

See the [project README](../README.md) for current feature status, booking and fleet workflows, and local development; see [cashbook notes](CASHBOOK.md) for ledger behavior.
