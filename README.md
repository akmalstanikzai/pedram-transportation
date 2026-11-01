# Pedram Transportation Management System

A bilingual English/Dari management application for Pedram Transportation Company, built with React, Vite, Supabase, and Lucide icons.

Switching language translates labels and changes layout direction; displayed numbers continue to use English digits (0–9), including money amounts and totals.

Project documentation updated: **1 November 2026**. This describes the current source code; live Supabase must be updated separately with the corresponding migrations and Edge Function.

## Current features

| Module | Current implementation |
| --- | --- |
| Login | Company branding, email or username sign-in, English/Dari switch, and right-to-left Dari layout. |
| Branches | President creates a branch, records its manager's details, and assigns email/username and password in the same form. |
| Fleet | Separate owner, vehicle, and driver registration, plus categorized document uploads. Drivers are selected independently of vehicles. |
| Bookings | Trader, sender, receiver, goods, route, and independently selected vehicle/driver details. No money fields in the booking form. |
| Cashbook / روزنامچه | Simple Money In / آمد and Money Out / رفت records for the admin account and branches, with separate tables and automatic totals. |

Trip Plans, Trader Accounts, Customs, Finance, and Reports are navigation placeholders. The separate Trips page has been removed from the President portal. Financial recording currently takes place in Cashbook, rather than the Finance placeholder.

## Roles and access

The database defines five roles: President, Vice-president, Departmental Manager, Branch Manager, and Driver.

- **President:** accesses the implemented President modules and views cashbook records for the admin account, one branch, or all accounts.
- **Branch Manager:** accesses the cashbook for their own assigned branch. Branch access is enforced in the database.
- **Other roles:** exist in the role model, but their working portals have not yet been implemented.

New authenticated users receive the least-privileged `driver` role. The first President must be assigned through a trusted Supabase admin session; the browser cannot assign roles.

## Cashbook / روزنامچه

The page follows a simple ledger layout:

- **Right table: Money In / آمد.** Date, description, amount, and total received.
- **Left table: Money Out / رفت.** Date, description, amount, and total paid.
- Large, bold headings and a central divider separate the tables. On smaller screens, the tables stack with a horizontal divider.
- The balance below both tables equals total received minus total paid.

To record a transaction, choose **Money In** or **Money Out**, enter the date, name/description, and amount, then save. The President can choose the admin account or a branch. Accounts are created automatically; there is no manual account setup.

The account filter offers **All accounts**, **Admin account**, and individual branches to the President. Currency totals remain separate for AFN, USD, PKR, and IRR; the application does not convert currencies. A negative balance is shown as a deficit.

Transfer, opening-balance setup, cash/bank selection, reversal controls, and booking-payment configuration have been removed from the current cashbook interface. Previous cash/bank records are preserved and displayed together in their branch's ledger; historical opening funds appear as **Earlier balance**.

The `cashbook_simple_post` database function checks account access and valid amounts, saves entries atomically, and prevents duplicate entries when the same request is retried. Direct ledger updates and deletes are not granted to browser users.

See [Cashbook setup and behavior](supabase/CASHBOOK.md) for additional details.

## Booking workflow

The New Booking form is arranged in this order:

1. Booking date and service type: vehicle arrangement or company-managed transport.
2. Trader first name, surname, contact number, and address. Select an existing trader or register a new one through the booking.
3. Sender name, contact, and address. **Trader is the sender** fills these details automatically.
4. Receiver name, contact, and address.
5. Goods name, weight in tons, and volume in cubic metres (m³). Enter weight, volume, or both.
6. Origin and destination.
7. Registered vehicle and registered driver, chosen separately.

Selecting a vehicle loads that vehicle's details. Selecting a driver loads that driver's details. Changing one selection does not change the other. The booking stores the selected pair for that job; a driver is not permanently assigned to a vehicle.

Trader details are saved with the booking without overwriting an existing trader profile. The `create_booking_record` database function saves a new trader and booking in one transaction.

Booking payments and account settlement are **not part of the current simplified workflow**. Historical payment-related data may remain in the database, but no current UI configures it.

## Fleet and documents

- **Vehicles:** owner, plate, optional foreign plate, type, color, VIN/chassis number, capacity, model year, permit details and expiry. Registration expiry has been removed.
- **Owners:** name, father's name, mobile/contact details, residence information, and Tazkira/CNIC scan upload.
- **Drivers:** personal/contact details, licence details, and document uploads. Driver registration does not require selecting a vehicle or vehicle owner.
- **Vehicle document categories:** photos, جواز سیر, کارت, کتابچه, and international certificate.
- **Driver document categories:** Tazkira/CNIC, driving licence, health card, and contract.

Uploads use the private Supabase Storage bucket `fleet-documents`. The file picker accepts PDF, PNG, JPG/JPEG, WebP, HEIC/HEIF, and TIFF. The bucket migration sets a 20 MB per-file limit. A document browsing/download interface is not yet implemented.

## Local development

Install Node.js and npm, then install the project's locked dependencies:

```powershell
npm ci
```

Create `.env` from [.env.example](.env.example), and fill in your Supabase project's public configuration:

```dotenv
VITE_SUPABASE_URL=YOUR_SUPABASE_PROJECT_URL
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

Never put a Supabase service-role key in a `VITE_` variable or browser code.

Start the development server:

```powershell
npm run dev
```

Open the local URL printed by Vite, normally `http://localhost:5173`. Restart Vite after changing `.env`.

## Supabase setup and upgrades

1. Apply the SQL files in [supabase/migrations](supabase/migrations) in filename order. For an existing database, apply only pending migrations. With an installed, authenticated, initialized and linked Supabase CLI project, `supabase db push` is an alternative to SQL Editor.
2. Apply both cashbook migrations: `202611010001_branch_cashbooks.sql`, then `202611010002_simplify_cashbook.sql`. The second migration removes the earlier transfer API and enables the current simplified admin/branch ledgers. Do not stop at the first migration.
3. Deploy the current branch creation Edge Function using your project reference:

   ```powershell
   supabase functions deploy create-branch-with-manager --project-ref YOUR_PROJECT_REF --use-api
   ```

4. Create the initial user in Supabase Authentication. Its profile is created automatically. From a trusted admin SQL session, assign that user's UUID to the President role:

   ```sql
   update public.profiles
   set role = 'president', full_name = 'President name'
   where id = 'REPLACE_WITH_AUTH_USER_UUID';
   ```

5. Sign in as President and create branches and manager accounts through the Branches page.

Username sign-in maps to an internal `username@users.pedram.local` authentication address. Use a regular email address when an actual email identity is required.

The removed `202610310002_booking_payments.sql` is not needed for a fresh setup. Its rollback migration, `202610310003_rollback_booking_payments.sql`, remains in the migration history and safely handles an absent legacy payment table/function.

Keep the Edge Function and database schema in sync when updating branch creation. Applying a local migration file does not itself update the hosted database, and editing an Edge Function locally does not deploy it.

See [Supabase setup notes](supabase/README.md).

## Build and verification

```powershell
npm run build
npm run lint
node --test tests/cashbook.test.js
```

`npm run build` generates `dist/`. Use `npm run preview` to serve the production build locally. The Node tests check admin/branch totals, currency separation, earlier balances, and deficits.

An optional integration test runs the SQL migration path in disposable PGlite PostgreSQL. Install `@electric-sql/pglite` separately, set `CASHBOOK_PGLITE_PATH` to its `dist/index.js`, then run:

```powershell
node tests/verify-cashbook-database.mjs
```

That test checks preserved historical records, removal of the old API, automatic ledgers, duplicate-request handling, and branch isolation. It does not connect to live Supabase. Successful local tests do not confirm live migrations or deployment.

## Main project files

```text
src/
  App.jsx                     Authentication, profile loading, and language direction
  App.css                     Application styling and responsive layouts
  components/                 Branding, fields, and reusable icons
  lib/
    supabase.js               Supabase browser client
    i18n.js                   Shared English/Dari translations
    cashbook.js               Ledger calculations and data loading
  pages/
    LoginPage.jsx
    DashboardPage.jsx
    BranchesPage.jsx
    VehiclesPage.jsx
    BookingsPage.jsx
    CashbookPage.jsx
supabase/
  migrations/                 Ordered database changes
  functions/create-branch-with-manager/
tests/                        Cashbook calculation and database integration checks
```
