import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const AFAS_BASE = 'sb20.afasfocus.nl'

async function tryAfasEndpoint(url: string, headers: Record<string, string>, label: string): Promise<any[]> {
  console.log(`Probeer ${label}: ${url}`)
  try {
    const res = await fetch(url, { headers })
    const text = await res.text()
    console.log(`${label} HTTP ${res.status}, body: ${text.substring(0, 2000)}`)
    if (!res.ok) { console.log(`${label} mislukt HTTP ${res.status}`); return [] }
    const data = JSON.parse(text)
    const rows: any[] = data?.Result ?? data?.result ??
      (Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : (Array.isArray(data?.value) ? data.value : [])))
    console.log(`${label} rijen: ${rows.length}`)
    return rows
  } catch (e: any) {
    console.log(`${label} fout: ${e.message}`)
    return []
  }
}

async function getAccessToken(environmentId: string, appToken: string): Promise<string> {
  const url = `https://${AFAS_BASE}/${environmentId}/authentication/getaccesstoken`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ apptoken: appToken }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Token exchange HTTP ${res.status}: ${text.substring(0, 200)}`)
  let data: Record<string, string>
  try { data = JSON.parse(text) } catch { throw new Error(`Token exchange: geen JSON: ${text.substring(0, 200)}`) }
  if (!data.access_token) throw new Error(`Geen access_token in response: ${text.substring(0, 200)}`)
  return data.access_token
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  console.log('Function started: afas-sync-contacten')

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
      .select('afas_environment_id, afas_token')
      .eq('company_id', profile.company_id)
      .eq('provider', 'afas')
      .maybeSingle()

    if (!conn?.afas_environment_id || !conn?.afas_token) {
      return new Response(JSON.stringify({ error: 'AFAS niet geconfigureerd' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const accessToken = await getAccessToken(conn.afas_environment_id, conn.afas_token)
    const companyId = profile.company_id
    const afasHeaders = {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
      'Accept-Version': '2.0',
    }

    // ── AFAS → BossBase ──────────────────────────────────────────
    const orgUrl = `https://${AFAS_BASE}/${conn.afas_environment_id}/api/organisations`
    console.log('AFAS organisations URL:', orgUrl)

    const orgRes = await fetch(orgUrl, { headers: afasHeaders })
    const orgText = await orgRes.text()
    console.log('AFAS response status:', orgRes.status)
    console.log('AFAS response body (volledig):', orgText.substring(0, 2000))

    if (!orgRes.ok) {
      throw new Error(`AFAS /api/organisations HTTP ${orgRes.status}: ${orgText.substring(0, 200)}`)
    }

    let orgData: any
    try { orgData = JSON.parse(orgText) } catch {
      throw new Error(`AFAS response is geen geldige JSON: ${orgText.substring(0, 200)}`)
    }

    console.log('Organisations data:', JSON.stringify(orgData).substring(0, 2000))

    // AFAS SB structuur: { TrackingToken, Result: [...] }
    const afasOrgs: any[] = orgData?.Result ?? orgData?.result ??
      (Array.isArray(orgData) ? orgData : (Array.isArray(orgData?.data) ? orgData.data : (Array.isArray(orgData?.value) ? orgData.value : [])))
    console.log('AFAS organisations opgehaald:', afasOrgs.length)

    // ── Extra endpoints voor debiteuren/klanten ──────────────────
    const relBase = `https://${AFAS_BASE}/${conn.afas_environment_id}/api`
    const headers10 = { ...afasHeaders, 'Accept-Version': '1.0' }
    const headers20 = { ...afasHeaders, 'Accept-Version': '2.0' }

    const extraRows: any[] = []

    // Debtors + contacts direct toevoegen
    for (const [url, hdrs, label] of [
      [`${relBase}/debtors`,  headers20, '/api/debtors v2.0'],
      [`${relBase}/contacts`, headers10, '/api/contacts v1.0'],
    ] as Array<[string, Record<string, string>, string]>) {
      extraRows.push(...await tryAfasEndpoint(url, hdrs, label))
    }

    // Salesrelations v1.0: per rij details + adres + bankrekening ophalen
    const salesRows = await tryAfasEndpoint(`${relBase}/salesrelations`, headers10, '/api/salesrelations v1.0')
    for (const rel of salesRows) {
      const relId = rel.RelationId ?? rel.relationId
      const relType = (rel.RelationType ?? rel.relationType ?? '').toLowerCase()
      const relName = rel.RelationDescription ?? rel.relationDescription ?? ''
      if (!relId) { extraRows.push(rel); continue }

      let enriched: any = rel

      // Personen via /api/persons/{id}, organisaties via /api/organisations/{id}
      const detailEndpoint = relType === 'person' ? 'persons' : 'organisations'
      const detailUrl = `${relBase}/${detailEndpoint}/${relId}`
      console.log(`Detail ophalen voor "${relName}" (${relType}): ${detailUrl}`)
      try {
        const detailRes = await fetch(detailUrl, { headers: headers10 })
        const detailText = await detailRes.text()
        console.log(`${detailEndpoint}/${relId} HTTP ${detailRes.status}: ${detailText.substring(0, 1000)}`)
        if (detailRes.ok) {
          const d = JSON.parse(detailText)
          const obj = Array.isArray(d) ? d[0] : (d?.Result?.[0] ?? d?.result?.[0] ?? d)
          if (obj && (obj.Name ?? obj.name ?? obj.RelationDescription)) enriched = { ...enriched, ...obj }
        }
      } catch (e: any) { console.log(`Detail fout: ${e.message}`) }

      // Adres ophalen
      const addrUrl = `${relBase}/addresses?filter=RelationId eq '${relId}'`
      console.log(`Adres ophalen voor "${relName}": ${addrUrl}`)
      try {
        const addrRes = await fetch(addrUrl, { headers: headers10 })
        const addrText = await addrRes.text()
        console.log(`addresses HTTP ${addrRes.status}: ${addrText.substring(0, 500)}`)
        if (addrRes.ok) {
          const ad = JSON.parse(addrText)
          const addrs: any[] = ad?.Result ?? ad?.result ?? (Array.isArray(ad) ? ad : [])
          if (addrs.length > 0) {
            const a = addrs[0]
            enriched._address = [a.StreetName ?? '', a.HouseNumber ?? '', a.HouseNumberAddition ?? ''].filter(Boolean).join(' ').trim()
            enriched._postcode = a.PostalZone ?? ''
            enriched._city = a.CityName ?? ''
          }
        }
      } catch (e: any) { console.log(`Adres fout: ${e.message}`) }

      // Bankrekening ophalen
      const bankUrl = `${relBase}/bankaccounts?filter=RelationId eq '${relId}'`
      console.log(`Bankrekening ophalen voor "${relName}": ${bankUrl}`)
      try {
        const bankRes = await fetch(bankUrl, { headers: headers10 })
        const bankText = await bankRes.text()
        console.log(`bankaccounts HTTP ${bankRes.status}: ${bankText.substring(0, 500)}`)
        if (bankRes.ok) {
          const bk = JSON.parse(bankText)
          const banks: any[] = bk?.Result ?? bk?.result ?? (Array.isArray(bk) ? bk : [])
          if (banks.length > 0) enriched._iban = banks[0].AccountNumber ?? ''
        }
      } catch (e: any) { console.log(`Bank fout: ${e.message}`) }

      extraRows.push(enriched)
    }

    const norm = (s: string) => (s ?? '').trim().toLowerCase()

    // Normaliseer extra rijen naar hetzelfde formaat als organisations
    const normRel = (r: any) => ({
      Name: (r.RelationDescription ?? r.Name ?? r.name ?? r.BcCoName ?? r.CompanyName ?? r.companyName ?? '').trim(),
      EmailAddress: r.EmailAddress ?? r.emailAddress ?? r.Email ?? r.email ?? r.EmAd ?? '',
      PhoneNumber: r.PhoneNumber ?? r.phoneNumber ?? r.Phone ?? r.phone ?? '',
      CocNumber: r.CocNumber ?? r.cocNumber ?? r.ChamberOfCommerceNumber ?? null,
      VatNumber: r.VatNumber ?? r.vatNumber ?? null,
      _address: r._address ?? '',
      _postcode: r._postcode ?? '',
      _city: r._city ?? '',
      _iban: r._iban ?? '',
    })
    const normExtraRows = extraRows
      .map(normRel)
      .filter(r => r.Name && r.Name !== 'Diverse debiteuren')

    // Merge: voeg extra toe die nog niet in organisations zitten (dedup op naam)
    const orgNameSet = new Set(afasOrgs.map((o: any) => norm(o.Name ?? o.name ?? '')))
    const extraFromRel = normExtraRows.filter(r => !orgNameSet.has(norm(r.Name)))
    console.log(`Extra endpoints genormaliseerd: ${normExtraRows.length}, nieuw (niet in organisations): ${extraFromRel.length}`)

    const allAfasContacts: any[] = [...afasOrgs, ...extraFromRel]
    console.log(`Totaal AFAS contacten na merge: ${allAfasContacts.length}`)

    const { data: existingCustomers } = await supabase
      .from('customers')
      .select('id, name, email')
      .eq('company_id', companyId)

    const byName = new Map<string, any>()
    for (const c of (existingCustomers || [])) {
      if (c.name?.trim()) byName.set(norm(c.name), c)
    }

    console.log(`BossBase klanten geladen: ${(existingCustomers || []).length} (${byName.size} unieke namen)`)

    // ── AFAS → BossBase — match alleen op naam ───────────────────
    const afasNames = new Set(allAfasContacts.map((o: any) => norm(o.Name ?? o.name ?? '')).filter(Boolean))

    let importedFromAfas = 0
    let skippedAfas = 0
    for (const org of allAfasContacts) {
      const name = (org.Name ?? org.name ?? '').trim()
      if (!name) { console.log('AFAS org zonder naam, skip'); continue }
      const email = norm(org.EmailAddress ?? org.emailAddress ?? org.Email ?? org.email ?? '')

      if (byName.has(norm(name))) {
        skippedAfas++
        console.log(`AFAS→BB SKIP "${name}" (email: "${email || '-'}") — match op: naam`)
        continue
      }

      console.log(`AFAS→BB NIEUW  "${name}" (email: "${email || '-'}")`)

      const phone = (org.PhoneNumber ?? org.phoneNumber ?? org.Phone ?? org.phone ?? '').trim()
      const address = (org._address ?? '').trim()
      const postcode = (org._postcode ?? '').trim()
      const city = (org._city ?? '').trim()
      console.log(`  → phone: "${phone}", address: "${address}", postcode: "${postcode}", city: "${city}"`)

      const { data: newCustomer } = await supabase.from('customers').insert({
        company_id: companyId,
        name,
        email: email || null,
        phone: phone || null,
        address: address || null,
        postcode: postcode || null,
        city: city || null,
        kvk_number: org.CocNumber ?? org.cocNumber ?? null,
        btw_number: org.VatNumber ?? org.vatNumber ?? null,
      }).select().single()

      if (newCustomer) {
        importedFromAfas++
        byName.set(norm(name), newCustomer)
        console.log(`AFAS→BB AANGEMAAKT "${name}"`)
      }
    }
    console.log(`AFAS → BossBase: ${importedFromAfas} aangemaakt, ${skippedAfas} al aanwezig`)

    // ── BossBase → AFAS export ───────────────────────────────────
    const toExport = (existingCustomers || []).filter(c => {
      if (!c.name?.trim()) return false
      if (afasNames.has(norm(c.name))) return false
      return true
    })
    console.log(`BossBase → AFAS te exporteren: ${toExport.length}`)

    const exportUrl = `https://${AFAS_BASE}/${conn.afas_environment_id}/api/organisation`
    const exportHeaders = { ...afasHeaders, 'Accept-Version': '3', 'Content-Type': 'application/json' }

    // Test met eerste klant, log volledige response
    let exportedToAfas = 0
    let exportFailures = 0
    const testCustomer = toExport[0]
    if (testCustomer) {
      const body: Record<string, string> = { Name: testCustomer.name }
      if (testCustomer.email) body.EmailAddress = testCustomer.email
      console.log(`TEST export eerste klant: "${testCustomer.name}", body: ${JSON.stringify(body)}`)
      const postRes = await fetch(exportUrl, { method: 'POST', headers: exportHeaders, body: JSON.stringify(body) })
      const resText = await postRes.text().catch(() => '')
      console.log(`POST /api/organisation HTTP ${postRes.status}: ${resText.substring(0, 2000)}`)
      if (postRes.ok) { exportedToAfas++; console.log(`BB→AFAS geslaagd: "${testCustomer.name}"`) }
      else { exportFailures++; console.log(`BB→AFAS MISLUKT: "${testCustomer.name}"`) }
    }

    return new Response(
      JSON.stringify({ success: true, importedFromAfas, exportedToAfas, exportFailures }),
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
