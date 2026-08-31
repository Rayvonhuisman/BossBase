// Gedeelde velden voor een urenregel.
//
// De uurregel wordt op vier plekken ingevuld (werkbon, urenpagina,
// urenherinnering, project). Als elk scherm zijn eigen pauzeveldje tekent, lopen
// ze binnen een maand uit elkaar — vandaar deze bouwstenen.
//
// Ze zijn gemaakt voor iemand met handschoenen aan op een dak: zo min mogelijk
// tikken, en niets tonen wat er niet toe doet.

import { useEffect, useRef, useState } from 'react';
import { berekenUren } from '../services/urenService.js';

// ── Pauze ───────────────────────────────────────────────────────────────────
// Een knoppenrij en geen invoerveld: pauze is in de praktijk 0, 15, 30 of 60
// minuten, en dat is één tik in plaats van een getal typen op een telefoon.
// Alles daarbuiten kan achter "anders".
const PAUZE_KEUZES = [0, 15, 30, 60];

export function PauzeKnoppen({ waarde = 0, onChange, disabled = false }) {
  const staatInRij = PAUZE_KEUZES.includes(Number(waarde));
  const [anders, setAnders] = useState(!staatInRij && Number(waarde) > 0);

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {PAUZE_KEUZES.map(m => {
          const actief = !anders && Number(waarde) === m;
          return (
            <button
              key={m}
              type="button"
              disabled={disabled}
              onClick={() => { setAnders(false); onChange(m); }}
              style={{
                flex: '1 1 0', minWidth: 52, padding: '7px 4px', borderRadius: 'var(--r8)',
                border: `1px solid ${actief ? 'var(--p)' : 'var(--bstrong)'}`,
                background: actief ? 'var(--p)' : '#fff',
                color: actief ? 'var(--dk)' : 'var(--dm)',
                fontWeight: actief ? 700 : 600, fontSize: '.82rem',
                cursor: disabled ? 'default' : 'pointer',
              }}
            >
              {m === 0 ? 'geen' : `${m}`}
            </button>
          );
        })}
        <button
          type="button"
          disabled={disabled}
          onClick={() => { setAnders(true); }}
          style={{
            flex: '1 1 0', minWidth: 52, padding: '7px 4px', borderRadius: 'var(--r8)',
            border: `1px solid ${anders ? 'var(--p)' : 'var(--bstrong)'}`,
            background: anders ? 'var(--p)' : '#fff',
            color: anders ? 'var(--dk)' : 'var(--dm)',
            fontWeight: anders ? 700 : 600, fontSize: '.82rem',
            cursor: disabled ? 'default' : 'pointer',
          }}
        >
          anders
        </button>
      </div>
      {anders && (
        <input
          type="number"
          min="0"
          step="5"
          inputMode="numeric"
          autoFocus
          disabled={disabled}
          value={waarde || ''}
          onChange={e => onChange(Math.max(0, Number(e.target.value) || 0))}
          placeholder="minuten"
          style={{ width: '100%', marginTop: 6 }}
        />
      )}
    </div>
  );
}

// ── Tijden ──────────────────────────────────────────────────────────────────
/**
 * Rondt een HH:MM-tijd af op vijf minuten. Niemand boekt 14:37, en op een
 * telefoon is de laatste minuut raden het meeste werk.
 */
export function rondAfOpVijf(tijd) {
  if (!tijd) return tijd;
  const [h, m] = String(tijd).split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return tijd;
  const totaal = Math.round((h * 60 + m) / 5) * 5;
  const uu = Math.floor(totaal / 60) % 24;
  const mm = totaal % 60;
  return `${String(uu).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// ── Live totaal ─────────────────────────────────────────────────────────────
// Toont wat er wordt opgeslagen, mét de pauze eraf. Dat is meteen de beste
// uitleg van de nieuwe rekenregel: je ziet 8,00 naar 7,50 springen zodra je op
// 30 tikt.
export function UrenTotaal({ start, eind, pauze = 0, className }) {
  const totaal = berekenUren(start, eind, pauze);
  if (start && eind && totaal == null) {
    // Twee verschillende fouten uit elkaar houden: een eindtijd vóór de starttijd
    // is iets anders dan een pauze die de hele dag opeet, en de monteur moet
    // weten welk veld hij moet aanpassen.
    const eindVoorStart = berekenUren(start, eind, 0) == null;
    return (
      <div className={className} style={{ fontSize: '.8rem', color: '#b91c1c' }}>
        {eindVoorStart
          ? 'Eindtijd moet na de starttijd liggen.'
          : `Na ${pauze} minuten pauze blijft er geen tijd over.`}
      </div>
    );
  }
  if (totaal == null) return null;
  // Geen eigen kleur opdringen: de component staat zowel op een donkere kaart
  // (werkbon) als op wit (urenpagina). De bijzin erft de kleur en wordt alleen
  // gedempt, zodat hij op beide achtergronden leesbaar blijft.
  return (
    <span className={className} style={className ? undefined : { fontSize: '.9rem', fontWeight: 700 }}>
      {totaal.toFixed(2).replace('.', ',')} uur
      {Number(pauze) > 0 && (
        <span className="uren-bijzin" style={{ marginLeft: 8 }}>
          {pauze} min pauze eraf
        </span>
      )}
    </span>
  );
}

// ── Km en opmerking ─────────────────────────────────────────────────────────
// Ingeklapt: de meeste regels hebben geen van beide, en een monteur die drie
// tikken nodig heeft moet er geen zes doen.
export function ExtraVelden({
  km, onKm, opmerking, onOpmerking, disabled = false, inputClassName, open: openInitieel = false,
}) {
  const heeftInhoud = (km !== '' && km != null) || !!opmerking;
  const [open, setOpen] = useState(openInitieel || heeftInhoud);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        style={{
          // currentColor en geen kleurtoken: dit blok staat zowel op de donkere
          // werkbonkaart als op een witte pagina. var(--pd) was donkergroen op
          // bijna-zwart — net leesbaar, en dat is niet goed genoeg voor een knop.
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          color: 'currentColor', opacity: .9, textDecoration: 'underline',
          fontWeight: 600, fontSize: '.8rem', textAlign: 'left',
        }}
      >
        + Kilometers of opmerking
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div>
        <div style={{ fontSize: '.74rem', fontWeight: 600, opacity: .7, marginBottom: 3 }}>
          Gereden kilometers <span style={{ fontWeight: 400 }}>(optioneel)</span>
        </div>
        <input
          type="number"
          min="0"
          step="1"
          inputMode="numeric"
          className={inputClassName}
          value={km ?? ''}
          onChange={e => onKm(e.target.value)}
          placeholder="bijv. 24"
          disabled={disabled}
          style={inputClassName ? undefined : { width: '100%' }}
        />
      </div>
      <div>
        <div style={{ fontSize: '.74rem', fontWeight: 600, opacity: .7, marginBottom: 3 }}>
          Opmerking <span style={{ fontWeight: 400 }}>(optioneel)</span>
        </div>
        <input
          type="text"
          className={inputClassName}
          value={opmerking ?? ''}
          onChange={e => onOpmerking(e.target.value)}
          placeholder="Bijvoorbeeld: extra tijd door vastzittende bouten"
          disabled={disabled}
          style={inputClassName ? undefined : { width: '100%' }}
        />
      </div>
    </div>
  );
}

// ── Keuzelijst ──────────────────────────────────────────────────────────────
// Verhuisd uit UrenPageV2 toen de werkbon hetzelfde urenformulier kreeg. Het
// native <select> ziet er per besturingssysteem anders uit; dit niet, en dat is
// precies waarom de twee formulieren anders oogden.
const CHEV = (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor"
       strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
);
const VINK = (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor"
       strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
);

export function Dropdown({ value, options, onChange, placeholder, width, size = 'md', ariaLabel }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  const cur = options.find(o => o.value === value);
  return (
    <div ref={ref} className={`uren2-dropdown ${size === 'sm' ? 'is-sm' : ''}`} style={width ? { width } : null}>
      <button
        type="button"
        className="uren2-dropdown-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen(o => !o)}
      >
        <span className="uren2-dropdown-value">{cur ? cur.label : (placeholder || 'Kies\u2026')}</span>
        <span className={`uren2-dropdown-chev${open ? ' is-open' : ''}`}>{CHEV}</span>
      </button>
      {open && (
        <div className="uren2-dropdown-menu" role="listbox">
          {options.map(o => {
            const actief = o.value === value;
            return (
              <button
                key={String(o.value)}
                role="option"
                aria-selected={actief}
                className={`uren2-dropdown-opt${actief ? ' is-active' : ''}`}
                onClick={() => { onChange(o.value); setOpen(false); }}
              >
                <span className="uren2-dropdown-opt-label">{o.label}</span>
                {actief && <span className="uren2-dropdown-opt-check">{VINK}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
