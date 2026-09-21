// ── DE PROJECTKAART ──────────────────────────────────────────────────────────
// Eén plek voor een klus, van eerste aanvraag tot betaling. Opent vanaf een
// pipelinekaart en vanaf de klantkaart.
//
// Voor de gebruiker zijn "deal" en "project" één ding. In de database zijn ze
// dat nog niet: de pipeline kent een deal, de uitvoering een project. Deze kaart
// legt ze naast elkaar — de deal levert de aanvraag, de fase, de behandelaars,
// afronden en verloren; het project levert offerte, planning, werkbonnen,
// facturen en kosten. Er is hoogstens één project per deal (gemeten in
// productie), dus de koppeling is eenduidig.
//
// Alles wat al bestond komt hier ongewijzigd terug: PlanningRegels uit het
// planningblok, InkopenKaart uit de kostentab, en de lijstopmaak (lrows/lrow)
// van de klantkaart. Nieuw is alleen het aanvraag-blok bovenaan.
//
// Bedragen hangen achter het recht 'projectbedragen'. Een monteur ziet de klus,
// de planning en zijn werkbonnen, maar niet wat het opbrengt.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { I, ModalX, StatusBadge, fmt, fmt0 } from '../../bb-shared.jsx';
import { useEscapeSluit } from '../../hooks/useEscapeSluit.js';
import { useToast } from '../../lib/toast.jsx';
import { useData } from '../../lib/dataContext.jsx';
import { useProfile } from '../../lib/profileContext.jsx';
import { usePermissions } from '../../hooks/usePermissions.js';
import { usePlan } from '../../hooks/usePlan.js';
import { updateDeal, updateDealStage, zetDealAfgerond } from '../../services/dealService.js';
import { isAfgerond } from '../../utils/pipeline.js';
import { getProjectByDeal, getProjectInvoices } from '../../services/projectsService.js';
import { getWerkbonnenByProject } from '../../services/werkbonService.js';
import { getProjectKostenOverzicht } from '../../services/kostenOverzichtService.js';
import { listProjectKosten, createProjectKost } from '../../services/projectKostenService.js';
import { listLeveranciers } from '../../services/leverancierService.js';
import { InkopenKaart, useInkopenBewerken } from '../../components/KostenInvoerRegel.jsx';
import { PlanningRegels, planRegels } from '../../components/PlanningBlok.jsx';
import { MemberMultiSelect } from '../../components/MemberMultiSelect.jsx';
import { VerlorenModal } from '../../components/SharedModals.jsx';
import { getTeamMembers } from '../../services/notificatieService.js';
import { korteDatum } from '../../utils/werkbonDagen.js';
import { OfferteBadge } from '../OffertesPage.jsx';
import { FactuurBadge } from '../FacturenPage.jsx';

const fmtDatum = d => {
  if (!d) return '';
  const [j, m, dag] = String(d).split('-');
  return dag ? `${dag}-${m}-${j}` : d;
};

const labelStijl = { fontSize: 11, fontWeight: 600, color: 'var(--dl)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 };
const sectieKop = { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--dl)' };

// ── Kop ──────────────────────────────────────────────────────────────────────

function Kop({
  deal, stages, magVerkoop, magBedragen, waarde,
  onClose, fullscreen, onToggleFullscreen, openCustomer,
  onFase, faseBezig, onAfronden, afrondBezig, onVerloren,
  teamMembers, onToewijzing, toewijzenBezig,
}) {
  const [toonToewijzen, setToonToewijzen] = useState(false);
  const afgerond = isAfgerond(deal);
  const verloren = deal.status === 'lost';
  const behandelaars = (deal.assignedToIds || [])
    .map(id => teamMembers.find(m => m.id === id || m.profileId === id)?.fullName)
    .filter(Boolean);
  const gesorteerd = [...stages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const huidige = stages.find(s => s.id === deal.stage);

  return (
    <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--br)', position: 'sticky', top: 0, background: '#fff', zIndex: 2 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <button className="btn-icon" style={{ flexShrink: 0, marginTop: 2, color: 'var(--dl)' }}
          onClick={onToggleFullscreen} title={fullscreen ? 'Kleiner weergeven' : 'Volledig scherm'}>
          {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--dk)', letterSpacing: '-.01em', wordBreak: 'break-word' }}>
            {deal.title}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
            {afgerond
              ? <span className="badge b-done">Afgerond</span>
              : verloren
                ? <span className="badge b-lost">Verloren</span>
                : magVerkoop ? (
                  <select
                    className="badge b-gray"
                    style={{ border: '1px solid var(--border)', cursor: 'pointer', padding: '2px 6px', maxWidth: 190 }}
                    value={deal.stage || ''}
                    disabled={faseBezig}
                    aria-label="Fase van dit project"
                    onChange={e => onFase(e.target.value)}
                  >
                    {gesorteerd.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                ) : huidige ? <span className="badge b-gray">{huidige.label}</span> : null}
            {deal.custId && (
              <button className="btn btn-ghost btn-xs" style={{ padding: 0, color: 'var(--pd)', fontWeight: 700 }}
                onClick={() => openCustomer?.(deal.custId)}>
                {deal.customerName || 'Klant'} {I.arrow_r}
              </button>
            )}
            {magBedragen && waarde > 0 && <span style={{ fontSize: 12, color: 'var(--dl)' }}>· {fmt0(waarde)}</span>}
          </div>
        </div>
        <ModalX onClose={onClose} />
      </div>

      {/* Wie het behandelt, en de twee eindacties. Alleen met verkooprecht:
          deals_update eist dat, dus een knop zonder dat recht loopt vast op de
          policy.

          De namenlijst staat dicht en klapt pas open als je hem nodig hebt: hij
          toont tien teamleden en duwde de hele kop uit elkaar. Wie het behandelt
          lees je aan de namen; wijzigen is de uitzondering, niet de regel. */}
      {magVerkoop && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={labelStijl}>Behandeld door</div>
            {toonToewijzen ? (
              <MemberMultiSelect
                members={teamMembers}
                value={deal.assignedToIds || []}
                onChange={onToewijzing}
                disabled={toewijzenBezig || afgerond}
              />
            ) : (
              <button
                className="btn btn-s btn-sm"
                style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                disabled={afgerond}
                onClick={() => setToonToewijzen(true)}
              >
                {behandelaars.length ? behandelaars.join(', ') : 'Niemand toegewezen'} {I.edit}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {!verloren && !afgerond && (
              <button className="btn btn-s btn-sm" style={{ color: '#dc2626' }} onClick={onVerloren}>Verloren</button>
            )}
            <button
              className={afgerond ? 'btn btn-s btn-sm' : 'btn btn-p btn-sm'}
              disabled={afrondBezig}
              onClick={() => onAfronden(!afgerond)}
            >
              {afgerond ? 'Heropenen' : <>{I.check} Afronden</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── De aanvraag ──────────────────────────────────────────────────────────────
// Het enige nieuw ontworpen blok: wat wil de klant, waar, wanneer, via welke
// bron. Zo volledig dat je niet hoeft te bellen om te weten waar het om gaat.

function Aanvraag({ deal, klant, project }) {
  const omschrijving = deal.raw?.description || deal.raw?.notes || '';
  const adres = klant?.address || '';
  const plaats = [klant?.postcode, klant?.city].filter(Boolean).join(' ');
  const bron = deal.raw?.source || 'Handmatig aangemaakt';

  return (
    <div className="card card-p" style={{ padding: 14, background: '#fafafa' }}>
      <div style={{ ...sectieKop, marginBottom: 10 }}>De aanvraag</div>
      {omschrijving
        ? <div style={{ fontSize: 13.5, color: 'var(--dk)', lineHeight: 1.55, marginBottom: 14, whiteSpace: 'pre-wrap' }}>{omschrijving}</div>
        : <div style={{ fontSize: 13, color: 'var(--dl)', marginBottom: 14 }}>Geen omschrijving bij deze aanvraag.</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        <div>
          <div style={labelStijl}>Waar</div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{adres || '—'}</div>
          {plaats && <div style={{ fontSize: 12, color: 'var(--dl)' }}>{plaats}</div>}
        </div>
        <div>
          <div style={labelStijl}>Wanneer</div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>
            {project?.startDate ? `Gestart ${fmtDatum(project.startDate)}` : 'Nog niet ingepland'}
          </div>
          {project?.deadline && <div style={{ fontSize: 12, color: 'var(--dl)' }}>deadline {fmtDatum(project.deadline)}</div>}
        </div>
        <div>
          <div style={labelStijl}>Via</div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{bron}</div>
          {deal.createdAt && <div style={{ fontSize: 12, color: 'var(--dl)' }}>binnen op {fmtDatum(String(deal.createdAt).slice(0, 10))}</div>}
        </div>
        <div>
          <div style={labelStijl}>Contact</div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{klant?.phone || klant?.email || '—'}</div>
        </div>
      </div>
    </div>
  );
}

// ── Eén stap in het verloop ──────────────────────────────────────────────────

function Stap({ nr, titel, sub, rechts, leeg, children }) {
  const [open, setOpen] = useState(!leeg);
  return (
    <div className="card" style={leeg ? { borderStyle: 'dashed', boxShadow: 'none', background: 'transparent' } : undefined}>
      <div className="card-hd" style={{ padding: '12px 16px', cursor: leeg ? 'default' : 'pointer' }}
        onClick={() => !leeg && setOpen(o => !o)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{
            width: 20, height: 20, borderRadius: 999, flexShrink: 0, fontSize: 11, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: leeg ? 'var(--bgs)' : 'var(--pll)', color: leeg ? 'var(--dl)' : 'var(--pd)',
          }}>{nr}</span>
          <div style={{ minWidth: 0 }}>
            <div className="card-title">{titel}</div>
            <div className="card-sub" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {rechts}
          {!leeg && <span style={{ color: 'var(--dl)', display: 'inline-flex', transform: open ? 'rotate(90deg)' : 'none' }}>{I.chev_r}</span>}
        </div>
      </div>
      {leeg
        ? <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--dl)' }}>{children}</div>
        : open && <div style={{ padding: '12px 16px' }}>{children}</div>}
    </div>
  );
}

// ── De drawer ────────────────────────────────────────────────────────────────

export function ProjectkaartDrawer({ dealId, onClose, setPage, openCustomer }) {
  useEscapeSluit(onClose);
  const toast = useToast();
  const { can, magBewerken } = usePermissions();
  const plan = usePlan();
  const { bumpRefresh } = useProfile();
  const {
    deals = [], stages = [], customers = [], offertes = [], werkbonnen = [],
    loading: gedeeldLaden,
  } = useData();

  const magBedragen = can('projectbedragen');
  const magVerkoop = magBewerken('verkoop');
  const magKosten = can('kosten') && plan.has('kosten_nacalculatie');

  // Na een wijziging meteen de bijgewerkte deal tonen, zonder te wachten op de
  // gedeelde dataset.
  const [bewerkt, setBewerkt] = useState(null);
  const deal = (bewerkt && bewerkt.id === dealId ? bewerkt : null) || deals.find(d => d.id === dealId) || null;
  const klant = customers.find(c => c.id === deal?.custId) || null;

  const [project, setProject] = useState(null);
  const [projectLaden, setProjectLaden] = useState(true);
  const [facturen, setFacturen] = useState([]);
  const [projectWerkbonnen, setProjectWerkbonnen] = useState([]);
  const [overzicht, setOverzicht] = useState(null);
  const [inkopen, setInkopen] = useState([]);
  const [leveranciers, setLeveranciers] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [faseBezig, setFaseBezig] = useState(false);
  const [afrondBezig, setAfrondBezig] = useState(false);
  const [toewijzenBezig, setToewijzenBezig] = useState(false);
  const [toonVerloren, setToonVerloren] = useState(false);

  useEffect(() => { getTeamMembers().then(setTeamMembers).catch(() => {}); }, []);
  useEffect(() => { listLeveranciers({ inclusiefInactief: false }).then(setLeveranciers).catch(() => {}); }, []);

  // Het project dat aan deze deal hangt, plus alles wat eraan vastzit.
  const laadProject = useCallback(async () => {
    if (!dealId) return;
    setProjectLaden(true);
    try {
      const p = await getProjectByDeal(dealId);
      setProject(p);
      if (!p) { setFacturen([]); setProjectWerkbonnen([]); setOverzicht(null); setInkopen([]); return; }
      const [fact, wbs, ovz, inko] = await Promise.all([
        magBedragen ? getProjectInvoices(p.id).catch(() => []) : Promise.resolve([]),
        getWerkbonnenByProject(p.id).catch(() => []),
        magKosten ? getProjectKostenOverzicht(p.id).catch(() => null) : Promise.resolve(null),
        magKosten ? listProjectKosten(p.id).catch(() => []) : Promise.resolve([]),
      ]);
      setFacturen(fact); setProjectWerkbonnen(wbs); setOverzicht(ovz); setInkopen(inko);
    } catch (e) {
      console.error('[bb:projectkaart] laden mislukt', e);
    } finally {
      setProjectLaden(false);
    }
  }, [dealId, magBedragen, magKosten]);

  useEffect(() => { laadProject(); }, [laadProject]);

  // Werkbonnen: die van het project, aangevuld met werkbonnen die rechtstreeks
  // aan de deal hangen (zo zijn ze aangemaakt vanuit een agenda-item).
  const bonnen = useMemo(() => {
    const uitDeal = werkbonnen.filter(w => w.dealId === dealId);
    const alles = [...projectWerkbonnen];
    uitDeal.forEach(w => { if (!alles.some(x => x.id === w.id)) alles.push(w); });
    return alles;
  }, [projectWerkbonnen, werkbonnen, dealId]);

  const offs = useMemo(() => offertes.filter(o => o.dealId === dealId), [offertes, dealId]);
  const naamVan = useCallback(
    id => teamMembers.find(m => m.id === id || m.profileId === id)?.fullName || '',
    [teamMembers],
  );
  const planning = useMemo(() => planRegels(bonnen, naamVan), [bonnen, naamVan]);
  const { wijzig: wijzigInkoop, verwijder: verwijderInkoop } = useInkopenBewerken(setInkopen);

  const gefactureerd = facturen.reduce((s, f) => s + (f.totaalIncl || 0), 0);
  const waarde = project?.projectValue || deal?.value || 0;
  const lostStage = stages.find(s => /verlor/i.test(s.label || '')) || null;
  const vandaag = new Date().toISOString().slice(0, 10);

  // ── Acties op de deal ──
  const wijzigFase = async stageId => {
    if (!deal || stageId === deal.stage) return;
    setFaseBezig(true);
    try {
      const bij = await updateDealStage(deal.id, stageId);
      setBewerkt(bij);
      bumpRefresh?.();
    } catch (e) {
      toast.error(e.message || 'Fase wijzigen mislukt');
    } finally {
      setFaseBezig(false);
    }
  };

  const zetAfgerond = async aan => {
    if (!deal) return;
    setAfrondBezig(true);
    try {
      const bij = await zetDealAfgerond(deal.id, aan);
      setBewerkt(bij);
      toast.success(aan ? 'Project afgerond' : 'Project heropend');
      bumpRefresh?.();
    } catch (e) {
      toast.error(e.message || 'Afronden mislukt');
    } finally {
      setAfrondBezig(false);
    }
  };

  const wijzigToewijzing = async ids => {
    if (!deal) return;
    setToewijzenBezig(true);
    try {
      const bij = await updateDeal(deal.id, { assigned_to_ids: ids, assigned_to: ids[0] || null });
      setBewerkt(bij);
      bumpRefresh?.();
    } catch (e) {
      toast.error(e.message || 'Toewijzen mislukt');
    } finally {
      setToewijzenBezig(false);
    }
  };

  const voegInkoopToe = async form => {
    if (!project) return;
    const nieuw = await createProjectKost(project.id, form);
    setInkopen(l => [...l, nieuw]);
  };

  // ── Volledig scherm: dezelfde klasse als de bestaande drawers ──
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const drawer = document.querySelector('.drawer');
    if (!drawer) return;
    if (fullscreen) {
      const sb = document.querySelector('.sidebar') || document.querySelector('aside');
      drawer.style.setProperty('--fs-left', `${sb ? sb.offsetWidth : 232}px`);
      drawer.classList.add('klant-fullscreen');
    } else {
      drawer.classList.remove('klant-fullscreen');
      drawer.style.removeProperty('--fs-left');
    }
    return () => {
      drawer.classList.remove('klant-fullscreen');
      drawer.style.removeProperty('--fs-left');
    };
  }, [fullscreen]);

  const laden = gedeeldLaden || projectLaden;

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-body" style={{ padding: 0 }}>
          {!deal ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--dl)' }}>
              {laden ? 'Project laden…' : 'Dit project bestaat niet of is niet beschikbaar.'}
            </div>
          ) : (
            <>
              <Kop
                deal={deal} stages={stages} magVerkoop={magVerkoop} magBedragen={magBedragen} waarde={waarde}
                onClose={onClose} fullscreen={fullscreen} onToggleFullscreen={() => setFullscreen(f => !f)}
                openCustomer={openCustomer}
                onFase={wijzigFase} faseBezig={faseBezig}
                onAfronden={zetAfgerond} afrondBezig={afrondBezig}
                onVerloren={() => setToonVerloren(true)}
                teamMembers={teamMembers} onToewijzing={wijzigToewijzing} toewijzenBezig={toewijzenBezig}
              />

              <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
                <Aanvraag deal={deal} klant={klant} project={project} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={sectieKop}>Het verloop</div>

                  {/* 1 — Offertes */}
                  {offs.length ? (
                    <Stap nr="1" titel="Offertes" sub={`${offs.length} ${offs.length === 1 ? 'offerte' : 'offertes'}`}>
                      <div className="lrows">
                        {offs.map(o => (
                          <div key={o.id} className="lrow" onClick={() => setPage?.('offertes', { id: o.id })}>
                            <div className="lrow-main">
                              <div className="lrow-title">{o.omschrijving || o.nummer || ''}</div>
                              {o.omschrijving && o.nummer && <div className="lrow-sub">{o.nummer}</div>}
                            </div>
                            <OfferteBadge status={o.status} />
                            {magBedragen && <div className="lrow-amount">{fmt(o.totaalIncl)}</div>}
                          </div>
                        ))}
                      </div>
                    </Stap>
                  ) : (
                    <Stap nr="1" titel="Offertes" sub="Nog geen offerte" leeg>
                      Maak de offerte zodra je weet wat het werk is.
                    </Stap>
                  )}

                  {/* 2 — Planning */}
                  {planning.length ? (
                    <Stap nr="2" titel="Planning" sub={`${planning.length} ingeplande ${planning.length === 1 ? 'dag' : 'dagen'}`}>
                      <div className="lrows">
                        <PlanningRegels
                          regels={planning}
                          onOpen={r => setPage?.('werkbonnen', { id: r.werkbon.id })}
                          vandaag={vandaag}
                          toonTitel
                          variant="lrow"
                        />
                      </div>
                    </Stap>
                  ) : (
                    <Stap nr="2" titel="Planning" sub="Nog niets ingepland" leeg>
                      Plan pas in als de klant akkoord is.
                    </Stap>
                  )}

                  {/* 3 — Werkbonnen */}
                  {bonnen.length ? (
                    <Stap nr="3" titel="Werkbonnen" sub={`${bonnen.length} ${bonnen.length === 1 ? 'werkbon' : 'werkbonnen'}`}>
                      <div className="lrows">
                        {[...bonnen]
                          .sort((a, b) => String(b.geplandOp || '').localeCompare(String(a.geplandOp || '')))
                          .map(w => (
                            <div key={w.id} className="lrow" onClick={() => setPage?.('werkbonnen', { id: w.id })}>
                              <div className="lrow-main">
                                <div className="lrow-title">{w.titel || 'Werkbon'}</div>
                                <div className="lrow-sub">{w.nummer || 'geen nummer'}{w.locatie ? ` · ${w.locatie}` : ''}</div>
                              </div>
                              <StatusBadge status={w.status} domain="werkbon" />
                              <span className="lrow-date">{w.geplandOp ? korteDatum(w.geplandOp) : 'niet ingepland'}</span>
                            </div>
                          ))}
                      </div>
                    </Stap>
                  ) : (
                    <Stap nr="3" titel="Werkbonnen" sub="Nog geen werkbonnen" leeg>
                      Een werkbon maak je als de datum bekend is.
                    </Stap>
                  )}

                  {/* 4 — Facturen. Zonder het recht op bedragen heeft dit blok
                      niets te tonen: een factuur is een bedrag. */}
                  {magBedragen && (facturen.length ? (
                    <Stap nr="4" titel="Facturen" sub={`${facturen.length} ${facturen.length === 1 ? 'factuur' : 'facturen'}`}
                      rechts={<span className="lrow-amount">{fmt(gefactureerd)}</span>}>
                      <div className="lrows">
                        {facturen.map(f => (
                          <div key={f.id} className="lrow" onClick={() => setPage?.('facturen', { id: f.id })}>
                            <div className="lrow-num">{f.nummer || ''}</div>
                            <div className="lrow-meta">
                              {fmtDatum(f.factuurdatum)}
                              {f.vervaldatum && ` · vervalt ${fmtDatum(f.vervaldatum)}`}
                            </div>
                            <FactuurBadge f={f} />
                            <div className="lrow-amount">{fmt(f.totaalIncl)}</div>
                          </div>
                        ))}
                      </div>
                    </Stap>
                  ) : (
                    <Stap nr="4" titel="Facturen" sub="Nog niet gefactureerd" leeg>
                      {project ? 'Factureer als het werk klaar is, of in termijnen.' : 'Er hangt nog geen project aan deze aanvraag.'}
                    </Stap>
                  ))}

                  {/* 5 — Kosten en marge. Achter 'kosten' én het pakket, net als
                      de kostentab van het project. */}
                  {magKosten && project && (
                    <Stap nr="5" titel="Kosten en marge"
                      sub={overzicht ? `${overzicht.inkopen.regels.length + overzicht.materiaal.regels.length} regels` : 'laden…'}
                      rechts={magBedragen && overzicht
                        ? <span className="lrow-amount" style={{ color: gefactureerd - overzicht.totaal < 0 ? '#dc2626' : 'inherit' }}>
                            {fmt0(gefactureerd - overzicht.totaal)}
                          </span>
                        : null}>
                      {overzicht && magBedragen && (
                        <div className="card card-p" style={{ padding: 14, background: '#fafafa', marginBottom: 12 }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                            <div>
                              <div style={labelStijl}>Gefactureerd</div>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{fmt0(gefactureerd)}</div>
                            </div>
                            <div>
                              <div style={labelStijl}>Kosten</div>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{fmt0(overzicht.totaal)}</div>
                            </div>
                            <div>
                              <div style={labelStijl}>Marge</div>
                              <div style={{ fontWeight: 600, fontSize: 13, color: gefactureerd - overzicht.totaal < 0 ? '#dc2626' : 'inherit' }}>
                                {fmt0(gefactureerd - overzicht.totaal)}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                      <InkopenKaart
                        kosten={inkopen}
                        leveranciers={leveranciers}
                        onLeverancierBij={g => setLeveranciers(l => [...l, g].sort((a, b) => a.naam.localeCompare(b.naam, 'nl')))}
                        canEdit={magBewerken('projecten_bewerken')}
                        loading={projectLaden}
                        onAdd={voegInkoopToe}
                        onUpdate={wijzigInkoop}
                        onDelete={verwijderInkoop}
                      />
                    </Stap>
                  )}

                  {!magBedragen && (
                    <div className="card card-p" style={{ padding: 14, background: '#fafafa' }}>
                      <div style={{ fontSize: 13, color: 'var(--dm)' }}>
                        Bedragen, facturen en marge zijn niet zichtbaar met jouw rechten.
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {toonVerloren && deal && (
        <VerlorenModal
          deal={deal}
          lostStage={lostStage}
          onClose={() => setToonVerloren(false)}
          onSaved={bij => { setBewerkt(bij); bumpRefresh?.(); }}
        />
      )}
    </>
  );
}

export default ProjectkaartDrawer;
