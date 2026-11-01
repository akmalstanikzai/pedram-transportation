# Local review: operations and workspace

These notes describe the operations and workspace release, its review steps and
backend prerequisites. GitHub publication and Supabase deployment are separate.
The existing `.env` and locked dependency versions are unchanged; environment
files, build output and local credentials are excluded from version control.

## Review the interface

Run `npm.cmd run dev` and open the printed local URL (normally http://localhost:5173).
The login keeps the existing branding. The workspace adds a forest-green sidebar,
expandable Branches/Fleet/Bookings groups, a collapsed icon rail, a mobile drawer,
English/Dari layouts, overview counts, search, status filters and paged tables.
Cashbook and all five planned modules remain in navigation.
The main workspace uses white and gray surfaces with neutral text; green remains
on the navigation sidebar. Status and notification colors carry their meaning:
red for errors/expired documents, amber for upcoming expiry, and blue for bookings.

The sidebar collapse control is at the top right, with Settings in the footer.
Header search supports vehicles, owners, drivers, branches, bookings, traders,
documents and cashbook entries within the signed-in user's existing access.
Results open the corresponding record, document or filtered booking/cashbook view.
The profile menu opens User Profile, Notification Settings, Login & Password,
Appearance & Theme, and Log Out. Theme, spacing, in-app alert preferences and read
state are saved per user in this browser. The bell beside the profile opens a
notification panel opposite the sidebar (right in English, left in Dari), with Inbox/Archived folders, document/booking
filters, read/archive/restore actions and a Notification Settings link.
No email or push subscriptions are added.
Alerts cover scheduled departures of active bookings within the selected horizon,
plus expired or soon-expiring uploaded documents with an expiry date. Registering
a vehicle, owner or driver alone does not create an alert. The bell refreshes after
booking/document changes, on returning to the tab and every minute while visible.
Empty views identify the date range, disabled alerts and the unread-only filter;
loading failures show a warning rather than silently appearing as no alerts.
Username-based accounts keep their administrator-managed username and can change
their password; accounts with real email addresses can request an email change.

## Implemented workflows

- Login uses the same username validation as account creation. Staff profiles must
  load before any workspace appears. Disabled profiles are blocked, identity and
  permission changes clear module state, and request failures have translated errors.
- Branches: create branch/manager together, edit details, assign an existing manager
  or create a replacement manager account for an existing branch,
  enable/disable their portal account, archive and restore. Only the President writes.
  Reassignment disables the previous manager. A manager cannot own two active branches.
- Fleet: separate owner, vehicle and driver lists; register, inspect, edit, archive and
  restore. Plates are normalized, decimal capacity is supported, exact duplicate
  identities are rejected, and active references prevent unsafe archival.
- Owner-as-driver registration is one transaction. An existing unowned driver with
  the same name/contact can be associated instead of duplicated.
- The President can link an existing driver-role Auth profile to a driver record.
  Creating an Auth login for a driver is still a trusted administrator operation.
- Registration includes document cards with icons, type-specific guidance, file
  selection and optional expiry dates for vehicles, owners and drivers. Save and
  upload first creates the parent, then uploads the selected files. A partial
  upload keeps the saved parent and retries only remaining files; an uncertain
  parent save reuses its request ID before any upload begins. The list's Documents
  action has both an icon and visible text, and the editor links to file management.
  Uploads reserve metadata,
  use stable file IDs, preserve original names, and can retry without creating another
  parent. Viewing the document list, downloading, expiry editing, and confirmed removal
  are implemented. Pending upload/removal rows remain visible for recovery.
- Bookings: create and edit confirmed records, inspect contact details, transition
  confirmed → in transit → completed, or cancel an active booking. Historical records
  remain readable. Direct browser writes are revoked in favor of validated RPCs.
- Weight must fit known vehicle capacity. Known licence/permit expiries must cover
  the journey. Inactive/archived resources and overlapping active reservations are
  rejected. Reservations cover complete days, including departure and arrival days;
  this implementation does not schedule multiple journeys within a day.
- Bookings retain independent vehicle/driver selection, both service types, cargo
  weight/volume, reusable traders and contact snapshots. Existing trader profiles and
  historical financial values are not overwritten by operational edits.

## Permission model

| Role                 | Access                                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| President            | All branches and operations, manager administration, existing Cashbook and planned modules           |
| Vice-president       | Global fleet/bookings and read-only branch information                                               |
| Branch manager       | Fleet, traders and bookings for the assigned active branch; existing own-branch Cashbook             |
| Driver               | Read-only bookings assigned to the linked driver record                                              |
| Departmental manager | Active staff landing page; no operational permissions are assumed without a defined department model |

RLS enforces scope and account status independently of navigation. Operational booking
column grants exclude historical freight/commission/currency fields, including for
driver sessions. Existing custom read restrictions are retained; mandatory restrictive
policies prevent permissive policies from widening the new scope.

## Pending backend release

The interface can be reviewed locally, but the new writes and document workflows
require the matching backend release. Missing schema/RPCs produce a setup message.
Do not apply all old migrations again to an existing database.
For the reported missing-column/function errors, follow
[the database fix instructions](supabase/FIX_DATABASE_SETUP.md), including the
read-only [setup check](supabase/CHECK_SETUP.sql). Remote metadata checks confirmed
the operations columns and notification function are missing; no remote writes
were performed. Failed loads show an error state rather than empty-record counts.

After review, coordinate these changes with the collaborator responsible for Supabase:

1. Review and apply the pending
   `supabase/migrations/202611010003_operations_security.sql`, after both cashbook
   migrations. This preserves business records and adds RPCs, scope, archival,
   optimistic locking, idempotency, document metadata and storage policies.
   Then apply `supabase/migrations/202611010004_workspace_tools.sql` for scoped
   global search, own-profile editing and document/booking notification queries.
   These features require this migration before testing against shared data.
2. Deploy the updated `create-branch-with-manager` Edge Function.
3. Release the corresponding frontend together with the backend changes. The older
   frontend's direct fleet writes will be denied once the migration revokes them.
4. Verify login, manager deactivation, branch isolation, storage and the booking flow
   against an authorized test account in the intended Supabase environment.

The migration deliberately stops if normalized historical plates conflict; review
those records instead of automatically merging them. Existing invalid capacities
are retained but must be corrected before updates. Existing fleet/trader records
remain central-office records; historical booking branch assignments remain intact.
No branch ownership is guessed from personal data. Branch managers will need records
registered in their branch before creating new branch bookings.
Existing bookings start as confirmed because historical transport status is unknown;
review their status before archiving resources referenced by those records.

Legacy storage paths matching the old vehicle/owner/driver layout are indexed into
document metadata. Their original filenames cannot be recovered, so the stored
basename is used. Unmatched objects are retained for administrator review.

Auth and PostgreSQL are separate services. Branch creation records admin-only recovery
metadata on new Auth accounts and retries the same account after interruptions. The
function reconciles uncertain SQL results before compensation, and never deletes a
recovered account merely because a later request fails. Persistent uncertainty is
reported with a request ID in function logs for administrator reconciliation.

## Verification

```powershell
npm.cmd run lint
npm.cmd test
npm.cmd run build
```

The tests include login/key validation, permissions, file limits, existing cashbook
calculations, and the actual Edge handler with isolated Auth/database adapters.
Edge handler tests use Node's `stripTypeScriptTypes` API (available in the current
Node 23.3 environment); they do not run the hosted Deno gateway.

For database integration checks, install `@electric-sql/pglite` in a separate temporary
tools directory and point `PEDRAM_PGLITE_PATH` to its `dist/index.js`:

```powershell
$env:PEDRAM_PGLITE_PATH='C:\path\to\@electric-sql\pglite\dist\index.js'
npm.cmd run test:database
```

The database test applies the complete migration history to disposable PostgreSQL
and checks actual grants, RLS, disabled users, branch isolation, booking conflicts,
capacity, retries, stale edits, lifecycle transitions and document access/removal.
It never connects to the shared Supabase project. The existing standalone cashbook
database check remains available in `tests/verify-cashbook-database.mjs`.

Browser checks use an isolated browser context with all Supabase requests intercepted
by test fixtures. They verify frontend behavior, not the deployed Auth/Storage/Edge
services. Live integration and true multi-client PostgreSQL contention testing remain
release checks. No live records were created, edited or deleted during this work.
Notification counts in screenshots from these isolated browser checks belong to
the fixtures and do not reflect the signed-in user's real Supabase records.
