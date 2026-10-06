// ─────────────────────────────────────────────────────────────────────────────
// Facturen en kosten tussen BossBase en Moneybird.
//
// NAAR MONEYBIRD
//   Verkoopfacturen  als EXTERNE verkoopfactuur (external_sales_invoices): ons
//                    factuurnummer blijft leidend (reference) en onze PDF met
//                    huisstijl, IBAN en bedrijfsgegevens gaat als bijlage mee.
//                    Een gewone Moneybird-factuur zou bij verzenden een eigen
//                    nummer krijgen; dan heeft de klant twee nummers voor
//                    dezelfde factuur. Alles behalve concepten; geïmporteerde
//                    facturen nooit terug (zie boekhouding.ts).
//                    Per regel het btw-tarief van de administratie dat bij het
//                    btw-regime hoort, en de omzetrekening. Vervaldatum uit de
//                    betaaltermijn. Creditfacturen gaan met negatieve bedragen.
//   Betalingen       een betaalde factuur krijgt in Moneybird een betaling
//                    (POST …/payments; het oude register_payment verdwijnt op
//                    31-12-2026). Eén keer: moneybird_payment_registered_at.
//   Kosten           als inkoopfactuur met bon, leverancier verplicht, btw-
//                    tarief per percentage en rekening per categorie.
//
// UIT MONEYBIRD
//   Betaalstatus     staat een doorgezette factuur in Moneybird op betaald, dan
//                    ook hier (en dan sturen we die betaling niet terug).
//   Inkoopfacturen   en bonnetjes → kostenregels, één per factuurregel, met
//                    btw, leverancier en bon. Wat we zelf boekten komt niet terug.
//   Verkoopfacturen  die in Moneybird zelf zijn gemaakt → alleen-lezen facturen
//                    ('geboekt' of 'betaald'), zoals "Uit SnelStart".
//
// Alles werkt binnen het tijdsbudget van de run en stopt netjes bij de limiet;
// wat geboekt is, is meteen teruggeschreven, dus de volgende run gaat verder.
//
// Externe referenties van geïmporteerde records:
//   moneybird_<documentId>_<regel>  kostenregel uit inkoopfactuur of bonnetje
//   moneybird_<id>                  verkoopfactuur gemaakt in Moneybird
//   moneybird_x<id>                 externe verkoopfactuur van een ander systeem
// De prullenbak gebruikt het deel tussen voorvoegsel en eerste underscore.
// ─────────────────────────────────────────────────────────────────────────────

import { alleRijen } from './alleRijen.ts'
import { facturenTeBoeken, kostenTeBoeken, getGenegeerd, getVoorkeurRijen, type VoorkeurRij } from './boekhouding.ts'
import { regimeVanRegel } from './snelstart.ts'
import { vandaagIso } from './datumTijd.ts'
import {
  mbFetch, mbSyncLijst, mbSyncOphalen, mbUpload, mbDownload, mbBedrag, isLimiet, MB_HELE_PERIODE,
  type MbKoppeling, type MbFout,
} from './moneybird.ts'
import {
  laadIndeling, kiesOmzetRekening, kiesKostenRekening, kiesVerkoopTarief, kiesInkoopTarief, type Indeling,
} from './moneybirdIndeling.ts'
import {
  zorgVoorKlantContact, werkKlantContactBij, zorgVoorLeverancierContact, importeerLeverancier, klantUitContact,
} from './moneybirdContacten.ts'

const round2 = (n: number) => Math.round(Number(n || 0) * 100) / 100
const MAX_BIJLAGE_BYTES = 10 * 1024 * 1024
const KLANT_JOIN = 'customers(id, name, type, email, phone, address, postcode, city, contactpersoon, kvk_number, btw_number, iban, betaaltermijn_dagen, moneybird_id, moneybird_versie, moneybird_hash)'

type Context = { k: MbKoppeling; ind: Indeling; voork: Record<string, VoorkeurRij>; meldingen: string[] }

export async function laadContext(k: MbKoppeling, meldingen: string[] = []): Promise<Context> {
  return { k, ind: await laadIndeling(k), voork: await getVoorkeurRijen(k.admin, k.companyId, 'moneybird'), meldingen }
}

function plusDagen(iso: string, dagen: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dagen)
  return d.toISOString().slice(0, 10)
}

// ── Verkoopfactuur → externe factuur ────────────────────────────────────────
function regelNaarDetail(ctx: Context, r: any, factuurNummer: string) {
  const regime = regimeVanRegel(r)
  const excl = Number(r.regelprijs) || (r.type === 'vast' ? 1 : Number(r.aantal || 1)) * Number(r.eenheidsprijs || 0)
  const aantal = Number(r.aantal || 1)
  const prijs = Number(r.eenheidsprijs || 0)
  // Aantal × prijs als dat op de cent het regelbedrag geeft; anders 1 × bedrag,
  // zodat het totaal in Moneybird exact het onze is.
  const netjes = r.type !== 'vast' && aantal > 0 && Math.abs(round2(aantal * prijs) - round2(excl)) < 0.005
  return {
    description: r.omschrijving || factuurNummer,
    amount: netjes ? String(aantal) : '1',
    price: mbBedrag(netjes ? prijs : excl),
    tax_rate_id: kiesVerkoopTarief(ctx.ind, ctx.voork, regime),
    ledger_account_id: kiesOmzetRekening(ctx.ind, ctx.voork, regime),
  }
}

/** Boekt één factuur als externe verkoopfactuur; idempotent via facturen.moneybird_id. */
export async function pushFactuur(ctx: Context, factuur: any): Promise<{ moneybirdId: string | null; nieuw: boolean }> {
  const { k } = ctx
  if (factuur.moneybird_id) return { moneybirdId: String(factuur.moneybird_id), nieuw: false }
  const { data: regels } = await k.admin.from('factuur_regels').select('*')
    .eq('factuur_id', factuur.id).order('volgorde', { ascending: true })
  if (!regels?.length) throw new Error('Factuur heeft geen regels')

  const klant = factuur.customers
  if (!klant) throw new Error('Factuur heeft geen klant')
  if (!klant.id) klant.id = factuur.customer_id

  const verlegd = regels.some((r: any) => regimeVanRegel(r) === 'verlegd')
  if (verlegd && !String(klant.btw_number || '').trim()) {
    throw new Error(`Btw verlegd vraagt om het btw-nummer van de klant, en "${klant.name}" heeft er geen. Vul het aan bij de klant.`)
  }
  const contactId = await zorgVoorKlantContact(k, klant, ctx.meldingen)
  if (verlegd) await werkKlantContactBij(k, klant, ctx.meldingen)

  const details = regels.map((r: any) => regelNaarDetail(ctx, r, factuur.nummer))
  const datum = factuur.factuurdatum || vandaagIso()
  const termijn = Number(factuur.betaaltermijn_dagen ?? klant.betaaltermijn_dagen ?? 14)
  const body = {
    external_sales_invoice: {
      contact_id: contactId,
      reference: factuur.nummer,
      date: datum,
      due_date: factuur.vervaldatum || plusDagen(datum, termijn),
      currency: 'EUR',
      prices_are_incl_tax: false,
      source: 'BossBase',
      source_url: `https://www.bossbase.nl/dashboard/facturen/${factuur.id}`,
      details_attributes: details,
    },
  }
  const gemaakt = await mbFetch(k, '/external_sales_invoices', { method: 'POST', body: JSON.stringify(body) })
  const id = gemaakt?.id ? String(gemaakt.id) : null
  if (!id) throw new Error('Moneybird gaf geen id terug voor de factuur')
  // Meteen terugschrijven: de volgende run maakt dan geen tweede aan.
  await k.admin.from('facturen').update({ moneybird_id: id, moneybird_bijlage_gesynct: false }).eq('id', factuur.id)
  factuur.moneybird_id = id

  // Moneybird rekent de btw zelf uit. Wijkt het totaal af van het onze (afronding
  // per regel tegenover per factuur), dan melden we het in plaats van het stil te laten.
  const daar = round2(Number(gemaakt.total_price_incl_tax))
  if (Number.isFinite(daar) && Math.abs(daar - round2(Number(factuur.totaal_incl))) >= 0.01) {
    ctx.meldingen.push(`Factuur ${factuur.nummer}: Moneybird komt op € ${daar.toFixed(2)}, BossBase op € ${round2(factuur.totaal_incl).toFixed(2)}. Controleer de btw-afronding.`)
  }
  return { moneybirdId: id, nieuw: true }
}

/** Hangt onze factuur-PDF aan de externe factuur. Gooit niet. */
export async function pushFactuurPdf(ctx: Context, factuur: any): Promise<{ gelukt: boolean; reden?: string }> {
  const { k } = ctx
  if (!factuur.moneybird_id) return { gelukt: false, reden: 'geen boeking' }
  try {
    const { data: blob, error } = await k.admin.storage.from('factuur-pdfs').download(`${k.companyId}/${factuur.id}.pdf`)
    if (error || !blob) return { gelukt: false, reden: 'ontbreekt' }
    const bytes = new Uint8Array(await blob.arrayBuffer())
    if (bytes.byteLength > MAX_BIJLAGE_BYTES) return { gelukt: false, reden: 'groter dan 10 MB' }
    const soort = factuur.is_credit ? 'Creditfactuur' : 'Factuur'
    await mbUpload(k, `/external_sales_invoices/${factuur.moneybird_id}/attachment`, bytes, `${soort}-${factuur.nummer || factuur.id}.pdf`)
    await k.admin.from('facturen').update({ moneybird_bijlage_gesynct: true }).eq('id', factuur.id)
    return { gelukt: true }
  } catch (err: any) {
    if (isLimiet(err)) throw err
    console.error(`Factuur-PDF ${factuur.nummer} naar Moneybird mislukt:`, err?.message)
    return { gelukt: false, reden: err?.message ?? 'fout' }
  }
}

/** Registreert de betaling van een betaalde factuur in Moneybird (één keer). */
export async function pushBetaling(ctx: Context, factuur: any): Promise<boolean> {
  const { k } = ctx
  if (!factuur.moneybird_id || factuur.status !== 'betaald' || factuur.moneybird_payment_registered_at) return false
  // Een creditnota wordt in Moneybird verrekend of terugbetaald via de bank; een
  // "betaling" van een negatief bedrag registreren we niet.
  if (factuur.is_credit || Number(factuur.totaal_incl) <= 0) return false
  const betaling: Record<string, unknown> = {
    payment_date: factuur.betaald_op || vandaagIso(),
    price: mbBedrag(Number(factuur.totaal_incl)),
  }
  if (factuur.stripe_payment_intent_id) betaling.transaction_identifier = String(factuur.stripe_payment_intent_id)
  try {
    await mbFetch(k, `/external_sales_invoices/${factuur.moneybird_id}/payments`, {
      method: 'POST', body: JSON.stringify({ payment: betaling }),
    })
  } catch (err) {
    // Staat hij in Moneybird al op betaald (bijvoorbeeld via de bank gekoppeld),
    // dan is er niets meer te registreren; niet blijven proberen.
    const f = err as MbFout
    if (f?.status !== 422) throw err
    ctx.meldingen.push(`Betaling van factuur ${factuur.nummer} niet geregistreerd in Moneybird: ${f.message}`)
  }
  await k.admin.from('facturen').update({ moneybird_payment_registered_at: new Date().toISOString() }).eq('id', factuur.id)
  return true
}

// ── Kosten → inkoopfactuur ──────────────────────────────────────────────────
async function pushKostenBijlagen(ctx: Context, cost: any): Promise<{ gelukt: number; overgeslagen: string[] }> {
  const { k } = ctx
  const overgeslagen: string[] = []
  let gelukt = 0
  if (!cost?.bijlage_url || !cost.moneybird_id) return { gelukt, overgeslagen }
  let paden: string[]
  try { const p = JSON.parse(cost.bijlage_url); paden = Array.isArray(p) ? p : [p] } catch { paden = [cost.bijlage_url] }
  for (const pad of paden) {
    const naam = String(pad || '').split('/').pop() || 'bon'
    try {
      if (String(pad).startsWith('http')) { overgeslagen.push(`${naam} (externe URL)`); continue }
      const { data: blob, error } = await k.admin.storage.from('kosten-bijlagen').download(pad)
      if (error || !blob) { overgeslagen.push(`${naam} (niet gevonden)`); continue }
      const bytes = new Uint8Array(await blob.arrayBuffer())
      if (bytes.byteLength > MAX_BIJLAGE_BYTES) { overgeslagen.push(`${naam} (groter dan 10 MB)`); continue }
      const type = /\.pdf$/i.test(naam) ? 'application/pdf' : /\.png$/i.test(naam) ? 'image/png' : 'image/jpeg'
      await mbUpload(k, `/documents/purchase_invoices/${cost.moneybird_id}/attachments`, bytes, naam, type)
      gelukt++
    } catch (err: any) {
      if (isLimiet(err)) throw err
      overgeslagen.push(`${naam} (${err?.message ?? 'fout'})`)
    }
  }
  return { gelukt, overgeslagen }
}

export async function pushKost(ctx: Context, cost: any): Promise<boolean> {
  const { k } = ctx
  if (cost.moneybird_id) return false
  if (!cost.leveranciers?.naam) {
    throw new Error('Geen leverancier ingevuld — vul die aan bij de kostenpost en synchroniseer opnieuw')
  }
  const contactId = await zorgVoorLeverancierContact(k, cost.leveranciers, ctx.meldingen)
  const pct = Number(cost.btw_percentage ?? 21)
  const categorie = String(cost.category || '').trim() || 'Overig'
  const omschrijving = cost.description || categorie
  const body = {
    purchase_invoice: {
      contact_id: contactId,
      reference: `BB-KST-${String(cost.id).slice(0, 8)}`,
      date: cost.cost_date || vandaagIso(),
      currency: 'EUR',
      prices_are_incl_tax: Boolean(cost.btw_inclusief),
      details_attributes: [{
        description: `${omschrijving} (via BossBase)`,
        amount: '1',
        price: mbBedrag(Math.abs(Number(cost.amount || 0))),
        tax_rate_id: kiesInkoopTarief(ctx.ind, ctx.voork, pct),
        ledger_account_id: kiesKostenRekening(ctx.ind, ctx.voork, categorie, ctx.meldingen),
      }],
    },
  }
  const gemaakt = await mbFetch(k, '/documents/purchase_invoices', { method: 'POST', body: JSON.stringify(body) })
  const id = gemaakt?.id ? String(gemaakt.id) : null
  if (!id) throw new Error('Moneybird gaf geen id terug voor de kostenpost')
  cost.moneybird_id = id
  const patch: Record<string, unknown> = { moneybird_id: id, moneybird_bijlage_gesynct: !cost.bijlage_url }
  await k.admin.from('job_costs').update(patch).eq('id', cost.id)
  if (cost.bijlage_url) {
    const r = await pushKostenBijlagen(ctx, cost)
    if (r.gelukt > 0 || r.overgeslagen.length === 0) {
      await k.admin.from('job_costs').update({ moneybird_bijlage_gesynct: true }).eq('id', cost.id)
    }
    if (r.overgeslagen.length) ctx.meldingen.push(`Bon bij "${omschrijving}" niet meegestuurd: ${r.overgeslagen.join(', ')}`)
  }
  return true
}

// ── Import: hulpjes ─────────────────────────────────────────────────────────
function regimeVanTarief(ctx: Context, tariefId: unknown): { regime: string; pct: number } {
  const t = ctx.ind.tarieven.find(x => x.id === String(tariefId))
  if (!t) return { regime: 'normaal', pct: 21 }
  if (t.pct === 9) return { regime: 'verlaagd', pct: 9 }
  if (t.pct === 0) return { regime: /verlegd/i.test(t.naam) ? 'verlegd' : 'vrijgesteld', pct: 0 }
  return { regime: 'normaal', pct: t.pct }
}

async function haalBijlagen(ctx: Context, soortPad: string, doc: any): Promise<string[]> {
  const paden: string[] = []
  for (const a of (doc?.attachments || [])) {
    if (ctx.k.budget?.op(10_000)) break
    const r = await mbDownload(ctx.k, `/${soortPad}/${doc.id}/attachments/${a.id}/download`)
    if (!r) continue
    const naam = String(a.filename || `${a.id}.pdf`)
    const ext = naam.includes('.') ? naam.split('.').pop() : 'pdf'
    const pad = `${ctx.k.companyId}/import-mb-${String(a.id).slice(-10)}.${ext}`
    const { error } = await ctx.k.admin.storage.from('kosten-bijlagen').upload(pad, r.bytes, { contentType: r.type, upsert: true })
    if (!error) paden.push(pad)
  }
  return paden
}

async function klantVoorContact(ctx: Context, contact: any, cache: Map<string, string | null>): Promise<string | null> {
  const id = String(contact?.id || '')
  if (!id) return null
  if (cache.has(id)) return cache.get(id) ?? null
  const { data: bestaand } = await ctx.k.admin.from('customers').select('id')
    .eq('company_id', ctx.k.companyId).eq('moneybird_id', id).maybeSingle()
  const uit: string | null = bestaand?.id ?? await klantUitContact(ctx.k, contact)
  cache.set(id, uit)
  return uit
}

// ── De sync ─────────────────────────────────────────────────────────────────
export type BoekingenUitslag = {
  exported: { facturen: number; kosten: number; betalingen: number }
  imported: { inkoopfacturen: number; verkoopfacturen: number }
  betaaldUitMoneybird: number
  overgeslagenUitPrullenbak: number
  kostenResterend: number
  fouten: string[]
  meldingen: string[]
  rest: boolean
}

export async function syncBoekingen(k: MbKoppeling): Promise<BoekingenUitslag> {
  const u: BoekingenUitslag = {
    exported: { facturen: 0, kosten: 0, betalingen: 0 },
    imported: { inkoopfacturen: 0, verkoopfacturen: 0 },
    betaaldUitMoneybird: 0, overgeslagenUitPrullenbak: 0, kostenResterend: 0,
    fouten: [], meldingen: [], rest: false,
  }
  const db = k.admin
  const co = k.companyId
  const tijdOp = (marge = 15_000) => Boolean(k.budget?.op(marge))
  const ctx = await laadContext(k, u.meldingen)

  try {
    // ── 1. Facturen naar Moneybird ───────────────────────────────────────────
    const teBoeken = await alleRijen(() => facturenTeBoeken(
      db.from('facturen').select(`*, ${KLANT_JOIN}`), co, 'moneybird_id'))
    teBoeken.sort((a: any, b: any) => String(a.factuurdatum || '').localeCompare(String(b.factuurdatum || '')))
    for (const f of teBoeken) {
      if (tijdOp()) { u.rest = true; break }
      try {
        const r = await pushFactuur(ctx, f)
        if (r.nieuw) u.exported.facturen++
        await pushFactuurPdf(ctx, f)
        if (await pushBetaling(ctx, f)) u.exported.betalingen++
      } catch (err: any) {
        if (isLimiet(err)) throw err
        u.fouten.push(`Factuur ${f.nummer}: ${err?.message}`)
      }
    }

    // ── 2. PDF's en betalingen nasturen bij facturen die er al staan ─────────
    if (!tijdOp()) {
      const { data: zonderPdf } = await db.from('facturen')
        .select('id, nummer, is_credit, moneybird_id').eq('company_id', co)
        .not('moneybird_id', 'is', null).is('externe_referentie', null).eq('moneybird_bijlage_gesynct', false).limit(50)
      const missend: string[] = []
      for (const f of (zonderPdf || [])) {
        if (tijdOp()) { u.rest = true; break }
        const r = await pushFactuurPdf(ctx, f)
        if (!r.gelukt && r.reden === 'ontbreekt') missend.push(f.nummer || f.id)
      }
      if (missend.length) {
        u.meldingen.push(`${missend.length} ${missend.length === 1 ? 'factuur staat' : 'facturen staan'} zonder PDF in Moneybird `
          + `(${missend.slice(0, 5).join(', ')}${missend.length > 5 ? ', …' : ''}). Verstuur de factuur vanuit BossBase, dan wordt de PDF alsnog meegestuurd.`)
      }
      const { data: onbetaald } = await db.from('facturen')
        .select('id, nummer, status, is_credit, totaal_incl, betaald_op, stripe_payment_intent_id, moneybird_id, moneybird_payment_registered_at')
        .eq('company_id', co).eq('status', 'betaald').is('externe_referentie', null)
        .not('moneybird_id', 'is', null).is('moneybird_payment_registered_at', null).limit(100)
      for (const f of (onbetaald || [])) {
        if (tijdOp()) { u.rest = true; break }
        try { if (await pushBetaling(ctx, f)) u.exported.betalingen++ } catch (err: any) {
          if (isLimiet(err)) throw err
          u.fouten.push(`Betaling factuur ${f.nummer}: ${err?.message}`)
        }
      }
    }

    // ── 3. Betaalstatus uit Moneybird ────────────────────────────────────────
    if (!tijdOp()) {
      const open = await alleRijen(() => db.from('facturen')
        .select('id, nummer, moneybird_id, externe_referentie').eq('company_id', co)
        .in('status', ['verzonden', 'geboekt']).not('moneybird_id', 'is', null))
      // Eigen facturen en externe van een ander systeem staan bij
      // external_sales_invoices; in Moneybird gemaakte bij sales_invoices.
      const extern = open.filter((f: any) => !f.externe_referentie || String(f.externe_referentie).startsWith('moneybird_x'))
      const gewoon = open.filter((f: any) => f.externe_referentie && !String(f.externe_referentie).startsWith('moneybird_x'))
      for (const [soort, lijst] of [['external_sales_invoices', extern], ['sales_invoices', gewoon]] as const) {
        if (!lijst.length || tijdOp()) continue
        const perId = new Map(lijst.map((f: any) => [String(f.moneybird_id), f]))
        const docs = await mbSyncOphalen(k, soort, [...perId.keys()])
        for (const d of docs) {
          if (d?.state !== 'paid') continue
          const f = perId.get(String(d.id))
          if (!f) continue
          await db.from('facturen').update({
            status: 'betaald',
            betaald_op: String(d.paid_at || vandaagIso()).slice(0, 10),
            // Komt de betaling uit Moneybird, dan sturen we hem niet terug.
            moneybird_payment_registered_at: new Date().toISOString(),
          }).eq('id', f.id)
          u.betaaldUitMoneybird++
        }
      }
    }

    // ── 4. Inkoopfacturen en bonnetjes uit Moneybird ─────────────────────────
    if (!tijdOp()) await importKosten(ctx, u)

    // ── 5. Verkoopfacturen die in Moneybird zijn gemaakt ─────────────────────
    if (!tijdOp()) await importVerkoop(ctx, u)

    // ── 6. Kosten naar Moneybird ─────────────────────────────────────────────
    if (!tijdOp()) await exportKosten(ctx, u)
  } catch (err: any) {
    if (!isLimiet(err)) throw err
    u.rest = true
    u.meldingen.push(err.message)
  }
  return u
}

async function importKosten(ctx: Context, u: BoekingenUitslag) {
  const { k } = ctx
  const db = k.admin
  const co = k.companyId
  const bestaand = await alleRijen(() => db.from('job_costs')
    .select('id, externe_referentie, moneybird_id').eq('company_id', co)
    .or('externe_referentie.like.moneybird_%,moneybird_id.not.is.null'))
  const bekend = new Set<string>()
  const eigen = new Set<string>()
  for (const r of bestaand) {
    const m = /^moneybird_([^_]+)/.exec(String(r.externe_referentie || ''))
    if (m) bekend.add(m[1])
    if (r.moneybird_id) eigen.add(String(r.moneybird_id))
  }
  const genegeerd = await getGenegeerd(db, co, 'moneybird', 'kost')
  const levCache = new Map<string, string>()

  for (const [soort, soortPad, label] of [
    ['documents/purchase_invoices', 'documents/purchase_invoices', 'Inkoopfactuur'],
    ['documents/receipts', 'documents/receipts', 'Bonnetje'],
  ] as const) {
    if (k.budget?.op(20_000)) { u.rest = true; return }
    const lijst = await mbSyncLijst(k, soort, MB_HELE_PERIODE)
    const nieuw = lijst.map(x => x.id).filter(id => {
      if (bekend.has(id) || eigen.has(id)) return false
      if (genegeerd.has(id)) { u.overgeslagenUitPrullenbak++; return false }
      return true
    })
    if (!nieuw.length) continue
    const docs = await mbSyncOphalen(k, soort, nieuw)
    if (docs.length < nieuw.length) u.rest = true
    for (const d of docs) {
      if (k.budget?.op(15_000)) { u.rest = true; return }
      // 'new' = nog niet verwerkt in Moneybird (inbox): gegevens kunnen nog
      // ontbreken. Die komt bij een volgende sync, als hij opgeslagen is.
      if (d.state === 'new') continue
      try {
        const leverancierId = d.contact ? await importeerLeverancier(k, d.contact, levCache) : null
        const bijlagen = await haalBijlagen(ctx, soortPad, d)
        const bijlageUrl = bijlagen.length ? JSON.stringify(bijlagen) : null
        const basis = d.reference ? `${label} ${d.reference}` : label
        const inclusief = d.prices_are_incl_tax === true
        const regels = (Array.isArray(d.details) ? d.details : [])
        const rijen = regels.map((r: any, i: number) => {
          const { pct } = regimeVanTarief(ctx, r.tax_rate_id)
          const bedrag = Number(r.total_price_excl_tax_with_discount ?? (Number(r.price) * Number(r.amount_decimal ?? r.amount ?? 1)))
          return {
            company_id: co,
            description: r.description ? `${basis} — ${String(r.description).slice(0, 200)}` : basis,
            // total_price_excl_tax_with_discount is altijd exclusief btw.
            amount: Math.abs(round2(bedrag)),
            btw_inclusief: r.total_price_excl_tax_with_discount != null ? false : inclusief,
            btw_percentage: pct,
            category: 'Inkoopfactuur',
            leverancier_id: leverancierId,
            cost_date: d.date ? String(d.date).slice(0, 10) : null,
            externe_referentie: `moneybird_${d.id}_${i}`,
            // Voor de link "Bekijk in Moneybird" op de kostenkaart.
            moneybird_document_id: String(d.id),
            klant_type: 'algemeen',
            bijlage_url: bijlageUrl,
            moneybird_bijlage_gesynct: true,
          }
        })
        if (!rijen.length) {
          rijen.push({
            company_id: co, description: basis, amount: Math.abs(round2(Number(d.total_price_incl_tax || 0))),
            btw_inclusief: true, category: 'Inkoopfactuur', leverancier_id: leverancierId,
            cost_date: d.date ? String(d.date).slice(0, 10) : null, externe_referentie: `moneybird_${d.id}`, moneybird_document_id: String(d.id),
            klant_type: 'algemeen', bijlage_url: bijlageUrl, moneybird_bijlage_gesynct: true,
          })
        }
        const { error } = await db.from('job_costs').upsert(rijen, { onConflict: 'company_id,externe_referentie', ignoreDuplicates: true })
        if (error) throw new Error(error.message)
        u.imported.inkoopfacturen++
      } catch (err: any) {
        if (isLimiet(err)) throw err
        u.fouten.push(`${label} ${d.reference || d.id} ophalen: ${err?.message}`)
      }
    }
  }
}

async function importVerkoop(ctx: Context, u: BoekingenUitslag) {
  const { k } = ctx
  const db = k.admin
  const co = k.companyId
  const bekend = await alleRijen(() => db.from('facturen')
    .select('id, nummer, externe_referentie, moneybird_id').eq('company_id', co))
  const refs = new Set<string>()
  const eigen = new Set<string>()
  const nummers = new Set<string>()
  for (const f of bekend) {
    if (f.externe_referentie) refs.add(String(f.externe_referentie))
    if (f.moneybird_id && !f.externe_referentie) eigen.add(String(f.moneybird_id))
    if (f.nummer) nummers.add(String(f.nummer).toLowerCase())
  }
  const genegeerd = await getGenegeerd(db, co, 'moneybird', 'factuur')
  const klantCache = new Map<string, string | null>()

  for (const [soort, voorvoegsel] of [['sales_invoices', ''], ['external_sales_invoices', 'x']] as const) {
    if (k.budget?.op(20_000)) { u.rest = true; return }
    const lijst = await mbSyncLijst(k, soort, MB_HELE_PERIODE)
    const nieuw = lijst.map(x => x.id).filter(id => {
      const ref = `moneybird_${voorvoegsel}${id}`
      if (refs.has(ref) || eigen.has(id)) return false
      if (genegeerd.has(`${voorvoegsel}${id}`)) { u.overgeslagenUitPrullenbak++; return false }
      return true
    })
    if (!nieuw.length) continue
    const docs = await mbSyncOphalen(k, soort, nieuw)
    if (docs.length < nieuw.length) u.rest = true
    for (const d of docs) {
      if (k.budget?.op(15_000)) { u.rest = true; return }
      if (d.state === 'draft' || d.state === 'new') continue
      // Door BossBase zelf gemaakt (bron of nummer): staat hier al als eigen factuur.
      if (soort === 'external_sales_invoices' && String(d.source || '') === 'BossBase') continue
      const nummer = String(d.invoice_id || d.reference || '').trim()
      if (nummer && nummers.has(nummer.toLowerCase())) continue
      try {
        const customerId = d.contact ? await klantVoorContact(ctx, d.contact, klantCache) : null
        const betaald = d.state === 'paid'
        const datum = String(d.invoice_date || d.date || '').slice(0, 10) || null
        const totaal = Number(d.total_price_incl_tax || 0)
        const { data: factuur, error: fErr } = await db.from('facturen').insert({
          company_id: co,
          customer_id: customerId,
          nummer: nummer || `MB-${String(d.id).slice(-8)}`,
          factuurdatum: datum,
          vervaldatum: d.due_date ? String(d.due_date).slice(0, 10) : null,
          // 'geboekt' valt buiten de eigen statusflow en staat daarmee op slot,
          // net als facturen die uit SnelStart komen.
          status: betaald ? 'betaald' : 'geboekt',
          betaald_op: betaald ? String(d.paid_at || datum || vandaagIso()).slice(0, 10) : null,
          externe_referentie: `moneybird_${voorvoegsel}${d.id}`,
          moneybird_id: String(d.id),
          is_credit: totaal < 0,
          moneybird_bijlage_gesynct: true,
          moneybird_payment_registered_at: new Date().toISOString(),
          totaal_excl: 0,
          totaal_incl: 0,
        }).select('id').single()
        if (fErr?.code === '23505') continue
        if (fErr) throw new Error(fErr.message)
        const regels = (Array.isArray(d.details) ? d.details : []).map((r: any, i: number) => {
          const { regime, pct } = regimeVanTarief(ctx, r.tax_rate_id)
          const aantal = Number(r.amount_decimal ?? r.amount ?? 1) || 1
          const excl = Number(r.total_price_excl_tax_with_discount ?? Number(r.price) * aantal)
          const prijsExcl = d.prices_are_incl_tax ? excl / aantal : Number(r.price)
          return {
            factuur_id: factuur.id, company_id: co, type: 'vast',
            omschrijving: r.description || nummer || 'Factuurregel',
            aantal, eenheidsprijs: round2(prijsExcl), regelprijs: round2(excl),
            btw_pct: pct, btw_regime: regime, volgorde: i,
          }
        })
        if (regels.length) {
          const { error: rErr } = await db.from('factuur_regels').insert(regels)
          if (rErr) throw new Error(rErr.message)
        }
        // Het brondocument erbij, op de vaste plek van een factuur-PDF.
        const pdf = soort === 'sales_invoices'
          ? await mbDownload(k, `/sales_invoices/${d.id}/download_pdf`)
          : (d.attachments?.[0] ? await mbDownload(k, `/external_sales_invoices/${d.id}/attachments/${d.attachments[0].id}/download`) : null)
        if (pdf) {
          await db.storage.from('factuur-pdfs').upload(`${co}/${factuur.id}.pdf`, pdf.bytes, { contentType: 'application/pdf', upsert: true })
        }
        u.imported.verkoopfacturen++
      } catch (err: any) {
        if (isLimiet(err)) throw err
        u.meldingen.push(`Factuur ${nummer || d.id} kon niet worden opgehaald: ${err?.message}`)
      }
    }
  }
}

const KOSTEN_BATCH = 50
const KOSTEN_MAX_PER_RUN = 500

async function exportKosten(ctx: Context, u: BoekingenUitslag) {
  const { k } = ctx
  const db = k.admin
  const co = k.companyId
  const { count: zonderLev } = await kostenTeBoeken(
    db.from('job_costs').select('id', { count: 'exact', head: true }), co, 'moneybird_id').is('leverancier_id', null)
  if (zonderLev) {
    u.meldingen.push(`${zonderLev} ${zonderLev === 1 ? 'kostenpost heeft' : 'kostenposten hebben'} geen leverancier `
      + 'en zijn niet naar Moneybird gestuurd. Vul de leverancier aan bij Kosten, dan gaan ze mee met de volgende synchronisatie.')
  }
  const mislukt = new Set<string>()
  for (;;) {
    if (k.budget?.op(15_000) || u.exported.kosten >= KOSTEN_MAX_PER_RUN) { u.rest = true; break }
    const { data: lijst, error } = await kostenTeBoeken(
      db.from('job_costs').select('*, leveranciers(id, naam, email, telefoon, mobiel, website, address, postcode, city, contactpersoon, kvk_number, btw_number, iban, moneybird_id, moneybird_hash)'),
      co, 'moneybird_id')
      .not('leverancier_id', 'is', null).order('cost_date', { ascending: true }).limit(KOSTEN_BATCH + mislukt.size)
    if (error) throw new Error(error.message)
    const batch = (lijst || []).filter((c: any) => !mislukt.has(c.id)).slice(0, KOSTEN_BATCH)
    if (!batch.length) break
    let voortgang = 0
    for (const cost of batch) {
      if (k.budget?.op(15_000)) { u.rest = true; break }
      try {
        if (await pushKost(ctx, cost)) { u.exported.kosten++; voortgang++ }
      } catch (err: any) {
        if (isLimiet(err)) throw err
        mislukt.add(cost.id)
        u.fouten.push(`Kosten "${cost.description ?? cost.id}": ${err?.message}`)
      }
    }
    if (!voortgang) break
  }
  // Bonnen nasturen die bij het boeken nog niet klaarstonden.
  const { data: naTeSturen } = await db.from('job_costs')
    .select('id, description, bijlage_url, moneybird_id').eq('company_id', co)
    .not('moneybird_id', 'is', null).not('bijlage_url', 'is', null).eq('moneybird_bijlage_gesynct', false).limit(KOSTEN_BATCH)
  for (const cost of (naTeSturen || [])) {
    if (k.budget?.op(15_000)) { u.rest = true; break }
    const r = await pushKostenBijlagen(ctx, cost)
    if (r.gelukt > 0 || r.overgeslagen.length === 0) {
      await db.from('job_costs').update({ moneybird_bijlage_gesynct: true }).eq('id', cost.id)
    }
  }
  const { count: open } = await kostenTeBoeken(
    db.from('job_costs').select('id', { count: 'exact', head: true }), co, 'moneybird_id').not('leverancier_id', 'is', null)
  u.kostenResterend = Math.max(0, (open ?? 0) - mislukt.size)
}
