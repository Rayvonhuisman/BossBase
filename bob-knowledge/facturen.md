# Facturen

> Kennisbron voor **Boss**.

Menu **Financieel**, **Facturen**. Vraagt het recht *Facturen*. Een factuur maak je
ook vanaf de klantkaart, de projectkaart of vanuit een geaccepteerde offerte
(**Maak factuur**).

Op de pagina Facturen kan de beheerder facturen maken, versturen, wijzigen,
crediteren en verwijderen. Een medewerker met het recht *Facturen* kan ze bekijken.

---

## Statussen

| Status | Betekenis |
|---|---|
| **Concept** | Aangemaakt, nog niet naar de klant |
| **Verzonden** | Naar de klant gestuurd |
| **Betaald** | Betaling ontvangen |

Daarnaast:
- **Te laat** (rood): de vervaldatum is voorbij en de factuur is nog niet betaald.
  Een factuur die vandaag vervalt, is morgen pas te laat.
- **Gecrediteerd**: er is een creditfactuur voor gemaakt. De factuur zelf blijft
  bestaan.
- **Uit boekhouding**: een factuur die uit SnelStart of Moneybird is opgehaald. Die kun je
  alleen bekijken (**Origineel document**) en verwijderen.
- Een label naast het nummer laat zien waar een opgehaalde factuur vandaan komt: blauw
  **MB** voor Moneybird, oranje **SS** voor SnelStart. Dat label blijft staan, ook als
  de factuur betaald is.

## Een factuur maken
Klik op **Nieuwe factuur**.
- **Klant** (verplicht). Adres, plaats en e-mailadres van de klant moeten ingevuld
  zijn; anders zie je **Klantgegevens onvolledig** met wat er ontbreekt en een link
  naar de klant.
- **Project** (optioneel).
- **Factuurdatum**: standaard vandaag.
- **Vervaldatum**: de factuurdatum plus de betaaltermijn. Die stel je in onder
  **Instellingen**, tabblad **Algemeen**, bij **Betaaltermijn facturen (dagen)**
  (standaard 14). Heeft een klant een eigen betaaltermijn, dan geldt die. Die zet
  je op de klantkaart, tabblad **Gegevens**, bij **Betaaltermijn (dagen)**; leeg
  betekent de standaard uit Instellingen. Je kunt de vervaldatum op de factuur ook
  zelf aanpassen.
- **Regels**: zoals bij offertes, met per regel een eigen btw-tarief (21%, 9%, 0%
  vrijgesteld of 0% btw verlegd). Verlegde btw kan niet samen met belaste regels op
  één factuur.
- **Betalingskenmerk**: gelijk aan het factuurnummer.
- **Notities / betalingsinstructies**.

Klik op **Opslaan** of **Opslaan en versturen**. Een nieuwe factuur staat op Concept.
Het nummer krijgt hij vanzelf; zelf een nummer kiezen kan niet.

## Wijzigen
Via **Factuur wijzigen** pas je bij een concept de status, de vervaldatum, het
betalingskenmerk en de notities aan. De regels, bedragen, klant en factuurdatum
liggen vast zodra de factuur is opgeslagen.

Moet er iets aan de regels veranderen?
- Bij een **concept**: gebruik **Kopiëren naar nieuwe factuur**, pas de kopie aan en
  verwijder het oude concept.
- Bij een **verstuurde** factuur: maak een creditfactuur (zie crediteren) en daarna
  een nieuwe factuur.

**Kopiëren naar nieuwe factuur** (via de drie puntjes of het menu **Acties**) maakt een
nieuw concept met dezelfde klant en regels, met de datum van vandaag. In Starter telt
de kopie mee voor de 20 facturen.

## Versturen
Klik op **Verstuur per mail**, controleer de mail en klik **Versturen**. De PDF gaat
mee als bijlage. De status springt naar **Verzonden** en de gegevens van je bedrijf
(logo, adres, KvK en dergelijke) worden op de factuur vastgezet zoals ze op dat
moment zijn.

Heb je de **Stripe betaallink** (Team, of als module bij Groei), dan staat in de mail
de knop **Factuur betalen**. De klant betaalt online met iDEAL en de factuur gaat
vanzelf op **Betaald**.

## Betaald markeren
Open de factuur en klik op **Markeer als betaald**. De betaaldatum is het moment van
markeren. Heb je een boekhoudkoppeling, dan gaat de factuur dan automatisch naar je
boekhouding. Betaald markeren kan ook als je abonnement niet meer loopt.

Een deelbetaling bestaat niet: een factuur is betaald of niet.

## Herinneringen
Er zijn twee herinneringen: **Herinnering 1** en **Herinnering 2**. Elk gaat maar één
keer, en alleen bij een factuur die te laat is.

**Zelf versturen:** open de factuur en klik op **Herinnering sturen**. Na de eerste
staat er **Tweede herinnering**. Ook via de drie puntjes: **Herinnering 1 sturen** en
**Herinnering 2 sturen**.

**Automatisch** (Groei en Team): elke ochtend gaan herinneringen naar klanten van
wie de factuur te laat is. Standaard 7 dagen na de vervaldatum (Herinnering 1) en 14
dagen (Herinnering 2). Aanzetten en het aantal dagen kiezen doe je onder
**Instellingen**, tabblad **E-mailtemplates**, bij **Herinnering 1** en
**Herinnering 2**: zet **Actief** en **Automatisch versturen inschakelen** aan, vul
het aantal dagen in en klik **Opslaan**. Een klant zonder e-mailadres krijgt geen
herinnering.

Betaalherinneringen zitten in Groei en Team. In Starter vraagt de knop om een
upgrade.

## Crediteren
Bij een verstuurde of betaalde factuur kies je **Crediteer factuur**:
- **Volledig crediteren**: alle regels.
- **Gedeeltelijk crediteren**: vink de regels aan en pas eventueel aantal en prijs aan.

Klik op **Creditfactuur aanmaken**. De creditfactuur heeft een eigen nummer (met CF),
negatieve bedragen en staat meteen op Verzonden. Hij wordt niet vanzelf naar de klant
gemaild; dat doe je zelf met **Verstuur per mail**. De oorspronkelijke factuur krijgt
het label **Gecrediteerd**. Creditfacturen tellen niet mee voor de limiet van Starter.

## Verwijderen
Met de prullenbak, door de beheerder. Een factuur die is gecrediteerd kun je pas
verwijderen als je eerst de creditfactuur verwijdert.

## PDF
Klik op de paperclip. Bij een verstuurde factuur zie je precies het bestand dat de
klant heeft gekregen.

## Overzicht
Bovenaan tellers voor **Totaal facturen**, **Openstaand**, **Betaald deze maand** en
**Verlopen**. Tabbladen: **Alle**, **Verzonden**, **Betaald**,
**Verlopen** en **Gecrediteerd**, en een zoekveld op nummer of klant.

In Starter staat bovenaan hoeveel van de 20 facturen je deze periode hebt gebruikt.
