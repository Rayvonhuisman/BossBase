# Lokale testomgeving voor opzeggen, deactiveren en opschonen

Zonder Docker (Docker Desktop start op deze machine niet). Wat er draait:

| Onderdeel | Hoe | Echt of nagebootst |
| --- | --- | --- |
| Database | Postgres 17 met de **structuur** van productie: tabellen, constraints, functies, triggers, RLS, policies, rechten (`export.sql`, alleen lezen, geen rijen) plus de migraties van deze branch | Echt |
| REST en RPC | PostgREST 16 met een eigen JWT-geheim; rollen `anon`, `authenticated`, `service_role`, `authenticator` zoals bij Supabase | Echt |
| Edge Functions | De code uit `supabase/functions/` in Deno (`router.ts`); `std/http/server` wordt via een import map vervangen zodat meerdere functies in één proces draaien | Echte code |
| Stripe | Elke aanroep naar `api.stripe.com` wordt vastgelegd en krijgt een nep-antwoord | Nagebootst |
| Supabase Auth | `gateway.mjs`: wachtwoordlogin, refresh, `GET /user`, admin-delete. Volgt de broncode van GoTrue (`internal/api/token.go` IsBanned, `internal/tokens/service.go` IsBanned en "No Valid Session Found", `internal/api/auth.go` session_not_found) | **Nagebootst** |
| Storage | `gateway.mjs`: lijst, lezen, verwijderen, uitgevoerd met de rol en claims uit het JWT, zodat de echte policies op `storage.objects` gelden | **Nagebootst** (de HTTP-laag van storage-api niet) |
| Frontend | `vite build` van deze branch tegen de gateway, in Chrome (Playwright) | Echt |

## Opzetten en draaien

```bash
brew install postgresql@17 postgrest deno
export LOKAAL=~/bossbase-lokaal          # buiten git
supabase/tests/lokaal/opzetten.sh        # structuur exporteren en laden
supabase/tests/lokaal/reset.sh           # verse database + migraties, start PostgREST
supabase/tests/lokaal/start.sh           # gateway (54321) en functies (54330)

cd supabase/tests/lokaal
node test.mjs                            # opzeggen, rechten, toegang na deactivatie, opschonen
set -a; . "$LOKAAL/sleutels.env"; set +a
(cd ../../.. && VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_ANON_KEY=$ANON npx vite build --outDir "$LOKAAL/dist" --emptyOutDir)
PLAYWRIGHT=<pad naar playwright-core> DIST="$LOKAAL/dist" OUT="$LOKAAL" node ui_test.mjs
./gemengd.sh                             # gemengde versies voor de uitrolvolgorde
```

`reset.sh` zet de rolinstelling `pgrst.db_pre_request` niet terug; `gemengd.sh`
doet dat wel voor de database zonder migraties. Die instelling geldt voor het
hele cluster, niet per database.

## Wat dit niet bewijst

- De echte Supabase Auth-server: login, refresh en `/user` zijn nagebootst
  volgens de broncode, niet uitgevoerd.
- De HTTP-laag van storage-api (paden, signed URLs, caching). Alleen de
  policies op `storage.objects` worden echt geraakt.
- Supabase-specifieke onderdelen: Realtime, pg_net, pg_cron, vault (gestubd).
- De productieversie van GoTrue kan afwijken van de gelezen broncode.
