// Wat een klant invult in de intake van de gratis website.
//
// Overgenomen uit de intake van NG Digital (src/lib/intake/velden.ts). De naam
// van elk veld is de sleutel uit het contentbestand van een klantsite, zoals
// `bedrijf.naam` of `diensten.items[0].titel`. Zo is een inzending later om te
// zetten zonder vertaaltabel.
//
// Herhalende onderdelen krijgen `[i]` in hun naam; bij het invullen wordt dat
// het rijnummer.
//
// Wat er gevraagd wordt hangt af van de keuze in stap 2 (`keuze`: pakket,
// extra's, domein, e-mail), zoals bij NG Digital:
//   alleenBij: ['compleet','pro']  → alleen bij die pakketten
//   als: k => …                    → alleen als de keuze dat vraagt, bijvoorbeeld
//                                    geen dienstfoto's als je de fotoset neemt
//   aantal: k => n                 → bij een herhaling: precies zoveel rijen
//                                    (extra pagina's, plaatspagina's)
//
// Bewust weggelaten ten opzichte van NG Digital: elke belofte over Google,
// vindbaarheid of zoekwoorden. Wat we technisch en voor zoekmachines doen, werkt
// de bouwer nog uit; de intake belooft daar niets over.

import { schoneExtras } from './website.js';

const GEEN_FOTO_HULP = 'Geen probleem. We nemen dan contact met je op om het samen op te lossen.';

// Stap 1 en 2 (bedrijf en pakket) bouwt de pagina zelf op: die hebben
// vooraf ingevulde gegevens, de logokeuze en de pakketkaarten. Dit zijn de
// velden van stap 1, zodat controle en "wat ontbreekt" op dezelfde manier werken.
export const BEDRIJF_VELDEN = [
  { naam: 'bedrijf.naam', label: 'Bedrijfsnaam', type: 'tekst', verplicht: true,
    hulp: 'Zoals hij op je site moet komen.' },
  { naam: 'bedrijf.tagline', label: 'In één zin: wat doe je en waar?', type: 'tekst', verplicht: true,
    placeholder: 'Tuinen ontwerpen, aanleggen en onderhouden in Bergen en omstreken.' },
  { naam: 'bedrijf.branche', label: 'Je vak of branche', type: 'tekst', placeholder: 'Hovenier' },
  { naam: 'bedrijf.telefoon', label: 'Telefoonnummer', type: 'telefoon', verplicht: true, placeholder: '072 - 512 34 56' },
  { naam: 'bedrijf.email', label: 'E-mailadres', type: 'email', verplicht: true,
    hulp: 'Hier komen de aanvragen van je website binnen.', placeholder: 'info@jouwbedrijf.nl' },
  { naam: 'bedrijf.adres.straat', label: 'Straat en huisnummer', type: 'tekst', verplicht: true },
  { naam: 'bedrijf.adres.postcode', label: 'Postcode', type: 'tekst', verplicht: true, placeholder: '1861 AB', half: true },
  { naam: 'bedrijf.adres.plaats', label: 'Plaats', type: 'tekst', verplicht: true, placeholder: 'Bergen', half: true },
  { naam: 'bedrijf.kvk', label: 'KvK-nummer', type: 'tekst', verplicht: true,
    geenOptie: { naam: 'bedrijf.kvkOnbekend', label: 'Heb ik nog niet' } },
  { naam: 'bedrijf.btw', label: 'Btw-nummer', type: 'tekst', verplicht: true,
    hulp: 'Het nummer op je facturen, beginnend met NL.',
    geenOptie: { naam: 'bedrijf.btwOnbekend', label: 'Heb ik nog niet' } },
  { naam: 'bedrijf.regio', label: 'In welke regio werk je?', type: 'tekst', verplicht: true, placeholder: 'Noord-Holland' },
  { naam: 'bedrijf.openingstijden', label: 'Openingstijden', type: 'langeTekst',
    hulp: 'Eén regel per dag of dagdeel.', placeholder: 'Ma–Vr 08:00 – 17:00\nZa op afspraak\nZo gesloten' },
  { naam: 'socials.facebook', label: 'Link naar je Facebookpagina', type: 'tekst', half: true },
  { naam: 'socials.instagram', label: 'Link naar je Instagram', type: 'tekst', half: true },
];

export const STAPPEN = [
  {
    sleutel: 'huisstijl',
    titel: 'Huisstijl',
    intro: 'Wij maken het kleurenpalet. Kleurcodes hoef je niet te weten.',
    introAls: k => k.fotoset ? 'Wij maken het kleurenpalet. Voor de foto bovenaan je site en bij je diensten gebruiken we de fotoset.' : null,
    velden: [
      { naam: 'hero.achtergrond', label: 'Foto voor bovenaan je site', type: 'fotos', maximum: 3, als: k => !k.fotoset,
        hulp: 'Een liggende foto van je werk of je team. Een rustig beeld werkt beter dan een druk beeld.' },
      { naam: 'fotoset.wensen', label: 'Fotoset: wat voor beelden passen bij je bedrijf?', type: 'langeTekst', als: k => k.fotoset,
        hulp: 'Bijvoorbeeld het soort werk, de omgeving of de sfeer. Laat leeg, dan kiezen wij.' },
      { naam: 'huisstijl.favicon', label: 'Favicon', type: 'fotos', maximum: 2,
        hulp: 'Het kleine pictogram in het tabblad van de browser. Heb je er geen, dan maken we hem uit je logo.' },
      { naam: 'huisstijl.huisstijlfoto', label: 'Foto waarop je huisstijl te zien is', type: 'fotos', maximum: 4,
        hulp: 'Bijvoorbeeld je bedrijfsbus, werkkleding of briefpapier. We halen de kleuren daaruit.' },
      { naam: 'kleuren.wensen', label: 'Kleurcodes of wensen', type: 'langeTekst',
        hulp: 'Ken je de kleurcodes van je huisstijl, zet ze hier. Een kleurcode ziet eruit als #2F6B3C.',
        placeholder: '#2F6B3C voor de hoofdkleur\nGeen felle kleuren' },
      { naam: 'kleuren.volgLogo', label: 'Volg de kleuren van mijn logo', type: 'aanvinken' },
      { naam: 'huisstijl.opmerkingen', label: 'Nog iets over de uitstraling?', type: 'langeTekst',
        hulp: 'Iets wat je juist niet wilt, of een site die je mooi vindt.' },
    ],
  },
  {
    sleutel: 'diensten',
    titel: 'Je diensten',
    intro: 'Wat je aanbiedt. Eén regel per dienst is genoeg; de teksten schrijven wij.',
    herhaling: {
      naam: 'diensten.items', enkelvoud: 'Dienst', meervoud: 'Diensten',
      minimum: 3, maximum: 8, start: 3,
      overslaan: { naam: 'nietVanToepassing', label: 'Deze dienst heb ik niet' },
      voetnoot: 'Drie is het minimum. Bied je meer aan, zet ze er gerust bij.',
      velden: [
        { naam: 'titel', label: 'Naam van de dienst', type: 'tekst', verplicht: true, placeholder: 'Tuinonderhoud' },
        { naam: 'omschrijving', label: 'Wat houdt het in?', type: 'langeTekst', verplicht: true,
          hulp: 'Eén of twee zinnen in je eigen woorden.' },
        { naam: 'afbeelding', label: 'Foto bij deze dienst', type: 'fotos', maximum: 3, alleenBij: ['compleet', 'pro'], als: k => !k.fotoset,
          geenOptie: { naam: 'geenFoto', label: "Heb ik nog geen foto's van", hulp: GEEN_FOTO_HULP } },
      ],
    },
  },
  {
    sleutel: 'dienstpaginas',
    titel: 'Diensten met een eigen pagina',
    alleenBij: ['pro'],
    intro: 'Bij Pro krijgen drie diensten een eigen pagina. Kies de drie die je het belangrijkst vindt.',
    herhaling: {
      naam: 'dienstpaginas', enkelvoud: 'Dienstpagina', meervoud: "Dienstpagina's",
      minimum: 3, maximum: 3, start: 3,
      velden: [
        { naam: 'dienst', label: 'Welke dienst?', type: 'tekst', verplicht: true,
          hulp: 'Neem de naam over zoals je hem bij de vorige stap invulde.' },
        { naam: 'verhaal', label: 'Wat moet iemand hierover weten?', type: 'langeTekst', verplicht: true,
          hulp: 'Vertel het zoals je het aan de telefoon zou uitleggen. Wij maken er de tekst van.' },
        { naam: 'stappen', label: 'Hoe verloopt zo’n klus?', type: 'langeTekst', verplicht: true,
          hulp: 'Vier stappen, van eerste bezoek tot oplevering. Eén regel per stap.',
          placeholder: '1. Opnemen op locatie\n2. Offerte per onderdeel\n3. Voorbereiden\n4. Afwerken en opleveren' },
        { naam: 'inbegrepen', label: 'Wat zit er standaard bij?', type: 'langeTekst', verplicht: true,
          hulp: 'Eén regel per onderdeel.' },
        { naam: 'vragen', label: 'Welke vragen krijg je hier het vaakst over?', type: 'langeTekst', verplicht: true,
          hulp: 'Een paar vragen met je antwoord erachter.' },
        { naam: 'kopafbeelding', label: 'Foto bovenaan deze pagina', type: 'fotos', maximum: 3, als: k => !k.fotoset },
      ],
    },
  },
  {
    sleutel: 'werk',
    titel: 'Eerder werk',
    intro: 'Je eigen projecten. Voor bezoekers vaak het overtuigendste deel van de site.',
    letOp: 'Gebruik alleen foto’s van je eigen werk. Beelden van internet wekken de indruk dat jij dat gemaakt hebt, en dat valt op zodra iemand gaat vergelijken.',
    herhaling: {
      naam: 'eerderWerk.items', enkelvoud: 'Project', meervoud: 'Projecten',
      minimum: 3, maximum: 12, start: 3,
      overslaan: { naam: 'nietVanToepassing', label: 'Dit project heb ik niet' },
      voetnoot: 'Drie is het minimum. Elk extra project overtuigt een bezoeker meer dan tekst.',
      velden: [
        { naam: 'afbeelding', label: "Foto's van het resultaat", type: 'fotos', verplicht: true, minimum: 1, maximum: 6,
          hulp: "Eén tot drie foto's per project is genoeg.",
          geenOptie: { naam: 'geenFoto', label: "Heb ik nog geen foto's van", hulp: GEEN_FOTO_HULP } },
        { naam: 'afbeeldingVoor', label: 'Foto van de situatie vooraf', type: 'fotos', maximum: 3, alleenBij: ['compleet', 'pro'],
          hulp: 'Heb je een voor-foto vanaf hetzelfde punt? Dat werkt sterk.' },
        { naam: 'titel', label: 'Wat was het?', type: 'tekst', verplicht: true, placeholder: 'Achtertuin volledig vernieuwd' },
        { naam: 'plaats', label: 'In welke plaats?', type: 'tekst', verplicht: true, placeholder: 'Bergen' },
        { naam: 'wijk', label: 'Welke straat of wijk?', type: 'tekst', alleenBij: ['pro'] },
        { naam: 'omschrijving', label: 'Wat heb je gedaan?', type: 'langeTekst', verplicht: true,
          hulp: 'Twee zinnen. Noem gerust een maat, een aantal of hoe lang het duurde.' },
      ],
    },
  },
  {
    sleutel: 'over',
    titel: 'Over je bedrijf',
    intro: 'Het verhaal achter je bedrijf. Wij maken er lopende tekst van.',
    velden: [
      { naam: 'overOns.teamfoto', label: 'Foto van jou of je team', type: 'fotos', maximum: 4,
        hulp: 'Een foto op locatie werkt beter dan een studiofoto.' },
      { naam: 'overOns.afbeelding', label: 'Foto van jou aan het werk', type: 'fotos', maximum: 4 },
      { naam: 'overOns.tekst.start', label: 'Sinds wanneer bestaat je bedrijf, en hoe begon het?', type: 'langeTekst', verplicht: true },
      { naam: 'overOns.tekst.nu', label: 'Hoe ziet het er nu uit?', type: 'langeTekst', verplicht: true,
        hulp: 'Met hoeveel mensen werk je, wie doet wat?' },
      { naam: 'overOns.tekst.anders', label: 'Wat doe je anders dan anderen in je vak?', type: 'langeTekst', verplicht: true,
        alleenBij: ['compleet', 'pro'] },
      { naam: 'waaromWij.items', label: 'Waarom kiezen klanten voor jou?', type: 'langeTekst', verplicht: true,
        hulp: 'Drie of vier redenen, één per regel. Hoe concreter hoe beter.',
        placeholder: 'Vaste prijs per onderdeel\nDezelfde ploeg elke dag\nWe bellen bij tegenvallers' },
      { naam: 'vertrouwen', label: 'Cijfers of keurmerken om trots op te zijn', type: 'langeTekst',
        hulp: 'Bijvoorbeeld: 22 jaar actief, 650 tuinen aangelegd, VCA-gecertificeerd, 5 jaar garantie.' },
      { naam: 'reactietijd', label: 'Hoe snel reageer je op een aanvraag?', type: 'tekst', placeholder: 'Binnen 24 uur reactie' },
    ],
  },
  {
    sleutel: 'reviews',
    titel: 'Beoordelingen',
    intro: 'Overtypen hoeft niet. Geef ons de bron, dan zetten wij ze op de site.',
    velden: [
      { naam: 'reviews.google', label: 'Link naar je Google-bedrijfsprofiel', type: 'tekst',
        hulp: 'Zoek je bedrijf in Google Maps en plak het adres uit de adresbalk.', placeholder: 'https://maps.app.goo.gl/...' },
      { naam: 'reviews.schermafbeeldingen', label: 'Of: schermafbeeldingen van je beoordelingen', type: 'fotos', maximum: 12,
        hulp: 'Staan je reviews ergens anders, bijvoorbeeld op Werkspot of Facebook? Maak er een schermafbeelding van.' },
      { naam: 'reviews.toelichting', label: 'Nog iets over de beoordelingen?', type: 'langeTekst',
        hulp: 'Bijvoorbeeld welke je het liefst op de site ziet.' },
    ],
  },
  {
    sleutel: 'werkgebied',
    titel: 'Je werkgebied',
    intro: 'Waar je werkt.',
    velden: [
      { naam: 'werkgebied.plaatsen', label: 'In welke plaatsen werk je?', type: 'langeTekst', verplicht: true,
        hulp: 'Eén plaats per regel.', placeholder: 'Bergen\nSchoorl\nAlkmaar\nHeiloo' },
      { naam: 'werkgebied.tekst', label: 'Hoe zou je je werkgebied omschrijven?', type: 'langeTekst', verplicht: true,
        hulp: 'Eén of twee zinnen, in je eigen woorden.' },
      { naam: 'werkgebied.praktisch', label: 'Iets praktisch over werken in dit gebied?', type: 'langeTekst',
        alleenBij: ['compleet', 'pro'], hulp: 'Bijvoorbeeld hoe ver je rijdt, of wanneer je waar werkt.' },
    ],
  },
  {
    sleutel: 'plaatspaginas',
    titel: "Plaatspagina's",
    alleenBij: ['pro'],
    intro: 'Bij Pro krijgen drie plaatsen een eigen pagina.',
    letOp: 'Elke pagina moet echt over die plaats gaan. Vertel wat daar anders is: het soort huizen, de ondergrond, de regels van de gemeente, de drukte in het seizoen. Neem er de tijd voor.',
    herhaling: {
      naam: 'plaatspaginas.items', enkelvoud: 'Plaats', meervoud: 'Plaatsen',
      minimum: 3, maximum: 3, start: 3,
      velden: [
        { naam: 'naam', label: 'Welke plaats?', type: 'tekst', verplicht: true, placeholder: 'Monnickendam' },
        { naam: 'opening', label: 'Wat maakt werken in deze plaats anders?', type: 'langeTekst', verplicht: true,
          hulp: 'Denk aan bouwjaar van de huizen, de ondergrond, regels van de gemeente, drukte in het seizoen.' },
        { naam: 'context', label: 'Vier dingen die daar spelen', type: 'langeTekst', verplicht: true,
          hulp: 'Eén per regel, met in een paar woorden waarom het uitmaakt voor je werk.' },
        { naam: 'wijken', label: 'Wijken en buurten in deze plaats', type: 'langeTekst', hulp: 'Eén per regel.' },
        { naam: 'omliggend', label: 'Welke dorpen eromheen bedien je vanuit hier?', type: 'langeTekst', verplicht: true,
          hulp: 'Eén per regel.' },
        { naam: 'projecten', label: 'Welke projecten deed je in deze plaats?', type: 'langeTekst', verplicht: true,
          hulp: 'Neem de titels over die je bij Eerder werk invulde.' },
        { naam: 'afbeelding', label: 'Foto uit deze plaats', type: 'fotos', maximum: 3, als: k => !k.fotoset,
          hulp: 'Een herkenbaar beeld uit die plaats werkt het best.' },
      ],
    },
  },
  {
    sleutel: 'extrapaginas',
    titel: "Extra pagina's",
    als: k => (k.extras.extra_pagina || 0) > 0,
    intro: "Je hebt extra pagina's gekozen. Vertel per pagina waar hij over gaat.",
    herhaling: {
      naam: 'extraPaginas.items', enkelvoud: 'Extra pagina', meervoud: "Extra pagina's",
      minimum: 1, maximum: 1, start: 1,
      aantal: k => k.extras.extra_pagina || 0,
      velden: [
        { naam: 'titel', label: 'Waar gaat deze pagina over?', type: 'tekst', verplicht: true, placeholder: 'Veelgestelde vragen' },
        { naam: 'inhoud', label: 'Wat moet erop?', type: 'langeTekst', verplicht: true,
          hulp: 'In je eigen woorden. Wij maken er de tekst van.' },
        { naam: 'afbeelding', label: "Foto's voor deze pagina", type: 'fotos', maximum: 4, als: k => !k.fotoset },
      ],
    },
  },
  {
    sleutel: 'extras',
    titel: "Je extra's",
    als: k => Boolean(k.extras.logo || k.extras.google_profiel || k.extras.whatsapp || k.email),
    intro: "Wat we nodig hebben voor de extra's die je koos.",
    velden: [
      { naam: 'logo.wensen', label: 'Logo-ontwerp: wat moet erin?', type: 'langeTekst', verplicht: true, als: k => k.extras.logo,
        hulp: 'De naam zoals hij in het logo moet, en wat bij je past: strak of stoer, kleuren, een beeldmerk.',
        placeholder: 'Duinrand Hoveniers\nGroen en zand, rustig, met een blad als beeldmerk' },
      { naam: 'logo.voorbeelden', label: "Logo's die je mooi vindt", type: 'fotos', maximum: 6, als: k => k.extras.logo,
        hulp: 'Schermafbeeldingen zijn prima. Ook je huidige logo als we dat moeten opknappen.' },
      { naam: 'googleProfiel.link', label: 'Google Bedrijfsprofiel: heb je er al een?', type: 'tekst', als: k => k.extras.google_profiel,
        hulp: 'Plak de link uit Google Maps. Heb je er nog geen, laat dit dan leeg.', placeholder: 'https://maps.app.goo.gl/...' },
      { naam: 'googleProfiel.account', label: 'Met welk Google-account wil je het profiel beheren?', type: 'email', verplicht: true, als: k => k.extras.google_profiel,
        hulp: 'Het profiel komt op jouw naam. Wij vragen beheertoegang aan op dit adres.' },
      { naam: 'whatsapp.nummer', label: 'WhatsApp-nummer voor de knop', type: 'telefoon', verplicht: true, als: k => k.extras.whatsapp,
        placeholder: '06 12345678' },
      { naam: 'whatsapp.bericht', label: 'Eerste zin die klaarstaat in het bericht', type: 'tekst', als: k => k.extras.whatsapp,
        placeholder: 'Hallo, ik heb een vraag over…' },
      { naam: 'email.adres', label: 'Zakelijke e-mail: welk adres wil je?', type: 'tekst', verplicht: true, als: k => k.email,
        hulp: 'Op je nieuwe domeinnaam. Meer adressen nodig? Zet ze eronder bij opmerkingen.', placeholder: 'info@jouwbedrijf.nl' },
      { naam: 'email.gebruiker', label: 'Wie gaat de mailbox gebruiken?', type: 'tekst', als: k => k.email, placeholder: 'Jan Jansen' },
      { naam: 'email.doorsturen', label: 'Mail ook doorsturen naar een bestaand adres?', type: 'email', als: k => k.email,
        hulp: 'Laat leeg als dat niet hoeft.' },
      { naam: 'email.opmerkingen', label: 'Opmerkingen over je e-mail', type: 'langeTekst', als: k => k.email },
    ],
  },
  {
    sleutel: 'afronden',
    titel: 'Afronden',
    intro: 'Bijna klaar. Nog even dit, dan gaan wij aan de slag.',
    velden: [
      { naam: 'contact.opmerkingen', label: 'Is er nog iets wat we moeten weten?', type: 'langeTekst',
        hulp: 'Alles wat niet in een veld paste.' },
      { naam: 'contact.contactpersoon', label: 'Naam van de contactpersoon', type: 'tekst', verplicht: true, placeholder: 'Jan Jansen', half: true },
      { naam: 'contact.contactTelefoon', label: 'Telefoonnummer van de contactpersoon', type: 'telefoon', verplicht: true, placeholder: '06 12 34 56 78', half: true },
      { naam: 'contact.akkoord', label: "Ik heb de foto's zelf gemaakt of mag ze gebruiken", type: 'aanvinken', verplicht: true },
    ],
  },
];

// Keuze uit stap 2. `pakket` mag ook los meegegeven worden (oude aanroepen).
const alsKeuze = k => (typeof k === 'string' ? { pakket: k, extras: {}, fotoset: false, email: false } : k);

/** De keuze uit stap 2, uit de antwoorden. */
export function keuzeUit(antwoorden) {
  const pakket = antwoorden['website.pakket'] || 'basis';
  const extras = schoneExtras(antwoorden['website.extras'] || {}, pakket);
  const domeinViaOns = antwoorden['website.domeinViaOns'] === true;
  // De fotoset zit in Compleet en Pro; bij Basis is het een extra.
  const fotoset = pakket !== 'basis' || Boolean(extras.fotoset);
  return { pakket, extras, fotoset, domeinViaOns, email: domeinViaOns && antwoorden['website.email'] === true };
}

const telt = (def, k) => (!def.alleenBij || def.alleenBij.includes(k.pakket)) && (!def.als || Boolean(def.als(k)));

/**
 * De inhoudsstappen die bij deze keuze horen. Een herhaling met `aantal` krijgt
 * precies zoveel rijen (minimum = maximum = start).
 */
export function stappenVoor(keuze) {
  const k = alsKeuze(keuze);
  return STAPPEN.filter(s => telt(s, k)).map(s => {
    const intro = s.introAls?.(k) || s.intro;
    if (!s.herhaling?.aantal) return { ...s, intro };
    const n = Math.max(1, s.herhaling.aantal(k));
    return { ...s, intro, herhaling: { ...s.herhaling, minimum: n, maximum: n, start: n } };
  });
}

/** De velden binnen een stap die bij deze keuze horen. */
export const veldenVoor = (velden, keuze) => (velden || []).filter(v => telt(v, alsKeuze(keuze)));

/**
 * Wat de klant heeft aangevinkt als "heb ik niet". Gaat mee in de inzending en
 * de mail aan ons, zodat in één oogopslag te zien is waar we achteraan moeten.
 */
export function ontbrekendeZaken(keuze, antwoorden) {
  const k = alsKeuze(keuze);
  const uit = [];
  const aan = s => antwoorden[s] === true;
  const stappen = [{ velden: BEDRIJF_VELDEN }, ...stappenVoor(k)];
  for (const stap of stappen) {
    for (const veld of veldenVoor(stap.velden, k)) {
      if (veld.geenOptie && aan(veld.geenOptie.naam)) uit.push(`${veld.label}: ${veld.geenOptie.label.toLowerCase()}`);
    }
    const h = stap.herhaling;
    if (!h) continue;
    let rijen = h.minimum;
    for (const s of Object.keys(antwoorden)) {
      if (!s.startsWith(`${h.naam}[`)) continue;
      const n = Number(s.slice(h.naam.length + 1, s.indexOf(']')));
      if (!Number.isNaN(n)) rijen = Math.max(rijen, n + 1);
    }
    rijen = Math.min(rijen, h.maximum);
    for (let i = 0; i < rijen; i++) {
      const naam = `${h.enkelvoud} ${i + 1}`;
      if (h.overslaan && aan(`${h.naam}[${i}].${h.overslaan.naam}`)) { uit.push(`${naam}: ${h.overslaan.label.toLowerCase()}`); continue; }
      for (const veld of veldenVoor(h.velden, k)) {
        if (veld.geenOptie && aan(`${h.naam}[${i}].${veld.geenOptie.naam}`)) uit.push(`${naam}: ${veld.geenOptie.label.toLowerCase()}`);
      }
    }
  }
  return uit;
}
