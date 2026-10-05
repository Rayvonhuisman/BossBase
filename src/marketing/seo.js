// Head van een websitepagina: title, beschrijving, canonical, social preview en
// structured data. Eén bron voor twee plekken:
//   - scripts/prerender.mjs schrijft het als HTML in elke pagina (headHtml);
//   - MarketingApp werkt het bij na navigatie binnen de site (applyHead).
//
// Structured data bevat alleen wat ook zichtbaar op de pagina staat. Geen
// beoordelingen of klantaantallen: die hebben we niet aantoonbaar.

import { SITE_URL, SITE_NAAM, CONTACT_EMAIL, OG_BEELD, EXPLOITANT, absoluteUrl } from './site.js';
import { TIERS, prijsMetEenGebruiker } from '../lib/tiers.js';

const ORGANISATIE = {
  '@type': 'Organization',
  '@id': `${SITE_URL}/#organisatie`,
  name: SITE_NAAM,
  legalName: EXPLOITANT.naam,
  url: `${SITE_URL}/`,
  logo: `${SITE_URL}/brand/icon-512.png`,
  email: CONTACT_EMAIL,
};

function softwareApplication() {
  return {
    '@type': 'SoftwareApplication',
    '@id': `${SITE_URL}/#software`,
    name: SITE_NAAM,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: `${SITE_URL}/`,
    description: 'Bedrijfssoftware voor zzp\'ers en vakbedrijven: klanten, offertes, planning, werkbonnen, uren en facturen op één plek.',
    publisher: { '@id': `${SITE_URL}/#organisatie` },
    offers: TIERS.map(t => ({
      '@type': 'Offer',
      name: t.label,
      // Wat je met één gebruiker betaalt (Team: € 59 + € 10 voor de eerste gebruiker).
      price: String(prijsMetEenGebruiker(t.id)),
      priceCurrency: 'EUR',
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: String(prijsMetEenGebruiker(t.id)),
        priceCurrency: 'EUR',
        unitText: 'MON',
        valueAddedTaxIncluded: false,
      },
      url: `${SITE_URL}/prijzen`,
    })),
  };
}

function kruimelpad(route) {
  if (!route.breadcrumbs || route.breadcrumbs.length < 2) return null;
  return {
    '@type': 'BreadcrumbList',
    itemListElement: route.breadcrumbs.map((b, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: b.naam,
      item: absoluteUrl(b.pad),
    })),
  };
}

function artikel(route) {
  const m = route.doc;
  return {
    '@type': 'Article',
    headline: m.h1,
    description: route.description,
    ...(m.gepubliceerd ? { datePublished: m.gepubliceerd, dateModified: m.gewijzigd || m.gepubliceerd } : {}),
    inLanguage: 'nl-NL',
    author: { '@id': `${SITE_URL}/#organisatie` },
    publisher: { '@id': `${SITE_URL}/#organisatie` },
    mainEntityOfPage: absoluteUrl(route.path),
    image: `${SITE_URL}${m.beeld?.src || OG_BEELD.src}`,
  };
}

export function structuredData(route) {
  const graaf = [];
  if (route.schema?.includes('organisatie') || route.type === 'artikel') graaf.push(ORGANISATIE);
  if (route.schema?.includes('website')) {
    graaf.push({ '@type': 'WebSite', '@id': `${SITE_URL}/#website`, name: SITE_NAAM, url: `${SITE_URL}/`, inLanguage: 'nl-NL', publisher: { '@id': `${SITE_URL}/#organisatie` } });
  }
  if (route.schema?.includes('software')) {
    if (!graaf.includes(ORGANISATIE)) graaf.push(ORGANISATIE);
    graaf.push(softwareApplication());
  }
  if (route.type === 'artikel') graaf.push(artikel(route));
  const k = kruimelpad(route);
  if (k) graaf.push(k);
  if (!graaf.length) return null;
  return { '@context': 'https://schema.org', '@graph': graaf };
}

// De tags als lijst. `sleutel` identificeert een tag, zodat applyHead hem kan
// terugvinden en bijwerken.
export function headTags(route) {
  const titel = route.title;
  const beschrijving = route.description;
  const beeld = route.doc?.beeld?.og ? route.doc.beeld : OG_BEELD;
  const tags = [
    { sleutel: 'description', tag: 'meta', attrs: { name: 'description', content: beschrijving } },
  ];
  if (route.noindex) {
    tags.push({ sleutel: 'robots', tag: 'meta', attrs: { name: 'robots', content: 'noindex' } });
  } else {
    tags.push({ sleutel: 'canonical', tag: 'link', attrs: { rel: 'canonical', href: absoluteUrl(route.path) } });
  }
  tags.push(
    { sleutel: 'og:type', tag: 'meta', attrs: { property: 'og:type', content: route.type === 'artikel' ? 'article' : 'website' } },
    { sleutel: 'og:site_name', tag: 'meta', attrs: { property: 'og:site_name', content: SITE_NAAM } },
    { sleutel: 'og:locale', tag: 'meta', attrs: { property: 'og:locale', content: 'nl_NL' } },
    { sleutel: 'og:title', tag: 'meta', attrs: { property: 'og:title', content: titel } },
    { sleutel: 'og:description', tag: 'meta', attrs: { property: 'og:description', content: beschrijving } },
    { sleutel: 'og:image', tag: 'meta', attrs: { property: 'og:image', content: `${SITE_URL}${beeld.src}` } },
    { sleutel: 'og:image:width', tag: 'meta', attrs: { property: 'og:image:width', content: String(beeld.width) } },
    { sleutel: 'og:image:height', tag: 'meta', attrs: { property: 'og:image:height', content: String(beeld.height) } },
    { sleutel: 'og:image:alt', tag: 'meta', attrs: { property: 'og:image:alt', content: beeld.alt } },
    { sleutel: 'twitter:card', tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
  );
  if (!route.noindex) {
    tags.push({ sleutel: 'og:url', tag: 'meta', attrs: { property: 'og:url', content: absoluteUrl(route.path) } });
  }
  return tags;
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function headHtml(route) {
  const regels = [`<title>${esc(route.title)}</title>`];
  for (const t of headTags(route)) {
    const attrs = Object.entries(t.attrs).map(([k, v]) => `${k}="${esc(v)}"`).join(' ');
    regels.push(`<${t.tag} data-bb-head="${t.sleutel}" ${attrs} />`);
  }
  const ld = structuredData(route);
  if (ld) {
    // '<' escapen, zodat een tekst met "</script>" het blok nooit kan sluiten.
    regels.push(`<script type="application/ld+json" data-bb-head="ld">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`);
  }
  return regels.join('\n    ');
}

// Na navigatie binnen de site: head bijwerken naar de nieuwe pagina.
export function applyHead(route) {
  if (typeof document === 'undefined') return;
  document.title = route.title;
  document.querySelectorAll('[data-bb-head]').forEach(el => el.remove());
  const frag = document.createDocumentFragment();
  for (const t of headTags(route)) {
    const el = document.createElement(t.tag);
    el.setAttribute('data-bb-head', t.sleutel);
    for (const [k, v] of Object.entries(t.attrs)) el.setAttribute(k, v);
    frag.appendChild(el);
  }
  const ld = structuredData(route);
  if (ld) {
    const s = document.createElement('script');
    s.type = 'application/ld+json';
    s.setAttribute('data-bb-head', 'ld');
    s.textContent = JSON.stringify(ld);
    frag.appendChild(s);
  }
  document.head.appendChild(frag);
}
