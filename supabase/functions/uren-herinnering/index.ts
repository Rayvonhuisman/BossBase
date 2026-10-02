// uren-herinnering (verify_jwt=false, draait elk kwartier op de cron)
//
// De mailvariant van de pop-up "Vul je werkdag in". Eén mail per medewerker met
// de werkdagen die nog openstaan, en alleen voor bedrijven die in Instellingen
// "ook per mail" hebben aangezet.
//
// Wie er aan de beurt is bepaalt de database (bb_uren_herinnering_kandidaten):
// voor wie, wanneer en op welke dagen zijn regels over gegevens, en die staan
// bij de gegevens. Deze functie stuurt alleen nog. De cron roept hem bovendien
// pas aan als die lijst niet leeg is.
//
// Er valt van buitenaf niets te sturen: geen ontvanger, geen datum, geen
// bedrijf in de aanvraag. Een losse aanroep doet hooguit wat de cron een
// kwartier later ook had gedaan.
//
// Eén mail per werkdag per medewerker (uren_herinnering_mails). De dag wordt
// vastgelegd vóór het versturen en weer vrijgegeven als de mail mislukt: twee
// runs die elkaar overlappen sturen zo niet dubbel, en een mislukte mail gaat
// het volgende kwartier alsnog.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { vandaagIso, voegDagenToe } from '../_shared/datumTijd.ts'
import { isScheduledCall } from '../_shared/scheduledSync.ts'
import { mailTemplate, mailButton } from '../_shared/mailTemplate.ts'
import { logMailFout } from '../_shared/mailFout.ts'
import { appOrigin } from '../_shared/stripe.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const esc = (s: unknown) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const DAGEN = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag']
const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december']

/** "dinsdag 22 september" */
function leesbaar(datum: string): string {
  const d = new Date(`${datum}T12:00:00`)
  return `${DAGEN[d.getDay()]} ${d.getDate()} ${MAANDEN[d.getMonth()]}`
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

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    const { data: kandidaten, error } = await admin.rpc('bb_uren_herinnering_kandidaten')
    if (error) return json({ success: false, error: error.message }, 500)
    if (!kandidaten || kandidaten.length === 0) return json({ success: true, medewerkers: 0, verstuurd: 0 })

    // Per medewerker bundelen: één mail met al zijn open dagen.
    const perUser = new Map<string, { companyId: string, dagen: string[] }>()
    for (const k of kandidaten) {
      const u = perUser.get(k.profile_id) || { companyId: k.company_id, dagen: [] }
      u.dagen.push(k.datum)
      perUser.set(k.profile_id, u)
    }

    let verstuurd = 0
    let mislukt = 0

    for (const [userId, { companyId, dagen }] of perUser) {
      // Vastleggen vóór het sturen. Wat een andere run al had, valt hier af.
      const { data: vast, error: vastErr } = await admin
        .from('uren_herinnering_mails')
        .upsert(
          dagen.map(datum => ({ profile_id: userId, datum, company_id: companyId })),
          { onConflict: 'profile_id,datum', ignoreDuplicates: true },
        )
        .select('datum')
      if (vastErr) { console.error('vastleggen mislukt:', vastErr.message); mislukt += 1; continue }
      const mijnDagen = (vast || []).map((r: any) => r.datum as string).sort()
      if (mijnDagen.length === 0) continue

      const geefVrij = () => admin
        .from('uren_herinnering_mails').delete()
        .eq('profile_id', userId).in('datum', mijnDagen)

      // Adres en naam server-side ophalen; die horen nooit via de client te reizen.
      const { data: authUser } = await admin.auth.admin.getUserById(userId)
      const { data: prof } = await admin
        .from('profiles').select('full_name').eq('id', userId).maybeSingle()
      const { data: bedrijf } = await admin
        .from('companies').select('name, email').eq('id', companyId).maybeSingle()

      const naar = authUser?.user?.email
      const bedrijfsnaam = (bedrijf?.name as string) || 'BossBase'
      if (!naar) {
        // Bewust NIET vrijgeven: zonder adres lukt het over een kwartier ook
        // niet, en dan staat mail_fouten vol met steeds dezelfde regel.
        await logMailFout({
          soort: 'uren_herinnering', ontvanger: null, companyId, bedrijfNaam: bedrijfsnaam,
          fout: `Geen e-mailadres bekend voor gebruiker ${userId}`, bron: 'uren-herinnering',
        })
        mislukt += 1
        continue
      }

      const aantal = mijnDagen.length
      const meer = aantal > 1
      const html = mailTemplate({
        title: 'Vul je werkdag in',
        preheader: meer ? `Er staan nog ${aantal} werkdagen open` : `Je werkdag van ${leesbaar(mijnDagen[0])} staat nog open`,
        body: `<p>Hoi ${esc(prof?.full_name || 'collega')},</p>
               <p>Je stond ${meer ? 'op deze dagen' : 'op deze dag'} gepland bij ${esc(bedrijfsnaam)}, maar er ${meer ? 'zijn' : 'is'} nog geen werkdag ingevuld:</p>
               <ul style="padding-left:18px;margin:12px 0">${mijnDagen.map(d => `<li style="margin-bottom:4px">${esc(leesbaar(d))}</li>`).join('')}</ul>
               ${mailButton('Werkdag invullen', `${appOrigin('')}/login`)}
               <p style="color:#6b7280;font-size:13px">Na het inloggen kun je ${meer ? 'de dagen' : 'de dag'} direct invullen.</p>`,
        // Geen companyName/logoUrl/brandColor: post van BossBase aan een
        // medewerker, net als planning-samenvatting.
      })

      const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceKey}`,
          'x-internal-secret': Deno.env.get('SEND_EMAIL_SECRET') ?? '',
        },
        body: JSON.stringify({
          to: naar,
          subject: meer ? `Vul je werkdag in (${aantal} dagen open)` : 'Vul je werkdag in',
          html,
          from_name: 'BossBase',
          reply_to: bedrijf?.email || undefined,
          soort: 'uren_herinnering',
          company_id: companyId,
        }),
      })

      if (res.ok) {
        verstuurd += 1
      } else {
        // send-email legt de fout zelf vast in mail_fouten.
        await geefVrij()
        mislukt += 1
      }
    }

    // De pop-up kijkt veertien dagen terug; wat ouder is dan twee maanden heeft
    // geen functie meer.
    const grens = voegDagenToe(vandaagIso(), -60)
    await admin.from('uren_herinnering_mails').delete().lt('datum', grens)

    return json({ success: true, medewerkers: perUser.size, verstuurd, mislukt })
  } catch (e) {
    console.error('uren-herinnering', (e as Error).message)
    return json({ success: false, error: 'Urenherinnering mislukt' }, 500)
  }
})
