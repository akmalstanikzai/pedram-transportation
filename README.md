# Pedram Transportation Management System

A bilingual English and Dari application for managing bookings, fleet records, branches, trader accounts, and cash. The app uses React, Vite, and Supabase.

Dari uses a right-to-left layout and the bundled Vazirmatn font. Both languages display English digits and Solar Hijri dates. Date pickers save the corresponding ISO date. Cashbook periods and daily dashboard totals use Kabul time.

## Roles and access

| Role | Access |
| --- | --- |
| President | Operations dashboard, Bookings, Fleet, Fleet Availability, Cashbook, Branches, and Traders. Manages trader records, payments, and staff and trader logins. Can reverse Cashbook receipts. |
| Branch Manager | Branch dashboard, Bookings, Fleet, Fleet Availability, and the assigned branch's Cashbook. Can use traders in bookings, including registering a new trader while saving a booking. Can manage branch fleet records and select eligible shared records. |
| Driver | Assigned jobs, the driver's licence details, job acceptance, and delivery reports. |
| Trader | A read-only view of the trader's own bookings, charges, payments, balances, and credit. |

The Traders directory, trader statements, and trader payment controls are President only for staff. A branch manager's Cashbook groups trader activity by account, date, and direction so it can reconcile without exposing individual trader payments. Branch managers can record ordinary branch cash transactions. Shared fleet bookings from other branches show as busy time in Fleet Availability.

The database also defines Vice-president and Departmental Manager roles. The app has no dedicated portal for these roles. New Auth users default to Driver. The app checks account status on focus and every 30 seconds. Restoring an archived branch, driver, or trader record does not automatically re-enable its login.

## Operations dashboard and fleet availability

The home dashboard lists active journeys, today's Cashbook Money In and Money Out by currency, and documents expiring within 30 days in a compact table. The President also sees a count of traders with unpaid charges older than 30 days. The calculation applies net payments to the oldest charges first within each currency.

Open **Fleet Availability** from the dashboard before creating a booking. Select vehicles or drivers, choose a start date and a 7, 14, or 30 day window, and search by plate or name. Each row shows the resource status, document expiry when recorded, and confirmed or on-road work in the selected window. A shared resource can show a booking from another branch as **Busy at another branch**, with its booked dates.

## Bookings

1. Open **Bookings → New booking**. Choose the date and booking type.
2. Select a trader or enter their details to register a new trader when saving. The booking keeps a snapshot of the trader details. Editing the snapshot leaves the existing trader profile intact.
3. Enter the route and goods. Choose a goods unit (tons, pieces, or cubic metres) and enter the quantity.
4. Select a registered vehicle and driver separately. The save checks resource availability, scheduling conflicts, capacity, and applicable permit or licence expiry.
5. Enter the commission amount and booking currency. For company-managed transport, also enter sender and receiver details, freight, vehicle or driver costs, and any extra expenses. Use **Trader is the sender** or **Trader is the receiver** to reuse trader contact details.

| Booking type | Charge to the trader |
| --- | --- |
| Vehicle arrangement | Commission |
| Company-managed transport | Commission, freight, vehicle or driver costs, and extra expenses |

The booking charge records the amount owed. When money is collected at booking time, the President can enter the amount in **Received now**. The President can record a later or partial payment using **Receive payment** in Bookings or Traders, or by selecting the trader and booking in Cashbook. Each recorded receipt appears in **Cashbook Money In** and reduces the trader's balance. Booking amounts share one currency.

Bookings follow **Confirmed → On road → Completed** and can be cancelled. Confirmed bookings can be edited. The single Date field reserves the vehicle and driver for that calendar day. Open a booking and choose **Print confirmation** for a branded document with the route, cargo, contacts, fleet details, and charges. The President's copy also shows the payment balance. Choose a printer or **Save as PDF** in the browser.

The President can filter bookings across all branches, head office, or one branch. Select multiple completed bookings to use **Clear selection**, **Archive selected**, or **Delete selected** above the list. Archive is recoverable. Bulk delete hides completed bookings from the booking list and retains their financial history. Cancelling a booking leaves its recorded charges and receipts in the account for review.

## Cashbook / روزنامچه

Choose an **Account**, **Currency**, and **Period**. The President can switch between the admin ledger and individual branches. Branch managers use their assigned branch. Currencies are tracked separately in AFN, USD, PKR, and IRR.

- **Add a record** takes a description, amount, and date. Use **Save Money In** or **Save Money Out** to post it.
- Select Today, Yesterday, Last 7 days, This month, This year, All time, or Custom dates. The page shows opening balance, Money In, Money Out, and closing balance for the selected period above the entries.
- Newer records appear first. Use **See more** to show older rows within the period.
- **Print / Save PDF** opens a statement with the company logo, account, currency, selected dates, totals, and every receipt in the period. Choose **Save as PDF** in the browser print dialog.

### Correct a mistaken receipt

As President, use **Edit amount** to enter the correct amount and a reason. This updates the same receipt on its original date and adjusts its linked balances. **Amount history** shows the previous and corrected values and the reason. Use **Reverse** when the receipt itself should be cancelled.

As President, select **Reverse** beside the original receipt, enter a reason, and confirm. Cashbook adds an opposite entry dated today and displays the reference between the two receipts. Both remain in history, and any linked booking or trader balance reflects the correction. The same original receipt can be reversed once.

Older versions posted commission automatically when a booking was created. Those entries remain in the ledger. Compare them with actual receipts and reverse any entry recorded in error.

## Trader accounts

As President, open **Traders** and select the wallet icon beside a trader. The currency selector controls the statement totals. Each booking shows its charge, net payments, and remaining balance. The account also shows total charges, payments, debt or credit, and transaction history. Select **Print statement** to print the selected currency or save it as a PDF.

Use the trader's key icon to create a login, change its password, or enable or disable access. **View saved password** shows passwords previously stored by the protected trader account function. If a password predates the vault, set a new one to make it available there. Traders sign in on the same login page and see their own information and balances.

## Branches and account management

The President creates branches and assigns manager credentials in **Branches → Add Branch**. Each branch profile supports a manager photo and four generic document slots. Files are private. The photo accepts JPG, PNG, or WebP, and documents also accept PDF. Each upload is limited to 5 MB.

The branch key icon shows the manager's sign-in name and lets the President set a new password of at least eight characters. The power control manages whether the login is enabled. **View saved password** is available for credentials stored in the encrypted branch vault. Set a new password if an older credential has no vault entry. Branch and trader password storage and reveal actions are audited. Plan vault key migration or password resets before rotating the server credential used for encryption.

Username sign-in maps to an internal `username@users.pedram.local` address. Use an actual email address when an email identity is needed. If a branch login shows President controls, check the role in its header and use the read-only [branch account role check](supabase/check_branch_account_roles.sql) in Supabase.

## Fleet and driver workflow

**Fleet** has separate Vehicles, Drivers, and Owners tabs. A vehicle requires an active owner. Drivers are registered independently and can have a previous company recorded. When archiving a departing driver, staff can record the driver's next company and keep the employment and assignment history.

Fleet records support optional profile photos. Drivers can upload a passport scan, and vehicles have dedicated slots for a permit scan, card, booklet, and another document. The **Documents** panel manages private files, downloads, and document expiry dates. Uploads support files up to 5 MB. Record archiving is recoverable. Confirmed document deletion removes the file permanently.

1. As President, use **Fleet → Drivers** and the key icon to create or link an eligible Driver login. Use the same icon to update its password.
2. Staff select that driver and a vehicle in **Bookings**. The linked driver sees the assignment in **Jobs**.
3. The driver reviews the route and contacts and selects **Accept job**. Changes to the assignment can require fresh acceptance.
4. Staff start the journey. The driver can report delivery while the booking is on the road, then staff verify it and complete the booking.
5. Drivers can open recent completed or cancelled jobs in **History** and check their licence details in **My licence**.

If the driver portal asks the driver to contact the office, check that the active Fleet driver record is linked to the correct enabled Driver login. Job information refreshes on focus, periodically while visible, and via the refresh button.

## Local development

Use Node.js 24 and install the locked dependencies:

```powershell
npm ci
Copy-Item .env.example .env
```

Set the public project values in `.env`:

```dotenv
VITE_SUPABASE_URL=YOUR_SUPABASE_PROJECT_URL
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

Keep the service role key in server or Edge Function configuration. The browser uses only the project's public values.

```powershell
npm run dev
```

Open the URL printed by Vite, typically `http://localhost:5173`. Restart Vite after changing `.env`.

## Supabase setup and upgrades

1. Apply [the SQL migrations](supabase/migrations) in filename order. For an existing project, apply only pending migrations. With a linked Supabase CLI project, use `supabase db push`.
2. Apply [booking receivables](supabase/migrations/202611090007_booking_receivables.sql), [operations controls](supabase/migrations/202611090008_operations_controls.sql), and [Cashbook amount corrections](supabase/migrations/202611090009_cashbook_amount_corrections.sql) in that order. Deploy the frontend after applying the migrations.
3. For a fresh setup or an account function update, deploy these current functions to the same project used by the frontend:

   ```powershell
   supabase functions deploy create-branch-with-manager --project-ref YOUR_PROJECT_REF --use-api
   supabase functions deploy manage-branch-account --project-ref YOUR_PROJECT_REF --use-api
   supabase functions deploy create-driver-account --project-ref YOUR_PROJECT_REF --use-api
   supabase functions deploy manage-trader-account --project-ref YOUR_PROJECT_REF --use-api
   ```

   For Dashboard deployment, use the full `index.ts` from each matching directory in [supabase/functions](supabase/functions).
4. For a fresh project, create the first President in Supabase Authentication. The signup trigger creates their profile. Assign the role from a trusted SQL session using the Auth user UUID:

   ```sql
   update public.profiles
   set role = 'president', full_name = 'President name'
   where id = 'REPLACE_WITH_AUTH_USER_UUID';
   ```

5. Sign in as President to configure branches, fleet records, and accounts.

## Build and verification

From the project root in PowerShell:

```powershell
npm run build
npm run lint
$testFiles = rg --files tests -g '*.test.js'
node --test $testFiles
```

The production build is written to `dist/`. Use `npm run preview` to serve it locally.

The database suites use a disposable PostgreSQL instance. Install `@electric-sql/pglite` in a separate test directory and point `PEDRAM_PGLITE_PATH` to its `dist/index.js`:

```powershell
$env:PEDRAM_PGLITE_PATH = 'C:\path\to\node_modules\@electric-sql\pglite\dist\index.js'
node tests/booking-receivables-database.mjs
node tests/record-workflows-database.mjs
```

The receivables suite checks the current migration path, booking charges, partial payments, reversals, staff access, fleet availability, dashboard totals, and the trader portal. The record workflow suite checks the earlier registry and driver migration path, including assignments, document handling, and account status.

## Project layout

| Path | Purpose |
| --- | --- |
| [src/pages](src/pages) | Login, dashboard, registries, availability, Cashbook, and driver and trader portals |
| [src/components](src/components) | Shared controls, account dialogs, and dashboard summary |
| [src/lib](src/lib) | Supabase client, permissions, ledger calculations, dates, and exports |
| [supabase/migrations](supabase/migrations) | Ordered database schema and access changes |
| [supabase/functions](supabase/functions) | Account provisioning and management |
| [tests](tests) | Frontend and disposable database checks |
