import React from 'react';

// ── ICONS ───────────────────────────────────────────────────
export const I = {
  dash:     <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="8" height="8" rx="2" fill="currentColor" opacity=".35"/><rect x="13" y="3" width="8" height="8" rx="2" fill="currentColor" opacity=".6"/><rect x="3" y="13" width="8" height="8" rx="2" fill="currentColor" opacity=".6"/><rect x="13" y="13" width="8" height="8" rx="2" fill="currentColor"/></svg>,
  pipe:     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="4" height="14" rx="1"/><rect x="9" y="5" width="4" height="10" rx="1"/><rect x="16" y="5" width="4" height="6" rx="1" fill="currentColor" fillOpacity=".3"/></svg>,
  cust:     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/><path d="M16 3.13a4 4 0 010 7.75M21 21v-2a4 4 0 00-3-3.87" strokeLinecap="round"/></svg>,
  act:      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" strokeLinecap="round" strokeWidth="2.5"/></svg>,
  quotes:   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8M16 17H8M10 9H8" strokeLinecap="round"/></svg>,
  cal:      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  wo:       <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>,
  hours:    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2" strokeLinecap="round"/></svg>,
  costs:    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72 1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/><circle cx="12" cy="12" r="4"/></svg>,
  revenue:  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" strokeLinecap="round"/></svg>,
  team:     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" strokeLinecap="round"/></svg>,
  settings: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72 1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" strokeLinecap="round"/></svg>,
  logout:   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  plus:     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>,
  x:        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round"/></svg>,
  search:   <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35" strokeLinecap="round"/></svg>,
  bell:     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" strokeLinecap="round"/></svg>,
  menu:     <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18" strokeLinecap="round"/></svg>,
  chev_r:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  chev_l:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  chev_d:   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" strokeLinecap="round"/></svg>,
  check:    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  call:     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.8 19.79 19.79 0 01.99 1.18 2 2 0 013 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L7.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z"/></svg>,
  mail:     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
  map:      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  euro:     <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 4a8 8 0 100 16M3 9h11M3 15h11" strokeLinecap="round"/></svg>,
  brief:    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="7" width="20" height="15" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" strokeLinecap="round"/></svg>,
  clock:    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l3 3" strokeLinecap="round"/></svg>,
  trend:    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 7l-9 9-4-4-6 6" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  edit:     <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  trash:    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>,
  eye:      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  arrow_r:  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round"/></svg>,
  flag:     <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7"/></svg>,
  paperclip:<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>,
  img:      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
  note:     <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  route:    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="5" cy="6" r="2"/><path d="M7 6h6a2 2 0 012 2v8a2 2 0 002 2h2M7 18h2"/><circle cx="10" cy="18" r="2"/><circle cx="19" cy="18" r="2"/></svg>,
  camera:   <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>,
  google:   <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>,
};

// ── DATA ────────────────────────────────────────────────────
export const CUSTOMERS_DATA = [
  { id: 1, name: 'Pieter Jansen',  company: 'Jansen Schilderwerken',  email: 'pieter@jansen.nl',    phone: '06-11223344', city: 'Zwolle',    source: 'Website',     type: 'Zakelijk',    av: 0, stage: 'quote_sent',   total: 3850,  paid: 0,    costs: 1200, jobs: 2 },
  { id: 2, name: 'Henk de Boer',   company: 'De Boer Tuinen',         email: 'henk@deboer.nl',      phone: '06-22334455', city: 'Groningen', source: 'Aanbeveling', type: 'Zakelijk',    av: 1, stage: 'approved',     total: 5200,  paid: 2600, costs: 1800, jobs: 3 },
  { id: 3, name: 'Frank van Dijk', company: 'Privé',                  email: 'f.vandijk@gmail.com', phone: '06-33445566', city: 'Hardenberg',source: 'Website',     type: 'Particulier', av: 2, stage: 'in_progress', total: 2400,  paid: 0,    costs: 900,  jobs: 1 },
  { id: 4, name: 'Marieke Meijer', company: 'Privé',                  email: 'm.meijer@hotmail.com',phone: '06-44556677', city: 'Assen',     source: 'WhatsApp',   type: 'Particulier', av: 3, stage: 'planned',      total: 4100,  paid: 4100, costs: 1500, jobs: 2 },
  { id: 5, name: 'Sander Bakker',  company: 'Bakker Vastgoed',        email: 'sander@bakker.nl',    phone: '06-55667788', city: 'Emmen',     source: 'Google',     type: 'Zakelijk',    av: 4, stage: 'new_lead',     total: 1850,  paid: 0,    costs: 0,    jobs: 0 },
  { id: 6, name: 'VvE Parkzicht',  company: 'VvE Parkzicht',          email: 'beheer@parkzicht.nl', phone: '050-1234567', city: 'Groningen', source: 'Aanbeveling', type: 'Zakelijk',    av: 5, stage: 'completed',    total: 12600, paid:12600, costs: 4200, jobs: 6 },
];

export const PIPELINE_STAGES = [
  { id: 'new_lead',    label: 'Nieuwe lead',       col: 'b-new' },
  { id: 'contact',     label: 'Contact nodig',     col: 'b-orange' },
  { id: 'info_done',   label: 'Info compleet',     col: 'b-blue' },
  { id: 'quote_make',  label: 'Offerte maken',     col: 'b-blue' },
  { id: 'quote_sent',  label: 'Offerte verstuurd', col: 'b-orange' },
  { id: 'waiting',     label: 'Wacht op akkoord',  col: 'b-orange' },
  { id: 'approved',    label: 'Akkoord',           col: 'b-green' },
  { id: 'planned',     label: 'Gepland',           col: 'b-planned' },
  { id: 'in_progress', label: 'In uitvoering',     col: 'b-progress' },
  { id: 'completed',   label: 'Afgerond',          col: 'b-done' },
  { id: 'paid',        label: 'Betaald / Gesloten',col: 'b-accepted' },
  { id: 'lost',        label: 'Verloren',          col: 'b-lost' },
];

export const DEALS = [
  { id: 1, custId: 1, stage: 'quote_sent',  title: 'Schilderwerk gevel + kozijnen',   city: 'Zwolle',     value: 3850, priority: 'high', nextAct: 'Bel na over offerte', nextDate: 'Vandaag', notes: 2, files: 1, acts: 3 },
  { id: 2, custId: 2, stage: 'approved',    title: 'Tuinonderhoud abonnement',         city: 'Groningen',  value: 5200, priority: 'med',  nextAct: 'Planning bevestigen', nextDate: '5 mei',  notes: 4, files: 2, acts: 5 },
  { id: 3, custId: 3, stage: 'in_progress', title: 'Schutting plaatsen + behandelen', city: 'Hardenberg', value: 2400, priority: 'med',  nextAct: 'Uren registreren',    nextDate: 'Morgen', notes: 1, files: 3, acts: 2 },
  { id: 4, custId: 4, stage: 'planned',     title: 'Badkamer renovatie',              city: 'Assen',      value: 4100, priority: 'high', nextAct: 'Materiaallijst check',nextDate: '6 mei',  notes: 3, files: 5, acts: 4 },
  { id: 5, custId: 5, stage: 'new_lead',    title: 'Kozijnen schilderen',             city: 'Emmen',      value: 1850, priority: 'low',  nextAct: 'Eerste contact',      nextDate: 'Vandaag',notes: 0, files: 0, acts: 0 },
  { id: 6, custId: 6, stage: 'completed',   title: 'Tuinonderhoud Q2 2026',           city: 'Groningen',  value:12600, priority: 'low',  nextAct: 'Factuur sturen',      nextDate: '3 mei',  notes: 6, files: 8, acts: 9 },
  { id: 7, custId: 1, stage: 'new_lead',    title: 'Dakgoot vervangen',               city: 'Zwolle',     value:  920, priority: 'low',  nextAct: 'Terugbellen',         nextDate: 'Morgen', notes: 0, files: 0, acts: 1 },
  { id: 8, custId: 2, stage: 'quote_make',  title: 'Terras aanleggen',                city: 'Groningen',  value: 3200, priority: 'med',  nextAct: 'Offerte opmaken',     nextDate: '4 mei',  notes: 1, files: 0, acts: 2 },
];

export const ACTIVITIES_DATA = [
  { id: 1, type: 'call',   title: 'Bel Jansen na over offerte gevel',  custId: 1, date: '2026-05-03', time: '10:00', status: 'today',   prio: 'high', assignee: 'Marco' },
  { id: 2, type: 'follow', title: 'Offerte opvolgen – De Boer tuinen', custId: 2, date: '2026-05-03', time: '11:00', status: 'today',   prio: 'med',  assignee: 'Marco' },
  { id: 3, type: 'visit',  title: 'Opname schutting Van Dijk',         custId: 3, date: '2026-05-04', time: '09:00', status: 'open',    prio: 'med',  assignee: 'Marco' },
  { id: 4, type: 'email',  title: 'Offerte versturen naar Bakker',     custId: 5, date: '2026-05-03', time: '14:00', status: 'today',   prio: 'high', assignee: 'Marco' },
  { id: 5, type: 'task',   title: 'Kosten toevoegen badkamer Meijer',  custId: 4, date: '2026-04-30', time: '09:00', status: 'overdue', prio: 'high', assignee: 'Marco' },
  { id: 6, type: 'call',   title: 'VvE Parkzicht – factuur navragen',  custId: 6, date: '2026-05-03', time: '15:30', status: 'today',   prio: 'med',  assignee: 'Marco' },
  { id: 7, type: 'visit',  title: 'Klus start Bakker – kozijnen Emmen',custId: 5, date: '2026-05-07', time: '08:00', status: 'open',    prio: 'med',  assignee: 'Remco' },
  { id: 8, type: 'task',   title: 'Materiaallijst check Meijer',       custId: 4, date: '2026-05-06', time: '10:00', status: 'open',    prio: 'med',  assignee: 'Marco' },
];

export const QUOTES_DATA = [
  { id: 'BB-001', custId: 1, title: 'Schilderwerk gevel + kozijnen',   amount: 3850,  status: 'sent',     date: '28 apr 2026', valid: '12 mei 2026' },
  { id: 'BB-002', custId: 2, title: 'Tuinonderhoud abonnement 2026',   amount: 5200,  status: 'accepted', date: '20 apr 2026', valid: '—' },
  { id: 'BB-003', custId: 3, title: 'Schutting plaatsen + behandelen', amount: 2400,  status: 'accepted', date: '15 apr 2026', valid: '—' },
  { id: 'BB-004', custId: 4, title: 'Badkamer renovatie volledig',      amount: 4100,  status: 'accepted', date: '10 apr 2026', valid: '—' },
  { id: 'BB-005', custId: 5, title: 'Kozijnen schilderen 6 stuks',     amount: 1850,  status: 'draft',    date: '1 mei 2026',  valid: '15 mei 2026' },
  { id: 'BB-006', custId: 6, title: 'Tuinonderhoud Q2 2026',           amount:12600,  status: 'accepted', date: '1 jan 2026',  valid: '—' },
];

export const COSTS_DATA = [
  { id: 1, custId: 1, cat: 'materiaal',  desc: 'Buitenverf + primers',          amt: 380,  date: '29 apr 2026' },
  { id: 2, custId: 1, cat: 'materiaal',  desc: 'Kwasten, afplaktape',            amt: 65,   date: '29 apr 2026' },
  { id: 3, custId: 1, cat: 'arbeid',     desc: 'Eigen uren (12u × €55)',         amt: 660,  date: '30 apr 2026' },
  { id: 4, custId: 1, cat: 'reiskosten', desc: 'Reiskosten 4× Zwolle',           amt: 96,   date: '30 apr 2026' },
  { id: 5, custId: 2, cat: 'materiaal',  desc: 'Plantenvoeding, mulch',          amt: 180,  date: '25 apr 2026' },
  { id: 6, custId: 2, cat: 'arbeid',     desc: 'Uren tuinonderhoud (18u × €45)',amt: 810,  date: '26 apr 2026' },
  { id: 7, custId: 3, cat: 'materiaal',  desc: 'Houten planken + palen',         amt: 640,  date: '16 apr 2026' },
  { id: 8, custId: 3, cat: 'arbeid',     desc: 'Uren plaatsen (8u × €55)',       amt: 440,  date: '20 apr 2026' },
  { id: 9, custId: 4, cat: 'materiaal',  desc: 'Tegels, cement, sanitair',       amt: 1100, date: '12 apr 2026' },
  { id:10, custId: 4, cat: 'arbeid',     desc: 'Eigen uren (16u × €55)',         amt: 880,  date: '18 apr 2026' },
];

export const HOURS_DATA = [
  { id: 1, emp: 'Marco', custId: 1, date: '30 apr', start: '07:30', end: '15:30', hrs: 7.5, type: 'arbeid', note: 'Voorwerk gevel' },
  { id: 2, emp: 'Marco', custId: 1, date: '1 mei',  start: '07:30', end: '16:00', hrs: 8,   type: 'arbeid', note: 'Schilderen gevel dag 1' },
  { id: 3, emp: 'Remco', custId: 2, date: '28 apr', start: '08:00', end: '14:00', hrs: 5.5, type: 'arbeid', note: 'Gazon maaien + randen' },
  { id: 4, emp: 'Marco', custId: 3, date: '18 apr', start: '08:30', end: '17:00', hrs: 8,   type: 'arbeid', note: 'Schutting plaatsen' },
  { id: 5, emp: 'Marco', custId: 4, date: '14 apr', start: '07:00', end: '15:30', hrs: 8,   type: 'arbeid', note: 'Sloopwerk badkamer' },
  { id: 6, emp: 'Remco', custId: 4, date: '15 apr', start: '08:00', end: '16:00', hrs: 7.5, type: 'arbeid', note: 'Tegelen vloer' },
];

export const TEAM_DATA = [
  { id: 1, name: 'Marco Veldhuis', role: 'Admin',     email: 'marco@veldhuis.nl', phone: '06-98765432', av: 0, hoursWeek: 38.5, assignedJobs: 4 },
  { id: 2, name: 'Remco Smit',     role: 'Medewerker',email: 'remco@veldhuis.nl', phone: '06-87654321', av: 1, hoursWeek: 24,   assignedJobs: 2 },
];

export const CAL_EVENTS = [
  { id: 1, type: 'job',      title: 'Schilderwerk Jansen',    custId: 1, date: '2026-05-03', time: '07:30', end: '16:00', color: '#fff4ec', textColor: '#e8784a' },
  { id: 2, type: 'activity', title: 'Bel Jansen',             custId: 1, date: '2026-05-03', time: '10:00', end: '10:30', color: '#eff6ff', textColor: '#2563eb' },
  { id: 3, type: 'visit',    title: 'Opname Van Dijk',        custId: 3, date: '2026-05-04', time: '09:00', end: '10:30', color: '#fff8f4', textColor: '#e8784a' },
  { id: 4, type: 'job',      title: 'Badkamer Meijer',        custId: 4, date: '2026-05-06', time: '07:30', end: '17:00', color: '#fff4ec', textColor: '#e8784a' },
  { id: 5, type: 'activity', title: 'Offerte Bakker',         custId: 5, date: '2026-05-03', time: '14:00', end: '15:00', color: '#eff6ff', textColor: '#2563eb' },
  { id: 6, type: 'job',      title: 'VvE Parkzicht – tuinen', custId: 6, date: '2026-05-07', time: '08:00', end: '15:00', color: '#fff4ec', textColor: '#e8784a' },
  { id: 7, type: 'visit',    title: 'Kozijnen opmeten Bakker',custId: 5, date: '2026-05-08', time: '10:00', end: '11:30', color: '#fff8f4', textColor: '#e8784a' },
];

// ── HELPERS ─────────────────────────────────────────────────
export const initials = n => n.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
export const fmt = n => '€' + Number(n).toLocaleString('nl-NL');
export const custById = id => CUSTOMERS_DATA.find(c => c.id === id);
export const stageLabel = id => (PIPELINE_STAGES.find(s => s.id === id) || {}).label || id;
export const stageCol   = id => (PIPELINE_STAGES.find(s => s.id === id) || {}).col   || 'b-gray';

// ── SHARED COMPONENTS ───────────────────────────────────────
const AV_COLORS = ['av-0','av-1','av-2','av-3','av-4','av-5'];

export function Av({ name, size = 'md', idx = 0 }) {
  return <div className={`av av-${size} ${AV_COLORS[idx % 6]}`}>{initials(name)}</div>;
}

export function StatusBadge({ status }) {
  const map = {
    draft: ['b-draft','Concept'], sent: ['b-sent','Verzonden'], viewed: ['b-viewed','Bekeken'],
    accepted: ['b-accepted','Geaccepteerd'], declined: ['b-declined','Afgewezen'],
    expired: ['b-expired','Verlopen'], paid: ['b-paid','Betaald'],
    open: ['b-open','Open'], overdue: ['b-overdue','Te laat'],
    today: ['b-today','Vandaag'], planned: ['b-planned','Gepland'],
    in_progress: ['b-progress','In uitvoering'], completed: ['b-done','Afgerond'],
    done: ['b-done','Klaar'], lost: ['b-lost','Verloren'], new_lead: ['b-new','Nieuwe lead'],
  };
  const [cls, lbl] = map[status] || ['b-gray', status];
  return <span className={`badge ${cls}`}>{lbl}</span>;
}

export function Logo({ dark }) {
  return (
    <span className="logo">
      <span className="logo-b">Boss</span>
      <span className={`logo-a${dark ? ' logo--w' : ''}`}>Base</span>
      <span className="logo-bar" />
    </span>
  );
}

export function ModalX({ onClose }) {
  return <button className="modal-x" onClick={onClose}>{I.x}</button>;
}
