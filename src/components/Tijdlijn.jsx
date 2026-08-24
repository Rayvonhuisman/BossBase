// Gedeelde tijdlijn-render.
//
// Stond als losse code in CustomerPage; nu één component, zodat de
// leverancierskaart er niet zijn eigen variant naast krijgt. Puur presentatie:
// het component haalt niets op en weet niet waar de regels vandaan komen.
//
// Verwacht items in de vorm { id, type, omschrijving, aangemaaktop }.

import {
  User, FileText, Euro, RotateCcw, Folder, PenLine, Mail, Truck,
} from 'lucide-react';
import { renderNote } from './NoteEditor.jsx';

const ICON = {
  klant_aangemaakt: <User size={14} />,
  leverancier_aangemaakt: <Truck size={14} />,
  offerte_aangemaakt: <FileText size={14} />,
  offerte_verzonden: <FileText size={14} />,
  offerte_geaccepteerd: <FileText size={14} />,
  offerte_afgewezen: <FileText size={14} />,
  factuur_aangemaakt: <Euro size={14} />,
  factuur_verzonden: <Euro size={14} />,
  factuur_betaald: <Euro size={14} />,
  creditfactuur_aangemaakt: <RotateCcw size={14} />,
  project_aangemaakt: <Folder size={14} />,
  project_status_gewijzigd: <Folder size={14} />,
  notitie_toegevoegd: <PenLine size={14} />,
  email_verstuurd: <Mail size={14} />,
};

export const tijdlijnKleur = type => {
  const t = String(type || '');
  if (t.startsWith('klant')) return '#3b82f6';
  if (t.startsWith('leverancier')) return '#3b82f6';
  if (t.startsWith('offerte')) return '#f97316';
  if (t.startsWith('factuur')) return '#10b981';
  if (t.startsWith('credit')) return '#ef4444';
  if (t.startsWith('project')) return '#6366f1';
  if (t.startsWith('notitie')) return '#10b981';
  if (t.startsWith('email')) return '#0ea5e9';
  if (t.startsWith('herinnering')) return '#f59e0b';
  if (t.startsWith('afspraak')) return '#14b8a6';
  if (t.startsWith('deal')) return '#8b5cf6';
  if (t.startsWith('export')) return '#64748b';
  return 'var(--dl)';
};

export const fmtTijdlijnDatum = iso => {
  if (!iso) return '';
  const d = new Date(iso);
  const dag = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'][d.getDay()];
  const mnd = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'][d.getMonth()];
  return `${dag} ${d.getDate()} ${mnd} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export default function Tijdlijn({ items = [], leegTekst = 'Nog geen activiteit gelogd' }) {
  if (items.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af', fontSize: '.84rem' }}>
        {leegTekst}
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {items.map((item, i) => {
        const kleur = tijdlijnKleur(item.type);
        const icon = ICON[item.type] || <PenLine size={14} />;
        const isLast = i === items.length - 1;
        return (
          <div key={item.id} style={{ display: 'flex', gap: 12, position: 'relative', paddingBottom: isLast ? 0 : 4 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 32 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: kleur + '18', border: `1.5px solid ${kleur}40`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: kleur, flexShrink: 0, zIndex: 1,
              }}>
                {icon}
              </div>
              {!isLast && <div style={{ width: 1, flex: 1, minHeight: 16, background: 'var(--border)', marginTop: 2 }} />}
            </div>
            <div style={{
              flex: 1, background: 'var(--bgs)', border: '1px solid var(--border)',
              borderRadius: 'var(--r8)', padding: '8px 12px',
              marginBottom: isLast ? 0 : 6, minWidth: 0,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 3 }}>
                <div style={{ fontSize: '.83rem', fontWeight: 600, color: 'var(--dk)', lineHeight: 1.4 }}>
                  {renderNote(item.omschrijving)}
                </div>
                <div style={{ fontSize: '.7rem', color: 'var(--dl)', flexShrink: 0, paddingTop: 1 }}>
                  {fmtTijdlijnDatum(item.aangemaaktop)}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
