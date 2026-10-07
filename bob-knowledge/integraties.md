# Koppelingen

> Kennisbron voor **Boss**.

Te vinden onder **Instellingen**, tabblad **Integraties**. Je kunt **Stripe** en
**Moneybird** koppelen. Klik op een kaart om hem te openen. **SnelStart** komt
binnenkort: die kaart staat op **Binnenkort beschikbaar** en is nog niet te openen.

Heb je net een koppeling gemaakt, dan feliciteer ik je even en vertel ik wat er vanaf
nu vanzelf gaat. Loop je ergens tegenaan, meld het dan via **Bug of idee** bovenin.

---

## Moneybird (Groei en Team)

**Koppelen:** open de Moneybird-kaart en klik **Koppel met Moneybird**. Je logt in bij
Moneybird en geeft BossBase toegang. Heb je meer administraties, dan kies je er daarna
één. Daarna kom je vanzelf terug in BossBase. Een token of administratie-ID invullen
hoeft niet meer. Met **Verbinding testen** controleer je de koppeling; met
**Loskoppelen** stop je hem (er wordt niets verwijderd, en BossBase trekt zijn toegang
bij Moneybird in).

**Wat er gebeurt:**
- Al je facturen gaan naar Moneybird, behalve concepten: als **externe factuur** met je
  eigen factuurnummer en je eigen PDF erbij. Per regel krijgt de factuur het juiste
  btw-tarief (21%, 9%, vrijgesteld of verlegd) en een omzetrekening. In Moneybird zie
  en open je je eigen PDF bij de factuur; Moneybird maakt er geen eigen factuur van.
- **Btw verlegd en vrijgesteld:** een nieuwe Moneybird-administratie heeft daar geen
  tarief voor. Maak in Moneybird **Btw verlegd binnenland** en **Btw vrijgesteld** aan
  (Instellingen › Boekhouding › Btw-tarieven › Toevoegen). Moneybird accepteert verlegd
  alleen bij een klant met een geldig btw-nummer; dat controleert Moneybird zelf.
- Elke factuur gaat met PDF naar je boekhouding, ook als je hem nooit vanuit BossBase
  hebt verstuurd: dan maakt BossBase de PDF zelf, in je eigen huisstijl.
- Creditfacturen gaan met negatieve bedragen. Staat de gecrediteerde factuur in Moneybird
  nog open, dan worden ze daar met elkaar verrekend; dat is geen betaling, dus in BossBase
  blijven ze op hun status staan.
- Een factuur die je op betaald zet (zelf of via de betaallink), krijgt ook in Moneybird
  een betaling. Staat een factuur in Moneybird op betaald, dan gaat hij in BossBase ook
  op betaald.
- Klanten en leveranciers worden beide kanten op bijgewerkt. Een contact dat op een
  inkoopfactuur of bonnetje staat, komt binnen als leverancier, de rest als klant.
- Inkoopfacturen en bonnetjes uit Moneybird komen als kosten binnen (label MB), met btw,
  leverancier en bon. Facturen die je in Moneybird zelf maakt, komen in BossBase met het
  blauwe label **MB** naast het nummer, ook als ze betaald zijn. Staan ze nog open, dan
  is hun status **Uit boekhouding**.
- Kosten die je in BossBase invoert gaan naar Moneybird als inkoopfactuur, met bon, op de
  grootboekrekening van hun categorie. Een leverancier is daarvoor verplicht.
  Werkbonmateriaal en inkopen op een project gaan niet mee.
- Elke nacht synchroniseert BossBase vanzelf. Een betaling of gewijzigd contact in
  Moneybird komt meestal direct binnen.

**Tabbladen in de Moneybird-kaart:**
- **Instellingen**: bovenaan de lijst **Controleer na het koppelen**: welke btw-tarieven
  en categorieën er in je Moneybird-administratie moeten staan, met een vinkje of kruisje.
  Mist de categorie voor inkoop/materiaal, klik dan **Aanmaken**: BossBase maakt
  "Inkoop materialen" voor je aan en het vinkje gaat vanzelf aan. Mist een btw-tarief,
  dan opent de link direct de pagina in Moneybird waar je het aanmaakt (btw-tarieven kan
  BossBase niet zelf aanmaken). Daaronder de rekeningen voor omzet, welk btw-tarief bij
  welke btw-soort hoort, en je **Kostencategorieën**: per categorie kies je de
  Moneybird-rekening, en je kunt eigen categorieën toevoegen, op inactief zetten
  (**Op inactief zetten**) of verwijderen. Laat je een rekening leeg, dan kiest BossBase
  een passende. Past er geen enkele, dan komt de kost op **Ongecategoriseerde uitgaven**
  met "controleren" in de omschrijving.
- **Synchroniseren**: één knop **Synchroniseren** die alles in de goede volgorde doet
  (kosten en facturen, daarna klanten en leveranciers, en de btw). De melding daarna
  noemt per onderdeel wat er gebeurd is, met klanten en leveranciers apart. Ook zie je
  wanneer er voor het laatst is gesynchroniseerd.
- **Meldingen**: als er iets niet goed ging, bijvoorbeeld een factuur zonder btw-tarief.

Iets verwijderd wat uit Moneybird kwam? Dan komt het niet terug. **Alles opnieuw
ophalen** (tabblad Instellingen) haalt ook dat weer op.

## SnelStart (binnenkort)

De koppeling met SnelStart komt binnenkort. De kaart staat op **Binnenkort
beschikbaar**; koppelen kan nu nog niet. Werk je met Moneybird, dan kun je die nu al
koppelen.

## Stripe betaallink (Team, of als module bij Groei)

Hiermee kunnen je klanten hun factuur online betalen met iDEAL.
1. Klik op **Stripe koppelen** en maak je account aan of log in bij Stripe.
2. Na de controle door Stripe staat de koppeling op **Actief**.

Daarna staat in elke factuurmail de knop **Factuur betalen**. Betaalt de klant, dan
gaat de factuur vanzelf op betaald en krijgen jij en de klant een bevestiging. Het
geld komt op je eigen rekening. Ontkoppelen doe je met **Ontkoppelen**.

---

## Wat er niet is
- Klanten importeren uit Excel kan niet (exporteren wel, via Database).
- Er is geen koppeling met een mailprogramma.
- Andere koppelingen dan Stripe en Moneybird zijn er op dit moment niet. SnelStart komt
  binnenkort.
