# CONCEPT — Privacyverklaring BossBase

> **Niet publiceren. Niet juridisch getoetst.** Opgesteld op 29 september 2026
> op basis van wat in de code en de productiedatabase (alleen schema en
> aantallen) is vastgesteld. `[[…]]` = gegeven of keuze van de eigenaren.
> `[[JURIST]]` = juridische keuze die een jurist moet maken of toetsen.
> `[[TE CONTROLEREN]]` = feit dat niet met de beschikbare toegang vast te
> stellen was.

## 1. Wie we zijn

BossBase is een dienst van [[juridische naam]], [[rechtsvorm]], gevestigd aan
[[zakelijk vestigingsadres]], ingeschreven bij de KVK onder [[KvK-nummer]]. Voor
vragen over privacy: [[e-mailadres voor privacyverzoeken]].

## 2. Twee rollen

- **Verwerkingsverantwoordelijke** voor gegevens van bezoekers van
  bossbase.nl, van wie contact opneemt, en van onze gebruikers (accounts,
  abonnementen, support).
- **Verwerker** voor de gegevens die onze gebruikers in BossBase vastleggen over
  hún klanten, leveranciers en medewerkers (klantgegevens, offertes, werkbonnen,
  facturen, uren, foto's, handtekeningen). Daarvoor geldt de
  verwerkersovereenkomst; zie het aparte concept.

## 3. Welke gegevens, waarvoor, op welke grondslag, hoe lang

| Verwerking | Gegevens (vastgesteld) | Doel | Grondslag | Bewaartermijn |
| --- | --- | --- | --- | --- |
| Account en registratie | Naam, e-mailadres, wachtwoord (door de inlogdienst versleuteld opgeslagen), bedrijfsnaam, telefoon, KvK-nummer; verificatiecode (gehasht, 10 minuten geldig) | Account aanmaken en toegang geven | Uitvoering overeenkomst [[JURIST]] | [[voorstel: zolang het account bestaat + 2 jaar na opzegging]] |
| Wachtwoordherstel | E-mailadres, resettoken | Nieuw wachtwoord instellen | Uitvoering overeenkomst [[JURIST]] | [[voorstel: token na gebruik of 1 uur verwijderen]] — nu geen opschoning |
| Bedrijfsprofiel | Bedrijfsnaam, KvK, btw-nummer, adres, telefoon, e-mail, website, logo | Dienst leveren; op offertes en facturen van de gebruiker | Uitvoering overeenkomst [[JURIST]] | Zolang het account bestaat [[+ termijn]] |
| Abonnement en betaling | Bedrijfsnaam, e-mail, factuuradres (door Stripe gevraagd), Stripe-id's, plan, perioden | Abonnement afrekenen | Uitvoering overeenkomst; wettelijke bewaarplicht [[JURIST]] | Financiële administratie 7 jaar (fiscale bewaarplicht) |
| Proefperiodemails | E-mailadres van de beheerder | Vijf mails: 7 en 3 dagen vóór het einde (hoe het gaat, einddatum), 1 dag vóór het einde (met aanbod jaarabonnement), 1 dag na het einde (account alleen-lezen) en 15 dagen na het einde (herinnering om een abonnement te kiezen). Vanaf 3 dagen vóór het einde elk met een knop om een abonnement te kiezen | [[JURIST]]: voor de commerciële mails is toestemming of een afmeldmogelijkheid nodig (zie §9) | Registratie van verzonden mails [[termijn]] |
| Contactformulier | Naam, e-mailadres, bericht; optioneel bedrijfsnaam, telefoon, branche, onderwerp; adres van de pagina (zonder querystring); bevestiging dat de privacy-uitleg is gelezen, met versie en tijdstip | Bericht beantwoorden | [[JURIST]]: gerechtvaardigd belang of precontractueel | [[voorstel: 12 maanden na afhandeling]] — nu geen opschoning |
| Misbruik van het formulier beperken | HMAC-hash van IP-adres en e-mailadres met een teller | Spam en misbruik tegengaan | Gerechtvaardigd belang [[JURIST]] | 1 dag (automatisch opgeschoond) |
| Helpchat Boss | Chatberichten (rol, tekst, tijdstip), titel (eerste 80 tekens) | Gebruiksvragen beantwoorden | [[JURIST]] | [[voorstel: 12 maanden]] — nu geen opschoning; gebruikers kunnen gesprekken nu niet zelf verwijderen |
| Boss doorzetten naar het team | Naam, e-mail, bedrijfsnaam en het volledige gesprek, per e-mail aan ons team | Vraag door een mens laten beantwoorden | [[JURIST]] | [[termijn]] |
| Meldpunt (bug of idee) | Omschrijving, naam, e-mail, rol, abonnement, bedrijfsnaam, pagina-adres, browser, schermgrootte, optioneel een zelf gekozen schermafbeelding | Fouten oplossen, product verbeteren | Gerechtvaardigd belang [[JURIST]] | [[termijn]] |
| Meldactie (indien actief) | Deelname aan een prijsactie bij een melding | Actie uitvoeren | [[JURIST]]: nu automatische deelname, geen keuze | [[termijn]] |
| Verzonden e-mails namens de gebruiker | Ontvanger, onderwerp, volledige HTML van de mail, klant-id; fouten | Bewijs van verzending, foutopsporing | [[JURIST]] | [[termijn]] — nu geen opschoning |
| Adres zoeken | De getypte zoektekst gaat vanuit je browser naar PDOK (Kadaster), met je IP-adres | Adres aanvullen | [[JURIST]] | BossBase slaat niets op |
| Logbestanden | Edge Function-logs bevatten bij verificatie en wachtwoordherstel het e-mailadres | Beveiliging en foutopsporing | Gerechtvaardigd belang [[JURIST]] | [[TE CONTROLEREN]]: bewaartermijn van logs bij Supabase en Vercel |

## 4. Met wie we gegevens delen

| Partij | Waarvoor | Vanuit | Opslagregio / doorgifte |
| --- | --- | --- | --- |
| Supabase | Database, inloggen, bestandsopslag, serverfuncties | Browser en server | Database: Central EU (Frankfurt), vastgesteld. Serverfuncties en logs: [[TE CONTROLEREN]] |
| Vercel | Hosting van website en app; één serverfunctie (SnelStart-webhook) | Browser en server | [[TE CONTROLEREN]]: regio van de functie en van logs |
| Stripe | Abonnementen; betaallinks op facturen van gebruikers (via hun eigen Stripe-account) | Server; betaler op de pagina van Stripe | [[TE CONTROLEREN]] |
| Resend | Versturen van alle e-mail | Server | [[TE CONTROLEREN]] (regio van het account) |
| Anthropic | Antwoorden van de helpchat; alleen de chatberichten, geen naam of e-mail | Server | [[TE CONTROLEREN]] |
| PDOK (Kadaster) | Adres zoeken | Browser | Nederland (overheid) [[TE CONTROLEREN]] |
| Moneybird / SnelStart | Alleen als de gebruiker die koppeling aanzet | Server | Niet door BossBase bepaald |

Geen analyse-, advertentie- of trackingdiensten. Lettertypen worden zelf gehost.

## 5. Cookies en opslag in je browser

BossBase zet zelf geen cookies. Wel gebruikt de website en app de
browseropslag (localStorage en sessionStorage):

- **Noodzakelijk:** je inlogsessie (`sb-…-auth-token`), het gekozen bedrijf in
  deze sessie, je keuze in de cookiebanner.
- **Voorkeuren:** ingeklapte zijbalk, weergave van lijsten, opgeslagen filters,
  kostenweergave, planningslegenda, uitstel van de urenherinnering, gekozen
  pakket tijdens het aanmelden.

Geen tracking. De cookiebanner slaat je keuze op, maar er is niets dat door die
keuze aan- of uitgaat. [[JURIST]]: banner vereenvoudigen tot informatie, of
weghalen.

## 6. Bewaren en verwijderen

[[JURIST en eigenaren]]: vaststellen per regel in §3.

Feitelijke stand (moet in lijn gebracht worden vóór deze tekst klopt):

- "Account verwijderen" zet het account op inactief; gegevens, het
  inlogaccount en bestanden blijven bestaan.
- De app belooft "2 jaar bewaren, financiële administratie 7 jaar, daarna
  definitief verwijderd", maar die verwijdering is niet gebouwd.
- Opzeggen door een beheerder stopt het Stripe-abonnement niet automatisch
  [[TE CONTROLEREN]].

## 7. Beveiliging

[[Alleen noemen wat aantoonbaar is.]] Vastgesteld: toegang per bedrijf via
databaseregels; handtekeningen en ondertekende documenten in niet-openbare
opslag; wachtwoorden niet door BossBase zelf opgeslagen.

## 8. Je rechten

Inzage, correctie, verwijdering, beperking, bezwaar, overdraagbaarheid. Verzoek
via [[e-mailadres]]; reactie binnen [[termijn, AVG: uiterlijk 1 maand]]. Klacht
indienen kan bij de Autoriteit Persoonsgegevens.

## 9. Openstaande juridische punten (niet in de gepubliceerde tekst)

- Commerciële proefperiodemails zonder afmeldlink: [[JURIST]] toetsen aan de
  Telecommunicatiewet (art. 11.7); afmeldlink toevoegen.
- Automatische deelname aan de meldactie.
- Belofte over verwijderen in de app klopt niet met de werking.
- E-mailadressen in Edge Function-logs.
- Resettokens ongehasht opgeslagen en niet opgeschoond.

## 10. Wijzigingen

Versie [[datum]].
