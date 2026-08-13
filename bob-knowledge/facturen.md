# Facturen

> Kennisbron voor **Boss**. Beschrijft de facturenmodule vanuit wat de gebruiker
> ziet en kan. Vult de facturen-sectie van de inventarisatie aan.

Route: **Facturen** in het menu (onder Financieel). Ook bereikbaar via de klantkaart
(tab Facturen) en vanuit een project.

---

## De drie statussen

Een factuur heeft er altijd precies één:

| Status | Betekenis | Wat kan er nog |
|---|---|---|
| **Concept** | Aangemaakt, nog niet naar de klant | Alles aanpasbaar: regels, bedragen, datums, notities |
| **Verzonden** | Naar de klant gestuurd | Inhoud staat vast. Alleen betaald markeren, herinneren en crediteren |
| **Betaald** | Betaling ontvangen | Alleen nog crediteren |

Daarnaast zijn er twee **kenmerken** die naast de status staan, geen status op zich:

- **Te laat** — een rood label. Verschijnt zodra de vervaldatum voorbij is en de
  factuur nog niet op betaald staat. Geldt dus zowel bij Concept als bij Verzonden.
- **Gecrediteerd** — er is een creditfactuur voor deze factuur gemaakt. De
  oorspronkelijke factuur blijft staan.

### Een verstuurde factuur is bevroren

Zodra een factuur op Verzonden staat, kunnen de vervaldatum, het betalingskenmerk,
de notities en de bedragen niet meer wijzigen. Probeer je het toch, dan verschijnt:

> *Een verstuurde factuur kan niet meer gewijzigd worden*

Dat is bewust: de klant heeft dat document al. Een fout herstel je met een
**creditfactuur**, niet door de oude factuur aan te passen.

Bij het versturen wordt bovendien de **bedrijfsbranding bevroren**: logo, kleur,
bedrijfsnaam, adres, postcode, plaats, e-mail, KvK en btw-nummer worden vastgelegd
zoals ze op dat moment waren. Verandert het bedrijf later van logo of adres, dan
blijft de oude factuur eruitzien zoals de klant hem ontving.

---

## Wat je met een factuur kunt doen

### Aanmaken

- Knop **Nieuwe factuur** op de facturenpagina, of vanaf de klantkaart, of vanuit
  een project.
- Het **factuurnummer** wordt automatisch gegenereerd in de vorm `BB-F001`,
  `BB-F002`, enzovoort. Je kunt zelf een nummer meegeven.
- De **factuurdatum** staat standaard op vandaag.
- Het **betalingskenmerk** wordt automatisch gevuld met het factuurnummer.
- De **betaaltermijn** staat standaard op **14 dagen**.
- Een nieuwe factuur begint altijd als **Concept**.

### Regels toevoegen

Elke regel heeft: type, omschrijving, aantal, prijs per stuk en btw-percentage.
De regelprijs is altijd **aantal × prijs per stuk**, ook bij het type "Overig".

Verplicht per regel: een omschrijving. Zonder omschrijving wordt de regel geweigerd.

### Versturen

- Knop **Verstuur per mail** in het factuurdetail.
- Er gaat een e-mail naar de klant met de factuur-PDF als bijlage.
- De status springt naar **Verzonden** en de branding wordt bevroren.
- De gebeurtenis komt in de tijdlijn van de klant.

### Betaald markeren

- Kan altijd, ook als het account in alleen-lezen staat — dat is geld dat
  binnenkomt.
- Je kunt een **betaaldatum** meegeven; anders wordt het moment van markeren gebruikt.
- Bij het betaald markeren wordt de factuur automatisch doorgezet naar de
  **gekoppelde boekhouding**, als er een koppeling actief is.
- De gebeurtenis komt in de tijdlijn van de klant.
- Twee keer betaald markeren doet niets extra's — de boekhoudkoppeling en de
  tijdlijnregel gebeuren maar één keer.

### Crediteren

Twee smaken:

- **Volledig crediteren** — alle regels worden gecrediteerd.
- **Gedeeltelijk crediteren** — je kiest welke regels.

Wat er gebeurt:
- Er ontstaat een **creditfactuur** met een eigen nummer in de vorm `BB-CF001`.
- Die staat meteen op **Verzonden** en krijgt dezelfde bevroren branding als het
  origineel.
- De bedragen zijn **negatief**. Het aantal blijft ongewijzigd, alleen de prijs
  wordt negatief — 2 × € 120 crediteert dus € 240.
- De oorspronkelijke factuur krijgt het kenmerk **Gecrediteerd**.
- Creditfacturen tellen **niet** mee voor de facturenlimiet van je pakket.

**Een gecrediteerde factuur kun je niet verwijderen** zolang de creditnota ernaar
verwijst. Je krijgt dan:

> *Deze factuur is gecrediteerd en kan niet verwijderd worden. Verwijder eerst de
> bijbehorende creditfactuur.*

Dat is bedoeld: een creditnota die naar een verdwenen factuur wijst, breekt de
audittrail.

### PDF

- **Preview PDF** — bekijken zonder downloaden.
- **Download PDF** — opslaan.
- De PDF die bij het versturen is gemaakt, wordt bewaard. Betaalbevestigingsmails
  gebruiken later exact diezelfde kopie als bijlage.

### Verwijderen

Kan, behalve bij een gecrediteerde factuur (zie hierboven).

---

## Herinneringen

Er zijn **twee** herinneringen per factuur: Herinnering 1 en Herinnering 2. Elk gaat
maximaal één keer.

### Handmatig

In het factuurdetail verschijnen de knoppen **Herinnering 1 sturen** en
**Herinnering 2 sturen**. Voorwaarden:

- De factuur moet **te laat** zijn (vervaldatum voorbij, nog niet betaald).
- Herinnering 2 verschijnt pas nadat Herinnering 1 is verstuurd.
- Een verstuurde herinnering verdwijnt uit beeld — hij kan niet nog eens.

### Automatisch

Er draait **elke ochtend** een controle die herinneringen verstuurt voor facturen die
te laat zijn.

Standaardinstelling:
- **Herinnering 1**: 7 dagen na de vervaldatum
- **Herinnering 2**: 14 dagen na de vervaldatum

Beide aantallen zijn per bedrijf instelbaar onder **Instellingen → E-mailtemplates**,
samen met een schakelaar om het automatisch versturen aan of uit te zetten.

### Alleen vanaf Groei

Automatische betaalherinneringen zijn een functie van **Groei en Team**. Bij Starter
staat de knop wel in beeld maar lichter weergegeven; klikken opent de upgrademelding.

---

## Velden op een factuur

| Veld | Automatisch gevuld? |
|---|---|
| Factuurnummer | ja — `BB-F###`, doorlopend |
| Factuurdatum | ja — vandaag |
| Vervaldatum | volgt uit de betaaltermijn |
| Betaaltermijn | ja — 14 dagen |
| Betalingskenmerk | ja — gelijk aan het factuurnummer |
| Klant | nee — je kiest hem |
| Project | nee — optioneel |
| Status | ja — begint op Concept |
| Notities | nee |
| Totaal excl. / incl. btw | ja — berekend uit de regels |
| Betaald op | ja — bij betaald markeren |
| Branding-snapshot | ja — bevroren bij versturen |

---

## Overzicht en filters

Bovenaan de facturenpagina staan vier cijfers: **Totaal facturen**, **Openstaand**,
**Betaald deze maand** en **Verlopen**.

Verder: zoeken, filteren op status, en per factuur een menu met de acties.

Bij een klant zonder volledige gegevens verschijnt de melding **Klantgegevens
onvolledig** — dan mist er iets wat op de factuur hoort te staan.

---

## Onzeker — controleren door Niels

- **Wat "Klantgegevens onvolledig" precies afkeurt.** De melding staat in de code,
  maar welke velden verplicht zijn voor een geldige factuur is niet eenduidig af te
  leiden. Boss moet niet gokken welk veld ontbreekt.
- **Of de automatische herinnering ook gaat als de klant geen e-mailadres heeft.**
  Vermoedelijk wordt hij dan overgeslagen, maar of de gebruiker daar een melding van
  ziet is onduidelijk.
- **Of het factuurnummer aanpasbaar is in de UI.** In de code kan een nummer worden
  meegegeven; of het invoerveld in het scherm staat, is niet vastgesteld.
- **Wat er gebeurt bij een deelbetaling.** Er is één betaalmoment en één status
  Betaald; een gedeeltelijk betaalde factuur lijkt niet te bestaan. Bevestigen.
- **Of een concept-factuur die te laat is ook automatisch een herinnering krijgt.**
  Het "te laat"-label geldt ook voor concepten, wat vreemd zou zijn voor een factuur
  die de klant nooit heeft ontvangen.
