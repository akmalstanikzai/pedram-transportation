# Pedram Transportation Management System

A bilingual English/Dari management application for Pedram Transportation Company, built with React, Vite, Supabase, and Lucide icons.

Switching language translates labels and changes layout direction; displayed numbers continue to use English digits (0–9), including money amounts and totals.

Project documentation updated: **2 November 2026**. The current source adds simple record management after the earlier rollback. Apply `202611020002_simple_record_workflows.sql` after the existing migration history, then deploy both account Edge Functions. Source changes do not automatically update live Supabase.

## Current features

| Module | Current implementation |
| --- | --- |
| Login | Company branding, email or username sign-in, English/Dari switch, and right-to-left Dari layout. |
| Branches | Create, edit, view, archive/restore, and enable/disable the manager's login. New manager credentials are assigned in the registration form. |
| Fleet | Independent owner, vehicle and driver records, with edit, detail, status, archive/restore, documents and driver login management. |
| Traders | Standalone create, edit, view and archive/restore; normalized name/contact duplicate detection. Existing booking snapshots are preserved. |
| Bookings | Create, edit, view, cancel, start, complete and archive/restore. Capacity, expiry, schedule conflict and duplicate-request checks. No money fields. |
| Cashbook / روزنامچه | Simple Money In / آمد and Money Out / رفت records for the admin account and branches, with separate tables and automatic totals. |

Trip Plans, Trader Accounts, Customs, Finance, and Reports are navigation placeholders. The separate Trips page has been removed from the President portal. Financial recording currently takes place in Cashbook, rather than the Finance placeholder.

## Roles and access

The database defines five roles: President, Vice-president, Departmental Manager, Branch Manager, and Driver.

- **President:** accesses the implemented President modules and views cashbook records for the admin account, one branch, or all accounts.
- **Branch Manager:** accesses the cashbook for their own assigned branch. Branch access is enforced in the database.
- **Driver:** a linked login sees only that driver's assigned booking details, with no financial information. The President can create a driver login or link an existing unused Driver-role account from Fleet.
- **Vice-president / Departmental Manager:** exist in the role model, but their working portals have not yet been implemented.

Disabled accounts cannot use the new operational APIs. The app rechecks account status on focus and every 30 seconds. Branch archiving disables its manager's login; driver archiving or setting the driver inactive disables that driver's login. Restoring a record does not automatically re-enable the account.

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

1. Booking date, departure date, expected arrival date, branch and service type: vehicle arrangement or company-managed transport.
2. Trader first name, surname, contact number, and address. Select an existing trader or register a new one through the booking.
3. Sender name, contact, and address. **Trader is the sender** fills these details automatically.
4. Receiver name, contact, and address.
5. Goods name, weight in tons, and volume in cubic metres (m³). Enter weight, volume, or both.
6. Origin and destination.
7. Registered vehicle and registered driver, chosen separately.

Selecting a vehicle loads that vehicle's details. Selecting a driver loads that driver's details. Changing one selection does not change the other. The booking stores the selected pair for that job; a driver is not permanently assigned to a vehicle.

Trader details are saved with the booking without overwriting an existing trader profile. The `save_booking_record` database function saves the trader association and booking in one transaction, with an idempotent request ID and a last-updated check to prevent stale edits.

Bookings follow **Confirmed → On road → Completed**, or **Cancelled**. Only confirmed bookings are editable. Departure and arrival reserve both resources for whole calendar days, inclusively; two jobs cannot share a vehicle or driver on an overlapping day. Confirming requires an active owner, available vehicle and available driver, enough recorded weight/volume capacity, and no entered permit/licence expiry before the expected end. Expiry is rechecked when starting the journey. Register missing capacity values in Fleet first.

Delete moves records to a recoverable Archive. Active work must be completed or cancelled before archiving a resource; a confirmed booking is cancelled when archived. An on-road booking must be cancelled or completed first. Restoring a cancelled/completed booking preserves its status and does not reserve resources again. Linked historical and financial records remain intact.

Booking payments and account settlement are **not part of the current simplified workflow**. Historical payment-related data may remain in the database, but no current UI configures it.

## Fleet and documents

- **Vehicles:** owner, plate, optional foreign plate, type, color, VIN/chassis number, weight capacity (tons), volume capacity (m³), model year, permit details and expiry. Registration expiry has been removed.
- **Owners:** name, father's name, mobile/contact details, residence information, and Tazkira/CNIC scan upload.
- **Drivers:** personal/contact details, licence details, and document uploads. Driver registration does not require selecting a vehicle or vehicle owner.
- **Vehicle document categories:** photos, جواز سیر, کارت, کتابچه, and international certificate.
- **Driver document categories:** Tazkira/CNIC, driving licence, health card, and contract.

Save the parent record first, then use the document icon. Documents have type, filename, size, MIME type, expiry and upload state, stored alongside the private file in `fleet-documents`. The panel lists documents, opens temporary private view links, downloads files, updates expiry dates, and flags expired documents.

PDF, PNG, JPG/JPEG, WebP, HEIC/HEIF and TIFF are accepted, up to 20 MB per file. Pending uploads can be finished if the file reached storage, or retried with the same file. Incomplete deletions can also be retried. The migration recovers metadata associations for old files whose paths match known parents; original filenames cannot be recovered if the old uploader never stored them.

Business record deletion is recoverable archiving. Document file deletion is permanent and asks for confirmation. Deleting a document first marks its metadata, removes the object, then finishes the metadata deletion, so interruptions stay visible for recovery.

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
3. Apply the later migrations in order, including the historical operations migrations and rollback, then **`202611020002_simple_record_workflows.sql`**. This latest migration restores the needed record APIs without the removed workspace widgets or transfer UI. Deploy both account Edge Functions using your project reference:

   ```powershell
   supabase functions deploy create-branch-with-manager --project-ref YOUR_PROJECT_REF --use-api
   supabase functions deploy create-driver-account --project-ref YOUR_PROJECT_REF --use-api
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

Keep both Edge Functions and database schema in sync. The functions use server-side service-role access, verify the active President, and use request-tagged Auth metadata to recover account creation after a network interruption. They never reuse an unrelated account just because an email matches. Applying a local migration file does not itself update the hosted database, and editing an Edge Function locally does not deploy it.

For Dashboard editor deployments, paste each function's complete `index.ts` file into that function. Both entrypoints are self-contained and do not import a local `_shared` file. The shared source is retained only as a consistency reference. See [Dashboard deployment instructions](supabase/README.md#deploy-through-the-dashboard-editor).

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

For record-management SQL tests, set `PEDRAM_PGLITE_PATH` to the same PGlite module path and run:

```powershell
node tests/record-workflows-database.mjs
node tests/rollback-database.mjs
```

The workflow suite applies the real migration history and tests lifecycle actions, stale edits, trader duplicates, booking request replay, capacity/expiry/conflicts, document metadata and recovery, and linked/disabled accounts. The rollback suite remains pinned to its historical migration boundary.

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
    TradersPage.jsx
    DriverBookingsPage.jsx
supabase/
  migrations/                 Ordered database changes
  functions/                  Branch/driver account provisioning and shared helper
tests/                        Cashbook calculation and database integration checks
```
