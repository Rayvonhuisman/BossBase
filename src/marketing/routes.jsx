// Alle openbare websitepagina's op één plek. Deze lijst bepaalt:
//   - welke pagina's scripts/prerender.mjs naar HTML rendert;
//   - wat er in sitemap.xml komt;
//   - title, beschrijving en kruimelpad per pagina;
//   - welke paden MarketingApp zelf afhandelt bij navigatie.
//
// Pagina's laden lui (`load`): een bezoeker haalt alleen de code en tekst op
// van de pagina die hij opent.
//
// Contentpagina's (functies, branches, integraties, kennisbank) komen uit
// src/content/**/*.md; hun title en beschrijving staan in de JSON-kop.


const HOME = { naam: 'Home', pad: '/' };

const PAGINAS = [
  {
    path: '/',
    title: 'BossBase – software voor zzp\'ers en vakbedrijven',
    description: 'Leads, offertes, planning, werkbonnen, uren en facturen op één plek. Gemaakt in Nederland voor vakmensen. Probeer BossBase 14 dagen gratis.',
    src: ['src/pages/marketing/HomePage.jsx'],
    load: () => import('../pages/marketing/HomePage.jsx'),
    schema: ['organisatie', 'website', 'software'],
  },
  {
    path: '/functies',
    title: 'Functies – van lead tot factuur | BossBase',
    description: 'Wat BossBase doet: klantbeheer, offertes, planning, werkbonnen, urenregistratie en facturen, aan elkaar gekoppeld. Bekijk per functie hoe het werkt.',
    src: ['src/pages/marketing/FeaturesPage.jsx'],
    load: () => import('../pages/marketing/FeaturesPage.jsx'),
    breadcrumbs: [HOME, { naam: 'Functies', pad: '/functies' }],
  },
  {
    path: '/prijzen',
    title: 'Prijzen – vanaf € 29 per maand excl. btw | BossBase',
    description: 'Starter € 29, Groei € 39 en Team € 69 per maand (met 1 gebruiker), excl. btw. Maandabonnement maandelijks opzegbaar; jaarabonnement met welkomstactie. Probeer 14 dagen gratis.',
    src: ['src/pages/marketing/PricingPage.jsx'],
    load: () => import('../pages/marketing/PricingPage.jsx'),
    breadcrumbs: [HOME, { naam: 'Prijzen', pad: '/prijzen' }],
    schema: ['software'],
  },
  {
    path: '/voor-wie',
    title: 'Voor wie is BossBase? Zzp\'ers en vakbedrijven | BossBase',
    description: 'BossBase is gemaakt voor vakmensen: installateurs, schilders, hoveniers, aannemers en klusbedrijven. Bekijk per vak hoe je ermee werkt.',
    src: ['src/pages/marketing/IndustriesPage.jsx'],
    load: () => import('../pages/marketing/IndustriesPage.jsx'),
    breadcrumbs: [HOME, { naam: 'Voor wie', pad: '/voor-wie' }],
  },
  {
    path: '/integraties',
    title: 'Koppelingen met Moneybird, SnelStart en Stripe | BossBase',
    description: 'Koppel BossBase aan Moneybird of SnelStart en laat klanten betalen via een Stripe-betaallink. Bekijk per koppeling wat er wordt uitgewisseld.',
    src: ['src/pages/marketing/IntegratiesPage.jsx'],
    load: () => import('../pages/marketing/IntegratiesPage.jsx'),
    breadcrumbs: [HOME, { naam: 'Koppelingen', pad: '/integraties' }],
  },
  {
    path: '/kennisbank',
    title: 'Kennisbank voor vakbedrijven | BossBase',
    description: 'Praktische uitleg over werkbonnen, offertes, planning, uren, facturen en administratie voor zzp\'ers en vakbedrijven. Met voorbeelden en checklists.',
    src: ['src/pages/marketing/KennisbankPage.jsx'],
    load: () => import('../pages/marketing/KennisbankPage.jsx'),
    breadcrumbs: [HOME, { naam: 'Kennisbank', pad: '/kennisbank' }],
  },
  {
    path: '/over',
    title: 'Over BossBase – wie we zijn | BossBase',
    description: 'BossBase is opgericht door Niels Grevink en Rayvon Huisman en wordt in Nederland gebouwd voor vakmensen. Lees waarom en hoe we het maken.',
    src: ['src/pages/marketing/AboutPage.jsx'],
    load: () => import('../pages/marketing/AboutPage.jsx'),
    breadcrumbs: [HOME, { naam: 'Over', pad: '/over' }],
    schema: ['organisatie'],
  },
  {
    path: '/contact',
    title: 'Contact | BossBase',
    description: 'Vragen over BossBase, je proefperiode of je abonnement? Mail ons op info@bossbase.nl; we reageren op werkdagen.',
    src: ['src/pages/marketing/ContactPage.jsx'],
    load: () => import('../pages/marketing/ContactPage.jsx'),
    breadcrumbs: [HOME, { naam: 'Contact', pad: '/contact' }],
  },
  {
    path: '/faq',
    title: 'Veelgestelde vragen over BossBase',
    description: 'Antwoorden over de proefperiode, prijzen, maand- en jaarabonnementen, opzeggen, functies, koppelingen en je gegevens.',
    src: ['src/pages/marketing/FaqPage.jsx'],
    load: () => import('../pages/marketing/FaqPage.jsx'),
    breadcrumbs: [HOME, { naam: 'Veelgestelde vragen', pad: '/faq' }],
  },
  {
    path: '/subverwerkers',
    title: 'Subverwerkers | BossBase',
    description: 'Welke bedrijven gegevens voor BossBase verwerken, waarvoor, waar de gegevens staan en met welke waarborg. Plus de koppelingen die je zelf aanzet.',
    src: ['src/pages/marketing/SubverwerkersPage.jsx'],
    load: () => import('../pages/marketing/SubverwerkersPage.jsx'),
    breadcrumbs: [HOME, { naam: 'Subverwerkers', pad: '/subverwerkers' }],
  },
  {
    path: '/voorwaarden',
    title: 'Algemene voorwaarden | BossBase',
    description: 'De afspraken tussen BossBase en jou als ondernemer: proefperiode, abonnement, betalen, je gegevens, opzeggen en aansprakelijkheid.',
    src: ['src/pages/marketing/juridisch/VoorwaardenPage.jsx'],
    load: () => import('../pages/marketing/juridisch/VoorwaardenPage.jsx'),
    breadcrumbs: [HOME, { naam: 'Algemene voorwaarden', pad: '/voorwaarden' }],
  },
  {
    path: '/privacy',
    title: 'Privacyverklaring | BossBase',
    description: 'Welke gegevens BossBase verwerkt, waarvoor, op welke grondslag en hoe lang, met wie we ze delen en welke rechten je hebt.',
    src: ['src/pages/marketing/juridisch/PrivacyverklaringPage.jsx'],
    load: () => import('../pages/marketing/juridisch/PrivacyverklaringPage.jsx'),
    breadcrumbs: [HOME, { naam: 'Privacyverklaring', pad: '/privacy' }],
  },
  {
    path: '/verwerkersovereenkomst',
    title: 'Verwerkersovereenkomst | BossBase',
    description: 'De verwerkersovereenkomst tussen BossBase en jou als klant: welke gegevens we voor je verwerken, beveiliging, subverwerkers en datalekken.',
    src: ['src/pages/marketing/juridisch/VerwerkersovereenkomstPage.jsx'],
    load: () => import('../pages/marketing/juridisch/VerwerkersovereenkomstPage.jsx'),
    breadcrumbs: [HOME, { naam: 'Verwerkersovereenkomst', pad: '/verwerkersovereenkomst' }],
  },
  {
    path: '/cookieverklaring',
    title: 'Cookiebeleid | BossBase',
    description: 'BossBase zet geen cookies. Wat we meten met Vercel Web Analytics, wat de app in je browser bewaart en waarom er geen cookiebanner is.',
    src: ['src/pages/marketing/juridisch/CookiebeleidPage.jsx'],
    load: () => import('../pages/marketing/juridisch/CookiebeleidPage.jsx'),
    breadcrumbs: [HOME, { naam: 'Cookiebeleid', pad: '/cookieverklaring' }],
  },
];

export const NIET_GEVONDEN = {
  path: '/404',
  title: 'Pagina niet gevonden | BossBase',
  description: 'Deze pagina bestaat niet (meer). Kies hieronder waar je heen wilt.',
  src: ['src/pages/marketing/NotFoundPage.jsx'],
  load: () => import('../pages/marketing/NotFoundPage.jsx'),
  noindex: true,
};

// ── Contentpagina's ──────────────────────────────────────────────────────────
const metas = import.meta.glob('../content/**/*.md', { query: '?meta', eager: true, import: 'default' });
const modules = import.meta.glob('../content/**/*.md');

const SJABLONEN = {
  functie: { src: 'src/marketing/templates/FunctieTemplate.jsx', load: () => import('./templates/FunctieTemplate.jsx') },
  branche: { src: 'src/marketing/templates/LandingTemplate.jsx', load: () => import('./templates/LandingTemplate.jsx') },
  integratie: { src: 'src/marketing/templates/LandingTemplate.jsx', load: () => import('./templates/LandingTemplate.jsx') },
  artikel: { src: 'src/marketing/templates/ArticleTemplate.jsx', load: () => import('./templates/ArticleTemplate.jsx') },
};

const OUDER = {
  functie: { naam: 'Functies', pad: '/functies' },
  branche: { naam: 'Voor wie', pad: '/voor-wie' },
  integratie: { naam: 'Koppelingen', pad: '/integraties' },
  artikel: { naam: 'Kennisbank', pad: '/kennisbank' },
};

function contentRoute(bestand, meta) {
  const sjabloon = SJABLONEN[meta.type];
  if (!sjabloon) throw new Error(`${bestand}: onbekend type "${meta.type}"`);
  // Datums alleen zoals ze in het bestand staan: nooit afgeleid van de build.
  const doc = meta;
  const breadcrumbs = [HOME, OUDER[meta.type], { naam: meta.kruimel, pad: meta.path }];
  return {
    path: meta.path,
    title: meta.title,
    description: meta.description,
    type: meta.type,
    doc,
    src: [bestand.replace('../', 'src/'), sjabloon.src],
    breadcrumbs,
    load: () => Promise.all([modules[bestand](), sjabloon.load()]).then(([mod, tpl]) => {
      const Sjabloon = tpl.default;
      const inhoud = { ...mod.default, meta: doc, kruimels: breadcrumbs };
      return { default: function ContentPagina(props) { return <Sjabloon inhoud={inhoud} {...props} />; } };
    }),
  };
}

const CONTENT = Object.entries(metas)
  .map(([bestand, meta]) => contentRoute(bestand, meta))
  .sort((a, b) => (a.doc.volgorde ?? 99) - (b.doc.volgorde ?? 99));

export const ROUTES = [...PAGINAS, ...CONTENT];

const PER_PAD = new Map(ROUTES.map(r => [r.path, r]));
if (PER_PAD.size !== ROUTES.length) throw new Error('Dubbel pad in routes');

export function normaliseerPad(pathname) {
  const p = (pathname || '/').replace(/\/+$/, '');
  return p === '' ? '/' : p;
}

export function vindRoute(pathname) {
  return PER_PAD.get(normaliseerPad(pathname)) || null;
}

// Metadata per soort, voor overzichtspagina's en "Lees ook"-blokken.
export function contentVanType(type) {
  return CONTENT.filter(r => r.type === type).map(r => r.doc);
}

export function docVoorPad(pad) {
  return PER_PAD.get(pad)?.doc || null;
}

// Laadt de component van een route één keer en onthoudt hem.
const cache = new Map();
export function laadComponent(route) {
  if (!cache.has(route.path)) cache.set(route.path, route.load().then(m => m.default));
  return cache.get(route.path);
}
