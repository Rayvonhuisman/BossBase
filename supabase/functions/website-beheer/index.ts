// website-beheer — de lijst Websites in de superadmin. Alleen voor
// profiles.is_super_admin (zelfde poort als de functie superadmin).
//
//   lijst          → alle websites met bedrijf, intake, betalingen en verzoeken
//   bestand        → ondertekende link (1 uur) naar een bestand uit de intake
//   status         → status en/of link naar de site; mailt de klant bij een
//                    nieuwe status; bij "live" start de hosting
//   verzoek-status → status van een wijzigings- of domeinverzoek
//   domein-actief  → domein geregistreerd: jaarregel op het abonnement
//   email-actief   → zakelijke e-mail ingericht (totaal aantal adressen):
//                    maandregel op het abonnement, vervangt een lopende
//   regel-stoppen  → een lopende abonnementsregel stopzetten
//   hosting-link   → klant mailen dat hij de hosting los moet afsluiten (geen
//                    lopend abonnement); hij betaalt vanaf de pagina Website
//   traject-starten→ aanvraag openen, taak zetten en de intakelink mailen; bij
//                    een klant die nog op de intake wacht: een verse link.
//                    Ook intern aan te roepen met het cron-geheim (net.http_post
//                    uit de database), bijvoorbeeld voor een testbedrijf.
//
// Poort en logboek: zie _shared/superadmin.ts. Alleen superbeheerders;
// elke handeling behalve `lijst` staat in
// superadmin_log (ook het openen van een intakebestand).
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { CORS, json, stuurBossBaseMail } from '../_shared/billing.ts'
import { clientFout } from '../_shared/clientFout.ts'
import { HOSTING_PER_MAAND, DOMEIN_PER_JAAR, EMAIL_PER_MAAND, STATUS_LABEL, WEBSITE_INTERN, mailStatus, mailHostingNodig, startWebsiteTraject } from '../_shared/website.ts'
import { isScheduledCall } from '../_shared/scheduledSync.ts'
import { regelOpAbonnement, hostingStand } from '../_shared/websiteBetalen.ts'
import { eisSuperbeheerder, metLog } from '../_shared/superadmin.ts'

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

  let body: any
  try { body = await req.json() } catch { return json({ error: 'Ongeldige aanvraag' }, 400) }

  try {
    // Intern (cron-geheim) mag alleen het traject starten; de rest vraagt een
    // ingelogde superadmin.
    const intern = body?.actie === 'traject-starten' && isScheduledCall(body)
    if (intern) return await handel(admin, body)

    const wie = await eisSuperbeheerder(req, admin)
    if (wie instanceof Response) return wie
    if (body.actie === 'lijst') return await handel(admin, body)

    // Alles behalve de lijst gaat het logboek in. Bij welk bedrijf hoort het?
    let companyId: string | null = body.companyId ?? null
    if (!companyId && body.actie === 'verzoek-status') companyId = (await admin.from('website_verzoeken').select('company_id').eq('id', body.id).maybeSingle()).data?.company_id ?? null
    if (!companyId && body.actie === 'regel-stoppen') companyId = (await admin.from('website_betalingen').select('company_id').eq('id', body.id).maybeSingle()).data?.company_id ?? null
    if (!companyId && body.actie === 'bestand') companyId = /^[0-9a-f-]{36}\//.test(String(body.pad ?? '')) ? String(body.pad).slice(0, 36) : null
    const { data: c } = companyId ? await admin.from('companies').select('name').eq('id', companyId).maybeSingle() : { data: null }
    const omschrijving: Record<string, string> = {
      'bestand': `Intakebestand geopend (${String(body.pad ?? '').split('/').pop()})`,
      'status': `Website-status → ${STATUS_LABEL[body.status] ?? body.status ?? 'ongewijzigd'}${body.siteUrl !== undefined ? ` · link ${body.siteUrl || '(leeg)'}` : ''}${body.mail === false ? ' · zonder mail' : ''}${body.zonderHosting ? ' · zonder hosting' : ''}`,
      'verzoek-status': `Verzoek → ${body.status}${typeof body.notitie === 'string' ? ' (met notitie)' : ''}`,
      'domein-actief': `Domein actief: ${body.domein ?? ''}`,
      'email-actief': `Zakelijke e-mail actief: ${body.aantal ?? 1} adres(sen)`,
      'traject-starten': 'Intakelink (opnieuw) gestuurd',
      'hosting-link': 'Klant gemaild: hosting afsluiten',
      'regel-stoppen': 'Betaalregel gestopt',
    }
    if (!omschrijving[body.actie]) return json({ error: 'Onbekende actie' }, 400)
    let antwoord: Response | null = null
    try {
      await metLog(admin, wie, {
        actie: `website.${body.actie}`, soort: 'website', omschrijving: omschrijving[body.actie],
        companyId, doel: c?.name ?? null, doelId: body.id ?? body.companyId ?? null,
      }, async () => {
        antwoord = await handel(admin, body)
        if (!antwoord.ok) {
          const tekst = await antwoord.clone().json().then((j: any) => j?.error).catch(() => null)
          throw new Error(tekst ?? `status ${antwoord.status}`)
        }
        return antwoord.clone().json().catch(() => ({}))
      }, (u: any) => u?.resultaat ? { resultaat: u.resultaat } : null)
    } catch (e) {
      // De handeling zelf gaf een fout (die staat in het logboek): geef het
      // oorspronkelijke antwoord terug. Geen antwoord = het logboek faalde.
      if (antwoord) return antwoord
      throw e
    }
    return antwoord!
  } catch (e) {
    console.error('website-beheer:', e)
    return json({ error: clientFout(e) }, 500)
  }
})

async function handel(admin: any, body: any): Promise<Response> {
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
          .select('id, company_id, status, site_url, live_op, domein, domein_via_ons, email, email_aantal').eq('company_id', body.companyId).maybeSingle()
        if (!a) return json({ error: 'Website niet gevonden' }, 404)
        const status = body.status ?? a.status
        if (!STATUS_LABEL[status]) return json({ error: 'Onbekende status' }, 400)
        const siteUrl = body.siteUrl !== undefined ? (String(body.siteUrl).trim() || null) : a.site_url
        if (siteUrl && !/^https?:\/\//i.test(siteUrl)) return json({ error: 'De link begint met https://' }, 400)
        if (status === 'ter_beoordeling' && !siteUrl) return json({ error: 'Vul eerst de link naar de site in; die krijgt de klant in de mail.' }, 400)

        const nieuw = status !== a.status
        // Live alleen met betaalde hosting: via het BossBase-abonnement, of een
        // eigen hostingabonnement. `zonderHosting` is de bewuste uitzondering
        // (eigen sites, testbedrijven).
        const stand = await hostingStand(admin, a.company_id)
        if (nieuw && status === 'live' && !stand.abonnementLoopt && !stand.losLoopt && body.zonderHosting !== true) {
          return json({
            error: 'Er loopt geen abonnement voor de hosting. Stuur de klant eerst de link om de hosting af te sluiten.',
            code: 'hosting_nodig',
          }, 409)
        }
        const nu = new Date().toISOString()
        const velden: Record<string, unknown> = { status, site_url: siteUrl }
        if (nieuw) velden.status_gewijzigd_op = nu
        if (nieuw && status === 'live' && !a.live_op) velden.live_op = nu
        const { error } = await admin.from('website_aanvragen').update(velden).eq('id', a.id)
        if (error) return json({ error: error.message }, 500)

        const uit: string[] = []
        // Livegang: hosting gaat in, en domein en e-mail als die in de intake
        // gekozen zijn. Elk als regel op het abonnement, elk hooguit één keer.
        if (nieuw && status === 'live' && stand.abonnementLoopt && !stand.losLoopt) {
          const regels: { soort: 'hosting' | 'domein' | 'email'; omschrijving: string; bedrag: number; intervalMaanden?: number }[] = [
            { soort: 'hosting', omschrijving: 'Website-hosting', bedrag: HOSTING_PER_MAAND },
          ]
          if (a.domein_via_ons) regels.push({ soort: 'domein', omschrijving: `Domeinnaam ${a.domein ?? ''} (1 jaar)`, bedrag: DOMEIN_PER_JAAR, intervalMaanden: 12 })
          const adressen = Math.max(Number(a.email_aantal) || 0, a.email ? 1 : 0)
          if (adressen > 0) regels.push({ soort: 'email', omschrijving: `Zakelijke e-mail (${adressen} adres${adressen > 1 ? 'sen' : ''})`, bedrag: EMAIL_PER_MAAND * adressen })
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
        // `aantal` is het totaal aantal adressen: een lopende regel wordt vervangen.
        const adressen = Math.max(1, Math.min(Math.floor(Number(body.aantal) || 1), 10))
        await admin.from('website_betalingen').update({ status: 'gestopt' })
          .eq('company_id', body.companyId).eq('soort', 'email').eq('status', 'loopt')
        const r = await startRegel(admin, body.companyId, { soort: 'email', omschrijving: `Zakelijke e-mail (${adressen} adres${adressen > 1 ? 'sen' : ''})`, bedrag: EMAIL_PER_MAAND * adressen })
        await admin.from('website_aanvragen').update({ email: true, email_aantal: adressen }).eq('company_id', body.companyId)
        await admin.from('website_verzoeken').update({ status: 'afgerond', afgehandeld_op: new Date().toISOString() })
          .eq('company_id', body.companyId).eq('soort', 'email').in('status', ['nieuw', 'in_behandeling'])
        return json({ ok: true, resultaat: [r] })
      }

      case 'traject-starten': {
        const { data: sub } = await admin.from('subscriptions').select('plan').eq('company_id', body.companyId).maybeSingle()
        const r = await startWebsiteTraject(admin, String(body.companyId), sub?.plan ?? null, stuurBossBaseMail, { opnieuw: true })
        return json({ ok: true, resultaat: [r] })
      }

      case 'hosting-link': {
        const { data: a } = await admin.from('website_aanvragen')
          .select('domein, domein_via_ons, email_aantal').eq('company_id', body.companyId).maybeSingle()
        const { data: c } = await admin.from('companies').select('name, email').eq('id', body.companyId).maybeSingle()
        if (!a || !c?.email) return json({ error: 'Geen website of geen e-mailadres bij dit bedrijf.' }, 400)
        const m = mailHostingNodig({ bedrijfsnaam: c.name, domein: a.domein_via_ons ? a.domein : null, emailAantal: Number(a.email_aantal) || 0 })
        const id = await stuurBossBaseMail(c.email, m.subject, m.html, WEBSITE_INTERN, undefined, 'website_klant')
        return json({ ok: true, resultaat: [id ? 'klant gemaild: hosting afsluiten' : 'mail mislukt'] })
      }

      case 'regel-stoppen': {
        const { error } = await admin.from('website_betalingen')
          .update({ status: 'gestopt' }).eq('id', body.id).eq('status', 'loopt')
        if (error) return json({ error: error.message }, 500)
        return json({ ok: true })
      }
    }
    return json({ error: 'Onbekende actie' }, 400)
}
