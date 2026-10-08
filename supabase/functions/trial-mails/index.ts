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
import { vandaagIso } from '../_shared/datumTijd.ts'
import { isScheduledCall } from '../_shared/scheduledSync.ts'
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

import { logMailFout } from '../_shared/mailFout.ts'
import { afmeldLinks } from '../_shared/afmelden.ts'

// Rechtstreeks naar Resend, net als check-herinneringen. Niet via send-email:
// die functie eist een ingelogde gebruiker of het interne secret, en weigert
// bovendien post van een read-only account — precies de bedrijven die mail 15
// en 30 moeten krijgen.
async function verstuur(to: string, subject: string, html: string, soort = 'trial', eenKlikAfmelden?: string): Promise<string | null> {
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
      // Afmelden met één klik vanuit het mailprogramma (RFC 8058).
      ...(eenKlikAfmelden ? {
        headers: {
          'List-Unsubscribe': `<${eenKlikAfmelden}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      } : {}),
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    console.warn('Resend-fout:', data?.message ?? res.status)
    // Vastleggen: deze mails gaan vanuit een cron, dus er is niemand die een
    // foutmelding op zijn scherm krijgt.
    await logMailFout({
      soort,
      ontvanger: to,
      fout: String(data?.message ?? `Resend gaf status ${res.status}`),
      bron: 'trial-mails',
    })
    return null
  }
  return data?.id ?? null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  // Alleen de cron mag dit starten: die stuurt het geheim uit de vault mee
  // (edge_cron_secret = CRON_SECRET). De anon-sleutel alleen is publiek en
  // dus geen bewijs. Audit 2026-10-01, H7.
  const aanroep = await req.clone().json().catch(() => ({}))
  if (!isScheduledCall(aanroep)) {
    return new Response(JSON.stringify({ error: 'Niet toegestaan' }), {
      status: 403, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // GEEN vrij te kiezen ontvanger: de ontvangers komen uitsluitend uit de
  // database, en de bekijkmodus stuurt alleen naar ons eigen interne adres.
  // Aanroepen kan alleen met het cron-geheim (hierboven); ook `vandaag` en
  // `bekijken` zijn daarmee alleen voor ons. Het antwoord bevat geen namen of
  // e-mailadressen van klanten.

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
    datum: vandaag ?? vandaagIso(),
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
      const voorbeeld = await afmeldLinks(appUrl, '00000000-0000-4000-8000-000000000000')
      for (const nummer of TRIAL_MAIL_NUMMERS) {
        const m = trialMail(nummer as TrialMailNummer, {
          naam: 'Niels',
          trialEindigt: overMorgen,
          appUrl,
          afmeldUrl: voorbeeld.pagina,
          modules: [{ label: 'Planningsmodule', prijs: 10 }, { label: 'Voertuigen', prijs: 5 }],
        })
        const id = await verstuur(internAdres, `[dag ${nummer}] ${m.subject}`, m.html, `trial_${nummer}_bekijk`)
        if (id) { uitslag.verstuurd++; uitslag.details.push(`dag ${nummer} verstuurd`) }
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
        uitslag.details.push(`dag ${k.mail} al verstuurd`)
        continue
      }

      const afmelden = await afmeldLinks(appUrl, k.company_id)
      // Dag 11 en 14 noemen de modules die in de proef geprobeerd zijn.
      let modules: { label: string; prijs: number }[] = []
      if (k.mail === 11 || k.mail === 14) {
        const { data: pm } = await db.from('proef_modules')
          .select('module_key, plan_modules(label, price)').eq('company_id', k.company_id)
        modules = (pm ?? []).map((r: any) => ({ label: r.plan_modules?.label ?? r.module_key, prijs: Number(r.plan_modules?.price ?? 0) }))
      }
      const m = trialMail(k.mail as TrialMailNummer, {
        naam: k.naam,
        trialEindigt: k.trial_eindigt,
        appUrl,
        afmeldUrl: afmelden.pagina,
        modules,
      })

      const messageId = await verstuur(k.naar, m.subject, m.html, `trial_${k.mail}`, afmelden.eenKlik)
      if (messageId) {
        await db.rpc('bb_trial_mail_verstuurd', {
          p_company_id: k.company_id, p_mail: k.mail, p_message_id: messageId,
        })
        uitslag.verstuurd++
        uitslag.details.push(`dag ${k.mail} verstuurd`)
      } else {
        // Claim teruggeven zodat de volgende run het opnieuw probeert.
        await db.rpc('bb_geef_trial_mail_vrij', { p_company_id: k.company_id, p_mail: k.mail })
        uitslag.mislukt++
        uitslag.details.push(`dag ${k.mail} MISLUKT — morgen opnieuw`)
      }
    }

    return json(uitslag)
  } catch (e) {
    console.error('trial-mails:', e)
    return json({ error: 'Trial-mails mislukt', ...uitslag }, 500)
  }
})
