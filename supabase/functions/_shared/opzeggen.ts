// Opzeggen (en de opzegging intrekken) bij Stripe, op één plek.
//
// Een abonnement dat door een subscription schedule wordt beheerd, accepteert
// geen cancel_at of cancel_at_period_end. Stripe weigert dan met "The
// subscription is managed by the subscription schedule …, and updating any
// cancelation behavior directly is not allowed". Dat ging mis bij elk
// jaarabonnement: billing-cancel zette cancel_at rechtstreeks op het abonnement.
//
// Drie gevallen:
//   • schema actief, binnen de looptijd (jaarabonnement)
//       → het schema stopt aan het einde van de looptijd: end_behavior 'cancel'.
//         Niet eerder; de incasso loopt tot dan door.
//   • schema actief, buiten de looptijd (bijv. een maandabonnement dat na de
//     gratis maanden nog aan een schema hangt)
//       → schema vrijgeven (release) en dan opzeggen per einde lopende periode.
//   • geen schema, of een schema dat al is vrijgegeven/afgelopen
//       → zoals het altijd ging: binnen de looptijd cancel_at op het einde van
//         de looptijd, anders cancel_at_period_end.
//
// Of een schema nog actief is, vragen we aan Stripe. Wat er in onze tabel staat
// kan achterlopen: een vrijgegeven schema houdt zijn id in subscriptions.
//
// Bewust alleen ./stripe.ts als import: zo is dit los te testen tegen Stripe in
// testmodus (scripts/test-opzeggen.mjs), zonder de rest van de edge-omgeving.
import { stripeFetch } from './stripe.ts'

export type OpzegInvoer = {
  subscriptionId: string
  scheduleId?: string | null
  verplichtingTot?: string | null
  herstel?: boolean
}

export type OpzegUitkomst = {
  /** Welke weg is genomen; voor de logs en de test. */
  route: 'schema_stopt_na_looptijd' | 'schema_vrijgegeven_einde_periode' | 'looptijd_cancel_at' | 'einde_periode'
  /** De datum waarop het abonnement stopt, zoals Stripe hem nu kent. Null bij herstel. */
  stoptOp: string | null
  /** Stopt het aan het einde van de looptijd (en niet per maand)? */
  stoptNaLooptijd: boolean
  /** Hangt het abonnement na afloop nog aan een actief schema? */
  schemaActief: boolean
}

const naarISO = (sec: unknown): string | null =>
  Number.isFinite(Number(sec)) && Number(sec) > 0 ? new Date(Number(sec) * 1000).toISOString() : null

async function haalSchema(scheduleId: string | null | undefined) {
  if (!scheduleId) return null
  try {
    return await stripeFetch(`/subscription_schedules/${scheduleId}`, 'GET')
  } catch {
    return null
  }
}

export async function opzeggenBijStripe(inv: OpzegInvoer): Promise<OpzegUitkomst> {
  const herstel = inv.herstel === true
  const schema = await haalSchema(inv.scheduleId)
  const schemaActief = !!schema && ['active', 'not_started'].includes(schema.status)
  const inLooptijd = !!inv.verplichtingTot && new Date(inv.verplichtingTot) > new Date()

  // ── Jaarabonnement in de looptijd, via het schema ─────────────────────────
  if (schemaActief && inLooptijd) {
    const bijgewerkt = await stripeFetch(`/subscription_schedules/${schema.id}`, 'POST', {
      end_behavior: herstel ? 'release' : 'cancel',
    })
    const fasen = Array.isArray(bijgewerkt?.phases) ? bijgewerkt.phases : []
    const einde = naarISO(fasen[fasen.length - 1]?.end_date) ?? inv.verplichtingTot ?? null
    return {
      route: 'schema_stopt_na_looptijd',
      stoptOp: herstel ? null : einde,
      stoptNaLooptijd: !herstel,
      schemaActief: true,
    }
  }

  // ── Schema actief, maar geen looptijd meer: vrijgeven, dan per periode ─────
  if (schemaActief && !herstel) {
    await stripeFetch(`/subscription_schedules/${schema.id}/release`, 'POST', {})
    const sub = await stripeFetch(`/subscriptions/${inv.subscriptionId}`, 'POST', {
      cancel_at_period_end: 'true',
    })
    return {
      route: 'schema_vrijgegeven_einde_periode',
      stoptOp: naarISO(sub?.cancel_at) ?? naarISO(sub?.items?.data?.[0]?.current_period_end) ?? naarISO(sub?.current_period_end),
      stoptNaLooptijd: false,
      schemaActief: false,
    }
  }
  if (schemaActief && herstel) {
    // Een actief schema buiten de looptijd heeft geen opzegging om in te
    // trekken: zou die er zijn, dan was het schema bij het opzeggen vrijgegeven.
    // Wel zorgen dat het na afloop gewoon doorloopt.
    await stripeFetch(`/subscription_schedules/${schema.id}`, 'POST', { end_behavior: 'release' })
    return { route: 'einde_periode', stoptOp: null, stoptNaLooptijd: false, schemaActief: true }
  }

  // ── Geen (actief) schema ──────────────────────────────────────────────────
  if (inLooptijd) {
    // Stripe accepteert cancel_at en cancel_at_period_end niet samen. Bij
    // herstellen leegt een lege cancel_at beide.
    const eindeUnix = Math.floor(new Date(inv.verplichtingTot!).getTime() / 1000)
    const sub = await stripeFetch(`/subscriptions/${inv.subscriptionId}`, 'POST', {
      cancel_at: herstel ? '' : String(eindeUnix),
    })
    return {
      route: 'looptijd_cancel_at',
      stoptOp: herstel ? null : (naarISO(sub?.cancel_at) ?? inv.verplichtingTot ?? null),
      stoptNaLooptijd: !herstel,
      schemaActief: false,
    }
  }

  const sub = await stripeFetch(`/subscriptions/${inv.subscriptionId}`, 'POST', {
    cancel_at_period_end: herstel ? 'false' : 'true',
  })
  return {
    route: 'einde_periode',
    stoptOp: herstel ? null : (naarISO(sub?.cancel_at) ?? naarISO(sub?.items?.data?.[0]?.current_period_end) ?? naarISO(sub?.current_period_end)),
    stoptNaLooptijd: false,
    schemaActief: false,
  }
}
