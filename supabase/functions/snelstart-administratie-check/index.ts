import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { makeAdminClient } from "../_shared/scheduledSync.ts"
import { ssFetch } from "../_shared/snelstart.ts"

// Herkent dat een koppelsleutel naar een ANDERE administratie wijst.
//
// Dit ving vroeger de knop "Koppeling opnieuw opbouwen" op. Die knop is uit het
// portaal gehaald: hij was bedoeld voor tests, en zonder eerst opruimen in
// SnelStart levert hij dubbele boekingen op — precies het soort knop waar je
// per ongeluk op drukt.
//
// Maar het probleem eronder is echt. Wisselt een klant van administratie, dan
// wijzen alle opgeslagen snelstart_id's naar records die daar niet bestaan. De
// sync ziet "al geboekt" en slaat alles over; er komt niets meer door en er
// staat nergens waarom.
//
// Daarom niet een knop maar een controle: bij het opslaan van een sleutel halen
// we de administratie-identificatie op (GET /companyInfo →
// administratieIdentifier) en vergelijken die met wat er stond. Anders? Dan is
// het een andere administratie en zetten we de verwijzingen gericht terug, mét
// uitleg.
//
// Geïmporteerde rijen blijven ongemoeid: die horen bij de OUDE administratie en
// terugboeken naar de nieuwe zou onzin zijn. Ze zijn te herkennen aan hun
// externe referentie.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const admin = makeAdminClient()
  const jwt = (req.headers.get('authorization') ?? '').replace('Bearer ', '')

  try {
    const { data: { user }, error: authErr } = await admin.auth.getUser(jwt)
    if (authErr || !user) return json({ error: 'Niet ingelogd' }, 401)

    const { data: profile } = await admin.from('profiles').select('company_id, role').eq('id', user.id).maybeSingle()
    if (!profile?.company_id) return json({ error: 'Geen bedrijf gevonden' }, 400)
    if (profile.role !== 'admin') return json({ error: 'Alleen admins beheren de koppeling' }, 403)

    const { data: conn } = await admin
      .from('accounting_connections')
      .select('client_key, administration_id')
      .eq('company_id', profile.company_id)
      .eq('provider', 'snelstart')
      .maybeSingle()
    if (!conn?.client_key) return json({ error: 'SnelStart niet geconfigureerd' }, 400)

    const info = await ssFetch(conn.client_key, '/companyInfo')
    const identifier = String(info?.administratieIdentifier || '').trim()
    const naam = String(info?.administratieNaam || info?.bedrijfsnaam || '').trim()
    if (!identifier) {
      return json({ success: true, status: 'onbekend', melding: 'SnelStart gaf geen administratie-identificatie terug.' })
    }

    // Eerste keer: alleen vastleggen. Er valt niets te vergelijken.
    if (!conn.administration_id) {
      await admin.from('accounting_connections')
        .update({ administration_id: identifier, updated_at: new Date().toISOString() })
        .eq('company_id', profile.company_id).eq('provider', 'snelstart')
      return json({ success: true, status: 'vastgelegd', administratie: naam })
    }

    if (conn.administration_id === identifier) {
      return json({ success: true, status: 'ongewijzigd', administratie: naam })
    }

    // ── Andere administratie ──────────────────────────────────────────────
    // Verwijzingen wissen zodat alles opnieuw geboekt kan worden. Alleen eigen
    // records; geïmporteerde horen bij de oude administratie.
    const co = profile.company_id
    const tel = async (tabel: string, velden: Record<string, unknown>, extra = false) => {
      let q = admin.from(tabel).update(velden).eq('company_id', co).not('snelstart_id', 'is', null)
      if (extra) q = q.is('externe_referentie', null)
      const { data } = await q.select('id')
      return (data || []).length
    }

    const klanten = await tel('customers', { snelstart_id: null })
    const leveranciers = await tel('leveranciers', { snelstart_id: null })
    const facturen = await tel('facturen', { snelstart_id: null, snelstart_bijlage_gesynct: false }, true)
    const kosten = await tel('job_costs', { snelstart_id: null, snelstart_bijlage_gesynct: false }, true)

    await admin.from('accounting_connections')
      .update({ administration_id: identifier, updated_at: new Date().toISOString() })
      .eq('company_id', co).eq('provider', 'snelstart')

    return json({
      success: true,
      status: 'gewisseld',
      administratie: naam,
      hersteld: { klanten, leveranciers, facturen, kosten },
      melding:
        `Deze koppelsleutel wijst naar een andere administratie${naam ? ` (${naam})` : ''}. `
        + `De verwijzingen naar de vorige administratie zijn gewist, zodat je facturen, kosten en relaties `
        + `daar opnieuw geboekt kunnen worden. Wat eerder uit de oude administratie is opgehaald blijft staan `
        + `als historie en wordt niet opnieuw verstuurd.`,
    })
  } catch (err: any) {
    console.error('Error:', err?.message, err?.stack)
    return json({ success: false, error: err?.message }, 500)
  }
})
