// Het websiteformulier van het eigen bedrijf (Instellingen › Websiteformulier).
//
// Het formulier is een rij in website_forms. Lezen en wijzigen gaat via twee
// RPC's (migratie 20261005183127), niet via de tabel: in settings staan ook
// sleutels die een bedrijf niet zelf mag zetten. Binnenkomen doet een aanvraag
// via de edge function public-website-inquiry, net als bij bossbase.nl.
import { supabase } from '../lib/supabase.js';

export const AANVRAAG_ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-website-inquiry`;

// Het script en het formulier staan op de website van BossBase, ook als je de
// app lokaal draait: de code die een klant plakt moet altijd naar productie.
export const SCRIPT_URL = 'https://www.bossbase.nl/formulier.js';
export const FORMULIER_PAGINA = 'https://www.bossbase.nl/aanvraagformulier';

// De velden waar een aanvraag in BossBase uit bestaat. `vast` = staat altijd in
// het kant-en-klare formulier; de rest kan de ondernemer aan- of uitzetten.
export const BOSSBASE_VELDEN = [
  { key: 'name',           label: 'Naam',                    vast: true },
  { key: 'email',          label: 'E-mailadres',             vast: true },
  { key: 'phone',          label: 'Telefoonnummer' },
  { key: 'address',        label: 'Adres (straat en huisnummer)' },
  { key: 'postcode',       label: 'Postcode' },
  { key: 'city',           label: 'Plaats' },
  { key: 'message',        label: 'Omschrijving van de aanvraag', vast: true },
  { key: 'gewenste_datum', label: 'Gewenste datum' },
  { key: 'fotos',          label: "Foto's" },
];
export const veldLabel = key => BOSSBASE_VELDEN.find(v => v.key === key)?.label || key;

// Soorten eigen velden in het kant-en-klare formulier.
export const EIGEN_SOORTEN = [
  { key: 'tekst', label: 'Tekst' },
  { key: 'getal', label: 'Getal' },
  { key: 'keuze', label: 'Keuze uit opties' },
  { key: 'janee', label: 'Ja/nee' },
  { key: 'datum', label: 'Datum' },
];

/** Een nieuw eigen veld; het id blijft gelijk als de naam later verandert. */
export const nieuwEigenVeld = () => ({
  id: `v${Math.random().toString(36).slice(2, 10)}`,
  naam: '', soort: 'tekst', opties: [], verplicht: false,
});

const BOSSBASE_HOST = /^(www\.)?bossbase\.nl$/i;
export const isBossBasePagina = url => {
  try { return BOSSBASE_HOST.test(new URL(url).hostname); } catch { return false; }
};

/** "mijnbedrijf.nl/contact" → "https://mijnbedrijf.nl/contact"; onzin → null. */
export function naarPaginaUrl(invoer) {
  const t = String(invoer || '').trim();
  if (!t) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    return /\.[a-z]{2,}$/i.test(u.hostname) ? u.href : null;
  } catch {
    return null;
  }
}

const naarFormulier = r => r && ({
  id: r.id,
  token: r.token,
  actief: r.actief !== false,
  domeinen: Array.isArray(r.domeinen) ? r.domeinen : [],
  modus: r.modus === 'koppelen' ? 'koppelen' : 'kant_en_klaar',
  velden: Array.isArray(r.velden) ? r.velden : [],
  koppeling: Array.isArray(r.koppeling) ? r.koppeling : [],
  eigenVelden: Array.isArray(r.eigen_velden) ? r.eigen_velden : [],
  privacyUrl: r.privacy_url || '',
  paginaUrl: r.pagina_url || '',
});

/**
 * Het formulier van het eigen bedrijf. Met `aanmaken: false` komt er null
 * terug als er (nog) geen formulier is; dan toont de pagina een knop om er een
 * in te stellen, in plaats van stilletjes een nieuw formulier te maken.
 */
export async function haalWebsiteformulier({ aanmaken = true } = {}) {
  const { data, error } = await supabase.rpc('bb_websiteformulier', { p_aanmaken: aanmaken });
  if (error) throw error;
  return naarFormulier(data);
}

/**
 * Haalt het formulier weg. De code op de website werkt daarna niet meer;
 * aanvragen die al binnen zijn, blijven staan (migratie 20261006101847).
 */
export async function verwijderWebsiteformulier() {
  const { error } = await supabase.rpc('bb_websiteformulier_verwijderen');
  if (error) throw error;
}

export async function slaWebsiteformulierOp(f) {
  const { data, error } = await supabase.rpc('bb_websiteformulier_opslaan', {
    p_actief: f.actief,
    p_domeinen: f.domeinen,
    p_modus: f.modus,
    p_velden: f.velden,
    p_koppeling: f.koppeling
      .filter(k => k.veld?.trim() && k.doel)
      .map(k => (k.doel === 'eigen'
        ? { veld: k.veld.trim(), doel: 'eigen', naam: (k.naam || '').trim() }
        : { veld: k.veld.trim(), doel: k.doel })),
    p_privacy_url: f.privacyUrl?.trim() || null,
    p_eigen_velden: f.eigenVelden.map(v => ({
      id: v.id, naam: (v.naam || '').trim(), soort: v.soort, verplicht: !!v.verplicht,
      opties: v.soort === 'keuze' ? (v.opties || []).map(o => o.trim()).filter(Boolean) : [],
    })),
    p_pagina_url: f.paginaUrl?.trim() || null,
  });
  if (error) throw error;
  return naarFormulier(data);
}

/**
 * Van wat iemand intypt naar origins zoals de browser ze meestuurt.
 * "mijnbedrijf.nl" → https://mijnbedrijf.nl én https://www.mijnbedrijf.nl,
 * want dat zijn voor de browser twee verschillende herkomsten.
 */
export function naarDomeinen(invoer) {
  const uit = [];
  const fouten = [];
  for (const ruw of String(invoer || '').split(/[\s,;]+/).map(s => s.trim()).filter(Boolean)) {
    let u;
    try {
      u = new URL(/^https?:\/\//i.test(ruw) ? ruw : `https://${ruw}`);
    } catch {
      fouten.push(ruw);
      continue;
    }
    if (!/\.[a-z]{2,}$/i.test(u.hostname) && u.hostname !== 'localhost') { fouten.push(ruw); continue; }
    const host = u.hostname.toLowerCase();
    const poort = u.port ? `:${u.port}` : '';
    const kaal = host.replace(/^www\./, '');
    const varianten = host === 'localhost' || /^[^.]+\.[^.]+\.[^.]+/.test(kaal) && !host.startsWith('www.')
      ? [host]                          // subdomein (shop.voorbeeld.nl) of localhost: precies dat
      : [kaal, `www.${kaal}`];
    for (const h of varianten) {
      const o = `${u.protocol}//${h}${poort}`;
      if (!uit.includes(o)) uit.push(o);
    }
  }
  return { domeinen: uit, fouten };
}

/** Wat de ondernemer in zijn website plakt. */
export function insluitcode(token, modus) {
  if (modus === 'koppelen') {
    return `<script src="${SCRIPT_URL}" data-bossbase-koppelen="${token}" async></script>`;
  }
  return `<div data-bossbase-formulier="${token}"></div>\n<script src="${SCRIPT_URL}" async></script>`;
}

export const formulierLink = token => `${FORMULIER_PAGINA}?f=${encodeURIComponent(token)}`;

/**
 * Raadt bij een veld van een bestaand formulier het BossBase-veld, op naam en
 * label. Alleen een voorstel; de ondernemer kiest zelf.
 */
export function stelDoelVoor({ naam = '', soort = '', label = '' }) {
  const t = `${naam} ${label}`.toLowerCase();
  if (soort === 'file') return 'fotos';
  // Een vinkje of keuzelijst ("Ik ga akkoord…", "Soort dak") is nooit naam,
  // adres of omschrijving, ook al staat zo'n woord in het label.
  if (soort === 'checkbox' || soort === 'radio' || soort === 'select') return '';
  if (soort === 'email' || /e-?mail/.test(t)) return 'email';
  if (soort === 'tel' || /telefoon|phone|mobiel|\btel\b/.test(t)) return 'phone';
  if (/postcode|postal|\bzip\b/.test(t)) return 'postcode';
  if (/plaats|woonplaats|\bcity\b|\bstad\b/.test(t)) return 'city';
  if (/adres|address|straat|street|huisnummer/.test(t)) return 'address';
  if (soort === 'date' || /datum|date|wanneer|planning/.test(t)) return 'gewenste_datum';
  if (soort === 'textarea' || /bericht|message|omschrijving|vraag|toelichting|opmerking|beschrijving/.test(t)) return 'message';
  if (/naam|name/.test(t) && !/bedrijf|company/.test(t)) return 'name';
  return '';
}

// Wat er mis kan gaan bij "Velden ophalen", in gewone taal en met wat je dan
// kunt doen. De codes komen uit de edge function websiteformulier-velden.
function ophaalMelding(d) {
  const zelf = 'Vul de veldnamen dan zelf in met "Veld toevoegen", of gebruik het kant-en-klare formulier.';
  switch (d?.fout) {
    case 'ongeldige_url':
      return 'Dit is geen webadres. Typ het adres van de pagina met je formulier, bijvoorbeeld mijnbedrijf.nl/contact.';
    case 'domein_niet_opgegeven':
      return 'Deze pagina hoort niet bij een van je websites. Voeg het adres van je website toe bij stap 1.';
    case 'niet_bereikbaar':
      return `We kunnen deze website niet bereiken. Klopt het adres? Open het in je browser en kopieer het adres van daaruit. ${zelf}`;
    case 'te_traag':
      return `Je website reageerde niet binnen 10 seconden. Probeer het over een minuut opnieuw. ${zelf}`;
    case 'niet_gevonden':
      return 'Deze pagina bestaat niet (fout 404). Ga in je browser naar de pagina met je formulier en kopieer het adres uit de adresbalk.';
    case 'geblokkeerd':
      return `De beveiliging van je website laat ons de pagina niet lezen${d.status ? ` (fout ${d.status})` : ''}. Dat is niet erg: het formulier werkt straks wel. ${zelf}`;
    case 'geen_html':
      return 'Dit adres is geen webpagina, maar bijvoorbeeld een pdf of afbeelding. Gebruik het adres van de pagina met je formulier.';
    case 'doorverwijzing_buiten_domein':
      return 'Deze pagina stuurt door naar een andere website. Open hem in je browser en gebruik het adres waar je uiteindelijk uitkomt.';
    case 'te_veel_doorverwijzingen':
      return `Deze pagina blijft doorverwijzen en laadt niet. ${zelf}`;
    case 'geen_formulier':
      if (d.bouwer === 'wix') {
        return 'Op deze pagina vinden we geen formulier. Wix bouwt formulieren pas in de browser op en laat geen koppeling toe. Gebruik bij Wix het kant-en-klare formulier.';
      }
      return `Op deze pagina staat geen formulier dat we kunnen lezen. Misschien staat het op een andere pagina, of wordt het pas later geladen (bijvoorbeeld in een pop-up). ${zelf}`;
    case 'geen_toegang':
      return 'Je hebt geen recht om het websiteformulier te beheren.';
    case 'niet_ingelogd':
      return 'Je sessie is verlopen. Log opnieuw in en probeer het nog eens.';
    case 'ophalen_mislukt':
      return `Je website gaf een foutmelding${d.status ? ` (${d.status})` : ''}. Probeer het straks opnieuw. ${zelf}`;
    default:
      return `De pagina kon niet worden gelezen. ${zelf}`;
  }
}

/** Leest de velden van de formulieren op een pagina van de eigen website. */
export async function leesVeldenVanSite(url) {
  const { data, error } = await supabase.functions.invoke('websiteformulier-velden', { body: { url } });
  if (error) {
    // Bij een andere status dan 200 zit het antwoord in error.context.
    const body = await error.context?.json?.().catch(() => null);
    if (body?.fout) throw new Error(ophaalMelding(body));
    throw new Error('Geen verbinding met BossBase. Controleer je internet en probeer het opnieuw.');
  }
  if (!data?.ok) throw new Error(ophaalMelding(data));
  return data.formulieren || [];
}

/**
 * Stuurt een testaanvraag langs precies dezelfde weg als een bezoeker, maar
 * met je eigen sessie: dan hoeft de app niet op je domeinlijst te staan, en is
 * het altijd een testaanvraag. Geeft het id van de deal terug.
 */
export async function verstuurTestaanvraag(token, velden, eigen = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Je bent niet ingelogd.');
  const gegevens = {
    form_token: token,
    name: 'Test Aanvraag',
    email: 'testaanvraag@voorbeeld.nl',
    message: 'Dit is een testaanvraag vanuit Instellingen › Websiteformulier. Je kunt hem verwijderen.',
    privacy_akkoord: true,
    privacy_versie: 'test',
    is_test: true,
    submission_id: crypto.randomUUID(),
    eigen,
  };
  if (velden.includes('phone')) gegevens.phone = '06 12345678';
  if (velden.includes('address')) gegevens.address = 'Teststraat 1';
  if (velden.includes('postcode')) gegevens.postcode = '1234 AB';
  if (velden.includes('city')) gegevens.city = 'Teststad';
  if (velden.includes('gewenste_datum')) {
    const d = new Date(Date.now() + 14 * 864e5);
    gegevens.gewenste_datum = d.toISOString().slice(0, 10);
  }
  const res = await fetch(AANVRAAG_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(gegevens),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    throw new Error({
      formulier_onbekend: 'Het formulier staat uit. Zet het aan en sla op.',
      te_veel_pogingen: 'Even te veel tests achter elkaar. Probeer het over een paar minuten opnieuw.',
      herkomst_niet_toegestaan: 'Je hebt geen recht om dit formulier te testen.',
    }[body.fout] || 'De testaanvraag kon niet worden verstuurd.');
  }
  return body.deal_id || null;
}
