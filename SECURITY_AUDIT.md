# BossBase — Security Audit

**Datum:** 2026-06-19
**Scope:** Supabase database (RLS, policies, functies, storage), edge functions, client-code (`src/`), authenticatie en mailflows.
**Aard:** Alleen rapportage — er zijn **geen** wijzigingen gemaakt.

Legenda: ✅ veilig · ⚠️ aandacht nodig · ❌ kritiek

---

## Samenvatting (belangrijkste bevindingen)

| # | Ernst | Bevinding | Locatie |
|---|---|---|---|
| 0 | ❌ | **Privilege-escalatie**: gewone gebruiker kan zichzelf `is_super_admin=true`/`role='admin'` maken — `profiles` UPDATE-policy heeft `WITH CHECK (id=auth.uid())` zonder kolom-bescherming en geen trigger | `profiles` policy |
| 1 | ❌ | `kosten-bijlagen` bucket is **publiek** én policy laat élke ingelogde gebruiker de hele bucket lezen → financiële bijlagen lekken tussen bedrijven | storage bucket `kosten-bijlagen` |
| 2 | ❌ | RPC `get_auth_user_id_by_email` heeft EXECUTE voor `anon`+`authenticated` → e-mail-enumeratie + lek van auth-UUID's met enkel de anon-key | DB functie |
| 3 | ⚠️ | Mogelijke **stored XSS**: opgeslagen mail-`body_html` wordt rauw gerenderd met `dangerouslySetInnerHTML`, en mailvariabelen worden niet ge-escaped in de HTML-tak | `BbPages1.jsx:1033`, `emailService.js:106` |
| 4 | ⚠️ | Diverse storage-buckets publiek (signatures, werkbon-fotos, bedrijf-logos, avatars) + zwakke object-policies (overschrijven/verwijderen cross-tenant) | `storage.objects` policies |
| 5 | ⚠️ | `afas-test` edge function heeft `verify_jwt=false` → open endpoint | edge function |
| 6 | ⚠️ | Geen AVG self-service: account/gegevens verwijderen en data-export voor betrokkene ontbreken | app-breed |
| 7 | ⚠️ | Kleinere zaken: `companies` INSERT te ruim, `notifications` INSERT spoofbaar binnen bedrijf, `current_user_company_id()` zonder `search_path`, PII in `console.log` | div. |

De **RLS-fundering is sterk**: alle 35 tabellen hebben RLS aan en alle bedrijfstabellen filteren correct op `company_id` (incl. `WITH CHECK` op INSERT). De grootste risico's zitten in **storage** en een te ruime **RPC-grant**, niet in de tabel-policies.

---

## 1. Row Level Security (KRITIEK) — grotendeels ✅

**RLS ingeschakeld:** op **alle 35** `public`-tabellen ✅.
**Cross-tenant lezen van tabellen:** niet mogelijk — elke bedrijfstabel filtert op `company_id = current_company_id()` of via `profiles.company_id` subquery, ook in de `WITH CHECK` van INSERT.

| Tabel | RLS | Policies | company_id-scope | Opmerking |
|---|---|---|---|---|
| accounting_connections | ✅ | 4 | ✅ (admin voor schrijven) | |
| activities | ✅ | 4 | ✅ | |
| bedrijfsinstellingen | ✅ | 4 | ✅ (admin schrijven) | |
| btw_periodes | ✅ | 1 (ALL) | ✅ | |
| calendar_events | ✅ | 4 | ✅ | |
| companies | ✅ | 4 | ✅ select/update eigen; ⚠️ INSERT = elke `authenticated` | zie §1b |
| company_members | ✅ | 4 | ✅ (admin schrijven) | |
| customers | ✅ | 4 | ✅ | |
| dashboard_widgets | ✅ | 4 | ✅ (per user) | |
| deals | ✅ | 4 | ✅ | |
| email_templates | ✅ | 4 | ✅ (admin schrijven) | |
| facturen / factuur_regels | ✅ | 4 | ✅ (admin/planner schrijven) | |
| google_calendar_connections | ✅ | **0** | n.v.t. | RLS-aan-zonder-policy = deny-all voor clients; enkel service-role (edge functions). Veilig, bevat OAuth-tokens ✅ |
| job_costs | ✅ | 4 | ✅ | |
| klant_tijdlijn | ✅ | 1 (ALL) | ✅ | |
| notes | ✅ | 4 | ✅ | |
| notifications | ✅ | 3 | select/update `user_id=auth.uid()` ✅; ⚠️ INSERT spoofbaar binnen bedrijf | zie §1b |
| offerte_items / offertes | ✅ | 4 | ✅ (admin/planner) | |
| password_reset_tokens | ✅ | **0** | n.v.t. | deny-all clients; enkel service-role ✅ |
| pipeline_stages | ✅ | **8** | ✅ | ⚠️ dubbele policy-sets (2× dezelfde rechten) — opschonen aanbevolen |
| profiles | ✅ | 4 | eigen rij + zelfde bedrijf (`current_user_company_id()`) ✅ | exposeert `is_super_admin` (lees) aan collega's — geen schrijfrisico |
| project_notes / projects | ✅ | 4 | ✅ (eigenaar/admin/planner) | |
| sent_emails | ✅ | 1 (ALL) | ✅ | |
| subscriptions | ✅ | 1 | **alleen super_admin** ✅ | |
| time_entries / urenregistratie | ✅ | 4 | ✅ + eigen-rij voor medewerker | uitstekend (medewerker ziet enkel eigen uren) |
| user_permissions | ✅ | 4 | ✅ (admin schrijven) | |
| voertuigen | ✅ | 4 | ✅ | |
| werkbonnen + sub-tabellen | ✅ | 3-4 | ✅ + `assigned_to = auth.uid()` voor medewerker | uitstekend (medewerker ziet enkel eigen werkbonnen) |

**Helperfuncties:** `current_company_id()` en `current_user_company_id()` zijn `SECURITY DEFINER` en lezen `profiles` op `auth.uid()` — correct. ⚠️ `current_user_company_id()` heeft **geen** `SET search_path` (best practice voor SECURITY DEFINER); laag risico (simpele select) maar aanbevolen toe te voegen.

### 1b — Aandachtspunten RLS

- ⚠️ **`companies` INSERT** — `WITH CHECK (auth.role() = 'authenticated')`. Elke ingelogde gebruiker kan bedrijfsrijen aanmaken (nodig voor registratie, maar te ruim). *Fix:* koppel aan een registratie-flow of beperk tot gebruikers zonder bestaand `company_id`.
- ⚠️ **`notifications` INSERT** — `WITH CHECK (company_id IN eigen bedrijf)` maar geen restrictie op `user_id`. Een gebruiker kan een melding voor een willekeurige **collega** binnen hetzelfde bedrijf aanmaken (spoofing). *Fix:* `WITH CHECK` uitbreiden of notificaties uitsluitend via service-role/edge function aanmaken.
- ⚠️ **`pipeline_stages`** heeft twee overlappende policy-sets (8 policies). Functioneel veilig maar verwarrend; opschonen aanbevolen.
- ✅ Geverifieerd in eerdere audits: medewerker van bedrijf A ziet **0** rijen van bedrijf B (o.a. `subscriptions`, `werkbonnen`, `customers`).

---

## 2. Service Role Key — ✅

- ✅ **Geen** `service_role`/`SERVICE_ROLE` in `src/` (client). Geverifieerd met grep.
- ✅ Service role wordt uitsluitend in edge functions gebruikt via `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` (o.a. `sign-offerte`, `get-invite`, `accept-invite`, `super-admin-data`, integraties).
- ✅ Client gebruikt enkel `VITE_SUPABASE_ANON_KEY`; anon en service keys zijn correct gescheiden.

---

## 3. Edge Functions — grotendeels ✅, 1 ⚠️

**`verify_jwt`-status (Supabase):** vrijwel alle functies `true`. Twee staan op `false`:

- ✅ `google-calendar-callback` (`verify_jwt=false`) — noodzakelijk publiek (OAuth-redirect van Google); valideert de `state`/`code`. Acceptabel.
- ⚠️ **`afas-test` (`verify_jwt=false`)** — open testendpoint dat AFAS-credentials uit de request-body test. Lekt geen opgeslagen data (caller levert zelf de creds), maar is een ongeauthenticeerd endpoint dat als proxy/SSRF naar AFAS misbruikt kan worden en resources verbruikt. *Fix:* `verify_jwt=true` zetten, of de testfunctie verwijderen in productie.

**Publieke flows (callable met anon-key) zijn token-beveiligd:**
- ✅ `sign-offerte` — valideert verplichte velden, weigert dubbel ondertekenen (`signed_at`), zoekt op `sign_token` (UUID).
- ✅ `get-invite` — valideert `invite_token` + verloopdatum; geeft alleen invitee-mail/bedrijfsnaam terug bij geldig token.
- ✅ `request-password-reset` / `apply-password-reset` — zie §4.
- ✅ Input wordt gevalideerd (verplichte velden → 400) in de bekeken functies.

**Sign-token brute-force:** ❌ niet haalbaar — `offertes.sign_token DEFAULT gen_random_uuid()` (122-bit). Idem `invite_token` en reset-token (`crypto.randomUUID()`). ✅

⚠️ *Aanbeveling:* controleer of de integratie-sync-functies (moneybird/afas/snelstart) de **aanroepende** gebruiker koppelen aan de juiste `company_id` van de connectie (verify_jwt beschermt tegen anonieme aanroep, maar niet automatisch tegen cross-company misbruik door een ingelogde gebruiker).

---

## 4. Authenticatie — ✅ (met kleine verbeterpunten)

- ✅ **Wachtwoordvereisten** (`src/components/PasswordStrength.jsx`): ≥8 tekens, ≥1 hoofdletter, ≥1 cijfer, ≥1 speciaal teken. Redelijk. ⚠️ overweeg ≥10–12 tekens en een check tegen veelvoorkomende wachtwoorden.
- ✅ **Reset-token verloopt na 1 uur** — `request-password-reset/index.ts:38`: `Date.now() + 60*60*1000`.
- ✅ **Reset-token single-use** — `apply-password-reset` checkt `used_at` (regel 37) én `expires_at` (regel 41) en zet daarna `used_at` (regel 57). Hergebruik niet mogelijk.
- ✅ **Invite-token verloopt** — `invite_expires_at` wordt gezet (48 uur) en gecontroleerd in zowel `get-invite` als `accept-invite`.
- ✅ **Geen user-enumeratie** bij wachtwoordreset — `request-password-reset` geeft altijd `success:true`, ook als de e-mail niet bestaat (regel 33-34).
- ✅ **Rate limiting login**: login loopt via Supabase Auth (`signInWithPassword`), dat ingebouwde rate limiting heeft. ⚠️ De eigen `request-password-reset` edge function heeft **geen** eigen rate limiting — iemand kan herhaald resetmails triggeren (mail-spam naar bestaande gebruikers). *Fix:* throttle per e-mail/IP.
- ❌ **`is_super_admin`/`role` NIET beschermd — bevestigd privilege-escalatie.** De `profiles` UPDATE-policy is `USING (id = auth.uid())` **`WITH CHECK (id = auth.uid())`** en er staat **geen trigger** op `profiles` (geverifieerd via `pg_policy` + `pg_trigger`). De policy beperkt enkel de *rij*, niet de *kolommen*. Een gewone ingelogde gebruiker kan dus uitvoeren:
  ```js
  await supabase.from('profiles').update({ is_super_admin: true, role: 'admin' }).eq('id', myUserId)
  ```
  Gevolgen:
  - `is_super_admin=true` geeft via de policy `subscriptions.super_admin_only` en `companies.super_admin_update_companies` **DB-toegang tot álle bedrijven** (abonnementen/MRR van alle klanten lezen, elk bedrijf updaten/op `geblokkeerd` zetten). Deze policies checken **alleen** `is_super_admin`, **niet** de e-mail-whitelist die de frontend (`/superadmin`) hanteert — de frontend-guard wordt dus omzeild.
  - `role='admin'` geeft binnen het eigen bedrijf admin-rechten (data verwijderen, leden/permissies beheren) ook voor een medewerker.

  *Fix:* een `BEFORE UPDATE`-trigger op `profiles` die wijziging van `is_super_admin`, `role` en `company_id` blokkeert tenzij de aanroep van de service-role komt (of die kolommen terugzet naar `OLD`). Beheer van rol/permissies uitsluitend via een edge function met service-role.

---

## 5. Data Exposure — ✅ (met kleine ⚠️)

- ✅ **Geen hardcoded secrets** in `src/` (grep op JWT/`sk_live`/`re_`/secret-patterns: niets).
- ✅ **Secrets via env**: `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` (client) en `Deno.env` (edge). 
- ✅ **`.gitignore`** negeert `.env`, `.env.local`, `.vercel/`, `supabase/.temp/`. Enkel `.env.local.example` staat in git (veilig — voorbeeldbestand). `git ls-files` bevestigt geen echte `.env` in repo.
- ⚠️ **Console-logging van PII**: `emailService.js:48-54` logt ontvanger-e-mail, onderwerp en de error-body van mails; `teamService.js:120-123` logt invite-mailresponses. Alleen zichtbaar in de eigen browserconsole (niet naar server), maar in productie onnodig. *Fix:* achter een `DEV`-vlag zetten.
- ✅ **localStorage** bevat enkel UI-voorkeuren (`bb_db_segments`, `pipeline_hide_lost`, view-toggles). Geen tokens/PII door de app. (De Supabase-sessie-JWT staat standaard in localStorage — standaardgedrag; relevant bij XSS, zie §7.)

---

## 6. Publieke pagina's — ✅ (met ⚠️ op handtekening-opslag)

- **`/offerte/:token`** (publiek, `OfferteSigneren`): geopend met een UUID-`sign_token`. Toont offertegegevens (nummer, omschrijving, bedrag, klant-/bedrijfsgegevens, regels) — by design nodig om te ondertekenen. Alleen bereikbaar met het exacte (onraadbare) token. ✅ Geen toegang tot andere offertes of bedrijven.
- ⚠️ De **getekende handtekening** wordt opgeslagen in de **publieke** `signatures`-bucket (zie §8). De bestandsnaam bevat het sign-token (UUID), dus de URL is onraadbaar, maar de afbeelding is een persoonsgegeven in een publieke bucket.
- Overige publieke routes (`/`, `/functies`, `/prijzen`, `/login`, `/register`, `/reset-password`, `/uitnodiging/:token`): tonen geen bedrijfsdata zonder geldig token/sessie. ✅

---

## 7. Input-validatie & Injection — ⚠️

- ✅ **SQL-injection**: alle queries lopen via de Supabase/PostgREST client (geparametriseerd). Geen ruwe SQL-string-concatenatie in `src/`. RPC's gebruiken parameters.
- ✅ **MentionEditor / `renderMentions`** (`MentionEditor.jsx`): parseert `@[naam](id)` met regex en rendert via React-`<span>` — React escapet automatisch. **Geen** `dangerouslySetInnerHTML`. Veilig tegen XSS. ✅
- ⚠️ **Stored XSS via opgeslagen mail-HTML**:
  - `BbPages1.jsx:1033` rendert `m.body_html` (opgeslagen verzonden-mail-HTML) met **`dangerouslySetInnerHTML`**.
  - `emailService.js:106` bouwt die `body_html` met `substituteVars(tpl.body_html, vars)` **zonder HTML-escaping** van de variabelen (klantnaam, omschrijving, etc.). De plain-tekst-tak (regel 107) escapet wél `& < >`, de HTML-tak niet.
  - Gevolg: door HTML/markup in klant- of offertevelden te zetten kan dit (a) in de **verzonden e-mail** en (b) **in-app** bij het tonen van verzonden mails worden geïnjecteerd. *Fix:* escape variabelen vóór interpolatie in de HTML-tak, of saneer `body_html` met DOMPurify vóór render. (DOMPurify is al als dep aanwezig via jsPDF.)
- ⚠️ **HTML-injectie in mails** algemeen: `mailTemplate(...)` en `createMentionNotifications` (`notificatieService.js`, `plain` in een `<blockquote>${plain}`) interpoleren gebruikerstekst in HTML-mails zonder escaping. Beperkte impact (mailclients sandboxen scripts) maar markup/phishing-injectie mogelijk. *Fix:* escape user-content in alle mail-HTML.
- ℹ️ `marketing/_backup2_FeaturesPage.jsx:210` gebruikt `dangerouslySetInnerHTML` op statische content in een **backup-bestand** (niet in routes) — opruimen aanbevolen, geen actief risico.

---

## 8. Bestanden / Storage — ❌ / ⚠️ (zwakste gebied)

Buckets (`storage.buckets`):

| Bucket | Publiek | Object-policies | Oordeel |
|---|---|---|---|
| `signed-offertes` | **privé** | geen (service-role only) | ✅ |
| `kosten-bijlagen` | **publiek** | "Authenticated users can read" = `bucket_id='kosten-bijlagen'` (géén company-scope) | ❌ |
| `signatures` | **publiek** | geen object-policies | ⚠️ |
| `werkbon-fotos` | **publiek** | read=publiek; insert=geen check; delete=enkel `authenticated` | ⚠️ |
| `bedrijf-logos` | **publiek** | read=publiek; insert=geen check; update=enkel `bucket_id` (geen eigenaar) | ⚠️ |
| `avatars` | **publiek** | read=publiek; insert=geen check; update/delete=company+user-scope | ⚠️ |

- ❌ **`kosten-bijlagen`**: publieke bucket **én** de SELECT-policy laat élke ingelogde gebruiker de **hele** bucket lezen — geen `company_id`/pad-scope. Een gebruiker van bedrijf A kan kostenbijlagen (bonnetjes/facturen = gevoelige financiële documenten) van bedrijf B benaderen, en via publieke URL zelfs zonder login. *Fix:* bucket op **privé**, en een SELECT/INSERT-policy die het eerste padsegment matcht met `current_company_id()` (zoals bij `avatars`). Toegang via signed URLs.
- ⚠️ **`signatures`** (publiek): getekende handtekeningen (persoonsgegeven) zijn via URL benaderbaar. Bestandsnaam = sign-token (UUID, onraadbaar), dus geen enumeratie, maar overweeg een **privé** bucket + signed URLs voor PDF-generatie.
- ⚠️ **`werkbon-fotos`**: DELETE vereist enkel `authenticated` (geen company/pad-check) → een gebruiker van bedrijf A kan foto's van bedrijf B verwijderen. Publieke read maakt foto's via URL toegankelijk. *Fix:* DELETE/SELECT scopen op `company_id` in het pad.
- ⚠️ **`bedrijf-logos`**: UPDATE-policy mist eigenaar/company-check → elke ingelogde gebruiker kan het logo van een ander bedrijf overschrijven (defacement). *Fix:* pad-scope op `current_company_id()`.
- ⚠️ **INSERT zonder `WITH CHECK`** op `avatars`/`werkbon-fotos`/`bedrijf-logos` → upload naar willekeurige paden mogelijk. *Fix:* WITH CHECK op padsegment = eigen `company_id`.

---

## 9. Gegevensverwijdering (AVG) — ⚠️

- ⚠️ **Geen self-service accountverwijdering**: er is geen functie waarmee een gebruiker zijn account + persoonsgegevens kan (laten) verwijderen (recht op vergetelheid). Admin kan via `company_members` leden verwijderen, maar de gekoppelde `auth.users`/`profiles` + persoonlijke data worden niet aantoonbaar gewist.
- ✅ **Cascade op DB-niveau** bestaat deels: `werkbon_id`/`activiteit_id` op `calendar_events` zijn `ON DELETE CASCADE`; companies-FK's cascaden. Maar er is geen orchestratie die op verzoek álle persoonsgegevens van één betrokkene verwijdert.
- ⚠️ **Data-export (portabiliteit)**: `DatabasePage` kan CRM-data naar Excel exporteren (zakelijke export), maar er is geen gerichte "exporteer mijn persoonsgegevens"-functie voor een betrokkene.
- *Fix:* implementeer een verwijder-account-flow (edge function met service-role die `auth.users` + gekoppelde rijen verwijdert) en een persoonsgegevens-export, en documenteer de bewaartermijnen.

---

## 10. Gegevens in mails — ✅

- ✅ **Juiste ontvanger**: `notificatieService.createMentionNotifications` zoekt het e-mailadres op via `company_members` op `profile_id` **én** `company_id` — geen kruislek naar verkeerde ontvanger. Auto-mails (offerte/factuur) gaan naar het klant-e-mailadres van het betreffende record.
- ✅ **Inhoud**: mails bevatten functionele gegevens (offerte/factuurbedragen, notitietekst). Geen wachtwoorden of tokens-in-cleartext behalve de **reset-/sign-/invite-links** (token in URL — noodzakelijk en tijdgebonden/single-use).
- ⚠️ Zie §7: gebruikerstekst wordt niet ge-escaped in mail-HTML (HTML-injectie). Inhoudelijk correct geadresseerd, maar saneer de HTML.

---

## Aanbevolen prioriteit

1. **❌ Privilege-escalatie via `profiles`** — trigger toevoegen die wijziging van `is_super_admin`/`role`/`company_id` door de gebruiker blokkeert. **Hoogste prioriteit** (bevestigd, omzeilt frontend-guard, cross-tenant).
2. **❌ `kosten-bijlagen`** privé maken + company-scoped policy (cross-tenant financieel lek).
3. **❌ `get_auth_user_id_by_email`** — `REVOKE EXECUTE ... FROM anon, authenticated` (enkel service-role nodig).
4. **⚠️ Stored XSS / mail-HTML-injectie** — escape user-input in `body_html` en/of DOMPurify vóór `dangerouslySetInnerHTML`.
5. **⚠️ Storage-policies** aanscherpen (signatures privé, werkbon-fotos/bedrijf-logos/avatars company-scoped insert/update/delete).
6. **⚠️ `afas-test`** dichtzetten (`verify_jwt=true`) of verwijderen.
7. **⚠️ Rate limiting** op `request-password-reset`; `notifications`/`companies` INSERT-policies aanscherpen; AVG verwijder-/exportflow.

> Opmerking: de integratie-sync-functies (§3, moneybird/afas/snelstart) zijn met deze read-only audit niet volledig op cross-company misbruik getest (`verify_jwt=true` voorkomt anonieme aanroep, maar niet automatisch dat een ingelogde gebruiker van bedrijf A een sync van bedrijf B triggert) — gerichte test aanbevolen. De rest van de bevindingen is bevestigd via directe DB-/code-inspectie.
