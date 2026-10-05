// ─────────────────────────────────────────────────────────────────────────────
// Wat de boekhoudkoppelingen delen, los van het pakket.
//
// SnelStart en Moneybird werken op dezelfde tabellen (accounting_connections,
// accounting_sync_runs, grootboek_voorkeuren, import_genegeerd), elk met een
// provider-kolom. Wat hier staat leest en schrijft die tabellen voor één
// provider, zodat beide koppelingen dezelfde regels volgen: dezelfde
// prullenbak, dezelfde grootboekinstellingen, dezelfde "wat gaat er mee".
//
// Het praten met het pakket zelf staat in _shared/snelstart.ts en
// _shared/moneybird.ts.
// ─────────────────────────────────────────────────────────────────────────────

export type Provider = 'snelstart' | 'moneybird'

/**
 * Alles wat de gebruiker bewust heeft weggegooid; dat halen we niet terug.
 * `soort` is 'klant' | 'leverancier' | 'factuur' | 'kost'. Leeg bij een
 * leesfout: dan importeert de sync hooguit iets te veel, wat de gebruiker ziet
 * en kan weggooien — beter dan de hele sync te laten vallen.
 */
export async function getGenegeerd(
  admin: any, companyId: string, provider: Provider, soort: string,
): Promise<Set<string>> {
  const { data, error } = await admin
    .from('import_genegeerd')
    .select('externe_id')
    .eq('company_id', companyId)
    .eq('provider', provider)
    .eq('soort', soort)
  if (error) { console.warn('Prullenbak niet gelezen:', error.message); return new Set() }
  return new Set((data || []).map((r: any) => String(r.externe_id)))
}

/** Eén ingestelde rekening (of btw-tarief): SnelStart kiest op nummer, Moneybird op id. */
export type VoorkeurRij = { nummer: number | null; id: string | null }

/**
 * De per bedrijf ingestelde rekeningen en tarieven. Sleutel is
 * 'kosten:<categorie>', 'omzet:<regime>' of (Moneybird) 'btw:<soort>'. Leeg als
 * er niets is ingesteld — dan gelden de standaardkeuzes van de koppeling.
 */
export async function getVoorkeurRijen(
  admin: any, companyId: string, provider: Provider,
): Promise<Record<string, VoorkeurRij>> {
  const { data, error } = await admin
    .from('grootboek_voorkeuren')
    .select('sleutel, grootboek_nummer, grootboek_id')
    .eq('company_id', companyId)
    .eq('provider', provider)
  if (error) { console.warn('Grootboekvoorkeuren niet gelezen:', error.message); return {} }
  const uit: Record<string, VoorkeurRij> = {}
  for (const r of (data || [])) {
    uit[r.sleutel] = {
      nummer: Number(r.grootboek_nummer) || null,
      id: r.grootboek_id ? String(r.grootboek_id) : null,
    }
  }
  return uit
}

// ── Wat er naar de boekhouding gaat ─────────────────────────────────────────
// Vaste regels, voor beide pakketten gelijk:
//
//   Facturen  alles behalve concepten. Een concept is nog niet verstuurd en hoort
//             niet in de boekhouding. Facturen die uit een boekhouding zijn
//             opgehaald (externe_referentie gevuld) gaan nooit terug.
//   Kosten    alles in job_costs dat in BossBase is ingevoerd (geen externe
//             referentie), met een bedrag, behalve werkbonmateriaal: dat is geen
//             boeking maar een registratie van verbruik, en de echte
//             inkoopfactuur van dat materiaal komt al via de boekhouding binnen.
//             Een geboekte kost met een project of werkbon eraan gaat gewoon mee.
//             De inkopen in project_kosten (steigerhuur, hoogwerker op een
//             project of werkbon) gaan NIET: die tabel is per ontwerp geen
//             boekhouding — de factuur van de verhuurder wordt daar al geboekt
//             (zie migratie 20260915130000_project_kosten).
//
// `idKolom` is de kolom waarin de koppeling zijn eigen id terugschrijft
// (snelstart_id, moneybird_id); een gevulde kolom = al geboekt.
//
// De filters staan na .select(): een PostgrestQueryBuilder heeft nog geen .eq(),
// die zit pas op de filter-builder die select() teruggeeft.

export const facturenTeBoeken = (q: any, companyId: string, idKolom: string) => q
  .eq('company_id', companyId)
  .neq('status', 'concept')
  .is(idKolom, null)
  .is('externe_referentie', null)

export const kostenTeBoeken = (q: any, companyId: string, idKolom: string) => q
  .eq('company_id', companyId)
  .is('externe_referentie', null)
  .is(idKolom, null)
  .is('werkbon_materiaal_id', null)
  .gt('amount', 0)

/** Werk de laatste-sync-tijd van deze koppeling bij. */
export async function markeerGesynct(admin: any, companyId: string, provider: Provider): Promise<void> {
  const nu = new Date().toISOString()
  await admin.from('accounting_connections')
    .update({ last_synced_at: nu, updated_at: nu })
    .eq('company_id', companyId)
    .eq('provider', provider)
}

/** Alleen velden die iets bevatten: een leeg veld uit de boekhouding wist hier niets. */
export const alleenGevuld = (velden: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(velden).filter(([, w]) => w !== null && w !== undefined && w !== ''))
