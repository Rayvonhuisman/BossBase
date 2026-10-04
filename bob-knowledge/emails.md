# E-mails en templates

> Kennisbron voor **Boss**.

Templates beheer je onder **Instellingen**, tabblad **E-mailtemplates**.

---

## De acht standaardtemplates

| Template | Wanneer | Automatisch? |
|---|---|---|
| **Offerte** | Als je een offerte verstuurt | Nee, jij verstuurt hem |
| **Offerte geaccepteerd** | Zodra de klant de offerte online tekent | Ja, altijd |
| **Factuur** | Als je een factuur verstuurt | Nee, jij verstuurt hem |
| **Herinnering 1** | Na de vervaldatum van een onbetaalde factuur | Zelf, of automatisch (Groei en Team) |
| **Herinnering 2** | Later na de vervaldatum | Zelf, of automatisch (Groei en Team) |
| **Aanvraag ontvangen** | Als je in het portaal een nieuwe aanvraag aanmaakt voor een klant met e-mailadres | Ja, aan of uit te zetten |
| **Afspraak bevestiging** | Als je een activiteit van het type Bezoek aanmaakt voor een klant met e-mailadres | Ja, aan of uit te zetten |
| **Afspraak herinnering** | Een aantal dagen vóór de afspraak | Ja, aan of uit te zetten |

### Instellen
Klik bovenaan op de template. Je ziet:
- het vinkje **Actief**;
- de variabelen om in te voegen;
- **Onderwerp** en **Berichttekst**;
- bij sommige templates **Automatisch verzenden**, met het aantal dagen;
- **Reset** (zet de berichttekst terug naar de standaard) en **Opslaan**.

Standaard aantal dagen:
- Herinnering 1: 7 dagen na de vervaldatum.
- Herinnering 2: 14 dagen na de vervaldatum.
- Afspraak herinnering: 1 dag voor de afspraak.

Een automatische mail gaat alleen als zowel **Actief** als de schakelaar voor
automatisch versturen aan staan. Herinneringen en afspraakherinneringen gaan elke
ochtend, en elke mail maar één keer.

Automatische betaalherinneringen zitten in Groei en Team.

### Variabelen
Je zet ze tussen dubbele accolades, bijvoorbeeld `{{klant_naam}}`. Bij het versturen
komt daar de echte waarde.

| Template | Variabelen |
|---|---|
| Offerte | klant_naam, bedrijfsnaam, offerte_nummer, totaal_bedrag, vervaldatum, link |
| Offerte geaccepteerd | klant_naam, bedrijfsnaam, offerte_nummer |
| Factuur | klant_naam, bedrijfsnaam, factuur_nummer, totaal_bedrag, vervaldatum, betaalinstructie |
| Herinnering 1 en 2 | klant_naam, bedrijfsnaam, factuur_nummer, totaal_bedrag, vervaldatum |
| Aanvraag ontvangen | klant_naam, bedrijfsnaam |
| Afspraak bevestiging en herinnering | klant_naam, bedrijfsnaam, afspraak_datum, afspraak_tijd |

- `link` geeft de knop waarmee de klant de offerte bekijkt en ondertekent.
- `betaalinstructie` vertelt de klant hoe hij betaalt: met de betaalknop als je de
  Stripe betaallink hebt, anders de tekst om over te maken met het factuurnummer.
- Typ je een variabele verkeerd (bijvoorbeeld `{{klantnaam}}`), dan ziet de klant hem
  letterlijk in de mail staan.

## Eigen templates (Groei en Team)
Klik op het plusje rechts van de templates. Vul naam, onderwerp en tekst in en klik
**Template aanmaken**. Beschikbare variabelen: klant_naam, bedrijfsnaam,
factuur_nummer, offerte_nummer, totaal_bedrag, vervaldatum, afspraak_datum,
afspraak_tijd en link. Een eigen template gebruik je bij het mailen vanaf de
klantkaart (tabblad **E-mails**) en bij een mail aan meerdere klanten via **Database**.

In Starter kun je de standaardtemplates aanpassen, maar geen eigen templates maken.

---

## Hoe je mails eruitzien
Mails aan jouw klanten hebben je eigen logo, merkkleur en bedrijfsnaam (uit
Instellingen, **Bedrijfsprofiel**). Antwoordt een klant, dan komt dat binnen op je
**Antwoord e-mailadres**, of anders op het e-mailadres van je bedrijf.

## Mails van BossBase zelf
Deze komen van BossBase en zijn niet aan te passen:
- uitnodiging voor een teamlid;
- de code om je e-mailadres te bevestigen en de link bij wachtwoord vergeten;
- meldingen aan collega's als ze getagd, toegewezen of verantwoordelijk gemaakt zijn;
- 's avonds een overzicht als je planning is gewijzigd;
- de urenherinnering "Vul je werkdag in" (als die per mail aan staat);
- een melding als een klant een offerte heeft ondertekend of een factuur heeft betaald;
- mails over je proefperiode en de bevestiging van je abonnement.

## Verstuurde mails terugvinden
Op de klantkaart, tabblad **E-mails**. Daar zie je wat er is verstuurd, wanneer, en
de inhoud.

Je kunt per persoon maximaal 60 mails per uur versturen. Daarboven zie je "Te veel
e-mails verstuurd, probeer het later opnieuw".
