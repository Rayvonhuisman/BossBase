import { useEffect, useMemo, useRef, useState } from 'react';
import { Info, Copy, Check, Plus, Trash2, Send, ArrowLeft, ArrowRight, ChevronDown, ChevronRight, Pencil, Code } from 'lucide-react';
import { useToast } from '../../lib/toast.jsx';
import { useProfile } from '../../lib/profileContext.jsx';
import { useUrlTab } from '../../hooks/useUrlTab.js';
import { InfoTip, InfoUitklap } from '../../components/Uitleg.jsx';
import Rondleiding from '../../components/Rondleiding.jsx';
import {
  BOSSBASE_VELDEN, EIGEN_SOORTEN, nieuwEigenVeld, haalWebsiteformulier, slaWebsiteformulierOp, naarDomeinen,
  naarPaginaUrl, isBossBasePagina, insluitcode, formulierLink, stelDoelVoor, leesVeldenVanSite, verstuurTestaanvraag,
} from '../../services/websiteformulierService.js';
import { WebsiteformulierUitleg } from './WebsiteformulierUitleg.jsx';

// Instellingen › Websiteformulier.
//
// Een wizard van vijf stappen, één tegelijk in beeld, en daarna een eindscherm
// met de belangrijkste instellingen en "Meer instellingen". Elke stap slaat
// zelf op bij Volgende, dus halverwege stoppen kan.
//
// Eén formulier per bedrijf. Een aanvraag die binnenkomt wordt een klant (op
// e-mailadres, anders nieuw) en een project in de eerste fase van de pipeline:
// dat doet de database (trigger bb_websiteaanvraag_naar_pipeline), dit scherm
// stelt alleen in wáár en hóe het formulier op de website staat.

const OPTIONELE_VELDEN = BOSSBASE_VELDEN.filter(v => !v.vast);
const STAPPEN = ['Formulier', 'Website', 'Velden', 'Code', 'Testen'];

// Pagina's waar een contactformulier vaak staat. Vult iemand alleen het adres
// van zijn website in, dan kijken we daar ook.
const VAAK_FORMULIER = ['contact', 'contact-us', 'offerte-aanvragen', 'offerte', 'aanvraag'];

const keuzeStijl = actief => ({
  textAlign: 'left', padding: '16px 18px', borderRadius: 'var(--r10)', cursor: 'pointer', background: actief ? 'var(--pll)' : '#fff',
  border: `1.5px solid ${actief ? 'var(--p)' : 'var(--br)'}`, display: 'flex', flexDirection: 'column', gap: 4, font: 'inherit', color: 'inherit',
});
const vraag = { fontSize: '1.15rem', fontWeight: 700, margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 8 };
const zin = { fontSize: 14, color: 'var(--dmu)', lineHeight: 1.5, margin: '0 0 18px' };
const hint = { fontSize: 12.5, color: 'var(--dmu)', lineHeight: 1.5 };
const waarschuwing = { ...hint, color: '#b45309' };

// Drie korte stappen per soort site en manier.
const PLAATSEN = {
  wordpress: {
    kant_en_klaar: [
      'Open de pagina waar het formulier moet komen en klik op Bewerken.',
      'Voeg het blok Aangepaste HTML toe.',
      'Plak de code en klik op Bijwerken.',
    ],
    koppelen: [
      'Installeer de gratis plugin WPCode.',
      'Ga naar Code Snippets › Header & Footer.',
      'Plak de code bij Footer en klik op Opslaan.',
    ],
  },
  wix: {
    kant_en_klaar: [
      'Klik in de Wix-editor op Toevoegen › Code insluiten › Een site insluiten.',
      'Plak de link bij Website-adres.',
      'Maak het vak ongeveer 750 pixels hoog en klik op Publiceren.',
    ],
  },
  anders: {
    kant_en_klaar: [
      'Zoek in je sitebouwer een blok voor eigen HTML of code.',
      'Plak de code op de plek waar het formulier moet komen.',
      'Publiceer de pagina.',
    ],
    koppelen: [
      'Zoek de plek voor eigen code in de footer van je site.',
      'Plak de code daar, zodat hij op de pagina met je formulier staat.',
      'Publiceer je site.',
    ],
  },
};

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

// Een rij op het eindscherm: label links, waarde rechts.
function Regel({ label, children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '140px minmax(0,1fr)', gap: 12, padding: '8px 0', borderTop: '1px solid var(--border)', fontSize: 13.5 }}>
      <div style={{ color: 'var(--dmu)' }}>{label}</div>
      <div style={{ fontWeight: 600, wordBreak: 'break-word' }}>{children}</div>
    </div>
  );
}

// Is het formulier al eens helemaal ingesteld? Dan opent de pagina op het
// eindscherm in plaats van bij stap 1.
const isIngericht = f => !!f && f.domeinen.length > 0
  && (f.modus === 'kant_en_klaar' || f.koppeling.some(k => k.doel === 'email' && k.veld?.trim()));

export function WebsiteformulierSectie({ openDeal, naarBedrijfsprofiel }) {
  const toast = useToast();
  const { company } = useProfile();
  const [weergave, setWeergave] = useUrlTab('formulier', { param: 'weergave', validIds: ['formulier', 'uitleg'], stap: true });

  const [opgeslagen, setOpgeslagen] = useState(null);
  const [f, setF] = useState(null);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState('');
  const [bezig, setBezig] = useState(false);
  const [voorbeeldSleutel, setVoorbeeldSleutel] = useState(0);

  // 0..4 = de stappen van de wizard, 'klaar' = het eindscherm.
  const [stap, setStap] = useState(0);
  const [adres, setAdres] = useState('');
  const [adresFout, setAdresFout] = useState('');
  const [zoeken, setZoeken] = useState(false);
  const [siteSoort, setSiteSoort] = useState('');
  const [testBezig, setTestBezig] = useState(false);
  const [testDeal, setTestDeal] = useState(undefined);
  const [meerOpen, setMeerOpen] = useState(false);
  const [domeinInvoer, setDomeinInvoer] = useState('');

  useEffect(() => {
    let leeft = true;
    haalWebsiteformulier()
      .then(r => {
        if (!leeft || !r) return;
        setOpgeslagen(r);
        setF(r);
        setAdres(r.paginaUrl || (r.domeinen.find(d => d.startsWith('https://www.')) || r.domeinen[0] || '').replace(/^https?:\/\//, ''));
        setStap(isIngericht(r) ? 'klaar' : 0);
      })
      .catch(e => { if (leeft) setFout(e.message || 'Het websiteformulier kon niet worden geladen.'); })
      .finally(() => { if (leeft) setLaden(false); });
    return () => { leeft = false; };
  }, []);

  const gewijzigd = useMemo(() => JSON.stringify(f) !== JSON.stringify(opgeslagen), [f, opgeslagen]);
  const zet = (k, v) => setF(oud => ({ ...oud, [k]: v }));

  // Slaat op wat er nu staat. Geeft het opgeslagen formulier terug, of null.
  // `houdKoppeling`: de koppelregels op het scherm laten zoals ze zijn, ook
  // regels die nog niet af zijn (de server bewaart alleen complete regels).
  const bewaar = async (wat = f, { stil = true, houdKoppeling = false } = {}) => {
    setBezig(true);
    try {
      const r = await slaWebsiteformulierOp(wat);
      setOpgeslagen(r);
      setF(oud => (houdKoppeling ? { ...r, koppeling: oud.koppeling } : r));
      setVoorbeeldSleutel(n => n + 1);
      if (!stil) toast.success('Opgeslagen');
      return r;
    } catch (e) {
      toast.error(e.message || 'Opslaan mislukt');
      return null;
    } finally {
      setBezig(false);
    }
  };

  // Het voorbeeld in stap 3 (kant-en-klaar) volgt wat je aanzet: kort na een
  // wijziging stil opslaan, zodat het voorbeeld klopt.
  const voorbeeldTimer = useRef(null);
  const veldenSleutel = f ? JSON.stringify([f.velden, f.eigenVelden]) : '';
  useEffect(() => {
    if (stap !== 2 || !f || f.modus !== 'kant_en_klaar' || !opgeslagen) return undefined;
    if (JSON.stringify([opgeslagen.velden, opgeslagen.eigenVelden]) === veldenSleutel) return undefined;
    const geldig = f.eigenVelden.every(v => v.naam?.trim()
      && (v.soort !== 'keuze' || (v.opties || []).filter(o => o.trim()).length >= 2));
    if (!geldig) return undefined;
    clearTimeout(voorbeeldTimer.current);
    voorbeeldTimer.current = setTimeout(() => { bewaar(f); }, 900);
    return () => clearTimeout(voorbeeldTimer.current);
  }, [veldenSleutel, stap]); // eslint-disable-line react-hooks/exhaustive-deps

  if (weergave === 'uitleg') return <WebsiteformulierUitleg onTerug={() => setWeergave('formulier')} />;

  if (laden) return <div className="card card-p" style={{ textAlign: 'center', color: 'var(--dl)' }}>Laden…</div>;
  if (fout || !f) {
    return (
      <div className="card card-p">
        {fout || 'Je account staat op alleen-lezen. Kies een abonnement om een websiteformulier aan te maken.'}
      </div>
    );
  }

  const ja = f.modus === 'koppelen';

  const eigenFout = f.eigenVelden.some(v => !v.naam?.trim())
    ? 'Geef elk eigen veld een naam.'
    : f.eigenVelden.some(v => v.soort === 'keuze' && (v.opties || []).filter(o => o.trim()).length < 2)
      ? 'Een keuzeveld heeft minstens twee opties nodig.'
      : f.koppeling.some(k => k.doel === 'eigen' && k.veld?.trim() && !k.naam?.trim())
        ? 'Geef elk eigen veld een naam.'
        : '';
  const emailGekoppeld = f.koppeling.some(k => k.doel === 'email' && k.veld?.trim());

  // ── Stap 2: adres opslaan, en bij "Ja" meteen de velden ophalen ───────────
  const zoekFormulier = async url => {
    try {
      return { url, formulieren: await leesVeldenVanSite(url) };
    } catch (e) {
      // Alleen het adres van de site ingevuld? Kijk ook op de bekende plekken.
      const u = new URL(url);
      if (u.pathname === '/' || u.pathname === '') {
        for (const pad of VAAK_FORMULIER) {
          const probeer = `${u.origin}/${pad}`;
          try {
            const formulieren = await leesVeldenVanSite(probeer);
            if (formulieren.length) return { url: probeer, formulieren };
          } catch { /* volgende proberen */ }
        }
      }
      throw e;
    }
  };

  const adresVolgende = async () => {
    setAdresFout('');
    const url = naarPaginaUrl(adres);
    if (!url) {
      setAdresFout('Dit is geen webadres. Typ bijvoorbeeld mijnbedrijf.nl.');
      return;
    }
    const host = new URL(url).hostname;
    const bossbase = isBossBasePagina(url);
    if (bossbase && !ja) {
      setAdresFout('Vul het adres van je eigen website in.');
      return;
    }
    const { domeinen: erbij } = naarDomeinen(host);
    const domeinen = bossbase ? f.domeinen : [...new Set([...f.domeinen, ...erbij])];
    if (!ja) {
      if (await bewaar({ ...f, domeinen })) setStap(2);
      return;
    }
    setZoeken(true);
    try {
      const r = await bewaar({ ...f, domeinen, paginaUrl: url }, { houdKoppeling: true });
      if (!r) return;
      const { url: gevondenOp, formulieren } = await zoekFormulier(url);
      if (!formulieren.length) throw new Error('Op deze pagina staat geen formulier dat we kunnen lezen.');
      // Het formulier met de meeste velden is bijna altijd het contactformulier
      // (niet het zoekveld of de nieuwsbrief).
      const form = [...formulieren].sort((a, b) => b.velden.length - a.velden.length)[0];
      const koppeling = form.velden.map(v => ({ veld: v.naam, doel: stelDoelVoor(v), label: v.label }));
      setF(oud => ({ ...oud, paginaUrl: gevondenOp, koppeling }));
      setAdres(gevondenOp.replace(/^https:\/\//, ''));
      setStap(2);
    } catch (e) {
      setAdresFout(e.message);
    } finally {
      setZoeken(false);
    }
  };

  // ── Stap 3: velden ────────────────────────────────────────────────────────
  const zetEigen = (i, velden) => zet('eigenVelden', f.eigenVelden.map((v, j) => (j === i ? { ...v, ...velden } : v)));
  const zetKoppel = (i, velden) => zet('koppeling', f.koppeling.map((k, j) => (j === i ? { ...k, ...velden } : k)));

  const veldenVolgende = async () => {
    if (eigenFout) { toast.error(eigenFout); return; }
    if (ja && !emailGekoppeld) { toast.error('Kies bij welk veld het e-mailadres hoort.'); return; }
    if (await bewaar(f)) setStap(3);
  };

  // ── Stap 5: testen ────────────────────────────────────────────────────────
  const test = async () => {
    setTestBezig(true);
    setTestDeal(undefined);
    try {
      const velden = opgeslagen.modus === 'koppelen' ? opgeslagen.koppeling.map(k => k.doel) : opgeslagen.velden;
      // Voorbeeldwaarden voor de eigen velden, zodat ook die in de test zitten.
      const eigen = {};
      if (opgeslagen.modus === 'koppelen') {
        for (const k of opgeslagen.koppeling) if (k.doel === 'eigen') eigen[k.veld] = 'Test';
      } else {
        for (const v of opgeslagen.eigenVelden) {
          eigen[v.id] = v.soort === 'getal' ? '12' : v.soort === 'keuze' ? v.opties[0]
            : v.soort === 'janee' ? 'ja' : v.soort === 'datum' ? new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10) : 'Test';
        }
      }
      setTestDeal(await verstuurTestaanvraag(f.token, velden, eigen));
    } catch (e) {
      toast.error(e.message);
    } finally {
      setTestBezig(false);
    }
  };

  const afronden = async () => {
    if (await bewaar({ ...f, actief: true })) {
      setStap('klaar');
      toast.success('Je websiteformulier staat aan');
    }
  };

  // ── Meer instellingen ─────────────────────────────────────────────────────
  const voegDomeinenToe = () => {
    const { domeinen, fouten } = naarDomeinen(domeinInvoer);
    if (fouten.length) { toast.error(`Geen geldig webadres: ${fouten.join(', ')}`); return; }
    if (domeinen.some(d => /(^|\.)bossbase\.nl(:\d+)?$/i.test(new URL(d).host))) {
      toast.error('Vul het adres van je eigen website in.');
      return;
    }
    zet('domeinen', [...new Set([...f.domeinen, ...domeinen])]);
    setDomeinInvoer('');
  };

  const code = insluitcode(f.token, f.modus);
  const voorbeeldSrc = `${import.meta.env.DEV ? '/aanvraagformulier.html' : '/aanvraagformulier'}?f=${encodeURIComponent(f.token)}&voorbeeld=1`;
  const kleur = company?.brandingColor || company?.raw?.branding_color || '#1DDB62';
  const websites = [...new Set(f.domeinen.map(d => d.replace(/^https?:\/\/(www\.)?/, '')))];
  const uitlegKnop = (
    <button type="button" className="bb-info" aria-label="Uitleg stap voor stap" title="Uitleg stap voor stap"
      onClick={() => setWeergave('uitleg')} data-rl="wf-uitleg">
      <Info size={14} />
    </button>
  );

  // ═══ Eindscherm ═══════════════════════════════════════════════════════════
  if (stap === 'klaar') {
    const veldNamen = ja
      ? f.koppeling.filter(k => k.doel && k.veld).map(k => (k.doel === 'eigen' ? k.naam : BOSSBASE_VELDEN.find(v => v.key === k.doel)?.label)).filter(Boolean)
      : BOSSBASE_VELDEN.filter(v => v.vast || f.velden.includes(v.key)).map(v => v.label);
    return (
      <div className="card card-p afu3" data-rl="set-websiteformulier">
        <Rondleiding pagina="websiteformulier" />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ ...vraag, fontSize: '1.2rem' }}>
              {opgeslagen.actief
                ? <><Check size={20} color="var(--pd)" /> Je websiteformulier staat aan</>
                : 'Je websiteformulier staat uit'}
              {uitlegKnop}
            </h2>
            <p style={{ ...zin, marginBottom: 12 }}>Aanvragen van je website komen als project in de eerste fase van je pipeline.</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-s btn-sm" onClick={() => { setSiteSoort(''); setStap(3); }}><Code size={14} /> Code bekijken</button>
            <button type="button" className="btn btn-p btn-sm" onClick={() => setStap(0)} data-rl="wf-aanpassen"><Pencil size={14} /> Aanpassen</button>
          </div>
        </div>

        <div style={{ marginBottom: 6 }}>
          <Regel label="Manier">{ja ? 'Gekoppeld aan je eigen formulier' : 'Kant-en-klaar formulier'}</Regel>
          <Regel label="Website">{websites.join(', ') || 'Nog geen'}</Regel>
          {ja && f.paginaUrl && <Regel label="Pagina">{f.paginaUrl.replace(/^https?:\/\//, '')}</Regel>}
          <Regel label="Velden">{veldNamen.join(', ')}</Regel>
          {!ja && f.eigenVelden.length > 0 && <Regel label="Eigen velden">{f.eigenVelden.map(v => v.naam).join(', ')}</Regel>}
        </div>

        <div data-rl="wf-meer" style={{ marginTop: 14 }}>
          <button type="button" onClick={() => setMeerOpen(o => !o)}
            style={{ border: 0, background: 'none', padding: 0, font: 'inherit', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
            {meerOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />} Meer instellingen
          </button>
          {meerOpen && (
            <div style={{ marginTop: 12, display: 'grid', gap: 18 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
                <input type="checkbox" style={{ accentColor: 'var(--p)' }} checked={f.actief} onChange={e => zet('actief', e.target.checked)} />
                Aanvragen ontvangen
              </label>

              <div>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, display: 'flex', gap: 6, alignItems: 'center' }}>
                  Websites
                  <InfoTip tekst="Alleen van deze adressen nemen we aanvragen aan. Met en zonder www tellen apart; Toevoegen zet ze er allebei in." />
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  {f.domeinen.map(d => (
                    <span key={d} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 6px 4px 10px', borderRadius: 'var(--r999)', background: 'var(--bgx)', fontSize: 12.5 }}>
                      {d}
                      <button type="button" aria-label={`${d} verwijderen`} onClick={() => zet('domeinen', f.domeinen.filter(x => x !== d))}
                        style={{ border: 0, background: 'transparent', cursor: 'pointer', padding: 2, display: 'flex', color: 'var(--dmu)' }}>
                        <Trash2 size={12} />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="f" style={{ display: 'flex', flexDirection: 'row', gap: 8 }}>
                  <input value={domeinInvoer} onChange={e => setDomeinInvoer(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); voegDomeinenToe(); } }}
                    placeholder="nog een website, bijv. mijnwebshop.nl" aria-label="Website toevoegen" style={{ flex: 1 }} />
                  <button type="button" className="btn btn-s" onClick={voegDomeinenToe} disabled={!domeinInvoer.trim()}>Toevoegen</button>
                </div>
              </div>

              {!ja && (
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Kleur</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                    <span style={{ width: 22, height: 22, borderRadius: 6, background: kleur, border: '1px solid var(--br)' }} />
                    De kleur van je bedrijf.
                    {naarBedrijfsprofiel && (
                      <button type="button" className="btn btn-s btn-sm" onClick={naarBedrijfsprofiel}>Wijzigen in Bedrijfsprofiel</button>
                    )}
                  </div>
                </div>
              )}

              {!ja && (
                <div className="f">
                  <label>Link naar je privacyverklaring <span style={{ fontWeight: 400, color: 'var(--dl)' }}>(optioneel)</span></label>
                  <input value={f.privacyUrl} onChange={e => zet('privacyUrl', e.target.value)} placeholder="https://mijnbedrijf.nl/privacy" />
                </div>
              )}

              {!ja && (
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, display: 'flex', gap: 6, alignItems: 'center' }}>
                    Link naar het formulier
                    <InfoTip tekst="Voor Wix en andere sitebouwers die alleen een webadres kunnen insluiten." />
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <code style={{ fontSize: 12, background: 'var(--bgx)', padding: '6px 8px', borderRadius: 'var(--r6)', wordBreak: 'break-all' }}>{formulierLink(f.token)}</code>
                    <KopieerKnop tekst={formulierLink(f.token)} label="Link kopiëren" />
                  </div>
                </div>
              )}

              <div>
                <button type="button" className="btn btn-s btn-sm" onClick={() => setWeergave('uitleg')}><Info size={14} /> Uitleg stap voor stap</button>
              </div>

              <div className="fa" style={{ marginTop: 0 }}>
                <button className="btn btn-p" onClick={() => bewaar(f, { stil: false })} disabled={bezig || !gewijzigd}>
                  {bezig ? 'Opslaan…' : gewijzigd ? 'Opslaan' : 'Opgeslagen'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ═══ De wizard ════════════════════════════════════════════════════════════
  const volgende = {
    0: { label: 'Volgende', actie: async () => { if (await bewaar(f)) setStap(1); }, uit: false },
    1: { label: zoeken ? 'Zoeken…' : 'Volgende', actie: adresVolgende, uit: !adres.trim() || zoeken },
    2: { label: 'Volgende', actie: veldenVolgende, uit: !!eigenFout || (ja && !emailGekoppeld) },
    3: { label: 'Volgende', actie: () => setStap(4), uit: !siteSoort || (siteSoort === 'wix' && ja) },
    4: { label: 'Klaar', actie: afronden, uit: false },
  }[stap];

  return (
    <div className="card card-p afu3" data-rl="set-websiteformulier" style={{ maxWidth: stap === 2 && !ja ? 980 : 720 }}>
      <Rondleiding pagina="websiteformulier" />

      {/* Voortgang */}
      <div data-rl="wf-stappen" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 22, flexWrap: 'wrap' }}>
        {STAPPEN.map((s, i) => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              width: 22, height: 22, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, fontWeight: 700,
              background: i < stap ? 'var(--p)' : i === stap ? 'var(--dk)' : 'var(--bgx)', color: i <= stap ? '#fff' : 'var(--dmu)',
            }}>{i < stap ? <Check size={12} /> : i + 1}</span>
            <span style={{ fontSize: 12.5, fontWeight: i === stap ? 700 : 500, color: i === stap ? 'var(--dk)' : 'var(--dmu)' }}>{s}</span>
            {i < STAPPEN.length - 1 && <span style={{ width: 18, height: 1, background: 'var(--br)' }} />}
          </div>
        ))}
        <span style={{ marginLeft: 'auto' }}>{uitlegKnop}</span>
      </div>

      {/* ── 1. Formulier ── */}
      {stap === 0 && (
        <>
          <h2 style={vraag}>Heb je al een contactformulier op je website?</h2>
          <p style={zin}>Aanvragen komen daarna vanzelf in je pipeline.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <button type="button" style={keuzeStijl(ja)} onClick={() => zet('modus', 'koppelen')} aria-pressed={ja}>
              <strong style={{ fontSize: 15 }}>Ja</strong>
              <span style={hint}>We koppelen je bestaande formulier.</span>
            </button>
            <button type="button" style={keuzeStijl(!ja)} onClick={() => zet('modus', 'kant_en_klaar')} aria-pressed={!ja}>
              <strong style={{ fontSize: 15 }}>Nee</strong>
              <span style={hint}>Je krijgt een kant-en-klaar formulier.</span>
            </button>
          </div>
        </>
      )}

      {/* ── 2. Website ── */}
      {stap === 1 && (
        <>
          <h2 style={vraag}>
            Wat is het adres van je website?
            <InfoTip tekst={ja
              ? 'Staat je formulier op een aparte pagina, vul dan het adres van die pagina in. Zonder https:// of www mag ook.'
              : 'Zonder https:// of www mag ook. Heb je meer websites, voeg die later toe onder Meer instellingen.'} />
          </h2>
          <p style={zin}>{ja ? 'We zoeken je formulier op en lezen de velden.' : 'Alleen vanaf dit adres nemen we aanvragen aan.'}</p>
          <div className="f">
            <input
              autoFocus
              value={adres}
              onChange={e => { setAdres(e.target.value); setAdresFout(''); }}
              onKeyDown={e => { if (e.key === 'Enter' && !volgende.uit) volgende.actie(); }}
              placeholder={ja ? 'mijnbedrijf.nl/contact' : 'mijnbedrijf.nl'}
              aria-label="Adres van je website"
              style={{ fontSize: 15, padding: '11px 12px' }}
            />
          </div>
          {adresFout && (
            <div style={{ marginTop: 10 }}>
              <div style={waarschuwing}>{adresFout}</div>
              {ja && (
                <button type="button" className="btn btn-s btn-sm" style={{ marginTop: 8 }}
                  onClick={() => { setAdresFout(''); if (!f.koppeling.length) zet('koppeling', [{ veld: '', doel: 'email' }]); setStap(2); }}>
                  Zelf de velden invullen
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* ── 3. Velden (kant-en-klaar) ── */}
      {stap === 2 && !ja && (
        <>
          <h2 style={vraag}>Welke velden komen in je formulier?</h2>
          <p style={zin}>Naam, e-mail en omschrijving staan er altijd in.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, alignItems: 'start' }}>
            <div>
              {OPTIONELE_VELDEN.map(v => (
                <label key={v.key} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, padding: '6px 0', cursor: 'pointer' }}>
                  <input type="checkbox" style={{ accentColor: 'var(--p)', width: 16, height: 16 }} checked={f.velden.includes(v.key)}
                    onChange={e => zet('velden', e.target.checked ? [...f.velden, v.key] : f.velden.filter(x => x !== v.key))} />
                  {v.label}
                </label>
              ))}

              <div style={{ fontWeight: 600, fontSize: 13.5, margin: '18px 0 8px', display: 'flex', gap: 6, alignItems: 'center' }}>
                Eigen velden
                <InfoTip tekst='Vraag wat jij wilt weten, zoals "Soort dak" of "Oppervlakte in m²". Bij een keuze typ je de opties met komma ertussen.' />
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                {f.eigenVelden.map((v, i) => (
                  <div key={v.id} style={{ border: '1px solid var(--br)', borderRadius: 'var(--r8)', padding: 10, display: 'grid', gap: 8 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 130px auto', gap: 8 }}>
                      <input value={v.naam} onChange={e => zetEigen(i, { naam: e.target.value })} placeholder="Naam, bijv. Soort dak" aria-label="Naam van het veld" maxLength={80} />
                      <select value={v.soort} onChange={e => zetEigen(i, { soort: e.target.value })} aria-label="Soort veld">
                        {EIGEN_SOORTEN.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                      </select>
                      <button type="button" className="btn btn-s btn-sm" aria-label="Veld verwijderen" onClick={() => zet('eigenVelden', f.eigenVelden.filter((_, j) => j !== i))}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                    {v.soort === 'keuze' && (
                      <input value={(v.opties || []).join(', ')} onChange={e => zetEigen(i, { opties: e.target.value.split(',').map(o => o.trimStart()) })}
                        placeholder="Plat, Schuin, Weet ik niet" aria-label="Opties" />
                    )}
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                      <input type="checkbox" style={{ accentColor: 'var(--p)' }} checked={!!v.verplicht} onChange={e => zetEigen(i, { verplicht: e.target.checked })} />
                      Verplicht
                    </label>
                  </div>
                ))}
                <div>
                  <button type="button" className="btn btn-s btn-sm" onClick={() => zet('eigenVelden', [...f.eigenVelden, nieuwEigenVeld()])} disabled={f.eigenVelden.length >= 20}>
                    <Plus size={14} /> Eigen veld
                  </button>
                </div>
                {eigenFout && <div style={waarschuwing}>{eigenFout}</div>}
              </div>
            </div>
            <div>
              <div style={{ ...hint, marginBottom: 6 }}>Zo ziet het eruit</div>
              <iframe key={voorbeeldSleutel} title="Voorbeeld van het formulier" src={voorbeeldSrc}
                style={{ width: '100%', height: 560, border: '1px solid var(--br)', borderRadius: 'var(--r10)', background: 'var(--bgs)' }} />
            </div>
          </div>
        </>
      )}

      {/* ── 3. Velden (koppelen) ── */}
      {stap === 2 && ja && (
        <>
          <h2 style={vraag}>
            Waar komt elk veld in BossBase?
            <InfoTip tekst='Past een veld nergens bij, kies dan Eigen veld en geef het een naam. Velden op "Niet gebruiken" gaan niet naar BossBase.' />
          </h2>
          <p style={zin}>We hebben al een voorstel ingevuld. Kijk het even na.</p>
          <div style={{ display: 'grid', gap: 8 }}>
            {f.koppeling.map((k, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) auto', gap: 10, alignItems: 'start', padding: '8px 0', borderTop: i ? '1px solid var(--border)' : 0 }}>
                <div className="f" style={{ margin: 0 }}>
                  {k.label
                    ? <div style={{ fontSize: 14, fontWeight: 600, paddingTop: 8 }}>{k.label}<div style={{ ...hint, fontSize: 11.5, fontWeight: 400 }}>{k.veld}</div></div>
                    : <input value={k.veld} onChange={e => zetKoppel(i, { veld: e.target.value })} placeholder="Veldnaam, bijv. your-email" aria-label="Veld in jouw formulier" />}
                </div>
                <div className="f" style={{ margin: 0 }}>
                  <select value={k.doel} aria-label="Komt in BossBase bij"
                    onChange={e => zetKoppel(i, { doel: e.target.value, naam: e.target.value === 'eigen' ? (k.naam || k.label || k.veld) : k.naam })}>
                    <option value="">Niet gebruiken</option>
                    {BOSSBASE_VELDEN.map(v => <option key={v.key} value={v.key}>{v.label}</option>)}
                    <option value="eigen">Eigen veld…</option>
                  </select>
                  {k.doel === 'eigen' && (
                    <input style={{ marginTop: 6 }} value={k.naam ?? ''} onChange={e => zetKoppel(i, { naam: e.target.value })}
                      placeholder="Naam in BossBase" aria-label="Naam van het eigen veld" maxLength={80} />
                  )}
                </div>
                <button type="button" className="btn btn-s btn-sm" aria-label="Regel verwijderen" onClick={() => zet('koppeling', f.koppeling.filter((_, j) => j !== i))}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" className="btn btn-s btn-sm" onClick={() => zet('koppeling', [...f.koppeling, { veld: '', doel: '' }])}>
              <Plus size={14} /> Veld toevoegen
            </button>
            <InfoUitklap id="wf-veldnaam" label="Een veld zelf toevoegen" tekst="Vul de naam van het veld in, het name-attribuut uit de code van je formulier. Bij Contact Form 7 is dat bijvoorbeeld your-name, bij Elementor form_fields[name]." />
          </div>
          {!emailGekoppeld && <div style={{ ...waarschuwing, marginTop: 10 }}>Kies bij welk veld het e-mailadres hoort.</div>}
          {eigenFout && <div style={{ ...waarschuwing, marginTop: 6 }}>{eigenFout}</div>}
        </>
      )}

      {/* ── 4. Code ── */}
      {stap === 3 && (
        <>
          <h2 style={vraag}>Op welke soort website zet je het?</h2>
          <p style={zin}>Dan laten we zien hoe je de code plakt.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 10 }}>
            {[['wordpress', 'WordPress'], ['wix', 'Wix'], ['anders', 'Anders']].map(([k, l]) => (
              <button key={k} type="button" style={{ ...keuzeStijl(siteSoort === k), alignItems: 'center', padding: '12px' }} onClick={() => setSiteSoort(k)} aria-pressed={siteSoort === k}>
                <strong style={{ fontSize: 14 }}>{l}</strong>
              </button>
            ))}
          </div>

          {siteSoort === 'wix' && ja && (
            <div style={{ marginTop: 18 }}>
              <p style={{ ...zin, marginBottom: 10 }}>Wix laat geen koppeling met een eigen formulier toe. Gebruik daar het kant-en-klare formulier.</p>
              <button type="button" className="btn btn-p btn-sm"
                onClick={async () => { if (await bewaar({ ...f, modus: 'kant_en_klaar' })) setStap(2); }}>
                Kant-en-klaar formulier gebruiken
              </button>
            </div>
          )}

          {siteSoort && !(siteSoort === 'wix' && ja) && (() => {
            const plakLink = siteSoort === 'wix';
            const tekst = plakLink ? formulierLink(f.token) : code;
            return (
              <div style={{ marginTop: 18 }} data-rl="wf-code">
                <pre style={{ background: '#0f172a', color: '#e2e8f0', padding: '12px 14px', borderRadius: 'var(--r8)', fontSize: 12.5, whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>{tekst}</pre>
                <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <KopieerKnop tekst={tekst} label={plakLink ? 'Link kopiëren' : 'Code kopiëren'} />
                  <InfoTip tekst="Er staat geen geheime sleutel in. Je kunt hem gerust doorsturen naar wie je website bouwt." />
                </div>
                <ol style={{ margin: '16px 0 0', paddingLeft: 20, fontSize: 14, lineHeight: 1.8 }}>
                  {PLAATSEN[siteSoort][f.modus].map(t => <li key={t}>{t}</li>)}
                </ol>
              </div>
            );
          })()}
        </>
      )}

      {/* ── 5. Testen ── */}
      {stap === 4 && (
        <>
          <h2 style={vraag}>Test het</h2>
          <p style={zin}>Stuur een testaanvraag. Hij staat meteen in je pipeline.</p>
          <div data-rl="wf-test" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-p" onClick={test} disabled={testBezig}>
              <Send size={14} /> {testBezig ? 'Versturen…' : 'Testaanvraag versturen'}
            </button>
            {testDeal !== undefined && (
              <span style={{ fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Check size={16} color="var(--pd)" /> Gelukt.
                {testDeal && openDeal && <button type="button" className="btn btn-s btn-sm" onClick={() => openDeal(testDeal)}>Bekijk in de pipeline</button>}
              </span>
            )}
          </div>
          <p style={{ ...hint, marginTop: 14 }}>Vul daarna ook zelf je formulier op je website in.</p>
        </>
      )}

      {/* Navigatie */}
      <div className="fa" style={{ justifyContent: 'space-between', marginTop: 26 }}>
        <div>
          {stap > 0 && (
            <button type="button" className="btn btn-s" onClick={() => setStap(stap - 1)} disabled={bezig || zoeken}>
              <ArrowLeft size={14} /> Vorige
            </button>
          )}
          {stap === 0 && isIngericht(opgeslagen) && (
            <button type="button" className="btn btn-s" onClick={() => { setF(opgeslagen); setStap('klaar'); }}>Annuleren</button>
          )}
        </div>
        <button type="button" className="btn btn-p" onClick={volgende.actie} disabled={volgende.uit || bezig}>
          {volgende.label} {stap < 4 && !zoeken && <ArrowRight size={14} />}
        </button>
      </div>
    </div>
  );
}
