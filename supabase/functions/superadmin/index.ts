// superadmin — alle gegevens en handelingen van de superadmin.
//
// Alleen voor superbeheerders; zie
// _shared/superadmin.ts. Elke handeling die iets verandert, of iets gevoeligs
// opent (een gesprek met Boss, een schermafdruk), staat in superadmin_log.
//
// POST { actie, ... }
//   Lezen:     overzicht, aanvragen, klanten, klant, omzet, support,
//              boss-gesprek, analytics, systeem, logboek, zoek
//   Wijzigen:  aanvraag-fase, aanvraag-stap, notitie, vandaag,
//              klant-pakket, klant-proef-verlengen, klant-blokkeren,
//              melding-status, melding-notitie, screenshot, prijsactie,
//              boss-afgehandeld, stripe-ophalen
//
// Websites lopen via de bestaande functie website-beheer (zelfde poort en
// logboek), zodat alle handelingen daar ongewijzigd blijven.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { CORS, json } from '../_shared/billing.ts'
import { clientFout } from '../_shared/clientFout.ts'
import { alleRijen } from '../_shared/alleRijen.ts'
import { eisSuperbeheerder, metLog, serviceClient, type Superbeheerder, type LogSoort } from '../_shared/superadmin.ts'
import { wijzigAbonnement } from '../_shared/abonnementWijzigen.ts'
import { haalAlleFacturen, reconstrueerOmzet } from '../_shared/stripeFacturen.ts'

const PRIJS: Record<string, number> = { starter: 29, groei: 39, team: 59 }
const PAKKET_LABEL: Record<string, string> = { starter: 'Starter', groei: 'Groei', team: 'Team' }
const EXTRA_GEBRUIKER = 10
const FASEN = ['nieuw', 'contact', 'demo', 'proef', 'klant', 'afgewezen']
const FASE_LABEL: Record<string, string> = { nieuw: 'Nieuw', contact: 'Contact gehad', demo: 'Demo', proef: 'In proef', klant: 'Klant', afgewezen: 'Afgewezen' }
const FASE_RANG: Record<string, number> = { nieuw: 0, contact: 1, demo: 2, proef: 3, klant: 4 }

// Norm per stap van het websitetraject, in dagen, en wie er aan zet is.
const WEBSITE_NORM: Record<string, { dagen: number; wie: 'wij' | 'klant'; label: string }> = {
  wacht_op_intake:  { dagen: 7,  wie: 'klant', label: 'Wacht op intake' },
  intake_ontvangen: { dagen: 2,  wie: 'wij',   label: 'Intake ontvangen' },
  in_bouw:          { dagen: 10, wie: 'wij',   label: 'In bouw' },
  ter_beoordeling:  { dagen: 5,  wie: 'klant', label: 'Ter beoordeling' },
}

const DAG = 86400000
const dagenSinds = (iso: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / DAG) : 0)
const dagenTot = (iso: string | null) => (iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / DAG) : 0)
const maandVan = (iso: string) => iso.slice(0, 7) + '-01'

class Fout extends Error {
  constructor(bericht: string, public status = 400) { super(bericht) }
}

// ── Gedeelde lezers ─────────────────────────────────────────────────────────
async function superadminFormulieren(admin: any): Promise<string[]> {
  const { data } = await admin.from('website_forms').select('id').eq('settings->>bestemming', 'superadmin')
  return (data ?? []).map((f: any) => f.id)
}

async function laadBedrijven(admin: any) {
  const [bedrijven, subs, gebruikers, modules, planModules, upgrades, websites] = await Promise.all([
    alleRijen(() => admin.from('companies').select('id, name, email, phone, city, branche, status, created_at, logo_url, branding_color, is_testbedrijf, eigenaar_id, kvk, btw_number, address, postal_code, website, aanmeldbron, opgezegd_op')),
    alleRijen(() => admin.from('subscriptions').select('*')),
    admin.rpc('sa_gebruikers').then((r: any) => r.data ?? []),
    alleRijen(() => admin.from('company_modules').select('company_id, module_key, actief').eq('actief', true), 1000, ['company_id', 'module_key']),
    admin.from('plan_modules').select('module_key, label, price').then((r: any) => r.data ?? []),
    admin.from('upgrade_requests').select('*').eq('status', 'open').then((r: any) => r.data ?? []),
    admin.from('website_aanvragen').select('company_id, status, pakket, status_gewijzigd_op, site_url').then((r: any) => r.data ?? []),
  ])
  const moduleprijs = new Map(planModules.map((m: any) => [m.module_key, Number(m.price) || 0]))
  return bedrijven.map((c: any) => {
    const s = subs.find((x: any) => x.company_id === c.id) ?? null
    const leden = gebruikers.filter((g: any) => g.company_id === c.id && g.actief)
    const mods = modules.filter((m: any) => m.company_id === c.id).map((m: any) => m.module_key)
    const betaald = s && (['actief', 'betaalprobleem'].includes(s.status)
      || (s.status === 'opgezegd' && new Date(s.stopt_op ?? s.current_period_end ?? 0) > new Date()))
    const mrr = betaald
      ? (PRIJS[s.plan] ?? 0) + (Number(s.extra_gebruikers) || 0) * EXTRA_GEBRUIKER + mods.reduce((t: number, k: string) => t + Number(moduleprijs.get(k) ?? 0), 0)
      : 0
    const eigenaar = leden.find((g: any) => g.id === c.eigenaar_id) ?? leden.find((g: any) => g.role === 'admin') ?? leden[0] ?? null
    const laatsteLogin = leden.reduce((m: string | null, g: any) => (g.laatste_login && (!m || g.laatste_login > m) ? g.laatste_login : m), null)
    return {
      id: c.id, naam: c.name, email: c.email, telefoon: c.phone || eigenaar?.telefoon || leden.find((g: any) => g.telefoon)?.telefoon || '',
      plaats: c.city, branche: c.branche, bedrijfStatus: c.status, aangemaakt: c.created_at, logoUrl: c.logo_url, kleur: c.branding_color,
      isTest: c.is_testbedrijf === true, kvk: c.kvk, btw: c.btw_number, adres: c.address, postcode: c.postal_code, website: c.website,
      aanmeldbron: c.aanmeldbron,
      eigenaar: eigenaar ? { naam: eigenaar.full_name, email: eigenaar.email, telefoon: eigenaar.telefoon } : null,
      gebruikers: leden.length, laatsteLogin, mrr, modules: mods,
      abonnement: s ? {
        id: s.id, plan: s.plan, status: s.status, interval: s.billing_interval, proefTot: s.trial_ends_at,
        gestart: s.started_at, stoptOp: s.stopt_op, verplichtingTot: s.verplichting_tot, heeftStripe: !!s.stripe_subscription_id,
        stripeKlant: s.stripe_customer_id, extraGebruikers: s.extra_gebruikers, welkomstactie: s.welkomstactie,
        opgezegdOp: s.cancelled_at, periodeEind: s.current_period_end,
      } : null,
      status: statusVan(c, s),
      upgradeVerzoek: upgrades.find((u: any) => u.company_id === c.id) ?? null,
      websiteTraject: websites.find((w: any) => w.company_id === c.id) ?? null,
    }
  })
}

// Eén status voor de lijst: proef, actief, betaalprobleem, opgezegd, geblokkeerd, geen.
function statusVan(c: any, s: any): string {
  if (c.status === 'geblokkeerd') return 'geblokkeerd'
  if (!s) return 'geen'
  if (s.status === 'trial') return 'proef'
  if (s.status === 'betaalprobleem') return 'betaalprobleem'
  if (s.status === 'opgezegd' || c.status === 'opgezegd') return 'opgezegd'
  if (s.status === 'actief') return 'actief'
  return s.status ?? 'geen'
}

async function activiteitPerBedrijf(admin: any, weken = 7): Promise<Map<string, number[]>> {
  const { data } = await admin.rpc('sa_activiteit', { p_weken: weken })
  const start = new Date()
  start.setUTCHours(0, 0, 0, 0)
  const dag = (start.getUTCDay() + 6) % 7
  start.setUTCDate(start.getUTCDate() - dag - (weken - 1) * 7)
  const uit = new Map<string, number[]>()
  for (const r of data ?? []) {
    const index = Math.round((new Date(r.week + 'T00:00:00Z').getTime() - start.getTime()) / (7 * DAG))
    if (index < 0 || index >= weken) continue
    const reeks = uit.get(r.company_id) ?? new Array(weken).fill(0)
    reeks[index] += Number(r.aantal)
    uit.set(r.company_id, reeks)
  }
  return uit
}

// Aanvragen via bossbase.nl, met hun pipeline. Nieuwe aanvragen krijgen hier
// hun rij; een aanvraag waarvan het e-mailadres inmiddels een account heeft,
// schuift door naar "in proef" of "klant" (nooit terug).
async function laadAanvragen(admin: any) {
  const formulieren = await superadminFormulieren(admin)
  if (!formulieren.length) return []
  const inquiries = await alleRijen(() => admin.from('inquiries')
    .select('id, name, company_name, email, phone, subject, message, source_url, metadata, is_test, created_at, status')
    .in('form_id', formulieren).order('created_at', { ascending: false }))
  const pipeline = await alleRijen(() => admin.from('sa_aanvragen').select('*'), 1000, ['inquiry_id'])
  const perId = new Map(pipeline.map((p: any) => [p.inquiry_id, p]))

  const ontbreekt = inquiries.filter((i: any) => !perId.has(i.id))
  if (ontbreekt.length) {
    const nieuw = ontbreekt.map((i: any) => ({ inquiry_id: i.id, fase: 'nieuw', aangemaakt_op: i.created_at, fase_gewijzigd_op: i.created_at }))
    await admin.from('sa_aanvragen').upsert(nieuw, { onConflict: 'inquiry_id', ignoreDuplicates: true })
    for (const n of nieuw) perId.set(n.inquiry_id, { ...n, afwijsreden: null, volgende_stap: null, company_id: null })
  }

  const notities = await alleRijen(() => admin.from('sa_notities').select('*').eq('doel_soort', 'aanvraag').order('op', { ascending: false }))

  const uit = []
  for (const i of inquiries) {
    const p: any = perId.get(i.id)
    let fase = p.fase
    let companyId = p.company_id
    if (fase !== 'afgewezen' && !i.is_test && i.email) {
      const { data: gevonden } = await admin.rpc('sa_bedrijf_bij_email', { p_email: i.email })
      if (gevonden) {
        const { data: bedrijfsfase } = await admin.rpc('sa_fase_van_bedrijf', { p_company_id: gevonden })
        if (bedrijfsfase && FASE_RANG[bedrijfsfase] > FASE_RANG[fase]) {
          await admin.from('sa_aanvragen').update({ fase: bedrijfsfase, company_id: gevonden, fase_gewijzigd_op: new Date().toISOString() }).eq('inquiry_id', i.id)
          fase = bedrijfsfase
          companyId = gevonden
        } else if (!companyId) {
          await admin.from('sa_aanvragen').update({ company_id: gevonden }).eq('inquiry_id', i.id)
          companyId = gevonden
        }
      }
    }
    const bron = (i.metadata?.bron as string) || null
    uit.push({
      id: i.id, naam: i.name, bedrijf: i.company_name, email: i.email, telefoon: i.phone,
      onderwerp: i.subject, bericht: i.message, pagina: i.source_url, branche: i.metadata?.branche ?? null,
      kanaal: bron, isTest: i.is_test === true, ontvangen: i.created_at,
      fase, afwijsreden: p.afwijsreden, volgendeStap: p.volgende_stap, companyId, faseSinds: p.fase_gewijzigd_op,
      oudeStatus: i.status,
      notities: notities.filter((n: any) => n.doel_id === i.id).map((n: any) => ({ op: n.op, door: n.door_naam, tekst: n.tekst })),
    })
  }
  return uit
}

// ── Vandaag ─────────────────────────────────────────────────────────────────
async function overzicht(admin: any) {
  const [bedrijven, aanvragen, vandaag, facturen, webBetalingen, websites, verzoeken, meldingen, boss, syncs, mailFouten, crons] = await Promise.all([
    laadBedrijven(admin),
    laadAanvragen(admin),
    admin.from('sa_vandaag').select('*').then((r: any) => r.data ?? []),
    admin.from('stripe_facturen').select('*').eq('betaalstatus', 'mislukt').then((r: any) => r.data ?? []),
    admin.from('website_betalingen').select('id, company_id, soort, omschrijving, bedrag, status, created_at, fout').eq('status', 'mislukt').then((r: any) => r.data ?? []),
    admin.from('website_aanvragen').select('company_id, status, pakket, status_gewijzigd_op, aangevraagd_op, intake_ontvangen_op').then((r: any) => r.data ?? []),
    admin.from('website_verzoeken').select('id, company_id, soort, omschrijving, status, created_at').eq('status', 'nieuw').then((r: any) => r.data ?? []),
    admin.from('meldingen').select('id, nummer, soort, status, omschrijving, bedrijf_naam, aangemaakt_op').eq('status', 'nieuw').then((r: any) => r.data ?? []),
    admin.from('boss_conversations').select('id, company_id, user_id, titel, doorzet_verstuurd_op, doorzet_afgehandeld_op').not('doorzet_verstuurd_op', 'is', null).is('doorzet_afgehandeld_op', null).then((r: any) => r.data ?? []),
    admin.from('accounting_sync_runs').select('company_id, provider, onderdeel, gestart_op, gelukt, fout').gte('gestart_op', new Date(Date.now() - 7 * DAG).toISOString()).order('gestart_op', { ascending: false }).limit(2000).then((r: any) => r.data ?? []),
    admin.from('mail_fouten').select('id, soort, ontvanger, bedrijf_naam, fout, opgetreden_op').gte('opgetreden_op', new Date(Date.now() - DAG).toISOString()).then((r: any) => r.data ?? []),
    admin.rpc('sa_cron_status').then((r: any) => r.data ?? []),
  ])
  const naam = (id: string | null) => bedrijven.find((b: any) => b.id === id)?.naam ?? 'Onbekend bedrijf'
  const bedrijf = (id: string | null) => bedrijven.find((b: any) => b.id === id)
  const nu = Date.now()
  const verborgen = (sleutel: string) => {
    const v = vandaag.find((x: any) => x.sleutel === sleutel)
    return v && (v.status === 'klaar' || (v.status === 'later' && v.tot && new Date(v.tot).getTime() > nu))
  }
  const acties: any[] = []
  const voeg = (a: any) => { if (!verborgen(a.sleutel)) acties.push(a) }

  // 1. Geld
  for (const f of facturen) {
    const b = bedrijf(f.company_id)
    voeg({ sleutel: `factuur:${f.stripe_invoice_id}`, prio: 1, soort: 'betaling', titel: `${b?.naam ?? 'Onbekend bedrijf'} · € ${Number(f.bedrag ?? 0).toFixed(2).replace('.', ',')}`,
      sub: [f.fout, f.pogingen ? `poging ${f.pogingen}` : null, f.volgende_poging ? `volgende ${new Date(f.volgende_poging).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}` : 'geen nieuwe poging gepland'].filter(Boolean).join(' · '),
      op: f.factuurdatum, companyId: f.company_id, telefoon: b?.telefoon, url: f.url })
  }
  for (const b of bedrijven.filter((x: any) => x.status === 'betaalprobleem' && !x.isTest)) {
    if (facturen.some((f: any) => f.company_id === b.id)) continue
    voeg({ sleutel: `betaalprobleem:${b.id}`, prio: 1, soort: 'betaling', titel: `${b.naam} · betaalprobleem`, sub: 'Stripe meldt een achterstallige betaling', op: null, companyId: b.id, telefoon: b.telefoon })
  }
  for (const w of webBetalingen) {
    voeg({ sleutel: `webbetaling:${w.id}`, prio: 1, soort: 'betaling', titel: `${naam(w.company_id)} · ${w.omschrijving ?? w.soort} € ${Number(w.bedrag ?? 0).toFixed(2).replace('.', ',')}`,
      sub: w.fout ?? 'Betaling website mislukt', op: w.created_at, companyId: w.company_id, telefoon: bedrijf(w.company_id)?.telefoon, website: true })
  }
  // 2. Nieuwe aanvragen en Boss
  for (const a of aanvragen.filter((x: any) => x.fase === 'nieuw' && !x.isTest)) {
    voeg({ sleutel: `aanvraag:${a.id}`, prio: 2, soort: 'aanvraag', titel: `${a.naam}${a.bedrijf ? ' · ' + a.bedrijf : ''}`,
      sub: [a.onderwerp, a.kanaal, a.bericht ? `"${String(a.bericht).slice(0, 80)}${String(a.bericht).length > 80 ? '…' : ''}"` : null].filter(Boolean).join(' · '),
      op: a.ontvangen, aanvraagId: a.id, telefoon: a.telefoon, email: a.email })
  }
  for (const g of boss) {
    voeg({ sleutel: `boss:${g.id}:${g.doorzet_verstuurd_op}`, prio: 2, soort: 'boss', titel: `${naam(g.company_id)} · vraag via Boss`, sub: g.titel ?? 'Doorgezet gesprek', op: g.doorzet_verstuurd_op, companyId: g.company_id, bossId: g.id })
  }
  // 3. Proef loopt af, upgradeverzoeken
  for (const b of bedrijven.filter((x: any) => x.status === 'proef' && !x.isTest && x.abonnement?.proefTot)) {
    const proefTot: string = (b.abonnement as any).proefTot
    const tot = dagenTot(proefTot)
    if (tot > 4 || tot < -3) continue
    voeg({ sleutel: `proef:${b.id}:${String(proefTot).slice(0, 10)}`, prio: 3, soort: 'proef',
      titel: `${b.naam} · ${tot > 1 ? `nog ${tot} dagen` : tot === 1 ? 'nog 1 dag' : tot === 0 ? 'loopt vandaag af' : `${-tot} ${tot === -1 ? 'dag' : 'dagen'} verlopen`}`,
      sub: `laatst ingelogd ${b.laatsteLogin ? new Date(b.laatsteLogin).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }) : 'nooit'} · ${b.gebruikers} ${b.gebruikers === 1 ? 'gebruiker' : 'gebruikers'}`,
      op: proefTot, companyId: b.id, telefoon: b.telefoon, proef: true })
  }
  for (const b of bedrijven.filter((x: any) => x.upgradeVerzoek && !x.isTest)) {
    const u = b.upgradeVerzoek
    voeg({ sleutel: `upgrade:${u.id}`, prio: 3, soort: 'upgrade', titel: `${b.naam} wil ${u.gewenst_plan ? `naar ${PAKKET_LABEL[u.gewenst_plan] ?? u.gewenst_plan}` : 'meer'}`,
      sub: [u.gewenste_modules?.length ? `modules: ${u.gewenste_modules.join(', ')}` : null, u.aanleiding].filter(Boolean).join(' · ') || 'Upgradeverzoek van een medewerker',
      op: u.created_at, companyId: b.id, telefoon: b.telefoon })
  }
  // 4. Websites over hun norm, nieuwe verzoeken, bugmeldingen
  for (const w of websites) {
    const n = WEBSITE_NORM[w.status]
    if (!n || bedrijf(w.company_id)?.isTest) continue
    const sinds = w.status_gewijzigd_op ?? (w.status === 'intake_ontvangen' ? w.intake_ontvangen_op : w.aangevraagd_op)
    const d = dagenSinds(sinds)
    if (d <= n.dagen) continue
    voeg({ sleutel: `website:${w.company_id}:${w.status}:${String(sinds).slice(0, 10)}`, prio: 4, soort: 'website',
      titel: n.wie === 'wij' ? `${naam(w.company_id)} · ${n.label.toLowerCase()} sinds ${d} dagen` : `${naam(w.company_id)} reageert niet (${n.label.toLowerCase()})`,
      sub: `Norm ${n.dagen} dagen · ${n.wie === 'wij' ? 'wij zijn aan zet' : 'de klant is aan zet'} · pakket ${w.pakket ?? '—'}`, op: sinds, companyId: w.company_id, website: true })
  }
  for (const v of verzoeken) {
    voeg({ sleutel: `verzoek:${v.id}`, prio: 4, soort: 'website', titel: `${naam(v.company_id)} · ${v.soort === 'wijziging' ? 'wijzigingsverzoek' : v.soort}`, sub: String(v.omschrijving ?? '').slice(0, 120), op: v.created_at, companyId: v.company_id, website: true })
  }
  for (const m of meldingen.filter((x: any) => x.soort === 'bug')) {
    voeg({ sleutel: `melding:${m.id}`, prio: 4, soort: 'melding', titel: `Bug #${m.nummer} · ${m.bedrijf_naam ?? ''}`, sub: String(m.omschrijving ?? '').slice(0, 120), op: m.aangemaakt_op, meldingId: m.id })
  }
  // 5. Systeem
  const reeksen = new Map<string, any[]>()
  for (const r of syncs) {
    const k = `${r.company_id}|${r.provider}|${r.onderdeel}`
    reeksen.set(k, [...(reeksen.get(k) ?? []), r])
  }
  for (const [k, runs] of reeksen) {
    let reeks = 0
    for (const r of runs) { if (r.gelukt) break; reeks++ }
    if (reeks < 2) continue
    const [companyId, provider, onderdeel] = k.split('|')
    voeg({ sleutel: `sync:${k}:${String(runs[0].gestart_op).slice(0, 10)}`, prio: 5, soort: 'systeem', titel: `${provider} · ${onderdeel ?? ''} bij ${naam(companyId)} faalt ${reeks}× op rij`, sub: String(runs[0].fout ?? '').slice(0, 140), op: runs[0].gestart_op, companyId })
  }
  if (mailFouten.length) {
    voeg({ sleutel: `mail:${new Date().toISOString().slice(0, 10)}`, prio: 5, soort: 'systeem', titel: `${mailFouten.length} ${mailFouten.length === 1 ? 'mail' : 'mails'} niet aangekomen (24 uur)`, sub: mailFouten.slice(0, 3).map((m: any) => `${m.soort} → ${m.ontvanger}`).join(' · '), op: mailFouten[0]?.opgetreden_op })
  }
  for (const c of crons.filter((x: any) => Number(x.mislukt_24u) > 0)) {
    voeg({ sleutel: `cron:${c.naam}:${new Date().toISOString().slice(0, 10)}`, prio: 5, soort: 'systeem', titel: `Geplande taak ${c.naam} mislukte ${c.mislukt_24u}× (24 uur)`, sub: String(c.melding ?? '').slice(0, 140), op: c.laatst })
  }
  acties.sort((a, b) => a.prio - b.prio || String(b.op ?? '').localeCompare(String(a.op ?? '')))

  // Wat er recent gebeurde (7 dagen).
  const week = Date.now() - 7 * DAG
  const recent: any[] = []
  for (const b of bedrijven.filter((x: any) => !x.isTest)) {
    if (new Date(b.aangemaakt).getTime() > week) recent.push({ op: b.aangemaakt, soort: 'aanmelding', tekst: `${b.naam} startte een proef`, sub: [b.branche, b.aanmeldbron].filter(Boolean).join(' · '), companyId: b.id })
    if (b.abonnement?.opgezegdOp && new Date(b.abonnement.opgezegdOp).getTime() > week) recent.push({ op: b.abonnement.opgezegdOp, soort: 'opzegging', tekst: `${b.naam} zegde op`, sub: PAKKET_LABEL[b.abonnement.plan] ?? '', companyId: b.id })
  }
  const { data: betaald } = await admin.from('stripe_facturen').select('company_id, bedrag, omschrijving, betaald_op').eq('betaalstatus', 'betaald').gte('betaald_op', new Date(week).toISOString())
  for (const f of betaald ?? []) recent.push({ op: f.betaald_op, soort: 'betaling', tekst: `${naam(f.company_id)} betaalde € ${Number(f.bedrag ?? 0).toFixed(2).replace('.', ',')}`, sub: f.omschrijving ?? '', companyId: f.company_id })
  for (const w of websites.filter((x: any) => x.intake_ontvangen_op && new Date(x.intake_ontvangen_op).getTime() > week)) recent.push({ op: w.intake_ontvangen_op, soort: 'website', tekst: `${naam(w.company_id)} stuurde de intake in`, sub: `Website ${w.pakket ?? ''}`, companyId: w.company_id })
  for (const f of facturen.filter((x: any) => x.factuurdatum && new Date(x.factuurdatum).getTime() > week)) recent.push({ op: f.factuurdatum, soort: 'mislukt', tekst: `${naam(f.company_id)}: betaling mislukt`, sub: f.fout ?? '', companyId: f.company_id })
  recent.sort((a, b) => String(b.op).localeCompare(String(a.op)))

  const echt = bedrijven.filter((b: any) => !b.isTest)
  const mrr = echt.reduce((t: number, b: any) => t + b.mrr, 0)
  const vorigeMaand = new Date(); vorigeMaand.setUTCDate(1); vorigeMaand.setUTCMonth(vorigeMaand.getUTCMonth() - 1)
  const { data: vorige } = await admin.from('omzet_momentopnames').select('mrr').eq('maand', vorigeMaand.toISOString().slice(0, 10))
  const mrrVorige = (vorige ?? []).length ? (vorige ?? []).reduce((t: number, r: any) => t + Number(r.mrr), 0) : null

  return {
    acties,
    recent: recent.slice(0, 8),
    cijfers: {
      open: acties.length,
      metGeld: acties.filter(a => a.prio === 1).length,
      nieuweAanvragen: aanvragen.filter((a: any) => a.fase === 'nieuw' && !a.isTest).length,
      aanvragenVandaag: aanvragen.filter((a: any) => !a.isTest && dagenSinds(a.ontvangen) === 0).length,
      proeven: echt.filter((b: any) => b.status === 'proef').length,
      proevenAflopend: echt.filter((b: any) => b.status === 'proef' && b.abonnement?.proefTot && dagenTot(b.abonnement.proefTot) <= 7 && dagenTot(b.abonnement.proefTot) >= 0).length,
      mrr, mrrVorige,
    },
  }
}

async function badges(admin: any) {
  const [o, meld, boss] = await Promise.all([
    overzicht(admin),
    admin.from('meldingen').select('id', { count: 'exact', head: true }).eq('status', 'nieuw'),
    admin.from('boss_conversations').select('id', { count: 'exact', head: true }).not('doorzet_verstuurd_op', 'is', null).is('doorzet_afgehandeld_op', null),
  ])
  return {
    vandaag: o.acties.length,
    aanvragen: o.cijfers.nieuweAanvragen,
    support: (meld.count ?? 0) + (boss.count ?? 0),
    websites: o.acties.filter((a: any) => a.soort === 'website').length,
    systeem: o.acties.filter((a: any) => a.soort === 'systeem').length,
  }
}

// ── Omzet ───────────────────────────────────────────────────────────────────
async function omzet(admin: any) {
  const [opnames, bedrijven, webBetalingen, webFacturen] = await Promise.all([
    alleRijen(() => admin.from('omzet_momentopnames').select('maand, company_id, plan, status, mrr, bron'), 1000, ['maand', 'company_id']),
    alleRijen(() => admin.from('companies').select('id, created_at, is_testbedrijf')),
    admin.from('website_betalingen').select('bedrag, betaald_op, wijze, status').in('wijze', ['ideal', 'los']).in('status', ['betaald', 'afgerond']).then((r: any) => r.data ?? []),
    admin.from('stripe_facturen').select('bedrag_excl, bedrag, betaald_op').eq('soort', 'website').eq('betaalstatus', 'betaald').then((r: any) => r.data ?? []),
  ])
  const test = new Set(bedrijven.filter((b: any) => b.is_testbedrijf).map((b: any) => b.id))
  const echt = opnames.filter((o: any) => !test.has(o.company_id))

  // Maanden: van de eerste aanmelding of opname tot nu, maximaal 24.
  const nu = new Date()
  const eind = new Date(Date.UTC(nu.getUTCFullYear(), nu.getUTCMonth(), 1))
  const eersteBedrijf = bedrijven.filter((b: any) => !b.is_testbedrijf).map((b: any) => b.created_at).sort()[0]
  const eersteOpname = echt[0]?.maand
  const beginIso = [eersteBedrijf, eersteOpname].filter(Boolean).sort()[0] ?? nu.toISOString()
  let begin = new Date(maandVan(beginIso) + 'T00:00:00Z')
  const minimaal = new Date(Date.UTC(eind.getUTCFullYear(), eind.getUTCMonth() - 23, 1))
  if (begin < minimaal) begin = minimaal

  const betaalden = new Map<string, Set<string>>() // maand → bedrijven met mrr > 0
  for (const o of echt) if (Number(o.mrr) > 0) {
    const s = betaalden.get(o.maand) ?? new Set(); s.add(o.company_id); betaalden.set(o.maand, s)
  }
  const ooitBetaald = new Set(echt.filter((o: any) => Number(o.mrr) > 0).map((o: any) => o.company_id))

  const maanden = []
  for (let m = new Date(begin); m <= eind; m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))) {
    const sleutel = m.toISOString().slice(0, 10)
    const vorige = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() - 1, 1)).toISOString().slice(0, 10)
    const rijen = echt.filter((o: any) => o.maand === sleutel)
    const perPlan = (p: string) => rijen.filter((o: any) => o.plan === p).reduce((t: number, o: any) => t + Number(o.mrr), 0)
    const nuSet = betaalden.get(sleutel) ?? new Set()
    const vorigSet = betaalden.get(vorige) ?? new Set()
    const gestart = bedrijven.filter((b: any) => !b.is_testbedrijf && maandVan(b.created_at) === sleutel)
    const website = webBetalingen.filter((w: any) => w.betaald_op && maandVan(w.betaald_op) === sleutel).reduce((t: number, w: any) => t + Number(w.bedrag ?? 0), 0)
      + webFacturen.filter((f: any) => f.betaald_op && maandVan(f.betaald_op) === sleutel).reduce((t: number, f: any) => t + Number(f.bedrag_excl ?? f.bedrag ?? 0), 0)
    maanden.push({
      maand: sleutel,
      starter: perPlan('starter'), groei: perPlan('groei'), team: perPlan('team'),
      totaal: rijen.reduce((t: number, o: any) => t + Number(o.mrr), 0),
      heeftGegevens: rijen.length > 0,
      bron: rijen.some((o: any) => o.bron === 'momentopname') ? 'momentopname' : rijen.length ? 'stripe' : null,
      // Instroom en uitstroom alleen als de vorige maand ook gegevens heeft;
      // anders telt de eerste maand met gegevens iedereen als nieuw.
      nieuw: echt.some((o: any) => o.maand === vorige) ? [...nuSet].filter(id => !vorigSet.has(id)).length : 0,
      opgezegd: echt.some((o: any) => o.maand === vorige) ? [...vorigSet].filter(id => !nuSet.has(id)).length : 0,
      betalend: nuSet.size,
      proefGestart: gestart.length,
      proefBetaald: gestart.filter((b: any) => ooitBetaald.has(b.id)).length,
      website,
    })
  }
  const { data: eerste } = await admin.from('omzet_momentopnames').select('maand').eq('bron', 'momentopname').order('maand').limit(1).maybeSingle()
  const { count: facturen } = await admin.from('stripe_facturen').select('stripe_invoice_id', { count: 'exact', head: true })
  return { maanden, momentopnamesVanaf: eerste?.maand ?? null, facturenBewaard: facturen ?? 0 }
}

// ── Analytics ───────────────────────────────────────────────────────────────
async function analytics(admin: any, dagen: number) {
  const vanaf = new Date(Date.now() - dagen * DAG)
  const vanafDag = vanaf.toISOString().slice(0, 10)
  const [meting, bedrijven, inquiries, gebruik, activiteit, opnames, eersteMeting] = await Promise.all([
    alleRijen(() => admin.from('website_meting').select('dag, soort, naam, pad, bron, bezoeker, apparaat').gte('dag', vanafDag)),
    alleRijen(() => admin.from('companies').select('id, created_at, is_testbedrijf, status, aanmeldbron')),
    (async () => { const f = await superadminFormulieren(admin); return f.length ? alleRijen(() => admin.from('inquiries').select('id, created_at, metadata, is_test').in('form_id', f).gte('created_at', vanaf.toISOString())) : [] })(),
    admin.rpc('sa_functiegebruik', { p_dagen: 30 }).then((r: any) => r.data ?? []),
    admin.rpc('sa_activiteit', { p_weken: Math.ceil(dagen / 7) + 3 }).then((r: any) => r.data ?? []),
    alleRijen(() => admin.from('omzet_momentopnames').select('company_id, mrr'), 1000, ['maand', 'company_id']),
    admin.from('website_meting').select('dag').order('dag').limit(1).maybeSingle().then((r: any) => r.data?.dag ?? null),
  ])
  const echteBedrijven = bedrijven.filter((b: any) => !b.is_testbedrijf)
  const nieuw = echteBedrijven.filter((b: any) => new Date(b.created_at) >= vanaf)
  const actiefPer = new Map<string, number>()
  for (const r of activiteit) actiefPer.set(r.company_id, (actiefPer.get(r.company_id) ?? 0) + Number(r.aantal))
  const betaald = new Set(opnames.filter((o: any) => Number(o.mrr) > 0).map((o: any) => o.company_id))

  // Unieke bezoekers = per dag unieke hashes, opgeteld (de hash wisselt per dag).
  const uniek = (rijen: any[]) => new Set(rijen.map((r: any) => `${r.dag}|${r.bezoeker}`)).size
  const paginas = meting.filter((m: any) => m.soort === 'pagina')
  const klikken = meting.filter((m: any) => m.soort === 'gebeurtenis' && m.naam === 'registratie_klik')

  const trechter = [
    { stap: 'Bezoekers bossbase.nl', aantal: uniek(paginas), bron: 'meting' },
    { stap: 'Klik op "Probeer gratis"', aantal: uniek(klikken), bron: 'meting' },
    { stap: 'Account aangemaakt', aantal: nieuw.length, bron: 'database' },
    { stap: 'Proef echt gebruikt (10+ handelingen)', aantal: nieuw.filter((b: any) => (actiefPer.get(b.id) ?? 0) >= 10).length, bron: 'database' },
    { stap: 'Betalend', aantal: nieuw.filter((b: any) => betaald.has(b.id)).length, bron: 'database' },
  ]

  // Bron van een bezoeker op een dag = de eerste bron die geen interne is.
  const bronVan = new Map<string, string>()
  for (const m of paginas) {
    const k = `${m.dag}|${m.bezoeker}`
    if (!bronVan.has(k) && m.bron && m.bron !== 'Intern') bronVan.set(k, m.bron)
  }
  for (const m of paginas) { const k = `${m.dag}|${m.bezoeker}`; if (!bronVan.has(k)) bronVan.set(k, 'Direct') }
  const perBron = new Map<string, { bezoekers: number; aanmeldingen: number; aanvragen: number }>()
  const tel = (bron: string) => { if (!perBron.has(bron)) perBron.set(bron, { bezoekers: 0, aanmeldingen: 0, aanvragen: 0 }); return perBron.get(bron)! }
  for (const bron of bronVan.values()) tel(bron).bezoekers++
  for (const b of nieuw) tel(b.aanmeldbron || 'Onbekend').aanmeldingen++
  for (const i of inquiries.filter((x: any) => !x.is_test)) tel(i.metadata?.bron || 'Onbekend').aanvragen++

  const perPad = new Map<string, Set<string>>()
  for (const m of paginas) { const s = perPad.get(m.pad) ?? new Set(); s.add(`${m.dag}|${m.bezoeker}`); perPad.set(m.pad, s) }
  const perDag = new Map<string, Set<string>>()
  for (const m of paginas) { const s = perDag.get(m.dag) ?? new Set(); s.add(m.bezoeker); perDag.set(m.dag, s) }
  const apparaten = new Map<string, number>()
  for (const m of paginas) apparaten.set(m.apparaat ?? 'onbekend', (apparaten.get(m.apparaat ?? 'onbekend') ?? 0) + 1)

  // Functiegebruik: bedrijven die niet getest, geblokkeerd of opgezegd zijn.
  const actieveIds = new Set(echteBedrijven.filter((b: any) => !['geblokkeerd', 'opgezegd'].includes(b.status)).map((b: any) => b.id))
  const perFunctie = new Map<string, Set<string>>()
  for (const r of gebruik) if (actieveIds.has(r.company_id)) { const s = perFunctie.get(r.functie) ?? new Set(); s.add(r.company_id); perFunctie.set(r.functie, s) }

  return {
    dagen, meetVanaf: eersteMeting,
    trechter,
    bronnen: [...perBron.entries()].map(([bron, w]) => ({ bron, ...w })).sort((a, b) => b.bezoekers - a.bezoekers || b.aanmeldingen - a.aanmeldingen),
    paginas: [...perPad.entries()].map(([pad, s]) => ({ pad, bezoekers: s.size })).sort((a, b) => b.bezoekers - a.bezoekers).slice(0, 12),
    perDag: [...perDag.entries()].map(([dag, s]) => ({ dag, bezoekers: s.size })).sort((a, b) => a.dag.localeCompare(b.dag)),
    apparaten: [...apparaten.entries()].map(([apparaat, n]) => ({ apparaat, n })),
    functies: [...perFunctie.entries()].map(([functie, s]) => ({ functie, bedrijven: s.size })).sort((a, b) => b.bedrijven - a.bedrijven),
    actieveBedrijven: actieveIds.size,
  }
}

// ── Handelingen ─────────────────────────────────────────────────────────────
async function bedrijfsnaam(admin: any, id: string) {
  const { data } = await admin.from('companies').select('name').eq('id', id).maybeSingle()
  if (!data) throw new Fout('Bedrijf niet gevonden', 404)
  return data.name as string
}

async function voerUit(admin: any, wie: Superbeheerder, body: any): Promise<unknown> {
  const log = (regel: { actie: string; omschrijving: string; soort: LogSoort; companyId?: string | null; doel?: string | null; doelId?: string | null; voor?: unknown }, f: () => Promise<any>, na?: (u: any) => unknown) =>
    metLog(admin, wie, regel, f, na)

  switch (body.actie) {
    // ── Lezen ──
    case 'overzicht': return overzicht(admin)
    case 'badges': return badges(admin)
    case 'aanvragen': return { aanvragen: await laadAanvragen(admin) }
    case 'klanten': {
      const [bedrijven, act] = await Promise.all([laadBedrijven(admin), activiteitPerBedrijf(admin)])
      return { klanten: bedrijven.map((b: any) => ({ ...b, activiteit: act.get(b.id) ?? new Array(7).fill(0) })) }
    }
    case 'klant': {
      const id = String(body.id ?? '')
      const alle = await laadBedrijven(admin)
      const b = alle.find((x: any) => x.id === id)
      if (!b) throw new Fout('Bedrijf niet gevonden', 404)
      const [act, gebruik, functies, facturen, webBetalingen, website, notities, logboek, leden, aanvragen] = await Promise.all([
        activiteitPerBedrijf(admin),
        admin.rpc('sa_gebruik_totaal', { p_company_id: id }).then((r: any) => r.data ?? {}),
        admin.rpc('sa_functiegebruik', { p_dagen: 30 }).then((r: any) => (r.data ?? []).filter((x: any) => x.company_id === id)),
        admin.from('stripe_facturen').select('*').eq('company_id', id).order('factuurdatum', { ascending: false }).then((r: any) => r.data ?? []),
        admin.from('website_betalingen').select('*').eq('company_id', id).order('created_at', { ascending: false }).then((r: any) => r.data ?? []),
        admin.from('website_aanvragen').select('*').eq('company_id', id).maybeSingle().then((r: any) => r.data ?? null),
        admin.from('sa_notities').select('*').eq('doel_soort', 'klant').eq('doel_id', id).order('op', { ascending: false }).then((r: any) => r.data ?? []),
        admin.from('superadmin_log').select('*').eq('company_id', id).order('op', { ascending: false }).limit(100).then((r: any) => r.data ?? []),
        admin.rpc('sa_gebruikers').then((r: any) => (r.data ?? []).filter((g: any) => g.company_id === id)),
        admin.from('sa_aanvragen').select('inquiry_id, fase').eq('company_id', id).then((r: any) => r.data ?? []),
      ])
      return { klant: { ...b, activiteit: act.get(id) ?? new Array(7).fill(0), gebruik, functies, facturen, webBetalingen, websiteTraject: website, notities, logboek, leden, aanvragen } }
    }
    case 'omzet': return omzet(admin)
    case 'support': {
      const [meldingen, boss, actie] = await Promise.all([
        admin.from('meldingen').select('*').order('aangemaakt_op', { ascending: false }).limit(500).then((r: any) => r.data ?? []),
        admin.from('boss_conversations').select('id, company_id, user_id, titel, doorzet_verstuurd_op, doorzet_afgehandeld_op, updated_at').not('doorzet_verstuurd_op', 'is', null).order('doorzet_verstuurd_op', { ascending: false }).limit(200).then((r: any) => r.data ?? []),
        admin.from('platform_instellingen').select('waarde, bijgewerkt_op').eq('sleutel', 'meldactie').maybeSingle().then((r: any) => r.data ?? null),
      ])
      const ids = [...new Set(boss.flatMap((g: any) => [g.company_id]).filter(Boolean))]
      const { data: bedrijven } = ids.length ? await admin.from('companies').select('id, name').in('id', ids) : { data: [] }
      const gebruikers = await admin.rpc('sa_gebruikers').then((r: any) => r.data ?? [])
      return {
        meldingen,
        boss: boss.map((g: any) => ({ ...g, bedrijf: (bedrijven ?? []).find((b: any) => b.id === g.company_id)?.name ?? '', door: gebruikers.find((u: any) => u.id === g.user_id)?.full_name ?? '' })),
        prijsactie: actie,
      }
    }
    case 'analytics': return analytics(admin, Math.min(Math.max(Number(body.dagen) || 30, 1), 365))
    case 'systeem': {
      const week = new Date(Date.now() - 7 * DAG).toISOString()
      const [syncs, mails, stripe, snelstart, crons] = await Promise.all([
        admin.from('accounting_sync_runs').select('id, company_id, provider, onderdeel, bron, gestart_op, klaar_op, gelukt, fout, samenvatting').gte('gestart_op', week).order('gestart_op', { ascending: false }).limit(500).then((r: any) => r.data ?? []),
        admin.from('mail_fouten').select('*').gte('opgetreden_op', week).order('opgetreden_op', { ascending: false }).limit(200).then((r: any) => r.data ?? []),
        admin.from('stripe_billing_events').select('event_id, type, company_id, verwerkt_op, resultaat').order('verwerkt_op', { ascending: false }).limit(40).then((r: any) => r.data ?? []),
        admin.from('snelstart_webhook_log').select('*').order('ontvangen_op', { ascending: false }).limit(20).then((r: any) => r.data ?? []),
        admin.rpc('sa_cron_status').then((r: any) => r.data ?? []),
      ])
      const ids = [...new Set([...syncs, ...stripe, ...snelstart].map((r: any) => r.company_id).filter(Boolean))]
      const { data: bedrijven } = ids.length ? await admin.from('companies').select('id, name').in('id', ids) : { data: [] }
      return { syncs, mails, stripe, snelstart, crons, bedrijven: bedrijven ?? [] }
    }
    case 'logboek': {
      let q = admin.from('superadmin_log').select('*').order('op', { ascending: false }).limit(Math.min(Number(body.limiet) || 300, 1000))
      if (body.soort) q = q.eq('soort', body.soort)
      if (body.companyId) q = q.eq('company_id', body.companyId)
      const { data } = await q
      return { logboek: data ?? [] }
    }
    case 'zoek': {
      const q = String(body.q ?? '').trim().toLowerCase()
      if (q.length < 2) return { treffers: [] }
      const [bedrijven, aanvragen] = await Promise.all([laadBedrijven(admin), laadAanvragen(admin)])
      const t = (s: unknown) => String(s ?? '').toLowerCase()
      const cijfers = q.replace(/\D/g, '')
      const telMatch = (s: unknown) => cijfers.length >= 4 && String(s ?? '').replace(/\D/g, '').includes(cijfers)
      return {
        treffers: [
          ...bedrijven.filter((b: any) => [b.naam, b.email, b.eigenaar?.naam, b.eigenaar?.email].some(x => t(x).includes(q)) || telMatch(b.telefoon))
            .slice(0, 6).map((b: any) => ({ soort: 'klant', id: b.id, titel: b.naam, sub: ['Klant', b.eigenaar?.naam, b.telefoon].filter(Boolean).join(' · ') })),
          ...aanvragen.filter((a: any) => [a.naam, a.bedrijf, a.email].some(x => t(x).includes(q)) || telMatch(a.telefoon))
            .slice(0, 4).map((a: any) => ({ soort: 'aanvraag', id: a.id, titel: `${a.naam}${a.bedrijf ? ' · ' + a.bedrijf : ''}`, sub: `Aanvraag · ${FASE_LABEL[a.fase]} · ${a.email ?? ''}` })),
        ],
      }
    }

    // ── Wijzigen ──
    case 'aanvraag-fase': {
      const fase = String(body.fase ?? '')
      if (!FASEN.includes(fase)) throw new Fout('Onbekende fase')
      const { data: rij } = await admin.from('sa_aanvragen').select('*, inquiries(name, company_name)').eq('inquiry_id', body.id).maybeSingle()
      if (!rij) throw new Fout('Aanvraag niet gevonden', 404)
      const reden = fase === 'afgewezen' ? String(body.reden ?? '').trim() || 'Geen reden' : null
      const doel = `${rij.inquiries?.name ?? ''}${rij.inquiries?.company_name ? ' · ' + rij.inquiries.company_name : ''}`
      return log({ actie: 'aanvraag.fase', soort: 'aanvraag', omschrijving: `Aanvraag: ${FASE_LABEL[rij.fase]} → ${FASE_LABEL[fase]}${reden ? ` (${reden})` : ''}`, doel, doelId: body.id, companyId: rij.company_id, voor: { fase: rij.fase, afwijsreden: rij.afwijsreden } }, async () => {
        const { error } = await admin.from('sa_aanvragen').update({ fase, afwijsreden: reden, fase_gewijzigd_op: new Date().toISOString() }).eq('inquiry_id', body.id)
        if (error) throw error
        return { ok: true }
      }, () => ({ fase, afwijsreden: reden }))
    }
    case 'aanvraag-stap': {
      const tekst = String(body.tekst ?? '').trim().slice(0, 300) || null
      const { data: rij } = await admin.from('sa_aanvragen').select('volgende_stap, company_id, inquiries(name, company_name)').eq('inquiry_id', body.id).maybeSingle()
      if (!rij) throw new Fout('Aanvraag niet gevonden', 404)
      return log({ actie: 'aanvraag.stap', soort: 'aanvraag', omschrijving: `Volgende stap: ${tekst ?? '(leeg)'}`, doel: rij.inquiries?.name, doelId: body.id, companyId: rij.company_id, voor: { volgende_stap: rij.volgende_stap } }, async () => {
        const { error } = await admin.from('sa_aanvragen').update({ volgende_stap: tekst }).eq('inquiry_id', body.id)
        if (error) throw error
        return { ok: true }
      })
    }
    case 'notitie': {
      const soort = body.soort === 'aanvraag' ? 'aanvraag' : 'klant'
      const tekst = String(body.tekst ?? '').trim().slice(0, 4000)
      if (!tekst) throw new Fout('Lege notitie')
      const doel = soort === 'klant' ? await bedrijfsnaam(admin, body.id) : (await admin.from('inquiries').select('name').eq('id', body.id).maybeSingle()).data?.name
      return log({ actie: `${soort}.notitie`, soort: soort === 'klant' ? 'klant' : 'aanvraag', omschrijving: 'Notitie toegevoegd', doel, doelId: body.id, companyId: soort === 'klant' ? body.id : null }, async () => {
        const { data, error } = await admin.from('sa_notities').insert({ doel_soort: soort, doel_id: body.id, tekst, door: wie.id, door_naam: wie.naam }).select('*').single()
        if (error) throw error
        return { notitie: { op: data.op, door: data.door_naam, tekst: data.tekst } }
      })
    }
    case 'vandaag': {
      const sleutel = String(body.sleutel ?? '')
      const status = body.status === 'klaar' ? 'klaar' : 'later'
      if (!sleutel) throw new Fout('Geen sleutel')
      // "Later" = morgen om 06:00 (Nederlandse tijd, ruim genomen).
      const morgen = new Date(); morgen.setUTCDate(morgen.getUTCDate() + 1); morgen.setUTCHours(4, 0, 0, 0)
      const soort: LogSoort = sleutel.startsWith('aanvraag') ? 'aanvraag' : /^(website|verzoek|webbetaling)/.test(sleutel) ? 'website' : /^(melding|boss)/.test(sleutel) ? 'support' : /^(sync|mail|cron)/.test(sleutel) ? 'systeem' : 'klant'
      return log({ actie: `vandaag.${status}`, soort, omschrijving: `Vandaag: ${status === 'klaar' ? 'afgehandeld' : 'naar morgen'} — ${String(body.titel ?? sleutel).slice(0, 160)}`, doel: body.titel ?? null, doelId: sleutel, companyId: body.companyId ?? null }, async () => {
        const { error } = await admin.from('sa_vandaag').upsert({ sleutel, status, tot: status === 'later' ? morgen.toISOString() : null, door: wie.id, op: new Date().toISOString() })
        if (error) throw error
        return { ok: true }
      })
    }
    case 'klant-pakket': {
      const plan = String(body.plan ?? '')
      if (!PRIJS[plan]) throw new Fout('Onbekend pakket')
      const naam = await bedrijfsnaam(admin, body.id)
      const { data: s } = await admin.from('subscriptions').select('id, plan, status, stripe_subscription_id, extra_gebruikers').eq('company_id', body.id).maybeSingle()
      const viaStripe = !!s?.stripe_subscription_id
      return log({ actie: 'klant.pakket', soort: 'klant', omschrijving: `Pakket ${PAKKET_LABEL[s?.plan] ?? 'geen'} → ${PAKKET_LABEL[plan]}${viaStripe ? ' (via Stripe)' : ' (alleen in de app, geen Stripe-abonnement)'}`, doel: naam, doelId: body.id, companyId: body.id, voor: { plan: s?.plan ?? null } }, async () => {
        if (viaStripe) {
          const { data: mods } = await admin.from('company_modules').select('module_key').eq('company_id', body.id).eq('actief', true)
          const antwoord = await wijzigAbonnement(admin, body.id, plan, Number(s.extra_gebruikers) || 0, (mods ?? []).map((m: any) => m.module_key))
          const inhoud = await antwoord.json().catch(() => ({}))
          if (!antwoord.ok) throw new Fout(inhoud?.error ?? 'Stripe weigerde de wijziging', antwoord.status)
          return { ok: true, viaStripe, bericht: inhoud?.bericht ?? null, resultaat: inhoud?.resultaat ?? null }
        }
        if (s?.id) {
          const { error } = await admin.from('subscriptions').update({ plan, price_per_month: PRIJS[plan] }).eq('id', s.id)
          if (error) throw error
        } else {
          const { error } = await admin.from('subscriptions').insert({ company_id: body.id, plan, status: 'trial', price_per_month: PRIJS[plan] })
          if (error) throw error
        }
        return { ok: true, viaStripe }
      }, () => ({ plan }))
    }
    case 'klant-proef-verlengen': {
      const dagen = Math.min(Math.max(Math.trunc(Number(body.dagen) || 7), 1), 60)
      const naam = await bedrijfsnaam(admin, body.id)
      const { data: s } = await admin.from('subscriptions').select('id, status, trial_ends_at, stripe_subscription_id').eq('company_id', body.id).maybeSingle()
      if (!s) throw new Fout('Dit bedrijf heeft geen abonnement')
      if (s.stripe_subscription_id || s.status !== 'trial') throw new Fout('Alleen een lopende of verlopen proef kan verlengd worden (dit bedrijf heeft een betaald abonnement)')
      const basis = Math.max(Date.now(), new Date(s.trial_ends_at ?? Date.now()).getTime())
      const nieuw = new Date(basis + dagen * DAG).toISOString()
      return log({ actie: 'klant.proef_verlengen', soort: 'klant', omschrijving: `Proef met ${dagen} dagen verlengd tot ${new Date(nieuw).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })}`, doel: naam, doelId: body.id, companyId: body.id, voor: { trial_ends_at: s.trial_ends_at } }, async () => {
        const { error } = await admin.from('subscriptions').update({ trial_ends_at: nieuw }).eq('id', s.id)
        if (error) throw error
        return { ok: true, proefTot: nieuw }
      }, () => ({ trial_ends_at: nieuw }))
    }
    case 'klant-blokkeren': {
      const blokkeren = body.blokkeren !== false
      const naam = await bedrijfsnaam(admin, body.id)
      const { data: c } = await admin.from('companies').select('status').eq('id', body.id).maybeSingle()
      const { data: s } = await admin.from('subscriptions').select('id, status').eq('company_id', body.id).maybeSingle()
      // Deblokkeren zet het abonnement terug op wat het vóór de blokkade was
      // (uit het logboek); de oude superadmin zette het altijd op "actief".
      let terug = 'actief'
      if (!blokkeren) {
        const { data: laatste } = await admin.from('superadmin_log').select('voor').eq('company_id', body.id).eq('actie', 'klant.blokkeren').eq('uitkomst', 'gelukt').order('op', { ascending: false }).limit(1).maybeSingle()
        terug = laatste?.voor?.abonnementStatus && laatste.voor.abonnementStatus !== 'geblokkeerd' ? laatste.voor.abonnementStatus : 'actief'
      }
      return log({ actie: blokkeren ? 'klant.blokkeren' : 'klant.deblokkeren', soort: 'klant', omschrijving: blokkeren ? 'Account geblokkeerd; alle gebruikers worden uitgelogd' : `Account gedeblokkeerd (abonnement terug naar "${terug}")`, doel: naam, doelId: body.id, companyId: body.id, voor: { bedrijfStatus: c?.status, abonnementStatus: s?.status } }, async () => {
        const { error } = await admin.from('companies').update({ status: blokkeren ? 'geblokkeerd' : 'actief' }).eq('id', body.id)
        if (error) throw error
        if (s?.id) {
          const { error: e2 } = await admin.from('subscriptions').update({ status: blokkeren ? 'geblokkeerd' : terug }).eq('id', s.id)
          if (e2) throw new Error(`bedrijf bijgewerkt, abonnement niet (${e2.message})`)
        }
        return { ok: true }
      })
    }
    case 'melding-status': {
      const status = String(body.status ?? '')
      if (!['nieuw', 'opgepakt', 'afgehandeld', 'afgewezen'].includes(status)) throw new Fout('Onbekende status')
      const { data: m } = await admin.from('meldingen').select('nummer, status, company_id, bedrijf_naam').eq('id', body.id).maybeSingle()
      if (!m) throw new Fout('Melding niet gevonden', 404)
      return log({ actie: 'melding.status', soort: 'support', omschrijving: `Melding #${m.nummer}: ${m.status} → ${status}`, doel: m.bedrijf_naam, doelId: body.id, companyId: m.company_id, voor: { status: m.status } }, async () => {
        const { error } = await admin.from('meldingen').update({ status }).eq('id', body.id)
        if (error) throw error
        return { ok: true }
      })
    }
    case 'melding-notitie': {
      const notitie = String(body.notitie ?? '').slice(0, 4000)
      const { data: m } = await admin.from('meldingen').select('nummer, notitie, company_id, bedrijf_naam').eq('id', body.id).maybeSingle()
      if (!m) throw new Fout('Melding niet gevonden', 404)
      return log({ actie: 'melding.notitie', soort: 'support', omschrijving: `Notitie bij melding #${m.nummer}`, doel: m.bedrijf_naam, doelId: body.id, companyId: m.company_id, voor: { notitie: m.notitie } }, async () => {
        const { error } = await admin.from('meldingen').update({ notitie }).eq('id', body.id)
        if (error) throw error
        return { ok: true }
      })
    }
    case 'screenshot': {
      const { data: m } = await admin.from('meldingen').select('nummer, screenshot_pad, company_id, bedrijf_naam').eq('id', body.id).maybeSingle()
      if (!m?.screenshot_pad) throw new Fout('Geen schermafdruk', 404)
      return log({ actie: 'melding.screenshot', soort: 'support', omschrijving: `Schermafdruk van melding #${m.nummer} geopend`, doel: m.bedrijf_naam, doelId: body.id, companyId: m.company_id }, async () => {
        const { data, error } = await admin.storage.from('meldingen').createSignedUrl(m.screenshot_pad, 600)
        if (error || !data) throw new Error('Schermafdruk niet gevonden')
        return { url: data.signedUrl }
      })
    }
    case 'prijsactie': {
      const prijzen = Array.isArray(body.prijzen) ? body.prijzen.map((p: unknown) => String(p).trim()).filter(Boolean).slice(0, 10) : []
      const actief = body.actief === true
      const { data: oud } = await admin.from('platform_instellingen').select('waarde').eq('sleutel', 'meldactie').maybeSingle()
      const waarde = { ...(oud?.waarde ?? {}), actief, prijzen }
      return log({ actie: 'support.prijsactie', soort: 'support', omschrijving: `Prijsactie ${actief ? 'aan' : 'uit'}${prijzen.length ? ` · ${prijzen.length} prijzen` : ''}`, doel: 'Meldpunt', voor: oud?.waarde ?? null }, async () => {
        const { error } = await admin.from('platform_instellingen').update({ waarde, bijgewerkt_op: new Date().toISOString(), bijgewerkt_door: wie.id }).eq('sleutel', 'meldactie')
        if (error) throw error
        return { ok: true, waarde }
      }, () => waarde)
    }
    case 'boss-gesprek': {
      const { data: g } = await admin.from('boss_conversations').select('id, company_id, titel, messages, doorzet_verstuurd_op').eq('id', body.id).maybeSingle()
      if (!g) throw new Fout('Gesprek niet gevonden', 404)
      if (!g.doorzet_verstuurd_op) throw new Fout('Alleen doorgezette gesprekken zijn in te zien', 403)
      const naam = await bedrijfsnaam(admin, g.company_id).catch(() => '')
      return log({ actie: 'support.boss_lezen', soort: 'support', omschrijving: `Doorgezet gesprek met Boss gelezen${g.titel ? `: ${g.titel}` : ''}`, doel: naam, doelId: body.id, companyId: g.company_id }, async () => ({ gesprek: g }))
    }
    case 'boss-afgehandeld': {
      const { data: g } = await admin.from('boss_conversations').select('id, company_id, titel').eq('id', body.id).maybeSingle()
      if (!g) throw new Fout('Gesprek niet gevonden', 404)
      const naam = await bedrijfsnaam(admin, g.company_id).catch(() => '')
      return log({ actie: 'support.boss_afgehandeld', soort: 'support', omschrijving: `Boss-vraag afgehandeld${g.titel ? `: ${g.titel}` : ''}`, doel: naam, doelId: body.id, companyId: g.company_id }, async () => {
        const { error } = await admin.from('boss_conversations').update({ doorzet_afgehandeld_op: new Date().toISOString() }).eq('id', body.id)
        if (error) throw error
        return { ok: true }
      })
    }
    case 'stripe-ophalen': {
      return log({ actie: 'systeem.stripe_ophalen', soort: 'systeem', omschrijving: 'Facturen opgehaald uit Stripe en omzethistorie afgeleid', doel: 'Stripe' }, async () => {
        const { aantal, fouten } = await haalAlleFacturen(admin)
        const maanden = await reconstrueerOmzet(admin)
        return { facturen: aantal, fouten, omzetRegels: maanden, bericht: `${aantal} facturen opgehaald${fouten ? ` (${fouten} mislukt)` : ''}; ${maanden} maandregels afgeleid voor maanden zonder momentopname` }
      }, (u) => u)
    }
  }
  throw new Fout('Onbekende actie')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Alleen POST' }, 405)
  const admin = serviceClient()
  const wie = await eisSuperbeheerder(req, admin)
  if (wie instanceof Response) return wie
  let body: any
  try { body = await req.json() } catch { return json({ error: 'Ongeldige aanvraag' }, 400) }
  try {
    return json(await voerUit(admin, wie, body))
  } catch (e) {
    if (e instanceof Fout) return json({ error: e.message }, e.status)
    console.error('superadmin:', body?.actie, e)
    return json({ error: clientFout(e) }, 500)
  }
})
