# Procedure: verzoeken om gegevens te verwijderen

**Status: werkprocedure, niet juridisch getoetst.** Gebaseerd op het
productieschema zoals gemeten op 30 september 2026 (alleen structuur en
aantallen, geen inhoud). Termijnen met [[…]] zijn nog niet besloten.

De app zegt sinds 30 september 2026 bij "Account verwijderen": het account
wordt gedeactiveerd, gegevens worden niet automatisch verwijderd, verwijderen
kan via info@bossbase.nl. Deze procedure is wat er daarna gebeurt.

## 1. Ontvangst (voor elk verzoek)

1. **Vastleggen** in een verzoekenlog (alleen: datum, soort verzoek, bedrijf-id
   of gebruiker-id, wie het afhandelt, uitkomst, datum afgerond). Geen kopie
   van de gegevens zelf.
2. **Termijn:** de AVG geeft één maand na ontvangst (art. 12 lid 3), in
   bijzondere gevallen te verlengen met twee maanden, mits je dat binnen de
   eerste maand meldt.
3. **Identiteit controleren:** alleen uitvoeren als het verzoek komt van het
   e-mailadres van het account, of na bevestiging vanaf dat adres. Voor een heel
   bedrijf: alleen op verzoek van een beheerder van dat bedrijf.
4. **Ontvangst bevestigen** met wat er gaat gebeuren en wat er blijft (zie 3).

## 2. Welk soort verzoek?

| Wie vraagt | Wie is verantwoordelijk | Wat BossBase doet |
| --- | --- | --- |
| A. Websitebezoeker (contactformulier) | BossBase | Aanvraag verwijderen (§4.A) |
| B. Beheerder van een klantbedrijf, voor het hele bedrijf | BossBase voor het account; de klant voor zijn eigen administratie | Export aanbieden, dan bedrijf verwijderen (§4.B) |
| C. Gebruiker of oud-medewerker van een klantbedrijf | Klant (werkgever) voor werkgegevens; BossBase voor het inlogaccount | Inlog verwijderen, profiel anonimiseren (§4.C) |
| D. Klant, leverancier of aanvrager van een klant van BossBase | De klant van BossBase | Doorverwijzen naar dat bedrijf; op zijn verzoek helpen |

Bij D beslist BossBase niet zelf: die gegevens zijn van de klant, die ze in
BossBase zelf kan verwijderen (klant, offerte, werkbon).

## 3. Wat kan weg, wat blijft

| Gegevens | Kan weg? | Waarom |
| --- | --- | --- |
| Alle bedrijfsdata in BossBase (klanten, offertes, werkbonnen, planning, uren, facturen van de klant aan zíjn klanten, foto's, handtekeningen) | Ja | De bewaarplicht voor die facturen ligt bij de klant zelf. Daarom eerst een export aanbieden. |
| Inlogaccount (auth.users) en profiel | Ja | |
| Helpchatgesprekken (boss_conversations) | Ja, in BossBase | Wat Anthropic zelf bewaart: [[TE CONTROLEREN]] |
| Facturen van BossBase áán de klant (abonnement), in Stripe | **Blijft** | Fiscale bewaarplicht van BossBase: 7 jaar (art. 52 AWR). Alleen wat daarvoor nodig is. |
| Mailfouten, meldingen, webhooklog met bedrijfsnaam of e-mailadres | Ja, apart | Blijven anders staan (zie §5) |
| Back-ups en logs bij Supabase, Resend, Vercel | Verlopen vanzelf | Niet los te wissen; termijnen [[TE CONTROLEREN]] per plan |
| Administratie in Moneybird of SnelStart | Niet door BossBase | Het eigen account van de klant; BossBase verwijdert alleen de koppeling |

## 4. Handelingen

Alles hieronder is handwerk door iemand met toegang tot het Supabase-dashboard.
Er is bewust nog geen verwijderfunctie in de app. Werk altijd in deze volgorde:
**tellen → droogloop in een teruggedraaide transactie → uitvoeren → natellen.**

### A. Websitebezoeker

1. Zoek de aanvraag in Aanvragen (dashboard) op het e-mailadres uit het verzoek.
2. Verwijder de rij in `inquiries` (bij het contactformulier van bossbase.nl:
   de rij onder het BossBase-bedrijf).
3. `website_inquiry_attempts` bevat alleen gehashte IP- en e-mailwaarden voor
   misbruikbeperking; daar valt niets op naam te vinden.

### B. Heel bedrijf

1. **Stripe:** controleer dat het abonnement gestopt is. Sinds 1e55125 doet
   "Account verwijderen" dat bij een beheerder; bij een eerder opgezegd
   bedrijf handmatig controleren in Stripe.
2. **Export aanbieden:** de klant kan klanten exporteren (Excel/CSV) en
   documenten als ZIP downloaden. Stuur de klant daarop en noteer de datum.
   Voer de verwijdering pas uit na [[termijn, voorstel: 14 dagen]] of na
   akkoord van de klant.
3. **Bestanden verzamelen vóór het verwijderen van rijen.** Opslag wordt niet
   meeverwijderd met de database, en de mappen zijn niet overal per bedrijf
   ingedeeld (gemeten: in `signatures` staat 0 van 26 bestanden in een
   bedrijfsmap, in `signed-offertes` 3 van 20). De paden staan in de rijen zelf
   (offertes, werkbonnen, facturen, werkbon_fotos, project_fotos, kosten,
   meldingen, bedrijfslogo). Verzamel die paden eerst per bucket:
   `avatars`, `bedrijf-logos`, `factuur-pdfs`, `kosten-bijlagen`, `meldingen`,
   `project-fotos`, `signatures`, `signed-offertes`, `signed-werkbonnen`,
   `werkbon-fotos`.
4. **Rijen die niet meegaan met het bedrijf** apart verwijderen (ze houden
   anders naam of e-mailadres vast): `mail_fouten`, `meldingen`,
   `snelstart_webhook_log` op `company_id`.
   `stripe_billing_events` bevat alleen event-id, type en uitkomst en mag
   blijven.
5. **Het bedrijf verwijderen** (`delete from companies where id = …`). Alle
   andere bedrijfstabellen (ruim 60) hangen daar met `on delete cascade` aan.
6. **Gebruikers verwijderen:** elke gebruiker van dat bedrijf via
   Authentication → Users → Delete user. Dat neemt profiel, helpchat en
   limieten mee. Daarna zoeken op e-mailadres in `password_reset_attempts`,
   `email_verification_attempts`, `email_verification_codes` en
   `email_send_attempts`, en die rijen verwijderen.
7. **Bestanden verwijderen** met de paden uit stap 3.
8. **Natellen** en afronden in het verzoekenlog. Bevestig de klant wat er
   verwijderd is en wat er blijft (Stripe-facturen).

### C. Eén gebruiker binnen een bedrijf

Volledig verwijderen kan lang niet altijd: `werkbon_uren.profile_id` heeft
geen cascade. Een medewerker met geboekte werkbonuren kan niet worden
verwijderd zonder de nacalculatie en facturatie van de klant te breken. Daarom:

1. Overleg met de beheerder van het bedrijf (de werkgever beslist over de
   werkgegevens).
2. Inlogaccount verwijderen of blokkeren, en het profiel **anonimiseren**:
   naam wordt "Verwijderde gebruiker", e-mail, telefoon en foto leeg,
   `actief = false`. Uren, werkbonnen en notities blijven dan aan een
   naamloos profiel hangen.
3. Tabellen van stap B.6 opschonen op zijn e-mailadres.

## 5. Bekende valkuilen (gemeten)

- `mail_fouten`, `meldingen` en `snelstart_webhook_log` hebben `on delete set
  null`: bij het verwijderen van het bedrijf blijven de rijen staan, mét
  `bedrijf_naam`, en in `meldingen` ook `gebruiker_naam` en `gebruiker_email`.
- `werkbon_fotos.company_id` heeft geen cascade, maar gaat via `werkbonnen`
  wel mee. Toets dit in de droogloop.
- `werkbon_uren.profile_id` blokkeert het verwijderen van een profiel met
  geboekte uren (zie C).

## 6. Wat nog nodig is om dit sneller en foutloos te doen

Een beoordeelde, per bedrijf te draaien procedure (SQL plus een script voor de
opslag) met droogloop en telling. Die is bewust **niet** gebouwd in de
SEO-release; bouw hem pas als de termijnen in §3 en §4 besloten zijn.
