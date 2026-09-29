# CONCEPT — Verwerkersovereenkomst BossBase

> **Niet publiceren of laten ondertekenen. Niet juridisch getoetst.** Werkversie
> op basis van wat in de code is vastgesteld (29 september 2026). `[[…]]` =
> gegeven of keuze van de eigenaren; `[[JURIST]]` = juridische keuze;
> `[[TE CONTROLEREN]]` = niet vastgesteld met de beschikbare toegang.
> Artikel 28 AVG schrijft voor wat er minimaal in moet; laat de definitieve
> tekst door een jurist opstellen of toetsen.

## Partijen

1. **Verwerkingsverantwoordelijke:** de klant die BossBase gebruikt ("de
   Klant").
2. **Verwerker:** [[juridische naam]], [[rechtsvorm]], [[zakelijk
   vestigingsadres]], KvK [[nummer]] ("BossBase").

## 1. Onderwerp en duur

BossBase verwerkt persoonsgegevens voor de Klant om de dienst BossBase te
leveren, zolang de overeenkomst voor BossBase loopt, plus de termijn in
artikel 8.

## 2. Aard en doel

Opslaan, tonen, bewerken, versturen en synchroniseren van gegevens die de Klant
in BossBase vastlegt, uitsluitend om de functies te leveren die de Klant
gebruikt: klantbeheer en aanvragen, offertes en online ondertekening,
werkbonnen en ondertekening, planning, urenregistratie, facturen en
betalingsherinneringen, betaallinks (via het eigen Stripe-account van de
Klant), en koppelingen met Moneybird of SnelStart als de Klant die aanzet.

## 3. Categorieën betrokkenen en gegevens (vastgesteld in de code)

| Betrokkenen | Gegevens |
| --- | --- |
| Klanten van de Klant | Naam, contactpersoon, e-mail, telefoon, adres, KvK, btw-nummer, IBAN, notities; offertes, facturen en werkbonnen; bij ondertekening: ingevulde naam en e-mail, handtekening (afbeelding), tijdstip, ondertekend document |
| Leveranciers van de Klant | Naam, contactpersoon, e-mail, telefoon, mobiel, adres, KvK, btw, IBAN, notities |
| Medewerkers van de Klant | Naam, e-mail, telefoon, rol, uren per week, gewerkte uren en tijden, reiskilometers, planning, toegewezen werk |
| Aanvragers via een formulier op de website van de Klant | Naam, bedrijfsnaam, e-mail, telefoon, onderwerp, bericht, pagina-adres |

Bijzondere persoonsgegevens: BossBase is daar niet voor bedoeld. [[JURIST]]:
vrije notitievelden en foto's kunnen ze toch bevatten; bepaal hoe de
overeenkomst daarmee omgaat.

## 4. Verplichtingen van BossBase

- Alleen verwerken op gedocumenteerde instructie van de Klant (de instellingen
  en het gebruik van de dienst gelden als instructie).
- Geheimhouding door iedereen die toegang heeft.
- Passende beveiliging: [[alleen opnemen wat aantoonbaar is]]. Vastgesteld:
  scheiding per bedrijf met databaseregels (RLS); niet-openbare opslag voor
  handtekeningen, ondertekende documenten, facturen en foto's; ondertekenlinks
  met een onraadbaar token.
- Bijstand bij verzoeken van betrokkenen en bij datalekken.
- Melden van een datalek aan de Klant binnen [[termijn, bijvoorbeeld 48 uur]]
  na ontdekking.
- Medewerking aan audits: [[JURIST]].

## 5. Subverwerkers

De Klant geeft algemene toestemming voor deze subverwerkers. BossBase meldt
wijzigingen [[termijn]] van tevoren.

| Subverwerker | Waarvoor | Regio | Overeenkomst met BossBase |
| --- | --- | --- | --- |
| Supabase | Database, inloggen, opslag, serverfuncties | Database: Central EU (Frankfurt), vastgesteld; functies en logs [[TE CONTROLEREN]] | [[TE CONTROLEREN]] |
| Vercel | Hosting van de app | [[TE CONTROLEREN]] | [[TE CONTROLEREN]] |
| Resend | E-mail namens de Klant (offertes, facturen, herinneringen, afspraakherinneringen) | [[TE CONTROLEREN]] | [[TE CONTROLEREN]] |
| Stripe | Alleen bij de betaallink: bedrag en factuurnummer; de betaling loopt via het eigen Stripe-account van de Klant | [[TE CONTROLEREN]] | [[JURIST]]: Stripe is hier vermoedelijk een partij van de Klant zelf |
| Moneybird / SnelStart | Alleen als de Klant de koppeling aanzet, met de eigen administratie van de Klant | n.v.t. | [[JURIST]]: vermoedelijk geen subverwerker van BossBase |
| Anthropic | Helpchat voor de gebruiker; er gaan geen gegevens van klanten van de Klant mee, tenzij de gebruiker ze zelf in de chat typt | [[TE CONTROLEREN]] | [[TE CONTROLEREN]] |

Een standaard verwerkersovereenkomst bij een leverancier betekent niet dat die
is afgesloten. Of BossBase met elk van deze partijen een overeenkomst heeft
gesloten, is **niet vastgesteld**.

## 6. Doorgifte buiten de EER

[[TE CONTROLEREN]] per subverwerker; [[JURIST]]: passend mechanisme vastleggen
(adequaatheidsbesluit of modelcontractbepalingen).

## 7. Bijstand en rechten van betrokkenen

De Klant beantwoordt verzoeken van zijn eigen klanten en medewerkers.
BossBase helpt waar nodig. Vastgesteld: klanten zijn te exporteren (Excel/CSV),
documenten als ZIP.

## 8. Einde van de overeenkomst

[[JURIST en eigenaren]]: wat BossBase na afloop teruggeeft en binnen welke
termijn het verwijdert. **Feitelijke stand:** opzeggen zet het bedrijf op
"opgezegd" en de gebruikers op inactief; alle gegevens en bestanden blijven
staan; automatische verwijdering bestaat niet. Dit moet in lijn gebracht
worden met wat hier wordt afgesproken.

## 9. Aansprakelijkheid

[[JURIST]]

## Bijlage — technische en organisatorische maatregelen

[[Alleen aantoonbare maatregelen; op te stellen met de ontwikkelaars.]]
