# Statussen en berekeningen

> Kennisbron voor **Boss**. Alle statussen die iets in het portaal kan hebben, en hoe
> de cijfers op het financiële overzicht tot stand komen.

---

## Statussen per module

### Offertes

| Status | Betekenis |
|---|---|
| **Concept** | Nog niet naar de klant, volledig aanpasbaar |
| **Verzonden** | Naar de klant gestuurd |
| **Geaccepteerd** | De klant heeft akkoord gegeven (online getekend of handmatig gezet) |
| **Afgewezen** | De klant wil niet |

### Facturen

| Status | Betekenis |
|---|---|
| **Concept** | Nog niet verstuurd, aanpasbaar |
| **Verzonden** | Bij de klant, inhoud staat vast |
| **Betaald** | Betaling ontvangen |

Daarnaast twee kenmerken die náást de status staan: **Te laat** (vervaldatum voorbij
en nog niet betaald) en **Gecrediteerd** (er is een creditnota voor gemaakt).

### Projecten

| Status | Betekenis |
|---|---|
| **Concept** | Nog in voorbereiding |
| **Offerte akkoord** | De klant is akkoord, werk kan starten |
| **Lopend** | In uitvoering |
| **Wachten op klant** | Ligt stil, de klant is aan zet |
| **Te factureren** | Werk klaar, factuur moet nog |
| **Afgerond** | Klaar en gefactureerd |
| **Risico** | Er is iets mis — signaalstatus |

### Werkbonnen

| Status | Betekenis |
|---|---|
| **Gepland** | Ingepland, nog niet begonnen |
| **In uitvoering** | Monteur is bezig |
| **Afgerond** | Klaar |

Een afgeronde werkbon is niet meer te bewerken: taken afvinken, materialen en
meerwerk toevoegen kan dan niet meer.

### Deals in de pipeline

Een deal heeft twee dingen tegelijk: een **fase** en een **status**.

De **fase** is de kolom op het bord. Die is per bedrijf zelf in te richten onder
Instellingen → Pipeline, dus de namen verschillen per bedrijf.

De **status** is er één van drie:

| Status | Betekenis |
|---|---|
| **Open** | Loopt nog |
| **Gewonnen** | Opdracht binnen |
| **Verloren** | Niet doorgegaan — met een reden erbij |

### Activiteiten

Een activiteit is óf afgevinkt óf niet. Het portaal maakt daar in beeld vier
categorieën van:

| Wat je ziet | Betekenis |
|---|---|
| **Open** | Nog te doen, vervaldatum in de toekomst |
| **Vandaag** | Moet vandaag |
| **Te laat** | Vervaldatum voorbij en nog niet afgevinkt |
| **Afgerond** | Afgevinkt |

---

## De "te laat"-regels

Overal in het portaal geldt dezelfde eenvoudige regel: **de datum is voorbij en het
is nog niet af.**

| Wat | Wanneer "te laat" |
|---|---|
| Factuur | Vervaldatum ligt vóór vandaag én de status is niet Betaald |
| Activiteit | Vervaldatum ligt vóór vandaag én niet afgevinkt |
| Project | Deadline ligt vóór vandaag én niet Afgerond |

Het is een vergelijking op **datum**, niet op tijdstip. Een factuur die vandaag
vervalt is vandaag nog niet te laat; morgen wel.

Een factuur in **Concept** die over zijn vervaldatum is, krijgt óók het label "Te
laat". Dat is opvallend, want de klant heeft die factuur nooit ontvangen — zie de
onzekerheden onderaan.

---

## Financiële cijfers

Op het financiële overzicht kies je een periode: deze maand, vorige maand, dit jaar,
vorig jaar of een zelfgekozen bereik.

### Wat elk cijfer betekent

| Cijfer | Hoe het wordt berekend |
|---|---|
| **Omzet** | Alle facturen die níét op Concept staan, met een **factuurdatum** binnen de periode. Inclusief btw |
| **Ontvangen** | Alle facturen op Betaald, met een **betaaldatum** binnen de periode. Inclusief btw |
| **Openstaand** | Alle facturen op Verzonden — ongeacht periode. Inclusief btw |
| **Te verwachten** | Alle offertes op Geaccepteerd die nog niet gefactureerd zijn. Inclusief btw |
| **Kosten** | Alle kostenregels met een datum binnen de periode |
| **Netto / winst** | Ontvangen − kosten |
| **Marge** | Netto gedeeld door ontvangen, in procenten |

### Drie dingen die vaak verwarren

**1. Omzet en ontvangen zijn niet hetzelfde.** Omzet kijkt naar de factuurdatum;
ontvangen naar de datum waarop het geld binnenkwam. Een factuur van december die in
januari betaald wordt, telt in december mee voor de omzet en in januari voor het
ontvangen bedrag.

**2. Winst wordt berekend op ontvangen geld, niet op omzet.** Kosten worden dus
afgetrokken van wat er daadwerkelijk binnen is. Dat maakt de winst voorzichtiger dan
wanneer je van de omzet uit zou gaan.

**3. Creditfacturen en gecrediteerde facturen tellen nergens mee.** Zodra een factuur
is gecrediteerd, verdwijnt hij samen met zijn creditnota uit alle cijfers. Ze heffen
elkaar op, dus ze worden allebei weggelaten in plaats van tegen elkaar weggestreept.

**Alle bedragen op het financiële overzicht zijn inclusief btw.**

---

## Btw-berekening

### Per regel, niet per document

Elke offerte- en factuurregel heeft een **eigen btw-percentage**. Eén factuur kan dus
regels met 21% en met 9% bevatten. De btw wordt per regel berekend en daarna
opgeteld.

Keuzemogelijkheden: **21%**, **9%** en **0%**.

### Exclusief of inclusief

Je kunt een bedrag op twee manieren invoeren:

- **Exclusief btw** (standaard bij offertes en facturen): btw komt erbovenop.
  Bij € 100 en 21% wordt dat € 21 btw en € 121 totaal.
- **Inclusief btw** (gebruikelijk bij kosten): het bedrag is het eindbedrag en de
  btw wordt eruit gerekend. Bij € 121 en 21% is dat € 100 exclusief en € 21 btw.

Alles wordt op twee decimalen afgerond.

### Regelprijs

De prijs van een regel is altijd **aantal × prijs per stuk**, ook bij het regeltype
"Overig". Twee stuks van € 120 is dus € 240.

---

## Onzeker — controleren door Niels

- **"Te factureren" op het dashboard.** De widget bestaat, maar of die alleen 100%
  afgeronde klussen telt of ook deels afgeronde is uit de code niet eenduidig af te
  leiden. Boss moet hier geen definitie geven.
- **Waarom een concept-factuur "Te laat" kan zijn.** Technisch klopt de regel, maar
  het is de vraag of dat de bedoeling is. Als een klant hierover belt, moet Boss dit
  niet verdedigen maar doorverwijzen.
- **Of "Te verwachten" geaccepteerde offertes uitsluit die al gefactureerd zijn.** In
  de code wordt alleen op status Geaccepteerd gefilterd; of er een koppeling met
  gemaakte facturen is, is niet vastgesteld. Mogelijk telt een geaccepteerde offerte
  dubbel zodra de factuur er ook is.
- **De precieze fase-namen in de pipeline.** Die zijn per bedrijf instelbaar, dus
  Boss mag nooit vaste fasenamen noemen.
- **Of het btw-percentage per bedrijf een standaardwaarde heeft.** 21% lijkt de
  standaard, maar of dat instelbaar is onder Standaardwaarden is niet bevestigd.
- **Of een offerte automatisch op Geaccepteerd springt bij online ondertekenen**, of
  dat er nog een handmatige stap tussen zit.
