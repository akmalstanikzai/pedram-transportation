// Disposable PostgreSQL integration tests. Never connects to hosted Supabase.
// PEDRAM_PGLITE_PATH must point to an installed @electric-sql/pglite/dist/index.js.
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
const { PGlite } = await import(pathToFileURL(process.env.PEDRAM_PGLITE_PATH).href)
const db = new PGlite()
let checks = 0
const check = (value, message) => {
  assert.ok(value, message)
  checks++
}
const rejects = async (promise, expression) => {
  await assert.rejects(promise, expression)
  checks++
}
await db.exec(`create schema auth; create schema storage;
 create role anon; create role authenticated; create role service_role bypassrls;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth,storage to authenticated,service_role;
 grant execute on function auth.uid() to authenticated,service_role;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb default '{}',unique(bucket_id,name));
 alter table storage.objects enable row level security;
 grant select,insert,delete on storage.objects to authenticated;
 grant select on storage.buckets to authenticated;`)
const migrations = (await readdir(new URL('../supabase/migrations/', import.meta.url)))
  .filter((name) => name.endsWith('.sql'))
  .sort()
const setupCheck = await readFile(new URL('../supabase/CHECK_SETUP.sql', import.meta.url), 'utf8')
for (const name of migrations) {
  try {
    await db.exec(
      await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'),
    )
    if (name === '202611010002_simplify_cashbook.sql') {
      const setup = (await db.query(setupCheck)).rows
      check(
        setup.slice(0, 2).every((row) => row.status.startsWith('Ready')),
        'setup check recognizes existing cashbook migrations',
      )
      check(
        setup.slice(2).every((row) => row.status.startsWith('Missing')),
        'setup check identifies missing operations and workspace migrations',
      )
    }
  } catch (error) {
    console.error('Migration failed:', name, error.message)
    throw error
  }
}
console.log('All', migrations.length, 'migrations applied in disposable PostgreSQL.')
check(
  (await db.query(setupCheck)).rows.every((row) => row.status.startsWith('Ready')),
  'setup check confirms the completed schema',
)
// Even a legacy/custom permissive read policy must not bypass the scope guard.
await db.exec(
  'create policy test_permissive_read on public.vehicles for select to authenticated using(true)',
)
const president = randomUUID(),
  vice = randomUUID(),
  manager = randomUUID(),
  outsider = randomUUID(),
  driverUser = randomUUID(),
  department = randomUUID()
const branch1 = randomUUID(),
  branch2 = randomUUID()
for (const id of [president, vice, manager, outsider, driverUser, department])
  await db.query('insert into auth.users(id) values($1)', [id])
await db.query("update public.profiles set role='president' where id=$1", [president])
await db.query("update public.profiles set role='vice_president' where id=$1", [vice])
await db.query("update public.profiles set role='branch_manager' where id in ($1,$2)", [
  manager,
  outsider,
])
await db.query("update public.profiles set role='departmental_manager' where id=$1", [department])
await db.query(
  "insert into public.branches(id,name,province,city,created_by) values($1,'Kabul','Kabul','Kabul',$3),($2,'Herat','Herat','Herat',$3)",
  [branch1, branch2, president],
)
await db.query('update public.profiles set branch_id=$1 where id=$2', [branch1, manager])
await db.query('update public.profiles set branch_id=$1 where id=$2', [branch2, outsider])
async function actor(id, role = 'authenticated') {
  await db.exec(`reset role; set role ${role}`)
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id])
}
async function admin(sql, params = []) {
  await db.exec('reset role')
  return db.query(sql, params)
}
async function fleet(kind, data, id = null, request = randomUUID(), expected = null) {
  return (
    await db.query('select public.save_fleet_record($1,$2,$3,$4::jsonb,$5) as id', [
      kind,
      id,
      request,
      JSON.stringify(data),
      expected,
    ])
  ).rows[0].id
}
async function booking(data, id = null, request = randomUUID(), expected = null) {
  return (
    await db.query('select public.save_booking_record($1,$2,$3::jsonb,$4) as id', [
      id,
      request,
      JSON.stringify(data),
      expected,
    ])
  ).rows[0].id
}
async function stamp(table, id) {
  return (await db.query(`select updated_at from public.${table} where id=$1`, [id])).rows[0]
    .updated_at
}
await actor(president)
const ownerRequest = randomUUID(),
  ownerData = {
    full_name: 'Owner',
    phone: '0700000000',
    branch_id: branch1,
    owner_is_driver: true,
    license_expiry: '2030-01-01',
  }
const owner = await fleet('owner', ownerData, null, ownerRequest)
check(
  (await fleet('owner', ownerData, null, ownerRequest)) === owner,
  'fleet retry returns original',
)
check(
  (await db.query('select * from public.drivers where owner_id=$1', [owner])).rows.length === 1,
  'owner/driver creation is atomic and idempotent',
)
await rejects(
  fleet('owner', { ...ownerData, full_name: 'Different' }, null, ownerRequest),
  /REQUEST_CONFLICT/,
)
const vehicleData = {
  owner_id: owner,
  plate_number: ' kab 123 ',
  vehicle_type: 'Truck',
  capacity_tons: '20.50',
  permit_expiry: '2030-01-01',
  branch_id: branch1,
  status: 'available',
}
const vehicle = await fleet('vehicle', vehicleData)
check(
  (await db.query('select plate_number from public.vehicles where id=$1', [vehicle])).rows[0]
    .plate_number === 'KAB123',
  'plate normalized',
)
await rejects(fleet('vehicle', { ...vehicleData, plate_number: 'KAB123' }), /duplicate key/)
await rejects(
  fleet('vehicle', { ...vehicleData, plate_number: 'NEG', capacity_tons: '-1' }),
  /INVALID_CAPACITY/,
)
await rejects(
  fleet('vehicle', { ...vehicleData, plate_number: 'NAN', capacity_tons: 'NaN' }),
  /INVALID_CAPACITY/,
)
const driver = await fleet('driver', {
  full_name: 'Driver',
  phone: '0700000001',
  license_number: 'L1',
  license_expiry: '2030-01-01',
  branch_id: branch1,
})
const base = {
  branch_id: branch1,
  trader_first_name: 'Trader',
  trader_last_name: 'One',
  trader_phone: '0700000002',
  trader_address: 'Kabul',
  sender_name: 'Sender',
  sender_phone: '0700000003',
  sender_address: 'Kabul',
  receiver_name: 'Receiver',
  receiver_phone: '0700000004',
  receiver_address: 'Herat',
  booking_date: '2026-11-01',
  departure_date: '2026-11-03',
  arrival_date: '2026-11-04',
  service_type: 'arrangement',
  goods: 'Rice',
  weight_tons: '10.125',
  volume_m3: '',
  origin: 'Kabul',
  destination: 'Herat',
  vehicle_id: vehicle,
  driver_id: driver,
}
await rejects(booking({ ...base, weight_tons: '21' }), /CAPACITY_EXCEEDED/)
await rejects(booking({ ...base, weight_tons: '', volume_m3: '' }), /INVALID_MEASUREMENT/)
await rejects(booking({ ...base, weight_tons: '', volume_m3: 'NaN' }), /INVALID_MEASUREMENT/)
await rejects(booking({ ...base, receiver_phone: '' }), /REQUIRED_FIELDS/)
await rejects(booking({ ...base, arrival_date: '2026-11-02' }), /INVALID_DATES/)
const request = randomUUID(),
  booked = await booking(base, null, request)
check((await booking(base, null, request)) === booked, 'booking retry idempotent')
await rejects(booking(base), /RESOURCE_CONFLICT/)
await rejects(
  db.query(
    "insert into public.bookings(trader_id,service_type,origin,destination,goods,booking_date) values(gen_random_uuid(),'managed','A','B','x','2026-11-01')",
  ),
  /permission denied/,
)
await rejects(
  db.query("update public.profiles set role='president' where id=$1", [driverUser]),
  /permission denied/,
)
await rejects(db.query('delete from public.vehicles'), /permission denied/)
await rejects(
  fleet(
    'vehicle',
    { ...vehicleData, archived: true },
    vehicle,
    randomUUID(),
    await stamp('vehicles', vehicle),
  ),
  /RECORD_IN_USE/,
)
await rejects(
  fleet(
    'vehicle',
    { ...vehicleData, capacity_tons: 1 },
    vehicle,
    randomUUID(),
    await stamp('vehicles', vehicle),
  ),
  /RECORD_IN_USE/,
)
const before = await stamp('bookings', booked)
await booking({ ...base, goods: 'Wheat' }, booked, randomUUID(), before)
await rejects(booking(base, booked, randomUUID(), before), /STALE_RECORD/)
await rejects(
  db.query('select public.change_booking_status($1,$2,$3,$4)', [
    booked,
    'completed',
    randomUUID(),
    await stamp('bookings', booked),
  ]),
  /INVALID_TRANSITION/,
)
await db.query('select public.change_booking_status($1,$2,$3,$4)', [
  booked,
  'in_transit',
  randomUUID(),
  await stamp('bookings', booked),
])
await rejects(booking(base, booked, randomUUID(), await stamp('bookings', booked)), /RECORD_LOCKED/)
await db.query('select public.change_booking_status($1,$2,$3,$4)', [
  booked,
  'completed',
  randomUUID(),
  await stamp('bookings', booked),
])
await booking({ ...base, departure_date: '2026-11-05', arrival_date: '2026-11-06' })
check(
  (await db.query('select * from public.traders')).rows.length === 1,
  'same contact reuses trader',
)
await actor(manager)
check(
  (await db.query('select * from public.vehicles')).rows.length === 1,
  'manager reads own fleet',
)
// A branch manager's supplied branch is overridden with their own scope.
const scoped = await fleet('owner', { full_name: 'Scoped', phone: '1', branch_id: branch2 })
check(
  (await db.query('select branch_id from public.vehicle_owners where id=$1', [scoped])).rows[0]
    .branch_id === branch1,
  'manager cannot choose another branch',
)
await actor(outsider)
check(
  (await db.query('select id from public.bookings')).rows.length === 0,
  'other branch cannot read bookings',
)
await rejects(booking(base), /RESOURCE_UNAVAILABLE/)
await rejects(fleet('vehicle', vehicleData, vehicle, randomUUID(), before), /ACCESS_DENIED/)
await actor(department)
check(
  (await db.query('select * from public.vehicles')).rows.length === 0,
  'unassigned role has no operational access',
)
await rejects(booking(base), /ACCESS_DENIED/)
await admin('update public.profiles set account_enabled=false where id=$1', [manager])
await actor(manager)
check(
  (await db.query('select * from public.vehicles')).rows.length === 0,
  'disabled manager cannot read',
)
await rejects(fleet('owner', { full_name: 'No', phone: '1' }), /ACCESS_DENIED/)
await actor(vice)
check(
  (await db.query('select * from public.vehicles')).rows.length === 1,
  'vice president has operational access',
)
await rejects(
  db.query('select public.save_branch_record(null,$1,$2::jsonb)', [
    randomUUID(),
    JSON.stringify({ name: 'No', province: 'X', city: 'Y' }),
  ]),
  /ACCESS_DENIED/,
)
await actor(president)
await admin('update public.profiles set branch_id=$1 where id=$2', [branch1, driverUser])
await actor(president)
await fleet(
  'driver',
  {
    full_name: 'Driver',
    phone: '0700000001',
    license_expiry: '2030-01-01',
    branch_id: branch1,
    user_id: driverUser,
  },
  driver,
  randomUUID(),
  await stamp('drivers', driver),
)
await actor(driverUser)
await rejects(db.query('select commission from public.bookings'), /permission denied/)
check(
  (await db.query('select id from public.bookings')).rows.length === 2,
  'linked driver reads own bookings',
)
await rejects(booking(base), /ACCESS_DENIED/)
await actor(president)
const doc = randomUUID()
const docArgs = [
  doc,
  'vehicle',
  vehicle,
  'permit',
  'permit.pdf',
  'application/pdf',
  10,
  '2030-01-01',
]
const path = (
  await db.query('select public.reserve_fleet_document($1,$2,$3,$4,$5,$6,$7,$8) as path', docArgs)
).rows[0].path
await rejects(db.query('select public.complete_fleet_document($1)', [doc]), /INVALID_FILE/)
await db.query('insert into storage.objects(bucket_id,name) values($1,$2)', [
  'fleet-documents',
  path,
])
await db.query('select public.complete_fleet_document($1)', [doc])
check(
  (await db.query('select state from public.vehicle_documents where id=$1', [doc])).rows[0]
    .state === 'ready',
  'document metadata finalized',
)
await rejects(
  db.query('insert into storage.objects(bucket_id,name) values($1,$2)', [
    'fleet-documents',
    'unregistered/file.pdf',
  ]),
  /row-level security/,
)
await actor(outsider)
check(
  (await db.query('select * from storage.objects')).rows.length === 0,
  'document storage is isolated by branch',
)
await rejects(db.query('select public.remove_fleet_document($1)', [doc]), /ACCESS_DENIED/)
await actor(president)
await db.query('select public.remove_fleet_document($1)', [doc])
await rejects(db.query('select public.remove_fleet_document($1,true)', [doc]), /RECORD_IN_USE/)
await db.query('delete from storage.objects where name=$1', [path])
await db.query('select public.remove_fleet_document($1,true)', [doc])
check(
  (await db.query('select * from public.vehicle_documents')).rows.length === 0,
  'document cleanup removes metadata after object',
)
await rejects(
  db.query('select public.provision_branch($1,$2,$3,$4::jsonb,$5)', [
    president,
    randomUUID(),
    outsider,
    '{}',
    'newmanager',
  ]),
  /permission denied/,
)
const newManager = randomUUID()
await admin('insert into auth.users(id) values($1)', [newManager])
await actor(president, 'service_role')
const branchRequest = randomUUID(),
  branchData = {
    name: 'New branch',
    city: 'Jalalabad',
    province: 'Nangarhar',
    manager_name: 'New manager',
    manager_phone: '0700000099',
  }
const newBranch = (
  await db.query('select public.provision_branch($1,$2,$3,$4::jsonb,$5) as id', [
    president,
    branchRequest,
    newManager,
    JSON.stringify(branchData),
    'newmanager',
  ])
).rows[0].id
check(
  (
    await db.query('select public.provision_branch($1,$2,$3,$4::jsonb,$5) as id', [
      president,
      branchRequest,
      newManager,
      JSON.stringify(branchData),
      'newmanager',
    ])
  ).rows[0].id === newBranch,
  'provisioning retry returns existing branch',
)
await actor(president)
check(
  (await db.query('select manager_user_id from public.branches where id=$1', [newBranch])).rows[0]
    .manager_user_id === newManager,
  'branch manager linked atomically',
)
const managerProfile = (await db.query('select * from public.profiles where id=$1', [newManager]))
  .rows[0]
check(
  managerProfile.role === 'branch_manager' && managerProfile.branch_id === newBranch,
  'provisioned profile has correct role/scope',
)
await rejects(
  db.query('select public.save_branch_record(null,$1,$2::jsonb,null,$3)', [
    randomUUID(),
    JSON.stringify({ name: 'Conflict', city: 'X', province: 'Y' }),
    newManager,
  ]),
  /MANAGER_ASSIGNED/,
)
await db.query('select public.save_branch_record($1,$2,$3::jsonb,$4)', [
  newBranch,
  randomUUID(),
  JSON.stringify({ ...branchData, manager_user_id: newManager, manager_enabled: false }),
  await stamp('branches', newBranch),
])
await actor(newManager)
check(
  (await db.query('select * from public.branches')).rows.length === 0,
  'disabled branch account loses branch access',
)
await actor(president)
await rejects(
  db.query('select public.reserve_fleet_document($1,$2,$3,$4,$5,$6,$7)', [
    randomUUID(),
    'vehicle',
    vehicle,
    'permit',
    'spoof.pdf',
    'text/html',
    10,
  ]),
  /INVALID_FILE/,
)
await rejects(
  db.query('select public.reserve_fleet_document($1,$2,$3,$4,$5,$6,$7)', [
    randomUUID(),
    'vehicle',
    vehicle,
    'permit',
    'large.pdf',
    'application/pdf',
    20971521,
  ]),
  /INVALID_FILE/,
)
const replacement = randomUUID(),
  replacementRequest = randomUUID()
await admin('insert into auth.users(id,email,raw_app_meta_data) values($1,$2,$3::jsonb)', [
  replacement,
  'replacement@example.test',
  JSON.stringify({
    pedram_provisioning_actor: president,
    pedram_provisioning_request: replacementRequest,
  }),
])
await actor(president)
await rejects(
  db.query('select public.find_branch_provisioning_account($1,$2,$3)', [
    president,
    replacementRequest,
    'replacement@example.test',
  ]),
  /permission denied/,
)
await actor(president, 'service_role')
check(
  (
    await db.query('select public.find_branch_provisioning_account($1,$2,$3) as id', [
      president,
      replacementRequest,
      'replacement@example.test',
    ])
  ).rows[0].id === replacement,
  'only trusted matching provisioning metadata recovers an Auth account',
)
await actor(president)
const version = await stamp('branches', newBranch)
await actor(president, 'service_role')
await db.query('select public.provision_branch($1,$2,$3,$4::jsonb,$5,$6,$7)', [
  president,
  replacementRequest,
  replacement,
  JSON.stringify(branchData),
  'replacement',
  newBranch,
  version,
])
await actor(president)
check(
  (await db.query('select manager_user_id from public.branches where id=$1', [newBranch])).rows[0]
    .manager_user_id === replacement,
  'a replacement manager is assigned to the existing branch',
)
check(
  (await db.query('select account_enabled from public.profiles where id=$1', [newManager])).rows[0]
    .account_enabled === false,
  'replacement leaves old manager disabled',
)
// Workspace tools: real RLS search, self-only profile changes and alert queries.
await actor(president)
let matches = (await db.query('select * from public.search_workspace($1,$2)', ['KAB123', 'all']))
  .rows
check(
  matches.some((row) => row.category === 'vehicles' && row.id === vehicle),
  'global search finds the vehicle and a working record link',
)
check(
  matches.some((row) => row.category === 'bookings'),
  'booking search also matches its assigned plate',
)
check(
  (await db.query('select * from public.search_workspace($1,$2)', ['KAB123', 'drivers'])).rows
    .length === 0,
  'search category restricts results',
)
check(
  (await db.query('select * from public.search_workspace($1)', ['%%'])).rows.length === 0,
  'search treats wildcard characters literally',
)
check(
  (await db.query('select * from public.search_workspace($1)', ['KAB123 Rice'])).rows.length > 0,
  'search matches multiple words across booking fields',
)
await actor(outsider)
check(
  (await db.query('select * from public.search_workspace($1)', ['KAB123'])).rows.length === 0,
  'global search cannot leak another branch',
)
await actor(driverUser)
matches = (await db.query('select * from public.search_workspace($1)', ['KAB123'])).rows
check(
  matches.length > 0 && matches.every((row) => row.category === 'bookings'),
  'driver search opens only assigned bookings',
)
await actor(manager)
await rejects(db.query('select * from public.search_workspace($1)', ['KAB123']), /ACCOUNT_DISABLED/)
await rejects(
  db.query('select public.update_my_profile($1,$2)', ['Blocked', '1']),
  /ACCOUNT_DISABLED/,
)
await actor(president)
const updatedProfile = (
  await db.query('select public.update_my_profile($1,$2) as profile', [
    'Updated President',
    '0700000044',
  ])
).rows[0].profile
check(
  updatedProfile.id === president && updatedProfile.full_name === 'Updated President',
  'profile editing updates only the signed-in profile',
)
check(
  (await db.query('select role from public.profiles where id=$1', [president])).rows[0].role ===
    'president',
  'profile editing cannot change role',
)
await rejects(db.query('select public.update_my_profile($1,$2)', [' ', '1']), /REQUIRED_FIELDS/)
const alertDoc = randomUUID()
const expiryDate = (
  await db.query("select ((now() at time zone 'Asia/Kabul')::date+3)::text as day")
).rows[0].day
const alertPath = (
  await db.query('select public.reserve_fleet_document($1,$2,$3,$4,$5,$6,$7,$8) as path', [
    alertDoc,
    'vehicle',
    vehicle,
    'permit',
    'alert-permit.pdf',
    'application/pdf',
    10,
    expiryDate,
  ])
).rows[0].path
await db.query('insert into storage.objects(bucket_id,name) values($1,$2)', [
  'fleet-documents',
  alertPath,
])
await db.query('select public.complete_fleet_document($1)', [alertDoc])
check(
  (await db.query('select * from public.workspace_alerts(14)')).rows.some(
    (row) => row.id === alertDoc,
  ),
  'notification query finds documents approaching expiry',
)
await actor(outsider)
check(
  !(await db.query('select * from public.workspace_alerts(14)')).rows.some(
    (row) => row.id === alertDoc,
  ),
  'notification query respects branch isolation',
)
console.log(
  `${checks} operation checks passed: roles, branch isolation, disabled accounts, writes, bookings, lifecycle, retries, optimistic locking and storage.`,
)
await db.close()
