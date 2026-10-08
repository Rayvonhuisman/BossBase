import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Sun, Inbox, Building2, BarChart3, Globe2, LifeBuoy, LineChart, Server, ScrollText, Search, ArrowLeft, Menu } from 'lucide-react';
import { Logo } from '../../bb-shared.jsx';
import { useToast } from '../../lib/toast.jsx';
import { bevestig } from '../../lib/bevestig.jsx';
import { roep } from './api.js';
import { SaContext } from './ui.jsx';
import './superadmin.css';

// De superadmin: losse pagina's met een eigen menu, zoals het dashboard.
//
//   /superadmin                      Vandaag
//   /superadmin/aanvragen[/<id>]     Aanvragen (pipeline), lade per aanvraag
//   /superadmin/klanten[/<id>]       Klanten, detailpagina per bedrijf
//   /superadmin/omzet                Omzet
//   /superadmin/websites[/<bedrijf>] Websites (productielijn), lade per site
//   /superadmin/support[/<tab>]      Meldpunt, vragen via Boss, prijsactie
//   /superadmin/analytics            Bezoekers, trechter, functiegebruik
//   /superadmin/systeem              Synchronisaties, mails, webhooks, taken
//   /superadmin/logboek              Elke handeling in de superadmin
//
// Beveiliging: de route in App.jsx laat alleen profiles.is_super_admin door,
// en de edge functions controleren dat opnieuw en schrijven het logboek.
// De oude link uit de mail naar info@ (/superadmin?aanvraag=<id>) opent de
// aanvraag.

const Vandaag   = lazy(() => import('./Vandaag.jsx'));
const Aanvragen = lazy(() => import('./Aanvragen.jsx'));
const Klanten   = lazy(() => import('./Klanten.jsx'));
const Klant     = lazy(() => import('./Klant.jsx'));
const Omzet     = lazy(() => import('./Omzet.jsx'));
const Websites  = lazy(() => import('./Websites.jsx'));
const Support   = lazy(() => import('./Support.jsx'));
const Analytics = lazy(() => import('./Analytics.jsx'));
const Systeem   = lazy(() => import('./Systeem.jsx'));
const Logboek   = lazy(() => import('./Logboek.jsx'));

const NAV = [
  { id: 'vandaag',   label: 'Vandaag',   icon: Sun,       sectie: 'Vandaag' },
  { id: 'aanvragen', label: 'Aanvragen', icon: Inbox,     sectie: 'Verkoop' },
  { id: 'klanten',   label: 'Klanten',   icon: Building2, sectie: 'Verkoop' },
  { id: 'websites',  label: 'Websites',  icon: Globe2,    sectie: 'Levering' },
  { id: 'support',   label: 'Support',   icon: LifeBuoy,  sectie: 'Levering' },
  { id: 'omzet',     label: 'Omzet',     icon: BarChart3, sectie: 'Inzicht' },
  { id: 'analytics', label: 'Analytics', icon: LineChart, sectie: 'Inzicht' },
  { id: 'systeem',   label: 'Systeem',   icon: Server,    sectie: 'Beheer' },
  { id: 'logboek',   label: 'Logboek',   icon: ScrollText, sectie: 'Beheer' },
];
const SECTIES = ['Vandaag', 'Verkoop', 'Levering', 'Inzicht', 'Beheer'];

export function SuperAdmin({ route, navigate, profile }) {
  // Tweede laag naast de route-guard in App.jsx.
  if (profile?.isSuperAdmin !== true) return null;
  return (
    <Schil route={route} navigate={navigate} profile={profile} />
  );
}

function Schil({ route, navigate, profile }) {
  const toast = useToast();
  const delen = route.replace(/^\/superadmin\/?/, '').split('?')[0].split('/').filter(Boolean);
  const pagina = NAV.some(n => n.id === delen[0]) ? delen[0] : 'vandaag';
  const sub = delen[1] ? decodeURIComponent(delen[1]) : null;
  const [badges, setBadges] = useState({});
  const [menuOpen, setMenuOpen] = useState(false);
  const contentRef = useRef(null);

  const ga = useCallback((pad, vervang = false) => {
    navigate(`/superadmin${pad ? `/${pad}` : ''}`, vervang);
    setMenuOpen(false);
  }, [navigate]);

  // Oude link uit de mail: /superadmin?aanvraag=<id>
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('aanvraag');
    if (id) ga(`aanvragen/${id}`, true);
  }, [ga]);

  const laadBadges = useCallback(() => {
    roep('badges').then(setBadges).catch(() => { /* badges zijn bijzaak */ });
  }, []);
  useEffect(() => { laadBadges(); const t = setInterval(laadBadges, 120000); return () => clearInterval(t); }, [laadBadges]);
  useEffect(() => { contentRef.current?.scrollTo(0, 0); }, [pagina, sub]);

  // Een handeling uitvoeren met melding en zo nodig bevestiging.
  const doe = useCallback(async (actie, extra = {}, { succes, vraag } = {}) => {
    if (vraag && !(await bevestig(vraag))) return null;
    try {
      const r = await roep(actie, extra);
      if (succes !== false) toast.success(r?.bericht || succes || 'Opgeslagen');
      laadBadges();
      return r;
    } catch (e) {
      toast.error(e.message || 'Mislukt');
      return null;
    }
  }, [toast, laadBadges]);

  const props = { sub };
  let inhoud;
  switch (pagina) {
    case 'aanvragen': inhoud = <Aanvragen {...props} />; break;
    case 'klanten':   inhoud = sub ? <Klant id={sub} /> : <Klanten />; break;
    case 'omzet':     inhoud = <Omzet />; break;
    case 'websites':  inhoud = <Websites {...props} />; break;
    case 'support':   inhoud = <Support {...props} />; break;
    case 'analytics': inhoud = <Analytics />; break;
    case 'systeem':   inhoud = <Systeem />; break;
    case 'logboek':   inhoud = <Logboek />; break;
    default:          inhoud = <Vandaag />;
  }
  const meta = NAV.find(n => n.id === pagina);

  return (
    <SaContext.Provider value={{ ga, doe, laadBadges, profile }}>
      <div className="shell">
        {menuOpen && <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.3)', zIndex: 199 }} />}
        <aside className={`sb${menuOpen ? ' open' : ''}`}>
          <div className="sb-logo"><Logo dark /><span className="badge sa-label-sb">superadmin</span></div>
          <nav className="sb-nav" aria-label="Superadmin">
            {SECTIES.map(s => (
              <div key={s}>
                <div className="sb-section">{s}</div>
                {NAV.filter(n => n.sectie === s).map(n => {
                  const Icoon = n.icon;
                  const n_ = badges[n.id];
                  return (
                    <button key={n.id} className={`sbi${pagina === n.id ? ' active' : ''}`} onClick={() => ga(n.id === 'vandaag' ? '' : n.id)} aria-current={pagina === n.id ? 'page' : undefined}>
                      <span className="sbi-icon"><Icoon size={16} /></span>
                      <span className="sbi-label">{n.label}</span>
                      {n_ > 0 && <span className="sbi-badge">{n_}</span>}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className="sb-user">
            <button className="sbi" style={{ margin: 0 }} onClick={() => navigate('/dashboard')}>
              <span className="sbi-icon"><ArrowLeft size={16} /></span><span className="sbi-label">Naar mijn dashboard</span>
            </button>
          </div>
        </aside>
        <div className="main">
          <header className="topbar">
            <div className="tb-left">
              <button className="hbg ib" onClick={() => setMenuOpen(true)} aria-label="Menu"><Menu size={18} /></button>
              <div><div className="tb-title">{meta?.label}</div><div className="tb-sub">Superadmin · {profile?.fullName || profile?.full_name || ''}</div></div>
            </div>
            <div className="tb-right"><Zoeken ga={ga} /></div>
          </header>
          <div className="content" ref={contentRef}>
            <div style={{ maxWidth: 1240, margin: '0 auto' }}>
              <Suspense fallback={<div className="lsec-empty">Laden…</div>}>{inhoud}</Suspense>
            </div>
          </div>
        </div>
      </div>
    </SaContext.Provider>
  );
}

// Zoeken op bedrijf, persoon, e-mail of telefoon: als iemand belt.
function Zoeken({ ga }) {
  const [q, setQ] = useState('');
  const [treffers, setTreffers] = useState([]);
  useEffect(() => {
    if (q.trim().length < 2) { setTreffers([]); return; }
    let weg = false;
    const t = setTimeout(() => {
      roep('zoek', { q }).then(r => { if (!weg) setTreffers(r.treffers || []); }).catch(() => {});
    }, 250);
    return () => { weg = true; clearTimeout(t); };
  }, [q]);
  const kies = t => { ga(t.soort === 'klant' ? `klanten/${t.id}` : `aanvragen/${t.id}`); setQ(''); setTreffers([]); };
  return (
    <div style={{ position: 'relative' }}>
      <div className="search" style={{ minWidth: 300 }}>
        <Search size={15} />
        <input type="search" name="sa-zoeken" autoComplete="off" placeholder="Zoek bedrijf, persoon, e-mail of telefoon" value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') setQ(''); if (e.key === 'Enter' && treffers[0]) kies(treffers[0]); }} />
      </div>
      {treffers.length > 0 && (
        <div className="tb-search-pop">
          {treffers.map(t => (
            <button key={`${t.soort}-${t.id}`} className="sa-treffer" onClick={() => kies(t)}>
              <div className="lrow-title">{t.titel}</div><div className="lrow-sub">{t.sub}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
