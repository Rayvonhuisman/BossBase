// Rechtenmodel — HOOFDRECHTEN (groepen) met daaronder SUBRECHTEN.
//
// - Een hoofdrecht is puur een groep + master-toggle in de UI; het wordt NIET
//   opgeslagen. Alleen de subrecht-keys leven in user_permissions.
// - Elk subrecht heeft:
//     kort   — korte, scanbare regel (keywords) onder het recht.
//     uitleg — uitgebreidere uitleg achter het info-icoon.
// - De teksten beschrijven het werkelijke gedrag (nav-toegang, can()-gating,
//   RLS). Waar een recht een UI-gate is (geen harde RLS) staat dat erbij.
//
// Server-side afdwinging (RLS via bb_has_permission) geldt voor:
//   klanten_bewerken, klanten_verwijderen, verkoop, offertes, facturen, kosten,
//   planning, projecten_bewerken, werkbonnen_bewerken, alles_inzien, agenda_inzien.
// UI-gates (bewust, geen harde RLS): projectbedragen, bedrijfsfinancien,
// database, instellingen, team.
export const PERMISSION_GROUPS = [
  {
    key: 'klanten_verkoop',
    label: 'Klanten & Verkoop',
    subs: [
      { key: 'klanten_bewerken', label: 'Klanten bewerken',
        kort: 'Klanten aanmaken en gegevens wijzigen',
        uitleg: 'Laat de gebruiker klanten aanmaken en klantgegevens bewerken. Zonder dit recht is de klantenlijst alleen-lezen: klanten bekijken kan wel, aanpassen niet.' },
      { key: 'klanten_verwijderen', label: 'Klanten verwijderen',
        kort: 'Klanten definitief verwijderen',
        uitleg: 'Laat de gebruiker klanten definitief verwijderen. Zonder dit recht ontbreekt de verwijder-knop in de klantenlijst en op de klantkaart.' },
      { key: 'verkoop', label: 'Verkooppijplijn',
        kort: 'Deals en leads bekijken en beheren',
        uitleg: 'Geeft toegang tot de Pipeline (CRM): deals en leads bekijken en beheren, plus de CRM-widgets op het dashboard (nieuwe leads, actieve deals, conversie, funnel, leadbron). Dit wordt ook server-side afgedwongen: zonder dit recht zijn deals nergens zichtbaar.' },
    ],
  },
  {
    key: 'uitvoering',
    label: 'Uitvoering (projecten, werkbonnen, planning)',
    subs: [
      { key: 'projecten_bewerken', label: 'Projecten bewerken',
        kort: 'Alle projecten aanmaken en bewerken',
        uitleg: 'Projecten aanmaken en bewerken — ook projecten waar je zelf niet aan gekoppeld bent. Je eigen projecten zie je altijd, ook zonder dit recht; dit recht gaat over het wijzigen.' },
      { key: 'werkbonnen_bewerken', label: 'Werkbonnen bewerken',
        kort: 'Alle werkbonnen bewerken + materiaalkosten',
        uitleg: 'Alle werkbonnen bewerken, ook die waarvan je geen verantwoordelijke bent, inclusief het registreren van materiaalkosten daarop. De verantwoordelijke van een werkbon mag díe bon sowieso al bewerken; dit is het ‘overal’-recht daarbovenop.' },
      { key: 'planning', label: 'Planning',
        kort: 'Inplannen, weekplanning, agenda van collega’s',
        uitleg: 'Toegang tot de Planning-pagina (werkbonnen inplannen met drag & drop), het mogen inplannen van alle werkbonnen, en het bewerken van agenda-afspraken van collega’s.' },
      { key: 'alles_inzien', label: 'Alle projecten & werkbonnen inzien',
        kort: 'Brede inzage in werk van collega’s',
        uitleg: '⚠️ Normaal ziet een medewerker alleen zijn eigen projecten en werkbonnen. Met dit recht ziet hij die van het hele team. Dit geeft brede inzage in het werk van collega’s — zet het alleen aan als dat nodig is.' },
      { key: 'agenda_inzien', label: 'Elkaars agenda inzien',
        kort: 'Agenda’s van collega’s bekijken',
        uitleg: 'Laat de agenda-afspraken van collega’s zien (alleen inzien, niet bewerken). Normaal ziet een medewerker alleen zijn eigen agenda.' },
    ],
  },
  {
    key: 'financieel',
    label: 'Financieel',
    subs: [
      { key: 'projectbedragen', label: 'Projectbedragen zien',
        kort: 'Bedragen en marges op projecten/werkbonnen',
        uitleg: 'Toont bedragen op projecten, werkbonnen en de klantkaart: projectwaarde, geoffreerd, betaald, kosten en winst per project/klant. Staat los van de gevoeliger bedrijfsomzet. Standaard uit.' },
      { key: 'bedrijfsfinancien', label: 'Bedrijfsfinanciën zien',
        kort: 'Omzet, winst en marges van het bedrijf',
        uitleg: 'Toegang tot de Financiën-pagina en de omzet-/winst-widgets op het dashboard (omzet en winst per maand, pipeline-waarde, geaccepteerde waarde, grafieken). Gevoelige bedrijfscijfers; standaard uit.' },
      { key: 'offertes', label: 'Offertes',
        kort: 'Offertes maken, versturen en inzien',
        uitleg: 'Geeft toegang tot de Offertes-pagina: offertes opstellen, versturen en de status volgen. Ook het tabblad ‘Offertes’ op de klantkaart en het offerte-widget op het dashboard worden zichtbaar.' },
      { key: 'facturen', label: 'Facturen',
        kort: 'Facturen maken, versturen en inzien',
        uitleg: 'Geeft toegang tot de Facturen-pagina: facturen aanmaken, versturen en de betaalstatus bijhouden. Ook het facturen-tabblad op de klantkaart en de facturatie-widgets op het dashboard worden zichtbaar.' },
      { key: 'kosten', label: 'Kosten',
        kort: 'Kosten en inkoop registreren en inzien',
        uitleg: 'Geeft toegang tot de Kosten-pagina om kosten en inkoop vast te leggen en te bekijken, plus het kosten-tabblad op de klantkaart en de kosten-widgets. Materiaalkosten die op een werkbon worden geboekt vallen onder ‘Werkbonnen bewerken’, niet onder dit recht.' },
    ],
  },
  {
    key: 'beheer',
    label: 'Beheer',
    subs: [
      { key: 'team', label: 'Team beheren',
        kort: 'Team-pagina openen (beheer blijft bij admin)',
        uitleg: 'Geeft toegang tot de Team-pagina om teamleden te bekijken. Let op: teamleden uitnodigen, rechten instellen en verwijderen blijft voorbehouden aan admins.' },
      { key: 'instellingen', label: 'Instellingen',
        kort: 'Bedrijfsinstellingen beheren',
        uitleg: 'Geeft toegang tot de bedrijfsinstellingen (bedrijfsgegevens, e-mailinstellingen, enzovoort). Het eigen ‘Mijn profiel’ kan iedereen altijd beheren; dit recht gaat alleen over de bedrijfsbrede instellingen.' },
      { key: 'database', label: 'Database & Export',
        kort: 'Gegevens bekijken en exporteren naar Excel',
        uitleg: 'Geeft toegang tot de Database & Export-pagina om bedrijfsgegevens (zoals klanten) te bekijken en te exporteren naar Excel.' },
    ],
  },
]

// Subrechten die bij het aanzetten een expliciete waarschuwing tonen (brede inzage).
export const WARN_ON_ENABLE = ['alles_inzien']

// Platte lijst van alle subrechten — back-compat met bestaande consumers.
export const AVAILABLE_PERMISSIONS = PERMISSION_GROUPS.flatMap(g => g.subs)

// Standaard rechten voor nieuwe medewerkers: alles uit (least privilege).
export const DEFAULT_MEDEWERKER_PERMISSIONS = []

// Alle recht-keys (voor admin of "alles aan").
export const ALL_PERMISSION_KEYS = AVAILABLE_PERMISSIONS.map(p => p.key)
