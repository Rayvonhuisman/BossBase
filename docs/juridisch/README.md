# Juridische pagina's: stand van zaken en wat er nodig is

**Status: niet gepubliceerd.** Er bestaan geen goedgekeurde teksten voor een
privacyverklaring, algemene voorwaarden, een cookieverklaring of een
verwerkersovereenkomst. De website linkt daarom (nog) niet naar `/privacy` of
`/voorwaarden`: die adressen geven een 404, geen lege pagina. Het concept in
deze map is **niet juridisch getoetst** en mag niet zo gepubliceerd worden.

## Wat er in deze release is gedaan

- Footerlinks naar niet-bestaande pagina's verwijderd.
- Het contactformulier verstuurde niets (het toonde "Bericht ontvangen" zonder
  verzending). Het zet het bericht nu klaar in het e-mailprogramma van de
  bezoeker; er gaan via de website geen gegevens naar BossBase.
- `/cookieverklaring` (lege placeholder, alleen gelinkt vanuit de cookiebanner
  in de app) krijgt `noindex` en staat niet in de sitemap.

## Wat er nodig is om te publiceren

| Onderdeel | Nodig | Van wie |
| --- | --- | --- |
| Bedrijfsgegevens | Juiste naam en rechtsvorm, KvK-nummer, btw-id, vestigingsadres | Eigenaren |
| Privacyverklaring | Zie concept; bewaartermijnen, grondslagen en doorgifte vaststellen | Eigenaren + jurist |
| Algemene voorwaarden | Proefperiode, looptijd en opzegging (zie productfeiten), prijswijzigingen, aansprakelijkheid, beschikbaarheid, gegevens bij vertrek | Jurist |
| Verwerkersovereenkomst | BossBase verwerkt klantgegevens van gebruikers als verwerker | Jurist |
| Cookieverklaring | Pas zinvol als bekend is wat er wordt opgeslagen en gemeten (zie `docs/seo/meting.md`) | Na meetbesluit |

## Na goedkeuring

1. Voeg de teksten toe als pagina's `/privacy`, `/voorwaarden` (en eventueel
   `/verwerkersovereenkomst`) in `src/marketing/routes.jsx`, bijvoorbeeld als
   Markdown in `src/content/juridisch/` met een eigen, eenvoudig sjabloon.
2. Zet de links terug in de footer (`FOOTER_LINKS` in
   `src/pages/marketing/MktShared.jsx`) en bij de registratie.
3. Leg de versie vast (datum) en noem die in de tekst.
4. `npm run build` controleert dat alle links kloppen.
