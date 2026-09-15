// meldpunt (verify_jwt=true)
//
// Neemt een bug of idee aan vanuit de bovenbalk van het portaal, legt hem vast
// in `meldingen`, mailt hem naar ons en stuurt de melder een bevestiging.
//
// Wie de melder is, bij welk bedrijf en op welk abonnement, bepalen we HIER uit
// de sessie en de database, niet uit wat de browser meestuurt. Alleen wat de
// server niet kan weten (pagina, browser, schermgrootte) komt uit de request.
//
// Volgorde is bewust:
//   1. Ingelogd?            geen sessie, geen melding
//   2. Invoer geldig?       vóór er iets wordt opgeslagen
//   3. Binnen de limiet?    tien per uur per gebruiker, tegen een klemmende knop
//                           of een script
//   4. Opslaan              vanaf hier is de melding binnen, wat er ook volgt
//   5. Schermafbeelding, mail naar ons, bevestiging: elk mag mislukken zonder
//      dat de melding verloren gaat. Het portaal toont hem dan nog steeds.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { stuurBossBaseMail } from '../_shared/billing.ts'
import { internMeldingMail, bevestigingMail, type Melding } from '../_shared/meldpuntMail.ts'

// Waar meldingen binnenkomen. Overschrijfbaar zonder deploy via een secret.
const MELDPUNT_ADRES = () => Deno.env.get('MELDPUNT_EMAIL') || 'info@bossbase.nl'

const MAX_PER_UUR    = 10
const MAX_TEKST      = 5000
const MAX_SCREENSHOT = 5 * 1024 * 1024  // gelijk aan de limiet op de bucket
const EXTENSIE: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// Vrije tekst uit de browser: afkappen, want die gaat de database en een mail in.
const tekst = (v: unknown, n: number) => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s ? s.slice(0, n) : null
}

const TIER_LABEL: Record<string, string> = { starter: 'Starter', groei: 'Groei', team: 'Team' }

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Alleen POST' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // ── 1. Ingelogd ──────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader) return json({ error: 'Niet geautoriseerd' }, 401)
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) return json({ error: 'Ongeldige sessie' }, 401)

    const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    // ── 2. Invoer ────────────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}))
    const soort = body?.soort === 'bug' || body?.soort === 'idee' ? body.soort : null
    if (!soort) return json({ error: 'Kies of het een bug of een idee is.' }, 400)

    const omschrijving = tekst(body?.omschrijving, MAX_TEKST)
    if (!omschrijving || omschrijving.length < 5) {
      return json({ error: 'Omschrijf in een paar woorden wat je wilt melden.' }, 400)
    }

    let screenshot: { bytes: Uint8Array; type: string; base64: string } | null = null
    if (body?.screenshot?.data) {
      const type = String(body.screenshot.type || '')
      if (!EXTENSIE[type]) return json({ error: 'De schermafbeelding moet een PNG, JPG of WebP zijn.' }, 400)
      const base64 = String(body.screenshot.data).replace(/^data:[^,]*,/, '')
      let bytes: Uint8Array
      try {
        bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
      } catch {
        return json({ error: 'De schermafbeelding kon niet worden gelezen.' }, 400)
      }
      if (bytes.length > MAX_SCREENSHOT) return json({ error: 'De schermafbeelding is groter dan 5 MB.' }, 400)
      screenshot = { bytes, type, base64 }
    }

    // ── 3. Limiet ────────────────────────────────────────────────────────────
    const uurGeleden = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count } = await admin
      .from('meldingen')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('aangemaakt_op', uurGeleden)
    if ((count ?? 0) >= MAX_PER_UUR) {
      return json({ error: 'Je hebt het afgelopen uur al veel meldingen gedaan. Probeer het later nog eens, of mail naar info@bossbase.nl.' }, 429)
    }

    // ── Wie en waar ──────────────────────────────────────────────────────────
    const { data: prof } = await admin
      .from('profiles').select('full_name, company_id, role').eq('id', user.id).maybeSingle()
    const companyId: string | null = prof?.company_id ?? null

    let bedrijfNaam: string | null = null
    let abonnement: string | null = null
    if (companyId) {
      const [{ data: bedrijf }, { data: sub }, { data: tier }] = await Promise.all([
        admin.from('companies').select('name').eq('id', companyId).maybeSingle(),
        admin.from('subscriptions')
          .select('plan, status, billing_interval, trial_ends_at, cancel_at_period_end')
          .eq('company_id', companyId).maybeSingle(),
        admin.rpc('bb_effective_tier', { p_company_id: companyId }),
      ])
      bedrijfNaam = bedrijf?.name ?? null
      // "Groei · trial tot 30-09-2026", "Team · actief · jaar", enz. Het
      // effectieve tier gaat vóór het opgeslagen plan: dat is wat de klant op
      // dat moment daadwerkelijk kan.
      const plan = (typeof tier === 'string' && tier) || sub?.plan || null
      if (plan || sub) {
        const delen = [TIER_LABEL[plan ?? ''] ?? plan ?? 'onbekend pakket']
        if (sub?.status === 'trial' && sub?.trial_ends_at) {
          delen.push(`trial tot ${new Date(sub.trial_ends_at).toLocaleDateString('nl-NL')}`)
        } else if (sub?.status) {
          delen.push(sub.status)
        }
        if (sub?.billing_interval) delen.push(sub.billing_interval)  // 'maand' of 'jaar'
        if (sub?.cancel_at_period_end) delen.push('opgezegd')
        abonnement = delen.join(' · ')
      }
    }

    const { data: instelling } = await admin
      .from('platform_instellingen').select('waarde').eq('sleutel', 'meldactie').maybeSingle()
    const prijzen: string[] = Array.isArray(instelling?.waarde?.prijzen) ? instelling.waarde.prijzen : []
    const actieActief = instelling?.waarde?.actief === true && prijzen.length > 0

    // ── 4. Opslaan ───────────────────────────────────────────────────────────
    const rij = {
      soort,
      omschrijving,
      company_id: companyId,
      user_id: user.id,
      bedrijf_naam: bedrijfNaam,
      gebruiker_naam: prof?.full_name ?? null,
      gebruiker_email: user.email ?? null,
      gebruiker_rol: prof?.role ?? null,
      abonnement,
      pagina: tekst(body?.pagina, 200),
      pagina_url: tekst(body?.pagina_url, 1000),
      browser: tekst(body?.browser, 200),
      user_agent: tekst(body?.user_agent, 1000),
      scherm: tekst(body?.scherm, 100),
      actie_deelname: actieActief,
    }
    const { data: opgeslagen, error: insErr } = await admin
      .from('meldingen').insert(rij).select('id, nummer').single()
    if (insErr || !opgeslagen) {
      console.error('melding opslaan mislukt', insErr?.message)
      return json({ error: 'Je melding kon niet worden opgeslagen. Probeer het nog eens.' }, 500)
    }

    // ── 5a. Schermafbeelding bewaren ─────────────────────────────────────────
    let screenshotPad: string | null = null
    if (screenshot) {
      const pad = `${companyId ?? 'zonder-bedrijf'}/${opgeslagen.id}.${EXTENSIE[screenshot.type]}`
      const { error: upErr } = await admin.storage.from('meldingen')
        .upload(pad, screenshot.bytes, { contentType: screenshot.type, upsert: false })
      if (upErr) console.error('schermafbeelding opslaan mislukt', upErr.message)
      else screenshotPad = pad
    }

    // ── 5b. Mail naar ons ────────────────────────────────────────────────────
    const melding: Melding = {
      nummer: opgeslagen.nummer,
      soort,
      omschrijving,
      bedrijfNaam,
      companyId,
      gebruikerNaam: rij.gebruiker_naam,
      gebruikerEmail: rij.gebruiker_email,
      gebruikerRol: rij.gebruiker_rol,
      abonnement,
      pagina: rij.pagina,
      paginaUrl: rij.pagina_url,
      browser: rij.browser,
      userAgent: rij.user_agent,
      scherm: rij.scherm,
      screenshot: !!screenshot,
      actieDeelname: actieActief,
    }
    const intern = internMeldingMail(melding)
    // De schermafbeelding gaat als bijlage mee, los van of het bewaren lukte:
    // in de mail wil je hem direct zien, zonder in te loggen op het portaal.
    const bijlagen = screenshot
      ? [{ filename: `melding-${opgeslagen.nummer}.${EXTENSIE[screenshot.type]}`, content: screenshot.base64 }]
      : undefined
    const mailId = await stuurBossBaseMail(MELDPUNT_ADRES(), intern.subject, intern.html, user.email ?? undefined, bijlagen)

    await admin.from('meldingen').update({
      screenshot_pad: screenshotPad,
      mail_verstuurd_op: mailId ? new Date().toISOString() : null,
    }).eq('id', opgeslagen.id)

    // ── 5c. Bevestiging naar de melder ───────────────────────────────────────
    let bevestigd = false
    if (user.email) {
      const b = bevestigingMail(melding, actieActief ? prijzen : null)
      bevestigd = !!(await stuurBossBaseMail(user.email, b.subject, b.html, MELDPUNT_ADRES()))
    }

    return json({ ok: true, nummer: opgeslagen.nummer, bevestigd, actie: actieActief })
  } catch (e) {
    console.error('meldpunt', (e as Error).message)
    return json({ error: 'Er ging iets mis bij het versturen. Probeer het nog eens.' }, 500)
  }
})
