import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// Gedeelde helpers om edge functions zowel door een ingelogde gebruiker
// (user-JWT) als door pg_cron te laten draaien — ZONDER een service-role key in
// de cron-plumbing.
//
// - User-modus: de bestaande flow — één bedrijf, afgeleid uit de user-JWT.
// - Scheduled-modus: herkend aan een aparte, high-entropy `cron_secret` in de
//   request-body (NIET de service-role key). Alleen die secret ontgrendelt de
//   all-company loop; op zichzelf geeft hij geen enkele DB-toegang.
//
// De writes draaien met de eigen env-service-role van de functie — onvermijdelijk
// voor een cross-company backend-job op RLS-tabellen, en hetzelfde patroon als
// check-herinneringen. De gevoelige token-lees loopt via de afgebakende
// SECURITY DEFINER-functie get_moneybird_sync_targets() (alleen service_role).

export function makeAdminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )
}

// Constant-time string-vergelijking, zodat de cron_secret niet via response-
// timing kan lekken.
function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const enc = new TextEncoder()
  const ab = enc.encode(a)
  const bb = enc.encode(b)
  if (ab.length !== bb.length) return false
  let diff = 0
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i]
  return diff === 0
}

// True wanneer de request de juiste cron_secret meestuurt (pg_cron/backend). De
// secret staat als function-env `CRON_SECRET` en wordt door de cron uit Vault
// (`edge_cron_secret`) in de body meegegeven. Ontbreekt de env → nooit scheduled
// (fail-safe: dan draait alleen de user-modus).
export function isScheduledCall(body: any): boolean {
  const expected = Deno.env.get('CRON_SECRET') ?? ''
  const provided = (body && typeof body.cron_secret === 'string') ? body.cron_secret : ''
  return Boolean(expected) && timingSafeEqual(provided, expected)
}


// ── Sync-runs vastleggen ────────────────────────────────────────────────────
// Elke sync — handmatig of via de cron — schrijft één rij in
// accounting_sync_runs. Zonder dat is een nachtelijke run alleen terug te
// vinden in de functielogs, en die leest niemand: een mislukte boeking bleef
// daardoor onzichtbaar tot iemand toevallig zijn boekhouding naliep.
//
// Best-effort: lukt het schrijven niet, dan gaat de sync gewoon door. Een
// kapotte logregel mag nooit een werkende synchronisatie tegenhouden.
//
// Bij de start wordt de rij aangemaakt en bij het einde bijgewerkt. Blijft
// `klaar_op` leeg, dan is de functie halverwege afgekapt (timeout) — ook dát is
// informatie die je wilt kunnen zien.

/** Maximaal aantal foutregels dat we bewaren; de rest wordt samengevat. */
const MAX_BEWAARDE_REGELS = 50

function kortLijst(regels: string[]): string[] {
  if (regels.length <= MAX_BEWAARDE_REGELS) return regels
  const rest = regels.length - MAX_BEWAARDE_REGELS
  return [...regels.slice(0, MAX_BEWAARDE_REGELS), `… en nog ${rest} ${rest === 1 ? 'regel' : 'regels'}`]
}

export async function startSyncRun(
  admin: any, companyId: string, provider: string, onderdeel: string, bron: 'cron' | 'handmatig',
): Promise<string | null> {
  try {
    const { data, error } = await admin
      .from('accounting_sync_runs')
      .insert({ company_id: companyId, provider, onderdeel, bron })
      .select('id')
      .single()
    if (error) { console.warn('[sync-run] start niet vastgelegd:', error.message); return null }
    return data?.id ?? null
  } catch (e: any) {
    console.warn('[sync-run] start niet vastgelegd:', e?.message)
    return null
  }
}

export async function eindSyncRun(
  admin: any, runId: string | null,
  uitslag: { gelukt: boolean; fout?: string | null; fouten?: string[]; meldingen?: string[]; samenvatting?: unknown },
): Promise<void> {
  if (!runId) return
  try {
    const { error } = await admin
      .from('accounting_sync_runs')
      .update({
        klaar_op: new Date().toISOString(),
        gelukt: uitslag.gelukt,
        fout: uitslag.fout ?? null,
        fouten: kortLijst(uitslag.fouten ?? []),
        meldingen: kortLijst(uitslag.meldingen ?? []),
        samenvatting: uitslag.samenvatting ?? null,
      })
      .eq('id', runId)
    if (error) console.warn('[sync-run] einde niet vastgelegd:', error.message)
  } catch (e: any) {
    console.warn('[sync-run] einde niet vastgelegd:', e?.message)
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// Loopt over alle bedrijven met een ACTIEVE Moneybird-connectie en draait
// `perCompany` per bedrijf. De bedrijvenlijst + tokens komen UITSLUITEND uit de
// afgebakende SECURITY DEFINER-functie get_moneybird_sync_targets() (alleen
// service_role mag die aanroepen; is_connected=true wordt daar afgedwongen).
// Eén kapotte connectie blokkeert de rest niet; kleine pauze tussen bedrijven
// i.v.m. de Moneybird rate-limits.
export async function forEachMoneybirdCompany(
  admin: any,
  perCompany: (companyId: string, token: string, adminId: string) => Promise<Record<string, unknown>>,
  betweenMs = 500,
) {
  const { data: targets, error } = await admin.rpc('get_moneybird_sync_targets')
  if (error) throw error

  const list = targets ?? []
  const results: Record<string, unknown>[] = []
  const errors: { company_id: string; error: string }[] = []

  for (const c of list) {
    try {
      const r = await perCompany(c.company_id, c.api_token, c.administration_id)
      results.push({ company_id: c.company_id, ...r })
    } catch (e: any) {
      console.error(`[moneybird-cron] bedrijf ${c.company_id} mislukt:`, e?.message)
      errors.push({ company_id: c.company_id, error: e?.message ?? String(e) })
    }
    if (betweenMs) await sleep(betweenMs)
  }

  return { scheduled: true, companies: list.length, ok: results.length, failed: errors.length, results, errors }
}
