#!/bin/bash
# Draait de rechtentests tegen de LOKALE database. Uitsluitend 127.0.0.1: host en
# poort staan vast, net als in db-bootstrap-local.sh. De test maakt bedrijven en
# gebruikers aan en draait alles terug; tegen productie hoort hij nooit te lopen.
#
#     npm run db:test:security            uitslag op het scherm
#     npm run db:test:security -- uit.txt uitslag ook naar een bestand
set -uo pipefail
HOST=127.0.0.1; PORT=54322
REPO="$(cd "$(dirname "$0")/.." && pwd)"; cd "$REPO"
export PGPASSWORD=postgres
UIT="$(mktemp)"
psql -h "$HOST" -p "$PORT" -U postgres -d postgres -X -q -A -F ' | ' -v ON_ERROR_STOP=1 \
  -f supabase/tests/ai_permission_prerequisites_test.sql > "$UIT" 2>&1
CODE=$?
# De rijen (nr | uitslag | naam | detail) en de telling; NOTICE-ruis blijft weg.
grep -E '^[0-9]+ \| (PASS|FAIL) \||^totaal \||^[0-9]+ \| [0-9]+ \| [0-9]+$' "$UIT" > "$UIT.rijen" || true
[ -n "${1:-}" ] && cp "$UIT.rijen" "$1"
grep -E '^[0-9]+ \| FAIL' "$UIT.rijen" | cut -c1-220
tail -2 "$UIT.rijen"
if [ $CODE -ne 0 ] && ! grep -q 'RECHTENTESTS GEFAALD' "$UIT"; then
  echo "De test kon niet draaien:"; grep -m3 -E 'ERROR|FATAL' "$UIT"
  exit 2
fi
exit $CODE
