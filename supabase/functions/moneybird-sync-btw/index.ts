import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { heeftRecht, geenRecht } from '../_shared/eisRecht.ts'
import { makeAdminClient } from "../_shared/scheduledSync.ts"
import { clientFout } from '../_shared/clientFout.ts'
import { laadKoppeling, mbSyncLijst, mbSyncOphalen, Tijdsbudget } from "../_shared/moneybird.ts"
import { laadIndeling } from "../_shared/moneybirdIndeling.ts"

// Btw-cijfers uit Moneybird voor de btw-kaart op Financiën ("Volgens je
// boekhouding"). Geen aangifte, een indicatie: btw ontvangen (21% en 9%) en
// betaald, per maand en per kwartaal, over dit en vorig jaar.
//
// Wat er anders is dan de oude versie:
//   * alle facturen, niet alleen de eerste 100;
//   * ook externe verkoopfacturen — zo boekt BossBase zijn facturen nu — en
//     bonnetjes;
//   * btw op verkoop uit Moneybird's eigen btw-totalen per factuur, niet zelf
//     nagerekend;
//   * maand en kwartaal in één keer (de kaart vroeg ze los op: dubbel zoveel
//     verzoeken tegen de limiet van Moneybird);
//   * omzet tegen 0% (vrijgesteld én verlegd) komt in omzet_0_tarief.
//
// Alleen handmatig (knop "Ophalen uit boekhouding" en na "Kosten/facturen
// synchroniseren"), met het recht bedrijfsfinancien.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const MAANDEN = ['Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni', 'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December']
const r2 = (n: number) => Math.round(n * 100) / 100
const num = (v: unknown) => Number(String(v ?? '0').replace(',', '.')) || 0

type Periode = { label: string; start: string; eind: string; o21: number; o9: number; o0: number; b21: number; b9: number }

function periodesVoor(datum: string): { type: string; sleutel: string; label: string; start: string; eind: string }[] {
  const [j, m] = datum.slice(0, 7).split('-').map(Number)
  const eindVan = (jaar: number, maand0: number) => new Date(Date.UTC(jaar, maand0 + 1, 0)).toISOString().slice(0, 10)
  const q = Math.floor((m - 1) / 3)
  const mStart = `${j}-${String(m).padStart(2, '0')}-01`
  const qStart = `${j}-${String(q * 3 + 1).padStart(2, '0')}-01`
  return [
    { type: 'maand', sleutel: `maand:${mStart}`, label: `${MAANDEN[m - 1]} ${j}`, start: mStart, eind: eindVan(j, m - 1) },
    { type: 'kwartaal', sleutel: `kwartaal:${qStart}`, label: `Q${q + 1} ${j}`, start: qStart, eind: eindVan(j, q * 3 + 2) },
  ]
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const admin = makeAdminClient()
  const jwt = (req.headers.get('authorization') ?? '').replace('Bearer ', '')
  try {
    const { data: { user }, error: authErr } = await admin.auth.getUser(jwt)
    if (authErr || !user) return json({ error: 'Niet ingelogd' }, 401)
    if (!(await heeftRecht(user.id, 'bedrijfsfinancien'))) return geenRecht(corsHeaders)
    const { data: profile } = await admin.from('profiles').select('company_id').eq('id', user.id).maybeSingle()
    if (!profile?.company_id) return json({ error: 'Geen bedrijf gevonden' }, 400)

    const k = await laadKoppeling(admin, profile.company_id)
    if (!k) return json({ success: false, error: 'Moneybird niet geconfigureerd' }, 400)
    k.budget = new Tijdsbudget(100_000)

    const { tarieven } = await laadIndeling(k)
    const pctVan = new Map(tarieven.map(t => [t.id, t.pct]))
    const jaar = new Date().getUTCFullYear()
    const filter = `period:${jaar - 1}0101..${jaar}1231`

    const per = new Map<string, Periode & { type: string }>()
    const bij = (datum: string) => {
      if (!datum) return []
      return periodesVoor(datum).map(p => {
        if (!per.has(p.sleutel)) per.set(p.sleutel, { type: p.type, label: p.label, start: p.start, eind: p.eind, o21: 0, o9: 0, o0: 0, b21: 0, b9: 0 })
        return per.get(p.sleutel)!
      })
    }

    let onvolledig = false
    // Verkoop: eigen (externe) facturen en facturen gemaakt in Moneybird.
    for (const soort of ['external_sales_invoices', 'sales_invoices']) {
      const ids = (await mbSyncLijst(k, soort, filter)).map(x => x.id)
      const docs = await mbSyncOphalen(k, soort, ids)
      if (docs.length < ids.length) onvolledig = true
      for (const d of docs) {
        if (d.state === 'draft' || d.state === 'new') continue
        const ps = bij(String(d.invoice_date || d.date || ''))
        const totalen = Array.isArray(d.tax_totals) ? d.tax_totals : []
        for (const t of totalen) {
          const pct = pctVan.get(String(t.tax_rate_id)) ?? 0
          for (const p of ps) {
            if (pct === 21) p.o21 += num(t.tax_amount)
            else if (pct === 9) p.o9 += num(t.tax_amount)
            else if (pct === 0) p.o0 += num(t.taxable_amount)
          }
        }
      }
    }
    // Inkoop: inkoopfacturen en bonnetjes; btw uit het bedrag exclusief per regel.
    for (const soort of ['documents/purchase_invoices', 'documents/receipts']) {
      const ids = (await mbSyncLijst(k, soort, filter)).map(x => x.id)
      const docs = await mbSyncOphalen(k, soort, ids)
      if (docs.length < ids.length) onvolledig = true
      for (const d of docs) {
        if (d.state === 'new') continue
        const ps = bij(String(d.date || ''))
        for (const r of (Array.isArray(d.details) ? d.details : [])) {
          const pct = pctVan.get(String(r.tax_rate_id)) ?? 0
          const btw = num(r.total_price_excl_tax_with_discount) * pct / 100
          for (const p of ps) {
            if (pct === 21) p.b21 += btw
            else if (pct === 9) p.b9 += btw
          }
        }
      }
    }

    let bijgewerkt = 0
    for (const p of per.values()) {
      const { error } = await admin.from('btw_periodes').upsert({
        company_id: profile.company_id,
        periode_type: p.type, periode_label: p.label, periode_start: p.start, periode_eind: p.eind,
        btw_ontvangen_21: r2(p.o21), btw_ontvangen_9: r2(p.o9), omzet_0_tarief: r2(p.o0),
        btw_betaald_21: r2(p.b21), btw_betaald_9: r2(p.b9),
        last_synced_at: new Date().toISOString(),
      }, { onConflict: 'company_id,periode_start,periode_type' })
      if (!error) bijgewerkt++
      else console.error('btw_periodes:', error.message)
    }
    return json({
      success: true, periodes_bijgewerkt: bijgewerkt,
      ...(onvolledig ? { melding: 'Niet alle facturen konden worden opgehaald (limiet van Moneybird). Probeer het over een paar minuten opnieuw.' } : {}),
    })
  } catch (err: any) {
    console.error('moneybird-sync-btw:', err?.message)
    return json({ success: false, error: clientFout(err) }, 500)
  }
})
