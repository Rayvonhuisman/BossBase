// Leverancierskaart — dezelfde opbouw als de klantkaart (CustomerPage):
// kopblok, tabbalk, en per tab een paneel. Bewust minder tabs: een leverancier
// heeft geen offertes, facturen, deals of werkbonnen.
//
// Hergebruik: NotitieLog (identiek aan klanten), Tijdlijn (uit CustomerPage
// getrokken naar een gedeeld component), AdresZoeker en de e-mailflow.

import { useEffect, useState } from 'react';
import { I, ModalX, fmt, Av } from '../bb-shared.jsx';
import { useToast } from '../lib/toast.jsx';
import { usePermissions } from '../hooks/usePermissions.js';
import NotitieLog, { toLogItem } from '../components/NotitieLog.jsx';
import Tijdlijn from '../components/Tijdlijn.jsx';
import AdresZoeker from '../components/AdresZoeker.jsx';
import { getLeverancier, updateLeverancier } from '../services/leverancierService.js';
import {
  getTijdlijnByLeverancier, getLeverancierNotities,
  addLeverancierNotitie, logLeverancierTijdlijnSafe,
} from '../services/leverancierTijdlijnService.js';
import { listMaterialen, marge } from '../services/materiaalService.js';
import { sendEmail } from '../services/emailService.js';
import { mailTemplate } from '../utils/mailTemplate.js';

const TABS = [
  ['overzicht', 'Overzicht'],
  ['notities', 'Notities'],
  ['materialen', 'Materialen'],
  ['email', 'E-mail'],
  ['tijdlijn', 'Tijdlijn'],
  ['gegevens', 'Gegevens'],
];

// Eén regel in het overzicht. Leeg veld toont een streepje in plaats van niets,
// zodat de indeling niet verspringt.
const Regel = ({ label, waarde }) => (
  <div style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
    <div style={{ width: 140, flexShrink: 0, fontSize: '.78rem', color: 'var(--dl)' }}>{label}</div>
    <div style={{ fontSize: '.84rem', color: 'var(--dk)', minWidth: 0, wordBreak: 'break-word' }}>{waarde || '—'}</div>
  </div>
);

export default function LeverancierPage({ leverancierId, onClose, onGewijzigd }) {
  const toast = useToast();
  const { can } = usePermissions();
  const magBewerken = can('klanten_bewerken');

  const [tab, setTab] = useState('overzicht');
  const [lev, setLev] = useState(null);
  const [laden, setLaden] = useState(true);
  const [notities, setNotities] = useState([]);
  const [tijdlijn, setTijdlijn] = useState([]);
  const [materialen, setMaterialen] = useState([]);
  const [form, setForm] = useState(null);
  const [bewaren, setBewaren] = useState(false);
  const [mail, setMail] = useState({ onderwerp: '', tekst: '' });
  const [mailen, setMailen] = useState(false);

  useEffect(() => {
    if (!leverancierId) return;
    let leeft = true;
    setLaden(true);
    setTab('overzicht');
    Promise.all([
      getLeverancier(leverancierId),
      getLeverancierNotities(leverancierId).catch(() => []),
      getTijdlijnByLeverancier(leverancierId).catch(() => []),
      listMaterialen().catch(() => []),
    ])
      .then(([l, n, t, m]) => {
        if (!leeft) return;
        setLev(l);
        setForm(l);
        setNotities(n);
        setTijdlijn(t);
        setMaterialen(m.filter(x => x.leverancierId === leverancierId));
      })
      .catch(() => {})
      .finally(() => { if (leeft) setLaden(false); });
    return () => { leeft = false; };
  }, [leverancierId]);

  const voegNotitieToe = async tekst => {
    const gemaakt = await addLeverancierNotitie(leverancierId, tekst);
    setNotities(l => [gemaakt, ...l]);
    setTijdlijn(l => [gemaakt, ...l]);
  };

  const bewaar = async () => {
    setBewaren(true);
    try {
      const bijgewerkt = await updateLeverancier(leverancierId, form);
      setLev(bijgewerkt);
      setForm(bijgewerkt);
      toast.success('Leverancier bijgewerkt');
      onGewijzigd?.(bijgewerkt);
    } catch (err) {
      toast.error(err.message || 'Opslaan mislukt');
    } finally {
      setBewaren(false);
    }
  };

  const verstuurMail = async () => {
    if (!lev?.email) { toast.error('Deze leverancier heeft geen e-mailadres'); return; }
    if (!mail.onderwerp.trim()) { toast.error('Vul een onderwerp in'); return; }
    setMailen(true);
    try {
      const html = mailTemplate({ title: mail.onderwerp, body: mail.tekst.replace(/\n/g, '<br>') });
      await sendEmail({ to: lev.email, subject: mail.onderwerp, html });
      await logLeverancierTijdlijnSafe(leverancierId, 'email_verstuurd',
        `E-mail verstuurd: ${mail.onderwerp}`, { to: lev.email });
      setTijdlijn(await getTijdlijnByLeverancier(leverancierId).catch(() => tijdlijn));
      setMail({ onderwerp: '', tekst: '' });
      toast.success('E-mail verstuurd');
    } catch (err) {
      toast.error(err.message || 'Versturen mislukt');
    } finally {
      setMailen(false);
    }
  };

  if (laden) return <div className="card card-p">Leverancier laden…</div>;
  if (!lev) return <div className="card card-p">Leverancier niet gevonden.</div>;

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const adres = [lev.address, [lev.postcode, lev.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <Av name={lev.naam} size="lg" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>{lev.naam}</div>
          <div style={{ fontSize: '.8rem', color: 'var(--dmu)' }}>
            {lev.city || 'Leverancier'}{!lev.actief && ' · inactief'}
          </div>
        </div>
        {onClose && <ModalX onClose={onClose} />}
      </div>

      <div className="tabs" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
        {TABS.map(([id, label]) => (
          <button key={id} className={`tab${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === 'overzicht' && (
        <div className="card card-p">
          <Regel label="Naam" waarde={lev.naam} />
          <Regel label="Contactpersoon" waarde={lev.contactpersoon} />
          <Regel label="Adres" waarde={adres} />
          <Regel label="E-mail" waarde={lev.email} />
          <Regel label="Telefoon" waarde={lev.telefoon} />
          <Regel label="Mobiel" waarde={lev.mobiel} />
          <Regel label="Website" waarde={lev.website} />
          <Regel label="KvK-nummer" waarde={lev.kvkNumber} />
          <Regel label="BTW-nummer" waarde={lev.btwNumber} />
          <Regel label="IBAN" waarde={lev.iban} />
          <Regel label="Betaaltermijn" waarde={lev.betaaltermijnDagen ? `${lev.betaaltermijnDagen} dagen` : ''} />
          <Regel label="Boekhouding" waarde={lev.snelstartId ? 'Gekoppeld aan SnelStart' : 'Nog niet gesynchroniseerd'} />
          {lev.notities && <Regel label="Notities" waarde={lev.notities} />}
        </div>
      )}

      {tab === 'notities' && (
        // key: het paneel blijft gemount bij wisselen van leverancier, dus
        // zonder remount houdt NotitieLog de concepttekst van de vorige vast.
        <NotitieLog
          key={leverancierId}
          items={notities.map(n => toLogItem({ id: n.id, body: n.omschrijving, createdAt: n.aangemaaktop }))}
          onAdd={voegNotitieToe}
        />
      )}

      {tab === 'materialen' && (
        <div className="card card-p">
          {materialen.length === 0 ? (
            <div style={{ color: 'var(--dmu)', fontSize: '.84rem' }}>
              Nog geen materialen van deze leverancier.
            </div>
          ) : (
            <table className="dt">
              <thead>
                <tr>
                  <th>Materiaal</th><th>Eenheid</th><th>Verkoop</th>
                  {can('inkoopprijzen') && <><th>Inkoop</th><th>Marge</th></>}
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

      {tab === 'email' && (
        <div className="card card-p">
          {!lev.email ? (
            <div style={{ color: 'var(--dmu)', fontSize: '.84rem' }}>
              Deze leverancier heeft geen e-mailadres. Vul er een in bij Gegevens.
            </div>
          ) : (
            <div className="fg">
              <div className="f s2">
                <label>Aan</label>
                <input type="text" value={lev.email} disabled />
              </div>
              <div className="f s2">
                <label>Onderwerp</label>
                <input type="text" value={mail.onderwerp} onChange={e => setMail(m => ({ ...m, onderwerp: e.target.value }))} />
              </div>
              <div className="f s2">
                <label>Bericht</label>
                <textarea rows={7} value={mail.tekst} onChange={e => setMail(m => ({ ...m, tekst: e.target.value }))} />
              </div>
              <div className="f s2">
                <button className="btn btn-p btn-sm" onClick={verstuurMail} disabled={mailen}>
                  {mailen ? 'Versturen…' : <>{I.mail} Versturen</>}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'tijdlijn' && <Tijdlijn items={tijdlijn} />}

      {tab === 'gegevens' && form && (
        <div className="card card-p">
          <div className="fg">
            <div className="f s2">
              <label>Naam *</label>
              <input type="text" value={form.naam} disabled={!magBewerken} onChange={e => set('naam', e.target.value)} />
            </div>

            {magBewerken && (
              <AdresZoeker
                className="s2"
                onSelect={({ address, postcode, city }) => setForm(f => ({ ...f, address, postcode, city }))}
              />
            )}
            <div className="f s2">
              <label>Adres</label>
              <input type="text" value={form.address} disabled={!magBewerken} onChange={e => set('address', e.target.value)} />
            </div>
            <div className="f">
              <label>Postcode</label>
              <input type="text" value={form.postcode} disabled={!magBewerken} onChange={e => set('postcode', e.target.value)} />
            </div>
            <div className="f">
              <label>Plaats</label>
              <input type="text" value={form.city} disabled={!magBewerken} onChange={e => set('city', e.target.value)} />
            </div>

            <div className="f">
              <label>Contactpersoon</label>
              <input type="text" value={form.contactpersoon} disabled={!magBewerken} onChange={e => set('contactpersoon', e.target.value)} />
            </div>
            <div className="f">
              <label>E-mail</label>
              <input type="email" value={form.email} disabled={!magBewerken} onChange={e => set('email', e.target.value)} />
            </div>
            <div className="f">
              <label>Telefoon</label>
              <input type="text" value={form.telefoon} disabled={!magBewerken} onChange={e => set('telefoon', e.target.value)} />
            </div>
            <div className="f">
              <label>Mobiel</label>
              <input type="text" value={form.mobiel} disabled={!magBewerken} onChange={e => set('mobiel', e.target.value)} />
            </div>
            <div className="f s2">
              <label>Website</label>
              <input type="text" value={form.website} disabled={!magBewerken} onChange={e => set('website', e.target.value)} />
            </div>

            <div className="f">
              <label>KvK-nummer</label>
              <input type="text" value={form.kvkNumber} disabled={!magBewerken} onChange={e => set('kvkNumber', e.target.value)} />
            </div>
            <div className="f">
              <label>BTW-nummer</label>
              <input type="text" value={form.btwNumber} disabled={!magBewerken} onChange={e => set('btwNumber', e.target.value)} />
            </div>
            <div className="f">
              <label>IBAN</label>
              <input type="text" value={form.iban} disabled={!magBewerken} onChange={e => set('iban', e.target.value)} />
            </div>
            <div className="f">
              <label>Betaaltermijn <span style={{ color: 'var(--dl)', fontWeight: 400 }}>(dagen)</span></label>
              <input type="number" min="0" value={form.betaaltermijnDagen ?? ''} disabled={!magBewerken} onChange={e => set('betaaltermijnDagen', e.target.value)} />
            </div>

            <div className="f s2">
              <label>Notities</label>
              <textarea rows={3} value={form.notities} disabled={!magBewerken} onChange={e => set('notities', e.target.value)} />
            </div>

            <div className="f s2">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: magBewerken ? 'pointer' : 'default' }}>
                <input type="checkbox" checked={form.actief !== false} disabled={!magBewerken} onChange={e => set('actief', e.target.checked)} style={{ width: 'auto' }} />
                Actief
              </label>
            </div>

            {magBewerken && (
              <div className="f s2">
                <button className="btn btn-p btn-sm" onClick={bewaar} disabled={bewaren}>
                  {bewaren ? 'Opslaan…' : <>{I.check} Opslaan</>}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
