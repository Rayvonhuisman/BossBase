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
2. **Verwerker:** BossBase, handelsnaam van NG E-Commerce B.V., Sodalietdreef 6,
   7828 CR Emmen, KvK 91856396 ("BossBase").

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
- Passende beveiliging. Vastgesteld: scheiding per bedrijf met databaseregels
  (RLS); niet-openbare opslag voor handtekeningen, ondertekende documenten,
  facturen en foto's; ondertekenlinks met een onraadbaar token; zie de bijlage.
- Bijstand bij verzoeken van betrokkenen en bij datalekken.
- Melden van een datalek aan de Klant binnen [48 uur — nog te besluiten] na ontdekking.
- Medewerking aan audits: [[JURIST]].

## 5. Subverwerkers

De Klant geeft algemene toestemming voor deze subverwerkers. BossBase meldt
wijzigingen [30 dagen — nog te besluiten] van tevoren, per e-mail. De actuele lijst staat op
bossbase.nl/subverwerkers.

| Subverwerker | Waarvoor | Regio | Overeenkomst met BossBase |
| --- | --- | --- | --- |
| Supabase | Database, inloggen, opslag, serverfuncties | Database: Central EU (Frankfurt), vastgesteld; serverfuncties voor verzoeken uit Nederland in Frankfurt (eu-central-1, gemeten); logs 1 dag bewaard (Free-abonnement). Supabase Pte. Ltd. (Singapore) | [[TE CONTROLEREN]] |
| Vercel | Hosting van de app | Vercel Inc., VS; website via het netwerk van Vercel (voor Nederland Frankfurt), serverfunctie in Frankfurt (fra1, sinds 30-09-2026) | [[TE CONTROLEREN]] |
| Resend | E-mail namens de Klant (offertes, facturen, herinneringen, afspraakherinneringen) | Plus Five Five, Inc., VS; account, metadata en logs in de VS; verzendregio [[TE CONTROLEREN]] | [[TE CONTROLEREN]] |
| Stripe | Alleen bij de betaallink: bedrag en factuurnummer; de betaling loopt via het eigen Stripe-account van de Klant | Stripe Payments Europe, Ltd. (Ierland); verwerking ook buiten de EU | [[JURIST]]: Stripe is hier vermoedelijk een partij van de Klant zelf |
| Moneybird / SnelStart / AFAS | Alleen als de Klant de koppeling aanzet, met de eigen administratie van de Klant | n.v.t. | [[JURIST]]: vermoedelijk geen subverwerker van BossBase |
| Google Agenda | Alleen als de Klant de koppeling aanzet: afspraken met titel, notities en adres van de klant, naar de eigen agenda van de gebruiker | n.v.t. | [[JURIST]]: vermoedelijk geen subverwerker van BossBase |
| PDOK (Kadaster) | Adres opzoeken tijdens het typen in de app; de getypte zoektekst gaat vanuit de browser naar PDOK | Nederland | Overheidsdienst; niet nodig binnen de EU [[JURIST]] |
| Anthropic | Helpchat voor de gebruiker; er gaan geen gegevens van klanten van de Klant mee, tenzij de gebruiker ze zelf in de chat typt | Anthropic Ireland, Ltd.; verwerking ook in de VS; geen training op klantdata, na 30 dagen verwijderd | [[TE CONTROLEREN]] |
| Vercel (Web Analytics) | Gebruiksstatistieken van de app: welke pagina's gebruikers van de Klant bekijken, met apparaat, browser en land. Tokens en id's (van klanten, projecten, facturen) worden vóór verzending uit het adres gehaald; geen namen, e-mailadressen of klantgegevens | Vercel Inc., VS; EU-US Data Privacy Framework + standaardcontractbepalingen | [[TE CONTROLEREN]] |

Een standaard verwerkersovereenkomst bij een leverancier betekent niet dat die
is afgesloten. Of BossBase met elk van deze partijen een overeenkomst heeft
gesloten, is **niet vastgesteld**.

## 6. Doorgifte buiten de EER

Per subverwerker: Vercel, Resend en Stripe op basis van het EU-US Data Privacy
Framework en standaardcontractbepalingen; Supabase en Anthropic op basis van
standaardcontractbepalingen. [[JURIST]]: passend mechanisme vastleggen
(adequaatheidsbesluit of modelcontractbepalingen).

## 7. Bijstand en rechten van betrokkenen

De Klant beantwoordt verzoeken van zijn eigen klanten en medewerkers.
BossBase helpt waar nodig. Vastgesteld: klanten zijn te exporteren (Excel/CSV),
documenten als ZIP.

## 8. Einde van de overeenkomst

Na het einde van het abonnement bewaart BossBase de gegevens nog [2 jaar — termijn nog te besluiten], gelijk
aan de algemene voorwaarden; in die tijd kan de Klant terugkomen of exporteren.
Daarna worden de gegevens verwijderd, ook de bestanden.

**Feitelijke stand (30 september 2026):** opzeggen zet het bedrijf op "opgezegd"
en de gebruikers op inactief. De opschoonjob (edge function `opschonen`) draait
sinds 30 september 2026 dagelijks om 03:30 en zou een bedrijf na
[[2 jaar — termijn nog te besluiten]] verwijderen; die termijn is niet
goedgekeurd. De correcties op de job (branch fix/accountverwijdering-bv) staan
nog niet op productie.

## 9. Aansprakelijkheid

Voor aansprakelijkheid geldt artikel 10 van de algemene voorwaarden.

## Bijlage — technische en organisatorische maatregelen

Alleen maatregelen die in de code of de configuratie zijn vastgesteld
(30 september 2026):

- Scheiding per bedrijf met databaseregels (row level security), ook binnen een
  bedrijf rechten per medewerker.
- Niet-openbare opslag voor handtekeningen, ondertekende documenten, facturen en
  foto's; alleen bereikbaar via tijdelijke, ondertekende links.
- Ondertekenlinks met een onraadbaar token.
- Wachtwoorden niet door BossBase zelf opgeslagen (inlogdienst van Supabase);
  verificatiecodes en resettokens alleen gehasht opgeslagen; begrensd aantal
  pogingen.
- Versleutelde verbindingen (https).
- Database in de EU (Frankfurt).
- Logs van serverfuncties zonder e-mailadressen en tokens.
- 2 personen met beheerderstoegang tot de productieomgeving.
- Geen automatische back-ups (Supabase Free-abonnement).
