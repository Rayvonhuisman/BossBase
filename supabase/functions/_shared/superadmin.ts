// Gedeelde poort en logboek voor alles in de superadmin (edge functions
// `superadmin` en `website-beheer`).
//
// De poort, in deze volgorde:
//   1. een geldige sessie (auth.getUser controleert het token bij Supabase Auth);
//   2. profiles.is_super_admin = true, gelezen met de service-role (niet via
//      RLS, zodat geen policy het antwoord kan kleuren).
// Tweestapsverificatie is bewust niet verplicht (keuze gebruiker 2026-10-08):
// inloggen met wachtwoord is genoeg.
//
// Het logboek: elke handeling schrijft eerst een regel in superadmin_log en
// voert pas daarna uit. Lukt die eerste regel niet, dan gebeurt er niets. Na
// afloop krijgt de regel één keer zijn uitkomst (de database staat verder niets
// toe; zie migratie 20261008160116).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { json } from './billing.ts'

export type Superbeheerder = { id: string; naam: string; email: string }
export type LogSoort = 'aanvraag' | 'klant' | 'website' | 'support' | 'systeem'
export type LogRegel = {
  actie: string
  omschrijving: string
  soort: LogSoort
  companyId?: string | null
  doel?: string | null
  doelId?: string | null
  voor?: unknown
}

export function serviceClient() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function eisSuperbeheerder(req: Request, admin: any): Promise<Superbeheerder | Response> {
  const kop = req.headers.get('Authorization') ?? ''
  const token = kop.replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'Log opnieuw in.' }, 401)

  const { data: { user }, error } = await admin.auth.getUser(token)
  if (error || !user) return json({ error: 'Log opnieuw in.' }, 401)

  const { data: p } = await admin.from('profiles')
    .select('is_super_admin, full_name').eq('id', user.id).maybeSingle()
  if (p?.is_super_admin !== true) return json({ error: 'Niet toegestaan' }, 403)
  return { id: user.id, naam: p.full_name || user.email || 'Superbeheerder', email: user.email ?? '' }
}

// Voert `uitvoeren` uit met een regel in het logboek eromheen. De regel staat
// er al vóór de handeling; mislukt dat, dan stopt alles met een fout.
export async function metLog<T>(
  admin: any,
  wie: Superbeheerder,
  regel: LogRegel,
  uitvoeren: () => Promise<T>,
  na?: (uitkomst: T) => unknown,
): Promise<T> {
  const { data, error } = await admin.from('superadmin_log').insert({
    door: wie.id,
    door_naam: wie.naam,
    actie: regel.actie,
    omschrijving: regel.omschrijving,
    soort: regel.soort,
    company_id: regel.companyId ?? null,
    doel: regel.doel ?? null,
    doel_id: regel.doelId ?? null,
    voor: regel.voor ?? null,
  }).select('id').single()
  if (error || !data) throw new Error(`Logboek niet bereikbaar; er is niets gewijzigd (${error?.message ?? 'onbekend'})`)

  try {
    const uitkomst = await uitvoeren()
    await admin.from('superadmin_log')
      .update({ uitkomst: 'gelukt', na: na ? (na(uitkomst) ?? null) : null })
      .eq('id', data.id)
    return uitkomst
  } catch (e) {
    await admin.from('superadmin_log')
      .update({ uitkomst: 'mislukt', fout: String((e as Error)?.message ?? e).slice(0, 500) })
      .eq('id', data.id)
    throw e
  }
}
