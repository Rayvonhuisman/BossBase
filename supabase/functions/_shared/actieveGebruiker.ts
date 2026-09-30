// Controle voor Edge Functions die met service_role werken.
//
// De service_role omzeilt RLS, dus de databaseblokkade voor gedeactiveerde
// gebruikers (20260930170000) geldt daar niet. Auth weigert een token al zodra
// de sessie weg is (GoTrue: session_not_found), maar een account dat op een
// andere manier inactief is geworden, of een lid van een gesloten bedrijf,
// moet hier ook worden tegengehouden. Roep dit aan direct na auth.getUser().
//
// Geeft een Nederlandse foutmelding terug, of null als de gebruiker verder mag.
// Geen profiel (bijvoorbeeld tijdens registratie) = niet tegenhouden: daar gaat
// de functie zelf over.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export async function inactiefReden(userId: string): Promise<string | null> {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: p, error } = await admin
    .from('profiles').select('actief, company_id, is_super_admin').eq('id', userId).maybeSingle()
  if (error) return 'Account kon niet worden gecontroleerd.'
  if (!p) return null
  if (p.actief === false) return 'Dit account is gedeactiveerd.'
  if (p.is_super_admin || !p.company_id) return null
  const { data: c } = await admin.from('companies').select('status').eq('id', p.company_id).maybeSingle()
  // companies.status 'opgezegd' = gesloten via "Bedrijf sluiten" (cancel_company_account).
  // Een opgezegd abonnement staat in subscriptions en blokkeert hier niets.
  if (c?.status === 'opgezegd') return 'Dit bedrijf is gesloten.'
  return null
}
