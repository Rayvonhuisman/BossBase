# Droogloop opschoonjob — 30 september 2026

**Alleen lezen, alleen aantallen.** Uitgevoerd met
`supabase/tests/opschonen_droogloop.sql` tegen productie. Geen namen,
e-mailadressen of id's. Bij deze droogloop stond de cron **uit**. Hij is op
30-09-2026 even aangezet (migratie 20260930160803) en dezelfde dag weer
gepauzeerd (migratie 20260930170500); hij draait nu **niet** en gaat niet aan
zonder apart besluit over de termijnen. Zie docs/uitrol-accountverwijdering.md.

## Selectiecriteria

Een bedrijf wordt verwijderd als het einde van zijn abonnement langer geleden is
dan de termijn (voorstel: 2 jaar, **niet goedgekeurd**). Het einde is
(`bb_opschoning_einde`):

| Situatie | Einde |
| --- | --- |
| Lopend Stripe-abonnement (actief, proef, betaalprobleem) | geen — nooit |
| Stripe-abonnement beëindigd | `cancelled_at` |
| Opgezegd in de app, geen lopend abonnement | `opgezegd_op` |
| Proefperiode zonder betaald abonnement | einde proefperiode |
| Overig (bijvoorbeeld handmatig op actief gezet zonder Stripe) | geen — nooit |

## Uitkomst

| Soort | Bedrijven | Nu te verwijderen | Eerste datum |
| --- | --- | --- | --- |
| Overig (handmatig actief, geen Stripe) | 6 | 0 | — |
| Proefperiode zonder betaald abonnement | 1 | 0 | 27 augustus 2028 |

Losse termijnen (voorstel): contactformulier 0, Boss-gesprekken 0, meldpunt 0,
resettokens 0, aanmeldcodes 2 (ouder dan 24 uur).

## Uitzonderingen

| Wat | Aantal nu |
| --- | --- |
| Superbeheerders (inlogaccount blijft, profiel wordt losgekoppeld) | 2 |
| Profielen die ook lid zijn van een ander bedrijf | 0 |
| Bestanden waar meer dan één bedrijf naar verwijst (blijven staan) | 0 |
| Bestanden zonder verwijzing en niet in een bedrijfsmap (worden nooit opgeschoond) | 9 |

## Wat opvalt

- De 6 bedrijven zonder Stripe-abonnement vallen nooit onder de regel, ook niet
  als ze stoppen. Pas als de eigenaar "Bedrijf sluiten" gebruikt, telt
  `opgezegd_op`.
- 9 bestanden horen bij geen enkel bedrijf aantoonbaar; de job laat ze staan.
  Uitzoeken wat het zijn vraagt inzage in bestandsnamen en valt buiten deze
  droogloop.

## Wat vóór aanzetten nodig was (en nog openstaat)

1. Besluit over de termijn(en).
2. M2 (`20260930181000`) uitgerold; zonder die correcties faalt de job op
   bedrijven met een actieve beheerder en kiest hij bestanden te ruim.
3. Een droogloop via de echte functie (`{"droogloop": true}`) na de uitrol,
   beoordeeld.
4. Vastgesteld welke back-ups er zijn.
