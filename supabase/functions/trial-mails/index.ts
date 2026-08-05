// trial-mails (verify_jwt=false, draait op de cron)
//
// Stuurt dagelijks de trial-mails die vandaag aan de beurt zijn. Wie er aan de
// beurt is bepaalt de database (bb_trial_mail_kandidaten); deze functie stuurt
// alleen nog. Die scheiding is bewust: de voorwaarde "alleen zonder abonnement"
// is een regel over gegevens, en die hoort bij de gegevens te staan.
//
// Aparte functie naast check-herinneringen, want het is een ander soort post:
// check-herinneringen stuurt namens ONZE klant naar ZIJN klanten, met diens
// logo en kleuren. Dit gaat van ons naar onze klant, met onze eigen afzender.
// Ze in één functie proppen zou betekenen dat één fout beide stilzet.
//
// Handmatig draaien kan ook, met een datum en/of een doeladres:
//   { "vandaag": "2026-08-20" }   → alsof het die dag is
//   { "bekijken": true }          → alle vijf naar ons eigen interne adres,
//                                   zonder iets vast te leggen
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { appOrigin } from '../_shared/stripe.ts'
import {
  trialMail, TRIAL_AFZENDER, TRIAL_REPLY_TO, TRIAL_MAIL_NUMMERS,
  type TrialMailNummer,
} from '../_shared/trialMails.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  })

// Rechtstreeks naar Resend, net als check-herinneringen. Niet via send-email:
// die functie eist een ingelogde gebruiker of het interne secret, en weigert
// bovendien post van een read-only account — precies de bedrijven die mail 15
// en 30 moeten krijgen.
async function verstuur(to: string, subject: string, html: string): Promise<string | null> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'noreply@bossbase.nl'
  if (!apiKey) { console.warn('RESEND_API_KEY niet ingesteld — mail overgeslagen'); return null }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `${TRIAL_AFZENDER} <${fromEmail}>`,
      to,
      subject,
      html,
      reply_to: TRIAL_REPLY_TO,
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) { console.warn('Resend-fout:', data?.message ?? res.status); return null }
  return data?.id ?? null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // GEEN vrij te kiezen ontvanger. Deze functie staat op verify_jwt=false — de
  // cron heeft geen ingelogde gebruiker — en is daarmee vanaf internet
  // aanroepbaar. Een `naar`-parameter in het verzoek zou dit een open mailrelay
  // maken.
  //
  // Een sleutelcontrole leek de oplossing, maar bleek onhoudbaar: de bestaande
  // cron authenticeert met de anon-sleutel uit de vault (zie
  // check-herinneringen), niet met de service-role. Vergelijken met
  // SUPABASE_SERVICE_ROLE_KEY zou de cron dus buitensluiten, en een eigen secret
  // is één ding extra dat stil kan breken.
  //
  // Daarom: de ontvangers komen UITSLUITEND uit de database, en de bekijkmodus
  // stuurt alleen naar ons eigen interne adres. Wie deze functie ongevraagd
  // aanroept, kan hooguit de mails van vandaag een paar uur vervroegen — en de
  // claim in trial_mails zorgt dat het er nooit twee worden.

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const body = await req.json().catch(() => ({}))
  const vandaag: string | null = body?.vandaag ?? null
  // Bekijkmodus: alle vijf naar ONS eigen adres, om ze te kunnen beoordelen.
  // Het adres komt uit de omgeving, nooit uit het verzoek.
  const bekijken: boolean = body?.bekijken === true
  const internAdres = Deno.env.get('BOSSBASE_INTERN_EMAIL') || 'hallo@bossbase.nl'
  const appUrl = appOrigin('')

  const uitslag = {
    datum: vandaag ?? new Date().toISOString().slice(0, 10),
    verstuurd: 0,
    overgeslagen: 0,
    mislukt: 0,
    details: [] as string[],
  }

  try {
    // ── Bekijkmodus ──────────────────────────────────────────────────────────
    // Alle vijf naar één adres, met verzonnen gegevens. Legt niets vast en
    // raakt geen enkel bedrijf — puur om te zien hoe ze eruitzien.
    if (bekijken) {
      const overMorgen = new Date(Date.now() + 3 * 86400_000).toISOString()
      for (const nummer of TRIAL_MAIL_NUMMERS) {
        const m = trialMail(nummer as TrialMailNummer, {
          naam: 'Niels',
          trialEindigt: overMorgen,
          appUrl,
        })
        const id = await verstuur(internAdres, `[dag ${nummer}] ${m.subject}`, m.html)
        if (id) { uitslag.verstuurd++; uitslag.details.push(`dag ${nummer} → ${internAdres}`) }
        else    { uitslag.mislukt++;   uitslag.details.push(`dag ${nummer} MISLUKT`) }
      }
      return json({ modus: 'bekijken', ...uitslag })
    }

    // ── Normale run ──────────────────────────────────────────────────────────
    const { data: kandidaten, error } = await db
      .rpc('bb_trial_mail_kandidaten', vandaag ? { p_vandaag: vandaag } : {})
    if (error) throw new Error(`kandidaten ophalen mislukt: ${error.message}`)

    for (const k of (kandidaten ?? [])) {
      // Eerst claimen, dan sturen. Andersom zou een tweede cronrun die
      // halverwege binnenkomt dezelfde mail nog eens kunnen versturen.
      const { data: geclaimd } = await db.rpc('bb_claim_trial_mail', {
        p_company_id: k.company_id,
        p_mail: k.mail,
        p_naar: k.naar,
      })
      if (geclaimd !== true) {
        uitslag.overgeslagen++
        uitslag.details.push(`${k.bedrijfsnaam}: dag ${k.mail} al verstuurd`)
        continue
      }

      const m = trialMail(k.mail as TrialMailNummer, {
        naam: k.naam,
        trialEindigt: k.trial_eindigt,
        appUrl,
      })

      const messageId = await verstuur(k.naar, m.subject, m.html)
      if (messageId) {
        await db.rpc('bb_trial_mail_verstuurd', {
          p_company_id: k.company_id, p_mail: k.mail, p_message_id: messageId,
        })
        uitslag.verstuurd++
        uitslag.details.push(`${k.bedrijfsnaam}: dag ${k.mail} → ${k.naar}`)
      } else {
        // Claim teruggeven zodat de volgende run het opnieuw probeert.
        await db.rpc('bb_geef_trial_mail_vrij', { p_company_id: k.company_id, p_mail: k.mail })
        uitslag.mislukt++
        uitslag.details.push(`${k.bedrijfsnaam}: dag ${k.mail} MISLUKT — morgen opnieuw`)
      }
    }

    return json(uitslag)
  } catch (e) {
    console.error('trial-mails:', e)
    return json({ error: (e as Error).message, ...uitslag }, 500)
  }
})
