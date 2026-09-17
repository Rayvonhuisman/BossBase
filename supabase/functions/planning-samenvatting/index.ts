// planning-samenvatting (verify_jwt=false, draait op de cron om 18:00)
//
// Eén mail per medewerker met alles wat er vandaag aan zijn planning veranderde.
//
// Waarom gebundeld: tijdens het puzzelen schuift een planner een blok soms drie
// keer heen en weer. Bij elke verschuiving mailen levert drie berichten op voor
// één wijziging. De melding IN de app komt wel meteen; alleen de post wacht.
//
// 18:00 is bewust gekozen: dan hoor je vanavond nog dat je morgen ergens anders
// moet zijn. Een ochtendmail zou dat te laat maken.
//
// De regels komen uit planning_wijzigingen; wat mee is gegaan krijgt verwerkt_op.
// Mislukt de mail, dan blijft verwerkt_op leeg en gaat hij morgen alsnog mee —
// liever een dag te laat dan helemaal niet.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { mailTemplate } from '../_shared/mailTemplate.ts'
import { logMailFout } from '../_shared/mailFout.ts'

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

/** "dinsdag 22 september om 08:00" — zo leest een monteur het, niet als 2026-09-22. */
function leesbaar(datum: string | null, tijd: string | null): string {
  if (!datum) return 'niet ingepland'
  const d = new Date(`${datum}T12:00:00`)
  const basis = `${DAGEN[d.getDay()]} ${d.getDate()} ${MAANDEN[d.getMonth()]}`
  return tijd ? `${basis} om ${String(tijd).slice(0, 5)}` : basis
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    const { data: open, error } = await admin
      .from('planning_wijzigingen')
      .select('*')
      .is('verwerkt_op', null)
      .order('aangemaakt_op', { ascending: true })
      .limit(2000)
    if (error) return json({ success: false, error: error.message }, 500)
    if (!open || open.length === 0) return json({ success: true, medewerkers: 0, wijzigingen: 0 })

    // Per medewerker bundelen.
    const perUser = new Map<string, any[]>()
    for (const rij of open) {
      const lijst = perUser.get(rij.user_id) || []
      lijst.push(rij)
      perUser.set(rij.user_id, lijst)
    }

    let verstuurd = 0
    const mislukt: string[] = []

    for (const [userId, rijen] of perUser) {
      const companyId = rijen[0].company_id

      // Adres en naam server-side ophalen; die horen nooit via de client te reizen.
      const { data: authUser } = await admin.auth.admin.getUserById(userId)
      const { data: prof } = await admin
        .from('profiles').select('full_name').eq('id', userId).maybeSingle()
      const { data: bedrijf } = await admin
        // Alleen naam (voor mail_fouten) en e-mail (voor reply-to): logo en
        // huisstijlkleur zijn hier niet meer nodig sinds deze mail als BossBase
        // uitgaat.
        .from('companies').select('name, email').eq('id', companyId).maybeSingle()

      const naar = authUser?.user?.email
      const bedrijfsnaam = (bedrijf?.name as string) || 'BossBase'
      if (!naar) {
        await logMailFout({
          soort: 'planning_samenvatting', ontvanger: null, companyId, bedrijfNaam: bedrijfsnaam,
          fout: `Geen e-mailadres bekend voor gebruiker ${userId}`, bron: 'planning-samenvatting',
        })
        continue
      }

      const regel = (r: any) => {
        const wat = `<strong>${esc(r.titel || r.werkbon_nummer || 'Klus')}</strong>${r.klant ? ` — ${esc(r.klant)}` : ''}`
        if (r.soort === 'afgehaald') {
          return `<li style="margin-bottom:8px">${wat}<br><span style="color:#b45309">Je staat hier niet meer op.</span> Was: ${esc(leesbaar(r.oude_datum, r.oude_start))}.</li>`
        }
        if (r.soort === 'ingepland') {
          return `<li style="margin-bottom:8px">${wat}<br>Nieuw ingepland: <strong>${esc(leesbaar(r.nieuwe_datum, r.nieuwe_start))}</strong>.</li>`
        }
        return `<li style="margin-bottom:8px">${wat}<br>Was ${esc(leesbaar(r.oude_datum, r.oude_start))}, wordt <strong>${esc(leesbaar(r.nieuwe_datum, r.nieuwe_start))}</strong>.</li>`
      }

      const aantal = rijen.length
      const html = mailTemplate({
        title: 'Je planning is gewijzigd',
        preheader: `${aantal} wijziging${aantal === 1 ? '' : 'en'} in je planning`,
        body: `<p>Hoi ${esc(prof?.full_name || 'collega')},</p>
               <p>Er ${aantal === 1 ? 'is' : 'zijn'} vandaag ${aantal} wijziging${aantal === 1 ? '' : 'en'} in je planning doorgevoerd:</p>
               <ul style="padding-left:18px;margin:12px 0">${rijen.map(regel).join('')}</ul>
               <p style="color:#6b7280;font-size:13px">Kijk in BossBase onder Planning voor je volledige week.</p>`,
        // Bewust GEEN companyName/logoUrl/brandColor: dit is post van BossBase
        // aan een medewerker, niet van het bedrijf aan een klant. Zonder
        // companyName kiest mailTemplate vanzelf de BossBase-variant (officieel
        // logo, BossBase-groen). De bedrijfsnaam blijft hierboven wel staan voor
        // mail_fouten.
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
          subject: `Je planning is gewijzigd (${aantal} wijziging${aantal === 1 ? '' : 'en'})`,
          html,
          from_name: 'BossBase',
          reply_to: bedrijf?.email || undefined,
          soort: 'planning_samenvatting',
          company_id: companyId,
        }),
      })

      if (res.ok) {
        // Alleen afvinken wat écht mee is gegaan. Mislukt het, dan blijft het
        // openstaan en gaat het morgen alsnog mee.
        const { error: updErr } = await admin
          .from('planning_wijzigingen')
          .update({ verwerkt_op: new Date().toISOString() })
          .in('id', rijen.map((r: any) => r.id))
        if (updErr) console.error('verwerkt_op zetten mislukt:', updErr.message)
        verstuurd += 1
      } else {
        // send-email legt de fout zelf vast in mail_fouten.
        mislukt.push(userId)
      }
    }

    return json({ success: true, medewerkers: perUser.size, verstuurd, mislukt: mislukt.length, wijzigingen: open.length })
  } catch (e) {
    console.error('planning-samenvatting', (e as Error).message)
    return json({ success: false, error: String(e) }, 500)
  }
})
