import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Wrench, AlertTriangle } from 'lucide-react';
import { I, Logo, initials } from './bb-shared.jsx';
import { LoginPage, RegisterFlow, EmailVerificationScreen } from './pages/BbAuth.jsx';
import { ResetPasswordPage } from './pages/ResetPasswordPage.jsx';
import { UitnodigingPage } from './pages/UitnodigingPage.jsx';
import OfferteSigneren from './pages/OfferteSigneren.jsx';
import { DashboardHome } from './pages/dashboard/DashboardHome.jsx';
import { Pipeline } from './pages/BbDashboard.jsx';
import { DealDetailDrawer } from './pages/dashboard/DealDetailDrawer.jsx';
import { CalendarEventDetailDrawer } from './pages/dashboard/CalendarEventDetailDrawer.jsx';
import { PageErrorBoundary } from './components/PageErrorBoundary.jsx';
import { CustomerPage, CustomersPage, ActivitiesPage } from './pages/BbPages1.jsx';
import { ActivitiesPageV2 } from './pages/ActivitiesPageV2.jsx';
// Zware pagina's (recharts, exceljs, jszip, jspdf) lazy laden → uit de eerste bundle.
const CalendarPage = lazy(() => import('./pages/BbPages2.jsx').then(m => ({ default: m.CalendarPage })));
const CostsPage    = lazy(() => import('./pages/BbPages2.jsx').then(m => ({ default: m.CostsPage })));
const RevenuePage  = lazy(() => import('./pages/BbPages2.jsx').then(m => ({ default: m.RevenuePage })));
import { InstellingenPage } from './pages/InstellingenPage.jsx';
import { TeamPage } from './pages/TeamPage.jsx';
const OffertesPage = lazy(() => import('./pages/OffertesPage.jsx').then(m => ({ default: m.OffertesPage })));
const FacturenPage = lazy(() => import('./pages/FacturenPage.jsx').then(m => ({ default: m.FacturenPage })));
import { UrenPageV2 as UrenPage } from './pages/UrenPageV2.jsx';
import { WerkbonPageV2 as WerkbonPage } from './pages/WerkbonPageV2.jsx';
import { PlanningPage } from './pages/PlanningPage.jsx';
import { ProjectsPage } from './pages/ProjectsPage.jsx';
const DatabasePage = lazy(() => import('./pages/DatabasePage.jsx').then(m => ({ default: m.DatabasePage })));
import MarketingWebsite from './pages/MarketingWebsite.jsx';
import FeaturesPage from './pages/marketing/FeaturesPage.jsx';
import PricingPage from './pages/marketing/PricingPage.jsx';
import IndustriesPage from './pages/marketing/IndustriesPage.jsx';
import AboutPage from './pages/marketing/AboutPage.jsx';
import ContactPage from './pages/marketing/ContactPage.jsx';
import FaqPage from './pages/marketing/FaqPage.jsx';
import DemoPage from './pages/DemoPage.jsx';
import { SuperAdminPage } from './pages/SuperAdminPage.jsx';
import { createMissingProfile, getSession, logout, onAuthStateChange } from './services/authService.js';
import { getCurrentUserContext } from './services/profileService.js';
import { getUserPermissions } from './services/permissionsService.js';
import { usePermissions } from './hooks/usePermissions.js';
import { clearCompanyId, setCompanyId } from './lib/currentCompany.js';
import { ToastProvider, useToast } from './lib/toast.jsx';
import { UploadProvider } from './lib/uploadContext.jsx';
import { CookieBanner } from './components/CookieBanner.jsx';
import { UrenHerinneringModal } from './components/UrenHerinneringModal.jsx';
import { CookieverklaringPage } from './pages/CookieverklaringPage.jsx';
import { ProfileContext, displayName, profileInitials } from './lib/profileContext.jsx';
import { DataContext, useData } from './lib/dataContext.jsx';
import MobileBlock from './components/MobileBlock.jsx';
import { listCustomers } from './services/customerService.js';
import { listDeals, listPipelineStages } from './services/dealService.js';
import { listActivities } from './services/activityService.js';
import { getOffertes } from './services/offerteService.js';
import { getWerkbonnen } from './services/werkbonService.js';
import { getFacturen } from './services/factuurService.js';
import { listJobCosts } from './services/jobCostService.js';
import { listCalendarEvents } from './services/calendarService.js';
import { ActivityEditModal, NewActivityModal, NewLeadModal, ProfileModal } from './components/SharedModals.jsx';
import { supabase } from './lib/supabase.js';
import { listNotifications, markNotificationRead, markAllNotificationsRead } from './services/notificatieService.js';

// Timing-debug voor de auth/permissie-laadvolgorde. Standaard uit; aanzetten
// met `localStorage.setItem('bb_debug_auth','1')` + hard refresh om de volgorde
// in de console te zien. Schrijft niets als de vlag uit staat.
const authLog = (...args) => {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('bb_debug_auth')) {
      // eslint-disable-next-line no-console
      console.log(`[bb:auth +${Math.round(performance.now())}ms]`, ...args);
    }
  } catch { /* ignore */ }
};

// ── NAV CONFIG ───────────────────────────────────────────────
// permission: als gezet, verberg item als gebruiker dat recht niet heeft
const NAV = [
  { id: 'dashboard',   label: 'Dashboard',    icon: 'dash',    section: 'main' },
  { id: 'pipeline',    label: 'Pipeline',     icon: 'pipe',    section: 'main', permission: 'verkoop' },
  { id: 'customers',   label: 'Klanten',      icon: 'cust',    section: 'main' },
  { id: 'activities',  label: 'Activiteiten', icon: 'act',     section: 'main' },
  { id: 'calendar',    label: 'Agenda',        icon: 'cal',     section: 'work' },
  { id: 'planning',    label: 'Planning',      icon: 'planning',section: 'work', permission: 'planning' },
  { id: 'projecten',   label: 'Projecten',     icon: 'projects',section: 'work' },
  { id: 'werkbonnen',  label: 'Werkbonnen',    icon: 'wo',      section: 'work' },
  { id: 'uren',        label: 'Uren',          icon: 'hours',   section: 'work' },
  { id: 'offertes',    label: 'Offertes',      icon: 'quotes',  section: 'finance', permission: 'offertes' },
  { id: 'facturen',    label: 'Facturen',      icon: 'brief',   section: 'finance', permission: 'facturen' },
  { id: 'costs',       label: 'Kosten',        icon: 'euro',    section: 'finance', permission: 'kosten' },
  { id: 'revenue',     label: 'Financiën',     icon: 'chart',   section: 'finance', permission: 'bedrijfsfinancien' },
  { id: 'database',    label: 'Database',      icon: 'db',      section: 'bedrijf', permission: 'database' },
  { id: 'team',        label: 'Team',          icon: 'team',    section: 'bedrijf', permission: 'team' },
  { id: 'instellingen',label: 'Instellingen',  icon: 'settings',section: 'bedrijf', permission: 'instellingen' },
];

// Pagina's die een bepaald recht vereisen voor toegang
const PROTECTED_PAGES = {
  pipeline:    'verkoop',
  offertes:    'offertes',
  facturen:    'facturen',
  costs:       'kosten',
  revenue:     'bedrijfsfinancien',
  planning:    'planning',
  database:    'database',
  team:        'team',
  // 'instellingen' is NIET beschermd: iedereen mag "Mijn profiel" beheren
  // (incl. account verwijderen). De bedrijfs-tabs binnen Instellingen zijn
  // zelf afgeschermd op het 'instellingen'-recht.
};

const SECTIONS = [
  { id: 'main',    label: 'Hoofdmenu' },
  { id: 'work',    label: 'Uitvoering' },
  { id: 'finance', label: 'Financieel' },
  { id: 'bedrijf', label: 'Bedrijf' },
];

// ── SIDEBAR ──────────────────────────────────────────────────
function Sidebar({ page, setPage, open, onClose, onLogout, profile, user, loading, onOpenProfile, badges = {}, collapsed, onToggleCollapsed }) {
  const { can } = usePermissions();
  const go = id => { setPage(id); onClose(); };
  const initials = profileInitials(profile, user);
  const name = displayName(profile, user);
  const roleLabel = profile?.role
    ? `${profile.role.charAt(0).toUpperCase() + profile.role.slice(1)} · BossBase`
    : 'Profiel openen';
  const navRef = useRef(null);
  useEffect(() => {
    if (!navRef.current) return;
    const active = navRef.current.querySelector('.sbi.active');
    if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [page]);

  // Sidebar-toggle tooltip — rendered as a real fixed-positioned element so
  // it escapes the sidebar's overflow-x:hidden clipping (a pseudo-element
  // would get cut off at the sidebar's right edge).
  const [toggleTip, setToggleTip] = useState(null);
  const showToggleTip = e => {
    const r = e.currentTarget.getBoundingClientRect();
    setToggleTip({ x: r.right + 10, y: r.top + r.height / 2 });
  };
  const hideToggleTip = () => setToggleTip(null);

  const [navTip, setNavTip] = useState(null);
  const showNavTip = (e, label) => {
    const r = e.currentTarget.getBoundingClientRect();
    setNavTip({ x: r.right + 8, y: r.top + r.height / 2, label });
  };
  const hideNavTip = () => setNavTip(null);

  return (
    <>
      {open && (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.3)', zIndex: 199 }} />
      )}
      <aside className={`sb${open ? ' open' : ''}${collapsed ? ' collapsed' : ''}`}>
        <div className="sb-logo">
          <Logo dark />
          <button
            type="button"
            className="sb-toggle"
            onClick={onToggleCollapsed}
            onMouseEnter={showToggleTip}
            onMouseLeave={hideToggleTip}
            onFocus={showToggleTip}
            onBlur={hideToggleTip}
            aria-label={collapsed ? 'Zijbalk uitklappen' : 'Zijbalk inklappen'}
            aria-pressed={collapsed}
          >
            <span className="sb-toggle-icon">{I.sb_panel}</span>
          </button>
          {toggleTip && createPortal(
            <span className="sb-toggle-tip" style={{ left: toggleTip.x, top: toggleTip.y }}>
              {collapsed ? 'Uitklappen' : 'Inklappen'}
            </span>,
            document.body
          )}
          {navTip && createPortal(
            <span className="sb-toggle-tip" style={{ left: navTip.x, top: navTip.y }}>
              {navTip.label}
            </span>,
            document.body
          )}
        </div>

        <nav className="sb-nav" ref={navRef}
          onMouseEnter={e => e.currentTarget.classList.add('hov')}
          onMouseLeave={e => e.currentTarget.classList.remove('hov')}>
          {SECTIONS.map(sec => {
            const items = NAV.filter(n => {
              if (n.section !== sec.id) return false;
              if (n.permission && !can(n.permission)) return false;
              return true;
            });
            if (items.length === 0) return null;
            return (
              <div key={sec.id}>
                <div className="sb-section">{sec.label}</div>
                {items.map(item => {
                  const badge = badges[item.id] > 0 ? badges[item.id] : null;
                  return (
                    <button
                      key={item.id}
                      className={`sbi${page === item.id ? ' active' : ''}`}
                      onClick={() => go(item.id)}
                      aria-label={item.label}
                      onMouseEnter={collapsed ? e => showNavTip(e, item.label) : undefined}
                      onMouseLeave={collapsed ? hideNavTip : undefined}
                    >
                      <span className="sbi-icon">{I[item.icon]}</span>
                      <span className="sbi-label">{item.label}</span>
                      {badge && <span className="sbi-badge">{badge}</span>}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="sb-user">
          <button onClick={() => { setPage('instellingen'); onClose(); }} aria-label="Naar instellingen" style={{ flex: 1, minWidth: 0 }}>
            {loading && !initials
              ? <div className="av av-md av-0 bb-skel-av" />
              : profile?.avatarUrl
                ? <img src={profile.avatarUrl} alt={name || 'Profiel'} className="av av-md" style={{ objectFit: 'cover' }} />
                : <div className="av av-md av-0">{initials}</div>}
            <div className="user-info" style={{ flex: 1, minWidth: 0 }}>
              {loading && !name
                ? <div className="bb-skel bb-skel-line" style={{ width: '70%' }} />
                : <div className="user-name">{name || 'Profiel'}</div>}
              <div className="user-role">{loading && !profile ? 'Profiel laden…' : roleLabel}</div>
            </div>
          </button>
          <button className="sb-logout-btn" onClick={onLogout} aria-label="Uitloggen" title="Uitloggen">
            {I.logout}
          </button>
        </div>
      </aside>
    </>
  );
}

// ── TOPBAR ───────────────────────────────────────────────────
function Topbar({ pageMeta, profile, user, loading, onHamburger, onOpenProfile, onLogout, openCustomer, navigatePage, refreshKey }) {
  const { customers: dCustomers, deals: dDeals, activities: dActivities, offertes: dOffertes, werkbonnen: dWerkbonnen, refresh: refreshData } = useData();
  const [openMenu, setOpenMenu] = useState(null);
  const [search, setSearch] = useState('');
  const [notifActivity, setNotifActivity] = useState(null);
  const [dbNotifs, setDbNotifs] = useState([]);
  const [markingAll, setMarkingAll] = useState(false);
  const wrapRef = useRef(null);

  const close = () => setOpenMenu(null);

  useEffect(() => {
    const onClick = e => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) close();
    };
    if (openMenu) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [openMenu]);

  // Zoekdata komt uit de gedeelde DataContext — geen eigen queries meer.
  const searchData = useMemo(
    () => ({ customers: dCustomers, deals: dDeals, activities: dActivities }),
    [dCustomers, dDeals, dActivities]
  );
  const searchLoading = false;
  const searchError = '';
  const loadSearchData = () => {}; // no-op: data wordt al gedeeld geladen
  const notifCustomers = dCustomers;

  // Ephemere notificaties afgeleid uit gedeelde data — geen extra queries.
  const notifData = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return {
      overdue: dActivities.filter(a => a.status !== 'completed' && a.status !== 'done' && a.dueAt && a.dueAt.slice(0, 10) < today).slice(0, 5),
      today: dActivities.filter(a => a.dueAt?.slice(0, 10) === today && a.status !== 'completed' && a.status !== 'done').slice(0, 5),
      leads: dDeals.filter(d => d.stage === 'new_lead').slice(0, 5),
      offertes: dOffertes.filter(o => o.status === 'concept' || o.status === 'verzonden').slice(0, 3),
      werkbonnen: dWerkbonnen.filter(w => w.geplandOp === today && w.status !== 'afgerond').slice(0, 3),
    };
  }, [dActivities, dDeals, dOffertes, dWerkbonnen]);

  // DB-notificaties (mentions/toewijzingen): pas laden wanneer de bel opent.
  const loadDbNotifs = useCallback(async () => {
    try { setDbNotifs(await listNotifications()); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (openMenu === 'notif') loadDbNotifs();
  }, [openMenu, loadDbNotifs]);

  // Realtime subscription on notifications table
  useEffect(() => {
    if (!profile?.id) return;
    const channel = supabase
      .channel(`notif-${profile.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${profile.id}`,
      }, payload => {
        setDbNotifs(prev => [{
          id: payload.new.id,
          userId: payload.new.user_id,
          type: payload.new.type,
          title: payload.new.title,
          body: payload.new.body || '',
          link: payload.new.link || '',
          relatedType: payload.new.related_type || '',
          relatedId: payload.new.related_id || null,
          createdBy: payload.new.created_by || null,
          createdByName: '',
          readAt: null,
          createdAt: payload.new.created_at,
        }, ...prev]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile?.id]);

  const onSearchChange = v => {
    setSearch(v);
  };

  const filteredSearch = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    const match = (s = '') => String(s).toLowerCase().includes(q);
    return {
      customers: searchData.customers.filter(c => match(c.name) || match(c.company) || match(c.email) || match(c.city)).slice(0, 6),
      deals: searchData.deals.filter(d => match(d.title) || match(d.customerName) || match(d.city)).slice(0, 6),
      activities: searchData.activities.filter(a => match(a.title) || match(a.customerName)).slice(0, 6),
    };
  }, [search, searchData]);

  const totalNotifs = notifData.overdue.length + notifData.today.length + notifData.leads.length + notifData.offertes.length + notifData.werkbonnen.length;
  const dbUnread = dbNotifs.filter(n => !n.readAt).length;
  const hasUnread = totalNotifs > 0 || dbUnread > 0;

  return (
    <>
    <header className="topbar" ref={wrapRef}>
      <div className="tb-left">
        <button className="hbg ib" onClick={onHamburger}>{I.menu}</button>
        <div>
          <div className="tb-title">{pageMeta.title}</div>
          <div className="tb-sub">{pageMeta.sub}</div>
        </div>
      </div>
      <div className="tb-right">
        <div className="tb-search-wrap">
          <div className="search">
            {I.search}
            <input
              placeholder="Zoeken op klant, deal of activiteit…"
              value={search}
              onFocus={() => { if (!searchData.customers.length) loadSearchData(); setOpenMenu('search'); }}
              onChange={e => onSearchChange(e.target.value)}
            />
          </div>
          {openMenu === 'search' && (
            <div className="tb-search-pop">
              {searchLoading && <div className="tb-pop-empty">Zoeken…</div>}
              {searchError && <div className="tb-pop-empty" style={{ color: '#dc2626' }}>{searchError}</div>}
              {!searchLoading && !searchError && !filteredSearch && (
                <div className="tb-pop-empty">Typ om te zoeken in klanten, deals en activiteiten.</div>
              )}
              {!searchLoading && filteredSearch && (() => {
                const { customers, deals, activities } = filteredSearch;
                const total = customers.length + deals.length + activities.length;
                if (total === 0) return <div className="tb-pop-empty">Geen resultaten gevonden</div>;
                return (
                  <>
                    {customers.length > 0 && (
                      <>
                        <div className="tb-search-section">Klanten</div>
                        {customers.map(c => (
                          <button key={`c-${c.id}`} className="tb-pop-item" onClick={() => { close(); setSearch(''); openCustomer(c.id); }}>
                            <div className="tb-pop-icon">{initials(c.name)}</div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div className="tb-pop-title">{c.name}</div>
                              <div className="tb-pop-sub">{c.company || c.email || c.city || 'Klant'}</div>
                            </div>
                          </button>
                        ))}
                      </>
                    )}
                    {deals.length > 0 && (
                      <>
                        <div className="tb-search-section">Deals</div>
                        {deals.map(d => (
                          <button key={`d-${d.id}`} className="tb-pop-item" onClick={() => { close(); setSearch(''); navigatePage('pipeline'); if (d.custId) openCustomer(d.custId); }}>
                            <div className="tb-pop-icon blue">{I.pipe}</div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div className="tb-pop-title">{d.title}</div>
                              <div className="tb-pop-sub">{d.customerName || 'Onbekende klant'} · €{d.value || 0}</div>
                            </div>
                          </button>
                        ))}
                      </>
                    )}
                    {activities.length > 0 && (
                      <>
                        <div className="tb-search-section">Activiteiten</div>
                        {activities.map(a => (
                          <button key={`a-${a.id}`} className="tb-pop-item" onClick={() => { close(); setSearch(''); navigatePage('activities'); }}>
                            <div className="tb-pop-icon">{I.act}</div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div className="tb-pop-title">{a.title}</div>
                              <div className="tb-pop-sub">{a.customerName || 'Geen klant'} · {a.date || '—'}</div>
                            </div>
                          </button>
                        ))}
                      </>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>
        <div className="tb-anchor">
          <button className="ib" title="Meldingen" onClick={() => setOpenMenu(m => m === 'notif' ? null : 'notif')}>
            {I.bell}
            {hasUnread && <span className="ndot" />}
          </button>
          {openMenu === 'notif' && (
            <div className="tb-pop">
              <div className="tb-pop-hd">
                <span>Notificaties{dbUnread > 0 ? ` · ${dbUnread} ongelezen` : ''}</span>
                {dbUnread > 0 && (
                  <button
                    className="btn btn-ghost btn-xs"
                    disabled={markingAll}
                    onClick={async () => {
                      setMarkingAll(true);
                      await markAllNotificationsRead().catch(() => {});
                      await loadDbNotifs();
                      setMarkingAll(false);
                    }}
                    style={{ fontSize: 11 }}
                  >
                    Alles gelezen
                  </button>
                )}
              </div>
              <div className="tb-pop-list">
                {/* ── DB-backed notifications ── */}
                {dbNotifs.length === 0 && totalNotifs === 0 && (
                  <div className="tb-pop-empty">Geen nieuwe notificaties</div>
                )}
                {dbNotifs.map(n => {
                  const isUnread = !n.readAt;
                  const icon = n.type === 'mention' ? '@'
                    : n.type.startsWith('toewijzing') ? '→' : '●';
                  const handleClick = async () => {
                    if (isUnread) {
                      await markNotificationRead(n.id).catch(() => {});
                      setDbNotifs(prev => prev.map(x => x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x));
                    }
                    close();
                    if (n.link) {
                      const parts = n.link.split('/');
                      if (parts[0]) navigatePage(parts[0]);
                    }
                  };
                  const ago = (() => {
                    const diff = Date.now() - new Date(n.createdAt).getTime();
                    const m = Math.floor(diff / 60000);
                    if (m < 1) return 'zojuist';
                    if (m < 60) return `${m} min geleden`;
                    const h = Math.floor(m / 60);
                    if (h < 24) return `${h} uur geleden`;
                    return `${Math.floor(h / 24)} dagen geleden`;
                  })();
                  return (
                    <button key={n.id} className="tb-pop-item" onClick={handleClick}
                      style={{ background: isUnread ? 'var(--pll)' : undefined }}>
                      <div className="tb-pop-icon" style={{ background: n.type === 'mention' ? 'var(--p)' : undefined, color: n.type === 'mention' ? '#fff' : undefined, fontWeight: 800 }}>
                        {icon}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="tb-pop-title">{n.title}</div>
                        {n.body && <div className="tb-pop-sub" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.body}</div>}
                        <div style={{ fontSize: 10, color: 'var(--dl)', marginTop: 2 }}>{ago}</div>
                      </div>
                      {isUnread && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--p)', flexShrink: 0 }} />}
                    </button>
                  );
                })}

                {/* ── Ephemere notificaties (activiteiten, leads, etc.) ── */}
                {(totalNotifs > 0 && dbNotifs.length > 0) && (
                  <div style={{ padding: '4px 14px', fontSize: 10, fontWeight: 700, color: 'var(--dl)', textTransform: 'uppercase', letterSpacing: '.06em', borderTop: '1px solid var(--border)', marginTop: 4 }}>
                    Automatisch
                  </div>
                )}
                {notifData.overdue.map(a => (
                  <button key={`o-${a.id}`} className="tb-pop-item" onClick={() => { close(); setNotifActivity(a); }}>
                    <div className="tb-pop-icon warn">!</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="tb-pop-title">Te laat: {a.title}</div>
                      <div className="tb-pop-sub">{a.customerName || 'Geen klant'} · {a.date}</div>
                    </div>
                  </button>
                ))}
                {notifData.today.map(a => (
                  <button key={`t-${a.id}`} className="tb-pop-item" onClick={() => { close(); setNotifActivity(a); }}>
                    <div className="tb-pop-icon">{I.clock}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="tb-pop-title">Vandaag: {a.title}</div>
                      <div className="tb-pop-sub">{a.customerName || 'Geen klant'} · {a.time || ''}</div>
                    </div>
                  </button>
                ))}
                {notifData.leads.map(d => (
                  <button key={`l-${d.id}`} className="tb-pop-item" onClick={() => { close(); navigatePage('pipeline'); }}>
                    <div className="tb-pop-icon blue">{I.plus}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="tb-pop-title">Nieuwe aanvraag: {d.title}</div>
                      <div className="tb-pop-sub">{d.customerName || 'Onbekende klant'}</div>
                    </div>
                  </button>
                ))}
                {notifData.offertes.map(o => (
                  <button key={`of-${o.id}`} className="tb-pop-item" onClick={() => { close(); navigatePage('offertes'); }}>
                    <div className="tb-pop-icon">{I.quotes}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="tb-pop-title">Offerte {o.status}: {o.nummer || o.omschrijving || '—'}</div>
                      <div className="tb-pop-sub">{o.customerName || 'Geen klant'}</div>
                    </div>
                  </button>
                ))}
                {notifData.werkbonnen.map(w => (
                  <button key={`wb-${w.id}`} className="tb-pop-item" onClick={() => { close(); navigatePage('werkbonnen'); }}>
                    <div className="tb-pop-icon">{I.wo}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="tb-pop-title">Werkbon vandaag: {w.titel}</div>
                      <div className="tb-pop-sub">{w.customerName || 'Geen klant'} · {w.locatie || ''}</div>
                    </div>
                  </button>
                ))}
              </div>
              <div className="tb-pop-foot">
                <button className="btn btn-ghost btn-xs" onClick={() => { close(); navigatePage('activities'); }}>
                  Alle activiteiten {I.arrow_r}
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="tb-anchor">
          <button
            className="tb-av"
            title={displayName(profile, user) || (loading ? 'Profiel laden…' : 'Profiel')}
            onClick={() => setOpenMenu(m => m === 'profile' ? null : 'profile')}
            style={profile?.avatarUrl ? { backgroundImage: `url(${profile.avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center', color: 'transparent' } : undefined}
          >
            {loading && !profileInitials(profile, user)
              ? <span className="bb-skel-av" style={{ width: '100%', height: '100%', borderRadius: '50%' }} />
              : profile?.avatarUrl ? '' : profileInitials(profile, user)}
          </button>
          {openMenu === 'profile' && (
            <div className="tb-pop" style={{ minWidth: 240 }}>
              <div className="tb-pop-user">
                {profile?.avatarUrl
                  ? <img src={profile.avatarUrl} alt={displayName(profile, user) || 'Profiel'} className="av av-lg" style={{ objectFit: 'cover' }} />
                  : <div className="av av-lg av-0">{profileInitials(profile, user)}</div>}
                <div style={{ minWidth: 0 }}>
                  <div className="tb-pop-name">
                    {displayName(profile, user) || (loading ? 'Profiel laden…' : 'Profiel')}
                  </div>
                  <div className="tb-pop-meta">{profile?.email || user?.email || 'Niet ingelogd'}</div>
                </div>
              </div>
              <div className="tb-pop-menu">
                <button onClick={() => { close(); onOpenProfile(); }}>{I.cust} Mijn profiel</button>
                <button onClick={() => { close(); navigatePage('revenue'); }}>{I.chart} Financiën</button>
                <div className="menu-divider" />
                <button className="danger" onClick={() => { close(); onLogout(); }}>{I.logout} Uitloggen</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
    {notifActivity && (
      <ActivityEditModal
        activity={notifActivity}
        customers={notifCustomers}
        onClose={() => setNotifActivity(null)}
        onSaved={updated => { setNotifActivity(null); refreshData(); }}
        onDeleted={() => { setNotifActivity(null); refreshData(); }}
      />
    )}
    </>
  );
}

// ── CUSTOMER DRAWER ──────────────────────────────────────────
function CustomerDrawer({ custId, initialTab, onClose, setPage }) {
  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-body">
          <CustomerPage custId={custId} initialTab={initialTab} onClose={onClose} setPage={setPage} />
        </div>
      </div>
    </>
  );
}

// ── DEAL DRAWER ──────────────────────────────────────────────
function DealDrawer({ dealId, onClose, setPage, openCustomer }) {
  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-body">
          <DealDetailDrawer dealId={dealId} onClose={onClose} setPage={setPage} openCustomer={openCustomer} />
        </div>
      </div>
    </>
  );
}

// ── CALENDAR EVENT DRAWER ────────────────────────────────────
function CalEventDrawer({ eventId, onClose, setPage, openCustomer, openDeal }) {
  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-body">
          <CalendarEventDetailDrawer eventId={eventId} onClose={onClose} setPage={setPage} openCustomer={openCustomer} openDeal={openDeal} />
        </div>
      </div>
    </>
  );
}

// ── MOBILE MEER MENU ─────────────────────────────────────────
function MeerMenu({ page, onNavigate, onClose, profile }) {
  const { can } = usePermissions();

  const financeItems = [
    can('kosten')     && { id: 'costs',    label: 'Kosten',    icon: I.costs },
    can('bedrijfsfinancien') && { id: 'revenue',  label: 'Financiën', icon: I.chart },
    can('facturen')   && { id: 'facturen', label: 'Facturen',  icon: I.brief },
    can('offertes')   && { id: 'offertes', label: 'Offertes',  icon: I.quotes },
  ].filter(Boolean);

  const bedrijfItems = [
    can('team')          && { id: 'team',         label: 'Team',         icon: I.team },
    can('instellingen')  && { id: 'instellingen', label: 'Instellingen', icon: I.settings },
  ].filter(Boolean);

  const groups = [
    {
      label: 'Uitvoering',
      items: [
        { id: 'calendar',   label: 'Agenda',     icon: I.cal },
        { id: 'projecten',  label: 'Projecten',  icon: I.projects },
        { id: 'werkbonnen', label: 'Werkbonnen', icon: I.wo },
        { id: 'uren',       label: 'Uren',       icon: I.hours },
      ],
    },
    ...(financeItems.length > 0 ? [{ label: 'Financieel', items: financeItems }] : []),
    ...(bedrijfItems.length > 0 ? [{ label: 'Bedrijf',   items: bedrijfItems }] : []),
  ];

  return (
    <div className="meer-overlay open" onClick={onClose}>
      <div className="meer-sheet" onClick={e => e.stopPropagation()}>
        <div className="meer-grabber">
          <div className="meer-grabber-bar" />
        </div>
        {groups.map(g => (
          <div key={g.label}>
            <div className="meer-section-label">{g.label}</div>
            <div className="meer-section-card">
              {g.items.map(item => {
                const isActive = page === item.id;
                return (
                  <button
                    key={item.id}
                    className="meer-row"
                    style={isActive ? { background: '#f0fdf4', color: '#15A34A' } : {}}
                    onClick={() => onNavigate(item.id)}
                  >
                    <span className="meer-row-icon" style={isActive ? { background: '#dcfce7', color: '#15A34A' } : {}}>{item.icon}</span>
                    <span className="meer-row-label" style={isActive ? { color: '#15A34A', fontWeight: 700 } : {}}>{item.label}</span>
                    <span className="meer-row-chev">{I.chev_r}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <div style={{ height: 8 }} />
      </div>
    </div>
  );
}

// ── MOBILE BOTTOM NAV ─────────────────────────────────────────
const MEER_PAGE_IDS = ['calendar','projecten','werkbonnen','uren','costs','revenue','facturen','offertes','team','instellingen'];

function MobileBottomNav({ page, setPage, badges = {}, profile, can }) {
  const [showMeer, setShowMeer] = useState(false);
  const isOnMeerPage = MEER_PAGE_IDS.includes(page);

  const items = [
    { id: 'dashboard',  label: 'Dashboard',    icon: I.dash },
    { id: 'pipeline',   label: 'Pipeline',     icon: I.pipe,  badge: badges.pipeline, permission: 'verkoop' },
    { id: 'customers',  label: 'Klanten',      icon: I.cust },
    { id: 'activities', label: 'Activiteiten', icon: I.act,   badge: badges.activities },
    { id: 'meer',       label: 'Meer',         icon: I.meer },
  ].filter(it => !it.permission || !can || can(it.permission));

  const go = id => { setPage(id); setShowMeer(false); };

  return (
    <>
      <nav className="bnav" aria-label="Mobiele navigatie">
        {items.map(item => {
          const isActive = item.id === 'meer'
            ? (isOnMeerPage || showMeer)
            : page === item.id;
          return (
            <button
              key={item.id}
              className={`bnav-item${isActive ? ' active' : ''}`}
              onClick={() => item.id === 'meer' ? setShowMeer(v => !v) : go(item.id)}
              aria-label={item.label}
            >
              {item.badge > 0 && (
                <span className="bnav-badge">{item.badge > 99 ? '99+' : item.badge}</span>
              )}
              {item.icon}
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      {showMeer && (
        <MeerMenu
          page={page}
          onNavigate={go}
          onClose={() => setShowMeer(false)}
          profile={profile}
        />
      )}
    </>
  );
}

// Mobiel = smal scherm (< 768px). Tablets in landscape (≥768px) blijven als
// desktop behandeld. Het dashboard is verplaatst naar een aparte app; op
// mobiel tonen we het download-scherm i.p.v. het dashboard.
const MOBILE_BREAKPOINT = 768;
function useIsMobile() {
  const getMatch = () => typeof window !== 'undefined'
    && window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`).matches;
  const [isMobile, setIsMobile] = useState(getMatch);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener ? mq.addEventListener('change', onChange) : mq.addListener(onChange);
    return () => { mq.removeEventListener ? mq.removeEventListener('change', onChange) : mq.removeListener(onChange); };
  }, []);
  return isMobile;
}

// ── INNER APP ────────────────────────────────────────────────
function AppInner() {
  const toast = useToast();
  const isMobile = useIsMobile();
  const [route,      setRoute]      = useState(() => window.location.pathname || '/');
  const [session,    setSession]    = useState(null);
  const [authReady,  setAuthReady]  = useState(false);
  const [page,       setPage]       = useState(() => {
    const path = window.location.pathname;
    if (path.startsWith('/dashboard/')) {
      const sub = path.slice('/dashboard/'.length).split('/')[0];
      const VALID = ['pipeline','customers','activities','calendar','planning','projecten','werkbonnen','uren','costs','revenue','facturen','offertes','database','team','instellingen'];
      if (VALID.includes(sub)) return sub;
    }
    return 'dashboard';
  });
  const [sbOpen,     setSbOpen]     = useState(false);
  const [sbCollapsed, setSbCollapsed] = useState(() => {
    try { return localStorage.getItem('bb.sidebarCollapsed') === '1'; }
    catch { return false; }
  });
  const [drawerCust, setDrawerCust] = useState(null); // { id, tab? }

  const [drawerDeal, setDrawerDeal] = useState(null);
  const [drawerCalEvent, setDrawerCalEvent] = useState(null);
  const [navIntent,  setNavIntent]  = useState(null);
  // Terug-naar-klant context: { page, klantId, klantNaam }. Blijft staan tot je
  // ergens anders heen navigeert of op "Terug" klikt (niet gewist door navIntent).
  const [backCtx,    setBackCtx]    = useState(null);
  const [user,       setUser]       = useState(null);
  const [profile,    setProfile]    = useState(null);
  const [company,    setCompany]    = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError,   setProfileError]   = useState(null);
  const [userPermissions, setUserPermissions] = useState([]);
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
  const [repairing,  setRepairing]  = useState(false);
  const [openProfile, setOpenProfile] = useState(false);
  const [globalLeadModal, setGlobalLeadModal] = useState(false);
  const [globalActivityModal, setGlobalActivityModal] = useState(null);
  const [globalCustomers, setGlobalCustomers] = useState([]);
  const [globalDeals, setGlobalDeals] = useState([]);
  const [globalStages, setGlobalStages] = useState([]);
  const [globalActivities, setGlobalActivities] = useState([]);
  const [globalOffertes, setGlobalOffertes] = useState([]);
  const [globalWerkbonnen, setGlobalWerkbonnen] = useState([]);
  const [globalCalendarEvents, setGlobalCalendarEvents] = useState([]);
  const [globalFacturen, setGlobalFacturen] = useState([]);
  const [globalJobCosts, setGlobalJobCosts] = useState([]);
  const [globalDataLoading, setGlobalDataLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const PAGE_META = useMemo(() => {
    const name = displayName(profile, user);
    const greet = name ? `Goedemorgen, ${name}` : profileLoading ? 'Profiel laden…' : 'Welkom terug';
    return {
      dashboard:  { title: 'Dashboard',    sub: greet },
      pipeline:   { title: 'Pipeline',     sub: 'Jouw sales & werk overzicht' },
      customers:  { title: 'Klanten',      sub: 'CRM — alle klantprofielen' },
      activities: { title: 'Activiteiten', sub: 'Openstaande activiteiten en taken' },
      calendar:    { title: 'Agenda',        sub: 'Planning en afspraken' },
      planning:    { title: 'Planning',     sub: 'Weekplanning per medewerker en voertuig' },
      projecten:   { title: 'Projecten',    sub: 'Beheer projecten, uren, offertes en facturatie' },
      werkbonnen:  { title: 'Werkbonnen',   sub: 'Uitvoeropdrachten op locatie' },
      uren:        { title: 'Uren',         sub: 'Urenregistratie per medewerker' },
      costs:       { title: 'Kosten',       sub: 'Kosten per klant en opdracht' },
      revenue:     { title: 'Financiën',    sub: 'Financieel overzicht' },
      facturen:    { title: 'Facturen',      sub: 'Facturen aanmaken en beheren' },
      offertes:    { title: 'Offertes',     sub: 'Offertes aanmaken en beheren' },
      team:        { title: 'Team',         sub: 'Teamleden en uitnodigingen' },
      instellingen:{ title: 'Instellingen', sub: 'Bedrijfsprofiel en standaardwaarden' },
    };
  }, [profile, user, profileLoading]);

  useEffect(() => {
    const onPop = () => {
      const path = window.location.pathname;
      setRoute(path || '/');
      if (path.startsWith('/dashboard/')) {
        const sub = path.slice('/dashboard/'.length).split('/')[0];
        const VALID = ['pipeline','customers','activities','calendar','planning','projecten','werkbonnen','uren','costs','revenue','facturen','offertes','database','team','instellingen'];
        setPage(VALID.includes(sub) ? sub : 'dashboard');
      } else if (path === '/dashboard') {
        setPage('dashboard');
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    getSession()
      .then(currentSession => {
        setSession(currentSession);
      })
      .finally(() => setAuthReady(true));

    const { data } = onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession && window.location.pathname.startsWith('/dashboard')) {
        navigate('/login', true);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const refreshProfile = useCallback(async () => {
    authLog('refreshProfile START');
    setProfileLoading(true);
    setProfileError(null);
    try {
      const ctx = await getCurrentUserContext();
      authLog('profile geladen', { role: ctx.profile?.role, id: ctx.profile?.id });
      setUser(ctx.user);
      setProfile(ctx.profile);
      setCompany(ctx.company);
      if (ctx.profile?.companyId) setCompanyId(ctx.profile.companyId);
      else clearCompanyId();

      // Laad permissies voor niet-admin gebruikers
      if (ctx.profile && ctx.profile.role !== 'admin') {
        try {
          const perms = await getUserPermissions(ctx.profile.id);
          authLog('userPermissions geladen', perms);
          setUserPermissions(perms);
        } catch {
          setUserPermissions([]);
        }
      } else {
        setUserPermissions([]); // admins: can() geeft altijd true via hook
      }
      setPermissionsLoaded(true);
      authLog('permissionsLoaded = true');

      if (ctx.profileError) {
        if (import.meta?.env?.DEV) console.warn('[bb:profile] error:', ctx.profileError);
        setProfileError(ctx.profileError);
      } else if (ctx.user && (!ctx.profile || !ctx.profile.companyId)
                 // Onbevestigd profiel zonder bedrijf = wacht op e-mailverificatie.
                 // NIET auto-provisionen — verify-code maakt het bedrijf pas aan
                 // ná verificatie. De gate (hieronder) toont het verificatiescherm.
                 && !(ctx.profile && !ctx.profile.companyId && !ctx.profile.emailVerifiedAt)) {
        // Profiel ontbreekt OF (geverifieerd) profiel heeft nog geen company_id.
        // Probeer automatisch te herstellen zonder foutscherm.
        try {
          await createMissingProfile();
          const ctx2 = await getCurrentUserContext();
          setUser(ctx2.user);
          setProfile(ctx2.profile);
          setCompany(ctx2.company);
          if (ctx2.profile?.companyId) setCompanyId(ctx2.profile.companyId);
          if (!ctx2.profile || !ctx2.profile.companyId) {
            setProfileError({ code: 'missing', message: 'Geen profiel gevonden voor dit account.' });
          }
        } catch (repairErr) {
          setProfileError({ code: 'missing', message: 'Geen profiel gevonden voor dit account.' });
        }
      }

      if (ctx.companyError && import.meta?.env?.DEV) {
        console.warn('[bb:profile] company error:', ctx.companyError);
      }
      return ctx;
    } catch (err) {
      console.warn('Profile load failed', err);
      setProfileError(err);
      return { user: null, profile: null, company: null, profileError: err };
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session) refreshProfile();
    else {
      setUser(null); setProfile(null); setCompany(null); setProfileError(null);
      setUserPermissions([]);
      setPermissionsLoaded(false);
      clearCompanyId();
    }
  }, [session, refreshProfile]);

  const repairProfile = useCallback(async () => {
    setRepairing(true);
    try {
      await createMissingProfile();
      await refreshProfile();
      toast.success('Profiel hersteld');
    } catch (err) {
      toast.error(err.message || 'Herstellen mislukt');
    } finally {
      setRepairing(false);
    }
  }, [refreshProfile, toast]);

  // Blokkeer ingelogde gebruikers van geblokkeerde companies
  useEffect(() => {
    if (!company || !session) return;
    if (company.status === 'geblokkeerd') {
      supabase.auth.signOut();
      // auth state change handler handelt de redirect naar /login af
    }
  }, [company, session]); // eslint-disable-line

  // ── Actieve sessie-controle ───────────────────────────────────────────────
  // Een al ingelogde gebruiker die verwijderd of gedeactiveerd wordt, mag niet
  // blijven doorwerken tot zijn token verloopt. We controleren daarom periodiek
  // (elke 45s) én bij window-focus / tab-zichtbaar of het auth-account nog
  // bestaat en het profiel nog actief is. Zo niet → direct uitloggen + redirect.
  useEffect(() => {
    if (!session) return;
    let stopped = false;

    const forceLogout = (message) => {
      if (stopped) return;
      stopped = true;
      toast.error?.(message);
      supabase.auth.signOut(); // onAuthStateChange handelt de redirect naar /login af
    };

    const checkAccountStatus = async () => {
      if (stopped || document.visibilityState === 'hidden') return;
      try {
        // 1) Bestaat het auth-account nog? getUser() valideert bij de auth-server,
        //    dus een verwijderd account geeft hier geen user terug.
        const { data: { user }, error } = await supabase.auth.getUser();
        if (stopped) return;
        if (!user) {
          // Alleen uitloggen bij een echte "user bestaat niet" — netwerkblips negeren.
          const msg = error?.message || '';
          const networkBlip = /network|fetch|timeout|failed to fetch|load failed/i.test(msg);
          if (!networkBlip) forceLogout('Je account is niet meer actief. Je bent uitgelogd.');
          return;
        }
        // 2) Profiel nog actief? (gedeactiveerd of verwijderd = actief=false)
        const { data: prof, error: pErr } = await supabase
          .from('profiles').select('actief, verwijderd_op').eq('id', user.id).maybeSingle();
        if (stopped || pErr) return;
        if (prof && prof.actief === false) {
          forceLogout(prof.verwijderd_op
            ? 'Je account is verwijderd. Je kunt binnen 2 jaar terugkeren door contact op te nemen.'
            : 'Je account is gedeactiveerd. Je bent uitgelogd.');
        }
      } catch {
        /* stil: de volgende tick probeert het opnieuw */
      }
    };

    checkAccountStatus(); // meteen bij (her)load
    const interval = setInterval(checkAccountStatus, 45000);
    const onFocus = () => checkAccountStatus();
    const onVisible = () => { if (document.visibilityState === 'visible') checkAccountStatus(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [session]); // eslint-disable-line

  const navigate = (path, replace = false) => {
    const nextPath = path === '/website' ? '/' : path === '/registreer' ? '/register' : path;
    const changed = window.location.pathname !== nextPath;
    if (changed) {
      window.history[replace ? 'replaceState' : 'pushState']({}, '', nextPath);
    }
    setRoute(nextPath);
    // Reset scroll when entering a public marketing page so each route
    // starts at the top, mirroring real multi-page navigation.
    const PUBLIC = ['/', '/functies', '/prijzen', '/voor-wie', '/over-ons', '/over', '/contact', '/faq', '/demo', '/login', '/register'];
    if (changed && PUBLIC.includes(nextPath)) {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    }
  };

  // Customer / deal / calendar-event drawers are mutually exclusive
  const openCustomer     = (id, tab) => { setDrawerDeal(null); setDrawerCalEvent(null); setDrawerCust(tab ? { id, tab } : id); };
  const closeCustomer    = () => setDrawerCust(null);
  const openDeal         = id => { setDrawerCust(null); setDrawerCalEvent(null); setDrawerDeal(id); };
  const closeDeal        = () => setDrawerDeal(null);
  // Facturen worden geopend in de echte Facturen-module (/dashboard/facturen),
  // consistent met de klantkaart en projecten — geen aparte factuur-drawer meer.
  const openInvoice      = id => navigatePage('facturen', { id });
  const openCalendarEvent = id => { setDrawerCust(null); setDrawerDeal(null); setDrawerCalEvent(id); };
  const closeCalEvent    = () => setDrawerCalEvent(null);
  // Optional deep-open intent: { page, id } so a target page can open a
  // specific record via its own existing modal. Cleared once consumed.
  const navigatePage  = (p, intent) => {
    setPage(p);
    const pagePath = p === 'dashboard' ? '/dashboard' : `/dashboard/${p}`;
    if (window.location.pathname !== pagePath) {
      window.history.pushState({}, '', pagePath);
    }
    const hasIntent = intent && (intent.id || intent.dealId);
    setNavIntent(hasIntent ? { page: p, ...intent } : null);
    // Bewaar terug-context: vanuit een klantkaart óf vanuit een projectdetail.
    if (intent?.from === 'klant' && intent?.klantId) {
      setBackCtx({ page: p, kind: 'klant', klantId: intent.klantId, klantNaam: intent.klantNaam || '' });
    } else if (intent?.from === 'project' && intent?.projectId) {
      setBackCtx({ page: p, kind: 'project', projectId: intent.projectId, klantNaam: intent.projectNaam || 'project' });
    } else {
      setBackCtx(null);
    }
    closeCustomer();
    closeDeal();
    closeCalEvent();
  };
  const clearNavIntent = () => setNavIntent(null);
  // Terug-navigatie: naar de klantkaart óf naar het projectdetail, afhankelijk
  // van de bewaarde context (kind). Ontvangt de hele backCtx van de pagina.
  const goBack = (ctx) => {
    if (!ctx) return;
    setBackCtx(null);
    if (ctx.kind === 'project' && ctx.projectId) {
      navigatePage('projecten', { id: ctx.projectId });
      return;
    }
    if (ctx.klantId) {
      navigatePage('customers');
      openCustomer(ctx.klantId);
    }
  };
  const handleLogout = async () => {
    try {
      await logout();
      toast.success('Je bent uitgelogd');
    } catch (err) {
      toast.error(err.message || 'Uitloggen mislukt');
    }
    closeCustomer();
    navigate('/login', true);
  };

  const requestNewLead = useCallback(() => setGlobalLeadModal(true), []);
  const requestNewActivity = useCallback((opts = {}) => setGlobalActivityModal(opts), []);
  const bumpRefresh = useCallback(() => setRefreshKey(k => k + 1), []);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    setGlobalDataLoading(true);
    // Eén gedeelde fetch voor de hele dashboard-shell (dashboard, sidebar-badges,
    // notificaties en zoeken delen deze data via DataContext).
    Promise.all([
      listCustomers().catch(() => []),
      listDeals().catch(() => []),
      listPipelineStages().catch(() => []),
      listActivities().catch(() => []),
      getOffertes().catch(() => []),
      getWerkbonnen().catch(() => []),
      listCalendarEvents().catch(() => []),
      getFacturen().catch(() => []),
      listJobCosts().catch(() => []),
    ])
      .then(([cs, ds, st, acts, offs, wbs, ces, facs, jcs]) => {
        if (!alive) return;
        setGlobalCustomers(cs);
        setGlobalDeals(ds);
        setGlobalStages(st);
        setGlobalActivities(acts);
        setGlobalOffertes(offs);
        setGlobalWerkbonnen(wbs);
        setGlobalCalendarEvents(ces);
        setGlobalFacturen(facs);
        setGlobalJobCosts(jcs);
      })
      .catch(() => {})
      .finally(() => { if (alive) setGlobalDataLoading(false); });
    return () => { alive = false; };
  }, [session, refreshKey]);

  const dataApi = useMemo(() => ({
    customers: globalCustomers,
    deals: globalDeals,
    stages: globalStages,
    activities: globalActivities,
    offertes: globalOffertes,
    werkbonnen: globalWerkbonnen,
    calendarEvents: globalCalendarEvents,
    facturen: globalFacturen,
    jobCosts: globalJobCosts,
    loading: globalDataLoading,
    refresh: bumpRefresh,
  }), [globalCustomers, globalDeals, globalStages, globalActivities, globalOffertes, globalWerkbonnen, globalCalendarEvents, globalFacturen, globalJobCosts, globalDataLoading, bumpRefresh]);

  // Compute these here (BEFORE any early returns) so the useEffect below
  // is always called in the same order — required by React's hooks rules.
  const showProfileMissing = Boolean(
    user && !profile && !profileLoading && profileError && profileError.code === 'missing'
  );
  const showProfileFetchError = Boolean(
    user && !profile && !profileLoading && profileError && profileError.code !== 'missing'
  );

  useEffect(() => {
    if (!showProfileFetchError) return;
    const msg = profileError?.message || 'Profiel laden is mislukt.';
    toast.error(`Profiel laden mislukt: ${msg}`);
    if (import.meta?.env?.DEV) console.error('[bb:profile] fetch error', profileError);
  }, [showProfileFetchError, profileError, toast]);

  const profileApi = useMemo(() => ({
    user, profile, company, userPermissions, permissionsLoaded,
    loading: profileLoading,
    error: profileError,
    refresh: refreshProfile,
    setProfile,
    repairProfile,
    requestNewLead, requestNewActivity, bumpRefresh,
    refreshKey,
  }), [user, profile, company, userPermissions, permissionsLoaded, profileLoading, profileError, refreshProfile, repairProfile, requestNewLead, requestNewActivity, bumpRefresh, refreshKey]);

  // Route-beveiliging: redirect naar dashboard als gebruiker geen toegang heeft
  useEffect(() => {
    if (!profile || !permissionsLoaded) return;
    const isAdmin = profile.role === 'admin';
    const requiredPerm = PROTECTED_PAGES[page];
    if (requiredPerm && !isAdmin && !userPermissions.includes(requiredPerm)) {
      toast.error('Je hebt geen toegang tot deze pagina');
      navigatePage('dashboard');
    }
  }, [page, profile, userPermissions, permissionsLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const renderPage = () => {
    const props = { setPage: navigatePage, openCustomer, openDeal, openInvoice, openCalendarEvent };
    switch (page) {
      case 'dashboard':  return <DashboardHome {...props} />;
      case 'pipeline':   return <Pipeline openCustomer={openCustomer} openDeal={openDeal} setPage={navigatePage} />;
      case 'customers':
        return drawerCust !== null ? (
          <div className="cust-split">
            <div className="cust-split-list">
              <CustomersPage openCustomer={openCustomer} />
            </div>
            <div className="cust-split-panel">
              <CustomerPage custId={drawerCust?.id ?? drawerCust} initialTab={drawerCust?.tab} onClose={closeCustomer} setPage={navigatePage} />
            </div>
          </div>
        ) : <CustomersPage openCustomer={openCustomer} />;
      case 'activities': return <ActivitiesPageV2 openCustomer={openCustomer} preOpenActivityId={navIntent?.page === 'activities' ? navIntent.id : null} onNavConsumed={clearNavIntent} />;
      case 'calendar':   return <CalendarPage openCustomer={openCustomer} openCalendarEvent={openCalendarEvent} setPage={navigatePage} preOpenActivityId={navIntent?.page === 'calendar' ? navIntent.id : null} onNavConsumed={clearNavIntent} />;
      case 'planning':   return <PlanningPage openCustomer={openCustomer} />;
      case 'costs':       return <CostsPage />;
      case 'revenue':     return <RevenuePage />;
      case 'facturen':    return <FacturenPage openCustomer={openCustomer} preOpenFactuurId={navIntent?.page === 'facturen' ? navIntent.id : null} onNavConsumed={clearNavIntent} backKlant={backCtx?.page === 'facturen' ? backCtx : null} onBackKlant={goBack} />;
      case 'offertes':    return <OffertesPage openCustomer={openCustomer} preOpenOfferteId={navIntent?.page === 'offertes' ? navIntent.id : null} preFillDealId={navIntent?.page === 'offertes' ? navIntent.dealId : null} onNavConsumed={clearNavIntent} backKlant={backCtx?.page === 'offertes' ? backCtx : null} onBackKlant={goBack} />;
      case 'projecten':   return <ProjectsPage openCustomer={openCustomer} openInvoice={openInvoice} setPage={navigatePage} preOpenProjectId={navIntent?.page === 'projecten' ? navIntent.id : null} onNavConsumed={clearNavIntent} backKlant={backCtx?.page === 'projecten' ? backCtx : null} onBackKlant={goBack} />;
      case 'werkbonnen':  return <WerkbonPage preOpenWerkbonId={navIntent?.page === 'werkbonnen' ? navIntent.id : null} onNavConsumed={clearNavIntent} setPage={navigatePage} openCustomer={openCustomer} backKlant={backCtx?.page === 'werkbonnen' ? backCtx : null} onBackKlant={goBack} />;
      case 'uren':        return <UrenPage />;
      case 'database':    return <DatabasePage openCustomer={openCustomer} />;
      case 'team':        return <TeamPage />;
      case 'instellingen':return <InstellingenPage />;
      default:            return <DashboardHome {...props} />;
    }
  };

  if (!authReady) {
    return <div className="auth-shell"><div className="auth-card afu"><div className="auth-logo"><Logo /></div><div className="auth-title">BossBase laden...</div></div></div>;
  }

  if (route === '/') {
    return <MarketingWebsite navigate={navigate} isAuthenticated={Boolean(session)} />;
  }

  if (route === '/functies') {
    return <FeaturesPage navigate={navigate} isAuthenticated={Boolean(session)} />;
  }

  if (route === '/prijzen') {
    return <PricingPage navigate={navigate} isAuthenticated={Boolean(session)} />;
  }

  if (route === '/voor-wie') {
    return <IndustriesPage navigate={navigate} isAuthenticated={Boolean(session)} />;
  }

  if (route === '/over-ons' || route === '/over') {
    return <AboutPage navigate={navigate} isAuthenticated={Boolean(session)} />;
  }

  if (route === '/contact') {
    return <ContactPage navigate={navigate} isAuthenticated={Boolean(session)} />;
  }

  if (route === '/faq') {
    return <FaqPage navigate={navigate} isAuthenticated={Boolean(session)} />;
  }

  if (route === '/demo') {
    return <DemoPage navigate={navigate} isAuthenticated={Boolean(session)} />;
  }

  if (route === '/cookieverklaring') {
    return <CookieverklaringPage navigate={navigate} />;
  }

  if (route === '/login') {
    if (session) {
      navigate('/dashboard', true);
      return null;
    }
    return (
    <LoginPage
      onLogin={async () => {
        // Force a fresh profile fetch immediately after login so the
        // dashboard renders with real data instead of a flash of skeletons.
        await refreshProfile();
        navigate('/dashboard', true);
      }}
      onRegister={() => navigate('/register')}
    />
    );
  }

  if (route === '/register') {
    if (session) {
      navigate('/dashboard', true);
      return null;
    }
    return (
    <RegisterFlow
      onDone={async () => {
        await refreshProfile();
        navigate('/dashboard', true);
      }}
      onBack={() => navigate('/login')}
    />
    );
  }

  if (route === '/reset-password') {
    const resetToken = new URLSearchParams(window.location.search).get('token') || '';
    return <ResetPasswordPage token={resetToken} navigate={navigate} />;
  }

  if (route.startsWith('/uitnodiging/')) {
    const token = route.replace('/uitnodiging/', '').split('?')[0];
    return <UitnodigingPage token={token} navigate={navigate} />;
  }

  if (route.startsWith('/offerte/')) {
    const token = route.replace('/offerte/', '').split('?')[0];
    return <OfferteSigneren token={token} />;
  }

  if (route === '/superadmin') {
    if (!session) { navigate('/login', true); return null; }
    // Render NIETS (alleen een donkere achtergrond) tot het profiel én de
    // permissies volledig geladen zijn. Zo is de pagina geen enkel frame
    // zichtbaar voordat de super-admin-check is uitgevoerd.
    if (!permissionsLoaded || !profile) {
      return <div style={{ background: '#0D0D0D', minHeight: '100dvh' }} />;
    }
    const ALLOWED = ['info@bossbase.nl', 'nielsgrevink@gmail.com'];
    if (profile.isSuperAdmin !== true || !ALLOWED.includes(profile.email)) {
      navigate('/dashboard', true);
      return null;
    }
    return <SuperAdminPage navigate={navigate} profile={profile} />;
  }

  if (!route.startsWith('/dashboard')) {
    navigate('/', true);
    return null;
  }

  if (!session) {
    navigate('/login', true);
    return null;
  }

  const meta = PAGE_META[page] || PAGE_META.dashboard;

  const sidebarBadges = {
    pipeline: globalDeals.filter(d => d.stage === 'new_lead').length,
    // Openstaand = vandaag + te laat. Gebruik dezelfde, in de service (lokale
    // tijdzone) berekende status als de Activiteiten-pagina — één bron. De oude
    // eigen UTC-datumvergelijking (toISOString) miste op de dag-/tijdzonegrens
    // een 'vandaag'-activiteit (badge telde 6 i.p.v. 7).
    activities: globalActivities.filter(a => a.status === 'today' || a.status === 'overdue').length,
  };

  if (!permissionsLoaded) {
    authLog('shell GEBLOKKEERD — wacht op permissionsLoaded');
    return <div style={{ background: 'var(--bg)', minHeight: '100dvh' }} />;
  }

  // E-mailverificatie-gate: een ingelogde gebruiker met een profiel zonder
  // bedrijf én zonder bevestiging moet eerst de 6-cijferige code invullen.
  // Uitgenodigde teamleden hebben al een company_id en passeren dus direct.
  if (profile && !profile.companyId && !profile.emailVerifiedAt) {
    authLog('e-mailverificatie vereist — gate getoond');
    return (
      <EmailVerificationScreen
        email={user?.email}
        onVerified={async () => { await refreshProfile(); navigatePage('dashboard'); }}
        onBack={handleLogout}
      />
    );
  }

  // Mobiel: het dashboard is verplaatst naar een aparte app → toon het
  // download-scherm i.p.v. de dashboard-shell. Login/registratie/verificatie
  // (hierboven), de ondertekenpagina en de marketingsite blijven mobiel werken.
  if (isMobile) {
    return <MobileBlock onLogout={handleLogout} />;
  }

  authLog('shell RENDER', { role: profile?.role, perms: userPermissions });

  return (
    <ProfileContext.Provider value={profileApi}>
      <DataContext.Provider value={dataApi}>
      <div className="shell">
        <Sidebar
          page={page}
          setPage={navigatePage}
          open={sbOpen}
          onClose={() => setSbOpen(false)}
          onLogout={handleLogout}
          profile={profile}
          user={user}
          loading={profileLoading}
          onOpenProfile={() => setOpenProfile(true)}
          badges={sidebarBadges}
          collapsed={sbCollapsed}
          onToggleCollapsed={() => setSbCollapsed(c => {
            const next = !c;
            try { localStorage.setItem('bb.sidebarCollapsed', next ? '1' : '0'); } catch { /* ignore */ }
            return next;
          })}
        />

        <div className="main">
          <Topbar
            pageMeta={meta}
            profile={profile}
            user={user}
            loading={profileLoading}
            onHamburger={() => setSbOpen(true)}
            onOpenProfile={() => setOpenProfile(true)}
            onLogout={handleLogout}
            openCustomer={openCustomer}
            navigatePage={navigatePage}
            refreshKey={refreshKey}
          />
          <div className={`content${page === 'customers' && drawerCust !== null ? ' content-split' : ''}`}>
            {showProfileMissing ? (
              <div className="bb-profile-missing">
                <div className="bb-profile-missing-card">
                  <div className="bb-profile-missing-emoji"><Wrench size={38} strokeWidth={1.75} /></div>
                  <div className="bb-profile-missing-title">Geen profiel gevonden voor dit account.</div>
                  <div className="bb-profile-missing-sub">
                    Je bent ingelogd als <strong>{user?.email}</strong>, maar de zoekopdracht
                    op <code>profiles.id = auth.uid()</code> gaf geen resultaat terug.
                    Dat kan betekenen dat het profiel nooit is aangemaakt, of dat een RLS-policy
                    de SELECT blokkeert.
                  </div>
                  <div className="bb-profile-missing-diag">
                    <div><strong>User id</strong> <code>{user?.id}</code></div>
                    <div><strong>E-mail</strong> <code>{user?.email}</code></div>
                  </div>
                  <div className="bb-profile-missing-actions">
                    <button className="btn btn-s" onClick={() => refreshProfile()} disabled={repairing}>
                      Opnieuw proberen
                    </button>
                    <button className="btn btn-p" onClick={repairProfile} disabled={repairing}>
                      {repairing ? 'Bezig met herstellen...' : 'Profiel aanmaken'}
                    </button>
                    <button className="btn btn-ghost" onClick={handleLogout}>Uitloggen</button>
                  </div>
                </div>
              </div>
            ) : showProfileFetchError ? (
              <div className="bb-profile-missing">
                <div className="bb-profile-missing-card">
                  <div className="bb-profile-missing-emoji"><AlertTriangle size={38} strokeWidth={1.75} /></div>
                  <div className="bb-profile-missing-title">Profiel kon niet worden geladen</div>
                  <div className="bb-profile-missing-sub">
                    Supabase gaf een fout terug bij het ophalen van je profiel.
                    Vaak is dit een RLS-policy die <code>SELECT</code> op <code>profiles</code> blokkeert.
                  </div>
                  <div className="bb-profile-missing-diag">
                    <div><strong>User id</strong> <code>{user?.id}</code></div>
                    <div><strong>E-mail</strong> <code>{user?.email}</code></div>
                    <div><strong>Foutmelding</strong> <code>{profileError?.message || 'onbekend'}</code></div>
                  </div>
                  <div className="bb-profile-missing-actions">
                    <button className="btn btn-p" onClick={() => refreshProfile()}>Opnieuw proberen</button>
                    <button className="btn btn-ghost" onClick={handleLogout}>Uitloggen</button>
                  </div>
                </div>
              </div>
            ) : (
              <PageErrorBoundary resetKey={page}>
                <Suspense fallback={<div style={{ padding: 24, color: 'var(--dl)' }}>Laden…</div>}>
                  {renderPage()}
                </Suspense>
              </PageErrorBoundary>
            )}
          </div>
        </div>

        <MobileBottomNav
          page={page}
          setPage={navigatePage}
          badges={sidebarBadges}
          profile={profile}
          can={(p) => profile?.role === 'admin' || (profile?.role === 'planner' && p === 'planning') || (userPermissions || []).includes(p)}
        />

        {drawerCust !== null && page !== 'customers' && (
          <CustomerDrawer
            custId={drawerCust?.id ?? drawerCust}
            initialTab={drawerCust?.tab}
            onClose={closeCustomer}
            setPage={navigatePage}
          />
        )}

        {drawerDeal !== null && (
          <DealDrawer
            dealId={drawerDeal}
            onClose={closeDeal}
            setPage={navigatePage}
            openCustomer={openCustomer}
          />
        )}

        {drawerCalEvent !== null && (
          <CalEventDrawer
            eventId={drawerCalEvent}
            onClose={closeCalEvent}
            setPage={navigatePage}
            openCustomer={openCustomer}
            openDeal={openDeal}
          />
        )}

        {openProfile && (
          <ProfileModal
            onClose={() => setOpenProfile(false)}
            profile={profile}
            company={company}
            user={user}
            onSaved={() => refreshProfile()}
            onLogout={handleLogout}
            onOpenInstellingen={() => { setOpenProfile(false); navigatePage('instellingen'); }}
          />
        )}

        {globalLeadModal && (
          <NewLeadModal
            onClose={() => setGlobalLeadModal(false)}
            customers={globalCustomers}
            stages={globalStages}
            onSaved={() => {
              bumpRefresh();
              if (page !== 'pipeline') navigatePage('pipeline');
            }}
          />
        )}

        {globalActivityModal && (
          <NewActivityModal
            onClose={() => setGlobalActivityModal(null)}
            customers={globalCustomers}
            deals={globalDeals}
            defaultCustId={globalActivityModal.defaultCustId || ''}
            defaultDealId={globalActivityModal.defaultDealId || ''}
            onSaved={() => bumpRefresh()}
          />
        )}
      </div>
      <CookieBanner navigate={navigate} />
      <UrenHerinneringModal navigatePage={navigatePage} />
      </DataContext.Provider>
    </ProfileContext.Provider>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <UploadProvider>
        <AppInner />
      </UploadProvider>
    </ToastProvider>
  );
}
