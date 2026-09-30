// Twee ingangen in één build:
//   - de website (openbare pagina's): vooraf gerenderd, hier alleen gehydrateerd;
//   - de app (dashboard, inloggen, klantlinks): de bestaande React-app.
// Welke het wordt, bepaalt het pad. Zo laadt een bezoeker van de website geen
// dashboardcode, en het dashboard geen websitecode.
import { isAppPath } from './lib/appRoutes.js';
import { installeerLaadfoutHerstel, isLaadfout, herlaadEenmaal, toonLaadfout } from './lib/laadfout.js';
import { startAnalytics } from './lib/analytics.js';

installeerLaadfoutHerstel();
// Website én app: Vercel Web Analytics, zonder cookies, met geschoonde URL's.
startAnalytics();

const ingang = isAppPath(window.location.pathname)
  ? import('./app-entry.jsx')
  : import('./marketing/entry-client.jsx');

ingang.catch(fout => {
  if (isLaadfout(fout) && herlaadEenmaal()) return;
  toonLaadfout(fout);
});
