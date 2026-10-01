// De stappen van de rondleiding per pagina.
//
// Elke stap wijst een element aan via data-rl="<naam>" (doel), of via een
// selector voor het eerste item van een lijst. Staat dat element niet
// in beeld (geen recht, niet in het pakket, of de pagina toont het nu niet), dan
// valt de stap vanzelf weg. Zo wijst de rondleiding nooit iets aan wat iemand
// niet ziet, zonder dat hier rechten of pakketten herhaald hoeven te worden.
//
// Teksten: kort, gewone taal, geen lange streepjes. Bron is de kennisbank van
// Boss (bob-knowledge/).

export const RONDLEIDINGEN = {
  dashboard: [
    {
      doel: 'menu',
      titel: 'Het menu',
      tekst: 'Hier vind je alle onderdelen van BossBase. Je ziet alleen wat bij jouw rechten en pakket hoort.',
    },
    {
      doel: 'nieuwe-aanvraag',
      titel: 'Nieuwe aanvraag',
      tekst: 'Een nieuwe klus begint hier. Er komt vanzelf een project bij, en de aanvraag staat meteen in de Pipeline.',
    },
    {
      doel: 'nieuwe-activiteit',
      titel: 'Nieuwe activiteit',
      tekst: 'Plan een belafspraak, taak of bezoek, voor jezelf of voor een collega.',
    },
    {
      doel: 'dashboard-aanpassen',
      titel: 'Je eigen dashboard',
      tekst: 'Kies zelf welke tegels je ziet, in welke volgorde en hoe groot. Je collega’s houden hun eigen indeling.',
    },
    {
      doel: 'boss',
      titel: 'Vraag het Boss',
      tekst: 'Weet je iets niet? Boss legt uit waar je iets vindt en hoe het werkt.',
    },
    {
      doel: 'meldingen',
      titel: 'Meldingen',
      tekst: 'Hier zie je het als een collega je tagt, je iets toewijst of je planning verandert.',
    },
  ],

  pipeline: [
    {
      selector: '.pipe-board .pipe-col',
      titel: 'Het bord',
      tekst: 'Elke kolom is een fase. Sleep een kaart naar de volgende fase als de klus verder is.',
    },
    {
      selector: '.pipe-board .pc',
      titel: 'Een aanvraag',
      tekst: 'Klik op een kaart om de projectkaart te openen, met de hele klus. Een oranje stipje betekent: nog geen vervolgafspraak gepland.',
    },
    {
      doel: 'pipeline-filter',
      titel: 'Filteren',
      tekst: 'Toon alleen een fase, een behandelaar of een prioriteit. Ook voltooide en verloren projecten vind je hier terug.',
    },
    {
      doel: 'pipeline-nieuw',
      titel: 'Nieuwe aanvraag',
      tekst: 'Zet hier een nieuwe klus op het bord. Aanvragen van je websiteformulier komen er vanzelf bij.',
    },
  ],

  projectkaart: [
    {
      doel: 'pk-status',
      titel: 'Status',
      tekst: 'De fase van de klus. Kies hier een andere fase, of zet de aanvraag op verloren.',
    },
    {
      doel: 'pk-voltooien',
      titel: 'Project voltooien',
      tekst: 'Is de klus klaar en betaald? Klik hier. Het project gaat dan van het bord en is later terug te vinden.',
    },
    {
      doel: 'pk-behandeld',
      titel: 'Behandeld door',
      tekst: 'Kies wie deze klus oppakt. Wat je aanvinkt, wordt meteen opgeslagen.',
    },
    {
      doel: 'pk-tabs',
      titel: 'Alles van de klus',
      tekst: 'Offertes, facturen, uren, kosten, werkbonnen en notities van dit project staan in deze tabbladen.',
    },
  ],

  customers: [
    {
      doel: 'klanten-nieuw',
      titel: 'Nieuwe klant',
      tekst: 'Alleen de naam is verplicht. Na het opslaan opent de klantkaart.',
    },
    {
      doel: 'klanten-zoeken',
      titel: 'Zoeken',
      tekst: 'Zoek op naam of bedrijf. Klik op een klant om de klantkaart te openen.',
    },
    {
      doel: 'klanten-weergave',
      titel: 'Kaarten of tabel',
      tekst: 'Kies hoe je de lijst ziet. Je keuze blijft bewaard.',
    },
  ],

  activities: [
    {
      selector: '.act2-summary',
      titel: 'Wat er openstaat',
      tekst: 'Te laat, vandaag en de rest van de week. Klik op een teller om alleen die te zien.',
    },
    {
      selector: '.act2-tabs',
      titel: 'Filteren',
      tekst: 'Wissel tussen alles, open, vandaag, te laat en afgerond.',
    },
    {
      selector: '[title="Markeer als gereed"]',
      titel: 'Afvinken',
      tekst: 'Klaar met een activiteit? Vink hem hier af. Klik op de regel zelf om hem te openen.',
    },
  ],

  calendar: [
    {
      doel: 'agenda-weergave',
      titel: 'Dag, week of maand',
      tekst: 'Kies hoeveel je in één keer ziet. Met de pijltjes blader je verder.',
    },
    {
      doel: 'agenda-toevoegen',
      titel: 'Afspraak toevoegen',
      tekst: 'Zet een afspraak, opname of klus in je agenda.',
    },
    {
      doel: 'agenda-rooster',
      titel: 'Vanzelf in je agenda',
      tekst: 'Werkbonnen waarop jij staat ingepland, verschijnen hier vanzelf. Klik erop om de werkbon te openen.',
    },
  ],

  projecten: [
    {
      doel: 'projecten-tellers',
      titel: 'In één oogopslag',
      tekst: 'Hoeveel projecten er lopen, wat ze waard zijn, wat nog gefactureerd moet worden en hoeveel uur er is gewerkt.',
    },
    {
      doel: 'projecten-filters',
      titel: 'Filteren',
      tekst: 'Toon projecten per stand van het werk, of alleen wat nog gefactureerd moet worden.',
    },
    {
      doel: 'projecten-status',
      titel: 'Status',
      tekst: 'De stand van het werk: gepland, in uitvoering of afgerond. Die volgt vanzelf uit de werkbonnen.',
    },
  ],

  werkbonnen: [
    {
      doel: 'werkbonnen-nieuw',
      titel: 'Nieuwe werkbon',
      tekst: 'Wie, wanneer en waar: maak een werkbon en plan hem meteen in.',
    },
    {
      doel: 'werkbonnen-filters',
      titel: 'Filteren',
      tekst: 'Toon alleen geplande werkbonnen, of wat in uitvoering of afgerond is.',
    },
    {
      selector: '.wb2-list-card',
      titel: 'Een werkbon',
      tekst: 'Klik om hem te openen. Daar boek je uren, vink je taken af, voeg je foto\'s toe en laat je de klant tekenen.',
    },
  ],

  uren: [
    {
      doel: 'uren-nieuw',
      titel: 'Uren registreren',
      tekst: 'Vul hier je werkdag in: begin, eind en pauze. Uren op een klus boek je op de werkbon.',
    },
    {
      doel: 'uren-soort',
      titel: 'Werkdag of klus',
      tekst: 'Wissel tussen je werkdaguren, de uren op werkbonnen, en die twee naast elkaar.',
    },
    {
      doel: 'uren-periode',
      titel: 'Periode',
      tekst: 'Bekijk alles, of een dag, week of maand.',
    },
  ],
};

/** Alle pagina's met een rondleiding (voor "geen rondleidingen meer"). */
export const PAGINAS_MET_RONDLEIDING = Object.keys(RONDLEIDINGEN);

// Seintjes tussen losse delen van de app (profielmenu, Instellingen) en de
// rondleiding zelf, zonder props door vijf lagen te rijgen.
export const RL_START = 'bb-rondleiding-start';
export const RL_RESET = 'bb-rondleiding-reset';
