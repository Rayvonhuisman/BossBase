import { useState } from 'react';
import { Phone, Mail, ExternalLink } from 'lucide-react';
import { useLaad } from './api.js';
import {
  useSa, Laden, Tabs, Sectie, Rij, Stat, Lijntje, gezondheid, StatusBadge, BedrijfLogo, Notities,
  PAKKETTEN, pakketLabel, euro, datum, tijdstip, geleden,
} from './ui.jsx';

// Eén klant: wie het is, wat ze betalen, of het goed gaat, en de knoppen die
// je nodig hebt als ze bellen. De tabs volgen de vragen die je over een klant
// hebt.
const FUNCTIES = ['Offertes', 'Facturen', 'Werkbonnen', 'Planning', 'Uren', 'Klanten en pipeline', 'Projecten en kosten', 'Boss (chat)', 'Boekhoudkoppeling'];

export default function Klant({ id }) {
  const { ga, doe } = useSa();
  const { data, laden, fout, herlaad } = useLaad('klant', { id });
  const [tab, setTab] = useState('overzicht');
  const [pakketKiezen, setPakketKiezen] = useState(false);

  if (laden || fout) return <><div className="lrow-sub" style={{ cursor: 'pointer', marginBottom: 10 }} onClick={() => ga('klanten')}>← Klanten</div><Laden fout={fout} herlaad={herlaad} /></>;
  const k = data.klant;
  const a = k.abonnement;
  const g = gezondheid(k.activiteit);
  const geblokkeerd = k.status === 'geblokkeerd';
  const proef = a?.status === 'trial' && !a?.heeftStripe;

  const wijzigPakket = async plan => {
    const p = PAKKETTEN.find(x => x.id === plan);
    const tekst = a?.heeftStripe
      ? `Pakket van ${k.naam} naar ${p.label} zetten? Dit gaat via Stripe met dezelfde regels als wanneer de klant het zelf doet: omhoog wordt het verschil meteen afgerekend, omlaag verrekend op de volgende factuur.`
      : `Pakket van ${k.naam} naar ${p.label} zetten? Er is geen Stripe-abonnement, dus dit verandert alleen het pakket in de app.`;
    if (await doe('klant-pakket', { id: k.id, plan }, { vraag: { titel: 'Pakket wijzigen', tekst, knop: 'Wijzigen' }, succes: `Pakket gewijzigd naar ${p.label}` })) { setPakketKiezen(false); herlaad(); }
  };

  return (
    <>
      <div className="page-hd afu">
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', minWidth: 0 }}>
          <BedrijfLogo k={k} maat={44} />
          <div style={{ minWidth: 0 }}>
            <div className="lrow-sub" style={{ cursor: 'pointer' }} onClick={() => ga('klanten')}>← Klanten</div>
            <h1>{k.naam}</h1>
            <p style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              {a && <span className="badge b-concept">{pakketLabel(a.plan)}</span>}
              <StatusBadge k={k} />
              <span className={`badge ${g.badge}`}>{g.label}</span>
              <span>{[k.branche, k.plaats, `klant sinds ${datum(k.aangemaakt, true)}`].filter(Boolean).join(' · ')}</span>
            </p>
          </div>
        </div>
        <div className="page-hd-actions">
          {k.telefoon && <a className="btn btn-p btn-sm" href={`tel:${k.telefoon.replace(/\s/g, '')}`}><Phone size={13} />Bellen</a>}
          {(k.email || k.eigenaar?.email) && <a className="btn btn-s btn-sm" href={`mailto:${k.email || k.eigenaar.email}`}><Mail size={13} />Mailen</a>}
          <button className="btn btn-s btn-sm" onClick={() => setPakketKiezen(v => !v)}>Wijzig pakket</button>
          {proef && <button className="btn btn-s btn-sm" onClick={async () => { if (await doe('klant-proef-verlengen', { id: k.id, dagen: 7 }, { vraag: { titel: 'Proef verlengen', tekst: `Proef van ${k.naam} met 7 dagen verlengen?`, knop: 'Verlengen' }, succes: 'Proef met 7 dagen verlengd' })) herlaad(); }}>Proef verlengen</button>}
          {geblokkeerd
            ? <button className="btn btn-s btn-sm" onClick={async () => { if (await doe('klant-blokkeren', { id: k.id, blokkeren: false }, { succes: 'Gedeblokkeerd' })) herlaad(); }}>Deblokkeren</button>
            : <button className="btn btn-ghost btn-sm" style={{ color: '#dc2626' }} onClick={async () => { if (await doe('klant-blokkeren', { id: k.id, blokkeren: true }, { vraag: `Weet je zeker dat je "${k.naam}" wilt blokkeren? Alle gebruikers worden direct uitgelogd.`, succes: 'Geblokkeerd' })) herlaad(); }}>Blokkeren</button>}
        </div>
      </div>

      {pakketKiezen && (
        <div className="card card-p afu" style={{ marginBottom: 16 }}>
          <div className="lsec-title" style={{ marginBottom: 8 }}>Pakket kiezen</div>
          <div className="sa-knoppen">
            {PAKKETTEN.map(p => (
              <button key={p.id} className={`btn btn-sm ${a?.plan === p.id ? 'btn-p' : 'btn-s'}`} disabled={a?.plan === p.id} onClick={() => wijzigPakket(p.id)}>{p.label} · € {p.prijs}/m</button>
            ))}
          </div>
          <div className="lrow-sub" style={{ marginTop: 8 }}>
            {a?.heeftStripe ? 'Gaat via Stripe; extra gebruikers en modules blijven zoals ze zijn. Omlaag binnen een jaarlooptijd kan niet, net als bij de klant zelf.' : 'Geen Stripe-abonnement: alleen het pakket in de app verandert.'}
          </div>
        </div>
      )}

      {k.upgradeVerzoek && (
        <div className="sa-info afu">
          <b>Upgradeverzoek</b> van {geleden(k.upgradeVerzoek.created_at)}: {k.upgradeVerzoek.gewenst_plan ? `naar ${pakketLabel(k.upgradeVerzoek.gewenst_plan)}` : ''}{k.upgradeVerzoek.gewenste_modules?.length ? ` · modules ${k.upgradeVerzoek.gewenste_modules.join(', ')}` : ''}{k.upgradeVerzoek.aanleiding ? ` · "${k.upgradeVerzoek.aanleiding}"` : ''}. De eigenaar ziet het verzoek in de app.
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <Tabs waarde={tab} onKies={setTab} opties={[
          { id: 'overzicht', label: 'Overzicht' }, { id: 'gebruik', label: 'Gebruik' }, { id: 'betalingen', label: 'Betalingen', n: k.facturen.filter(f => f.betaalstatus === 'mislukt').length },
          { id: 'gebruikers', label: `Gebruikers (${k.leden.length})` }, { id: 'website', label: 'Website' }, { id: 'notities', label: `Notities (${k.notities.length})` }, { id: 'logboek', label: 'Logboek' },
        ]} />
      </div>

      {tab === 'overzicht' && (
        <div className="sa-twee sa-twee-gelijk">
          <div className="card card-p">
            <Sectie titel="Abonnement">
              {!a && <div className="lrow-sub">Geen abonnement.</div>}
              {a && <>
                <Rij label="Pakket" waarde={`${pakketLabel(a.plan)}${k.mrr ? ` · ${euro(k.mrr)} per maand` : ''}`} />
                <Rij label="Betaalt" waarde={a.interval ? (a.interval === 'jaar' ? 'Jaarabonnement' : 'Maandabonnement') : (a.status === 'trial' ? 'Nog niet (proef)' : '')} />
                <Rij label="Extra gebruikers" waarde={a.extraGebruikers || ''} />
                <Rij label="Modules" waarde={k.modules.join(', ')} />
                <Rij label="Welkomstactie" waarde={a.welkomstactie === 'gratis_website' ? 'Gratis website' : a.welkomstactie === 'gratis_maanden' ? 'Eerste 2 maanden gratis' : ''} />
                <Rij label="Proef eindigt" waarde={a.status === 'trial' && a.proefTot ? `${datum(a.proefTot, true)} (${geleden(a.proefTot)})` : ''} />
                <Rij label="Vast tot" waarde={a.verplichtingTot && datum(a.verplichtingTot, true)} />
                <Rij label="Stopt op" waarde={a.stoptOp && datum(a.stoptOp, true)} />
                <Rij label="Via Stripe" waarde={a.heeftStripe ? <a href={`https://dashboard.stripe.com/customers/${a.stripeKlant}`} target="_blank" rel="noreferrer" style={{ color: 'var(--pd)' }}>Ja · openen in Stripe <ExternalLink size={11} /></a> : 'Nee'} />
              </>}
            </Sectie>
            <Sectie titel="Bedrijfsgegevens">
              <Rij label="Eigenaar" waarde={k.eigenaar ? `${k.eigenaar.naam}${k.eigenaar.email ? ` · ${k.eigenaar.email}` : ''}` : ''} />
              <Rij label="E-mail" waarde={k.email} />
              <Rij label="Telefoon" waarde={k.telefoon} />
              <Rij label="Adres" waarde={[k.adres, [k.postcode, k.plaats].filter(Boolean).join(' ')].filter(Boolean).join(', ')} />
              <Rij label="KvK" waarde={k.kvk} />
              <Rij label="Btw" waarde={k.btw} />
              <Rij label="Website" waarde={k.website && <a href={k.website.startsWith('http') ? k.website : `https://${k.website}`} target="_blank" rel="noreferrer" style={{ color: 'var(--pd)' }}>{k.website}</a>} />
              <Rij label="Aangemeld via" waarde={k.aanmeldbron} />
              <Rij label="Aangemaakt" waarde={datum(k.aangemaakt, true)} />
            </Sectie>
          </div>
          <div className="card card-p">
            <Sectie titel="Gebruik, laatste 7 weken">
              <Lijntje waarden={k.activiteit} breed={320} hoog={60} />
              <div className="lrow-sub" style={{ marginTop: 6 }}>Handelingen per week (offertes, facturen, werkbonnen, planning, uren, klanten, projecten). Laatst ingelogd {k.laatsteLogin ? geleden(k.laatsteLogin) : 'nooit'}.</div>
            </Sectie>
            <Sectie titel="Laatste notities" rechts={<button className="btn btn-ghost btn-xs" onClick={() => setTab('notities')}>Alle notities</button>}>
              {k.notities.slice(0, 3).map(n => <div key={n.id} className="sa-tl-rij" style={{ marginBottom: 8 }}><div className="lrow-sub">{tijdstip(n.op)} · {n.door_naam}</div><div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{n.tekst}</div></div>)}
              {!k.notities.length && <div className="lrow-sub">Nog geen notities.</div>}
            </Sectie>
          </div>
        </div>
      )}

      {tab === 'gebruik' && (
        <div className="card card-p">
          <div className="stats-row" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
            {[['Klanten', k.gebruik.klanten], ['Projecten', k.gebruik.projecten], ['Offertes', k.gebruik.offertes], ['Facturen', k.gebruik.facturen], ['Werkbonnen', k.gebruik.werkbonnen], ['Uren op klussen', Math.round(Number(k.gebruik.uren) || 0)], ['Gesprekken met Boss', k.gebruik.boss]].map(([l, v]) => <Stat key={l} label={l} waarde={v ?? 0} />)}
          </div>
          {k.gebruik.laatsteActiviteit && <div className="lrow-sub" style={{ marginBottom: 16 }}>Laatste activiteit: {tijdstip(k.gebruik.laatsteActiviteit)} ({geleden(k.gebruik.laatsteActiviteit)})</div>}
          <Sectie titel="Functies in de laatste 30 dagen">
            <div className="sa-knoppen">
              {FUNCTIES.map(f => {
                const r = k.functies.find(x => x.functie === f);
                return <span key={f} className={`badge ${r ? 'b-green' : 'b-gray'}`}>{f}{r ? ` · ${r.aantal}` : ' · niet gebruikt'}</span>;
              })}
            </div>
          </Sectie>
        </div>
      )}

      {tab === 'betalingen' && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-hd"><div className="card-title">Facturen uit Stripe</div></div>
            <div style={{ overflowX: 'auto' }}>
              <table className="dt">
                <thead><tr><th>Datum</th><th>Factuur</th><th>Omschrijving</th><th>Status</th><th style={{ textAlign: 'right' }}>Bedrag</th></tr></thead>
                <tbody>
                  {k.facturen.map(f => (
                    <tr key={f.stripe_invoice_id}>
                      <td>{datum(f.factuurdatum, true)}</td>
                      <td>{f.url ? <a href={f.url} target="_blank" rel="noreferrer" style={{ color: 'var(--pd)' }}>{f.nummer || 'bekijken'}</a> : f.nummer}</td>
                      <td>{f.omschrijving}{f.betaalstatus === 'mislukt' && <div className="lrow-sub" style={{ color: '#dc2626' }}>{[f.fout, f.pogingen ? `poging ${f.pogingen}` : null, f.volgende_poging ? `volgende ${datum(f.volgende_poging)}` : null].filter(Boolean).join(' · ')}</div>}</td>
                      <td><span className={`badge ${{ betaald: 'b-paid', mislukt: 'b-overdue', open: 'b-open', vervallen: 'b-lost', concept: 'b-concept' }[f.betaalstatus]}`}>{f.betaalstatus}</span></td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{euro(f.bedrag, 2)}</td>
                    </tr>
                  ))}
                  {!k.facturen.length && <tr><td colSpan={5} className="td-empty">Geen facturen in Stripe</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          {k.webBetalingen.length > 0 && (
            <div className="card">
              <div className="card-hd"><div className="card-title">Website</div></div>
              <table className="dt">
                <thead><tr><th>Datum</th><th>Omschrijving</th><th>Wijze</th><th>Status</th><th style={{ textAlign: 'right' }}>Bedrag</th></tr></thead>
                <tbody>
                  {k.webBetalingen.map(b => (
                    <tr key={b.id}><td>{datum(b.betaald_op || b.created_at, true)}</td><td>{b.omschrijving || b.soort}{b.fout && <div className="lrow-sub" style={{ color: '#dc2626' }}>{b.fout}</div>}</td><td>{b.wijze}{b.aantal_totaal ? ` (${b.aantal_gedaan}/${b.aantal_totaal})` : ''}</td><td>{b.status}</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{euro(b.bedrag, 2)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'gebruikers' && (
        <div className="card card-p"><div className="lrows">
          {k.leden.map(m => (
            <div key={m.id} className="lrow lrow-static">
              <div className="lrow-main"><div className="lrow-title">{m.full_name || m.email}</div><div className="lrow-sub">{[m.email, m.telefoon].filter(Boolean).join(' · ')}</div></div>
              <span className="badge b-concept">{m.role}</span>
              {!m.actief && <span className="badge b-lost">gedeactiveerd</span>}
              {m.is_super_admin && <span className="badge b-blue">superbeheerder</span>}
              <div className="lrow-date">{m.laatste_login ? geleden(m.laatste_login) : 'nooit ingelogd'}</div>
            </div>
          ))}
          {!k.leden.length && <div className="lsec-empty">Geen gebruikers</div>}
        </div></div>
      )}

      {tab === 'website' && (
        <div className="card card-p">
          {k.websiteTraject ? <>
            <Rij label="Pakket" waarde={k.websiteTraject.pakket} />
            <Rij label="Status" waarde={k.websiteTraject.status?.replace(/_/g, ' ')} />
            <Rij label="Adres" waarde={k.websiteTraject.site_url && <a href={k.websiteTraject.site_url} target="_blank" rel="noreferrer" style={{ color: 'var(--pd)' }}>{k.websiteTraject.site_url}</a>} />
            <Rij label="Domein" waarde={k.websiteTraject.domein} />
            <Rij label="Live sinds" waarde={k.websiteTraject.live_op && datum(k.websiteTraject.live_op, true)} />
            <button className="btn btn-s btn-sm" style={{ marginTop: 12 }} onClick={() => ga(`websites/${k.id}`)}>Openen in Websites</button>
          </> : <div className="lsec-empty">Geen website-traject</div>}
        </div>
      )}

      {tab === 'notities' && (
        <div className="card card-p">
          <Notities lijst={k.notities.map(n => ({ op: n.op, door: n.door_naam, tekst: n.tekst }))} onToevoegen={async tekst => { if (await doe('notitie', { soort: 'klant', id: k.id, tekst }, { succes: 'Notitie toegevoegd' })) herlaad(); }} />
        </div>
      )}

      {tab === 'logboek' && (
        <div className="card">
          <table className="dt">
            <thead><tr><th>Wanneer</th><th>Wie</th><th>Wat</th><th>Uitkomst</th></tr></thead>
            <tbody>
              {k.logboek.map(l => (
                <tr key={l.id}><td style={{ whiteSpace: 'nowrap' }}>{tijdstip(l.op)}</td><td>{l.door_naam}</td><td style={{ color: 'var(--dk)' }}>{l.omschrijving}</td><td>{l.uitkomst === 'mislukt' ? <span className="badge b-red" title={l.fout ?? ''}>mislukt</span> : l.uitkomst ? <span className="badge b-green">gelukt</span> : <span className="badge b-gray">bezig</span>}</td></tr>
              ))}
              {!k.logboek.length && <tr><td colSpan={4} className="td-empty">Nog niets vastgelegd voor dit bedrijf</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
