import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { makeAdminClient } from "../_shared/scheduledSync.ts"
import { getActieveGrootboeken } from "../_shared/snelstart.ts"

// Controleert of de administratie de omzet-grootboeken heeft die de koppeling
// nodig heeft.
//
// Alleen een CONTROLE, geen aanmaakfunctie meer: POST /grootboeken geeft bij
// SnelStart een 500 (incident-id), en de drie functies hieronder zitten sowieso
// in het standaard rekeningschema — 8200/8210 voor hoog en laag, 8240/8250 voor
// nultarief en verlegd. Ontbreken ze toch, dan heeft iemand het schema
// aangepast en is een melding het juiste antwoord, geen ingreep in andermans
// boekhouding.
//
// Met { "lijst": true } geeft hij het volledige rekeningschema terug — handig
// om te zien hoe een administratie is ingericht.
//
// Alleen admins; werkt uitsluitend op de administratie achter de koppelsleutel
// van het eigen bedrijf.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

// Wat de koppeling nodig heeft om alle vier de btw-regimes te kunnen boeken.
// Nummers volgen de gangbare Nederlandse indeling voor omzetrekeningen (8xxx);
// botst het nummer, dan probeert de functie het volgende vrije nummer.
// Drie functies dekken alle vier de regimes: vrijgesteld en verlegd delen
// VerkopenOmzetOnbelastVerlegd, precies zoals SnelStart's eigen schema doet.
const VEREIST = [
  { functie: 'VerkopenOmzetHoog',            waarvoor: 'normaal tarief (21%)' },
  { functie: 'VerkopenOmzetLaag',            waarvoor: 'verlaagd tarief (9%)' },
  { functie: 'VerkopenOmzetOnbelastVerlegd', waarvoor: 'vrijgestelde en verlegde omzet' },
]

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const admin = makeAdminClient()
  const jwt = (req.headers.get('authorization') ?? '').replace('Bearer ', '')
  const body = await req.json().catch(() => ({}))

  try {
    const { data: { user }, error: authErr } = await admin.auth.getUser(jwt)
    if (authErr || !user) return json({ error: 'Niet ingelogd' }, 401)

    const { data: profile } = await admin.from('profiles').select('company_id, role').eq('id', user.id).maybeSingle()
    if (!profile?.company_id) return json({ error: 'Geen bedrijf gevonden' }, 400)
    if (profile.role !== 'admin') return json({ error: 'Alleen admins kunnen grootboeken beheren' }, 403)

    const { data: conn } = await admin
      .from('accounting_connections')
      .select('client_key')
      .eq('company_id', profile.company_id)
      .eq('provider', 'snelstart')
      .maybeSingle()
    if (!conn?.client_key) return json({ error: 'SnelStart niet geconfigureerd' }, 400)

    const bestaand = await getActieveGrootboeken(conn.client_key)
    const aanwezig = new Set(bestaand.map((g: any) => String(g.grootboekfunctie || '')))

    // Volledige lijst opvragen — om te zien hoe een administratie standaard is
    // ingericht, zonder te hoeven gokken.
    if (body?.lijst) {
      return json({
        success: true,
        aantal: bestaand.length,
        grootboeken: bestaand
          .map((g: any) => ({ nummer: g.nummer, omschrijving: g.omschrijving, functie: g.grootboekfunctie, rubriek: g.grootboekRubriek, btwSoort: g.btwSoort }))
          .sort((a: any, b: any) => (a.nummer ?? 0) - (b.nummer ?? 0)),
      })
    }

    const ontbreekt = VEREIST.filter(v => !aanwezig.has(v.functie))
    if (!ontbreekt.length) {
      return json({ success: true, ontbreekt: [], melding: 'Alle benodigde omzet-grootboeken zijn aanwezig.' })
    }

    // Bewust geen aanmaakpad: zie de toelichting bovenaan.
    return json({
      success: true,
      ontbreekt: ontbreekt.map(o => ({ functie: o.functie, waarvoor: o.waarvoor })),
      melding:
        'Je administratie mist een of meer omzet-grootboeken die de koppeling nodig heeft. '
        + 'Facturen met die btw-soort kunnen daardoor niet geboekt worden. Vraag je boekhouder '
        + 'om ze aan te maken in SnelStart, of herstel het standaard rekeningschema.',
    })

  } catch (err: any) {
    console.error('Error:', err?.message, err?.stack)
    return json({ success: false, error: err?.message }, 500)
  }
})
