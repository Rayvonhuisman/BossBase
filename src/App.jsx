import { useState, useEffect } from 'react';
import { I, Logo, Av } from './bb-shared.jsx';
import { LoginPage, RegisterFlow } from './pages/BbAuth.jsx';
import { DashboardHome, Pipeline } from './pages/BbDashboard.jsx';
import { CustomerPage, CustomersPage, ActivitiesPage, QuotesPage } from './pages/BbPages1.jsx';
import { CalendarPage, WorkOrdersPage, HoursPage, CostsPage, RevenuePage, TeamPage, SettingsPage } from './pages/BbPages2.jsx';
import MarketingWebsite from './pages/MarketingWebsite.jsx';

// ── NAV CONFIG ───────────────────────────────────────────────
const NAV = [
  { id: 'dashboard',  label: 'Dashboard',   icon: 'dash',    section: 'main' },
  { id: 'pipeline',   label: 'Pipeline',    icon: 'pipe',    section: 'main', badge: 8 },
  { id: 'customers',  label: 'Klanten',     icon: 'cust',    section: 'main' },
  { id: 'activities', label: 'Activiteiten',icon: 'act',     section: 'main', badge: 4 },
  { id: 'quotes',     label: 'Offertes',    icon: 'quotes',  section: 'work' },
  { id: 'calendar',   label: 'Agenda',      icon: 'cal',     section: 'work' },
  { id: 'workorders', label: 'Werkbonnen',  icon: 'wo',      section: 'work' },
  { id: 'hours',      label: 'Uren',        icon: 'hours',   section: 'work' },
  { id: 'costs',      label: 'Kosten',      icon: 'costs',   section: 'finance' },
  { id: 'revenue',    label: 'Omzet',       icon: 'revenue', section: 'finance' },
  { id: 'team',       label: 'Team',        icon: 'team',    section: 'company' },
  { id: 'settings',   label: 'Instellingen',icon: 'settings',section: 'company' },
];

const SECTIONS = [
  { id: 'main',    label: 'Hoofdmenu' },
  { id: 'work',    label: 'Uitvoering' },
  { id: 'finance', label: 'Financieel' },
  { id: 'company', label: 'Bedrijf' },
];

const PAGE_META = {
  dashboard:  { title: 'Dashboard',    sub: 'Goedemorgen, Marco 👋' },
  pipeline:   { title: 'Pipeline',     sub: 'Jouw sales & werk overzicht' },
  customers:  { title: 'Klanten',      sub: 'CRM — alle klantprofielen' },
  activities: { title: 'Activiteiten', sub: 'Openstaande acties en taken' },
  quotes:     { title: 'Offertes',     sub: 'Beheer al je offertes' },
  calendar:   { title: 'Agenda',       sub: 'Planning en afspraken' },
  workorders: { title: 'Werkbonnen',   sub: 'Mobiele taakoverzichten' },
  hours:      { title: 'Uren',         sub: 'Urenregistratie per medewerker' },
  costs:      { title: 'Kosten',       sub: 'Kosten per klant en opdracht' },
  revenue:    { title: 'Omzet & Winst',sub: 'Financieel overzicht' },
  team:       { title: 'Team',         sub: 'Medewerkers en rollen' },
  settings:   { title: 'Instellingen', sub: 'Bedrijf en configuratie' },
};

// ── SIDEBAR ──────────────────────────────────────────────────
function Sidebar({ page, setPage, open, onClose }) {
  const go = id => { setPage(id); onClose(); };

  return (
    <>
      {open && (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.3)', zIndex: 199 }} />
      )}
      <aside className={`sb${open ? ' open' : ''}`}>
        <div className="sb-logo">
          <Logo />
        </div>

        <nav className="sb-nav">
          {SECTIONS.map(sec => {
            const items = NAV.filter(n => n.section === sec.id);
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
                    {item.badge && <span className="sbi-badge">{item.badge}</span>}
                  </button>
                ))}
              </div>
            );
          })}
        </nav>

        <div className="sb-bottom">
          <button className={`sbi${page === 'settings' ? ' active' : ''}`} onClick={() => go('settings')}>
            <span className="sbi-icon">{I.settings}</span>Instellingen
          </button>
          <button className="sbi">
            <span className="sbi-icon">{I.logout}</span>Uitloggen
          </button>
        </div>

        <div className="sb-user">
          <div className="av av-md av-0">MV</div>
          <div className="user-info" style={{ flex: 1, minWidth: 0 }}>
            <div className="user-name">Marco Veldhuis</div>
            <div className="user-role">Admin · Pro-plan</div>
          </div>
        </div>
      </aside>
    </>
  );
}

// ── TOPBAR ───────────────────────────────────────────────────
function Topbar({ page, onHamburger }) {
  const meta = PAGE_META[page] || PAGE_META.dashboard;
  return (
    <header className="topbar">
      <div className="tb-left">
        <button className="hbg ib" onClick={onHamburger}>{I.menu}</button>
        <div>
          <div className="tb-title">{meta.title}</div>
          <div className="tb-sub">{meta.sub}</div>
        </div>
      </div>
      <div className="tb-right">
        <div className="search">
          {I.search}
          <input placeholder="Zoeken…" />
        </div>
        <button className="ib" title="Meldingen">
          {I.bell}
          <span className="ndot" />
        </button>
        <div className="tb-av" title="Marco Veldhuis">MV</div>
      </div>
    </header>
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

// ── APP ──────────────────────────────────────────────────────
export default function App() {
  const [showWebsite, setShowWebsite] = useState(
    () => window.location.hash === '' || window.location.hash === '#/website'
  );
  const [auth,       setAuth]       = useState('login');
  const [page,       setPage]       = useState('dashboard');
  const [sbOpen,     setSbOpen]     = useState(false);
  const [drawerCust, setDrawerCust] = useState(null);

  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash;
      if (h === '' || h === '#/website') setShowWebsite(true);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = path => {
    if (path === '/website') {
      window.location.hash = '/website';
      setShowWebsite(true);
    } else {
      setShowWebsite(false);
    }
  };

  const openCustomer  = id => setDrawerCust(id);
  const closeCustomer = () => setDrawerCust(null);
  const navigatePage  = p => { setPage(p); closeCustomer(); };

  const renderPage = () => {
    const props = { setPage: navigatePage, openCustomer };
    switch (page) {
      case 'dashboard':  return <DashboardHome {...props} />;
      case 'pipeline':   return <Pipeline openCustomer={openCustomer} />;
      case 'customers':  return <CustomersPage openCustomer={openCustomer} />;
      case 'activities': return <ActivitiesPage openCustomer={openCustomer} />;
      case 'quotes':     return <QuotesPage openCustomer={openCustomer} />;
      case 'calendar':   return <CalendarPage openCustomer={openCustomer} />;
      case 'workorders': return <WorkOrdersPage />;
      case 'hours':      return <HoursPage />;
      case 'costs':      return <CostsPage />;
      case 'revenue':    return <RevenuePage />;
      case 'team':       return <TeamPage />;
      case 'settings':   return <SettingsPage />;
      default:           return <DashboardHome {...props} />;
    }
  };

  // Marketing website
  if (showWebsite) {
    return <MarketingWebsite navigate={path => {
      if (path === '/login') { setShowWebsite(false); setAuth('login'); }
      else if (path === '/registreer') { setShowWebsite(false); setAuth('register'); }
      else navigate(path);
    }} />;
  }

  // Auth screens
  if (auth === 'login') return (
    <LoginPage
      onLogin={() => setAuth('app')}
      onRegister={() => setAuth('register')}
    />
  );
  if (auth === 'register') return (
    <RegisterFlow
      onDone={() => setAuth('app')}
      onBack={() => setAuth('login')}
    />
  );

  // App shell
  return (
    <div className="shell">
      <Sidebar
        page={page}
        setPage={navigatePage}
        open={sbOpen}
        onClose={() => setSbOpen(false)}
      />

      <div className="main">
        <Topbar page={page} onHamburger={() => setSbOpen(true)} />
        <div className="content">
          {renderPage()}
        </div>
      </div>

      {drawerCust !== null && (
        <CustomerDrawer
          custId={drawerCust}
          onClose={closeCustomer}
          setPage={navigatePage}
        />
      )}
    </div>
  );
}
