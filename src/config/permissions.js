export const AVAILABLE_PERMISSIONS = [
  { key: 'offertes',           label: 'Offertes',             categorie: 'Financieel' },
  { key: 'facturen',           label: 'Facturen',             categorie: 'Financieel' },
  { key: 'financieel',         label: 'Financieel dashboard', categorie: 'Financieel' },
  { key: 'kosten',             label: 'Kosten',               categorie: 'Financieel' },
  { key: 'btw',                label: 'BTW overzicht',        categorie: 'Financieel' },
  { key: 'klanten_bewerken',   label: 'Klanten bewerken',     categorie: 'Klanten' },
  { key: 'klanten_verwijderen',label: 'Klanten verwijderen',  categorie: 'Klanten' },
  { key: 'projecten',          label: 'Projecten',            categorie: 'Operationeel' },
  { key: 'werkbonnen',         label: 'Werkbonnen',           categorie: 'Operationeel' },
  { key: 'planning',           label: 'Planning',             categorie: 'Operationeel' },
  { key: 'database',           label: 'Database & Export',    categorie: 'Beheer' },
  { key: 'instellingen',       label: 'Instellingen',         categorie: 'Beheer' },
  { key: 'team',               label: 'Team beheren',         categorie: 'Beheer' },
]

// Standaard rechten voor nieuwe medewerkers
export const DEFAULT_MEDEWERKER_PERMISSIONS = []

// Alle rechten (voor admin of "alles aan")
export const ALL_PERMISSION_KEYS = AVAILABLE_PERMISSIONS.map(p => p.key)
