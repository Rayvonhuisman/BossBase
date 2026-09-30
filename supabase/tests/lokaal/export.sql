-- Alleen-lezen export van de STRUCTUUR (geen rijen) voor een lokale testdatabase.
select json_build_object(
 'enums', (select json_agg(format('create type %I.%I as enum (%s);', n.nspname, t.typname,
            (select string_agg(quote_literal(e.enumlabel), ', ' order by e.enumsortorder) from pg_enum e where e.enumtypid = t.oid)))
           from pg_type t join pg_namespace n on n.oid = t.typnamespace
          where t.typtype = 'e' and n.nspname in ('public')),
 'sequences', (select json_agg(format('create sequence if not exists %I.%I;', schemaname, sequencename))
           from pg_sequences where schemaname = 'public'),
 'tabellen', (select json_agg(json_build_object('s', n.nspname, 't', c.relname, 'rls', c.relrowsecurity, 'force', c.relforcerowsecurity,
     'kol', (select json_agg(json_build_object('n', a.attname, 'ty', format_type(a.atttypid, a.atttypmod), 'nn', a.attnotnull,
               'def', pg_get_expr(d.adbin, d.adrelid), 'gen', a.attgenerated::text) order by a.attnum)
             from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
            where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped)) order by c.oid)
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r','p') and (n.nspname = 'public'
     or (n.nspname = 'auth' and c.relname in ('users','sessions','refresh_tokens','identities'))
     or (n.nspname = 'storage' and c.relname in ('buckets','objects')))),
 'constraints', (select json_agg(json_build_object('s', n.nspname, 't', c.relname, 'n', k.conname, 'type', k.contype, 'def', pg_get_constraintdef(k.oid)) order by k.oid)
   from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace
  where (n.nspname = 'public' or (n.nspname = 'auth' and c.relname in ('users','sessions','refresh_tokens','identities'))
     or (n.nspname = 'storage' and c.relname in ('buckets','objects')))
    and k.contype in ('p','u','f','c')),
 'unieke_indexen', (select json_agg(pg_get_indexdef(i.indexrelid))
   from pg_index i join pg_class c on c.oid = i.indrelid join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and i.indisunique and not i.indisprimary
    and not exists (select 1 from pg_constraint k where k.conindid = i.indexrelid)),
 'views', (select json_agg(format('create or replace view %I.%I %s as %s', n.nspname, c.relname,
             case when c.reloptions is not null then 'with (' || array_to_string(c.reloptions, ', ') || ')' else '' end,
             pg_get_viewdef(c.oid)) order by c.oid)
   from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relkind = 'v' and n.nspname = 'public'),
 'functies', (select json_agg(json_build_object('s', n.nspname, 'def', pg_get_functiondef(p.oid)) order by p.oid)
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where p.prokind in ('f','p') and (n.nspname = 'public' or (n.nspname = 'storage' and p.proname in ('foldername','filename','extension')))
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')),
 'triggers', (select json_agg(pg_get_triggerdef(t.oid)) from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
  where not t.tgisinternal and (n.nspname = 'public' or (n.nspname = 'storage' and c.relname = 'objects'))),
 'policies', (select json_agg(json_build_object('s', schemaname, 't', tablename, 'n', policyname, 'p', permissive, 'r', roles::text[], 'cmd', cmd, 'q', qual, 'w', with_check))
   from pg_policies where schemaname in ('public','storage')),
 'tabelrechten', (select json_agg(json_build_object('s', table_schema, 't', table_name, 'r', grantee, 'p', privilege_type))
   from information_schema.role_table_grants
  where table_schema in ('public','storage') and grantee in ('anon','authenticated','service_role')),
 'functierechten', (select json_agg(json_build_object('sig', p.oid::regprocedure::text, 'r', r.rolname))
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace, pg_roles r
  where n.nspname = 'public' and r.rolname in ('anon','authenticated','service_role')
    and has_function_privilege(r.rolname, p.oid, 'EXECUTE')
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e'))
) as r;
