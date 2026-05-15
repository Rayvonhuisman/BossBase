import { useState, useEffect } from 'react';
import { I, ModalX, fmt } from '../bb-shared.jsx';
import { useToast } from '../lib/toast.jsx';
import { useProfile } from '../lib/profileContext.jsx';
import {
  getFacturen, createFactuur, updateFactuur, deleteFactuur,
  generateFactuurNummer, getFactuurRegels, createFactuurRegel,
} from '../services/factuurService.js';
import { listCustomers } from '../services/customerService.js';

// ── HELPERS ──────────────────────────────────────────────────────────────────

const TODAY = () => new Date().toISOString().slice(0, 10);
const THIS_MONTH = () => new Date().toISOString().slice(0, 7);

const isVerlopen = f =>
  f.status !== 'betaald' && f.vervaldatum && f.vervaldatum < TODAY();

const displayStatus = f => (isVerlopen(f) ? 'verlopen' : f.status);

const factuurBadge = f => {
  const s = displayStatus(f);
  const map = { concept: 'b-concept', verzonden: 'b-sent', betaald: 'b-accepted', verlopen: 'b-declined' };
  const labels = { concept: 'Concept', verzonden: 'Verzonden', betaald: 'Betaald', verlopen: 'Verlopen' };
  return <span className={`badge ${map[s] || 'b-gray'}`}>{labels[s] || s}</span>;
};

const fmtDate = d => {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}-${m}-${y}`;
};

const DL_STYLE = { fontSize: 11, fontWeight: 600, color: 'var(--dl)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 };

// ── REGEL HELPERS (gedeeld tussen nieuw en bewerk) ───────────────────────────

const TYPE_CFG = {
  uren:  { label: 'Uren',  v1Ph: '0 uur',  v2Ph: '0,00', hasV1: true,  v1Step: '0.5',  regelLabel: r => `${r.aantal}u × €${r.eenheidsprijs}` },
  m2:    { label: 'm²',    v1Ph: '0 m²',   v2Ph: '0,00', hasV1: true,  v1Step: '0.01', regelLabel: r => `${r.aantal}m² × €${r.eenheidsprijs}` },
  stuks: { label: 'Stuks', v1Ph: '0 st.',  v2Ph: '0,00', hasV1: true,  v1Step: '1',    regelLabel: r => `${r.aantal}st. × €${r.eenheidsprijs}` },
  vast:  { label: 'Vast',  v1Ph: null,     v2Ph: '0,00', hasV1: false, v1Step: '1',    regelLabel: null },
};

const emptyRegel = () => ({
  id: crypto.randomUUID(), omschrijving: '', type: 'uren', aantal: 1, eenheidsprijs: 0, btw: '21', btwAnders: '',
});

function BtwSelect({ r, setRegel }) {
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center', minWidth: 0, overflow: 'hidden' }}>
      <select value={r.btw} onChange={e => setRegel(r.id, 'btw', e.target.value)} style={{ flex: 1, minWidth: 0 }}>
        <option value="21">21%</option>
        <option value="9">9%</option>
        <option value="anders">Anders</option>
      </select>
      {r.btw === 'anders' && (
        <input type="number" min="0" max="100" step="1" placeholder="%" value={r.btwAnders}
          onChange={e => setRegel(r.id, 'btwAnders', e.target.value)}
          style={{ width: 38, minWidth: 0, flexShrink: 0 }} />
      )}
    </div>
  );
}

function useRegelTotals(regels) {
  const getRegelprijs = r => r.type === 'vast'
    ? Math.round(Number(r.eenheidsprijs || 0) * 100) / 100
    : Math.round(Number(r.aantal || 0) * Number(r.eenheidsprijs || 0) * 100) / 100;
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

function RegelItemsForm({ regels, setRegels }) {
  const setRegel = (id, k, v) => setRegels(rs => rs.map(r => r.id === id ? { ...r, [k]: v } : r));
  const addRegel = () => setRegels(rs => [...rs, emptyRegel()]);
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
            const cfg = TYPE_CFG[r.type] || TYPE_CFG.uren;
            return (
              <div key={r.id} style={{ border: '1px solid var(--bstrong)', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <select value={r.type} onChange={e => setRegel(r.id, 'type', e.target.value)} style={{ flex: 1 }}>
                    {Object.entries(TYPE_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                  <button className="btn btn-xs btn-danger btn-icon" onClick={() => removeRegel(r.id)} disabled={regels.length === 1}>{I.trash}</button>
                </div>
                <input type="text" placeholder="Omschrijving" value={r.omschrijving} onChange={e => setRegel(r.id, 'omschrijving', e.target.value)} />
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
                <input type="text" placeholder="Omschrijving" value={r.omschrijving} onChange={e => setRegel(r.id, 'omschrijving', e.target.value)} style={{ minWidth: 0 }} />
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

export function NewFactuurModal({ customers, prefill, onClose, onSaved }) {
  const toast = useToast();
  const [nummer, setNummer] = useState('');
  const [form, setForm] = useState({
    customer_id: prefill?.customer_id || '',
    factuurdatum: TODAY(),
    vervaldatum: '',
    notities: '',
  });
  const [regels, setRegels] = useState(prefill?.regels?.length ? prefill.regels : [emptyRegel()]);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    generateFactuurNummer().then(setNummer);
  }, []);

  const { totaalExcl, totaalIncl } = useRegelTotals(regels);

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
  const modalStyle = isMobile
    ? { width: '100vw', height: '100vh', maxWidth: '100vw', maxHeight: '100vh', borderRadius: 0, overflow: 'auto' }
    : { overflowX: 'hidden' };
  const overlayStyle = isMobile ? { padding: 0, alignItems: 'flex-start' } : {};

  const submit = async () => {
    if (!form.customer_id) { toast.error('Selecteer een klant'); return; }
    setSaving(true);
    try {
      const created = await createFactuur({ ...form, nummer, betalingskenmerk: nummer, totaal_excl: totaalExcl, totaal_incl: totaalIncl });
      for (let i = 0; i < regels.length; i++) {
        const r = regels[i];
        if (!r.omschrijving.trim()) continue;
        const btwPct = r.btw === 'anders' ? Number(r.btwAnders || 0) : Number(r.btw);
        await createFactuurRegel({
          factuur_id: created.id,
          type: r.type,
          omschrijving: r.omschrijving,
          aantal: r.type === 'vast' ? 1 : Number(r.aantal || 1),
          eenheidsprijs: Number(r.eenheidsprijs || 0),
          btw_pct: btwPct,
          volgorde: i,
        });
      }
      toast.success('Factuur aangemaakt');
      onSaved?.(created);
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
            <select value={form.customer_id} onChange={e => set('customer_id', e.target.value)}>
              <option value="">— Selecteer klant —</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="f">
            <label>Factuurdatum</label>
            <input type="date" value={form.factuurdatum} onChange={e => set('factuurdatum', e.target.value)} />
          </div>
          <div className="f">
            <label>Vervaldatum</label>
            <input type="date" value={form.vervaldatum} onChange={e => set('vervaldatum', e.target.value)} />
          </div>

          <RegelItemsForm regels={regels} setRegels={setRegels} />
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
          <button className="btn btn-p" onClick={submit} disabled={saving}>{saving ? 'Opslaan...' : 'Opslaan'}</button>
        </div>
      </div>
    </div>
  );
}

// ── EDIT FACTUUR MODAL ────────────────────────────────────────────────────────

function EditFactuurModal({ factuur, customers, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    status: factuur.status || 'concept',
    vervaldatum: factuur.vervaldatum || '',
    betalingskenmerk: factuur.betalingskenmerk || '',
    notities: factuur.notities || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    setSaving(true);
    try {
      const updated = await updateFactuur(factuur.id, form);
      toast.success('Factuur opgeslagen');
      onSaved?.(updated);
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
              <option value="concept">Concept</option>
              <option value="verzonden">Verzonden</option>
              <option value="betaald">Betaald</option>
            </select>
          </div>
          <div className="f">
            <label>Vervaldatum</label>
            <input type="date" value={form.vervaldatum} onChange={e => set('vervaldatum', e.target.value)} />
          </div>
          <div className="f s2">
            <label>Betalingskenmerk</label>
            <input type="text" value={form.betalingskenmerk} onChange={e => set('betalingskenmerk', e.target.value)} />
          </div>
          <div className="f s2">
            <label>Notities</label>
            <textarea rows={3} value={form.notities} onChange={e => set('notities', e.target.value)} />
          </div>
        </div>
        <div className="fa">
          <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
          <button className="btn btn-p" onClick={submit} disabled={saving}>{saving ? 'Opslaan...' : 'Opslaan'}</button>
        </div>
      </div>
    </div>
  );
}

// ── VIEW FACTUUR MODAL ────────────────────────────────────────────────────────

function ViewFactuurModal({ factuur, customers, onClose }) {
  const customerName = factuur.customerName || customers.find(c => c.id == factuur.customerId)?.name || '—';
  const [regels, setRegels] = useState([]);

  useEffect(() => {
    getFactuurRegels(factuur.id).then(setRegels).catch(() => {});
  }, [factuur.id]);

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
            <div><div style={DL_STYLE}>Vervaldatum</div><div>{fmtDate(factuur.vervaldatum)}</div></div>
            {factuur.betalingskenmerk && (
              <div><div style={DL_STYLE}>Betalingskenmerk</div><div>{factuur.betalingskenmerk}</div></div>
            )}
            {factuur.betaaldOp && (
              <div><div style={DL_STYLE}>Betaald op</div><div>{fmtDate(factuur.betaaldOp)}</div></div>
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
                      <span style={{ color: 'var(--dl)', fontSize: 11, marginRight: 6 }}>{TYPE_CFG[r.type]?.label || r.type}</span>
                      {r.omschrijving}
                      {r.type !== 'vast' && <span style={{ color: 'var(--dl)', fontSize: 11, marginLeft: 6 }}>{r.aantal} × {fmt(r.eenheidsprijs)}</span>}
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
        <div className="fa">
          <button className="btn btn-ghost" onClick={onClose}>Sluiten</button>
        </div>
      </div>
    </div>
  );
}

// ── FACTUREN PAGE ─────────────────────────────────────────────────────────────

export function FacturenPage({ openCustomer }) {
  const toast = useToast();
  const { profile } = useProfile();
  const canManage = profile?.role === 'admin' || profile?.role === 'planner';
  const [facturen, setFacturen] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [editFactuur, setEditFactuur] = useState(null);
  const [viewFactuur, setViewFactuur] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([getFacturen(), listCustomers()])
      .then(([f, c]) => { setFacturen(f); setCustomers(c); setError(''); })
      .catch(err => setError(err.message || 'Laden mislukt'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const today = TODAY();
  const thisMonth = THIS_MONTH();

  const kpiOpenstaand = facturen.filter(f => f.status === 'verzonden' && !isVerlopen(f));
  const kpiBetaaldMaand = facturen.filter(f => f.status === 'betaald' && f.betaaldOp?.startsWith(thisMonth));
  const kpiVerlopen = facturen.filter(f => isVerlopen(f));

  const filters = [
    { label: 'Alle', value: '' },
    { label: 'Concept', value: 'concept' },
    { label: 'Verzonden', value: 'verzonden' },
    { label: 'Betaald', value: 'betaald' },
    { label: 'Verlopen', value: 'verlopen' },
  ];

  const filtered = facturen.filter(f => {
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

  if (loading) return <div className="card card-p" style={{ textAlign: 'center', color: 'var(--dl)' }}>Laden…</div>;

  return (
    <div>
      <div className="page-hd afu">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Facturen</h1>
          {error && <div style={{ color: '#dc2626', fontSize: 13, marginTop: 4 }}>{error}</div>}
        </div>
        <div className="page-hd-actions">
          {canManage && (
            <button className="btn btn-p" onClick={() => setShowNew(true)}>
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
          <div style={{ padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid var(--br)' }}>
            <div className="tabs" style={{ flex: 1 }}>
              {filters.map(f => (
                <button key={f.value} className={`tab${activeFilter === f.value ? ' active' : ''}`} onClick={() => setActiveFilter(f.value)}>
                  {f.label}
                </button>
              ))}
            </div>
            <div className="search" style={{ minWidth: 0, width: 220 }}>
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
                  <th className="th">Vervaldatum</th>
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
                      <td className="td">{factuurBadge(f)}</td>
                      <td className="td" style={{ color: isVerlopen(f) ? '#dc2626' : 'inherit' }}>{fmtDate(f.vervaldatum)}</td>
                      <td className="td">
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-xs btn-ghost btn-icon" title="Bekijken" onClick={() => setViewFactuur(f)}>{I.eye}</button>
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
          onClose={() => setShowNew(false)}
          onSaved={saved => { handleSaved(saved); setShowNew(false); }}
        />
      )}
      {editFactuur && (
        <EditFactuurModal
          factuur={editFactuur}
          customers={customers}
          onClose={() => setEditFactuur(null)}
          onSaved={saved => { handleSaved(saved); setEditFactuur(null); }}
        />
      )}
      {viewFactuur && (
        <ViewFactuurModal
          factuur={viewFactuur}
          customers={customers}
          onClose={() => setViewFactuur(null)}
        />
      )}
    </div>
  );
}
