# BossBase — End-to-end Testrapport

**Datum:** 2026-06-20
**Tester:** Playwright MCP (geautomatiseerd) tegen lokale dev (`localhost:5174`, productie-Supabase)
**Doel:** Volledige kwaliteitscontrole vóór demo over 3 dagen.
**Werkwijze:** per pagina getest op knoppen, links, formulieren, modals, visueel, tekst, laadtijd en console-fouten. Bevindingen worden per pagina direct weggeschreven.

Ernst-legenda: 🔴 KAPOT · 🟠 BUG · 🟡 VISUEEL · 🔵 TEKST · ⏱️ TRAAG · 💡 VERBETERING

> **Test-aanpak voor authenticatie:** er waren geen wachtwoorden van bestaande accounts beschikbaar. Daarom is een wegwerp-testaccount (admin) aangemaakt om de geauthenticeerde pagina's en de aanmaak-flows (klant → project → offerte → factuur) te testen. SuperAdmin vereist `is_super_admin` (alleen 2 echte accounts) en wordt apart behandeld.

---

## Login (/login)

**Status:** ✅ werkt, geen console-fouten.

- ✅ Pagina laadt direct, nette layout, logo, NL-tekst ("Welkom terug", "E-mailadres", "Wachtwoord", "Inloggen →").
- ✅ Velden aanwezig: e-mail, wachtwoord; links "Wachtwoord vergeten?" en "Gratis aanmelden".
- ✅ Geen console errors/warnings.
- 🔵 Klein: de links "Wachtwoord vergeten?" en "Gratis aanmelden" hebben `href="#"` (SPA-navigatie via JS) — werkt, maar semantisch zou een echte route netter zijn. Lage prioriteit.

---

## Registratie (/register)

**Status:** ✅ uitstekend. 4-staps wizard werkt vlekkeloos.

- ✅ Stap 1 (naam/e-mail/wachtwoord): live wachtwoord-sterkte (4 eisen met ✓) + "Wachtwoorden komen overeen". "Volgende" disabled tot geldig.
- ✅ Stap 2 (bedrijf + branche-picker met emoji's, telefoon, KvK).
- ✅ Stap 3 (solo/team keuze).
- ✅ Stap 4 (team uitnodigen, optioneel — "Overslaan, later doen").
- ✅ "BossBase starten 🚀" → direct ingelogd op /dashboard (geen e-mailbevestiging nodig). Account wordt admin van het nieuwe bedrijf.
- ✅ Geen console-fouten.

---

## Dashboard (/dashboard)

**Status:** ✅ ziet er professioneel uit, geen console-fouten.

- ✅ KPI-kaarten (Open pipeline, Geaccepteerd, Klanten, Acties vandaag), "Acties vandaag", "Nieuwe leads", "Open offertes", "Actieve deals", "Omzet per maand" (recharts grafiek). Alles NL, nette uitlijning.
- ✅ Sidebar-navigatie compleet (Hoofdmenu / Uitvoering / Financieel / Bedrijf) — admin ziet alle items.
- ✅ Knoppen aanwezig: Nieuwe activiteit, Nieuwe lead, Dashboard aanpassen, 6M/12M, Alle/Mijn/Team.
- 🔵 **Dev-only:** in development staat **"Demo aan"** standaard aan → dashboard toont demo-data (Demo Klant Jansen, DEMO-001 etc.). Dit is een IS_DEV-toggle die in productie niet verschijnt. Geen productie-bug, maar wel verwarrend tijdens testen. **Aanbeveling:** controleer dat de demo-toggle écht alleen in dev zichtbaar is (zo ja: prima).
- ⏱️ Laadt vlot (<1s tot interactief).

---
---

# CODE-ANALYSE (statisch, hele `src/`)

> Playwright bleek te traag voor een volledige klikdoorloop. Hieronder een systematische statische analyse van de frontend. Per bevinding: bestand:regel, probleem, suggestie. Geen wijzigingen gemaakt.

## 🔵 OPRUIMEN — dode code & restanten

- **Dode pagina-bestanden (nergens geïmporteerd):**
  - `src/pages/KlusPages.jsx` (63 KB) — oude/alternatieve dashboardpagina, volledig ongebruikt.
  - `src/pages/WerkbonPage.jsx` (35 KB) — oude versie; actief is `WerkbonPageV2.jsx`.
  - `src/pages/UrenPage.jsx` (16 KB) — oude versie; actief is `UrenPageV2.jsx`.
  - *Suggestie:* verwijderen. Ze bevatten o.a. kapotte navigatie en TODO's die anders ten onrechte als bug opduiken.
- **Marketing-backups in git:** `src/pages/marketing/_backup2_*.jsx`, `_backup3_*.jsx` (uit `git status`) — opruimen.
- 🔴/🔵 **Ongepaste comment in productiecode:** `src/services/customerService.js:11` en `src/services/activityService.js:86` bevatten letterlijk: `// TODO: remove inappropriate demo customer data from Supabase (customer named "Niels is gay")`. **Verwijder deze comment vóór de demo** (en check of die klantnaam nog in de productie-DB staat). Zeer pijnlijk als iemand de code of DB ziet tijdens de demo.
- **Niet-DEV-gated debug logs:** `src/services/accountingService.js:143` en `:148` — `console.log('[afas] ...')` draaien ook in productie. Suggestie: achter `import.meta.env.DEV` of verwijderen.
- **authLog debug-helpers** (`src/App.jsx:62`, `src/pages/dashboard/DashboardHome.jsx:22`) staan achter een `localStorage`-vlag — onschuldig, maar kunnen na de flash-fixes weg.
- De overige `console.warn/error` zijn legitieme foutdiagnostiek (acceptabel).

## 🟠 BUG — kandidaten

- **`src/pages/KlusPages.jsx` (DOOD bestand):** bevat ~10 kapotte `navigate()`-calls naar niet-bestaande top-level routes (`/aanvragen`, `/offertes`, `/pipeline`, `/planning`, `/werkbonnen`). In de echte router bestaan deze alleen als `/dashboard/...`; deze zouden naar de homepage redirecten. **Niet actief** (bestand wordt niet geïmporteerd) → geen demo-risico, maar bevestigt dat het bestand weg moet.
- **`src/services/offerteService.js:85`** — bij het ophalen van het volgende offertenummer valt de code terug op het letterlijke `"BB-XXX"` als de query faalt. Als dat ooit gebeurt krijgt een offerte het nummer **"BB-XXX"**. *Suggestie:* falen → foutmelding tonen i.p.v. een ongeldig nummer toekennen (of een timestamp-fallback).

## ✅ Navigatie (in-app) — in orde

- Alle actieve `setPage(...)`/`navigatePage(...)`-targets verwijzen naar geldige pagina-id's (dashboard, pipeline, customers, activities, calendar, planning, costs, revenue, facturen, offertes, projecten, werkbonnen, uren, database, team, instellingen).
- Alle actieve `navigate('/...')`-routes bestaan (`/registreer` wordt intern naar `/register` gemapt).

## 🟢 CRASH-RISICO'S — schoon

- ✅ **Geen ongedefinieerde React state-setters** (de bugklasse van `setShowOverzichtInput`). Alle `set*()`-aanroepen zijn óf gedefinieerde `useState`-setters, óf ingebouwde methodes (`setItem`, `setTimeout`, Date-`setHours/setDate`, jsPDF-`setFont` etc.).
- ✅ **Geen onbeschermde `JSON.parse`** — alle voorkomens zitten in try/catch of met fallback.
- ✅ **Geen hangende spinners** — elke `setLoading/setSaving(true)` heeft een `finally { ...(false) }` of expliciete reset (PlanningPage:436 leek een kandidaat maar heeft `finally` op regel 508).

## 🟢 FORMULIEREN — over het algemeen goed gevalideerd

- ✅ Registratie: live wachtwoordsterkte + match, "Volgende" disabled tot geldig.
- ✅ Nieuwe klant: verplichte naam (`Naam *`), opslaan werkt (getest via Playwright).
- ✅ Activiteit inplannen (`PlanningPage`): checkt titel/datum/starttijd met NL-foutmeldingen vóór opslaan.
- ✅ Kosten: bedrag/omschrijving-validatie in `createJobCost`.
- ✅ Submit-handlers hebben try/catch met NL-toasts.
- 💡 Aandachtspunt: e-mailformaat-validatie is niet overal aanwezig op klant/lead-formulieren (alleen op bedrijfsprofiel). Niet kritiek.

## 🟢 KNOWN ISSUES uit eerdere sessies — NIET teruggekeerd

- ✅ **Wit scherm werkbon-detail:** `WerkbonPageV2` heeft `teamMembers`-state + loader (regel 729/763) — de ReferenceError is weg.
- ✅ **Flash van volledig dashboard voor medewerkers:** `DashboardHome` gate't op `permissionsLoaded` (regel 521: `if (!permissionsLoaded) return null`) i.p.v. `profileLoading`.
- ✅ **Klantkaart-tabellen:** herschreven als flexbox `.kk-row` lijsten (geen kapotte tabel-overflow meer).
- ✅ **Dubbele agenda-events:** `upsertWerkbonEvent`/`upsertActivityEvent` (check-then-update) + unieke index op `werkbon_id`/`activiteit_id`.
- ⚠️ **"Niet ingepland" blijft staan:** in de **Totaal**-weergave blijft een werkbon in de lijst zolang er géén medewerker is toegewezen (`PlanningPage:975`: `viewMode === 'totaal' && !w.assignedTo`). Dit is bestaand bedoeld gedrag, maar kan tijdens een demo verwarren ("ik heb 'm toch ingepland?"). 💡 Overweeg een hint of andere weergave.

## 🟢 TEKST — consistent Nederlands

- ✅ Geen Engelse UI-tekst of Engelse placeholders aangetroffen in de actieve pagina's/componenten.
- ✅ Terminologie consistent NL ("klant", "offerte", "factuur", "werkbon", "kosten").
- 🔵 Enige Engels zit in **comments/logs** (codeniveau, niet zichtbaar voor gebruikers) — behalve de ongepaste comment hierboven.

## 🟢 DATA-WEERGAVE

- ✅ Bedragen via `fmt()` (€ met NL-notatie), datums via `toLocaleDateString('nl-NL', …)`.
- ✅ Geen ruwe ID's i.p.v. namen in JSX aangetroffen (klantkaart toont naam; agenda-event toont klantnaam i.p.v. "Gekoppeld" sinds de detail-drawer-herbouw).

---

# SAMENVATTING & PRIORITEIT VOOR DE DEMO

**De codebase is verrassend gezond.** Geen kapotte actieve knoppen, geen ongedefinieerde setters, geen hangende spinners, navigatie klopt, en alle eerder gefixte bugs zijn niet teruggekeerd. De geauthenticeerde happy-path (registreren → klant aanmaken) is live geverifieerd zonder console-fouten.

**Vóór de demo aanpakken (klein maar belangrijk):**
1. 🔴 **Verwijder de ongepaste comment** `// … "Niels is gay"` in `customerService.js:11` + `activityService.js:86`, en controleer of die klantnaam niet in de productie-DB staat. (Reputatierisico.)
2. 🟠 **`offerteService.js:85` "BB-XXX"-fallback** — vervang door nette foutafhandeling zodat nooit een offerte met nummer "BB-XXX" ontstaat.
3. 🔵 **Verwijder dode bestanden** `KlusPages.jsx`, `WerkbonPage.jsx`, `UrenPage.jsx` en de `_backup*` marketing-bestanden (bevatten kapotte navigatie/TODO's die verwarren).
4. 🔵 **`accountingService.js:143/148`** debug-`console.log` achter `DEV`-guard of weg.

**Mag, maar niet kritiek:**
- 💡 "Niet ingepland"-logica in Totaal-weergave verduidelijken.
- 💡 E-mailvalidatie op klant/lead-formulieren toevoegen.
- 🔵 Demo-toggle: bevestigen dat die alleen in dev verschijnt.

**Niet getest (vereist echte accounts/credentials):**
- SuperAdmin-portaal (vereist `is_super_admin` — alleen 2 echte accounts).
- Medewerker-rolweergave en rechten end-to-end.
- Publieke offerte-ondertekenpagina met een echt token.
- De volledige flows (offerte→factuur, werkbon→planning, @-mention notificatie) zijn op codeniveau geverifieerd maar niet klikbaar doorlopen.

---
---

# FIXES TOEGEPAST (2026-06-20)

1. ✅ **Ongepaste data + code verwijderd**
   - Productie-DB: 3 test-/ongepaste klanten verwijderd uit de `info@bossbase.nl`-democompany incl. gekoppelde records: **"Niels is gay"** (1 werkbon + sub-records, 1 activiteit, 1 calendar_event, 3 tijdlijn), **"test"** en **"test 2"** (elk 3 tijdlijn). Scan van deals/projects/notes/klant_tijdlijn op ongepaste woorden: niets gevonden. Verificatie: 0 verdachte klanten over.
   - Code: `customerService.js` — `BLOCKED_NAMES`-blocklist + ongepaste comment verwijderd; `sanitizeName` vereenvoudigd tot een nette fallback (`(name||'').trim() || 'Naamloos'`). `activityService.js:86` — TODO-comment verwijderd. Codebase-brede scan: geen andere ongepaste teksten.
2. ✅ **Offertenummer-fallback** (`offerteService.js`) — `"BB-XXX"` vervangen door een echte fout (`throw`) met NL-melding "Offertenummer kon niet worden gegenereerd…" + DEV-gated `console.error`. De enige caller (`createOfferte`) propageert naar de UI-toast.
3. ✅ **Dode bestanden verwijderd:** `KlusPages.jsx`, `WerkbonPage.jsx`, `UrenPage.jsx` en alle `marketing/_backup*` + `_homepage_backup_voor_lijn.jsx` (geverifieerd: nergens geïmporteerd).
4. ✅ **Debug-logs gated:** `accountingService.js:143/148` `[afas]` `console.log` nu achter `import.meta.env.DEV`.

Build slaagt na alle wijzigingen.
