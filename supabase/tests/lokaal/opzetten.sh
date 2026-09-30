#!/bin/bash
# Zet een lokale testomgeving op zonder Docker: Postgres met de STRUCTUUR van
# productie (alleen-lezen export, geen rijen), PostgREST en een eigen JWT-geheim.
#   brew install postgresql@17 postgrest deno
#   LOKAAL=/pad/buiten/git supabase/tests/lokaal/opzetten.sh
set -e
: "${LOKAAL:?zet LOKAAL op een map buiten git}"
HIER="$(cd "$(dirname "$0")" && pwd)"; REPO="$(cd "$HIER/../../.." && pwd)"
PG=/opt/homebrew/opt/postgresql@17/bin
mkdir -p "$LOKAAL"
echo "1. structuur van productie exporteren (alleen lezen)"
( cd "$REPO" && supabase db query --linked -f "$HIER/export.sql" ) 2>/dev/null > "$LOKAAL/raw.json"
python3 -c "
import json,sys; d=json.load(open('$LOKAAL/raw.json')); r=d['rows'][0]['r']
json.dump(json.loads(r) if isinstance(r,str) else r, open('$LOKAAL/prod_structuur.json','w'))"
echo "1b. configuratie van de abonnementsmatrix (geen klantgegevens)"
( cd "$REPO" && supabase db query --linked -f "$HIER/export_config.sql" ) 2>/dev/null | python3 -c "
import json,sys; d=json.load(sys.stdin)['rows'][0]['r']
json.dump(json.loads(d) if isinstance(d,str) else d, open('$LOKAAL/config.json','w'))"
echo "2. Postgres op poort 55432"
[ -d "$LOKAAL/pgdata" ] || $PG/initdb -D "$LOKAAL/pgdata" -U postgres --auth=trust -E UTF8 --locale=C >/dev/null
$PG/pg_ctl -D "$LOKAAL/pgdata" -o "-p 55432 -k $LOKAAL" -l "$LOKAAL/pg.log" status >/dev/null || $PG/pg_ctl -D "$LOKAAL/pgdata" -o "-p 55432 -k $LOKAAL" -l "$LOKAAL/pg.log" start >/dev/null
sleep 2
LOKAAL="$LOKAAL" python3 "$HIER/maak_sql.py"
$PG/psql -h "$LOKAAL" -p 55432 -U postgres -q -f "$LOKAAL/schema.sql" > "$LOKAAL/load.log" 2>&1 || true
echo "   laadmeldingen (verwacht: alleen Supabase-interne storage-tabellen):"
grep ERROR "$LOKAAL/load.log" | sed 's/psql:[^:]*:[0-9]*: //' | sort | uniq -c | sort -rn | head
$PG/pg_dump -h "$LOKAAL" -p 55432 -U postgres -Fc -f "$LOKAAL/basis.dump" postgres
echo "3. PostgREST-configuratie en sleutels"
[ -f "$LOKAAL/jwt_secret" ] || openssl rand -hex 32 > "$LOKAAL/jwt_secret"
cat > "$LOKAAL/postgrest.conf" <<CONF
db-uri = "postgres://authenticator:lokaal@localhost:55432/postgres?host=$LOKAAL"
db-schemas = "public, storage"
db-anon-role = "anon"
jwt-secret = "$(cat "$LOKAAL/jwt_secret")"
server-port = 55433
db-channel-enabled = true
CONF
( cd "$HIER" && LOKAAL="$LOKAAL" node sleutels.mjs > "$LOKAAL/sleutels.env" )
echo "klaar. Verder: reset.sh (migraties), start.sh (gateway + functies), dan de tests (README.md)."
