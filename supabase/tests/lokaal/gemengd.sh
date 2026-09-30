#!/bin/bash
# Gemengde versies: (1) nieuwe functies op de database zónder de nieuwe migraties,
# (2) de functies van main (nu in productie) op de database mét de nieuwe migraties.
cd "$(dirname "$0")"; : "${LOKAAL:?zet LOKAAL}"; L="$LOKAAL"; PG=/opt/homebrew/opt/postgresql@17/bin; REPO="$(cd ../../.. && pwd)"
set -a; . "$L/sleutels.env"; set +a
start_router() {
  pkill -f "router.ts" ; sleep 1
  SUPABASE_URL=http://localhost:54321 SUPABASE_ANON_KEY=$ANON SUPABASE_SERVICE_ROLE_KEY=$SERVICE STRIPE_SECRET_KEY=sk_test_nep CRON_SECRET=lokaal-cron \
  SITE_URL=http://localhost:4173 APP_URL=http://localhost:4173 FUNCTIES=billing-cancel,billing-portal FUNCTIEMAP="$1" STRIPE_LOG="$L/stripe_aanroepen.jsonl" \
  deno run --quiet --allow-net --allow-env --allow-read --allow-write --import-map=import_map.json router.ts > "$L/router.log" 2>&1 &
  sleep 20
}
echo "== 1. nieuwe functies, database zonder nieuwe migraties"
pkill -f "postgrest $L"; sleep 1
$PG/dropdb -h "$L" -p 55432 -U postgres --force postgres && $PG/createdb -h "$L" -p 55432 -U postgres postgres && $PG/pg_restore -h "$L" -p 55432 -U postgres -d postgres "$L/basis.dump"
# Rolinstellingen gelden voor het hele cluster: de pre-request van de nieuwe migratie weghalen.
$PG/psql -h "$L" -p 55432 -U postgres -qc "alter role authenticator reset pgrst.db_pre_request"
(postgrest "$L/postgrest.conf" > "$L/postgrest.log" 2>&1 &); sleep 3
start_router "$REPO/supabase/functions"
MODUS=stripe LOKAAL="$L" node test.mjs 2>&1 | grep -E "PASS|FAIL|controles|mislukt"
echo "== 2. functies van main (productie), database met nieuwe migraties — VERWACHT: 3 mislukt (het huidige lek: beheerder zegt Stripe op en opent het portal)"
rm -rf "$L/oud" && mkdir -p "$L/oud" && git -C "$REPO" archive origin/main supabase/functions | tar -x -C "$L/oud"
./reset.sh > /dev/null
start_router "$L/oud/supabase/functions"
MODUS=stripe LOKAAL="$L" node test.mjs 2>&1 | grep -E "PASS|FAIL|controles|mislukt"
echo "== terug naar nieuwe functies"
start_router "$REPO/supabase/functions"
