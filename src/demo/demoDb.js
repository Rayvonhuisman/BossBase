// Nepdata voor de demo: schildersbedrijf Van Dijk Schilderwerken.
//
// In DATABASEVORM (snake_case, echte kolomnamen), niet in de vorm die de
// schermen gebruiken. Zo doen de bestaande services hun eigen vertaalslag en
// gedraagt elk scherm zich exact als in productie — dat is het hele punt van
// deze demo.
//
// Alles staat in het geheugen. Schrijfacties uit de demo landen hier en zijn
// weg zodra de bezoeker de pagina sluit.

const uur = 3600 * 1000;
const dag = 24 * uur;

// Datums lopen mee met vandaag, anders staat de demo over een maand vol met
// "te laat" en lijkt het bedrijf failliet.
const nu = new Date();
const d = (dagenVanaf, uren = 9, minuten = 0) => {
  const x = new Date(nu.getTime() + dagenVanaf * dag);
  x.setHours(uren, minuten, 0, 0);
  return x.toISOString();
};
const dagStr = dagenVanaf => new Date(nu.getTime() + dagenVanaf * dag).toISOString().slice(0, 10);

let teller = 0;
export const nieuwId = () => `demo-${Date.now().toString(36)}-${++teller}`;

const BEDRIJF = 'demo-company';
const IK = 'demo-profiel-sander';

// ── Team ────────────────────────────────────────────────────────────────────
const P = {
  sander: IK,
  wouter: 'demo-profiel-wouter',
  iris:   'demo-profiel-iris',
  tim:    'demo-profiel-tim',
  joep:   'demo-profiel-joep',
};

// ── Klanten ─────────────────────────────────────────────────────────────────
const K = {
  vve:      'demo-klant-vve',
  bouwhof:  'demo-klant-bouwhof',
  jansen:   'demo-klant-jansen',
  gemeente: 'demo-klant-gemeente',
  dekker:   'demo-klant-dekker',
  molenaar: 'demo-klant-molenaar',
  zorggroep:'demo-klant-zorggroep',
  visser:   'demo-klant-visser',
};

// ── Fasen ───────────────────────────────────────────────────────────────────
const F = {
  lead:     'demo-fase-lead',
  contact:  'demo-fase-contact',
  offerte:  'demo-fase-offerte',
  akkoord:  'demo-fase-akkoord',
  uitvoer:  'demo-fase-uitvoer',
  verloren: 'demo-fase-verloren',
};

const klant = (id, name, city, email, phone, address, postcode) => ({
  id, company_id: BEDRIJF, name, city, email, phone, address, postcode,
  kvk_number: '', btw_number: '', iban: '', notes: '', logo_url: null,
  created_at: d(-200),
});

const medewerker = (id, full_name, role) => ({
  id, company_id: BEDRIJF, full_name, role, actief: true,
  avatar_url: null, is_super_admin: false, created_at: d(-300),
});

export const demoDb = {
  __profielId: IK,
  __bedrijfId: BEDRIJF,

  companies: [{
    id: BEDRIJF,
    name: 'Van Dijk Schilderwerken',
    email: 'info@vandijkschilderwerken.nl',
    reply_to_email: 'info@vandijkschilderwerken.nl',
    phone: '038 - 421 55 30',
    address: 'Ambachtsweg 14',
    postal_code: '8028 PT',
    city: 'Zwolle',
    kvk: '61234567',
    btw_number: 'NL861234567B01',
    website: 'vandijkschilderwerken.nl',
    branding_color: '#1D4ED8',
    logo_url: null,
    tier: 'team',
    eigenaar_id: IK,
    is_testbedrijf: false,
    created_at: d(-400),
  }],

  profiles: [
    medewerker(P.sander, 'Sander de Vries', 'admin'),
    medewerker(P.wouter, 'Wouter Bosman', 'medewerker'),
    medewerker(P.iris,   'Iris Koster',    'medewerker'),
    medewerker(P.tim,    'Tim Aalders',    'medewerker'),
    medewerker(P.joep,   'Joep Hendriks',  'planner'),
  ],

  company_members: [
    { id: 'demo-lid-1', company_id: BEDRIJF, profile_id: P.wouter, email: 'wouter@vandijkschilderwerken.nl', full_name: 'Wouter Bosman', role: 'medewerker', status: 'actief', hours_per_week: 40 },
    { id: 'demo-lid-2', company_id: BEDRIJF, profile_id: P.iris,   email: 'iris@vandijkschilderwerken.nl',   full_name: 'Iris Koster',    role: 'medewerker', status: 'actief', hours_per_week: 32 },
    { id: 'demo-lid-3', company_id: BEDRIJF, profile_id: P.tim,    email: 'tim@vandijkschilderwerken.nl',    full_name: 'Tim Aalders',    role: 'medewerker', status: 'actief', hours_per_week: 40 },
    { id: 'demo-lid-4', company_id: BEDRIJF, profile_id: P.joep,   email: 'joep@vandijkschilderwerken.nl',   full_name: 'Joep Hendriks',  role: 'planner',    status: 'actief', hours_per_week: 24 },
  ],

  customers: [
    klant(K.vve,       'VvE Parkflat Assendorp',   'Zwolle',    'beheer@parkflat-assendorp.nl', '038 - 422 19 04', 'Assendorperdijk 88',  '8012 EH'),
    klant(K.bouwhof,   'Bouwhof Projecten BV',      'Kampen',    'planning@bouwhof.nl',          '038 - 331 72 10', 'Constructieweg 3',    '8263 BC'),
    klant(K.jansen,    'Familie Jansen',            'Hattem',    'h.jansen@ziggo.nl',            '06 - 2244 8871',  'Vijzelstraat 21',     '8051 HB'),
    klant(K.gemeente,  'Gemeente Zwolle',           'Zwolle',    'vastgoed@zwolle.nl',           '14 038',          'Grote Kerkplein 15',  '8011 PK'),
    klant(K.dekker,    'Dekker Vastgoedbeheer',     'Deventer',  'onderhoud@dekkervastgoed.nl',  '0570 - 61 22 88', 'Snipperlingsdijk 4',  '7417 BJ'),
    klant(K.molenaar,  'Molenaar Bouw & Onderhoud', 'Raalte',    'info@molenaarbouw.nl',         '0572 - 35 11 20', 'Industrieweg 45',     '8102 HK'),
    klant(K.zorggroep, 'Zorggroep IJssel-Vecht',    'Zwolle',    'facilitair@zorgijsselvecht.nl','038 - 456 30 00', 'Dokter Spanjaardweg 1','8025 BT'),
    klant(K.visser,    'Familie Visser',            'Wezep',     'vissernl@gmail.com',           '06 - 1180 3344',  'Heerderweg 7',        '8091 BD'),
  ],

  pipeline_stages: [
    { id: F.lead,     company_id: BEDRIJF, name: 'Nieuwe aanvraag', color_class: 'blue',   position: 1 },
    { id: F.contact,  company_id: BEDRIJF, name: 'Contact gelegd',  color_class: 'purple', position: 2 },
    { id: F.offerte,  company_id: BEDRIJF, name: 'Offerte uit',     color_class: 'amber',  position: 3 },
    { id: F.akkoord,  company_id: BEDRIJF, name: 'Akkoord',         color_class: 'green',  position: 4 },
    { id: F.uitvoer,  company_id: BEDRIJF, name: 'In uitvoering',   color_class: 'teal',   position: 5 },
    { id: F.verloren, company_id: BEDRIJF, name: 'Verloren',        color_class: 'gray',   position: 6 },
  ],

  deals: [
    { id: 'demo-deal-1', company_id: BEDRIJF, customer_id: K.vve,       stage_id: F.offerte, title: 'Buitenschilderwerk 24 balkons',        city: 'Zwolle',   value: 28400, priority: 'high',   assigned_to: P.sander, next_activity: 'Nabellen over offerte', next_date: dagStr(1),  notes_count: 3, files_count: 2, activities_count: 4, created_at: d(-24) },
    { id: 'demo-deal-2', company_id: BEDRIJF, customer_id: K.bouwhof,   stage_id: F.akkoord, title: 'Nieuwbouw 12 woningen — binnenwerk',   city: 'Kampen',   value: 41250, priority: 'high',   assigned_to: P.sander, next_activity: 'Planning afstemmen',    next_date: dagStr(2),  notes_count: 5, files_count: 4, activities_count: 6, created_at: d(-38) },
    { id: 'demo-deal-3', company_id: BEDRIJF, customer_id: K.jansen,    stage_id: F.uitvoer, title: 'Kozijnen en voordeur',                 city: 'Hattem',   value: 4850,  priority: 'normal', assigned_to: P.iris,   next_activity: 'Oplevering inplannen',  next_date: dagStr(3),  notes_count: 1, files_count: 1, activities_count: 2, created_at: d(-15) },
    { id: 'demo-deal-4', company_id: BEDRIJF, customer_id: K.gemeente,  stage_id: F.lead,    title: 'Onderhoud 3 gymzalen',                 city: 'Zwolle',   value: 19800, priority: 'normal', assigned_to: P.sander, next_activity: 'Intake plannen',        next_date: dagStr(4),  notes_count: 0, files_count: 0, activities_count: 1, created_at: d(-4) },
    { id: 'demo-deal-5', company_id: BEDRIJF, customer_id: K.dekker,    stage_id: F.contact, title: 'Portieken Rivierenwijk',               city: 'Deventer', value: 12300, priority: 'normal', assigned_to: P.joep,   next_activity: 'Inmeten',               next_date: dagStr(5),  notes_count: 2, files_count: 0, activities_count: 2, created_at: d(-9) },
    { id: 'demo-deal-6', company_id: BEDRIJF, customer_id: K.molenaar,  stage_id: F.offerte, title: 'Houtrot herstel + schilderwerk',       city: 'Raalte',   value: 7650,  priority: 'low',    assigned_to: P.iris,   next_activity: 'Offerte opvolgen',      next_date: dagStr(6),  notes_count: 1, files_count: 1, activities_count: 1, created_at: d(-12) },
    { id: 'demo-deal-7', company_id: BEDRIJF, customer_id: K.zorggroep, stage_id: F.uitvoer, title: 'Verpleeghuis — gangen en trappenhuis', city: 'Zwolle',   value: 33900, priority: 'high',   assigned_to: P.sander, next_activity: 'Tussentijds opleveren', next_date: dagStr(1),  notes_count: 4, files_count: 3, activities_count: 5, created_at: d(-45) },
    { id: 'demo-deal-8', company_id: BEDRIJF, customer_id: K.visser,    stage_id: F.verloren,title: 'Dakkapel schilderen',                  city: 'Wezep',    value: 2200,  priority: 'low',    assigned_to: P.iris,   lost_reason: 'Te duur',                 next_date: null,       notes_count: 1, files_count: 0, activities_count: 1, created_at: d(-30) },
  ],

  // LET OP de veldnamen: de offerteservice leest `totaal_excl` en `totaal_incl`
  // (niet `totaal`). Met de verkeerde naam toont elk scherm keurig € 0,00 zonder
  // te klagen — precies het soort stille misser waar een demo op afknapt.
  offertes: [
    { id: 'demo-off-1', company_id: BEDRIJF, customer_id: K.vve,      deal_id: 'demo-deal-1', nummer: 'OF-2026-041', omschrijving: 'Buitenschilderwerk 24 balkons', status: 'verzonden',  geldig_tot: dagStr(21), totaal_excl: 23471, totaal_incl: 28400, btw_pct: 21, created_at: d(-6),  verzonden_op: d(-6),  sent_to_email: 'beheer@parkflat-assendorp.nl' },
    { id: 'demo-off-2', company_id: BEDRIJF, customer_id: K.bouwhof,  deal_id: 'demo-deal-2', nummer: 'OF-2026-038', omschrijving: 'Binnenschilderwerk 12 woningen', status: 'geaccepteerd', geldig_tot: dagStr(9), totaal_excl: 34091, totaal_incl: 41250, btw_pct: 21, created_at: d(-20), verzonden_op: d(-20), geaccepteerd_op: d(-14), signed_by_email: 'planning@bouwhof.nl', signed_by_name: 'R. Bouwhof', signed_at: d(-14) },
    { id: 'demo-off-3', company_id: BEDRIJF, customer_id: K.molenaar, deal_id: 'demo-deal-6', nummer: 'OF-2026-044', omschrijving: 'Houtrot herstel en schilderwerk', status: 'verzonden', geldig_tot: dagStr(25), totaal_excl: 6322,  totaal_incl: 7650,  btw_pct: 21, created_at: d(-3),  verzonden_op: d(-3),  sent_to_email: 'info@molenaarbouw.nl' },
    { id: 'demo-off-4', company_id: BEDRIJF, customer_id: K.dekker,   deal_id: 'demo-deal-5', nummer: 'OF-2026-045', omschrijving: 'Portieken Rivierenwijk',          status: 'concept',   geldig_tot: dagStr(30), totaal_excl: 10165, totaal_incl: 12300, btw_pct: 21, created_at: d(-1) },
    { id: 'demo-off-5', company_id: BEDRIJF, customer_id: K.visser,   deal_id: 'demo-deal-8', nummer: 'OF-2026-031', omschrijving: 'Dakkapel schilderen',            status: 'afgewezen', geldig_tot: dagStr(-5), totaal_excl: 1818,  totaal_incl: 2200,  btw_pct: 21, created_at: d(-28) },
  ],

  offerte_items: [
    { id: 'demo-oi-1', offerte_id: 'demo-off-1', company_id: BEDRIJF, omschrijving: 'Voorbehandeling en schuren balkonhekken', aantal: 24, eenheid: 'stuk', prijs: 310, btw_pct: 21, type: 'werk', position: 1 },
    { id: 'demo-oi-2', offerte_id: 'demo-off-1', company_id: BEDRIJF, omschrijving: 'Grondlaag + 2x aflak',                    aantal: 24, eenheid: 'stuk', prijs: 480, btw_pct: 21, type: 'werk', position: 2 },
    { id: 'demo-oi-3', offerte_id: 'demo-off-1', company_id: BEDRIJF, omschrijving: 'Steigerwerk en afzetting',                aantal: 1,  eenheid: 'post', prijs: 4520, btw_pct: 21, type: 'materiaal', position: 3 },
    { id: 'demo-oi-4', offerte_id: 'demo-off-2', company_id: BEDRIJF, omschrijving: 'Spuitwerk plafonds en wanden',            aantal: 12, eenheid: 'woning', prijs: 2180, btw_pct: 9, type: 'werk', position: 1 },
    { id: 'demo-oi-5', offerte_id: 'demo-off-2', company_id: BEDRIJF, omschrijving: 'Aftimmerwerk lakken',                     aantal: 12, eenheid: 'woning', prijs: 1260, btw_pct: 9, type: 'werk', position: 2 },
  ],

  werkbonnen: [
    { id: 'demo-wb-1', company_id: BEDRIJF, customer_id: K.zorggroep, nummer: 'WB-2026-118', titel: 'Gangen 2e verdieping schilderen', omschrijving: 'Wanden en deurkozijnen, kleur RAL 9010. Let op: afdelingen blijven in gebruik.', status: 'gepland',      gepland_op: dagStr(0), starttijd: '07:30', eindtijd: '16:00', locatie: 'Dokter Spanjaardweg 1, Zwolle', assigned_to_ids: [P.wouter, P.tim], verantwoordelijke_ids: [P.wouter], created_at: d(-5) },
    { id: 'demo-wb-2', company_id: BEDRIJF, customer_id: K.jansen,    nummer: 'WB-2026-119', titel: 'Kozijnen voorgevel',              omschrijving: 'Houtrot uitboren, plamuren en aflakken.',                                   status: 'in_uitvoering', gepland_op: dagStr(0), starttijd: '08:00', eindtijd: '15:00', locatie: 'Vijzelstraat 21, Hattem',        assigned_to_ids: [P.iris],          verantwoordelijke_ids: [P.iris],   created_at: d(-3) },
    { id: 'demo-wb-3', company_id: BEDRIJF, customer_id: K.bouwhof,   nummer: 'WB-2026-120', titel: 'Woning 3 t/m 6 — binnenwerk',     omschrijving: 'Spuitwerk plafonds, daarna wanden.',                                        status: 'gepland',      gepland_op: dagStr(1), starttijd: '07:00', eindtijd: '16:30', locatie: 'Constructieweg 3, Kampen',       assigned_to_ids: [P.wouter, P.tim, P.iris], verantwoordelijke_ids: [P.tim], created_at: d(-2) },
    { id: 'demo-wb-4', company_id: BEDRIJF, customer_id: K.vve,       nummer: 'WB-2026-121', titel: 'Inmeten balkons',                 omschrijving: 'Opmeten voor offerte, foto’s van de schade maken.',                     status: 'gepland',      gepland_op: dagStr(2), starttijd: '09:00', eindtijd: '12:00', locatie: 'Assendorperdijk 88, Zwolle',     assigned_to_ids: [P.sander],        verantwoordelijke_ids: [P.sander], created_at: d(-1) },
    { id: 'demo-wb-5', company_id: BEDRIJF, customer_id: K.dekker,    nummer: 'WB-2026-117', titel: 'Portiek 4 — herstelwerk',         omschrijving: 'Afgerond en opgeleverd.',                                                   status: 'afgerond',     gepland_op: dagStr(-3), starttijd: '07:30', eindtijd: '16:00', locatie: 'Snipperlingsdijk 4, Deventer',  assigned_to_ids: [P.tim],           verantwoordelijke_ids: [P.tim],    created_at: d(-10) },
    { id: 'demo-wb-6', company_id: BEDRIJF, customer_id: K.molenaar,  nummer: 'WB-2026-122', titel: 'Houtrot inventarisatie',          omschrijving: '',                                                                          status: 'gepland',      gepland_op: dagStr(3), starttijd: '13:00', eindtijd: '16:00', locatie: 'Industrieweg 45, Raalte',        assigned_to_ids: [P.iris],          verantwoordelijke_ids: [P.iris],   created_at: d(0) },
  ],

  werkbon_dagen: [
    { id: 'demo-wd-1', werkbon_id: 'demo-wb-1', company_id: BEDRIJF, datum: dagStr(0), starttijd: null, eindtijd: null, medewerker_ids: null, voertuig_ids: ['demo-bus-1'], medewerker_tijden: null },
    { id: 'demo-wd-2', werkbon_id: 'demo-wb-3', company_id: BEDRIJF, datum: dagStr(1), starttijd: null, eindtijd: null, medewerker_ids: null, voertuig_ids: ['demo-bus-1', 'demo-bus-2'], medewerker_tijden: null },
    { id: 'demo-wd-3', werkbon_id: 'demo-wb-3', company_id: BEDRIJF, datum: dagStr(2), starttijd: null, eindtijd: null, medewerker_ids: [P.wouter, P.tim], voertuig_ids: ['demo-bus-1'], medewerker_tijden: null },
    { id: 'demo-wd-4', werkbon_id: 'demo-wb-2', company_id: BEDRIJF, datum: dagStr(0), starttijd: null, eindtijd: null, medewerker_ids: null, voertuig_ids: ['demo-bus-2'], medewerker_tijden: null },
  ],

  voertuigen: [
    { id: 'demo-bus-1', company_id: BEDRIJF, naam: 'Bus 1 — Ford Transit', kenteken: 'VJ-421-P', zitplaatsen: 3, actief: true },
    { id: 'demo-bus-2', company_id: BEDRIJF, naam: 'Bus 2 — Renault Trafic', kenteken: 'ZN-880-H', zitplaatsen: 2, actief: true },
  ],

  werkbon_taken: [
    { id: 'demo-tk-1', werkbon_id: 'demo-wb-1', company_id: BEDRIJF, omschrijving: 'Afplakken en afdekken vloeren', gereed: true,  position: 1, soort: 'taak' },
    { id: 'demo-tk-2', werkbon_id: 'demo-wb-1', company_id: BEDRIJF, omschrijving: 'Wanden sausen (2 lagen)',       gereed: false, position: 2, soort: 'taak' },
    { id: 'demo-tk-3', werkbon_id: 'demo-wb-1', company_id: BEDRIJF, omschrijving: 'Kozijnen lakken',              gereed: false, position: 3, soort: 'taak' },
    { id: 'demo-tk-4', werkbon_id: 'demo-wb-2', company_id: BEDRIJF, omschrijving: 'Houtrot uitboren',             gereed: true,  position: 1, soort: 'taak' },
  ],

  werkbon_materialen: [
    { id: 'demo-wm-1', werkbon_id: 'demo-wb-1', company_id: BEDRIJF, omschrijving: 'Muurverf wit mat 10L', aantal: 4, eenheid: 'emmer', prijs: 62.5 },
    { id: 'demo-wm-2', werkbon_id: 'demo-wb-1', company_id: BEDRIJF, omschrijving: 'Afplaktape 50mm',      aantal: 12, eenheid: 'rol',  prijs: 4.2 },
    { id: 'demo-wm-3', werkbon_id: 'demo-wb-2', company_id: BEDRIJF, omschrijving: 'Houtreparatiepasta',   aantal: 3,  eenheid: 'set',  prijs: 28.9 },
  ],

  werkbon_uren: [
    { id: 'demo-wu-1', werkbon_id: 'demo-wb-5', company_id: BEDRIJF, profile_id: P.tim, datum: dagStr(-3), begin: '07:30', eind: '16:00', pauze: 30, omschrijving: 'Herstelwerk portiek' },
    { id: 'demo-wu-2', werkbon_id: 'demo-wb-2', company_id: BEDRIJF, profile_id: P.iris, datum: dagStr(0), begin: '08:00', eind: '12:00', pauze: 15, omschrijving: 'Houtrot' },
  ],

  werkbon_notities: [
    { id: 'demo-wn-1', werkbon_id: 'demo-wb-1', company_id: BEDRIJF, created_by: P.sander, note: 'Sleutel ophalen bij de receptie, vragen naar Miranda.', voor_klant: false, created_at: d(-1, 16, 20) },
    { id: 'demo-wn-2', werkbon_id: 'demo-wb-2', company_id: BEDRIJF, created_by: P.iris,   note: 'Meer houtrot dan verwacht aan de onderdorpel — klant is akkoord met meerwerk.', voor_klant: true, created_at: d(0, 10, 5) },
  ],

  // Zelfde valkuil als bij offertes: de factuurservice leest `totaal_excl` en
  // `totaal_incl`. De klantkaart telt diezelfde velden op voor "gefactureerd" en
  // "betaald", dus met de juiste namen klopt die kolom vanzelf mee.
  facturen: [
    { id: 'demo-fa-1', company_id: BEDRIJF, customer_id: K.dekker,    nummer: 'F-2026-0212', factuurdatum: dagStr(-12), vervaldatum: dagStr(2),   betaaltermijn_dagen: 14, status: 'verzonden', totaal_excl: 7000,  totaal_incl: 8470,  betalingskenmerk: '2026 0212', created_at: d(-12) },
    { id: 'demo-fa-2', company_id: BEDRIJF, customer_id: K.zorggroep, nummer: 'F-2026-0208', factuurdatum: dagStr(-28), vervaldatum: dagStr(-14), betaaltermijn_dagen: 14, status: 'verzonden', totaal_excl: 14000, totaal_incl: 16940, betalingskenmerk: '2026 0208', created_at: d(-28) },
    { id: 'demo-fa-3', company_id: BEDRIJF, customer_id: K.jansen,    nummer: 'F-2026-0215', factuurdatum: dagStr(-2),  vervaldatum: dagStr(12),  betaaltermijn_dagen: 14, status: 'verzonden', totaal_excl: 1800,  totaal_incl: 2178,  betalingskenmerk: '2026 0215', created_at: d(-2) },
    { id: 'demo-fa-4', company_id: BEDRIJF, customer_id: K.bouwhof,   nummer: 'F-2026-0201', factuurdatum: dagStr(-45), vervaldatum: dagStr(-31), betaaltermijn_dagen: 14, status: 'betaald',   totaal_excl: 17045, totaal_incl: 20625, betaald_op: dagStr(-30), betalingskenmerk: '2026 0201', created_at: d(-45) },
    { id: 'demo-fa-5', company_id: BEDRIJF, customer_id: K.vve,       nummer: 'F-2026-0216', factuurdatum: dagStr(0),   vervaldatum: dagStr(14),  betaaltermijn_dagen: 14, status: 'concept',   totaal_excl: 2800,  totaal_incl: 3388,  betalingskenmerk: '2026 0216', created_at: d(0) },
    { id: 'demo-fa-6', company_id: BEDRIJF, customer_id: K.molenaar,  nummer: 'F-2026-0198', factuurdatum: dagStr(-60), vervaldatum: dagStr(-46), betaaltermijn_dagen: 14, status: 'betaald',   totaal_excl: 3900,  totaal_incl: 4719,  betaald_op: dagStr(-44), betalingskenmerk: '2026 0198', created_at: d(-60) },
  ],

  activities: [
    { id: 'demo-ac-1', company_id: BEDRIJF, customer_id: K.vve,       deal_id: 'demo-deal-1', title: 'Nabellen over offerte balkons', type: 'call',   due_at: d(0, 11, 0),  completed: false, assigned_to: IK, assigned_to_ids: [IK], priority: 'high' },
    { id: 'demo-ac-2', company_id: BEDRIJF, customer_id: K.bouwhof,   deal_id: 'demo-deal-2', title: 'Planning afstemmen met uitvoerder', type: 'call', due_at: d(0, 14, 30), completed: false, assigned_to: IK, assigned_to_ids: [IK], priority: 'normal' },
    { id: 'demo-ac-3', company_id: BEDRIJF, customer_id: K.gemeente,  deal_id: 'demo-deal-4', title: 'Intake gymzalen inplannen',     type: 'email',  due_at: d(-1, 9, 0),  completed: false, assigned_to: IK, assigned_to_ids: [IK], priority: 'normal' },
    { id: 'demo-ac-4', company_id: BEDRIJF, customer_id: K.zorggroep, deal_id: 'demo-deal-7', title: 'Tussentijdse oplevering gangen', type: 'visit', due_at: d(1, 15, 0),  completed: false, assigned_to: IK, assigned_to_ids: [IK], priority: 'high' },
    { id: 'demo-ac-5', company_id: BEDRIJF, customer_id: K.dekker,    deal_id: 'demo-deal-5', title: 'Inmeten portieken',             type: 'visit',  due_at: d(2, 10, 0),  completed: false, assigned_to: P.joep, assigned_to_ids: [P.joep], priority: 'normal' },
    { id: 'demo-ac-6', company_id: BEDRIJF, customer_id: K.molenaar,  deal_id: 'demo-deal-6', title: 'Offerte houtrot opvolgen',      type: 'follow', due_at: d(-2, 9, 0),  completed: false, assigned_to: IK, assigned_to_ids: [IK], priority: 'low' },
    { id: 'demo-ac-7', company_id: BEDRIJF, customer_id: K.jansen,    deal_id: 'demo-deal-3', title: 'Foto’s oplevering sturen', type: 'task',   due_at: d(3, 16, 0),  completed: false, assigned_to: P.iris, assigned_to_ids: [P.iris], priority: 'normal' },
    { id: 'demo-ac-8', company_id: BEDRIJF, customer_id: K.vve,       deal_id: 'demo-deal-1', title: 'Offerte verstuurd',             type: 'email',  due_at: d(-6, 10, 0), completed: true,  assigned_to: IK, assigned_to_ids: [IK], priority: 'normal' },
  ],

  calendar_events: [
    { id: 'demo-ce-1', company_id: BEDRIJF, customer_id: K.zorggroep, title: 'Gangen 2e verdieping schilderen', start_at: d(0, 7, 30), end_at: d(0, 16, 0),  location: 'Dokter Spanjaardweg 1, Zwolle', type: null, werkbon_id: 'demo-wb-1', assigned_to: P.wouter },
    { id: 'demo-ce-2', company_id: BEDRIJF, customer_id: K.jansen,    title: 'Kozijnen voorgevel',              start_at: d(0, 8, 0),  end_at: d(0, 15, 0),  location: 'Vijzelstraat 21, Hattem',       type: null, werkbon_id: 'demo-wb-2', assigned_to: P.iris },
    { id: 'demo-ce-3', company_id: BEDRIJF, customer_id: K.bouwhof,   title: 'Woning 3 t/m 6 — binnenwerk',     start_at: d(1, 7, 0),  end_at: d(1, 16, 30), location: 'Constructieweg 3, Kampen',      type: null, werkbon_id: 'demo-wb-3', assigned_to: P.tim },
    { id: 'demo-ce-4', company_id: BEDRIJF, customer_id: K.vve,       title: 'Inmeten balkons',                 start_at: d(2, 9, 0),  end_at: d(2, 12, 0),  location: 'Assendorperdijk 88, Zwolle',    type: null, werkbon_id: 'demo-wb-4', assigned_to: IK },
    { id: 'demo-ce-5', company_id: BEDRIJF, customer_id: K.dekker,    title: 'Inmeten portieken',               start_at: d(2, 10, 0), end_at: d(2, 11, 30), location: 'Snipperlingsdijk 4, Deventer',  type: null, activiteit_id: 'demo-ac-5', assigned_to: P.joep },
    { id: 'demo-ce-6', company_id: BEDRIJF, customer_id: null,        title: 'Werkoverleg',                     start_at: d(1, 16, 45), end_at: d(1, 17, 30), location: 'Kantoor',                      type: 'event', assigned_to: IK },
  ],

  projects: [
    { id: 'demo-pr-1', company_id: BEDRIJF, customer_id: K.bouwhof,   naam: 'Nieuwbouw Kampen — 12 woningen', status: 'lopend', budget: 41250, created_at: d(-38) },
    { id: 'demo-pr-2', company_id: BEDRIJF, customer_id: K.zorggroep, naam: 'Verpleeghuis IJssel-Vecht',      status: 'lopend', budget: 33900, created_at: d(-45) },
  ],

  job_costs: [],
  materialen: [],
  leveranciers: [],
  urenregistratie: [],
  email_templates: [],
  notifications: [],
  sent_emails: [],
  user_permissions: [],
  lost_reasons: [
    { id: 'demo-lr-1', company_id: BEDRIJF, reden: 'Te duur' },
    { id: 'demo-lr-2', company_id: BEDRIJF, reden: 'Geen reactie' },
    { id: 'demo-lr-3', company_id: BEDRIJF, reden: 'Andere aannemer' },
  ],
};

export default demoDb;
