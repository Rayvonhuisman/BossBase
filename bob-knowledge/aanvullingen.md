# Aanvullingen op de inventarisatie

> Kennisbron voor **Boss**. Alles wat wél in het portaal zit maar níét in
> `_inventarisatie.md` staat: verborgen knoppen, bulk-acties, exports, validaties en
> foutmeldingen.

---

## Database-pagina — het krachtigste scherm dat niemand kent

De Database-pagina wordt in de inventarisatie kort genoemd, maar hier zit veruit de
meeste verborgen functionaliteit. Je selecteert klanten met vinkjes (of alles op de
pagina in één keer) en voert daarna een actie uit op de hele selectie.

**Het actiemenu bij een selectie:**

| Actie | Wat het doet |
|---|---|
| E-mail versturen | Eén mail naar alle geselecteerde klanten, met een template als basis |
| Exporteren als Excel | Klantgegevens als Excel-bestand |
| Exporteren als CSV | Hetzelfde als CSV |
| Segment opslaan | De huidige filterselectie bewaren om later opnieuw te gebruiken |
| Download offertes (PDF) | Alle offertes van de selectie, gebundeld |
| Download facturen (PDF) | Alle facturen van de selectie |
| Download creditfacturen (PDF) | Alleen de creditnota's |
| Download getekende offertes | Alleen de offertes die de klant heeft ondertekend |
| Download alles (ZIP) | Alles hierboven in één zipbestand |

Bij het downloaden van meerdere documenten zie je een voortgangsteller. De bestanden
komen als **zipbestand** binnen met de datum in de naam.

Elke export wordt vastgelegd op de **tijdlijn van de klant** — je kunt dus altijd
terugzien wanneer iemands gegevens zijn geëxporteerd.

**Filters op deze pagina** die elders niet voorkomen: alle medewerkers / bepaalde
medewerker, alle types, gesynchroniseerd of niet, ondertekend of niet, verstuurd of
niet, laatste mail, laatste project, omzet.

Vindt het systeem niets voor je selectie, dan krijg je een concrete melding, bijvoorbeeld:
*Geen getekende offertes gevonden voor de selectie.*

---

## Uploads: limieten en formaten

| Waar | Maximum | Toegestane formaten |
|---|---|---|
| Bijlagen (o.a. bij kosten) | **10 MB** per bestand | JPG, PNG, PDF |
| Bedrijfslogo | **10 MB** | JPG, PNG |
| Profielfoto | **5 MB** | JPG, PNG, WebP |
| Werkbonfoto's | — | alle afbeeldingen; op mobiel opent de camera direct |

Bij een te groot bestand: *[bestandsnaam]: bestand is te groot. Maximum is 10MB.*

Foto's worden vóór het uploaden automatisch verkleind en omgezet naar JPG. Je hoeft
dus niet zelf te comprimeren.

---

## Validaties: wat is verplicht

**Klant**
- Naam is verplicht
- E-mailadres moet een geldig formaat hebben
- KvK-nummer moet uit 8 cijfers bestaan

**Offerte en factuur**
- Er moet een klant gekozen zijn (*Kies een klant* / *Selecteer een klant*)
- Elke regel heeft een omschrijving nodig
- Bij crediteren moet je minimaal één regel aanvinken (*Selecteer minimaal één regel*)
- Bij onvolledige klantgegevens: *Vul eerst de klantgegevens aan voordat je een
  factuur aanmaakt*

**Afspraak en activiteit**
- Titel is verplicht
- Datum is verplicht
- Start- en eindtijd zijn verplicht
- De eindtijd moet ná de starttijd liggen

**Uren**
- Aantal uren moet groter zijn dan 0

**Kosten**
- Bedrag moet groter zijn dan 0

**Project**
- Projectnaam is verplicht

**Werkbon**
- Er moet minimaal één verantwoordelijke worden aangewezen
- Bij inplannen vanuit de agenda: *Kies een werkbon*

**Deal verliezen**
- Er moet een reden gekozen worden (*Kies een reden*)
- Er moet een "Verloren"-fase in de pipeline bestaan; ontbreekt die, dan lukt het
  markeren niet

**E-mailtemplates**
- Onderwerp is verplicht
- Type is verplicht
- Er kan er maar één per type zijn (*Een template met dit type bestaat al*)

**Bedrijfsprofiel**
- Het antwoord-e-mailadres moet een geldig formaat hebben

---

## Foutmeldingen die een klant kan tegenkomen

| Melding | Wat er aan de hand is |
|---|---|
| *Een verstuurde factuur kan niet meer gewijzigd worden* | De factuur is al bij de klant. Corrigeren gaat via een creditfactuur |
| *Deze factuur is gecrediteerd en kan niet verwijderd worden* | Verwijder eerst de creditnota |
| *Te veel e-mails verstuurd, probeer het later opnieuw* | Er geldt een uurlimiet op verzonden mail |
| *Je account staat op alleen-lezen* | De proefperiode is voorbij of het abonnement loopt niet meer |
| *Dit past niet binnen je huidige abonnement* | Een limiet of functie hoort bij een groter pakket |
| *Teamlid heeft de uitnodiging nog niet geaccepteerd* | Je probeert iets te doen met een teamlid dat nog niet is ingelogd |
| *Geen "Verloren"-fase gevonden in de pipeline* | De pipeline mist een fase die nodig is om een deal te verliezen |
| *Vul API token en administratie-ID in* | De boekhoudkoppeling is nog niet volledig ingevuld |
| *PDF genereren mislukt* | Het document kon niet worden opgebouwd |
| *Sync mislukt* | De koppeling met de boekhouding gaf een fout |

---

## Toetsenbordbediening

Er zijn geen echte sneltoetsen (geen Ctrl- of Cmd-combinaties). Wel werkt normale
toetsenbordbediening overal:

- **Escape** sluit vensters, panelen en menu's
- **Enter** bevestigt en opent
- **Pijltjestoetsen** navigeren door keuzelijsten en de datumkiezer
- **Home / End** springen naar begin en eind in de datumkiezer

---

## Verborgen of afwezig — Boss mag hier niet over uitweiden

- **Google Agenda** staat op drie plekken in de schermen verborgen. Een klant kan het
  niet aanzetten en ziet er niets van.
- **AFAS** staat als boekhoudkoppeling verborgen in Instellingen, terwijl de
  functiebeschrijving hem wel noemt.
- Op de agendapagina en in het activiteitenvenster zit eveneens verborgen
  Google-functionaliteit.

---

## Adressen invullen

Bij het invullen van een adres wordt automatisch aangevuld op basis van postcode en
huisnummer. Dit zit in **alle** pakketten. Het werkt alleen voor Nederlandse
adressen.

---

## Notities met vermeldingen

In de notitie-editor op de klantkaart kun je teamleden noemen met een
apenstaartje. Zij krijgen daar een melding van.

---

## Het super-admin-portaal — INTERN

> 🔒 **Boss mag hier NOOIT uitleg over geven aan klanten.** Dit portaal is uitsluitend
> voor de eigenaren van BossBase.

Er bestaat een apart intern portaal waarin alle aangesloten bedrijven zichtbaar zijn:
hun abonnement, hun gebruik, de aanvragen voor gratis websites en de
upgradeverzoeken. Het is bereikbaar voor een enkele interne beheerder.

Vraagt een klant hiernaar, dan is het juiste antwoord dat dit geen onderdeel van het
portaal is. Boss mag het bestaan ervan niet bevestigen, geen route noemen en geen
functies beschrijven.

---

## Onzeker — controleren door Niels

- **Of "Segment opslaan" opgeslagen segmenten ook weer toont**, en waar.
- **Wat een "gesynchroniseerd"-filter op de Database-pagina precies betekent** —
  vermoedelijk of de klant in de gekoppelde boekhouding staat, maar dat is niet
  bevestigd.
- **De precieze uurlimiet op verstuurde e-mails.**
- **Of bulk-e-mail naar een grote selectie in één keer gaat of gespreid wordt.**
- **Of er een limiet zit op het aantal klanten dat je tegelijk kunt selecteren** voor
  een zip-download; bij honderden klanten kan dat lang duren.
- **Of de adres-autocomplete ook Belgische adressen aankan.**
- **Wie er toegang heeft tot het interne portaal** — dit is intern en hoort niet in
  de kennisbank van Boss, maar is wel goed om vast te leggen.
