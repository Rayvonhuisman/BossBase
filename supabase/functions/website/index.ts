// website — de acties op de pagina Website in het dashboard.
//
//   intake-link    → een verse intakelink (beheerder)
//   upgrade        → naar Compleet of Pro, met iDEAL of in 12 termijnen
//                    (alleen de eigenaar, net als het abonnement zelf)
//   opnieuw-betalen→ een openstaande iDEAL-betaling afronden (eigenaar)
//   verzoek        → wijziging of uitbreiding aanvragen (beheerder)
//   extra          → een extra bestellen tegen de latere prijs (eigenaar)
//   domein         → domeinnaam via ons aanvragen (beheerder)
//   email          → zakelijke e-mail aanvragen (aantal adressen), alleen bij
//                    een domein via ons
//   feedback       → de ene feedbackronde bij "ter beoordeling" (beheerder)
//
// Lezen gaat via de RPC get_mijn_website(); hier staat alleen wat iets
// verandert, mailt of afrekent.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { CORS, json, stuurBossBaseMail, eisAbonnementsbeheerder } from '../_shared/billing.ts'
import { clientFout } from '../_shared/clientFout.ts'
import { heeftRecht } from '../_shared/eisRecht.ts'
import {
  PAKKETTEN, EXTRAS, DOMEIN_PER_JAAR, EMAIL_PER_MAAND, TERMIJNEN, WEBSITE_INTERN,
  isPakket, upgradePrijs, euro, maakIntakeLink, mailIntern, type Pakket,
} from '../_shared/website.ts'
import { startBetaling } from '../_shared/websiteBetalen.ts'

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
  const origin = req.headers.get('origin') ?? ''

  try {
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'Log opnieuw in.' }, 401)
    const { data: profiel } = await admin.from('profiles')
      .select('company_id, actief').eq('id', user.id).maybeSingle()
    const companyId: string | null = profiel?.company_id ?? null
    if (!companyId || profiel?.actief === false) return json({ error: 'Geen bedrijf gekoppeld.' }, 403)

    // Wie bij de bedrijfsinstellingen mag, mag ook de website regelen. Afrekenen
    // vraagt daarbovenop de eigenaar (eisAbonnementsbeheerder).
    if (!await heeftRecht(user.id, 'instellingen')) {
      return json({ error: 'Je hebt geen recht om de website van je bedrijf te regelen.' }, 403)
    }

    const { data: aanvraag } = await admin.from('website_aanvragen')
      .select('id, status, pakket, feedback, extras, domein, domein_via_ons, email').eq('company_id', companyId).maybeSingle()
    const { data: bedrijf } = await admin.from('companies')
      .select('id, name, email, phone').eq('id', companyId).maybeSingle()
    const meld = async (onderwerp: string, kop: string, regels: [string, string][], tekst?: string) => {
      const m = mailIntern({ onderwerp, kop, bedrijf: bedrijf ?? { id: companyId }, regels, tekst })
      await stuurBossBaseMail(WEBSITE_INTERN, m.subject, m.html, bedrijf?.email ?? undefined, undefined, 'website_intern')
    }

    switch (body.actie) {
      case 'intake-link': {
        if (!aanvraag) {
          // Gekozen maar nog geen rij (bijvoorbeeld een webhook die de mail niet
          // haalde): alsnog openen. De functie controleert zelf de keuze.
          const { data: r } = await admin.rpc('bb_open_website_aanvraag', { p_company_id: companyId })
          if (r !== 'aangemaakt' && r !== 'bestond al') return json({ error: 'De gratis website hoort bij een jaarabonnement met de welkomstactie website.' }, 400)
        } else if (aanvraag.status !== 'wacht_op_intake') {
          return json({ error: 'Je intake is al binnen.' }, 409)
        }
        const { url: link, verlooptOp } = await maakIntakeLink(admin, companyId, origin)
        return json({ url: link, verlooptOp })
      }

      case 'upgrade':
      case 'opnieuw-betalen': {
        const beheerder = await eisAbonnementsbeheerder(admin, userClient)
        if (beheerder instanceof Response) return beheerder
        if (!aanvraag) return json({ error: 'Je hebt nog geen website bij ons.' }, 400)

        if (body.actie === 'opnieuw-betalen') {
          const { data: b } = await admin.from('website_betalingen')
            .select('id, soort, pakket, extras, gegevens, omschrijving, bedrag, status, wijze')
            .eq('id', body.betalingId).eq('company_id', companyId).maybeSingle()
          if (!b || b.status !== 'open' || b.wijze === 'abonnement') return json({ error: 'Deze betaling staat niet meer open.' }, 400)
          const checkoutUrl = await startBetaling(admin, {
            companyId, soort: b.soort, wijze: b.wijze, pakket: b.pakket as Pakket | null, extras: b.extras, gegevens: b.gegevens,
            omschrijving: b.omschrijving, bedrag: Number(b.bedrag),
            gelukt: '/dashboard/website?betaling=gelukt', afgebroken: '/dashboard/website?betaling=afgebroken', origin, betalingId: b.id,
          })
          return json({ checkoutUrl })
        }

        const naar = body.pakket
        if (!isPakket(naar)) return json({ error: 'Kies Compleet of Pro.' }, 400)
        if (aanvraag.status === 'wacht_op_intake') {
          return json({ error: 'Kies je pakket in de intake: daar geldt de lagere aanmeldprijs.', code: 'via_intake' }, 400)
        }
        const van = aanvraag.pakket as Pakket
        const bedrag = upgradePrijs(van, naar, false)
        if (bedrag <= 0) return json({ error: `Je hebt al ${PAKKETTEN[van].label}.` }, 400)

        // Een eerdere, niet afgeronde poging laat startBetaling verlopen. Het
        // pakket verandert pas als Stripe meldt dat er betaald is.
        const omschrijving = `Website upgrade ${PAKKETTEN[van].label} → ${PAKKETTEN[naar].label}`
        const wijze = body.wijze === 'termijnen' ? 'termijnen' : 'ideal'
        const checkoutUrl = await startBetaling(admin, {
          companyId, soort: 'upgrade', wijze, pakket: naar, omschrijving, bedrag,
          gelukt: '/dashboard/website?betaling=gelukt', afgebroken: '/dashboard/website?betaling=afgebroken', origin,
        })
        await meld(`Website-upgrade: ${bedrijf?.name ?? ''} naar ${PAKKETTEN[naar].label}`, 'Upgrade aangevraagd', [
          ['Van', PAKKETTEN[van].label], ['Naar', `${PAKKETTEN[naar].label} · ${PAKKETTEN[naar].omvang}`],
          ['Bedrag', `${euro(bedrag)} excl. btw`],
          ['Betaling', wijze === 'termijnen' ? `${TERMIJNEN} maandtermijnen (wacht op eerste betaling)` : 'eenmalig (wacht op betaling)'],
        ])
        return json({ ok: true, checkoutUrl })
      }

      case 'extra': {
        const beheerder = await eisAbonnementsbeheerder(admin, userClient)
        if (beheerder instanceof Response) return beheerder
        if (!aanvraag || aanvraag.status === 'wacht_op_intake') {
          return json({ error: 'Kies je extra\'s in de intake: daar geldt de lagere aanmeldprijs.', code: 'via_intake' }, 400)
        }
        const e = EXTRAS[String(body.extra)]
        if (!e || e.alleenBijAanmelding || !e.bij.includes(aanvraag.pakket as Pakket)) return json({ error: 'Deze extra kun je niet bestellen bij je pakket.' }, 400)
        const al = Number((aanvraag.extras ?? {})[body.extra] ?? 0)
        if (!e.perStuk && al > 0) return json({ error: `Je hebt ${e.label} al.` }, 400)
        const aantal = e.perStuk ? Math.max(1, Math.min(Math.floor(Number(body.aantal) || 1), (e.maximum ?? 10))) : 1
        const bedrag = aantal * e.laterPrijs
        const extras = { [body.extra]: aantal }
        const omschrijving = `Website extra: ${aantal > 1 ? `${aantal} × ` : ''}${e.label}`
        const wijze = body.wijze === 'termijnen' ? 'termijnen' : 'ideal'
        const checkoutUrl = await startBetaling(admin, {
          companyId, soort: 'extra', wijze, extras, omschrijving, bedrag,
          gelukt: '/dashboard/website?betaling=gelukt', afgebroken: '/dashboard/website?betaling=afgebroken', origin,
        })
        await meld(`Website-extra besteld: ${bedrijf?.name ?? ''}`, 'Extra besteld', [
          ['Extra', `${aantal > 1 ? `${aantal} × ` : ''}${e.label}`], ['Bedrag', `${euro(bedrag)} excl. btw`],
          ['Betaling', wijze === 'termijnen' ? `${TERMIJNEN} maandtermijnen (wacht op eerste betaling)` : 'eenmalig (wacht op betaling)'],
        ])
        return json({ ok: true, checkoutUrl })
      }

      case 'email': {
        if (!aanvraag) return json({ error: 'Je hebt nog geen website bij ons.' }, 400)
        const aantalAdressen = Math.max(1, Math.min(Math.floor(Number(body.aantal) || 1), 10))
        const { data: domeinVerzoek } = await admin.from('website_verzoeken').select('id')
          .eq('company_id', companyId).eq('soort', 'domein').in('status', ['nieuw', 'in_behandeling', 'prijsopgave']).limit(1)
        if (!aanvraag.domein_via_ons && !domeinVerzoek?.length) return json({ error: 'Zakelijke e-mail regelen we bij een domeinnaam via ons. Vraag eerst de domeinnaam aan.' }, 400)
        const wens = String(body.adres ?? '').trim().slice(0, 400)
        const prijs = `${euro(EMAIL_PER_MAAND * aantalAdressen)} per maand (${aantalAdressen} × ${euro(EMAIL_PER_MAAND)})`
        await admin.from('website_verzoeken').insert({
          company_id: companyId, soort: 'email', aangemaakt_door: user.id,
          omschrijving: `${aantalAdressen} zakelijk${aantalAdressen > 1 ? 'e' : ''} e-mailadres${aantalAdressen > 1 ? 'sen' : ''}, ${prijs}${wens ? `: ${wens}` : ''}`,
        })
        await meld(`Zakelijke e-mail aangevraagd: ${bedrijf?.name ?? ''}`, 'Zakelijke e-mail aangevraagd', [['Aantal adressen', String(aantalAdressen)], ['Gewenste adressen', wens || '—'], ['Prijs', prijs]])
        return json({ ok: true })
      }

      case 'verzoek': {
        const soort = body.soort === 'uitbreiding' ? 'uitbreiding' : 'wijziging'
        const tekst = String(body.omschrijving ?? '').trim().slice(0, 4000)
        if (tekst.length < 5) return json({ error: 'Beschrijf wat je wilt laten aanpassen.' }, 400)
        if (!aanvraag || aanvraag.status !== 'live') return json({ error: 'Wijzigingen aanvragen kan zodra je site live staat.' }, 400)
        await admin.from('website_verzoeken').insert({ company_id: companyId, soort, omschrijving: tekst, aangemaakt_door: user.id })
        await meld(`Website-${soort}: ${bedrijf?.name ?? ''}`, soort === 'uitbreiding' ? 'Uitbreiding aangevraagd' : 'Wijziging aangevraagd',
          [['Soort', soort], ['Pakket', PAKKETTEN[aanvraag.pakket as Pakket]?.label ?? aanvraag.pakket]], tekst)
        return json({ ok: true })
      }

      case 'domein': {
        const naam = String(body.domein ?? '').trim().toLowerCase().slice(0, 120)
        if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(naam)) {
          return json({ error: 'Vul een domeinnaam in, zoals jouwbedrijf.nl.' }, 400)
        }
        if (!aanvraag) return json({ error: 'Je hebt nog geen website bij ons.' }, 400)
        await admin.from('website_verzoeken').insert({
          company_id: companyId, soort: 'domein', aangemaakt_door: user.id,
          omschrijving: `Domeinnaam via BossBase: ${naam} (${euro(DOMEIN_PER_JAAR)} per jaar)`,
        })
        await meld(`Domeinnaam aangevraagd: ${naam}`, 'Domeinnaam aangevraagd', [['Domein', naam], ['Prijs', `${euro(DOMEIN_PER_JAAR)} per jaar`]])
        return json({ ok: true })
      }

      case 'feedback': {
        const tekst = String(body.tekst ?? '').trim().slice(0, 8000)
        if (tekst.length < 2) return json({ error: 'Schrijf op wat er anders moet.' }, 400)
        if (!aanvraag || aanvraag.status !== 'ter_beoordeling') return json({ error: 'Je site staat nu niet ter beoordeling.' }, 400)
        // Eén ronde: alleen bijwerken als er nog niets staat.
        const { data: gezet } = await admin.from('website_aanvragen')
          .update({ feedback: tekst, feedback_op: new Date().toISOString() })
          .eq('id', aanvraag.id).is('feedback', null).select('id').maybeSingle()
        if (!gezet) return json({ error: 'Je hebt je wijzigingen al doorgegeven.' }, 409)
        await meld(`Feedback op website: ${bedrijf?.name ?? ''}`, 'Feedback van de klant', [['Pakket', PAKKETTEN[aanvraag.pakket as Pakket]?.label ?? aanvraag.pakket]], tekst)
        return json({ ok: true })
      }
    }
    return json({ error: 'Onbekende actie' }, 400)
  } catch (e) {
    console.error('website:', e)
    return json({ error: clientFout(e) }, 500)
  }
})
