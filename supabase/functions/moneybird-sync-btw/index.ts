import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function mbFetch(token: string, adminId: string, path: string) {
  await sleep(200)
  const res = await fetch(`https://moneybird.com/api/v2/${adminId}${path}`, {
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Moneybird ${res.status} op ${path}: ${body.substring(0, 200)}`)
  }
  return res.json()
}

const NL_MONTHS = ['Januari','Februari','Maart','April','Mei','Juni','Juli','Augustus','September','Oktober','November','December']

function getPeriodeInfo(dateStr: string, periodeType: string) {
  const date = new Date(dateStr)
  const year = date.getFullYear()
  const month = date.getMonth()
  if (periodeType === 'kwartaal') {
    const q = Math.floor(month / 3)
    const startMonth = q * 3
    const start = `${year}-${String(startMonth + 1).padStart(2, '0')}-01`
    const end = new Date(year, startMonth + 3, 0).toISOString().slice(0, 10)
    return { label: `Q${q + 1} ${year}`, start, end }
  }
  const start = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const end = new Date(year, month + 1, 0).toISOString().slice(0, 10)
  return { label: `${NL_MONTHS[month]} ${year}`, start, end }
}

type PeriodeData = {
  label: string; start: string; end: string;
  btw_ontvangen_21: number; btw_ontvangen_9: number; omzet_0_tarief: number;
  btw_betaald_21: number; btw_betaald_9: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  console.log('Function started: moneybird-sync-btw')

  try {
    const authHeader = req.headers.get('authorization') ?? ''
    const jwt = authHeader.replace('Bearer ', '')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt)
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Niet ingelogd' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const body = await req.json().catch(() => ({}))
    const periodeType: string = body.periode_type ?? 'kwartaal'

    const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single()
    if (!profile?.company_id) {
      return new Response(JSON.stringify({ error: 'Geen bedrijf gevonden' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { data: conn } = await supabase
      .from('accounting_connections')
      .select('api_token, administration_id')
      .eq('company_id', profile.company_id)
      .eq('provider', 'moneybird')
      .maybeSingle()

    if (!conn?.api_token || !conn?.administration_id) {
      return new Response(JSON.stringify({ error: 'Moneybird niet geconfigureerd' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const token = conn.api_token
    const adminId = conn.administration_id
    const companyId = profile.company_id

    // 1. Tax rates lookup
    const taxRatesData = await mbFetch(token, adminId, '/tax_rates.json')
    const taxRateMap = new Map<string, number>()
    for (const rate of (Array.isArray(taxRatesData) ? taxRatesData : [])) {
      taxRateMap.set(rate.id, parseFloat(rate.percentage || '0'))
    }
    console.log('Tax rates geladen:', taxRateMap.size)

    const periodes = new Map<string, PeriodeData>()
    const getOrCreate = (dateStr: string): PeriodeData | null => {
      if (!dateStr) return null
      const info = getPeriodeInfo(dateStr, periodeType)
      if (!periodes.has(info.start)) {
        periodes.set(info.start, { ...info, btw_ontvangen_21: 0, btw_ontvangen_9: 0, omzet_0_tarief: 0, btw_betaald_21: 0, btw_betaald_9: 0 })
      }
      return periodes.get(info.start)!
    }

    // 2. Verkoopfacturen
    const salesInvoices = await mbFetch(token, adminId, '/sales_invoices.json?per_page=100&filter=state%3Aall')
    console.log('Verkoopfacturen:', Array.isArray(salesInvoices) ? salesInvoices.length : 0)

    for (const inv of (Array.isArray(salesInvoices) ? salesInvoices : [])) {
      const detail = await mbFetch(token, adminId, `/sales_invoices/${inv.id}.json`)
      const periode = getOrCreate(detail.invoice_date || inv.date)
      if (!periode) continue
      for (const tt of (detail.tax_totals || [])) {
        const pct = taxRateMap.get(tt.tax_rate_id) ?? 0
        const tax = parseFloat(tt.tax_amount || '0')
        const taxable = parseFloat(tt.taxable_amount || '0')
        if (pct === 21) periode.btw_ontvangen_21 += tax
        else if (pct === 9) periode.btw_ontvangen_9 += tax
        else if (pct === 0) periode.omzet_0_tarief += taxable
      }
    }

    // 3. Inkoopfacturen
    const purchaseInvoices = await mbFetch(token, adminId, '/documents/purchase_invoices.json?per_page=100')
    console.log('Inkoopfacturen:', Array.isArray(purchaseInvoices) ? purchaseInvoices.length : 0)

    for (const inv of (Array.isArray(purchaseInvoices) ? purchaseInvoices : [])) {
      const detail = await mbFetch(token, adminId, `/documents/purchase_invoices/${inv.id}.json`)
      const periode = getOrCreate(detail.date || inv.date)
      if (!periode) continue
      for (const line of (detail.details || [])) {
        const pct = taxRateMap.get(line.tax_rate_id) ?? 0
        if (pct === 0) continue
        const excl = parseFloat(line.total_price_excl_tax_with_discount || '0')
        const btw = Math.round(excl * pct / 100 * 100) / 100
        if (pct === 21) periode.btw_betaald_21 += btw
        else if (pct === 9) periode.btw_betaald_9 += btw
      }
    }

    // 4. Upsert naar btw_periodes
    let periodesAangewerkt = 0
    for (const [, p] of periodes) {
      const { error } = await supabase
        .from('btw_periodes')
        .upsert({
          company_id: companyId,
          periode_type: periodeType,
          periode_label: p.label,
          periode_start: p.start,
          periode_eind: p.end,
          btw_ontvangen_21: Math.round(p.btw_ontvangen_21 * 100) / 100,
          btw_ontvangen_9:  Math.round(p.btw_ontvangen_9  * 100) / 100,
          omzet_0_tarief:   Math.round(p.omzet_0_tarief   * 100) / 100,
          btw_betaald_21:   Math.round(p.btw_betaald_21   * 100) / 100,
          btw_betaald_9:    Math.round(p.btw_betaald_9    * 100) / 100,
          last_synced_at: new Date().toISOString(),
        }, { onConflict: 'company_id,periode_start,periode_type' })
      if (error) { console.error('Upsert fout:', error.message); continue }
      periodesAangewerkt++
    }

    console.log('Periodes aangewerkt:', periodesAangewerkt)
    return new Response(
      JSON.stringify({ success: true, periodes_bijgewerkt: periodesAangewerkt }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    console.error('Error:', err.message, err.stack)
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
