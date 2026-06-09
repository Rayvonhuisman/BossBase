import { useState, useEffect } from 'react';
import { Download, MoreVertical, Send } from 'lucide-react';
import { MailBodyEditor, plainToEditorHtml } from '../components/MailBodyEditor.jsx';
import { I, ModalX, fmt } from '../bb-shared.jsx';
import { useToast } from '../lib/toast.jsx';
import { useProfile } from '../lib/profileContext.jsx';
import {
  getOffertes, createOfferte, updateOfferte, deleteOfferte, calculateOfferteTotals, createOfferteItem, getOfferteItems, deleteOfferteItemsByOfferteId,
} from '../services/offerteService.js';
import { getBedrijfsinstellingen } from '../services/instellingenService.js';
import { listCustomers } from '../services/customerService.js';
import { listDeals } from '../services/dealService.js';
import { NewFactuurModal, SendFactuurMailModal } from './FacturenPage.jsx';
import { generateOffertePdf, previewOffertePdf, getOffertePdfBase64 } from '../utils/generatePdf.js';
import { getMailTemplate, sendEmail, substituteVars, logSentEmail } from '../services/emailService.js';
import { logTijdlijnSafe } from '../services/klantTijdlijnService.js';

const offerteBadge = status => {
  const map = { concept: 'b-concept', verzonden: 'b-sent', geaccepteerd: 'b-accepted', afgewezen: 'b-declined' };
  const labels = { concept: 'Concept', verzonden: 'Verzonden', geaccepteerd: 'Geaccepteerd', afgewezen: 'Afgewezen' };
  return <span className={`badge ${map[status] || 'b-gray'}`}>{labels[status] || status}</span>;
};

export function OfferteBadge({ status }) { return offerteBadge(status); }

const fmtDate = d => {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}-${m}-${y}`;
};

// ── NEW OFFERTE MODAL ────────────────────────────────────────────────────────

const emptyRegel = () => ({
  id: crypto.randomUUID(), omschrijving: '', type: 'uren', aantal: 1, eenheidsprijs: 0, btw: '21', btwAnders: '',
});

const TYPE_CFG = {
  uren:  { label: 'Uren',       omschrPh: 'Arbeidsuren',     v1Ph: '0 uur',  v2Ph: '0,00', hasV1: true,  v1Step: '0.5',  regelLabel: r => `${r.aantal}u × €${r.eenheidsprijs}` },
  m2:    { label: 'm²',         omschrPh: 'Prijs per m²',   v1Ph: '0 m²',   v2Ph: '0,00', hasV1: true,  v1Step: '0.01', regelLabel: r => `${r.aantal}m² × €${r.eenheidsprijs}` },
  stuks: { label: 'Stuks',      omschrPh: 'Materiaalkosten', v1Ph: '0 st',   v2Ph: '0,00', hasV1: true,  v1Step: '1',    regelLabel: r => `${r.aantal} st × €${r.eenheidsprijs}` },
  km:    { label: 'Km',         omschrPh: 'Reisvergoeding',  v1Ph: '0 km',   v2Ph: '0,00', hasV1: true,  v1Step: '1',    regelLabel: r => `${r.aantal}km × €${r.eenheidsprijs}` },
  vast:  { label: 'Vast bedrag', omschrPh: 'Overige kosten', v1Ph: '0',      v2Ph: '0,00', hasV1: true,  v1Step: '1',    regelLabel: r => `${r.aantal} × €${r.eenheidsprijs}` },
};

function BtwSelect({ r, setRegel }) {
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center', minWidth: 0, overflow: 'hidden' }}>
      <select value={r.btw} onChange={e => setRegel(r.id, 'btw', e.target.value)} style={{ flex: 1, minWidth: 0 }}>
        <option value="21">21%</option>
        <option value="9">9%</option>
        <option value="anders">Anders</option>
      </select>
      {r.btw === 'anders' && (
        <input type="number" min="0" max="100" step="1" placeholder="0" value={r.btwAnders} onChange={e => setRegel(r.id, 'btwAnders', e.target.value)} style={{ minWidth: 60, flexShrink: 0 }} />
      )}
    </div>
  );
}

export function NewOfferteModal({ customers, deals = [], prefillDealId = null, prefillCustomerId = null, onClose, onSaved, onSaveAndSend }) {
  const toast = useToast();
  const [form, setForm] = useState({ customer_id: prefillCustomerId || '', deal_id: prefillDealId || '', omschrijving: '', geldig_tot: '', notes: '' });
  const [regels, setRegels] = useState([emptyRegel()]);
  const [saving, setSaving] = useState(false);
  const [instDefaults, setInstDefaults] = useState(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    getBedrijfsinstellingen().then(s => {
      if (!s) return;
      setInstDefaults(s);
      const d = new Date();
      d.setDate(d.getDate() + (s.offerteGeldigDagen || 14));
      const geldig = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      setForm(f => ({ ...f, geldig_tot: geldig }));
      setRegels(rs => rs.map((r, i) => i === 0 ? {
        ...r, btw: String(s.btwPct),
        eenheidsprijs: r.type === 'uren' ? s.uurtarief : r.type === 'km' ? s.reiskostenPerKm : r.eenheidsprijs,
      } : r));
    }).catch(() => {});
  }, []);

  const setRegel = (id, k, v) => setRegels(rs => rs.map(r => {
    if (r.id !== id) return r;
    if (k === 'type') {
      if (v === 'uren') return { ...r, type: v, eenheidsprijs: instDefaults?.uurtarief ?? 0 };
      if (v === 'km')   return { ...r, type: v, eenheidsprijs: instDefaults?.reiskostenPerKm ?? 0 };
      if (v === 'vast') return { ...r, type: v, eenheidsprijs: 0 };
    }
    return { ...r, [k]: v };
  }));
  const addRegel = () => setRegels(rs => [...rs, {
    id: crypto.randomUUID(), omschrijving: '', type: 'uren', aantal: 1,
    eenheidsprijs: instDefaults?.uurtarief ?? 0, btw: String(instDefaults?.btwPct ?? 21), btwAnders: '',
  }]);
  const removeRegel = (id) => setRegels(rs => rs.filter(r => r.id !== id));

  const getRegelprijs = r => Math.round(Number(r.aantal || 0) * Number(r.eenheidsprijs || 0) * 100) / 100;
  const getEffBtw = r => r.btw === 'anders' ? Number(r.btwAnders || 0) : Number(r.btw);

  const totaalExcl = Math.round(regels.reduce((s, r) => s + getRegelprijs(r), 0) * 100) / 100;

  const btwPerTarief = {};
  for (const r of regels) {
    const pct = getEffBtw(r);
    const key = String(pct);
    btwPerTarief[key] = Math.round(((btwPerTarief[key] || 0) + getRegelprijs(r) * pct / 100) * 100) / 100;
  }
  const totaalIncl = Math.round((totaalExcl + Object.values(btwPerTarief).reduce((s, v) => s + v, 0)) * 100) / 100;

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
  const modalStyle = isMobile ? { width: '100vw', height: '100vh', maxWidth: '100vw', maxHeight: '100vh', borderRadius: 0, overflow: 'auto' } : { overflowX: 'hidden' };
  const overlayStyle = isMobile ? { padding: 0, alignItems: 'flex-start' } : {};

  const doCreate = async () => {
    if (!form.customer_id) { toast.error('Selecteer een klant'); return null; }
    const created = await createOfferte({ ...form, marge_pct: 0, totaal_excl: totaalExcl, totaal_incl: totaalIncl });
    for (let i = 0; i < regels.length; i++) {
      const r = regels[i];
      const omschrijving = r.omschrijving.trim() || TYPE_CFG[r.type]?.omschrPh || '';
      await createOfferteItem({ offerte_id: created.id, omschrijving, aantal: Number(r.aantal || 1), prijs_per: Number(r.eenheidsprijs || 0), subtotaal: getRegelprijs(r), volgorde: i });
    }
    return created;
  };

  const submit = async () => {
    setSaving(true);
    try {
      const created = await doCreate();
      if (!created) return;
      toast.success('Offerte aangemaakt');
      onSaved?.(created);
      onClose();
    } catch (err) { toast.error(err.message || 'Mislukt'); } finally { setSaving(false); }
  };

  const submitAndSend = async () => {
    setSaving(true);
    try {
      const created = await doCreate();
      if (!created) return;
      toast.success('Offerte aangemaakt');
      onSaved?.(created);
      onSaveAndSend?.(created);
      onClose();
    } catch (err) { toast.error(err.message || 'Mislukt'); } finally { setSaving(false); }
  };

  const COLS = '78px minmax(0,1fr) 68px 84px 110px 84px 28px';

  return (
    <div className="overlay" style={overlayStyle} onClick={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="modal modal-wide" style={modalStyle}>
        <div className="modal-hd">
          <div>
            <div className="modal-title">Nieuwe offerte</div>
            <div className="modal-sub">Vul de offerte gegevens in</div>
          </div>
          <ModalX onClose={onClose} />
        </div>
        <div className="fg">
          <div className="f s2">
            <label>Klant *</label>
            <select value={form.customer_id} onChange={e => { set('customer_id', e.target.value); set('deal_id', ''); }}>
              <option value="">— Selecteer klant —</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {form.customer_id && (
            <div className="f s2">
              <label>Project (optioneel)</label>
              <select value={form.deal_id} onChange={e => set('deal_id', e.target.value)}>
                <option value="">— Geen project —</option>
                {deals.filter(d => d.custId === form.customer_id).map(d => (
                  <option key={d.id} value={d.id}>{d.title}{d.value > 0 ? ` · €${Number(d.value).toLocaleString('nl-NL')}` : ''}</option>
                ))}
              </select>
            </div>
          )}
          <div className="f s2">
            <label>Omschrijving</label>
            <textarea rows={2} value={form.omschrijving} onChange={e => set('omschrijving', e.target.value)} placeholder="Korte omschrijving van de werkzaamheden" />
          </div>

          {/* ── Regelitems ── */}
          <div className="f s2" style={{ flexDirection: 'column', gap: 6 }}>
            <label style={{ marginBottom: 0 }}>Regelitems</label>

            {isMobile ? (
              /* ── Mobiel: gestapeld per regel ── */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {regels.map(r => {
                  const cfg = TYPE_CFG[r.type] || TYPE_CFG.uren;
                  return (
                    <div key={r.id} style={{ border: '1px solid var(--bstrong)', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <select value={r.type} onChange={e => setRegel(r.id, 'type', e.target.value)} style={{ flex: 1 }}>
                          {Object.entries(TYPE_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                        <button className="btn btn-xs btn-danger btn-icon" onClick={() => removeRegel(r.id)} disabled={regels.length === 1} title="Verwijderen">{I.trash}</button>
                      </div>
                      <input type="text" placeholder={cfg.omschrPh} value={r.omschrijving} onChange={e => setRegel(r.id, 'omschrijving', e.target.value)} />
                      <div style={{ display: 'grid', gridTemplateColumns: cfg.hasV1 ? '1fr 1fr' : '1fr', gap: 6 }}>
                        {cfg.hasV1 && (
                          <input type="number" min="0" step={cfg.v1Step} placeholder={cfg.v1Ph} value={r.aantal} onChange={e => setRegel(r.id, 'aantal', e.target.value)} />
                        )}
                        <input type="number" min="0" step="0.01" placeholder={cfg.v2Ph} value={r.eenheidsprijs} onChange={e => setRegel(r.id, 'eenheidsprijs', e.target.value)} />
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
                        <BtwSelect r={r} setRegel={setRegel} />
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{fmt(getRegelprijs(r))}</div>
                          {cfg.regelLabel && Number(r.aantal) > 0 && Number(r.eenheidsprijs) > 0 && (
                            <div style={{ fontSize: 10, color: 'var(--dl)' }}>{cfg.regelLabel(r)}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* ── Desktop: grid ── */
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 5, fontSize: 11, fontWeight: 600, color: 'var(--dl)', textTransform: 'uppercase', letterSpacing: '.04em', padding: '0 0 4px' }}>
                  <span>Type</span><span>Omschrijving</span><span>Hoev.</span><span>Prijs</span><span>BTW</span><span style={{ textAlign: 'right' }}>Bedrag</span><span />
                </div>
                {regels.map(r => {
                  const cfg = TYPE_CFG[r.type] || TYPE_CFG.uren;
                  return (
                    <div key={r.id} style={{ display: 'grid', gridTemplateColumns: COLS, gap: 5, alignItems: 'center', marginBottom: 5 }}>
                      <select value={r.type} onChange={e => setRegel(r.id, 'type', e.target.value)} style={{ minWidth: 0 }}>
                        {Object.entries(TYPE_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                      <input type="text" placeholder={cfg.omschrPh} value={r.omschrijving} onChange={e => setRegel(r.id, 'omschrijving', e.target.value)} style={{ minWidth: 0 }} />
                      <input
                        type="number" min="0" step={cfg.v1Step} placeholder={cfg.v1Ph || ''}
                        value={r.aantal}
                        onChange={e => setRegel(r.id, 'aantal', e.target.value)}
                        style={{ minWidth: 0, visibility: cfg.hasV1 ? 'visible' : 'hidden' }}
                      />
                      <input type="number" min="0" step="0.01" placeholder={cfg.v2Ph} value={r.eenheidsprijs} onChange={e => setRegel(r.id, 'eenheidsprijs', e.target.value)} style={{ minWidth: 0 }} />
                      <BtwSelect r={r} setRegel={setRegel} />
                      <div style={{ textAlign: 'right', overflow: 'hidden' }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--tx)', whiteSpace: 'nowrap' }}>{fmt(getRegelprijs(r))}</div>
                        {cfg.regelLabel && Number(r.aantal) > 0 && Number(r.eenheidsprijs) > 0 && (
                          <div style={{ fontSize: 10, color: 'var(--dl)', whiteSpace: 'nowrap' }}>{cfg.regelLabel(r)}</div>
                        )}
                      </div>
                      <button className="btn btn-xs btn-danger btn-icon" onClick={() => removeRegel(r.id)} disabled={regels.length === 1} title="Verwijderen">{I.trash}</button>
                    </div>
                  );
                })}
              </div>
            )}

            <div>
              <button className="btn btn-ghost" style={{ fontSize: 13, padding: '4px 10px' }} onClick={addRegel}>{I.plus} Regel toevoegen</button>
            </div>
          </div>

          <div className="f">
            <label>Geldig tot</label>
            <input type="date" value={form.geldig_tot} onChange={e => set('geldig_tot', e.target.value)} />
          </div>

          {/* ── Totalen ── */}
          <div className="f s2" style={{ padding: '10px 14px', background: 'var(--pll)', borderRadius: 8, fontSize: 13 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--dl)' }}>Subtotaal excl. BTW</span>
                <span style={{ fontWeight: 500 }}>{fmt(totaalExcl)}</span>
              </div>
              {Object.entries(btwPerTarief).filter(([, bedrag]) => bedrag > 0).map(([pct, bedrag]) => (
                <div key={pct} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--dl)' }}>BTW {pct}%</span>
                  <span>{fmt(bedrag)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid var(--br)', fontWeight: 700, fontSize: 14 }}>
                <span>Totaal incl. BTW</span>
                <span style={{ color: 'var(--p)' }}>{fmt(totaalIncl)}</span>
              </div>
            </div>
          </div>

          <div className="f s2">
            <label>Notities</label>
            <textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Interne notities..." />
          </div>
        </div>
        <div className="fa">
          <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
          {onSaveAndSend && <button className="btn btn-s" onClick={submitAndSend} disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Send size={14} />{saving ? 'Bezig...' : 'Opslaan en versturen'}</button>}
          <button className="btn btn-p" onClick={submit} disabled={saving}>{saving ? 'Opslaan...' : 'Opslaan'}</button>
        </div>
      </div>
    </div>
  );
}

// ── EDIT OFFERTE MODAL ───────────────────────────────────────────────────────

function EditOfferteModal({ offerte, customers, onClose, onSaved, onSaveAndSend }) {
  const toast = useToast();
  const [form, setForm] = useState({
    customer_id: offerte.customerId || '',
    omschrijving: offerte.omschrijving || '',
    geldig_tot: offerte.geldigTot || '',
    notes: offerte.notes || '',
    status: offerte.status || 'concept',
  });
  const [regels, setRegels] = useState([emptyRegel()]);
  const [loadingRegels, setLoadingRegels] = useState(true);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    getOfferteItems(offerte.id).then(items => {
      if (items.length > 0) {
        setRegels(items.map(item => ({
          id: crypto.randomUUID(),
          omschrijving: item.omschrijving,
          type: item.aantal > 1 ? 'uren' : 'vast',
          aantal: item.aantal,
          eenheidsprijs: item.prijsPer ?? 0,
          btw: '21',
          btwAnders: '',
        })));
      }
      setLoadingRegels(false);
    }).catch(() => setLoadingRegels(false));
  }, [offerte.id]);

  const setRegel = (id, k, v) => setRegels(rs => rs.map(r => r.id === id ? { ...r, [k]: v } : r));
  const addRegel = () => setRegels(rs => [...rs, emptyRegel()]);
  const removeRegel = (id) => setRegels(rs => rs.filter(r => r.id !== id));

  const getRegelprijs = r => Math.round(Number(r.aantal || 0) * Number(r.eenheidsprijs || 0) * 100) / 100;
  const getEffBtw = r => r.btw === 'anders' ? Number(r.btwAnders || 0) : Number(r.btw);

  const totaalExcl = Math.round(regels.reduce((s, r) => s + getRegelprijs(r), 0) * 100) / 100;
  const btwPerTarief = {};
  for (const r of regels) {
    const pct = getEffBtw(r);
    const key = String(pct);
    btwPerTarief[key] = Math.round(((btwPerTarief[key] || 0) + getRegelprijs(r) * pct / 100) * 100) / 100;
  }
  const totaalIncl = Math.round((totaalExcl + Object.values(btwPerTarief).reduce((s, v) => s + v, 0)) * 100) / 100;

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
  const modalStyle = isMobile ? { width: '100vw', height: '100vh', maxWidth: '100vw', maxHeight: '100vh', borderRadius: 0, overflow: 'auto' } : { overflowX: 'hidden' };
  const overlayStyle = isMobile ? { padding: 0, alignItems: 'flex-start' } : {};
  const COLS = '78px minmax(0,1fr) 68px 84px 110px 84px 28px';

  const doSave = async () => {
    const updated = await updateOfferte(offerte.id, {
      customer_id: form.customer_id, omschrijving: form.omschrijving,
      geldig_tot: form.geldig_tot || null,
      notes: form.notes, status: form.status, totaal_excl: totaalExcl, totaal_incl: totaalIncl,
    });
    await deleteOfferteItemsByOfferteId(offerte.id);
    for (let i = 0; i < regels.length; i++) {
      const r = regels[i];
      const omschrijving = r.omschrijving.trim() || TYPE_CFG[r.type]?.omschrPh || '';
      await createOfferteItem({ offerte_id: offerte.id, omschrijving, aantal: Number(r.aantal || 1), prijs_per: Number(r.eenheidsprijs || 0), subtotaal: getRegelprijs(r), volgorde: i });
    }
    onSaved?.(updated);
    return updated;
  };

  const submit = async () => {
    setSaving(true);
    try {
      await doSave();
      toast.success('Offerte opgeslagen');
      onClose();
    } catch (err) { toast.error(err.message || 'Mislukt'); } finally { setSaving(false); }
  };

  const submitAndSend = async () => {
    setSaving(true);
    try {
      const updated = await doSave();
      toast.success('Offerte opgeslagen');
      onSaveAndSend?.(updated);
      onClose();
    } catch (err) { toast.error(err.message || 'Mislukt'); } finally { setSaving(false); }
  };

  return (
    <div className="overlay" style={overlayStyle} onClick={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="modal modal-wide" style={modalStyle}>
        <div className="modal-hd">
          <div>
            <div className="modal-title">Offerte bewerken</div>
            <div className="modal-sub">{offerte.nummer}</div>
          </div>
          <ModalX onClose={onClose} />
        </div>
        {loadingRegels ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--dl)' }}>Regelitems laden…</div>
        ) : (
          <div className="fg">
            <div className="f s2">
              <label>Klant</label>
              <select value={form.customer_id} onChange={e => set('customer_id', e.target.value)}>
                <option value="">— Selecteer klant —</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="f s2">
              <label>Omschrijving</label>
              <textarea rows={2} value={form.omschrijving} onChange={e => set('omschrijving', e.target.value)} />
            </div>

            <div className="f s2" style={{ flexDirection: 'column', gap: 6 }}>
              <label style={{ marginBottom: 0 }}>Regelitems</label>
              {isMobile ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {regels.map(r => {
                    const cfg = TYPE_CFG[r.type] || TYPE_CFG.uren;
                    return (
                      <div key={r.id} style={{ border: '1px solid var(--bstrong)', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <select value={r.type} onChange={e => setRegel(r.id, 'type', e.target.value)} style={{ flex: 1 }}>
                            {Object.entries(TYPE_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                          </select>
                          <button className="btn btn-xs btn-danger btn-icon" onClick={() => removeRegel(r.id)} disabled={regels.length === 1} title="Verwijderen">{I.trash}</button>
                        </div>
                        <input type="text" placeholder={cfg.omschrPh} value={r.omschrijving} onChange={e => setRegel(r.id, 'omschrijving', e.target.value)} />
                        <div style={{ display: 'grid', gridTemplateColumns: cfg.hasV1 ? '1fr 1fr' : '1fr', gap: 6 }}>
                          {cfg.hasV1 && (
                            <input type="number" min="0" step={cfg.v1Step} placeholder={cfg.v1Ph} value={r.aantal} onChange={e => setRegel(r.id, 'aantal', e.target.value)} />
                          )}
                          <input type="number" min="0" step="0.01" placeholder={cfg.v2Ph} value={r.eenheidsprijs} onChange={e => setRegel(r.id, 'eenheidsprijs', e.target.value)} />
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
                          <BtwSelect r={r} setRegel={setRegel} />
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{fmt(getRegelprijs(r))}</div>
                            {cfg.regelLabel && Number(r.aantal) > 0 && Number(r.eenheidsprijs) > 0 && (
                              <div style={{ fontSize: 10, color: 'var(--dl)' }}>{cfg.regelLabel(r)}</div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 5, fontSize: 11, fontWeight: 600, color: 'var(--dl)', textTransform: 'uppercase', letterSpacing: '.04em', padding: '0 0 4px' }}>
                    <span>Type</span><span>Omschrijving</span><span>Hoev.</span><span>Prijs</span><span>BTW</span><span style={{ textAlign: 'right' }}>Bedrag</span><span />
                  </div>
                  {regels.map(r => {
                    const cfg = TYPE_CFG[r.type] || TYPE_CFG.uren;
                    return (
                      <div key={r.id} style={{ display: 'grid', gridTemplateColumns: COLS, gap: 5, alignItems: 'center', marginBottom: 5 }}>
                        <select value={r.type} onChange={e => setRegel(r.id, 'type', e.target.value)} style={{ minWidth: 0 }}>
                          {Object.entries(TYPE_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                        <input type="text" placeholder={cfg.omschrPh} value={r.omschrijving} onChange={e => setRegel(r.id, 'omschrijving', e.target.value)} style={{ minWidth: 0 }} />
                        <input type="number" min="0" step={cfg.v1Step} placeholder={cfg.v1Ph || ''}
                          value={r.aantal} onChange={e => setRegel(r.id, 'aantal', e.target.value)}
                          style={{ minWidth: 0, visibility: cfg.hasV1 ? 'visible' : 'hidden' }} />
                        <input type="number" min="0" step="0.01" placeholder={cfg.v2Ph} value={r.eenheidsprijs} onChange={e => setRegel(r.id, 'eenheidsprijs', e.target.value)} style={{ minWidth: 0 }} />
                        <BtwSelect r={r} setRegel={setRegel} />
                        <div style={{ textAlign: 'right', overflow: 'hidden' }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--tx)', whiteSpace: 'nowrap' }}>{fmt(getRegelprijs(r))}</div>
                          {cfg.regelLabel && Number(r.aantal) > 0 && Number(r.eenheidsprijs) > 0 && (
                            <div style={{ fontSize: 10, color: 'var(--dl)', whiteSpace: 'nowrap' }}>{cfg.regelLabel(r)}</div>
                          )}
                        </div>
                        <button className="btn btn-xs btn-danger btn-icon" onClick={() => removeRegel(r.id)} disabled={regels.length === 1} title="Verwijderen">{I.trash}</button>
                      </div>
                    );
                  })}
                </div>
              )}
              <div>
                <button className="btn btn-ghost" style={{ fontSize: 13, padding: '4px 10px' }} onClick={addRegel}>{I.plus} Regel toevoegen</button>
              </div>
            </div>

            <div className="f">
              <label>Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)}>
                <option value="concept">Concept</option>
                <option value="verzonden">Verzonden</option>
                <option value="geaccepteerd">Geaccepteerd</option>
                <option value="afgewezen">Afgewezen</option>
              </select>
            </div>
            <div className="f">
              <label>Geldig tot</label>
              <input type="date" value={form.geldig_tot} onChange={e => set('geldig_tot', e.target.value)} />
            </div>

            <div className="f s2" style={{ padding: '10px 14px', background: 'var(--pll)', borderRadius: 8, fontSize: 13 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--dl)' }}>Subtotaal excl. BTW</span>
                  <span style={{ fontWeight: 500 }}>{fmt(totaalExcl)}</span>
                </div>
                {Object.entries(btwPerTarief).filter(([, bedrag]) => bedrag > 0).map(([pct, bedrag]) => (
                  <div key={pct} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--dl)' }}>BTW {pct}%</span>
                    <span>{fmt(bedrag)}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid var(--br)', fontWeight: 700, fontSize: 14 }}>
                  <span>Totaal incl. BTW</span>
                  <span style={{ color: 'var(--p)' }}>{fmt(totaalIncl)}</span>
                </div>
              </div>
            </div>

            <div className="f s2">
              <label>Notities</label>
              <textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>
          </div>
        )}
        <div className="fa">
          <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
          {onSaveAndSend && <button className="btn btn-s" onClick={submitAndSend} disabled={saving || loadingRegels} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Send size={14} />{saving ? 'Bezig...' : 'Opslaan en versturen'}</button>}
          <button className="btn btn-p" onClick={submit} disabled={saving || loadingRegels}>{saving ? 'Opslaan...' : 'Opslaan'}</button>
        </div>
      </div>
    </div>
  );
}

// ── VIEW OFFERTE MODAL ───────────────────────────────────────────────────────

function ViewOfferteModal({ offerte, customers, onClose, onMaakFactuur, onSendMail }) {
  const { company } = useProfile();
  const toast = useToast();
  const customerName = offerte.customerName || customers.find(c => c.id == offerte.customerId)?.name || '—';
  const [pdfLoading, setPdfLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  const handleDownloadPdf = async () => {
    setPdfLoading(true);
    try {
      const customer = customers.find(c => String(c.id) === String(offerte.customerId));
      const items = await getOfferteItems(offerte.id);
      await generateOffertePdf(offerte, items, customer, company);
    } catch (err) {
      console.error('PDF genereren mislukt:', err);
      toast.error('PDF genereren mislukt: ' + (err.message || 'Onbekende fout'));
    } finally {
      setPdfLoading(false);
    }
  };

  const handlePreviewPdf = async () => {
    setPreviewLoading(true);
    try {
      const customer = customers.find(c => String(c.id) === String(offerte.customerId));
      const items = await getOfferteItems(offerte.id);
      await previewOffertePdf(offerte, items, customer, company);
    } catch (err) {
      console.error('PDF preview mislukt:', err);
      toast.error('PDF preview mislukt: ' + (err.message || 'Onbekende fout'));
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-wide">
        <div className="modal-hd">
          <div>
            <div className="modal-title">{offerte.nummer}</div>
            <div className="modal-sub">{offerte.omschrijving || 'Offerte details'}</div>
          </div>
          <ModalX onClose={onClose} />
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--dl)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Klant</div>
              <div style={{ fontWeight: 500 }}>{customerName}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--dl)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Status</div>
              <div>{offerteBadge(offerte.status)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--dl)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Geldig tot</div>
              <div>{fmtDate(offerte.geldigTot)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--dl)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Aangemaakt</div>
              <div>{fmtDate(offerte.createdAt?.slice(0, 10))}</div>
            </div>
          </div>
          <hr style={{ border: 'none', borderTop: '1px solid var(--br)', margin: 0 }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--dl)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Arbeidsuren</div>
              <div>{offerte.arbeidsuren} uur × {fmt(offerte.uurtarief)}/u</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--dl)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Materiaalkosten</div>
              <div>{fmt(offerte.materiaalkosten)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--dl)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Reiskosten</div>
              <div>{fmt(offerte.reiskosten)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--dl)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Marge / BTW</div>
              <div>{offerte.margePct}% / {offerte.btwPct}%</div>
            </div>
          </div>
          <div style={{ background: 'var(--pll)', borderRadius: 10, padding: '14px 16px', display: 'flex', gap: 24 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--dl)', marginBottom: 2 }}>Totaal excl. BTW</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{fmt(offerte.totaalExcl)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--dl)', marginBottom: 2 }}>Totaal incl. BTW</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--p)' }}>{fmt(offerte.totaalIncl)}</div>
            </div>
          </div>
          {offerte.notes && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--dl)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Notities</div>
              <div style={{ fontSize: 13, color: 'var(--tx)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{offerte.notes}</div>
            </div>
          )}
          {offerte.signedAt && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: '#f0fdf4', border: '1px solid #bbf7d0',
              borderRadius: 8, padding: '10px 14px',
            }}>
              <span style={{ fontSize: 16 }}>✅</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#15803d' }}>Ondertekend</div>
                <div style={{ fontSize: 11, color: '#166534' }}>
                  {offerte.signedByName} · {new Date(offerte.signedAt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="fa">
          {onSendMail && <button className="btn btn-s" onClick={() => { onClose(); onSendMail(offerte); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Send size={14} /> Verstuur per mail</button>}
          {offerte.signedPdfUrl ? (
            <a
              href={offerte.signedPdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-p"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
            >
              <Download size={15} /> Download getekende offerte
            </a>
          ) : (
            <>
              <button className="btn btn-ghost" onClick={handlePreviewPdf} disabled={previewLoading} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {previewLoading ? 'Laden...' : 'Preview PDF'}
              </button>
              <button className="btn btn-p" onClick={handleDownloadPdf} disabled={pdfLoading} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Download size={15} />{pdfLoading ? 'Genereren...' : 'Download PDF'}
              </button>
            </>
          )}
          <button className="btn btn-ghost" onClick={onClose}>Sluiten</button>
          {offerte.status === 'geaccepteerd' && onMaakFactuur && (
            <button className="btn btn-p" onClick={() => onMaakFactuur(offerte)}>{I.brief} Maak factuur</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── SEND EMAIL MODAL ─────────────────────────────────────────────────────────

function SendOfferteMailModal({ offerte, customers, company, onClose, onSent }) {
  const toast = useToast();
  const [form, setForm] = useState({ to: '', subject: '', body: '' });
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const appUrl = window.location.origin;
  const signLink = `${appUrl}/offerte/${offerte.sign_token || ''}`;
  const customer = customers.find(c => c.id == offerte.customerId);
  const fmt2 = n => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0);
  const fmtDate = d => d ? new Date(d).toLocaleDateString('nl-NL') : '—';

  useEffect(() => {
    const vars = {
      klant_naam: customer?.name || offerte.customerName || 'klant',
      bedrijfsnaam: company?.name || 'ons bedrijf',
      offerte_nummer: offerte.nummer,
      omschrijving: offerte.omschrijving || '',
      totaal_bedrag: fmt2(offerte.totaalIncl),
      vervaldatum: fmtDate(offerte.geldigTot),
      link: signLink,
    };
    getMailTemplate('offerte')
      .then(tpl => {
        const sub = tpl ? substituteVars(tpl.onderwerp || '', vars) : `Offerte ${offerte.nummer} van ${company?.name || ''}`;
        const rawBody = tpl ? substituteVars(tpl.body || '', vars) : `Beste ${vars.klant_naam},\n\nHierbij sturen wij u offerte ${offerte.nummer} toe.\n\nVia onderstaande link kunt u de offerte bekijken en digitaal ondertekenen:\n${signLink}\n\nMet vriendelijke groet,\n${company?.name || ''}`;
        setForm({ to: customer?.email || '', subject: sub, body: plainToEditorHtml(rawBody) });
      })
      .catch(() => setForm({ to: customer?.email || '', subject: `Offerte ${offerte.nummer}`, body: '' }))
      .finally(() => setLoading(false));
  }, []);

  const handleSend = async () => {
    if (!form.to) { toast.error('E-mailadres is verplicht'); return; }
    setSending(true);
    try {
      let attachments = [];
      try {
        const items = await getOfferteItems(offerte.id);
        const pdfBase64 = await getOffertePdfBase64(offerte, items, customer, company);
        attachments = [{ filename: `Offerte-${offerte.nummer}.pdf`, content: pdfBase64 }];
      } catch (pdfErr) {
        console.warn('PDF bijlage genereren mislukt:', pdfErr.message);
      }
      await sendEmail({ to: form.to, subject: form.subject, html: form.body, attachments });
      await logSentEmail({ toEmail: form.to, subject: form.subject, bodyHtml: form.body, relatedType: 'offerte', relatedId: offerte.id, customerId: offerte.customerId });
      if (offerte.status === 'concept') await updateOfferte(offerte.id, { status: 'verzonden' });
      logTijdlijnSafe(offerte.customerId, 'email_verstuurd', `E-mail verstuurd: ${form.subject}`, { to: form.to, subject: form.subject });
      toast.success('E-mail verstuurd');
      onSent?.();
      onClose();
    } catch (err) {
      toast.error(err.message || 'Versturen mislukt');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-wide">
        <div className="modal-hd">
          <div>
            <div className="modal-title">Offerte versturen per e-mail</div>
            <div className="modal-sub">{offerte.nummer}</div>
          </div>
          <ModalX onClose={onClose} />
        </div>
        {loading ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--dl)' }}>Template laden…</div>
        ) : (
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: 'var(--pll)', borderRadius: 8, padding: '10px 14px', fontSize: '.82rem', color: 'var(--dm)' }}>
              Ondertekeningslink: <span style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{signLink}</span>
            </div>
            <div className="f"><label>Aan</label><input value={form.to} onChange={e => setForm(f => ({ ...f, to: e.target.value }))} placeholder="emailadres@klant.nl" /></div>
            <div className="f"><label>Onderwerp</label><input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} /></div>
            <div className="f">
              <label>Bericht</label>
              <MailBodyEditor value={form.body} onChange={html => setForm(f => ({ ...f, body: html }))} placeholder="Schrijf uw bericht hier..." minHeight={200} />
            </div>
          </div>
        )}
        <div className="fa">
          <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
          <button className="btn btn-p" onClick={handleSend} disabled={sending || loading} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Send size={14} />{sending ? 'Versturen...' : 'Versturen'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── OFFERTES PAGE ────────────────────────────────────────────────────────────

export function OffertesPage({ openCustomer, preOpenOfferteId, preFillDealId, onNavConsumed }) {
  const toast = useToast();
  const { profile, company } = useProfile();
  const canManageOffertes = profile?.role === 'admin' || profile?.role === 'planner';
  const [offertes, setOffertes] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [newDealId, setNewDealId] = useState(null);
  const [editOfferte, setEditOfferte] = useState(null);
  const [viewOfferte, setViewOfferte] = useState(null);
  const [factuurPrefill, setFactuurPrefill] = useState(null);
  const [sendMailOfferte, setSendMailOfferte] = useState(null);
  const [sendMailFactuur, setSendMailFactuur] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([getOffertes(), listCustomers(), listDeals().catch(() => [])])
      .then(([o, c, d]) => { setOffertes(o); setCustomers(c); setDeals(d); setError(''); })
      .catch(err => setError(err.message || 'Laden mislukt'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // Deep-open a specific offerte requested from the dashboard
  useEffect(() => {
    if (!preOpenOfferteId || loading) return;
    const o = offertes.find(x => x.id === preOpenOfferteId);
    if (o) {
      setViewOfferte(o);
      onNavConsumed && onNavConsumed();
    } else if (import.meta.env.DEV) {
      console.warn('[bb:dashboard] offerte niet gevonden voor deep-open:', preOpenOfferteId);
    }
  }, [preOpenOfferteId, loading, offertes]);

  // Auto-open nieuw offerte modal met deal vooringevuld (vanuit pipeline/deal drawer)
  useEffect(() => {
    if (!preFillDealId || loading) return;
    setNewDealId(preFillDealId);
    setShowNew(true);
    onNavConsumed && onNavConsumed();
  }, [preFillDealId, loading]);

  const filters = [
    { label: 'Alle', value: '' },
    { label: 'Concept', value: 'concept' },
    { label: 'Verzonden', value: 'verzonden' },
    { label: 'Geaccepteerd', value: 'geaccepteerd' },
    { label: 'Afgewezen', value: 'afgewezen' },
  ];

  const filtered = offertes.filter(o => {
    if (activeFilter && o.status !== activeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const customerName = o.customerName || customers.find(c => c.id == o.customerId)?.name || '';
      return o.nummer.toLowerCase().includes(q) || o.omschrijving.toLowerCase().includes(q) || customerName.toLowerCase().includes(q);
    }
    return true;
  });

  const totalAccepted = offertes.filter(o => o.status === 'geaccepteerd').reduce((s, o) => s + o.totaalIncl, 0);

  const handleDelete = async (o) => {
    if (!window.confirm(`Offerte ${o.nummer} verwijderen?`)) return;
    try {
      await deleteOfferte(o.id);
      setOffertes(prev => prev.filter(x => x.id !== o.id));
      toast.success('Offerte verwijderd');
    } catch (err) { toast.error(err.message || 'Verwijderen mislukt'); }
  };

  const handleMaakFactuur = async (offerte) => {
    setViewOfferte(null);
    try {
      const items = await getOfferteItems(offerte.id);
      const regels = items.map(item => ({
        id: crypto.randomUUID(),
        omschrijving: item.omschrijving || '',
        type: item.aantal > 1 ? 'uren' : 'vast',
        aantal: item.aantal || 1,
        eenheidsprijs: item.prijsPer ?? 0,
        btw: '21',
        btwAnders: '',
      }));
      setFactuurPrefill({
        customer_id: offerte.customerId,
        regels: regels.length ? regels : undefined,
      });
    } catch {
      setFactuurPrefill({ customer_id: offerte.customerId });
    }
  };

  const handleSaved = (saved) => {
    setOffertes(prev => {
      const idx = prev.findIndex(x => x.id === saved.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
      return [saved, ...prev];
    });
  };

  const handleDownloadPdfFromMenu = async (o) => {
    try {
      const [items, customerList] = await Promise.all([
        getOfferteItems(o.id),
        listCustomers(),
      ]);
      const customer = customerList.find(c => c.id === o.customerId) || null;
      await generateOffertePdf(o, items, customer, company);
    } catch (e) {
      toast.error('PDF genereren mislukt: ' + e.message);
    }
  };

  if (loading) return <div className="card card-p" style={{ textAlign: 'center', color: 'var(--dl)' }}>Laden…</div>;

  return (
    <div>
      <div className="page-hd afu">
        <div>
          <h1>Offertes</h1>
          {error && <div style={{ color: '#dc2626', fontSize: 13, marginTop: 4 }}>{error}</div>}
        </div>
        <div className="page-hd-actions">
          {canManageOffertes && (
            <button className="btn btn-p" onClick={() => setShowNew(true)}>
              {I.plus} Nieuwe offerte
            </button>
          )}
        </div>
      </div>

      <div className="afu2">
        <div className="stats-row" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 20 }}>
          <div className="sc">
            <div className="sc-top">
              <div className="sc-icon">{I.quotes}</div>
            </div>
            <div className="sc-val">{offertes.length}</div>
            <div className="sc-label">Totaal offertes</div>
          </div>
          <div className="sc">
            <div className="sc-top">
              <div className="sc-icon">{I.edit}</div>
            </div>
            <div className="sc-val">{offertes.filter(o => o.status === 'concept').length}</div>
            <div className="sc-label">Concept</div>
          </div>
          <div className="sc">
            <div className="sc-top">
              <div className="sc-icon">{I.mail}</div>
            </div>
            <div className="sc-val">{offertes.filter(o => o.status === 'verzonden').length}</div>
            <div className="sc-label">Verzonden</div>
          </div>
          <div className="sc">
            <div className="sc-top">
              <div className="sc-icon">{I.euro}</div>
            </div>
            <div className="sc-val">{offertes.filter(o => o.status === 'geaccepteerd').length} · {fmt(totalAccepted)}</div>
            <div className="sc-label">Geaccepteerd</div>
          </div>
        </div>

        <div className="card">
          <div className="tw-filter">
            <div className="bb-filter-tabs">
              {filters.map(f => (
                <button
                  key={f.value}
                  className={`bb-filter-tab${activeFilter === f.value ? ' on' : ''}`}
                  onClick={() => setActiveFilter(f.value)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="search">
              <span style={{ color: 'var(--dl)', display: 'flex', flexShrink: 0 }}>{I.search}</span>
              <input placeholder="Zoek offerte..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>

          <div style={{ overflowX: 'auto', width: '100%' }}>
            <table className="dt" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th className="th">Nummer</th>
                  <th className="th">Klant</th>
                  <th className="th">Omschrijving</th>
                  <th className="th" style={{ textAlign: 'right' }}>Excl. BTW</th>
                  <th className="th" style={{ textAlign: 'right' }}>Incl. BTW</th>
                  <th className="th">Status</th>
                  <th className="th">Geldig tot</th>
                  <th className="th">Acties</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td className="td" colSpan={8} style={{ textAlign: 'center', color: 'var(--dl)', padding: '32px 0' }}>
                      Geen offertes gevonden
                    </td>
                  </tr>
                )}
                {filtered.map(o => {
                  const customerName = o.customerName || customers.find(c => c.id == o.customerId)?.name || '—';
                  return (
                    <tr key={o.id}>
                      <td className="td">
                        <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 13 }}>{o.nummer}</span>
                      </td>
                      <td className="td">
                        <button
                          onClick={() => openCustomer?.(o.customerId)}
                          style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer' }}
                          onMouseEnter={e => { e.currentTarget.style.color = 'var(--p)'; e.currentTarget.style.textDecoration = 'underline'; }}
                          onMouseLeave={e => { e.currentTarget.style.color = 'inherit'; e.currentTarget.style.textDecoration = 'none'; }}
                        >{customerName}</button>
                      </td>
                      <td className="td" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.omschrijving || '—'}</td>
                      <td className="td" style={{ textAlign: 'right' }}>{fmt(o.totaalExcl)}</td>
                      <td className="td" style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(o.totaalIncl)}</td>
                      <td className="td">{offerteBadge(o.status)}</td>
                      <td className="td">{fmtDate(o.geldigTot)}</td>
                      <td className="td">
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-xs btn-ghost btn-icon" title="Bekijken" onClick={() => setViewOfferte(o)}><MoreVertical size={14} /></button>
                          {canManageOffertes && <button className="btn btn-xs btn-ghost btn-icon" title="Verstuur per mail" onClick={() => setSendMailOfferte(o)}><Send size={13} /></button>}
                          {canManageOffertes && <button className="btn btn-xs btn-ghost btn-icon" title="Bewerken" onClick={() => setEditOfferte(o)}>{I.edit}</button>}
                          {canManageOffertes && <button className="btn btn-xs btn-danger btn-icon" title="Verwijderen" onClick={() => handleDelete(o)}>{I.trash}</button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showNew && (
        <NewOfferteModal
          customers={customers}
          deals={deals}
          prefillDealId={newDealId}
          onClose={() => { setShowNew(false); setNewDealId(null); }}
          onSaved={saved => { handleSaved(saved); setNewDealId(null); }}
          onSaveAndSend={saved => { handleSaved(saved); setSendMailOfferte(saved); }}
        />
      )}
      {editOfferte && (
        <EditOfferteModal
          offerte={editOfferte}
          customers={customers}
          onClose={() => setEditOfferte(null)}
          onSaved={saved => { handleSaved(saved); setEditOfferte(null); }}
          onSaveAndSend={saved => { handleSaved(saved); setEditOfferte(null); setSendMailOfferte(saved); }}
        />
      )}
      {viewOfferte && (
        <ViewOfferteModal
          offerte={viewOfferte}
          customers={customers}
          onClose={() => setViewOfferte(null)}
          onMaakFactuur={handleMaakFactuur}
          onSendMail={o => setSendMailOfferte(o)}
        />
      )}
      {factuurPrefill && (
        <NewFactuurModal
          customers={customers}
          prefill={factuurPrefill}
          onClose={() => setFactuurPrefill(null)}
          onSaved={() => setFactuurPrefill(null)}
          onSaveAndSend={saved => { setFactuurPrefill(null); setSendMailFactuur(saved); }}
          openCustomer={openCustomer}
        />
      )}
      {sendMailFactuur && (
        <SendFactuurMailModal
          factuur={sendMailFactuur}
          customers={customers}
          company={company}
          onClose={() => setSendMailFactuur(null)}
          onSent={() => setSendMailFactuur(null)}
        />
      )}
      {sendMailOfferte && (
        <SendOfferteMailModal
          offerte={sendMailOfferte}
          customers={customers}
          company={company}
          onClose={() => setSendMailOfferte(null)}
          onSent={() => { load(); setSendMailOfferte(null); }}
        />
      )}
    </div>
  );
}
