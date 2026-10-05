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
staat in het blok **De aanvraag** precies wat er is ingevuld, met de eigen velden
onderaan onder hun eigen naam, en bij **Via** staat **Website**. Foto's die de klant
meestuurt, staan bij de foto's van de aanvraag. Het zit in alle pakketten (Starter,
Groei en Team).

Je stelt het in met een **wizard van vijf stappen**, één stap tegelijk, met
**Volgende** en **Vorige**. Elke stap wordt meteen opgeslagen. Bovenaan staat een
**info-icoontje** dat een pagina opent met de hele uitleg, ook voor WordPress en Wix.

1. **Heb je al een contactformulier op je website?** **Ja**: we koppelen je bestaande
   formulier (bijvoorbeeld Contact Form 7, WPForms of Elementor); dat blijft werken
   zoals het werkte, je krijgt ook je eigen mail nog, en BossBase krijgt een kopie.
   **Nee**: je krijgt een kant-en-klaar formulier in de merkkleur uit het
   bedrijfsprofiel.
2. **Wat is het adres van je website?** Eén veld; zonder https:// of www mag ook.
   Alleen vanaf dit adres worden aanvragen aangenomen (met en zonder www). Bij **Ja**
   zoekt BossBase meteen het formulier op die pagina op en leest de velden; vul je
   alleen je website in, dan kijkt hij ook op /contact en /offerte-aanvragen. Lukt
   dat niet, dan staat erbij waarom (pagina bestaat niet, website blokkeert ons,
   formulier wordt later geladen, of het is Wix) en kun je **Zelf de velden
   invullen**.
3. **De velden.** Bij **Nee**: zet telefoon, adres, postcode, plaats, gewenste datum
   en foto's (maximaal 5) aan of uit; naam, e-mail en omschrijving staan er altijd in.
   Ernaast zie je een voorbeeld. Met **+ Eigen veld** voeg je eigen vragen toe, zoals
   "Soort dak": een naam, een soort (Tekst, Getal, Keuze uit opties, Ja/nee of Datum;
   bij een keuze de opties met komma's ertussen, minstens twee) en **Verplicht**. Bij
   **Ja**: per veld van je formulier staat al een voorstel waar het in BossBase komt
   (naam, e-mailadres, telefoon, adres, postcode, plaats, omschrijving, gewenste datum,
   foto's of **Eigen veld…** met een eigen naam). Het e-mailadres moet gekoppeld zijn.
   Twee velden bij hetzelfde BossBase-veld (voornaam en achternaam) worden
   samengevoegd. Met **+ Veld toevoegen** voeg je zelf een veldnaam toe (het
   name-attribuut, bijvoorbeeld your-name bij Contact Form 7 of form_fields[name] bij
   Elementor).
4. **Op welke soort website zet je het?** Kies **WordPress**, **Wix** of **Anders**.
   Je krijgt de code met een kopieerknop en drie korte stappen:
   - WordPress, kant-en-klaar: pagina bewerken, blok **Aangepaste HTML** toevoegen,
     code plakken en **Bijwerken**.
   - WordPress, koppelen: plugin **WPCode** installeren, **Code Snippets › Header &
     Footer**, code bij **Footer** plakken en opslaan.
   - Wix: je krijgt een link in plaats van code. **Toevoegen › Code insluiten › Een
     site insluiten**, link plakken, vak ongeveer 750 pixels hoog, publiceren.
     Koppelen kan bij Wix niet; de wizard stelt dan voor het kant-en-klare formulier
     te gebruiken.
   - Anders: plak de code in een blok voor eigen HTML (kant-en-klaar) of in de footer
     (koppelen) en publiceer.
   Er zit geen geheime sleutel in de code.
5. **Test het.** **Testaanvraag versturen** zet een aanvraag van "Test Aanvraag" in je
   pipeline, met voorbeeldwaarden in je eigen velden; met **Bekijk in de pipeline**
   open je hem. Met **Klaar** zet je het formulier aan.

Daarna zie je het **eindscherm** "Je websiteformulier staat aan", met de manier, je
website, de velden en je eigen velden onder elkaar. Met **Aanpassen** loop je de
wizard opnieuw door, met **Code bekijken** ga je naar de code. Onder **Meer
instellingen**: **Aanvragen ontvangen** (aan/uit), je **Websites** (ook een tweede
site toevoegen of er een weghalen), de **Kleur** (die wijzig je in Bedrijfsprofiel),
een link naar je privacyverklaring, de **Link naar het formulier** (voor Wix en
andere sitebouwers), en de uitleg stap voor stap. Klik daar op **Opslaan**.

**Spam en veiligheid:** een verborgen veld dat alleen robots invullen, een limiet per
IP-adres en per e-mailadres, en alleen de opgegeven websites.

**Komt er niets binnen?** Controleer onder Meer instellingen of **Aanvragen
ontvangen** aan staat en je website bij Websites staat (met of zonder www), bij
koppelen of het e-mailadres gekoppeld is en de code op de pagina met het formulier
staat, en leeg de cache van je website. Een nieuw adres werkt binnen een minuut.

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
