// De gratis website: pakketten, prijzen en statussen.
//
// Spiegelt supabase/functions/_shared/website.ts, de kant die rekent en
// afschrijft. Pas je een prijs aan, doe het dan in allebei.

export const PAKKETTEN = [
  {
    key: 'basis', label: 'Basis', omvang: 'Onepager',
    aanmeldPrijs: 0, laterPrijs: 0,
    kort: 'Eén pagina met alles wat een bezoeker moet weten: je diensten, je werk, je werkgebied en een contactformulier.',
    punten: ['1 pagina met al je informatie', 'Teksten schrijven wij', 'Contactformulier naar je BossBase', 'Eén ronde wijzigingen voor livegang'],
    voorbeeld: '/website-voorbeelden/basis.webp',
  },
  {
    key: 'compleet', label: 'Compleet', omvang: "6 pagina's + Google Bedrijfsprofiel",
    aanmeldPrijs: 299, laterPrijs: 595,
    kort: 'Zes pagina’s, met ruimte voor je diensten, je eerdere werk en je werkgebied. Wij richten ook je Google Bedrijfsprofiel in.',
    erft: 'basis',
    punten: ["6 pagina's", 'Eigen pagina voor diensten, werk en werkgebied', 'Google Bedrijfsprofiel ingericht', 'Fotoset met sfeerbeelden'],
    voorbeeld: '/website-voorbeelden/compleet.webp',
    aanbevolen: true,
  },
  {
    key: 'pro', label: 'Pro', omvang: "12 pagina's + Google Bedrijfsprofiel",
    aanmeldPrijs: 499, laterPrijs: 995,
    kort: 'Twaalf pagina’s: alles van Compleet, plus eigen pagina’s voor je belangrijkste diensten en plaatsen.',
    erft: 'compleet',
    punten: ["12 pagina's", 'Eigen pagina voor 3 diensten', 'Eigen pagina voor 3 plaatsen'],
    voorbeeld: '/website-voorbeelden/pro.webp',
  },
];

export const PAKKET_VOLGORDE = PAKKETTEN.map(p => p.key);
export const getPakket = key => PAKKETTEN.find(p => p.key === key) || PAKKETTEN[0];

export const HOSTING_PER_MAAND = 5;
// Domeinnaam en zakelijke e-mail via ons: de prijzen van NG Digital. Lopen als
// regel op het abonnement; geen aanmeldkorting, want het zijn doorlopende kosten.
export const DOMEIN_PER_JAAR = 25;
export const EMAIL_PER_MAAND = 9;
export const TERMIJNEN = 12;

// ── Extra's ──────────────────────────────────────────────────────────────────
// De losse opties van NG Digital. `laterPrijs` is de prijs van NG Digital; bij
// de aanmelding (de intake) geldt `aanmeldPrijs`, net als bij de pakketten.
// `bij` = de pakketten waar je hem kunt kiezen; een extra die al in het pakket
// zit (Google Bedrijfsprofiel en de fotoset bij Compleet en Pro) staat daar
// niet bij.
// `perStuk` = er kan een aantal bij, tot `maximum`.
export const EXTRAS = [
  { key: 'fotoset', label: 'Fotoset voor je site', aanmeldPrijs: 25, laterPrijs: 50, bij: ['basis'],
    uitleg: 'Sfeerbeelden voor de bovenkant van je site en bij je diensten, door ons gemaakt met AI. Handig als je zelf weinig bruikbare foto’s hebt. Bij Eerder werk horen altijd foto’s van je eigen werk. Bij Compleet en Pro zit dit er al bij.' },
  { key: 'google_profiel', label: 'Google Bedrijfsprofiel', aanmeldPrijs: 49, laterPrijs: 95, bij: ['basis'],
    uitleg: 'We zetten je bedrijfsprofiel op Google op, of maken je bestaande profiel compleet. Bij Compleet en Pro zit dit er al bij.' },
  { key: 'logo', label: 'Logo-ontwerp', aanmeldPrijs: 39, laterPrijs: 75, bij: ['basis', 'compleet', 'pro'],
    uitleg: 'We ontwerpen een logo als je er nog geen hebt, of maken je bestaande logo geschikt voor je site.' },
  { key: 'extra_pagina', label: 'Extra pagina', aanmeldPrijs: 49, laterPrijs: 95, bij: ['compleet', 'pro'], perStuk: true, maximum: 10,
    uitleg: 'Een extra pagina naar keuze, bijvoorbeeld voor een dienst of voor veelgestelde vragen.' },
  { key: 'whatsapp', label: 'WhatsApp-knop', aanmeldPrijs: 19, laterPrijs: 35, bij: ['basis', 'compleet', 'pro'],
    uitleg: 'Een knop waarmee bezoekers je direct appen. Ze sturen dan makkelijk een foto van de klus mee.' },
];
export const getExtra = key => EXTRAS.find(e => e.key === key) || null;
export const extrasVoor = pakket => EXTRAS.filter(e => e.bij.includes(pakket));

/** Alleen geldige extra's met een geldig aantal, voor dit pakket. */
export function schoneExtras(extras, pakket) {
  const uit = {};
  for (const e of extrasVoor(pakket)) {
    const n = Math.floor(Number(extras?.[e.key]) || 0);
    if (n > 0) uit[e.key] = e.perStuk ? Math.min(n, e.maximum || 10) : 1;
  }
  return uit;
}

/** Wat de gekozen extra's samen kosten. */
export const extrasPrijs = (extras, pakket, bijAanmelding) =>
  Object.entries(schoneExtras(extras, pakket))
    .reduce((t, [k, n]) => t + n * (bijAanmelding ? getExtra(k).aanmeldPrijs : getExtra(k).laterPrijs), 0);

/** Wat een upgrade kost: bij de aanmelding de aanmeldprijs, daarna de latere. */
export function upgradePrijs(van, naar, bijAanmelding) {
  const i = PAKKET_VOLGORDE.indexOf(van);
  const j = PAKKET_VOLGORDE.indexOf(naar);
  if (j <= i) return 0;
  const a = getPakket(van), b = getPakket(naar);
  return bijAanmelding ? b.aanmeldPrijs - a.aanmeldPrijs : b.laterPrijs - a.laterPrijs;
}

/** Bedrag per maand bij betalen in termijnen, afgerond op centen. */
export const perTermijn = bedrag => Math.round((bedrag / TERMIJNEN) * 100) / 100;

export const STATUSSEN = [
  { key: 'wacht_op_intake',  label: 'Wacht op je intake', uitleg: 'Vul de intake in, dan gaan wij aan de slag.' },
  { key: 'intake_ontvangen', label: 'Intake ontvangen',   uitleg: 'We hebben je intake. We kijken hem door en beginnen met bouwen.' },
  { key: 'in_bouw',          label: 'In bouw',            uitleg: 'We bouwen je site.' },
  { key: 'ter_beoordeling',  label: 'Ter beoordeling',    uitleg: 'Bekijk je site en geef je wijzigingen in één keer door.' },
  { key: 'live',             label: 'Live',               uitleg: 'Je site staat online.' },
];
export const statusInfo = key => STATUSSEN.find(s => s.key === key)
  || (key === 'geannuleerd' ? { key, label: 'Geannuleerd', uitleg: 'Deze aanvraag is gestopt.' } : { key, label: key, uitleg: '' });

export const euroBedrag = n => {
  const v = Number(n) || 0;
  return `€ ${v.toLocaleString('nl-NL', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 })}`;
};
