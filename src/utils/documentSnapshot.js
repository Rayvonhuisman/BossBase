// Bevriest de bedrijfs-branding op een factuur/offerte bij het versturen, zodat
// de weergave van een verstuurd document niet meer verandert als het bedrijf
// later zijn logo, kleur of gegevens aanpast.
//
// - buildCompanySnapshot(company): snake_case payload om op te slaan op het
//   document bij het versturen.
// - companyForDocument(doc, liveCompany): geeft het company-object dat de PDF
//   moet gebruiken — de snapshot als die bestaat (verstuurd), anders live
//   (concept).

// Live company (camelCase, zie profileService.toCompany) → snapshot-kolommen.
export function buildCompanySnapshot(company) {
  if (!company) return {}
  return {
    snapshot_logo_url:       company.logoUrl || null,
    snapshot_branding_color: company.brandingColor || null,
    snapshot_bedrijfsnaam:   company.name || null,
    snapshot_adres:          company.address || null,
    snapshot_postcode:       company.postalCode || null,
    snapshot_plaats:         company.city || null,
    snapshot_email:          company.email || null,
    snapshot_kvk:            company.kvk || null,
    snapshot_btw:            company.btwNumber || null,
  }
}

// Een document heeft een snapshot zodra het is verstuurd/ondertekend.
export function hasCompanySnapshot(doc) {
  return !!(doc && (doc.snapshotBedrijfsnaam || doc.snapshotLogoUrl || doc.snapshotBrandingColor))
}

// Welk company-object moet de PDF gebruiken? Snapshot (bevroren) of live.
export function companyForDocument(doc, liveCompany) {
  if (!hasCompanySnapshot(doc)) return liveCompany
  return {
    ...liveCompany,
    name:          doc.snapshotBedrijfsnaam   ?? liveCompany?.name,
    logoUrl:       doc.snapshotLogoUrl        ?? liveCompany?.logoUrl,
    brandingColor: doc.snapshotBrandingColor  ?? liveCompany?.brandingColor,
    address:       doc.snapshotAdres          ?? liveCompany?.address,
    postalCode:    doc.snapshotPostcode       ?? liveCompany?.postalCode,
    city:          doc.snapshotPlaats         ?? liveCompany?.city,
    email:         doc.snapshotEmail          ?? liveCompany?.email,
    kvk:           doc.snapshotKvk            ?? liveCompany?.kvk,
    btwNumber:     doc.snapshotBtw            ?? liveCompany?.btwNumber,
  }
}

// Centrale lock-regels: een verstuurd/ondertekend document is alleen-lezen.
// Factuur: alles behalve concept/aangemaakt is vergrendeld.
export function isFactuurLocked(factuur) {
  return !!factuur && !['concept', 'aangemaakt'].includes(factuur.status)
}

// Offerte: verstuurd/geaccepteerd/afgewezen of ondertekend → inhoud vergrendeld.
export function isOfferteLocked(offerte) {
  return !!offerte && (offerte.status !== 'concept' || !!offerte.signedAt)
}

// Een ondertekende offerte staat juridisch vast: ook de status mag niet meer wijzigen.
export function isOfferteFullyLocked(offerte) {
  return !!offerte && (!!offerte.signedAt || offerte.status === 'geaccepteerd')
}
