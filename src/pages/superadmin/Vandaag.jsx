import { useState } from 'react';
import { Phone, Mail, CreditCard, Inbox, Bot, Clock, TrendingUp, Globe2, LifeBuoy, Server, Check, ExternalLink } from 'lucide-react';
import { useLaad } from './api.js';
import { useSa, Kop, Laden, Stat, Tabs, euro, geleden } from './ui.jsx';

// Vandaag: alles wat actie vraagt, in één lijst. De server stelt de lijst
// samen en sorteert op wat het meest kost als het blijft liggen: geld, dan
// nieuwe aanvragen en vragen via Boss, dan aflopende proeven en
// upgradeverzoeken, dan websites en bugs, dan het systeem.
const SOORT = {
  betaling: { label: 'Betaling mislukt', icoon: CreditCard, badge: 'b-red' },
  aanvraag: { label: 'Nieuwe aanvraag', icoon: Inbox, badge: 'b-green' },
  boss:     { label: 'Vraag via Boss', icoon: Bot, badge: 'b-purple' },
  proef:    { label: 'Proef loopt af', icoon: Clock, badge: 'b-orange' },
  upgrade:  { label: 'Upgradeverzoek', icoon: TrendingUp, badge: 'b-blue' },
  website:  { label: 'Website', icoon: Globe2, badge: 'b-orange' },
  melding:  { label: 'Bugmelding', icoon: LifeBuoy, badge: 'b-red' },
  systeem:  { label: 'Systeem', icoon: Server, badge: 'b-gray' },
};
const FEED_KLEUR = { aanmelding: '#15A34A', betaling: '#15A34A', website: '#2563eb', mislukt: '#dc2626', opzegging: '#9ca3af' };

export default function Vandaag() {
  const { ga, doe } = useSa();
  const { data, laden, fout, herlaad } = useLaad('overzicht');
  const [filter, setFilter] = useState('alles');
  const [weg, setWeg] = useState({});

  if (laden || fout) return <><Kop titel="Vandaag" /><Laden fout={fout} herlaad={herlaad} /></>;

  const acties = data.acties.filter(a => !weg[a.sleutel]);
  const soorten = [...new Set(acties.map(a => a.soort))];
  const zichtbaar = filter === 'alles' ? acties : acties.filter(a => a.soort === filter);
  const c = data.cijfers;

  const zet = async (a, status) => {
    const r = await doe('vandaag', { sleutel: a.sleutel, status, titel: a.titel, companyId: a.companyId ?? null }, { succes: status === 'klaar' ? 'Afgehandeld' : 'Staat morgen weer in de lijst' });
    if (r) setWeg(w => ({ ...w, [a.sleutel]: true }));
  };
  const open = a => {
    if (a.aanvraagId) return ga(`aanvragen/${a.aanvraagId}`);
    if (a.bossId) return ga('support/boss');
    if (a.meldingId) return ga('support/meldpunt');
    if (a.soort === 'systeem') return ga('systeem');
    if (a.website && a.companyId) return ga(`websites/${a.companyId}`);
    if (a.companyId) return ga(`klanten/${a.companyId}`);
  };
  const datumTekst = new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <>
      <Kop titel="Vandaag" sub={`${acties.length === 0 ? 'Niets' : acties.length === 1 ? '1 ding' : `${acties.length} dingen`} ${acties.length === 1 ? 'wacht' : 'wachten'} op jou · ${datumTekst}`} />

      <div className="stats-row afu2" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))' }}>
        <Stat label="Open acties" waarde={acties.length} sub={c.metGeld ? `${c.metGeld} met geld` : 'geen betaalproblemen'} />
        <Stat label="Nieuwe aanvragen" waarde={c.nieuweAanvragen} sub={`${c.aanvragenVandaag} vandaag binnengekomen`} />
        <Stat label="Proeven lopend" waarde={c.proeven} sub={`${c.proevenAflopend} lopen binnen 7 dagen af`} />
        <Stat label="MRR" waarde={euro(c.mrr)} sub={c.mrrVorige != null ? `${c.mrr - c.mrrVorige >= 0 ? '+' : '−'}${euro(Math.abs(c.mrr - c.mrrVorige))} t.o.v. vorige maand` : 'maandelijkse terugkerende omzet'} />
      </div>

      <div className="sa-twee">
        <div className="card card-p afu2">
          {acties.length > 0 && (
            <div className="lsec-hd" style={{ marginBottom: 12 }}>
              <Tabs waarde={filter} onKies={setFilter} opties={[{ id: 'alles', label: 'Alles', n: acties.length }, ...soorten.map(s => ({ id: s, label: SOORT[s]?.label ?? s, n: acties.filter(a => a.soort === s).length }))]} />
            </div>
          )}
          {zichtbaar.length === 0 && <div className="lsec-empty">Niets dat op je wacht.</div>}
          <div className="lrows">
            {zichtbaar.map(a => {
              const s = SOORT[a.soort] ?? SOORT.systeem;
              const Icoon = s.icoon;
              return (
                <div key={a.sleutel} className="lrow lrow-static sa-actie">
                  <div className={`sa-actie-ic badge ${s.badge}`} aria-hidden="true"><Icoon size={14} /></div>
                  <div className="lrow-main">
                    <div className="lrow-title">{a.titel}</div>
                    <div className="lrow-sub">{s.label}{a.sub ? ` · ${a.sub}` : ''}</div>
                  </div>
                  {a.op && <div className="lrow-date">{geleden(a.op)}</div>}
                  <div className="sa-actie-knoppen">
                    {a.url && <a className="btn btn-s btn-xs" href={a.url} target="_blank" rel="noreferrer"><ExternalLink size={12} />Factuur</a>}
                    {a.email && <a className="btn btn-s btn-xs" href={`mailto:${a.email}`}><Mail size={12} />Mailen</a>}
                    {(a.aanvraagId || a.bossId || a.meldingId || a.companyId || a.soort === 'systeem') && <button className="btn btn-s btn-xs" onClick={() => open(a)}>Openen</button>}
                    {a.proef && <button className="btn btn-s btn-xs" onClick={async () => { const r = await doe('klant-proef-verlengen', { id: a.companyId, dagen: 7 }, { succes: 'Proef met 7 dagen verlengd', vraag: { tekst: `Proef van ${a.titel.split(' · ')[0]} met 7 dagen verlengen?`, knop: 'Verlengen' } }); if (r) herlaad(); }}>Proef verlengen</button>}
                    {a.telefoon && <a className="btn btn-p btn-xs" href={`tel:${a.telefoon.replace(/\s/g, '')}`}><Phone size={12} />Bellen</a>}
                    <button className="btn btn-ghost btn-xs" title="Morgen weer tonen" onClick={() => zet(a, 'later')}>Later</button>
                    <button className="btn btn-ghost btn-xs" title="Afgehandeld" aria-label="Afgehandeld" onClick={() => zet(a, 'klaar')}><Check size={14} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card card-p afu3">
          <div className="lsec-hd"><div className="lsec-title">Recent gebeurd</div></div>
          {data.recent.length === 0 && <div className="lrow-sub">Afgelopen week niets bijzonders.</div>}
          <div className="sa-feed">
            {data.recent.map((f, i) => (
              <div key={i} className="sa-feed-rij" onClick={() => f.companyId && ga(`klanten/${f.companyId}`)}>
                <span className="sa-stip" style={{ background: FEED_KLEUR[f.soort] ?? '#9ca3af' }} />
                <div><div className="sa-feed-t">{f.tekst}</div><div className="lrow-sub">{[f.sub, geleden(f.op)].filter(Boolean).join(' · ')}</div></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
