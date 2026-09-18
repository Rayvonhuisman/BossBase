// De demo op telefoon.
//
// Het echte dashboard is op mobiel geblokkeerd omdat het voor een groot scherm
// is gebouwd; daar is de losse app voor. Maar een bezoeker die de demo op zijn
// telefoon opent, moet het product wél kunnen zien. Daarom hier een eigen
// mobiele weergave op DEZELFDE nepdata (demoDb.js) — geen tweede waarheid, maar
// wel een indeling die op 390px werkt: lijsten in plaats van tabellen, één
// kolom, en een vaste balk onderin.
//
// Bewust géén hergebruik van de dashboardpagina's: die persen op deze breedte
// niet, en een onleesbaar scherm verkoopt slechter dan een goed mobiel scherm.

import { useState } from 'react';
import { demoDb } from './demoDb.js';
import DemoBalk from './DemoBalk.jsx';

// ── Opmaak ──────────────────────────────────────────────────────────────────
const kleur = {
  ink: '#0D0D0D', dim: '#6b7280', lijn: '#e7e7e4', vlak: '#fafaf8',
  groen: '#15A34A', groenL: '#eafaf0', blauw: '#2563eb', blauwL: '#eef4ff',
  amber: '#b45309', amberL: '#fef6e7', rood: '#dc2626', roodL: '#fdeded',
};

const s = {
  wrap: { minHeight: '100dvh', background: kleur.vlak, color: kleur.ink,
    font: '400 15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
    paddingBottom: 'calc(72px + env(safe-area-inset-bottom, 0px))' },
  kop: { padding: '14px 16px 10px', display: 'flex', alignItems: 'center', gap: 10 },
  titel: { fontSize: 20, fontWeight: 800, letterSpacing: '-.02em', margin: 0 },
  sub: { fontSize: 12.5, color: kleur.dim, margin: '2px 0 0' },
  kaart: { background: '#fff', border: `1px solid ${kleur.lijn}`, borderRadius: 12, padding: 14, margin: '0 16px 10px' },
  rij: { display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
    background: '#fff', border: `1px solid ${kleur.lijn}`, borderRadius: 12,
    padding: 13, margin: '0 0 8px', cursor: 'pointer', font: 'inherit', color: 'inherit' },
  label: { fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: kleur.dim, fontWeight: 700 },
  bedrag: { fontVariantNumeric: 'tabular-nums', fontWeight: 700 },
  balkOnder: { position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 50,
    display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', background: '#fff',
    borderTop: `1px solid ${kleur.lijn}`, paddingBottom: 'env(safe-area-inset-bottom, 0px)' },
  tab: actief => ({ border: 0, background: 'none', padding: '10px 4px 12px', cursor: 'pointer',
    font: 'inherit', fontSize: 11, fontWeight: actief ? 800 : 500,
    color: actief ? kleur.ink : kleur.dim, display: 'grid', gap: 3, justifyItems: 'center' }),
  terug: { border: 0, background: 'none', padding: '4px 8px 4px 0', cursor: 'pointer',
    font: 'inherit', fontSize: 14, color: kleur.dim },
};

const euro = n => `€ ${Number(n || 0).toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const dagNl = iso => iso ? new Date(iso).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
const tijd = t => (t || '').slice(0, 5);

function Chip({ tekst, toon = 'grijs' }) {
  const t = {
    grijs:  { bg: '#f3f4f6', fg: kleur.dim },
    groen:  { bg: kleur.groenL, fg: kleur.groen },
    blauw:  { bg: kleur.blauwL, fg: kleur.blauw },
    amber:  { bg: kleur.amberL, fg: kleur.amber },
    rood:   { bg: kleur.roodL, fg: kleur.rood },
  }[toon];
  return <span style={{ background: t.bg, color: t.fg, borderRadius: 999, padding: '3px 9px',
    fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' }}>{tekst}</span>;
}

const statusToon = st => ({
  betaald: 'groen', afgerond: 'groen', geaccepteerd: 'groen',
  verzonden: 'blauw', in_uitvoering: 'blauw', gepland: 'blauw',
  concept: 'grijs', afgewezen: 'rood',
}[st] || 'grijs');

// ── Gegevens uit de nepdata ─────────────────────────────────────────────────
const klantVan = id => demoDb.customers.find(k => k.id === id);
const naamVan = id => demoDb.profiles.find(p => p.id === id)?.full_name || '';
const vandaag = new Date().toISOString().slice(0, 10);

// ── Schermen ────────────────────────────────────────────────────────────────

function Dashboard({ open }) {
  const openstaand = demoDb.facturen.filter(f => f.status === 'verzonden');
  const teLaat = openstaand.filter(f => f.vervaldatum < vandaag);
  const omzet = demoDb.facturen.filter(f => f.status === 'betaald').reduce((n, f) => n + f.totaal, 0);
  const pipeline = demoDb.deals.filter(d => d.stage_id !== 'demo-fase-verloren').reduce((n, d) => n + d.value, 0);
  const vandaagWb = demoDb.werkbonnen.filter(w => w.gepland_op === vandaag);
  const acts = demoDb.activities.filter(a => !a.completed).slice(0, 4);

  return (
    <>
      <div style={s.kop}>
        <div>
          <h1 style={s.titel}>Goedemiddag, Sander</h1>
          <p style={s.sub}>Van Dijk Schilderwerken</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '0 16px 10px' }}>
        {[
          ['Omzet betaald', euro(omzet), 'groen'],
          ['Openstaand', euro(openstaand.reduce((n, f) => n + f.totaal, 0)), teLaat.length ? 'rood' : 'blauw'],
          ['Pipeline', euro(pipeline), 'blauw'],
          ['Klussen vandaag', String(vandaagWb.length), 'grijs'],
        ].map(([lbl, val, toon]) => (
          <div key={lbl} style={{ ...s.kaart, margin: 0 }}>
            <div style={s.label}>{lbl}</div>
            <div style={{ fontSize: 19, fontWeight: 800, margin: '4px 0 6px', ...s.bedrag }}>{val}</div>
            {lbl === 'Openstaand' && teLaat.length > 0 && <Chip tekst={`${teLaat.length} te laat`} toon={toon} />}
          </div>
        ))}
      </div>

      <div style={{ padding: '6px 16px 4px' }}><span style={s.label}>Vandaag op de planning</span></div>
      <div style={{ padding: '0 16px' }}>
        {vandaagWb.length === 0 && <div style={{ ...s.kaart, margin: 0, color: kleur.dim }}>Niets ingepland vandaag.</div>}
        {vandaagWb.map(w => (
          <button key={w.id} style={s.rij} onClick={() => open('werkbon', w.id)}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.titel}</div>
              <div style={{ fontSize: 12.5, color: kleur.dim }}>
                {tijd(w.starttijd)}–{tijd(w.eindtijd)} · {klantVan(w.customer_id)?.name}
              </div>
            </div>
            <Chip tekst={w.status === 'in_uitvoering' ? 'Bezig' : 'Gepland'} toon={statusToon(w.status)} />
          </button>
        ))}
      </div>

      <div style={{ padding: '12px 16px 4px' }}><span style={s.label}>Open activiteiten</span></div>
      <div style={{ padding: '0 16px' }}>
        {acts.map(a => (
          <div key={a.id} style={{ ...s.rij, cursor: 'default' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{a.title}</div>
              <div style={{ fontSize: 12.5, color: kleur.dim }}>{klantVan(a.customer_id)?.name} · {dagNl(a.due_at)}</div>
            </div>
            {a.due_at.slice(0, 10) < vandaag && <Chip tekst="Te laat" toon="rood" />}
          </div>
        ))}
      </div>
    </>
  );
}

function Pipeline({ open }) {
  const [fase, setFase] = useState(demoDb.pipeline_stages[0].id);
  const deals = demoDb.deals.filter(d => d.stage_id === fase);

  return (
    <>
      <div style={s.kop}><div><h1 style={s.titel}>Pipeline</h1>
        <p style={s.sub}>{demoDb.deals.length} trajecten · {euro(demoDb.deals.reduce((n, d) => n + d.value, 0))}</p></div></div>

      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '0 16px 12px', WebkitOverflowScrolling: 'touch' }}>
        {demoDb.pipeline_stages.map(f => {
          const aantal = demoDb.deals.filter(d => d.stage_id === f.id).length;
          const actief = f.id === fase;
          return (
            <button key={f.id} onClick={() => setFase(f.id)} style={{
              flexShrink: 0, border: `1px solid ${actief ? kleur.ink : kleur.lijn}`,
              background: actief ? kleur.ink : '#fff', color: actief ? '#fff' : kleur.ink,
              borderRadius: 999, padding: '7px 13px', font: 'inherit', fontSize: 13,
              fontWeight: actief ? 700 : 500, cursor: 'pointer', whiteSpace: 'nowrap',
            }}>{f.name} <span style={{ opacity: .6 }}>{aantal}</span></button>
          );
        })}
      </div>

      <div style={{ padding: '0 16px' }}>
        {deals.length === 0 && <div style={{ ...s.kaart, margin: 0, color: kleur.dim }}>Geen trajecten in deze fase.</div>}
        {deals.map(d => (
          <button key={d.id} style={s.rij} onClick={() => open('klant', d.customer_id)}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>{d.title}</div>
              <div style={{ fontSize: 12.5, color: kleur.dim }}>{klantVan(d.customer_id)?.name} · {d.city}</div>
              {d.next_activity && <div style={{ fontSize: 12, color: kleur.dim, marginTop: 4 }}>→ {d.next_activity}</div>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={s.bedrag}>{euro(d.value)}</div>
              {d.priority === 'high' && <div style={{ marginTop: 4 }}><Chip tekst="Hoog" toon="amber" /></div>}
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

function Klanten({ open }) {
  return (
    <>
      <div style={s.kop}><div><h1 style={s.titel}>Klanten</h1>
        <p style={s.sub}>{demoDb.customers.length} relaties</p></div></div>
      <div style={{ padding: '0 16px' }}>
        {demoDb.customers.map(k => (
          <button key={k.id} style={s.rij} onClick={() => open('klant', k.id)}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: kleur.blauwL, color: kleur.blauw,
              display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>
              {k.name.split(' ').slice(0, 2).map(w => w[0]).join('')}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.name}</div>
              <div style={{ fontSize: 12.5, color: kleur.dim }}>{k.city}</div>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

function Klantkaart({ id, open, terug }) {
  const k = klantVan(id);
  if (!k) return null;
  const deals = demoDb.deals.filter(d => d.customer_id === id);
  const offertes = demoDb.offertes.filter(o => o.customer_id === id);
  const facturen = demoDb.facturen.filter(f => f.customer_id === id);
  const werkbonnen = demoDb.werkbonnen.filter(w => w.customer_id === id);

  const Blok = ({ titel, kinderen }) => (
    <>
      <div style={{ padding: '12px 16px 4px' }}><span style={s.label}>{titel}</span></div>
      <div style={{ padding: '0 16px' }}>{kinderen}</div>
    </>
  );

  return (
    <>
      <div style={s.kop}>
        <button style={s.terug} onClick={terug}>← Klanten</button>
      </div>
      <div style={{ ...s.kaart }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>{k.name}</div>
        <div style={{ fontSize: 13, color: kleur.dim, marginTop: 2 }}>{k.address}, {k.postcode} {k.city}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <a href={`tel:${k.phone}`} style={{ ...s.rij, width: 'auto', margin: 0, padding: '8px 14px', textDecoration: 'none', fontWeight: 700, fontSize: 13.5 }}>Bellen</a>
          <a href={`mailto:${k.email}`} style={{ ...s.rij, width: 'auto', margin: 0, padding: '8px 14px', textDecoration: 'none', fontWeight: 700, fontSize: 13.5 }}>E-mail</a>
        </div>
      </div>

      {deals.length > 0 && <Blok titel="Trajecten" kinderen={deals.map(d => (
        <div key={d.id} style={{ ...s.rij, cursor: 'default' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600 }}>{d.title}</div>
            <div style={{ fontSize: 12.5, color: kleur.dim }}>
              {demoDb.pipeline_stages.find(f => f.id === d.stage_id)?.name}
            </div>
          </div>
          <span style={s.bedrag}>{euro(d.value)}</span>
        </div>
      ))} />}

      {werkbonnen.length > 0 && <Blok titel="Werkbonnen" kinderen={werkbonnen.map(w => (
        <button key={w.id} style={s.rij} onClick={() => open('werkbon', w.id)}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600 }}>{w.titel}</div>
            <div style={{ fontSize: 12.5, color: kleur.dim }}>{w.nummer} · {dagNl(w.gepland_op)}</div>
          </div>
          <Chip tekst={w.status === 'afgerond' ? 'Afgerond' : w.status === 'in_uitvoering' ? 'Bezig' : 'Gepland'} toon={statusToon(w.status)} />
        </button>
      ))} />}

      {offertes.length > 0 && <Blok titel="Offertes" kinderen={offertes.map(o => (
        <div key={o.id} style={{ ...s.rij, cursor: 'default' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600 }}>{o.nummer}</div>
            <div style={{ fontSize: 12.5, color: kleur.dim }}>{o.omschrijving}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={s.bedrag}>{euro(o.totaal)}</div>
            <div style={{ marginTop: 4 }}><Chip tekst={o.status} toon={statusToon(o.status)} /></div>
          </div>
        </div>
      ))} />}

      {facturen.length > 0 && <Blok titel="Facturen" kinderen={facturen.map(f => (
        <div key={f.id} style={{ ...s.rij, cursor: 'default' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600 }}>{f.nummer}</div>
            <div style={{ fontSize: 12.5, color: kleur.dim }}>Vervalt {dagNl(f.vervaldatum)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={s.bedrag}>{euro(f.totaal)}</div>
            <div style={{ marginTop: 4 }}>
              <Chip tekst={f.status === 'betaald' ? 'Betaald' : f.vervaldatum < vandaag ? 'Te laat' : 'Open'}
                toon={f.status === 'betaald' ? 'groen' : f.vervaldatum < vandaag ? 'rood' : 'blauw'} />
            </div>
          </div>
        </div>
      ))} />}
    </>
  );
}

function Werkbonnen({ open }) {
  return (
    <>
      <div style={s.kop}><div><h1 style={s.titel}>Werkbonnen</h1>
        <p style={s.sub}>Uitvoeropdrachten op locatie</p></div></div>
      <div style={{ padding: '0 16px' }}>
        {demoDb.werkbonnen.map(w => (
          <button key={w.id} style={s.rij} onClick={() => open('werkbon', w.id)}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>{w.titel}</div>
              <div style={{ fontSize: 12.5, color: kleur.dim }}>
                {w.nummer} · {klantVan(w.customer_id)?.name}
              </div>
              <div style={{ fontSize: 12.5, color: kleur.dim, marginTop: 2 }}>
                {dagNl(w.gepland_op)} · {tijd(w.starttijd)}–{tijd(w.eindtijd)}
              </div>
            </div>
            <Chip tekst={w.status === 'afgerond' ? 'Afgerond' : w.status === 'in_uitvoering' ? 'Bezig' : 'Gepland'} toon={statusToon(w.status)} />
          </button>
        ))}
      </div>
    </>
  );
}

function Werkbon({ id, terug }) {
  const w = demoDb.werkbonnen.find(x => x.id === id);
  if (!w) return null;
  const k = klantVan(w.customer_id);
  const taken = demoDb.werkbon_taken.filter(t => t.werkbon_id === id);
  const materialen = demoDb.werkbon_materialen.filter(m => m.werkbon_id === id);
  const dagen = demoDb.werkbon_dagen.filter(d => d.werkbon_id === id);
  const notities = demoDb.werkbon_notities.filter(n => n.werkbon_id === id);

  return (
    <>
      <div style={s.kop}><button style={s.terug} onClick={terug}>← Werkbonnen</button></div>

      <div style={s.kaart}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ fontSize: 17, fontWeight: 800, minWidth: 0 }}>{w.titel}</div>
          <Chip tekst={w.status === 'afgerond' ? 'Afgerond' : w.status === 'in_uitvoering' ? 'Bezig' : 'Gepland'} toon={statusToon(w.status)} />
        </div>
        <div style={{ fontSize: 13, color: kleur.dim, marginTop: 4 }}>{w.nummer} · {k?.name}</div>
        <div style={{ fontSize: 13, marginTop: 10 }}>{dagNl(w.gepland_op)} · {tijd(w.starttijd)}–{tijd(w.eindtijd)}</div>
        <div style={{ fontSize: 13, color: kleur.dim }}>{w.locatie}</div>
        {w.omschrijving && <p style={{ fontSize: 13.5, marginTop: 10, marginBottom: 0 }}>{w.omschrijving}</p>}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
          {w.assigned_to_ids.map(p => <Chip key={p} tekst={naamVan(p)} toon="blauw" />)}
        </div>
      </div>

      {dagen.length > 0 && (
        <>
          <div style={{ padding: '6px 16px 4px' }}><span style={s.label}>Planning en bussen</span></div>
          <div style={{ padding: '0 16px' }}>
            {dagen.map(d => (
              <div key={d.id} style={{ ...s.rij, cursor: 'default' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{dagNl(d.datum)}</div>
                  <div style={{ fontSize: 12.5, color: kleur.dim }}>
                    {(d.medewerker_ids || w.assigned_to_ids).map(naamVan).join(', ')}
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 4, justifyItems: 'end' }}>
                  {(d.voertuig_ids || []).map(v => (
                    <Chip key={v} tekst={demoDb.voertuigen.find(x => x.id === v)?.naam.split(' — ')[0] || 'Bus'} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {taken.length > 0 && (
        <>
          <div style={{ padding: '12px 16px 4px' }}><span style={s.label}>Taken</span></div>
          <div style={{ padding: '0 16px' }}>
            {taken.map(t => (
              <div key={t.id} style={{ ...s.rij, cursor: 'default' }}>
                <span style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                  background: t.gereed ? kleur.groen : '#fff', border: `1px solid ${t.gereed ? kleur.groen : kleur.lijn}`,
                  color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12 }}>{t.gereed ? '✓' : ''}</span>
                <span style={{ flex: 1, textDecoration: t.gereed ? 'line-through' : 'none', color: t.gereed ? kleur.dim : kleur.ink }}>
                  {t.omschrijving}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {materialen.length > 0 && (
        <>
          <div style={{ padding: '12px 16px 4px' }}><span style={s.label}>Materiaal</span></div>
          <div style={{ padding: '0 16px' }}>
            {materialen.map(m => (
              <div key={m.id} style={{ ...s.rij, cursor: 'default' }}>
                <span style={{ flex: 1 }}>{m.omschrijving}</span>
                <span style={{ color: kleur.dim, fontSize: 13 }}>{m.aantal} {m.eenheid}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {notities.length > 0 && (
        <>
          <div style={{ padding: '12px 16px 4px' }}><span style={s.label}>Notities</span></div>
          <div style={{ padding: '0 16px' }}>
            {notities.map(n => (
              <div key={n.id} style={{ ...s.kaart, margin: '0 0 8px' }}>
                <div style={{ fontSize: 13.5 }}>{n.note}</div>
                <div style={{ fontSize: 11.5, color: kleur.dim, marginTop: 6 }}>
                  {naamVan(n.created_by)} · {n.voor_klant ? 'zichtbaar voor klant' : 'intern'}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function Planning({ open }) {
  const dagen = [0, 1, 2, 3, 4].map(n => {
    const dt = new Date();
    dt.setDate(dt.getDate() + n);
    return dt.toISOString().slice(0, 10);
  });
  const [dag, setDag] = useState(dagen[0]);
  const bonnen = demoDb.werkbonnen.filter(w => w.gepland_op === dag);

  return (
    <>
      <div style={s.kop}><div><h1 style={s.titel}>Planning</h1>
        <p style={s.sub}>Wie werkt waar</p></div></div>

      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '0 16px 12px' }}>
        {dagen.map(dd => {
          const actief = dd === dag;
          const dt = new Date(dd);
          return (
            <button key={dd} onClick={() => setDag(dd)} style={{
              flexShrink: 0, border: `1px solid ${actief ? kleur.ink : kleur.lijn}`,
              background: actief ? kleur.ink : '#fff', color: actief ? '#fff' : kleur.ink,
              borderRadius: 12, padding: '8px 14px', font: 'inherit', cursor: 'pointer',
              display: 'grid', justifyItems: 'center', gap: 2, minWidth: 58,
            }}>
              <span style={{ fontSize: 11, opacity: .7 }}>{dt.toLocaleDateString('nl-NL', { weekday: 'short' })}</span>
              <span style={{ fontSize: 16, fontWeight: 800 }}>{dt.getDate()}</span>
            </button>
          );
        })}
      </div>

      <div style={{ padding: '0 16px' }}>
        {bonnen.length === 0 && <div style={{ ...s.kaart, margin: 0, color: kleur.dim }}>Geen klussen op deze dag.</div>}
        {bonnen.map(w => {
          const dagRij = demoDb.werkbon_dagen.find(d => d.werkbon_id === w.id && d.datum === dag);
          return (
            <button key={w.id} style={{ ...s.rij, alignItems: 'stretch' }} onClick={() => open('werkbon', w.id)}>
              <div style={{ width: 4, borderRadius: 4, background: kleur.blauw, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>{w.titel}</div>
                <div style={{ fontSize: 12.5, color: kleur.dim }}>{tijd(w.starttijd)}–{tijd(w.eindtijd)} · {klantVan(w.customer_id)?.name}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  {(dagRij?.medewerker_ids || w.assigned_to_ids).map(p => <Chip key={p} tekst={naamVan(p).split(' ')[0]} />)}
                  {(dagRij?.voertuig_ids || []).map(v => (
                    <Chip key={v} tekst={demoDb.voertuigen.find(x => x.id === v)?.naam.split(' — ')[0] || 'Bus'} toon="amber" />
                  ))}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}

// ── Schil ───────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'dashboard',  label: 'Start',    teken: '◧' },
  { id: 'pipeline',   label: 'Pipeline', teken: '◱' },
  { id: 'planning',   label: 'Planning', teken: '▤' },
  { id: 'werkbonnen', label: 'Werkbon',  teken: '✎' },
  { id: 'klanten',    label: 'Klanten',  teken: '☺' },
];

export default function DemoMobiel({ navigate }) {
  const [tab, setTab] = useState('dashboard');
  const [detail, setDetail] = useState(null);   // { soort, id }

  const open = (soort, id) => { setDetail({ soort, id }); window.scrollTo(0, 0); };
  const terug = () => setDetail(null);
  const naarTab = id => { setDetail(null); setTab(id); window.scrollTo(0, 0); };

  let scherm;
  if (detail?.soort === 'klant')        scherm = <Klantkaart id={detail.id} open={open} terug={terug} />;
  else if (detail?.soort === 'werkbon') scherm = <Werkbon id={detail.id} terug={terug} />;
  else if (tab === 'pipeline')          scherm = <Pipeline open={open} />;
  else if (tab === 'planning')          scherm = <Planning open={open} />;
  else if (tab === 'werkbonnen')        scherm = <Werkbonnen open={open} />;
  else if (tab === 'klanten')           scherm = <Klanten open={open} />;
  else                                  scherm = <Dashboard open={open} />;

  return (
    <div style={s.wrap}>
      <DemoBalk navigate={navigate} />
      {scherm}
      <nav style={s.balkOnder} aria-label="Demo-navigatie">
        {TABS.map(t => (
          <button key={t.id} style={s.tab(tab === t.id && !detail)} onClick={() => naarTab(t.id)}>
            <span style={{ fontSize: 17, lineHeight: 1 }} aria-hidden="true">{t.teken}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
