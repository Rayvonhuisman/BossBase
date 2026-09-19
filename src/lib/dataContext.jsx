import { createContext, useContext } from 'react';

// Gedeelde dataset die één keer per dashboard-load wordt opgehaald en gedeeld
// door de topbalk (zoeken en notificaties), de sidebar-badges en de pagina's —
// zo voorkomen we dat customers/deals/activities/offertes/werkbonnen 2-3× per
// paginabezoek worden gequeried.
//
// Facturen, kosten en agenda-items zitten hier bewust NIET in: alleen het
// dashboard en Financiën tonen die, terwijl ze op élke pagina werden opgehaald
// en juist de zwaarste lijsten zijn. Die twee pagina's halen ze zelf op.
export const DataContext = createContext({
  customers: [],
  leveranciers: [],
  deals: [],
  stages: [],
  activities: [],
  offertes: [],
  werkbonnen: [],
  loading: false,
  refresh: () => {},
});

export const useData = () => useContext(DataContext);
