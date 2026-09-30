// Vaste gegevens van de website. Alleen wat klopt en controleerbaar is.

// De canonieke host. Alle canonicals, de sitemap en de structured data wijzen
// hiernaar, ook als de pagina op een preview-URL draait.
export const SITE_URL = 'https://www.bossbase.nl';

export const SITE_NAAM = 'BossBase';
export const SLOGAN = 'Jij de baas, wij de basis.';
export const CONTACT_EMAIL = 'info@bossbase.nl';

// Exploitant van BossBase (bevestigd 30-09-2026). "BossBase" is een handelsnaam
// van deze B.V.; er bestaat geen "BossBase B.V.". Btw-id: nog aan te leveren.
export const EXPLOITANT = {
  naam: 'NG E-Commerce B.V.',
  adres: 'Sodalietdreef 6, 7828 CR Emmen',
  kvk: '91856396',
};
export const EXPLOITANT_REGEL = `BossBase is een handelsnaam van ${EXPLOITANT.naam}, ${EXPLOITANT.adres}, KvK ${EXPLOITANT.kvk}.`;

// Afbeelding voor social previews (1200 × 630).
export const OG_BEELD = { src: '/og/bossbase.png', width: 1200, height: 630, alt: 'BossBase — software voor zzp\'ers en vakbedrijven' };

// Publicatie- en wijzigingsdatums staan per artikel in de kop van het
// Markdown-bestand ("gepubliceerd", "gewijzigd"). Zolang een artikel geen
// publicatiedatum heeft, toont de site geen datum. Zet de datum op de dag van
// publicatie met: npm run publicatiedatum -- JJJJ-MM-DD
// "gewijzigd" zet je alleen met de hand, bij een echte inhoudelijke wijziging.

export function absoluteUrl(pad) {
  return pad === '/' ? `${SITE_URL}/` : `${SITE_URL}${pad}`;
}

// Datum als "29 september 2026", onafhankelijk van de tijdzone van de server.
const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
export function datumTekst(iso) {
  const [j, m, d] = iso.split('-').map(Number);
  return `${d} ${MAANDEN[m - 1]} ${j}`;
}
