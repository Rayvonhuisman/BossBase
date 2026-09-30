#!/bin/bash
# Verse database: productiestructuur (basis.dump) + migraties van de branch in volgorde.
: "${LOKAAL:?zet LOKAAL}"; L="$LOKAAL"; PG=/opt/homebrew/opt/postgresql@17/bin
M="$(cd "$(dirname "$0")/../../migrations" && pwd)"
pkill -f "postgrest $L" ; sleep 1
$PG/dropdb -h "$L" -p 55432 -U postgres --if-exists --force postgres && $PG/createdb -h "$L" -p 55432 -U postgres postgres
$PG/pg_restore -h "$L" -p 55432 -U postgres -d postgres "$L/basis.dump" 2>&1 | grep -c "error" | sed 's/^/pg_restore meldingen: /'
for m in 20260930120000_resettoken_afronding 20260930160000_accountverwijdering_correcties 20260930170000_toegang_na_deactivatie; do
  $PG/psql -h "$L" -p 55432 -U postgres -v ON_ERROR_STOP=1 -q -f "$M/$m.sql" > /dev/null 2>"$L/mig_$m.err" && echo "migratie $m: ok" || { echo "migratie $m: FOUT"; cat "$L/mig_$m.err"; }
done
(postgrest "$L/postgrest.conf" > "$L/postgrest.log" 2>&1 &) ; sleep 3; tail -1 "$L/postgrest.log"
