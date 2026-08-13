# Integraties en koppelingen

> Kennisbron voor **Boss**. Beschrijft welke koppelingen er zijn, wat ze doen, en —
> belangrijk — wat er wél in het systeem zit maar **niet zichtbaar is voor klanten**.
>
> Te vinden onder **Instellingen → Integraties**.

---

## Zichtbaar en bruikbaar voor klanten

### Moneybird (boekhouding)

Beschikbaar vanaf **Groei**.

| Wat | Richting | Automatisch? |
|---|---|---|
| Betaalde facturen doorzetten | BossBase → Moneybird | automatisch, zodra je een factuur op betaald zet |
| Kosten ophalen | Moneybird → BossBase | automatisch, elk uur |
| Contacten (klanten) synchroniseren | beide kanten | automatisch, elk half uur |
| Btw-gegevens ophalen | Moneybird → BossBase | automatisch, elke ochtend |
| Contact bijwerken | BossBase → Moneybird | bij het wijzigen van een klant |

Instellen: je vult je Moneybird-token en administratie-id in en drukt op testen. Pas
als de test slaagt, staat de koppeling aan.

De opgehaalde kosten verschijnen op de Kosten-pagina; de btw-gegevens voeden het
**Btw-overzicht**.

### SnelStart (boekhouding)

Beschikbaar vanaf **Groei**. Zelfde soort koppeling als Moneybird:

| Wat | Richting | Automatisch? |
|---|---|---|
| Betaalde facturen doorzetten | BossBase → SnelStart | automatisch bij betaald markeren |
| Kosten ophalen | SnelStart → BossBase | handmatig via een knop |
| Contacten synchroniseren | beide kanten | handmatig via een knop |
| Btw-gegevens ophalen | SnelStart → BossBase | handmatig via een knop |

**Verschil met Moneybird:** bij Moneybird lopen kosten, contacten en btw
automatisch mee op een vast ritme. Bij SnelStart moet je die drie zelf aanzetten met
een knop. Alleen het doorzetten van een betaalde factuur gaat bij beide vanzelf.

### Stripe betaallink

Zit in **Team**, of bij Groei als losse module van € 10 per maand.

Hiermee zet je een **iDEAL-betaalknop op je facturen**. De klant klikt in de
factuurmail, betaalt online, en de factuur wordt automatisch op betaald gezet. Er
komt een bevestigingsmail met de factuur als bijlage.

Je koppelt hiervoor je eigen Stripe-account. Het geld gaat rechtstreeks naar jou.

> Dit staat volledig los van de betaling van je BossBase-abonnement. Dat loopt ook
> via Stripe, maar dat is een andere koppeling en een ander account.

---

## Wel in het systeem, NIET zichtbaar voor klanten

**Boss mag deze niet aanbieden of uitleggen als beschikbare functie.** Ze zijn in de
schermen verborgen. Vraagt een klant ernaar, dan is het antwoord dat het er nog niet
is en dat hij het aan Niels kan vragen.

### Google Agenda

Volledig gebouwd — koppelen, afspraken synchroniseren — maar **op drie plekken in de
schermen verborgen** omdat de autorisatie bij Google nog niet is geconfigureerd. Een
klant kan dit dus niet aanzetten en ziet er niets van.

### AFAS (boekhouding)

De koppeling bestaat, met kosten-import en contactsynchronisatie die elke vijf
minuten draaien. Het blok in Instellingen is echter **verborgen** met de aantekening
dat het nog niet actief is.

Let op de tegenstrijdigheid: de functiebeschrijving van de boekhoudkoppeling noemt
"Moneybird, SnelStart of AFAS", en er is één bedrijf in de database waarvoor AFAS als
verbonden staat. Maar in de schermen is het niet te bereiken. **Boss moet AFAS niet
noemen** tot Niels dit bevestigt.

---

## Overzicht van wat er automatisch draait

| Wanneer | Wat |
|---|---|
| Elk uur | Kosten ophalen uit Moneybird |
| Elk half uur | Contacten synchroniseren met Moneybird |
| Elke ochtend | Btw-gegevens ophalen uit Moneybird |
| Elke ochtend | Betaalherinneringen en afspraakherinneringen versturen |
| Elke ochtend | BossBase-mails rond de proefperiode |
| Elke vijf minuten | AFAS-kosten en -contacten *(verborgen koppeling)* |

---

## Onzeker — controleren door Niels

- **Of AFAS bedoeld is om live te gaan.** Er draait een synchronisatie elke vijf
  minuten en er staat een bedrijf als verbonden, terwijl het blok in de schermen
  verborgen is. Dat is tegenstrijdig en moet uitgezocht worden.
- **Of Moneybird en SnelStart tegelijk gekoppeld kunnen zijn**, en wat er dan
  gebeurt bij het betaald markeren van een factuur — gaat hij dan naar allebei?
- **Wat er gebeurt bij een mislukte synchronisatie.** Krijgt de gebruiker een
  melding, of gaat het stil mis? Uit de code lijkt het laatste.
- **Of de klantsynchronisatie bestaande klanten overschrijft** wanneer de gegevens in
  BossBase en de boekhouding verschillen, en welke kant dan wint.
- **Of de Stripe-betaallink ook zonder de module werkt** als iemand hem al eerder had
  ingesteld.
- **Of Google Agenda binnenkort live gaat.** Zolang dat niet zo is, moet Boss het
  helemaal niet noemen.
