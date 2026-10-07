// De stappen van de rondleiding, per pagina en per venster.
//
// Elke stap wijst een element aan via data-rl="<naam>" (doel), of via een
// selector voor het eerste item van een lijst. Staat dat element niet
// in beeld (geen recht, niet in het pakket, of de pagina toont het nu niet), dan
// valt de stap vanzelf weg. Zo wijst de rondleiding nooit iets aan wat iemand
// niet ziet, zonder dat hier rechten of pakketten herhaald hoeven te worden.
//
// Teksten: kort, gewone taal, geen lange streepjes. Boss vertelt, in de
// ik-vorm. Vertel wat je ermee kunt, niet hoe het technisch werkt. Bron is de
// kennisbank van Boss (bob-knowledge/).

export const RONDLEIDINGEN = {
  // ── Pagina's ──────────────────────────────────────────────────────────────
  dashboard: [
    { doel: 'menu', titel: 'Het menu',
      tekst: 'Hier vind je alles waar je toegang toe hebt.' },
    { doel: 'nieuwe-aanvraag', titel: 'Nieuwe aanvraag',
      tekst: 'Komt er een nieuwe klus binnen? Zet hem hier op het bord, dan houd je hem bij tot hij af is.' },
    { doel: 'nieuwe-activiteit', titel: 'Nieuwe activiteit',
      tekst: 'Plan een belafspraak, taak of bezoek, voor jezelf of voor een collega.' },
    { doel: 'dashboard-aanpassen', titel: 'Je eigen dashboard',
      tekst: 'Kies zelf welke overzichten je hier ziet en hoe groot ze zijn.' },
    { doel: 'boss', titel: 'Dat ben ik',
      tekst: 'Je kunt mij altijd iets vragen. Klik hier en ik vertel je waar je iets vindt en hoe het werkt.' },
    { doel: 'meldingen', titel: 'Meldingen',
      tekst: 'Hier zie je wat er voor jou is: een collega die je tagt, een klus die je krijgt of een planning die verandert.' },
  ],

  pipeline: [
    { selector: '.pipe-board .pipe-col', titel: 'Al je aanvragen',
      tekst: 'Elke kolom is een fase. Sleep een aanvraag door naar de volgende fase als de klus verder is.' },
    { selector: '.pipe-board .pc', titel: 'Een aanvraag',
      tekst: 'Open een aanvraag om de hele klus te zien, van offerte tot factuur. Een oranje stip betekent dat er nog geen vervolgafspraak staat.' },
    { doel: 'pipeline-filter', titel: 'Filteren',
      tekst: 'Vind snel terug wat je zoekt, per fase, behandelaar of prioriteit. Ook afgeronde en verloren klussen.' },
    { doel: 'pipeline-nieuw', titel: 'Nieuwe aanvraag',
      tekst: 'Zet een nieuwe klus op het bord. Aanvragen via je website komen er vanzelf bij.' },
  ],

  projectkaart: [
    { doel: 'pk-status', titel: 'Hoe ver de klus is',
      tekst: 'Zet de klus hier in de juiste fase, of meld hem als verloren.' },
    { doel: 'pk-voltooien', titel: 'Project voltooien',
      tekst: 'Is de klus klaar en betaald? Rond hem hier af, dan gaat hij van het bord.' },
    { doel: 'pk-behandeld', titel: 'Wie het oppakt',
      tekst: 'Kies welke collega’s deze klus behandelen.' },
    { doel: 'pk-tabs', titel: 'Alles van de klus',
      tekst: 'Offertes, facturen, uren, kosten, werkbonnen en notities van deze klus vind je hier bij elkaar.' },
  ],

  klantkaart: [
    { doel: 'kk-cijfers', titel: 'Wat deze klant oplevert',
      tekst: 'Wat je hebt gefactureerd, wat er betaald is, je kosten en wat je eraan overhoudt.' },
    { doel: 'kk-tabs', titel: 'Alles van deze klant',
      tekst: 'Projecten, werkbonnen, offertes, facturen, mails en notities van deze klant staan in deze tabbladen.' },
    { doel: 'kk-planning', titel: 'Inplannen',
      tekst: 'Plan hier meteen een werkbon of afspraak in voor deze klant.' },
    { doel: 'kk-notities', titel: 'Notities',
      tekst: 'Schrijf iets op over deze klant. Met @ en een naam laat je het een collega weten.' },
  ],

  customers: [
    { doel: 'klanten-nieuw', titel: 'Nieuwe klant',
      tekst: 'Hier maak je een nieuwe klant aan en sla je al zijn gegevens op.' },
    { doel: 'klanten-zoeken', titel: 'Zoeken',
      tekst: 'Vind een klant snel terug op naam of bedrijf, en open zijn klantkaart.' },
    { doel: 'klanten-weergave', titel: 'Kaarten of lijst',
      tekst: 'Bekijk je klanten als kaarten of als lijst, wat jij het fijnst vindt.' },
  ],

  leveranciers: [
    { doel: 'lev-nieuw', titel: 'Nieuwe leverancier',
      tekst: 'Leg hier je leveranciers vast. Je koppelt ze aan je kosten en materialen.' },
    { doel: 'lev-zoeken', titel: 'Zoeken',
      tekst: 'Vind een leverancier snel terug op naam, plaats of e-mail.' },
    { selector: '.cust-card-grid > .card', titel: 'Een leverancier',
      tekst: 'Open een leverancier voor zijn gegevens, materialen, notities en mails.' },
  ],

  materialen: [
    { doel: 'mat-nieuw', titel: 'Nieuw materiaal',
      tekst: 'Zet je vaste materialen hier met prijs en leverancier. Op een werkbon kies je ze dan met één klik.' },
    { doel: 'mat-zoeken', titel: 'Zoeken',
      tekst: 'Vind een materiaal op naam of artikelnummer.' },
    { selector: '[data-rl="mat-lijst"] tbody tr', titel: 'Je materialen',
      tekst: 'Klik op een materiaal om de prijs, de leverancier of de btw aan te passen.' },
  ],

  database: [
    { doel: 'db-filters', titel: 'Snel filteren',
      tekst: 'Filter je klanten op stad, projectstatus of wanneer je ze voor het laatst sprak.' },
    { doel: 'db-geavanceerd', titel: 'Uitgebreid zoeken',
      tekst: 'Combineer filters op projecten, offertes, facturen en meer, en vind precies de klanten die je zoekt.' },
    { doel: 'db-selectie', titel: 'Iets doen met een selectie',
      tekst: 'Vink klanten aan en mail ze in één keer, zet ze in Excel of download hun offertes en facturen.' },
    { doel: 'db-segment', titel: 'Segment opslaan',
      tekst: 'Bewaar een filter dat je vaker gebruikt, dan haal je hem later met één klik terug.' },
  ],

  activities: [
    { selector: '.act2-summary', titel: 'Wat er openstaat',
      tekst: 'Zie in één oogopslag wat te laat is, wat vandaag moet en wat er nog komt.' },
    { selector: '.act2-tabs', titel: 'Filteren',
      tekst: 'Bekijk alleen wat openstaat, vandaag moet, te laat is of al klaar is.' },
    { selector: '[title="Markeer als gereed"]', titel: 'Afvinken',
      tekst: 'Klaar? Vink het hier af. Open een regel om hem te bekijken of te wijzigen.' },
  ],

  calendar: [
    { doel: 'agenda-weergave', titel: 'Dag, week of maand',
      tekst: 'Bekijk je agenda per dag, per week of per maand.' },
    { doel: 'agenda-toevoegen', titel: 'Afspraak toevoegen',
      tekst: 'Zet een afspraak, opname of klus in je agenda.' },
    { doel: 'agenda-rooster', titel: 'Je planning',
      tekst: 'Werkbonnen waarop je staat ingepland, zie je hier vanzelf. Klik erop om de werkbon te openen.' },
  ],

  planning: [
    { doel: 'planning-niet-ingepland', titel: 'Nog in te plannen',
      tekst: 'Werkbonnen die nog geen dag hebben. Sleep er een naar de tijdlijn om hem in te plannen.' },
    { doel: 'planning-tijdlijn', titel: 'Schuiven met de planning',
      tekst: 'Sleep een blok naar een andere tijd, of trek aan de rand om de klus langer of korter te maken. Je collega’s horen het vanzelf.' },
    { doel: 'planning-weergave', titel: 'Wie en wat',
      tekst: 'Bekijk de planning van iedereen, per medewerker of per voertuig.' },
    { doel: 'planning-werkbon', titel: 'Werkbon inplannen',
      tekst: 'Maak een werkbon en plan hem meteen in, met dagen, ploeg en voertuig.' },
  ],

  projecten: [
    { doel: 'projecten-tellers', titel: 'In één oogopslag',
      tekst: 'Hoeveel klussen er lopen, wat ze waard zijn, wat je nog moet factureren en hoeveel uur er is gewerkt.' },
    { doel: 'projecten-filters', titel: 'Filteren',
      tekst: 'Bekijk klussen per stand van het werk, of alleen wat je nog moet factureren.' },
    { doel: 'projecten-status', titel: 'Hoe ver het werk is',
      tekst: 'Gepland, in uitvoering of afgerond. Dat houd ik voor je bij aan de hand van de werkbonnen.' },
  ],

  werkbonnen: [
    { doel: 'werkbonnen-nieuw', titel: 'Nieuwe werkbon',
      tekst: 'Maak een werkbon voor een klus op locatie en plan meteen wie er wanneer gaat.' },
    { doel: 'werkbonnen-filters', titel: 'Filteren',
      tekst: 'Bekijk alleen wat gepland is, wat loopt of wat klaar is.' },
    { selector: '.wb2-list-card', titel: 'Een werkbon',
      tekst: 'Open een werkbon om uren te boeken, taken af te vinken, foto’s toe te voegen en de klant te laten tekenen.' },
  ],

  uren: [
    { doel: 'uren-nieuw', titel: 'Uren registreren',
      tekst: 'Vul hier je werkdag in. Uren op een klus boek je op de werkbon zelf.' },
    { doel: 'uren-soort', titel: 'Werkdag of klus',
      tekst: 'Bekijk je werkdagen, de uren op klussen, of die twee naast elkaar.' },
    { doel: 'uren-periode', titel: 'Periode',
      tekst: 'Bekijk alles, of alleen een dag, week of maand.' },
  ],

  offertes: [
    { doel: 'offertes-nieuw', titel: 'Nieuwe offerte',
      tekst: 'Maak een offerte en stuur hem per mail naar je klant.' },
    { doel: 'offertes-filters', titel: 'Per status',
      tekst: 'Zie welke offertes nog concept zijn, verstuurd, geaccepteerd of afgewezen.' },
    { selector: 'table.dt tbody button[title="Meer acties"]', titel: 'Meer doen',
      tekst: 'Verstuur een offerte, maak een nieuwe versie, kopieer hem of maak er een factuur van.' },
  ],

  facturen: [
    { doel: 'facturen-nieuw', titel: 'Nieuwe factuur',
      tekst: 'Maak een factuur, of laat hem maken van een geaccepteerde offerte.' },
    { doel: 'facturen-tellers', titel: 'In één oogopslag',
      tekst: 'Wat er openstaat, wat er deze maand binnenkwam en wat te laat is.' },
    { doel: 'facturen-filters', titel: 'Per status',
      tekst: 'Zie welke facturen verstuurd, betaald, verlopen of gecrediteerd zijn.' },
    { selector: 'table.dt tbody button[title="Meer acties"]', titel: 'Meer doen',
      tekst: 'Verstuur een factuur, stuur een herinnering, kopieer of crediteer hem.' },
  ],

  costs: [
    { doel: 'kosten-nieuw', titel: 'Kosten toevoegen',
      tekst: 'Leg een bon of inkoopfactuur vast, met de leverancier en een foto erbij.' },
    { doel: 'kosten-weergave', titel: 'Twee soorten kosten',
      tekst: 'Bekijk wat je hebt geboekt, of het materiaal en de inkopen op je klussen.' },
    { doel: 'kosten-periode', titel: 'Periode',
      tekst: 'Bekijk je kosten per week, maand, kwartaal of jaar.' },
  ],

  revenue: [
    { doel: 'financien-periode', titel: 'Periode',
      tekst: 'Kies over welke periode je de cijfers wilt zien.' },
    { doel: 'financien-tegels', titel: 'Je cijfers',
      tekst: 'Wat je hebt gefactureerd, wat er binnen is, wat nog openstaat en wat er netto overblijft.' },
    { doel: 'financien-export', titel: 'Exporteren',
      tekst: 'Download het overzicht per klant als Excel-bestand.' },
  ],

  team: [
    { doel: 'team-uitnodigen', titel: 'Teamlid uitnodigen',
      tekst: 'Nodig een collega uit. Hij krijgt een mail om zijn account aan te maken.' },
    { doel: 'team-rechten', titel: 'Rechten',
      tekst: 'Bepaal per medewerker wat hij mag zien en doen. Dit zit in het pakket Team.' },
    { doel: 'team-deactiveren', titel: 'Deactiveren',
      tekst: 'Werkt iemand niet meer bij je? Zet zijn toegang hier uit. Dat kun je later terugdraaien.' },
  ],

  instellingen: [
    { doel: 'instellingen-tabs', titel: 'Instellingen',
      tekst: 'Je eigen profiel, en als beheerder alles van je bedrijf.' },
    { doel: 'instellingen-tab-standaard', titel: 'Algemeen',
      tekst: 'Je tarieven, btw, hoe lang een offerte geldig is, de betaaltermijn van je facturen en de urenherinnering voor je team.' },
    { doel: 'instellingen-tab-websiteformulier', titel: 'Websiteformulier',
      tekst: 'Krijg aanvragen van je eigen website meteen op je bord. Je plakt één stukje code in je site, en ik zet elke aanvraag als klant en project in je pipeline.' },
    { doel: 'instellingen-tab-abonnement', titel: 'Abonnement',
      tekst: 'Je pakket, modules en gebruikers, en verzoeken van je team.' },
  ],

  // Het tabblad Websiteformulier heeft een eigen rondleiding: wie Instellingen
  // al kende toen dit tabblad erbij kwam, krijgt hem zo toch de eerste keer.
  websiteformulier: [
    { doel: 'wf-stappen', titel: 'Vijf korte stappen',
      tekst: 'Ik loop met je door vijf korte stappen. Daarna komen aanvragen van je website vanzelf in je pipeline.' },
    { doel: 'wf-uitleg', titel: 'Meer uitleg',
      tekst: 'Klik hier als je het stap voor stap wilt lezen, ook voor WordPress en Wix.' },
    { doel: 'wf-aanpassen', titel: 'Aanpassen',
      tekst: 'Wil je iets veranderen? Hier loop je de stappen opnieuw door.' },
    { doel: 'wf-meer', titel: 'Meer instellingen',
      tekst: 'Je websites, de kleur, je privacylink en het aan- of uitzetten vind je hier.' },
  ],

  // ── Vensters ──────────────────────────────────────────────────────────────
  // Een venster heeft zijn eigen rondleiding, de eerste keer dat iemand het
  // opent. De component staat in het venster zelf (<Rondleiding inVenster />).
  'venster-offerte': [
    { doel: 'vo-klant', titel: 'Voor wie',
      tekst: 'Kies de klant, en het project als de offerte bij een klus hoort.' },
    { doel: 'vo-regels', titel: 'Wat het kost',
      tekst: 'Zet elk onderdeel op een eigen regel: uren, kilometers of iets anders, elk met zijn eigen btw.' },
    { doel: 'vo-totaal', titel: 'Het totaal',
      tekst: 'Het totaal met btw reken ik voor je uit.' },
    { doel: 'vo-opslaan', titel: 'Opslaan of versturen',
      tekst: 'Bewaar hem als concept, of stuur hem meteen per mail naar je klant.' },
  ],

  'venster-werkbon': [
    { doel: 'vw-titel', titel: 'Waar gaat het om',
      tekst: 'Geef de klus een korte naam. Die zie je terug in de planning, de agenda en op de werkbon.' },
    { doel: 'vw-klant', titel: 'Voor wie',
      tekst: 'Kies de klant, en het project als de werkbon bij een klus hoort. Het adres van de klant neem ik dan voor je over.' },
    { doel: 'vw-locatie', titel: 'Waar',
      tekst: 'Het adres waar gewerkt wordt. Zoek het op, of typ zelf iets als “bouwkavel achter de kerk”.' },
    // Met de planningsmodule kies je meerdere dagen; zonder één dag.
    { selector: '.modal .wbd:not(.wbd-enkel)', titel: 'Wanneer',
      tekst: 'Tik in de kalender de dagen aan waarop er gewerkt wordt en vul per dag de begin- en eindtijd in. Met “voor alle dagen” zet je één tijd op elke dag. Werkt niet iedereen elke dag? Klik dan bij een dag op een gezicht.' },
    { selector: '.modal .wbd.wbd-enkel', titel: 'Wanneer',
      tekst: 'Tik in de kalender de dag aan en vul de begin- en eindtijd in. Een klus over meerdere dagen plan je met de planningsmodule.' },
    { doel: 'vw-ploeg', titel: 'Wie gaat er',
      tekst: 'Kies wie er meewerken. Daarna kies je de verantwoordelijke: die mag de werkbon bijwerken en afronden.' },
    { selector: '.modal .wbv', titel: 'Met welke bus',
      tekst: 'Kies welke bus meegaat, op welke dagen, en wie er meerijdt. Zit een bus vol, dan zie je dat meteen.' },
    { doel: 'vw-omschrijving', titel: 'Wat er moet gebeuren',
      tekst: 'Beschrijf het werk. Dit komt op de werkbon die de klant straks tekent. De interne notitie zien alleen je collega’s.' },
    { doel: 'vw-aanmaken', titel: 'Werkbon aanmaken',
      tekst: 'De klus staat meteen in de planning en in de agenda van de ploeg, en iedereen krijgt een seintje.' },
  ],
};

// De allereerste keer ooit stelt Boss zich voor, vóór de eerste rondleiding.
export const WELKOM = {
  welkom: true,
  titel: 'Hoi, ik ben Boss',
  tekst: 'Ik laat je de belangrijkste dingen zien, steeds de eerste keer dat je een onderdeel opent. Het duurt maar even.',
};

// De startrondleiding voor een nieuw bedrijf: na de welkom neemt Boss de
// beheerder mee door Instellingen, langs wat er ingevuld moet zijn voordat de
// eerste offerte de deur uit gaat. Elke stap zegt op welk tabblad hij staat;
// de rondleiding gaat er zelf naartoe.
export const START = [
  { ...WELKOM, tekst: 'Leuk dat je er bent. Voordat je je eerste offerte verstuurt, zetten we samen even de basis klaar. Daarna laat ik je de rest zien.' },
  { tab: 'bedrijf', doel: 'set-logo', titel: 'Je logo',
    tekst: 'Zet hier je logo. Dat komt op je offertes, facturen en mails.' },
  { tab: 'bedrijf', doel: 'set-gegevens', titel: 'Je bedrijfsgegevens',
    tekst: 'Vul je naam, adres, KvK-nummer, btw-nummer en IBAN in. Die komen op elke offerte en factuur.' },
  { tab: 'bedrijf', doel: 'set-bedrijf-opslaan', titel: 'Opslaan',
    tekst: 'Klaar met invullen? Sla het hier op.' },
  { tab: 'standaard', doel: 'set-algemeen', titel: 'Je standaardwaarden',
    tekst: 'Je uurtarief, btw en hoe lang een offerte geldig is. Die vul ik bij elke nieuwe offerte en factuur vanzelf in.' },
  { tab: 'standaard', doel: 'set-betaaltermijn', titel: 'Je betaaltermijn',
    tekst: 'Na hoeveel dagen je klant moet betalen. Daarmee zet ik de vervaldatum op elke nieuwe factuur. Standaard is dat 14 dagen.' },
  { tab: 'standaard', doel: 'set-herinneringen', titel: 'Herinneringen',
    tekst: 'Wil je dat je team een seintje krijgt als de uren nog niet zijn ingevuld? Zet het hier aan.' },
  { tab: 'templates', doel: 'set-templates', titel: 'Je mails',
    tekst: 'Zo klinken de mails bij je offertes, facturen en betaalherinneringen. Pas ze aan naar jouw manier van schrijven.' },
  { tab: 'integraties', doel: 'set-integraties', titel: 'Je boekhouding',
    tekst: 'Werk je met Moneybird? Koppel het hier, dan gaan je facturen vanzelf naar je boekhouding. SnelStart komt binnenkort.' },
  { welkom: true, einde: true, titel: 'Klaar voor je eerste offerte',
    tekst: 'Dat is de basis. Nu laat ik je de rest zien.' },
];

/** Alle pagina's en vensters met een rondleiding (voor "geen rondleidingen meer"). */
export const PAGINAS_MET_RONDLEIDING = [...Object.keys(RONDLEIDINGEN), 'start', 'welkom'];

// Seintjes tussen losse delen van de app (profielmenu, Instellingen) en de
// rondleiding zelf, zonder props door vijf lagen te rijgen.
export const RL_START = 'bb-rondleiding-start';
export const RL_RESET = 'bb-rondleiding-reset';
