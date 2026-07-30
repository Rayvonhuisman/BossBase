import { useState, useEffect } from 'react';
import { Download, MoreVertical, Send, CheckCircle2 } from 'lucide-react';
import { NoteEditor } from '../components/NoteEditor.jsx';
import { plainToEditorHtml } from '../lib/noteFormat.js';
import { I, ModalX, fmt, BackToKlant } from '../bb-shared.jsx';
import { useToast } from '../lib/toast.jsx';
import { useProfile } from '../lib/profileContext.jsx';
import { usePlanGuard, PlanStand } from '../components/PlanUpgradeModal.jsx';
import { createFactuurPaymentLink, getStripeConnection } from '../services/stripeService.js';
import {
  getFacturen, createFactuur, updateFactuur, deleteFactuur,
  generateFactuurNummer, getFactuurRegels, createFactuurRegel,
  generateCreditFactuurNummer, createCreditFactuur, uploadFactuurPdf,
} from '../services/factuurService.js';
import { listCustomers } from '../services/customerService.js';
import { getProjects } from '../services/projectsService.js';
import { getBedrijfsinstellingen } from '../services/instellingenService.js';
import { getEigenEenheden } from '../services/eigenEenheidService.js';
import { typeCfg, typeOptionsWith, applyTypeChange, omschrijvingFallback } from '../lib/regelTypes.js';
import { generateFactuurPdf, previewFactuurPdf, getFactuurPdfBase64 } from '../utils/generatePdf.js';
import { buildCompanySnapshot, companyForDocument, isFactuurLocked } from '../utils/documentSnapshot.js';
import { getMailTemplate, sendEmail, substituteVars, logSentEmail } from '../services/emailService.js';
import { mailTemplate, mailButton } from '../utils/mailTemplate.js';
import { logTijdlijnSafe } from '../services/klantTijdlijnService.js';
import { statusInfo } from '../utils/statusColors.js';

// ── HELPERS ──────────────────────────────────────────────────────────────────

const TODAY = () => new Date().toISOString().slice(0, 10);
const THIS_MONTH = () => new Date().toISOString().slice(0, 7);

const isVerlopen = f =>
  f.status !== 'betaald' && f.vervaldatum && f.vervaldatum < TODAY();

const displayStatus = f => (isVerlopen(f) ? 'verlopen' : f.status);

const factuurBadge = f => {
  const s = statusInfo(displayStatus(f), 'factuur');
  return <span className={s.className}>{s.label}</span>;
};

export function FactuurBadge({ f }) { return factuurBadge(f); }

const fmtDate = d => {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}-${m}-${y}`;
};

const DL_STYLE = { fontSize: 11, fontWeight: 600, color: 'var(--dl)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 };

// Zet de "Factuur betalen"-knop in de mailbody: direct vóór de afsluiting
// ("Met vriendelijke groet"), dus meteen na de betaalinstructie. Wordt de
// afsluiting niet gevonden (aangepaste template), dan komt de knop achteraan de
// body — nooit ná de groet. Geen knop-HTML → body onveranderd.
function insertPayButtonBeforeClosing(bodyHtml, buttonHtml) {
  if (!buttonHtml) return bodyHtml;
  const idx = bodyHtml.search(/met vriendelijke groet/i);
  if (idx === -1) return bodyHtml + buttonHtml;
  const before = bodyHtml.slice(0, idx);
  const tagStart = Math.max(before.lastIndexOf('<div'), before.lastIndexOf('<p'));
  const at = tagStart === -1 ? idx : tagStart;
  return bodyHtml.slice(0, at) + buttonHtml + bodyHtml.slice(at);
}

// ── REGEL HELPERS (gedeeld tussen nieuw en bewerk) ───────────────────────────


const emptyRegel = (defaults) => ({
  id: crypto.randomUUID(), omschrijving: '', type: 'uren', aantal: 1,
  eenheidsprijs: defaults?.uurtarief ?? 0, btw: String(defaults?.btwPct ?? 21), btwAnders: '',
});

function BtwSelect({ r, setRegel }) {
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center', minWidth: 0, overflow: 'hidden' }}>
      <select value={r.btw} onChange={e => setRegel(r.id, 'btw', e.target.value)} style={{ flex: 1, minWidth: 0 }}>
        <option value="21">21%</option>
        <option value="9">9%</option>
        <option value="0">Geen btw (0%)</option>
      </select>
    </div>
  );
}

function useRegelTotals(regels) {
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
  return { getRegelprijs, totaalExcl, btwPerTarief, totaalIncl };
}

function RegelItemsForm({ regels, setRegels, defaults, eenheden = [] }) {
  const setRegel = (id, k, v) => setRegels(rs => rs.map(r =>
    r.id === id ? (k === 'type' ? applyTypeChange(r, v, defaults, eenheden) : { ...r, [k]: v }) : r
  ));
  const addRegel = () => setRegels(rs => [...rs, emptyRegel(defaults)]);
  const removeRegel = id => setRegels(rs => rs.filter(r => r.id !== id));
  const { getRegelprijs } = useRegelTotals(regels);
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
  const COLS = '78px minmax(0,1fr) 68px 84px 110px 84px 28px';

  return (
    <div className="f s2" style={{ flexDirection: 'column', gap: 6 }}>
      <label style={{ marginBottom: 0 }}>Regelitems</label>

      {isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {regels.map(r => {
            const cfg = typeCfg(r.type, eenheden);
            return (
              <div key={r.id} style={{ border: '1px solid var(--bstrong)', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <select value={r.type} onChange={e => setRegel(r.id, 'type', e.target.value)} style={{ flex: 1 }}>
                    {typeOptionsWith(eenheden, r.type).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <button className="btn btn-xs btn-danger btn-icon" onClick={() => removeRegel(r.id)} disabled={regels.length === 1}>{I.trash}</button>
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
            const cfg = typeCfg(r.type, eenheden);
            return (
              <div key={r.id} style={{ display: 'grid', gridTemplateColumns: COLS, gap: 5, alignItems: 'center', marginBottom: 5 }}>
                <select value={r.type} onChange={e => setRegel(r.id, 'type', e.target.value)} style={{ minWidth: 0 }}>
                  {typeOptionsWith(eenheden, r.type).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <input type="text" placeholder={cfg.omschrPh} value={r.omschrijving} onChange={e => setRegel(r.id, 'omschrijving', e.target.value)} style={{ minWidth: 0 }} />
                <input type="number" min="0" step={cfg.v1Step} placeholder={cfg.v1Ph || ''} value={r.aantal}
                  onChange={e => setRegel(r.id, 'aantal', e.target.value)}
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
  );
}

function TotalenBlok({ regels }) {
  const { totaalExcl, btwPerTarief, totaalIncl } = useRegelTotals(regels);
  return (
    <div className="f s2" style={{ padding: '10px 14px', background: 'var(--pll)', borderRadius: 8, fontSize: 13 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--dl)' }}>Subtotaal excl. BTW</span>
          <span style={{ fontWeight: 500 }}>{fmt(totaalExcl)}</span>
        </div>
        {Object.entries(btwPerTarief).filter(([, b]) => b > 0).map(([pct, bedrag]) => (
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
  );
}

// ── NEW FACTUUR MODAL ─────────────────────────────────────────────────────────

export function NewFactuurModal({ customers, projects = [], prefill, onClose, onSaved, onSaveAndSend, openCustomer }) {
  const toast = useToast();
  const [nummer, setNummer] = useState('');
  const [form, setForm] = useState({
    customer_id: prefill?.customer_id || '',
    project_id: prefill?.project_id || '',
    factuurdatum: TODAY(),
    vervaldatum: '',
    notities: '',
  });
  const [regels, setRegels] = useState(prefill?.regels?.length ? prefill.regels : [emptyRegel()]);
  const [saving, setSaving] = useState(false);
  const [instDefaults, setInstDefaults] = useState(null);
  const [eenheden, setEenheden] = useState([]);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    getEigenEenheden().then(setEenheden).catch(() => {});
    getBedrijfsinstellingen().then(s => {
      if (!s) return;
      setInstDefaults(s);
      const d = new Date();
      d.setDate(d.getDate() + (s.offerteGeldigDagen || 14));
      const verval = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      set('vervaldatum', verval);
      if (!prefill?.regels?.length) {
        setRegels(rs => rs.map((r, i) => i === 0 ? {
          ...r, btw: String(s.btwPct),
          eenheidsprijs: r.type === 'uren' ? s.uurtarief : r.type === 'km' ? s.reiskostenPerKm : r.eenheidsprijs,
        } : r));
      }
    }).catch(() => {});
  }, []);

  const selectedCustomer = form.customer_id ? customers.find(c => String(c.id) === String(form.customer_id)) : null;
  const missingFields = selectedCustomer ? [
    !selectedCustomer.address && 'adres',
    !selectedCustomer.city && 'plaats',
    !selectedCustomer.email && 'e-mailadres',
  ].filter(Boolean) : [];
  const hasIncompleteCustomer = missingFields.length > 0;

  useEffect(() => {
    generateFactuurNummer().then(setNummer);
  }, []);

  const { totaalExcl, totaalIncl } = useRegelTotals(regels);

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
  const modalStyle = isMobile
    ? { width: '100vw', height: '100vh', maxWidth: '100vw', maxHeight: '100vh', borderRadius: 0, overflow: 'auto' }
    : { overflowX: 'hidden' };
  const overlayStyle = isMobile ? { padding: 0, alignItems: 'flex-start' } : {};

  const doCreate = async () => {
    if (!form.customer_id) { toast.error('Selecteer een klant'); return null; }
    if (hasIncompleteCustomer) { toast.error('Vul eerst de klantgegevens aan voordat je een factuur aanmaakt'); return null; }
    const created = await createFactuur({ ...form, project_id: form.project_id || null, status: 'aangemaakt', nummer, betalingskenmerk: nummer, totaal_excl: totaalExcl, totaal_incl: totaalIncl });
    for (let i = 0; i < regels.length; i++) {
      const r = regels[i];
      const omschrijving = r.omschrijving.trim() || omschrijvingFallback(r.type, eenheden);
      const btwPct = r.btw === 'anders' ? Number(r.btwAnders || 0) : Number(r.btw);
      await createFactuurRegel({ factuur_id: created.id, type: r.type, omschrijving, aantal: Number(r.aantal || 1), eenheidsprijs: Number(r.eenheidsprijs || 0), btw_pct: btwPct, volgorde: i });
    }
    return created;
  };

  const submit = async () => {
    setSaving(true);
    try {
      const created = await doCreate();
      if (!created) return;
      toast.success('Factuur aangemaakt');
      onSaved?.(created);
      onClose();
    } catch (err) { toast.error(err.message || 'Mislukt'); } finally { setSaving(false); }
  };

  const submitAndSend = async () => {
    setSaving(true);
    try {
      const created = await doCreate();
      if (!created) return;
      toast.success('Factuur aangemaakt');
      onSaved?.(created);
      onSaveAndSend?.(created);
      onClose();
    } catch (err) { toast.error(err.message || 'Mislukt'); } finally { setSaving(false); }
  };

  return (
    <div className="overlay" style={overlayStyle} onClick={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="modal modal-wide" style={modalStyle}>
        <div className="modal-hd">
          <div>
            <div className="modal-title">Nieuwe factuur</div>
            <div className="modal-sub">{nummer || '…'}</div>
          </div>
          <ModalX onClose={onClose} />
        </div>
        <div className="fg">
          <div className="f s2">
            <label>Klant *</label>
            <select value={form.customer_id} onChange={e => { set('customer_id', e.target.value); set('project_id', ''); }}>
              <option value="">— Selecteer klant —</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {form.customer_id && projects.filter(p => p.customerId === form.customer_id).length > 0 && (
            <div className="f s2">
              <label>Project (optioneel)</label>
              <select value={form.project_id} onChange={e => set('project_id', e.target.value)}>
                <option value="">— Geen project —</option>
                {projects.filter(p => p.customerId === form.customer_id).map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}
          {hasIncompleteCustomer && (
            <div className="f s2">
              <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#92400e', lineHeight: 1.5 }}>
                <strong>Klantgegevens onvolledig</strong> — ontbrekend: {missingFields.join(', ')}.{' '}
                Vul eerst de klantgegevens aan voordat je een factuur aanmaakt.
                {openCustomer && selectedCustomer && (
                  <button
                    type="button"
                    onClick={() => { onClose(); openCustomer(selectedCustomer.id, 'klantgegevens'); }}
                    style={{ marginLeft: 8, background: 'none', border: 'none', padding: 0, color: '#b45309', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', fontSize: 'inherit' }}
                  >
                    Ga naar klant
                  </button>
                )}
              </div>
            </div>
          )}
          <div className="f">
            <label>Factuurdatum</label>
            <input type="date" value={form.factuurdatum} onChange={e => set('factuurdatum', e.target.value)} />
          </div>
          <div className="f">
            <label>Vervaldatum</label>
            <input type="date" value={form.vervaldatum} onChange={e => set('vervaldatum', e.target.value)} />
          </div>

          <RegelItemsForm regels={regels} setRegels={setRegels} defaults={instDefaults} eenheden={eenheden} />
          <div className="f">
            <label>Betalingskenmerk</label>
            <div style={{ padding: '9px 11px', border: '1px solid var(--bstrong)', borderRadius: 'var(--r8)', fontSize: '.85rem', color: 'var(--dl)', background: 'var(--bgs)' }}>
              {nummer || '…'}
            </div>
          </div>
          <TotalenBlok regels={regels} />
          <div className="f s2">
            <label>Notities / betalingsinstructies</label>
            <textarea rows={2} value={form.notities} onChange={e => set('notities', e.target.value)} placeholder="Betalingsinstructies, interne notities..." />
          </div>
        </div>
        <div className="fa">
          <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
          {onSaveAndSend && <button className="btn btn-s" onClick={submitAndSend} disabled={saving || hasIncompleteCustomer} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Send size={14} />{saving ? 'Bezig...' : 'Opslaan en versturen'}</button>}
          <button className="btn btn-p" onClick={submit} disabled={saving || hasIncompleteCustomer}>{saving ? 'Opslaan...' : 'Opslaan'}</button>
        </div>
      </div>
    </div>
  );
}

// ── EDIT FACTUUR MODAL ────────────────────────────────────────────────────────

function EditFactuurModal({ factuur, customers, onClose, onSaved, onSaveAndSend }) {
  const toast = useToast();
  const [form, setForm] = useState({
    status: factuur.status || 'aangemaakt',
    vervaldatum: factuur.vervaldatum || '',
    betalingskenmerk: factuur.betalingskenmerk || '',
    notities: factuur.notities || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const locked = isFactuurLocked(factuur);

  const doSave = async () => {
    // Een verstuurde factuur is alleen-lezen: enkel de status (bijv. betaald
    // markeren) mag nog wijzigen, de inhoud niet.
    const payload = locked ? { status: form.status } : form;
    const updated = await updateFactuur(factuur.id, payload);
    onSaved?.(updated);
    return updated;
  };

  const submit = async () => {
    setSaving(true);
    try {
      await doSave();
      toast.success('Factuur opgeslagen');
      onClose();
    } catch (err) { toast.error(err.message || 'Mislukt'); } finally { setSaving(false); }
  };

  const submitAndSend = async () => {
    setSaving(true);
    try {
      const updated = await doSave();
      toast.success('Factuur opgeslagen');
      onSaveAndSend?.(updated);
      onClose();
    } catch (err) { toast.error(err.message || 'Mislukt'); } finally { setSaving(false); }
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="modal">
        <div className="modal-hd">
          <div>
            <div className="modal-title">Factuur bewerken</div>
            <div className="modal-sub">{factuur.nummer}</div>
          </div>
          <ModalX onClose={onClose} />
        </div>
        <div className="fg">
          <div className="f s2">
            <label>Status</label>
            <select value={form.status} onChange={e => set('status', e.target.value)}>
              <option value="aangemaakt">Aangemaakt</option>
              <option value="verzonden">Verzonden</option>
              <option value="betaald">Betaald</option>
            </select>
          </div>
          <div className="f">
            <label>Betaaltermijn</label>
            <input type="date" value={form.vervaldatum} onChange={e => set('vervaldatum', e.target.value)} disabled={locked} />
          </div>
          <div className="f s2">
            <label>Betalingskenmerk</label>
            <input type="text" value={form.betalingskenmerk} onChange={e => set('betalingskenmerk', e.target.value)} disabled={locked} />
          </div>
          <div className="f s2">
            <label>Notities</label>
            <textarea rows={3} value={form.notities} onChange={e => set('notities', e.target.value)} disabled={locked} />
          </div>
        </div>
        <div className="fa">
          <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
          {onSaveAndSend && !locked && <button className="btn btn-s" onClick={submitAndSend} disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Send size={14} />{saving ? 'Bezig...' : 'Opslaan en versturen'}</button>}
          <button className="btn btn-p" onClick={submit} disabled={saving}>{saving ? 'Opslaan...' : 'Opslaan'}</button>
        </div>
      </div>
    </div>
  );
}

// ── CREDITEER MODAL ──────────────────────────────────────────────────────────

function CrediteerModal({ factuur, regels, onClose, onSuccess }) {
  const toast = useToast();
  const [mode, setMode] = useState(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(null);
  const [selectedRegels, setSelectedRegels] = useState(() =>
    regels.map(r => ({ ...r, selected: true, aantalCredit: r.aantal, prijsCredit: Math.abs(r.eenheidsprijs) }))
  );

  const handleVolledig = async () => {
    setSaving(true);
    try {
      const credit = await createCreditFactuur(factuur.id, regels, factuur);
      setSuccess(credit.nummer);
    } catch (err) { toast.error(err.message || 'Mislukt'); } finally { setSaving(false); }
  };

  const handleGedeeltelijk = async () => {
    const teCrediteren = selectedRegels.filter(r => r.selected).map(r => ({
      ...r,
      aantal: Number(r.aantalCredit),
      eenheidsprijs: Math.abs(Number(r.prijsCredit)),
      // Ook hier geldt: aantal × prijs, voor élk type. Type 'vast' ("Overig")
      // heeft sinds regelTypes.js een echt aantal — de oude uitzondering
      // crediteerde daardoor te weinig.
      regelprijs: Number(r.aantalCredit) * Math.abs(Number(r.prijsCredit)),
    }));
    if (!teCrediteren.length) { toast.error('Selecteer minimaal één regel'); return; }
    setSaving(true);
    try {
      const credit = await createCreditFactuur(factuur.id, teCrediteren, factuur);
      setSuccess(credit.nummer);
    } catch (err) { toast.error(err.message || 'Mislukt'); } finally { setSaving(false); }
  };

  if (success) {
    return (
      <div className="overlay" onClick={e => e.target === e.currentTarget && (onSuccess?.(), onClose())}>
        <div className="modal">
          <div className="modal-hd">
            <div className="modal-title">Creditfactuur aangemaakt</div>
            <ModalX onClose={() => { onSuccess?.(); onClose(); }} />
          </div>
          <div style={{ padding: '32px 24px', textAlign: 'center' }}>
            <div style={{ marginBottom: 12, color: '#1DDB62', display: 'flex', justifyContent: 'center' }}><CheckCircle2 size={36} /></div>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{success}</div>
            <div style={{ fontSize: 13, color: 'var(--dl)' }}>Creditfactuur succesvol aangemaakt</div>
          </div>
          <div className="fa">
            <button className="btn btn-p" onClick={() => { onSuccess?.(); onClose(); }}>Sluiten</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="modal modal-wide">
        <div className="modal-hd">
          <div>
            <div className="modal-title">Crediteer factuur</div>
            <div className="modal-sub">{factuur.nummer}</div>
          </div>
          <ModalX onClose={onClose} />
        </div>

        {mode === null && (
          <>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 13, color: 'var(--dl)', marginBottom: 4 }}>Kies hoe je deze factuur wilt crediteren:</div>
              <button className="btn btn-ghost" style={{ padding: '14px 16px', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 3, height: 'auto' }} onClick={() => setMode('volledig')}>
                <span style={{ fontWeight: 600 }}>Volledig crediteren</span>
                <span style={{ fontSize: 12, color: 'var(--dl)', fontWeight: 400 }}>Crediteer alle regelitems voor het volledige bedrag</span>
              </button>
              <button className="btn btn-ghost" style={{ padding: '14px 16px', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 3, height: 'auto' }} onClick={() => setMode('gedeeltelijk')}>
                <span style={{ fontWeight: 600 }}>Gedeeltelijk crediteren</span>
                <span style={{ fontSize: 12, color: 'var(--dl)', fontWeight: 400 }}>Kies welke regelitems en voor welk bedrag je wilt crediteren</span>
              </button>
            </div>
            <div className="fa">
              <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
            </div>
          </>
        )}

        {mode === 'volledig' && (
          <>
            <div style={{ padding: '20px 24px' }}>
              <div style={{ fontSize: 13, color: 'var(--tx)', marginBottom: 14 }}>
                Een creditfactuur wordt aangemaakt voor alle {regels.length} regelitem{regels.length !== 1 ? 's' : ''} van factuur {factuur.nummer}.
              </div>
              <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 16px', fontSize: 13, color: '#991b1b' }}>
                Totaal te crediteren: <strong>{fmt(factuur.totaalIncl)}</strong>
              </div>
            </div>
            <div className="fa">
              <button className="btn btn-ghost" onClick={() => setMode(null)}>Terug</button>
              <button className="btn btn-danger" onClick={handleVolledig} disabled={saving}>
                {saving ? 'Aanmaken...' : 'Volledig crediteren'}
              </button>
            </div>
          </>
        )}

        {mode === 'gedeeltelijk' && (
          <>
            <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {selectedRegels.map((r, i) => (
                <div key={r.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 12px', background: r.selected ? 'var(--pll)' : 'var(--bgs)', borderRadius: 8, border: '1px solid var(--br)' }}>
                  <input type="checkbox" checked={r.selected}
                    onChange={e => setSelectedRegels(prev => prev.map((sr, si) => si === i ? { ...sr, selected: e.target.checked } : sr))}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.omschrijving}</div>
                    <div style={{ fontSize: 11, color: 'var(--dl)' }}>{typeCfg(r.type).label}</div>
                  </div>
                  {/* Aantal voor élk type tonen: "Overig" (type 'vast') heeft een
                      echt aantal, net als in de regel-editor. Stond het veld
                      verborgen, dan kon je bij deels crediteren het aantal niet
                      aanpassen. */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
                    <label style={{ fontSize: 10, color: 'var(--dl)' }}>Aantal</label>
                    <input type="number" min="0" step="0.01" value={r.aantalCredit} disabled={!r.selected}
                      onChange={e => setSelectedRegels(prev => prev.map((sr, si) => si === i ? { ...sr, aantalCredit: e.target.value } : sr))}
                      style={{ width: 72 }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
                    <label style={{ fontSize: 10, color: 'var(--dl)' }}>Prijs</label>
                    <input type="number" min="0" step="0.01" value={r.prijsCredit} disabled={!r.selected}
                      onChange={e => setSelectedRegels(prev => prev.map((sr, si) => si === i ? { ...sr, prijsCredit: e.target.value } : sr))}
                      style={{ width: 84 }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="fa">
              <button className="btn btn-ghost" onClick={() => setMode(null)}>Terug</button>
              <button className="btn btn-danger" onClick={handleGedeeltelijk} disabled={saving}>
                {saving ? 'Aanmaken...' : 'Creditfactuur aanmaken'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── VIEW FACTUUR MODAL ────────────────────────────────────────────────────────

function ViewFactuurModal({ factuur, customers, onClose, onRefresh, onSendMail }) {
  const { company, profile } = useProfile();
  // Betaalherinneringen zijn een feature (Groei+). Zonder die feature tonen we
  // de knoppen niet; server-side blokkeert een trigger op facturen het zetten
  // van herinnering_*_verstuurd_at alsnog.
  const { plan, guardFeature, planModal } = usePlanGuard();
  const kanHerinneren = plan.has('betaalherinneringen');
  const canManage = profile?.role === 'admin' || profile?.role === 'planner';
  const canCrediteer = canManage && (factuur.status === 'verzonden' || factuur.status === 'betaald') && !factuur.gecrediteerd && !factuur.isCredit;
  const customerName = factuur.customerName || customers.find(c => c.id == factuur.customerId)?.name || '—';
  const [regels, setRegels] = useState([]);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showCrediteer, setShowCrediteer] = useState(false);
  const isOverdue = factuur.status !== 'betaald' && factuur.vervaldatum && factuur.vervaldatum < new Date().toISOString().slice(0, 10);

  useEffect(() => {
    getFactuurRegels(factuur.id).then(setRegels).catch(() => {});
  }, [factuur.id]);

  const handleDownloadPdf = async () => {
    setPdfLoading(true);
    try {
      const customer = customers.find(c => String(c.id) === String(factuur.customerId));
      const factuurForPdf = factuur.isCredit ? { ...factuur, creditNote: factuur.notities } : factuur;
      await generateFactuurPdf(factuurForPdf, regels, customer, companyForDocument(factuur, company));
    } catch (err) {
      console.error('PDF genereren mislukt:', err);
    } finally {
      setPdfLoading(false);
    }
  };

  const handlePreviewPdf = async () => {
    setPreviewLoading(true);
    try {
      const customer = customers.find(c => String(c.id) === String(factuur.customerId));
      const factuurForPdf = factuur.isCredit ? { ...factuur, creditNote: factuur.notities } : factuur;
      await previewFactuurPdf(factuurForPdf, regels, customer, companyForDocument(factuur, company));
    } catch (err) {
      console.error('PDF preview mislukt:', err);
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-wide">
        <div className="modal-hd">
          <div>
            <div className="modal-title">{factuur.nummer}</div>
            <div className="modal-sub">{customerName}</div>
          </div>
          <ModalX onClose={onClose} />
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div><div style={DL_STYLE}>Klant</div><div style={{ fontWeight: 500 }}>{customerName}</div></div>
            <div><div style={DL_STYLE}>Status</div><div>{factuurBadge(factuur)}</div></div>
            <div><div style={DL_STYLE}>Factuurdatum</div><div>{fmtDate(factuur.factuurdatum)}</div></div>
            <div>
              <div style={DL_STYLE}>Betaaltermijn</div>
              <div style={{ color: isOverdue ? '#dc2626' : 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
                {fmtDate(factuur.vervaldatum)}
                {isOverdue && <span className="badge b-declined" style={{ fontSize: 10 }}>Te laat</span>}
              </div>
            </div>
            {factuur.betalingskenmerk && (
              <div><div style={DL_STYLE}>Betalingskenmerk</div><div>{factuur.betalingskenmerk}</div></div>
            )}
            {factuur.betaaldOp && (
              <div><div style={DL_STYLE}>Betaald op</div><div>{fmtDate(factuur.betaaldOp)}</div></div>
            )}
            {factuur.herinnering1VerstuurdAt && (
              <div><div style={DL_STYLE}>Herinnering 1 verstuurd</div><div style={{ fontSize: 13 }}>{new Date(factuur.herinnering1VerstuurdAt).toLocaleDateString('nl-NL')}</div></div>
            )}
            {factuur.herinnering2VerstuurdAt && (
              <div><div style={DL_STYLE}>Herinnering 2 verstuurd</div><div style={{ fontSize: 13 }}>{new Date(factuur.herinnering2VerstuurdAt).toLocaleDateString('nl-NL')}</div></div>
            )}
          </div>

          {regels.length > 0 && (
            <>
              <hr style={{ border: 'none', borderTop: '1px solid var(--br)', margin: 0 }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ ...DL_STYLE, marginBottom: 6 }}>Regelitems</div>
                {regels.map(r => (
                  <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', borderBottom: '1px solid #f3f4f6' }}>
                    <div>
                      <span style={{ color: 'var(--dl)', fontSize: 11, marginRight: 6 }}>{typeCfg(r.type).label}</span>
                      {r.omschrijving}
                      <span style={{ color: 'var(--dl)', fontSize: 11, marginLeft: 6 }}>{r.aantal} × {fmt(r.eenheidsprijs)}</span>
                    </div>
                    <div style={{ fontWeight: 500, whiteSpace: 'nowrap', marginLeft: 12 }}>{fmt(r.regelprijs)}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div style={{ background: 'var(--pll)', borderRadius: 10, padding: '14px 16px', display: 'flex', gap: 24 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--dl)', marginBottom: 2 }}>Totaal excl. BTW</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{fmt(factuur.totaalExcl)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--dl)', marginBottom: 2 }}>Totaal incl. BTW</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--p)' }}>{fmt(factuur.totaalIncl)}</div>
            </div>
          </div>

          {factuur.notities && (
            <div>
              <div style={DL_STYLE}>Notities</div>
              <div style={{ fontSize: 13, color: 'var(--tx)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{factuur.notities}</div>
            </div>
          )}
        </div>
        <div className="fa" style={{ flexWrap: 'wrap', gap: 8 }}>
          {onSendMail && canManage && (
            <button className="btn btn-s" onClick={() => { onClose(); onSendMail(factuur, 'factuur'); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Send size={14} /> Verstuur per mail</button>
          )}
          {onSendMail && canManage && isOverdue && !factuur.herinnering1VerstuurdAt && (
            <button className="btn btn-ghost btn-sm" onClick={guardFeature('betaalherinneringen', () => { onClose(); onSendMail(factuur, 'herinnering_1'); })} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, opacity: kanHerinneren ? 1 : .6 }}>
              <Send size={13} /> Herinnering 1 sturen
            </button>
          )}
          {onSendMail && canManage && isOverdue && kanHerinneren && factuur.herinnering1VerstuurdAt && !factuur.herinnering2VerstuurdAt && (
            <button className="btn btn-ghost btn-sm" onClick={() => { onClose(); onSendMail(factuur, 'herinnering_2'); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Send size={13} /> Herinnering 2 sturen
            </button>
          )}
          {canCrediteer && (
            <button className="btn btn-danger" onClick={() => setShowCrediteer(true)}>
              Crediteer factuur
            </button>
          )}
          <button className="btn btn-ghost" onClick={handlePreviewPdf} disabled={previewLoading} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {previewLoading ? 'Laden...' : 'Preview PDF'}
          </button>
          <button className="btn btn-p" onClick={handleDownloadPdf} disabled={pdfLoading} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Download size={15} />{pdfLoading ? 'Genereren...' : 'Download PDF'}
          </button>
          <button className="btn btn-ghost" onClick={onClose}>Sluiten</button>
        </div>
      </div>
      {showCrediteer && (
        <CrediteerModal
          factuur={factuur}
          regels={regels}
          onClose={() => setShowCrediteer(false)}
          onSuccess={() => { onRefresh?.(); onClose(); }}
        />
      )}
      {planModal}
    </div>
  );
}

// ── SEND EMAIL MODAL ─────────────────────────────────────────────────────────

export function SendFactuurMailModal({ factuur, customers, company, templateType = 'factuur', onClose, onSent }) {
  const toast = useToast();
  // Stripe-betaallink is een feature uit de centrale matrix (Team, of module bij
  // Groei). De edge functions checken hem óók server-side.
  const { plan } = usePlanGuard();
  const stripeAllowed = plan.has('stripe_betaallink');
  const [form, setForm] = useState({ to: '', subject: '', body: '' });
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const customer = customers.find(c => c.id == factuur.customerId);
  const fmt2 = n => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0);
  const fmtD = d => d ? new Date(d).toLocaleDateString('nl-NL') : '—';

  const TITLE_MAP = { factuur: 'Factuur versturen per e-mail', herinnering_1: 'Betaalherinnering 1 versturen', herinnering_2: 'Betaalherinnering 2 versturen' };

  useEffect(() => {
    let alive = true;
    (async () => {
      // Stripe actief? (koppeling live + feature) → bepaalt de {{betaalinstructie}}-
      // variant. De overmaak-optie blijft altijd genoemd; bij Stripe komt online
      // betalen als hoofdroute erbij.
      let stripeActive = false;
      if (stripeAllowed) {
        try { const conn = await getStripeConnection(); stripeActive = !!conn?.chargesEnabled; } catch { /* geen koppeling */ }
      }
      const vars = {
        klant_naam: customer?.name || factuur.customerName || 'klant',
        bedrijfsnaam: company?.name || 'ons bedrijf',
        factuur_nummer: factuur.nummer,
        totaal_bedrag: fmt2(factuur.totaalIncl),
        vervaldatum: fmtD(factuur.vervaldatum),
        betaalinstructie: stripeActive
          ? `U kunt de factuur eenvoudig online betalen via de knop hieronder, of het bedrag overmaken onder vermelding van ${factuur.nummer}.`
          : `Gelieve het totaalbedrag voor de betaaltermijn over te maken onder vermelding van ${factuur.nummer}.`,
      };
      try {
        const tpl = await getMailTemplate(templateType);
        const sub = tpl ? substituteVars(tpl.onderwerp || '', vars) : `Factuur ${factuur.nummer} van ${company?.name || ''}`;
        const rawBody = tpl
          ? substituteVars(tpl.body || '', vars)
          : `Beste ${vars.klant_naam},\n\nHierbij uw factuur ${factuur.nummer}.\n\n${vars.betaalinstructie}\n\nMet vriendelijke groet,\n${company?.name || ''}`;
        if (alive) setForm({ to: customer?.email || '', subject: sub, body: plainToEditorHtml(rawBody) });
      } catch {
        if (alive) setForm({ to: customer?.email || '', subject: `Factuur ${factuur.nummer}`, body: '' });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const handleSend = async () => {
    if (!form.to) { toast.error('E-mailadres is verplicht'); return; }
    setSending(true);
    try {
      let attachments = [];
      try {
        const regels = await getFactuurRegels(factuur.id);
        const factuurForPdf = factuur.isCredit ? { ...factuur, creditNote: factuur.notities } : factuur;
        const pdfBase64 = await getFactuurPdfBase64(factuurForPdf, regels, customer, companyForDocument(factuur, company));
        attachments = [{ filename: `Factuur-${factuur.nummer}.pdf`, content: pdfBase64 }];
        // Dezelfde PDF opslaan zodat de Stripe-webhook (geen browser) 'm later als
        // bijlage kan meesturen bij de betaalbevestiging. Best-effort, blokkeert niet.
        uploadFactuurPdf(factuur.id, factuur.companyId, pdfBase64).catch(() => {});
      } catch (pdfErr) {
        console.warn('PDF bijlage genereren mislukt:', pdfErr.message);
      }
      // Stripe iDEAL-betaallink ophalen — alleen met de feature. De edge function
      // checkt zelf of de koppeling actief is en of er een bedrag is; bij twijfel
      // (of een fout) krijgen we geen URL en versturen we gewoon zonder knop. De
      // verzending mag NOOIT klappen door een Stripe-fout.
      let payUrl = null;
      if (stripeAllowed) {
        try { payUrl = await createFactuurPaymentLink(factuur.id); }
        catch (e) { console.warn('Betaallink aanmaken mislukt:', e.message); }
      }
      // Knop in de BODY, direct vóór de afsluiting (na de betaalinstructie) i.p.v.
      // ná de groet. In de bedrijfskleur; alleen als er een betaallink is.
      const buttonHtml = payUrl ? mailButton('Factuur betalen', payUrl, company?.brandingColor) : '';
      const bodyWithButton = insertPayButtonBeforeClosing(form.body, buttonHtml);
      // Zakelijke mail: wikkel de body in de centrale template met bedrijfslogo
      // + bedrijfskleur (variant 1).
      const wrappedHtml = mailTemplate({
        title: form.subject,
        body: bodyWithButton,
        companyName: company?.name || 'Ons bedrijf',
        logoUrl: company?.logoUrl,
        brandColor: company?.brandingColor,
      });
      await sendEmail({ to: form.to, subject: form.subject, html: wrappedHtml, attachments });
      await logSentEmail({ toEmail: form.to, subject: form.subject, bodyHtml: wrappedHtml, relatedType: 'factuur', relatedId: factuur.id, customerId: factuur.customerId });
      if ((templateType === 'factuur') && (factuur.status === 'aangemaakt' || factuur.status === 'concept')) {
        // Bij versturen: bedrijfs-branding bevriezen op de factuur, zodat latere
        // logo-/kleurwijzigingen deze verstuurde factuur niet meer veranderen.
        await updateFactuur(factuur.id, { status: 'verzonden', ...buildCompanySnapshot(company) });
      }
      if (templateType === 'herinnering_1') {
        await updateFactuur(factuur.id, { herinnering_1_verstuurd_at: new Date().toISOString() });
      }
      if (templateType === 'herinnering_2') {
        await updateFactuur(factuur.id, { herinnering_2_verstuurd_at: new Date().toISOString() });
      }
      if (templateType === 'herinnering_1' || templateType === 'herinnering_2') {
        const nr = templateType === 'herinnering_1' ? '1' : '2';
        logTijdlijnSafe(factuur.customerId, 'herinnering_verstuurd', `Betaalherinnering ${nr} verstuurd voor factuur ${factuur.nummer}`, { nummer: factuur.nummer });
      } else {
        logTijdlijnSafe(factuur.customerId, 'email_verstuurd', `E-mail verstuurd: ${form.subject}`, { to: form.to, subject: form.subject });
      }
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
            <div className="modal-title">{TITLE_MAP[templateType] || 'E-mail versturen'}</div>
            <div className="modal-sub">{factuur.nummer}</div>
          </div>
          <ModalX onClose={onClose} />
        </div>
        {loading ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--dl)' }}>Template laden…</div>
        ) : (
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="f"><label>Aan</label><input value={form.to} onChange={e => setForm(f => ({ ...f, to: e.target.value }))} placeholder="emailadres@klant.nl" /></div>
            <div className="f"><label>Onderwerp</label><input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} /></div>
            <div className="f">
              <label>Bericht</label>
              <NoteEditor mentions={false} value={form.body} onChange={html => setForm(f => ({ ...f, body: html }))} placeholder="Schrijf uw bericht hier..." minHeight={200} />
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

// ── FACTUREN PAGE ─────────────────────────────────────────────────────────────

export function FacturenPage({ openCustomer, preOpenFactuurId, onNavConsumed, backKlant, onBackKlant }) {
  const toast = useToast();
  const { profile, company } = useProfile();
  const canManage = profile?.role === 'admin' || profile?.role === 'planner';
  const [facturen, setFacturen] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [editFactuur, setEditFactuur] = useState(null);
  const [viewFactuur, setViewFactuur] = useState(null);
  const [crediteerData, setCrediteerData] = useState(null);
  const [sendMailFactuur, setSendMailFactuur] = useState(null);
  // Factuurlimiet per facturatieperiode. Creditfacturen tellen niet mee en
  // lopen dus niet door deze gate (zie CrediteerModal).
  const { guardLimiet, planModal } = usePlanGuard();

  const load = () => {
    setLoading(true);
    Promise.all([getFacturen(), listCustomers(), getProjects().catch(() => [])])
      .then(([f, c, p]) => { setFacturen(f); setCustomers(c); setProjects(p); setError(''); })
      .catch(err => setError(err.message || 'Laden mislukt'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // Deep-open: open de factuur-weergave wanneer we vanuit een klantkaart komen.
  useEffect(() => {
    if (!preOpenFactuurId || loading) return;
    const f = facturen.find(x => x.id === preOpenFactuurId);
    if (f) {
      setViewFactuur(f);
      onNavConsumed?.();
    }
  }, [preOpenFactuurId, loading, facturen]); // eslint-disable-line react-hooks/exhaustive-deps

  const today = TODAY();
  const thisMonth = THIS_MONTH();

  const kpiOpenstaand = facturen.filter(f => f.status === 'verzonden' && !isVerlopen(f));
  const kpiBetaaldMaand = facturen.filter(f => f.status === 'betaald' && f.betaaldOp?.startsWith(thisMonth));
  const kpiVerlopen = facturen.filter(f => isVerlopen(f));

  const filters = [
    { label: 'Alle', value: '' },
    { label: 'Aangemaakt', value: 'aangemaakt' },
    { label: 'Verzonden', value: 'verzonden' },
    { label: 'Betaald', value: 'betaald' },
    { label: 'Verlopen', value: 'verlopen' },
    { label: 'Gecrediteerd', value: 'gecrediteerd' },
  ];

  const filtered = facturen.filter(f => {
    if (activeFilter === 'gecrediteerd') return f.gecrediteerd || f.isCredit;
    const ds = displayStatus(f);
    if (activeFilter && ds !== activeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const cn = f.customerName || customers.find(c => c.id == f.customerId)?.name || '';
      return f.nummer.toLowerCase().includes(q) || cn.toLowerCase().includes(q);
    }
    return true;
  });

  const handleDelete = async f => {
    if (!window.confirm(`Factuur ${f.nummer} verwijderen?`)) return;
    try {
      await deleteFactuur(f.id);
      setFacturen(prev => prev.filter(x => x.id !== f.id));
      toast.success('Factuur verwijderd');
    } catch (err) { toast.error(err.message || 'Verwijderen mislukt'); }
  };

  const handleSaved = saved => {
    setFacturen(prev => {
      const idx = prev.findIndex(x => x.id === saved.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
      return [saved, ...prev];
    });
  };

  const handleDownloadPdfFromMenu = async f => {
    try {
      const regels = await getFactuurRegels(f.id);
      const customer = customers.find(c => String(c.id) === String(f.customerId));
      const factuurForPdf = f.isCredit ? { ...f, creditNote: f.notities } : f;
      await generateFactuurPdf(factuurForPdf, regels, customer, companyForDocument(f, company));
    } catch { toast.error('PDF genereren mislukt'); }
  };

  const handleCrediteerFromMenu = async f => {
    try {
      const regels = await getFactuurRegels(f.id);
      setCrediteerData({ factuur: f, regels });
    } catch { toast.error('Regelitems laden mislukt'); }
  };

  if (loading) return <div className="card card-p" style={{ textAlign: 'center', color: 'var(--dl)' }}>Laden…</div>;

  return (
    <div>
      {backKlant && <BackToKlant name={backKlant.klantNaam} onClick={() => onBackKlant?.(backKlant)} />}
      <div className="page-hd afu">
        <div>
          <h1>Facturen</h1>
          <p style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <PlanStand limiet="facturen" />
          </p>
          {error && <div style={{ color: '#dc2626', fontSize: 13, marginTop: 4 }}>{error}</div>}
        </div>
        <div className="page-hd-actions">
          {canManage && (
            <button className="btn btn-p" onClick={guardLimiet('facturen', () => setShowNew(true))}>
              {I.plus} Nieuwe factuur
            </button>
          )}
        </div>
      </div>

      <div className="afu2">
        <div className="stats-row" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 20 }}>
          <div className="sc">
            <div className="sc-top"><div className="sc-icon">{I.brief}</div></div>
            <div className="sc-val">{facturen.length}</div>
            <div className="sc-label">Totaal facturen</div>
          </div>
          <div className="sc">
            <div className="sc-top"><div className="sc-icon">{I.clock}</div></div>
            <div className="sc-val">{fmt(kpiOpenstaand.reduce((s, f) => s + f.totaalIncl, 0))}</div>
            <div className="sc-label">Openstaand</div>
          </div>
          <div className="sc">
            <div className="sc-top"><div className="sc-icon">{I.check}</div></div>
            <div className="sc-val">{fmt(kpiBetaaldMaand.reduce((s, f) => s + f.totaalIncl, 0))}</div>
            <div className="sc-label">Betaald deze maand</div>
          </div>
          <div className="sc">
            <div className="sc-top"><div className="sc-icon">{I.flag}</div></div>
            <div className="sc-val">{kpiVerlopen.length}</div>
            <div className="sc-label">Verlopen</div>
          </div>
        </div>

        <div className="card">
          <div className="tw-filter">
            <div className="bb-filter-tabs">
              {filters.map(f => (
                <button key={f.value} className={`bb-filter-tab${activeFilter === f.value ? ' on' : ''}`} onClick={() => setActiveFilter(f.value)}>
                  {f.label}
                </button>
              ))}
            </div>
            <div className="search">
              <span style={{ color: 'var(--dl)', display: 'flex', flexShrink: 0 }}>{I.search}</span>
              <input placeholder="Zoek factuur..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>

          <div style={{ overflowX: 'auto', width: '100%' }}>
            <table className="dt" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th className="th">Nummer</th>
                  <th className="th">Klant</th>
                  <th className="th">Excl. BTW</th>
                  <th className="th">Incl. BTW</th>
                  <th className="th">Status</th>
                  <th className="th">Betaaltermijn</th>
                  <th className="th">Acties</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td className="td" colSpan={7} style={{ textAlign: 'center', color: 'var(--dl)', padding: '32px 0' }}>
                      Geen facturen gevonden
                    </td>
                  </tr>
                )}
                {filtered.map(f => {
                  const customerName = f.customerName || customers.find(c => c.id == f.customerId)?.name || '—';
                  return (
                    <tr key={f.id}>
                      <td className="td">
                        <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 13 }}>{f.nummer}</span>
                        {f.isCredit && <span className="badge" style={{ background: '#fee2e2', color: '#dc2626', marginLeft: 6, fontSize: 10 }}>CF</span>}
                      </td>
                      <td className="td">
                        <button
                          onClick={() => openCustomer?.(f.customerId)}
                          style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer' }}
                          onMouseEnter={e => { e.currentTarget.style.color = 'var(--p)'; e.currentTarget.style.textDecoration = 'underline'; }}
                          onMouseLeave={e => { e.currentTarget.style.color = 'inherit'; e.currentTarget.style.textDecoration = 'none'; }}
                        >{customerName}</button>
                      </td>
                      <td className="td" style={{ textAlign: 'right' }}>{fmt(f.totaalExcl)}</td>
                      <td className="td" style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(f.totaalIncl)}</td>
                      <td className="td">
                        {factuurBadge(f)}
                        {f.gecrediteerd && <span className="badge b-gray" style={{ marginLeft: 4, fontSize: 10 }}>Gecrediteerd</span>}
                      </td>
                      <td className="td" style={{ color: isVerlopen(f) ? '#dc2626' : 'inherit' }}>{fmtDate(f.vervaldatum)}</td>
                      <td className="td">
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-xs btn-ghost btn-icon" title="Bekijken" onClick={() => setViewFactuur(f)}><MoreVertical size={14} /></button>
                          {canManage && <button className="btn btn-xs btn-ghost btn-icon" title="Verstuur per mail" onClick={() => setSendMailFactuur({ factuur: f, templateType: 'factuur' })}><Send size={13} /></button>}
                          {canManage && <button className="btn btn-xs btn-ghost btn-icon" title="Bewerken" onClick={() => setEditFactuur(f)}>{I.edit}</button>}
                          {canManage && <button className="btn btn-xs btn-danger btn-icon" title="Verwijderen" onClick={() => handleDelete(f)}>{I.trash}</button>}
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
        <NewFactuurModal
          customers={customers}
          projects={projects}
          onClose={() => setShowNew(false)}
          onSaved={saved => { handleSaved(saved); setShowNew(false); }}
          onSaveAndSend={saved => { handleSaved(saved); setSendMailFactuur({ factuur: saved, templateType: 'factuur' }); }}
          openCustomer={openCustomer}
        />
      )}
      {editFactuur && (
        <EditFactuurModal
          factuur={editFactuur}
          customers={customers}
          onClose={() => setEditFactuur(null)}
          onSaved={saved => { handleSaved(saved); setEditFactuur(null); }}
          onSaveAndSend={saved => { handleSaved(saved); setEditFactuur(null); setSendMailFactuur({ factuur: saved, templateType: 'factuur' }); }}
        />
      )}
      {viewFactuur && (
        <ViewFactuurModal
          factuur={viewFactuur}
          customers={customers}
          onClose={() => setViewFactuur(null)}
          onRefresh={load}
          onSendMail={(f, type) => { setSendMailFactuur({ factuur: f, templateType: type || 'factuur' }); setViewFactuur(null); }}
        />
      )}
      {planModal}
      {crediteerData && (
        <CrediteerModal
          factuur={crediteerData.factuur}
          regels={crediteerData.regels}
          onClose={() => setCrediteerData(null)}
          onSuccess={() => { load(); setCrediteerData(null); }}
        />
      )}
      {sendMailFactuur && (
        <SendFactuurMailModal
          factuur={sendMailFactuur.factuur}
          customers={customers}
          company={company}
          templateType={sendMailFactuur.templateType || 'factuur'}
          onClose={() => setSendMailFactuur(null)}
          onSent={() => { load(); setSendMailFactuur(null); }}
        />
      )}
    </div>
  );
}
