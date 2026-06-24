import { createContext, useContext } from 'react';

// Gedeelde dataset die één keer per dashboard-load wordt opgehaald en gedeeld
// door het dashboard, de sidebar-badges en de notificaties — zo voorkomen we
// dat customers/deals/activities/offertes/werkbonnen 2-3× worden gequeried.
export const DataContext = createContext({
  customers: [],
  deals: [],
  stages: [],
  activities: [],
  offertes: [],
  werkbonnen: [],
  calendarEvents: [],
  facturen: [],
  jobCosts: [],
  loading: false,
  refresh: () => {},
});

export const useData = () => useContext(DataContext);
