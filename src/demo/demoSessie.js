// De ingelogde gebruiker van de demo.
//
// In de echte app komen sessie, profiel, bedrijf, rechten en abonnement uit
// auth + een paar databasefuncties. In de demo is er geen login, dus levert dit
// bestand vaste waarden in precies de vorm die App.jsx in zijn Providers zet.
//
// Let op: deze waarden staan in de vorm die de SCHERMEN gebruiken (camelCase),
// niet in databasevorm — App.jsx zet ze rechtstreeks in de context, zonder
// service-mapping ertussen. Dat is een ander formaat dan demoDb.js, en dat is
// geen slordigheid maar volgt de bestaande scheiding.

import { demoDb } from './demoDb.js';

const bedrijf = demoDb.companies[0];
const ik = demoDb.profiles[0];

export const DEMO_USER = {
  id: ik.id,
  email: 'sander@vandijkschilderwerken.nl',
  user_metadata: { full_name: ik.full_name },
};

export const DEMO_SESSION = { user: DEMO_USER, access_token: 'demo', expires_at: 4102444800 };

export const DEMO_PROFILE = {
  id: ik.id,
  companyId: bedrijf.id,
  fullName: ik.full_name,
  email: DEMO_USER.email,
  role: 'admin',
  avatarUrl: null,
  actief: true,
  isSuperAdmin: false,
};

export const DEMO_COMPANY = {
  id: bedrijf.id,
  name: bedrijf.name,
  email: bedrijf.email,
  replyToEmail: bedrijf.reply_to_email,
  phone: bedrijf.phone,
  address: bedrijf.address,
  postalCode: bedrijf.postal_code,
  city: bedrijf.city,
  kvk: bedrijf.kvk,
  btwNumber: bedrijf.btw_number,
  website: bedrijf.website,
  brandingColor: bedrijf.branding_color,
  logoUrl: null,
  tier: 'team',
  status: 'actief',
};

// Alles open: een bezoeker die de demo bekijkt moet elke module kunnen zien,
// inclusief planning en projecten. Geen limieten, geen read-only.
export const DEMO_PLAN_STATUS = {
  tier: 'team',
  trial: false,
  trialDagenOver: null,
  readonly: false,
  status: 'actief',
  modules: ['planning', 'projecten', 'kosten_nacalculatie', 'voertuigen', 'offertes', 'facturen'],
  features: ['planning', 'projecten', 'kosten_nacalculatie', 'voertuigen', 'betaalherinneringen', 'offertes', 'facturen'],
  limieten: {},
};

// De rechtenmatrix verwacht een lijst sleutels. Admin krijgt in de echte app
// alles; hier hetzelfde, zodat geen enkel menu-item wegvalt.
export const DEMO_PERMISSIONS = [
  'verkoop', 'offertes', 'facturen', 'kosten', 'bedrijfsfinancien',
  'planning', 'projecten', 'database', 'team', 'uren', 'materialen',
];
