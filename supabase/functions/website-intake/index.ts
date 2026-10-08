// website-intake (verify_jwt=false — publiek, de klant is niet ingelogd)
//
// De achterkant van /intake/<sleutel>. Alles hangt aan de sleutel uit de link:
// zonder geldige sleutel geeft deze functie niets terug, ook geen bedrijfsnaam.
//
//   laad      → wat we al weten, om het formulier vooraf in te vullen
//   upload    → een ondertekende upload-URL voor één bestand in de private
//               bucket website-intake (de browser uploadt rechtstreeks)
//   verzenden → intake opslaan, sleutel ongeldig maken, taak afvinken, mails;
//               bij een upgrade met iDEAL de link naar Stripe Checkout
//
// De sleutel verloopt na 30 dagen of zodra de intake is verstuurd.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { CORS, json, stuurBossBaseMail } from '../_shared/billing.ts'
import { clientFout } from '../_shared/clientFout.ts'
import {
  PAKKETTEN, EXTRAS, HOSTING_PER_MAAND, DOMEIN_PER_JAAR, EMAIL_PER_MAAND, TERMIJNEN, WEBSITE_INTERN,
  isPakket, upgradePrijs, schoneExtras, extrasPrijs, extrasTekst, euro, controleerSleutel,
  mailIntakeBevestiging, mailIntern,
} from '../_shared/website.ts'
import { startUpgradeBetaling, regelOpAbonnement } from '../_shared/websiteBetalen.ts'

const MAX_INTAKE_BYTES = 400_000
const TOEGESTAAN = /^(image\/(jpeg|png|webp|heic|heif|svg\+xml|gif)|application\/pdf)$/

const veiligeNaam = (naam: string) => {
  const punt = naam.lastIndexOf('.')
  const stam = (punt > 0 ? naam.slice(0, punt) : naam).toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
  const ext = (punt > 0 ? naam.slice(punt + 1) : '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5)
  return `${stam || 'bestand'}${ext ? `.${ext}` : ''}`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Alleen POST' }, 405)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let body: any
  try { body = await req.json() } catch { return json({ error: 'Ongeldige aanvraag' }, 400) }

  // Eén antwoord voor elke ongeldige sleutel: onbekend, verlopen of al gebruikt
  // zien er van buiten hetzelfde uit.
  const sleutel = await controleerSleutel(admin, body?.sleutel)
  if (!sleutel) {
    return json({ error: 'Deze link is niet (meer) geldig. Open Website in BossBase voor een nieuwe link.', code: 'ongeldige_sleutel' }, 403)
  }
  const companyId = sleutel.company_id

  try {
    const { data: aanvraag } = await admin.from('website_aanvragen')
      .select('id, status, pakket, taak_id').eq('company_id', companyId).maybeSingle()
    if (!aanvraag || aanvraag.status !== 'wacht_op_intake') {
      return json({ error: 'Je intake is al binnen. Hoe ver we zijn, zie je in BossBase onder Website.', code: 'al_ingevuld' }, 409)
    }

    // ── laad ────────────────────────────────────────────────────────────────
    if (body.actie === 'laad') {
      const { data: c } = await admin.from('companies')
        .select('name, email, phone, address, postal_code, city, kvk, btw_number, website, logo_url, branche')
        .eq('id', companyId).maybeSingle()
      const { data: sub } = await admin.from('subscriptions')
        .select('stripe_subscription_id, stripe_status').eq('company_id', companyId).maybeSingle()
      return json({
        bedrijf: {
          naam: c?.name ?? '', email: c?.email ?? '', telefoon: c?.phone ?? '',
          straat: c?.address ?? '', postcode: c?.postal_code ?? '', plaats: c?.city ?? '',
          kvk: c?.kvk ?? '', btw: c?.btw_number ?? '', website: c?.website ?? '',
          branche: c?.branche ?? '', logoUrl: c?.logo_url ?? '',
        },
        verlooptOp: sleutel.verloopt_op,
        // Termijnen gaan als regel op het abonnement; zonder lopend
        // Stripe-abonnement kan dat niet.
        termijnenMogelijk: Boolean(sub?.stripe_subscription_id) && ['active', 'trialing', 'past_due'].includes(sub?.stripe_status ?? ''),
        prijzen: { pakketten: PAKKETTEN, extras: EXTRAS, hosting: HOSTING_PER_MAAND, domein: DOMEIN_PER_JAAR, email: EMAIL_PER_MAAND, termijnen: TERMIJNEN },
      })
    }

    // ── upload ──────────────────────────────────────────────────────────────
    if (body.actie === 'upload') {
      const type = String(body.type ?? '')
      if (!TOEGESTAAN.test(type)) return json({ error: 'Dit bestandstype gaat niet. Gebruik JPG, PNG, HEIC, WebP, SVG of PDF.' }, 400)
      if (Number(body.grootte) > 25 * 1024 * 1024) return json({ error: 'Dit bestand is te groot. Maximaal 25 MB.' }, 400)
      const datum = new Date().toISOString().slice(0, 10)
      const id = crypto.randomUUID().slice(0, 8)
      const pad = `${companyId}/${datum}/${id}-${veiligeNaam(String(body.naam ?? 'bestand'))}`
      const { data, error } = await admin.storage.from('website-intake').createSignedUploadUrl(pad)
      if (error || !data) return json({ error: 'Uploaden lukt nu niet. Probeer het zo nog eens.' }, 500)
      return json({ pad, token: data.token })
    }

    // ── verzenden ───────────────────────────────────────────────────────────
    if (body.actie === 'verzenden') {
      const pakket = body.pakket
      if (!isPakket(pakket)) return json({ error: 'Kies een pakket.' }, 400)
      const antwoorden = body.antwoorden && typeof body.antwoorden === 'object' ? body.antwoorden : {}
      const intake = { antwoorden, ontbreekt: Array.isArray(body.ontbreekt) ? body.ontbreekt.slice(0, 100).map(String) : [] }
      if (JSON.stringify(intake).length > MAX_INTAKE_BYTES) return json({ error: 'De intake is te groot om te versturen.' }, 413)

      // Wat het kost rekent de server zelf uit, uit pakket en extra's; een
      // bedrag uit de browser telt niet.
      const extras = schoneExtras(body.extras, pakket)
      const bedrag = upgradePrijs('basis', pakket, true) + extrasPrijs(extras, true)
      const wijze = bedrag > 0 ? (body.betaalwijze === 'termijnen' ? 'termijnen' : 'ideal') : null
      const domein = typeof body.domein === 'string' ? body.domein.trim().toLowerCase().slice(0, 120) : ''
      // Zakelijke e-mail bieden we alleen aan bij een domein via ons.
      const email = Boolean(domein) && body.email === true

      // Eerst de sleutel claimen: wie twee keer op versturen drukt, mag maar
      // één intake (en één betaling) opleveren.
      const { data: geclaimd } = await admin.from('website_tokens')
        .update({ gebruikt_op: new Date().toISOString() })
        .eq('id', sleutel.id).is('gebruikt_op', null).select('id').maybeSingle()
      if (!geclaimd) return json({ error: 'Je intake is al verstuurd.', code: 'al_ingevuld' }, 409)
      // Andere openstaande links van dit bedrijf vervallen ook.
      await admin.from('website_tokens').update({ gebruikt_op: new Date().toISOString() })
        .eq('company_id', companyId).is('gebruikt_op', null)

      const nu = new Date().toISOString()
      const { error: opslaanFout } = await admin.from('website_aanvragen').update({
        intake, pakket, extras, email, domein_via_ons: Boolean(domein), domein: domein || null,
        status: 'intake_ontvangen', intake_ontvangen_op: nu, status_gewijzigd_op: nu,
      }).eq('id', aanvraag.id)
      if (opslaanFout) {
        // Sleutel teruggeven, anders staat de klant met lege handen.
        await admin.from('website_tokens').update({ gebruikt_op: null }).eq('id', sleutel.id)
        return json({ error: 'Opslaan lukte niet. Je antwoorden staan nog bewaard; probeer het zo nog eens.' }, 500)
      }
      if (aanvraag.taak_id) await admin.from('activities').update({ completed: true }).eq('id', aanvraag.taak_id)

      // Betalen. Gaat dit mis, dan staat de intake toch; de klant kan de
      // betaling later vanuit Website in BossBase afronden.
      let checkoutUrl: string | null = null
      let betaalRegel: string | null = null
      let betaalFout: string | null = null
      if (bedrag > 0) {
        const omschrijving = `Website ${PAKKETTEN[pakket].label}${Object.keys(extras).length ? ' met extra\'s' : ''} (aanmeldprijs)`
        try {
          if (wijze === 'termijnen') {
            await regelOpAbonnement(admin, { companyId, soort: 'upgrade', pakket, extras, omschrijving, bedrag, termijnen: TERMIJNEN })
            betaalRegel = `${euro(bedrag)} in ${TERMIJNEN} maandelijkse termijnen op je abonnement.`
          } else {
            checkoutUrl = await startUpgradeBetaling(admin, {
              companyId, pakket, extras, omschrijving, bedrag,
              terug: '/intake/bedankt', origin: req.headers.get('origin') ?? '',
            })
            betaalRegel = `${euro(bedrag)} eenmalig via iDEAL.`
          }
        } catch (e) {
          betaalFout = (e as Error).message
          console.warn('website-intake betalen:', betaalFout)
        }
      }

      // Mails. Mislukt er een, dan staat het in mail_fouten (stuurBossBaseMail).
      const { data: c } = await admin.from('companies').select('id, name, email, phone').eq('id', companyId).maybeSingle()
      const p = PAKKETTEN[pakket]
      const i = mailIntern({
        onderwerp: `Nieuwe website-intake: ${c?.name ?? 'onbekend'} (${p.label})`,
        kop: 'Nieuwe intake binnen',
        bedrijf: c ?? { id: companyId },
        regels: [
          ['Pakket', `${p.label} · ${p.omvang}`],
          ['Extra\'s', Object.keys(extras).length ? extrasTekst(extras) : 'geen'],
          ['Te betalen', bedrag > 0 ? `${euro(bedrag)} excl. btw · ${wijze === 'termijnen' ? `${TERMIJNEN} termijnen` : 'iDEAL'}${betaalFout ? ` · MISLUKT: ${betaalFout}` : ''}` : 'geen'],
          ['Domein via ons', domein ? `${domein} (${euro(DOMEIN_PER_JAAR)} per jaar, vanaf livegang)` : 'nee'],
          ['Zakelijke e-mail', email ? `ja (${euro(EMAIL_PER_MAAND)} per maand, vanaf livegang)` : 'nee'],
          ['Nog na te vragen', intake.ontbreekt.length ? intake.ontbreekt.join('; ') : 'niets'],
        ],
      })
      await stuurBossBaseMail(WEBSITE_INTERN, i.subject, i.html, c?.email ?? undefined, undefined, 'website_intern')
      if (c?.email) {
        const m = mailIntakeBevestiging({
          bedrijfsnaam: c.name, pakket,
          betaling: checkoutUrl ? `Je betaalt ${betaalRegel} Lukte dat niet, dan rond je het af in BossBase onder Website.` : betaalRegel,
        })
        await stuurBossBaseMail(c.email, m.subject, m.html, WEBSITE_INTERN, undefined, 'website_klant')
      }

      return json({ ok: true, checkoutUrl, betaalFout: betaalFout ? 'Het betalen kon nu niet worden gestart. Je intake is wel binnen; je rondt de betaling af in BossBase onder Website.' : null })
    }

    return json({ error: 'Onbekende actie' }, 400)
  } catch (e) {
    console.error('website-intake:', e)
    return json({ error: clientFout(e) }, 500)
  }
})
