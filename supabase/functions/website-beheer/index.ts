// website-beheer — de lijst Websites in de superadmin. Alleen voor
// profiles.is_super_admin (zelfde controle als super-admin-data).
//
//   lijst          → alle websites met bedrijf, intake, betalingen en verzoeken
//   bestand        → ondertekende link (1 uur) naar een bestand uit de intake
//   status         → status en/of link naar de site; mailt de klant bij een
//                    nieuwe status; bij "live" start de hosting
//   verzoek-status → status van een wijzigings- of domeinverzoek
//   domein-actief  → domein geregistreerd: jaarregel op het abonnement
//   email-actief   → zakelijke e-mail ingericht: maandregel op het abonnement
//   regel-stoppen  → een lopende abonnementsregel stopzetten
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { CORS, json, stuurBossBaseMail } from '../_shared/billing.ts'
import { clientFout } from '../_shared/clientFout.ts'
import { HOSTING_PER_MAAND, DOMEIN_PER_JAAR, EMAIL_PER_MAAND, STATUS_LABEL, WEBSITE_INTERN, mailStatus } from '../_shared/website.ts'
import { regelOpAbonnement } from '../_shared/websiteBetalen.ts'

const VERZOEK_STATUSSEN = ['nieuw', 'in_behandeling', 'prijsopgave', 'afgerond', 'afgewezen']

// Een doorlopende regel starten, tenzij er al een loopt van die soort.
async function startRegel(admin: any, companyId: string, r: { soort: 'hosting' | 'domein' | 'email'; omschrijving: string; bedrag: number; intervalMaanden?: number }): Promise<string> {
  const { data: loopt } = await admin.from('website_betalingen')
    .select('id').eq('company_id', companyId).eq('soort', r.soort).eq('status', 'loopt').limit(1)
  if (loopt?.length) return `${r.soort} liep al`
  try {
    await regelOpAbonnement(admin, { companyId, ...r })
    return `${r.soort} gestart`
  } catch (e) {
    return `${r.soort} NIET gestart: ${(e as Error).message}`
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Alleen POST' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let body: any
  try { body = await req.json() } catch { return json({ error: 'Ongeldige aanvraag' }, 400) }

  try {
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'Log opnieuw in.' }, 401)
    const { data: p } = await admin.from('profiles').select('is_super_admin').eq('id', user.id).maybeSingle()
    if (p?.is_super_admin !== true) return json({ error: 'Niet toegestaan' }, 403)

    switch (body.actie) {
      case 'lijst': {
        const [{ data: aanvragen }, { data: betalingen }, { data: verzoeken }] = await Promise.all([
          admin.from('website_aanvragen').select('*').order('aangevraagd_op', { ascending: false }),
          admin.from('website_betalingen').select('*').order('created_at'),
          admin.from('website_verzoeken').select('*').order('created_at', { ascending: false }),
        ])
        const ids = [...new Set([
          ...(aanvragen ?? []).map((a: any) => a.company_id),
          ...(verzoeken ?? []).map((v: any) => v.company_id),
        ])]
        const [{ data: bedrijven }, { data: subs }] = ids.length
          ? await Promise.all([
              admin.from('companies').select('id, name, email, phone, city, logo_url, is_testbedrijf').in('id', ids),
              admin.from('subscriptions').select('company_id, plan, billing_interval, stripe_status, welkomstactie').in('company_id', ids),
            ])
          : [{ data: [] }, { data: [] }]
        const websites = (aanvragen ?? []).map((a: any) => ({
          ...a,
          bedrijf: (bedrijven ?? []).find((b: any) => b.id === a.company_id) ?? null,
          abonnement: (subs ?? []).find((s: any) => s.company_id === a.company_id) ?? null,
          betalingen: (betalingen ?? []).filter((b: any) => b.company_id === a.company_id),
          verzoeken: (verzoeken ?? []).filter((v: any) => v.company_id === a.company_id),
        }))
        return json({ websites })
      }

      case 'bestand': {
        const pad = String(body.pad ?? '')
        if (!/^[0-9a-f-]{36}\//.test(pad) || pad.includes('..')) return json({ error: 'Ongeldig pad' }, 400)
        const { data, error } = await admin.storage.from('website-intake').createSignedUrl(pad, 3600)
        if (error || !data) return json({ error: 'Bestand niet gevonden' }, 404)
        return json({ url: data.signedUrl })
      }

      case 'status': {
        const { data: a } = await admin.from('website_aanvragen')
          .select('id, company_id, status, site_url, live_op, domein, domein_via_ons, email').eq('company_id', body.companyId).maybeSingle()
        if (!a) return json({ error: 'Website niet gevonden' }, 404)
        const status = body.status ?? a.status
        if (!STATUS_LABEL[status]) return json({ error: 'Onbekende status' }, 400)
        const siteUrl = body.siteUrl !== undefined ? (String(body.siteUrl).trim() || null) : a.site_url
        if (siteUrl && !/^https?:\/\//i.test(siteUrl)) return json({ error: 'De link begint met https://' }, 400)
        if (status === 'ter_beoordeling' && !siteUrl) return json({ error: 'Vul eerst de link naar de site in; die krijgt de klant in de mail.' }, 400)

        const nieuw = status !== a.status
        const nu = new Date().toISOString()
        const velden: Record<string, unknown> = { status, site_url: siteUrl }
        if (nieuw) velden.status_gewijzigd_op = nu
        if (nieuw && status === 'live' && !a.live_op) velden.live_op = nu
        const { error } = await admin.from('website_aanvragen').update(velden).eq('id', a.id)
        if (error) return json({ error: error.message }, 500)

        const uit: string[] = []
        // Livegang: hosting gaat in, en domein en e-mail als die in de intake
        // gekozen zijn. Elk als regel op het abonnement, elk hooguit één keer.
        if (nieuw && status === 'live') {
          const regels: { soort: 'hosting' | 'domein' | 'email'; omschrijving: string; bedrag: number; intervalMaanden?: number }[] = [
            { soort: 'hosting', omschrijving: 'Website-hosting', bedrag: HOSTING_PER_MAAND },
          ]
          if (a.domein_via_ons) regels.push({ soort: 'domein', omschrijving: `Domeinnaam ${a.domein ?? ''} (1 jaar)`, bedrag: DOMEIN_PER_JAAR, intervalMaanden: 12 })
          if (a.email) regels.push({ soort: 'email', omschrijving: 'Zakelijke e-mail', bedrag: EMAIL_PER_MAAND })
          for (const r of regels) uit.push(await startRegel(admin, a.company_id, r))
        }
        if (nieuw && body.mail !== false) {
          const { data: c } = await admin.from('companies').select('name, email').eq('id', a.company_id).maybeSingle()
          if (c?.email) {
            const m = mailStatus({ bedrijfsnaam: c.name, status, siteUrl })
            const id = await stuurBossBaseMail(c.email, m.subject, m.html, WEBSITE_INTERN, undefined, 'website_klant')
            uit.push(id ? 'klant gemaild' : 'mail mislukt')
          } else uit.push('geen e-mailadres')
        }
        return json({ ok: true, resultaat: uit })
      }

      case 'verzoek-status': {
        if (!VERZOEK_STATUSSEN.includes(body.status)) return json({ error: 'Onbekende status' }, 400)
        const klaar = body.status === 'afgerond' || body.status === 'afgewezen'
        const velden: Record<string, unknown> = { status: body.status, afgehandeld_op: klaar ? new Date().toISOString() : null }
        if (typeof body.notitie === 'string') velden.notitie = body.notitie.slice(0, 2000)
        const { error } = await admin.from('website_verzoeken').update(velden).eq('id', body.id)
        if (error) return json({ error: error.message }, 500)
        return json({ ok: true })
      }

      case 'domein-actief': {
        const domein = String(body.domein ?? '').trim().toLowerCase()
        if (!domein.includes('.')) return json({ error: 'Vul de domeinnaam in.' }, 400)
        const { data: bestaand } = await admin.from('website_betalingen')
          .select('id').eq('company_id', body.companyId).eq('soort', 'domein').eq('status', 'loopt').limit(1)
        if (!bestaand?.length) {
          await regelOpAbonnement(admin, {
            companyId: body.companyId, soort: 'domein', omschrijving: `Domeinnaam ${domein} (1 jaar)`,
            bedrag: DOMEIN_PER_JAAR, intervalMaanden: 12,
          })
        }
        await admin.from('website_aanvragen').update({ domein, domein_via_ons: true }).eq('company_id', body.companyId)
        await admin.from('website_verzoeken').update({ status: 'afgerond', afgehandeld_op: new Date().toISOString() })
          .eq('company_id', body.companyId).eq('soort', 'domein').in('status', ['nieuw', 'in_behandeling'])
        return json({ ok: true })
      }

      case 'email-actief': {
        const r = await startRegel(admin, body.companyId, { soort: 'email', omschrijving: 'Zakelijke e-mail', bedrag: EMAIL_PER_MAAND })
        await admin.from('website_aanvragen').update({ email: true }).eq('company_id', body.companyId)
        await admin.from('website_verzoeken').update({ status: 'afgerond', afgehandeld_op: new Date().toISOString() })
          .eq('company_id', body.companyId).eq('soort', 'email').in('status', ['nieuw', 'in_behandeling'])
        return json({ ok: true, resultaat: [r] })
      }

      case 'regel-stoppen': {
        const { error } = await admin.from('website_betalingen')
          .update({ status: 'gestopt' }).eq('id', body.id).eq('status', 'loopt')
        if (error) return json({ error: error.message }, 500)
        return json({ ok: true })
      }
    }
    return json({ error: 'Onbekende actie' }, 400)
  } catch (e) {
    console.error('website-beheer:', e)
    return json({ error: clientFout(e) }, 500)
  }
})
