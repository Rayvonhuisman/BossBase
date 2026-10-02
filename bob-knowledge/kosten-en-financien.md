# Kosten en Financiën

> Kennisbron voor **Boss**.

---

## Twee soorten kosten

- **Geboekte kosten**: bonnen en inkoopfacturen die je op de pagina **Kosten**
  invoert, of die uit je boekhouding komen. Die tellen mee in je kosten en je btw.
- **Kosten op klussen**: materiaal op werkbonnen en **inkopen** op een project
  (zoals steigerhuur). Die tellen mee in de brutowinst van het project, niet in je
  geboekte kosten.

Uren staan niet in de kosten. Er is geen kostprijs per uur.

Kosten en nacalculatie zitten in **Groei en Team**.

---

## De pagina Kosten

Menu **Financieel**, **Kosten**. Vraagt het recht *Kosten*.

### Wat je ziet
- Twee weergaven: **Geboekte kosten** en **Kosten op werkbonnen**. Ze worden nooit
  bij elkaar opgeteld.
- Periode **Week**, **Maand** (standaard), **Kwartaal** of **Jaar**, met pijltjes en
  **Nu**.
- Filters op klant en categorie.
- Tellers (exclusief btw): totaal, materiaalkosten, reiskosten en overige kosten.
- Per regel: klant, categorie, omschrijving, leverancier, bedrag, datum, en waar hij
  vandaan komt (**MB** voor Moneybird, **SS** voor SnelStart, of **handmatig**).

### Kosten toevoegen
Klik op **+ Kosten toevoegen**.
- **Klant** (of Algemeen), **Project** en **Werkbon** zijn optioneel.
- **Categorie**: Materiaal, Reiskosten, Gereedschap, Inkoopfactuur, Algemene kosten
  of Overig.
- **Leverancier** (verplicht). Bestaat hij nog niet, maak hem dan meteen aan.
- **Datum** (verplicht).
- **Kostenregels**: omschrijving, bedrag, **Excl. BTW** of **Incl. BTW**, en btw 21%,
  9% of geen btw. Met **+ Regel toevoegen** voeg je regels toe.
- **Factuur of bon**: een foto of PDF (tot 10 MB). Verplicht bij alle categorieën
  behalve Reiskosten, omdat je zonder bon de btw niet kunt terugvragen.

Klik op **Kosten opslaan**. Een klik op een regel opent hem; wijzigingen worden
meteen opgeslagen. Daar kun je hem ook verwijderen.

Een kostenregel zonder leverancier krijgt een oranje label **Ontbreekt**.

---

## Kosten op een project, klant en werkbon

### Project, tabblad Kosten
- **Gefactureerd (excl. btw)**: wat er voor dit project is gefactureerd.
- **Kostprijs**: materiaal tegen inkoopprijs plus inkopen.
- **Brutowinst vóór arbeid**: gefactureerd min kostprijs. Arbeid telt niet mee.
- Blok **Inkopen**: voer extra inkopen in met omschrijving, aantal, eenheid,
  kostprijs en leverancier, en klik op het plusje. Hier is geen bon nodig.
- Het materiaal van de werkbonnen staat eronder. Dat pas je aan op de werkbon.

Inkoopprijzen en brutowinst zie je alleen met het recht *Inkoopprijzen zien*.
Geboekte kosten van de pagina Kosten staan er wel bij, maar tellen niet mee in de
brutowinst van het project.

### Klantkaart, tabblad Kosten
Totale kosten, betaald en brutowinst vóór arbeid voor deze klant, met de
kostenregels. Ook hier voer je inkopen in; heeft de klant meerdere projecten, kies
dan eerst het project.

### Werkbon, blok Kosten
De kostprijs van deze werkbon en dezelfde invoerregel voor inkopen. Een inkoop op de
werkbon telt ook mee bij het project.

---

## Financiën

Menu **Financieel**, **Financiën**. Vraagt het recht *Bedrijfsfinanciën zien*.

### Periode
Kies **Deze maand**, **Vorige maand**, **Dit jaar**, **Vorig jaar** of
**Aangepast**.

### De zes tegels
| Tegel | Wat het is |
|---|---|
| **Gefactureerd** | Alle facturen behalve concepten, op factuurdatum, min creditfacturen. Inclusief btw |
| **Ontvangen** | Betaalde facturen, op betaaldatum. Inclusief btw |
| **Openstaand** | Wat gefactureerd is en nog niet betaald, over alle periodes |
| **Te verwachten** | Geaccepteerde offertes. Inclusief btw |
| **Kosten** | Geboekte kosten in de periode. Exclusief btw |
| **Ontvangen min kosten** | Wat binnenkwam (incl. btw) min de kosten (excl. btw); geen winst, want de btw zit er nog in |

Gefactureerd en ontvangen zijn niet hetzelfde: een factuur van december die in
januari wordt betaald, telt in december bij gefactureerd en in januari bij ontvangen.

### Omzetgrafiek
Kies **Week**, **Maand**, **Kwartaal** of **Jaar**, en **Gefactureerd**,
**Ontvangen** of **Kosten**.

### Btw-kaart (Groei en Team)
Een indicatie van je btw per kwartaal of maand, uit je eigen facturen en kosten:
**BTW ontvangen**, **BTW betaald** en of je moet betalen of terugkrijgt. Dit is geen
aangifte. Of omzet telt op factuurdatum of betaaldatum stel je in onder
**Instellingen**, tabblad **Algemeen**, bij **BTW-stelsel** (factuurstelsel of
kasstelsel). Met Moneybird zie je ook de cijfers uit je boekhouding, met de knop
**Ophalen uit boekhouding**.

### Per klant / opdracht
Een tabel per klant met gefactureerd, materiaal, inkopen, uren, betaald, openstaand,
brutowinst vóór arbeid en marge.

### Exporteren
Met de knop **Exporteren** bovenaan Financiën download je de tabel Per klant /
opdracht als Excel-bestand, met een totaalregel. Die tabel telt alle periodes bij
elkaar, niet alleen de periode die je bovenaan kiest. Een losse lijst met kostenregels
exporteren kan niet. Wie zijn kosten per klant in Excel wil, gebruikt deze export:
die bevat per klant materiaal, inkopen en brutowinst. De export onder **Database**
is een klantoverzicht met gefactureerd, betaald en openstaand, zonder kosten.
