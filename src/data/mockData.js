export const pipelineStages = [
  { id: 'nieuw', name: 'Nieuwe aanvraag', helper: 'Nieuwe leads die nog opgevolgd moeten worden' },
  { id: 'contact', name: 'Contact opnemen', helper: 'Bel of mail de klant voor extra informatie' },
  { id: 'compleet', name: 'Gegevens compleet', helper: 'Alles is duidelijk genoeg om te calculeren' },
  { id: 'offerte-maken', name: 'Offerte maken', helper: 'Maak een nette offerte op basis van de intake' },
  { id: 'verstuurd', name: 'Offerte verstuurd', helper: 'Offertes die naar klanten zijn gestuurd' },
  { id: 'wachten', name: 'Wachten op akkoord', helper: 'Volg deze klanten actief op' },
  { id: 'akkoord', name: 'Akkoord ontvangen', helper: 'Plan deze klus in' },
  { id: 'ingepland', name: 'Ingepland', helper: 'Klus staat in de planning' },
  { id: 'uitvoering', name: 'In uitvoering', helper: 'Werkbon actief op locatie' },
  { id: 'afgerond', name: 'Afgerond', helper: 'Controleer uren, materialen en betaalstatus' },
  { id: 'betaald', name: 'Betaald / gesloten', helper: 'Klus is administratief afgerond' },
  { id: 'verloren', name: 'Verloren', helper: 'Leg vast waarom de klus niet doorgaat' }
];

export const customers = [
  { id: 'c1', name: 'Fam. Jansen', phone: '06-12345678', email: 'jansen@example.nl', address: 'Stationsweg 12', city: 'Zwolle', type: 'Particulier', notes: 'Wil snel duidelijkheid over planning.', payment: 'Openstaand' },
  { id: 'c2', name: 'De Boer Vastgoed', phone: '050-2345678', email: 'beheer@deboer.nl', address: 'Gedempte Zuiderdiep 45', city: 'Groningen', type: 'Vastgoedbeheerder', notes: 'Meerdere panden in onderhoud.', payment: 'Betaald' },
  { id: 'c3', name: 'Bakker VvE Beheer', phone: '038-3456789', email: 'info@bakkervve.nl', address: 'Brink 8', city: 'Assen', type: 'VvE', notes: 'Besluitvorming via bestuur.', payment: 'Aanbetaling ontvangen' },
  { id: 'c4', name: 'Van Dijk', phone: '06-45678912', email: 'vandijk@example.nl', address: 'Hessenweg 99', city: 'Hardenberg', type: 'Particulier', notes: 'Akkoord gegeven per mail.', payment: 'Niet betaald' },
  { id: 'c5', name: 'Meijer Installatie', phone: '0591-567891', email: 'planning@meijer.nl', address: 'Hoofdstraat 20', city: 'Emmen', type: 'Zakelijk', notes: 'Werkt graag met vaste dagplanning.', payment: 'Deels betaald' }
];

export const leads = [
  { id: 'l1', customerId: 'c1', customer: 'Fam. Jansen', phone: '06-12345678', email: 'jansen@example.nl', address: 'Stationsweg 12', city: 'Zwolle', jobType: 'Buitenschilderwerk', description: 'Buitenschilderwerk woning in Zwolle, kozijnen en voordeur.', desiredDate: 'Binnen 6 weken', source: 'Websiteformulier', priority: 'hoog', stage: 'nieuw', notes: 'Foto’s ontvangen via mail.', createdAt: '2026-05-01', lastActivity: 'Vandaag' },
  { id: 'l2', customerId: 'c2', customer: 'De Boer Vastgoed', phone: '050-2345678', email: 'beheer@deboer.nl', address: 'Parkweg 18', city: 'Groningen', jobType: 'Tuinonderhoud', description: 'Periodiek tuinonderhoud voor huurcomplex.', desiredDate: 'Mei 2026', source: 'E-mail', priority: 'normaal', stage: 'compleet', notes: 'Maandelijks onderhoud gewenst.', createdAt: '2026-04-28', lastActivity: 'Gisteren' },
  { id: 'l3', customerId: 'c3', customer: 'Bakker VvE Beheer', phone: '038-3456789', email: 'info@bakkervve.nl', address: 'Brink 8', city: 'Assen', jobType: 'Badkamerreparatie', description: 'Kleine badkamerreparatie in Assen na lekkage.', desiredDate: 'Zo snel mogelijk', source: 'Referral', priority: 'hoog', stage: 'verstuurd', notes: 'Bestuur wil prijs per mail.', createdAt: '2026-04-25', lastActivity: '3 dagen geleden' },
  { id: 'l4', customerId: 'c4', customer: 'Van Dijk', phone: '06-45678912', email: 'vandijk@example.nl', address: 'Hessenweg 99', city: 'Hardenberg', jobType: 'Schutting plaatsen', description: 'Schutting plaatsen in Hardenberg, circa 18 meter.', desiredDate: 'Volgende maand', source: 'Handmatig', priority: 'normaal', stage: 'akkoord', notes: 'Klant wil graag vrijdag starten.', createdAt: '2026-04-20', lastActivity: 'Vandaag' },
  { id: 'l5', customerId: 'c5', customer: 'Meijer Installatie', phone: '0591-567891', email: 'planning@meijer.nl', address: 'Hoofdstraat 20', city: 'Emmen', jobType: 'Kozijnen lakken', description: 'Kozijnen lakken in Emmen voor kantoorruimte.', desiredDate: 'Week 20', source: 'E-mail', priority: 'laag', stage: 'ingepland', notes: 'Werkbon alvast controleren.', createdAt: '2026-04-18', lastActivity: 'Gisteren' },
  { id: 'l6', customerId: 'c2', customer: 'De Boer Vastgoed', phone: '050-2345678', email: 'beheer@deboer.nl', address: 'Oosterstraat 7', city: 'Groningen', jobType: 'Schoonmaak oplevering', description: 'Eindschoonmaak na renovatie appartement.', desiredDate: '13 mei', source: 'Websiteformulier', priority: 'normaal', stage: 'contact', notes: 'Nog sleutelafspraak plannen.', createdAt: '2026-05-02', lastActivity: 'Vandaag' },
  { id: 'l7', customerId: 'c1', customer: 'Fam. Jansen', phone: '06-12345678', email: 'jansen@example.nl', address: 'Stationsweg 12', city: 'Zwolle', jobType: 'Timmerwerk', description: 'Nieuwe binnendeur afhangen en plinten herstellen.', desiredDate: 'Geen haast', source: 'Handmatig', priority: 'laag', stage: 'offerte-maken', notes: 'Combineren met schilderwerk mogelijk.', createdAt: '2026-04-30', lastActivity: '2 dagen geleden' },
  { id: 'l8', customerId: 'c3', customer: 'Bakker VvE Beheer', phone: '038-3456789', email: 'info@bakkervve.nl', address: 'Brink 8', city: 'Assen', jobType: 'Periodiek tuinonderhoud', description: 'Periodiek tuinonderhoud voor VvE binnentuin.', desiredDate: 'Per seizoen', source: 'Referral', priority: 'normaal', stage: 'wachten', notes: 'Reminder staat klaar.', createdAt: '2026-04-16', lastActivity: '7 dagen geleden' }
];

export const pipelineCards = leads.slice(0, 6).map((lead, index) => ({
  id: `p${index + 1}`,
  leadId: lead.id,
  customer: lead.customer,
  jobType: lead.jobType,
  value: [4200, 1850, 760, 3100, 2400, 980][index],
  deadline: ['Vandaag', 'Morgen', 'Over 3 dagen', 'Vrijdag', 'Morgen 08:00', '13 mei'][index],
  priority: lead.priority,
  stage: lead.stage,
  description: lead.description,
  lastActivity: lead.lastActivity
}));

export const quoteTemplates = ['Algemeen klusbedrijf', 'Schilder', 'Hovenier'];

export const quotes = [
  { id: 'q1', number: 'OFF-2026-001', customerId: 'c1', customer: 'Fam. Jansen', template: 'Schilder', status: 'Verstuurd', totalExVat: 3471, totalIncVat: 4200, validUntil: '2026-05-14', planning: 'Week 22', description: 'Buitenschilderwerk woning in Zwolle', lines: ['Schuren en gronden kozijnen', 'Aflakken buitenwerk', 'Materiaal en kleinverbruik'] },
  { id: 'q2', number: 'OFF-2026-002', customerId: 'c2', customer: 'De Boer Vastgoed', template: 'Hovenier', status: 'Concept', totalExVat: 1529, totalIncVat: 1850, validUntil: '2026-05-20', planning: 'Maandelijks vanaf juni', description: 'Tuinonderhoud complex Groningen', lines: ['Onderhoud per bezoek', 'Afvoer groenafval', 'Reiskosten'] },
  { id: 'q3', number: 'OFF-2026-003', customerId: 'c4', customer: 'Van Dijk', template: 'Algemeen klusbedrijf', status: 'Geaccepteerd', totalExVat: 2562, totalIncVat: 3100, validUntil: '2026-05-10', planning: 'Vrijdag 15 mei', description: 'Schutting plaatsen in Hardenberg', lines: ['Plaatsen houten schutting', 'Materialen', 'Afvoer oude delen'] },
  { id: 'q4', number: 'OFF-2026-004', customerId: 'c3', customer: 'Bakker VvE Beheer', template: 'Algemeen klusbedrijf', status: 'Verstuurd', totalExVat: 628, totalIncVat: 760, validUntil: '2026-05-09', planning: 'Na akkoord', description: 'Badkamerreparatie na lekkage', lines: ['Inspectie en herstel kitwerk', 'Kleine materialen'] }
];

export const jobs = [
  { id: 'j1', customer: 'Van Dijk', city: 'Hardenberg', address: 'Hessenweg 99', date: '2026-05-15', start: '08:00', end: '16:00', team: 'Team Noord', status: 'Gepland', workOrderId: 'w1', value: 3100, googleEventId: 'mock-gcal-1001' },
  { id: 'j2', customer: 'Meijer Installatie', city: 'Emmen', address: 'Hoofdstraat 20', date: '2026-05-04', start: '09:00', end: '15:00', team: 'Jan', status: 'Bevestigd', workOrderId: 'w2', value: 2400, googleEventId: 'mock-gcal-1002' },
  { id: 'j3', customer: 'Fam. Jansen', city: 'Zwolle', address: 'Stationsweg 12', date: '2026-05-07', start: '10:00', end: '12:00', team: 'Eigenaar', status: 'Concept', workOrderId: 'w3', value: 4200, googleEventId: '' },
  { id: 'j4', customer: 'De Boer Vastgoed', city: 'Groningen', address: 'Parkweg 18', date: '2026-05-08', start: '08:30', end: '11:30', team: 'Team Groen', status: 'Gepland', workOrderId: 'w4', value: 1850, googleEventId: 'mock-gcal-1004' },
  { id: 'j5', customer: 'Bakker VvE Beheer', city: 'Assen', address: 'Brink 8', date: '2026-05-10', start: '13:00', end: '17:00', team: 'Jan', status: 'In uitvoering', workOrderId: 'w2', value: 760, googleEventId: '' }
];

export const workOrders = [
  { id: 'w1', customer: 'Van Dijk', phone: '06-45678912', address: 'Hessenweg 99, Hardenberg', date: '15 mei 2026', time: '08:00 - 16:00', status: 'nog niet gestart', description: 'Schutting plaatsen, oude delen afvoeren en opleveren.', checklist: [true, true, false, false, false, false, false] },
  { id: 'w2', customer: 'Meijer Installatie', phone: '0591-567891', address: 'Hoofdstraat 20, Emmen', date: '4 mei 2026', time: '09:00 - 15:00', status: 'controle nodig', description: 'Kozijnen lakken kantoorruimte. Controleer droogtijd en eindfoto’s.', checklist: [true, true, true, true, false, true, false] },
  { id: 'w3', customer: 'Fam. Jansen', phone: '06-12345678', address: 'Stationsweg 12, Zwolle', date: '7 mei 2026', time: '10:00 - 12:00', status: 'nog niet gestart', description: 'Opname buitenschilderwerk en foto’s maken.', checklist: [false, false, false, false, false, false, false] },
  { id: 'w4', customer: 'De Boer Vastgoed', phone: '050-2345678', address: 'Parkweg 18, Groningen', date: '8 mei 2026', time: '08:30 - 11:30', status: 'bezig', description: 'Tuinonderhoud complex en groenafval afvoeren.', checklist: [true, true, true, false, false, false, true] }
];

export const tasks = [
  { id: 't1', title: 'Bel nieuwe aanvraag van Jansen', type: 'bellen', customer: 'Fam. Jansen', linked: 'Lead l1', deadline: 'Vandaag 10:00', priority: 'urgent', status: 'vandaag', owner: 'Rayvon' },
  { id: 't2', title: 'Maak offerte voor De Boer', type: 'offerte maken', customer: 'De Boer Vastgoed', linked: 'Lead l2', deadline: 'Vandaag 15:00', priority: 'hoog', status: 'vandaag', owner: 'Rayvon' },
  { id: 't3', title: 'Volg offerte Bakker op, 3 dagen geen reactie', type: 'bellen', customer: 'Bakker VvE Beheer', linked: 'Offerte q4', deadline: 'Vandaag', priority: 'hoog', status: 'te laat', owner: 'Rayvon' },
  { id: 't4', title: 'Plan klus Van Dijk in, offerte is geaccepteerd', type: 'plannen', customer: 'Van Dijk', linked: 'Offerte q3', deadline: 'Morgen', priority: 'normaal', status: 'open', owner: 'Rayvon' },
  { id: 't5', title: 'Controleer werkbon Meijer, klus morgen gepland', type: 'controleren', customer: 'Meijer Installatie', linked: 'Werkbon w2', deadline: 'Vandaag', priority: 'normaal', status: 'vandaag', owner: 'Jan' },
  { id: 't6', title: 'Controleer betaalstatus van afgeronde klus', type: 'betaling controleren', customer: 'Bakker VvE Beheer', linked: 'Klus j5', deadline: 'Vrijdag', priority: 'laag', status: 'open', owner: 'Rayvon' }
];

export const team = [
  { id: 'm1', name: 'Rayvon Huisman', email: 'rayvon@klusdashboard.nl', phone: '06-11111111', role: 'Eigenaar/admin', rate: 68, availability: 'Ma-vr', skills: ['Calculatie', 'Planning', 'Timmerwerk'], jobs: ['j1', 'j3'] },
  { id: 'm2', name: 'Jan Mulder', email: 'jan@example.nl', phone: '06-22222222', role: 'Medewerker', rate: 48, availability: 'Ma-do', skills: ['Schilderwerk', 'Klein onderhoud'], jobs: ['j2', 'j5'] },
  { id: 'm3', name: 'Sara de Vries', email: 'sara@example.nl', phone: '06-33333333', role: 'Medewerker', rate: 45, availability: 'Di-vr', skills: ['Hovenier', 'Snoeien'], jobs: ['j4'] },
  { id: 'm4', name: 'Omar El Amrani', email: 'omar@example.nl', phone: '06-44444444', role: 'Medewerker', rate: 52, availability: 'Ma-vr', skills: ['Installatie', 'Reparatie'], jobs: [] }
];

export const materials = [
  { id: 'mat1', job: 'Van Dijk', name: 'Houten schuttingdeel', amount: 9, unit: 'stuks', cost: 42, sales: 59, supplier: 'Bouwmarkt', used: true, note: 'Geimpregneerd hout' },
  { id: 'mat2', job: 'Meijer Installatie', name: 'Lak wit hoogglans', amount: 4, unit: 'liter', cost: 28, sales: 39, supplier: 'Verfgroothandel', used: true, note: 'Binnenlak' },
  { id: 'mat3', job: 'De Boer Vastgoed', name: 'Groenafval zakken', amount: 12, unit: 'stuks', cost: 1.5, sales: 3, supplier: 'Groenservice', used: false, note: 'Voor onderhoudsronde' },
  { id: 'mat4', job: 'Bakker VvE Beheer', name: 'Sanitairkit', amount: 2, unit: 'stuks', cost: 8, sales: 14, supplier: 'Installatiehandel', used: true, note: 'Badkamerreparatie' }
];

export const hours = [
  { id: 'h1', employee: 'Jan Mulder', job: 'Meijer Installatie', date: '2026-05-02', start: '09:00', end: '15:00', break: 30, total: 5.5, type: 'arbeid', note: 'Kozijnen eerste laag' },
  { id: 'h2', employee: 'Sara de Vries', job: 'De Boer Vastgoed', date: '2026-05-01', start: '08:30', end: '11:30', break: 0, total: 3, type: 'arbeid', note: 'Tuinonderhoud opname' },
  { id: 'h3', employee: 'Rayvon Huisman', job: 'Van Dijk', date: '2026-04-29', start: '16:00', end: '17:00', break: 0, total: 1, type: 'voorbereiding', note: 'Materiaal berekend' },
  { id: 'h4', employee: 'Omar El Amrani', job: 'Bakker VvE Beheer', date: '2026-04-28', start: '13:00', end: '16:30', break: 15, total: 3.25, type: 'arbeid', note: 'Kitwerk en controle' }
];

export const documents = [
  { id: 'd1', name: 'Foto kozijnen vooraf.jpg', category: 'Vooraf', linkedTo: 'Lead l1', date: '2026-05-01', uploader: 'Klant', note: 'Kozijnen noordzijde' },
  { id: 'd2', name: 'Opname tuin.pdf', category: 'Intake/opname', linkedTo: 'Lead l2', date: '2026-04-28', uploader: 'Rayvon', note: 'Onderhoudsronde' },
  { id: 'd3', name: 'Schade badkamer.png', category: 'Schade/probleem', linkedTo: 'Werkbon w2', date: '2026-04-25', uploader: 'Bakker VvE', note: 'Lekkageplek' },
  { id: 'd4', name: 'Materiaalbon schutting.pdf', category: 'Materiaal', linkedTo: 'Job j1', date: '2026-04-30', uploader: 'Rayvon', note: 'Inkoopbon' }
];

export const emailTemplates = [
  'Aanvraag ontvangen',
  'Extra informatie nodig',
  'Afspraak bevestiging',
  'Offerte versturen',
  'Offerte reminder',
  'Offerte geaccepteerd',
  'Klus gepland',
  'Herinnering afspraak',
  'Klus afgerond',
  'Betaling reminder basic'
];

export const settings = {
  company: 'BossBase Demo',
  address: 'Voorbeeldstraat 10, Zwolle',
  kvk: '81234567',
  vat: 'NL001234567B01',
  email: 'info@bossbase.nl',
  phone: '038-1234567',
  hourlyRate: 65,
  vatRate: 21,
  travelCost: 35,
  margin: 12,
  quoteValidity: 14,
  industry: 'Algemeen klusbedrijf'
};
