import { useCallback, useEffect, useState } from 'react';
import { Check, ExternalLink, Info, X } from 'lucide-react';
import { useToast } from '../lib/toast.jsx';
import { tierLabel } from '../lib/tiers.js';
import { bevestig } from '../lib/bevestig.jsx';
import {
  PAKKETTEN, getPakket, STATUSSEN, statusInfo, upgradePrijs, perTermijn, euroBedrag,
  HOSTING_PER_MAAND, DOMEIN_PER_JAAR, EMAIL_PER_MAAND, TERMIJNEN, extrasVoor,
} from '../lib/website.js';
import {
  getMijnWebsite, maakIntakeLink, upgradeWebsite, opnieuwBetalen,
  vraagWijzigingAan, vraagDomeinAan, geefFeedback, bestelExtra, vraagEmailAan,
} from '../services/websiteService.js';
import './websitePage.css';

// ── DE PAGINA WEBSITE ─────────────────────────────────────────────────────────
// Alles over de website die wij voor de klant bouwen: wat hij krijgt, hoe ver
// we zijn, wat hij ervoor betaalt, en de knoppen om te upgraden, iets te laten
// aanpassen of een domeinnaam te regelen.
//
// Lezen via get_mijn_website(); alles wat iets verandert, mailt of afrekent
// loopt via de edge function `website` (src/services/websiteService.js).

const datum = d => d ? new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
const STAPPEN = STATUSSEN.filter(s => s.key !== 'wacht_op_intake');

const VERZOEK_STATUS = {
  nieuw:          { label: 'Ontvangen',       kleur: 'blauw' },
  in_behandeling: { label: 'In behandeling',  kleur: 'paars' },
  prijsopgave:    { label: 'Prijsopgave gestuurd', kleur: 'oranje' },
  afgerond:       { label: 'Afgerond',        kleur: 'groen' },
  afgewezen:      { label: 'Niet uitgevoerd', kleur: 'grijs' },
};

// Uitleg achter een info-icoon. Op klik, niet op hover: een tablet kent geen
// hover. Zelfde vormgeving als de modules op de abonnementspagina.
function InfoIcoon({ titel, children, links }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const sluit = e => { if (!e.target.closest?.('.ws-info')) setOpen(false); };
    const esc = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', sluit);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', sluit); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <span className={`ab-module-info ws-info${links ? ' links' : ''}`}>
      <button type="button" className="ab-info-knop" aria-label={`Uitleg: ${titel}`} aria-expanded={open}
        onClick={() => setOpen(o => !o)}>
        <Info size={15} strokeWidth={2} />
      </button>
      {open && (
        <span className="ab-uitleg" role="dialog" aria-label={titel}>
          <span className="ab-uitleg-kop">
            {titel}
            <button type="button" className="ab-uitleg-x" aria-label="Sluiten" onClick={() => setOpen(false)}><X size={13} /></button>
          </span>
          {children}
        </span>
      )}
    </span>
  );
}

// ── Voorbeeldgegevens (alleen in development) ────────────────────────────────
// /dashboard/website?voorbeeld=geen|intake|bouw|beoordeling|live toont de
// pagina in elke stand, zonder database. Nooit in productie.
function voorbeeld(stand) {
  const basis = { welkomstactie: 'gratis_website', interval: 'jaar', tier: 'groei', heeftStripe: true, magBeheren: true, betalingen: [], verzoeken: [] };
  const aanvraag = (status, extra = {}) => ({ status, pakket: 'compleet', siteUrl: null, aangevraagdOp: '2026-10-01', intakeOntvangenOp: '2026-10-03', liveOp: null, feedback: null, feedbackOp: null, domein: null, ...extra });
  switch (stand) {
    case 'geen':  return { ...basis, welkomstactie: null, heeftStripe: false, aanvraag: null };
    case 'intake': return { ...basis, aanvraag: aanvraag('wacht_op_intake', { pakket: 'basis', intakeOntvangenOp: null }) };
    case 'bouw':  return { ...basis, aanvraag: aanvraag('in_bouw'), betalingen: [{ id: 'b1', soort: 'upgrade', omschrijving: 'Website Compleet (aanmeldprijs)', pakket: 'compleet', bedrag: 299, wijze: 'abonnement', status: 'loopt', perKeer: 24.92, aantalTotaal: 12, aantalGedaan: 1 }] };
    case 'beoordeling': return { ...basis, aanvraag: aanvraag('ter_beoordeling', { siteUrl: 'https://voorbeeld.bossbase.nl', domeinViaOns: true, domein: 'voorbeeldbedrijf.nl' }) };
    case 'live':  return { ...basis, aanvraag: aanvraag('live', { siteUrl: 'https://www.voorbeeldbedrijf.nl', liveOp: '2026-10-20', feedback: 'Telefoonnummer bovenaan groter graag.', feedbackOp: '2026-10-15', domein: 'voorbeeldbedrijf.nl', domeinViaOns: true, email: true, extras: { extra_pagina: 1 } }),
      betalingen: [
        { id: 'b1', soort: 'upgrade', omschrijving: 'Website Compleet (aanmeldprijs)', pakket: 'compleet', bedrag: 299, wijze: 'ideal', status: 'betaald', betaaldOp: '2026-10-03' },
        { id: 'b2', soort: 'hosting', omschrijving: 'Website-hosting', bedrag: 5, wijze: 'abonnement', status: 'loopt', perKeer: 5, startOp: '2026-10-20' },
        { id: 'b3', soort: 'domein', omschrijving: 'Domeinnaam voorbeeldbedrijf.nl (1 jaar)', bedrag: 25, wijze: 'abonnement', status: 'loopt', perKeer: 25, intervalMaanden: 12, startOp: '2026-10-20' },
        { id: 'b4', soort: 'email', omschrijving: 'Zakelijke e-mail', bedrag: 9, wijze: 'abonnement', status: 'loopt', perKeer: 9, startOp: '2026-10-20' },
      ],
      verzoeken: [{ id: 'v1', soort: 'wijziging', omschrijving: 'Nieuwe foto bij dakgoten.', status: 'prijsopgave', createdAt: '2026-10-25' }] };
    default: return null;
  }
}

export default function WebsitePage({ setPage }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState(null);
  const [bezig, setBezig] = useState(null);

  const voorbeeldStand = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('voorbeeld') : null;

  const laad = useCallback(() => {
    if (voorbeeldStand) { setData(voorbeeld(voorbeeldStand)); setLaden(false); return; }
    getMijnWebsite()
      .then(d => { setData(d); setFout(null); })
      .catch(e => setFout(e.message || 'Laden mislukt'))
      .finally(() => setLaden(false));
  }, [voorbeeldStand]);
  useEffect(laad, [laad]);

  // Terug van iDEAL (Stripe Checkout).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const b = q.get('betaling');
    if (!b) return;
    if (b === 'gelukt') toast.success('Betaling ontvangen. Dank je wel!');
    else toast.error('De betaling is niet afgerond. Je kunt het hieronder opnieuw proberen.');
    q.delete('betaling');
    try { window.history.replaceState({}, '', window.location.pathname + (q.toString() ? `?${q}` : '')); } catch { /* niet blokkerend */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Eén plek voor elke actie: bezig-stand, foutmelding, opnieuw laden.
  const doe = async (sleutel, fn, gelukt) => {
    if (voorbeeldStand) { toast.success('Voorbeeld: er is niets verstuurd.'); return null; }
    setBezig(sleutel);
    try {
      const r = await fn();
      if (r?.checkoutUrl) { window.location.href = r.checkoutUrl; return r; }
      if (gelukt) toast.success(gelukt);
      laad();
      return r;
    } catch (e) {
      toast.error(e.message || 'Er ging iets mis');
      return null;
    } finally {
      setBezig(null);
    }
  };

  const startIntake = async () => {
    const r = await doe('intake', maakIntakeLink);
    // Altijd op dit domein openen: de link uit de functie wijst naar productie.
    if (r?.url) window.location.assign(new URL(r.url).pathname);
  };

  if (laden) return <div className="ws-page"><div className="ab-laden">Even kijken…</div></div>;
  if (fout) return <div className="ws-page"><div className="card card-p">{fout}</div></div>;

  const aanvraag = data?.aanvraag || null;
  const heeftWebsite = aanvraag && aanvraag.status !== 'wacht_op_intake' && aanvraag.status !== 'geannuleerd';

  return (
    <div className="ws-page">
      {heeftWebsite
        ? <MijnWebsite data={data} bezig={bezig} doe={doe} />
        : <GeenWebsite data={data} bezig={bezig} startIntake={startIntake} setPage={setPage} />}
    </div>
  );
}

// ── Nog geen website ─────────────────────────────────────────────────────────
function GeenWebsite({ data, bezig, startIntake, setPage }) {
  const aanvraag = data?.aanvraag;
  const magIntake = aanvraag?.status === 'wacht_op_intake' || (!aanvraag && data?.welkomstactie === 'gratis_website');
  // Een website kiezen kan alleen bij een nieuw jaarabonnement (welkomstactie).
  const kanNogKiezen = !data?.heeftStripe;

  return (
    <>
      <div className="card ws-hero afu" data-rl="website-start">
        <div className="ws-hero-tekst">
          <div className="ws-bovenkop">{magIntake ? 'Je gratis website' : 'Gratis bij je jaarabonnement'}</div>
          <h2>{magIntake ? 'Vertel ons wat er op je site moet' : 'Een professionele website voor je bedrijf'}</h2>
          <p>
            {magIntake
              ? 'Vul de intake in: je bedrijfsgegevens, je diensten, je werk en je foto’s. Ongeveer een half uur. Wij bouwen de site en schrijven de teksten.'
              : `Kies je bij een jaarabonnement (${tierLabel('groei')} of ${tierLabel('team')}) voor de welkomstactie website, dan bouwen wij gratis een onepager voor je bedrijf.`}
          </p>
          <div className="ws-hero-knoppen">
            {magIntake ? (
              <button className="btn btn-p" onClick={startIntake} disabled={bezig === 'intake'}>
                {bezig === 'intake' ? 'Link maken…' : 'Intake invullen'}
              </button>
            ) : kanNogKiezen ? (
              <button className="btn btn-p" onClick={() => setPage?.('abonnement')}>Kies een jaarabonnement</button>
            ) : (
              <a className="btn btn-s" href="mailto:info@bossbase.nl?subject=Website">Mail ons over een website</a>
            )}
          </div>
          {!magIntake && !kanNogKiezen && (
            <p className="ab-hint">De gratis website is een welkomstactie bij een nieuw jaarabonnement. Wil je toch een website van ons, mail ons dan.</p>
          )}
        </div>
      </div>

      <div className="ws-kop afu2">Zo werkt het</div>
      <ol className="ws-stappen afu2">
        {[
          ['Intake', 'Je vult in wat er op je site moet. Wat we al van je weten staat er alvast in.'],
          ['Bouwen', 'Wij bouwen je site en schrijven de teksten. Je ziet hier hoe ver we zijn.'],
          ['Beoordelen', 'Je krijgt een link en geeft je wijzigingen één keer door.'],
          ['Live', 'Je site gaat online. Vanaf dan loopt de hosting.'],
        ].map(([kop, tekst], i) => (
          <li key={kop} className="card"><span className="ws-nr">{i + 1}</span><strong>{kop}</strong><span>{tekst}</span></li>
        ))}
      </ol>

      {/* Alleen wat je krijgt. Prijzen van upgrades en hosting horen niet bij
          het aanbod; die zie je in de intake, waar je kiest. */}
      <div className="ws-kop afu3">Wat je krijgt</div>
      <div className="card card-p afu3">
        <ul className="ws-punten ws-punten-los">
          {getPakket('basis').punten.map(t => <li key={t}><Check size={13} strokeWidth={2.6} /> {t}</li>)}
        </ul>
      </div>
    </>
  );
}

// ── De pakketten ─────────────────────────────────────────────────────────────
// moment 'aanmelding': aanmeldprijs met de latere prijs doorgestreept.
// moment 'later': de prijs voor later upgraden, met een knop.
function PakketKaarten({ moment, huidig, onUpgrade, magUpgraden, bezig }) {
  const iHuidig = PAKKETTEN.findIndex(p => p.key === huidig);
  return (
    <div className="ws-pakketten afu3" data-rl={moment === 'later' ? 'website-upgraden' : undefined}>
      {PAKKETTEN.map((p, i) => {
        const isHuidig = p.key === huidig && moment === 'later';
        const lager = moment === 'later' && i < iHuidig;
        const prijs = moment === 'later' ? upgradePrijs(huidig, p.key, false) : p.aanmeldPrijs;
        return (
          <div key={p.key} className={`card ws-pakket${isHuidig ? ' huidig' : ''}${lager ? ' lager' : ''}`}>
            <div className="ws-pakket-kop">
              <span className="ws-pakket-naam">{p.label}</span>
              {isHuidig && <span className="ws-merk">Je hebt dit</span>}
              {!isHuidig && p.aanbevolen && moment !== 'later' && <span className="ws-merk groen">Meest gekozen</span>}
            </div>
            <div className="ws-pakket-omvang">{p.omvang}</div>
            {/* Vaste opbouw: prijs, lijst, knop. Zo zijn de kaarten even hoog en
                staan de knoppen op één lijn, ook als Basis minder tekst heeft. */}
            <div className="ws-prijsblok">
              <div className="ws-pakket-prijs">
                {moment === 'later' ? (
                  isHuidig || lager ? <span className="ws-prijs-rust">{isHuidig ? 'Huidig pakket' : 'Inbegrepen'}</span>
                    : <><strong>{euroBedrag(prijs)}</strong><span> eenmalig</span></>
                ) : p.aanmeldPrijs === 0 ? (
                  <strong>Gratis</strong>
                ) : (
                  <><s>{euroBedrag(p.laterPrijs)}</s> <strong>{euroBedrag(p.aanmeldPrijs)}</strong></>
                )}
              </div>
              <div className="ws-pakket-sub">
                {moment === 'later'
                  ? (!isHuidig && !lager && huidig !== 'basis' ? `Verschil met ${getPakket(huidig).label}` : '\u00a0')
                  : (p.aanmeldPrijs === 0 ? 'bij je jaarabonnement' : 'alleen bij je aanmelding')}
              </div>
            </div>
            <ul className="ws-punten">
              {p.erft && <li className="ws-erft">Alles van {getPakket(p.erft).label}, plus:</li>}
              {p.punten.map(t => <li key={t}><Check size={13} strokeWidth={2.6} /> {t}</li>)}
            </ul>
            {moment === 'later' && (
              !isHuidig && !lager
                ? <button className="btn btn-p ws-pakket-knop" disabled={!magUpgraden || !!bezig} onClick={() => onUpgrade(p.key, prijs)}>
                    Upgraden naar {p.label}
                  </button>
                : <span className="btn btn-s ws-pakket-knop ws-knop-rust" aria-hidden="true">{isHuidig ? 'Je huidige pakket' : 'Zit in je pakket'}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Er is een website ────────────────────────────────────────────────────────
function MijnWebsite({ data, bezig, doe }) {
  const a = data.aanvraag;
  const pakket = getPakket(a.pakket);
  const s = statusInfo(a.status);
  const stapIndex = STAPPEN.findIndex(x => x.key === a.status);
  const betalingen = data.betalingen || [];
  const openBetaling = betalingen.find(b => (b.wijze === 'ideal' || b.wijze === 'termijnen') && b.status === 'open');

  return (
    <>
      {/* ── Status ── */}
      <div className="card card-p ws-status afu" data-rl="website-status">
        <div className="ws-status-kop">
          <div>
            <div className="ab-kop">Status</div>
            <div className="ws-status-label">{s.label}</div>
            <div className="ws-status-uitleg">{s.uitleg}</div>
          </div>
          {a.siteUrl && (
            <a className="btn btn-p" href={a.siteUrl} target="_blank" rel="noreferrer">
              {a.status === 'live' ? 'Bekijk je site' : 'Bekijk de testversie'} <ExternalLink size={14} />
            </a>
          )}
        </div>
        <ol className="ws-voortgang" aria-label="Voortgang">
          {STAPPEN.map((st, i) => (
            <li key={st.key} className={i < stapIndex ? 'klaar' : i === stapIndex ? 'nu' : ''}>
              <span className="ws-bol">{i < stapIndex ? <Check size={12} strokeWidth={3} /> : i + 1}</span>
              <span>{st.label}</span>
            </li>
          ))}
        </ol>
        <div className="ws-feiten">
          <div><span>Pakket</span><strong>{pakket.label}</strong><em>{pakket.omvang}</em></div>
          {a.siteUrl && <div><span>Adres</span><strong><a href={a.siteUrl} target="_blank" rel="noreferrer">{a.siteUrl.replace(/^https?:\/\//, '')}</a></strong></div>}
          {a.liveOp && <div><span>Live sinds</span><strong>{datum(a.liveOp)}</strong></div>}
          {!a.liveOp && a.intakeOntvangenOp && <div><span>Intake ontvangen</span><strong>{datum(a.intakeOntvangenOp)}</strong></div>}
        </div>
        <Doorlopend a={a} betalingen={betalingen} />
      </div>

      {openBetaling && (
        <div className="ws-melding afu">
          <div><strong>{openBetaling.omschrijving}</strong> is nog niet betaald ({euroBedrag(openBetaling.bedrag)} excl. btw).</div>
          {data.magBeheren
            ? <button className="btn btn-p btn-sm" disabled={!!bezig} onClick={() => doe('betaal', () => opnieuwBetalen(openBetaling.id))}>{bezig === 'betaal' ? 'Bezig…' : 'Nu betalen'}</button>
            : <span className="ab-hint">De eigenaar van je bedrijf kan dit afronden.</span>}
        </div>
      )}

      {a.status === 'ter_beoordeling' && <Feedback a={a} bezig={bezig} doe={doe} />}
      {a.feedback && a.status !== 'ter_beoordeling' && (
        <div className="card card-p afu2">
          <div className="ab-kop">Je wijzigingen uit de beoordelingsronde</div>
          <p className="ws-citaat">{a.feedback}</p>
          <p className="ab-hint">Doorgegeven op {datum(a.feedbackOp)}.</p>
        </div>
      )}

      <WatJeBetaalt betalingen={betalingen} />

      <div className="ws-kop afu3">
        Upgraden
        <InfoIcoon titel="Upgraden" links>Meer pagina’s voor je site. Je betaalt in één keer, of verspreid over {TERMIJNEN} maanden. Na je upgrade nemen we contact op over de inhoud van de nieuwe pagina’s.</InfoIcoon>
      </div>
      {a.pakket === 'pro'
        ? <p className="ab-hint afu3">Je hebt het grootste pakket. Meer nodig? Vraag hieronder een uitbreiding aan.</p>
        : <Upgraden a={a} data={data} bezig={bezig} doe={doe} />}

      <Extras a={a} data={data} bezig={bezig} doe={doe} />

      <Wijzigingen a={a} verzoeken={(data.verzoeken || []).filter(v => v.soort === 'wijziging' || v.soort === 'uitbreiding')} bezig={bezig} doe={doe} />
      <Domein a={a} betalingen={betalingen} verzoeken={(data.verzoeken || []).filter(v => v.soort === 'domein')}
        emailVerzoeken={(data.verzoeken || []).filter(v => v.soort === 'email')} bezig={bezig} doe={doe} />
    </>
  );
}

function Feedback({ a, bezig, doe }) {
  const [tekst, setTekst] = useState('');
  if (a.feedback) {
    return (
      <div className="card card-p afu2" data-rl="website-feedback">
        <div className="ab-kop">Je wijzigingen</div>
        <p className="ws-citaat">{a.feedback}</p>
        <p className="ab-hint">Doorgegeven op {datum(a.feedbackOp)}. We verwerken ze en zetten je site daarna live.</p>
      </div>
    );
  }
  const verstuur = async () => {
    const ok = await bevestig({ titel: 'Wijzigingen versturen?', tekst: 'Je geeft je wijzigingen één keer door. Staat alles erin?', knop: 'Versturen' });
    if (ok) doe('feedback', () => geefFeedback(tekst), 'Doorgegeven. We gaan ermee aan de slag.');
  };
  return (
    <div className="card card-p ws-feedback afu2" data-rl="website-feedback">
      <div className="ab-kop">Je site beoordelen</div>
      <p className="ws-tekst">
        Bekijk de testversie rustig, ook op je telefoon. Zet hieronder <strong>alles wat anders moet</strong> in één bericht.
        Je geeft je wijzigingen één keer door; daarna verwerken we ze en gaat je site live.
      </p>
      <div className="f">
        <label htmlFor="ws-feedback">Wat moet er anders?</label>
        <textarea id="ws-feedback" rows={6} value={tekst} onChange={e => setTekst(e.target.value)}
          placeholder={'Bijvoorbeeld:\n- Telefoonnummer bovenaan groter\n- Foto bij dakgoten vervangen\n- Tekst over ons: “sinds 2009” in plaats van 2010'} />
      </div>
      <div className="ws-acties">
        <button className="btn btn-p" disabled={tekst.trim().length < 2 || !!bezig} onClick={verstuur}>
          {bezig === 'feedback' ? 'Bezig…' : 'Wijzigingen versturen'}
        </button>
      </div>
    </div>
  );
}

// Doorlopende kosten: klein, één regel per onderdeel, onderaan het statusblok.
// Hosting altijd; domein en e-mail alleen als die gekozen zijn.
function Doorlopend({ a, betalingen }) {
  const loopt = soort => betalingen.find(b => b.soort === soort && b.status === 'loopt');
  const wanneer = regel => (regel ? `loopt sinds ${datum(regel.startOp)}` : 'gaat in bij livegang');
  const hosting = loopt('hosting');
  const domein = loopt('domein');
  const email = loopt('email');
  const adressen = Number(a.emailAantal) || (a.email ? 1 : 0);
  const regels = [
    { key: 'hosting', tekst: `Hosting ${euroBedrag(hosting?.perKeer ?? HOSTING_PER_MAAND)} per maand, ${wanneer(hosting)} en komt op je BossBase-factuur`,
      uitleg: 'Wij zetten je site online en houden hem draaiend: beveiligd slotje en updates. Hosting hoort bij de website en is niet los te kiezen. De dagen tussen livegang en je eerstvolgende factuur rekenen we niet.' },
    (domein || a.domeinViaOns) && { key: 'domein', tekst: `Domeinnaam${a.domein ? ` ${a.domein}` : ''} ${euroBedrag(domein?.perKeer ?? DOMEIN_PER_JAAR)} per jaar, ${wanneer(domein)} en komt op je BossBase-factuur`,
      uitleg: 'Wij registreren je domeinnaam en houden hem bij. Eén keer per jaar op je factuur. Zeg je op, dan zetten we hem op verzoek kosteloos naar je over.' },
    (email || adressen > 0) && { key: 'email', tekst: `Zakelijke e-mail (${adressen} ${adressen === 1 ? 'adres' : 'adressen'}) ${euroBedrag(email?.perKeer ?? EMAIL_PER_MAAND * adressen)} per maand, ${wanneer(email)} en komt op je BossBase-factuur`,
      uitleg: `${euroBedrag(EMAIL_PER_MAAND)} per adres per maand. Wij richten de adressen in op je eigen domeinnaam. Meer adressen vraag je hieronder aan bij Zakelijke e-mail.` },
  ].filter(Boolean);
  return (
    <ul className="ws-doorlopend" data-rl="website-kosten">
      {regels.map(r => (
        <li key={r.key}>
          <span>{r.tekst}</span>
          <InfoIcoon titel={r.key === 'hosting' ? 'Hosting' : r.key === 'domein' ? 'Domeinnaam' : 'Zakelijke e-mail'} links>{r.uitleg} Bedragen excl. btw.</InfoIcoon>
        </li>
      ))}
    </ul>
  );
}

// Betalingen voor een upgrade of extra: in één keer of in termijnen. Geen
// betalingen, geen blok.
function WatJeBetaalt({ betalingen }) {
  const eenmaligSoort = b => b.soort === 'upgrade' || b.soort === 'extra';
  const termijnen = betalingen.filter(b => eenmaligSoort(b) && (b.wijze === 'termijnen' || b.wijze === 'abonnement') && b.status === 'loopt');
  const eenmalig = betalingen.filter(b => eenmaligSoort(b) && b.wijze === 'ideal' && b.status === 'betaald');
  if (!termijnen.length && !eenmalig.length) return null;

  return (
    <div className="card card-p ws-kosten afu3">
      <div className="ab-kop">
        Betalingen voor je website
        <InfoIcoon titel="Betalingen" links>Wat je betaalde voor je pakket en extra’s. Termijnen worden elke maand automatisch betaald en stoppen vanzelf na de laatste. Bedragen excl. btw.</InfoIcoon>
      </div>
      {termijnen.map(b => (
        <div className="ws-regel" key={b.id}>
          <span>{b.omschrijving}</span>
          <strong>{euroBedrag(b.perKeer ?? perTermijn(b.bedrag))} p/mnd <em>{b.aantalGedaan || 0} van {b.aantalTotaal} betaald</em></strong>
        </div>
      ))}
      {eenmalig.map(b => (
        <div className="ws-regel" key={b.id}>
          <span>{b.omschrijving}</span>
          <strong>{euroBedrag(b.bedrag)} <em>betaald</em></strong>
        </div>
      ))}
    </div>
  );
}

function Upgraden({ a, data, bezig, doe }) {
  const [keuze, setKeuze] = useState(null); // { pakket, prijs }
  const [wijze, setWijze] = useState('ideal');

  const reken = async () => {
    const naar = getPakket(keuze.pakket);
    const ok = await bevestig({
      titel: `Upgraden naar ${naar.label}?`,
      tekst: wijze === 'ideal'
        ? `Je betaalt ${euroBedrag(keuze.prijs)} excl. btw in één keer.`
        : `Je betaalt ${TERMIJNEN} maanden ${euroBedrag(perTermijn(keuze.prijs))} excl. btw, samen ${euroBedrag(keuze.prijs)}. De eerste termijn betaal je nu.`,
      knop: wijze === 'ideal' ? 'Naar betalen' : 'Upgraden',
    });
    if (!ok) return;
    const r = await doe('upgrade', () => upgradeWebsite({ pakket: keuze.pakket, wijze }),
      wijze === 'termijnen' ? `Je website is geüpgraded naar ${naar.label}. We nemen contact op over de nieuwe pagina’s.` : null);
    if (r && !r.checkoutUrl) setKeuze(null);
  };

  return (
    <>
      <PakketKaarten moment="later" huidig={a.pakket} magUpgraden={data.magBeheren} bezig={bezig}
        onUpgrade={(pakket, prijs) => { setKeuze({ pakket, prijs }); setWijze('ideal'); }} />
      {!data.magBeheren && <p className="ab-hint afu3">Upgraden doet de eigenaar van je bedrijf.</p>}
      {keuze && (
        <div className="card card-p ws-afrekenen afu">
          <div className="ab-kop">Upgraden naar {getPakket(keuze.pakket).label} · {euroBedrag(keuze.prijs)} excl. btw</div>
          <div className="ws-keuzes" role="radiogroup" aria-label="Hoe wil je betalen?">
            <label className={`ws-keuze${wijze === 'ideal' ? ' on' : ''}`}>
              <input type="radio" name="ws-wijze" checked={wijze === 'ideal'} onChange={() => setWijze('ideal')} />
              <span><strong>In één keer</strong><em>{euroBedrag(keuze.prijs)}, met iDEAL, creditcard of anders</em></span>
            </label>
            <label className={`ws-keuze${wijze === 'termijnen' ? ' on' : ''}`}>
              <input type="radio" name="ws-wijze" checked={wijze === 'termijnen'} onChange={() => setWijze('termijnen')} />
              <span><strong>Verspreid over {TERMIJNEN} maanden</strong><em>{euroBedrag(perTermijn(keuze.prijs))} p/mnd, stopt vanzelf na {TERMIJNEN} keer</em></span>
            </label>
          </div>
          <div className="ws-acties">
            <button className="btn btn-ghost" onClick={() => setKeuze(null)} disabled={!!bezig}>Annuleren</button>
            <button className="btn btn-p" onClick={reken} disabled={!!bezig}>
              {bezig === 'upgrade' ? 'Bezig…' : wijze === 'ideal' ? `Afrekenen · ${euroBedrag(keuze.prijs)}` : 'Upgraden'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Wijzigingen({ a, verzoeken, bezig, doe }) {
  const [soort, setSoort] = useState('wijziging');
  const [tekst, setTekst] = useState('');
  const live = a.status === 'live';

  const verstuur = async () => {
    const r = await doe('verzoek', () => vraagWijzigingAan({ soort, omschrijving: tekst }), 'Aanvraag verstuurd. Je krijgt eerst een prijsopgave.');
    if (r) setTekst('');
  };

  return (
    <div className="card card-p ws-wijzigen afu3" data-rl="website-wijzigen">
      <div className="ab-kop">Wijziging of uitbreiding aanvragen</div>
      <div className="ws-betaald">
        <strong>Dit is betaald werk.</strong> Kleine wijzigingen en uitbreidingen rekenen we apart. Je krijgt eerst een prijsopgave; we beginnen pas als jij akkoord geeft.
      </div>
      {!live ? (
        <p className="ab-hint">Aanvragen kan zodra je site live staat. Tot die tijd geef je wijzigingen door in de beoordelingsronde.</p>
      ) : (
        <>
          <div className="ws-soorten" role="radiogroup" aria-label="Soort aanvraag">
            {[
              ['wijziging', 'Wijziging', 'Iets aanpassen wat er al staat: een tekst, een foto, een telefoonnummer, openingstijden.'],
              ['uitbreiding', 'Uitbreiding', 'Iets nieuws erbij: een extra pagina, een nieuwe dienst, een nieuw onderdeel.'],
            ].map(([k, label, uitleg]) => (
              <label key={k} className={`ws-keuze klein${soort === k ? ' on' : ''}`}>
                <input type="radio" name="ws-soort" checked={soort === k} onChange={() => setSoort(k)} />
                <span><strong>{label}</strong></span>
                <InfoIcoon titel={label}>{uitleg}</InfoIcoon>
              </label>
            ))}
          </div>
          <div className="f">
            <label htmlFor="ws-verzoek">Wat wil je laten doen?</label>
            <textarea id="ws-verzoek" rows={4} value={tekst} onChange={e => setTekst(e.target.value)}
              placeholder="Beschrijf zo precies mogelijk wat er moet veranderen, en op welke pagina." />
          </div>
          <div className="ws-acties">
            <button className="btn btn-p" disabled={tekst.trim().length < 5 || !!bezig} onClick={verstuur}>
              {bezig === 'verzoek' ? 'Bezig…' : 'Prijsopgave aanvragen'}
            </button>
          </div>
        </>
      )}
      {verzoeken.length > 0 && (
        <ul className="ws-verzoeken">
          {verzoeken.map(v => {
            const st = VERZOEK_STATUS[v.status] || { label: v.status, kleur: 'grijs' };
            return (
              <li key={v.id}>
                <div><strong>{v.soort === 'uitbreiding' ? 'Uitbreiding' : 'Wijziging'}</strong> · {datum(v.createdAt)}<p>{v.omschrijving}</p></div>
                <span className={`ws-pil ${st.kleur}`}>{st.label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Domein({ a, betalingen, verzoeken, emailVerzoeken = [], bezig, doe }) {
  const [naam, setNaam] = useState('');
  const actief = betalingen.find(b => b.soort === 'domein' && b.status === 'loopt');
  const open = verzoeken.find(v => ['nieuw', 'in_behandeling', 'prijsopgave'].includes(v.status));

  const vraag = async () => {
    const r = await doe('domein', () => vraagDomeinAan(naam), 'Aangevraagd. We laten je weten of de naam vrij is.');
    if (r) setNaam('');
  };

  return (
    <div className="card card-p ws-domein afu3" data-rl="website-domein">
      <div className="ab-kop">
        Domeinnaam via ons
        <InfoIcoon titel="Domeinnaam via ons" links>Wij registreren je domeinnaam en houden hem bij. Dat kost {euroBedrag(DOMEIN_PER_JAAR)} per jaar, als regel op je abonnement. Er zit geen gratis domein bij. Heb je al een domeinnaam, dan hoef je hier niets te doen: die koppelen we bij de bouw.</InfoIcoon>
      </div>
      {actief ? (
        <p className="ws-tekst"><strong>{a.domein || 'Je domeinnaam'}</strong> staat bij ons geregistreerd · {euroBedrag(actief.perKeer)} per jaar.</p>
      ) : a.domeinViaOns ? (
        <p className="ws-tekst">Gekozen in je intake: <strong>{a.domein}</strong> · {euroBedrag(DOMEIN_PER_JAAR)} per jaar, vanaf livegang.</p>
      ) : open ? (
        <p className="ws-tekst">{open.omschrijving}. Status: <strong>{(VERZOEK_STATUS[open.status] || {}).label || open.status}</strong>.</p>
      ) : (
        <div className="ws-domein-rij">
          <div className="f">
            <label htmlFor="ws-domein">Welke domeinnaam wil je?</label>
            <input id="ws-domein" value={naam} onChange={e => setNaam(e.target.value)} placeholder="jouwbedrijf.nl" />
          </div>
          <button className="btn btn-s" disabled={!naam.includes('.') || !!bezig} onClick={vraag}>
            {bezig === 'domein' ? 'Bezig…' : `Aanvragen · ${euroBedrag(DOMEIN_PER_JAAR)} per jaar`}
          </button>
        </div>
      )}
      {(actief || open || a.domeinViaOns) && <Email a={a} betalingen={betalingen} verzoeken={emailVerzoeken} bezig={bezig} doe={doe} />}
    </div>
  );
}

// Zakelijke e-mail bieden we alleen aan bij een domeinnaam via ons. Per adres
// € 9 per maand; meer adressen aanvragen kan altijd.
function Email({ a, betalingen, verzoeken, bezig, doe }) {
  const [adressen, setAdressen] = useState('');
  const [aantal, setAantal] = useState(1);
  const loopt = betalingen.find(b => b.soort === 'email' && b.status === 'loopt');
  const open = verzoeken.find(v => ['nieuw', 'in_behandeling', 'prijsopgave'].includes(v.status));
  const heeft = Number(a.emailAantal) || (a.email ? 1 : 0);
  const vraag = async () => {
    const r = await doe('email', () => vraagEmailAan({ aantal, adres: adressen }), 'Aangevraagd. We richten je e-mail in.');
    if (r) { setAdressen(''); setAantal(1); }
  };
  return (
    <div className="ws-email">
      <div className="ab-kop">
        Zakelijke e-mail
        <InfoIcoon titel="Zakelijke e-mail" links>E-mailadressen op je eigen domeinnaam, zoals info@jouwbedrijf.nl. Wij richten ze in. {euroBedrag(EMAIL_PER_MAAND)} per adres per maand, als regel op je abonnement.</InfoIcoon>
      </div>
      {heeft > 0 && (
        <p className="ws-tekst">
          Je hebt {heeft} {heeft === 1 ? 'adres' : 'adressen'} bij ons · {euroBedrag(EMAIL_PER_MAAND * heeft)} per maand{loopt ? '' : ', vanaf livegang'}.
        </p>
      )}
      {open ? (
        <p className="ws-tekst">{open.omschrijving}. Status: <strong>{(VERZOEK_STATUS[open.status] || {}).label || open.status}</strong>.</p>
      ) : (
        <div className="ws-domein-rij">
          <div className="f">
            <label htmlFor="ws-email">{heeft > 0 ? 'Meer adressen nodig? Welke?' : 'Welke adressen wil je?'}</label>
            <input id="ws-email" value={adressen} onChange={e => setAdressen(e.target.value)} placeholder="info@jouwbedrijf.nl, jan@jouwbedrijf.nl" />
          </div>
          <div className="ab-teller" role="group" aria-label="Aantal adressen">
            <button className="btn btn-s btn-sm" disabled={aantal <= 1} onClick={() => setAantal(n => n - 1)} aria-label="Minder">−</button>
            <span className="ab-teller-waarde">{aantal} {aantal === 1 ? 'adres' : 'adressen'}</span>
            <button className="btn btn-s btn-sm" disabled={aantal >= 10} onClick={() => setAantal(n => n + 1)} aria-label="Meer">+</button>
          </div>
          <button className="btn btn-s" disabled={!!bezig} onClick={vraag}>
            {bezig === 'email' ? 'Bezig…' : `Aanvragen · ${euroBedrag(EMAIL_PER_MAAND * aantal)} p/mnd`}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Extra's later bestellen ──────────────────────────────────────────────────
// Tegen de latere prijs; bij de aanmelding (intake) waren ze goedkoper.
function Extras({ a, data, bezig, doe }) {
  const [keuze, setKeuze] = useState(null); // { extra, aantal }
  const [wijze, setWijze] = useState('ideal');
  const lijst = extrasVoor(a.pakket).filter(e => !e.alleenBijAanmelding);
  if (!lijst.length) return null;
  const heb = e => !e.perStuk && Number(a.extras?.[e.key] || 0) > 0;
  const prijs = keuze ? keuze.extra.laterPrijs * keuze.aantal : 0;

  const reken = async () => {
    const ok = await bevestig({
      titel: `${keuze.extra.label} bestellen?`,
      tekst: wijze === 'ideal'
        ? `Je betaalt ${euroBedrag(prijs)} excl. btw in één keer.`
        : `Je betaalt ${TERMIJNEN} maanden ${euroBedrag(perTermijn(prijs))} excl. btw, samen ${euroBedrag(prijs)}. De eerste termijn betaal je nu.`,
      knop: wijze === 'ideal' ? 'Naar betalen' : 'Bestellen',
    });
    if (!ok) return;
    const r = await doe('extra', () => bestelExtra({ extra: keuze.extra.key, aantal: keuze.aantal, wijze }),
      wijze === 'termijnen' ? 'Besteld. We nemen contact op als we iets van je nodig hebben.' : null);
    if (r && !r.checkoutUrl) setKeuze(null);
  };

  return (
    <>
      <div className="ws-kop afu3" data-rl="website-extras">
        Extra's
        <InfoIcoon titel="Extra's" links>Losse onderdelen voor je site. Bij je aanmelding waren ze goedkoper; dit zijn de prijzen voor later. Betalen met iDEAL of verspreid over {TERMIJNEN} maanden.</InfoIcoon>
      </div>
      <div className="ws-extras afu3">
        {lijst.map(e => (
          <div key={e.key} className={`card ws-extra${heb(e) ? ' heb' : ''}`}>
            <div className="ws-extra-kop"><strong>{e.label}</strong><span>{euroBedrag(e.laterPrijs)}{e.perStuk ? ' per stuk' : ''}</span></div>
            <p>{e.uitleg}</p>
            {heb(e)
              ? <span className="ab-hint">Heb je al.</span>
              : <button className="btn btn-s btn-sm" disabled={!data.magBeheren || !!bezig}
                  onClick={() => { setKeuze({ extra: e, aantal: 1 }); setWijze('ideal'); }}>Bestellen</button>}
          </div>
        ))}
      </div>
      {!data.magBeheren && <p className="ab-hint afu3">Bestellen doet de eigenaar van je bedrijf.</p>}
      {keuze && (
        <div className="card card-p ws-afrekenen afu">
          <div className="ab-kop">{keuze.extra.label} · {euroBedrag(prijs)} excl. btw</div>
          {keuze.extra.perStuk && (
            <div className="ab-teller" style={{ marginBottom: 10 }}>
              <button className="btn btn-s btn-sm" disabled={keuze.aantal <= 1} onClick={() => setKeuze(k => ({ ...k, aantal: k.aantal - 1 }))} aria-label="Minder">−</button>
              <span className="ab-teller-waarde">{keuze.aantal} {keuze.aantal === 1 ? 'stuk' : 'stuks'}</span>
              <button className="btn btn-s btn-sm" disabled={keuze.aantal >= (keuze.extra.maximum || 10)} onClick={() => setKeuze(k => ({ ...k, aantal: k.aantal + 1 }))} aria-label="Meer">+</button>
            </div>
          )}
          <div className="ws-keuzes" role="radiogroup" aria-label="Hoe wil je betalen?">
            <label className={`ws-keuze${wijze === 'ideal' ? ' on' : ''}`}>
              <input type="radio" name="ws-extra-wijze" checked={wijze === 'ideal'} onChange={() => setWijze('ideal')} />
              <span><strong>In één keer</strong><em>{euroBedrag(prijs)}, met iDEAL, creditcard of anders</em></span>
            </label>
            <label className={`ws-keuze${wijze === 'termijnen' ? ' on' : ''}`}>
              <input type="radio" name="ws-extra-wijze" checked={wijze === 'termijnen'} onChange={() => setWijze('termijnen')} />
              <span><strong>Verspreid over {TERMIJNEN} maanden</strong><em>{euroBedrag(perTermijn(prijs))} p/mnd, stopt vanzelf na {TERMIJNEN} keer</em></span>
            </label>
          </div>
          <div className="ws-acties">
            <button className="btn btn-ghost" onClick={() => setKeuze(null)} disabled={!!bezig}>Annuleren</button>
            <button className="btn btn-p" onClick={reken} disabled={!!bezig}>
              {bezig === 'extra' ? 'Bezig…' : wijze === 'ideal' ? `Afrekenen · ${euroBedrag(prijs)}` : 'Bestellen'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

