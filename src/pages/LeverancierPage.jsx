// Leverancierskaart — letterlijk dezelfde opbouw als de klantkaart
// (CustomerPage in BbPages1.jsx): sticky sluitknop, fullscreen-toggle, header
// met avatar + naam + badge, tabbalk, en per tab dezelfde componenten.
//
// Het enige verschil zijn de tabs: een leverancier heeft geen offertes,
// facturen, deals, projecten of werkbonnen.
//
// De Gegevens-tab gebruikt exact het cust-info-row-patroon van de klantkaart:
// een regel per veld, potloodje om te bewerken, vinkje/kruisje om op te slaan
// of te annuleren, en de adresregel is de inline AdresZoeker.

import { useEffect, useRef, useState } from 'react';
import { Check, X, Edit2, Maximize2, Minimize2, User } from 'lucide-react';
import { I, Av, fmt } from '../bb-shared.jsx';
import { useToast } from '../lib/toast.jsx';
import { usePermissions } from '../hooks/usePermissions.js';
import { NoteEditor, renderNote } from '../components/NoteEditor.jsx';
import NotitieLog, { toLogItem } from '../components/NotitieLog.jsx';
import Tijdlijn from '../components/Tijdlijn.jsx';
import SyncIndicator from '../components/SyncIndicator.jsx';
import AdresZoeker from '../components/AdresZoeker.jsx';
import { getTeamMembers } from '../services/notificatieService.js';
import { getLeverancier, updateLeverancier } from '../services/leverancierService.js';
import {
  getTijdlijnByLeverancier, getLeverancierNotities,
  addLeverancierNotitie, logLeverancierTijdlijnSafe,
} from '../services/leverancierTijdlijnService.js';
import { listMaterialen, marge } from '../services/materiaalService.js';
import { sendEmail } from '../services/emailService.js';
import { mailTemplate } from '../utils/mailTemplate.js';

export default function LeverancierPage({ leverancierId, onClose }) {
  const toast = useToast();
  const { can } = usePermissions();
  const tabsRef = useRef(null);

  const [tab, setTab] = useState('overview');
  const [l, setLeverancier] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fullscreen, setFullscreen] = useState(false);

  const [notities, setNotities] = useState([]);
  const [tijdlijn, setTijdlijn] = useState([]);
  const [materialen, setMaterialen] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);

  const [editingField, setEditingField] = useState(null);
  const [fieldDraft, setFieldDraft] = useState('');
  const [savingField, setSavingField] = useState(false);

  const [newOverzichtText, setNewOverzichtText] = useState('');
  const [savingOverzicht, setSavingOverzicht] = useState(false);

  const [emailForm, setEmailForm] = useState({ subject: '', body: '' });
  const [sendingEmail, setSendingEmail] = useState(false);

  useEffect(() => {
    if (!leverancierId) return;
    let alive = true;
    setLoading(true);
    setTab('overview');
    Promise.all([
      getLeverancier(leverancierId),
      getLeverancierNotities(leverancierId).catch(() => []),
      getTijdlijnByLeverancier(leverancierId).catch(() => []),
      listMaterialen().catch(() => []),
      getTeamMembers().catch(() => []),
    ])
      .then(([lev, n, t, m, tm]) => {
        if (!alive) return;
        setLeverancier(lev);
        setNotities(n);
        setTijdlijn(t);
        setMaterialen(m.filter(x => x.leverancierId === leverancierId));
        setTeamMembers(tm);
        setError('');
      })
      .catch(err => { if (alive) setError(err.message || 'Leverancier laden is mislukt.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [leverancierId]);

  const toggleFullscreen = () => {
    setFullscreen(v => {
      const next = !v;
      document.body.classList.toggle('cust-split-full', next);
      return next;
    });
  };
  useEffect(() => () => document.body.classList.remove('cust-split-full'), []);

  const TAB_LABELS = {
    overview: 'Overzicht',
    notities: 'Notities',
    materialen: 'Materialen',
    emails: 'E-mails',
    timeline: 'Tijdlijn',
    gegevens: <><User size={13} /><span className="kk-tab-label">Gegevens</span></>,
  };
  const TABS = ['overview', 'notities', 'materialen', 'emails', 'timeline', 'gegevens'];

  const fmtNotitieDate = iso => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  if (loading) return <div className="card card-p">Leverancier laden...</div>;
  if (error) return <div className="card card-p" style={{ color: '#dc2626' }}>{error}</div>;
  if (!l) return null;

  const startEdit = key => { setEditingField(key); setFieldDraft(l[key] ?? ''); };
  const cancelEdit = () => { setEditingField(null); setFieldDraft(''); };
  const saveField = async key => {
    setSavingField(true);
    try {
      const saved = await updateLeverancier(l.id, { ...l, [key]: fieldDraft });
      setLeverancier(saved);
      setEditingField(null);
      setFieldDraft('');
      toast.success('Opgeslagen');
    } catch (err) {
      toast.error(err.message || 'Opslaan mislukt');
    } finally {
      setSavingField(false);
    }
  };
  // Adres, postcode en plaats horen bij elkaar — één update i.p.v. drie.
  const saveAdres = async ({ address, postcode, city }) => {
    setSavingField(true);
    try {
      const saved = await updateLeverancier(l.id, { ...l, address, postcode, city });
      setLeverancier(saved);
      setEditingField(null);
      setFieldDraft('');
      toast.success('Adres, postcode en plaats bijgewerkt');
    } catch (err) {
      toast.error(err.message || 'Opslaan mislukt');
    } finally {
      setSavingField(false);
    }
  };

  const addNotitie = async (text, setText, setSaving) => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      const created = await addLeverancierNotitie(l.id, text);
      setNotities(list => [created, ...list]);
      setTijdlijn(list => [created, ...list]);
      setText('');
    } catch (err) {
      toast.error(err.message || 'Notitie opslaan mislukt');
    } finally {
      setSaving(false);
    }
  };
  const addNotitieLog = async text => {
    const created = await addLeverancierNotitie(l.id, text);
    setNotities(list => [created, ...list]);
    setTijdlijn(list => [created, ...list]);
  };

  const verstuurMail = async () => {
    if (!l.email) { toast.error('Deze leverancier heeft geen e-mailadres'); return; }
    if (!emailForm.subject.trim()) { toast.error('Vul een onderwerp in'); return; }
    setSendingEmail(true);
    try {
      const html = mailTemplate({ title: emailForm.subject, body: emailForm.body.replace(/\n/g, '<br>') });
      await sendEmail({ to: l.email, subject: emailForm.subject, html });
      await logLeverancierTijdlijnSafe(l.id, 'email_verstuurd', `E-mail verstuurd: ${emailForm.subject}`, { to: l.email });
      setTijdlijn(await getTijdlijnByLeverancier(l.id).catch(() => tijdlijn));
      setEmailForm({ subject: '', body: '' });
      toast.success('E-mail verstuurd');
    } catch (err) {
      toast.error(err.message || 'Versturen mislukt');
    } finally {
      setSendingEmail(false);
    }
  };

  const VELDEN = [
    { key: 'naam',                label: 'Naam',           type: 'input' },
    { key: 'contactpersoon',      label: 'Contactpersoon', type: 'input' },
    { key: 'email',               label: 'E-mail',         type: 'input' },
    { key: 'telefoon',            label: 'Telefoon',       type: 'input' },
    { key: 'mobiel',              label: 'Mobiel',         type: 'input' },
    { key: 'address',             label: 'Adres',          type: 'input' },
    { key: 'postcode',            label: 'Postcode',       type: 'input' },
    { key: 'city',                label: 'Stad',           type: 'input' },
    { key: 'kvkNumber',           label: 'KvK-nummer',     type: 'input' },
    { key: 'btwNumber',           label: 'BTW-nummer',     type: 'input' },
    { key: 'iban',                label: 'IBAN',           type: 'input' },
    { key: 'website',             label: 'Website',        type: 'input' },
    { key: 'betaaltermijnDagen',  label: 'Betaaltermijn',  type: 'input' },
  ];

  const magBewerken = can('klanten_bewerken');
  const aantalMaterialen = materialen.length;

  return (
    <div>
      {/* Sticky sluit-knop — altijd rechtsboven zichtbaar */}
      {onClose && (
        <button
          className="drawer-x"
          onClick={onClose}
          title="Sluiten"
          style={{ position: 'sticky', top: 16, float: 'right', zIndex: 20, marginBottom: -36, marginLeft: 8 }}
        >
          {I.x}
        </button>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20 }}>
        <button
          className="btn-icon"
          style={{ flexShrink: 0, marginTop: 2, color: 'var(--dl)' }}
          onClick={toggleFullscreen}
          title={fullscreen ? 'Kleiner weergeven' : 'Volledig scherm'}
        >
          {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
        <Av name={l.naam} size="xl" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 4, paddingRight: 48 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
              <h2 style={{ fontWeight: 800, fontSize: '1.25rem', letterSpacing: '-.025em', wordBreak: 'break-word' }}>{l.naam}</h2>
              <span className={`badge ${l.actief ? 'b-blue' : 'b-gray'}`}>{l.actief ? 'Leverancier' : 'Inactief'}</span>
            </div>
            {l.telefoon && <a href={`tel:${l.telefoon}`} className="btn btn-s btn-sm" style={{ flexShrink: 0, marginLeft: 12 }}>{I.call} {l.telefoon}</a>}
          </div>
          <div style={{ fontSize: '.82rem', color: 'var(--dmu)', marginBottom: 10 }}>
            {[l.contactpersoon, l.city].filter(Boolean).join(' · ') || '—'}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <SyncIndicator entiteit={l} />
          </div>
        </div>
      </div>

      {/* Quick stats — zelfde blok als bij klanten, met wat hier telt */}
      {can('projectbedragen') && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 20 }}>
          {[
            // Geen "Boekhouding" hier: dat staat al als vinkje in de kop,
            // en drie keer dezelfde melding op één scherm is er twee te veel.
            { label: 'Materialen', val: String(aantalMaterialen) },
            { label: 'Betaaltermijn', val: l.betaaltermijnDagen ? `${l.betaaltermijnDagen} dagen` : '—' },
          ].map((s, i) => (
            <div key={i} style={{ background: 'var(--bgs)', border: '1px solid var(--border)', borderRadius: 'var(--r10)', padding: '12px 14px' }}>
              <div style={{ fontSize: '.7rem', color: 'var(--dl)', marginBottom: 4, fontWeight: 600 }}>{s.label}</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, letterSpacing: '-.02em', color: 'var(--dk)' }}>{s.val}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="kk-tabs-wrap">
        <div className="tabs kk-tabs" ref={tabsRef} style={{ marginBottom: 16 }}>
          {TABS.map(t => (
            <button
              key={t}
              className={`tab${tab === t ? ' active' : ''}`}
              onClick={() => setTab(t)}
              aria-label={t === 'gegevens' ? 'Leveranciersgegevens' : undefined}
              title={t === 'gegevens' ? 'Leveranciersgegevens' : undefined}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {/* Overzicht */}
      {tab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card card-p">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: '.9rem' }}>Notities</div>
            </div>
            <NoteEditor
              mentions={true}
              value={newOverzichtText}
              onChange={setNewOverzichtText}
              minHeight={72}
              placeholder="Schrijf een notitie… Typ @ om iemand te taggen"
              teamMembers={teamMembers}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 6, paddingBottom: 2 }}>
              <button
                className="btn btn-p btn-xs"
                disabled={savingOverzicht || !newOverzichtText.trim()}
                onClick={() => addNotitie(newOverzichtText, setNewOverzichtText, setSavingOverzicht)}
              >
                {savingOverzicht ? 'Toevoegen...' : 'Toevoegen'}
              </button>
            </div>
            {notities.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {notities.slice(0, 2).map(n => (
                  <div key={n.id} style={{ padding: '8px 10px', background: 'var(--bgs)', borderRadius: 'var(--r8)', border: '1px solid var(--border)' }}>
                    <div className="bb-notitie-content" style={{ fontSize: '.83rem', color: 'var(--dk)', lineHeight: 1.5 }}>{renderNote(n.omschrijving)}</div>
                    <div style={{ fontSize: '.7rem', color: 'var(--dl)', marginTop: 4 }}>{fmtNotitieDate(n.aangemaaktop)}</div>
                  </div>
                ))}
                <button
                  onClick={() => setTab('notities')}
                  style={{ alignSelf: 'flex-start', background: 'none', border: 'none', cursor: 'pointer', fontSize: '.8rem', color: 'var(--p)', fontWeight: 600, padding: '2px 0' }}
                >
                  Alle notities →{notities.length > 2 ? ` (${notities.length})` : ''}
                </button>
              </div>
            )}
          </div>

          <div className="card card-p">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: '.9rem' }}>Materialen</div>
              <button
                onClick={() => setTab('materialen')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '.8rem', color: 'var(--p)', fontWeight: 600 }}
              >
                Alle materialen →
              </button>
            </div>
            {aantalMaterialen === 0
              ? <div style={{ fontSize: '.83rem', color: 'var(--dmu)' }}>Nog geen materialen van deze leverancier.</div>
              : <div style={{ fontSize: '.83rem', color: 'var(--dk)' }}>
                  {aantalMaterialen} {aantalMaterialen === 1 ? 'materiaal' : 'materialen'} in de bibliotheek
                </div>}
          </div>
        </div>
      )}

      {/* Notities */}
      {tab === 'notities' && (
        <NotitieLog
          key={leverancierId}
          items={notities.map(n => toLogItem({ id: n.id, body: n.omschrijving, createdAt: n.aangemaaktop }))}
          onAdd={addNotitieLog}
          teamMembers={teamMembers}
        />
      )}

      {/* Materialen */}
      {tab === 'materialen' && (
        <div className="tw">
          {materialen.length === 0 ? (
            <div className="card card-p" style={{ color: 'var(--dmu)', fontSize: '.84rem' }}>
              Nog geen materialen van deze leverancier.
            </div>
          ) : (
            <table className="dt">
              <thead>
                <tr>
                  <th>Materiaal</th><th>Eenheid</th><th>Verkoop (excl. btw)</th>
                  {can('inkoopprijzen') && <><th>Inkoop (excl. btw)</th><th>Marge</th></>}
                </tr>
              </thead>
              <tbody>
                {materialen.map(m => {
                  const mg = marge(m);
                  return (
                    <tr key={m.id}>
                      <td style={{ fontWeight: 600 }}>{m.naam}</td>
                      <td>{m.eenheid}</td>
                      <td>{m.verkoopprijs != null ? fmt(m.verkoopprijs) : '—'}</td>
                      {can('inkoopprijzen') && (
                        <>
                          <td>{m.inkoopprijs != null ? fmt(m.inkoopprijs) : '—'}</td>
                          <td style={{ color: mg && mg.bedrag < 0 ? '#dc2626' : '#15A34A' }}>
                            {mg ? `${fmt(mg.bedrag)}${mg.pct != null ? ` · ${mg.pct}%` : ''}` : '—'}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* E-mails */}
      {tab === 'emails' && (
        <div className="card card-p">
          {!l.email ? (
            <div style={{ color: 'var(--dmu)', fontSize: '.84rem' }}>
              Deze leverancier heeft geen e-mailadres. Vul er een in bij Gegevens.
            </div>
          ) : (
            <div className="fg">
              <div className="f s2">
                <label>Aan</label>
                <input type="text" value={l.email} disabled />
              </div>
              <div className="f s2">
                <label>Onderwerp</label>
                <input type="text" value={emailForm.subject} onChange={e => setEmailForm(f => ({ ...f, subject: e.target.value }))} />
              </div>
              <div className="f s2">
                <label>Bericht</label>
                <textarea rows={7} value={emailForm.body} onChange={e => setEmailForm(f => ({ ...f, body: e.target.value }))} />
              </div>
              <div className="f s2">
                <button className="btn btn-p btn-sm" onClick={verstuurMail} disabled={sendingEmail}>
                  {sendingEmail ? 'Versturen…' : <>{I.mail} Versturen</>}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tijdlijn */}
      {tab === 'timeline' && <Tijdlijn items={tijdlijn} />}

      {/* Gegevens — zelfde rij-per-veld opzet als de klantgegevens-tab */}
      {tab === 'gegevens' && (
        <div className="card card-p">
          {VELDEN.map(field => {
            const isActive = editingField === field.key;
            return (
              <div key={field.key} className="cust-info-row" style={{ alignItems: 'center' }}>
                <span className="cust-info-label">{field.label}</span>
                {isActive ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
                    {field.key === 'address' ? (
                      <AdresZoeker
                        inline
                        autoFocus
                        value={fieldDraft}
                        onChange={setFieldDraft}
                        onSelect={saveAdres}
                        onEnter={() => saveField('address')}
                        onEscape={cancelEdit}
                        disabled={savingField}
                        placeholder="Typ straat + huisnummer + plaats"
                      />
                    ) : (
                      <input
                        autoFocus
                        value={fieldDraft}
                        onChange={e => setFieldDraft(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveField(field.key); if (e.key === 'Escape') cancelEdit(); }}
                        style={{ flex: 1, fontSize: '.82rem', padding: '2px 6px' }}
                      />
                    )}
                    <button onClick={() => saveField(field.key)} disabled={savingField} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#15A34A', display: 'flex', alignItems: 'center', padding: 2 }}>
                      <Check size={14} />
                    </button>
                    <button onClick={cancelEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex', alignItems: 'center', padding: 2 }}>
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                    <span className="cust-info-val" style={{ flex: 1, color: l[field.key] ? undefined : 'var(--dl)' }}>
                      {l[field.key] || '—'}
                    </span>
                    {magBewerken && (
                      <button onClick={() => startEdit(field.key)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex', alignItems: 'center', padding: 2, flexShrink: 0 }}>
                        <Edit2 size={14} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
