-- Exporteert de structuur voor schema.json (alleen structuur, geen data):
--   supabase db query --linked -f supabase/tests/accountverwijdering/schema-export.sql
select json_build_object(
 'tabellen', (select json_agg(json_build_object('t', c.relname, 'kol', (
     select json_agg(json_build_object('n', a.attname, 'ty', format_type(a.atttypid, a.atttypmod), 'nn', a.attnotnull,
            'def', pg_get_expr(d.adbin, d.adrelid)) order by a.attnum)
       from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
      where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
     'pk', (select pg_get_constraintdef(k.oid) from pg_constraint k where k.conrelid=c.oid and k.contype='p')) order by c.oid)
   from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r'),
 'fks', (select json_agg(json_build_object('t', k.conrelid::regclass::text, 'n', k.conname, 'def', pg_get_constraintdef(k.oid)) order by k.oid)
   from pg_constraint k join pg_class c on c.oid=k.conrelid where c.relnamespace='public'::regnamespace and k.contype='f'),
 'uniek', (select json_agg(json_build_object('t', k.conrelid::regclass::text, 'n', k.conname, 'def', pg_get_constraintdef(k.oid)))
   from pg_constraint k join pg_class c on c.oid=k.conrelid where c.relnamespace='public'::regnamespace and k.contype='u'),
 'triggers', (select json_agg(pg_get_triggerdef(t.oid)) from pg_trigger t join pg_class c on c.oid=t.tgrelid
   where c.relnamespace='public'::regnamespace and not t.tgisinternal and (t.tgtype & 8)>0)
) r;
