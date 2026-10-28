# Pedram Transportation Supabase setup

1. Run `migrations/202610280001_create_profiles_and_roles.sql` in the Supabase SQL editor, or use `supabase db push`.
2. Create users in Supabase Authentication. A profile is created automatically for every new user.
3. New profiles default to the least-privileged `driver` role. Assign one of these roles from a trusted admin SQL session: `president`, `vice_president`, `departmental_manager`, `branch_manager`, or `driver`.
4. Keep `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the app's `.env` file.

The browser only reads the signed-in user's own profile. Keep the service-role key on a server or Edge Function and never put it in Vite-exposed environment variables.
