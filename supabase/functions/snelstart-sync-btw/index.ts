import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { makeAdminClient, isScheduledCall } from "../_shared/scheduledSync.ts"
import { ssFetchAll, forEachSnelStartCompany } from "../_shared/snelstart.ts"

// ⚠️  NIET IN GEBRUIK — deze functie wordt nergens meer aangeroepen (28-08-2026).
//
// De koppelsleutel krijgt de scope `btwaangiftes:read` niet, en zonder die scope
// antwoordt SnelStart op /btwaangiftes gegarandeerd met:
//   403 {"error": "insufficient access rights. required scopes for this
//        operation are: btwaangiftes:read"}
// Dat leverde bij élke syncronde een foutmelding in de console op voor iets dat
// niet kon slagen. De aanroepen zijn daarom weggehaald uit
// src/services/accountingService.js (importKostenVanuitSnelStart) en
// src/services/btwService.js (syncBtwData, nu Moneybird-only), en de knop
// "Ophalen uit boekhouding" op Financiën is alleen nog zichtbaar bij een
// Moneybird-koppeling.
//
// De code blijft staan voor als de scope ooit wél beschikbaar komt: dan is het
// terugzetten van die twee aanroepen genoeg. Er staat geen cron op. De
// BTW-indicatie in BossBase rekent ondertussen met onze eigen facturen en
// kosten en heeft deze functie niet nodig.
//
// Voedt het btw-overzicht (btw_periodes) vanuit de ECHTE btw-aangiftes in
// SnelStart: GET /v2/btwaangiftes (OData, scope btwaangiftes:read). Anders dan
// de Moneybird-variant (die zelf facturen optelt) zijn dit de aangiftecijfers
// zoals SnelStart ze berekent — inclusief wat buiten BossBase om geboekt is.
//
// Mapping (BtwAangifteModel → btw_periodes):
//   rubriek1A = omzet hoog tarief   → btw_ontvangen_21
//   rubriek1B = omzet laag tarief   → btw_ontvangen_9
//   rubriek1E = omzet 0% / vrijgesteld → omzet_0_tarief
//   rubriek5B = voorbelasting       → btw_betaald_21 (de aangifte splitst
//     voorbelasting niet per tarief; totaal klopt, btw_betaald_9 blijft 0)
// Rubriekwaarden zijn gehele euro's (zoals op de echte aangifte). Suppleties
// worden overgeslagen; aangiftes verwerken we op berekeningsvolgorde zodat de
// meest recente berekening per periode wint. De periode (maand/kwartaal) wordt
// afgeleid uit het btwAangiftePeriode-label + de begindatum.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const NL_MONTHS = ['Januari','Februari','Maart','April','Mei','Juni','Juli','Augustus','September','Oktober','November','December']

function periodeInfo(aangifte: any): { type: string; label: string; start: string; end: string } | null {
  const startStr = (aangifte.aangiftePeriodeBeginDatum || '').slice(0, 10)
  if (!startStr) return null
  const d = new Date(startStr + 'T00:00:00Z')
  if (isNaN(d.getTime())) return null
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()

  const rawLabel = String(aangifte.btwAangiftePeriode || '').toLowerCase()
  const isKwartaal = /kwart|q\s*[1-4]/.test(rawLabel) || (!rawLabel && m % 3 === 0)

  if (isKwartaal) {
    const q = Math.floor(m / 3)
    const startMonth = q * 3
    return {
      type: 'kwartaal',
      label: `Q${q + 1} ${y}`,
      start: `${y}-${String(startMonth + 1).padStart(2, '0')}-01`,
      end: new Date(Date.UTC(y, startMonth + 3, 0)).toISOString().slice(0, 10),
    }
  }
  return {
    type: 'maand',
    label: `${NL_MONTHS[m]} ${y}`,
    start: `${y}-${String(m + 1).padStart(2, '0')}-01`,
    end: new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10),
  }
}

const rubriekBtw = (r: any) => Number(r?.btw ?? r?.btwSchatting ?? 0)
const rubriekOmzet = (r: any) => Number(r?.omzet ?? r?.omzetSchatting ?? 0)

async function syncCompany(
  supabase: any, companyId: string, clientKey: string,
): Promise<{ periodes_bijgewerkt: number }> {
  const aangiftes = await ssFetchAll(clientKey, '/btwaangiftes')
  console.log('SnelStart btw-aangiftes opgehaald:', aangiftes.length)

  // Oudste berekening eerst → bij meerdere berekeningen per periode wint de
  // laatste in de upsert.
  aangiftes.sort((a: any, b: any) =>
    String(a.datumTijdBerekening || '').localeCompare(String(b.datumTijdBerekening || '')))

  let bijgewerkt = 0
  for (const aangifte of aangiftes) {
    if (aangifte.isSuppletie === true) continue
    const info = periodeInfo(aangifte)
    if (!info) continue

    const { error } = await supabase
      .from('btw_periodes')
      .upsert({
        company_id: companyId,
        periode_type: info.type,
        periode_label: info.label,
        periode_start: info.start,
        periode_eind: info.end,
        btw_ontvangen_21: rubriekBtw(aangifte.rubriek1A),
        btw_ontvangen_9:  rubriekBtw(aangifte.rubriek1B),
        omzet_0_tarief:   rubriekOmzet(aangifte.rubriek1E),
        btw_betaald_21:   rubriekBtw(aangifte.rubriek5B),
        btw_betaald_9:    0,
        last_synced_at: new Date().toISOString(),
      }, { onConflict: 'company_id,periode_start,periode_type' })
    if (error) { console.error('Upsert fout:', error.message); continue }
    bijgewerkt++
  }

  console.log('Periodes bijgewerkt:', bijgewerkt)

  await supabase
    .from('accounting_connections')
    .update({ last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('provider', 'snelstart')

  return { periodes_bijgewerkt: bijgewerkt }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  console.log('Function started: snelstart-sync-btw')
  const supabase = makeAdminClient()
  const jwt = (req.headers.get('authorization') ?? '').replace('Bearer ', '')
  const body = await req.json().catch(() => ({}))

  try {
    // ── Scheduled-modus: alle bedrijven met een koppelsleutel ────────────────
    if (isScheduledCall(body)) {
      const summary = await forEachSnelStartCompany(supabase, (companyId, clientKey) =>
        syncCompany(supabase, companyId, clientKey))
      return json(summary)
    }

    // ── User-modus: één bedrijf van de ingelogde gebruiker ───────────────────
    const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt)
    if (authErr || !user) return json({ error: 'Niet ingelogd' }, 401)

    const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single()
    if (!profile?.company_id) return json({ error: 'Geen bedrijf gevonden' }, 400)

    const { data: conn } = await supabase
      .from('accounting_connections')
      .select('client_key')
      .eq('company_id', profile.company_id)
      .eq('provider', 'snelstart')
      .maybeSingle()
    if (!conn?.client_key) return json({ error: 'SnelStart niet geconfigureerd' }, 400)

    const r = await syncCompany(supabase, profile.company_id, conn.client_key)
    return json({ success: true, ...r })
  } catch (err: any) {
    console.error('Error:', err.message, err.stack)
    return json({ success: false, error: err.message }, 500)
  }
})
