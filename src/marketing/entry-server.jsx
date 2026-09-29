// Alleen voor scripts/prerender.mjs: rendert één websitepagina naar HTML.
import { renderToString } from 'react-dom/server';
import MarketingApp from './MarketingApp.jsx';
import { ROUTES, NIET_GEVONDEN, laadComponent } from './routes.jsx';
import { headHtml } from './seo.js';

export { ROUTES, NIET_GEVONDEN };
export { SITE_URL } from './site.js';

export async function render(route) {
  const Pagina = await laadComponent(route);
  const html = renderToString(<MarketingApp initieel={{ route, Pagina }} />);
  return { html, head: headHtml(route) };
}
