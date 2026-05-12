import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { I, Logo, initials } from './bb-shared.jsx';
import { LoginPage, RegisterFlow } from './pages/BbAuth.jsx';
import { DashboardHome, Pipeline } from './pages/BbDashboard.jsx';
import { CustomerPage, CustomersPage, ActivitiesPage } from './pages/BbPages1.jsx';
import { CalendarPage, CostsPage, RevenuePage } from './pages/BbPages2.jsx';
import { InstellingenPage } from './pages/InstellingenPage.jsx';
import { TeamPage } from './pages/TeamPage.jsx';
import { OffertesPage } from './pages/OffertesPage.jsx';
import { UrenPage } from './pages/UrenPage.jsx';
import { WerkbonPage } from './pages/WerkbonPage.jsx';
import MarketingWebsite from './pages/MarketingWebsite.jsx';
import DemoPage from './pages/DemoPage.jsx';
import { createMissingProfile, getSession, logout, onAuthStateChange } from './services/authService.js';
import { getCurrentUserContext } from './services/profileService.js';
import { clearCompanyId, setCompanyId } from './lib/currentCompany.js';
import { ToastProvider, useToast } from './lib/toast.jsx';
import { ProfileContext, displayName, profileInitials } from './lib/profileContext.jsx';
import { listCustomers } from './services/customerService.js';
import { listDeals, listPipelineStages } from './services/dealService.js';
import { listActivities } from './services/activityService.js';
import { getOffertes } from './services/offerteService.js';
import { getWerkbonnen } from './services/werkbonService.js';
import { ActivityEditModal, NewActivityModal, NewLeadModal, ProfileModal } from './components/SharedModals.jsx';

// ── NAV CONFIG ───────────────────────────────────────────────
const NAV = [
  { id: 'dashboard',  label: 'Dashboard',   icon: 'dash',    section: 'main' },
  { id: 'pipeline',   label: 'Pipeline',    icon: 'pipe',    section: 'main' },
  { id: 'customers',  label: 'Klanten',     icon: 'cust',    section: 'main' },
  { id: 'activities', label: 'Activiteiten',icon: 'act',     section: 'main' },
  { id: 'calendar',    label: 'Agenda',       icon: 'cal',      section: 'work' },
  { id: 'werkbonnen',  label: 'Werkbonnen',  icon: 'wo',       section: 'work' },
  { id: 'uren',        label: 'Uren',        icon: 'hours',    section: 'work' },
  { id: 'costs',       label: 'Kosten',      icon: 'costs',    section: 'finance' },
  { id: 'revenue',     label: 'Omzet',       icon: 'revenue',  section: 'finance' },
  { id: 'offertes',    label: 'Offertes',    icon: 'quotes',   section: 'finance' },
  { id: 'team',        label: 'Team',        icon: 'team',     section: 'bedrijf' },
  { id: 'instellingen',label: 'Instellingen',icon: 'settings', section: 'bedrijf' },
];

const SECTIONS = [
  { id: 'main',    label: 'Hoofdmenu' },
  { id: 'work',    label: 'Uitvoering' },
  { id: 'finance', label: 'Financieel' },
  { id: 'bedrijf', label: 'Bedrijf' },
];

// ── SIDEBAR ──────────────────────────────────────────────────
function Sidebar({ page, setPage, open, onClose, onLogout, profile, user, loading, onOpenProfile, badges = {} }) {
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

  return (
    <>
      {open && (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.3)', zIndex: 199 }} />
      )}
      <aside className={`sb${open ? ' open' : ''}`}>
        <div className="sb-logo">
          <Logo />
        </div>

        <nav className="sb-nav" ref={navRef}>
          {SECTIONS.map(sec => {
            const isMedewerker = profile?.role === 'medewerker';
            const items = NAV.filter(n => {
              if (n.section !== sec.id) return false;
              // medewerkers don't see Team/Instellingen management pages
              if (isMedewerker && (n.id === 'team' || n.id === 'instellingen')) return false;
              return true;
            });
            if (items.length === 0) return null;
            return (
              <div key={sec.id}>
                <div className="sb-section">{sec.label}</div>
                {items.map(item => (
                  <button
                    key={item.id}
                    className={`sbi${page === item.id ? ' active' : ''}`}
                    onClick={() => go(item.id)}
                  >
                    <span className="sbi-icon">{I[item.icon]}</span>
                    {item.label}
                    {badges[item.id] > 0 && <span className="sbi-badge">{badges[item.id]}</span>}
                  </button>
                ))}
              </div>
            );
          })}
        </nav>

        <div className="sb-bottom">
          <button className="sbi" onClick={onLogout}>
            <span className="sbi-icon">{I.logout}</span>Uitloggen
          </button>
        </div>

        <div className="sb-user" title="Open profiel">
          <button onClick={onOpenProfile} aria-label="Open profiel">
            {loading && !initials
              ? <div className="av av-md av-0 bb-skel-av" />
              : <div className="av av-md av-0">{initials}</div>}
            <div className="user-info" style={{ flex: 1, minWidth: 0 }}>
              {loading && !name
                ? <div className="bb-skel bb-skel-line" style={{ width: '70%' }} />
                : <div className="user-name">{name || 'Profiel'}</div>}
              <div className="user-role">{loading && !profile ? 'Profiel laden…' : roleLabel}</div>
            </div>
          </button>
        </div>
      </aside>
    </>
  );
}

// ── TOPBAR ───────────────────────────────────────────────────
function Topbar({ pageMeta, profile, user, loading, onHamburger, onOpenProfile, onLogout, openCustomer, navigatePage, refreshKey }) {
  const [openMenu, setOpenMenu] = useState(null);
  const [search, setSearch] = useState('');
  const [searchData, setSearchData] = useState({ customers: [], deals: [], activities: [] });
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [notifData, setNotifData] = useState({ overdue: [], today: [], leads: [], offertes: [], werkbonnen: [] });
  const [notifActivity, setNotifActivity] = useState(null);
  const [notifCustomers, setNotifCustomers] = useState([]);
  const wrapRef = useRef(null);

  const close = () => setOpenMenu(null);

  useEffect(() => {
    const onClick = e => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) close();
    };
    if (openMenu) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [openMenu]);

  const loadSearchData = useCallback(async () => {
    setSearchLoading(true);
    setSearchError('');
    try {
      const [customers, deals, activities] = await Promise.all([
        listCustomers(), listDeals(), listActivities(),
      ]);
      setSearchData({ customers, deals, activities });
    } catch (err) {
      setSearchError(err.message || 'Zoekgegevens laden mislukt');
    } finally {
      setSearchLoading(false);
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    try {
      const [activities, deals, offertes, werkbonnen, customers] = await Promise.all([
        listActivities(), listDeals(), getOffertes(), getWerkbonnen(), listCustomers(),
      ]);
      const today = new Date().toISOString().slice(0, 10);
      const overdue = activities.filter(a => a.status !== 'completed' && a.status !== 'done' && a.dueAt && a.dueAt.slice(0, 10) < today).slice(0, 5);
      const todayItems = activities.filter(a => a.dueAt?.slice(0, 10) === today && a.status !== 'completed' && a.status !== 'done').slice(0, 5);
      const leads = deals.filter(d => d.stage === 'new_lead').slice(0, 5);
      const openOffertes = offertes.filter(o => o.status === 'concept' || o.status === 'verzonden').slice(0, 3);
      const todayWerkbonnen = werkbonnen.filter(w => w.geplandOp === today && w.status !== 'afgerond').slice(0, 3);
      setNotifData({ overdue, today: todayItems, leads, offertes: openOffertes, werkbonnen: todayWerkbonnen });
      setNotifCustomers(customers);
    } catch {
      setNotifData({ overdue: [], today: [], leads: [], offertes: [], werkbonnen: [] });
    }
  }, []);

  useEffect(() => {
    if (openMenu === 'notif') loadNotifications();
  }, [openMenu, loadNotifications]);

  // Keep search data fresh after global mutations
  useEffect(() => {
    if (searchData.customers.length || searchData.deals.length || searchData.activities.length) {
      loadSearchData();
    }
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initial fetch of notifications baseline so the dot reflects reality
  useEffect(() => { loadNotifications(); }, [loadNotifications, refreshKey]);

  const onSearchChange = v => {
    setSearch(v);
    if (!searchData.customers.length && !searchLoading) loadSearchData();
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
  const hasUnread = totalNotifs > 0;

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
                <span>Meldingen</span>
                <small>{totalNotifs} nieuw</small>
              </div>
              <div className="tb-pop-list">
                {totalNotifs === 0 && (
                  <div className="tb-pop-empty">Geen nieuwe notificaties 🎉</div>
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
                      <div className="tb-pop-title">Nieuwe lead: {d.title}</div>
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
          >
            {loading && !profileInitials(profile, user)
              ? <span className="bb-skel-av" style={{ width: '100%', height: '100%', borderRadius: '50%' }} />
              : profileInitials(profile, user)}
          </button>
          {openMenu === 'profile' && (
            <div className="tb-pop" style={{ minWidth: 240 }}>
              <div className="tb-pop-user">
                <div className="av av-lg av-0">{profileInitials(profile, user)}</div>
                <div style={{ minWidth: 0 }}>
                  <div className="tb-pop-name">
                    {displayName(profile, user) || (loading ? 'Profiel laden…' : 'Profiel')}
                  </div>
                  <div className="tb-pop-meta">{profile?.email || user?.email || 'Niet ingelogd'}</div>
                </div>
              </div>
              <div className="tb-pop-menu">
                <button onClick={() => { close(); onOpenProfile(); }}>{I.cust} Mijn profiel</button>
                <button onClick={() => { close(); navigatePage('revenue'); }}>{I.revenue} Omzet & winst</button>
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
        onSaved={updated => { setNotifActivity(null); loadNotifications(); }}
        onDeleted={() => { setNotifActivity(null); loadNotifications(); }}
      />
    )}
    </>
  );
}

// ── CUSTOMER DRAWER ──────────────────────────────────────────
function CustomerDrawer({ custId, onClose, setPage }) {
  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-body">
          <CustomerPage custId={custId} onClose={onClose} setPage={setPage} />
        </div>
      </div>
    </>
  );
}

// ── MOBILE MEER MENU ─────────────────────────────────────────
function MeerMenu({ page, onNavigate, onClose, profile }) {
  const isMedewerker = profile?.role === 'medewerker';
  const groups = [
    {
      label: 'Uitvoering',
      items: [
        { id: 'calendar',   label: 'Agenda',     icon: I.cal },
        { id: 'werkbonnen', label: 'Werkbonnen', icon: I.wo },
        { id: 'uren',       label: 'Uren',       icon: I.hours },
      ],
    },
    {
      label: 'Financieel',
      items: [
        { id: 'offertes', label: 'Offertes', icon: I.quotes },
        { id: 'costs',    label: 'Kosten',   icon: I.costs },
        { id: 'revenue',  label: 'Omzet',    icon: I.revenue },
      ],
    },
    ...(isMedewerker ? [] : [{
      label: 'Bedrijf',
      items: [
        { id: 'team',          label: 'Team',          icon: I.team },
        { id: 'instellingen',  label: 'Instellingen',  icon: I.settings },
      ],
    }]),
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
const MEER_PAGE_IDS = ['calendar','werkbonnen','uren','costs','revenue','offertes','team','instellingen'];

function MobileBottomNav({ page, setPage, badges = {}, profile }) {
  const [showMeer, setShowMeer] = useState(false);
  const isOnMeerPage = MEER_PAGE_IDS.includes(page);

  const items = [
    { id: 'dashboard',  label: 'Dashboard',    icon: I.dash },
    { id: 'pipeline',   label: 'Pipeline',     icon: I.pipe,  badge: badges.pipeline },
    { id: 'customers',  label: 'Klanten',      icon: I.cust },
    { id: 'activities', label: 'Activiteiten', icon: I.act,   badge: badges.activities },
    { id: 'meer',       label: 'Meer',         icon: I.meer },
  ];

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

// ── INNER APP ────────────────────────────────────────────────
function AppInner() {
  const toast = useToast();
  const [route,      setRoute]      = useState(() => window.location.pathname || '/');
  const [session,    setSession]    = useState(null);
  const [authReady,  setAuthReady]  = useState(false);
  const [page,       setPage]       = useState('dashboard');
  const [sbOpen,     setSbOpen]     = useState(false);
  const [drawerCust, setDrawerCust] = useState(null);
  const [user,       setUser]       = useState(null);
  const [profile,    setProfile]    = useState(null);
  const [company,    setCompany]    = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError,   setProfileError]   = useState(null);
  const [repairing,  setRepairing]  = useState(false);
  const [openProfile, setOpenProfile] = useState(false);
  const [globalLeadModal, setGlobalLeadModal] = useState(false);
  const [globalActivityModal, setGlobalActivityModal] = useState(null);
  const [globalCustomers, setGlobalCustomers] = useState([]);
  const [globalDeals, setGlobalDeals] = useState([]);
  const [globalStages, setGlobalStages] = useState([]);
  const [globalActivities, setGlobalActivities] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const PAGE_META = useMemo(() => {
    const name = displayName(profile, user);
    const greet = name ? `Goedemorgen, ${name} 👋` : profileLoading ? 'Profiel laden…' : 'Welkom terug 👋';
    return {
      dashboard:  { title: 'Dashboard',    sub: greet },
      pipeline:   { title: 'Pipeline',     sub: 'Jouw sales & werk overzicht' },
      customers:  { title: 'Klanten',      sub: 'CRM — alle klantprofielen' },
      activities: { title: 'Activiteiten', sub: 'Openstaande acties en taken' },
      calendar:    { title: 'Agenda',        sub: 'Planning en afspraken' },
      werkbonnen:  { title: 'Werkbonnen',   sub: 'Uitvoeropdrachten op locatie' },
      uren:        { title: 'Uren',         sub: 'Urenregistratie per medewerker' },
      costs:       { title: 'Kosten',       sub: 'Kosten per klant en opdracht' },
      revenue:     { title: 'Omzet & Winst',sub: 'Financieel overzicht' },
      offertes:    { title: 'Offertes',     sub: 'Offertes aanmaken en beheren' },
      team:        { title: 'Team',         sub: 'Teamleden en uitnodigingen' },
      instellingen:{ title: 'Instellingen', sub: 'Bedrijfsprofiel en standaardwaarden' },
    };
  }, [profile, user, profileLoading]);

  useEffect(() => {
    const onPop = () => setRoute(window.location.pathname || '/');
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
    setProfileLoading(true);
    setProfileError(null);
    try {
      const ctx = await getCurrentUserContext();
      setUser(ctx.user);
      setProfile(ctx.profile);
      setCompany(ctx.company);
      // Prime the company-id cache so service-layer inserts can satisfy RLS.
      if (ctx.profile?.companyId) setCompanyId(ctx.profile.companyId);
      else clearCompanyId();
      // Two failure modes are possible and we keep them distinct:
      //   1. SELECT succeeded with 0 rows → real missing profile → repair UI
      //   2. SELECT errored (RLS, network) → keep dashboard usable, show toast
      if (ctx.profileError) {
        if (import.meta?.env?.DEV) console.warn('[bb:profile] error:', ctx.profileError);
        setProfileError(ctx.profileError);
      } else if (ctx.user && !ctx.profile) {
        setProfileError({ code: 'missing', message: 'Geen profiel gevonden voor dit account.' });
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

  const navigate = (path, replace = false) => {
    const nextPath = path === '/website' ? '/' : path === '/registreer' ? '/register' : path;
    if (window.location.pathname !== nextPath) {
      window.history[replace ? 'replaceState' : 'pushState']({}, '', nextPath);
    }
    setRoute(nextPath);
  };

  const openCustomer  = id => setDrawerCust(id);
  const closeCustomer = () => setDrawerCust(null);
  const navigatePage  = p => { setPage(p); closeCustomer(); };
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
    Promise.all([listCustomers(), listDeals(), listPipelineStages(), listActivities()])
      .then(([cs, ds, st, acts]) => {
        if (!alive) return;
        setGlobalCustomers(cs);
        setGlobalDeals(ds);
        setGlobalStages(st);
        setGlobalActivities(acts);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [session, refreshKey]);

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
    user, profile, company,
    loading: profileLoading,
    error: profileError,
    refresh: refreshProfile,
    setProfile,
    repairProfile,
    requestNewLead, requestNewActivity, bumpRefresh,
    refreshKey,
  }), [user, profile, company, profileLoading, profileError, refreshProfile, repairProfile, requestNewLead, requestNewActivity, bumpRefresh, refreshKey]);

  const renderPage = () => {
    const props = { setPage: navigatePage, openCustomer };
    switch (page) {
      case 'dashboard':  return <DashboardHome {...props} />;
      case 'pipeline':   return <Pipeline openCustomer={openCustomer} />;
      case 'customers':  return <CustomersPage openCustomer={openCustomer} />;
      case 'activities': return <ActivitiesPage openCustomer={openCustomer} />;
      case 'calendar':   return <CalendarPage openCustomer={openCustomer} />;
      case 'costs':       return <CostsPage />;
      case 'revenue':     return <RevenuePage />;
      case 'offertes':    return <OffertesPage />;
      case 'werkbonnen':  return <WerkbonPage />;
      case 'uren':        return <UrenPage />;
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

  if (route === '/demo') {
    return <DemoPage navigate={navigate} />;
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
    pipeline: globalDeals.length > 0 ? globalDeals.length : 0,
    activities: globalActivities.filter(a => a.status !== 'completed' && a.status !== 'done').length,
  };

  return (
    <ProfileContext.Provider value={profileApi}>
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
          <div className="content">
            {showProfileMissing ? (
              <div className="bb-profile-missing">
                <div className="bb-profile-missing-card">
                  <div className="bb-profile-missing-emoji">🛠️</div>
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
                  <div className="bb-profile-missing-emoji">⚠️</div>
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
            ) : renderPage()}
          </div>
        </div>

        <MobileBottomNav
          page={page}
          setPage={navigatePage}
          badges={sidebarBadges}
          profile={profile}
        />

        {drawerCust !== null && (
          <CustomerDrawer
            custId={drawerCust}
            onClose={closeCustomer}
            setPage={navigatePage}
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
    </ProfileContext.Provider>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}
