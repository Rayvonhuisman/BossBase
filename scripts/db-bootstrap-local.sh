#!/bin/bash
# Bouwt de LOKALE testdatabase vanaf nul op. Zie docs/DATABASE_BASELINE_STRATEGY.md §9.
#
#     npm run db:bootstrap:local
#
#   lokale Supabase-systeemdatabase (auth, storage, extensions staan er al)
#     → public leegmaken
#     → schema-baseline            supabase/baseline/live_public_schema_20260909.sql
#     → verplichte configuratieseed  scripts/db-seed-config.mjs
#     → migraties ná de cutoff     alles met een versie > 20260907210753, op volgorde
#     → configuratieseed opnieuw   de matrix van nu, na migraties die er rijen in zetten
#
# Dit script WIST het schema public. Het draait daarom uitsluitend tegen
# 127.0.0.1 of localhost; host en poort staan hieronder vast en zijn niet via
# een argument of omgevingsvariabele te overschrijven. Een typefout kan zo nooit
# betekenen dat productie wordt geraakt.
#
# Een migratie die omvalt stopt de opbouw, met de naam erbij. De enige
# uitzondering zijn migraties in LOKAAL_OVERSLAAN: die doen iets dat lokaal niet
# kan of niet mag (zie de reden per regel) en raken het rechtenmodel niet.
set -euo pipefail

HOST=127.0.0.1
PORT=54322
CUTOFF=20260907210753
DB_URL="postgresql://postgres:postgres@${HOST}:${PORT}/postgres"

case "$HOST" in 127.0.0.1|localhost) ;; *) echo "GEWEIGERD: host is niet lokaal."; exit 2 ;; esac

REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"
BASELINE=supabase/baseline/live_public_schema_20260909.sql
LOG="${TMPDIR:-/tmp}/bb-bootstrap-local"
mkdir -p "$LOG"

export PGPASSWORD=postgres
PSQL=(psql -h "$HOST" -p "$PORT" -U postgres -d postgres -X -q -v ON_ERROR_STOP=1)

# De server moet zelf ook zeggen dat hij lokaal is: een poort-forward naar een
# andere machine zou de hostcontrole hierboven anders omzeilen. De lokale stack
# kent geen migratieledger van de CLI en geen enkel bedrijf met een abonnement
# bij Stripe; staat er wel een, dan is dit niet de wegwerpdatabase.
"${PSQL[@]}" -A -t -c "select 1" >/dev/null || { echo "Lokale database op ${HOST}:${PORT} niet bereikbaar. Gestopt."; exit 2; }
ECHT=$("${PSQL[@]}" -A -t -c "select case when to_regclass('public.companies') is null then 0 else (select count(*) from public.companies where stripe_customer_id is not null) end" 2>/dev/null || echo 0)
if [ "${ECHT:-0}" != "0" ]; then
  echo "GEWEIGERD: deze database bevat bedrijven met een Stripe-klant. Dit is geen wegwerpdatabase."
  exit 2
fi

echo "1. public leegmaken"
"${PSQL[@]}" <<'SQL'
-- Cron-jobs van een vorige opbouw horen bij het oude schema.
select cron.unschedule(jobid) from cron.job;
drop schema if exists public cascade;
create schema public;
alter schema public owner to pg_database_owner;
grant usage on schema public to anon, authenticated, service_role;

SQL

echo "2. baseline laden"
"${PSQL[@]}" -f "$BASELINE" > "$LOG/baseline.log" 2>&1 || { echo "   baseline FOUT:"; tail -5 "$LOG/baseline.log"; exit 1; }

echo "2a. PUBLIC-uitvoerrecht van de baselinefuncties afhalen"
"${PSQL[@]}" <<'SQL'
-- Postgres geeft elke nieuwe functie EXECUTE aan PUBLIC. De baseline bevat per
-- functie wel de GRANTs voor anon, authenticated en service_role, maar geen
-- REVOKE ... FROM PUBLIC. Zonder deze stap is lokaal ELKE baselinefunctie voor
-- iedereen uitvoerbaar, ook de 25 die op productie alleen voor service_role
-- zijn (bb_factuurtotalen, bb_boss_claim_bericht, ...). Gevonden op 1-10-2026
-- door de uitvoerrechten per functie met productie te vergelijken: 72
-- verschillen zonder deze stap, 0 ermee. De expliciete GRANTs uit de baseline
-- blijven staan; alleen wat via PUBLIC meekwam verdwijnt.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke all on function %s from public', f.sig);
  end loop;
end $$;
SQL

echo "2b. standaardrechten van Supabase terugzetten"
"${PSQL[@]}" <<'SQL'
-- De standaardrechten van Supabase hangen aan het schema en zijn met de DROP
-- in stap 1 meeverdwenen. Ze komen pas NA de baseline terug: de baseline zet
-- per tabel en functie de exacte rechten van het peilmoment, en standaardrechten
-- die dan al gelden zouden daar bovenop komen (de baseline geeft, hij neemt
-- niet af). Zonder deze regels krijgt een tabel of functie uit een
-- migratie lokaal GEEN rechten voor anon/authenticated, terwijl productie ze wel
-- geeft: dan test je een strenger systeem dan er live staat (en mis je precies
-- het soort lek uit CLAUDE.md, "een functie aanmaken: altijd zelf de rechten
-- zetten"). Dit is de stand van productie, uitgelezen uit pg_default_acl op
-- 1-10-2026: alles behalve TRUNCATE voor anon en authenticated (sinds
-- 20260902140000), alles voor service_role.
alter default privileges for role postgres in schema public
  grant all on tables to postgres, service_role;
alter default privileges for role postgres in schema public
  grant select, insert, update, delete, references, trigger, maintain on tables to anon, authenticated;
alter default privileges for role postgres in schema public
  grant all on sequences to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to postgres, anon, authenticated, service_role;
SQL

echo "3. configuratieseed"
node scripts/db-seed-config.mjs --db-url "$DB_URL" > "$LOG/seed1.log" 2>&1 || { echo "   seed FOUT:"; tail -8 "$LOG/seed1.log"; exit 1; }

# Migraties die lokaal bewust niet draaien. Formaat: versie — reden.
LOKAAL_OVERSLAAN="${LOKAAL_OVERSLAAN:-}"

echo "4. migraties na de cutoff"
n=0; overgeslagen=0
for f in $(ls supabase/migrations/*.sql | sort); do
  naam="$(basename "$f" .sql)"
  versie="${naam%%_*}"
  case "$versie" in ''|*[!0-9]*) continue ;; esac          # _TEMPLATE en dergelijke
  [ "$versie" -gt "$CUTOFF" ] || continue
  if echo " $LOKAAL_OVERSLAAN " | grep -q " $versie "; then
    echo "   overgeslagen: $naam"; overgeslagen=$((overgeslagen+1)); continue
  fi
  if ! "${PSQL[@]}" -f "$f" > "$LOG/$naam.log" 2>&1; then
    echo "   FOUT in $naam:"
    grep -m3 -E 'ERROR|FATAL' "$LOG/$naam.log" || tail -3 "$LOG/$naam.log"
    exit 1
  fi
  n=$((n+1))
done
echo "   $n migraties toegepast, $overgeslagen overgeslagen"

echo "5. configuratieseed opnieuw (de matrix van nu)"
node scripts/db-seed-config.mjs --db-url "$DB_URL" > "$LOG/seed2.log" 2>&1 || { echo "   seed FOUT:"; tail -8 "$LOG/seed2.log"; exit 1; }
tail -12 "$LOG/seed2.log" | grep -E 'rijen|gedeelde_werkruimte' || true

"${PSQL[@]}" -c "notify pgrst, 'reload schema'"
echo "klaar. Logs: $LOG"
