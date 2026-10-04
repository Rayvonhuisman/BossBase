# Registratie- & Authenticatie-flow + E-mailverificatie

**Datum onderzoek:** 2026-06-23 · **Datum implementatie:** 2026-06-23
**Status:** ✅ **GEBOUWD, GEDEPLOYED & GETEST** — e-mailverificatie met 6-cijferige code is live (Optie B).

---

## ✅ WAT IS GEBOUWD (e-mailverificatie, Optie B)

**Flow:** registratie → account aangemaakt (sessie, Confirm email blijft UIT) → 6-cijferige code gemaild → verificatiescherm → code klopt → `email_verified_at` gezet + `provision_account` (company + pipeline) → dashboard. Pas ná verificatie wordt het bedrijf aangemaakt.

### Database — migratie `20260623010000_email_verification.sql`
- `email_verification_codes` (gehasht: `SHA-256(code:user_id)`, 10 min geldig, `attempts`, `verified_at`) — RLS aan, **geen client-policies** (alleen service-role).
- `email_verification_attempts` (rate limiting per e-mail) — idem service-role only.
- `profiles.email_verified_at` kolom toegevoegd.
- **Stap 7:** alle 5 bestaande accounts gebackfild (`email_verified_at = created_at`) → niet buitengesloten.

### Edge functions (gedeployed)
- **`request-verification-code`** — user uit JWT (geen spoofing), rate limiting (min 60s, max 3/10min), genereert 6-cijferige code, hasht via gedeelde `_shared/hashCode.ts`, wist oude codes, mailt via Resend + `mailTemplate` (grote code, geen link). Bij throttle/al-geverifieerd: `success:true` zonder mail (geen enumeratie).
- **`verify-code`** — user uit JWT, checkt `verified_at`/`expires_at`/`attempts` (max 5), hash-vergelijk, zet `verified_at` + `profiles.email_verified_at`, en roept `provision_account` aan via een **user-scoped client** (zodat `auth.uid()` werkt) met company/phone/kvk uit `user_metadata`. NL foutcodes: `MISMATCH`/`EXPIRED`/`TOO_MANY`/`NO_CODE`/`INVALID`.
- **`accept-invite`** (aangepast) — zet `email_verified_at = now` zodat **uitgenodigde teamleden geen code hoeven** (Stap 6).

### Frontend
- `authService.js`: `registerWithEmail` provisioned NIET meer direct → slaat phone/kvk in metadata op, stuurt de code en geeft `requiresVerification` terug. Nieuwe `requestVerificationCode()` / `verifyCode(code)`.
- `profileService.js`: `emailVerifiedAt` op het profiel-object.
- `BbAuth.jsx`: herbruikbare **`EmailVerificationScreen`** (6-cijferig veld, verifiëren, "opnieuw versturen" met 60s-countdown, NL fouten). RegisterFlow toont het na registratie.
- `App.jsx` (**Stap 5 — toegang blokkeren**): de auto-provisioning in `refreshProfile` wordt overgeslagen voor onbevestigde profielen zonder bedrijf; render-gate toont `EmailVerificationScreen` zolang `profile && !companyId && !emailVerifiedAt`. Uitgenodigde leden (met `companyId`) en bestaande users (geverifieerd) passeren direct.

### Getest (echte e2e tegen de gedeployde functions, test-data opgeruimd)
| Scenario | Resultaat |
|---|---|
| Registratie → code → invullen → toegang | ✅ bedrijf "Pentest BV" + pipeline + `email_verified_at` gezet, phone/kvk uit metadata |
| Foute code | ✅ `MISMATCH` "Code is onjuist. Nog X pogingen." (correct enkelvoud/meervoud) |
| 5× foute code | ✅ `TOO_MANY` lockout — zelfs juiste code daarna geweigerd |
| Verlopen code (10 min) | ✅ `EXPIRED` "Code is verlopen. Vraag een nieuwe code aan." |
| Resend rate limiting (60s) | ✅ 2e request binnen 60s gethrottled, `send_count` blijft 1, geen 2e mail, `success:true` |
| request zonder auth | ✅ 401 |
| Ongeldig formaat (`12`) | ✅ `INVALID` |
| Nogmaals verifiëren | ✅ idempotent `alreadyVerified` |
| Bestaand account | ✅ geverifieerd via backfill → geen gate |
| Invite-teamlid | ✅ heeft `companyId` + `email_verified_at` → geen gate |

> **Confirm email in Supabase blijft UIT** (bevestigd tijdens de test: signup gaf direct een sessie). De app blokkeert zelf de dashboard-toegang tot geverifieerd.

---

## ONDERZOEK (hoe de flow wérkte — context voor bovenstaande build)

**Aard:** onderzoek dat aan de implementatie voorafging.

---

## TL;DR

- **"Confirm email" staat in Supabase vrijwel zeker UIT** (autoconfirm). Bewijs: de 4 recentste van 5 users hebben `email_confirmed_at == created_at` (delay 0s), en de code-flow rekent erop dat `signUp` direct een sessie teruggeeft.
- **De code heeft de verificatie-tak echter AL ingebouwd** (`requiresConfirmation` → "Bevestig je e-mailadres"-scherm), maar die wordt nooit bereikt zolang Confirm email uit staat.
- **Registratie logt de gebruiker direct in** en roept meteen `provision_account` aan (maakt company + admin-profiel).
- **Mail-infrastructuur is compleet en herbruikbaar**: Resend via `send-email` edge function + gedeelde `mailTemplate` (zowel `_shared/mailTemplate.ts` als `src/utils/mailTemplate.js`).
- **Er is GEEN `email_verified`-veld** in `profiles`; verificatiestatus leeft in `auth.users.email_confirmed_at`.
- **Twee bestaande token-flows (reset + invite)** zijn ideale blauwdrukken voor een eigen verificatie-flow.

---

## 1. Registratie-flow

### Componenten
- **`src/pages/BbAuth.jsx`** → `RegisterFlow` (regel 187): meerstaps onboarding-wizard (account → bedrijf → branche → team uitnodigen).
- **`src/services/authService.js`** → `registerWithEmail()`: de kern-logica.
- **`src/App.jsx`** (regel 1204-1218): rendert `RegisterFlow` op route `/register`, geeft `onDone`/`onBack` callbacks.

### Wat gebeurt er bij "BossBase starten" (submit, BbAuth.jsx:230)
```
RegisterFlow.submit()
  → registerWithEmail({ email, password, fullName, companyName, phone, kvk, trade })
  → if result.requiresConfirmation: setNeedsConfirmation(true)   // toont "Bevestig je e-mail"-scherm
    else: onDone()                                               // → refreshProfile() + navigate('/dashboard')
```

### `registerWithEmail()` (authService.js) — stap voor stap
1. **`supabase.auth.signUp({ email, password, options:{ data:{ full_name, company_name } } })`**
   - Metadata (`full_name`, `company_name`) wordt meegestuurd zodat de DB-trigger `handle_new_user` de naam kan gebruiken.
2. **`if (!signup.data.session)`** → **Confirm email staat AAN**: geen sessie. Functie returnt `{ requiresConfirmation: true }`. Company/koppeling worden dan NIET hier gemaakt (zou later bij eerste login moeten — zie ⚠️ hieronder).
3. **Anders (sessie aanwezig = Confirm email UIT)** → roept **`supabase.rpc('provision_account', {...})`** aan en returnt `{ company: { id } }`.

### Wordt `provision_account` aangeroepen? Wat doet die?
**Ja**, direct na `signUp` — maar **alleen in de "sessie aanwezig"-tak** (Confirm email uit). `provision_account` (SECURITY DEFINER, bevestigd op de live DB):
- Guard: als het profiel al een `company_id` heeft → alleen `full_name` bijwerken, return `status:existing` (voorkomt dubbel-provisioning).
- Anders: maakt een **company** aan, koppelt het profiel met `role='admin'`, en seedt 7 default pipeline-fasen. Return `status:created`.
- Bypast RLS (definer) → lost het kip-ei-probleem op (SELECT-policy blokkeert company-lezen zonder profiel).

### Wordt de gebruiker direct ingelogd na registratie?
**Ja** (in de huidige config). `signUp` levert een sessie → `onAuthStateChange` in App.jsx vangt die op → `refreshProfile()` → dashboard. Geen tussenstap.

### Is er nu al e-mailbevestiging?
- **In de UI/code: JA, volledig voorbereid** maar inactief. `RegisterFlow` heeft een compleet `needsConfirmation`-scherm (BbAuth.jsx:279-305): "📬 Bevestig je e-mailadres", met **"Verificatiemail opnieuw sturen"**-knop (`resendVerificationEmail` → `supabase.auth.resend({ type:'signup' })`).
- **In de praktijk: NEE**, want Confirm email staat uit → `signUp` geeft een sessie → de `requiresConfirmation`-tak wordt nooit geraakt.
- Ook **`LoginPage`** (BbAuth.jsx:66) heeft al een `resendVerificationEmail`-pad voor het geval login faalt op "niet bevestigd".

### ⚠️ Belangrijk aandachtspunt voor de inbouw
Als je Confirm email **aanzet**, geeft `signUp` **geen sessie** meer → `registerWithEmail` returnt `requiresConfirmation:true` en **`provision_account` wordt NIET meer aangeroepen tijdens registratie**. De company/het profiel moeten dan **bij de eerste login ná bevestiging** geprovisioneerd worden. De DB-trigger `handle_new_user` maakt al wél een minimaal profiel aan (zonder company), maar **`provision_account` (company + pipeline) wordt nergens automatisch getriggerd bij eerste login**. Dit is de plek waar de huidige flow zou breken — hier moet een hook komen (bv. in `refreshProfile`/`getCurrentUserContext`: "profiel zonder company_id → roep provision_account aan", wat de bestaande repair-flow `createMissingProfile` al deels doet).

---

## 2. Supabase Auth-instellingen

### Staat "Confirm email" aan of uit?
**Vrijwel zeker UIT (autoconfirm).** Geen directe config-leesrechten via de huidige toolchain, maar sterk afgeleid bewijs uit `auth.users`:

| created | confirm-delay (s) | interpretatie |
|---|---|---|
| 2026-05-06 | 500 | mogelijk Confirm email even AAN (allereerste user) |
| 2026-05-07 | 0 | autoconfirm |
| 2026-06-13 | 0 | autoconfirm |
| 2026-06-13 | 0 | autoconfirm |
| 2026-06-20 | 0 | autoconfirm |

5/5 users zijn uiteindelijk `email_confirmed_at IS NOT NULL`; de 4 recentste met **delay 0** wijzen op autoconfirm. Gecombineerd met de code (die op een directe sessie rekent) → **Confirm email UIT**.
> Verifieer dit vóór de wijziging in **Dashboard → Authentication → Sign In / Providers → Email → "Confirm email"** (of via de Management API `GET /v1/projects/{ref}/config/auth`, veld `mailer_autoconfirm`).

### Hoe wordt de sessie aangemaakt na registratie?
- `supabase.auth.signUp()` retourneert bij autoconfirm direct `data.session` (access + refresh token, opgeslagen in localStorage door de supabase-js client).
- `App.jsx` heeft een `onAuthStateChange`-listener + `getSession()` die `session` in state zet; `session` aanwezig → `refreshProfile()`.
- **Custom auth-mails (reset)** lopen NIET via Supabase's ingebouwde mailer maar via Resend (Supabase-templates zijn bewust leeggemaakt — zie comment in `request-password-reset`).

---

## 3. Bestaande mail-infrastructuur (volledig herbruikbaar)

### Hoe worden mails verstuurd?
**Resend via de `send-email` edge function.**
- `supabase/functions/send-email/index.ts`: neemt `{ to, subject, html, from_name, attachments }`, POST naar `https://api.resend.com/emails` met `RESEND_API_KEY`. Afzender: `RESEND_FROM_EMAIL` (default `noreply@bossbase.nl`), optioneel met `from_name`-label.
- Client-helper: `src/services/emailService.js` → `sendEmail({ to, subject, html, fromName, attachments })` (invoke `send-email`). Sinds de security-fix staan de debug-logs achter `import.meta.env.DEV`.

### Bestaat de centrale mailTemplate al?
**Ja, dubbel** (client + edge), met identieke API — ideaal om te hergebruiken:
- **`supabase/functions/_shared/mailTemplate.ts`** (voor edge functions) en **`src/utils/mailTemplate.js`** (client).
- Signatuur: `mailTemplate({ title, preheader?, body, buttonText?, buttonUrl?, footerText? })` → volledige HTML-mail met BossBase-branding.
- Wordt al gebruikt door `request-password-reset` (reset-mail) en `notificatieService` (mention/toewijzing).

---

## 4. Edge functions (auth) + token-flows als blauwdruk

### Bestaande auth-edge-functions
| Functie | verify_jwt | Rol |
|---|---|---|
| `request-password-reset` | true* | Genereert reset-token, mailt reset-link (Resend) |
| `apply-password-reset` | true* | Valideert token (`checkOnly`) + zet nieuw wachtwoord |
| `get-invite` | true | Haalt invite-gegevens op via `invite_token` |
| `accept-invite` | true | Maakt auth-user (`email_confirm:true`) + koppelt aan bedrijf |
| `send-email` | true | Generieke Resend-mailer |

\* Functioneel publiek aanroepbaar met de anon-key (token zit in de body), niet user-gebonden.

### Token-flow patroon — Password reset (beste blauwdruk)
**`request-password-reset`:**
1. `get_auth_user_id_by_email` (SECURITY DEFINER) → user_id (of niets).
2. **Altijd `success:true`** → geen user-enumeratie.
3. **Rate limiting** via `password_reset_attempts` (min 60s, max 3/uur).
4. `token = crypto.randomUUID()`, `expires_at = now + 1u`, insert in **`password_reset_tokens`**.
5. Mail met `mailTemplate(...)` + link `${SITE_URL}/reset-password?token=${token}`.

**`apply-password-reset`:**
1. Zoekt token op (zonder `used_at`-filter → specifieke foutcodes).
2. Checkt `used_at` (single-use) en `expires_at` (verlopen).
3. `checkOnly`-modus = alleen valideren (gebruikt door de reset-pagina vóór invoer).
4. Anders: `supabase.auth.admin.updateUserById(user_id, { password })` + markeert `used_at`.

**`password_reset_tokens`-tabel (blauwdruk voor een `email_verification_tokens`-tabel):**
```
id uuid PK | user_id uuid | email text | token uuid UNIQUE | expires_at timestamptz | used_at timestamptz | created_at
```
RLS aan, **0 client-policies** → alleen service-role (edge functions). password_reset_attempts idem voor rate-limiting.

### Invite-flow patroon (relevant detail)
`accept-invite` maakt de auth-user met **`admin.createUser({ email_confirm: true })`** → uitgenodigde teamleden hoeven NIET te verifiëren (de invite-mail ís de verificatie). Bij het inbouwen van registratie-verificatie moet je dit pad ongemoeid laten — invites zijn al "bevestigd".

---

## 5. Database — verificatie-velden

### `profiles`-kolommen (live)
`id, company_id, full_name, role (default 'admin'), created_at, avatar_url, is_super_admin`
→ **GEEN `email_verified`-veld.**

### Is er een verificatie-veld?
- **Niet in `public.profiles`.** De canonieke verificatiestatus zit in **`auth.users.email_confirmed_at`** (Supabase-beheerd).
- Alle 5 huidige users: `email_confirmed_at IS NOT NULL` (bevestigd).
- Relevante trigger: **`handle_new_user`** (SECURITY DEFINER, op `auth.users` INSERT) maakt een `profiles`-rij:
  - Heeft de e-mail een geldige openstaande invite in `company_members` (met `invite_token` + niet verlopen)? → koppel aan dat bedrijf met de invite-rol (`medewerker`).
  - Anders → minimaal profiel met `role='admin'`, **zonder** `company_id`.

---

## Aanbevolen aanpak voor het inbouwen (zonder breken)

De infrastructuur is er grotendeels al. De netste, minst brekende route:

1. **Beslis de mechaniek:**
   - **Optie A (Supabase-native):** zet "Confirm email" AAN. `signUp` geeft geen sessie → de bestaande `requiresConfirmation`-UI activeert vanzelf. **Maar** los het provisioning-gat op (zie ⚠️ §1): roep `provision_account` aan bij de **eerste login na bevestiging** (uitbreiden van `createMissingProfile`/`refreshProfile`). Supabase verstuurt dan wel zijn eigen confirm-mail — om in de Resend-huisstijl te blijven moet je een **Auth Email Hook** (`send email hook`) of custom SMTP/Resend koppelen.
   - **Optie B (eigen token-flow, consistent met reset/invite):** houd Confirm email UIT, maar blokkeer dashboard-toegang tot geverifieerd. Eigen `email_verification_tokens`-tabel + 2 edge functions (`request-verification`, `apply-verification`) — exact het reset-patroon — en mail via de bestaande `mailTemplate`/`send-email`. Volledige controle over de mail en geen Supabase-config-afhankelijkheid.

2. **Verificatiestatus:** gebruik `auth.users.email_confirmed_at` (Optie A) of een eigen `verified_at`-kolom/token-tabel (Optie B). Een `email_verified`-veld op `profiles` is niet strikt nodig.

3. **Laat invites met rust** — die zijn via `email_confirm:true` al bevestigd.

4. **Provisioning-volgorde** is het enige echte risico: zorg dat company+pipeline worden aangemaakt op het juiste moment (na verificatie/eerste login), niet vóór.

---

*Einde rapport — geen code gewijzigd.*
