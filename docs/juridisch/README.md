# Juridische pagina's: stand van zaken

**Status: CONCEPT, niet gepubliceerd, niet juridisch getoetst.** Er zijn geen
goedgekeurde teksten. De website linkt niet naar `/privacy` of `/voorwaarden`
(die geven een echte 404).

- `privacyverklaring-CONCEPT.md` — concept op basis van vastgestelde feiten.
- `verwerkersovereenkomst-CONCEPT.md` — concept op basis van vastgestelde feiten.
- Hieronder: wat de eigenaren moeten aanleveren (deel 1) en wat onderzocht is
  (deel 2).

## Privacy-informatie op de website nu

- **Contactformulier:** korte uitleg boven een vinkje "Ik heb gelezen hoe
  BossBase mijn gegevens gebruikt …". Opgeslagen als
  `inquiries.metadata.privacy = { akkoord: true, versie, akkoord_op }`. Het
  veld heet "akkoord", maar betekent sinds versie
  `contactformulier-2026-09-29-v2` alleen: uitleg gelezen. Het is geen
  toestemming en wordt nergens voor andere doelen gebruikt. De inbox toont het
  als "Uitleg gelezen". De eerste testaanvraag heeft versie
  `contactformulier-2026-09-29` (de oude tekst "Ik ga ermee akkoord").
- **Registratie:** korte uitleg zonder vinkje, inclusief dat er tijdens en kort
  na de proefperiode mails komen over de proefperiode en het kiezen van een
  abonnement.

## Deel 1 — Van de eigenaren nodig

1. Juridische naam en rechtsvorm.
2. KvK-nummer en btw-id.
3. Zakelijk vestigingsadres, en of dat ook een bezoekadres is.
4. Een publiek telefoonnummer, als je dat wilt.
5. E-mailadres voor contact en voor privacyverzoeken (voorstel: info@bossbase.nl
   voor beide).
6. Bewaartermijnen. Voorstellen:
   - account en bedrijfsgegevens: zolang het account bestaat, daarna 2 jaar
     (de app belooft sinds 30 september 2026 géén termijn meer; zie deel 2);
   - financiële administratie: 7 jaar (fiscale bewaarplicht);
   - contactaanvragen: 12 maanden na afhandeling;
   - helpchatgesprekken: 12 maanden;
   - verzonden-mailregistratie: 12 maanden;
   - resettokens en verificatiecodes: direct na gebruik of verloop.
7. Prijswijzigingen. Voorstel: minimaal 30 dagen vooraf per e-mail aankondigen;
   bij een lopend jaarabonnement geldt de oude prijs tot het einde van de
   looptijd.
8. Beschikbaarheid. Voorstel: geen percentage beloven; "we doen ons best de
   dienst beschikbaar te houden en melden gepland onderhoud vooraf".
9. Aansprakelijkheid en meldtermijn voor datalekken (voorstel: 48 uur) —
   met jurist.
10. Proefperiodemails: afmeldlink toevoegen, of de commerciële mails (1 dag
    vóór en 15 dagen na het einde) aanpassen — met jurist.
11. Meldactie: automatische deelname behouden of een keuze toevoegen.

## Deel 2 — Onderzocht (29 september 2026)

Vastgesteld in de code en productie (alleen schema en aantallen):

- **Gegevens per functie:** zie tabel §3 van het privacyconcept en §3 van de
  verwerkersovereenkomst.
- **Proefperiodemails:** vijf mails, 7 en 3 dagen vóór, 1 dag vóór, 1 dag na
  en 15 dagen na het einde van de proefperiode, aan de oudste actieve beheerder.
  De eerste twee zijn vooral informatief; de mail van 1 dag vóór het einde
  bevat een aanbod, die van 15 dagen erna is vooral een herinnering om te
  kopen. **Geen afmeldlink.** Uitsluiten kan alleen intern.
- **Account verwijderen:** soft delete. Profiel inactief, inlogaccount en alle
  gegevens en bestanden blijven. Beheerder opzeggen: bedrijf "opgezegd",
  gebruikers inactief, alle bedrijfsdata blijft; het Stripe-abonnement wordt
  daarbij niet automatisch gestopt. De oude belofte in de app ("na 2 jaar, financieel
  na 7 jaar definitief verwijderd") was niet gebouwd en is op 30 september 2026
  vervangen door: gegevens worden niet automatisch verwijderd; verwijdering
  aanvragen via info@bossbase.nl.
- **Leveranciers:** Supabase, Vercel, Stripe, Resend, Anthropic, PDOK (vanuit de
  browser), Moneybird en SnelStart (alleen bij een koppeling). Google Agenda en
  AFAS zijn verborgen in de app, maar er bestaat in productie elk één koppeling.
- **Opslagregio:** Supabase-database in Central EU (Frankfurt).
- **Cookies en browseropslag:** geen cookies uit de eigen code; wel
  localStorage (inlogsessie, cookiekeuze, weergavevoorkeuren, filters) en
  sessionStorage (gekozen bedrijf, aanmeldpakket). Sinds 30 september 2026
  (commit 9c1df8b op main): geen cookiebanner meer, wel Vercel Web Analytics
  zonder cookies; zie `cookiebeleid.md`.

**Niet vast te stellen met de beschikbare toegang (ONBEKEND):**

- Regio van Supabase Edge Functions en logs; bewaartermijn van die logs.
- Regio van de Vercel-functie en Vercel-logs.
- Regio van het Resend-account.
- Regio's en doorgiftemechanismen bij Stripe en Anthropic.
- Of er met Supabase, Vercel, Stripe, Resend en Anthropic een
  verwerkersovereenkomst is **afgesloten** (een beschikbaar standaarddocument
  is geen bewijs).
- Hoe lang Anthropic chatberichten bewaart.
- Of Vercel of Stripe cookies op hun eigen domeinen zetten tijdens gebruik.
- Of het Stripe-abonnement bij opzeggen elders wordt stopgezet.

## Na goedkeuring

1. Voeg `/privacy` en `/voorwaarden` toe in `src/marketing/routes.jsx`.
2. Zet de links in de footer, bij het contactformulier en bij de registratie.
3. Zet `PRIVACY_VERSIE` in `ContactPage.jsx` op de versiedatum van de
   gepubliceerde privacyverklaring.
4. `npm run build` controleert daarna alle links.
