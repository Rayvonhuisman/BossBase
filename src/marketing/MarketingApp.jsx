// De website als geheel: toont de pagina voor het huidige pad en navigeert
// tussen websitepagina's zonder volledige herlaad.
//
// Links zijn gewone <a href>-elementen, zodat zoekmachines ze volgen en
// ctrl/cmd-klik een nieuw tabblad opent. Een klik op een link naar een andere
// websitepagina wordt hier onderschept (één luisteraar op document); links
// naar de app (inloggen, registreren, dashboard) laden gewoon de app.

import { useCallback, useEffect, useRef, useState } from 'react';
import { vindRoute, laadComponent, normaliseerPad } from './routes.jsx';
import { applyHead } from './seo.js';
import { isAppPath } from '../lib/appRoutes.js';
import { meet } from '../lib/meting.js';

export default function MarketingApp({ initieel }) {
  const [stand, setStand] = useState(initieel);
  const laatsteNavigatie = useRef(0);

  const toon = useCallback(async (url, { push, replace } = {}) => {
    const pad = normaliseerPad(url.pathname);
    const route = vindRoute(pad);
    if (!route) {
      // Geen websitepagina: de server beslist (app, redirect of 404).
      window.location.assign(url.href);
      return;
    }
    const nr = ++laatsteNavigatie.current;
    const Pagina = await laadComponent(route);
    if (nr !== laatsteNavigatie.current) return;
    const doel = pad + url.search + url.hash;
    if (push) window.history.pushState({}, '', doel);
    else if (replace) window.history.replaceState({}, '', doel);
    setStand({ route, Pagina });
    applyHead(route);
    // Na het renderen: naar het anker, of naar boven.
    requestAnimationFrame(() => {
      const anker = url.hash && document.getElementById(decodeURIComponent(url.hash.slice(1)));
      if (anker) anker.scrollIntoView();
      else if (push || replace) window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    });
  }, []);

  // Voor bestaande componenten die zelf navigate(pad) aanroepen.
  const navigate = useCallback((href, replace = false) => {
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin || isAppPath(url.pathname)) {
      window.location.assign(url.href);
      return;
    }
    if (url.pathname === window.location.pathname && url.hash) {
      document.getElementById(url.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    toon(url, replace ? { replace: true } : { push: true });
  }, [toon]);

  useEffect(() => {
    const onKlik = e => {
      const a = e.target.closest?.('a[href]');
      // Meetpunt: klik naar de aanmelding. Dit is nog geen aanmelding.
      if (a && new URL(a.href, window.location.href).pathname === '/register') {
        meet('registratie_klik', { pagina: window.location.pathname, tekst: a.textContent.trim().slice(0, 60) });
      }
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || isAppPath(url.pathname)) return;
      if (!vindRoute(url.pathname)) return;
      e.preventDefault();
      navigate(url.href);
    };
    const onTerug = () => toon(new URL(window.location.href));
    document.addEventListener('click', onKlik);
    window.addEventListener('popstate', onTerug);
    return () => {
      document.removeEventListener('click', onKlik);
      window.removeEventListener('popstate', onTerug);
    };
  }, [navigate, toon]);

  const { route, Pagina } = stand;
  return <Pagina key={route.path} navigate={navigate} />;
}

