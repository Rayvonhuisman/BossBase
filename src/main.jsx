// Twee ingangen in één build:
//   - de website (openbare pagina's): vooraf gerenderd, hier alleen gehydrateerd;
//   - de app (dashboard, inloggen, klantlinks): de bestaande React-app.
// Welke het wordt, bepaalt het pad. Zo laadt een bezoeker van de website geen
// dashboardcode, en het dashboard geen websitecode.
import { isAppPath } from './lib/appRoutes.js';

if (isAppPath(window.location.pathname)) {
  import('./app-entry.jsx');
} else {
  import('./marketing/entry-client.jsx');
}
