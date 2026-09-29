---
{
  "type": "integratie",
  "path": "/integraties/moneybird",
  "volgorde": 1,
  "kruimel": "Moneybird",
  "title": "Moneybird koppelen aan BossBase | BossBase",
  "description": "Koppel BossBase aan Moneybird: betaalde facturen gaan naar Moneybird, inkoopfacturen en bonnetjes komen als kosten terug. Vanaf het Groei-pakket.",
  "kicker": "Koppeling · Moneybird",
  "h1": "BossBase koppelen aan Moneybird",
  "lead": "Je doet het werk in BossBase, je boekhouding in Moneybird. De koppeling zet betaalde facturen door naar Moneybird en haalt inkoopfacturen, bonnetjes en uitgaven terug als kosten.",
  "cta": { "label": "Start 14 dagen gratis", "href": "/register" },
  "cta2": { "label": "Alle koppelingen", "href": "/integraties" },
  "noot": "Beschikbaar in Groei en Team, en tijdens de proefperiode. Je hebt een eigen Moneybird-administratie nodig.",
  "puntenTitel": "Wat er wordt uitgewisseld",
  "punten": [
    { "titel": "Facturen naar Moneybird", "tekst": "Zodra een factuur in BossBase betaald is (zelf gemarkeerd of via de betaallink), maakt BossBase in Moneybird het contact en de factuur aan en registreert de betaling." },
    { "titel": "Kosten uit Moneybird", "tekst": "Inkoopfacturen, bonnetjes en uitgaven uit Moneybird komen in BossBase binnen als kosten. Elk uur, of direct met de knop." },
    { "titel": "Contacten twee kanten op", "tekst": "Klanten en contactgegevens worden elk uur tussen BossBase en Moneybird gelijkgetrokken." },
    { "titel": "Betaalstatus terug", "tekst": "Wordt een doorgezette factuur in Moneybird als betaald gemarkeerd, dan neemt BossBase dat over." },
    { "titel": "Verkoopfacturen van buiten", "tekst": "Verkoopfacturen die je in Moneybird maakte (niet vanuit BossBase), komen ook in BossBase binnen." },
    { "titel": "Btw-overzicht", "tekst": "BossBase haalt dagelijks het btw-overzicht op, voor je eigen inzicht." }
  ],
  "stappen": {
    "titel": "Zo koppel je Moneybird",
    "items": [
      { "titel": "Maak een API-token in Moneybird", "tekst": "In je Moneybird-account maak je een token aan waarmee BossBase namens jou mag lezen en schrijven." },
      { "titel": "Vul token en administratie-ID in", "tekst": "In BossBase ga je naar Instellingen, Koppelingen, en vul je het token en het ID van je administratie in." },
      { "titel": "Test en klaar", "tekst": "BossBase controleert de verbinding. Daarna lopen de synchronisaties vanzelf." }
    ]
  },
  "faq": [
    { "v": "Gaat een factuur meteen naar Moneybird als ik hem verstuur?", "a": "Nee, pas als hij betaald is. Dan maakt BossBase de factuur aan in Moneybird en registreert hij de betaling." },
    { "v": "Welk btw-tarief krijgt de factuur in Moneybird?", "a": "BossBase stuurt geen btw-tariefcode mee; Moneybird kiest het tarief. Controleer de eerste facturen daarom even in Moneybird." },
    { "v": "Waar komen de kosten uit Moneybird terecht?", "a": "Als kosten in BossBase, onder Kosten. Zo zie je je inkoop naast je omzet, zonder iets over te typen." }
  ],
  "gerelateerd": [
    { "href": "/facturen", "titel": "Facturen", "tekst": "Factureren vanuit je offerte, met herinneringen en betaallink." },
    { "href": "/integraties/snelstart", "titel": "Liever SnelStart?", "tekst": "Zo werkt de koppeling met SnelStart." },
    { "href": "/kennisbank/nacalculatie-vakbedrijf", "titel": "Nacalculatie voor kleine vakbedrijven", "tekst": "Waarom kosten per project het verschil maken." }
  ],
  "slot": { "titel": "Probeer de Moneybird-koppeling in je proefperiode" }
}
---
## Waarom koppelen

Zonder koppeling typ je facturen twee keer: in je werkprogramma en in je boekhouding. En de bonnetjes van de groothandel zie je in Moneybird wel, maar niet bij het project waar ze horen. De koppeling haalt dat dubbele werk weg: je [facturen](/facturen) gaan naar Moneybird, en je kosten komen terug in BossBase.

## Goed om te weten

- BossBase stuurt alleen **betaalde** facturen door. Openstaande facturen beheer je in BossBase, met herinneringen en eventueel een [betaallink](/integraties/stripe-betaallink).
- De koppeling hoort bij het Groei- en Teampakket. Tijdens de gratis proefperiode kun je hem uitproberen.
- Je gebruikt je eigen Moneybird-abonnement; BossBase vervangt je boekhoudpakket niet.
