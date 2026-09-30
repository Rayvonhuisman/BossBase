# Aanvulling voor de privacyverklaring en verwerkersovereenkomst: Vercel Web Analytics

> Voorstel, 30 september 2026. De concepten `privacyverklaring-CONCEPT.md` en
> `verwerkersovereenkomst-CONCEPT.md` zijn van de compagnon en zijn **niet**
> aangepast. Hieronder staat wat erin moet nu Vercel Web Analytics op de site en in
> de app draait (`src/lib/analytics.js`). Overnemen of aanpassen naar eigen
> inzicht.

## Privacyverklaring

**§3, nieuwe regel in de tabel:**

| Verwerking | Gegevens (vastgesteld) | Doel | Grondslag | Bewaartermijn |
| --- | --- | --- | --- | --- |
| Gebruiksstatistieken (Vercel Web Analytics), website en app | Per paginabezoek: tijdstip, pagina-adres waaruit tokens, id's en querystrings (behalve `utm_*` en `ref`) vooraf zijn verwijderd, verwijzende site, land en regio (afgeleid uit het IP-adres, dat niet wordt bewaard), besturingssysteem, browser en soort apparaat. Twee gebeurtenissen: klik op een link naar `/register` en een gelukte aanmelding, zonder persoonsgegevens. Een hash van het verzoek om bezoeken te tellen, na 24 uur weggegooid. Geen cookies, niets opgeslagen op het apparaat | Zien hoe website en app gebruikt worden en ze verbeteren | Gerechtvaardigd belang [[JURIST]]; geen toestemming nodig op grond van art. 11.7a lid 3 sub b Tw (analytics met geen of geringe privacygevolgen, zie het cookiebeleid) | Opgetelde cijfers volgens de bewaartermijn van Vercel [[TE CONTROLEREN: afhankelijk van het Vercel-abonnement]] |

**§4, nieuwe regel in de tabel:**

| Partij | Waarvoor | Vanuit | Opslagregio / doorgifte |
| --- | --- | --- | --- |
| Vercel (Web Analytics) | Gebruiksstatistieken van website en app | Browser | Vercel Inc., VS; EU-US Data Privacy Framework + standaardcontractbepalingen |

**§4, de zin onder de tabel** "Geen analyse-, advertentie- of trackingdiensten.
Lettertypen worden zelf gehost." wordt:

> Geen advertentie- of trackingdiensten. Voor gebruiksstatistieken gebruiken we
> Vercel Web Analytics, zonder cookies en zonder dat er iets op je apparaat wordt
> opgeslagen. Lettertypen worden zelf gehost.

**§5, "Geen tracking."** wordt:

> Geen tracking. Vercel Web Analytics telt bezoeken zonder cookies en zonder iets
> op je apparaat op te slaan; zie het cookiebeleid. De oude cookiebanner is
> verwijderd: er is niets meer waarvoor toestemming nodig is.

## Verwerkersovereenkomst

**§5, nieuwe regel in de tabel subverwerkers:**

| Subverwerker | Waarvoor | Regio | Overeenkomst met BossBase |
| --- | --- | --- | --- |
| Vercel (Web Analytics) | Gebruiksstatistieken van de app: welke pagina's gebruikers van de Klant bekijken, met apparaat, browser en land. Tokens en id's (van klanten, projecten, facturen) worden vóór verzending uit het adres gehaald; geen namen, e-mailadressen of klantgegevens | Vercel Inc., VS; EU-US Data Privacy Framework + standaardcontractbepalingen | [[TE CONTROLEREN]] |

[[JURIST]]: voor de statistieken zelf is BossBase eerder verantwoordelijke dan
verwerker. Ze staan hier omdat ze over het gebruik van de app door medewerkers van
de Klant gaan.
