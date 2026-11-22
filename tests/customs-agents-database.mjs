// Disposable local PostgreSQL only.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

if (!process.env.PEDRAM_PGLITE_PATH) throw new Error('PEDRAM_PGLITE_PATH is required')
const { PGlite } = await import(pathToFileURL(process.env.PEDRAM_PGLITE_PATH).href)
const db = new PGlite()
try {
  await db.exec(`
    create schema storage;
    create role anon;
    create role authenticated;
    create function public.is_president_user() returns boolean language sql stable
      as $$ select current_setting('test.president', true) = 'yes' $$;
    create function public.set_updated_at() returns trigger language plpgsql
      as $$ begin new.updated_at=now(); return new; end $$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(bucket_id text,name text,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated, anon;
    grant select,insert,update,delete on storage.objects to authenticated;
    create policy broad_storage on storage.objects for all to authenticated using(true) with check(true);
    grant select on storage.objects to anon;
    create policy broad_anonymous_read on storage.objects for select to anon using(true);
  `)
  await db.exec(await readFile(new URL('../supabase/migrations/202611190001_customs_agents.sql', import.meta.url), 'utf8'))
  await db.exec(await readFile(new URL('../supabase/migrations/202611220001_customs_agent_archive.sql', import.meta.url), 'utf8'))
  assert.equal((await db.query("select public from storage.buckets where id='customs-agent-files'")).rows[0].public, false)

  const id = crypto.randomUUID()
  const form = { name:' Ahmad ', father_name:'Karim', phone:'0700000000', province:'Kabul', district:'Central', village:'Sample' }
  const save = async (values, timestamp = null) =>
    (await db.query('select public.save_customs_agent($1,$2,$3) as agent', [id, JSON.stringify(values), timestamp])).rows[0].agent
  await db.exec("set role authenticated; select set_config('test.president','yes',false)")
  const created = await save(form)
  assert.equal(created.name, 'Ahmad')
  assert.deepEqual(await save(form), created)
  assert.equal((await db.query('select id from public.customs_agents')).rows.length, 1)
  await assert.rejects(save({ ...form, name:'   ' }), /REQUIRED_FIELDS/)
  const edited = await save({ ...form, name:'Updated' }, created.updated_at)
  assert.equal(edited.name, 'Updated')
  await assert.rejects(save({ ...form, name:'Another change' }, created.updated_at), /STALE_RECORD/)

  const reserve = async (fileId, slot, name, mime, size = 100) =>
    (await db.query('select public.reserve_customs_agent_file($1,$2,$3,$4,$5,$6) as path', [fileId,id,slot,name,mime,size])).rows[0].path
  const complete = fileId => db.query('select public.complete_customs_agent_file($1)', [fileId])
  for (const slot of ['identity', 'photo', 'other1', 'other2']) {
    const fileId = crypto.randomUUID()
    const [name, mime] = slot === 'photo' ? ['agent.webp','image/webp'] : ['sample.pdf','application/pdf']
    const path = await reserve(fileId, slot, name, mime)
    assert.equal(await reserve(fileId, slot, name, mime), path)
    await assert.rejects(complete(fileId), /INVALID_FILE/)
    await db.query("insert into storage.objects(bucket_id,name) values('customs-agent-files',$1) returning name", [path])
    await complete(fileId)
    await complete(fileId)
  }
  assert.equal((await db.query("select id from public.customs_agent_files where state='ready'")).rows.length, 4)
  await assert.rejects(reserve(crypto.randomUUID(),'photo','file.pdf','application/pdf'), /INVALID_FILE/)
  await assert.rejects(reserve(crypto.randomUUID(),'other1','file.pdf','application/pdf',5242881), /INVALID_FILE/)
  await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('customs-agent-files','unreserved')"), /row-level security/)
  const archive = (archived, expected) => db.query('select public.set_customs_agent_archived($1,$2,$3)', [id,archived,expected])
  await assert.rejects(archive(true,created.updated_at), /STALE_RECORD/)
  await archive(true,edited.updated_at)
  await archive(true,edited.updated_at)
  const archived = (await db.query('select archived_at, updated_at from public.customs_agents where id=$1',[id])).rows[0]
  assert.ok(archived.archived_at)
  assert.equal((await db.query('select id from public.customs_agent_files')).rows.length,4)
  await archive(false,archived.updated_at)
  assert.equal((await db.query('select archived_at from public.customs_agents where id=$1',[id])).rows[0].archived_at,null)
  await db.exec("select set_config('test.president','no',false)")
  await assert.rejects(archive(true,edited.updated_at), /ACCESS_DENIED/)
  for (const relation of ['public.customs_agents','public.customs_agent_files','storage.objects']) {
    assert.equal((await db.query(`select * from ${relation}`)).rows.length, 0)
  }
  await assert.rejects(save(form), /ACCESS_DENIED/)
  await assert.rejects(reserve(crypto.randomUUID(),'identity','file.pdf','application/pdf'), /ACCESS_DENIED/)
  await assert.rejects(complete(crypto.randomUUID()), /ACCESS_DENIED/)
  await db.exec('reset role; set role anon')
  assert.equal((await db.query('select * from storage.objects')).rows.length, 0)
  await assert.rejects(save(form), /permission denied/)
  console.log('Customs agent saves, retries, four private document slots and President-only access passed.')
} finally {
  await db.close()
}
