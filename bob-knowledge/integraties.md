# Koppelingen

> Kennisbron voor **Boss**.

Te vinden onder **Instellingen**, tabblad **Integraties**. Er zijn drie koppelingen:
**Stripe**, **Moneybird** en **SnelStart**. Klik op een kaart om hem te openen.

---

## Moneybird (Groei en Team)

**Koppelen:** vul je **API token** en **Administratie-ID** in, klik
**Verbinding testen** en daarna **Opslaan**.

**Wat er gebeurt:**
- Een factuur die je op betaald zet, gaat direct naar Moneybird.
- Een nieuwe of gewijzigde klant gaat naar Moneybird.
- Elk uur haalt BossBase je inkoopfacturen, bonnetjes en uitgaven op; die komen op de
  pagina **Kosten** met het label MB. Een factuur die in Moneybird als betaald staat,
  gaat ook in BossBase op betaald.
- Elk uur worden klanten in beide richtingen bijgewerkt.
- Elke ochtend komen de btw-cijfers binnen voor de btw-kaart op Financiën.

Zelf synchroniseren kan met **Kosten importeren** en **Contacten synchroniseren**.

## SnelStart (Groei en Team)

**Koppelen:** maak in SnelStart Web een koppelsleutel aan, vul die in bij
**Koppelsleutel**, klik **Verbinding testen** en **Opslaan**.

**Wat er gebeurt:**
- Een factuur die je op betaald zet, gaat direct naar SnelStart.
- Elke nacht worden klanten, leveranciers, facturen en kosten bijgewerkt. Inkoopfacturen
  uit SnelStart komen als kosten binnen (label SS). Facturen die je in SnelStart maakt,
  komen in BossBase met het label **Uit SnelStart**.
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
