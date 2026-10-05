import { useEffect, useMemo, useState } from 'react';
import { Info, Copy, Check, Plus, Trash2, Send } from 'lucide-react';
import { useToast } from '../../lib/toast.jsx';
import { useUrlTab } from '../../hooks/useUrlTab.js';
import { InfoTip } from '../../components/Uitleg.jsx';
import Rondleiding from '../../components/Rondleiding.jsx';
import {
  BOSSBASE_VELDEN, haalWebsiteformulier, slaWebsiteformulierOp, naarDomeinen,
  insluitcode, formulierLink, stelDoelVoor, leesVeldenVanSite, verstuurTestaanvraag,
} from '../../services/websiteformulierService.js';
import { WebsiteformulierUitleg } from './WebsiteformulierUitleg.jsx';

// Instellingen › Websiteformulier.
//
// Eén formulier per bedrijf. Een aanvraag die binnenkomt wordt een klant (op
// e-mailadres, anders nieuw) en een project in de eerste fase van de pipeline:
// dat doet de database (trigger bb_websiteaanvraag_naar_pipeline), dit scherm
// stelt alleen in wáár en hóe het formulier op de website staat.

const OPTIONELE_VELDEN = BOSSBASE_VELDEN.filter(v => !v.vast);

const kaartStijl = actief => ({
  textAlign: 'left', padding: '14px 16px', borderRadius: 'var(--r10)', cursor: 'pointer', background: actief ? 'var(--pll)' : '#fff',
  border: `1.5px solid ${actief ? 'var(--p)' : 'var(--br)'}`, display: 'flex', flexDirection: 'column', gap: 4, font: 'inherit', color: 'inherit',
});
const stapKop = { fontWeight: 700, fontSize: '.86rem', margin: '22px 0 10px', display: 'flex', alignItems: 'center', gap: 6 };
const hint = { fontSize: 12.5, color: 'var(--dmu)', lineHeight: 1.5 };

function KopieerKnop({ tekst, label = 'Kopiëren' }) {
  const toast = useToast();
  const [klaar, setKlaar] = useState(false);
  const kopieer = async () => {
    try {
      await navigator.clipboard.writeText(tekst);
      setKlaar(true);
      setTimeout(() => setKlaar(false), 1800);
    } catch {
      toast.error('Kopiëren lukte niet. Selecteer de tekst en kopieer hem zelf.');
    }
  };
  return (
    <button type="button" className="btn btn-p btn-sm" onClick={kopieer}>
      {klaar ? <><Check size={14} /> Gekopieerd</> : <><Copy size={14} /> {label}</>}
    </button>
  );
}

export function WebsiteformulierSectie({ openDeal }) {
  const toast = useToast();
  const [weergave, setWeergave] = useUrlTab('formulier', { param: 'weergave', validIds: ['formulier', 'uitleg'], stap: true });

  const [opgeslagen, setOpgeslagen] = useState(null);
  const [f, setF] = useState(null);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState('');
  const [bezig, setBezig] = useState(false);
  const [domeinInvoer, setDomeinInvoer] = useState('');
  const [voorbeeldSleutel, setVoorbeeldSleutel] = useState(0);

  const [pagina, setPagina] = useState('');
  const [lezen, setLezen] = useState(false);
  const [gevonden, setGevonden] = useState(null);

  const [testBezig, setTestBezig] = useState(false);
  const [testDeal, setTestDeal] = useState(undefined);

  useEffect(() => {
    let leeft = true;
    haalWebsiteformulier()
      .then(r => { if (!leeft) return; setOpgeslagen(r); setF(r); })
      .catch(e => { if (leeft) setFout(e.message || 'Het websiteformulier kon niet worden geladen.'); })
      .finally(() => { if (leeft) setLaden(false); });
    return () => { leeft = false; };
  }, []);

  const gewijzigd = useMemo(() => JSON.stringify(f) !== JSON.stringify(opgeslagen), [f, opgeslagen]);
  const zet = (k, v) => setF(oud => ({ ...oud, [k]: v }));

  if (weergave === 'uitleg') return <WebsiteformulierUitleg onTerug={() => setWeergave('formulier')} />;

  if (laden) return <div className="card card-p" style={{ textAlign: 'center', color: 'var(--dl)' }}>Laden…</div>;
  if (fout || !f) {
    return (
      <div className="card card-p">
        {fout || 'Je account staat op alleen-lezen. Kies een abonnement om een websiteformulier aan te maken.'}
      </div>
    );
  }

  const voegDomeinenToe = () => {
    const { domeinen, fouten } = naarDomeinen(domeinInvoer);
    if (fouten.length) {
      toast.error(`Geen geldig webadres: ${fouten.join(', ')}`);
      return;
    }
    if (domeinen.some(d => /(^|\.)bossbase\.nl(:\d+)?$/i.test(new URL(d).host))) {
      toast.error('Vul het adres van je eigen website in.');
      return;
    }
    zet('domeinen', [...new Set([...f.domeinen, ...domeinen])]);
    setDomeinInvoer('');
  };

  const koppelingFouten = [];
  if (f.modus === 'koppelen') {
    const doelen = f.koppeling.filter(k => k.veld?.trim()).map(k => k.doel);
    if (!doelen.includes('email')) koppelingFouten.push('Koppel het veld voor het e-mailadres: zonder e-mailadres kan BossBase de aanvraag niet aan een klant koppelen.');
  }

  const opslaan = async () => {
    if (domeinInvoer.trim()) {
      toast.error('Je hebt een domein ingetypt maar nog niet toegevoegd. Klik op Toevoegen.');
      return;
    }
    setBezig(true);
    try {
      const r = await slaWebsiteformulierOp(f);
      setOpgeslagen(r);
      setF(r);
      setVoorbeeldSleutel(n => n + 1);
      toast.success('Websiteformulier opgeslagen');
    } catch (e) {
      toast.error(e.message || 'Opslaan mislukt');
    } finally {
      setBezig(false);
    }
  };

  const haalVelden = async () => {
    setLezen(true);
    setGevonden(null);
    try {
      const formulieren = await leesVeldenVanSite(pagina.trim());
      setGevonden(formulieren);
      if (!formulieren.length) toast.error('Geen formulier gevonden op deze pagina. Vul de veldnamen zelf in, of gebruik het kant-en-klare formulier.');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLezen(false);
    }
  };

  const neemFormulierOver = form => {
    zet('koppeling', form.velden.map(v => ({ veld: v.naam, doel: stelDoelVoor(v), label: v.label })).filter(k => k.doel || k.label));
    setGevonden(null);
  };

  const test = async () => {
    setTestBezig(true);
    setTestDeal(undefined);
    try {
      const velden = f.modus === 'koppelen' ? f.koppeling.map(k => k.doel) : opgeslagen.velden;
      setTestDeal(await verstuurTestaanvraag(f.token, velden));
    } catch (e) {
      toast.error(e.message);
    } finally {
      setTestBezig(false);
    }
  };

  const code = insluitcode(f.token, f.modus);
  const voorbeeldSrc = `${import.meta.env.DEV ? '/aanvraagformulier.html' : '/aanvraagformulier'}?f=${encodeURIComponent(f.token)}&voorbeeld=1`;

  return (
    <div className="card card-p afu3" data-rl="set-websiteformulier">
      <Rondleiding pagina="websiteformulier" />
      <div className="card-hd" style={{ marginBottom: 6, padding: 0, border: 0 }}>
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          Websiteformulier
          <button
            type="button"
            className="bb-info"
            aria-label="Uitleg: zo zet je het formulier op je website"
            title="Uitleg: zo zet je het formulier op je website"
            onClick={() => setWeergave('uitleg')}
            data-rl="wf-uitleg"
          >
            <Info size={14} />
          </button>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          <input type="checkbox" style={{ accentColor: 'var(--p)' }} checked={f.actief} onChange={e => zet('actief', e.target.checked)} />
          Aanvragen ontvangen
        </label>
      </div>
      <p style={{ ...hint, marginTop: 0 }}>
        Een aanvraag van je website komt meteen in de eerste fase van je pipeline, als project met klant.
        Bestaat de klant al (zelfde e-mailadres), dan komt hij bij die klant.
      </p>

      {/* ── 1. Domeinen ── */}
      <div style={stapKop}>
        1. Op welke website staat het formulier?
        <InfoTip tekst="Alleen van deze adressen nemen we aanvragen aan. Zo kan niemand jouw formulier op een andere site zetten." />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        {f.domeinen.map(d => (
          <span key={d} className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 6px 4px 10px', borderRadius: 'var(--r999)', background: 'var(--bgx)', fontSize: 12.5 }}>
            {d}
            <button type="button" aria-label={`${d} verwijderen`} onClick={() => zet('domeinen', f.domeinen.filter(x => x !== d))}
              style={{ border: 0, background: 'transparent', cursor: 'pointer', padding: 2, display: 'flex', color: 'var(--dmu)' }}>
              <Trash2 size={12} />
            </button>
          </span>
        ))}
        {!f.domeinen.length && <span style={{ ...hint, color: '#b45309' }}>Nog geen website opgegeven: het formulier werkt nog nergens.</span>}
      </div>
      <div className="f" style={{ display: 'flex', flexDirection: 'row', gap: 8 }}>
        <input
          value={domeinInvoer}
          onChange={e => setDomeinInvoer(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); voegDomeinenToe(); } }}
          placeholder="mijnbedrijf.nl"
          aria-label="Adres van je website"
          style={{ flex: 1 }}
        />
        <button type="button" className="btn btn-s" onClick={voegDomeinenToe} disabled={!domeinInvoer.trim()}>Toevoegen</button>
      </div>
      <div style={{ ...hint, marginTop: 6 }}>We voegen het adres met en zonder www toe. Staat je site op Wix zonder eigen domein, vul dan je wixsite.com-adres in.</div>

      {/* ── 2. Manier ── */}
      <div style={stapKop}>2. Hoe wil je het formulier gebruiken?</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
        <button type="button" style={kaartStijl(f.modus === 'kant_en_klaar')} onClick={() => zet('modus', 'kant_en_klaar')} aria-pressed={f.modus === 'kant_en_klaar'}>
          <strong style={{ fontSize: 14 }}>Kant-en-klaar formulier</strong>
          <span style={hint}>Plakken en klaar. In de kleur van je bedrijf, met de velden die jij kiest.</span>
        </button>
        <button type="button" style={kaartStijl(f.modus === 'koppelen')} onClick={() => zet('modus', 'koppelen')} aria-pressed={f.modus === 'koppelen'}>
          <strong style={{ fontSize: 14 }}>Koppelen aan je eigen formulier</strong>
          <span style={hint}>Je hebt al een formulier. Dat blijft werken; BossBase krijgt een kopie van elke aanvraag.</span>
        </button>
      </div>

      {f.modus === 'kant_en_klaar' ? (
        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20, alignItems: 'start' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Welke velden?</div>
            <div style={{ ...hint, marginBottom: 8 }}>Naam, e-mailadres en omschrijving staan er altijd in.</div>
            {OPTIONELE_VELDEN.map(v => (
              <label key={v.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, padding: '4px 0', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  style={{ accentColor: 'var(--p)' }}
                  checked={f.velden.includes(v.key)}
                  onChange={e => zet('velden', e.target.checked ? [...f.velden, v.key] : f.velden.filter(x => x !== v.key))}
                />
                {v.label}
              </label>
            ))}
            <div className="f" style={{ marginTop: 12 }}>
              <label>Link naar je privacyverklaring <span style={{ fontWeight: 400, color: 'var(--dl)' }}>(optioneel)</span></label>
              <input value={f.privacyUrl} onChange={e => zet('privacyUrl', e.target.value)} placeholder="https://mijnbedrijf.nl/privacy" />
            </div>
            <div style={{ ...hint, marginTop: 6 }}>De kleur komt uit je bedrijfsprofiel.</div>
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Zo ziet het eruit{gewijzigd ? ' (na opslaan)' : ''}</div>
            <iframe
              key={voorbeeldSleutel}
              title="Voorbeeld van het formulier"
              src={voorbeeldSrc}
              style={{ width: '100%', height: 560, border: '1px solid var(--br)', borderRadius: 'var(--r10)', background: 'var(--bgs)' }}
            />
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Welk veld van jouw formulier hoort waarbij?</div>
          <div style={{ ...hint, marginBottom: 10 }}>
            Vul het adres in van de pagina met je formulier, dan zoeken wij de velden op. Lukt dat niet (bij Wix of een formulier dat pas later laadt), vul dan zelf de naam van het veld in: het <code>name</code>-attribuut.
          </div>
          <div className="f" style={{ display: 'flex', flexDirection: 'row', gap: 8 }}>
            <input value={pagina} onChange={e => setPagina(e.target.value)} placeholder="https://mijnbedrijf.nl/contact" aria-label="Pagina met je formulier" style={{ flex: 1 }} />
            <button type="button" className="btn btn-s" onClick={haalVelden} disabled={lezen || !pagina.trim() || gewijzigd}
              title={gewijzigd ? 'Sla eerst op, zodat we je domeinen kennen' : undefined}>
              {lezen ? 'Zoeken…' : 'Velden ophalen'}
            </button>
          </div>
          {gewijzigd && <div style={{ ...hint, marginTop: 4 }}>Sla eerst op om velden op te halen.</div>}
          {gevonden?.length > 0 && (
            <div style={{ marginTop: 10, padding: 12, border: '1px solid var(--br)', borderRadius: 'var(--r8)', background: 'var(--bgs)' }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                {gevonden.length === 1 ? 'Eén formulier gevonden' : `${gevonden.length} formulieren gevonden`}
              </div>
              {gevonden.map((form, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '6px 0', borderTop: i ? '1px solid var(--br)' : 0 }}>
                  <span style={{ fontSize: 13 }}>
                    {form.naam} <span style={{ color: 'var(--dmu)' }}>· {form.velden.map(v => v.label || v.naam).slice(0, 5).join(', ')}{form.velden.length > 5 ? '…' : ''}</span>
                  </span>
                  <button type="button" className="btn btn-p btn-xs" onClick={() => neemFormulierOver(form)}>Gebruiken</button>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
            {f.koppeling.map((k, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) auto', gap: 8, alignItems: 'center' }}>
                <div className="f" style={{ margin: 0 }}>
                  <input
                    value={k.veld}
                    onChange={e => zet('koppeling', f.koppeling.map((x, j) => j === i ? { ...x, veld: e.target.value } : x))}
                    placeholder="Veldnaam, bijv. your-email"
                    aria-label="Veld in jouw formulier"
                    title={k.label || undefined}
                  />
                  {k.label && <div style={{ ...hint, fontSize: 11.5, marginTop: 2 }}>{k.label}</div>}
                </div>
                <div className="f" style={{ margin: 0, alignSelf: 'start' }}>
                  <select
                    value={k.doel}
                    onChange={e => zet('koppeling', f.koppeling.map((x, j) => j === i ? { ...x, doel: e.target.value } : x))}
                    aria-label="Hoort bij"
                  >
                    <option value="">Niet gebruiken</option>
                    {BOSSBASE_VELDEN.map(v => <option key={v.key} value={v.key}>{v.label}</option>)}
                  </select>
                </div>
                <button type="button" className="btn btn-s btn-sm" style={{ alignSelf: 'start' }} aria-label="Regel verwijderen"
                  onClick={() => zet('koppeling', f.koppeling.filter((_, j) => j !== i))}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <div>
              <button type="button" className="btn btn-s btn-sm" onClick={() => zet('koppeling', [...f.koppeling, { veld: '', doel: '' }])}>
                <Plus size={14} /> Veld toevoegen
              </button>
            </div>
          </div>
          {koppelingFouten.map(t => <div key={t} style={{ ...hint, color: '#b45309', marginTop: 8 }}>{t}</div>)}
          <div style={{ ...hint, marginTop: 8 }}>
            Twee velden bij hetzelfde BossBase-veld (bijvoorbeeld voornaam en achternaam) worden samengevoegd.
            {' '}Velden die je niet koppelt, gaan niet naar BossBase.
          </div>
        </div>
      )}

      <div className="fa">
        <button className="btn btn-p" onClick={opslaan} disabled={bezig || !gewijzigd}>
          {bezig ? 'Opslaan…' : gewijzigd ? 'Opslaan' : 'Opgeslagen'}
        </button>
      </div>

      {/* ── 3. Code ── */}
      <div style={stapKop}>3. Plak deze code in je website</div>
      <div data-rl="wf-code">
        <pre style={{ background: '#0f172a', color: '#e2e8f0', padding: '12px 14px', borderRadius: 'var(--r8)', fontSize: 12.5, overflowX: 'auto', whiteSpace: 'pre', margin: 0 }}>{code}</pre>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
          <KopieerKnop tekst={code} label="Code kopiëren" />
          <span style={hint}>
            {f.modus === 'koppelen'
              ? 'Zet de code op elke pagina met je formulier, bijvoorbeeld in de footer.'
              : 'Zet de code op de plek waar het formulier moet komen.'}
            {' '}Er staat geen geheime sleutel in. <button type="button" className="btn-link" style={{ border: 0, background: 'none', padding: 0, color: 'var(--pd)', cursor: 'pointer', font: 'inherit', textDecoration: 'underline' }} onClick={() => setWeergave('uitleg')}>Hoe doe ik dat in WordPress of Wix?</button>
          </span>
        </div>
        {f.modus === 'kant_en_klaar' && (
          <div style={{ marginTop: 12 }}>
            <div style={{ ...hint, marginBottom: 6 }}>Wix of een andere sitebouwer die alleen een webadres kan insluiten? Gebruik deze link:</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <code style={{ fontSize: 12, background: 'var(--bgx)', padding: '6px 8px', borderRadius: 'var(--r6)', wordBreak: 'break-all' }}>{formulierLink(f.token)}</code>
              <KopieerKnop tekst={formulierLink(f.token)} label="Link kopiëren" />
            </div>
          </div>
        )}
      </div>

      {/* ── 4. Testen ── */}
      <div style={stapKop}>4. Testen</div>
      <div data-rl="wf-test" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-s" onClick={test} disabled={testBezig || !opgeslagen.actief}>
          <Send size={14} /> {testBezig ? 'Versturen…' : 'Testaanvraag versturen'}
        </button>
        {!opgeslagen.actief && <span style={hint}>Zet "Aanvragen ontvangen" aan en sla op om te testen.</span>}
        {testDeal !== undefined && (
          <span style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Check size={15} color="var(--pd)" /> De testaanvraag staat in je pipeline.
            {testDeal && openDeal && (
              <button type="button" className="btn btn-p btn-sm" onClick={() => openDeal(testDeal)}>Bekijken</button>
            )}
          </span>
        )}
      </div>
      <div style={{ ...hint, marginTop: 6 }}>
        Dit verstuurt een aanvraag van "Test Aanvraag" langs dezelfde weg als een bezoeker. Daarna kun je ook zelf je formulier op je website invullen.
      </div>
    </div>
  );
}
