import {
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  Camera,
  ClipboardList,
  Globe2,
  FileText,
  KanbanSquare,
  LayoutDashboard,
  Package,
  ListChecks,
  Settings,
  Users,
  WalletCards,
  Wrench,
  X
} from 'lucide-react';
import { Logo } from '../bb-shared.jsx';

export const navItems = [
  { path: '/website',     label: 'Website',           icon: Globe2,            group: 'Publiek' },
  { path: '/dashboard',   label: 'Dashboard',         icon: LayoutDashboard,   group: 'Vandaag' },
  { path: '/aanvragen',   label: 'Aanvragen',         icon: ClipboardList,     group: 'Werk' },
  { path: '/pipeline',    label: 'Pipeline',          icon: KanbanSquare,      group: 'Werk' },
  { path: '/klanten',     label: 'Klanten',           icon: Users,             group: 'Werk' },
  { path: '/offertes',    label: 'Offertes',          icon: FileText,          group: 'Werk' },
  { path: '/planning',    label: 'Planning',          icon: CalendarDays,      group: 'Uitvoering' },
  { path: '/werkbonnen',  label: 'Werkbonnen',        icon: Wrench,            group: 'Uitvoering' },
  { path: '/documenten',  label: "Foto's/documenten", icon: Camera,            group: 'Uitvoering' },
  { path: '/uren',        label: 'Uren',              icon: BriefcaseBusiness, group: 'Uitvoering' },
  { path: '/materialen',  label: 'Materialen',        icon: Package,           group: 'Uitvoering' },
  { path: '/taken',       label: 'Taken/reminders',   icon: ListChecks,        group: 'Inzicht' },
  { path: '/omzet',       label: 'Omzet',             icon: BarChart3,         group: 'Inzicht' },
  { path: '/team',        label: 'Team',              icon: Users,             group: 'Beheer' },
  { path: '/instellingen',label: 'Instellingen',      icon: Settings,          group: 'Beheer' }
];

export default function Sidebar({ route, navigate, open, onClose }) {
  const groups = navItems.reduce((acc, item) => {
    acc[item.group] = [...(acc[item.group] || []), item];
    return acc;
  }, {});

  return (
    <>
      <aside className={`sidebar ${open ? 'is-open' : ''}`}>
        <div className="brand-row">
          <button className="brand" onClick={() => navigate('/dashboard')}>
            <Logo />
          </button>
          <button className="icon-btn mobile-only" onClick={onClose} aria-label="Sluit navigatie">
            <X size={22} />
          </button>
        </div>
        <nav>
          {Object.entries(groups).map(([group, items]) => (
            <div className="nav-group" key={group}>
              <span className="nav-group-title">{group}</span>
              {items.map((item) => {
                const Icon = item.icon;
                const active = route === item.path || (item.path !== '/dashboard' && route.startsWith(`${item.path}/`));
                return (
                  <button
                    key={item.path}
                    className={active ? 'nav-item active' : 'nav-item'}
                    onClick={() => navigate(item.path)}
                  >
                    <Icon size={18} />
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <WalletCards size={16} />
          <span>Jij de baas, wij de basis. 14 actieve trajecten in demo.</span>
        </div>
      </aside>
      {open ? <button className="scrim mobile-only" onClick={onClose} aria-label="Sluit navigatie" /> : null}
    </>
  );
}
