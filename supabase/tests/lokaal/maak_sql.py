# Zet prod_structuur.json om in SQL voor een lege lokale Postgres die zich
# gedraagt als Supabase: rollen, auth.uid(), RLS, policies en rechten.
import json, os, sys

L = os.environ['LOKAAL']
s = json.load(open(os.path.join(L, 'prod_structuur.json')))
uit = []
w = uit.append

w("""
do $$ begin
  create role anon nologin noinherit;
  create role authenticated nologin noinherit;
  create role service_role nologin noinherit bypassrls;
  create role authenticator login noinherit password 'lokaal';
  create role supabase_admin nologin; create role supabase_auth_admin nologin;
  create role supabase_storage_admin nologin; create role dashboard_user nologin;
exception when duplicate_object then null; end $$;
grant anon, authenticated, service_role to authenticator;
create schema if not exists auth; create schema if not exists storage;
create schema if not exists extensions; create schema if not exists net; create schema if not exists vault;
create extension if not exists pgcrypto schema extensions;
create extension if not exists "uuid-ossp" schema extensions;
grant usage on schema public, auth, storage, extensions to anon, authenticated, service_role;
alter database postgres set search_path to public, extensions;
set search_path to public, extensions;

-- Zoals Supabase: de JWT-claims komen van PostgREST (request.jwt.claims).
create or replace function auth.uid() returns uuid language sql stable as $f$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $f$;
create or replace function auth.role() returns text language sql stable as $f$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'))::text $f$;
create or replace function auth.jwt() returns jsonb language sql stable as $f$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $f$;
create or replace function auth.email() returns text language sql stable as $f$ select auth.jwt() ->> 'email' $f$;
grant execute on all functions in schema auth to anon, authenticated, service_role;

-- Stubs voor extensies die lokaal niet bestaan (pg_net, vault): geen netwerkverkeer.
create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}',
  headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language sql as $f$ select 1::bigint $f$;
create table if not exists vault.decrypted_secrets (name text, decrypted_secret text);
set check_function_bodies = off;
""")

for e in s['enums'] or []: w(e)
for q in s['sequences'] or []: w(q)

# Functies vóór de tabellen (defaults verwijzen naar functies); tweede poging erna
functies = [f['def'] for f in s['functies']]
for f in functies: w(f + ';')

for t in s['tabellen']:
    kol = []
    for k in t['kol']:
        d = ''
        if k['gen'] == 's' and k['def']:
            d = f" generated always as ({k['def']}) stored"
        elif k['def']:
            d = f" default {k['def']}"
        ty = k['ty']
        if t['s'] in ('auth', 'storage') and (ty.startswith('auth.') or ty.startswith('storage.')):
            ty = 'text'
        if t['s'] in ('auth', 'storage'):
            d = d.replace('::storage.buckettype', '').replace('::auth.aal_level', '').replace('::auth.factor_type', '')
        if d and 'nextval(' in d and t['s'] == 'auth':
            w(f'create sequence if not exists auth.{t["t"]}_id_seq;')
        kol.append(f'"{k["n"]}" {ty}{d}{" not null" if k["nn"] else ""}')
    w(f'create table if not exists "{t["s"]}"."{t["t"]}" ({", ".join(kol)});')

for f in functies: w(f + ';')  # tweede poging (functies met tabeltypes)

for k in s['constraints']:
    if k['type'] != 'f':
        w(f'alter table "{k["s"]}"."{k["t"]}" add constraint "{k["n"]}" {k["def"]};')
for k in s['constraints']:
    if k['type'] == 'f' and 'oauth_clients' not in k['def']:
        w(f'alter table "{k["s"]}"."{k["t"]}" add constraint "{k["n"]}" {k["def"]};')
for i in s['unieke_indexen'] or []: w(i + ';')
for v in s['views'] or []: w(v + ';')
for t in s['triggers']:
    if ' ON storage.' not in t: w(t + ';')

for t in s['tabellen']:
    if t['rls']: w(f'alter table "{t["s"]}"."{t["t"]}" enable row level security;')
    if t['force']: w(f'alter table "{t["s"]}"."{t["t"]}" force row level security;')
for p in s['policies']:
    rollen = ', '.join('public' if r == 'public' else f'"{r}"' for r in p['r'])
    sql = f'create policy "{p["n"]}" on "{p["s"]}"."{p["t"]}" as {p["p"].lower()} for {p["cmd"].lower()} to {rollen}'
    if p['q']: sql += f' using ({p["q"]})'
    if p['w']: sql += f' with check ({p["w"]})'
    w(sql + ';')

w('revoke all on all tables in schema public from anon, authenticated, service_role;')
w('revoke all on all functions in schema public from public, anon, authenticated, service_role;')
for g in s['tabelrechten']:
    w(f'grant {g["p"]} on "{g["s"]}"."{g["t"]}" to "{g["r"]}";')
for g in s['functierechten']:
    w(f'grant execute on function {g["sig"]} to "{g["r"]}";')
w('grant usage on all sequences in schema public to anon, authenticated, service_role;')

open(os.path.join(L, 'schema.sql'), 'w').write('\n'.join(uit) + '\n')
print('regels', len(uit))
