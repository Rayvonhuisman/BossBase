// Materialenbibliotheek — standaardmaterialen met prijs, leverancier en marge.
//
// Inkoopprijs en marge zijn alleen zichtbaar met het recht 'inkoopprijzen'. Dat
// is hier puur cosmetisch bovenop de echte afscherming: de prijs staat in
// materiaal_inkoop met eigen RLS, dus zonder het recht komt er sowieso niets
// binnen. Dit voorkomt alleen lege kolommen.
//
// Geen voorraadbeheer — bewust. De doelgroep koopt per klus bij de groothandel.

import { useEffect, useState } from 'react';
import { I, ModalX, fmt, Av } from '../bb-shared.jsx';
import { useToast } from '../lib/toast.jsx';
import { useProfile } from '../lib/profileContext.jsx';
import { usePermissions } from '../hooks/usePermissions.js';
import {
  listMaterialen, createMateriaal, updateMateriaal, deleteMateriaal, marge, EENHEDEN,
} from '../services/materiaalService.js';
import { listLeveranciers } from '../services/leverancierService.js';
import LeverancierSelect from '../components/LeverancierSelect.jsx';

const LEEG = {
  naam: '', eenheid: 'stuk', inkoopprijs: '', verkoopprijs: '',
  leverancierId: '', btwPct: 21, artikelnummer: '', actief: true,
};

function MateriaalModal({ materiaal, leveranciers, magInkoop, onClose, onSaved, onLeverancierToegevoegd }) {
  const toast = useToast();
  const bewerken = Boolean(materiaal);
  const [form, setForm] = useState(() => (materiaal ? { ...LEEG, ...materiaal } : LEEG));
  const [saving, setSaving] = useState(false);
  const [fout, setFout] = useState('');
  const [foutLev, setFoutLev] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const mg = marge({ inkoopprijs: Number(form.inkoopprijs) || null, verkoopprijs: Number(form.verkoopprijs) || null });

  const submit = async () => {
    if (!form.naam.trim()) { setFout('Naam is verplicht'); return; }
    // Leverancier is verplicht omdat hij via de kostenregel naar de boekhouding
    // gaat. Ook bij bewerken: zo worden materialen van vóór deze regel alsnog
    // aangevuld op het moment dat iemand ze toch al openheeft.
    if (!form.leverancierId) { setFoutLev('Kies een leverancier'); return; }
    setSaving(true);
    try {
      const bewaard = bewerken ? await updateMateriaal(materiaal.id, form) : await createMateriaal(form);
      toast.success(bewerken ? 'Materiaal bijgewerkt' : 'Materiaal toegevoegd');
      onSaved(bewaard);
      onClose();
    } catch (err) {
      toast.error(err.message || 'Opslaan mislukt');
    } finally { setSaving(false); }
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="modal modal-wide">
        <div className="modal-hd">
          <div>
            <div className="modal-title">{bewerken ? 'Materiaal bewerken' : 'Nieuw materiaal'}</div>
            <div className="modal-sub">Alleen de naam is verplicht.</div>
          </div>
          <ModalX onClose={onClose} />
        </div>

        <div className="fg">
          <div className="f s2">
            <label>Naam *</label>
            <input type="text" value={form.naam} autoFocus
              onChange={e => { set('naam', e.target.value); setFout(''); }}
              placeholder="Bijv. Installatiedraad 2,5mm²"
              style={fout ? { borderColor: '#dc2626' } : undefined} />
            {fout && <div style={{ color: '#dc2626', fontSize: '.78rem', marginTop: 4 }}>{fout}</div>}
          </div>

          <div className="f">
            <label>Eenheid</label>
            <select value={form.eenheid} onChange={e => set('eenheid', e.target.value)}>
              {EENHEDEN.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div className="f">
            <label>Artikelnummer <span style={{ color: 'var(--dl)', fontWeight: 400 }}>(optioneel)</span></label>
            <input type="text" value={form.artikelnummer} onChange={e => set('artikelnummer', e.target.value)} />
          </div>

          {magInkoop && (
            <div className="f">
              <label>Inkoopprijs <span style={{ color: 'var(--dl)', fontWeight: 400 }}>(excl. btw · intern)</span></label>
              <input type="number" min="0" step="0.01" value={form.inkoopprijs ?? ''} onChange={e => set('inkoopprijs', e.target.value)} />
            </div>
          )}
          <div className="f">
            <label>Verkoopprijs <span style={{ color: 'var(--dl)', fontWeight: 400 }}>(excl. btw · naar de klant)</span></label>
            <input type="number" min="0" step="0.01" value={form.verkoopprijs ?? ''} onChange={e => set('verkoopprijs', e.target.value)} />
          </div>

          {magInkoop && mg && (
            <div className="f s2">
              <div style={{ fontSize: '.82rem', color: mg.bedrag < 0 ? '#dc2626' : '#15A34A', fontWeight: 600 }}>
                Marge: {fmt(mg.bedrag)}{mg.pct != null ? ` · ${mg.pct}%` : ''} <span style={{ fontWeight: 400, color: 'var(--dl)' }}>(excl. btw)</span>
              </div>
            </div>
          )}

          <div className="f">
            <label>Leverancier *</label>
            <LeverancierSelect
              value={form.leverancierId}
              onChange={v => { set('leverancierId', v); setFoutLev(''); }}
              leveranciers={leveranciers}
              onLijstGewijzigd={g => { onLeverancierToegevoegd?.(g); setFoutLev(''); }}
              verplicht
              fout={Boolean(foutLev)}
            />
            {foutLev && <div style={{ color: '#dc2626', fontSize: '.78rem', marginTop: 4 }}>{foutLev}</div>}
            {bewerken && !materiaal?.leverancierId && (
              <div style={{ fontSize: '.72rem', color: 'var(--dl)', marginTop: 4 }}>
                Dit materiaal heeft nog geen leverancier. Vul hem aan om op te kunnen slaan.
              </div>
            )}
          </div>
          <div className="f">
            <label>BTW-tarief</label>
            <select value={form.btwPct} onChange={e => set('btwPct', Number(e.target.value))}>
              <option value={21}>21%</option>
              <option value={9}>9%</option>
              <option value={0}>0%</option>
            </select>
          </div>

          {bewerken && (
            <div className="f s2">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.actief !== false} onChange={e => set('actief', e.target.checked)} style={{ width: 'auto' }} />
                Actief — inactieve materialen zijn niet meer te kiezen op een werkbon
              </label>
            </div>
          )}
        </div>

        <div className="fa">
          <button className="btn btn-s" onClick={onClose} disabled={saving}>Annuleren</button>
          <button className="btn btn-p" onClick={submit} disabled={saving}>
            {saving ? 'Opslaan…' : <>{I.check} Opslaan</>}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MaterialenPage() {
  const toast = useToast();
  const { refreshKey, bumpRefresh } = useProfile();
  const { can } = usePermissions();
  const magInkoop = can('inkoopprijzen');
  const [zoek, setZoek] = useState('');
  const [lijst, setLijst] = useState([]);
  const [leveranciers, setLeveranciers] = useState([]);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState('');
  const [modal, setModal] = useState(null);

  const herlaad = () => {
    setLaden(true);
    Promise.all([listMaterialen(), listLeveranciers({ inclusiefInactief: false })])
      .then(([m, l]) => { setLijst(m); setLeveranciers(l); setFout(''); })
      .catch(err => setFout(err.message || 'Materialen laden is mislukt.'))
      .finally(() => setLaden(false));
  };
  useEffect(herlaad, [refreshKey]);

  const levNaam = id => leveranciers.find(l => l.id === id)?.naam || '—';
  const term = zoek.toLowerCase();
  const gefilterd = lijst.filter(m =>
    m.naam.toLowerCase().includes(term) || (m.artikelnummer || '').toLowerCase().includes(term));

  const verwijder = async m => {
    if (!confirm(`"${m.naam}" verwijderen? Werkbonregels die dit materiaal gebruiken blijven bestaan met hun eigen prijzen.`)) return;
    try {
      await deleteMateriaal(m.id);
      setLijst(l => l.filter(x => x.id !== m.id));
      toast.success('Materiaal verwijderd');
      bumpRefresh?.();
    } catch (err) { toast.error(err.message || 'Verwijderen mislukt'); }
  };

  return (
    <div>
      <div className="page-hd afu">
        <div>
          <h1>Materialen</h1>
          <p>{lijst.length} {lijst.length === 1 ? 'materiaal' : 'materialen'} in je bibliotheek</p>
        </div>
        <div className="page-hd-actions">
          <button className="btn btn-p btn-sm" onClick={() => setModal('nieuw')}>{I.plus} Nieuw materiaal</button>
        </div>
      </div>

      {fout && <div className="card card-p" style={{ color: '#dc2626', marginBottom: 14 }}>{fout}</div>}

      <div className="search afu2" style={{ maxWidth: 360, marginBottom: 14 }}>
        {I.search}
        <input placeholder="Zoek op naam of artikelnummer…" value={zoek} onChange={e => setZoek(e.target.value)} />
      </div>

      {laden && <div className="card card-p">Materialen laden…</div>}

      {!laden && gefilterd.length === 0 && (
        <div className="empty">
          <div className="empty-title">Geen materialen gevonden</div>
          <div className="empty-sub">
            {lijst.length === 0
              ? 'Voeg je veelgebruikte materialen toe — dan staan prijs en leverancier meteen goed op een werkbon.'
              : 'Pas je zoekopdracht aan.'}
          </div>
        </div>
      )}

      {!laden && gefilterd.length > 0 && (
        <div className="tw afu2">
          <table className="dt">
            <thead>
              <tr>
                <th>Materiaal</th><th>Eenheid</th><th>Leverancier</th>
                {magInkoop && <th>Inkoop (excl. btw)</th>}
                <th>Verkoop (excl. btw)</th>
                {magInkoop && <th>Marge (excl. btw)</th>}
                <th>BTW</th><th></th>
              </tr>
            </thead>
            <tbody>
              {gefilterd.map(m => {
                const mg = marge(m);
                return (
                  <tr key={m.id} style={{ cursor: 'pointer', opacity: m.actief ? 1 : 0.55 }} onClick={() => setModal(m)}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Av name={m.naam} size="sm" />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600 }}>{m.naam}</div>
                          {m.artikelnummer && <div style={{ fontSize: '.72rem', color: 'var(--dl)' }}>{m.artikelnummer}</div>}
                        </div>
                        {!m.actief && <span style={{ fontSize: '.7rem', color: 'var(--dl)' }}>inactief</span>}
                      </div>
                    </td>
                    <td>{m.eenheid}</td>
                    <td style={{ color: 'var(--dmu)' }}>{levNaam(m.leverancierId)}</td>
                    {magInkoop && <td>{m.inkoopprijs != null ? fmt(m.inkoopprijs) : '—'}</td>}
                    <td style={{ fontWeight: 700 }}>{m.verkoopprijs != null ? fmt(m.verkoopprijs) : '—'}</td>
                    {magInkoop && (
                      <td style={{ fontWeight: 600, color: mg && mg.bedrag < 0 ? '#dc2626' : '#15A34A' }}>
                        {mg ? `${fmt(mg.bedrag)}${mg.pct != null ? ` · ${mg.pct}%` : ''}` : '—'}
                      </td>
                    )}
                    <td>{m.btwPct}%</td>
                    <td>
                      <button className="btn-icon" onClick={e => { e.stopPropagation(); setModal(m); }}>{I.arrow_r}</button>
                      <button className="btn-icon" onClick={e => { e.stopPropagation(); verwijder(m); }}>{I.trash}</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <MateriaalModal
          materiaal={modal === 'nieuw' ? null : modal}
          leveranciers={leveranciers}
          magInkoop={magInkoop}
          onLeverancierToegevoegd={g => setLeveranciers(l => [...l, g].sort((a, b) => a.naam.localeCompare(b.naam, 'nl')))}
          onClose={() => setModal(null)}
          onSaved={() => { herlaad(); bumpRefresh?.(); }}
        />
      )}
    </div>
  );
}
