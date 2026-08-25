// Leverancierskeuze met "+ Nieuwe leverancier" erin.
//
// Zonder deze optie moest je de flow verlaten en naar Relaties → Leveranciers
// om één naam toe te voegen. Nu opent de keuze een klein formulier (alleen naam
// verplicht) en is de nieuwe leverancier meteen geselecteerd.
//
// Eén component voor alle plekken waar een leverancier gekozen wordt:
// kostenmodal, kostendetail, projectdrawer en het materiaalformulier.

import { useEffect, useState } from 'react';
import { I, ModalX } from '../bb-shared.jsx';
import { useToast } from '../lib/toast.jsx';
import AdresZoeker from './AdresZoeker.jsx';
import { listLeveranciers, createLeverancier } from '../services/leverancierService.js';

const NIEUW = '__nieuw__';

const LEEG = {
  naam: '', contactpersoon: '', email: '', telefoon: '',
  address: '', postcode: '', city: '', kvkNumber: '', btwNumber: '',
};

// Klein formulier: alleen naam verplicht. De rest kan later op de
// leverancierskaart aangevuld worden — hier telt snelheid.
function SnelLeverancierModal({ onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(LEEG);
  const [saving, setSaving] = useState(false);
  const [fout, setFout] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.naam.trim()) { setFout('Naam is verplicht'); return; }
    setSaving(true);
    try {
      const gemaakt = await createLeverancier(form);
      toast.success('Leverancier toegevoegd');
      onSaved(gemaakt);
      onClose();
    } catch (err) {
      toast.error(err.message || 'Opslaan mislukt');
    } finally { setSaving(false); }
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="modal">
        <div className="modal-hd">
          <div>
            <div className="modal-title">Nieuwe leverancier</div>
            <div className="modal-sub">Alleen de naam is verplicht — de rest vul je later aan.</div>
          </div>
          <ModalX onClose={onClose} />
        </div>

        <div className="fg">
          <div className="f s2">
            <label>Naam *</label>
            <input
              type="text" value={form.naam} autoFocus
              onChange={e => { set('naam', e.target.value); setFout(''); }}
              onKeyDown={e => { if (e.key === 'Enter') submit(); }}
              placeholder="Bijv. Gamma, Van der Berg Bouwmaterialen"
              style={fout ? { borderColor: '#dc2626' } : undefined}
            />
            {fout && <div style={{ color: '#dc2626', fontSize: '.78rem', marginTop: 4 }}>{fout}</div>}
          </div>

          <AdresZoeker
            className="s2"
            disabled={saving}
            onSelect={({ address, postcode, city }) => setForm(f => ({ ...f, address, postcode, city }))}
          />
          <div className="f s2">
            <label>Adres</label>
            <input type="text" value={form.address} onChange={e => set('address', e.target.value)} />
          </div>
          <div className="f">
            <label>Postcode</label>
            <input type="text" value={form.postcode} onChange={e => set('postcode', e.target.value)} />
          </div>
          <div className="f">
            <label>Plaats</label>
            <input type="text" value={form.city} onChange={e => set('city', e.target.value)} />
          </div>
          <div className="f">
            <label>E-mail</label>
            <input type="email" value={form.email} onChange={e => set('email', e.target.value)} />
          </div>
          <div className="f">
            <label>Telefoon</label>
            <input type="text" value={form.telefoon} onChange={e => set('telefoon', e.target.value)} />
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

export default function LeverancierSelect({
  value,
  onChange,
  disabled = false,
  verplicht = false,
  fout = false,
  style,
  // Externe lijst meegeven voorkomt dat elk keuzeveld op een scherm zijn eigen
  // query doet; laat leeg om het component zelf te laten laden.
  leveranciers: extern,
  onLijstGewijzigd,
}) {
  const [eigen, setEigen] = useState([]);
  const [modal, setModal] = useState(false);
  const lijst = extern ?? eigen;

  useEffect(() => {
    if (extern) return;
    listLeveranciers({ inclusiefInactief: false }).then(setEigen).catch(() => {});
  }, [extern]);

  const kies = v => {
    if (v === NIEUW) { setModal(true); return; }
    onChange(v);
  };

  const naOpslaan = gemaakt => {
    if (!extern) setEigen(l => [...l, gemaakt].sort((a, b) => a.naam.localeCompare(b.naam, 'nl')));
    onLijstGewijzigd?.(gemaakt);
    onChange(gemaakt.id);
  };

  return (
    <>
      <select
        value={value || ''}
        disabled={disabled}
        onChange={e => kies(e.target.value)}
        // Zonder deze breedte schaalt een select naar zijn bréédste optie — een
        // lange leveranciersnaam of "+ Nieuwe leverancier…" duwde het veld dan
        // net buiten zijn cel in het formulier.
        style={{ width: '100%', maxWidth: '100%', minWidth: 0, ...(fout ? { borderColor: '#dc2626' } : null), ...style }}
      >
        <option value="">{verplicht ? '— Kies leverancier —' : 'Geen leverancier'}</option>
        {lijst.map(l => <option key={l.id} value={l.id}>{l.naam}</option>)}
        <option value={NIEUW}>+ Nieuwe leverancier…</option>
      </select>
      {modal && <SnelLeverancierModal onClose={() => setModal(false)} onSaved={naOpslaan} />}
    </>
  );
}
