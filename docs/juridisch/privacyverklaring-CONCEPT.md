# CONCEPT — Privacyverklaring BossBase

> **Niet publiceren.** Dit is een werkconcept op basis van wat in de code is
> vastgesteld (29 september 2026). Alles tussen [[dubbele haken]] moet door de
> eigenaren worden ingevuld; het geheel moet juridisch worden getoetst.
> Grondslagen, bewaartermijnen en doorgiftemechanismen zijn bewust niet
> ingevuld: die mogen we niet verzinnen.

## Wie we zijn

BossBase, [[rechtsvorm]], ingeschreven bij de KVK onder [[KvK-nummer]],
gevestigd te [[adres]]. Contact over privacy: info@bossbase.nl.

## Twee rollen

1. **Verwerkingsverantwoordelijke** voor gegevens van bezoekers van
   bossbase.nl, van mensen die contact met ons opnemen en van onze
   klanten (de gebruikers van BossBase).
2. **Verwerker** voor de gegevens die onze klanten in BossBase zetten over hún
   klanten, medewerkers en leveranciers. Daarvoor sluiten we een
   verwerkersovereenkomst [[nog op te stellen]].

## Welke gegevens, waarvoor (vastgesteld in de code)

| Gegevens | Doel | Grondslag | Bewaartermijn |
| --- | --- | --- | --- |
| Account: naam, e-mailadres, wachtwoord (versleuteld opgeslagen door de inlogdienst), bedrijfsgegevens | Account en toegang | [[ ]] | [[ ]] |
| Abonnement en betaling (via Stripe) | Facturering van het abonnement | [[ ]] | [[ ]] — let op fiscale bewaarplicht |
| E-mails die BossBase namens de klant verstuurt (offertes, facturen, herinneringen) | Uitvoering dienst | Als verwerker | [[ ]] |
| Berichten aan de helpchat "Boss" | Beantwoorden van gebruiksvragen | [[ ]] | [[ ]] |
| E-mail aan info@bossbase.nl | Beantwoorden van vragen | [[ ]] | [[ ]] |
| Contactformulier op bossbase.nl: naam, e-mailadres, bericht en optioneel bedrijfsnaam, telefoon, branche en onderwerp, plus het adres van de pagina (zonder querystring) | Beantwoorden van het bericht; opgeslagen als aanvraag in het dashboard | [[ ]] | [[ ]] |
| Telling tegen misbruik van het formulier: HMAC-hash van IP-adres en e-mailadres, per tijdvenster | Beperken van spam en misbruik | [[ ]] | [[ ]] |
| Proefperiodemails (dag 7, 11, 14, 15 en 30) | Informeren over de proefperiode | [[ ]] | — |

## Met wie we gegevens delen (subverwerkers, vastgesteld in de code)

| Partij | Waarvoor | Doorgifte buiten de EER? |
| --- | --- | --- |
| Supabase | Database, inloggen, opslag, serverfuncties | [[regio van het project controleren]] |
| Vercel | Hosting van de website en app | [[ ]] |
| Stripe | Betaling van abonnementen; betaallinks op facturen van klanten (via hun eigen Stripe-account) | [[ ]] |
| Resend | Versturen van e-mail | [[ ]] |
| Anthropic | Antwoorden van de helpchat "Boss" | [[ ]] |
| PDOK (Kadaster) | Adres aanvullen bij invoer | [[ ]] |
| Moneybird / SnelStart | Alleen als de klant die koppeling zelf aanzet | — |

Geen analyse- of advertentiediensten. Lettertypen worden sinds deze release
zelf gehost; er gaat daarvoor geen verzoek meer naar Google.

## Cookies en opslag in de browser

[[Na het meetbesluit invullen. Nu vastgesteld: inlogsessie en voorkeuren
(zoals de cookiekeuze en een ingeklapte zijbalk) in de browseropslag; geen
tracking.]]

## Je rechten

Inzage, correctie, verwijdering, beperking, bezwaar en overdraagbaarheid.
Verzoek via info@bossbase.nl; we reageren binnen [[termijn]]. Klacht indienen
kan bij de Autoriteit Persoonsgegevens.

Let op voor de tekst: het verwijderen van een account in de app wist
gegevens niet direct (soft delete). Beschrijf wat er dan gebeurt en na welke
termijn gegevens echt worden verwijderd [[vaststellen]].

## Wijzigingen

Versie [[datum]].
