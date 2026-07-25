import { useEffect, useState } from 'react';
import { NoteEditor, renderNote } from './NoteEditor.jsx';
import { useToast } from '../lib/toast.jsx';
import { getTeamMembers } from '../services/notificatieService.js';

// Chronologisch notitielogboek — het patroon van de klantkaart, hier één keer.
// Gedrag: typen → opslaan → notitie verschijnt bovenaan de lijst → veld leeg,
// klaar voor de volgende.
//
// Bewust presentatie-only: elke plek houdt zijn eigen opslag (klant_tijdlijn,
// notes, project_notes, comments-jsonb) en geeft die door via `items` + `onAdd`.
// Zo kan één component alle plekken bedienen zonder dat het datamodel gelijk
// hoeft te zijn.
//
// `items` verwacht genormaliseerde entries: { id, body, authorName?, createdAt }.
// Gebruik `toLogItem` hieronder om een servicerij om te zetten.

export const toLogItem = ({ id, body, authorName = '', createdAt }) => ({
  id, body, authorName, createdAt,
});

export const fmtNotitieDatum = iso => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
    + ' · ' + d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
};

export default function NotitieLog({
  items = [],
  onAdd,
  onDelete,
  teamMembers: teamMembersProp,
  placeholder = 'Schrijf een notitie… Typ @ om iemand te taggen',
  emptyText = 'Nog geen notities',
  saveLabel = 'Opslaan',
  minHeight = 96,
  pageSize = 10,
  disabled = false,
  showClear = true,
}) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [visible, setVisible] = useState(pageSize);
  const [teamMembersOwn, setTeamMembersOwn] = useState([]);

  // Teamleden alleen zelf ophalen wanneer de pagina ze niet al heeft.
  const needsOwnMembers = teamMembersProp === undefined;
  useEffect(() => {
    if (!needsOwnMembers) return;
    getTeamMembers().then(setTeamMembersOwn).catch(() => {});
  }, [needsOwnMembers]);
  const teamMembers = teamMembersProp ?? teamMembersOwn;

  const submit = async () => {
    if (!text.trim() || saving) return;
    setSaving(true);
    try {
      await onAdd(text);
      setText(''); // veld leeg → klaar voor de volgende notitie
    } catch (err) {
      toast.error(err.message || 'Notitie opslaan mislukt');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="card card-p">
        <NoteEditor
          value={text}
          onChange={setText}
          mentions={true}
          minHeight={minHeight}
          placeholder={placeholder}
          teamMembers={teamMembers}
          disabled={disabled || saving}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 10, paddingBottom: 2 }}>
          {showClear && (
            <button className="btn btn-s btn-sm" disabled={!text.trim() || saving} onClick={() => setText('')}>
              Wissen
            </button>
          )}
          <button className="btn btn-p btn-sm" disabled={disabled || saving || !text.trim()} onClick={submit}>
            {saving ? 'Opslaan...' : saveLabel}
          </button>
        </div>
      </div>

      {items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.slice(0, visible).map(n => (
            <div key={n.id} className="card card-p" style={{ padding: '12px 16px' }}>
              <div className="bb-notitie-content" style={{ fontSize: '.85rem', color: 'var(--dk)', lineHeight: 1.6, wordBreak: 'break-word' }}>
                {renderNote(n.body)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 6 }}>
                <div style={{ fontSize: '.72rem', color: 'var(--dl)', fontWeight: 600 }}>
                  {n.authorName ? `${n.authorName} · ` : ''}{fmtNotitieDatum(n.createdAt)}
                </div>
                {onDelete && (
                  <button className="btn btn-xs btn-ghost" onClick={() => onDelete(n.id)} title="Verwijderen">
                    Verwijderen
                  </button>
                )}
              </div>
            </div>
          ))}
          {items.length > visible && (
            <button className="btn btn-s btn-sm" style={{ alignSelf: 'center' }} onClick={() => setVisible(v => v + pageSize)}>
              Laad {Math.min(pageSize, items.length - visible)} meer
            </button>
          )}
        </div>
      )}

      {items.length === 0 && (
        <div style={{ textAlign: 'center', padding: '24px 0', color: '#9ca3af', fontSize: '.84rem' }}>
          {emptyText}
        </div>
      )}
    </div>
  );
}
