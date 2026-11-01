# Simple روزنامچه / Cashbook

Apply `202611010002_simplify_cashbook.sql` after `202611010001_branch_cashbooks.sql`. The forward migration removes the old transfer/setup API and preserves all existing entries and balances.

The page has Money In / آمد in a table on the right and Money Out / رفت in a table on the left. Large, bold headings and a central divider separate them. Each table shows date, description, amount and its own total; the balance appears underneath both tables. On smaller screens they stack vertically with a horizontal divider. The President selects All accounts, Admin account, or a branch. Branch managers see only their own branch. Currency totals remain separate.

Click Money In or Money Out. Enter the date, name/description, and amount; the President can choose the receiving/recording account. Accounts start automatically at zero. No opening-balance setup, bank/cash selection, transfer, reversal, or booking-payment setup is required. Negative balances are allowed and shown as deficits.

Existing cash/bank records are combined in the same branch list. Previously entered opening funds are shown as Earlier balance so past money is not lost. Historical booking links and records are retained in the database, but there is no booking-payment configuration in this simplified page.

Only the new `cashbook_simple_post` RPC can create entries. It validates branch access and positive amounts, saves atomically, and prevents a retried request from creating duplicate transactions. Direct ledger updates and deletes are not granted.

Run `node --test tests/cashbook.test.js` for calculation tests. `tests/verify-cashbook-database.mjs` tests the migration path in temporary PGlite PostgreSQL; set `CASHBOOK_PGLITE_PATH` to an installed `@electric-sql/pglite/dist/index.js`. It never touches live Supabase.
