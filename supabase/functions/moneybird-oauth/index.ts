import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { makeAdminClient } from "../_shared/scheduledSync.ts"
import { clientFout } from '../_shared/clientFout.ts'
import { heeftRecht } from '../_shared/eisRecht.ts'
import {
  autoriseerUrl, wisselCodeIn, haalAdministraties, laadKoppeling, mbFetch, trekTokenIn,
} from "../_shared/moneybird.ts"
import { zorgVoorWebhook, verwijderWebhook } from "../_shared/moneybirdWebhook.ts"

// Koppelen met Moneybird via OAuth. Eén functie, vijf acties:
//
//   start   → maakt een eenmalige state en geeft de inlog-URL van Moneybird.
//   terug   → de browser kwam terug met ?code=&state=. Wisselt de code in voor
//             tokens en haalt de administraties op. Is er precies één, dan is
//             de koppeling meteen klaar; anders kiest de klant.
//   kies    → legt de gekozen administratie vast en rondt af.
//   test    → probeert de opgeslagen koppeling.
//   los     → trekt het token in bij Moneybird en wist het hier.
//
// Alleen admins, en alleen met de feature boekhoudkoppeling (zoals SnelStart;
// de trigger bb_check_accounting_feature dwingt dat óók af bij het opslaan).
//
// De state bindt de terugkeer aan het bedrijf én de gebruiker die begon, en is
// 15 minuten geldig. Zonder die binding zou een aanvaller zijn eigen
// Moneybird-code aan andermans BossBase-bedrijf kunnen laten koppelen.
//
// Administratie-check (zoals snelstart-administratie-check): kiest de klant een
// ANDERE administratie dan de vorige keer, dan wijzen alle opgeslagen
// Moneybird-id's naar records die daar niet bestaan. Die worden dan gericht
// gewist, zodat alles in de nieuwe administratie opnieuw geboekt wordt. Bij
// dezelfde administratie blijven ze staan. Geïmporteerde rijen blijven altijd
// ongemoeid: die horen bij de oude administratie.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const STATE_GELDIG_MS = 15 * 60 * 1000

function nieuweState(): string {
  const b = new Uint8Array(24)
  crypto.getRandomValues(b)
  return Array.from(b, x => x.toString(16).padStart(2, '0')).join('')
}

async function rondAf(
  admin: any, companyId: string, rij: any, administratie: { id: string; naam: string },
): Promise<Record<string, unknown>> {
  const { data: vorig } = await admin
    .from('accounting_connections')
    .select('administration_id, api_token, webhook_id')
    .eq('company_id', companyId).eq('provider', 'moneybird')
    .maybeSingle()

  // Een eventuele webhook van een vorige koppeling hoort bij het oude token; die
  // ruimen we op voordat we overschrijven (best-effort).
  if (vorig?.api_token && vorig?.webhook_id && vorig?.administration_id) {
    await verwijderWebhook({
      admin, companyId, administratieId: String(vorig.administration_id),
      accessToken: vorig.api_token, refreshToken: null,
    }, String(vorig.webhook_id))
  }

  const nu = new Date().toISOString()
  const { error } = await admin.from('accounting_connections').upsert({
    company_id: companyId,
    provider: 'moneybird',
    api_token: rij.access_token,
    refresh_token: rij.refresh_token,
    administration_id: administratie.id,
    administratie_naam: administratie.naam,
    is_connected: true,
    koppeling_fout: null,
    webhook_id: null,
    webhook_secret: null,
    updated_at: nu,
  }, { onConflict: 'company_id,provider' })
  if (error) throw error

  await admin.from('moneybird_oauth_states').delete().eq('state', rij.state)

  // ── Administratie-check ────────────────────────────────────────────────
  let check: Record<string, unknown> = { status: vorig?.administration_id ? 'ongewijzigd' : 'vastgelegd' }
  if (vorig?.administration_id && String(vorig.administration_id) !== administratie.id) {
    const tel = async (tabel: string, velden: Record<string, unknown>, eigenOnly = false) => {
      let q = admin.from(tabel).update(velden).eq('company_id', companyId).not('moneybird_id', 'is', null)
      if (eigenOnly) q = q.is('externe_referentie', null)
      const { data } = await q.select('id')
      return (data || []).length
    }
    const hersteld = {
      klanten: await tel('customers', { moneybird_id: null, moneybird_versie: null, moneybird_hash: null }),
      leveranciers: await tel('leveranciers', { moneybird_id: null, moneybird_versie: null, moneybird_hash: null }),
      facturen: await tel('facturen', { moneybird_id: null, moneybird_payment_registered_at: null, moneybird_bijlage_gesynct: false }, true),
      kosten: await tel('job_costs', { moneybird_id: null, moneybird_bijlage_gesynct: false }, true),
    }
    check = {
      status: 'gewisseld',
      hersteld,
      melding:
        `Je hebt een andere administratie gekozen dan de vorige keer (${administratie.naam}). `
        + 'De verwijzingen naar de vorige administratie zijn gewist, zodat je facturen, kosten en relaties '
        + 'in deze administratie opnieuw geboekt worden. Wat eerder uit de oude administratie is opgehaald '
        + 'blijft staan als historie en wordt niet opnieuw verstuurd.',
    }
  }

  // Webhook aanmelden zodat betalingen en wijzigingen direct binnenkomen. Mislukt
  // dat, dan werkt de koppeling gewoon via de nachtelijke run; de sync probeert
  // het later opnieuw.
  const k = await laadKoppeling(admin, companyId)
  const webhook = k ? await zorgVoorWebhook(k) : { actief: false }

  return { success: true, klaar: true, administratie: administratie.naam, check, webhook }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const admin = makeAdminClient()
  const jwt = (req.headers.get('authorization') ?? '').replace('Bearer ', '')
  const body = await req.json().catch(() => ({}))
  const actie = String(body?.actie || '')

  try {
    const { data: { user }, error: authErr } = await admin.auth.getUser(jwt)
    if (authErr || !user) return json({ error: 'Niet ingelogd' }, 401)
    // Koppelen schrijft in de boekhouding van de klant: alleen admins.
    if (!(await heeftRecht(user.id, null))) {
      return json({ success: false, error: 'Alleen admins kunnen de Moneybird-koppeling beheren.' }, 403)
    }
    const { data: profile } = await admin.from('profiles').select('company_id').eq('id', user.id).maybeSingle()
    const companyId = profile?.company_id
    if (!companyId) return json({ error: 'Geen bedrijf gevonden' }, 400)

    if (actie === 'start') {
      const { data: magHet } = await admin.rpc('bb_has_feature', { p_company_id: companyId, p_feature: 'boekhoudkoppeling' })
      if (magHet === false) {
        return json({ success: false, error: 'De boekhoudkoppeling hoort niet bij je abonnement.' }, 403)
      }
      // Oude, niet afgemaakte pogingen van dit bedrijf opruimen.
      await admin.from('moneybird_oauth_states').delete().eq('company_id', companyId)
      const state = nieuweState()
      const { error } = await admin.from('moneybird_oauth_states').insert({ state, company_id: companyId, user_id: user.id })
      if (error) throw error
      return json({ success: true, url: autoriseerUrl(state) })
    }

    if (actie === 'terug' || actie === 'kies') {
      const state = String(body?.state || '')
      const { data: rij } = await admin.from('moneybird_oauth_states').select('*').eq('state', state).maybeSingle()
      if (!rij || rij.company_id !== companyId || rij.user_id !== user.id) {
        return json({ success: false, error: 'Deze koppelpoging is niet (meer) geldig. Klik opnieuw op "Koppel met Moneybird".' }, 400)
      }
      if (Date.now() - new Date(rij.aangemaakt_op).getTime() > STATE_GELDIG_MS) {
        await admin.from('moneybird_oauth_states').delete().eq('state', state)
        return json({ success: false, error: 'De koppelpoging is verlopen. Klik opnieuw op "Koppel met Moneybird".' }, 400)
      }

      if (actie === 'terug') {
        if (body?.fout) {
          await admin.from('moneybird_oauth_states').delete().eq('state', state)
          return json({ success: false, error: 'Je hebt de koppeling bij Moneybird niet goedgekeurd. Er is niets gewijzigd.' }, 400)
        }
        const code = String(body?.code || '')
        if (!code) return json({ success: false, error: 'Moneybird stuurde geen code terug.' }, 400)
        // Een tweede keer terug met dezelfde state (pagina ververst): de code is
        // dan al ingewisseld en de administraties staan klaar.
        if (!rij.access_token) {
          const tokens = await wisselCodeIn(code)
          const administraties = await haalAdministraties(tokens.access_token)
          await admin.from('moneybird_oauth_states')
            .update({ access_token: tokens.access_token, refresh_token: tokens.refresh_token, administraties })
            .eq('state', state)
          rij.access_token = tokens.access_token
          rij.refresh_token = tokens.refresh_token
          rij.administraties = administraties
        }
        const bruikbaar = (rij.administraties || []).filter((a: any) => !a.opgeschort)
        if (!bruikbaar.length) {
          return json({ success: false, error: 'Dit Moneybird-account heeft geen (actieve) administratie om te koppelen.' }, 400)
        }
        if (bruikbaar.length === 1) return json(await rondAf(admin, companyId, rij, bruikbaar[0]))
        return json({ success: true, klaar: false, state, administraties: bruikbaar.map((a: any) => ({ id: a.id, naam: a.naam })) })
      }

      // kies
      const gekozen = (rij.administraties || []).find((a: any) => a.id === String(body?.administration_id || ''))
      if (!gekozen || !rij.access_token) {
        return json({ success: false, error: 'Kies een van de getoonde administraties.' }, 400)
      }
      return json(await rondAf(admin, companyId, rij, gekozen))
    }

    if (actie === 'test') {
      const k = await laadKoppeling(admin, companyId)
      if (!k) return json({ success: false, error: 'Moneybird is niet gekoppeld.' }, 400)
      const lijst = await mbFetch(k, '/administrations', { zonderAdministratie: true })
      const adm = (Array.isArray(lijst) ? lijst : []).find((a: any) => String(a.id) === k.administratieId)
      if (!adm) {
        return json({ success: false, error: 'De gekoppelde administratie is niet meer bereikbaar met deze koppeling. Koppel opnieuw.' })
      }
      await admin.from('accounting_connections')
        .update({ administratie_naam: adm.name, koppeling_fout: null })
        .eq('company_id', companyId).eq('provider', 'moneybird')
      return json({ success: true, administratie: adm.name })
    }

    if (actie === 'los') {
      const { data: conn } = await admin
        .from('accounting_connections')
        .select('api_token, administration_id, webhook_id')
        .eq('company_id', companyId).eq('provider', 'moneybird')
        .maybeSingle()
      if (conn?.api_token) {
        if (conn.webhook_id && conn.administration_id) {
          await verwijderWebhook({
            admin, companyId, administratieId: String(conn.administration_id),
            accessToken: conn.api_token, refreshToken: null,
          }, String(conn.webhook_id))
        }
        await trekTokenIn(conn.api_token)
      }
      // Gesynchroniseerde gegevens en id's blijven staan, zoals bij SnelStart:
      // koppel je dezelfde administratie later opnieuw, dan gaat het verder
      // waar het was.
      await admin.from('accounting_connections')
        .update({
          api_token: null, refresh_token: null, webhook_id: null, webhook_secret: null,
          koppeling_fout: null, is_connected: false, updated_at: new Date().toISOString(),
        })
        .eq('company_id', companyId).eq('provider', 'moneybird')
      return json({ success: true })
    }

    return json({ error: 'Onbekende actie' }, 400)
  } catch (err: any) {
    console.error('moneybird-oauth:', err?.message)
    return json({ success: false, error: clientFout(err) }, 500)
  }
})
