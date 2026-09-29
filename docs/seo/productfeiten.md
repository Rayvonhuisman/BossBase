# Productfeiten voor website en kennisbank

Gecontroleerd in de code op 29 september 2026 (commit 85d7d6f, productie).
Alles op de website moet hierop terug te voeren zijn. Staat iets hier niet,
of staat het onder "Bestaat niet", dan beloven we het niet.

## Werkbonnen (alle pakketten)

- Werkbon met titel, omschrijving, klant, project, locatie, nummer; meerdere
  medewerkers, verantwoordelijken en voertuigen; meerdaagse planning.
- Onderdelen: taken om af te vinken, **meerwerk** (een taak gemarkeerd als
  meerwerk, zonder prijs), materialen (met verkoop- en inkoopprijs en
  leverancier), foto's (ook direct met de camera), notities (intern of
  "voor klant"), uren op de werkbon.
- Status: gepland → in uitvoering → afgerond. Werkbonstatus kan de pipeline-fase
  van de deal automatisch doorzetten.
- Afronden kan op drie manieren: de klant tekent ter plekke (op telefoon of
  tablet), de klant krijgt een link per mail om te tekenen, of afronden zonder
  handtekening.
- De ondertekenpagina toont geen bedragen, inkoopprijzen of interne notities.
  Na ondertekenen staat de werkbon op slot en krijgt de klant een
  bevestigingsmail met PDF.
- Werkbon-PDF voor de klant: afgevinkte taken, meerwerk, materiaal zonder
  prijzen.
- Waarschuwing aan de klant (Wkb) per mail versturen en vastleggen.
- Wie uren op een werkbon mag boeken: de uitvoerders en verantwoordelijken van
  die werkbon, plus admin en planner.

## Offertes

- Regels per type (uren, km, overig, eigen eenheden), btw per regel, eigen logo
  en huisstijlkleur op de PDF, versies (v2, v3; oude versie wordt "vervangen"),
  geldigheidsdatum (standaard 14 dagen, instelbaar), statussen concept,
  verzonden, geaccepteerd, afgewezen. Nummering BB-001 enz.
- Versturen per mail met PDF.
- **Online ondertekenen** via een link: alleen in Groei en Team (en tijdens de
  proefperiode). De klant kan de PDF downloaden en "Akkoord en ondertekenen".
  Online afwijzen kan niet. Na ondertekening: status geaccepteerd,
  bevestigingsmail met PDF, deal naar fase "Akkoord".
- **Factuur maken vanuit een geaccepteerde offerte**: klant en alle
  offerteregels worden overgenomen.
- Materialen uit de materialenlijst kun je (nog) niet in offerteregels kiezen.

## Planning en agenda

- Agenda: alle pakketten (afspraken en ingeplande werkbonnen).
- Planningsmodule: in Team, bij Groei als module van € 10/maand. Dag- en
  weekweergave; per medewerker of per voertuig (voertuigen: module € 5 bij
  Groei, in Team inbegrepen). Werkbonnen in de planning slepen. Waarschuwing bij
  dubbel inplannen of voertuigconflict. Melding in de app (optioneel ook mail)
  bij inplannen, en een dagelijkse samenvattingsmail om 18:00 met wijzigingen.

## Uren en nacalculatie

- Urenregistratie (werkdag): datum, begin, eind, pauze, km, notitie.
  Totaal = eind − begin − pauze. **Geen uursoorten, geen verlof- of
  ziekteregistratie.**
- Werkbonuren: apart per werkbon, tellen op in het project.
- Nacalculatie (Groei en hoger), tabblad Kosten op het project: gefactureerd
  (excl. btw) tegenover kostprijs (werkbonmateriaal tegen inkoopprijs plus
  losse projectkosten) → brutowinst. Uren: begroot (handmatig ingevuld op het
  project), geregistreerd en resterend, met waarschuwing bij 80% en 100%.
  **Arbeid wordt niet in euro's meegerekend** (geen kostprijs per uur).

## Facturen

- Aanmaken (klant heeft adres, plaats en e-mail nodig), btw per regel: 21%, 9%,
  vrijgesteld of verlegd; waarschuwing als verlegd en belast op één factuur
  staan. Btw-nummer van de klant op de PDF. Nummering BB-F…, creditnota BB-CF….
  Versturen per mail met PDF; daarna alleen-lezen. Betaald markeren.
  Creditnota (volledig of gedeeltelijk), factuur kopiëren.
- Vanuit een project: een nieuwe factuur met klant en project ingevuld; de
  regels vul je zelf in.
- **Een werkbon wordt niet omgezet in een factuur.** Werkbonuren en -materialen
  komen niet automatisch op een factuur.
- Betalingsherinneringen (Groei en hoger): handmatig herinnering 1 en 2, of
  automatisch per mail, standaard 7 en 14 dagen na de vervaldatum, instelbaar
  en uit te zetten.
- Stripe-betaallink (Team, bij Groei module € 10): via je eigen Stripe-account
  (Stripe Connect; jij betaalt de Stripe-kosten). Permanente betaallink in de
  factuurmail, betalen met **iDEAL**. Na betaling: factuur op betaald, mail met
  PDF naar klant en jou, synchronisatie met de boekhouding.
- Op de factuur-PDF staat geen IBAN-veld.

## Klantbeheer

- Klanten met klantkaart en tijdlijn (Starter: maximaal 100 klanten).
- Pipeline met standaard 13 fasen van nieuwe aanvraag tot betaald/verloren;
  werkbon, project en factuur kunnen de fase automatisch doorzetten
  (instelbaar). Verloren-redenen. Activiteiten: bellen, e-mail, bezoek, taak,
  opvolgen. Leveranciers als relatie.
- Aanvragen van websites die BossBase bouwt komen binnen als lead. Er is geen
  formulier dat een klant zelf op een eigen website kan plaatsen.
- **Geen import van klanten uit Excel of CSV.** Wel export (zie onder).

## Koppelingen (boekhouding vanaf Groei)

- **Moneybird**: instellen met API-token en administratie-ID.
  - BossBase → Moneybird: een factuur gaat naar Moneybird zodra hij betaald is
    (contact, factuur en betaling). Moneybird kiest het btw-tarief.
  - Moneybird → BossBase (elk uur, ook handmatig): inkoopfacturen, bonnetjes en
    uitgaven worden kosten; verkoopfacturen die niet uit BossBase komen; de
    betaalstatus van gesynchroniseerde facturen.
  - Contacten: twee kanten op, elk uur. Btw-overzicht: dagelijks.
- **SnelStart**: koppelsleutel invoeren.
  - BossBase → SnelStart: facturen als verkoopboeking (bij betaald markeren en
    dagelijks), met PDF. Geen betaalregistratie.
  - SnelStart → BossBase: inkoopfacturen als kosten (btw per regel),
    verkoopfacturen van buiten BossBase.
  - Contacten twee kanten op, dagelijks. Grootboekindeling per bedrijf.
- **Stripe**: zie Facturen.
- **Niet beschikbaar**: Google Agenda, AFAS (verborgen), Gmail, Outlook,
  REST-API, Word, Excel-import.

## Pakketten en prijzen (excl. btw, per maand)

| | Starter € 29 | Groei € 39 | Team € 59 |
|---|---|---|---|
| Gebruikers | 1 | max. 2 (1 inbegrepen, 2e € 10) | onbeperkt, € 10 per gebruiker, ook de eerste |
| Klanten | 100 | onbeperkt | onbeperkt |
| Offertes / facturen per periode | 20 / 20 | onbeperkt | onbeperkt |

- Starter: pipeline, klanten, offertes, facturen, werkbonnen, uren, agenda,
  adres zoeken (PDOK), afspraakherinneringen, e-mailtemplates.
- Groei: + online ondertekenen offertes, automatische betalingsherinneringen,
  boekhoudkoppeling, btw-overzicht, kosten en nacalculatie, eigen templates.
- Team: + rollen en rechten, planning, Stripe-betaallink, voertuigen.
- Modules bij Groei: Stripe-betaallink € 10, Planning € 10, Voertuigen € 5
  (vereist Planning). Hosting € 5 (Groei en Team).
- **Maandabonnement**: per maand opzegbaar, stopt aan het eind van de maand.
- **Jaarabonnement**: 12 maandelijkse termijnen tegen de maandprijs, niet
  tussentijds op te zeggen; daarna maandelijks. Eén welkomstactie: 2 maanden
  gratis (alle pakketten) óf een gratis website (niet bij Starter; hosting
  € 5/maand). Upgraden kan altijd; downgraden niet binnen de jaarlooptijd, en
  niet als je boven de limiet van het kleinere pakket zit.
- **Proefperiode**: 14 dagen, altijd met de functies van Groei, geen
  betaalgegevens nodig. Daarna alleen-lezen (bekijken en exporteren) tot je een
  abonnement kiest.
- Welke betaalmethoden voor het abonnement actief zijn, staat in Stripe, niet in
  de code: noem ze niet.

## Overig

- Mobiel: het dashboard is op schermen smaller dan 768 px geblokkeerd; er is
  geen app in een appstore. Wel mobiel: inloggen, registreren, en de
  ondertekenpagina's van offertes en werkbonnen.
- Boss: AI-helpchat in de app (alle pakketten, via Anthropic).
- Export: klanten als Excel en CSV, ZIP met offerte- en factuur-PDF's en
  getekende offertes; financiën als CSV.
- Account verwijderen: Instellingen → Mijn profiel → Gevarenzone. Bij een admin
  wordt het bedrijf opgezegd. Gegevens worden niet direct gewist.
- Rollen admin, medewerker, planner; fijnmazige rechten in Team.
- Dashboard met instelbare widgets.

## Bedrijfsgegevens

- E-mail: info@bossbase.nl. Oprichters: Niels Grevink en Rayvon Huisman.
- Niet bevestigd, dus niet gebruiken in structured data: rechtsvorm,
  KvK-nummer, btw-id. Adres en telefoonnummer staan op de contactpagina zoals
  de eigenaar ze daar zette; laten bevestigen.
