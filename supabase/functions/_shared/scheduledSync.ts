import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// Gedeelde helpers om edge functions zowel door een ingelogde gebruiker
// (user-JWT) als door pg_cron (service-role key) te laten draaien.
//
// - User-modus: de bestaande flow — één bedrijf, afgeleid uit de user.
// - Scheduled-modus: herkend aan een service-role aanroep → loop over ALLE
//   bedrijven met een actieve connectie. Alleen de service-role key (uit Vault,
//   door de eigenaar gezet als `edge_cron_service_key`) kan dit triggeren, zodat
//   een privileged all-company sync niet vanaf een gewone/anon-caller kan.

export function makeAdminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )
}

// True wanneer de aanroep met de service-role key als bearer is gedaan (cron/
// backend), niet met een gewone gebruikers-JWT. Alleen dan draait de loop.
export function isServiceRoleCall(jwt: string): boolean {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  return Boolean(jwt) && Boolean(key) && jwt === key
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// Loopt over alle bedrijven met een ACTIEVE Moneybird-connectie en draait
// `perCompany` per bedrijf. Vereist is_connected=true: een cron mag niet
// automatisch syncen voor een bedrijf dat de koppeling heeft losgekoppeld
// (fout gedrag + onnodige API-calls). De user-flow houdt parity — handmatig
// syncen is een expliciete actie en checkt is_connected niet.
// Eén kapotte connectie blokkeert de rest niet; er zit een kleine pauze tussen
// bedrijven i.v.m. de Moneybird rate-limits.
export async function forEachMoneybirdCompany(
  admin: any,
  perCompany: (companyId: string, token: string, adminId: string) => Promise<Record<string, unknown>>,
  betweenMs = 500,
) {
  const { data: conns, error } = await admin
    .from('accounting_connections')
    .select('company_id, api_token, administration_id')
    .eq('provider', 'moneybird')
    .eq('is_connected', true)
    .not('api_token', 'is', null)
    .not('administration_id', 'is', null)
  if (error) throw error

  const list = conns ?? []
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
