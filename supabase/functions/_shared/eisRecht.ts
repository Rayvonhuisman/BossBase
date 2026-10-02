// Mag deze gebruiker deze koppelingsactie uitvoeren?
//
// De sync- en testfuncties draaien met de service-rol en controleerden alleen
// het bedrijf; een medewerker zonder enig recht kon zo een boekhoudsync starten
// (audit 2026-10-01, B-16). Admin mag altijd; anders het recht dat bij de actie
// hoort (kosten, facturen, klanten_bewerken, bedrijfsfinancien). `null` = alleen
// admin. Inactieve accounts nooit.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export async function heeftRecht(userId: string, recht: string | null): Promise<boolean> {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: p } = await admin.from('profiles').select('role, actief').eq('id', userId).maybeSingle()
  if (!p || p.actief === false) return false
  if (p.role === 'admin') return true
  if (!recht) return false
  const { data } = await admin.from('user_permissions')
    .select('permission').eq('user_id', userId).eq('permission', recht).eq('granted', true).maybeSingle()
  return Boolean(data)
}

export function geenRecht(cors: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ success: false, error: 'Je hebt geen recht om deze koppeling te gebruiken.' }), {
    status: 403, headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

// Het user-id uit de Authorization-header, of null (ook voor de anon-sleutel).
export async function ingelogdeGebruiker(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization') ?? req.headers.get('authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return null
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: { user } } = await client.auth.getUser()
  return user?.id ?? null
}
