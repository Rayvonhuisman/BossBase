# Juridische pagina's: stand van zaken

**Status: CONCEPT, niet gepubliceerd, niet juridisch getoetst.** Er bestaan geen
goedgekeurde teksten voor een privacyverklaring, algemene voorwaarden, een
cookieverklaring of een verwerkersovereenkomst. De website linkt daarom niet
naar `/privacy` of `/voorwaarden`; die adressen geven een echte 404. Het concept
in `privacyverklaring-CONCEPT.md` is een werkversie en mag zo niet online.

## Hoe de website nu met privacy-informatie omgaat

- **Contactformulier (`/contact`).** Het formulier stuurt de aanvraag naar de
  Edge Function `public-website-inquiry`, die hem opslaat in `public.inquiries`
  bij het BossBase-bedrijf; in het dashboard staat hij onder "Aanvragen".
- Er is **geen link** naar een privacyverklaring. Direct boven het vinkje staat
  een korte, feitelijke tekst: welke gegevens worden opgeslagen, waarvoor, en
  dat je via info@bossbase.nl inzage of verwijdering kunt vragen. Ook staat erin
  dat de server inzendingen per IP- en e-mailadres telt, in gehashte vorm, tegen
  misbruik.
- Het formulier stuurt `privacy_versie: "contactformulier-2026-09-29"` mee. Die
  waarde verwijst naar **die formuliertekst**, niet naar een privacyverklaring.
  Verandert de tekst, verander dan ook de versie in
  `src/pages/marketing/ContactPage.jsx` (constante `PRIVACY_VERSIE`).
- Geen bewaartermijn genoemd: die is nog niet vastgesteld (zie invullijst).
- `/cookieverklaring` is een lege placeholder uit de app. Hij krijgt `noindex`
  en staat niet in de sitemap.

## Invullijst — wat nodig is om af te ronden

Vul in, laat toetsen door een jurist, en publiceer pas daarna.

| # | Gegeven of keuze | Nodig voor | Stand |
| --- | --- | --- | --- |
| 1 | Juridische naam en rechtsvorm van BossBase | Alle drie | Onbekend (alleen "BossBase B.V." in een ongebruikt, oud bestand) |
| 2 | KvK-nummer | Alle drie, footer, contact | Onbekend |
| 3 | Btw-id | Voorwaarden, facturen | Onbekend |
| 4 | Vestigingsadres (of "geen bezoekadres") | Alle drie, contact | Twee verschillende adressen in oude code (Emmen en Amsterdam); niet bevestigd, daarom van de site gehaald |
| 5 | Telefoonnummer voor klanten, ja of nee | Contact | Twee verschillende nummers in oude code; niet bevestigd, daarom van de site gehaald |
| 6 | Contactpersoon of adres voor privacyverzoeken | Privacyverklaring | Voorstel: info@bossbase.nl |
| 7 | Grondslag per verwerking (account, abonnement, contactformulier, proefperiodemails, Boss-chat) | Privacyverklaring | Te bepalen met jurist |
| 8 | Bewaartermijnen: contactaanvragen, accounts na opzegging, abonnementsgegevens, chatberichten, telling tegen misbruik | Privacyverklaring | Niet vastgesteld |
| 9 | Wat er gebeurt na "account verwijderen" (nu een soft delete) en na welke termijn gegevens echt weg zijn | Privacyverklaring, voorwaarden | Niet vastgesteld |
| 10 | Regio's en doorgifte buiten de EER per subverwerker (Supabase, Vercel, Stripe, Resend, Anthropic) | Privacyverklaring, verwerkersovereenkomst | Te controleren in de accounts van die diensten |
| 11 | Verwerkersovereenkomsten mét deze subverwerkers | Verwerkersovereenkomst | Te controleren |
| 12 | Aansprakelijkheid en beschikbaarheid (geen garanties verzinnen) | Voorwaarden | Te bepalen met jurist |
| 13 | Prijswijzigingen: hoe en met welke termijn aangekondigd | Voorwaarden | Te bepalen |
| 14 | Keuze analysedienst en toestemming (zie `docs/seo/meting.md`) | Cookieverklaring, privacyverklaring | Open |

Vastgesteld in de code en al bruikbaar: proefperiode (14 dagen, functies van
Groei, geen betaalgegevens, daarna alleen-lezen), maand- en jaarabonnement,
opzegging, downgraden, modules en prijzen. Zie `docs/seo/productfeiten.md`.

## Na goedkeuring

1. Voeg `/privacy` en `/voorwaarden` (en eventueel `/verwerkersovereenkomst`)
   toe in `src/marketing/routes.jsx`, bijvoorbeeld als Markdown in
   `src/content/juridisch/` met een eenvoudig sjabloon.
2. Zet de links in de footer (`FOOTER_LINKS` in
   `src/pages/marketing/MktShared.jsx`) en in het contactformulier.
3. Zet `PRIVACY_VERSIE` in `ContactPage.jsx` op de versiedatum van de
   gepubliceerde privacyverklaring.
4. `npm run build` controleert daarna dat alle links kloppen.
