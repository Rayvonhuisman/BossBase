// Structuur van productie (30-09-2026) staat in schema.json (export:
// schema-export.sql), triggers.sql en prod_rpc.sql. Geen data.
// Bouwt een geïsoleerde database (PGlite, in het geheugen) met de structuur van
// productie: tabellen, primaire sleutels, foreign keys in dezelfde volgorde
// (dus dezelfde volgorde van cascades) en de delete-triggers. Geen productiedata.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';

const BUILTIN = /^(uuid|text|integer|bigint|smallint|boolean|numeric(\(.*\))?|date|jsonb|json|real|double precision|timestamp with time zone|timestamp without time zone|time without time zone|interval|character varying(\(\d+\))?|bytea|inet|uuid\[\]|text\[\]|integer\[\]|date\[\]|jsonb\[\])$/;
const VEILIGE_DEFAULT = /^(gen_random_uuid\(\)|now\(\)|true|false|-?\d+(\.\d+)?|'[^']*'::[a-z ]+(\[\])?|CURRENT_DATE|'\{\}'::[a-z ]+\[\]|'\[\]'::jsonb|'\{\}'::jsonb)$/;

export async function bouw({ extraSql = [] } = {}) {
  const s = JSON.parse(fs.readFileSync(new URL('./schema.json', import.meta.url)));
  const db = new PGlite();
  const q = sql => db.exec(sql);

  await q(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema storage;
    create table auth.users (id uuid primary key, email text, banned_until timestamptz, is_super_admin boolean);
    create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade);
    create table auth.refresh_tokens (id bigserial primary key, session_id uuid references auth.sessions(id) on delete cascade, token text);
    create table storage.buckets (id text primary key, public boolean);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  `);

  for (const t of s.tabellen) {
    const kol = t.kol.map(k => {
      const ty = BUILTIN.test(k.ty) ? k.ty : (k.ty.endsWith('[]') ? 'text[]' : 'text');
      const def = k.def && VEILIGE_DEFAULT.test(k.def) && BUILTIN.test(k.ty) ? ` default ${k.def}` : '';
      return `"${k.n}" ${ty}${def}`;
    });
    if (t.pk) kol.push(t.pk);
    await q(`create table public."${t.t}" (${kol.join(', ')});`);
  }
  // Foreign keys in productievolgorde (oid) — die bepaalt de volgorde van de cascades.
  for (const f of s.fks) {
    if (/REFERENCES (storage|extensions|vault)\./.test(f.def)) continue;
    await q(`alter table ${f.t} add constraint "${f.n}" ${f.def};`);
  }

  // Delete-triggers en hun functies, letterlijk uit productie.
  const trig = fs.readFileSync(new URL('./triggers.sql', import.meta.url), 'utf8')
    .split(/^===== .*$/m).map(x => x.trim()).filter(Boolean);
  await q(`
    create function public.bb_project_status_bijwerken(p uuid) returns void language sql as $$ select $$;
    create function public.bb_deal_naar_fase(p uuid, s text) returns void language sql as $$ select $$;
    create function public.bb_has_feature(c uuid, f text) returns boolean language sql as $$ select true $$;
  `);
  for (const f of trig) await q(f + ';');
  for (const t of s.triggers) await q(t + ';');

  for (const x of extraSql) await q(x);
  return db;
}

/** Migratie zonder begin/commit/notify en zonder de afsluitende controle-select. */
export function migratie(pad) {
  return fs.readFileSync(pad, 'utf8')
    .replace(/^begin;$/m, '').replace(/^commit;$/m, '')
    .replace(/^notify .*$/m, '');
}
