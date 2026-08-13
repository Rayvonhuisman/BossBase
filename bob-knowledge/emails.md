# E-mails en templates

> Kennisbron voor **Boss**. Beschrijft welke e-mails het systeem verstuurt, wanneer,
> en wat de klant zelf kan aanpassen.

Te beheren onder **Instellingen → E-mailtemplates**.

---

## De negen templates

Elk bedrijf krijgt deze negen automatisch bij het aanmaken van het account. Ze zijn
allemaal aan te passen: onderwerp en tekst.

| Template | Wanneer | Automatisch? | Aan/uit te zetten |
|---|---|---|---|
| **Offerte** | Bij het versturen van een offerte | Handmatig — jij drukt op versturen | nee, hoort bij de actie |
| **Offerte geaccepteerd** | Zodra de klant online tekent | Automatisch | ja |
| **Factuur** | Bij het versturen van een factuur | Handmatig | nee, hoort bij de actie |
| **Herinnering 1** | Na de vervaldatum van een onbetaalde factuur | Automatisch én handmatig | ja + aantal dagen |
| **Herinnering 2** | Later na de vervaldatum | Automatisch én handmatig | ja + aantal dagen |
| **Aanvraag ontvangen** | Als er een nieuwe aanvraag/lead binnenkomt | Automatisch | ja |
| **Welkom** | Bij een nieuwe klant | Handmatig | nee |
| **Afspraak bevestiging** | Bij het inplannen van een afspraak | Automatisch | ja |
| **Afspraak herinnering** | Kort vóór de afspraak | Automatisch | ja + aantal dagen |

### Standaardinstellingen voor de timing

| Template | Standaard | Betekenis |
|---|---|---|
| Herinnering 1 | 7 | dagen ná de vervaldatum |
| Herinnering 2 | 14 | dagen ná de vervaldatum |
| Afspraak herinnering | 1 | dag(en) vóór de afspraak |

Alleen bij deze drie kun je het aantal dagen zelf instellen. Bij de overige
templates is er geen dagenveld.

---

## Variabelen per template

Je zet ze tussen dubbele accolades in het onderwerp of de tekst; bij het versturen
worden ze vervangen door de echte waarden.

| Template | Beschikbare variabelen |
|---|---|
| Offerte | klant_naam, bedrijfsnaam, offerte_nummer, totaal_bedrag, vervaldatum, link |
| Offerte geaccepteerd | klant_naam, bedrijfsnaam, offerte_nummer |
| Factuur | klant_naam, bedrijfsnaam, factuur_nummer, totaal_bedrag, vervaldatum, betaalinstructie |
| Herinnering 1 | klant_naam, bedrijfsnaam, factuur_nummer, totaal_bedrag, vervaldatum |
| Herinnering 2 | klant_naam, bedrijfsnaam, factuur_nummer, totaal_bedrag, vervaldatum |
| Aanvraag ontvangen | klant_naam, bedrijfsnaam |
| Welkom | klant_naam, bedrijfsnaam |
| Afspraak bevestiging | klant_naam, bedrijfsnaam, afspraak_datum, afspraak_tijd |
| Afspraak herinnering | klant_naam, bedrijfsnaam, afspraak_datum, afspraak_tijd |

**De variabele `link`** zit alleen in de offerte-template en levert de knop waarmee
de klant de offerte online bekijkt en ondertekent.

**De variabele `betaalinstructie`** zit alleen in de factuur-template. Daar komt de
tekst in die de klant vertelt hoe hij moet betalen — met een betaallink als die
module actief is, anders de standaardtekst om het bedrag over te maken onder
vermelding van het factuurnummer.

Een variabele die niet bestaat blijft gewoon als tekst staan. Typ je `{{klantnaam}}`
in plaats van `{{klant_naam}}`, dan ziet de klant dat letterlijk in zijn mail staan.

---

## Zelf templates toevoegen

Vanaf **Groei** kun je naast de negen standaardtemplates eigen templates aanmaken.
Bij Starter kun je de bestaande wel aanpassen, maar geen nieuwe toevoegen.

Voor eigen templates is deze set variabelen beschikbaar: klant_naam, bedrijfsnaam,
factuur_nummer, offerte_nummer, totaal_bedrag, vervaldatum, afspraak_datum,
afspraak_tijd, link.

---

## Hoe de e-mail eruitziet

Uitgaande post aan klanten draagt de **huisstijl van het bedrijf**: het logo en de
merkkleur uit Instellingen → Bedrijfsprofiel. Staat er geen logo, dan komt de
bedrijfsnaam als tekst bovenaan.

Belangrijk onderscheid:
- **Mails aan jouw klanten** (offerte, factuur, herinnering, afspraak) → jouw logo,
  jouw kleur, jouw bedrijfsnaam als afzender.
- **Mails van BossBase aan jou** (abonnementsbevestiging, uitleg over je
  proefperiode) → BossBase-huisstijl.

---

## Het antwoordadres

Als een klant op een verstuurde mail antwoordt, komt dat antwoord aan op:

1. het **antwoord-e-mailadres** dat is ingesteld in Instellingen → Bedrijfsprofiel,
2. anders het **algemene e-mailadres** van het bedrijf,
3. anders nergens — dan is antwoorden niet mogelijk.

Het technische afzenderadres is altijd een BossBase-adres; het antwoordadres zorgt
ervoor dat reacties toch bij het bedrijf terechtkomen. Het ingevulde antwoordadres
wordt gecontroleerd op geldigheid.

---

## Automatische verzending in de praktijk

Er draait **elke ochtend** een controle die twee dingen doet:

1. **Betaalherinneringen** versturen voor facturen waarvan de vervaldatum voorbij is,
   volgens het ingestelde aantal dagen en alleen als de schakelaar aan staat.
2. **Afspraakherinneringen** versturen voor afspraken die over het ingestelde aantal
   dagen plaatsvinden.

Elke mail gaat maximaal één keer. Een tweede controle op dezelfde dag levert geen
dubbele post op.

De overige automatische mails hangen aan een gebeurtenis in plaats van aan een
tijdstip: *aanvraag ontvangen* gaat af bij een nieuwe lead, *afspraak bevestiging*
bij het inplannen, *offerte geaccepteerd* zodra de klant tekent.

---

## Mails die BossBase zelf stuurt

Deze staan los van de templates en zijn niet aan te passen door de klant:

| Mail | Wanneer |
|---|---|
| Abonnement actief | Na het afsluiten van een abonnement, met wat je hebt afgenomen en de maandprijs |
| Proefperiode-mails | Vijf stuks rond de gratis 14 dagen: op dag 7, dag 11, dag 14, de dag na afloop en twee weken daarna. Ze stoppen zodra er een abonnement is |
| Wachtwoord vergeten | Als je een herstelverzoek doet |
| Verificatiecode | Bij het bevestigen van je e-mailadres |
| Teamuitnodiging | Als een admin een teamlid uitnodigt |
| Website-uitvraag | Alleen bij de welkomstactie "gratis website" |

---

## Verstuurde mail terugvinden

Elke verstuurde mail wordt bewaard en is terug te zien op de **klantkaart, tab
E-mails**. Daar staat wat er is verstuurd, aan wie en wanneer, en je kunt de mail
uitklappen om de inhoud te lezen.

Er geldt een limiet op het aantal mails dat één gebruiker per uur kan versturen. Word
je daar overheen, dan verschijnt: *Te veel e-mails verstuurd, probeer het later
opnieuw.*

---

## Onzeker — controleren door Niels

- **Wanneer de Welkom-template precies wordt gebruikt.** Hij staat als handmatig
  gemarkeerd en heeft geen automatische schakelaar, maar er is geen knop gevonden
  die hem verstuurt. Mogelijk kiest de gebruiker hem zelf in het e-mailscherm op de
  klantkaart.
- **Of "Aanvraag ontvangen" ook afgaat bij een lead uit het websiteformulier**, of
  alleen bij een handmatig aangemaakte lead. In de code hangt hij aan het
  lead-formulier in het portaal.
- **Het exacte tijdstip van de dagelijkse controle** in Nederlandse tijd. Hij draait
  's ochtends; of dat 9:00 of 10:00 lokale tijd is hangt van de zomertijd af.
- **De precieze limiet op het aantal mails per uur.** Er is er één, maar het getal is
  niet met zekerheid vast te stellen vanuit gebruikersperspectief.
- **Of een aangepaste template terug te zetten is naar de standaardtekst.** Er is
  geen herstelknop gevonden.
