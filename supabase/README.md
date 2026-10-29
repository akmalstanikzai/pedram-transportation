# Pedram Transportation Supabase setup

1. Apply every migration in filename order, or run `supabase db push` from a linked Supabase CLI project.
2. Deploy the current branch creation function after applying migrations:
   `supabase functions deploy create-branch-with-manager --project-ref alfkwmazbxgremthzauw --use-api`
3. Create the initial President in Supabase Authentication. A profile is created automatically for every new user.
4. New profiles default to the least-privileged `driver` role. Assign the initial President role from a trusted admin SQL session. Branch Manager accounts are created by the deployed Edge Function.
5. Keep `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the app's `.env` file.

Whenever the branch schema or `create-branch-with-manager` source changes, apply the new migration first and redeploy the function. A 400 response after a form change usually means the deployed function and database schema are on different versions.

The browser only reads the signed-in user's own profile. Keep the service-role key on a server or Edge Function and never put it in Vite-exposed environment variables.
