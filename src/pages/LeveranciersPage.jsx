// Leverancierslijst — letterlijk dezelfde opbouw als CustomersPage in
// BbPages1.jsx: page-hd met teller, Kaarten/Tabel-schakelaar, zoekveld,
// kaartraster of tabel, en een modal voor "nieuw".
//
// De schakelaar staat standaard op Kaarten, net als bij klanten. Dat is niet
// alleen cosmetisch: in de split-weergave (kaart geopend) wordt de lijstkolom
// smal, en het kaartraster krimpt daar netjes mee terwijl een brede tabel eruit
// zou lopen — precies de overlap die het bij leveranciers eerder gaf.

import { useEffect, useState } from 'react';
import { I, ModalX, fmt, Av } from '../bb-shared.jsx';
import { useToast } from '../lib/toast.jsx';
import { useProfile } from '../lib/profileContext.jsx';
import { usePermissions } from '../hooks/usePermissions.js';
import AdresZoeker from '../components/AdresZoeker.jsx';
import {
  listLeveranciers, createLeverancier, deleteLeverancier, getLeverancierKostenTotalen,
} from '../services/leverancierService.js';

const LEEG = {
  naam: '', contactpersoon: '', email: '', telefoon: '', mobiel: '', website: '',
  address: '', postcode: '', city: '',
  kvkNumber: '', btwNumber: '', iban: '', betaaltermijnDagen: '',
  notities: '', actief: true,
};

function NewLeverancierModal({ onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(LEEG);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.naam.trim()) { setErrors({ naam: 'Naam is verplicht' }); return; }
    setSaving(true);
    try {
      const created = await createLeverancier(form);
      toast.success('Leverancier toegevoegd');
      onSaved(created);
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
            <div className="modal-title">Nieuwe leverancier</div>
            <div className="modal-sub">Alleen de naam is verplicht.</div>
          </div>
          <ModalX onClose={onClose} />
        </div>

        <div className="fg">
          <div className="f s2">
            <label>Naam *</label>
            <input type="text" value={form.naam} autoFocus
              onChange={e => { set('naam', e.target.value); setErrors({}); }}
              placeholder="Bijv. Gamma, Van der Berg Bouwmaterialen" />
            {errors.naam && <span className="bb-err">{errors.naam}</span>}
          </div>
          <div className="f">
            <label>Contactpersoon</label>
            <input type="text" value={form.contactpersoon} onChange={e => set('contactpersoon', e.target.value)} />
          </div>
          <div className="f">
            <label>E-mail</label>
            <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="naam@bedrijf.nl" />
          </div>
          <div className="f">
            <label>Telefoon</label>
            <input type="text" value={form.telefoon} onChange={e => set('telefoon', e.target.value)} placeholder="06-..." />
          </div>
          <div className="f">
            <label>Mobiel</label>
            <input type="text" value={form.mobiel} onChange={e => set('mobiel', e.target.value)} />
          </div>

          <AdresZoeker
            className="s2"
            disabled={saving}
            onSelect={({ address, postcode, city }) => setForm(f => ({ ...f, address, postcode, city }))}
          />
          <div className="f">
            <label>Adres</label>
            <input type="text" value={form.address} onChange={e => set('address', e.target.value)} />
          </div>
          <div className="f">
            <label>Postcode</label>
            <input type="text" value={form.postcode} onChange={e => set('postcode', e.target.value)} />
          </div>
          <div className="f">
            <label>Stad</label>
            <input type="text" value={form.city} onChange={e => set('city', e.target.value)} />
          </div>
          <div className="f">
            <label>Website</label>
            <input type="text" value={form.website} onChange={e => set('website', e.target.value)} />
          </div>
          <div className="f">
            <label>KvK-nummer</label>
            <input type="text" value={form.kvkNumber} onChange={e => set('kvkNumber', e.target.value)} />
          </div>
          <div className="f">
            <label>BTW-nummer</label>
            <input type="text" value={form.btwNumber} onChange={e => set('btwNumber', e.target.value)} />
          </div>
          <div className="f">
            <label>IBAN</label>
            <input type="text" value={form.iban} onChange={e => set('iban', e.target.value)} />
          </div>
          <div className="f">
            <label>Betaaltermijn <span style={{ color: 'var(--dl)', fontWeight: 400 }}>(dagen)</span></label>
            <input type="number" min="0" value={form.betaaltermijnDagen} onChange={e => set('betaaltermijnDagen', e.target.value)} placeholder="30" />
          </div>
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

export default function LeveranciersPage({ openLeverancier }) {
  const toast = useToast();
  const { refreshKey, bumpRefresh } = useProfile();
  const { can } = usePermissions();
  const [search, setSearch] = useState('');
  const [view, setView] = useState(() => localStorage.getItem('leveranciers_view') || 'grid');
  const [leveranciers, setLeveranciers] = useState([]);
  const [totalen, setTotalen] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showNew, setShowNew] = useState(false);

  const reload = () => {
    setLoading(true);
    Promise.all([listLeveranciers(), getLeverancierKostenTotalen()])
      .then(([l, t]) => { setLeveranciers(l); setTotalen(t); setError(''); })
      .catch(err => setError(err.message || 'Leveranciers laden is mislukt.'))
      .finally(() => setLoading(false));
  };
  useEffect(reload, [refreshKey]);

  const term = search.toLowerCase();
  const filtered = leveranciers.filter(l =>
    l.naam.toLowerCase().includes(term)
    || l.city.toLowerCase().includes(term)
    || l.email.toLowerCase().includes(term)
  );

  const remove = async l => {
    // Een leverancier met kosten kan niet meer weg: die kosten zouden hun
    // relatie verliezen en daarmee niet meer naar de boekhouding kunnen. Zet hem
    // op inactief — dan verdwijnt hij uit de keuzelijsten maar blijft de
    // koppeling met bestaande kosten intact.
    const gekoppeld = totalen[l.id]?.aantal || 0;
    if (gekoppeld) {
      toast.error(
        `"${l.naam}" kan niet verwijderd worden: er ${gekoppeld === 1 ? 'hangt 1 kostenpost' : `hangen ${gekoppeld} kostenposten`} aan. `
        + 'Zet hem op inactief, dan verdwijnt hij uit de keuzelijsten.',
      );
      return;
    }
    if (!confirm('Weet je zeker dat je deze leverancier wilt verwijderen?')) return;
    try {
      const waarschuwing = await deleteLeverancier(l.id);
      setLeveranciers(ls => ls.filter(x => x.id !== l.id));
      if (waarschuwing) toast.error(waarschuwing, { duration: 10000 });
      else toast.success('Leverancier verwijderd');
      bumpRefresh?.();
    } catch (err) {
      toast.error(err.message || 'Verwijderen mislukt');
    }
  };

  return (
    <div>
      <div className="page-hd afu">
        <div>
          <h1>Leveranciers</h1>
          <p>{leveranciers.length} {leveranciers.length === 1 ? 'leverancier' : 'leveranciers'}</p>
        </div>
        <div className="page-hd-actions">
          <div className="tabs">
            <button className={`tab${view === 'grid' ? ' active' : ''}`} onClick={() => { setView('grid'); localStorage.setItem('leveranciers_view', 'grid'); }}>Kaarten</button>
            <button className={`tab${view === 'table' ? ' active' : ''}`} onClick={() => { setView('table'); localStorage.setItem('leveranciers_view', 'table'); }}>Tabel</button>
          </div>
          <button className="btn btn-p btn-sm" onClick={() => setShowNew(true)}>{I.plus} Nieuwe leverancier</button>
        </div>
      </div>

      {error && <div className="card card-p" style={{ color: '#dc2626', marginBottom: 14 }}>{error}</div>}

      <div className="search afu2" style={{ maxWidth: 360, marginBottom: 14 }}>
        {I.search}
        <input placeholder="Zoek op naam, plaats of e-mail…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading && <div className="card card-p">Leveranciers laden...</div>}

      {!loading && filtered.length === 0 && (
        <div className="empty">
          <div className="empty-title">Geen leveranciers gevonden</div>
          <div className="empty-sub">
            {leveranciers.length === 0
              ? 'Maak je eerste leverancier aan — dan landen je kosten in de boekhouding onder de juiste relatie.'
              : 'Pas je zoekopdracht aan.'}
          </div>
        </div>
      )}

      {!loading && filtered.length > 0 && (view === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, alignItems: 'stretch' }} className="afu2 cust-card-grid">
          {filtered.map(l => (
            <div key={l.id} className="card card-p" style={{ cursor: 'pointer', transition: 'all .18s ease', display: 'flex', flexDirection: 'column', opacity: l.actief ? 1 : 0.6 }}
              onClick={() => openLeverancier?.(l.id)}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = 'rgba(29,219,98,.3)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.borderColor = ''; }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <Av name={l.naam} size="lg" />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '.95rem' }}>{l.naam}</div>
                  <div style={{ fontSize: '.78rem', color: 'var(--dmu)' }}>{l.contactpersoon || (l.actief ? 'Leverancier' : 'Inactief')}</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: '.78rem', color: 'var(--dmu)', marginBottom: 12 }}>
                {l.email && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{I.mail} {l.email}</div>}
                {l.telefoon && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{I.call} {l.telefoon}</div>}
                {l.city && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{I.map} {l.city}</div>}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 'auto' }}>
                <div>
                  <div style={{ fontSize: '.68rem', color: 'var(--dl)' }}>Kosten</div>
                  <div style={{ fontWeight: 700, fontSize: '.88rem' }}>{totalen[l.id] ? fmt(totalen[l.id].bedrag) : ''}</div>
                </div>
                {can('klanten_verwijderen') && (
                  <button className="btn-icon" title="Verwijderen" onClick={e => { e.stopPropagation(); remove(l); }}>{I.trash}</button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="tw afu2">
          <table className="dt">
            <thead><tr><th>Leverancier</th><th>Telefoonnummer</th><th>Stad</th><th>Kosten</th><th></th></tr></thead>
            <tbody>
              {filtered.map(l => (
                <tr key={l.id} style={{ cursor: 'pointer', opacity: l.actief ? 1 : 0.6 }} onClick={() => openLeverancier?.(l.id)}>
                  <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Av name={l.naam} size="sm" /><span style={{ fontWeight: 600 }}>{l.naam}</span></div></td>
                  <td style={{ color: 'var(--dmu)' }}>{l.telefoon || ''}</td>
                  <td>{l.city || ''}</td>
                  <td style={{ fontWeight: 700 }}>{totalen[l.id] ? fmt(totalen[l.id].bedrag) : ''}</td>
                  <td>{can('klanten_verwijderen') && <button className="btn-icon" onClick={e => { e.stopPropagation(); remove(l); }}>{I.trash}</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {showNew && (
        <NewLeverancierModal
          onClose={() => setShowNew(false)}
          onSaved={created => {
            setLeveranciers(ls => [created, ...ls]);
            bumpRefresh?.();
            openLeverancier?.(created.id);
          }}
        />
      )}
    </div>
  );
}
