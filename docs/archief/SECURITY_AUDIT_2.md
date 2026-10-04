# BossBase — Penetratietest (Red Team) — Ronde 2

**Datum:** 2026-06-20
**Aard:** Actieve penetratietest met echte exploit-queries tegen de live database (project `mawzqpnsluljxpbarhng`). Alle schrijf-exploits zijn in een transactie uitgevoerd en **teruggedraaid (ROLLBACK)** — er is geen productiedata gewijzigd.
**Methode:** RLS getest door de echte `authenticated`/`anon` rol te simuleren met de JWT-claim (`SET LOCAL ROLE` + `request.jwt.claims`), zodat policies exact zo evalueren als voor een echte gebruiker.

**Testsubjecten (echte accounts):**
- **Company A** — "BossBase Admin" (`8131d2e8-4190-4b5e-8ff2-c0c5aac68aca`), bevat de super-admin.
- **Company B** — "Dakdekker Neliss" (`d32740ee-3980-4742-8d45-f99eb3ae7101`).
  - Aanvaller-medewerker: `90d4992e-77d3-471e-8c9e-f2997e26143f` (role `medewerker`, **0 permissies**).
  - Aanvaller-admin: `a14df665-b10a-4ff9-886c-ec71aa147906` (role `admin`).

Legenda: 🔴 kritiek · 🟠 hoog · 🟡 middel · 🔵 laag · ✅ getest & veilig

---

## Samenvatting

| # | Ernst | Bevinding | Fix-status |
|---|---|---|---|
| 1 | 🔴 **KRITIEK** | **Cross-tenant overname** via `UPDATE profiles SET company_id`. De privilege-trigger beschermt `is_super_admin`/`role` maar **niet `company_id`**. | ✅ **GEFIXT & GETEST** |
| 2 | 🟠 HOOG | **Rechtensysteem is frontend-only.** RLS dwingt `user_permissions` niet af. | ✅ **GEFIXT & GETEST** |
| 3 | 🟡 Middel | **`signatures` bucket publiek** — 14 handtekeningen (PII) leesbaar via publieke URL. | ✅ **GEFIXT** (bucket privé + signed URL) |
| 4 | 🟡 Middel | **Publieke buckets lekken `company_id` in het pad** → munitie voor aanval #1. | 🟡 **GEMITIGEERD** (door fix 1); volledige path-anonimisering uitgesteld |
| 5 | 🔵 Laag | `handle_new_user` / `get_invite_company_for_current_user` zonder `SET search_path`. | ✅ **GEFIXT** |
| 6 | 🔵 Laag | 2 `kosten-bijlagen`-bestanden in bucket-root. | 🟡 **DEELS** (al onbereikbaar voor clients; fysiek opruimen via Storage API) |

> **Fixes doorgevoerd op 2026-06-20** — migratie `20260620030000_security_audit2_fixes.sql` (toegepast op remote, `db push` schoon) + edge function `sign-offerte` (gedeployed). Alle fixes hieronder per bevinding gedetailleerd met de uitgevoerde testresultaten.

**De fundering is sterk** (zie "Getest & veilig" onderaan): geen anonieme toegang, geen cross-tenant tabel-reads, `is_super_admin`/`role` niet te vervalsen, geen tabellen zonder RLS, geen security-definer views, geen realtime-lek, notificatie-spoofing en self-grant van rechten geblokkeerd.

---

## ✅ FIX-STATUS & VERIFICATIE (update 2026-06-20)

**Fix 1 (🔴) — `company_id`-bescherming.** Trigger `protect_profile_privileges` uitgebreid: blokkeert nu ook wijziging van `company_id` door `authenticated`/`anon`. SECURITY DEFINER (`provision_account`) en service-role (`accept-invite`) draaien onder een andere DB-rol en mogen company_id wél koppelen.
Geverifieerd (gesimuleerde rollen, alles teruggedraaid):
- Admin company B → `UPDATE profiles SET company_id='<company A>'` → company_id **bleef company B**, klanten zichtbaar **3** (eigen bedrijf), niet de 9 van company A. **Aanval geblokkeerd.**
- `provision_account(...)` onder authenticated → `status:existing`, **geen fout** → registratie/invite blijven werken.

**Fix 2 (🟠) — rechten server-side.** Twee SECURITY DEFINER helpers (`bb_has_permission`, `bb_is_admin_or_permission`) + herschreven policies op `offertes` (recht `offertes`), `facturen` (`facturen`), `job_costs` (`kosten`), `customers` UPDATE (`klanten_bewerken`) en DELETE (admin OF `klanten_verwijderen`). `customers` SELECT/INSERT blijven breed (medewerkers hebben klantnamen nodig).
Geverifieerd:
- **Admin company A**: facturen 9, offertes 20, kosten 5, klanten 9 → ziet alles. ✅
- **Medewerker zonder rechten**: kosten **0** (was 3), offertes **0**, facturen **0**, klanten **3** (lezen blijft), klant-UPDATE **0 rijen** (geblokkeerd). ✅
- **Medewerker MET recht** (tijdelijk `kosten`+`klanten_bewerken`): kosten **3**, klant-UPDATE **3 rijen**, `bb_has_permission('kosten')=true`. ✅

**Fix 3 (🟡) — `signatures` privé.** Bucket op `public=false`. `sign-offerte` (service-role) levert nu een **signed URL** (10 jaar geldig) i.p.v. een publieke URL en slaat die op in `offertes.signature_url`. Oude offertes met een (nu kapotte) publieke URL degraderen gracieus: `imgToBase64()` vangt de fout en valt terug op het tekst-handtekeningblok — geen crash.

**Fix 4 (🟡) — tenant-UUID-lek.** **Gemitigeerd door fix 1**: het `company_id` is geen "munitie" meer omdat tenant-wissel nu onmogelijk is; een kaal UUID is op zichzelf niet gevoelig. Volledige path-anonimisering (privé buckets + signed URLs, óf een random `storage_key`) is **bewust uitgesteld**: `bedrijf-logos` moet publiek blijven voor de ongeauthenticeerde offerte-ondertekenpagina, en logo's/avatars worden via opgeslagen publieke URL's op tientallen plekken getoond — privé maken zou de weergave breken en bestaande bestanden moeten gemigreerd worden. Aanbevolen als aparte, geïsoleerde hardening.

**Fix 5 (🔵) — `search_path`.** `ALTER FUNCTION` toegepast op `handle_new_user` en `get_invite_company_for_current_user` (`search_path = public, pg_temp`).

**Fix 6 (🔵) — wees-bestanden.** Directe `DELETE` op `storage.objects` is geblokkeerd door `storage.protect_delete()`. De 2 root-bestanden zijn al onbereikbaar voor clients (company-scoped policy ⇒ alleen service-role); fysiek verwijderen hoort via de Storage API te gebeuren (kleine opruimactie, geen security-risico).

---

## 🔴 1. KRITIEK — Cross-tenant overname via `company_id`-zelfwijziging

**Locatie:** `profiles` RLS UPDATE-policy + trigger `protect_profile_privileges` (migratie `20260620010000_critical_security_fixes.sql`).

**Oorzaak:** De UPDATE-policy op `profiles` is `USING (id = auth.uid()) WITH CHECK (id = auth.uid())` — een gebruiker mag zijn eigen rij bijwerken. De trigger `protect_profile_privileges` reset alleen `is_super_admin` en `role` naar de oude waarde, **maar laat `company_id` ongemoeid**. Daardoor kan een gebruiker zichzelf in een willekeurig ander bedrijf plaatsen.

**Proof of Concept (uitgevoerd, teruggedraaid):**
```sql
-- Als medewerker van company B (90d4992e..., 0 rechten):
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"90d4992e-...","role":"authenticated"}', true);

UPDATE profiles SET company_id = '8131d2e8-...'  -- company A
  WHERE id = '90d4992e-...';
-- → slaagt. current_user_company_id() geeft nu company A.
SELECT count(*) FROM customers;  -- 9   (was 0 zichtbaar vóór de switch)
SELECT count(*) FROM deals;      -- 5
SELECT count(*) FROM facturen;   -- 9
```
**Resultaten (echt gemeten):**
- Medewerker → na switch zichtbaar in company A: **9 klanten, 5 deals, 9 facturen** (daarvoor 0 vreemde rijen zichtbaar).
- **Admin** van company B die alleen `company_id` wijzigt (role blijft `admin`) → wordt **admin van company A** (`role_in_company_A = admin`).
- Na de switch kon de aanvaller ook **schrijven**: `INSERT INTO customers (company_id, name) VALUES ('8131d2e8-...','PWNED')` → **1 rij toegevoegd** in company A.
- De trigger blokkeerde wél `is_super_admin`/`role` (gecombineerde poging gaf `is_super_admin=false, role=medewerker, company_id=company A`).

**Praktische exploiteerbaarheid:** De aanval vereist het **UUID van het doelbedrijf**. Dat is niet via tabellen te enumereren (companies/profiles tonen alleen het eigen bedrijf), **maar het lekt via publieke storage-URL's**: een bedrijfslogo staat op
`…/storage/v1/object/public/bedrijf-logos/8131d2e8-…/logo.png` — het `company_id` staat letterlijk in de URL. Logo's verschijnen op offertes, facturen en de publieke ondertekenpagina. Een aanvaller (elke geregistreerde gebruiker) oogst zo het doel-UUID en voert de switch uit via de REST-API (`PATCH /rest/v1/profiles`).

**Impact:** Volledige doorbraak van multi-tenant-isolatie — lezen, wijzigen én verwijderen van alle data van elk ander bedrijf; een admin wordt admin van het doelbedrijf.

**Fix:** Breid de trigger uit zodat ook `company_id` (en `id`) niet door `authenticated`/`anon` gewijzigd kan worden:
```sql
CREATE OR REPLACE FUNCTION public.protect_profile_privileges()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user IN ('authenticated','anon') THEN
    IF NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin
       OR NEW.role IS DISTINCT FROM OLD.role
       OR NEW.company_id IS DISTINCT FROM OLD.company_id THEN
      -- niet-geautoriseerde wijziging van privileged kolommen → terugzetten
      NEW.is_super_admin := OLD.is_super_admin;
      NEW.role          := OLD.role;
      NEW.company_id    := OLD.company_id;
    END IF;
  END IF;
  RETURN NEW;
END;$$;
```
(Bedrijfswissel/koppeling hoort uitsluitend via `provision_account`/`accept-invite` — SECURITY DEFINER / service-role — te lopen, die draaien als een andere DB-rol en blijven dus toegestaan.)

---

## 🟠 2. HOOG — Rechtensysteem (`user_permissions`) niet server-side afgedwongen

**Locatie:** RLS SELECT/INSERT/UPDATE/DELETE-policies op `customers`, `offertes`, `facturen`, `job_costs` (e.a.) vs. `src/hooks/usePermissions.js` (`can()`).

**Oorzaak:** De granulaire rechten (`offertes`, `facturen`, `financieel`, `kosten`, `klanten_bewerken`, `klanten_verwijderen`) worden **alleen in de frontend** gecontroleerd via `can()`. De RLS-policies filteren uitsluitend op `company_id`, zonder enige `role`- of `user_permissions`-check. Een medewerker die de UI-knoppen niet ziet, kan de data gewoon via de Supabase REST-API/JS-client opvragen.

**Proof of Concept (uitgevoerd):**
```sql
-- Medewerker 90d4992e... heeft 0 rijen in user_permissions
-- (UI verbergt offertes/facturen/financieel/kosten).
SET ROLE authenticated; SELECT set_config('request.jwt.claims','{"sub":"90d4992e-...","role":"authenticated"}', true);
SELECT count(*) FROM job_costs;   -- 3  (kosten zichtbaar zonder 'kosten'-recht)
```
- Policy-bewijs: `customers`, `offertes`, `facturen`, `job_costs` hebben SELECT-`USING (company_id = current_company_id())` — **geen rol/recht-check**.
- `customers` INSERT/UPDATE/**DELETE** checken óók alleen `company_id`. Een medewerker-DELETE op `customers` werd door RLS **toegelaten** (faalde pas op een FK-constraint `calendar_events_customer_id_fkey`, code `23503` — géén RLS-blok `42501`). Klanten zónder gekoppelde agenda-items zijn dus verwijderbaar door elke medewerker, ongeacht `klanten_verwijderen`.

**Wat WEL goed is (defense-in-depth aanwezig):** `werkbonnen`, `urenregistratie` en `time_entries` hebben rij-scoping — een medewerker ziet alleen zijn eigen werkbonnen/uren (`role IN (admin,planner) OR assigned_to/user_id/profile_id = auth.uid()`). Dat patroon ontbreekt bij de financiële/klant-tabellen.

**Impact:** Vertrouwelijkheid (medewerker leest offertes/facturen/kosten/omzet) en integriteit (medewerker bewerkt/verwijdert klanten) van het rechtensysteem worden volledig omzeild via directe API-calls.

**Fix (kies één):**
- **Voorkeur:** Voeg de rechten-check toe aan de RLS-policies van de gevoelige tabellen, bijv. SELECT op `offertes`:
  ```sql
  USING (
    company_id = current_company_id()
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
      OR EXISTS (SELECT 1 FROM user_permissions up
                 WHERE up.user_id = auth.uid() AND up.permission = 'offertes' AND up.granted)
    )
  )
  ```
  Idem voor `facturen` (`facturen`), `job_costs` (`kosten`), en een DELETE-policy op `customers` die `admin`/`klanten_verwijderen` vereist (en UPDATE → `klanten_bewerken`).
- Of: routeer gevoelige reads/writes via edge functions met service-role die `user_permissions` valideren.
- Minimaal: maak duidelijk dat het rechtensysteem alleen cosmetisch is en verwijder de suggestie van data-afscherming.

---

## 🟡 3. Middel — `signatures` bucket publiek (PII)

**Locatie:** `storage.buckets` (`signatures`, `public=true`) + `src/utils/generatePdf.js:452` + `supabase/functions/sign-offerte`.

**Bewijs:** 14 objecten in de bucket, **allemaal in de root** (`{sign_token}.png`, geen company-map). Bucket is publiek → elke handtekening is opvraagbaar via
`…/storage/v1/object/public/signatures/{sign_token}.png`. Handgeschreven handtekeningen zijn persoonsgegevens.

**Mitigatie aanwezig:** de bestandsnaam is een 122-bit UUID (`sign_token`), dus niet te enumereren. Maar de URL wordt opgeslagen in `offertes.signature_url` (leesbaar voor het bedrijf) en in PDF's.

**Impact:** Lek van persoonsgegevens (handtekeningen) bij URL-lekkage; geen tenant-scope.

**Fix:** Bucket op privé + lezen via signed URLs. Let op: de handtekening wordt nu in een **ongeauthenticeerde** context gelezen (publieke ondertekenpagina genereert de PDF). Een veilige fix vereist dat `sign-offerte` (service-role) een signed URL of data-URL teruggeeft i.p.v. een publieke URL — een gecoördineerde aanpassing van de publieke onderteken-/PDF-flow.

---

## 🟡 4. Middel — Publieke buckets lekken `company_id` + wereldwijd leesbaar

**Locatie:** buckets `bedrijf-logos`, `avatars`, `werkbon-fotos` (`public=true`, SELECT-policy `bucket_id=...` zonder company-scope).

**Bewijs:** Padstructuur is `{company_id}/...` en de bucket is publiek. Voorbeeld (echt): `bedrijf-logos/8131d2e8-4190-4b5e-8ff2-c0c5aac68aca/logo.png` — het tenant-UUID staat in de publieke URL.

**Impact:**
- **Levert direct het doel-UUID voor aanval #1** (logo's staan op publieke offerte-/factuur-/ondertekenpagina's).
- `werkbon-fotos` is wereldwijd leesbaar via URL (kan gevoelige locatie-/klantfoto's bevatten; bucket is nu leeg maar de policy staat het toe). De ronde-1-fix scopte alleen schrijven/verwijderen, niet lezen.

**Fix:** Maak deze buckets privé en lever assets via signed URLs, **of** gebruik een niet-raadbare random map-id i.p.v. `company_id` in het pad (zodat het tenant-UUID niet lekt). Voeg company-scope toe aan de SELECT-policy waar privé haalbaar is.

---

## 🔵 5. Laag — SECURITY DEFINER functies zonder `search_path`

**Locatie:** `public.handle_new_user()` en `public.get_invite_company_for_current_user()` (`proconfig = null`).

**Impact:** Best-practice-overtreding voor SECURITY DEFINER. Op Supabase kunnen gewone rollen geen objecten in `public` aanmaken, dus de praktische exploiteerbaarheid (search-path hijack) is laag. `handle_new_user` is bovendien een trigger.

**Fix:**
```sql
ALTER FUNCTION public.handle_new_user() SET search_path = public, pg_temp;
ALTER FUNCTION public.get_invite_company_for_current_user() SET search_path = public, pg_temp;
```

---

## 🔵 6. Laag — Wees-bestanden in `kosten-bijlagen`-root

**Bewijs:** 5 objecten in `kosten-bijlagen`; 3 in map `d32740ee/` (company B), **2 in de root** (geen company-map). Door de company-scoped policy zijn de 2 root-bestanden voor geen enkele client zichtbaar (alleen service-role) — geen lek, maar onbereikbare/onbeheerde bestanden.

**Fix:** Opruimen of verplaatsen naar de juiste company-map.

---

## ✅ Getest & VEILIG (hard geprobeerd, niet doorheen gekomen)

| Aanval | Resultaat |
|---|---|
| **Anonieme toegang** (`anon`, geen JWT) op `customers`/`companies`/`profiles` | **0 rijen** — RLS blokkeert volledig |
| **Cross-tenant tabel-reads** (medewerker → vreemde `customers`/`profiles`/`companies`/`pipeline_stages`) | **0** vreemde rijen |
| **`is_super_admin` / `role` escaleren** via `UPDATE profiles` | Geblokkeerd door trigger (`is_super_admin=false`, `role` teruggezet) |
| **`provision_account` misbruiken** (2e bedrijf maken / herkoppelen) | Self-guard: bestaand `company_id` → alleen naam-update, geen hijack |
| **`super-admin-data` edge function** zonder super-admin | Verifieert `is_super_admin` (regel 31) → **403** |
| **Notificatie-spoofing** (insert voor collega, bypass edge function) | RLS `42501` — self-insert-only policy werkt |
| **Self-grant van rechten** (`INSERT user_permissions` voor jezelf) | RLS `42501` — admin-only |
| **`company_members` manipuleren** (self-promote/insert/delete) | Alle writes vereisen `role='admin'` |
| **Werkbonnen/uren van collega's** lezen (medewerker) | Rij-scoping: alleen eigen rijen |
| **Tabellen zonder RLS / SECURITY DEFINER views / realtime-publicatie** | Geen gevonden (0) |
| **`password_reset_attempts`** lezen (medewerker) | 0 — service-role only (RLS aan, 0 policies) |
| **`kosten-bijlagen`** cross-tenant lezen | Medewerker ziet alleen eigen company-map (ronde-1-fix werkt) |
| **`get_auth_user_id_by_email`** als anon/authenticated | EXECUTE ingetrokken (alleen service-role) |
| **Sign/invite/reset-tokens** | 122-bit UUID's, niet brute-forcebaar; reset single-use + 1u; rate-limit aanwezig |

---

## Aanbevolen prioriteit

1. **🔴 #1 — `company_id`-bescherming in de trigger** (1 regel SQL). Dit is een actief exploiteerbare volledige tenant-overname. **Direct fixen.**
2. **🟠 #2 — Rechten server-side afdwingen** in RLS (offertes/facturen/job_costs/customers), of expliciet documenteren dat rechten UI-only zijn.
3. **🟡 #4 — Tenant-UUID-lek dichten** (random map-id of privé buckets) — neemt de "munitie" voor #1 weg.
4. **🟡 #3 — `signatures` privé** (samen met de publieke onderteken-/PDF-flow herzien).
5. **🔵 #5/#6 — `search_path` toevoegen; root-bestanden opruimen.**

> Alle bevindingen zijn geverifieerd met echte, teruggedraaide exploit-queries onder de gesimuleerde `authenticated`/`anon` rol. Er is geen productiedata gewijzigd en geen code aangepast — dit is puur een penetratietest-rapport.
