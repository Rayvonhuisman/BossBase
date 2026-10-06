# Koppelingen

> Kennisbron voor **Boss**.

Te vinden onder **Instellingen**, tabblad **Integraties**. Er zijn drie koppelingen:
**Stripe**, **Moneybird** en **SnelStart**. Klik op een kaart om hem te openen.

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
  label **Uit boekhouding**.
- Kosten die je in BossBase invoert gaan naar Moneybird als inkoopfactuur, met bon, op de
  grootboekrekening van hun categorie. Een leverancier is daarvoor verplicht.
  Werkbonmateriaal en inkopen op een project gaan niet mee.
- Elke nacht synchroniseert BossBase vanzelf. Een betaling of gewijzigd contact in
  Moneybird komt meestal direct binnen.

**Tabbladen in de Moneybird-kaart:**
- **Instellingen**: bovenaan de lijst **Controleer na het koppelen**: welke btw-tarieven
  en categorieën er in je Moneybird-administratie moeten staan, met een vinkje of kruisje.
  Daaronder per kostencategorie en per btw-soort een grootboekrekening, en welk
  btw-tarief van je administratie bij welke btw-soort hoort. Laat je een veld leeg, dan
  kiest BossBase een passende rekening of tarief.
- **Synchroniseren**: **Kosten/facturen synchroniseren** en **Contacten synchroniseren**,
  en wanneer er voor het laatst is gesynchroniseerd.
- **Meldingen**: als er iets niet goed ging, bijvoorbeeld een factuur zonder btw-tarief.

Iets verwijderd wat uit Moneybird kwam? Dan komt het niet terug. **Alles opnieuw
ophalen** (tabblad Instellingen) haalt ook dat weer op.

## SnelStart (Groei en Team)

**Koppelen:** maak in SnelStart Web een koppelsleutel aan, vul die in bij
**Koppelsleutel**, klik **Verbinding testen** en **Opslaan**.

**Wat er gebeurt:**
- Een factuur die je op betaald zet, gaat direct naar SnelStart.
- Elke nacht worden klanten, leveranciers, facturen en kosten bijgewerkt. Inkoopfacturen
  uit SnelStart komen als kosten binnen (label SS). Facturen die je in SnelStart maakt,
  komen in BossBase met het label **Uit boekhouding**.
- Bij verschillen tussen klantgegevens wint wat in SnelStart staat.

**Tabbladen in de SnelStart-kaart:**
- **Instellingen**: de **Grootboekindeling** (per kostencategorie en per btw-soort
  een grootboekrekening) en je **Kostencategorieën**: eigen categorieën toevoegen,
  op inactief zetten of verwijderen.
- **Synchroniseren**: wanneer er voor het laatst is gesynchroniseerd, en knoppen om
  het nu te doen.
- **Meldingen**: als er iets niet goed ging.

**Iets verwijderd wat uit SnelStart kwam?** Dan komt het bij de volgende
synchronisatie niet terug. Wil je alles toch weer ophalen, klik dan in de
SnelStart-kaart, tabblad **Instellingen**, op **Alles opnieuw ophalen**. Dan komt ook
alles terug wat je eerder hebt verwijderd.

Ontkoppelen doe je met **Loskoppelen**.

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
- Andere koppelingen dan deze drie zijn er op dit moment niet.
