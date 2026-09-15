import { useEffect, useRef, useState } from 'react';
import { Bug, Lightbulb, MessageSquarePlus, ImagePlus, X, Gift, CheckCircle2 } from 'lucide-react';
import { ModalX } from '../bb-shared.jsx';
import { useToast } from '../lib/toast.jsx';
import {
  getMeldactie, verstuurMelding, verkleinAfbeelding, SCREENSHOT_TYPES,
} from '../services/meldpuntService.js';

// Het meldpunt in de bovenbalk: een knop die altijd zichtbaar is en een
// formulier voor bugs en ideeën.
//
// De actie met prijzen staat los van de meldfunctie. Of hij loopt komt uit
// platform_instellingen (super-admin portaal → Meldingen); staat hij uit, dan
// verdwijnt alleen de tekst over de prijzen.

const SOORTEN = [
  {
    key: 'bug', label: 'Bug', Icon: Bug,
    uitleg: 'Iets werkt niet zoals het hoort',
    placeholder: 'Wat deed je, wat verwachtte je, en wat gebeurde er in plaats daarvan?',
  },
  {
    key: 'idee', label: 'Idee', Icon: Lightbulb,
    uitleg: 'Iets wat BossBase beter zou maken',
    placeholder: 'Wat zou je willen kunnen, en waarom helpt het je?',
  },
];

export function MeldKnop({ pagina }) {
  const [open, setOpen] = useState(false);
  const [prijzen, setPrijzen] = useState(null);

  // Bij het laden én bij elke keer openen: zet iemand de actie uit, dan hoort
  // de volgende die het formulier opent dat meteen te zien, zonder te herladen.
  const laadActie = () => { getMeldactie().then(setPrijzen).catch(() => setPrijzen(null)); };
  useEffect(laadActie, []);

  const titel = prijzen
    ? `Bug gevonden of een idee? Meld het en maak kans op ${prijzen[0].charAt(0).toLowerCase()}${prijzen[0].slice(1)}`
    : 'Bug gevonden of een idee? Laat het ons weten';

  return (
    <>
      <button
        className="tb-meld"
        title={titel}
        aria-label="Bug of idee melden"
        onClick={() => { laadActie(); setOpen(true); }}
      >
        <MessageSquarePlus size={16} strokeWidth={2.2} />
        <span className="tb-meld-tekst">Bug of idee?</span>
        {prijzen && <Gift size={14} strokeWidth={2.2} className="tb-meld-gift" aria-hidden="true" />}
      </button>
      {open && <MeldModal pagina={pagina} prijzen={prijzen} onClose={() => setOpen(false)} />}
    </>
  );
}

function MeldModal({ pagina, prijzen, onClose }) {
  const toast = useToast();
  const [soort, setSoort] = useState('bug');
  const [omschrijving, setOmschrijving] = useState('');
  const [shot, setShot] = useState(null);         // { file, url }
  const [shotFout, setShotFout] = useState('');
  const [bezig, setBezig] = useState(false);
  const [klaar, setKlaar] = useState(null);       // { nummer, bevestigd, actie }
  const fileRef = useRef(null);
  const tekstRef = useRef(null);

  const huidig = SOORTEN.find(s => s.key === soort);
  const genoeg = omschrijving.trim().length >= 5;

  useEffect(() => { tekstRef.current?.focus(); }, []);

  // Esc sluit, behalve tijdens het versturen.
  useEffect(() => {
    const esc = e => { if (e.key === 'Escape' && !bezig) onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [bezig, onClose]);

  // Voorbeeld-URL opruimen als de afbeelding wisselt of het venster sluit.
  useEffect(() => () => { if (shot?.url) URL.revokeObjectURL(shot.url); }, [shot]);

  const kiesAfbeelding = async file => {
    setShotFout('');
    if (!file) return;
    if (!SCREENSHOT_TYPES.includes(file.type)) {
      setShotFout('Alleen PNG, JPG of WebP.');
      return;
    }
    try {
      const klein = await verkleinAfbeelding(file);
      if (klein.size > 5 * 1024 * 1024) { setShotFout('Deze afbeelding is te groot (max. 5 MB).'); return; }
      setShot({ file: klein, url: URL.createObjectURL(klein) });
    } catch {
      setShotFout('Deze afbeelding kon niet worden gelezen.');
    }
  };

  // Plakken met Ctrl/Cmd+V: de snelste manier om een schermafbeelding mee te
  // sturen. Alleen als er echt een afbeelding op het klembord staat; gewone
  // tekst plakt gewoon in het tekstveld.
  const onPaste = e => {
    const item = [...(e.clipboardData?.items || [])].find(i => i.kind === 'file' && i.type.startsWith('image/'));
    if (!item) return;
    e.preventDefault();
    kiesAfbeelding(item.getAsFile());
  };

  const verstuur = async () => {
    if (!genoeg || bezig) return;
    setBezig(true);
    try {
      const res = await verstuurMelding({ soort, omschrijving: omschrijving.trim(), screenshot: shot?.file, pagina });
      setKlaar(res);
    } catch (e) {
      toast.error(e.message || 'Versturen mislukt');
    } finally {
      setBezig(false);
    }
  };

  const opnieuw = () => {
    setKlaar(null); setOmschrijving(''); setShot(null); setShotFout('');
    requestAnimationFrame(() => tekstRef.current?.focus());
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && !bezig && onClose()}>
      <div className="modal meld-modal" onPaste={klaar ? undefined : onPaste} role="dialog" aria-modal="true" aria-labelledby="meld-titel">
        {klaar ? (
          <div className="meld-klaar">
            <CheckCircle2 size={44} strokeWidth={1.8} className="meld-klaar-icoon" />
            <div className="modal-title" id="meld-titel">Bedankt, je melding is binnen</div>
            <p className="meld-klaar-tekst">
              We hebben hem ontvangen onder nummer <strong>{klaar.nummer}</strong>.
              {klaar.bevestigd ? ' Je krijgt ook een bevestiging per mail.' : ''}
              {' '}We nemen contact op als we iets van je nodig hebben.
            </p>
            {klaar.actie && (
              <p className="meld-klaar-actie"><Gift size={15} /> Je doet mee aan de actie. Succes!</p>
            )}
            <div className="fa" style={{ justifyContent: 'center' }}>
              <button className="btn btn-ghost" onClick={opnieuw}>Nog iets melden</button>
              <button className="btn btn-p" onClick={onClose}>Sluiten</button>
            </div>
          </div>
        ) : (
          <>
            <div className="modal-hd">
              <div>
                <div className="modal-title" id="meld-titel">Bug of idee melden</div>
                <div className="modal-sub">Loop je ergens tegenaan, of mis je iets? Wij lezen alles.</div>
              </div>
              <ModalX onClose={() => !bezig && onClose()} />
            </div>

            {prijzen && (
              <div className="meld-actie">
                <Gift size={18} className="meld-actie-icoon" />
                <div>
                  <div className="meld-actie-kop">Wie een melding doet, maakt kans op:</div>
                  <ul>{prijzen.map(p => <li key={p}>{p}</li>)}</ul>
                  <p className="meld-voorwaarden">
                    Deelname staat open voor gebruikers van BossBase.<br />
                    Winnaars worden door ons gekozen uit de ingezonden meldingen en krijgen persoonlijk bericht.<br />
                    Over de uitslag kan niet worden gecorrespondeerd.
                  </p>
                </div>
              </div>
            )}

            <div className="meld-soort" role="radiogroup" aria-label="Soort melding">
              {SOORTEN.map(({ key, label, Icon, uitleg }) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={soort === key}
                  className={soort === key ? 'actief' : ''}
                  onClick={() => setSoort(key)}
                >
                  <Icon size={18} />
                  <span>
                    <strong>{label}</strong>
                    <small>{uitleg}</small>
                  </span>
                </button>
              ))}
            </div>

            <div className="f" style={{ marginTop: 14 }}>
              <label htmlFor="meld-omschrijving">Omschrijving</label>
              <textarea
                id="meld-omschrijving"
                ref={tekstRef}
                rows={5}
                maxLength={5000}
                value={omschrijving}
                placeholder={huidig.placeholder}
                onChange={e => setOmschrijving(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) verstuur(); }}
              />
            </div>

            <div className="f" style={{ marginTop: 14 }}>
              <label>Schermafbeelding <span className="meld-optioneel">optioneel</span></label>
              {shot ? (
                <div className="meld-shot">
                  <img src={shot.url} alt="Voorbeeld van de schermafbeelding" />
                  <button type="button" className="meld-shot-weg" onClick={() => setShot(null)} aria-label="Schermafbeelding verwijderen">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button type="button" className="meld-shot-kies" onClick={() => fileRef.current?.click()}>
                  <ImagePlus size={17} />
                  <span>Kies een afbeelding <small>of plak er een met {/Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl'}+V</small></span>
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept={SCREENSHOT_TYPES.join(',')}
                hidden
                onChange={e => { kiesAfbeelding(e.target.files?.[0]); e.target.value = ''; }}
              />
              {shotFout && <div className="meld-fout">{shotFout}</div>}
            </div>

            <p className="meld-context">
              We sturen automatisch mee: je bedrijf, je naam, deze pagina, je abonnement en je browser.
              Dan hoeven we dat niet na te vragen.
            </p>

            <div className="fa">
              <button className="btn btn-ghost" onClick={onClose} disabled={bezig}>Annuleren</button>
              <button className="btn btn-p" onClick={verstuur} disabled={!genoeg || bezig}>
                {bezig ? 'Versturen…' : 'Melding versturen'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
