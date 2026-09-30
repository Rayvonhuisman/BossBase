# CONCEPT — Privacyverklaring BossBase

> **Niet publiceren. Niet juridisch getoetst.** Opgesteld op 29 september 2026
> op basis van wat in de code en de productiedatabase (alleen schema en
> aantallen) is vastgesteld. `[[…]]` = gegeven of keuze van de eigenaren.
> `[[JURIST]]` = juridische keuze die een jurist moet maken of toetsen.
> `[[TE CONTROLEREN]]` = feit dat niet met de beschikbare toegang vast te
> stellen was.

## 1. Wie we zijn

BossBase is een handelsnaam van NG E-Commerce B.V., gevestigd aan Sodalietdreef 6,
7828 CR Emmen, ingeschreven bij de KVK onder 91856396. Voor vragen over privacy:
info@bossbase.nl.

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
| Account en registratie | Naam, e-mailadres, wachtwoord (door de inlogdienst versleuteld opgeslagen), bedrijfsnaam, telefoon, KvK-nummer; verificatiecode (gehasht, 10 minuten geldig) | Account aanmaken en toegang geven | Uitvoering overeenkomst [[JURIST]] | Zolang het account bestaat, en 2 jaar na het einde van het abonnement |
| Wachtwoordherstel | E-mailadres, resettoken | Nieuw wachtwoord instellen | Uitvoering overeenkomst [[JURIST]] | [[voorstel: token na gebruik of 1 uur verwijderen]] — nu geen opschoning |
| Bedrijfsprofiel | Bedrijfsnaam, KvK, btw-nummer, adres, telefoon, e-mail, website, logo | Dienst leveren; op offertes en facturen van de gebruiker | Uitvoering overeenkomst [[JURIST]] | Zolang het account bestaat, en 2 jaar na het einde van het abonnement |
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
| Gebruiksstatistieken (Vercel Web Analytics), website en app | Per paginabezoek: tijdstip, pagina-adres waaruit tokens, id's en querystrings (behalve `utm_*` en `ref`) vooraf zijn verwijderd, verwijzende site, land en regio (afgeleid uit het IP-adres, dat niet wordt bewaard), besturingssysteem, browser en soort apparaat. Twee gebeurtenissen: klik op een link naar `/register` en een gelukte aanmelding, zonder persoonsgegevens. Een hash van het verzoek om bezoeken te tellen, na 24 uur weggegooid. Geen cookies, niets opgeslagen op het apparaat | Zien hoe website en app gebruikt worden en ze verbeteren | Gerechtvaardigd belang [[JURIST]]; geen toestemming nodig op grond van art. 11.7a lid 3 sub b Tw (analytics met geen of geringe privacygevolgen, zie het cookiebeleid) | Opgetelde cijfers volgens de bewaartermijn van Vercel [[TE CONTROLEREN: afhankelijk van het Vercel-abonnement]] |
| Logbestanden | Edge Function-logs bevatten bij verificatie en wachtwoordherstel het e-mailadres | Beveiliging en foutopsporing | Gerechtvaardigd belang [[JURIST]] | Supabase: 1 dag (Free-abonnement). Vercel: [[TE CONTROLEREN]] |

## 4. Met wie we gegevens delen

| Partij | Waarvoor | Vanuit | Opslagregio / doorgifte |
| --- | --- | --- | --- |
| Supabase | Database, inloggen, bestandsopslag, serverfuncties | Browser en server | Database: Central EU (Frankfurt), vastgesteld. Serverfuncties: voor verzoeken uit Nederland Frankfurt (eu-central-1, gemeten 30-09-2026). Supabase Pte. Ltd. (Singapore); doorgifte op basis van standaardcontractbepalingen |
| Vercel | Hosting van website en app; één serverfunctie (SnelStart-webhook) | Browser en server | Website via het netwerk van Vercel (voor Nederland Frankfurt); de serverfunctie draait in Washington, VS (iad1, gemeten 29-09-2026). Vercel Inc., VS; EU-US Data Privacy Framework + standaardcontractbepalingen |
| Stripe | Abonnementen; betaallinks op facturen van gebruikers (via hun eigen Stripe-account) | Server; betaler op de pagina van Stripe | Stripe Payments Europe, Ltd. (Ierland); verwerking ook buiten de EU op basis van het EU-US Data Privacy Framework en standaardcontractbepalingen |
| Resend | Versturen van alle e-mail | Server | Plus Five Five, Inc. (VS); account, metadata en logs in de VS; EU-US Data Privacy Framework + standaardcontractbepalingen. Verzendregio: [[TE CONTROLEREN]] |
| Anthropic | Antwoorden van de helpchat; alleen de chatberichten, geen naam of e-mail | Server | Anthropic Ireland, Ltd.; verwerking ook in de VS op basis van standaardcontractbepalingen; geen training op klantdata, na 30 dagen verwijderd |
| PDOK (Kadaster) | Adres zoeken | Browser | Nederland (Kadaster, overheid) |
| Moneybird / SnelStart | Alleen als de gebruiker die koppeling aanzet | Server | Niet door BossBase bepaald |
| Vercel (Web Analytics) | Gebruiksstatistieken van website en app | Browser | Vercel Inc., VS; EU-US Data Privacy Framework + standaardcontractbepalingen |

Geen advertentie- of trackingdiensten. Voor gebruiksstatistieken gebruiken we
Vercel Web Analytics, zonder cookies en zonder dat er iets op je apparaat wordt
opgeslagen. Lettertypen worden zelf gehost.

## 5. Cookies en opslag in je browser

BossBase zet zelf geen cookies. Wel gebruikt de website en app de
browseropslag (localStorage en sessionStorage):

- **Noodzakelijk:** je inlogsessie (`sb-…-auth-token`), het gekozen bedrijf in
  deze sessie.
- **Voorkeuren:** ingeklapte zijbalk, weergave van lijsten, opgeslagen filters,
  kostenweergave, planningslegenda, uitstel van de urenherinnering, gekozen
  pakket tijdens het aanmelden.

Geen tracking. Vercel Web Analytics telt bezoeken zonder cookies en zonder iets
op je apparaat op te slaan; zie het cookiebeleid. De oude cookiebanner is
verwijderd: er is niets meer waarvoor toestemming nodig is.

## 6. Bewaren en verwijderen

Bewaartermijnen staan per regel in §3. Na het einde van het abonnement bewaren we
de gegevens van een bedrijf nog 2 jaar, gelijk aan de algemene voorwaarden. Daarna
worden ze verwijderd, ook de bestanden.

Feitelijke stand (moet in lijn gebracht worden vóór deze tekst klopt):

- "Account verwijderen" zet het account op inactief; gegevens, het
  inlogaccount en bestanden blijven bestaan.
- De app belooft "2 jaar bewaren, financiële administratie 7 jaar, daarna
  definitief verwijderd", maar die verwijdering is niet gebouwd.
- Opzeggen door een beheerder ("Account verwijderen") zegt sinds 30 september
  2026 eerst het Stripe-abonnement op; een jaarabonnement stopt aan het einde
  van de looptijd.

## 7. Beveiliging

Vastgesteld: toegang per bedrijf via databaseregels; handtekeningen en
ondertekende documenten in niet-openbare opslag; wachtwoorden niet door BossBase
zelf opgeslagen; verificatiecodes en resettokens alleen gehasht opgeslagen.

## 8. Je rechten

Inzage, correctie, verwijdering, beperking, bezwaar, overdraagbaarheid. Verzoek
via info@bossbase.nl; reactie binnen een maand. Klacht
indienen kan bij de Autoriteit Persoonsgegevens.

## 9. Openstaande juridische punten (niet in de gepubliceerde tekst)

- Commerciële proefperiodemails zonder afmeldlink: [[JURIST]] toetsen aan de
  Telecommunicatiewet (art. 11.7); afmeldlink toevoegen.
- Automatische deelname aan de meldactie.
- Belofte over verwijderen in de app klopt niet met de werking.
- E-mailadressen in Edge Function-logs.
- Resettokens ongehasht opgeslagen en niet opgeschoond.

## 10. Wijzigingen

Versie 2026-10, geldig vanaf [datum van publicatie].
