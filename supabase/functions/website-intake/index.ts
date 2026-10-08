// website-intake (verify_jwt=false — publiek, de klant is niet ingelogd)
//
// De achterkant van /intake/<sleutel>. Alles hangt aan de sleutel uit de link:
// zonder geldige sleutel geeft deze functie niets terug, ook geen bedrijfsnaam.
//
//   laad      → wat we al weten, om het formulier vooraf in te vullen
//   upload    → een ondertekende upload-URL voor één bestand in de private
//               bucket website-intake (de browser uploadt rechtstreeks)
//   verzenden → zonder bedrag: intake indienen (rondIntakeAf). Met bedrag:
//               concept bij een betaling zetten en de link naar Stripe
//               Checkout teruggeven; indienen doet billing-webhook na betaling
//
// De sleutel verloopt na 30 dagen of zodra de intake is ingediend.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { CORS, json, stuurBossBaseMail } from '../_shared/billing.ts'
import { clientFout } from '../_shared/clientFout.ts'
import {
  PAKKETTEN, EXTRAS, HOSTING_PER_MAAND, DOMEIN_PER_JAAR, EMAIL_PER_MAAND, TERMIJNEN,
  isPakket, upgradePrijs, schoneExtras, extrasPrijs, controleerSleutel, rondIntakeAf, type IntakeGegevens,
} from '../_shared/website.ts'
import { startBetaling } from '../_shared/websiteBetalen.ts'

const MAX_INTAKE_BYTES = 400_000
const MAX_EMAIL = 10
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
      return json({
        bedrijf: {
          naam: c?.name ?? '', email: c?.email ?? '', telefoon: c?.phone ?? '',
          straat: c?.address ?? '', postcode: c?.postal_code ?? '', plaats: c?.city ?? '',
          kvk: c?.kvk ?? '', btw: c?.btw_number ?? '', website: c?.website ?? '',
          branche: c?.branche ?? '', logoUrl: c?.logo_url ?? '',
        },
        verlooptOp: sleutel.verloopt_op,
        // Termijnen zijn een eigen Stripe-abonnement dat in Checkout wordt
        // afgesloten; dat kan altijd.
        termijnenMogelijk: true,
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
      const domein = typeof body.domein === 'string' ? body.domein.trim().toLowerCase().slice(0, 120) : ''
      // Zakelijke e-mail alleen bij een domein via ons; per adres.
      const emailAantal = domein ? Math.max(0, Math.min(Math.floor(Number(body.emailAantal) || 0), MAX_EMAIL)) : 0
      const gegevens: IntakeGegevens = { intake, pakket, extras, domein, emailAantal }

      // Niets te betalen: meteen indienen.
      if (bedrag <= 0) {
        const ok = await rondIntakeAf(admin, companyId, gegevens, stuurBossBaseMail, null)
        if (!ok) return json({ error: 'Je intake is al verstuurd.', code: 'al_ingevuld' }, 409)
        return json({ ok: true, checkoutUrl: null })
      }

      // Wel te betalen: de intake wacht als concept bij de betaling en wordt pas
      // ingediend als Stripe meldt dat er betaald is (billing-webhook). Breekt
      // de klant af, dan komt hij terug op deze link met zijn antwoorden.
      const wijze = body.betaalwijze === 'termijnen' ? 'termijnen' : 'ideal'
      const omschrijving = `Website ${PAKKETTEN[pakket].label}${Object.keys(extras).length ? ' met extra\'s' : ''} (aanmeldprijs)`
      try {
        const checkoutUrl = await startBetaling(admin, {
          companyId, soort: 'upgrade', wijze, pakket, extras, gegevens, omschrijving, bedrag,
          gelukt: '/intake/bedankt?betaling=gelukt',
          afgebroken: `/intake/${body.sleutel}?betaling=afgebroken`,
          origin: req.headers.get('origin') ?? '',
        })
        return json({ ok: true, checkoutUrl })
      } catch (e) {
        console.warn('website-intake betalen:', (e as Error).message)
        return json({ error: 'Het betalen kon nu niet worden gestart. Je antwoorden staan nog bewaard; probeer het zo nog eens.' }, 502)
      }
    }

    return json({ error: 'Onbekende actie' }, 400)
  } catch (e) {
    console.error('website-intake:', e)
    return json({ error: clientFout(e) }, 500)
  }
})
