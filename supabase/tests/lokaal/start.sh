#!/bin/bash
# Start gateway (54321) en Edge Functions (54330). Postgres (55432) en PostgREST (55433) moeten al draaien (zie README.md).
set -e
HIER="$(cd "$(dirname "$0")" && pwd)"; REPO="$(cd "$HIER/../../.." && pwd)"; : "${LOKAAL:?zet LOKAAL}"
cd "$HIER"
[ -f "$LOKAAL/sleutels.env" ] || LOKAAL="$LOKAAL" node sleutels.mjs > "$LOKAAL/sleutels.env"
set -a; . "$LOKAAL/sleutels.env"; set +a
LOKAAL="$LOKAAL" node gateway.mjs > "$LOKAAL/gateway.log" 2>&1 &
SUPABASE_URL=http://localhost:54321 SUPABASE_ANON_KEY=$ANON SUPABASE_SERVICE_ROLE_KEY=$SERVICE \
STRIPE_SECRET_KEY=sk_test_nep CRON_SECRET=lokaal-cron SITE_URL=http://localhost:4174 APP_URL=http://localhost:4174 \
FUNCTIES=${FUNCTIES:-billing-cancel,billing-portal,opschonen,delete-team-member} FUNCTIEMAP="${FUNCTIEMAP:-$REPO/supabase/functions}" \
STRIPE_LOG="$LOKAAL/stripe_aanroepen.jsonl" \
deno run --quiet --allow-net --allow-env --allow-read --allow-write --import-map=import_map.json router.ts > "$LOKAAL/router.log" 2>&1 &
