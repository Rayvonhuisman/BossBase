// opschonen (verify_jwt=false, draait dagelijks op de cron)
//
// Voert de bewaartermijnen uit die in de algemene voorwaarden, de
// privacyverklaring en de verwerkersovereenkomst staan (migratie
// 20260930083452):
//   - een bedrijf 2 jaar na het einde van het abonnement: rijen, bestanden in de
//     opslag en inlogaccounts;
//   - contactformulier 1 jaar, Boss-gesprekken 12 maanden, meldpunt 2 jaar (met
//     schermafbeelding), resettokens en aanmeldcodes 24 uur.
//
// Wat SQL niet kan, doet deze functie: bestanden weghalen via de Storage-API en
// inlogaccounts via de Auth-API. Welke dat zijn en of een bedrijf in aanmerking
// komt, bepaalt de database (bb_opschoning_*); bb_opschoning_verwijder
// controleert dat zelf nog een keer.
//
// Volgorde per bedrijf: bestanden → rijen → inlogaccounts. Bestanden eerst,
// omdat de lijst uit de rijen komt. Inlogaccounts als laatste, omdat
// werkbon_uren.profile_id (NO ACTION) het verwijderen van een profiel blokkeert
// zolang de uren er nog zijn. Mislukt een stap, dan slaan we de rest van dat
// bedrijf over; de volgende run probeert het opnieuw.
//
// Alleen met het cron_secret uit de vault: deze functie verwijdert gegevens.
// {"droogloop": true} verwijdert niets en laat alleen zien wat er weg zou gaan.
// Logs en antwoord bevatten geen namen of e-mailadressen, behalve de
// bedrijfsnaam in een droogloop (om te kunnen beoordelen).
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { makeAdminClient, isScheduledCall } from '../_shared/scheduledSync.ts'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const JAREN = 2

type Bestand = { bucket_id: string; name: string }

function perBucket(bestanden: Bestand[]): Record<string, string[]> {
  const uit: Record<string, string[]> = {}
  for (const b of bestanden) (uit[b.bucket_id] ??= []).push(b.name)
  return uit
}

// Storage verwijdert per bucket; in stukken van 100 om binnen de limieten te blijven.
async function verwijderBestanden(db: ReturnType<typeof makeAdminClient>, bestanden: Bestand[]) {
  for (const [bucket, namen] of Object.entries(perBucket(bestanden))) {
    for (let i = 0; i < namen.length; i += 100) {
      const { error } = await db.storage.from(bucket).remove(namen.slice(i, i + 100))
      if (error) throw new Error(`opslag ${bucket}: ${error.message}`)
    }
  }
}

serve(async (req) => {
  const body = await req.json().catch(() => ({}))
  if (!isScheduledCall(body)) return json({ error: 'Niet toegestaan' }, 403)

  const droogloop = body?.droogloop === true
  const db = makeAdminClient()
  const uit: Record<string, unknown> = { droogloop, bedrijven: [], termijnen: null, fouten: [] as string[] }
  const fouten = uit.fouten as string[]

  try {
    // ── Losse bewaartermijnen ────────────────────────────────────────────────
    const { data: telling, error: tErr } = await db.rpc('bb_opschoning_termijnen_te_verwijderen')
    if (tErr) throw tErr
    const { data: meldBestanden, error: mErr } = await db.rpc('bb_opschoning_meldpunt_bestanden')
    if (mErr) throw mErr

    if (droogloop) {
      uit.termijnen = {
        telling,
        meldpunt_bestanden: (meldBestanden ?? []).length,
      }
    } else {
      try {
        await verwijderBestanden(db, meldBestanden ?? [])
        const { data: weg, error } = await db.rpc('bb_opschoning_termijnen')
        if (error) throw error
        uit.termijnen = { verwijderd: weg, meldpunt_bestanden: (meldBestanden ?? []).length }
      } catch (e) {
        fouten.push(`termijnen: ${(e as Error).message}`)
      }
    }

    // ── Bedrijven 2 jaar na het einde ────────────────────────────────────────
    const { data: kandidaten, error: kErr } = await db.rpc('bb_opschoning_kandidaten', { p_jaren: JAREN })
    if (kErr) throw kErr

    for (const k of kandidaten ?? []) {
      const { data: bestanden, error: bErr } = await db.rpc('bb_opschoning_bestanden', { p_company: k.company_id })
      const { data: gebruikers, error: gErr } = await db.rpc('bb_opschoning_gebruikers', { p_company: k.company_id })
      if (bErr || gErr) { fouten.push(`${k.company_id}: lijsten ophalen mislukt`); continue }

      const perBak = Object.fromEntries(Object.entries(perBucket(bestanden ?? [])).map(([b, n]) => [b, n.length]))

      if (droogloop) {
        ;(uit.bedrijven as unknown[]).push({
          company_id: k.company_id,
          naam: k.naam,
          einde: k.einde,
          klanten: k.klanten,
          inlogaccounts: (gebruikers ?? []).length,
          bestanden: perBak,
        })
        continue
      }

      try {
        await verwijderBestanden(db, bestanden ?? [])
      } catch (e) {
        fouten.push(`${k.company_id}: ${(e as Error).message}`)
        continue
      }

      const { data: rijen, error: vErr } = await db.rpc('bb_opschoning_verwijder', { p_company: k.company_id, p_jaren: JAREN })
      if (vErr) { fouten.push(`${k.company_id}: rijen: ${vErr.message}`); continue }

      let accounts = 0
      for (const g of gebruikers ?? []) {
        const { error } = await db.auth.admin.deleteUser(g.user_id)
        if (error) fouten.push(`${k.company_id}: inlogaccount ${g.user_id}: ${error.message}`)
        else accounts++
      }

      ;(uit.bedrijven as unknown[]).push({ company_id: k.company_id, rijen, bestanden: perBak, inlogaccounts: accounts })
    }

    console.log('[opschonen]', JSON.stringify({
      droogloop,
      bedrijven: (uit.bedrijven as unknown[]).length,
      fouten: fouten.length,
    }))
    return json(uit, fouten.length ? 207 : 200)
  } catch (e) {
    console.error('[opschonen] fout:', (e as Error).message)
    return json({ ...uit, error: (e as Error).message }, 500)
  }
})
