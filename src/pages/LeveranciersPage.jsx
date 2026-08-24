// Leveranciers — overzicht + aanmaken/bewerken.
//
// Opzet volgt CustomersPage (page-hd, zoekveld, tabel, modal), zodat het scherm
// niet als vreemde eend aanvoelt. Eén harde regel uit de SnelStart-spec: alleen
// `naam` is verplicht, al het andere optioneel.

import { useEffect, useState } from 'react';
import { I, ModalX, fmt, Av } from '../bb-shared.jsx';
import { useToast } from '../lib/toast.jsx';
import { useProfile } from '../lib/profileContext.jsx';
import { usePermissions } from '../hooks/usePermissions.js';
import AdresZoeker from '../components/AdresZoeker.jsx';
import {
  listLeveranciers, createLeverancier, updateLeverancier, deleteLeverancier,
  getLeverancierKostenTotalen,
} from '../services/leverancierService.js';

const LEEG = {
  naam: '', contactpersoon: '', email: '', telefoon: '', mobiel: '', website: '',
  address: '', postcode: '', city: '',
  kvkNumber: '', btwNumber: '', iban: '', betaaltermijnDagen: '',
  notities: '', actief: true,
};

function LeverancierModal({ leverancier, onClose, onSaved }) {
  const toast = useToast();
  const bewerken = Boolean(leverancier);
  const [form, setForm] = useState(() => (leverancier ? { ...LEEG, ...leverancier } : LEEG));
  const [saving, setSaving] = useState(false);
  const [fout, setFout] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.naam.trim()) { setFout('Naam is verplicht'); return; }
    setSaving(true);
    try {
      const bewaard = bewerken
        ? await updateLeverancier(leverancier.id, form)
        : await createLeverancier(form);
      toast.success(bewerken ? 'Leverancier bijgewerkt' : 'Leverancier toegevoegd');
      onSaved(bewaard);
      onClose();
    } catch (err) {
      toast.error(err.message || 'Opslaan mislukt');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="modal modal-wide">
        <div className="modal-hd">
          <div>
            <div className="modal-title">{bewerken ? 'Leverancier bewerken' : 'Nieuwe leverancier'}</div>
            <div className="modal-sub">Alleen de naam is verplicht — de rest vul je in wanneer je het weet.</div>
          </div>
          <ModalX onClose={onClose} />
        </div>

        <div className="fg">
          <div className="f s2">
            <label>Naam *</label>
            <input
              type="text" value={form.naam} autoFocus
              onChange={e => { set('naam', e.target.value); setFout(''); }}
              placeholder="Bijv. Gamma, Van der Berg Bouwmaterialen"
              style={fout ? { borderColor: '#dc2626' } : undefined}
            />
            {fout && <div style={{ color: '#dc2626', fontSize: '.78rem', marginTop: 4 }}>{fout}</div>}
          </div>

          {/* Net als in de klantmodal: AdresZoeker rendert zijn eigen label en
              hint, dus geen extra .f-wrapper eromheen — die gaf een dubbel
              label én een concurrerende input-styling. */}
          <AdresZoeker
            className="s2"
            disabled={saving}
            onSelect={({ address, postcode, city }) => setForm(f => ({ ...f, address, postcode, city }))}
          />
          <div className="f s2">
            <label>Adres</label>
            <input type="text" value={form.address} onChange={e => set('address', e.target.value)} placeholder="Straat en huisnummer" />
          </div>
          <div className="f">
            <label>Postcode</label>
            <input type="text" value={form.postcode} onChange={e => set('postcode', e.target.value)} placeholder="1234 AB" />
          </div>
          <div className="f">
            <label>Plaats</label>
            <input type="text" value={form.city} onChange={e => set('city', e.target.value)} />
          </div>

          <div className="f">
            <label>Contactpersoon</label>
            <input type="text" value={form.contactpersoon} onChange={e => set('contactpersoon', e.target.value)} />
          </div>
          <div className="f">
            <label>E-mail</label>
            <input type="email" value={form.email} onChange={e => set('email', e.target.value)} />
          </div>
          <div className="f">
            <label>Telefoon</label>
            <input type="text" value={form.telefoon} onChange={e => set('telefoon', e.target.value)} />
          </div>
          <div className="f">
            <label>Mobiel</label>
            <input type="text" value={form.mobiel} onChange={e => set('mobiel', e.target.value)} />
          </div>
          <div className="f s2">
            <label>Website</label>
            <input type="text" value={form.website} onChange={e => set('website', e.target.value)} placeholder="www.leverancier.nl" />
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

          <div className="f s2">
            <label>Notities</label>
            <textarea rows={3} value={form.notities} onChange={e => set('notities', e.target.value)} />
          </div>

          {bewerken && (
            <div className="f s2">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.actief !== false} onChange={e => set('actief', e.target.checked)} style={{ width: 'auto' }} />
                Actief — inactieve leveranciers blijven bestaan maar zijn niet meer te kiezen
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

export default function LeveranciersPage({ openLeverancier }) {
  const toast = useToast();
  const { refreshKey, bumpRefresh } = useProfile();
  const { can } = usePermissions();
  const [zoek, setZoek] = useState('');
  const [lijst, setLijst] = useState([]);
  const [totalen, setTotalen] = useState({});
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState('');
  const [modal, setModal] = useState(null); // null | 'nieuw' | leverancier-object

  const herlaad = () => {
    setLaden(true);
    Promise.all([listLeveranciers(), getLeverancierKostenTotalen()])
      .then(([l, t]) => { setLijst(l); setTotalen(t); setFout(''); })
      .catch(err => setFout(err.message || 'Leveranciers laden is mislukt.'))
      .finally(() => setLaden(false));
  };
  useEffect(herlaad, [refreshKey]);

  const term = zoek.toLowerCase();
  const gefilterd = lijst.filter(l =>
    l.naam.toLowerCase().includes(term)
    || l.city.toLowerCase().includes(term)
    || l.email.toLowerCase().includes(term)
  );

  const verwijder = async l => {
    const gekoppeld = totalen[l.id]?.aantal || 0;
    const waarschuwing = gekoppeld
      ? `"${l.naam}" verwijderen? Er ${gekoppeld === 1 ? 'hangt 1 kostenpost' : `hangen ${gekoppeld} kostenposten`} aan. Die blijven bestaan, maar raken hun leverancier kwijt.`
      : `"${l.naam}" verwijderen?`;
    if (!confirm(waarschuwing)) return;
    try {
      await deleteLeverancier(l.id);
      setLijst(ls => ls.filter(x => x.id !== l.id));
      toast.success('Leverancier verwijderd');
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
          <p>{lijst.length} {lijst.length === 1 ? 'leverancier' : 'leveranciers'}</p>
        </div>
        <div className="page-hd-actions">
          <button className="btn btn-p btn-sm" onClick={() => setModal('nieuw')}>{I.plus} Nieuwe leverancier</button>
        </div>
      </div>

      {fout && <div className="card card-p" style={{ color: '#dc2626', marginBottom: 14 }}>{fout}</div>}

      <div className="search afu2" style={{ maxWidth: 360, marginBottom: 14 }}>
        {I.search}
        <input placeholder="Zoek op naam, plaats of e-mail…" value={zoek} onChange={e => setZoek(e.target.value)} />
      </div>

      {laden && <div className="card card-p">Leveranciers laden…</div>}

      {!laden && gefilterd.length === 0 && (
        <div className="empty">
          <div className="empty-title">Geen leveranciers gevonden</div>
          <div className="empty-sub">
            {lijst.length === 0
              ? 'Voeg je eerste leverancier toe — dan landen je kosten in de boekhouding onder de juiste relatie.'
              : 'Pas je zoekopdracht aan.'}
          </div>
        </div>
      )}

      {!laden && gefilterd.length > 0 && (
        <div className="tw afu2">
          <table className="dt">
            <thead>
              <tr>
                <th>Leverancier</th><th>Plaats</th><th>Contact</th>
                <th>Kosten</th><th>Boekhouding</th><th></th>
              </tr>
            </thead>
            <tbody>
              {gefilterd.map(l => {
                const tot = totalen[l.id];
                return (
                  <tr key={l.id} style={{ cursor: 'pointer', opacity: l.actief ? 1 : 0.55 }} onClick={() => openLeverancier?.(l.id)}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Av name={l.naam} size="sm" />
                        <span style={{ fontWeight: 600 }}>{l.naam}</span>
                        {!l.actief && <span style={{ fontSize: '.7rem', color: 'var(--dl)' }}>inactief</span>}
                      </div>
                    </td>
                    <td>{l.city || '—'}</td>
                    <td style={{ color: 'var(--dmu)' }}>{l.email || l.telefoon || '—'}</td>
                    <td style={{ fontWeight: 700 }}>{tot ? fmt(tot.bedrag) : '—'}</td>
                    <td style={{ color: 'var(--dmu)', fontSize: '.8rem' }}>
                      {l.snelstartId ? 'Gekoppeld' : 'Nog niet gesynchroniseerd'}
                    </td>
                    <td>
                      <button className="btn-icon" onClick={e => { e.stopPropagation(); openLeverancier?.(l.id); }}>{I.arrow_r}</button>
                      {can('klanten_verwijderen') && (
                        <button className="btn-icon" onClick={e => { e.stopPropagation(); verwijder(l); }}>{I.trash}</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal === 'nieuw' && (
        <LeverancierModal
          leverancier={null}
          onClose={() => setModal(null)}
          onSaved={gemaakt => { herlaad(); bumpRefresh?.(); openLeverancier?.(gemaakt.id); }}
        />
      )}
    </div>
  );
}
