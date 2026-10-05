# Instellingen, je account en inloggen

> Kennisbron voor **Boss**.

---

## Instellingen

Menu **Bedrijf**, **Instellingen**, of via je avatar rechtsboven, **Mijn profiel**,
**Naar bedrijfsinstellingen**.

### Tabbladen en wie ze ziet
1. **Mijn profiel**: iedereen.
2. **Bedrijfsprofiel**: de beheerder (of met het recht *Instellingen*).
3. **Algemeen**: idem.
4. **E-mailtemplates**: idem.
5. **Pipeline**: idem.
6. **Websiteformulier**: idem. In alle pakketten.
7. **Voertuigen**: alleen de beheerder, en alleen met de voertuigenmodule.
8. **Abonnement**: alleen de beheerder.
9. **Integraties**: de beheerder (of met het recht *Instellingen*).

Wijzigingen in de bedrijfsinstellingen slaat in de praktijk de beheerder op.

### Mijn profiel
- Profielfoto en naam wijzigen, met **Opslaan**. Je e-mailadres kun je niet zelf
  wijzigen.
- **Wachtwoord wijzigen**: huidig wachtwoord, nieuw wachtwoord en herhalen. Minimaal 8
  tekens, met een hoofdletter, een cijfer en een speciaal teken.
- Onderaan de **Gevarenzone** (zie account stoppen).

### Bedrijfsprofiel
Logo (**Logo uploaden**, tot 10 MB, JPG of PNG), merkkleur, bedrijfsnaam,
e-mailadres, **Antwoord e-mailadres**, telefoon, KvK-nummer (8 cijfers), btw-nummer,
website, branche en adres. Klik **Opslaan**.

Logo en merkkleur staan op je offertes, facturen en de mails aan je klanten. Antwoordt
een klant op een mail, dan komt het antwoord binnen op het antwoord-e-mailadres (of
anders op het bedrijfsmailadres).

### Algemeen
- Kaart **Algemeen**: **Uurtarief**, **Reiskosten (€/km)**, **BTW (%)**,
  **BTW-stelsel** (factuurstelsel of kasstelsel), **Offerte geldig (dagen)** en
  **Betaaltermijn facturen (dagen)**. Deze waarden worden vooraf ingevuld bij nieuwe
  offertes en facturen.
- **Offerte geldig (dagen)** bepaalt tot wanneer een offerte geldig is.
  **Betaaltermijn facturen (dagen)** bepaalt de vervaldatum van een nieuwe factuur
  (standaard 14 dagen). Dat zijn twee aparte instellingen. Bestaande facturen houden
  hun vervaldatum.
- Kaart **Herinneringen**: de urenherinnering (zie uren).
- Kaart **Agenda**: **Eerste zichtbare uur** en **Laatste zichtbare uur**.
- Kaart **Eigen prijzen / eenheden**: eigen regeltypes voor offertes en facturen, met
  **+ Nieuwe toevoegen** (naam, standaardprijs, eenheid, eventueel eigen btw).

Dit tabblad heette eerder **Standaardwaarden**.

### E-mailtemplates
Zie e-mails.

### Pipeline
- **Automatische koppeling**: per gebeurtenis (Akkoord, Werkbon gepland, Klus gestart,
  Factuur verstuurd, Factuur betaald, Verloren) kies je naar welke fase de aanvraag
  schuift, of **Niet gekoppeld**.
- **Pipelinefasen**: **+ Nieuwe fase**, en per fase naam en kleur wijzigen of
  verwijderen.
- **Verloren-redenen**: **+ Nieuwe reden**, wijzigen of verwijderen.

### Websiteformulier
Hiermee komen aanvragen van je **eigen website** meteen in BossBase. Elke aanvraag
wordt een project in de eerste fase van de pipeline, met de klant erbij: bestaat de
klant al (zelfde e-mailadres), dan komt het project bij die klant, anders wordt hij
aangemaakt met naam, e-mail, telefoon en adres, en bron **Website**. De beheerder en
collega's met het recht *Verkooppijplijn* krijgen een melding. Op de projectkaart
staat in het blok **De aanvraag** precies wat er is ingevuld, en bij **Via** staat
**Website**. Foto's die de klant meestuurt, staan bij de foto's van de aanvraag.
Het zit in alle pakketten (Starter, Groei en Team).

Naast de titel staat een **info-icoontje**: dat opent een pagina met de uitleg stap
voor stap, ook voor WordPress en Wix.

**Stap 1. Op welke website staat het formulier?** Typ het adres van je website
(bijvoorbeeld mijnbedrijf.nl) en klik **Toevoegen**; het komt erin met en zonder www.
Alleen van deze adressen worden aanvragen aangenomen. Zonder adres werkt het
formulier nog nergens. Een Wix-site zonder eigen domein: vul het wixsite.com-adres in.

**Stap 2. Hoe wil je het formulier gebruiken?** Twee manieren:
- **Kant-en-klaar formulier**: plakken en klaar, in de merkkleur uit het
  bedrijfsprofiel. Naam, e-mailadres en omschrijving staan er altijd in; telefoon,
  adres, postcode, plaats, gewenste datum en foto's (maximaal 5) zet je aan of uit.
  Optioneel een link naar je privacyverklaring. Rechts zie je een voorbeeld.
- **Koppelen aan je eigen formulier**: je bestaande formulier (bijvoorbeeld Contact
  Form 7, WPForms of Elementor) blijft werken zoals het werkte, en BossBase krijgt
  een kopie. Vul de pagina met je formulier in en klik **Velden ophalen** (dat kan
  pas na opslaan, en alleen voor een pagina op een van je adressen). Kies per veld
  waar het in BossBase hoort: naam, e-mailadres, telefoonnummer, adres, postcode,
  plaats, omschrijving van de aanvraag, gewenste datum of foto's. Lukt ophalen niet,
  vul dan zelf de veldnaam in (het name-attribuut) met **+ Veld toevoegen**. Het
  e-mailadres moet gekoppeld zijn. Twee velden bij hetzelfde BossBase-veld (voornaam
  en achternaam) worden samengevoegd. Wat je niet koppelt, gaat niet naar BossBase.

Klik **Opslaan**. Met het vinkje **Aanvragen ontvangen** zet je het formulier aan of uit.

**Stap 3. Plak de code in je website.** Klik **Code kopiëren**. Er zit geen geheime
sleutel in; je kunt de code gerust doorsturen naar wie je website bouwt.
- WordPress, kant-en-klaar: pagina bewerken, blok **Aangepaste HTML** (Custom HTML),
  code plakken, **Bijwerken**. Elementor: widget **HTML**. Klassieke editor: tabblad
  **Tekst**.
- WordPress, koppelen: plugin **WPCode** installeren, **Code Snippets › Header &
  Footer**, code in **Footer** plakken, opslaan. Leeg daarna een eventuele cache.
- Wix: gebruik het kant-en-klare formulier met de link (**Link kopiëren**). In de
  editor: **Elementen toevoegen › Code insluiten › Een site insluiten**, link plakken,
  vak ongeveer 750 pixels hoog maken, publiceren. Koppelen aan een formulier van Wix
  zelf kan niet.
- Squarespace (blok Code), Webflow (Embed) en Jimdo (Widget/HTML) werken als WordPress.

**Stap 4. Testen.** **Testaanvraag versturen** zet een aanvraag van "Test Aanvraag" in
je pipeline; met **Bekijken** open je hem. Daarna kun je zelf je formulier op je site
invullen. Testaanvragen kun je gewoon verwijderen.

**Spam en veiligheid:** een verborgen veld dat alleen robots invullen, een limiet per
IP-adres en per e-mailadres, en alleen de opgegeven adressen.

**Komt er niets binnen?** Controleer of **Aanvragen ontvangen** aan staat en is
opgeslagen, of het juiste adres (met of zonder www) bij stap 1 staat, bij koppelen of
het e-mailveld gekoppeld is en de code op de pagina met het formulier staat, en leeg
de cache van je website. Een nieuw adres werkt binnen een minuut.

### Voertuigen, Abonnement, Integraties
Zie werkbonnen-en-planning, abonnementen en integraties.

---

## Account stoppen

Onderaan **Mijn profiel**, in de **Gevarenzone**.

- **De eigenaar** ziet **Bedrijf sluiten**. Dit stopt direct de toegang van het hele
  team, ook als er nog een betaalde periode loopt. Wil je alleen stoppen met betalen,
  zeg dan op onder **Instellingen**, **Abonnement**. Bevestigen doe je door
  VERWIJDEREN te typen.
- **Iedereen anders** ziet **Account deactiveren**: alleen je eigen account stopt, het
  bedrijf en de gegevens van het team blijven bestaan. Een beheerder kan je later
  weer activeren.
- Wil je dat je gegevens echt worden verwijderd, klik dan op
  **Verwijdering aanvragen**. Dat is een verzoek aan het team van BossBase.

---

## Inloggen en wachtwoord

- Inloggen met e-mailadres en wachtwoord.
- **Wachtwoord vergeten?** Vul je e-mailadres in en klik **Stuur resetlink**. De link
  in de mail is één uur geldig en werkt één keer. Daarna kies je een nieuw wachtwoord.
- Is de link verlopen of al gebruikt, vraag dan een nieuwe aan.

## Registreren

Een nieuw bedrijf aanmelden gaat in een paar stappen: je account (naam, e-mail,
wachtwoord), je bedrijf (bedrijfsnaam, branche, telefoonnummer en KvK) en welk pakket
bij je past. Het telefoonnummer is verplicht; een buitenlands nummer kan ook, met
landcode (bijv. +32).
Daarna krijg je een **code van 6 cijfers** per mail om je e-mailadres te bevestigen.
De code is 10 minuten geldig; na een minuut kun je een nieuwe laten sturen.

Je begint altijd met 14 dagen gratis proberen, zonder betaalgegevens. Teamleden
nodig je daarna uit via **Team**.

## Een uitnodiging accepteren

Klik op de link in de uitnodigingsmail, vul je naam in, kies een wachtwoord en klik
**Account aanmaken**. Je e-mailadres staat al vast. De link is 48 uur geldig; is hij
verlopen, vraag de beheerder dan om een nieuwe uitnodiging.
