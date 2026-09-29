import { createRoot, hydrateRoot } from 'react-dom/client';
import '../fonts.css';
import MarketingApp from './MarketingApp.jsx';
import { vindRoute, laadComponent, NIET_GEVONDEN } from './routes.jsx';
import { applyHead } from './seo.js';

async function start() {
  const route = vindRoute(window.location.pathname) || NIET_GEVONDEN;
  const Pagina = await laadComponent(route);
  const root = document.getElementById('root');
  const app = <MarketingApp initieel={{ route, Pagina }} />;
  if (root.firstElementChild) {
    // Vooraf gerenderde HTML (productie): alleen interactief maken.
    hydrateRoot(root, app);
  } else {
    // Ontwikkelserver: er is nog geen HTML, dus gewoon renderen.
    applyHead(route);
    createRoot(root).render(app);
  }
}

start();
