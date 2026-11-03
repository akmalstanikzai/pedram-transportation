# Pedram Transportation Management System

A bilingual English/Dari management application for Pedram Transportation Company, built with React, Vite, Supabase, and Lucide icons.

Switching language translates labels and changes layout direction; displayed numbers continue to use English digits (0–9), including money amounts and totals.

Project documentation updated: **3 November 2026**. The current source includes record management, branch password controls and a focused driver portal. Apply the ordered migrations through `202611020005_driver_portal.sql` and use the current account Edge Functions. Source changes do not automatically update live Supabase.

## Current features

Vehicle model years accept digits without a calendar-year range, including leading zeroes and long values. Apply `202611030001_vehicle_model_year.sql` after the driver portal migration to remove the old 1950–2100 restriction and update the Fleet save API. Existing model years are preserved. No Edge Function redeployment is needed for this change.

| Module | Current implementation |
| --- | --- |-
| Login | Company branding, email or username sign-in, English/Dari switch, and right-to-left Dari layout. |
| Branches | Create, edit, view, archive/restore, and enable/disable the manager's login. Assign credentials when creating a branch; use the key icon in the Password column to view its login and set a new password. |
| Fleet | Independent owner, vehicle and driver records, with edit, detail, status, archive/restore, documents and driver login management. |
| Traders | Create, edit and archive/restore traders; open their profile and account together. Record fares and receipts, and see money owed, credit and payment history by currency. |
| Bookings | Create, edit, view, cancel, start, complete and archive/restore. Capacity, expiry, schedule conflict and duplicate-request checks. No money fields. |
| Cashbook / روزنامچه | Simple Money In / آمد and Money Out / رفت records for the admin account and branches, with separate tables and automatic totals. |
| Driver portal | Icon-led assigned jobs, route/maps, dates, load, assigned vehicle, sender/receiver/branch calls, licence expiry, job acceptance and delivery reporting. Recent history is separate. |

The President menu contains only working pages: Cashbook, Branches, Fleet, Bookings, and Traders. Empty Trip Plans, Customs, Finance and Reports pages have been removed, along with the duplicate Trader Accounts page. Old Trader Accounts links resolve to Traders. No business records were deleted when removing these menu items.

## Roles and access

The database defines five roles: President, Vice-president, Departmental Manager, Branch Manager, and Driver.

- **President:** accesses the implemented President modules and views cashbook records for the admin account, one branch, or all accounts.
- **Branch Manager:** accesses Cashbook, Fleet, Bookings and Traders for their assigned branch. They can register and manage branch-owned records, create and process their branch's bookings, and maintain their branch's trader fares and receipts. Shared head-office directory profiles can be viewed and selected for bookings, but cannot be edited, archived or have their private documents opened by branch staff. Other branches' records and accounts remain hidden.

Branches is President-only in the module menu, navigation guard and Branches component. A branch login opening `#/branches` is returned to its allowed module menu. If a branch login still sees President controls, check the role displayed in the header and run the read-only `supabase/check_branch_account_roles.sql` in SQL Editor to inspect the linked manager's role and branch. Do not hide an incorrect President role merely with styling; correct the account assignment after identifying the affected user. This UI restriction requires a frontend deployment, with no new migration.
- **Driver:** a linked login sees only that driver's assigned jobs, their licence information and the minimum vehicle/contact details needed for each job. Drivers can accept ready jobs and report delivery of on-road jobs. The President can create a driver login or link an existing unused Driver-role account from Fleet.
- **Vice-president / Departmental Manager:** exist in the role model, but their working portals have not yet been implemented.

Disabled accounts cannot use the new operational APIs. The app rechecks account status on focus and every 30 seconds. Branch archiving disables its manager's login; driver archiving or setting the driver inactive disables that driver's login. Restoring a record does not automatically re-enable the account.

New authenticated users receive the least-privileged `driver` role. The first President must be assigned through a trusted Supabase admin session; the browser cannot assign roles.

Branch selection is automatic in the branch portal; changing a request in the browser cannot assign work or money to another branch. Only the President manages branches and creates, links or enables/disables login accounts. The President keeps all five working pages and a full view across branches. Branch trader statements show only that branch's charges and receipts, even when the trader profile is shared with head office.

## Branch passwords

In **President → Branches → Add Branch**, enter the manager's email/username, password and confirmation. The manager signs in on the normal login page using those credentials.

For an existing branch, click the **key icon in the Password column**, enter a new password (at least 8 characters), repeat it, and select **Save password**. The dialog shows the correct username or email for that manager. Password changes do not enable a disabled login; use the existing power icon to enable it if needed. Archived branches must be restored first.

The new self-contained **`manage-branch-account` Edge Function** checks that the caller is an enabled President and that the target account is the selected branch's registered Branch Manager. It updates the password through the server-only Supabase Auth admin API; passwords are never saved in branch/profile tables or returned by the API. No SQL migration is needed for password changes. Deploy this new function before using the key button; the existing create functions remain unchanged.

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

The President's Bookings page has a Branch dropdown below its title, styled like the Cashbook account filter. Choose All branches (including head office), Head office, or a named branch. It works together with search and Archive, and retains archived branches for historical records. Branch managers continue to see only their own branch bookings and do not receive this cross-branch filter. This is a frontend change; no SQL migration or Edge Function redeployment is required.

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

## Driver portal

Keep one working **Jobs / برنامه‌ها** screen with large Lucide icons and short English/Dari labels. It shows the route, departure/arrival dates, goods and weight/volume, the vehicle assigned to that particular booking, and sender/receiver details. Call buttons use the phone's dialler; map buttons search the entered address and city in Google Maps. They do not provide live tracking or verified GPS coordinates. The office call uses the branch phone, falling back to its manager's phone; it is hidden when no valid number is registered.

1. President creates/links the driver's login in **Fleet → Drivers → Login account**. Register the licence number and expiry there too.
2. Branch or President assigns a vehicle and driver separately in **Bookings**. That job appears automatically in the driver's portal.
3. Driver taps **Accept job / پذیرفتن برنامه**. Staff see the acceptance on the existing booking. Editing assignment details clears acceptance so the driver must review the changed job.
4. Staff start the journey. When the receiver has received the goods, the driver taps **Delivered / بار تحویل شد** and confirms.
5. The booking displays the delivery report to staff, who verify it and mark the journey complete. A driver report alone does not complete a booking, cancel it, or release the vehicle's reserved schedule.

Both portals refresh job information on focus and every 30 seconds while visible; a refresh icon is also available. **History / سابقه** shows the latest 20 completed/cancelled jobs. **My licence / لایسنس من** shows the driver's own basic details; missing, expired or soon-expiring licence dates are flagged. Licence changes remain in Fleet. Numbers remain English in both languages.

The `get_driver_portal` API returns a limited operational projection for the authenticated driver's linked record. It omits trader accounts, fare/commission values and ID scans. `driver_booking_action` checks assignment ownership, active account, booking status and the version the driver saw. Repeated acceptance/delivery requests do not create duplicate reports. Drivers have no direct booking write access. No road-expense or payment workflow is added to this portal.

Apply **`202611020005_driver_portal.sql`** after the branch portal migration before using this version of the frontend. It adds two nullable report timestamps and the driver APIs; it preserves existing bookings. No additional Edge Function deployment is needed.

### If the driver portal says “Contact the office to link your driver record”

The signed-in account has no linked active Fleet driver record. Creating an Auth user or giving it the Driver role alone does not create that link; matching names do not link accounts automatically.

As President, open **Fleet → Drivers**, register or locate the actual driver, and click that driver's **key icon**. Choose **Create login** with a new username/email and password, or expand **Link an existing driver login** and select the driver's unused eligible account. Existing-account choices must be enabled Driver-role accounts in the same branch scope and not already linked to another driver. If the driver is already using an eligible account, link that account rather than creating a second login. The record's `user_id` stores the link to the Auth/profile ID.

For an already linked driver, the same key icon shows the current sign-in name and **New password / Confirm password / Save password**. Only the President can change it. The existing account, assignments and enabled/disabled state are preserved. The next password sign-in uses the newly assigned password; this is not a forced logout of an already open session. Passwords are updated through Supabase Auth and are not stored in Fleet tables. Redeploy the latest **create-driver-account** Edge Function to enable its new `details` and `password` actions. No new SQL migration is needed for password changes, and no additional function name is introduced.

### Assign a job and vehicle

No separate task or trip-plan page is required. Use **Bookings → New booking** in the President or Branch portal: enter the booking, route, dates and load, select a registered vehicle, then select a registered driver independently, and save. The saved booking is the driver's job. If that driver's Fleet record has a linked enabled login, it appears in **Driver portal → Jobs**, including the vehicle selected for that booking. The two assignments are not a permanent driver/vehicle pairing. Bookings warns when the chosen driver has no linked login.

To change an assignment, edit a **Confirmed** booking, choose another eligible driver and/or vehicle, and save. The former driver loses access to the job, and the new driver sees it on refresh. Changing assignment details clears earlier acceptance. On-road bookings are locked against editing. Existing capacity, licence/permit expiry, date overlap and branch-scope checks apply. Staff start/complete the journey; the driver accepts the job and reports delivery. Jobs refresh on focus or every 30 seconds while visible, with a manual refresh icon available.

The driver then signs in using that connected account and refreshes the portal. To display jobs, select the same driver record when creating a booking. A connected driver with no assignments sees **No jobs assigned yet**, which is different from a missing account link. Inactive/archived driver records cannot use the portal; restore/activate the record and enable its login as needed.

Trader profiles and accounts are managed together in **Traders**. Use the account/wallet icon to open the profile, fares, receipts and remaining balance. Add a fare (optionally linked to a booking), then use Receive payment. A receipt is saved once in the selected admin/branch cashbook and appears in the trader statement automatically. Cashbook entries can also optionally link a trader; outgoing linked entries reduce net payments, for example for refunds. Entries without a trader link cannot be attributed from their description alone.

Charges record what the trader owes and do not add cash. Fares can be cancelled when entered by mistake; the cancelled row remains in history. Currency balances never mix. Historical agreed booking totals and explicitly booking-linked receipts are migrated into the combined view. Booking cancellation does not automatically cancel a financial charge; review and cancel the charge separately when appropriate.

## Fleet and documents

Fleet has three separate icon tabs: Vehicles, Drivers, and Owners. Each tab has its own list, search, archive filter, and Add button. Search and archive choices are kept separately when switching tabs. Record counts use English digits. Vehicle registration requires an existing active owner; the page provides a shortcut to Owners when none are registered.

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
3. Apply the later migrations in order, including the historical operations migrations and rollback, then **`202611020002_simple_record_workflows.sql`**, **`202611020003_combined_trader_accounts.sql`**, **`202611020004_branch_portal.sql`**, and **`202611020005_driver_portal.sql`**. They provide the record APIs, combined trader ledger, branch permissions and driver portal without restoring removed workspace widgets or transfer UI. Deploy the account Edge Functions using your project reference:

   ```powershell
   supabase functions deploy create-branch-with-manager --project-ref YOUR_PROJECT_REF --use-api
   supabase functions deploy create-driver-account --project-ref YOUR_PROJECT_REF --use-api
   supabase functions deploy manage-branch-account --project-ref YOUR_PROJECT_REF --use-api
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

Keep the account Edge Functions and database schema in sync. The creation functions use server-side service-role access, verify the active President, and use request-tagged Auth metadata to recover account creation after a network interruption. They never reuse an unrelated account just because an email matches. `manage-branch-account` provides the separate President-only password workflow. Applying a local migration file does not itself update the hosted database, and editing an Edge Function locally does not deploy it.

For Dashboard editor deployments, paste each function's complete `index.ts` file into that function. All three entrypoints are self-contained and do not import a local `_shared` file. The shared provisioning source is retained only as a consistency reference for the two creation functions. See [Dashboard deployment instructions](supabase/README.md#deploy-through-the-dashboard-editor).

See [Supabase setup notes](supabase/README.md).

## Build and verification

```powershell
npm run build
npm run lint
node --test tests/cashbook.test.js
node --test tests/branch-account-function.test.js
node --test tests/driver-password-function.test.js
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

The workflow suite applies the real migration history and tests lifecycle actions, stale edits, trader duplicates, booking request replay, capacity/expiry/conflicts, document metadata and recovery, linked/disabled accounts, driver-only assignment access, report retries, fresh acceptance after edits, and staff-verified delivery. The rollback suite remains pinned to its historical migration boundary.

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
