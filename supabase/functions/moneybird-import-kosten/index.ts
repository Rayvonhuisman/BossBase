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
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.error(`Moneybird API ${res.status} op ${path}: ${body}`)
    throw new Error(`Moneybird ${res.status}: ${body}`)
  }
  return res.json()
}

async function fetchAttachmentUrl(token: string, adminId: string, path: string): Promise<string | null> {
  try {
    const attachments = await mbFetch(token, adminId, path)
    if (Array.isArray(attachments) && attachments.length > 0) {
      return attachments[0].download_url ?? null
    }
  } catch (_) { /* bijlagen zijn optioneel */ }
  return null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  console.log('Function started')
  console.log('SUPABASE_URL:', Deno.env.get('SUPABASE_URL') ? 'set' : 'missing')

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

    // Bestaande referenties ophalen voor deduplicatie
    const { data: existingCosts } = await supabase
      .from('job_costs')
      .select('externe_referentie')
      .eq('company_id', companyId)
      .not('externe_referentie', 'is', null)

    const existingCostRefs = new Set((existingCosts || []).map((r: any) => r.externe_referentie))

    const { data: existingFacturen } = await supabase
      .from('facturen')
      .select('externe_referentie')
      .eq('company_id', companyId)
      .not('externe_referentie', 'is', null)

    const existingFactuurRefs = new Set((existingFacturen || []).map((r: any) => r.externe_referentie))

    // ── 1. INKOOPFACTUREN ────────────────────────────────────────────────────
    let inkoopfacturenCount = 0
    {
      const invoices = await mbFetch(token, adminId, '/documents/purchase_invoices.json?per_page=100&filter=state%3Aall')
      const toImport = Array.isArray(invoices)
        ? invoices.filter((inv: any) => !existingCostRefs.has('purchase_' + inv.id))
        : []

      const rows = []
      for (const inv of toImport) {
        const bijlageUrl = await fetchAttachmentUrl(token, adminId, `/documents/purchase_invoices/${inv.id}/attachments.json`)
        rows.push({
          company_id: companyId,
          description: inv.reference || inv.contact?.company_name || 'Inkoopfactuur',
          amount: parseFloat(inv.total_price_excl_tax || inv.total_price || '0'),
          category: 'Inkoopfactuur',
          cost_date: inv.date || null,
          externe_referentie: 'purchase_' + inv.id,
          klant_type: 'algemeen',
          bijlage_url: bijlageUrl,
        })
      }

      if (rows.length > 0) {
        const { error: insertErr } = await supabase.from('job_costs').insert(rows)
        if (insertErr) throw insertErr
        inkoopfacturenCount = rows.length
      }
      console.log('Inkoopfacturen geïmporteerd:', inkoopfacturenCount)
    }

    // ── 2. BONNETJES ─────────────────────────────────────────────────────────
    let bonnetjesCount = 0
    {
      const receipts = await mbFetch(token, adminId, '/documents/receipts.json?per_page=100')
      const toImport = Array.isArray(receipts)
        ? receipts.filter((r: any) => !existingCostRefs.has('receipt_' + r.id))
        : []

      const rows = []
      for (const receipt of toImport) {
        const bijlageUrl = await fetchAttachmentUrl(token, adminId, `/documents/receipts/${receipt.id}/attachments.json`)
        rows.push({
          company_id: companyId,
          description: receipt.reference || receipt.contact?.company_name || 'Bonnetje',
          amount: parseFloat(receipt.total_price_excl_tax || receipt.total_price || '0'),
          category: 'Inkoopfactuur',
          cost_date: receipt.date || null,
          externe_referentie: 'receipt_' + receipt.id,
          klant_type: 'algemeen',
          bijlage_url: bijlageUrl,
        })
      }

      if (rows.length > 0) {
        const { error: insertErr } = await supabase.from('job_costs').insert(rows)
        if (insertErr) throw insertErr
        bonnetjesCount = rows.length
      }
      console.log('Bonnetjes geïmporteerd:', bonnetjesCount)
    }

    // ── 3. FINANCIËLE MUTATIES (uitgaven) ────────────────────────────────────
    let mutatiesCount = 0
    {
      const mutations = await mbFetch(token, adminId, '/financial_mutations.json?filter=type%3Adebit&per_page=100')
      const toImport = Array.isArray(mutations)
        ? mutations.filter((m: any) => !existingCostRefs.has('mutation_' + m.id))
        : []

      const rows = toImport.map((m: any) => ({
        company_id: companyId,
        description: m.message || m.batch_reference || 'Uitgave',
        amount: Math.abs(parseFloat(m.amount || '0')),
        category: 'Algemene kosten',
        cost_date: m.date || null,
        externe_referentie: 'mutation_' + m.id,
        klant_type: 'algemeen',
      }))

      if (rows.length > 0) {
        const { error: insertErr } = await supabase.from('job_costs').insert(rows)
        if (insertErr) throw insertErr
        mutatiesCount = rows.length
      }
      console.log('Mutaties geïmporteerd:', mutatiesCount)
    }

    // ── 4. VERKOOPFACTUREN ───────────────────────────────────────────────────
    let verkoopfacturenCount = 0
    {
      const salesInvoices = await mbFetch(token, adminId, '/sales_invoices.json?per_page=100')
      const toImport = Array.isArray(salesInvoices)
        ? salesInvoices.filter((inv: any) => {
            if ((inv.reference || '').startsWith('BB-F')) return false
            return !existingFactuurRefs.has('mb_sales_' + inv.id)
          })
        : []

      const rows = toImport.map((inv: any) => {
        let status = 'concept'
        if (inv.state === 'paid') status = 'betaald'
        else if (['open', 'late', 'sent', 'reminded'].includes(inv.state)) status = 'verzonden'

        return {
          company_id: companyId,
          nummer: inv.invoice_id || ('MB-' + inv.id),
          factuurdatum: inv.date || new Date().toISOString().split('T')[0],
          vervaldatum: inv.due_date || null,
          betalingskenmerk: inv.reference || null,
          status,
          totaal_excl: parseFloat(inv.total_price_excl_tax || '0'),
          totaal_incl: parseFloat(inv.total_price_incl_tax || inv.total_price || '0'),
          betaald_op: inv.state === 'paid' ? (inv.payment_date || null) : null,
          externe_referentie: 'mb_sales_' + inv.id,
          moneybird_id: String(inv.id),
        }
      })

      if (rows.length > 0) {
        const { error: insertErr } = await supabase.from('facturen').insert(rows)
        if (insertErr) throw insertErr
        verkoopfacturenCount = rows.length
      }
      console.log('Verkoopfacturen geïmporteerd:', verkoopfacturenCount)
    }

    // ── 5. BETAALSTATUS SYNC ─────────────────────────────────────────────────
    // Check BossBase facturen met status 'verzonden' en moneybird_id tegen Moneybird
    {
      const { data: openFacturen } = await supabase
        .from('facturen')
        .select('id, moneybird_id')
        .eq('company_id', companyId)
        .eq('status', 'verzonden')
        .not('moneybird_id', 'is', null)
        .limit(50)

      for (const factuur of (openFacturen || [])) {
        try {
          const mbInvoice = await mbFetch(token, adminId, `/sales_invoices/${factuur.moneybird_id}.json`)
          if (mbInvoice?.state === 'paid') {
            await supabase
              .from('facturen')
              .update({ status: 'betaald', betaald_op: mbInvoice.payment_date || null, updated_at: new Date().toISOString() })
              .eq('id', factuur.id)
            console.log('Factuur als betaald gemarkeerd:', factuur.id)
          }
        } catch (err) {
          console.error(`Betaalstatus check factuur ${factuur.id} mislukt:`, err.message)
        }
      }
    }

    // Update last_synced_at
    await supabase
      .from('accounting_connections')
      .update({ last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('company_id', companyId)
      .eq('provider', 'moneybird')

    return new Response(
      JSON.stringify({
        success: true,
        imported: {
          inkoopfacturen: inkoopfacturenCount,
          bonnetjes: bonnetjesCount,
          mutaties: mutatiesCount,
          verkoopfacturen: verkoopfacturenCount,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Error:', err.message, err.stack)
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
