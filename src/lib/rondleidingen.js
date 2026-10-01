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
};

/** Alle pagina's met een rondleiding (voor "geen rondleidingen meer"). */
export const PAGINAS_MET_RONDLEIDING = Object.keys(RONDLEIDINGEN);

// Seintjes tussen losse delen van de app (profielmenu, Instellingen) en de
// rondleiding zelf, zonder props door vijf lagen te rijgen.
export const RL_START = 'bb-rondleiding-start';
export const RL_RESET = 'bb-rondleiding-reset';
